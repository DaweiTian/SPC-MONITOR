from pydantic_settings import BaseSettings
from functools import lru_cache
from pathlib import Path
import json

# 服务器配置文件路径（Nuitka编译后 __file__ 在 _internal/ 下，需要向上找到 exe 目录）
_SERVER_CONFIG_CANDIDATES = [
    Path.cwd() / "server_config.json",                       # exe 所在目录（run.py 设置了 cwd）
    Path(__file__).parent.parent.parent / "server_config.json",  # 开发环境
]
SERVER_CONFIG_FILE = next((p for p in _SERVER_CONFIG_CANDIDATES if p.exists()), _SERVER_CONFIG_CANDIDATES[0])

class Settings(BaseSettings):
    app_name: str = "液奶过程监控系统"
    debug: bool = False
    database_url: str = "sqlite:///data/monitor.db"
    
    # SQL Server 配置
    sqlserver_enabled: bool = False
    sqlserver_server: str = ""
    sqlserver_database: str = ""
    sqlserver_username: str = ""
    sqlserver_password: str = ""
    sqlserver_driver: str = "pymssql"
    sqlserver_auth_type: str = "windows"
    sqlserver_timeout: int = 30
    
    # 采集配置
    collect_interval_minutes: int = 5
    max_interval_minutes: int = 300
    spc_window_size: int = 30
    cpk_min_threshold: float = 1.33
    data_retention_days: int = 90
    
    # 预警配置
    alert_sound_enabled: bool = True
    alert_popup_enabled: bool = True
    
    class Config:
        env_file = ".env"

@lru_cache()
def get_settings() -> Settings:
    return Settings()

def get_server_config() -> dict:
    """
    从 server_config.json 读取服务器配置
    返回: {"host": str, "port": int, "shared_password": str}
    默认值: {"host": "127.0.0.1", "port": 18080, "shared_password": ""}
    """
    default_config = {"host": "127.0.0.1", "port": 18080, "shared_password": ""}
    
    try:
        if SERVER_CONFIG_FILE.exists():
            with open(SERVER_CONFIG_FILE, 'r', encoding='utf-8') as f:
                config = json.load(f)
                return {
                    "host": config.get("host", default_config["host"]),
                    "port": int(config.get("port", default_config["port"])),
                    "shared_password": config.get("shared_password", default_config["shared_password"])
                }
    except Exception as e:
        import logging
        logging.getLogger(__name__).warning(f"读取 server_config.json 失败，使用默认配置: {e}")
    
    return default_config
