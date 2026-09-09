import asyncio
import json
import os
import sys
import logging
import threading
from contextlib import asynccontextmanager
from fastapi import FastAPI, HTTPException, Request, Security
from fastapi.middleware.cors import CORSMiddleware

from backend.app.core.auth import verify_api_key, DEFAULT_API_KEY, issue_session_token
from backend.app.core.config import get_server_config, SERVER_CONFIG_FILE, get_conf_path
from backend.app.core.exceptions import AppException, app_exception_handler, generic_exception_handler
from datetime import datetime

os.makedirs('logs', exist_ok=True)
_log_handlers: list[logging.Handler] = []
try:
    from logging.handlers import RotatingFileHandler
    _log_handlers.append(RotatingFileHandler(
        'logs/backend.log', maxBytes=2 * 1024 * 1024, backupCount=3, encoding='utf-8'
    ))
except OSError:
    # 文件日志不可用时回退到 stderr
    _log_handlers.append(logging.StreamHandler())
logging.basicConfig(
    level=logging.WARNING,
    format='%(asctime)s - %(name)s - %(levelname)s - %(message)s',
    handlers=_log_handlers,
)
# Windows: suppress noisy asyncio connection reset errors (WinError 10054)
if sys.platform == 'win32':
    class _WinResetFilter(logging.Filter):
        def filter(self, record):
            if record.exc_info and record.exc_info[0] is ConnectionResetError:
                return False
            return True
    logging.getLogger('asyncio').addFilter(_WinResetFilter())

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
from backend.app.engine.collector.mdb import MDBCollector, BREAKPOINT_FILE
from backend.app.engine.collector.fta import FTACollector
from backend.app.engine.collector.utils import clear_breakpoint
from backend.app.engine.collector.scheduler import AdaptiveScheduler
from backend.app.engine.alert.engine import AlertEngine

logger = logging.getLogger(__name__)

# Capture the event loop at startup for cross-thread use (Python 3.12+ safe)
_main_loop: asyncio.AbstractEventLoop | None = None

@asynccontextmanager
async def lifespan(app: FastAPI):
    global _main_loop
    _main_loop = asyncio.get_running_loop()
    yield

app = FastAPI(title="液奶过程监控系统", version="1.7.3", lifespan=lifespan)

# Serve frontend static files (for browser access via http://localhost:18080/)
import pathlib
_frontend_dist = pathlib.Path(__file__).parent.parent / "frontend" / "dist"
if not _frontend_dist.exists():
    _frontend_dist = pathlib.Path(os.path.dirname(os.path.abspath(sys.executable if '__compiled__' in globals() else __file__))) / "data" / "frontend"
if _frontend_dist.exists():
    from fastapi.staticfiles import StaticFiles
    from fastapi.responses import RedirectResponse, HTMLResponse, FileResponse
    from starlette.staticfiles import StaticFiles as StarletteStaticFiles
    from starlette.exceptions import HTTPException as StarletteHTTPException

    class SPAStaticFiles(StarletteStaticFiles):
        """StaticFiles that serves index.html for missing files (SPA support)."""
        async def get_response(self, path, scope):
            try:
                return await super().get_response(path, scope)
            except StarletteHTTPException as exc:
                if exc.status_code == 404:
                    return FileResponse(str(_frontend_dist / "index.html"))
                raise

    # Mount at /app to avoid intercepting /api/* and /ws routes
    app.mount("/app", SPAStaticFiles(directory=str(_frontend_dist), html=True), name="frontend")
    @app.get("/app", include_in_schema=False)
    async def _app_redirect():
        return RedirectResponse(url="/app/")
    @app.get("/", include_in_schema=False)
    async def _root_redirect():
        return RedirectResponse(url="/app/")

    @app.get("/api/docs/{filename}", include_in_schema=False)
    async def serve_doc(filename: str):
        """直接返回 docs 目录下的 HTML 手册文件，绕过 SPA 兜底"""
        doc_path = (_frontend_dist / "docs" / filename).resolve()
        if not doc_path.is_relative_to((_frontend_dist / "docs").resolve()):
            return HTMLResponse("<h1>Forbidden</h1>", status_code=403)
        if doc_path.exists() and doc_path.suffix == '.html':
            return HTMLResponse(doc_path.read_text(encoding='utf-8'))
        return HTMLResponse("<h1>文件未找到</h1>", status_code=404)

app.add_exception_handler(AppException, app_exception_handler)
app.add_exception_handler(Exception, generic_exception_handler)

CORS_ORIGINS = os.environ.get("FT1_CORS_ORIGINS", "http://localhost:5173,http://localhost:5174,http://localhost:18080,tauri://localhost,http://tauri.localhost,https://tauri.localhost").split(",")

app.add_middleware(
    CORSMiddleware,
    allow_origins=CORS_ORIGINS,
    allow_credentials=False,
    allow_methods=["GET", "POST", "PUT", "DELETE"],
    allow_headers=["Content-Type", "X-API-Key", "Authorization"],
)

# 远程客户端禁止访问本机限定模块（服务端强制，不依赖前端契约）
_LOCAL_ONLY_PATH_PREFIXES = ("/api/config", "/api/data", "/api/correction")


@app.middleware("http")
async def enforce_local_only_modules(request: Request, call_next):
    path = request.url.path
    if path.startswith("/api/") and not path.startswith("/api/permissions") and not path.startswith("/api/auth/"):
        client_host = request.client.host if request.client else ""
        if client_host not in ("127.0.0.1", "::1", "localhost"):
            if path.startswith(_LOCAL_ONLY_PATH_PREFIXES):
                from fastapi.responses import JSONResponse
                return JSONResponse(
                    {"detail": "仅本机可访问该模块"},
                    status_code=403,
                )
            if path.startswith(("/api/network", "/api/devices")) and request.method != "GET":
                from fastapi.responses import JSONResponse
                return JSONResponse(
                    {"detail": "仅本机可修改网络/设备配置"},
                    status_code=403,
                )
    return await call_next(request)

# 初始化存储
storage = OnlineStorage(db_path="data/monitor.db")
storage.init_db()

# 加载排除备注关键词（基准样等不参与SPC/过程能力计算）
try:
    _excl_file = get_conf_path("excluded_remarks.json")
    if os.path.exists(_excl_file):
        with open(_excl_file, 'r', encoding='utf-8-sig') as f:
            storage.set_excluded_remarks(json.load(f))
    else:
        storage.set_excluded_remarks(["JZ", "基准", "作废", "基准样"])
except Exception as e:
    logger.warning(f"Failed to load excluded remarks: {e}")
    storage.set_excluded_remarks(["JZ", "基准", "作废", "基准样"])

# 初始化采集器
collector = MockCollector(storage=storage)

# 初始化预警引擎
alert_engine = AlertEngine(storage=storage)

# 监控开始时间：首次启动时记录，后续重启沿用，不清除已有预警
MONITOR_START_FILE = get_conf_path("monitor_start.json")
if os.path.exists(MONITOR_START_FILE):
    try:
        with open(MONITOR_START_FILE, 'r', encoding='utf-8') as f:
            saved = json.load(f)
        alert_engine.monitoring_start = datetime.fromisoformat(saved['started_at'])
        logger.info(f"Monitoring resumed from {alert_engine.monitoring_start}")
    except (json.JSONDecodeError, FileNotFoundError, KeyError) as e:
        logger.warning(f"加载监控开始时间失败: {e}")
        alert_engine.monitoring_start = datetime.now()
else:
    alert_engine.monitoring_start = datetime.now()
    # 首次启动：清除历史预警，只保留监控开始后的新预警
    cleared = storage.clear_pending_alerts()
    if cleared > 0:
        logger.info(f"First start: cleared {cleared} historical alerts")
    try:
        with open(MONITOR_START_FILE, 'w', encoding='utf-8') as f:
            json.dump({'started_at': alert_engine.monitoring_start.isoformat()}, f)
    except OSError as e:
        logger.warning(f"写入监控开始时间失败: {e}")
    logger.info(f"Monitoring started at {alert_engine.monitoring_start}")

# 初始化调度器
_collector_lock = threading.Lock()


def _run_cross_predictions(storage):
    """对最新采集的数据执行交叉预测（如 fat → saturated_fat）"""
    try:
        with open(get_conf_path("prediction_config.json"), "r", encoding="utf-8") as f:
            pred_config = json.load(f)
    except (FileNotFoundError, json.JSONDecodeError):
        return

    if not pred_config:
        return

    from backend.app.engine.predictor.cross_indicator import predict_cross_indicator

    predicted_records = []
    for product_code, targets in pred_config.items():
        for target_code, cfg in targets.items():
            try:
                if not cfg.get("enabled", False):
                    continue
                source_code = cfg.get("source_indicator", "")
                coefficient = cfg.get("coefficient")
                if not source_code or coefficient is None:
                    continue

                # Read the latest source indicator value for this product
                recent = storage.get_recent_data(source_code, product_code, limit=1)
                if not recent:
                    continue

                latest = recent[0]
                if latest.get("value") is None:
                    continue

                prediction_method = cfg.get("prediction_method", "random_forest")
                protein_val = None
                acidity_val = None
                sample_time = latest.get("sample_time")
                product_category = cfg.get("product_category", "")
                product_name = latest.get("product_name", "")

                if prediction_method == "random_forest":
                    from backend.app.engine.predictor.cross_indicator import fetch_cooccurring_features
                    features = fetch_cooccurring_features(
                        storage, product_code,
                        sample_id=latest.get("sample_id"),
                        sample_time=sample_time,
                    )
                    protein_val = features["protein"]
                    acidity_val = features["acidity"]
                    if features["source"] == "missing":
                        logger.info(f"M8数据缺失: {product_code} 蛋白质/酸度均无历史数据，使用模型默认值")

                result = predict_cross_indicator(
                    latest["value"], float(coefficient), source_code, target_code,
                    prediction_method=prediction_method,
                    product_category=product_category,
                    product_name=product_name,
                    protein=protein_val,
                    acidity=acidity_val,
                    sample_time=sample_time,
                )
                predicted_records.append({
                    "indicator_code": target_code,
                    "indicator_name": f"{result['target_name']}(预测)",
                    "product_code": product_code,
                    "product_name": latest.get("product_name", ""),
                    "value": result["predicted_value"],
                    "unit": result.get("target_unit", "g/100g"),
                    "sample_time": latest.get("sample_time", ""),
                })
            except Exception as e:
                logger.warning(f"交叉预测失败 {product_code}/{target_code}: {e}")
                continue

    if predicted_records:
        saved = storage.save_predicted_data(predicted_records)
        if saved > 0:
            logger.info(f"交叉预测: 生成 {saved} 条预测记录")


def collect_with_alert():
    # Load disabled products before collection
    try:
        from backend.app.api.config import _load_json_config
        product_status = _load_json_config(get_conf_path("product_status.json"), {})
        disabled = {code for code, status in product_status.items() if status == "disabled"}
        storage.set_disabled_products(disabled)
    except Exception as e:
        logger.warning(f"Failed to load disabled products: {e}")

    with _collector_lock:
        current_collector = collector
        result = current_collector.collect()
    all_new_alerts = []
    
    # Log collection attempt
    new_records = result.get('new_records', 0)
    if result.get('error'):
        storage.log_collection(status='failed', records_count=0, error_message=result.get('error'))
    else:
        storage.log_collection(status='success', records_count=new_records)
    
    # Only check alerts if we have new data
    if new_records > 0:
        # Run cross-indicator predictions (e.g. fat → saturated fat)
        _run_cross_predictions(storage)

        # Get products and indicators from collector
        products = current_collector.get_products()
        indicators = current_collector.get_indicators()
        
        # Check alerts for each product/indicator combination
        for product in products:
            for indicator in indicators:
                product_data = storage.get_recent_data(
                    indicator_code=indicator['code'],
                    product_code=product['code'],
                    limit=50,
                )
                
                if len(product_data) >= 5:
                    values = [d['value'] for d in product_data]
                    timestamps = [datetime.fromisoformat(d['sample_time']) for d in product_data]
                    spec_limits = current_collector.get_spec_limits(product_code=product['code']).get(indicator['code'])
                    
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
        loop = _main_loop
        if loop is None:
            return result
        if result.get('new_records', 0) > 0:
            asyncio.run_coroutine_threadsafe(
                broadcast_typed('data_update', result), loop
            )
        if all_new_alerts:
            asyncio.run_coroutine_threadsafe(
                broadcast_typed('new_alert', {'alerts': all_new_alerts}), loop
            )
        asyncio.run_coroutine_threadsafe(
            broadcast_typed('stats_update', result), loop
        )
    except Exception as e:
        logger.debug(f"WebSocket广播失败: {e}")  # WebSocket broadcast failure should not break collection
    
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

import backend.app.api.config as config_module_init
config_module_init.storage = storage

import backend.app.api.data as data_module
data_module.storage = storage

import backend.app.api.predict as predict_module
predict_module.storage = storage


def switch_collector(instrument_id: str, init_limit: int = 100, reset_breakpoint: bool = False) -> dict:
    """Stop the scheduler, swap the collector, and restart.

    Args:
        instrument_id: "mock", "ft1", "ft120", or "fta"
        init_limit: max samples to import on first run (1-1000)
        reset_breakpoint: 是否清除采集断点以便按 init_limit 重新全量导入。
            UI 显式切换/重导时传 True；启动自动切换应传 False，保留增量位置。

    Returns:
        dict with success flag and message.
    """
    global collector, scheduler

    with _collector_lock:
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
        elif instrument_id == "ft1":
            # FT1 uses SQL Server with 4-table relational structure
            try:
                db_config_file = get_conf_path("db_config.json")
                mapping_file = get_conf_path("db_mapping.json")

                if not os.path.exists(db_config_file):
                    return {"success": False, "message": "请先配置数据库连接（db_config.json 不存在）"}
                if not os.path.exists(mapping_file):
                    return {"success": False, "message": "请先配置字段映射（db_mapping.json 不存在）"}

                with open(db_config_file, "r", encoding="utf-8") as f:
                    db_config = json.load(f)
                with open(mapping_file, "r", encoding="utf-8") as f:
                    mapping_config = json.load(f)

                # 仅在显式重导/切换时清断点，确保 init_limit 按「最新 N 个样本」导入
                # 启动自动切换(reset_breakpoint=False)保留断点，继续增量采集
                if reset_breakpoint:
                    clear_breakpoint(get_conf_path("sqlserver_breakpoint.json"))
                    logger.info("已清除 SQL Server 采集断点，准备按 init_limit 重新导入")

                new_collector = SQLServerCollector.from_config(
                    db_config=db_config,
                    mapping_config=mapping_config,
                    storage=storage,
                    init_limit=init_limit,
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
        elif instrument_id == "fta":
            # FTA uses Perten SQL Server database
            try:
                fta_config_file = get_conf_path("fta_config.json")

                if not os.path.exists(fta_config_file):
                    return {"success": False, "message": "请先配置 FTA 数据库连接（fta_config.json 不存在）"}

                with open(fta_config_file, "r", encoding="utf-8") as f:
                    fta_config = json.load(f)

                new_collector = FTACollector.from_config(
                    db_config=fta_config,
                    storage=storage,
                    init_limit=init_limit,
                )

                # Verify connectivity before committing
                if not new_collector.test_connection():
                    new_collector.close()
                    collector = MockCollector(storage=storage)
                    _update_all_references("mock", False, "mock")
                    return {"success": False, "message": "FTA 数据库连接失败，请检查配置，已回退到 Mock"}

                collector = new_collector
                is_connected = True
                source = "fta"
                logger.info("已切换到 FTA 数据源 (Perten)")
            except Exception as e:
                logger.error(f"切换到 FTA 失败，回退到 Mock: {e}")
                collector = MockCollector(storage=storage)
                _update_all_references("mock", False, "mock")
                return {"success": False, "message": f"切换失败，已回退到 Mock: {str(e)}"}
        elif instrument_id == "ft120":
            # FT120 uses .mdb file
            try:
                mdb_config_file = get_conf_path("mdb_config.json")

                if not os.path.exists(mdb_config_file):
                    return {"success": False, "message": "请先配置 MDB 文件路径（mdb_config.json 不存在）"}

                with open(mdb_config_file, "r", encoding="utf-8") as f:
                    mdb_config = json.load(f)

                # Clear breakpoint file so first collect imports fresh data
                clear_breakpoint(BREAKPOINT_FILE)

                new_collector = MDBCollector.from_config(
                    config=mdb_config,
                    storage=storage,
                    init_limit=init_limit,
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
config_module._collect_once_func = collect_with_alert

# Auto-switch to configured instrument on startup
def _auto_switch_on_startup():
    """Automatically switch to the configured instrument on startup."""
    instrument_config_file = get_conf_path("instrument_config.json")
    if os.path.exists(instrument_config_file):
        try:
            with open(instrument_config_file, 'r', encoding='utf-8') as f:
                config = json.load(f)
            current = config.get("current_instrument", "mock")
            if current != "mock":
                logger.info(f"自动切换到配置的仪器: {current}")
                # 启动时不清断点，避免每次重启都重新拉 init_limit 条
                result = switch_collector(current, reset_breakpoint=False)
                if result.get("success"):
                    logger.info(f"启动时自动切换成功: {result.get('message')}")
                else:
                    logger.warning(f"启动时自动切换失败: {result.get('message')}")
        except Exception as e:
            logger.error(f"自动切换仪器失败: {e}")

_auto_switch_on_startup()

# 注册路由 (API key auth required)
_auth = [Security(verify_api_key)]
app.include_router(monitor_router, prefix="/api", dependencies=_auth)
app.include_router(spc_router, prefix="/api", dependencies=_auth)
app.include_router(alerts_router, prefix="/api", dependencies=_auth)
app.include_router(data_router, prefix="/api", dependencies=_auth)
app.include_router(config_router, prefix="/api", dependencies=_auth)
app.include_router(predict_router, prefix="/api", dependencies=_auth)
app.include_router(ws_router, prefix="/api")  # No auth dependency; WS uses query-param key

@app.get("/api/health")
def health():
    return {"status": "ok"}


# ---- 权限查询接口 ----

LOCAL_ONLY_MODULES: set[str] = {"correction", "data", "config", "network", "devices"}


def is_local_request(request: Request) -> bool:
    """判断请求是否来自本机（127.0.0.1 / ::1）。"""
    client_host = request.client.host if request.client else ""
    return client_host in ("127.0.0.1", "::1")


def is_password_required() -> bool:
    """检查是否设置了共享密码"""
    config = get_server_config()
    return bool(config.get("shared_password"))


def verify_shared_password(password: str) -> bool:
    """验证共享密码（防时序攻击）"""
    import hmac as _hmac
    config = get_server_config()
    expected = config.get("shared_password", "")
    if not expected:
        return True  # 没有设置密码，直接通过
    return _hmac.compare_digest(password.encode(), expected.encode())


@app.get("/api/permissions")
def get_permissions(request: Request):
    """根据客户端 IP 返回模块访问权限。"""
    is_local = is_local_request(request)
    password_required = is_password_required()

    if is_local:
        return {
            "isLocal": True,
            "allowedModules": "all",
            "passwordRequired": password_required,
        }
    else:
        return {
            "isLocal": False,
            "allowedModules": "restricted",
            "restrictedModules": sorted(LOCAL_ONLY_MODULES),
            "passwordRequired": password_required,
        }


@app.post("/api/auth/verify")
def verify_password(body: dict):
    """验证共享密码，成功则签发短时会话 token（可作 X-API-Key）"""
    password = body.get("password", "")
    if verify_shared_password(password):
        config = get_server_config()
        token = issue_session_token(config.get("shared_password", "") or "")
        return {"success": True, "message": "密码正确", "token": token}
    return {"success": False, "message": "密码错误"}


# ---- 网络配置接口 ----

def get_local_ip() -> str:
    """获取本机局域网 IP 地址。"""
    import socket
    try:
        s = socket.socket(socket.AF_INET, socket.SOCK_DGRAM)
        s.settimeout(2)
        s.connect(("10.255.255.255", 1))
        ip = s.getsockname()[0]
        s.close()
        return ip
    except Exception:
        return "127.0.0.1"


@app.get("/api/network/config", dependencies=_auth)
def get_network_config(request: Request):
    """获取网络配置（本地请求返回密码，远程不返回）。"""
    config = get_server_config()
    is_local = is_local_request(request)
    return {
        "host": config["host"],
        "port": config["port"],
        "local_ip": get_local_ip(),
        "shared_password": config.get("shared_password", "") if is_local else "",
        "password_enabled": bool(config.get("shared_password")),
    }


@app.put("/api/network/config", dependencies=_auth)
def update_network_config(request: Request, request_body: dict):
    if not is_local_request(request):
        raise HTTPException(status_code=403, detail="仅本机可修改网络配置")
    """更新网络配置（仅允许 host 为 127.0.0.1 或 0.0.0.0）。"""
    new_host = request_body.get("host", "")
    new_password = request_body.get("shared_password")

    if new_host and new_host not in ("127.0.0.1", "0.0.0.0"):
        raise HTTPException(status_code=400, detail="host 仅允许 127.0.0.1 或 0.0.0.0")

    config = get_server_config()
    if new_host:
        config["host"] = new_host
    if new_password is not None:
        config["shared_password"] = new_password

    try:
        with open(SERVER_CONFIG_FILE, "w", encoding="utf-8") as f:
            json.dump(config, f, indent=2, ensure_ascii=False)
    except Exception as e:
        raise HTTPException(status_code=500, detail=f"保存配置失败: {e}")

    return {
        "success": True,
        "message": "网络配置已更新，重启服务后生效",
        "host": config["host"],
        "port": config["port"],
        "local_ip": get_local_ip(),
        "shared_password": config.get("shared_password", ""),
        "password_enabled": bool(config.get("shared_password")),
    }


# ---- 设备管理接口 ----

DEVICES_FILE = get_conf_path("devices.json")


def _load_devices() -> list:
    """加载已保存的设备列表"""
    try:
        if os.path.exists(DEVICES_FILE):
            with open(DEVICES_FILE, 'r', encoding='utf-8') as f:
                return json.load(f)
    except json.JSONDecodeError as e:
        logger.warning(f"devices.json 格式错误，将重新创建: {e}")
        # 备份损坏文件
        try:
            import shutil
            backup = DEVICES_FILE + '.bak'
            shutil.copy2(DEVICES_FILE, backup)
            logger.info(f"已备份损坏文件到: {backup}")
        except Exception:
            pass
    except Exception as e:
        logger.warning(f"读取 devices.json 失败: {e}")
    return []


def _save_devices(devices: list) -> None:
    """保存设备列表"""
    with open(DEVICES_FILE, 'w', encoding='utf-8') as f:
        json.dump(devices, f, ensure_ascii=False, indent=2)


@app.get("/api/devices", dependencies=_auth)
async def list_devices(request: Request):
    """获取已保存的设备列表（本地请求返回密码，远程不返回）"""
    devices = _load_devices()
    if is_local_request(request):
        return {"devices": devices}
    safe_devices = [{k: v for k, v in d.items() if k != "password"} for d in devices]
    return {"devices": safe_devices}


@app.post("/api/devices", dependencies=_auth)
async def add_device(request: Request, body: dict):
    """手动添加设备"""
    if not is_local_request(request):
        raise HTTPException(status_code=403, detail="仅本机可管理设备")
    ip_raw = body.get("ip", "").strip()
    name = body.get("name", "").strip()
    port = body.get("port", 18080)
    password = body.get("password", "").strip()

    if not ip_raw:
        raise HTTPException(status_code=400, detail="IP 地址不能为空")

    # 清理 IP：移除协议前缀和端口
    ip = ip_raw
    if "://" in ip:
        ip = ip.split("://")[1]
    if ":" in ip:
        ip = ip.split(":")[0]
    ip = ip.strip("/")

    if not ip:
        raise HTTPException(status_code=400, detail="IP 地址格式无效")

    devices = _load_devices()
    if any(d["ip"] == ip for d in devices):
        return {"success": False, "message": "设备已存在"}

    device = {
        "ip": ip,
        "port": port,
        "name": name or ip,
        "password": password,
        "added_at": datetime.now().isoformat(),
    }
    devices.append(device)
    _save_devices(devices)
    return {"success": True, "device": device}


@app.delete("/api/devices/{ip}", dependencies=_auth)
async def remove_device(ip: str, request: Request):
    """删除设备"""
    if not is_local_request(request):
        raise HTTPException(status_code=403, detail="仅本机可删除设备")
    from urllib.parse import unquote
    ip = unquote(ip)
    if "://" in ip:
        ip = ip.split("://")[1]
    if ":" in ip:
        ip = ip.split(":")[0]
    ip = ip.strip("/")

    devices = _load_devices()
    original_count = len(devices)
    devices = [d for d in devices if d["ip"] != ip]
    if len(devices) == original_count:
        return {"success": False, "message": "设备不存在"}
    _save_devices(devices)
    return {"success": True}


@app.post("/api/network/open-firewall", dependencies=_auth)
async def open_firewall(request: Request):
    if not is_local_request(request):
        raise HTTPException(status_code=403, detail="仅本机可操作防火墙")
    """尝试以管理员权限添加 Windows 防火墙放行规则。"""
    import sys
    if sys.platform != 'win32':
        return {"success": False, "message": "仅支持 Windows 系统"}

    try:
        import ctypes
        import subprocess
        import time
        ps_cmd = (
            'Start-Process cmd -ArgumentList '
            '"/c netsh advfirewall firewall add rule '
            'name=\'SPC-Monitor (TCP 18080)\' dir=in action=allow protocol=TCP localport=18080" '
            '-Verb RunAs -WindowStyle Hidden'
        )
        rc = ctypes.windll.shell32.ShellExecuteW(
            None, "runas", "powershell", f"-Command {ps_cmd}", None, 0
        )
        if rc <= 32:
            return {"success": False, "message": f"无法请求管理员权限 (code {rc})"}
        # 等待 UAC 操作完成后验证
        time.sleep(3)
        try:
            check = subprocess.run(
                ['netsh', 'advfirewall', 'firewall', 'show', 'rule', 'name=SPC-Monitor (TCP 18080)'],
                capture_output=True
            )
            stdout = check.stdout.decode('gbk', errors='replace') if check.stdout else ''
        except Exception:
            stdout = ''
        if 'No rules match' in stdout or not stdout:
            return {"success": False, "message": "防火墙规则未生效，UAC可能被拒绝或操作失败"}
        return {"success": True, "message": "防火墙放行成功，局域网设备现在可以访问本机"}
    except Exception as e:
        return {"success": False, "message": str(e)}


@app.get("/api/network/discover", dependencies=_auth)
async def discover_devices(request: Request):
    """扫描局域网内开启共享的 spc-monitor 服务（仅本机可调用）"""
    if not is_local_request(request):
        raise HTTPException(status_code=403, detail="仅本机可扫描局域网设备")
    import socket
    import concurrent.futures

    local_ip = get_local_ip()
    parts = local_ip.rsplit('.', 1)
    if len(parts) != 2:
        return {"devices": [], "local_ip": local_ip}
    subnet = parts[0]

    discovered = []

    def check_host(ip: str) -> dict | None:
        try:
            import urllib.request
            url = f"http://{ip}:18080/api/health"
            req = urllib.request.Request(url, method='GET')
            with urllib.request.urlopen(req, timeout=1) as resp:
                if resp.status == 200:
                    try:
                        hostname = socket.gethostbyaddr(ip)[0]
                    except Exception:
                        hostname = ip
                    return {"ip": ip, "port": 18080, "name": hostname}
        except Exception:
            pass
        return None

    ips = [f"{subnet}.{i}" for i in range(1, 255) if f"{subnet}.{i}" != local_ip]

    with concurrent.futures.ThreadPoolExecutor(max_workers=50) as executor:
        futures = {executor.submit(check_host, ip): ip for ip in ips}
        try:
            for future in concurrent.futures.as_completed(futures, timeout=10):
                result = future.result()
                if result:
                    discovered.append(result)
        except concurrent.futures.TimeoutError:
            pass  # 返回已发现的结果
        finally:
            executor.shutdown(wait=False, cancel_futures=True)

    return {"devices": discovered, "local_ip": local_ip}


# SPA catch-all: serve index.html for any non-API GET request (browser refresh support)
if _frontend_dist.exists():
    from starlette.responses import FileResponse as _FileResponse

    @app.get("/{path:path}", include_in_schema=False)
    async def _spa_catchall(path: str):
        """Serve index.html for SPA routes when accessed via browser refresh."""
        if path.startswith("api/"):
            return _detail_not_found()
        return _FileResponse(str(_frontend_dist / "index.html"))

    def _detail_not_found():
        from starlette.responses import JSONResponse
        return JSONResponse({"detail": "Not Found"}, status_code=404)

if __name__ == "__main__":
    import uvicorn
    config = get_server_config()
    uvicorn.run(app, host=config["host"], port=config["port"])
