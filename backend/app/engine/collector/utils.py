import json
import os
import socket
import logging
import urllib.parse
from datetime import datetime
from typing import Optional, Dict, Any

logger = logging.getLogger(__name__)


def resolve_host(host: str) -> str:
    """解析主机名到IPv4地址（pymssql/FreeTDS 不支持IPv6，必须强制使用IPv4）"""
    try:
        # 强制使用 IPv4（AF_INET），避免 Windows 默认 IPv6 优先导致 pymssql 连接失败
        addrs = socket.getaddrinfo(host, None, socket.AF_INET, socket.SOCK_STREAM)
        if addrs:
            ip = addrs[0][4][0]
            if ip != host:
                logger.info(f"主机名解析: {host} -> {ip}")
            return ip
    except (socket.gaierror, OSError):
        pass
    # IPv4 解析失败，回退到 gethostbyname
    try:
        ip = socket.gethostbyname(host)
        if ip != host:
            logger.info(f"主机名解析(fallback): {host} -> {ip}")
        return ip
    except (socket.gaierror, OSError):
        logger.warning(f"主机名解析失败，使用原始主机名: {host}")
        return host


def resolve_instance_port(host: str, instance: str, timeout: float = 3.0) -> Optional[int]:
    """通过 SQL Server Browser (SSRP/UDP 1434) 解析命名实例的 TCP 端口。

    pymssql/FreeTDS 对 host\\instance 支持很差；ODBC 可以靠 SQL Browser，
    这里给 pymssql 补上同样的能力。
    """
    if not host or not instance:
        return None
    try:
        ip = resolve_host(host)
        # SSRP client unicast request: 0x04 + instance name
        payload = b"\x04" + instance.encode("ascii", errors="ignore")
        sock = socket.socket(socket.AF_INET, socket.SOCK_DGRAM)
        sock.settimeout(timeout)
        try:
            sock.sendto(payload, (ip, 1434))
            data, _ = sock.recvfrom(4096)
        finally:
            sock.close()
        if not data or data[0] != 0x05:
            return None
        # Response: 0x05 + "tcp;PORT;..." text
        text = data[1:].decode("ascii", errors="ignore")
        for part in text.split(";"):
            if part.isdigit():
                port = int(part)
                if 1 <= port <= 65535:
                    logger.info(f"SQL Browser 解析实例 {instance} -> {ip}:{port}")
                    return port
    except Exception as e:
        logger.debug(f"SQL Browser 解析实例失败 ({host}\\{instance}): {e}")
    return None


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
            with open(filepath, 'r', encoding='utf-8') as f:
                data = json.load(f)
                return data.get('last_timestamp') or data.get('last_collect_time')
        except (json.JSONDecodeError, KeyError, FileNotFoundError) as e:
            logger.warning(f"Failed to load breakpoint from {filepath}: {e}")
            return None
    return None


def save_breakpoint(filepath: str, timestamp: str) -> None:
    """Save breakpoint timestamp to file (atomic write)."""
    import tempfile
    try:
        dir_name = os.path.dirname(filepath)
        fd, tmp = tempfile.mkstemp(dir=dir_name, suffix='.tmp')
        try:
            with os.fdopen(fd, 'w', encoding='utf-8') as f:
                json.dump({'last_timestamp': timestamp}, f)
            os.replace(tmp, filepath)
        except:
            os.unlink(tmp)
            raise
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


_detected_odbc_driver: str | None = None

# 现代驱动优先；禁止选中已废弃的 DBNETLIB「SQL Server」
_ODBC_DRIVER_PRIORITY = (
    'ODBC Driver 18 for SQL Server',
    'ODBC Driver 17 for SQL Server',
    'ODBC Driver 16 for SQL Server',
    'ODBC Driver 13 for SQL Server',
    'ODBC Driver 11 for SQL Server',
    'SQL Server Native Client 11.0',
    'SQL Server Native Client 10.0',
)


def _pick_odbc_driver(drivers: list) -> str | None:
    """从已安装驱动列表中选择最合适的 SQL Server ODBC 驱动。"""
    names = [str(d).strip() for d in drivers if d and str(d).strip()]
    if not names:
        return None
    lower_map = {n.lower(): n for n in names}
    for preferred in _ODBC_DRIVER_PRIORITY:
        hit = lower_map.get(preferred.lower())
        if hit:
            return hit
    # 回退：任意 "ODBC Driver N for SQL Server"，取版本号最大者
    import re
    candidates = []
    for n in names:
        low = n.lower()
        if low == 'sql server':
            continue
        if 'odbc driver' in low and 'sql server' in low:
            m = re.search(r'(\d+)', n)
            ver = int(m.group(1)) if m else 0
            candidates.append((ver, n))
    if candidates:
        candidates.sort(key=lambda x: x[0], reverse=True)
        return candidates[0][1]
    # 最后才考虑 Native Client（已含在优先级里）；绝不返回 DBNETLIB
    for n in names:
        if 'native client' in n.lower() and 'sql' in n.lower():
            return n
    return None


def _detect_odbc_driver() -> str:
    """检测系统上可用的 SQL Server ODBC 驱动（结果缓存，只检测一次）"""
    global _detected_odbc_driver
    if _detected_odbc_driver is not None:
        return _detected_odbc_driver

    # 方法1: pyodbc 直接列出驱动（最可靠）
    try:
        import pyodbc
        available = pyodbc.drivers()
        logger.info(f"pyodbc 可用驱动: {available}")
        picked = _pick_odbc_driver(available)
        if picked:
            _detected_odbc_driver = picked
            logger.info(f"检测到 ODBC 驱动: {picked}")
            return _detected_odbc_driver
    except Exception as e:
        logger.debug(f"pyodbc.drivers() 失败: {e}")

    # 方法2: winreg 读注册表
    try:
        import winreg
        base_key = winreg.OpenKey(winreg.HKEY_LOCAL_MACHINE, r"SOFTWARE\ODBC\ODBCINST.INI")
        i = 0
        drivers = []
        while True:
            try:
                name = winreg.EnumKey(base_key, i)
                drivers.append(name)
                i += 1
            except OSError:
                break
        winreg.CloseKey(base_key)
        logger.info(f"注册表 ODBC 驱动列表: {drivers}")
        picked = _pick_odbc_driver(drivers)
        if picked:
            _detected_odbc_driver = picked
            logger.info(f"检测到 ODBC 驱动: {picked}")
            return _detected_odbc_driver
    except Exception as e:
        logger.debug(f"winreg 检测 ODBC 驱动失败: {e}")

    _detected_odbc_driver = 'ODBC Driver 17 for SQL Server'
    logger.warning(f"未检测到可用的 SQL Server ODBC 驱动，使用默认值: {_detected_odbc_driver}")
    return _detected_odbc_driver


def build_connection_string(config: Dict[str, Any]) -> str:
    """Build SQLAlchemy URL for SQL Server via pyodbc.

    使用 odbc_connect 显式拼 ODBC 串，避免把 server 塞进 URL host
    导致 %5C/%2C 未还原（命名实例+端口会退化成命名管道连接失败）。
    """
    server = (config.get('server') or '').strip()
    database = (config.get('database') or '').strip()
    username = (config.get('username') or '').strip()
    password = config.get('password') or ''
    driver = config.get('driver', 'pymssql')
    try:
        timeout = int(config.get('timeout', 30) or 30)
    except (TypeError, ValueError):
        timeout = 30

    # 当 driver 为 "odbc" 时，自动检测系统 ODBC 驱动
    if driver == 'odbc':
        driver = _detect_odbc_driver()
        logger.info(f"自动检测 ODBC 驱动: {driver}")

    # ODBC 花括号转义：} → }}
    driver_token = '{' + str(driver).replace('}', '}}') + '}'

    # server 保持原样（支持 host / host,port / host\\instance / host\\instance,port）
    parts = [
        f'DRIVER={driver_token}',
        f'SERVER={server}',
        f'DATABASE={database}',
        f'Connection Timeout={timeout}',
        'TrustServerCertificate=yes',
    ]
    if config.get('auth_type') == 'windows':
        parts.append('Trusted_Connection=yes')
    else:
        parts.append(f'UID={username}')
        parts.append(f'PWD={password}')

    odbc_connect = ';'.join(parts)
    return 'mssql+pyodbc:///?odbc_connect=' + urllib.parse.quote_plus(odbc_connect)
