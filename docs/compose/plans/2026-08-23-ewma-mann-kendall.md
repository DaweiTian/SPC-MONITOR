# EWMA 控制图 + Mann-Kendall 趋势检验 Implementation Plan

> **For agentic workers:** REQUIRED SUB-SKILL: Use compose:subagent (recommended) or compose:execute to implement this plan task-by-task. Steps use checkbox (`- [ ]`) syntax for tracking.

**Goal:** Add EWMA control chart to SPC module and Mann-Kendall trend test to prediction module.

**Architecture:** EWMA adds a new chart type to the existing SPC endpoint (`GET /spc/...`) via a `chart_type` parameter. Mann-Kendall adds a `_mann_kendall_test()` function to `predict.py` and exposes results in the forecast response. Both are real-time computations with no database schema changes.

**Tech Stack:** Python (NumPy, SciPy), FastAPI, React, ECharts, TypeScript

## Global Constraints

- σ estimate uses MR-bar / 1.128 (d2 for n=2), consistent with existing `IMRControlChart`
- EWMA λ range: 0.05~0.5, default 0.2
- Mann-Kendall uses sub-sampling for n>500 (same as validation script)
- No database schema changes
- Backward compatible: `chart_type` defaults to `"imr"`, existing behavior unchanged
- All numeric results rounded to 4 decimal places (project convention)

---

### Task 1: EWMA Backend — Engine + API

**Covers:** [S3]

**Files:**
- Modify: `backend/app/engine/spc/control_charts.py` (add `EWMAControlChart` class after line 44)
- Modify: `backend/app/api/spc.py:19-151` (add `chart_type` and `lambda_` params to `get_spc_data`)

**Interfaces:**
- Produces: `EWMAControlChart.calculate(values, lambda_, L)` → `dict` with keys: `ewma_values` (list[float]), `ucl` (list[float]), `lcl` (list[float]), `cl` (float), `violations` (list[int]), `lambda_` (float)
- Produces: `get_spc_data` response gains optional `ewma_chart` field when `chart_type="ewma"`

- [ ] **Step 1: Add EWMAControlChart class to control_charts.py**

Append after the `IMRControlChart` class (after line 44):

```python
class EWMAControlChart:
    """EWMA 指数加权移动平均控制图"""

    def calculate(self, values: np.ndarray, lambda_: float = 0.2, L: float = 3.0) -> dict:
        values = np.array(values, dtype=float)
        n = len(values)
        if n < 2:
            raise ValueError("至少需要 2 个数据点")
        if not (0.05 <= lambda_ <= 0.5):
            raise ValueError("lambda_ 必须在 0.05~0.5 之间")

        # Target mean and sigma from MR-bar (consistent with IMR)
        mu0 = np.mean(values)
        mr = np.abs(np.diff(values))
        mr_bar = np.mean(mr)
        sigma = mr_bar / 1.128

        # EWMA statistics
        ewma = np.empty(n)
        ewma[0] = mu0
        for i in range(1, n):
            ewma[i] = lambda_ * values[i] + (1 - lambda_) * ewma[i - 1]

        # Time-varying control limits
        factor = L * sigma * np.sqrt(lambda_ / (2 - lambda_))
        indices = np.arange(1, n + 1)
        decay = (1 - lambda_) ** (2 * indices)
        ucl = mu0 + factor * np.sqrt(1 - decay)
        lcl = mu0 - factor * np.sqrt(1 - decay)

        # Violations
        violations = [i for i in range(n) if ewma[i] > ucl[i] or ewma[i] < lcl[i]]

        return {
            'ewma_values': [round(float(v), 4) for v in ewma],
            'ucl': [round(float(v), 4) for v in ucl],
            'lcl': [round(float(v), 4) for v in lcl],
            'cl': round(float(mu0), 4),
            'violations': violations,
            'lambda_': lambda_,
        }
```

- [ ] **Step 2: Update spc.py imports**

In `backend/app/api/spc.py`, change line 5 from:
```python
from backend.app.engine.spc.control_charts import IMRControlChart
```
to:
```python
from backend.app.engine.spc.control_charts import IMRControlChart, EWMAControlChart
```

- [ ] **Step 3: Add chart_type and lambda_ parameters to get_spc_data**

In `backend/app/api/spc.py`, modify the `get_spc_data` function signature (line 19-28). Add two new query parameters after `mode`:

```python
@router.get("/spc/{product_code}/{indicator_code}")
def get_spc_data(
    product_code: str,
    indicator_code: str,
    window: int = 30,
    date_from: Optional[str] = Query(None),
    date_to: Optional[str] = Query(None),
    remark: Optional[str] = Query(None),
    mode: str = Query("process", description="分析模式: process=过程分析, stability=稳定性分析"),
    chart_type: str = Query("imr", description="图表类型: imr=I-MR图, ewma=EWMA图"),
    lambda_: float = Query(0.2, ge=0.05, le=0.5, description="EWMA平滑系数"),
):
```

- [ ] **Step 4: Add EWMA calculation branch in get_spc_data**

In `backend/app/api/spc.py`, after the existing I-MR calculation (line 98-101), add an EWMA branch. Replace lines 97-101 with:

```python
    chart_type_lower = chart_type.lower()

    if chart_type_lower == "ewma":
        ewma_chart = EWMAControlChart()
        ewma_result = ewma_chart.calculate(values, lambda_=lambda_)
        # Still compute Nelson rules on raw values for reference
        imr_chart = IMRControlChart()
        imr_result = imr_chart.calculate(values)
        rules = NelsonRules()
        violations = rules.check_all(values, imr_result['i_chart'].cl, imr_result['sigma_estimate'])
    else:
        chart = IMRControlChart()
        result = chart.calculate(values)
        rules = NelsonRules()
        violations = rules.check_all(values, result['i_chart'].cl, result['sigma_estimate'])
```

- [ ] **Step 5: Add ewma_chart to response**

In `backend/app/api/spc.py`, modify the `result_data` dict construction (around line 126). After the `mr_chart` entry, add:

```python
    result_data = {
        "product_code": product_code,
        "indicator_code": indicator_code,
        "chart_type": chart_type_lower,
    }

    if chart_type_lower == "ewma":
        result_data["ewma_chart"] = {
            "values": ewma_result['ewma_values'],
            "ucl": ewma_result['ucl'],
            "lcl": ewma_result['lcl'],
            "cl": ewma_result['cl'],
            "violations": ewma_result['violations'],
            "lambda": ewma_result['lambda_'],
        }
    else:
        result_data["i_chart"] = {
            "cl": round(result['i_chart'].cl, 4),
            "ucl": round(result['i_chart'].ucl, 4),
            "lcl": round(result['i_chart'].lcl, 4),
        }
        result_data["mr_chart"] = {
            "cl": round(result['mr_chart'].cl, 4),
            "ucl": round(result['mr_chart'].ucl, 4),
            "lcl": round(result['mr_chart'].lcl, 4),
        }

    result_data.update({
        "spec_limits": {
            "usl": round(spec_usl, 4) if spec_usl is not None else None,
            "lsl": round(spec_lsl, 4) if spec_lsl is not None else None,
            "mean": round(mean, 4),
            "std": round(std, 4),
        },
        "sigma": round(result['sigma_estimate'], 4) if chart_type_lower != "ewma" else round(float(np.std(values, ddof=1)), 4),
        "data_points": data_points,
        "violations": [asdict(v) for v in violations],
        "analysis_mode": mode,
    })
```

Note: the `result` variable (IMR) is always computed regardless of chart_type, so `result['sigma_estimate']` is available. For EWMA mode, we still use the IMR sigma estimate for consistency.

- [ ] **Step 6: Verify backend works**

Run the backend server and test:
```bash
cd /home/erribaba/git-workstation/FT1-MONITOR
python -c "
from backend.app.engine.spc.control_charts import EWMAControlChart
import numpy as np
chart = EWMAControlChart()
values = np.array([3.9, 3.92, 3.88, 3.95, 3.91, 3.93, 3.89, 3.94, 3.90, 3.96])
r = chart.calculate(values, lambda_=0.2)
print('EWMA values:', r['ewma_values'][:5])
print('CL:', r['cl'])
print('Violations:', r['violations'])
print('Lambda:', r['lambda_'])
"
```
Expected: EWMA values computed, CL = mean of input, no crash.

- [ ] **Step 7: Commit**

```bash
git add backend/app/engine/spc/control_charts.py backend/app/api/spc.py
git commit -m "feat(spc): add EWMA control chart engine and API support"
```

---

### Task 2: Mann-Kendall Backend — predict.py

**Covers:** [S5]

**Files:**
- Modify: `backend/app/api/predict.py` (add `_mann_kendall_test` function, modify `_auto_select_model`, modify `forecast` response)

**Interfaces:**
- Produces: `_mann_kendall_test(values)` → `dict` with keys: `p_value` (float), `z` (float), `trend` (str), `sen_slope` (float), `has_trend` (bool)
- Produces: `forecast` response gains `trend_analysis` field

- [ ] **Step 1: Add _mann_kendall_test function to predict.py**

Add after the `_adf_test` function (after line 287). Import `scipy.stats` is already available via `_lazy_import_statsmodels`; we need `scipy.stats.norm` separately:

```python
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
```

- [ ] **Step 2: Integrate Mann-Kendall into _auto_select_model**

Modify `_auto_select_model` (line 320-338) to call `_mann_kendall_test` and include the result in the return value. Change the function to return a 3-tuple instead of 2-tuple:

```python
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
```

- [ ] **Step 3: Update forecast endpoint to use new return value and add trend_analysis**

In the `forecast` function (line 540-543), update the auto-selection call:

```python
    if model_lower == "auto":
        auto_selected = True
        selected_model, select_reason, mk_result = _auto_select_model(values, horizon)
        model_lower = selected_model
        val_preds, _, _ = _run_forecast(model_lower, train, len(actual))
    else:
        mk_result = _mann_kendall_test(values)
```

Then in the response construction (around line 596), add `trend_analysis` to the `data` dict:

```python
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
```

- [ ] **Step 4: Verify Mann-Kendall works**

```bash
cd /home/erribaba/git-workstation/FT1-MONITOR
python -c "
from backend.app.api.predict import _mann_kendall_test
import numpy as np

# Increasing trend
vals = np.array([3.9 + 0.01*i + np.random.normal(0, 0.02) for i in range(50)])
r = _mann_kendall_test(vals)
print('Increasing test:', r)

# No trend
vals2 = np.array([3.9 + np.random.normal(0, 0.02) for i in range(50)])
r2 = _mann_kendall_test(vals2)
print('No trend test:', r2)
"
```
Expected: First test shows `trend="increasing"`, `has_trend=True`. Second test shows `has_trend=False` (probabilistic, but likely).

- [ ] **Step 5: Commit**

```bash
git add backend/app/api/predict.py
git commit -m "feat(predict): add Mann-Kendall trend test to forecast response"
```

---

### Task 3: EWMA Frontend — SPC Page

**Covers:** [S4]

**Files:**
- Modify: `frontend/src/types/index.ts:60-94` (extend SPCData)
- Modify: `frontend/src/services/api.ts:67-68` (add chart_type and lambda_ params)
- Modify: `frontend/src/pages/SPC/index.tsx` (add EWMA tab, chart, λ slider)

**Interfaces:**
- Consumes: `GET /spc/{product}/{indicator}?chart_type=ewma&lambda_=0.2` → response with `ewma_chart` field
- Produces: EWMA tab in SPC page with interactive λ slider

- [ ] **Step 1: Extend SPCData type**

In `frontend/src/types/index.ts`, add optional fields to the `SPCData` interface (after line 94):

```typescript
  chart_type?: 'imr' | 'ewma'
  ewma_chart?: {
    values: number[]
    ucl: number[]
    lcl: number[]
    cl: number
    violations: number[]
    lambda: number
  }
```

- [ ] **Step 2: Update API service**

In `frontend/src/services/api.ts`, modify `getSPCData` (line 67-68) to accept `chart_type` and `lambda_`:

```typescript
  getSPCData: (productCode: string, indicatorCode: string, window?: number, filters?: { date_from?: string; date_to?: string; remark?: string }, mode?: string, chartType?: string, lambda_?: number, options?: { signal?: AbortSignal }) =>
    http.get<SPCData>(`/spc/${productCode}/${indicatorCode}`, { params: { window, ...filters, mode, chart_type: chartType, lambda_ }, signal: options?.signal }).then(r => r.data),
```

- [ ] **Step 3: Add EWMA state and controls to SPC page**

In `frontend/src/pages/SPC/index.tsx`, add state variables after the existing `analysisMode` state (line 30):

```typescript
  const [chartType, setChartType] = useState<'imr' | 'ewma'>('imr')
  const [ewmaLambda, setEwmaLambda] = useState(0.2)
```

- [ ] **Step 4: Update data fetching to pass chart_type and lambda_**

In the SPC page, find the `api.getSPCData(...)` call and add the new parameters. The call is in the data-fetching effect. Update it to pass `chartType` and `ewmaLambda`:

```typescript
api.getSPCData(filter.product_code, filter.indicator_code, filter.window, 
  { date_from: filter.date_from, date_to: filter.date_to, remark: filter.remark },
  analysisMode, chartType, ewmaLambda, { signal: abortRef.current?.signal })
```

Also add `chartType` and `ewmaLambda` to the dependency array of the fetching effect so data refreshes when they change.

- [ ] **Step 5: Add chart type tab switcher UI**

In the SPC page JSX, add a tab switcher above the chart area (before the I Chart section):

```tsx
{/* Chart Type Tabs */}
<div style={{ display: 'flex', gap: 8, marginBottom: 12 }}>
  <button
    className={`${styles.tabBtn} ${chartType === 'imr' ? styles.tabBtnActive : ''}`}
    onClick={() => setChartType('imr')}
  >
    I-MR 图
  </button>
  <button
    className={`${styles.tabBtn} ${chartType === 'ewma' ? styles.tabBtnActive : ''}`}
    onClick={() => setChartType('ewma')}
  >
    EWMA 图
  </button>
  {chartType === 'ewma' && (
    <div style={{ display: 'flex', alignItems: 'center', gap: 8, marginLeft: 16 }}>
      <span style={{ fontSize: 12, color: 'var(--text-secondary)' }}>λ:</span>
      <input
        type="range"
        min={0.05}
        max={0.5}
        step={0.05}
        value={ewmaLambda}
        onChange={(e) => setEwmaLambda(parseFloat(e.target.value))}
        style={{ width: 120 }}
      />
      <span style={{ fontSize: 12, color: 'var(--text-primary)', minWidth: 30 }}>{ewmaLambda.toFixed(2)}</span>
    </div>
  )}
</div>
```

Check if `styles.tabBtn` and `styles.tabBtnActive` exist in `SPC.module.css`. If not, add them:

```css
.tabBtn {
  padding: 6px 16px;
  border: 1px solid var(--border-color);
  border-radius: 6px;
  background: transparent;
  color: var(--text-secondary);
  cursor: pointer;
  font-size: 13px;
  transition: all 0.2s;
}
.tabBtnActive {
  background: var(--accent-color);
  color: white;
  border-color: var(--accent-color);
}
```

- [ ] **Step 6: Add EWMA chart option**

In `frontend/src/pages/SPC/index.tsx`, add a new `useMemo` for the EWMA chart option (after the I Chart option):

```typescript
  const ewmaChartOption = useMemo<EChartsOption | null>(() => {
    if (!spcData?.ewma_chart) return null
    const { data_points, ewma_chart, spec_limits } = spcData
    const times = data_points.map(p => formatTime(p.time))
    const { values, ucl, lcl, cl, violations } = ewma_chart
    const { usl, lsl } = spec_limits
    const violationSet = new Set(violations)

    const markLineData: NonNullable<MarkLineComponentOption['data']> = [
      { yAxis: cl, lineStyle: { color: '#94a3b8', type: 'solid', width: 1 }, label: { formatter: `CL=${cl.toFixed(3)}`, color: '#94a3b8', fontSize: 10, position: 'insideEndTop' } },
    ]
    if (usl != null) {
      markLineData.push({ yAxis: usl, lineStyle: { color: '#ef4444', type: 'dotted', width: 1.5 }, label: { formatter: `USL=${usl}`, color: '#ef4444', fontSize: 10, position: 'insideEndTop' } })
    }
    if (lsl != null) {
      markLineData.push({ yAxis: lsl, lineStyle: { color: '#ef4444', type: 'dotted', width: 1.5 }, label: { formatter: `LSL=${lsl}`, color: '#ef4444', fontSize: 10, position: 'insideEndTop' } })
    }

    return {
      ...chartTheme,
      tooltip: { trigger: 'axis', ...tooltipStyle },
      xAxis: { type: 'category', data: times, axisLabel: { fontSize: 10, rotate: 30 } },
      yAxis: { type: 'value', name: 'EWMA', nameTextStyle: { color: '#94a3b8', fontSize: 11 }, splitLine: { lineStyle: { color: 'rgba(30,41,59,0.6)' } } },
      series: [
        {
          name: 'EWMA',
          type: 'line',
          data: values,
          symbol: 'none',
          smooth: true,
          lineStyle: { color: '#8b5cf6', width: 2 },
          areaStyle: { color: 'rgba(139,92,246,0.08)' },
          markLine: { data: markLineData, silent: true },
        },
        {
          name: 'UCL',
          type: 'line',
          data: ucl,
          symbol: 'none',
          lineStyle: { color: '#f59e0b', type: 'dashed', width: 1 },
        },
        {
          name: 'LCL',
          type: 'line',
          data: lcl,
          symbol: 'none',
          lineStyle: { color: '#f59e0b', type: 'dashed', width: 1 },
        },
        {
          name: '越界点',
          type: 'scatter',
          data: values.map((v, i) => violationSet.has(i) ? v : null),
          symbolSize: 10,
          itemStyle: { color: '#ef4444' },
        },
      ],
    } as EChartsOption
  }, [spcData])
```

- [ ] **Step 7: Render EWMA chart conditionally**

In the chart rendering section, conditionally show I-MR or EWMA based on `chartType`:

```tsx
{chartType === 'imr' ? (
  <>
    {/* existing I Chart */}
    {/* existing MR Chart */}
  </>
) : (
  <div className={styles.chartContainer}>
    {ewmaChartOption ? (
      <Chart option={ewmaChartOption} />
    ) : (
      <div className={styles.noData}>暂无 EWMA 数据</div>
    )}
  </div>
)}
```

- [ ] **Step 8: Verify frontend renders**

Start the dev server and check:
```bash
cd /home/erribaba/git-workstation/FT1-MONITOR/frontend
npm run dev
```
Navigate to SPC page, click "EWMA 图" tab, verify chart renders with λ slider.

- [ ] **Step 9: Commit**

```bash
git add frontend/src/types/index.ts frontend/src/services/api.ts frontend/src/pages/SPC/index.tsx frontend/src/pages/SPC/SPC.module.css
git commit -m "feat(spc): add EWMA control chart tab with lambda slider"
```

---

### Task 4: Mann-Kendall Frontend — Prediction Page

**Covers:** [S6]

**Files:**
- Modify: `frontend/src/types/index.ts` (add trend_analysis to forecast result type)
- Modify: `frontend/src/pages/Prediction/index.tsx` (add trend analysis KPI card)

**Interfaces:**
- Consumes: `GET /predict/forecast` response with `trend_analysis` field
- Produces: Trend analysis KPI card in prediction page

- [ ] **Step 1: Add trend_analysis to forecast result type**

In `frontend/src/types/index.ts`, find the forecast result type (or add it near the prediction-related types). Add:

```typescript
  trend_analysis?: {
    p_value: number
    z: number
    trend: 'increasing' | 'decreasing' | 'none'
    sen_slope: number
    has_trend: boolean
  }
```

- [ ] **Step 2: Add trend analysis KPI card**

In `frontend/src/pages/Prediction/index.tsx`, after the existing MAPE KPI card (around line 810), add:

```tsx
        {/* Mann-Kendall Trend Analysis Card */}
        <div className={`${styles.kpiCard}`}>
          <div style={{
            position: 'absolute', top: 0, left: 0, right: 0, height: 3,
            background: result?.data?.trend_analysis?.has_trend
              ? (result.data.trend_analysis.trend === 'increasing' ? 'var(--gradient-green)' : '#ef4444')
              : 'var(--gradient-purple)',
          }} />
          <div className={styles.kpiHeader}>
            <span className={styles.kpiLabel}>趋势分析</span>
            <div className={styles.kpiIcon}><IconTrend /></div>
          </div>
          <div className={styles.kpiValue} style={{
            color: result?.data?.trend_analysis?.has_trend
              ? (result.data.trend_analysis.trend === 'increasing' ? '#10b981' : '#ef4444')
              : 'var(--text-muted)',
          }}>
            {result?.data?.trend_analysis
              ? (result.data.trend_analysis.trend === 'increasing' ? '↑ 上升'
                : result.data.trend_analysis.trend === 'decreasing' ? '↓ 下降'
                : '→ 无趋势')
              : '--'}
          </div>
          <div className={styles.kpiTrend} style={{ color: 'var(--text-secondary)' }}>
            {result?.data?.trend_analysis
              ? `p=${result.data.trend_analysis.p_value.toFixed(4)} ${result.data.trend_analysis.p_value < 0.01 ? '***' : result.data.trend_analysis.p_value < 0.05 ? '**' : result.data.trend_analysis.p_value < 0.1 ? '*' : 'n.s.'} | 斜率=${result.data.trend_analysis.sen_slope.toFixed(4)}`
              : '加载中...'}
          </div>
        </div>
```

Check if `IconTrend` exists. If not, use an existing icon or add a simple SVG icon:

```tsx
const IconTrend = () => (
  <svg width="18" height="18" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round">
    <polyline points="23 6 13.5 15.5 8.5 10.5 1 18" />
    <polyline points="17 6 23 6 23 12" />
  </svg>
)
```

- [ ] **Step 3: Verify frontend renders**

Start the dev server, navigate to Prediction page, run a forecast with "自动选择", verify the trend analysis card shows.

- [ ] **Step 4: Commit**

```bash
git add frontend/src/types/index.ts frontend/src/pages/Prediction/index.tsx
git commit -m "feat(predict): add Mann-Kendall trend analysis KPI card"
```
