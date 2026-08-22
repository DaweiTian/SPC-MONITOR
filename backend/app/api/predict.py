from fastapi import APIRouter, Query
import numpy as np


def _lazy_import_statsmodels():
    """Lazy import to avoid Nuitka docstring parsing bug at startup."""
    from statsmodels.tsa.holtwinters import ExponentialSmoothing
    from statsmodels.tsa.arima.model import ARIMA
    return ExponentialSmoothing, ARIMA

router = APIRouter(prefix="/predict", tags=["prediction"])

storage = None  # injected from main.py


def _ets_forecast(values: np.ndarray, horizon: int):
    """Exponential Smoothing — uses last 50 points to capture short-term dynamics."""
    try:
        ExponentialSmoothing, _ = _lazy_import_statsmodels()
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
            sigma = float(np.std(residuals, ddof=1))
            upper = (pred + 1.96 * sigma).tolist()
            lower = (pred - 1.96 * sigma).tolist()
            return pred.tolist(), upper, lower
        except Exception:
            continue
    return _linear_forecast(values, horizon)


def _ma_forecast(values: np.ndarray, horizon: int, window: int = 10):
    """Moving Average with linear trend extrapolation."""
    w = min(window, len(values))
    last_window = values[-w:]
    mean_val = float(np.mean(last_window))
    sigma = float(np.std(values, ddof=1))

    # Compute short-term linear trend from the window
    if w >= 2:
        x = np.arange(w, dtype=float)
        coeffs = np.polyfit(x, last_window, 1)
        slope = float(coeffs[0])
        intercept = float(coeffs[1])
    else:
        slope = 0.0
        intercept = mean_val

    predictions = []
    for i in range(horizon):
        val = intercept + slope * (w + i)
        predictions.append(val)

    upper = [p + 1.96 * sigma for p in predictions]
    lower = [p - 1.96 * sigma for p in predictions]
    return predictions, upper, lower


def _linear_forecast(values: np.ndarray, horizon: int):
    """Simple linear regression forecast (fallback)."""
    n = len(values)
    x = np.arange(n, dtype=float)
    coeffs = np.polyfit(x, values, 1)
    slope, intercept = float(coeffs[0]), float(coeffs[1])
    residuals = values - (slope * x + intercept)
    sigma = float(np.std(residuals, ddof=1))

    predictions = [intercept + slope * (n + i) for i in range(horizon)]
    upper = [p + 1.96 * sigma for p in predictions]
    lower = [p - 1.96 * sigma for p in predictions]
    return predictions, upper, lower


def _arima_forecast(values: np.ndarray, horizon: int):
    """ARIMA forecast — uses last 100 points; tries richer orders first."""
    try:
        _, ARIMA = _lazy_import_statsmodels()
    except Exception:
        return _linear_forecast(values, horizon)
    window = values[-100:] if len(values) > 100 else values
    for order in [(2, 1, 2), (1, 1, 2), (2, 1, 1), (1, 1, 1)]:
        try:
            model = ARIMA(window, order=order)
            fit = model.fit()
            pred_result = fit.get_forecast(steps=horizon)
            pred = pred_result.predicted_mean
            conf = pred_result.conf_int(alpha=0.05)
            upper = conf[:, 1].tolist()
            lower = conf[:, 0].tolist()
            return pred.tolist(), upper, lower
        except Exception:
            continue
    return _linear_forecast(values, horizon)


def _calc_accuracy(actual: np.ndarray, predicted: np.ndarray) -> dict:
    """Calculate accuracy metrics: MAPE, RMSE, MAE, R-squared."""
    n = len(actual)
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

    # R-squared
    ss_res = np.sum(errors ** 2)
    ss_tot = np.sum((actual - np.mean(actual)) ** 2)
    r_squared = float(1 - ss_res / ss_tot) if ss_tot != 0 else None

    return {
        "mape": round(mape, 4) if mape is not None else None,
        "rmse": round(rmse, 4),
        "mae": round(mae, 4),
        "r_squared": round(r_squared, 4) if r_squared is not None else None,
    }


@router.get("/forecast")
def forecast(
    product: str = Query(..., description="Product code"),
    indicator: str = Query(..., description="Indicator code"),
    model: str = Query("ets", description="Forecast model: ets, ma, arima"),
    horizon: int = Query(12, ge=1, le=100, description="Forecast horizon"),
):
    # Fetch recent data from storage
    data = storage.get_recent_data(
        indicator_code=indicator, product_code=product, limit=200
    )
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

    # Fit on training data and forecast for the validation period
    model_lower = model.lower()
    if model_lower == "ets":
        val_preds, _, _ = _ets_forecast(train, len(actual))
    elif model_lower == "ma":
        val_preds, _, _ = _ma_forecast(train, len(actual))
    else:
        val_preds, _, _ = _arima_forecast(train, len(actual))

    accuracy = _calc_accuracy(actual, np.array(val_preds[: len(actual)]))

    # Full-data forecast for the requested horizon
    if model_lower == "ets":
        predictions, upper, lower = _ets_forecast(values, horizon)
    elif model_lower == "ma":
        predictions, upper, lower = _ma_forecast(values, horizon)
    else:
        predictions, upper, lower = _arima_forecast(values, horizon)

    return {
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
        },
    }
