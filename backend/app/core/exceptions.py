from fastapi import HTTPException, Request
from fastapi.responses import JSONResponse
import logging

logger = logging.getLogger(__name__)

class AppException(HTTPException):
    def __init__(self, status_code: int, error: str, detail: str | None = None):
        super().__init__(status_code=status_code, detail=error)
        self.error = error
        self.detail = detail

async def app_exception_handler(request: Request, exc: AppException):
    return JSONResponse(
        status_code=exc.status_code,
        content={"success": False, "error": exc.error, "detail": exc.detail}
    )

async def generic_exception_handler(request: Request, exc: Exception):
    logger.exception(f"Unhandled exception: {exc}")
    return JSONResponse(
        status_code=500,
        content={"success": False, "error": "服务器内部错误", "detail": None}
    )
