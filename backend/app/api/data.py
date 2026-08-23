from fastapi import APIRouter, Query
from fastapi.responses import StreamingResponse
import csv
import io

router = APIRouter(prefix="/data", tags=["data"])
storage = None


@router.get("/list")
def list_data(
    page: int = Query(1, ge=1),
    page_size: int = Query(20, ge=1, le=100),
    date: str = Query(None),
    product_code: str = Query(None),
    indicator_code: str = Query(None),
):
    return storage.get_all_data(
        page=page,
        page_size=page_size,
        date=date,
        product_code=product_code,
        indicator_code=indicator_code,
    )


@router.put("/correction/{record_id}")
def update_correction(record_id: int, body: dict):
    """更新单条记录的修正值"""
    correction = body.get("correction", 0)
    try:
        correction = round(float(correction), 4)
    except (ValueError, TypeError):
        return {"success": False, "message": "无效的修正值"}

    success = storage.update_correction(record_id, correction)
    if success:
        return {"success": True, "message": "修正值已更新"}
    return {"success": False, "message": "更新失败，记录不存在"}


@router.put("/record/{record_id}")
def update_record(record_id: int, body: dict):
    """更新单条记录的单位和规格限"""
    success = storage.update_record_fields(record_id, body)
    if success:
        return {"success": True, "message": "记录已更新"}
    return {"success": False, "message": "更新失败，记录不存在或无有效字段"}


@router.get("/export")
def export_data(
    format: str = Query("csv"),
    product: str = Query(None),
    indicator: str = Query(None),
):
    data = storage.get_recent_data(indicator_code=indicator, product_code=product, limit=10000)
    if not data:
        return {"success": False, "message": "No data"}

    if format == "csv":
        output = io.StringIO()
        writer = csv.DictWriter(output, fieldnames=data[0].keys())
        writer.writeheader()
        writer.writerows(data)
        output.seek(0)
        return StreamingResponse(
            iter([output.getvalue()]),
            media_type="text/csv",
            headers={"Content-Disposition": "attachment; filename=export.csv"},
        )
    return {"success": False, "message": "Unsupported format"}
