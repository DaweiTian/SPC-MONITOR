from fastapi import APIRouter, HTTPException
import numpy as np
from backend.app.engine.spc.control_charts import IMRControlChart
from backend.app.engine.spc.rules import NelsonRules
from backend.app.engine.spc.capability import ProcessCapability

router = APIRouter(tags=["SPC"])

storage = None
collector = None

@router.get("/spc/{product_code}/{indicator_code}")
async def get_spc_data(product_code: str, indicator_code: str, window: int = 30):
    data = storage.get_recent_data(
        indicator_code=indicator_code,
        product_code=product_code,
        limit=window,
    )
    
    if len(data) < 2:
        raise HTTPException(status_code=404, detail="数据不足")
    
    values = np.array([d['value'] for d in data], dtype=float)
    timestamps = [d['sample_time'] for d in data]
    
    chart = IMRControlChart()
    result = chart.calculate(values)
    
    rules = NelsonRules()
    violations = rules.check_all(values, result['i_chart'].cl, result['sigma_estimate'])
    
    violation_indices = set()
    for v in violations:
        violation_indices.update(v.violation_points)
    
    data_points = []
    for i, (ts, val) in enumerate(zip(timestamps, values)):
        data_points.append({
            "time": ts,
            "value": round(float(val), 4),
            "is_violation": i in violation_indices,
        })
    
    mean = float(np.mean(values))
    std = float(np.std(values, ddof=1))
    spec_usl = round(mean + 3 * std, 4)
    spec_lsl = round(mean - 3 * std, 4)
    
    return {
        "product_code": product_code,
        "indicator_code": indicator_code,
        "i_chart": {
            "cl": round(result['i_chart'].cl, 4),
            "ucl": round(result['i_chart'].ucl, 4),
            "lcl": round(result['i_chart'].lcl, 4),
        },
        "mr_chart": {
            "cl": round(result['mr_chart'].cl, 4),
            "ucl": round(result['mr_chart'].ucl, 4),
            "lcl": round(result['mr_chart'].lcl, 4),
        },
        "spec_limits": {
            "usl": spec_usl,
            "lsl": spec_lsl,
            "mean": round(mean, 4),
            "std": round(std, 4),
        },
        "sigma": round(result['sigma_estimate'], 4),
        "data_points": data_points,
        "violations": [v.to_dict() for v in violations],
    }

@router.get("/capability/{product_code}/{indicator_code}")
async def get_cpk_data(product_code: str, indicator_code: str, window: int = 30):
    data = storage.get_recent_data(
        indicator_code=indicator_code,
        product_code=product_code,
        limit=window,
    )
    
    if len(data) < 5:
        raise HTTPException(status_code=404, detail="数据不足（至少需要5个数据点）")
    
    values = np.array([d['value'] for d in data], dtype=float)
    spec_limits = collector.get_spec_limits().get(indicator_code, {})
    
    if not spec_limits.get('lsl') and not spec_limits.get('usl'):
        raise HTTPException(status_code=400, detail="未配置规格限")
    
    capability = ProcessCapability()
    
    if spec_limits.get('lsl') and spec_limits.get('usl'):
        result = capability.analyze(values, spec_limits['lsl'], spec_limits['usl'])
    elif spec_limits.get('usl'):
        result = capability.analyze_one_sided(values, spec_limits['usl'], 'upper')
    else:
        result = capability.analyze_one_sided(values, spec_limits['lsl'], 'lower')
    
    return {
        "product_code": product_code,
        "indicator_code": indicator_code,
        "spec_limits": spec_limits,
        "result": result.to_dict(),
    }
