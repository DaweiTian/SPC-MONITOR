from fastapi import APIRouter
from typing import Optional
import json
import os

router = APIRouter(prefix="/config", tags=["配置"])

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
