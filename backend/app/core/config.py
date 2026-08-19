from pydantic_settings import BaseSettings
from functools import lru_cache

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
    sqlserver_driver: str = "ODBC Driver 17 for SQL Server"
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
