import os
import logging
from fastapi import Security, HTTPException, status
from fastapi.security import APIKeyHeader

logger = logging.getLogger(__name__)

# Default key matches the frontend DEFAULT_API_KEY for local/desktop usage.
# Production deployments MUST set FT1_API_KEY environment variable.
FT1_API_KEY = os.environ.get("FT1_API_KEY", "ft1-monitor-default-key")
if FT1_API_KEY == "ft1-monitor-default-key":
    logger.warning(
        "Using default API key. Set FT1_API_KEY environment variable for production deployments."
    )

api_key_header = APIKeyHeader(name="X-API-Key", auto_error=False)


async def verify_api_key(api_key: str = Security(api_key_header)) -> str:
    """Verify the X-API-Key header against the configured API key.

    Returns the validated key string on success.
    Raises 401 Unauthorized if the key is missing or does not match.
    """
    if api_key is None:
        raise HTTPException(
            status_code=status.HTTP_401_UNAUTHORIZED,
            detail="Missing API key. Provide X-API-Key header.",
        )
    if api_key != FT1_API_KEY:
        raise HTTPException(
            status_code=status.HTTP_401_UNAUTHORIZED,
            detail="Invalid API key.",
        )
    return api_key
