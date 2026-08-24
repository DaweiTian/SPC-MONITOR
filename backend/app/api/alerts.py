from fastapi import APIRouter, Query
from typing import Optional

router = APIRouter(prefix="/alerts", tags=["预警"])

storage = None

@router.get("")
def get_alerts(
    severity: Optional[str] = None,
    status: Optional[str] = None,
    product_code: Optional[str] = None,
    search: Optional[str] = None,
    page: int = Query(1, ge=1),
    page_size: int = Query(20, ge=1, le=500),
):
    offset = (page - 1) * page_size
    result = storage.get_alerts(
        severity=severity,
        status=status,
        product_code=product_code,
        search=search,
        limit=page_size,
        offset=offset,
    )
    return {
        "alerts": result["alerts"],
        "total": result["total"],
        "page": page,
        "page_size": page_size,
    }

@router.get("/count")
def get_alert_count():
    """Return pending alert counts by severity — uncapped."""
    counts = storage.count_pending_alerts()
    return counts

@router.get("/products")
def get_alert_products():
    """Return distinct product_codes that have alerts."""
    products = storage.get_distinct_alert_products()
    return {"products": products}

@router.post("/{alert_id}/resolve")
def resolve_alert(alert_id: str, body: dict = None):
    resolved_by = "user"
    note = ""
    action = "confirm"
    if body:
        resolved_by = body.get("resolved_by", "user")
        note = body.get("note", "")
        action = body.get("action", "confirm")

    if action == "void_data":
        voided = storage.resolve_alert_and_void(alert_id, resolved_by, note)
        if voided:
            return {"status": "resolved", "alert_id": alert_id, "action": "void_data"}
        return {"status": "not_found", "alert_id": alert_id}

    ok = storage.resolve_alert(alert_id, resolved_by, note)
    if ok:
        return {"status": "resolved", "alert_id": alert_id}
    return {"status": "not_found", "alert_id": alert_id}

@router.post("/batch-resolve")
def batch_resolve_alerts(body: dict):
    alert_ids = body.get("alert_ids", [])
    resolved_by = body.get("resolved_by", "user")
    note = body.get("note", "")
    action = body.get("action", "confirm")
    resolved = 0
    for aid in alert_ids:
        if action == "void_data":
            if storage.resolve_alert_and_void(aid, resolved_by, note):
                resolved += 1
        else:
            if storage.resolve_alert(aid, resolved_by, note):
                resolved += 1
    return {"status": "done", "resolved": resolved, "total": len(alert_ids)}
