import hashlib
import hmac
import logging
import os
import time

from fastapi import Request, Security, HTTPException, status
from fastapi.security import APIKeyHeader

logger = logging.getLogger(__name__)

# Default key matches the frontend DEFAULT_API_KEY for local/desktop usage.
# Production deployments MUST set FT1_API_KEY environment variable.
DEFAULT_API_KEY = "ft1-monitor-default-key"
FT1_API_KEY = os.environ.get("FT1_API_KEY", DEFAULT_API_KEY)
if FT1_API_KEY == DEFAULT_API_KEY:
    logger.warning(
        "Using default API key. Set FT1_API_KEY environment variable for production deployments."
    )

api_key_header = APIKeyHeader(name="X-API-Key", auto_error=False)

SESSION_TOKEN_TTL_SECONDS = 12 * 3600
_SESSION_PREFIX = "ft1sess."


def _is_loopback(request: Request) -> bool:
    client_host = request.client.host if request.client else ""
    return client_host in ("127.0.0.1", "::1", "localhost")


def _sign(shared_password: str, exp: int) -> str:
    msg = f"ft1sess:{exp}".encode()
    return hmac.new(shared_password.encode("utf-8"), msg, hashlib.sha256).hexdigest()[:32]


def issue_session_token(shared_password: str) -> str:
    """签发基于共享密码的短时会话 token（供远程客户端作 API Key）。"""
    if not shared_password:
        return ""
    exp = int(time.time()) + SESSION_TOKEN_TTL_SECONDS
    return f"{_SESSION_PREFIX}{exp}.{_sign(shared_password, exp)}"


def _is_valid_session_token(token: str, shared_password: str) -> bool:
    if not shared_password or not token.startswith(_SESSION_PREFIX):
        return False
    body = token[len(_SESSION_PREFIX):]
    if "." not in body:
        return False
    exp_str, sig = body.split(".", 1)
    try:
        exp = int(exp_str)
    except ValueError:
        return False
    if exp < int(time.time()):
        return False
    return hmac.compare_digest(sig, _sign(shared_password, exp))


def _get_shared_password() -> str:
    try:
        from backend.app.core.config import get_server_config
        return get_server_config().get("shared_password", "") or ""
    except Exception:
        return ""


async def verify_api_key(request: Request, api_key: str = Security(api_key_header)) -> str:
    """Verify the X-API-Key header.

    - 本机：接受配置 Key、默认 Key、会话 token
    - 远程：拒绝公开默认 Key；接受配置 Key 或有效会话 token
    """
    if api_key is None:
        raise HTTPException(
            status_code=status.HTTP_401_UNAUTHORIZED,
            detail="Missing API key. Provide X-API-Key header.",
        )

    shared_password = _get_shared_password()
    if _is_valid_session_token(api_key, shared_password):
        return api_key

    if api_key == FT1_API_KEY and api_key != DEFAULT_API_KEY:
        return api_key

    if api_key == DEFAULT_API_KEY:
        if _is_loopback(request):
            return api_key
        raise HTTPException(
            status_code=status.HTTP_401_UNAUTHORIZED,
            detail="Default API key is not allowed from remote clients.",
        )

    raise HTTPException(
        status_code=status.HTTP_401_UNAUTHORIZED,
        detail="Invalid API key.",
    )
