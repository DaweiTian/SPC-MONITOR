from fastapi import APIRouter, Query
from typing import Optional

from backend.app.core.config import get_conf_path

router = APIRouter(prefix="/alerts", tags=["预警"])

storage = None


def _hidden_product_codes() -> set[str]:
    """品项管理中停用，或取消全部指标勾选的品项编码。"""
    from backend.app.api.config import _load_json_config
    hidden: set[str] = set()
    try:
        status = _load_json_config(get_conf_path("product_status.json"), {}) or {}
        for code, st in status.items():
            if st == "disabled":
                hidden.add(code)
        saved = _load_json_config(get_conf_path("product_indicators.json"), {}) or {}
        for code, inds in saved.items():
            if isinstance(inds, list) and len(inds) == 0:
                hidden.add(code)
    except Exception:
        return set()
    return hidden


@router.get("")
def get_alerts(
    severity: Optional[str] = None,
    status: Optional[str] = None,
    product_code: Optional[str] = None,
    rule_type: Optional[str] = None,
    search: Optional[str] = None,
    date_from: Optional[str] = None,
    date_to: Optional[str] = None,
    page: int = Query(1, ge=1),
    page_size: int = Query(20, ge=1, le=500),
):
    offset = (page - 1) * page_size
    result = storage.get_alerts(
        severity=severity,
        status=status,
        product_code=product_code,
        rule_type=rule_type,
        search=search,
        date_from=date_from,
        date_to=date_to,
        limit=page_size,
        offset=offset,
        exclude_product_codes=_hidden_product_codes(),
    )
    return {
        "alerts": result["alerts"],
        "total": result["total"],
        "page": page,
        "page_size": page_size,
    }

@router.get("/count")
def get_alert_count():
    """Return pending alert counts by severity — uncapped, excluding hidden products."""
    counts = storage.count_pending_alerts(exclude_product_codes=_hidden_product_codes())
    return counts

@router.get("/products")
def get_alert_products():
    """Return distinct product_codes that have alerts (visible products only)."""
    products = storage.get_distinct_alert_products(exclude_product_codes=_hidden_product_codes())
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
