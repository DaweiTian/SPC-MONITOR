from fastapi import APIRouter, HTTPException, Query
from typing import Optional
from datetime import datetime

router = APIRouter(prefix="/monitor", tags=["监控"])

# 全局实例（将在 main.py 中初始化）
storage = None
scheduler = None
collector = None

@router.get("/dashboard")
async def get_dashboard():
    if scheduler and not scheduler.scheduler.running:
        scheduler.start()
    
    today_stats = storage.get_today_stats()
    pending_alerts = storage.get_alerts(status='pending', limit=100)
    recent_alerts = storage.get_alerts(status='pending', limit=5)
    
    alerts_by_severity = {'CRITICAL': 0, 'WARNING': 0, 'INFO': 0}
    for alert in pending_alerts:
        severity = alert.get('severity', 'INFO')
        if severity in alerts_by_severity:
            alerts_by_severity[severity] += 1
    
    return {
        "today_data_count": today_stats['data_count'],
        "today_sync_count": today_stats['sync_count'],
        "today_collect_attempts": today_stats.get('collect_attempts', 0),
        "today_collect_success": today_stats.get('collect_success', 0),
        "today_unqualified_count": today_stats['unqualified_count'],
        "pending_alerts": alerts_by_severity,
        "recent_alerts": recent_alerts,
    }

@router.get("/status")
async def get_status():
    status = scheduler.get_status() if scheduler else {}
    # Include connection status from source_status
    from backend.app.api.config import _source_status
    status["connected"] = _source_status.get("connected", False)
    status["source"] = _source_status.get("source", "mock")
    status["instrument_type"] = _source_status.get("instrument_type", "mock")
    return status

@router.post("/collect/manual")
async def manual_collect():
    result = scheduler.trigger_manual() if scheduler else {"status": "no_scheduler"}
    return result

@router.get("/products")
async def get_products():
    if not collector:
        return {"products": []}
    
    # Get products from collector
    all_products = collector.get_products()
    
    # If MDB collector, limit to products that have data in database
    if hasattr(collector, 'mdb_path'):  # MDB collector
        try:
            # Get products that have data in database
            db_products = storage.get_products_with_data(limit=100)
            if db_products:
                # Filter collector products to only include those with data
                db_product_codes = {p['product_code'] for p in db_products}
                seen = set()
                filtered = []
                for p in all_products:
                    if p['code'] in db_product_codes and p['code'] not in seen:
                        seen.add(p['code'])
                        filtered.append(p)
                    if len(filtered) >= 50:
                        break
                return {"products": filtered}
        except Exception:
            pass
    
    # Deduplicate and limit
    seen = set()
    unique = []
    for p in all_products:
        if p['code'] not in seen:
            seen.add(p['code'])
            unique.append(p)
        if len(unique) >= 50:
            break
    return {"products": unique}

@router.get("/indicators")
async def get_indicators():
    return {"indicators": collector.get_indicators() if collector else []}

@router.get("/data/recent")
async def get_recent_data(
    indicator_code: str = Query(...),
    product_code: str = Query(...),
    limit: int = Query(100, le=500),
):
    data = storage.get_recent_data(
        indicator_code=indicator_code,
        product_code=product_code,
        limit=limit,
    )
    return {"data": data}
