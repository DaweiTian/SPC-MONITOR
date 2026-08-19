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
    scheduler.start() if scheduler else None
    
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
        "pending_alerts": alerts_by_severity,
        "recent_alerts": recent_alerts,
    }

@router.get("/status")
async def get_status():
    return scheduler.get_status() if scheduler else {}

@router.post("/collect/manual")
async def manual_collect():
    result = scheduler.trigger_manual() if scheduler else {"status": "no_scheduler"}
    return result

@router.get("/products")
async def get_products():
    return {"products": collector.get_products() if collector else []}

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
