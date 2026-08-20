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
