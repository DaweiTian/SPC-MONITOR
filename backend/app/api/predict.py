from fastapi import APIRouter, Query
import numpy as np
import json
import asyncio
import logging

from backend.app.core.cache import TTLCache
from backend.app.core.config import get_conf_path

logger = logging.getLogger(__name__)


def _lazy_import_statsmodels():
    """Lazy import to avoid Nuitka docstring parsing bug at startup."""
    from statsmodels.tsa.holtwinters import ExponentialSmoothing
    from statsmodels.tsa.arima.model import ARIMA
    from statsmodels.tsa.stattools import adfuller
    return ExponentialSmoothing, ARIMA, adfuller


router = APIRouter(prefix="/predict", tags=["prediction"])

storage = None  # injected from main.py

SPEC_LIMITS_FILE = get_conf_path("spec_limits.json")


def _sanitize(obj):
    """Replace NaN/inf floats with None for JSON serialization."""
    if isinstance(obj, float):
        if np.isnan(obj) or np.isinf(obj):
            return None
        return obj
    if isinstance(obj, dict):
        return {k: _sanitize(v) for k, v in obj.items()}
    if isinstance(obj, list):
        return [_sanitize(v) for v in obj]
    return obj


_cache = TTLCache(ttl=300)


def _get_data(indicator: str, product: str, limit: int = 200):
    """Fetch recent data with excluded remarks filter (same as SPC)."""
    excl = getattr(storage, '_excluded_remarks', None) or None
    return storage.get_recent_data(
        indicator_code=indicator, product_code=product,
        limit=limit, exclude_remarks=excl,
    )


# ---------------------------------------------------------------------------
# P0: Evaluation helpers
# ---------------------------------------------------------------------------

def _naive_forecast(values: np.ndarray, horizon: int):
    """Repeat last observation for `horizon` steps."""
    last = float(values[-1])
    return [last] * horizon


def _calc_mase(actual: np.ndarray, predicted: np.ndarray) -> float:
    """MASE = MAE_model / MAE_naive.  <1 means model beats naive."""
    n = len(actual)
    naive_pred = np.concatenate([[actual[0]], actual[:-1]])
    mae_naive = float(np.mean(np.abs(actual - naive_pred)))
    if mae_naive == 0:
        return 0.0
    mae_model = float(np.mean(np.abs(actual - predicted)))
    return round(mae_model / mae_naive, 4)


def _calc_direction_accuracy(actual: np.ndarray, predicted: np.ndarray) -> float:
    """Percentage of correct up/down predictions."""
    if len(actual) < 2:
        return 0.0
    actual_dir = np.diff(actual) >= 0
    pred_dir = np.diff(predicted) >= 0
    correct = np.sum(actual_dir == pred_dir)
    return round(float(correct / len(actual_dir)) * 100, 4)


def _calc_accuracy(actual: np.ndarray, predicted: np.ndarray) -> dict:
    """Calculate accuracy metrics: MAPE, RMSE, MAE, MASE, direction accuracy."""
    errors = actual - predicted
    abs_errors = np.abs(errors)

    mae = float(np.mean(abs_errors))
    rmse = float(np.sqrt(np.mean(errors ** 2)))

    # MAPE — guard against zero denominators
    nonzero = actual != 0
    if nonzero.any():
        mape = float(np.mean(np.abs(errors[nonzero] / actual[nonzero])) * 100)
    else:
        mape = None

    mase = _calc_mase(actual, predicted)
    direction_acc = _calc_direction_accuracy(actual, predicted)

    return {
        "mape": round(mape, 4) if mape is not None else None,
        "rmse": round(rmse, 4),
        "mae": round(mae, 4),
        "mase": mase,
        "direction_acc": direction_acc,
    }


# ---------------------------------------------------------------------------
# P0.5: Breach probability helpers
# ---------------------------------------------------------------------------

def _calc_breach_prob(mean: float, std: float, usl: float | None, lsl: float | None):
    """Return (max_prob, direction) using scipy.stats.norm.

    If the predicted mean is already beyond a spec limit, return a high
    breach probability (>= 0.95) regardless of std — including std == 0.
    Only when mean is within specs does the Gaussian tail depend on std;
    std == 0 then means low risk.
    """
    from scipy.stats import norm

    # Mean already out of spec → high breach probability
    if usl is not None and mean >= usl:
        return 0.99, "upper"
    if lsl is not None and mean <= lsl:
        return 0.99, "lower"

    probs: dict[str, float] = {}
    if usl is not None and std > 0:
        probs["upper"] = round(float(1 - norm.cdf(usl, loc=mean, scale=std)), 6)
    if lsl is not None and std > 0:
        probs["lower"] = round(float(norm.cdf(lsl, loc=mean, scale=std)), 6)
    if not probs:
        # std == 0 (or no specs) and mean within specs → low risk
        return 0.0, "none"
    direction = max(probs, key=probs.get)
    return probs[direction], direction


def _estimate_process_std(predictions: list, upper: list | None = None,
                          lower: list | None = None) -> float:
    """Prefer residual/process std inferred from forecast CI half-widths.

    CI is built as pred ± 1.96 * residual_std * sqrt(step), so
    residual_std ≈ half_width / (1.96 * sqrt(step)).
    Falls back to sample std of the point predictions when CI is unavailable.
    """
    try:
        n = len(predictions)
        if (upper is not None and lower is not None and n > 0
                and len(upper) == n and len(lower) == n):
            sigmas: list[float] = []
            for i, (u, lo) in enumerate(zip(upper, lower)):
                half = (float(u) - float(lo)) / 2.0
                denom = 1.96 * float(np.sqrt(i + 1))
                if denom > 0 and np.isfinite(half) and half > 0:
                    sigmas.append(half / denom)
            if sigmas:
                return float(np.median(sigmas))
    except Exception:
        pass
    if len(predictions) > 1:
        return float(np.std(predictions, ddof=1))
    return 0.0


def _determine_risk_level(prob: float) -> str:
    if prob < 0.05:
        return "LOW"
    elif prob < 0.25:
        return "MEDIUM"
    elif prob < 0.75:
        return "HIGH"
    else:
        return "CRITICAL"


def _extrapolate_future_time(times: list | None, step_index: int):
    """Extrapolate a future sample time from historical sampling interval.

    `times` is the full chronological history; never reuse historical
    timestamps as if they were future breach times.
    Returns ISO string or None.
    """
    if not times or len(times) < 2 or step_index < 1:
        return None
    try:
        from datetime import datetime, timedelta
        parsed = []
        for t in times[-10:]:
            try:
                parsed.append(datetime.fromisoformat(str(t)))
            except Exception:
                continue
        if len(parsed) < 2:
            return None
        deltas = [(parsed[i + 1] - parsed[i]).total_seconds()
                  for i in range(len(parsed) - 1)]
        deltas = [d for d in deltas if d > 0]
        if not deltas:
            return None
        median_delta = sorted(deltas)[len(deltas) // 2]
        future = parsed[-1] + timedelta(seconds=median_delta * step_index)
        return future.isoformat()
    except Exception:
        return None


def _calc_breach_time(predictions: list, upper: list, lower: list,
                      usl: float | None, lsl: float | None, times: list | None):
    """Find the first predicted breach step. Returns dict or None.

    `times` is the full historical timestamp list (chronological). The
    future `breach_time` is extrapolated from the sampling interval, or
    null — historical times are never presented as future breach times.
    Step index is always retained.
    """
    for i, (u, lo) in enumerate(zip(upper, lower)):
        breached = False
        direction = None
        if usl is not None and u >= usl:
            breached = True
            direction = "upper"
        if lsl is not None and lo <= lsl:
            breached = True
            direction = "lower"
        if breached:
            return {
                "step": i + 1,
                "direction": direction,
                "predicted_value": round(predictions[i], 4),
                "breach_time": _extrapolate_future_time(times, i + 1),
            }
    return None


def _get_spec_limits(product: str, indicator: str):
    """Load spec limits from spec_limits.json. Returns (usl, lsl) or (None, None)."""
    try:
        with open(SPEC_LIMITS_FILE, "r", encoding="utf-8-sig") as f:
            data = json.load(f)
        product_cfg = data.get(product, {})
        indicator_cfg = product_cfg.get(indicator, {})
        return indicator_cfg.get("usl"), indicator_cfg.get("lsl")
    except Exception:
        return None, None


# ---------------------------------------------------------------------------
# P1: Forecasting models
# ---------------------------------------------------------------------------

def _ets_forecast(values: np.ndarray, horizon: int):
    """Exponential Smoothing — uses last 50 points, growing CI."""
    try:
        ExponentialSmoothing, _, _ = _lazy_import_statsmodels()
    except Exception:
        return _linear_forecast(values, horizon)
    window = values[-50:] if len(values) > 50 else values
    for cfg in [
        {"trend": "add", "damped_trend": False, "initialization_method": "heuristic"},
        {"trend": "add", "damped_trend": True, "initialization_method": "heuristic"},
        {"trend": None, "damped_trend": False},
    ]:
        try:
            model = ExponentialSmoothing(window, seasonal=None, **cfg)
            fit = model.fit(optimized=True)
            pred = fit.forecast(horizon)
            residuals = fit.resid
            residual_std = float(np.std(residuals, ddof=1))
            # Growing CI: std * sqrt(step)
            steps = np.sqrt(np.arange(1, horizon + 1, dtype=float))
            upper = (pred + 1.96 * residual_std * steps).tolist()
            lower = (pred - 1.96 * residual_std * steps).tolist()
            return pred.tolist(), upper, lower
        except Exception:
            continue
    return _linear_forecast(values, horizon)


def _ma_forecast(values: np.ndarray, horizon: int, window: int = 10):
    """Moving Average with linear trend extrapolation, growing CI."""
    w = min(window, len(values))
    last_window = values[-w:]
    mean_val = float(np.mean(last_window))
    sigma = float(np.std(values, ddof=1))

    if w >= 2:
        x = np.arange(w, dtype=float)
        coeffs = np.polyfit(x, last_window, 1)
        slope = float(coeffs[0])
        intercept = float(coeffs[1])
    else:
        slope = 0.0
        intercept = mean_val

    predictions = [intercept + slope * (w + i) for i in range(horizon)]
    # Growing CI: sigma * sqrt(step)
    upper = [p + 1.96 * sigma * np.sqrt(i + 1) for i, p in enumerate(predictions)]
    lower = [p - 1.96 * sigma * np.sqrt(i + 1) for i, p in enumerate(predictions)]
    return predictions, upper, lower


def _linear_forecast(values: np.ndarray, horizon: int):
    """Simple linear regression forecast (fallback), growing CI."""
    n = len(values)
    x = np.arange(n, dtype=float)
    coeffs = np.polyfit(x, values, 1)
    slope, intercept = float(coeffs[0]), float(coeffs[1])
    residuals = values - (slope * x + intercept)
    sigma = float(np.std(residuals, ddof=1))

    predictions = [intercept + slope * (n + i) for i in range(horizon)]
    # Growing CI: sigma * sqrt(step)
    upper = [p + 1.96 * sigma * np.sqrt(i + 1) for i, p in enumerate(predictions)]
    lower = [p - 1.96 * sigma * np.sqrt(i + 1) for i, p in enumerate(predictions)]
    return predictions, upper, lower


def _arima_forecast(values: np.ndarray, horizon: int):
    """ARIMA forecast with growing CI (default d=1)."""
    return _arima_forecast_with_d(values, horizon, d=1)


def _arima_forecast_with_d(values: np.ndarray, horizon: int, d: int = 1):
    """ARIMA forecast with explicit d parameter and growing CI."""
    try:
        _, ARIMA, _ = _lazy_import_statsmodels()
    except Exception:
        return _linear_forecast(values, horizon)
    window = values[-100:] if len(values) > 100 else values
    for order in [(2, d, 2), (1, d, 2), (2, d, 1), (1, d, 1), (1, d, 0), (0, d, 1)]:
        try:
            model = ARIMA(window, order=order)
            fit = model.fit()
            pred_result = fit.get_forecast(steps=horizon)
            pred = pred_result.predicted_mean
            # Use residual std for growing CI
            residuals = fit.resid
            residual_std = float(np.std(residuals, ddof=1))
            steps = np.sqrt(np.arange(1, horizon + 1, dtype=float))
            upper = (pred + 1.96 * residual_std * steps).tolist()
            lower = (pred - 1.96 * residual_std * steps).tolist()
            return pred.tolist(), upper, lower
        except Exception:
            continue
    return _linear_forecast(values, horizon)


# ---------------------------------------------------------------------------
# P1: Auto model selection
# ---------------------------------------------------------------------------

def _adf_test(values: np.ndarray):
    """ADF test. Returns (p_value, is_stationary)."""
    try:
        _, _, adfuller = _lazy_import_statsmodels()
        result = adfuller(values, maxlag=20, autolag='AIC')
        p_value = float(result[1])
        return p_value, p_value < 0.05
    except Exception:
        return 1.0, False


def _mann_kendall_test(values: np.ndarray) -> dict:
    """Mann-Kendall 趋势检验 + Sen 斜率估计."""
    from scipy import stats as sp_stats

    values = np.array(values, dtype=float)
    n = len(values)
    if n < 4:
        return {"p_value": 1.0, "z": 0.0, "trend": "none", "sen_slope": 0.0, "has_trend": False}

    # Sub-sample for large n
    if n > 500:
        indices = np.linspace(0, n - 1, 500, dtype=int)
        sampled = values[indices]
    else:
        sampled = values
    nn = len(sampled)

    # S statistic (vectorized)
    s = 0
    for i in range(nn - 1):
        s += np.sum(np.sign(sampled[i + 1:] - sampled[i]))

    # Variance and Z
    var_s = nn * (nn - 1) * (2 * nn + 5) / 18
    if s > 0:
        z = (s - 1) / np.sqrt(var_s)
    elif s < 0:
        z = (s + 1) / np.sqrt(var_s)
    else:
        z = 0.0

    p_value = 2 * (1 - sp_stats.norm.cdf(abs(z)))
    has_trend = p_value < 0.05
    trend = "increasing" if z > 0 else "decreasing" if z < 0 else "none"

    # Sen slope
    slopes = []
    for i in range(nn - 1):
        diffs = sampled[i + 1:] - sampled[i]
        j_indices = np.arange(1, nn - i)
        slopes.extend((diffs / j_indices).tolist())
    sen_slope = float(np.median(slopes)) if slopes else 0.0

    return {
        "p_value": round(float(p_value), 6),
        "z": round(float(z), 4),
        "trend": trend,
        "sen_slope": round(float(sen_slope), 6),
        "has_trend": bool(has_trend),
    }


def _auto_select_d(values: np.ndarray, horizon: int):
    """Dual-fit d=0/d=1, pick lower MASE. Returns (best_d, reason)."""
    p_value, is_stationary = _adf_test(values)
    split = int(len(values) * 0.8)
    train = values[:split]
    actual = values[split:]
    if len(actual) < 2:
        recommended_d = 0 if is_stationary else 1
        return recommended_d, f"ADF p={p_value:.4f}, {'stationary' if is_stationary else 'non-stationary'}"

    mase_scores: dict[int, float] = {}
    for d in [0, 1]:
        preds, _, _ = _arima_forecast_with_d(train, len(actual), d=d)
        if preds:
            mase_scores[d] = _calc_mase(actual, np.array(preds[:len(actual)]))
        else:
            mase_scores[d] = float('inf')

    recommended_d = 0 if is_stationary else 1
    gap = abs(mase_scores[0] - mase_scores[1])
    if gap < 0.05:
        best_d = recommended_d
        reason = f"ADF p={p_value:.4f} (gap<5%); d={recommended_d}"
    else:
        best_d = min(mase_scores, key=mase_scores.get)
        reason = f"MASE d=0:{mase_scores[0]:.4f} d=1:{mase_scores[1]:.4f}"

    return best_d, reason


def _auto_select_model(values: np.ndarray, horizon: int):
    """ETS vs ARIMA auto-selection. Returns (model_name, reason, mk_result)."""
    mk_result = _mann_kendall_test(values)

    split = int(len(values) * 0.8)
    train = values[:split]
    actual = values[split:]
    if len(actual) < 2:
        return "ets", "insufficient validation data", mk_result

    ets_preds, _, _ = _ets_forecast(train, len(actual))
    ets_mase = _calc_mase(actual, np.array(ets_preds[:len(actual)]))

    best_d, d_reason = _auto_select_d(values, horizon)
    arima_preds, _, _ = _arima_forecast_with_d(train, len(actual), d=best_d)
    arima_mase = _calc_mase(actual, np.array(arima_preds[:len(actual)]))

    if ets_mase <= arima_mase:
        return "ets", f"ETS MASE={ets_mase:.4f} < ARIMA(d={best_d}) MASE={arima_mase:.4f}", mk_result
    else:
        return f"arima_d{best_d}", f"ARIMA(d={best_d}) MASE={arima_mase:.4f} < ETS MASE={ets_mase:.4f}; {d_reason}", mk_result


def _run_forecast(model_name: str, values: np.ndarray, horizon: int):
    """Dispatch to the appropriate forecast function."""
    if model_name == "ets":
        return _ets_forecast(values, horizon)
    elif model_name == "ma":
        return _ma_forecast(values, horizon)
    elif model_name.startswith("arima"):
        parts = model_name.split("_d")
        d = int(parts[1]) if len(parts) > 1 else 1
        return _arima_forecast_with_d(values, horizon, d=d)
    else:
        return _arima_forecast(values, horizon)


# ---------------------------------------------------------------------------
# P1: Cpk helpers
# ---------------------------------------------------------------------------

CPK_GRADE_EXCELLENT = 1.33
CPK_GRADE_SUFFICIENT = 1.0


def _get_cpk_min_threshold() -> float:
    """Alert threshold from runtime config (default 1.33)."""
    try:
        path = get_conf_path("runtime_config.json")
        with open(path, "r", encoding="utf-8-sig") as f:
            cfg = json.load(f)
        return float(cfg.get("cpk_min_threshold", 1.33))
    except Exception:
        return 1.33


def grade_cpk(cpk: float | None) -> str | None:
    """Unified Cpk capability grade.

    Bands: >=1.33 excellent, >=1.0 sufficient, else insufficient.
    """
    if cpk is None:
        return None
    if cpk >= CPK_GRADE_EXCELLENT:
        return "excellent"
    if cpk >= CPK_GRADE_SUFFICIENT:
        return "sufficient"
    return "insufficient"


def _sliding_window_cpk(values: np.ndarray, usl: float, lsl: float, window: int = 100):
    """Sliding window Cpk analysis. Returns dict."""
    n = len(values)
    if n < 10:
        return {"cpk_current": None, "cpk_trend": None, "capability": None, "alert": False, "window_size": window, "cpk_values": []}

    # Adaptive window: shrink if needed to produce >= 6 windows for trend
    actual_window = min(window, n)
    n_windows = n // actual_window
    if n_windows < 6 and n >= 60:
        actual_window = n // 6
    step = max(1, actual_window // 2)  # 50% overlap for smoothness

    cpk_values: list[float | None] = []
    for start in range(0, n - actual_window + 1, step):
        w = values[start:start + actual_window]
        mean = float(np.mean(w))
        # Within-sigma via moving-range (true Cpk); fall back to overall std
        if len(w) >= 2:
            mr_bar = float(np.mean(np.abs(np.diff(w))))
            sigma = mr_bar / 1.128
            if sigma == 0:
                sigma = float(np.std(w, ddof=1))
        else:
            sigma = 0.0
        if sigma == 0:
            cpk_values.append(None)
        else:
            cpk_u = (usl - mean) / (3 * sigma)
            cpk_l = (mean - lsl) / (3 * sigma)
            cpk_values.append(round(min(cpk_u, cpk_l), 4))

    if not cpk_values:
        return {"cpk_current": None, "cpk_trend": None, "capability": None, "alert": False, "window_size": actual_window, "cpk_values": []}

    cpk_current = cpk_values[-1]
    # Trend: last 3 windows vs first 3 windows (filter None)
    valid = [v for v in cpk_values if v is not None]
    first_three = valid[:3]
    last_three = valid[-3:]
    if len(valid) >= 2:
        trend = round(float(np.mean(last_three) - np.mean(first_three)), 4)
    else:
        trend = None

    # Capability classification (unified bands via grade_cpk)
    capability = grade_cpk(cpk_current)
    alert_th = _get_cpk_min_threshold()

    return {
        "cpk_current": cpk_current,
        "cpk_trend": trend,
        "capability": capability,
        "alert": cpk_current is not None and cpk_current < alert_th,
        "window_size": actual_window,
        "cpk_values": cpk_values,
    }


# ---------------------------------------------------------------------------
# P2: CUSUM helpers
# ---------------------------------------------------------------------------

def _parse_segments(data: list[dict]):
    """Parse HG/换罐 markers for segment boundaries. Returns list of (start, end) tuples."""
    segments: list[tuple[int, int]] = []
    current_start = 0
    for i, d in enumerate(data):
        remark = str(d.get("remark") or "")
        sample_id = str(d.get("sample_id") or "")
        if "HG" in remark or "换罐" in remark or "HG" in sample_id or "换罐" in sample_id:
            if i > current_start:
                segments.append((current_start, i))
            current_start = i + 1
    # Last segment
    if current_start < len(data):
        segments.append((current_start, len(data)))
    # If no segments found, whole data is one segment
    if not segments:
        segments = [(0, len(data))]
    return segments


def _segmented_cusum(values: np.ndarray, segments: list[tuple], threshold: float = 5.0, drift: float = 0.5):
    """Standard CUSUM per segment. Returns list of drift detection results."""
    results: list[dict] = []
    mean_val = float(np.mean(values))
    sigma = float(np.std(values, ddof=1))
    if sigma == 0:
        sigma = 1e-10
    for seg_start, seg_end in segments:
        seg_values = values[seg_start:seg_end]
        n = len(seg_values)
        if n < 5:
            continue
        s_pos = np.zeros(n)
        s_neg = np.zeros(n)
        for i in range(1, n):
            z = (seg_values[i] - mean_val) / sigma
            s_pos[i] = max(0, s_pos[i - 1] + z - drift)
            s_neg[i] = max(0, s_neg[i - 1] - z - drift)
        pos_breach = int(np.max(s_pos) > threshold)
        neg_breach = int(np.max(s_neg) > threshold)
        drift_detected = bool(pos_breach or neg_breach)
        results.append({
            "segment_start": seg_start,
            "segment_end": seg_end,
            "segment_length": n,
            "cusum_pos_max": round(float(np.max(s_pos)), 4),
            "cusum_neg_max": round(float(np.max(s_neg)), 4),
            "drift_detected": drift_detected,
            "drift_direction": "up" if pos_breach else ("down" if neg_breach else "none"),
        })
    return results


# ---------------------------------------------------------------------------
# P2: Persistence helper
# ---------------------------------------------------------------------------

def _persist_prediction(product: str, indicator: str, model: str,
                        horizon: int, predictions: list, risk: dict):
    """Write prediction to prediction_results table."""
    if storage is None:
        return
    conn = storage._connect()
    try:
        conn.execute(
            """INSERT INTO prediction_results
               (product_code, indicator_code, model, horizon, predictions_json, risk_json, created_at)
               VALUES (?, ?, ?, ?, ?, ?, datetime('now', 'localtime'))""",
            (product, indicator, model, horizon, json.dumps(predictions),
             json.dumps(risk)),
        )
        conn.commit()
    except Exception as e:
        logger.warning(f"Failed to persist prediction: {e}")
    finally:
        conn.close()


# ---------------------------------------------------------------------------
# Endpoints
# ---------------------------------------------------------------------------

@router.get("/forecast")
def forecast(
    product: str = Query(..., description="Product code"),
    indicator: str = Query(..., description="Indicator code"),
    model: str = Query("ets", description="Forecast model: ets, arima, auto"),
    horizon: int = Query(12, ge=1, le=100, description="Forecast horizon"),
):
    # Check cache
    cache_key = f"forecast:{product}:{indicator}:{model}:{horizon}"
    cached = _cache.get(cache_key)
    if cached:
        return cached

    # Fetch recent data from storage (with excluded remarks filter)
    data = _get_data(indicator, product, limit=200)
    if len(data) < 20:
        return {"success": False, "message": "Not enough data (need >= 20 points)"}

    values = np.array([d["value"] for d in data], dtype=float)
    times = [d["sample_time"] for d in data]

    # Chronological order (storage returns DESC)
    values = values[::-1]
    times = times[::-1]

    # Train / validation split — hold out last 20%
    split = int(len(values) * 0.8)
    train = values[:split]
    actual = values[split:]

    # Auto model selection
    auto_selected = False
    select_reason = None
    model_lower = model.lower()

    if model_lower == "auto":
        auto_selected = True
        selected_model, select_reason, mk_result = _auto_select_model(values, horizon)
        model_lower = selected_model
        val_preds, _, _ = _run_forecast(model_lower, train, len(actual))
    else:
        mk_result = _mann_kendall_test(values)
        if model_lower == "ets":
            val_preds, _, _ = _ets_forecast(train, len(actual))
        elif model_lower == "ma":
            val_preds, _, _ = _ma_forecast(train, len(actual))
        else:
            val_preds, _, _ = _arima_forecast(train, len(actual))

    accuracy = _calc_accuracy(actual, np.array(val_preds[:len(actual)]))

    # Full-data forecast for the requested horizon
    predictions, upper, lower = _run_forecast(model_lower, values, horizon)

    # Spec limits + risk assessment
    usl, lsl = _get_spec_limits(product, indicator)

    pred_mean = float(np.mean(predictions))
    # Prefer residual std inferred from CI; fall back to std of predictions
    pred_std = _estimate_process_std(predictions, upper, lower)
    breach_prob, breach_dir = _calc_breach_prob(pred_mean, pred_std, usl, lsl)
    risk_level = _determine_risk_level(breach_prob)
    # Pass full history; breach_time is extrapolated (never historical times)
    breach_time = _calc_breach_time(
        predictions, upper, lower, usl, lsl, times,
    )

    risk = {
        "risk_level": risk_level,
        "breach_prob": round(breach_prob, 6),
        "breach_direction": breach_dir,
        "breach_time": breach_time,
        "usl": usl,
        "lsl": lsl,
    }

    # Persist prediction
    _persist_prediction(product, indicator, model_lower, horizon, predictions, risk)

    # WebSocket push for CRITICAL risk
    if risk_level == "CRITICAL":
        try:
            from backend.app.api.websocket import broadcast_typed
            from backend.main import _main_loop
            if _main_loop is not None:
                asyncio.run_coroutine_threadsafe(
                    broadcast_typed('risk_alert', {
                        'product': product,
                        'indicator': indicator,
                        'risk': risk,
                        'model': model_lower,
                    }), _main_loop
                )
        except Exception as e:
            logger.debug(f"WebSocket push failed: {e}")

    result = _sanitize({
        "success": True,
        "data": {
            "product": product,
            "indicator": indicator,
            "model": model_lower,
            "horizon": horizon,
            "history_length": len(values),
            "predictions": [round(v, 4) for v in predictions],
            "upper_band": [round(v, 4) for v in upper],
            "lower_band": [round(v, 4) for v in lower],
            "accuracy": accuracy,
            "last_timestamp": times[-1] if times else None,
            "auto_selected": auto_selected,
            "select_reason": select_reason,
            "risk": risk,
            "trend_analysis": mk_result,
        },
    })
    _cache.set(cache_key, result)
    return result


@router.get("/models/compare")
def compare_models(
    product: str = Query(..., description="Product code"),
    indicator: str = Query(..., description="Indicator code"),
    horizon: int = Query(12, ge=1, le=100, description="Forecast horizon"),
):
    """Compare all models' MASE scores."""
    cache_key = f"compare:{product}:{indicator}:{horizon}"
    cached = _cache.get(cache_key)
    if cached:
        return cached

    data = _get_data(indicator, product, limit=200)
    if len(data) < 20:
        return {"success": False, "message": "Not enough data"}

    values = np.array([d["value"] for d in data], dtype=float)[::-1]
    split = int(len(values) * 0.8)
    train = values[:split]
    actual = values[split:]

    models_to_test = ["ets", "arima_d0", "arima_d1", "ma"]
    results: list[dict] = []
    for m in models_to_test:
        try:
            preds, _, _ = _run_forecast(m, train, len(actual))
            mase = _calc_mase(actual, np.array(preds[:len(actual)]))
            dir_acc = _calc_direction_accuracy(actual, np.array(preds[:len(actual)]))
            results.append({"model": m, "mase": mase, "direction_acc": dir_acc})
        except Exception:
            results.append({"model": m, "mase": None, "direction_acc": None})

    # Auto selection
    auto_model, auto_reason, _ = _auto_select_model(values, horizon)

    # Mark the recommended model
    for r in results:
        r["recommended"] = r["model"] == auto_model

    result = _sanitize({
        "success": True,
        "data": {
            "models": results,
            "recommended_model": auto_model,
            "recommendation_reason": auto_reason,
        },
    })
    _cache.set(cache_key, result)
    return result


@router.get("/risk/cpk")
def risk_cpk(
    product: str = Query(..., description="Product code"),
    indicator: str = Query(..., description="Indicator code"),
    window: int = Query(100, ge=10, le=500, description="Sliding window size"),
):
    """Sliding window Cpk analysis."""
    cache_key = f"cpk:{product}:{indicator}:{window}"
    cached = _cache.get(cache_key)
    if cached:
        return cached

    usl, lsl = _get_spec_limits(product, indicator)
    if usl is None or lsl is None:
        return {"success": False, "message": "No spec limits defined for this product/indicator"}

    data = _get_data(indicator, product, limit=500)
    if len(data) < 20:
        return {"success": False, "message": "Not enough data"}

    values = np.array([d["value"] for d in data], dtype=float)[::-1]
    result = _sliding_window_cpk(values, usl, lsl, window)

    # Determine capability level (unified bands via grade_cpk)
    cpk = result.get("cpk_current")
    result["capability"] = grade_cpk(cpk) or "unknown"
    result["alert"] = cpk is not None and cpk < _get_cpk_min_threshold()
    result["window_size"] = result.pop("cpk_window", window)
    result["usl"] = usl
    result["lsl"] = lsl
    resp = _sanitize({"success": True, "data": result})
    _cache.set(cache_key, resp)
    return resp


@router.get("/risk/breach")
def risk_breach(
    product: str = Query(..., description="Product code"),
    indicator: str = Query(..., description="Indicator code"),
    horizon: int = Query(12, ge=1, le=100, description="Forecast horizon"),
    model: str = Query("ets", description="Forecast model: ets, arima, auto"),
):
    """Standalone breach probability analysis."""
    data = _get_data(indicator, product, limit=200)
    if len(data) < 20:
        return {"success": False, "message": "Not enough data"}

    values = np.array([d["value"] for d in data], dtype=float)[::-1]
    times = [d["sample_time"] for d in data][::-1]

    model_lower = model.lower()
    if model_lower == "auto":
        selected_model, _, _ = _auto_select_model(values, horizon)
        model_lower = selected_model

    predictions, upper, lower = _run_forecast(model_lower, values, horizon)
    usl, lsl = _get_spec_limits(product, indicator)

    pred_mean = float(np.mean(predictions))
    # Prefer residual std inferred from CI; fall back to std of predictions
    pred_std = _estimate_process_std(predictions, upper, lower)
    breach_prob, breach_dir = _calc_breach_prob(pred_mean, pred_std, usl, lsl)
    risk_level = _determine_risk_level(breach_prob)
    # Pass full history; breach_time is extrapolated (never historical times)
    breach_time = _calc_breach_time(
        predictions, upper, lower, usl, lsl, times,
    )

    return {
        "success": True,
        "data": {
            "risk_level": risk_level,
            "breach_probability": round(breach_prob, 6),
            "breach_direction": breach_dir,
            "breach_time": breach_time,
            "usl": usl,
            "lsl": lsl,
            "pred_mean": round(pred_mean, 4),
            "pred_std": round(pred_std, 4),
        },
    }


@router.get("/risk/drift")
def risk_drift(
    product: str = Query(..., description="Product code"),
    indicator: str = Query(..., description="Indicator code"),
):
    """CUSUM drift detection per process segment."""
    cache_key = f"drift:{product}:{indicator}"
    cached = _cache.get(cache_key)
    if cached:
        return cached

    data = _get_data(indicator, product, limit=500)
    if len(data) < 20:
        return {"success": False, "message": "Not enough data"}

    # Data comes DESC; reverse for chronological analysis
    data_chrono = data[::-1]
    values = np.array([d["value"] for d in data_chrono], dtype=float)
    segments = _parse_segments(data_chrono)
    cusum_results = _segmented_cusum(values, segments)

    # Find the current (last) segment's drift info
    current_drift = 0.0
    drift_direction = "stable"
    alert = False
    if cusum_results:
        last = cusum_results[-1]
        current_drift = round(max(last["cusum_pos_max"], last["cusum_neg_max"]) / 5.0, 4)
        if last.get("drift_detected"):
            drift_direction = last.get("drift_direction", "stable")
            alert = True

    result = {
        "success": True,
        "data": {
            "segments": cusum_results,
            "total_segments": len(cusum_results),
            "any_drift": any(r["drift_detected"] for r in cusum_results),
            "current_segment_drift": round(current_drift, 4),
            "drift_direction": drift_direction,
            "alert": alert,
        },
    }
    _cache.set(cache_key, result)
    return result


@router.get("/correlation")
def correlation(
    product: str = Query(..., description="Product code"),
    limit: int = Query(200, ge=20, le=1000, description="Data limit"),
):
    """Pearson correlation matrix across indicators for a product."""
    cache_key = f"corr:{product}:{limit}"
    cached = _cache.get(cache_key)
    if cached:
        return cached

    try:
        import pandas as pd
    except ImportError:
        return {"success": False, "message": "pandas not installed"}

    indicators = storage.get_product_indicator_codes(product)
    if not indicators:
        return {"success": False, "message": "No indicators found"}

    series_dict: dict[str, dict[str, float]] = {}
    for ind in indicators:
        data = _get_data(ind, product, limit=limit)
        if data:
            data_rev = data[::-1]
            for d in data_rev:
                st = d["sample_time"]
                if st not in series_dict:
                    series_dict[st] = {}
                series_dict[st][ind] = d["value"]

    if not series_dict:
        return {"success": False, "message": "No data"}

    df = pd.DataFrame.from_dict(series_dict, orient="index")
    df = df.dropna(axis=1, how="all").dropna(axis=0, how="all")
    if df.shape[1] < 2:
        return {"success": False, "message": "Need at least 2 indicators with data"}

    corr = df.corr()
    indicators_list = list(corr.columns)
    n = len(indicators_list)
    corr_matrix = [[0.0] * n for _ in range(n)]
    p_matrix = [[0.0] * n for _ in range(n)]
    import math
    from scipy.stats import pearsonr as _pearsonr
    cols = [df[c].values for c in indicators_list]
    for i in range(n):
        for j in range(n):
            if i == j:
                corr_matrix[i][j] = 1.0
            elif j > i:
                r, p = _pearsonr(cols[i], cols[j])
                r = 0.0 if math.isnan(r) else round(float(r), 4)
                p = 1.0 if math.isnan(p) else round(float(p), 6)
                corr_matrix[i][j] = r
                corr_matrix[j][i] = r
                p_matrix[i][j] = p
                p_matrix[j][i] = p

    result = {
        "success": True,
        "data": {
            "indicators": indicators_list,
            "correlation_matrix": corr_matrix,
            "p_values": p_matrix,
        },
    }
    _cache.set(cache_key, result)
    return result


@router.get("/feature/importance")
def feature_importance(
    product: str = Query(..., description="Product code"),
    indicator: str = Query(..., description="Target indicator code"),
    limit: int = Query(200, ge=20, le=1000),
):
    """GBDT feature importance for predicting target indicator."""
    cache_key = f"feat:{product}:{indicator}:{limit}"
    cached = _cache.get(cache_key)
    if cached:
        return cached

    try:
        import pandas as pd
        from sklearn.ensemble import GradientBoostingRegressor
    except ImportError:
        return {"success": False, "message": "pandas or scikit-learn not installed"}

    indicators = storage.get_product_indicator_codes(product)
    if not indicators:
        return {"success": False, "message": "No indicators found"}

    series_dict: dict[str, dict[str, float]] = {}
    for ind in indicators:
        data = _get_data(ind, product, limit=limit)
        if data:
            data_rev = data[::-1]
            for d in data_rev:
                st = d["sample_time"]
                if st not in series_dict:
                    series_dict[st] = {}
                series_dict[st][ind] = d["value"]

    df = pd.DataFrame.from_dict(series_dict, orient="index")
    df = df.dropna()

    if indicator not in df.columns or df.shape[1] < 2:
        return {"success": False, "message": "Insufficient data for analysis"}

    feature_cols = [c for c in df.columns if c != indicator]
    X = df[feature_cols].values
    y = df[indicator].values

    if len(X) < 20:
        return {"success": False, "message": "Not enough rows (need >= 20)"}

    gbdt = GradientBoostingRegressor(n_estimators=100, max_depth=3, random_state=42)
    gbdt.fit(X, y)

    importances = gbdt.feature_importances_
    feature_importance_pairs = sorted(
        zip(feature_cols, [round(float(v), 4) for v in importances]),
        key=lambda x: x[1], reverse=True,
    )

    result = {
        "success": True,
        "data": {
            "indicator": indicator,
            "model": "gbdt",
            "features": [{"name": f, "importance": v} for f, v in feature_importance_pairs],
        },
    }
    _cache.set(cache_key, result)
    return result


# ---------------------------------------------------------------------------
# Existing cross-indicator endpoint (unchanged)
# ---------------------------------------------------------------------------

@router.get("/cross-indicator")
def get_cross_indicator_prediction(
    product: str = Query(..., description="产品编码"),
    target: str = Query("saturated_fat", description="目标指标code"),
    limit: int = Query(50, ge=1, le=200),
):
    """获取某产品的交叉预测结果（实时从源指标计算）"""
    from backend.app.api.config import _load_json_config, PREDICTION_CONFIG_FILE
    from backend.app.engine.predictor.cross_indicator import (
        TARGET_INDICATOR_META, SOURCE_INDICATOR_META, predict_cross_indicator,
    )
    from backend.app.engine.predictor.alert_checker import check_prediction_alert

    pred_config = _load_json_config(PREDICTION_CONFIG_FILE, {})

    product_pred = pred_config.get(product, {})
    target_cfg = product_pred.get(target, {})
    if not target_cfg.get("enabled", False):
        return {"enabled": False, "data": [], "model_info": None}

    source = target_cfg.get("source_indicator", "")
    coefficient = target_cfg.get("coefficient", 0.6277)
    meta = TARGET_INDICATOR_META.get(target, {"name": target, "unit": ""})
    source_meta = SOURCE_INDICATOR_META.get(source, {"name": source})

    prediction_method = target_cfg.get("prediction_method", "random_forest")
    product_category = target_cfg.get("product_category", "")

    source_data = _get_data(source, product, limit=limit)
    source_data.reverse()

    # M8模式：获取蛋白质和酸度数据（优先匹配最新一条源数据的样品/日期）
    protein_val = None
    acidity_val = None
    if prediction_method == "random_forest":
        from backend.app.engine.predictor.cross_indicator import fetch_cooccurring_features
        latest_src = source_data[-1] if source_data else {}
        features = fetch_cooccurring_features(
            storage, product,
            sample_id=latest_src.get("sample_id"),
            sample_time=latest_src.get("sample_time"),
        )
        protein_val = features["protein"]
        acidity_val = features["acidity"]

    predicted_data = []
    latest_predicted = None
    latest_sample_id = None
    latest_remark = None
    for d in source_data:
        src_val = d.get("value")
        if src_val is None:
            continue
        result = predict_cross_indicator(
            float(src_val), float(coefficient), source, target,
            prediction_method=prediction_method,
            product_category=product_category,
            protein=protein_val,
            acidity=acidity_val,
            sample_time=d.get("sample_time"),
        )
        predicted_data.append({
            "value": result["predicted_value"],
            "sample_time": d.get("sample_time", ""),
            "method": result.get("method", "linear"),
            "model_name": result.get("model_name", ""),
            "model_key": result.get("model_key", ""),
        })
        latest_predicted = result["predicted_value"]
        latest_sample_id = d.get("sample_id")
        latest_remark = d.get("remark")

    # 报警检查
    alert = None
    if target_cfg.get("alert_enabled", False) and latest_predicted is not None:
        threshold = target_cfg.get("alert_threshold", 0.10)
        # Read usl/lsl from prediction_config instead of spec_limits.json
        usl = target_cfg.get("usl")
        lsl = target_cfg.get("lsl")
        alert = check_prediction_alert(latest_predicted, usl, lsl, threshold)

        if alert:
            alert["product_code"] = product
            alert["indicator_code"] = target
            alert["indicator_name"] = meta.get("name", target)  # 使用中文名称
            alert["source_indicator"] = source  # 保存源指标用于SPC链接
            alert["sample_id"] = latest_sample_id  # 样品编号
            alert["remark"] = latest_remark  # 备注

            # 去重检查：同一数据点（同一样品编号）不重复报警
            if storage is not None and latest_sample_id:
                try:
                    existing = storage.get_alerts(
                        status="pending",
                        product_code=product,
                        rule_type=alert["rule_type"],
                        limit=50,
                    )
                    # 检查是否已有相同样品编号的报警
                    for existing_alert in existing.get("alerts", []):
                        if existing_alert.get("sample_id") == latest_sample_id:
                            logger.info(f"Skipping duplicate alert for sample {latest_sample_id}")
                            alert = None
                            break
                except Exception as e:
                    logger.warning(f"Failed to check duplicate alerts: {e}")

        if alert and storage is not None:
            try:
                storage.save_alert(alert)
            except Exception as e:
                logger.warning(f"Failed to save prediction alert: {e}")

            # WebSocket推送
            try:
                from backend.app.api.websocket import broadcast_typed
                from backend.main import _main_loop
                if _main_loop is not None:
                    asyncio.run_coroutine_threadsafe(
                        broadcast_typed('prediction_alert', alert), _main_loop
                    )
            except Exception:
                pass

    # Determine actual method from the latest prediction
    actual_method = predicted_data[-1].get("method", "linear") if predicted_data else "linear"
    model_name = predicted_data[-1].get("model_name", "") if predicted_data else ""
    method_label = {
        "random_forest": model_name or "M8随机森林",
        "linear_fallback": "线性K值(M8降级)",
        "linear": "线性K值",
    }.get(actual_method, actual_method)

    if actual_method == "random_forest":
        formula = f"{meta['name']} = {method_label}({source_meta['name']})"
    else:
        formula = f"{meta['name']} = {source_meta['name']} × {coefficient:.4f}"

    # M8 模型版本信息
    m8_version = None
    m8_metrics = None
    if actual_method == "random_forest":
        try:
            from backend.app.engine.predictor.m8_model import get_m8_model_info
            mi = get_m8_model_info()
            model_key = predicted_data[-1].get("model_key", "full") if predicted_data else "full"
            meta_info = mi.get(model_key) or mi.get("full") or mi.get("lite")
            if meta_info:
                m8_version = meta_info.get("version")
                m8_metrics = meta_info.get("metrics")
        except Exception as e:
            logger.warning("Failed to get M8 model info: %s", e)

    return _sanitize({
        "enabled": True,
        "source_indicator": source,
        "target_indicator": target,
        "data": predicted_data,
        "model_info": {
            "target_name": meta["name"],
            "coefficient": coefficient,
            "formula": formula,
            "method": actual_method,
            "method_label": method_label,
            "model_version": m8_version,
            "model_metrics": m8_metrics,
        },
        "alert": alert,
    })


# ---------------------------------------------------------------------------
# 模型元信息端点
# ---------------------------------------------------------------------------

@router.get("/model-info")
def get_model_info():
    """返回当前加载的 M8 模型版本和性能信息"""
    try:
        from backend.app.engine.predictor.m8_model import get_m8_model_info, is_m8_available
        return {
            "m8_available": is_m8_available(),
            "models": get_m8_model_info(),
        }
    except Exception as e:
        logger.warning("Failed to get model info: %s", e)
        return {"m8_available": False, "models": {}, "error": "模型信息加载失败"}
