from fastapi import FastAPI
from fastapi.middleware.cors import CORSMiddleware
from datetime import datetime

from backend.app.api.monitor import router as monitor_router
from backend.app.api.spc import router as spc_router
from backend.app.api.alerts import router as alerts_router
from backend.app.api.config import router as config_router
from backend.app.api.websocket import router as ws_router
from backend.app.services.storage import OnlineStorage
from backend.app.engine.collector.mock import MockCollector
from backend.app.engine.collector.scheduler import AdaptiveScheduler
from backend.app.engine.alert.engine import AlertEngine

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
                
                alert_engine.check_and_alert(
                    product_code=product['code'],
                    indicator_code=indicator['code'],
                    values=values,
                    timestamps=timestamps,
                    spec_limits=spec_limits,
                )
    
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

# 注册路由
app.include_router(monitor_router, prefix="/api")
app.include_router(spc_router, prefix="/api")
app.include_router(alerts_router, prefix="/api")
app.include_router(config_router, prefix="/api")
app.include_router(ws_router, prefix="/api")

@app.get("/api/health")
def health():
    return {"status": "ok"}

if __name__ == "__main__":
    import uvicorn
    uvicorn.run(app, host="127.0.0.1", port=8000)
