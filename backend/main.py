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
from backend.app.engine.collector.mdb import MDBCollector
from backend.app.engine.collector.scheduler import AdaptiveScheduler
from backend.app.engine.alert.engine import AlertEngine

logger = logging.getLogger(__name__)

app = FastAPI(title="液奶过程监控系统", version="1.5.1")

app.add_middleware(
    CORSMiddleware,
    allow_origins=["http://localhost:5173", "http://localhost:5174", "http://localhost:5175", "http://localhost:5176"],
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

# 监控开始时间：首次启动时记录，后续重启沿用，不清除已有预警
MONITOR_START_FILE = "monitor_start.json"
if os.path.exists(MONITOR_START_FILE):
    try:
        with open(MONITOR_START_FILE, 'r') as f:
            saved = json.load(f)
        alert_engine.monitoring_start = datetime.fromisoformat(saved['started_at'])
        logger.info(f"Monitoring resumed from {alert_engine.monitoring_start}")
    except Exception:
        alert_engine.monitoring_start = datetime.now()
else:
    alert_engine.monitoring_start = datetime.now()
    # 首次启动：清除历史预警，只保留监控开始后的新预警
    cleared = storage.clear_pending_alerts()
    if cleared > 0:
        logger.info(f"First start: cleared {cleared} historical alerts")
    with open(MONITOR_START_FILE, 'w') as f:
        json.dump({'started_at': alert_engine.monitoring_start.isoformat()}, f)
    logger.info(f"Monitoring started at {alert_engine.monitoring_start}")

# 初始化调度器
def collect_with_alert():
    result = collector.collect()
    all_new_alerts = []
    
    # Log collection attempt
    new_records = result.get('new_records', 0)
    if result.get('error'):
        storage.log_collection(status='failed', records_count=0, error_message=result.get('error'))
    else:
        storage.log_collection(status='success', records_count=new_records)
    
    # Only check alerts if we have new data
    if new_records > 0:
        # Get products and indicators from collector
        products = collector.get_products()
        indicators = collector.get_indicators()
        
        # Check alerts for each product/indicator combination
        # Limit to first 10 products to avoid performance issues
        for product in products[:10]:
            for indicator in indicators:
                product_data = storage.get_recent_data(
                    indicator_code=indicator['code'],
                    product_code=product['code'],
                    limit=50,
                )
                
                if len(product_data) >= 5:
                    values = [d['value'] for d in product_data]
                    timestamps = [datetime.fromisoformat(d['sample_time']) for d in product_data]
                    spec_limits = collector.get_spec_limits(product_code=product['code']).get(indicator['code'])
                    
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


def switch_collector(instrument_id: str) -> dict:
    """Stop the scheduler, swap the collector, and restart.

    Args:
        instrument_id: "mock", "ft1", "ft120", or "fta"

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
    source = "mock"
    
    if instrument_id == "mock":
        collector = MockCollector(storage=storage)
        logger.info("已切换到 Mock 数据源")
    elif instrument_id in ("ft1", "fta"):
        # FT1 and FTA use SQL Server
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
                collector = MockCollector(storage=storage)
                _update_all_references("mock", False, "mock")
                return {"success": False, "message": "SQL Server 连接失败，请检查配置，已回退到 Mock"}

            collector = new_collector
            is_connected = True
            source = "sqlserver"
            logger.info(f"已切换到 {instrument_id.upper()} 数据源 (SQL Server)")
        except Exception as e:
            logger.error(f"切换到 {instrument_id.upper()} 失败，回退到 Mock: {e}")
            collector = MockCollector(storage=storage)
            _update_all_references("mock", False, "mock")
            return {"success": False, "message": f"切换失败，已回退到 Mock: {str(e)}"}
    elif instrument_id == "ft120":
        # FT120 uses .mdb file
        try:
            mdb_config_file = "mdb_config.json"

            if not os.path.exists(mdb_config_file):
                return {"success": False, "message": "请先配置 MDB 文件路径（mdb_config.json 不存在）"}

            with open(mdb_config_file, "r", encoding="utf-8") as f:
                mdb_config = json.load(f)

            new_collector = MDBCollector.from_config(
                config=mdb_config,
                storage=storage,
            )

            # Verify connectivity before committing
            if not new_collector.test_connection():
                new_collector.close()
                collector = MockCollector(storage=storage)
                _update_all_references("mock", False, "mock")
                return {"success": False, "message": "MDB 文件连接失败，请检查配置，已回退到 Mock"}

            collector = new_collector
            is_connected = True
            source = "mdb"
            logger.info("已切换到 FT120 数据源 (MDB)")
        except Exception as e:
            logger.error(f"切换到 FT120 失败，回退到 Mock: {e}")
            collector = MockCollector(storage=storage)
            _update_all_references("mock", False, "mock")
            return {"success": False, "message": f"切换失败，已回退到 Mock: {str(e)}"}
    else:
        return {"success": False, "message": f"未知的仪器类型: {instrument_id}"}

    # Update all module-level references
    _update_all_references(source, is_connected, instrument_id)

    # Create and start new scheduler
    scheduler = AdaptiveScheduler(collect_func=collect_with_alert)
    monitor_module.scheduler = scheduler
    scheduler.start()

    instrument_name = instrument_id.upper() if instrument_id != "mock" else "Mock"
    return {
        "success": True,
        "message": f"已切换到 {instrument_name} 数据源",
        "source": source,
        "instrument_id": instrument_id,
        "connected": is_connected,
    }


def _update_all_references(source: str, connected: bool, instrument_type: str = "mock"):
    """Update collector references in all API modules and config status."""
    monitor_module.collector = collector
    spc_module.collector = collector

    import backend.app.api.config as config_module
    config_module._source_status["source"] = source
    config_module._source_status["connected"] = connected
    config_module._source_status["instrument_type"] = instrument_type


# Wire the switch function into the config API
import backend.app.api.config as config_module
config_module._switch_collector_func = switch_collector

# Auto-switch to configured instrument on startup
def _auto_switch_on_startup():
    """Automatically switch to the configured instrument on startup."""
    import json
    import os
    
    instrument_config_file = "instrument_config.json"
    if os.path.exists(instrument_config_file):
        try:
            with open(instrument_config_file, 'r', encoding='utf-8') as f:
                config = json.load(f)
            current = config.get("current_instrument", "mock")
            if current != "mock":
                logger.info(f"自动切换到配置的仪器: {current}")
                
                # Build new collector without stopping scheduler
                global collector
                is_connected = False
                source = "mock"
                
                if current in ("ft1", "fta"):
                    # FT1 and FTA use SQL Server
                    db_config_file = "db_config.json"
                    mapping_file = "db_mapping.json"
                    
                    if os.path.exists(db_config_file) and os.path.exists(mapping_file):
                        with open(db_config_file, "r", encoding="utf-8") as f:
                            db_config = json.load(f)
                        with open(mapping_file, "r", encoding="utf-8") as f:
                            mapping_config = json.load(f)
                        
                        new_collector = SQLServerCollector.from_config(
                            db_config=db_config,
                            mapping_config=mapping_config,
                            storage=storage,
                        )
                        
                        if new_collector.test_connection():
                            collector = new_collector
                            is_connected = True
                            source = "sqlserver"
                            logger.info(f"已自动切换到 {current.upper()} 数据源")
                        else:
                            logger.warning(f"SQL Server 连接失败，保持 Mock 数据源")
                elif current == "ft120":
                    # FT120 uses .mdb file
                    mdb_config_file = "mdb_config.json"
                    
                    if os.path.exists(mdb_config_file):
                        with open(mdb_config_file, "r", encoding="utf-8") as f:
                            mdb_config = json.load(f)
                        
                        new_collector = MDBCollector.from_config(
                            config=mdb_config,
                            storage=storage,
                        )
                        
                        if new_collector.test_connection():
                            collector = new_collector
                            is_connected = True
                            source = "mdb"
                            logger.info("已自动切换到 FT120 数据源")
                        else:
                            logger.warning("MDB 文件连接失败，保持 Mock 数据源")
                
                # Update all references
                _update_all_references(source, is_connected, current)
                
                # Update modules
                monitor_module.collector = collector
                spc_module.collector = collector
                
        except Exception as e:
            logger.error(f"自动切换仪器失败: {e}")

_auto_switch_on_startup()

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
