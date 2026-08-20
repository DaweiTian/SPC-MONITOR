from fastapi import APIRouter
from typing import Optional, Callable
import json
import os

router = APIRouter(prefix="/config", tags=["配置"])

# Collector swap callback (set by main.py)
_switch_collector_func: Optional[Callable] = None

# Source status tracking (updated by main.py)
_source_status = {
    "source": "mock",
    "connected": False,
    "instrument_type": "mock",
}

_config = {
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
    "driver": "ODBC Driver 17 for SQL Server",
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

def _load_json_config(filepath: str, default: dict) -> dict:
    if os.path.exists(filepath):
        try:
            with open(filepath, 'r', encoding='utf-8') as f:
                return json.load(f)
        except Exception:
            pass
    return default

def _save_json_config(filepath: str, data: dict) -> bool:
    try:
        with open(filepath, 'w', encoding='utf-8') as f:
            json.dump(data, f, ensure_ascii=False, indent=2)
        return True
    except Exception as e:
        print(f"保存配置失败: {e}")
        return False

@router.get("")
async def get_config():
    return _config

@router.put("")
async def update_config(config: dict):
    _config.update(config)
    return {"status": "updated", "config": _config}

@router.get("/db")
async def get_db_config():
    config = _load_json_config(DB_CONFIG_FILE, _default_db_config)
    if config.get("password"):
        config["password_saved"] = True
    return config

@router.put("/db")
async def update_db_config(config: dict):
    success = _save_json_config(DB_CONFIG_FILE, config)
    if success:
        return {"success": True, "message": "配置已保存"}
    return {"success": False, "message": "保存失败"}

@router.post("/db/test")
async def test_db_connection(config: dict):
    try:
        conn_str = _build_connection_string(config)
        
        try:
            from sqlalchemy import create_engine, text
        except ImportError:
            return {
                "success": False,
                "message": "缺少依赖包，请安装: pip install sqlalchemy pyodbc"
            }
        
        engine = create_engine(conn_str, connect_args={"timeout": config.get("timeout", 30)})
        
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
        
        return {"success": False, "message": f"连接失败: {error_msg}"}

@router.post("/db/explore")
async def explore_db_structure(config: dict):
    try:
        conn_str = _build_connection_string(config)
        
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
                with engine.connect() as conn:
                    result = conn.execute(text(f"SELECT COUNT(*) FROM [{table_name}]"))
                    row_count = result.scalar()
            except:
                row_count = 0
            
            tables.append({
                "name": table_name,
                "row_count": row_count
            })
        
        engine.dispose()
        tables.sort(key=lambda x: x["row_count"], reverse=True)
        
        return {"success": True, "tables": tables}
    except Exception as e:
        return {"success": False, "message": f"探查失败: {str(e)}"}

@router.get("/db/table/{table_name}/columns")
async def get_table_columns(table_name: str):
    try:
        config = _load_json_config(DB_CONFIG_FILE, _default_db_config)
        conn_str = _build_connection_string(config)
        
        from sqlalchemy import create_engine, inspect, text
        
        engine = create_engine(conn_str)
        inspector = inspect(engine)
        
        columns = []
        for col in inspector.get_columns(table_name):
            sample = None
            try:
                with engine.connect() as conn:
                    result = conn.execute(
                        text(f"SELECT TOP 1 [{col['name']}] FROM [{table_name}] WHERE [{col['name']}] IS NOT NULL")
                    )
                    row = result.fetchone()
                    if row:
                        sample = str(row[0])[:50]
            except:
                pass
            
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
        return {"success": False, "message": f"获取表结构失败: {str(e)}"}

@router.put("/db/mapping")
async def update_field_mapping(mapping: dict):
    success = _save_json_config(DB_MAPPING_FILE, mapping)
    if success:
        return {"success": True, "message": "字段映射已保存"}
    return {"success": False, "message": "保存失败"}

@router.get("/db/mapping")
async def get_field_mapping():
    return _load_json_config(DB_MAPPING_FILE, _default_mapping)

@router.post("/source/switch")
async def switch_source(body: dict):
    source = body.get("source", "mock")
    if source not in ("mock", "sqlserver"):
        return {"success": False, "message": f"不支持的数据源类型: {source}"}

    if _switch_collector_func is None:
        return {"success": False, "message": "采集器切换功能未初始化"}

    try:
        result = _switch_collector_func(source)
        return result
    except Exception as e:
        return {"success": False, "message": f"切换失败: {str(e)}"}

@router.get("/source/status")
async def get_source_status():
    # Load from instrument_config.json to persist across restarts
    instrument_config = _load_json_config(INSTRUMENT_CONFIG_FILE, _default_instrument_config)
    current = instrument_config.get("current_instrument", "mock")
    
    # Update _source_status based on instrument config
    if current == "mock":
        _source_status["source"] = "mock"
        _source_status["connected"] = False
        _source_status["instrument_type"] = "mock"
    elif current in ("ft1", "fta"):
        _source_status["source"] = "sqlserver"
        _source_status["connected"] = True
        _source_status["instrument_type"] = current
    elif current == "ft120":
        _source_status["source"] = "mdb"
        _source_status["connected"] = True
        _source_status["instrument_type"] = "ft120"
    
    return _source_status

# ========== Instrument Configuration ==========

@router.get("/instrument")
async def get_instrument_config():
    """获取仪器配置"""
    return _load_json_config(INSTRUMENT_CONFIG_FILE, _default_instrument_config)

@router.put("/instrument")
async def update_instrument_config(config: dict):
    """更新仪器配置"""
    success = _save_json_config(INSTRUMENT_CONFIG_FILE, config)
    if success:
        return {"success": True, "message": "仪器配置已保存"}
    return {"success": False, "message": "保存失败"}

@router.post("/instrument/switch")
async def switch_instrument(body: dict):
    """切换仪器"""
    instrument_id = body.get("instrument_id", "mock")
    
    instrument_config = _load_json_config(INSTRUMENT_CONFIG_FILE, _default_instrument_config)
    instruments = instrument_config.get("instruments", {})
    
    if instrument_id != "mock" and instrument_id not in instruments:
        return {"success": False, "message": f"未知的仪器类型: {instrument_id}"}
    
    if _switch_collector_func is None:
        return {"success": False, "message": "采集器切换功能未初始化"}
    
    try:
        result = _switch_collector_func(instrument_id)
        
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
        return {"success": False, "message": f"切换失败: {str(e)}"}

# ========== MDB Configuration ==========

@router.get("/mdb")
async def get_mdb_config():
    """获取 MDB 配置"""
    return _load_json_config(MDB_CONFIG_FILE, _default_mdb_config)

@router.put("/mdb")
async def update_mdb_config(config: dict):
    """更新 MDB 配置"""
    success = _save_json_config(MDB_CONFIG_FILE, config)
    if success:
        return {"success": True, "message": "MDB 配置已保存"}
    return {"success": False, "message": "保存失败"}

@router.post("/mdb/test")
async def test_mdb_connection(config: dict):
    """测试 MDB 文件连接"""
    mdb_path = config.get("mdb_path", "")
    
    if not mdb_path:
        return {"success": False, "message": "请提供 MDB 文件路径"}
    
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
        return {"success": False, "message": f"连接失败: {str(e)}"}

@router.post("/mdb/explore")
async def explore_mdb_structure(config: dict):
    """探索 MDB 文件结构"""
    mdb_path = config.get("mdb_path", "")
    
    if not mdb_path:
        return {"success": False, "message": "请提供 MDB 文件路径"}
    
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
                row_count = len(raw_data[list(raw_data.keys())[0]]) if raw_data and raw_data.keys() else 0
            except:
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
        return {"success": False, "message": f"探查失败: {str(e)}"}

@router.get("/mdb/table/{table_name}/columns")
async def get_mdb_table_columns(table_name: str):
    """获取 MDB 表结构"""
    config = _load_json_config(MDB_CONFIG_FILE, _default_mdb_config)
    mdb_path = config.get("mdb_path", "")
    
    if not mdb_path or not os.path.exists(mdb_path):
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
        return {"success": False, "message": f"获取表结构失败: {str(e)}"}

@router.get("/mdb/init-status")
async def get_mdb_init_status():
    """获取 MDB 初始化状态（断点信息和基本统计）- 优化版本，不解析预测表"""
    config = _load_json_config(MDB_CONFIG_FILE, _default_mdb_config)
    mdb_path = config.get("mdb_path", "")
    
    if not mdb_path or not os.path.exists(mdb_path):
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
            except:
                pass
        
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
        
        return {
            "success": True,
            "breakpoint": breakpoint_info,
            "recent_records": [],  # Skip for performance
            "total_samples": total_samples,
            "total_products": total_products,
            "total_indicators": total_indicators
        }
    except Exception as e:
        return {"success": False, "message": f"获取初始化状态失败: {str(e)}"}

def _build_connection_string(config: dict) -> str:
    server = config.get("server", "")
    database = config.get("database", "")
    driver = config.get("driver", "ODBC Driver 17 for SQL Server")
    auth_type = config.get("auth_type", "windows")
    driver_encoded = driver.replace(" ", "+")
    
    if auth_type == "windows":
        return f"mssql+pyodbc://@{server}/{database}?driver={driver_encoded}&trusted_connection=yes"
    else:
        username = config.get("username", "")
        password = config.get("password", "")
        return f"mssql+pyodbc://{username}:{password}@{server}/{database}?driver={driver_encoded}"

# ========== Alias Configuration ==========

ALIAS_CONFIG_FILE = "alias_config.json"

_default_alias_config = {
    "products": {},  # { "product_code": "alias_name" }
    "indicators": {}  # { "indicator_code": "alias_name" }
}

@router.get("/aliases")
async def get_aliases():
    """获取别名配置"""
    return _load_json_config(ALIAS_CONFIG_FILE, _default_alias_config)

@router.put("/aliases")
async def update_aliases(config: dict):
    """更新别名配置"""
    success = _save_json_config(ALIAS_CONFIG_FILE, config)
    if success:
        return {"success": True, "message": "别名配置已保存"}
    return {"success": False, "message": "保存失败"}

@router.put("/aliases/product/{product_code}")
async def update_product_alias(product_code: str, body: dict):
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
async def update_indicator_alias(indicator_code: str, body: dict):
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

@router.get("/product-status")
async def get_product_status():
    """获取品项状态配置"""
    return _load_json_config(PRODUCT_STATUS_FILE, _default_product_status)

@router.put("/product-status")
async def update_product_status(config: dict):
    """更新品项状态配置"""
    success = _save_json_config(PRODUCT_STATUS_FILE, config)
    if success:
        return {"success": True, "message": "品项状态已保存"}
    return {"success": False, "message": "保存失败"}

@router.put("/product-status/{product_code}")
async def update_single_product_status(product_code: str, body: dict):
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
