from fastapi import APIRouter, HTTPException, Query
from typing import Optional
from datetime import datetime

router = APIRouter(prefix="/monitor", tags=["监控"])

# 全局实例（将在 main.py 中初始化）
storage = None
scheduler = None
collector = None

@router.get("/dashboard")
def get_dashboard():
    if scheduler and not scheduler.scheduler.running:
        scheduler.start()
    
    today_stats = storage.get_today_stats()
    pending_alerts = storage.get_alerts(status='pending', limit=100).get('alerts', [])
    recent_alerts = storage.get_alerts(limit=5).get('alerts', [])
    
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
        "collecting": scheduler.scheduler.running if scheduler else False,
    }

@router.get("/status")
def get_status():
    status = scheduler.get_status() if scheduler else {}
    # Include connection status from source_status
    from backend.app.api.config import _source_status
    status["connected"] = _source_status.get("connected", False)
    status["source"] = _source_status.get("source", "mock")
    status["instrument_type"] = _source_status.get("instrument_type", "mock")
    return status

@router.post("/collect/manual")
def manual_collect():
    result = scheduler.trigger_manual() if scheduler else {"status": "no_scheduler"}
    return result

@router.get("/widget_spc")
def get_widget_spc():
    """小组件用的 SPC 数据（自动选取最近有数据的指标）"""
    if not storage or not collector:
        return {"spc_points": [], "spc_mean": 0, "spc_ucl": 0, "spc_lcl": 0}

    try:
        products = collector.get_products()
        indicators = collector.get_indicators()

        for product in products[:3]:
            for indicator in indicators[:10]:
                data = storage.get_recent_data(
                    indicator_code=indicator['code'],
                    product_code=product['code'],
                    limit=20,
                )
                if len(data) >= 5:
                    import numpy as np
                    values = np.array([d['value'] for d in data], dtype=float)
                    mean = float(np.mean(values))
                    std = float(np.std(values, ddof=1)) if len(values) > 1 else 1.0
                    return {
                        "spc_points": [round(float(v), 4) for v in values],
                        "spc_mean": round(mean, 4),
                        "spc_ucl": round(mean + 3 * std, 4),
                        "spc_lcl": round(mean - 3 * std, 4),
                    }
    except Exception as e:
        logger.warning(f"Widget SPC 数据获取失败: {e}")

    return {"spc_points": [], "spc_mean": 0, "spc_ucl": 0, "spc_lcl": 0}

@router.get("/products")
def get_products():
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

@router.get("/products/{product_code}/indicator-count")
def get_product_indicator_count(product_code: str):
    count = storage.get_product_indicator_count(product_code)
    return {"count": count}

@router.get("/products/{product_code}/indicator-codes")
def get_product_indicator_codes(product_code: str):
    codes = storage.get_product_indicator_codes(product_code)
    return {"codes": codes}

@router.post("/products/snapshot-indicators")
def snapshot_product_indicators():
    """初始化时扫描数据库，保存每个品项有数据的指标编码（一次性操作）"""
    mapping = storage.get_all_product_indicator_codes()
    from backend.app.api.config import _save_json_config
    _save_json_config("product_indicators.json", mapping)
    return {"success": True, "count": len(mapping), "mapping": mapping}

@router.get("/products/saved-indicators")
def get_saved_indicators():
    """读取已保存的品项指标配置"""
    from backend.app.api.config import _load_json_config
    return _load_json_config("product_indicators.json", {})

@router.put("/products/saved-indicators/{product_code}")
def update_saved_indicators(product_code: str, body: dict):
    """更新单个品项的指标编码列表"""
    codes = body.get("codes", [])
    from backend.app.api.config import _load_json_config, _save_json_config
    mapping = _load_json_config("product_indicators.json", {})
    if codes:
        mapping[product_code] = codes
    else:
        mapping.pop(product_code, None)
    _save_json_config("product_indicators.json", mapping)
    return {"success": True}

@router.get("/indicators")
def get_indicators():
    return {"indicators": collector.get_indicators() if collector else []}

@router.get("/data/recent")
def get_recent_data(
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
