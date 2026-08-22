import json
import os
import logging
import urllib.parse
from datetime import datetime
from typing import Optional, Dict, Any

logger = logging.getLogger(__name__)


def parse_datetime(time_str: str) -> Optional[datetime]:
    """Parse datetime string handling both ISO format and custom formats."""
    if not time_str:
        return None
    try:
        if 'T' in str(time_str):
            return datetime.fromisoformat(str(time_str).replace('Z', '+00:00'))
        else:
            return datetime.strptime(str(time_str), '%Y-%m-%d %H:%M:%S')
    except (ValueError, TypeError):
        return None


def clear_breakpoint(filepath: str) -> None:
    """Delete breakpoint file if it exists."""
    if os.path.exists(filepath):
        try:
            os.remove(filepath)
            logger.info(f"已清除断点文件: {filepath}")
        except Exception as e:
            logger.warning(f"清除断点文件失败: {e}")


def load_breakpoint(filepath: str) -> Optional[str]:
    """Load breakpoint timestamp from file."""
    if os.path.exists(filepath):
        try:
            with open(filepath, 'r') as f:
                data = json.load(f)
                return data.get('last_timestamp') or data.get('last_collect_time')
        except (json.JSONDecodeError, KeyError, FileNotFoundError) as e:
            logger.warning(f"Failed to load breakpoint from {filepath}: {e}")
            return None
    return None


def save_breakpoint(filepath: str, timestamp: str) -> None:
    """Save breakpoint timestamp to file."""
    try:
        with open(filepath, 'w') as f:
            json.dump({'last_timestamp': timestamp}, f)
    except (OSError, IOError) as e:
        logger.error(f"Failed to save breakpoint to {filepath}: {e}")


def load_spec_limits(filepath: str, product_code: Optional[str] = None) -> Dict[str, Any]:
    """Load spec limits from file, handling flat and per-product formats."""
    if not os.path.exists(filepath):
        return {}
    try:
        with open(filepath, 'r', encoding='utf-8') as f:
            data = json.load(f)
        if product_code and product_code in data:
            return data[product_code]
        if any(key in data for key in ['fat', 'protein', 'lactose', 'density']):
            return data
        return data
    except (json.JSONDecodeError, KeyError, FileNotFoundError) as e:
        logger.warning(f"Failed to load spec limits from {filepath}: {e}")
        return {}


def build_connection_string(config: Dict[str, Any]) -> str:
    """Build SQL Server connection string from config."""
    server = config.get('server', '')
    database = config.get('database', '')
    username = config.get('username', '')
    password = config.get('password', '')
    driver = config.get('driver', 'ODBC Driver 17 for SQL Server')
    timeout = config.get('timeout', 30)

    driver_encoded = driver.replace(' ', '+')

    if config.get('auth_type') == 'windows':
        return f"mssql+pyodbc://{urllib.parse.quote_plus(server)}/{urllib.parse.quote_plus(database)}?driver={driver_encoded}&trusted_connection=yes&timeout={timeout}"
    else:
        return f"mssql+pyodbc://{urllib.parse.quote_plus(username)}:{urllib.parse.quote_plus(password)}@{urllib.parse.quote_plus(server)}/{urllib.parse.quote_plus(database)}?driver={driver_encoded}&timeout={timeout}"
