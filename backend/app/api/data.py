from fastapi import APIRouter, Query
from fastapi.responses import StreamingResponse
import csv
import io

router = APIRouter(prefix="/data", tags=["data"])
storage = None


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
