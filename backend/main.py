import asyncio
import json
import os
import logging
from fastapi import FastAPI
from fastapi.middleware.cors import CORSMiddleware
from datetime import datetime

from backend.app.api.monitor import router as monitor_router
from backend.app.api.spc import router as spc_router
from backend.app.api.alerts import router as alerts_router
from backend.app.api.config import router as config_router
from backend.app.api.data import router as data_router
from backend.app.api.websocket import router as ws_router, broadcast_typed
from backend.app.api.predict import router as predict_router
from backend.app.services.storage import OnlineStorage
from backend.app.engine.collector.mock import MockCollector
from backend.app.engine.collector.sqlserver import SQLServerCollector
from backend.app.engine.collector.scheduler import AdaptiveScheduler
from backend.app.engine.alert.engine import AlertEngine

logger = logging.getLogger(__name__)

app = FastAPI(title="液奶过程监控系统", version="1.0.0")

app.add_middleware(
    CORSMiddleware,
    allow_origins=["http://localhost:5173"],
    allow_credentials=True,
    allow_methods=["*"],
    allow_headers=["*"],
)

# 初始化存储
storage = OnlineStorage(db_path="data/monitor.db")
storage.init_db()

# 初始化采集器
collector = MockCollector(storage=storage)

# 初始化预警引擎
alert_engine = AlertEngine(storage=storage)

# 初始化调度器
def collect_with_alert():
    result = collector.collect()
    all_new_alerts = []
    
    for product in collector.get_products():
        for indicator in collector.get_indicators():
            data = storage.get_recent_data(
                indicator_code=indicator['code'],
                product_code=product['code'],
                limit=50,
            )
            if len(data) >= 5:
                values = [d['value'] for d in data]
                timestamps = [datetime.fromisoformat(d['sample_time']) for d in data]
                spec_limits = collector.get_spec_limits().get(indicator['code'])
                
                new_alerts = alert_engine.check_and_alert(
                    product_code=product['code'],
                    indicator_code=indicator['code'],
                    values=values,
                    timestamps=timestamps,
                    spec_limits=spec_limits,
                )
                all_new_alerts.extend(new_alerts)
    
    # Broadcast via WebSocket
    try:
        loop = asyncio.get_event_loop()
        if result.get('new_records', 0) > 0:
            asyncio.run_coroutine_threadsafe(
                broadcast_typed('new_data', result), loop
            )
        if all_new_alerts:
            asyncio.run_coroutine_threadsafe(
                broadcast_typed('alert', {'alerts': all_new_alerts}), loop
            )
        asyncio.run_coroutine_threadsafe(
            broadcast_typed('stats_update', result), loop
        )
    except Exception:
        pass  # WebSocket broadcast failure should not break collection
    
    return result

scheduler = AdaptiveScheduler(collect_func=collect_with_alert)

# 注入依赖
import backend.app.api.monitor as monitor_module
monitor_module.storage = storage
monitor_module.scheduler = scheduler
monitor_module.collector = collector

import backend.app.api.spc as spc_module
spc_module.storage = storage
spc_module.collector = collector

import backend.app.api.alerts as alerts_module
alerts_module.storage = storage

import backend.app.api.data as data_module
data_module.storage = storage

import backend.app.api.predict as predict_module
predict_module.storage = storage


def switch_collector(source: str) -> dict:
    """Stop the scheduler, swap the collector, and restart.

    Args:
        source: "mock" or "sqlserver"

    Returns:
        dict with success flag and message.
    """
    global collector, scheduler

    # Stop the current scheduler
    try:
        scheduler.stop()
    except Exception as e:
        logger.warning(f"停止调度器时出错（可忽略）: {e}")

    # Close old collector if it supports it
    if hasattr(collector, "close"):
        try:
            collector.close()
        except Exception:
            pass

    # Build new collector
    is_connected = False
    if source == "sqlserver":
        try:
            db_config_file = "db_config.json"
            mapping_file = "db_mapping.json"

            if not os.path.exists(db_config_file):
                return {"success": False, "message": "请先配置数据库连接（db_config.json 不存在）"}
            if not os.path.exists(mapping_file):
                return {"success": False, "message": "请先配置字段映射（db_mapping.json 不存在）"}

            with open(db_config_file, "r", encoding="utf-8") as f:
                db_config = json.load(f)
            with open(mapping_file, "r", encoding="utf-8") as f:
                mapping_config = json.load(f)

            new_collector = SQLServerCollector.from_config(
                db_config=db_config,
                mapping_config=mapping_config,
                storage=storage,
            )

            # Verify connectivity before committing
            if not new_collector.test_connection():
                new_collector.close()
                # Revert to mock so the system stays usable
                collector = MockCollector(storage=storage)
                _update_all_references("mock", False)
                return {"success": False, "message": "SQL Server 连接失败，请检查配置，已回退到 Mock"}

            collector = new_collector
            is_connected = True
            logger.info("已切换到 SQL Server 数据源")
        except Exception as e:
            logger.error(f"切换到 SQL Server 失败，回退到 Mock: {e}")
            collector = MockCollector(storage=storage)
            _update_all_references("mock", False)
            return {"success": False, "message": f"切换失败，已回退到 Mock: {str(e)}"}
    else:
        collector = MockCollector(storage=storage)
        logger.info("已切换到 Mock 数据源")

    # Update all module-level references
    _update_all_references(source, is_connected)

    # Create and start new scheduler
    scheduler = AdaptiveScheduler(collect_func=collect_with_alert)
    monitor_module.scheduler = scheduler
    scheduler.start()

    return {
        "success": True,
        "message": f"已切换到 {source} 数据源",
        "source": source,
        "connected": is_connected,
    }


def _update_all_references(source: str, connected: bool):
    """Update collector references in all API modules and config status."""
    monitor_module.collector = collector
    spc_module.collector = collector

    import backend.app.api.config as config_module
    config_module._source_status["source"] = source
    config_module._source_status["connected"] = connected


# Wire the switch function into the config API
import backend.app.api.config as config_module
config_module._switch_collector_func = switch_collector

# 注册路由
app.include_router(monitor_router, prefix="/api")
app.include_router(spc_router, prefix="/api")
app.include_router(alerts_router, prefix="/api")
app.include_router(data_router, prefix="/api")
app.include_router(config_router, prefix="/api")
app.include_router(predict_router, prefix="/api")
app.include_router(ws_router, prefix="/api")

@app.get("/api/health")
def health():
    return {"status": "ok"}

if __name__ == "__main__":
    import uvicorn
    uvicorn.run(app, host="127.0.0.1", port=8000)
