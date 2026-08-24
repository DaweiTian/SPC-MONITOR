# 预测模块升级 Implementation Plan

> **For agentic workers:** REQUIRED SUB-SKILL: Use compose:subagent (recommended) or compose:execute to implement this plan task-by-task. Steps use checkbox (`- [ ]`) syntax for tracking.

**Goal:** Upgrade the FT1-MONITOR prediction module from broken R²/MAPE metrics + point-value risk to MASE/direction-accuracy metrics + probabilistic risk assessment + auto model selection + CUSUM + GBDT.

**Architecture:** All changes flow through `backend/app/api/predict.py` (prediction engine) and `frontend/src/pages/Prediction/index.tsx` (UI). New API endpoints are added to the same router. P2 adds 3 SQLite tables. P3 adds sklearn dependency and feature engineering modules.

**Tech Stack:** Python 3.x, FastAPI, NumPy, SciPy, statsmodels, scikit-learn (P3), React, ECharts, CSS Modules

## Global Constraints

- Existing `/api/predict/forecast` response format must remain backward-compatible (new fields added, old fields preserved until frontend updated)
- All numeric accuracy values rounded to 4 decimal places
- MASE < 1 means model beats naive baseline
- Risk levels: LOW (<5%), MEDIUM (5-25%), HIGH (25-75%), CRITICAL (>75%)
- ARIMA d parameter: dual-fit d=0 and d=1, pick lower MASE; if gap <5%, prefer ADF-recommended d
- CI formula: unified to `residual_std * sqrt(step)` across all methods
- Cache key: `(indicator, product, horizon, model)`, TTL 5 minutes
- Spec limits loaded from `spec_limits.json` via existing `storage` or config API
- Frontend uses existing CSS class patterns from `Prediction.module.css`
- `cross-indicator` endpoint untouched (independent feature)

---

## Task 1: P0 — Add naive forecast + MASE + direction accuracy to backend

**Covers:** [S2], [S4-P0], [S7]

**Files:**
- Modify: `backend/app/api/predict.py`

**Interfaces:**
- Produces: `_naive_forecast(values, horizon) -> list[float]`, `_calc_mase(actual, predicted) -> float`, `_calc_direction_accuracy(actual, predicted) -> float`
- These are consumed by the modified `_calc_accuracy()` and the `/forecast` endpoint

- [ ] **Step 1: Add `_naive_forecast` function after `_linear_forecast` (line 81)**

```python
def _naive_forecast(values: np.ndarray, horizon: int):
    """Naive baseline: repeat the last observation."""
    last = float(values[-1])
    return [last] * horizon
```

- [ ] **Step 2: Add `_calc_mase` function after `_naive_forecast`**

```python
def _calc_mase(actual: np.ndarray, predicted: np.ndarray) -> float:
    """MASE = MAE_model / MAE_naive. < 1 means model beats naive baseline."""
    naive_pred = np.full_like(actual, actual[0])
    mae_naive = float(np.mean(np.abs(actual - naive_pred)))
    if mae_naive == 0:
        return float('inf')
    mae_model = float(np.mean(np.abs(actual - predicted)))
    return mae_model / mae_naive
```

- [ ] **Step 3: Add `_calc_direction_accuracy` function after `_calc_mase`**

```python
def _calc_direction_accuracy(actual: np.ndarray, predicted: np.ndarray) -> float:
    """Direction accuracy: percentage of correct up/down predictions."""
    if len(actual) < 2:
        return 0.0
    actual_dir = np.diff(actual) > 0
    pred_dir = np.diff(predicted) > 0
    return float(np.mean(actual_dir == pred_dir) * 100)
```

- [ ] **Step 4: Modify `_calc_accuracy` to use new metrics**

Replace the entire `_calc_accuracy` function (lines 106-132):

```python
def _calc_accuracy(actual: np.ndarray, predicted: np.ndarray) -> dict:
    """Calculate accuracy metrics: MASE, direction accuracy, MAPE, RMSE, MAE."""
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

    # MASE and direction accuracy
    mase = _calc_mase(actual, predicted)
    direction_acc = _calc_direction_accuracy(actual, predicted)

    return {
        "mase": round(mase, 4),
        "direction_acc": round(direction_acc, 2),
        "mape": round(mape, 4) if mape is not None else None,
        "rmse": round(rmse, 4),
        "mae": round(mae, 4),
    }
```

- [ ] **Step 5: Remove MA from default model list in `/forecast` endpoint**

In the `forecast` function (line 139), change the model description:
```python
    model: str = Query("ets", description="Forecast model: ets, arima, auto"),
```

In the model dispatch (lines 162-178), keep MA code paths for backward compat but they won't be in the default UI:

```python
    model_lower = model.lower()
    # Map 'auto' to 'ets' for now (full auto selection in P1)
    if model_lower == "auto":
        model_lower = "ets"

    if model_lower == "ets":
        val_preds, _, _ = _ets_forecast(train, len(actual))
    elif model_lower == "ma":
        val_preds, _, _ = _ma_forecast(train, len(actual))
    else:
        val_preds, _, _ = _arima_forecast(train, len(actual))
```

And same for the full-data forecast (lines 173-178):

```python
    if model_lower == "ets":
        predictions, upper, lower = _ets_forecast(values, horizon)
    elif model_lower == "ma":
        predictions, upper, lower = _ma_forecast(values, horizon)
    else:
        predictions, upper, lower = _arima_forecast(values, horizon)
```

- [ ] **Step 6: Verify backend starts without errors**

Run: `cd /home/erribaba/git-workstation/FT1-MONITOR && python -c "from backend.app.api.predict import router; print('OK')"`
Expected: `OK`

---

## Task 2: P0 — Update frontend KPI cards (MASE + direction accuracy)

**Covers:** [S2], [S4-P0]

**Files:**
- Modify: `frontend/src/pages/Prediction/index.tsx`
- Modify: `frontend/src/pages/Prediction/Prediction.module.css`

**Interfaces:**
- Consumes: `accuracy.mase`, `accuracy.direction_acc` from `/forecast` response
- Produces: KPI cards displaying MASE and direction accuracy with color coding

- [ ] **Step 1: Update `PredictionResult` interface (line 14)**

Replace the `accuracy` type:
```typescript
  accuracy: { mase: number; direction_acc: number; mape: number | null; rmse: number; mae: number }
```

- [ ] **Step 2: Replace KPI cards (lines 317-368)**

Replace the 4 KPI cards block. Keep the first card (预测均值) and second card (越限时间) unchanged. Replace the third and fourth cards:

The MAPE card (lines 343-355) becomes MASE card:
```tsx
        <div className={`${styles.kpiCard} ${styles.kpiCardPurple}`}>
          <div className={styles.kpiHeader}>
            <span className={styles.kpiLabel}>MASE 模型质量</span>
            <div className={styles.kpiIcon}><IconTarget /></div>
          </div>
          <div className={styles.kpiValue} style={{ color: result && result.accuracy.mase < 1 ? '#10b981' : result ? '#ef4444' : undefined }}>
            {result ? result.accuracy.mase.toFixed(3) : '--'}
          </div>
          <div className={styles.kpiTrend} style={{ color: result && result.accuracy.mase < 1 ? '#10b981' : result ? '#ef4444' : undefined }}>
            {result ? (result.accuracy.mase < 1 ? '优于基准' : '不如基准') : '等待数据'}
          </div>
        </div>
```

The R² card (lines 356-367) becomes direction accuracy card:
```tsx
        <div className={`${styles.kpiCard} ${styles.kpiCardGreen}`}>
          <div className={styles.kpiHeader}>
            <span className={styles.kpiLabel}>方向准确率</span>
            <div className={styles.kpiIcon}><IconCheck /></div>
          </div>
          <div className={styles.kpiValue} style={{ color: result && result.accuracy.direction_acc >= 70 ? '#10b981' : result && result.accuracy.direction_acc >= 60 ? '#f59e0b' : result ? '#ef4444' : undefined }}>
            {result ? result.accuracy.direction_acc.toFixed(1) : '--'}
            <span className={styles.kpiUnit}>%</span>
          </div>
          <div className={styles.kpiTrend} style={{ color: result && result.accuracy.direction_acc >= 70 ? '#10b981' : result && result.accuracy.direction_acc >= 60 ? '#f59e0b' : result ? '#ef4444' : undefined }}>
            {result ? (result.accuracy.direction_acc >= 70 ? '优秀' : result.accuracy.direction_acc >= 60 ? '可用' : '不可用') : '等待数据'}
          </div>
        </div>
```

- [ ] **Step 3: Remove MA from model selector (lines 295-303)**

Remove the MA option line (line 301):
```tsx
          <option value="ets">指数平滑 (ETS)</option>
          <option value="arima">ARIMA</option>
          <option value="auto">自动选择</option>
```

Also update the initial model state (line 67) — keep as `'ets'` which is fine.

- [ ] **Step 4: Update model evaluation table (lines 264-275)**

Replace the `modelLabels` and `modelEvalRows`:
```tsx
  const modelLabels: Record<string, string> = { ets: '指数平滑 (ETS)', arima: 'ARIMA', auto: '自动选择' }
  const modelEvalRows: { label: string; value: string; color?: string; tag?: string }[] | null = result ? [
    { label: '预测模型', value: modelLabels[result.model] || result.model },
    { label: 'MASE (模型质量)', value: result.accuracy.mase.toFixed(3), color: result.accuracy.mase < 1 ? 'green' : undefined, tag: result.accuracy.mase < 1 ? 'success' : 'warning' },
    { label: '方向准确率', value: `${result.accuracy.direction_acc.toFixed(1)}%`, color: result.accuracy.direction_acc >= 70 ? 'green' : undefined, tag: result.accuracy.direction_acc >= 70 ? 'success' : result.accuracy.direction_acc >= 60 ? 'warning' : undefined },
    { label: 'MAPE (仅供参考)', value: result.accuracy.mape != null ? `${result.accuracy.mape.toFixed(2)}%` : 'N/A', color: 'cyan' },
    { label: 'RMSE', value: result.accuracy.rmse.toFixed(4), color: 'cyan' },
    { label: 'MAE', value: result.accuracy.mae.toFixed(4), color: 'cyan' },
    { label: '预测步长', value: `${result.horizon} 步` },
    { label: '历史窗口', value: `${result.historical.length} 个数据点` },
    riskAssessment,
  ] : null
```

- [ ] **Step 5: Verify frontend builds**

Run: `cd /home/erribaba/git-workstation/FT1-MONITOR/frontend && npx vite build 2>&1 | tail -5`
Expected: Build succeeds with no TypeScript errors

---

## Task 3: P0.5 — Add breach probability + risk level to backend

**Covers:** [S4-P0.5], [S7]

**Files:**
- Modify: `backend/app/api/predict.py`

**Interfaces:**
- Produces: `_calc_breach_prob(mean, std, usl, lsl) -> tuple[float, str]`, `_determine_risk_level(prob) -> str`, `_calc_breach_time(predictions, upper, lower, usl, lsl, times) -> str|None`
- These are consumed by the modified `/forecast` endpoint to populate `risk` field

- [ ] **Step 1: Add `_calc_breach_prob` function after `_calc_direction_accuracy`**

```python
def _calc_breach_prob(predicted_mean: float, predicted_std: float,
                      usl: float | None, lsl: float | None) -> tuple[float, str]:
    """Calculate breach probability for both USL and LSL, return (max_prob, direction)."""
    from scipy.stats import norm
    prob_usl = 0.0
    prob_lsl = 0.0

    if usl is not None and predicted_std > 0:
        prob_usl = 1 - norm.cdf((usl - predicted_mean) / predicted_std)
    if lsl is not None and predicted_std > 0:
        prob_lsl = norm.cdf((lsl - predicted_mean) / predicted_std)

    if prob_usl >= prob_lsl:
        return prob_usl, 'upper'
    return prob_lsl, 'lower'
```

- [ ] **Step 2: Add `_determine_risk_level` function**

```python
def _determine_risk_level(prob: float) -> str:
    """Four-level risk classification."""
    if prob < 0.05:
        return 'LOW'
    if prob < 0.25:
        return 'MEDIUM'
    if prob < 0.75:
        return 'HIGH'
    return 'CRITICAL'
```

- [ ] **Step 3: Add `_calc_breach_time` function**

```python
def _calc_breach_time(predictions: list, upper: list, lower: list,
                      usl: float | None, lsl: float | None,
                      times: list) -> str | None:
    """Find first predicted breach time from the forecast sequence."""
    for i, (u, lo) in enumerate(zip(upper, lower)):
        if usl is not None and u >= usl:
            return times[i] if i < len(times) else times[-1]
        if lsl is not None and lo <= lsl:
            return times[i] if i < len(times) else times[-1]
    return None
```

- [ ] **Step 4: Add spec limits loading helper**

Add after `_calc_breach_time`:

```python
def _get_spec_limits(product: str, indicator: str) -> dict:
    """Load spec limits from spec_limits.json."""
    import json as _json
    try:
        with open("spec_limits.json", "r", encoding="utf-8") as f:
            all_limits = _json.load(f)
        product_limits = all_limits.get(product, {})
        ind_limits = product_limits.get(indicator, {})
        return {"lsl": ind_limits.get("lsl"), "usl": ind_limits.get("usl")}
    except (FileNotFoundError, _json.JSONDecodeError):
        return {"lsl": None, "usl": None}
```

- [ ] **Step 5: Modify `/forecast` endpoint to include risk assessment**

In the `forecast` function, after computing `predictions, upper, lower` (around line 178), add risk calculation and include in response:

```python
    # Risk assessment
    spec = _get_spec_limits(product, indicator)
    usl, lsl = spec.get("usl"), spec.get("lsl")

    pred_mean = float(np.mean(predictions))
    pred_std = float(np.std(predictions, ddof=1)) if len(predictions) > 1 else 0.0

    breach_prob, breach_direction = _calc_breach_prob(pred_mean, pred_std, usl, lsl)
    risk_level = _determine_risk_level(breach_prob)

    # Generate future timestamps for breach time calculation
    breach_time = None
    if risk_level in ('HIGH', 'CRITICAL') and times:
        breach_time = _calc_breach_time(predictions, upper, lower, usl, lsl, times[-horizon:])

    risk_data = {
        "breach_prob": round(breach_prob, 4),
        "risk_level": risk_level,
        "breach_time": breach_time,
        "breach_direction": breach_direction,
        "spec_limits": spec,
    }
```

Then add `"risk": risk_data` to the response dict (after `"accuracy": accuracy`).

- [ ] **Step 6: Verify backend starts**

Run: `cd /home/erribaba/git-workstation/FT1-MONITOR && python -c "from backend.app.api.predict import router; print('OK')"`
Expected: `OK`

---

## Task 4: P0.5 — Update frontend risk display

**Covers:** [S4-P0.5]

**Files:**
- Modify: `frontend/src/pages/Prediction/index.tsx`

**Interfaces:**
- Consumes: `risk.breach_prob`, `risk.risk_level`, `risk.breach_time` from `/forecast` response

- [ ] **Step 1: Extend `PredictionResult` interface to include risk**

```typescript
interface PredictionResult {
  historical: { time: string; value: number }[]
  predictions: number[]
  upper_band: number[]
  lower_band: number[]
  accuracy: { mase: number; direction_acc: number; mape: number | null; rmse: number; mae: number }
  risk?: { breach_prob: number; risk_level: string; breach_time: string | null; breach_direction: string; spec_limits: { lsl: number | null; usl: number | null } }
  model: string
  horizon: number
}
```

- [ ] **Step 2: Update `setResult` to include risk data (around line 137)**

```typescript
        setResult({
          historical,
          predictions: predRes.data.predictions,
          upper_band: predRes.data.upper_band,
          lower_band: predRes.data.lower_band,
          accuracy: predRes.data.accuracy,
          risk: predRes.data.risk,
          model: predRes.data.model,
          horizon: predRes.data.horizon,
        })
```

- [ ] **Step 3: Replace the breach time KPI card (lines 331-342)**

Replace the hardcoded "暂无越限风险" with dynamic risk display:

```tsx
        <div className={`${styles.kpiCard} ${styles.kpiCardOrange}`}>
          <div className={styles.kpiHeader}>
            <span className={styles.kpiLabel}>风险等级</span>
            <div className={styles.kpiIcon}><IconClock /></div>
          </div>
          <div className={styles.kpiValue} style={{ fontSize: 24, color: result?.risk?.risk_level === 'CRITICAL' ? '#ef4444' : result?.risk?.risk_level === 'HIGH' ? '#f97316' : result?.risk?.risk_level === 'MEDIUM' ? '#f59e0b' : result ? '#10b981' : undefined }}>
            {result?.risk?.risk_level || '等待预测'}
          </div>
          <div className={`${styles.kpiTrend}`} style={{ color: result?.risk?.risk_level === 'CRITICAL' || result?.risk?.risk_level === 'HIGH' ? '#ef4444' : '#94a3b8' }}>
            {result?.risk ? `越限概率 ${(result.risk.breach_prob * 100).toFixed(1)}%` : '等待数据'}
          </div>
        </div>
```

- [ ] **Step 4: Update riskAssessment to use backend risk data (lines 252-262)**

```tsx
  const riskAssessment = useMemo(() => {
    if (!result?.risk) return { label: '越限风险评估', value: '低风险', tag: 'success' as const }
    const level = result.risk.risk_level
    if (level === 'CRITICAL') return { label: '越限风险评估', value: `极高风险 (${(result.risk.breach_prob * 100).toFixed(1)}%)`, tag: 'warning' as const }
    if (level === 'HIGH') return { label: '越限风险评估', value: `高风险 (${(result.risk.breach_prob * 100).toFixed(1)}%)`, tag: 'warning' as const }
    if (level === 'MEDIUM') return { label: '越限风险评估', value: `中等风险 (${(result.risk.breach_prob * 100).toFixed(1)}%)`, tag: 'warning' as const }
    return { label: '越限风险评估', value: '低风险', tag: 'success' as const }
  }, [result])
```

- [ ] **Step 5: Verify frontend builds**

Run: `cd /home/erribaba/git-workstation/FT1-MONITOR/frontend && npx vite build 2>&1 | tail -5`

---

## Task 5: P1 — ADF test + auto model selection + ARIMA d selection

**Covers:** [S4-P1], [S7]

**Files:**
- Modify: `backend/app/api/predict.py`

**Interfaces:**
- Produces: `_adf_test(values) -> tuple[float, bool]`, `_arima_forecast_with_d(values, horizon, d) -> tuple[list, list, list]`, `_auto_select_d(values, horizon) -> tuple[int, str]`, `_auto_select_model(values, horizon) -> tuple[str, str]`
- These are consumed by the `/forecast` endpoint when `model=auto`

- [ ] **Step 1: Add `_adf_test` function**

```python
def _adf_test(values: np.ndarray) -> tuple[float, bool]:
    """ADF stationarity test. Returns (p_value, is_stationary)."""
    from statsmodels.tsa.stattools import adfuller
    result = adfuller(values, maxlag=20, autolag='AIC')
    p_value = result[1]
    return p_value, p_value < 0.05
```

- [ ] **Step 2: Add `_arima_forecast_with_d` function**

This is a variant of `_arima_forecast` that accepts an explicit `d` parameter:

```python
def _arima_forecast_with_d(values: np.ndarray, horizon: int, d: int = 0):
    """ARIMA forecast with explicit d parameter."""
    try:
        _, ARIMA = _lazy_import_statsmodels()
    except Exception:
        return _linear_forecast(values, horizon)
    window = values[-100:] if len(values) > 100 else values
    for order in [(2, d, 2), (1, d, 2), (2, d, 1), (1, d, 1), (1, d, 0), (0, d, 1)]:
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
```

- [ ] **Step 3: Add `_auto_select_d` function**

```python
def _auto_select_d(values: np.ndarray, horizon: int) -> tuple[int, str]:
    """Dual-fit d=0 and d=1, pick the one with lower MASE."""
    p_value, is_stationary = _adf_test(values)
    d_adf = 0 if is_stationary else 1

    split = int(len(values) * 0.8)
    train, actual = values[:split], values[split:]
    if len(actual) < 5:
        return d_adf, f"ADF p={p_value:.4f}, insufficient validation data"

    _, pred_d0, _ = _arima_forecast_with_d(train, len(actual), d=0)
    mase_d0 = _calc_mase(actual, np.array(pred_d0[:len(actual)]))

    _, pred_d1, _ = _arima_forecast_with_d(train, len(actual), d=1)
    mase_d1 = _calc_mase(actual, np.array(pred_d1[:len(actual)]))

    if max(mase_d0, mase_d1) > 0 and abs(mase_d0 - mase_d1) / max(mase_d0, mase_d1) < 0.05:
        return d_adf, f"ADF p={p_value:.4f}, d={d_adf} (gap<5% prefer simpler)"

    if mase_d0 <= mase_d1:
        return 0, f"ADF p={p_value:.4f}, d=0 MASE={mase_d0:.3f}"
    return 1, f"ADF p={p_value:.4f}, d=1 MASE={mase_d1:.3f}"
```

- [ ] **Step 4: Add `_auto_select_model` function**

```python
def _auto_select_model(values: np.ndarray, horizon: int) -> tuple[str, str]:
    """Auto-select best model: ETS vs ARIMA (dual d), pick lowest MASE."""
    split = int(len(values) * 0.8)
    train, actual = values[:split], values[split:]
    if len(actual) < 5:
        return "ets", "Insufficient validation data, defaulting to ETS"

    results = {}

    pred_ets, _, _ = _ets_forecast(train, len(actual))
    results['ets'] = _calc_mase(actual, np.array(pred_ets[:len(actual)]))

    d_selected, d_reason = _auto_select_d(values, horizon)
    pred_arima, _, _ = _arima_forecast_with_d(train, len(actual), d=d_selected)
    results['arima'] = _calc_mase(actual, np.array(pred_arima[:len(actual)]))

    best = min(results, key=results.get)
    reason = f"{d_reason}, {best.upper()} MASE={results[best]:.3f} (best)"
    return best, reason
```

- [ ] **Step 5: Update `/forecast` endpoint for auto model selection**

In the `forecast` function, after the `model_lower = model.lower()` line, add:

```python
    auto_selected = False
    select_reason = None

    if model_lower == "auto":
        model_lower, select_reason = _auto_select_model(values, horizon)
        auto_selected = True
```

Then add `auto_selected` and `select_reason` to the response data dict:

```python
            "auto_selected": auto_selected,
            "select_reason": select_reason,
```

- [ ] **Step 6: Verify backend**

Run: `cd /home/erribaba/git-workstation/FT1-MONITOR && python -c "from backend.app.api.predict import router; print('OK')"`

---

## Task 6: P1 — Add `/models/compare` and `/risk/cpk` endpoints

**Covers:** [S4-P1]

**Files:**
- Modify: `backend/app/api/predict.py`

**Interfaces:**
- Produces: `GET /predict/models/compare`, `GET /predict/risk/cpk`
- Consumed by: frontend model comparison chart and Cpk display

- [ ] **Step 1: Add `_sliding_window_cpk` function**

```python
def _sliding_window_cpk(values: np.ndarray, usl: float, lsl: float,
                        window: int = 100) -> dict:
    """Sliding window Cpk calculation."""
    cpk_series = []
    for i in range(window, len(values) + 1, window):
        segment = values[i - window:i]
        mu = np.mean(segment)
        sigma = np.std(segment, ddof=1)
        if sigma == 0:
            cpk_series.append(float('inf'))
        else:
            cpk = min((usl - mu) / (3 * sigma), (mu - lsl) / (3 * sigma))
            cpk_series.append(round(cpk, 3))

    if len(cpk_series) >= 6:
        early = np.mean(cpk_series[:3])
        late = np.mean(cpk_series[-3:])
        trend = 'rising' if late > early * 1.05 else ('falling' if late < early * 0.95 else 'stable')
    else:
        trend = 'stable'

    current = cpk_series[-1] if cpk_series else 0
    if current < 0.5:
        capability = 'severe_insufficient'
    elif current < 1.0:
        capability = 'insufficient'
    elif current < 1.33:
        capability = 'sufficient'
    else:
        capability = 'excellent'

    return {
        'cpk_current': current,
        'cpk_trend': trend,
        'cpk_window': cpk_series,
        'window_size': window,
        'capability': capability,
    }
```

- [ ] **Step 2: Add `/models/compare` endpoint**

After the `/forecast` endpoint, add:

```python
@router.get("/models/compare")
def models_compare(
    product: str = Query(..., description="Product code"),
    indicator: str = Query(..., description="Indicator code"),
    horizon: int = Query(12, ge=1, le=100),
):
    data = storage.get_recent_data(indicator_code=indicator, product_code=product, limit=200)
    if len(data) < 20:
        return {"success": False, "message": "Not enough data"}

    values = np.array([d["value"] for d in data], dtype=float)[::-1]
    split = int(len(values) * 0.8)
    train, actual = values[:split], values[split:]

    models = []
    for name, fn in [
        ("ets", lambda h: _ets_forecast(train, h)),
        ("arima_d0", lambda h: _arima_forecast_with_d(train, h, d=0)),
        ("arima_d1", lambda h: _arima_forecast_with_d(train, h, d=1)),
        ("naive", lambda h: (_naive_forecast(train, h), [0]*h, [0]*h)),
    ]:
        try:
            preds, _, _ = fn(len(actual))
            preds_arr = np.array(preds[:len(actual)])
            acc = _calc_accuracy(actual, preds_arr)
            models.append({"model": name, **acc, "recommended": False})
        except Exception:
            continue

    if models:
        best = min(models, key=lambda m: m.get("mase", float("inf")))
        best["recommended"] = True
        recommended_model = best["model"]
        recommendation_reason = f"MASE={best['mase']:.3f} (lowest)"
    else:
        recommended_model = "ets"
        recommendation_reason = "No models succeeded"

    return {
        "success": True,
        "data": {
            "models": models,
            "recommended_model": recommended_model,
            "recommendation_reason": recommendation_reason,
        },
    }
```

- [ ] **Step 3: Add `/risk/cpk` endpoint**

```python
@router.get("/risk/cpk")
def risk_cpk(
    product: str = Query(...),
    indicator: str = Query(...),
):
    spec = _get_spec_limits(product, indicator)
    usl, lsl = spec.get("usl"), spec.get("lsl")
    if usl is None or lsl is None:
        return {"success": False, "message": "No spec limits configured"}

    data = storage.get_recent_data(indicator_code=indicator, product_code=product, limit=500)
    if len(data) < 100:
        return {"success": False, "message": "Not enough data (need >= 100)"}

    values = np.array([d["value"] for d in data], dtype=float)[::-1]
    result = _sliding_window_cpk(values, usl, lsl, window=100)

    return {
        "success": True,
        "data": {
            "indicator": indicator,
            **result,
            "alert": result["cpk_current"] < 1.0,
        },
    }
```

- [ ] **Step 4: Add `/risk/breach` endpoint**

```python
@router.get("/risk/breach")
def risk_breach(
    product: str = Query(...),
    indicator: str = Query(...),
    horizon: int = Query(12, ge=1, le=100),
):
    spec = _get_spec_limits(product, indicator)
    usl, lsl = spec.get("usl"), spec.get("lsl")
    if usl is None and lsl is None:
        return {"success": False, "message": "No spec limits configured"}

    data = storage.get_recent_data(indicator_code=indicator, product_code=product, limit=200)
    if len(data) < 20:
        return {"success": False, "message": "Not enough data"}

    values = np.array([d["value"] for d in data], dtype=float)[::-1]
    times = [d["sample_time"] for d in data][::-1]

    predictions, upper, lower = _ets_forecast(values, horizon)
    pred_mean = float(np.mean(predictions))
    pred_std = float(np.std(predictions, ddof=1)) if len(predictions) > 1 else 0.0

    prob_usl, prob_lsl = 0.0, 0.0
    from scipy.stats import norm
    if usl is not None and pred_std > 0:
        prob_usl = 1 - norm.cdf((usl - pred_mean) / pred_std)
    if lsl is not None and pred_std > 0:
        prob_lsl = norm.cdf((lsl - pred_mean) / pred_std)

    breach_prob = max(prob_usl, prob_lsl)
    breach_direction = 'upper' if prob_usl >= prob_lsl else 'lower'
    risk_level = _determine_risk_level(breach_prob)
    breach_time = _calc_breach_time(predictions, upper, lower, usl, lsl, times[-horizon:])

    return {
        "success": True,
        "data": {
            "indicator": indicator,
            "spec_limits": spec,
            "predicted_mean": round(pred_mean, 4),
            "predicted_std": round(pred_std, 4),
            "breach_prob_usl": round(prob_usl, 4),
            "breach_prob_lsl": round(prob_lsl, 4),
            "breach_prob": round(breach_prob, 4),
            "risk_level": risk_level,
            "breach_time": breach_time,
            "breach_direction": breach_direction,
        },
    }
```

- [ ] **Step 5: Verify backend**

Run: `cd /home/erribaba/git-workstation/FT1-MONITOR && python -c "from backend.app.api.predict import router; print('OK')"`

---

## Task 7: P1 — Fix residual analysis + unify CI

**Covers:** [S4-P1]

**Files:**
- Modify: `backend/app/api/predict.py` (CI unification)
- Modify: `frontend/src/pages/Prediction/index.tsx` (residual chart fix)

- [ ] **Step 1: Unify CI in `_ets_forecast`**

Replace lines 33-35 in `_ets_forecast`:
```python
            residuals = fit.resid
            residual_std = float(np.std(residuals, ddof=1))
            upper = []
            lower = []
            for step in range(1, horizon + 1):
                ci = 1.96 * residual_std * np.sqrt(step)
                upper.append(float(pred[step - 1]) + ci)
                lower.append(float(pred[step - 1]) - ci)
```

Replace the return to match new list format:
```python
            return pred.tolist(), upper, lower
```

- [ ] **Step 2: Unify CI in `_linear_forecast`**

Replace lines 79-80:
```python
    predictions = [intercept + slope * (n + i) for i in range(horizon)]
    upper = []
    lower = []
    for i in range(horizon):
        ci = 1.96 * sigma * np.sqrt(i + 1)
        upper.append(predictions[i] + ci)
        lower.append(predictions[i] - ci)
```

- [ ] **Step 3: Unify CI in `_ma_forecast`**

Replace lines 64-65:
```python
    upper = []
    lower = []
    for i in range(horizon):
        ci = 1.96 * sigma * np.sqrt(i + 1)
        upper.append(predictions[i] + ci)
        lower.append(predictions[i] - ci)
```

- [ ] **Step 4: Fix residual chart in frontend**

Replace lines 225-247 in `index.tsx`. The residual chart currently computes `data - mean` (wrong). Change it to show historical data residuals vs a simple linear trend (since we don't have actual vs predicted residuals for the historical data in the frontend — we only have the historical values):

```tsx
  const residualOption = useMemo(() => {
    if (!result) return null
    const histValues = result.historical.map(h => h.value)
    const n = histValues.length
    if (n < 3) return null

    // Fit linear trend and compute residuals (actual - trend)
    const x = histValues.map((_, i) => i)
    const xMean = x.reduce((a, b) => a + b, 0) / n
    const yMean = histValues.reduce((a, b) => a + b, 0) / n
    const ssxy = x.reduce((s, xi, i) => s + (xi - xMean) * (histValues[i] - yMean), 0)
    const ssxx = x.reduce((s, xi) => s + (xi - xMean) ** 2, 0)
    const slope = ssxx !== 0 ? ssxy / ssxx : 0
    const intercept = yMean - slope * xMean
    const residuals = histValues.map((v, i) => parseFloat((v - (intercept + slope * i)).toFixed(4)))

    return {
      ...chartTheme,
      tooltip: { trigger: 'axis' as const, ...tooltipStyle },
      grid: { left: 50, right: 20, top: 27, bottom: 30 },
      xAxis: { type: 'category' as const, data: residuals.map((_, i) => `#${i + 1}`), ...chartTheme.xAxis },
      yAxis: { type: 'value' as const, ...chartTheme.yAxis, name: '残差 (实际-趋势)' },
      series: [{
        type: 'bar' as const, barWidth: '60%',
        data: residuals.map((v) => ({ value: v, itemStyle: { color: v >= 0 ? 'rgba(0,212,255,0.6)' : 'rgba(239,68,68,0.6)' } })),
        markLine: { symbol: 'none', silent: true, data: [{ yAxis: 0, lineStyle: { color: '#94a3b8', width: 1 } }] },
      }],
    }
  }, [result])
```

- [ ] **Step 5: Add model comparison chart to frontend**

After the residual chart section, add a new panel for model comparison. First, add state and fetch logic:

After the `result` state (line 70), add:
```tsx
  const [compareData, setCompareData] = useState<{ models: Array<{ model: string; mase: number; direction_acc: number; recommended: boolean }>; recommended_model: string } | null>(null)
```

In `fetchPrediction`, after setting `result`, add:
```tsx
        // Fetch model comparison
        try {
          const compare = await api.getModelsCompare(productCode, indicatorCode, horizonSteps)
          if (compare.success) setCompareData(compare.data)
        } catch { /* ignore */ }
```

Add the API client function (see Task 8 for api.ts changes).

Add the chart option:
```tsx
  const compareOption = useMemo(() => {
    if (!compareData?.models?.length) return null
    const models = compareData.models
    return {
      ...chartTheme,
      tooltip: { trigger: 'axis' as const, ...tooltipStyle },
      grid: { left: 50, right: 20, top: 27, bottom: 30 },
      xAxis: { type: 'category' as const, data: models.map(m => m.model), ...chartTheme.xAxis },
      yAxis: { type: 'value' as const, ...chartTheme.yAxis, name: 'MASE' },
      series: [{
        type: 'bar' as const, barWidth: '50%',
        data: models.map(m => ({
          value: m.mase,
          itemStyle: { color: m.recommended ? '#10b981' : m.mase < 1 ? 'rgba(0,212,255,0.6)' : 'rgba(239,68,68,0.6)' },
        })),
        markLine: { symbol: 'none', silent: true, data: [{ yAxis: 1, lineStyle: { color: '#f59e0b', width: 1, type: 'dashed' as const }, label: { formatter: '基准线 (MASE=1)' } }] },
      }],
    }
  }, [compareData])

  const { containerRef: compareChartRef } = useChart(compareOption)
```

Add the chart panel in the JSX (after residual panel, before the closing `</div>`):
```tsx
        <div className={styles.panel}>
          <div className={styles.panelHeader}>
            <div className={styles.panelTitle}>
              <span className={styles.panelTitleIcon}><IconBarChart /></span>
              模型对比 (MASE)
            </div>
          </div>
          <div className={styles.panelBody}>
            <div ref={compareChartRef} className={styles.chartContainer} style={{ height: 290 }} />
          </div>
        </div>
```

- [ ] **Step 6: Verify frontend builds**

Run: `cd /home/erribaba/git-workstation/FT1-MONITOR/frontend && npx vite build 2>&1 | tail -5`

---

## Task 8: P1 — Add new API client functions

**Covers:** [S4-P1]

**Files:**
- Modify: `frontend/src/services/api.ts`

- [ ] **Step 1: Add new API functions before the closing `}`**

```typescript
  // Prediction module - new endpoints
  getModelsCompare: (product: string, indicator: string, horizon: number) =>
    http.get('/predict/models/compare', { params: { product, indicator, horizon } }).then(r => r.data),
  getRiskBreach: (product: string, indicator: string, horizon: number) =>
    http.get('/predict/risk/breach', { params: { product, indicator, horizon } }).then(r => r.data),
  getRiskCpk: (product: string, indicator: string) =>
    http.get('/predict/risk/cpk', { params: { product, indicator } }).then(r => r.data),
  getRiskDrift: (product: string, indicator: string) =>
    http.get('/predict/risk/drift', { params: { product, indicator } }).then(r => r.data),
  getCorrelation: (product: string) =>
    http.get('/predict/correlation', { params: { product } }).then(r => r.data),
  getFeatureImportance: (product: string, indicator: string) =>
    http.get('/predict/feature/importance', { params: { product, indicator } }).then(r => r.data),
```

- [ ] **Step 2: Verify TypeScript compilation**

Run: `cd /home/erribaba/git-workstation/FT1-MONITOR/frontend && npx tsc --noEmit 2>&1 | head -20`

---

## Task 9: P2 — Database tables + CUSUM + drift detection

**Covers:** [S4-P2], [S6]

**Files:**
- Modify: `backend/app/api/predict.py`
- Modify: `backend/app/services/storage.py` (add table creation)

**Interfaces:**
- Produces: `_parse_segments(data) -> list[dict]`, `_segmented_cusum(values, segments) -> list[dict]`, `GET /predict/risk/drift`

- [ ] **Step 1: Add segment parsing function to predict.py**

```python
def _parse_segments(data: list[dict]) -> list[dict]:
    """Parse remark/sample_id for HG/换罐 markers to find segment boundaries."""
    segments = []
    current_start = 0
    for i, row in enumerate(data):
        remark = row.get('remark', '') or ''
        sample_id = row.get('sample_id', '') or ''
        marker_text = remark + sample_id
        if 'HG' in marker_text or '换罐' in marker_text:
            if i > current_start:
                segments.append({'start': current_start, 'end': i, 'marker': marker_text.strip()})
            current_start = i
    segments.append({'start': current_start, 'end': len(data), 'marker': None})
    return segments
```

- [ ] **Step 2: Add segmented CUSUM function**

```python
def _segmented_cusum(values: np.ndarray, segments: list[dict],
                     threshold: float = 5.0, drift: float = 0.5) -> list[dict]:
    """Compute standard CUSUM independently for each segment."""
    results = []
    for seg in segments:
        seg_values = values[seg['start']:seg['end']]
        if len(seg_values) < 10:
            continue
        mu = np.mean(seg_values)
        sigma = np.std(seg_values, ddof=1)
        if sigma == 0:
            continue

        s_pos = s_neg = 0.0
        max_drift = 0.0
        for v in seg_values:
            z = (v - mu) / sigma
            s_pos = max(0, s_pos + z - drift)
            s_neg = min(0, s_neg + z + drift)
            max_drift = max(max_drift, abs(s_pos), abs(s_neg))

        direction = 'up' if s_pos > abs(s_neg) else ('down' if abs(s_neg) > s_pos else 'stable')
        results.append({
            'start': seg['start'],
            'end': seg['end'],
            'marker': seg['marker'],
            'cusum_drift': round(max_drift, 3),
            'direction': direction,
            'alert': max_drift > threshold,
        })
    return results
```

- [ ] **Step 3: Add `/risk/drift` endpoint**

```python
@router.get("/risk/drift")
def risk_drift(
    product: str = Query(...),
    indicator: str = Query(...),
):
    data = storage.get_recent_data(indicator_code=indicator, product_code=product, limit=500)
    if len(data) < 20:
        return {"success": False, "message": "Not enough data"}

    values = np.array([d["value"] for d in data], dtype=float)[::-1]
    data_reversed = list(reversed(data))

    segments = _parse_segments(data_reversed)
    cusum_results = _segmented_cusum(values, segments)

    current_drift = cusum_results[-1]['cusum_drift'] if cusum_results else 0.0
    current_direction = cusum_results[-1]['direction'] if cusum_results else 'stable'
    any_alert = any(r['alert'] for r in cusum_results)

    return {
        "success": True,
        "data": {
            "indicator": indicator,
            "segments": cusum_results,
            "current_segment_drift": current_drift,
            "drift_direction": current_direction,
            "alert": any_alert,
        },
    }
```

- [ ] **Step 4: Add database table creation to storage.py**

Read `backend/app/services/storage.py` first to understand the pattern, then add table creation in `init_db()`:

```python
    # Prediction results table
    cursor.execute("""
        CREATE TABLE IF NOT EXISTS prediction_results (
            id              INTEGER PRIMARY KEY AUTOINCREMENT,
            indicator_code  TEXT NOT NULL,
            product_code    TEXT NOT NULL,
            model_type      TEXT NOT NULL,
            horizon         INTEGER NOT NULL,
            mase            REAL,
            direction_acc   REAL,
            mape            REAL,
            rmse            REAL,
            mae             REAL,
            predictions     TEXT,
            upper_band      TEXT,
            lower_band      TEXT,
            auto_selected   INTEGER DEFAULT 0,
            select_reason   TEXT,
            created_at      TEXT DEFAULT (datetime('now','localtime'))
        )
    """)
    cursor.execute("CREATE INDEX IF NOT EXISTS idx_pr_indicator_product ON prediction_results(indicator_code, product_code)")

    # Risk predictions table
    cursor.execute("""
        CREATE TABLE IF NOT EXISTS risk_predictions (
            id              INTEGER PRIMARY KEY AUTOINCREMENT,
            indicator_code  TEXT NOT NULL,
            product_code    TEXT NOT NULL,
            breach_prob     REAL,
            risk_level      TEXT,
            breach_time     TEXT,
            cusum_status    TEXT,
            cusum_drift     REAL,
            cpk_current     REAL,
            cpk_trend       TEXT,
            cpk_window      TEXT,
            alert_triggered INTEGER DEFAULT 0,
            created_at      TEXT DEFAULT (datetime('now','localtime'))
        )
    """)
    cursor.execute("CREATE INDEX IF NOT EXISTS idx_rp_indicator_product ON risk_predictions(indicator_code, product_code)")
    cursor.execute("CREATE INDEX IF NOT EXISTS idx_rp_risk_level ON risk_predictions(risk_level)")

    # Process segments table
    cursor.execute("""
        CREATE TABLE IF NOT EXISTS process_segments (
            id              INTEGER PRIMARY KEY AUTOINCREMENT,
            indicator_code  TEXT NOT NULL,
            product_code    TEXT NOT NULL,
            segment_index   INTEGER NOT NULL,
            start_time      TEXT NOT NULL,
            end_time        TEXT,
            start_idx       INTEGER NOT NULL,
            end_idx         INTEGER,
            change_marker   TEXT,
            created_at      TEXT DEFAULT (datetime('now','localtime'))
        )
    """)
    cursor.execute("CREATE INDEX IF NOT EXISTS idx_ps_indicator_product ON process_segments(indicator_code, product_code)")
```

- [ ] **Step 5: Add persistence helper to predict.py**

```python
def _persist_prediction(product: str, indicator: str, model_type: str, horizon: int,
                        accuracy: dict, predictions: list, upper: list, lower: list,
                        auto_selected: bool, select_reason: str | None,
                        risk: dict | None = None):
    """Persist prediction result to database."""
    try:
        import json as _json
        storage.db.execute(
            """INSERT INTO prediction_results
               (indicator_code, product_code, model_type, horizon, mase, direction_acc, mape, rmse, mae,
                predictions, upper_band, lower_band, auto_selected, select_reason)
               VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?)""",
            (indicator, product, model_type, horizon,
             accuracy.get('mase'), accuracy.get('direction_acc'), accuracy.get('mape'),
             accuracy.get('rmse'), accuracy.get('mae'),
             _json.dumps(predictions), _json.dumps(upper), _json.dumps(lower),
             1 if auto_selected else 0, select_reason))
        storage.db.commit()
    except Exception:
        pass

    if risk:
        try:
            import json as _json
            storage.db.execute(
                """INSERT INTO risk_predictions
                   (indicator_code, product_code, breach_prob, risk_level, breach_time, cusum_status, cusum_drift)
                   VALUES (?, ?, ?, ?, ?, ?, ?)""",
                (indicator, product, risk.get('breach_prob'), risk.get('risk_level'),
                 risk.get('breach_time'), None, None))
            storage.db.commit()
        except Exception:
            pass
```

Then call `_persist_prediction(...)` at the end of the `forecast` endpoint, before the return statement.

- [ ] **Step 6: Add WebSocket push for CRITICAL risk**

In the `forecast` endpoint, after computing risk, add:

```python
    # WebSocket push for CRITICAL risk
    if risk_data.get('risk_level') == 'CRITICAL':
        try:
            from backend.app.api.websocket import broadcast_typed
            import asyncio
            loop = asyncio.get_event_loop()
            if loop.is_running():
                asyncio.ensure_future(broadcast_typed('risk_alert', {
                    'product': product, 'indicator': indicator,
                    'risk_level': risk_data['risk_level'],
                    'breach_prob': risk_data['breach_prob'],
                }))
        except Exception:
            pass
```

- [ ] **Step 7: Verify backend**

Run: `cd /home/erribaba/git-workstation/FT1-MONITOR && python -c "from backend.app.api.predict import router; print('OK')"`

---

## Task 10: P2 — Frontend risk panel + CRITICAL alert

**Covers:** [S4-P2]

**Files:**
- Modify: `frontend/src/pages/Prediction/index.tsx`
- Modify: `frontend/src/pages/Prediction/Prediction.module.css`

- [ ] **Step 1: Add risk panel state and data fetching**

After `compareData` state, add:
```tsx
  const [cpkData, setCpkData] = useState<{ cpk_current: number; cpk_trend: string; cpk_window: number[]; capability: string } | null>(null)
  const [driftData, setDriftData] = useState<{ current_segment_drift: number; drift_direction: string; alert: boolean } | null>(null)
```

In `fetchPrediction`, add parallel fetches:
```tsx
        // Fetch Cpk and drift data
        const [cpkRes, driftRes] = await Promise.allSettled([
          api.getRiskCpk(productCode, indicatorCode),
          api.getRiskDrift(productCode, indicatorCode),
        ])
        if (cpkRes.status === 'fulfilled' && cpkRes.value?.success) setCpkData(cpkRes.value.data)
        if (driftRes.status === 'fulfilled' && driftRes.value?.success) setDriftData(driftRes.value.data)
```

- [ ] **Step 2: Add risk panel CSS styles**

Add to `Prediction.module.css`:

```css
/* ========== Risk Panel ========== */
.riskPanel {
  background: var(--bg-card);
  border: 1px solid var(--border-color);
  border-radius: 10px;
  margin-bottom: 16px;
  padding: 16px 20px;
}

.riskGrid {
  display: grid;
  grid-template-columns: repeat(4, 1fr);
  gap: 12px;
  margin-bottom: 16px;
}

.riskCard {
  padding: 12px;
  border-radius: 8px;
  background: var(--bg-secondary);
  border: 1px solid var(--border-color);
  text-align: center;
}

.riskCardTitle {
  font-size: 12px;
  color: var(--text-secondary);
  margin-bottom: 4px;
}

.riskCardValue {
  font-size: 20px;
  font-weight: 700;
}

.riskCardTrend {
  font-size: 11px;
  margin-top: 2px;
}

.alertList {
  max-height: 200px;
  overflow-y: auto;
}

.alertItem {
  display: flex;
  align-items: center;
  gap: 8px;
  padding: 8px 0;
  border-bottom: 1px solid var(--border-color);
  font-size: 13px;
}

.alertDot {
  width: 8px;
  height: 8px;
  border-radius: 50%;
  flex-shrink: 0;
}

.criticalModal {
  position: fixed;
  top: 0;
  left: 0;
  right: 0;
  bottom: 0;
  background: rgba(0, 0, 0, 0.7);
  display: flex;
  align-items: center;
  justify-content: center;
  z-index: 1000;
}

.criticalModalContent {
  background: var(--bg-card);
  border: 2px solid #ef4444;
  border-radius: 12px;
  padding: 24px 32px;
  max-width: 400px;
  text-align: center;
}

@media (max-width: 1024px) {
  .riskGrid {
    grid-template-columns: repeat(2, 1fr);
  }
}
```

- [ ] **Step 3: Add risk panel component in JSX**

Add after the model comparison panel:

```tsx
      {/* ====== Risk Monitoring Panel ====== */}
      {(cpkData || driftData || result?.risk) && (
        <div className={styles.riskPanel}>
          <div className={styles.panelHeader}>
            <div className={styles.panelTitle}>
              <span className={styles.panelTitleIcon}><IconTarget /></span>
              风险监控面板
            </div>
          </div>
          <div className={styles.riskGrid}>
            <div className={styles.riskCard}>
              <div className={styles.riskCardTitle}>Cpk</div>
              <div className={styles.riskCardValue} style={{ color: cpkData && cpkData.cpk_current >= 1.33 ? '#10b981' : cpkData && cpkData.cpk_current >= 1.0 ? '#f59e0b' : '#ef4444' }}>
                {cpkData ? cpkData.cpk_current.toFixed(2) : '--'}
              </div>
              <div className={styles.riskCardTrend} style={{ color: '#94a3b8' }}>
                {cpkData ? { rising: '上升', falling: '下降', stable: '稳定' }[cpkData.cpk_trend] || cpkData.cpk_trend : '--'}
              </div>
            </div>
            <div className={styles.riskCard}>
              <div className={styles.riskCardTitle}>越限概率</div>
              <div className={styles.riskCardValue} style={{ color: result?.risk?.risk_level === 'CRITICAL' ? '#ef4444' : result?.risk?.risk_level === 'HIGH' ? '#f97316' : '#10b981' }}>
                {result?.risk ? `${(result.risk.breach_prob * 100).toFixed(1)}%` : '--'}
              </div>
              <div className={styles.riskCardTrend} style={{ color: result?.risk?.risk_level === 'CRITICAL' || result?.risk?.risk_level === 'HIGH' ? '#ef4444' : '#94a3b8' }}>
                {result?.risk?.risk_level || '--'}
              </div>
            </div>
            <div className={styles.riskCard}>
              <div className={styles.riskCardTitle}>漂移幅度</div>
              <div className={styles.riskCardValue} style={{ color: driftData && driftData.alert ? '#ef4444' : '#10b981' }}>
                {driftData ? `${driftData.current_segment_drift.toFixed(2)}σ` : '--'}
              </div>
              <div className={styles.riskCardTrend} style={{ color: '#94a3b8' }}>
                {driftData ? { up: '上升', down: '下降', stable: '稳定' }[driftData.drift_direction] || driftData.drift_direction : '--'}
              </div>
            </div>
            <div className={styles.riskCard}>
              <div className={styles.riskCardTitle}>能力评价</div>
              <div className={styles.riskCardValue} style={{ fontSize: 16, color: cpkData?.capability === 'excellent' ? '#10b981' : cpkData?.capability === 'sufficient' ? '#f59e0b' : '#ef4444' }}>
                {cpkData ? { excellent: '优秀', sufficient: '充足', insufficient: '不足', severe_insufficient: '严重不足' }[cpkData.capability] || cpkData.capability : '--'}
              </div>
            </div>
          </div>
        </div>
      )}

      {/* ====== CRITICAL Alert Modal ====== */}
      {result?.risk?.risk_level === 'CRITICAL' && (
        <div className={styles.criticalModal} onClick={() => {}}>
          <div className={styles.criticalModalContent}>
            <div style={{ fontSize: 36, marginBottom: 12 }}>&#9888;</div>
            <h3 style={{ color: '#ef4444', marginBottom: 8 }}>越限风险警告</h3>
            <p style={{ color: 'var(--text-secondary)', marginBottom: 16 }}>
              越限概率: <strong style={{ color: '#ef4444' }}>{(result.risk.breach_prob * 100).toFixed(1)}%</strong>
              <br />方向: {result.risk.breach_direction === 'upper' ? '上限' : '下限'}
            </p>
            <button
              style={{ padding: '8px 24px', background: '#ef4444', color: 'white', border: 'none', borderRadius: 6, cursor: 'pointer', fontSize: 14 }}
              onClick={(e) => { e.stopPropagation(); setResult(r => r ? { ...r, risk: { ...r.risk!, risk_level: 'HIGH' } } : r) }}
            >
              确认
            </button>
          </div>
        </div>
      )}
```

- [ ] **Step 4: Verify frontend builds**

Run: `cd /home/erribaba/git-workstation/FT1-MONITOR/frontend && npx vite build 2>&1 | tail -5`

---

## Task 11: P3 — Add sklearn dependency + feature engineering + correlation

**Covers:** [S4-P3], [S7]

**Files:**
- Modify: `backend/requirements.txt`
- Modify: `backend/app/api/predict.py`

- [ ] **Step 1: Uncomment pandas and add sklearn to requirements.txt**

Add after `statsmodels>=0.14.0`:
```
pandas>=2.1.0
scikit-learn>=1.3.0
```

Remove the `#` comment from the pandas line.

- [ ] **Step 2: Add correlation endpoint**

```python
@router.get("/correlation")
def correlation(
    product: str = Query(...),
):
    """Pearson correlation matrix for all indicators of a product."""
    indicators = storage.get_indicators()
    if not indicators:
        return {"success": False, "message": "No indicators found"}

    indicator_codes = [i['code'] for i in indicators]
    data_by_indicator = {}
    for code in indicator_codes:
        raw = storage.get_recent_data(indicator_code=code, product_code=product, limit=500)
        if len(raw) >= 30:
            vals = [d['value'] for d in reversed(raw)]
            data_by_indicator[code] = np.array(vals, dtype=float)

    valid_codes = [c for c in indicator_codes if c in data_by_indicator]
    if len(valid_codes) < 2:
        return {"success": False, "message": "Not enough indicators with data"}

    # Align to min length
    min_len = min(len(v) for v in data_by_indicator.values())
    matrix_data = {c: data_by_indicator[c][:min_len] for c in valid_codes}

    from scipy.stats import pearsonr
    n = len(valid_codes)
    corr_matrix = [[0.0] * n for _ in range(n)]
    p_matrix = [[0.0] * n for _ in range(n)]

    for i in range(n):
        for j in range(n):
            if i == j:
                corr_matrix[i][j] = 1.0
                p_matrix[i][j] = 0.0
            elif j > i:
                r, p = pearsonr(matrix_data[valid_codes[i]], matrix_data[valid_codes[j]])
                corr_matrix[i][j] = round(r, 4)
                corr_matrix[j][i] = round(r, 4)
                p_matrix[i][j] = round(p, 6)
                p_matrix[j][i] = round(p, 6)

    return {
        "success": True,
        "data": {
            "indicators": valid_codes,
            "correlation_matrix": corr_matrix,
            "p_values": p_matrix,
        },
    }
```

- [ ] **Step 3: Add `/feature/importance` endpoint**

```python
@router.get("/feature/importance")
def feature_importance(
    product: str = Query(...),
    indicator: str = Query(...),
):
    """Feature importance using GBDT on lag features."""
    try:
        from sklearn.ensemble import GradientBoostingRegressor
    except ImportError:
        return {"success": False, "message": "scikit-learn not installed"}

    data = storage.get_recent_data(indicator_code=indicator, product_code=product, limit=500)
    if len(data) < 50:
        return {"success": False, "message": "Not enough data"}

    values = np.array([d['value'] for d in reversed(data)], dtype=float)

    # Build lag features
    lag_n = 5
    X, y = [], []
    for i in range(lag_n, len(values)):
        features = [values[i - j - 1] for j in range(lag_n)]
        # Rolling mean and std
        window = values[max(0, i - 10):i]
        features.append(float(np.mean(window)))
        features.append(float(np.std(window, ddof=1)) if len(window) > 1 else 0.0)
        X.append(features)
        y.append(values[i])

    feature_names = [f'lag_{j + 1}' for j in range(lag_n)] + ['rolling_mean_10', 'rolling_std_10']
    X_arr = np.array(X)
    y_arr = np.array(y)

    model = GradientBoostingRegressor(n_estimators=100, max_depth=3, random_state=42)
    model.fit(X_arr, y_arr)

    importances = model.feature_importances_
    features = sorted(
        [{"name": name, "importance": round(float(imp), 4)} for name, imp in zip(feature_names, importances)],
        key=lambda x: x["importance"], reverse=True,
    )

    return {
        "success": True,
        "data": {
            "indicator": indicator,
            "model": "gbdt",
            "features": features,
        },
    }
```

- [ ] **Step 4: Verify backend with new dependencies**

Run: `cd /home/erribaba/git-workstation/FT1-MONITOR/backend && pip install scikit-learn pandas --quiet && python -c "from backend.app.api.predict import router; print('OK')"`

---

## Task 12: P3 — Frontend correlation heatmap + feature importance chart

**Covers:** [S4-P3]

**Files:**
- Modify: `frontend/src/pages/Prediction/index.tsx`

- [ ] **Step 1: Add state for correlation and feature importance**

```tsx
  const [corrData, setCorrData] = useState<{ indicators: string[]; correlation_matrix: number[][] } | null>(null)
  const [featData, setFeatData] = useState<{ features: Array<{ name: string; importance: number }> } | null>(null)
```

- [ ] **Step 2: Fetch data in `fetchPrediction`**

```tsx
        // Fetch correlation and feature importance (P3)
        const [corrRes, featRes] = await Promise.allSettled([
          api.getCorrelation(productCode),
          api.getFeatureImportance(productCode, indicatorCode),
        ])
        if (corrRes.status === 'fulfilled' && corrRes.value?.success) setCorrData(corrRes.value.data)
        if (featRes.status === 'fulfilled' && featRes.value?.success) setFeatData(featRes.value.data)
```

- [ ] **Step 3: Add correlation heatmap chart option**

```tsx
  const heatmapOption = useMemo(() => {
    if (!corrData?.indicators?.length) return null
    const { indicators, correlation_matrix } = corrData
    const data: [number, number, number][] = []
    for (let i = 0; i < indicators.length; i++) {
      for (let j = 0; j < indicators.length; j++) {
        data.push([j, i, correlation_matrix[i][j]])
      }
    }
    return {
      ...chartTheme,
      tooltip: { formatter: (p: { value: [number, number, number] }) => `${indicators[p.value[1]]} vs ${indicators[p.value[0]]}: ${p.value[2].toFixed(3)}` },
      grid: { left: 80, right: 40, top: 10, bottom: 60 },
      xAxis: { type: 'category' as const, data: indicators, ...chartTheme.xAxis },
      yAxis: { type: 'category' as const, data: indicators, ...chartTheme.yAxis },
      visualMap: { min: -1, max: 1, calculable: true, orient: 'horizontal' as const, left: 'center', bottom: 0,
        inRange: { color: ['#ef4444', '#fde68a', '#10b981'] } },
      series: [{ type: 'heatmap' as const, data, label: { show: true, formatter: (p: { value: [number, number, number] }) => p.value[2].toFixed(2), fontSize: 10 } }],
    }
  }, [corrData])

  const { containerRef: heatmapRef } = useChart(heatmapOption)

  const featureOption = useMemo(() => {
    if (!featData?.features?.length) return null
    const features = featData.features.slice(0, 10)
    return {
      ...chartTheme,
      tooltip: { trigger: 'axis' as const, ...tooltipStyle },
      grid: { left: 120, right: 20, top: 10, bottom: 30 },
      xAxis: { type: 'value' as const, ...chartTheme.xAxis },
      yAxis: { type: 'category' as const, data: features.map(f => f.name).reverse(), ...chartTheme.yAxis },
      series: [{ type: 'bar' as const, data: features.map(f => f.importance).reverse(), itemStyle: { color: 'rgba(0,212,255,0.6)' } }],
    }
  }, [featData])

  const { containerRef: featureRef } = useChart(featureOption)
```

- [ ] **Step 4: Add P3 panels in JSX**

```tsx
      {/* ====== Correlation + Feature Importance ====== */}
      <div className={styles.gridTwo}>
        <div className={styles.panel}>
          <div className={styles.panelHeader}>
            <div className={styles.panelTitle}>
              <span className={styles.panelTitleIcon}><IconBarChart /></span>
              指标关联热力图
            </div>
          </div>
          <div className={styles.panelBody}>
            <div ref={heatmapRef} className={styles.chartContainer} style={{ height: 300 }} />
          </div>
        </div>
        <div className={styles.panel}>
          <div className={styles.panelHeader}>
            <div className={styles.panelTitle}>
              <span className={styles.panelTitleIcon}><IconBarChart /></span>
              特征重要性 (GBDT)
            </div>
          </div>
          <div className={styles.panelBody}>
            <div ref={featureRef} className={styles.chartContainer} style={{ height: 300 }} />
          </div>
        </div>
      </div>
```

- [ ] **Step 5: Verify frontend builds**

Run: `cd /home/erribaba/git-workstation/FT1-MONITOR/frontend && npx vite build 2>&1 | tail -5`

---

## Task 13: End-to-end verification

**Covers:** [S2], [S4], [S7]

- [ ] **Step 1: Start backend and verify all endpoints**

Run: `cd /home/erribaba/git-workstation/FT1-MONITOR && python -m backend.run &`

Wait for startup, then test:
```bash
curl -s "http://127.0.0.1:18080/api/predict/forecast?product=P001&indicator=protein&model=auto&horizon=12" -H "X-API-Key: ft1-monitor-default-key" | python -m json.tool | head -30
```

Expected: Response contains `mase`, `direction_acc`, `risk` fields, no `r_squared`.

- [ ] **Step 2: Test models compare endpoint**

```bash
curl -s "http://127.0.0.1:18080/api/predict/models/compare?product=P001&indicator=protein&horizon=12" -H "X-API-Key: ft1-monitor-default-key" | python -m json.tool
```

- [ ] **Step 3: Test risk endpoints**

```bash
curl -s "http://127.0.0.1:18080/api/predict/risk/breach?product=P001&indicator=protein&horizon=12" -H "X-API-Key: ft1-monitor-default-key" | python -m json.tool
curl -s "http://127.0.0.1:18080/api/predict/risk/cpk?product=P001&indicator=protein" -H "X-API-Key: ft1-monitor-default-key" | python -m json.tool
curl -s "http://127.0.0.1:18080/api/predict/risk/drift?product=P001&indicator=protein" -H "X-API-Key: ft1-monitor-default-key" | python -m json.tool
```

- [ ] **Step 4: Test P3 endpoints**

```bash
curl -s "http://127.0.0.1:18080/api/predict/correlation?product=P001" -H "X-API-Key: ft1-monitor-default-key" | python -m json.tool
curl -s "http://127.0.0.1:18080/api/predict/feature/importance?product=P001&indicator=protein" -H "X-API-Key: ft1-monitor-default-key" | python -m json.tool
```

- [ ] **Step 5: Verify frontend renders correctly**

Start dev server: `cd /home/erribaba/git-workstation/FT1-MONITOR/frontend && npx vite dev`

Open browser to `http://localhost:5173`, navigate to Prediction page, verify:
- KPI cards show MASE and direction accuracy (not R²)
- Risk level shows dynamically (not "暂无越限风险")
- Model selector has ETS, ARIMA, Auto (no MA)
- Model comparison chart renders
- Risk monitoring panel shows Cpk and drift data
- Correlation heatmap and feature importance chart render

- [ ] **Step 6: Commit all changes**

```bash
git add -A
git commit -m "feat: prediction module upgrade P0-P3

P0: MASE + direction accuracy, remove R² KPI, remove MA
P0.5: breach probability + 4-level risk assessment
P1: ADF test + auto model selection + Cpk sliding window + models compare
P2: CUSUM drift detection + 3 new DB tables + risk panel + WebSocket push
P3: sklearn + correlation analysis + GBDT feature importance"
```
