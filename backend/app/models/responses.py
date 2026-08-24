from pydantic import BaseModel
from typing import Optional

class ErrorResponse(BaseModel):
    success: bool = False
    error: str
    detail: Optional[str] = None

class SuccessResponse(BaseModel):
    success: bool = True
    message: Optional[str] = None
    data: dict | list | None = None
