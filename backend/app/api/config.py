from fastapi import APIRouter, HTTPException, Query
from typing import Optional, Callable
from datetime import datetime
import json
import logging
import copy
import os
import sys
import threading

from backend.app.core.validation import validate_identifier, validate_mdb_path
from backend.app.engine.collector.utils import build_connection_string
from backend.app.models.requests import (
    DBConfigRequest,
    MDBConfigRequest,
    FTAConfigRequest,
    UpdateConfigRequest,
    InstrumentSwitchRequest,
    AliasRequest,
    ProductStatusRequest,
    ProductCategoryRequest,
    FieldMappingRequest,
)

logger = logging.getLogger(__name__)

router = APIRouter(prefix="/config", tags=["配置"])

# Collector swap callback (set by main.py)
_switch_collector_func: Optional[Callable] = None


def _fix_mdb_encoding(s):
    """Fix encoding for Chinese characters from .mdb files (typically GBK/GB2312)"""
    if isinstance(s, str):
        try:
            return s.encode('latin-1').decode('gbk')
        except (UnicodeDecodeError, LookupError):
            try:
                return s.encode('latin-1').decode('gb2312')
            except (UnicodeDecodeError, LookupError):
                return s
    return s

# Source status tracking (updated by main.py)
_source_status = {
    "source": "mock",
    "connected": False,
    "instrument_type": "mock",
}

CONFIG_FILE = "runtime_config.json"

_default_config = {
    "default_frequency_minutes": 5,
    "max_frequency_minutes": 300,
    "spc_window_size": 30,
    "cpk_min_threshold": 1.33,
    "alert_sound_enabled": True,
    "alert_popup_enabled": True,
    "data_retention_days": 90,
}

DB_CONFIG_FILE = "db_config.json"
DB_MAPPING_FILE = "db_mapping.json"
MDB_CONFIG_FILE = "mdb_config.json"
INSTRUMENT_CONFIG_FILE = "instrument_config.json"

_default_db_config = {
    "enabled": False,
    "source_type": "sqlserver",
    "auth_type": "windows",
    "server": "",
    "database": "",
    "username": "",
    "password": "",
    "driver": "pymssql",
    "timeout": 30
}

_default_mapping = {
    "table_name": "",
    "time_column": "",
    "product_column": "",
    "sample_column": "",
    "indicators": {}
}

_default_mdb_config = {
    "enabled": False,
    "mdb_path": "",
    "sample_table": "Sample",
    "product_table": "Product",
    "component_table": "Component",
    "prediction_table": "Prediction",
    "time_column": "DateTime",
    "product_ref_column": "ProdRef",
    "product_name_column": "Name",
    "component_ref_column": "CompRef",
    "component_name_column": "Name",
    "value_column": "Value",
    "indicators": {}
}

_default_instrument_config = {
    "current_instrument": "mock",
    "instruments": {
        "ft1": {
            "name": "FT1 乳品分析仪",
            "type": "sqlserver",
            "enabled": True
        },
        "ft120": {
            "name": "FT120 乳品分析仪",
            "type": "mdb",
            "enabled": True
        },
        "fta": {
            "name": "FTA 乳品分析仪",
            "type": "sqlserver",
            "enabled": True
        }
    }
}

def _load_json_config(filepath: str, default=None):
    if os.path.exists(filepath):
        try:
            with open(filepath, 'r', encoding='utf-8') as f:
                return json.load(f)
        except (json.JSONDecodeError, PermissionError, FileNotFoundError) as e:
            logger.warning(f"加载配置失败: {e}")
    return copy.deepcopy(default) if default is not None else {}

def _save_json_config(filepath: str, data: dict) -> bool:
    try:
        with open(filepath, 'w', encoding='utf-8') as f:
            json.dump(data, f, ensure_ascii=False, indent=2)
        return True
    except Exception as e:
        logger.error(f"保存配置失败: {e}")
        return False

_MAX_BODY_CHARS = 100_000


def _check_body_size(body, max_chars: int = _MAX_BODY_CHARS):
    """Return error response if serialized body exceeds *max_chars*, else ``None``."""
    if len(str(body)) > max_chars:
        return {"success": False, "message": "请求体过大"}
    return None


def _load_runtime_config() -> dict:
    return _load_json_config(CONFIG_FILE, _default_config.copy())

_config = _load_runtime_config()
_config_lock = threading.Lock()

@router.get("")
def get_config():
    with _config_lock:
        return dict(_config)

@router.put("")
def update_config(config: UpdateConfigRequest):
    with _config_lock:
        _config.update(config.model_dump(exclude_none=True))
        _save_json_config(CONFIG_FILE, _config)
        return {"status": "updated", "config": dict(_config)}

@router.get("/db")
def get_db_config():
    config = _load_json_config(DB_CONFIG_FILE, _default_db_config)
    if config.get("password"):
        config["password_saved"] = True
        config["password"] = ""
    return config

@router.put("/db")
def update_db_config(config: DBConfigRequest):
    success = _save_json_config(DB_CONFIG_FILE, config.model_dump())
    if success:
        return {"success": True, "message": "配置已保存"}
    return {"success": False, "message": "保存失败"}

@router.post("/db/test")
def test_db_connection(config: DBConfigRequest):
    cfg = config.model_dump()
    driver = cfg.get("driver", "")

    # pymssql 模式：不依赖 ODBC
    if driver == "pymssql":
        try:
            from backend.app.engine.collector.sqlserver import SQLServerCollector
            conn = SQLServerCollector._build_pymssql_connection(cfg)
            cursor = conn.cursor()
            cursor.execute("SELECT 1")
            cursor.fetchone()
            conn.close()
            return {"success": True, "message": "连接成功！(pymssql)"}
        except Exception as e:
            error_msg = _diagnose_pymssql_error(e, cfg)
            logger.error(f"pymssql连接失败: {e}", exc_info=True)
            return {"success": False, "message": error_msg}

    # ODBC 模式
    try:
        conn_str = _build_connection_string(cfg)

        try:
            from sqlalchemy import create_engine, text
        except ImportError:
            return {
                "success": False,
                "message": "缺少依赖包，请安装: pip install sqlalchemy pyodbc"
            }

        engine = create_engine(conn_str, connect_args={"timeout": cfg.get("timeout", 30)})

        with engine.connect() as conn:
            result = conn.execute(text("SELECT 1"))
            result.scalar()

        engine.dispose()

        return {"success": True, "message": "连接成功！"}
    except Exception as e:
        error_msg = str(e)
        if "Login failed" in error_msg:
            error_msg = "登录失败，请检查用户名和密码"
        elif "server" in error_msg.lower() and "not found" in error_msg.lower():
            error_msg = "找不到服务器，请检查服务器地址"
        elif "driver" in error_msg.lower():
            error_msg = "ODBC 驱动未安装，请安装对应的驱动"

        logger.error(f"ODBC连接失败: {error_msg}", exc_info=True)
        return {"success": False, "message": error_msg}


def _diagnose_pymssql_error(e: Exception, cfg: dict) -> str:
    """Diagnose pymssql connection errors and return actionable message."""
    error_str = str(e)
    server = cfg.get("server", "")

    # Parse server string: support "host\instance,port" / "host,port" / "host\instance" / "host"
    host = server
    port = None
    instance = None

    # Extract port (after comma)
    if ',' in server:
        parts = server.rsplit(',', 1)
        host = parts[0]
        try:
            port = int(parts[1])
        except ValueError:
            pass

    # Extract instance (after backslash)
    if '\\' in host:
        parts = host.split('\\', 1)
        host = parts[0]
        instance = parts[1]

    # Error 20002: TCP connection failed (server unreachable)
    if "20002" in error_str:
        if port:
            return (
                f"无法连接到 {server}。请检查：\n"
                f"1. 服务器 {host} 是否可达（在命令行运行: ping {host}）\n"
                f"2. SQL Server 是否在端口 {port} 监听（运行: Test-NetConnection -ComputerName {host} -Port {port}）\n"
                f"3. 防火墙是否放行端口 {port}\n"
                f"4. SQL Server 服务是否已启动"
            )
        elif instance:
            return (
                f"无法连接到 {server}。请检查：\n"
                f"1. 服务器 {host} 是否可达（在命令行运行: ping {host}）\n"
                f"2. SQL Server 实例 {instance} 是否存在\n"
                f"3. SQL Server Browser 服务是否运行\n"
                f"4. 防火墙是否放行 SQL Server 端口"
            )
        else:
            return (
                f"无法连接到 {host}。请检查：\n"
                f"1. 服务器 {host} 是否可达（在命令行运行: ping {host}）\n"
                f"2. SQL Server 服务是否已启动\n"
                f"3. 防火墙是否放行 SQL Server 端口"
            )

    # Error 18456: Login failed
    if "18456" in error_str or "Login failed" in error_str:
        return "登录失败，请检查用户名和密码"

    # Error 4060: Cannot open database
    if "4060" in error_str or "Cannot open database" in error_str:
        database = cfg.get("database", "")
        return f"无法打开数据库 '{database}'，请检查数据库名称是否正确"

    # Default
    return f"连接失败: {error_str[:200]}"


@router.post("/db/diagnose")
def diagnose_db_connection(config: DBConfigRequest):
    """网络诊断：检查服务器可达性，不依赖 pymssql/ODBC"""
    import socket
    import subprocess
    cfg = config.model_dump()
    server = cfg.get("server", "")

    # Extract host and port
    host = server
    port = None
    if ':' in server:
        parts = server.rsplit(':', 1)
        host = parts[0]
        try:
            port = int(parts[1])
        except ValueError:
            pass

    results = {"host": host, "port": port, "checks": []}

    # Check 1: DNS resolution
    try:
        ip = socket.gethostbyname(host)
        results["checks"].append({"step": "DNS解析", "success": True, "detail": f"{host} → {ip}"})
    except socket.gaierror:
        results["checks"].append({
            "step": "DNS解析", "success": False,
            "detail": f"无法解析主机名 '{host}'，请检查主机名是否正确"
        })
        return {"success": False, "diagnosis": results}

    # Check 2: TCP port connectivity
    if port:
        try:
            sock = socket.socket(socket.AF_INET, socket.SOCK_STREAM)
            sock.settimeout(5)
            result = sock.connect_ex((ip, port))
            sock.close()
            if result == 0:
                results["checks"].append({"step": f"端口 {port}", "success": True, "detail": "端口可达"})
            else:
                results["checks"].append({
                    "step": f"端口 {port}", "success": False,
                    "detail": f"端口 {port} 不可达（错误码: {result}）。SQL Server 可能未在此端口监听，或防火墙阻止连接"
                })
        except Exception as e:
            results["checks"].append({"step": f"端口 {port}", "success": False, "detail": str(e)})

    # Check 3: ping
    try:
        param = '-n' if sys.platform == 'win32' else '-c'
        ret = subprocess.run(['ping', param, '1', '-w', '2000', host],
                             capture_output=True, timeout=5)
        if ret.returncode == 0:
            results["checks"].append({"step": "Ping", "success": True, "detail": "主机可达"})
        else:
            results["checks"].append({"step": "Ping", "success": False, "detail": "主机不可达（可能被防火墙阻止）"})
    except Exception:
        results["checks"].append({"step": "Ping", "success": False, "detail": "无法执行 ping"})

    all_ok = all(c["success"] for c in results["checks"])
    return {"success": all_ok, "diagnosis": results}


@router.post("/db/explore")
def explore_db_structure(config: DBConfigRequest):
    try:
        cfg = config.model_dump()
        conn_str = _build_connection_string(cfg)

        try:
            from sqlalchemy import create_engine, inspect, text
        except ImportError:
            return {
                "success": False,
                "message": "缺少依赖包，请安装: pip install sqlalchemy pyodbc"
            }

        engine = create_engine(conn_str)
        inspector = inspect(engine)

        tables = []
        for table_name in inspector.get_table_names():
            try:
                validate_identifier(table_name)
            except ValueError:
                continue  # skip tables with unsafe names
            try:
                with engine.connect() as conn:
                    result = conn.execute(text(f"SELECT COUNT(*) FROM [{table_name}]"))
                    row_count = result.scalar()
            except Exception as e:
                logger.warning(f"查询表行数失败: {e}")
                row_count = 0

            tables.append({
                "name": table_name,
                "row_count": row_count
            })

        engine.dispose()
        tables.sort(key=lambda x: x["row_count"], reverse=True)

        return {"success": True, "tables": tables}
    except Exception as e:
        logger.error(f"探查数据库结构失败: {e}", exc_info=True)
        return {"success": False, "message": "探查失败，请检查数据库配置"}


@router.post("/db/test-relational")
def test_relational_connection(config: dict):
    """测试四表关联结构（与 MDB 一致的 Sample/Product/Component/Prediction）"""
    db_config = config.get("db_config", {})
    mapping_config = config.get("mapping_config", {})

    try:
        from backend.app.engine.collector.sqlserver import SQLServerCollector
        collector = SQLServerCollector.from_config(
            db_config=db_config,
            mapping_config=mapping_config,
        )

        # Step 1: 测试连接
        if not collector.test_connection():
            return {"success": False, "message": "SQL Server 连接失败", "step": "connection"}

        # Step 2: 测试四表结构
        table_result = collector.test_tables()
        if not table_result["success"]:
            return {
                "success": False,
                "message": table_result["message"],
                "step": "tables",
                "tables": table_result["tables"],
            }

        # Step 3: 尝试查询产品和指标
        products = collector.get_products()
        indicators = collector.get_indicators()

        collector.close()

        return {
            "success": True,
            "message": "四表关联结构测试通过",
            "products_count": len(products),
            "indicators_count": len(indicators),
            "products": [p["name"] for p in products[:5]],
            "indicators": [i["name"] for i in indicators[:5]],
        }
    except Exception as e:
        logger.error(f"四表关联测试失败: {e}", exc_info=True)
        return {"success": False, "message": "测试失败，请检查配置", "step": "error"}

@router.get("/db/table/{table_name}/columns")
def get_table_columns(table_name: str):
    try:
        config = _load_json_config(DB_CONFIG_FILE, _default_db_config)
        conn_str = _build_connection_string(config)
        
        from sqlalchemy import create_engine, inspect, text
        
        engine = create_engine(conn_str)
        inspector = inspect(engine)
        
        validate_identifier(table_name)

        columns = []
        for col in inspector.get_columns(table_name):
            col_name = col['name']
            validate_identifier(col_name)
            sample = None
            try:
                with engine.connect() as conn:
                    result = conn.execute(
                        text(f"SELECT TOP 1 [{col_name}] FROM [{table_name}] WHERE [{col_name}] IS NOT NULL")
                    )
                    row = result.fetchone()
                    if row:
                        sample = str(row[0])[:50]
            except Exception as e:
                logger.warning(f"获取列信息失败: {e}")
            
            columns.append({
                "name": col["name"],
                "type": str(col["type"]),
                "nullable": col.get("nullable", True),
                "default": str(col.get("default", "")) if col.get("default") else None,
                "sample": sample,
                "mapped_field": None
            })
        
        engine.dispose()
        
        return {"success": True, "columns": columns}
    except Exception as e:
        logger.error(f"获取表结构失败: {e}", exc_info=True)
        return {"success": False, "message": "获取表结构失败，请检查数据库配置"}

@router.put("/db/mapping")
def update_field_mapping(mapping: FieldMappingRequest):
    success = _save_json_config(DB_MAPPING_FILE, mapping.model_dump())
    if success:
        return {"success": True, "message": "字段映射已保存"}
    return {"success": False, "message": "保存失败"}

@router.get("/db/mapping")
def get_field_mapping():
    return _load_json_config(DB_MAPPING_FILE, _default_mapping)

@router.post("/source/switch")
def switch_source(body: dict):
    source = body.get("source", "mock")
    if source not in ("mock", "sqlserver"):
        return {"success": False, "message": f"不支持的数据源类型: {source}"}

    if _switch_collector_func is None:
        return {"success": False, "message": "采集器切换功能未初始化"}

    try:
        result = _switch_collector_func(source)
        return result
    except Exception as e:
        logger.error(f"切换数据源失败: {e}", exc_info=True)
        return {"success": False, "message": "切换失败，请检查配置"}

@router.get("/source/status")
def get_source_status():
    # Load from instrument_config.json to persist across restarts
    instrument_config = _load_json_config(INSTRUMENT_CONFIG_FILE, _default_instrument_config)
    current = instrument_config.get("current_instrument", "mock")

    # Update _source_status based on instrument config
    if current == "mock":
        _source_status["source"] = "mock"
        _source_status["connected"] = False
        _source_status["instrument_type"] = "mock"
    elif current == "ft1":
        _source_status["source"] = "sqlserver"
        _source_status["connected"] = True
        _source_status["instrument_type"] = "ft1"
    elif current == "fta":
        _source_status["source"] = "fta"
        _source_status["connected"] = True
        _source_status["instrument_type"] = "fta"
    elif current == "ft120":
        _source_status["source"] = "mdb"
        _source_status["connected"] = True
        _source_status["instrument_type"] = "ft120"

    return _source_status

# ========== Instrument Configuration ==========

@router.get("/instrument")
def get_instrument_config():
    """获取仪器配置"""
    return _load_json_config(INSTRUMENT_CONFIG_FILE, _default_instrument_config)

@router.put("/instrument")
def update_instrument_config(config: dict):
    """更新仪器配置"""
    err = _check_body_size(config)
    if err:
        return err
    success = _save_json_config(INSTRUMENT_CONFIG_FILE, config)
    if success:
        return {"success": True, "message": "仪器配置已保存"}
    return {"success": False, "message": "保存失败"}

@router.post("/instrument/switch")
def switch_instrument(body: InstrumentSwitchRequest):
    """切换仪器"""
    instrument_id = body.instrument_id
    
    instrument_config = _load_json_config(INSTRUMENT_CONFIG_FILE, _default_instrument_config)
    instruments = instrument_config.get("instruments", {})
    
    if instrument_id != "mock" and instrument_id not in instruments:
        return {"success": False, "message": f"未知的仪器类型: {instrument_id}"}
    
    if _switch_collector_func is None:
        return {"success": False, "message": "采集器切换功能未初始化"}
    
    try:
        result = _switch_collector_func(instrument_id, init_limit=body.init_limit)
        
        # Update instrument config
        instrument_config["current_instrument"] = instrument_id
        _save_json_config(INSTRUMENT_CONFIG_FILE, instrument_config)
        
        # Update source status from result
        if result.get("success"):
            _source_status["source"] = result.get("source", "mock")
            _source_status["connected"] = result.get("connected", False)
            _source_status["instrument_type"] = instrument_id
        
        return result
    except Exception as e:
        logger.error(f"切换仪器失败: {e}", exc_info=True)
        return {"success": False, "message": "切换失败，请检查配置"}

# ========== MDB Configuration ==========

@router.get("/mdb")
def get_mdb_config():
    """获取 MDB 配置"""
    return _load_json_config(MDB_CONFIG_FILE, _default_mdb_config)

@router.put("/mdb")
def update_mdb_config(config: MDBConfigRequest):
    """更新 MDB 配置"""
    success = _save_json_config(MDB_CONFIG_FILE, config.model_dump())
    if success:
        return {"success": True, "message": "MDB 配置已保存"}
    return {"success": False, "message": "保存失败"}

@router.post("/mdb/test")
def test_mdb_connection(config: dict):
    """测试 MDB 文件连接"""
    err = _check_body_size(config)
    if err:
        return err
    mdb_path = config.get("mdb_path", "")
    try:
        mdb_path = validate_mdb_path(mdb_path)
    except ValueError as e:
        logger.error(f"MDB path validation failed: {e}", exc_info=True)
        return {"success": False, "message": "MDB 路径无效，请检查配置"}
    
    if not os.path.exists(mdb_path):
        return {"success": False, "message": f"文件不存在: {mdb_path}"}
    
    try:
        from access_parser import AccessParser
        db = AccessParser(mdb_path)
        
        # Try to parse sample table to verify
        sample_table = config.get("sample_table", "Sample")
        db.parse_table(sample_table)
        
        return {"success": True, "message": "连接成功！"}
    except ImportError:
        return {
            "success": False,
            "message": "缺少依赖包，请安装: pip install access-parser"
        }
    except Exception as e:
        logger.error(f"MDB连接失败: {e}", exc_info=True)
        return {"success": False, "message": "连接失败，请检查MDB文件配置"}

@router.post("/mdb/explore")
def explore_mdb_structure(config: dict):
    """探索 MDB 文件结构"""
    err = _check_body_size(config)
    if err:
        return err
    mdb_path = config.get("mdb_path", "")
    try:
        mdb_path = validate_mdb_path(mdb_path)
    except ValueError as e:
        logger.error(f"MDB path validation failed: {e}", exc_info=True)
        return {"success": False, "message": "MDB 路径无效，请检查配置"}
    
    if not os.path.exists(mdb_path):
        return {"success": False, "message": f"文件不存在: {mdb_path}"}
    
    try:
        from access_parser import AccessParser
        db = AccessParser(mdb_path)
        
        tables = []
        for table_name in db.catalog:
            if table_name.startswith('MSys'):
                continue
            
            try:
                raw_data = db.parse_table(table_name)
                row_count = len(next(iter(raw_data.values()))) if raw_data else 0
            except Exception as e:
                logger.warning(f"查询MDB表行数失败: {e}")
                row_count = 0
            
            tables.append({
                "name": table_name,
                "row_count": row_count
            })
        
        tables.sort(key=lambda x: x["row_count"], reverse=True)
        
        return {"success": True, "tables": tables}
    except ImportError:
        return {
            "success": False,
            "message": "缺少依赖包，请安装: pip install access-parser"
        }
    except Exception as e:
        logger.error(f"MDB探查失败: {e}", exc_info=True)
        return {"success": False, "message": "探查失败，请检查MDB文件配置"}

@router.get("/mdb/table/{table_name}/columns")
def get_mdb_table_columns(table_name: str):
    """获取 MDB 表结构"""
    config = _load_json_config(MDB_CONFIG_FILE, _default_mdb_config)
    mdb_path = config.get("mdb_path", "")
    
    try:
        mdb_path = validate_mdb_path(mdb_path)
    except ValueError as e:
        logger.error(f"MDB path validation failed: {e}", exc_info=True)
        return {"success": False, "message": "MDB 路径无效，请检查配置"}
    
    if not os.path.exists(mdb_path):
        return {"success": False, "message": "MDB 文件未配置或不存在"}
    
    try:
        from access_parser import AccessParser
        db = AccessParser(mdb_path)
        
        raw_data = db.parse_table(table_name)
        if not raw_data:
            return {"success": True, "columns": []}
        
        columns = []
        for col_name, col_data in raw_data.items():
            # Get sample value
            sample = None
            if col_data and len(col_data) > 0:
                sample = str(col_data[0])[:50] if col_data[0] is not None else None
            
            columns.append({
                "name": col_name,
                "type": type(col_data[0]).__name__ if col_data and col_data[0] is not None else "unknown",
                "sample": sample
            })
        
        return {"success": True, "columns": columns}
    except Exception as e:
        logger.error(f"MDB获取表结构失败: {e}", exc_info=True)
        return {"success": False, "message": "获取表结构失败，请检查MDB文件配置"}

@router.get("/mdb/init-status")
def get_mdb_init_status():
    """获取 MDB 初始化状态（断点信息和基本统计）- 优化版本，不解析预测表"""
    config = _load_json_config(MDB_CONFIG_FILE, _default_mdb_config)
    mdb_path = config.get("mdb_path", "")
    
    try:
        mdb_path = validate_mdb_path(mdb_path)
    except ValueError as e:
        logger.error(f"MDB path validation failed: {e}", exc_info=True)
        return {"success": False, "message": "MDB 路径无效，请检查配置"}
    
    if not os.path.exists(mdb_path):
        return {"success": False, "message": "MDB 文件未配置或不存在"}
    
    try:
        from access_parser import AccessParser
        
        db = AccessParser(mdb_path)
        
        # Load breakpoint
        breakpoint_file = "mdb_breakpoint.json"
        breakpoint_info = None
        if os.path.exists(breakpoint_file):
            try:
                with open(breakpoint_file, 'r', encoding='utf-8') as f:
                    breakpoint_info = json.load(f)
            except (json.JSONDecodeError, FileNotFoundError) as e:
                logger.warning(f"加载断点失败: {e}")
        
        # Only parse small tables for basic info (skip Prediction table which is huge)
        sample_table = config.get("sample_table", "Sample")
        product_table = config.get("product_table", "Product")
        component_table = config.get("component_table", "Component")
        
        samples = db.parse_table(sample_table)
        products = db.parse_table(product_table)
        components = db.parse_table(component_table)
        
        total_samples = len(samples['SampNo']) if samples and 'SampNo' in samples else 0
        total_products = len(products['ProdNo']) if products and 'ProdNo' in products else 0
        total_indicators = len(components['CompNo']) if components and 'CompNo' in components else 0

        # 获取最近几条记录用于预览和产品自动匹配
        recent_records = []
        try:
            prediction_table = config.get("prediction_table", "Prediction")
            predictions = db.parse_table(prediction_table)
            if predictions and 'SampRef' in predictions:
                # parse_table 返回列式数据 {col_name: [values...]}
                pred_samp_refs = predictions['SampRef']
                pred_comp_refs = predictions['CompRef']
                pred_values = predictions.get('Value', predictions.get('value', []))
                pred_count = min(len(pred_samp_refs), len(pred_comp_refs), len(pred_values))
                # 取最后 20 条预测记录
                start = max(0, pred_count - 20)
                # 构建查找表
                comp_name_list = components.get('Name', []) if components else []
                comp_no_list = components.get('CompNo', []) if components else []
                comp_map = {}
                for i in range(min(len(comp_no_list), len(comp_name_list))):
                    comp_map[comp_no_list[i]] = _fix_mdb_encoding(comp_name_list[i])
                prod_name_list = products.get('Name', []) if products else []
                prod_no_list = products.get('ProdNo', []) if products else []
                prod_map = {}
                for i in range(min(len(prod_no_list), len(prod_name_list))):
                    prod_map[prod_no_list[i]] = _fix_mdb_encoding(prod_name_list[i])
                samp_no_list = samples.get('SampNo', []) if samples else []
                samp_prod_list = samples.get('ProdRef', []) if samples else []
                samp_time_list = samples.get('DateTime', []) if samples else []
                samp_lookup = {}
                for i in range(min(len(samp_no_list), len(samp_prod_list), len(samp_time_list))):
                    samp_lookup[samp_no_list[i]] = (samp_prod_list[i], samp_time_list[i])
                for i in range(start, pred_count):
                    samp_ref = pred_samp_refs[i]
                    comp_ref = pred_comp_refs[i]
                    val = pred_values[i]
                    if samp_ref is None or comp_ref is None or val is None:
                        continue
                    prod_ref, time_val = samp_lookup.get(samp_ref, (None, ''))
                    prod_name = prod_map.get(prod_ref, f'Product_{prod_ref}') if prod_ref else '未知'
                    comp_name = comp_map.get(comp_ref, f'Component_{comp_ref}')
                    recent_records.append({
                        'product_name': str(prod_name),
                        'indicator_name': str(comp_name),
                        'value': str(val),
                        'sample_time': str(time_val),
                    })
        except Exception as e:
            logger.warning(f"获取预览数据失败: {e}")

        return {
            "success": True,
            "breakpoint": breakpoint_info,
            "recent_records": recent_records[-10:],  # 最多返回 10 条
            "total_samples": total_samples,
            "total_products": total_products,
            "total_indicators": total_indicators
        }
    except Exception as e:
        logger.error(f"获取MDB初始化状态失败: {e}", exc_info=True)
        return {"success": False, "message": "获取初始化状态失败，请检查MDB文件配置"}

def _build_connection_string(config: dict) -> str:
    return build_connection_string(config)

# ========== FTA Configuration ==========

FTA_CONFIG_FILE = "fta_config.json"

_default_fta_config = {
    "server": "",
    "database": "Pert_Application",
    "auth_type": "sql",
    "driver": "pymssql",
    "username": "sa",
    "password": "",
    "timeout": 30
}

@router.get("/fta")
def get_fta_config():
    """获取 FTA 配置"""
    config = _load_json_config(FTA_CONFIG_FILE, _default_fta_config)
    if config.get("password"):
        config["password_saved"] = True
        config["password"] = ""
    return config

@router.put("/fta")
def update_fta_config(config: FTAConfigRequest):
    """更新 FTA 配置"""
    success = _save_json_config(FTA_CONFIG_FILE, config.model_dump())
    if success:
        return {"success": True, "message": "FTA 配置已保存"}
    return {"success": False, "message": "保存失败"}

@router.post("/fta/test")
def test_fta_connection(config: dict):
    """测试 FTA 数据库连接"""
    err = _check_body_size(config)
    if err:
        return err
    try:
        from backend.app.engine.collector.fta import FTACollector
        collector = FTACollector.from_config(db_config=config)

        # Test connection
        if not collector.test_connection():
            error_msg = _diagnose_pymssql_error(Exception("20002 connection failed"), config)
            return {"success": False, "message": error_msg}

        # Test tables
        table_result = collector.test_tables()
        if not table_result["success"]:
            return {"success": False, "message": table_result["message"], "tables": table_result["tables"]}

        # Get products and indicators
        products = collector.get_products()
        indicators = collector.get_indicators()

        collector.close()

        return {
            "success": True,
            "message": "FTA 数据库连接成功",
            "products_count": len(products),
            "indicators_count": len(indicators),
            "products": [p["name"] for p in products[:5]],
            "indicators": [i["name"] for i in indicators[:5]],
        }
    except Exception as e:
        error_msg = _diagnose_pymssql_error(e, config)
        logger.error(f"FTA测试失败: {e}", exc_info=True)
        return {"success": False, "message": error_msg}


# ========== FT1 / FTA Init Status (data preview before import) ==========

@router.get("/db/init-status")
def get_db_init_status():
    """获取 FT1 数据源初始化状态（数据预览）"""
    config = _load_json_config(DB_CONFIG_FILE, _default_db_config)
    mapping = _load_json_config(DB_MAPPING_FILE, _default_mapping)

    try:
        from backend.app.engine.collector.sqlserver import SQLServerCollector
        collector = SQLServerCollector.from_config(db_config=config, mapping_config=mapping)
        if not collector.test_connection():
            return {"success": False, "message": "SQL Server 连接失败"}

        products = collector.get_products()
        indicators = collector.get_indicators()

        # 断点信息
        breakpoint_info = None
        bp_file = "sqlserver_breakpoint.json"
        if os.path.exists(bp_file):
            try:
                with open(bp_file, 'r', encoding='utf-8') as f:
                    breakpoint_info = json.load(f)
            except (json.JSONDecodeError, FileNotFoundError):
                pass

        # 最近数据预览
        recent_records = []
        try:
            rep_no_ref = mapping.get("rep_no_ref", 32000)
            conn = collector._build_pymssql_connection(collector._db_config)
            cursor = conn.cursor()
            time_col = mapping.get("time_column", "DateTime")
            prod_ref_col = mapping.get("product_ref_column", "ProdRef")
            comp_ref_col = mapping.get("component_ref_column", "CompRef")
            value_col = mapping.get("value_column", "Value")
            sample_table = mapping.get("sample_table", "Sample")
            prediction_table = mapping.get("prediction_table", "Prediction")
            for name in [time_col, prod_ref_col, comp_ref_col, value_col, sample_table, prediction_table]:
                validate_identifier(name)
            cursor.execute(f"""
                SELECT TOP 10
                    s.[{time_col}], s.[{prod_ref_col}],
                    p.[{comp_ref_col}], p.[{value_col}]
                FROM [{sample_table}] s
                INNER JOIN [{prediction_table}] p ON s.[SampNo] = p.[SampRef]
                WHERE p.[RepNoRef] = %s
                ORDER BY s.[{time_col}] DESC
            """, (rep_no_ref,))
            rows = cursor.fetchall()
            conn.close()

            products_map = collector._load_products_sql()
            components_map = collector._load_components_sql()
            for row in rows:
                recent_records.append({
                    'product_name': products_map.get(row[1], f'Product_{row[1]}'),
                    'indicator_name': components_map.get(row[2], f'Component_{row[2]}'),
                    'value': str(row[3]),
                    'sample_time': str(row[0]),
                })
        except Exception as e:
            logger.warning(f"获取 FT1 预览数据失败: {e}")

        collector.close()

        return {
            "success": True,
            "breakpoint": breakpoint_info,
            "recent_records": recent_records,
            "total_samples": len(recent_records),  # SQL Server 不方便快速 COUNT，用预览数量
            "total_products": len(products),
            "total_indicators": len(indicators),
        }
    except Exception as e:
        logger.error(f"获取FT1数据源状态失败: {e}", exc_info=True)
        return {"success": False, "message": "获取数据源状态失败，请检查数据库配置"}


@router.get("/fta/init-status")
def get_fta_init_status():
    """获取 FTA 数据源初始化状态（数据预览）"""
    config = _load_json_config(FTA_CONFIG_FILE, _default_fta_config)

    try:
        from backend.app.engine.collector.fta import FTACollector
        collector = FTACollector.from_config(db_config=config)
        if not collector.test_connection():
            return {"success": False, "message": "FTA 数据库连接失败"}

        products = collector.get_products()
        indicators = collector.get_indicators()

        # 断点信息
        breakpoint_info = None
        bp_file = "fta_breakpoint.json"
        if os.path.exists(bp_file):
            try:
                with open(bp_file, 'r', encoding='utf-8') as f:
                    breakpoint_info = json.load(f)
            except (json.JSONDecodeError, FileNotFoundError):
                pass

        # 最近数据预览
        recent_records = []
        try:
            conn = collector._get_connection()
            cursor = conn.cursor()
            cursor.execute("""
                SELECT TOP 10
                    ee.AnalysisStartTime,
                    ee.ProductSpecProfileName,
                    e.ParameterTypeName,
                    e.ReportedResult
                FROM EstimateEvent ee
                INNER JOIN Estimate e ON ee.EstimateEventID = e.EstimateEventID
                WHERE ee.ProductSpecProfileName IS NOT NULL
                ORDER BY ee.AnalysisStartTime DESC
            """)
            rows = cursor.fetchall()
            conn.close()
            for row in rows:
                recent_records.append({
                    'product_name': row[1] or '',
                    'indicator_name': row[2] or '',
                    'value': str(row[3]) if row[3] is not None else '',
                    'sample_time': str(row[0]) if row[0] else '',
                })
        except Exception as e:
            logger.warning(f"获取 FTA 预览数据失败: {e}")

        collector.close()

        return {
            "success": True,
            "breakpoint": breakpoint_info,
            "recent_records": recent_records,
            "total_samples": len(recent_records),
            "total_products": len(products),
            "total_indicators": len(indicators),
        }
    except Exception as e:
        logger.error(f"获取FTA数据源状态失败: {e}", exc_info=True)
        return {"success": False, "message": "获取FTA数据源状态失败，请检查数据库配置"}


# ========== Alias Configuration ==========

ALIAS_CONFIG_FILE = "alias_config.json"

_default_alias_config = {
    "products": {},  # { "product_code": "alias_name" }
    "indicators": {}  # { "indicator_code": "alias_name" }
}

@router.get("/aliases")
def get_aliases():
    """获取别名配置"""
    return _load_json_config(ALIAS_CONFIG_FILE, _default_alias_config)

@router.put("/aliases")
def update_aliases(config: AliasRequest):
    """更新别名配置"""
    success = _save_json_config(ALIAS_CONFIG_FILE, config.model_dump())
    if success:
        return {"success": True, "message": "别名配置已保存"}
    return {"success": False, "message": "保存失败"}

@router.put("/aliases/product/{product_code}")
def update_product_alias(product_code: str, body: dict):
    """更新单个品项别名"""
    alias = body.get("alias", "")
    config = _load_json_config(ALIAS_CONFIG_FILE, _default_alias_config)
    
    if alias:
        config["products"][product_code] = alias
    else:
        config["products"].pop(product_code, None)
    
    success = _save_json_config(ALIAS_CONFIG_FILE, config)
    if success:
        return {"success": True, "message": "品项别名已更新"}
    return {"success": False, "message": "更新失败"}

@router.put("/aliases/indicator/{indicator_code}")
def update_indicator_alias(indicator_code: str, body: dict):
    """更新单个指标别名"""
    alias = body.get("alias", "")
    config = _load_json_config(ALIAS_CONFIG_FILE, _default_alias_config)
    
    if alias:
        config["indicators"][indicator_code] = alias
    else:
        config["indicators"].pop(indicator_code, None)
    
    success = _save_json_config(ALIAS_CONFIG_FILE, config)
    if success:
        return {"success": True, "message": "指标别名已更新"}
    return {"success": False, "message": "更新失败"}

# ========== Product Status Configuration ==========

PRODUCT_STATUS_FILE = "product_status.json"

_default_product_status = {}  # { "product_code": "enabled" | "disabled" }

SPEC_LIMITS_FILE = "spec_limits.json"

# Format: { "product_code": { "indicator_code": { "lsl": float, "usl": float } } }
_default_spec_limits = {}

@router.get("/product-status")
def get_product_status():
    """获取品项状态配置"""
    return _load_json_config(PRODUCT_STATUS_FILE, _default_product_status)

@router.put("/product-status")
def update_product_status(config: ProductStatusRequest):
    """更新品项状态配置"""
    success = _save_json_config(PRODUCT_STATUS_FILE, config.model_dump())
    if success:
        return {"success": True, "message": "品项状态已保存"}
    return {"success": False, "message": "保存失败"}

@router.put("/product-status/{product_code}")
def update_single_product_status(product_code: str, body: dict):
    """更新单个品项状态"""
    status = body.get("status", "enabled")
    config = _load_json_config(PRODUCT_STATUS_FILE, _default_product_status)
    
    if status == "disabled":
        config[product_code] = "disabled"
    else:
        config.pop(product_code, None)  # 默认为enabled，不需要存储
    
    success = _save_json_config(PRODUCT_STATUS_FILE, config)
    if success:
        return {"success": True, "message": f"品项状态已更新为{status}"}
    return {"success": False, "message": "更新失败"}


# ========== Excluded Remarks Configuration ==========

EXCLUDED_REMARKS_FILE = "excluded_remarks.json"
_default_excluded_remarks: list[str] = ["基准样"]

@router.get("/excluded-remarks")
def get_excluded_remarks():
    return _load_json_config(EXCLUDED_REMARKS_FILE, _default_excluded_remarks)

@router.put("/excluded-remarks")
def update_excluded_remarks(body: dict):
    err = _check_body_size(body)
    if err:
        return err
    keywords = body.get("keywords", [])
    if not isinstance(keywords, list):
        return {"success": False, "message": "keywords 必须是数组"}
    success = _save_json_config(EXCLUDED_REMARKS_FILE, keywords)
    if success:
        storage.set_excluded_remarks(keywords)
        return {"success": True, "message": "排除关键词已更新"}
    return {"success": False, "message": "保存失败"}


@router.get("/recent-counts")
def get_recent_counts(days: int = Query(10, ge=1, le=365)):
    """获取最近N天每个品项/指标的采集数量（用于排序）"""
    try:
        return storage.get_recent_collection_counts(days)
    except Exception as e:
        logger.warning(f"获取采集统计失败: {e}")
        return {"products": {}, "indicators": {}}


# ========== Spec Limits Configuration ==========

def _get_merged_spec_limits(product_code: str = None) -> dict:
    """Get spec limits for a product, falling back to global defaults."""
    raw = _load_json_config(SPEC_LIMITS_FILE, _default_spec_limits)
    if not raw:
        return {}
    # Detect old flat format (keys are indicator codes, not product codes)
    first_val = next(iter(raw.values()), None) if raw else None
    is_flat = isinstance(first_val, dict) and ('lsl' in first_val or 'usl' in first_val)
    if is_flat:
        return raw  # old global format, return as-is
    # New per-product format
    if product_code and product_code in raw:
        return raw[product_code]
    return {}

@router.get("/spec-limits")
def get_spec_limits(product_code: str = Query(None)):
    """获取规格限配置。传 product_code 则返回该品项的规格限，否则返回完整品项结构。"""
    raw = _load_json_config(SPEC_LIMITS_FILE, _default_spec_limits)
    if product_code:
        return _get_merged_spec_limits(product_code)
    return raw

@router.put("/spec-limits")
def update_spec_limits(config: dict):
    """更新规格限配置"""
    err = _check_body_size(config)
    if err:
        return err
    success = _save_json_config(SPEC_LIMITS_FILE, config)
    if success:
        return {"success": True, "message": "规格限配置已保存"}
    return {"success": False, "message": "保存失败"}

@router.put("/spec-limits/{indicator_code}")
def update_single_spec_limit(indicator_code: str, body: dict):
    """更新单个指标的规格限。传 product_code 则保存到该品项下，否则保存为全局默认。"""
    lsl = body.get("lsl")
    usl = body.get("usl")
    target_val = body.get("target")
    product_code = body.get("product_code")
    raw = _load_json_config(SPEC_LIMITS_FILE, _default_spec_limits)

    if product_code:
        # Per-product save
        if product_code not in raw or not isinstance(raw.get(product_code), dict):
            raw[product_code] = {}
        if lsl is not None or usl is not None or target_val is not None:
            raw[product_code][indicator_code] = {}
            if lsl is not None:
                raw[product_code][indicator_code]["lsl"] = float(lsl)
            if usl is not None:
                raw[product_code][indicator_code]["usl"] = float(usl)
            if target_val is not None:
                raw[product_code][indicator_code]["target"] = float(target_val)
        else:
            raw[product_code].pop(indicator_code, None)
    else:
        # Global save (backward compat)
        first_val = next(iter(raw.values()), None) if raw else None
        is_flat = isinstance(first_val, dict) and ('lsl' in first_val or 'usl' in first_val)
        if not is_flat:
            if "__global__" not in raw:
                raw["__global__"] = {}
            gtarget = raw["__global__"]
        else:
            gtarget = raw
        if lsl is not None or usl is not None or target_val is not None:
            gtarget[indicator_code] = {}
            if lsl is not None:
                gtarget[indicator_code]["lsl"] = float(lsl)
            if usl is not None:
                gtarget[indicator_code]["usl"] = float(usl)
            if target_val is not None:
                gtarget[indicator_code]["target"] = float(target_val)
        else:
            gtarget.pop(indicator_code, None)

    success = _save_json_config(SPEC_LIMITS_FILE, raw)
    if success:
        return {"success": True, "message": "规格限已更新"}
    return {"success": False, "message": "更新失败"}


# ========== Alert Rules Configuration ==========

ALERT_RULES_FILE = "alert_rules.json"

_default_alert_rules = [
    {"id": 1, "rule": "规则1", "description": "1个点超出3σ控制限", "severity": "CRITICAL", "enabled": True, "rule_type": "nelson_1"},
    {"id": 2, "rule": "规则2", "description": "连续9个点在中心线同一侧", "severity": "CRITICAL", "enabled": True, "rule_type": "nelson_2"},
    {"id": 3, "rule": "规则3", "description": "连续6个点递增或递减", "severity": "WARNING", "enabled": True, "rule_type": "nelson_3"},
    {"id": 4, "rule": "规则4", "description": "连续14个点交替升降", "severity": "WARNING", "enabled": True, "rule_type": "nelson_4"},
    {"id": 5, "rule": "规则5", "description": "连续3个点中有2个超出2σ", "severity": "CRITICAL", "enabled": True, "rule_type": "nelson_5"},
    {"id": 6, "rule": "规则6", "description": "连续5个点中有4个超出1σ", "severity": "WARNING", "enabled": False, "rule_type": "nelson_6"},
    {"id": 7, "rule": "规则7", "description": "连续15个点在1σ以内（层叠）", "severity": "INFO", "enabled": False, "rule_type": "nelson_7"},
    {"id": 8, "rule": "规则8", "description": "连续8个点在1σ以外（混合）", "severity": "INFO", "enabled": False, "rule_type": "nelson_8"},
    {"id": 9, "rule": "CPK预警", "description": "CPK低于目标值", "severity": "WARNING", "enabled": True, "rule_type": "cpk_below_target"},
    {"id": 10, "rule": "规格越限", "description": "检测值超出规格线（USL/LSL）", "severity": "CRITICAL", "enabled": True, "rule_type": "spec_limit_breach"},
    {"id": 11, "rule": "预测超上限", "description": "预测值将超出规格上限（USL）", "severity": "WARNING", "enabled": True, "rule_type": "prediction_above_usl"},
    {"id": 12, "rule": "预测超下限", "description": "预测值将超出规格下限（LSL）", "severity": "WARNING", "enabled": True, "rule_type": "prediction_below_lsl"},
]


@router.get("/alert-rules")
def get_alert_rules():
    """获取预警规则配置"""
    return _load_json_config(ALERT_RULES_FILE, {"rules": _default_alert_rules})


@router.put("/alert-rules")
def update_alert_rules(config: dict):
    """更新预警规则配置"""
    err = _check_body_size(config)
    if err:
        return err
    success = _save_json_config(ALERT_RULES_FILE, config)
    if success:
        return {"success": True, "message": "预警规则已保存"}
    return {"success": False, "message": "保存失败"}


# ========== Correction Values Configuration (stored in spec_limits) ==========


@router.get("/correction-values")
def get_correction_values(product_code: str = Query(None)):
    """获取修正值配置。从 spec_limits 中提取 correction 字段。"""
    raw = _load_json_config(SPEC_LIMITS_FILE, _default_spec_limits)
    result = {}
    for p_code, indicators in raw.items():
        if not isinstance(indicators, dict):
            continue
        if product_code and p_code != product_code:
            continue
        corrections = {}
        last_updated_at = None
        for i_code, limits in indicators.items():
            if isinstance(limits, dict) and "correction" in limits:
                corrections[i_code] = limits["correction"]
                last_updated_at = limits.get("correction_updated_at")
        if corrections:
            result[p_code] = {
                "values": corrections,
                "updated_at": last_updated_at
            }
    return result


@router.put("/correction-values/{product_code}")
def update_correction_values(product_code: str, body: dict):
    """更新单个品项的修正值（存储到 spec_limits 中）"""
    corrections = body.get("corrections", {})
    raw = _load_json_config(SPEC_LIMITS_FILE, _default_spec_limits)

    if product_code not in raw or not isinstance(raw.get(product_code), dict):
        raw[product_code] = {}

    now_str = datetime.now().isoformat()
    for indicator_code, value in corrections.items():
        if indicator_code not in raw[product_code] or not isinstance(raw[product_code].get(indicator_code), dict):
            raw[product_code][indicator_code] = {}
        try:
            val = round(float(value), 4)
            if val != 0:
                raw[product_code][indicator_code]["correction"] = val
                raw[product_code][indicator_code]["correction_updated_at"] = now_str
            else:
                raw[product_code][indicator_code].pop("correction", None)
                raw[product_code][indicator_code].pop("correction_updated_at", None)
        except (ValueError, TypeError):
            pass

    success = _save_json_config(SPEC_LIMITS_FILE, raw)
    if success:
        return {"success": True, "message": "修正值已保存"}
    return {"success": False, "message": "保存失败"}


# ── 产品类别配置 ────────────────────────────────────────────

PRODUCT_CATEGORIES_FILE = "product_categories.json"

PREDICTION_CATEGORIES = {
    "sterilized_milk": {"name": "灭菌乳", "k": 0.6277},
    "fermented_milk": {"name": "发酵乳", "k": 0.6232},
    "milk_drink": {"name": "乳饮料", "k": 0.6230},
    "modified_milk": {"name": "调制乳", "k": 0.6320},
    "uf_pure_milk": {"name": "超滤纯牛奶", "k": 0.6255},
    "milk_flavored_drink": {"name": "乳味饮料", "k": 0.6301},
    "plant_protein": {"name": "植物蛋白饮品", "k": 0.1742},
    "juice_drink": {"name": "果蔬汁类饮料", "k": 0.6187},
    "flavored_drink": {"name": "风味饮料", "k": 0.5480},
    "compound_protein": {"name": "复合蛋白饮料", "k": 0.3231},
    "cream": {"name": "奶油", "k": 0.6470},
    "tea_drink": {"name": "茶饮料", "k": 0.7370},
    "grain_drink": {"name": "谷物类饮料", "k": 0.1310},
    "mineral_water": {"name": "矿泉水", "k": 0.6250},
}


@router.get("/product-categories")
def get_product_categories():
    """获取所有产品类别映射"""
    return _load_json_config(PRODUCT_CATEGORIES_FILE, {})


@router.put("/product-categories/{product_code}")
def update_product_category(product_code: str, req: ProductCategoryRequest):
    """更新单个产品的类别"""
    data = _load_json_config(PRODUCT_CATEGORIES_FILE, {})
    if req.category:
        data[product_code] = req.category
    else:
        data.pop(product_code, None)
    success = _save_json_config(PRODUCT_CATEGORIES_FILE, data)
    if success:
        return {"success": True, "message": "产品类别已保存"}
    return {"success": False, "message": "保存失败"}


@router.get("/prediction-categories")
def get_prediction_categories():
    """获取可用的预测类别定义（含推荐系数）"""
    return PREDICTION_CATEGORIES


# ── 交叉预测配置 ────────────────────────────────────────────

PREDICTION_CONFIG_FILE = "prediction_config.json"


@router.get("/prediction-config")
def get_prediction_config():
    """获取所有产品的交叉预测指标配置"""
    return _load_json_config(PREDICTION_CONFIG_FILE, {})


@router.put("/prediction-config/{product_code}")
def update_prediction_config(product_code: str, indicators: dict):
    """更新某产品的交叉预测指标配置"""
    data = _load_json_config(PREDICTION_CONFIG_FILE, {})

    # 验证并设置默认值
    for indicator, cfg in indicators.items():
        if "alert_threshold" in cfg:
            threshold = cfg["alert_threshold"]
            if not (0 < threshold <= 1):
                raise HTTPException(400, "报警阈值必须在0-1之间")
        cfg.setdefault("alert_threshold", 0.10)
        cfg.setdefault("alert_enabled", False)
        # Handle new spec limit fields
        cfg.setdefault("usl", None)
        cfg.setdefault("lsl", None)
        cfg.setdefault("target", None)
        cfg.setdefault("unit", None)

    data[product_code] = indicators
    success = _save_json_config(PREDICTION_CONFIG_FILE, data)
    if success:
        return {"success": True, "message": "预测配置已保存"}
    return {"success": False, "message": "保存失败"}
