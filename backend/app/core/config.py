from pydantic_settings import BaseSettings
from functools import lru_cache
from pathlib import Path
import json
import os
import sys

# ---- conf/ 目录路径解析 ----
# 优先级：
#   1. CWD/conf（run.py 将 CWD 设为 exe 目录）
#   2. 可执行文件旁 conf/（打包模式：ft1-backend/conf）
#   3. __file__/../../../conf（开发：backend/app/core → backend/conf）

def _find_conf_dir() -> Path:
    """定位 conf/ 配置目录。"""
    candidates = [
        Path.cwd() / "conf",
    ]
    try:
        exe_dir = Path(sys.executable if getattr(sys, "frozen", False) else __file__).resolve().parent
        # 打包：exe 在 ft1-backend/，conf 在同级
        candidates.append(exe_dir / "conf")
        # Nuitka _internal：上溯一级
        candidates.append(exe_dir.parent / "conf")
    except Exception:
        pass
    # 开发：backend/app/core/config.py → backend/conf
    candidates.append(Path(__file__).resolve().parent.parent.parent / "conf")

    seen = set()
    for p in candidates:
        rp = p.resolve() if p.exists() else p
        if rp in seen:
            continue
        seen.add(rp)
        if p.is_dir():
            return p
    import logging
    logging.getLogger(__name__).warning(
        f"conf/ directory not found in any candidate: {[str(p) for p in candidates]}"
    )
    return candidates[0]


_CONF_DIR = _find_conf_dir()


def get_conf_path(filename: str) -> str:
    """返回 conf/<filename> 的绝对路径（str），供 open() 使用。"""
    if "/" in filename or "\\" in filename or ".." in filename:
        raise ValueError(f"Invalid config filename: {filename}")
    return str(_CONF_DIR / filename)


# ---- 服务器配置 ----

SERVER_CONFIG_FILE = get_conf_path("server_config.json")


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
        if Path(SERVER_CONFIG_FILE).exists():
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
