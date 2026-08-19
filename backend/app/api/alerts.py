from fastapi import APIRouter, Query
from typing import Optional

router = APIRouter(prefix="/alerts", tags=["预警"])

storage = None

@router.get("")
async def get_alerts(
    severity: Optional[str] = None,
    status: Optional[str] = None,
    limit: int = Query(50, le=200),
):
    alerts = storage.get_alerts(severity=severity, status=status, limit=limit)
    return {"alerts": alerts}

@router.post("/{alert_id}/resolve")
async def resolve_alert(alert_id: str, resolved_by: str = "user", note: Optional[str] = None):
    storage.resolve_alert(alert_id, resolved_by, note)
    return {"status": "resolved", "alert_id": alert_id}
