from dataclasses import asdict
from typing import Optional
from fastapi import APIRouter, HTTPException, Query
import numpy as np
import time
from backend.app.engine.spc.control_charts import IMRControlChart
from backend.app.engine.spc.rules import NelsonRules
from backend.app.engine.spc.capability import ProcessCapability
from backend.app.api.config import _get_merged_spec_limits

router = APIRouter(tags=["SPC"])

storage = None
collector = None


class _TTLCache:
    def __init__(self, ttl: int = 300):
        self._store: dict[str, tuple[float, object]] = {}
        self._ttl = ttl

    def get(self, key: str):
        entry = self._store.get(key)
        if entry and time.time() - entry[0] < self._ttl:
            return entry[1]
        self._store.pop(key, None)
        return None

    def set(self, key: str, value):
        if len(self._store) > 100:
            now = time.time()
            self._store = {k: v for k, v in self._store.items() if now - v[0] < self._ttl}
        self._store[key] = (time.time(), value)

_cache = _TTLCache(ttl=300)

@router.get("/spc/{product_code}/{indicator_code}")
def get_spc_data(
    product_code: str,
    indicator_code: str,
    window: int = 30,
    date_from: Optional[str] = Query(None),
    date_to: Optional[str] = Query(None),
    remark: Optional[str] = Query(None),
    mode: str = Query("process", description="分析模式: process=过程分析, stability=稳定性分析"),
):
    is_stability = mode == "stability"
    has_filter = date_from or date_to or remark

    cache_key = f"spc:{product_code}:{indicator_code}:{window}:{date_from}:{date_to}:{remark}:{mode}"
    cached = _cache.get(cache_key)
    if cached:
        return cached

    if is_stability:
        # 稳定性模式: 只看被排除的备注(基准样/稳定样)
        incl_keywords = storage._excluded_remarks
        data = storage.get_filtered_data(
            indicator_code=indicator_code,
            product_code=product_code,
            date_from=date_from,
            date_to=date_to,
            limit=500,
            exclude_remarks=None,
        )
        if incl_keywords:
            data = [d for d in data if any(kw in (d.get('remark') or '') for kw in incl_keywords)]
        data = data[-window:]
    else:
        # 过程模式: 排除基准样
        excl = None if remark else storage._excluded_remarks
        if has_filter:
            data = storage.get_filtered_data(
                indicator_code=indicator_code,
                product_code=product_code,
                date_from=date_from,
                date_to=date_to,
                remark=remark,
                limit=500,
                exclude_remarks=excl,
            )
        else:
            data = storage.get_recent_data(
                indicator_code=indicator_code,
                product_code=product_code,
                limit=window,
                exclude_remarks=excl,
            )

    if len(data) < 2:
        product_specs = _get_merged_spec_limits(product_code)
        indicator_spec = product_specs.get(indicator_code, {})
        return {
            "product_code": product_code,
            "indicator_code": indicator_code,
            "i_chart": {"cl": 0, "ucl": 0, "lcl": 0},
            "mr_chart": {"cl": 0, "ucl": 0, "lcl": 0},
            "spec_limits": {
                "usl": indicator_spec.get("usl"),
                "lsl": indicator_spec.get("lsl"),
                "mean": 0,
                "std": 0,
            },
            "sigma": 0,
            "data_points": [],
            "violations": [],
        }

    # Reverse to chronological order (oldest first)
    data = list(reversed(data))

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
            "sample_id": data[i].get('sample_id'),
            "remark": data[i].get('remark'),
        })

    mean = float(np.mean(values))
    std = float(np.std(values, ddof=1))

    # Read actual spec limits from config (per-product)
    product_specs = _get_merged_spec_limits(product_code)
    indicator_spec = product_specs.get(indicator_code, {})
    spec_usl = indicator_spec.get('usl')
    spec_lsl = indicator_spec.get('lsl')

    result_data = {
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
            "usl": round(spec_usl, 4) if spec_usl is not None else None,
            "lsl": round(spec_lsl, 4) if spec_lsl is not None else None,
            "mean": round(mean, 4),
            "std": round(std, 4),
        },
        "sigma": round(result['sigma_estimate'], 4),
        "data_points": data_points,
        "violations": [asdict(v) for v in violations],
        "analysis_mode": mode,
    }
    _cache.set(cache_key, result_data)
    return result_data

@router.get("/capability/{product_code}/{indicator_code}")
def get_cpk_data(
    product_code: str,
    indicator_code: str,
    window: int = 30,
    date_from: Optional[str] = Query(None),
    date_to: Optional[str] = Query(None),
    remark: Optional[str] = Query(None),
):
    cache_key = f"cap:{product_code}:{indicator_code}:{window}:{date_from}:{date_to}:{remark}"
    cached = _cache.get(cache_key)
    if cached:
        return cached

    has_filter = date_from or date_to or remark
    excl = None if remark else storage._excluded_remarks
    if has_filter:
        data = storage.get_filtered_data(
            indicator_code=indicator_code,
            product_code=product_code,
            date_from=date_from,
            date_to=date_to,
            remark=remark,
            limit=500,
            exclude_remarks=excl,
        )
    else:
        data = storage.get_recent_data(
            indicator_code=indicator_code,
            product_code=product_code,
            limit=window,
            exclude_remarks=excl,
        )

    if len(data) < 5:
        spec_limits_cfg = collector.get_spec_limits(product_code=product_code).get(indicator_code, {})
        return {
            "product_code": product_code,
            "indicator_code": indicator_code,
            "spec_limits": spec_limits_cfg,
            "result": {
                "cp": 0, "cpk": 0, "pp": 0, "ppk": 0,
                "ca": 0, "sigma_level": 0, "defect_rate_ppm": 0,
            },
            "cpk_history": [],
        }
    
    values = np.array([d['value'] for d in data], dtype=float)
    spec_limits = collector.get_spec_limits(product_code=product_code).get(indicator_code, {})
    
    if spec_limits.get('lsl') is None and spec_limits.get('usl') is None:
        raise HTTPException(status_code=400, detail="未配置规格限")
    
    capability = ProcessCapability()

    has_lsl = spec_limits.get('lsl') is not None
    has_usl = spec_limits.get('usl') is not None
    if has_lsl and has_usl:
        result = capability.analyze(values, spec_limits['lsl'], spec_limits['usl'])
    elif has_usl:
        result = capability.analyze_one_sided(values, spec_limits['usl'], 'upper')
    else:
        result = capability.analyze_one_sided(values, spec_limits['lsl'], 'lower')

    # Compute sliding window Cpk trend (adaptive window for enough trend points)
    cpk_history = []
    n = len(values)
    if n >= 20:
        # Use smaller analysis window to produce >= 6 trend points
        win = max(10, n // 6)
        step = max(1, (n - win) // 5)
        timestamps = [d['sample_time'] for d in data]
        for start in range(0, n - win + 1, step):
            w = values[start:start + win]
            w_mean = float(np.mean(w))
            w_sigma = float(np.std(w, ddof=1))
            if w_sigma > 0 and has_lsl and has_usl:
                cpk_val = min((spec_limits['usl'] - w_mean) / (3 * w_sigma), (w_mean - spec_limits['lsl']) / (3 * w_sigma))
            elif w_sigma > 0 and has_usl:
                cpk_val = (spec_limits['usl'] - w_mean) / (3 * w_sigma)
            elif w_sigma > 0 and has_lsl:
                cpk_val = (w_mean - spec_limits['lsl']) / (3 * w_sigma)
            else:
                continue
            cpk_history.append({
                "time": timestamps[start + win - 1] if start + win - 1 < len(timestamps) else "",
                "value": round(cpk_val, 4),
            })

    resp = {
        "product_code": product_code,
        "indicator_code": indicator_code,
        "spec_limits": spec_limits,
        "result": result.to_dict(),
        "cpk_history": cpk_history,
    }
    _cache.set(cache_key, resp)
    return resp
