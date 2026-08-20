# SPC System Full Refactor Implementation Plan

> **For agentic workers:** REQUIRED SUB-SKILL: Use compose:subagent (recommended) or compose:execute to implement this plan task-by-task. Steps use checkbox (`- [ ]`) syntax for tracking.

**Goal:** Refactor the FT1-MONITOR SPC system from Ant Design light theme to a custom dark sci-fi UI matching the prototype, add prediction module, wire real-time WebSocket, enable data source switching, and optimize the Rust launcher.

**Architecture:** Frontend is fully rewritten with custom CSS (no antd), all pages use ECharts for visualization. Backend gets new prediction/source-switch/export APIs. WebSocket broadcast is wired into the collection pipeline. Launcher gets real config, health checks, and tray actions.

**Tech Stack:** React 18, TypeScript, ECharts 5, CSS Modules, FastAPI, statsmodels, APScheduler, SQLite, Tauri (Rust)

## Global Constraints

- All CSS variables must match `docs/index.html` prototype exactly
- All UI text is in Chinese (no i18n)
- Backend runs on port 8000, frontend dev on 5173
- ECharts instances must be disposed on component unmount
- WebSocket reconnection uses exponential backoff (1s → 2s → 4s → 8s → max 30s)
- No new npm dependencies beyond what's in current package.json (minus antd)
- Python dependencies stay as listed in requirements.txt
- All API responses use consistent `{ success: boolean, data: T, message?: string }` shape where applicable

---

## Sub-project 1: Frontend UI Overhaul

### Task 1: Remove antd & Install CSS Foundation

**Covers:** [S4.1], [S4.2]

**Files:**
- Modify: `frontend/package.json`
- Rewrite: `frontend/src/index.css`
- Modify: `frontend/src/main.tsx`

**Steps:**

- [ ] **Step 1: Remove antd dependencies**

```bash
cd /home/erribaba/git-workstation/FT1-MONITOR/frontend
npm uninstall antd @ant-design/icons
```

- [ ] **Step 2: Rewrite `src/index.css` with dark theme**

Replace the entire file with the prototype's CSS variable system. This is the foundation for all components.

```css
/* ========== Global Variables ========== */
:root {
  --bg-primary: #0a0e1a;
  --bg-secondary: #0f1420;
  --bg-card: #141a2e;
  --bg-card-hover: #1a2138;
  --bg-sidebar: #0d1120;
  --border-color: rgba(64, 159, 255, 0.12);
  --border-glow: rgba(0, 212, 255, 0.3);
  --text-primary: #e2e8f0;
  --text-secondary: #8b95a7;
  --text-muted: #4a5568;
  --accent-cyan: #00d4ff;
  --accent-blue: #3b82f6;
  --accent-purple: #8b5cf6;
  --accent-green: #10b981;
  --accent-orange: #f59e0b;
  --accent-red: #ef4444;
  --gradient-cyan: linear-gradient(135deg, #00d4ff 0%, #0066ff 100%);
  --gradient-purple: linear-gradient(135deg, #8b5cf6 0%, #3b82f6 100%);
  --gradient-green: linear-gradient(135deg, #10b981 0%, #059669 100%);
  --gradient-orange: linear-gradient(135deg, #f59e0b 0%, #d97706 100%);
  --gradient-red: linear-gradient(135deg, #ef4444 0%, #dc2626 100%);
  --glow-cyan: 0 0 20px rgba(0, 212, 255, 0.3);
  --glow-green: 0 0 20px rgba(16, 185, 129, 0.3);
  --glow-orange: 0 0 20px rgba(245, 158, 11, 0.3);
  --glow-red: 0 0 20px rgba(239, 68, 68, 0.3);
}

* { margin: 0; padding: 0; box-sizing: border-box; }

body {
  font-family: 'PingFang SC', 'Microsoft YaHei', -apple-system, sans-serif;
  background: var(--bg-primary);
  color: var(--text-primary);
  overflow: hidden;
  height: 100vh;
}

/* Scrollbar */
::-webkit-scrollbar { width: 6px; height: 6px; }
::-webkit-scrollbar-track { background: var(--bg-secondary); }
::-webkit-scrollbar-thumb { background: rgba(0, 212, 255, 0.2); border-radius: 3px; }
::-webkit-scrollbar-thumb:hover { background: rgba(0, 212, 255, 0.4); }

/* Fade-in animation */
@keyframes fadeIn {
  from { opacity: 0; transform: translateY(8px); }
  to { opacity: 1; transform: translateY(0); }
}

@keyframes pulse {
  0%, 100% { opacity: 1; box-shadow: 0 0 0 0 rgba(16, 185, 129, 0.4); }
  50% { opacity: 0.8; box-shadow: 0 0 0 6px rgba(16, 185, 129, 0); }
}

/* Number font */
.num-font { font-family: 'DIN Alternate', 'Roboto Mono', monospace; }
```

- [ ] **Step 3: Update `main.tsx` — remove antd ConfigProvider if present**

Ensure `main.tsx` only imports `index.css` and renders `<App />`. Remove any antd ConfigProvider wrapper.

- [ ] **Step 4: Verify build compiles (expect errors from missing antd imports)**

```bash
cd /home/erribaba/git-workstation/FT1-MONITOR/frontend
npx tsc --noEmit 2>&1 | head -20
```

Expected: TypeScript errors about missing antd module. This is expected — we'll fix them in subsequent tasks.

- [ ] **Step 5: Commit**

```bash
git add -A
git commit -m "refactor: remove antd, add dark theme CSS foundation"
```

---

### Task 2: Create Shared ECharts Infrastructure

**Covers:** [S3.4]

**Files:**
- Create: `frontend/src/components/Charts/theme.ts`
- Create: `frontend/src/components/Charts/useChart.ts`
- Create: `frontend/src/components/Charts/index.ts`

**Steps:**

- [ ] **Step 1: Create ECharts theme**

```typescript
// frontend/src/components/Charts/theme.ts
import type { EChartsOption } from 'echarts'

export const chartTheme = {
  backgroundColor: 'transparent',
  textStyle: {
    color: '#8b95a7',
    fontFamily: 'PingFang SC, Microsoft YaHei, sans-serif',
  },
  grid: { left: 60, right: 30, top: 30, bottom: 40 },
  xAxis: {
    axisLine: { lineStyle: { color: 'rgba(64,159,255,0.15)' } },
    axisLabel: { color: '#8b95a7', fontSize: 11 },
    splitLine: { lineStyle: { color: 'rgba(64,159,255,0.05)' } },
  },
  yAxis: {
    axisLine: { lineStyle: { color: 'rgba(64,159,255,0.15)' } },
    axisLabel: { color: '#8b95a7', fontSize: 11 },
    splitLine: { lineStyle: { color: 'rgba(64,159,255,0.06)' } },
  },
}

export const tooltipStyle = {
  backgroundColor: 'rgba(20,26,46,0.95)',
  borderColor: 'rgba(0,212,255,0.3)',
  textStyle: { color: '#e2e8f0' },
}
```

- [ ] **Step 2: Create useChart hook**

```typescript
// frontend/src/components/Charts/useChart.ts
import { useRef, useEffect, useCallback } from 'react'
import * as echarts from 'echarts'
import type { EChartsOption } from 'echarts'

export function useChart(option: EChartsOption | null) {
  const containerRef = useRef<HTMLDivElement>(null)
  const chartRef = useRef<echarts.ECharts | null>(null)

  const initChart = useCallback(() => {
    if (!containerRef.current) return
    if (chartRef.current) {
      chartRef.current.dispose()
    }
    chartRef.current = echarts.init(containerRef.current)
  }, [])

  useEffect(() => {
    initChart()
    const handleResize = () => chartRef.current?.resize()
    window.addEventListener('resize', handleResize)
    return () => {
      window.removeEventListener('resize', handleResize)
      chartRef.current?.dispose()
      chartRef.current = null
    }
  }, [initChart])

  useEffect(() => {
    if (chartRef.current && option) {
      chartRef.current.setOption(option, true)
    }
  }, [option])

  return { containerRef, chartRef }
}
```

- [ ] **Step 3: Create barrel export**

```typescript
// frontend/src/components/Charts/index.ts
export { chartTheme, tooltipStyle } from './theme'
export { useChart } from './useChart'
```

- [ ] **Step 4: Commit**

```bash
git add frontend/src/components/Charts/
git commit -m "feat: add shared ECharts theme and useChart hook"
```

---

### Task 3: Create Shared Custom Hooks

**Covers:** [S3.3]

**Files:**
- Create: `frontend/src/hooks/useProducts.ts`
- Create: `frontend/src/hooks/useIndicators.ts`
- Create: `frontend/src/hooks/index.ts`

**Steps:**

- [ ] **Step 1: Create useProducts hook**

```typescript
// frontend/src/hooks/useProducts.ts
import { useState, useEffect } from 'react'
import { api } from '../services'
import type { Product } from '../types'

export function useProducts() {
  const [products, setProducts] = useState<Product[]>([])
  const [loading, setLoading] = useState(true)

  useEffect(() => {
    api.getProducts()
      .then(res => setProducts(res.products || []))
      .catch(console.error)
      .finally(() => setLoading(false))
  }, [])

  return { products, loading }
}
```

- [ ] **Step 2: Create useIndicators hook**

```typescript
// frontend/src/hooks/useIndicators.ts
import { useState, useEffect } from 'react'
import { api } from '../services'
import type { Indicator } from '../types'

export function useIndicators() {
  const [indicators, setIndicators] = useState<Indicator[]>([])
  const [loading, setLoading] = useState(true)

  useEffect(() => {
    api.getIndicators()
      .then(res => setIndicators(res.indicators || []))
      .catch(console.error)
      .finally(() => setLoading(false))
  }, [])

  return { indicators, loading }
}
```

- [ ] **Step 3: Create barrel export**

```typescript
// frontend/src/hooks/index.ts
export { useProducts } from './useProducts'
export { useIndicators } from './useIndicators'
```

- [ ] **Step 4: Commit**

```bash
git add frontend/src/hooks/
git commit -m "feat: add useProducts and useIndicators hooks"
```

---

### Task 4: Rewrite Layout Component

**Covers:** [S4.3]

**Files:**
- Rewrite: `frontend/src/components/Layout/index.tsx`
- Create: `frontend/src/components/Layout/Layout.module.css`

**Steps:**

- [ ] **Step 1: Create Layout CSS module**

Extract all layout styles from `docs/index.html` (lines 54-228) into a CSS module. Key classes: `.app`, `.sidebar`, `.sidebar-logo`, `.logo-icon`, `.logo-text`, `.sidebar-nav`, `.nav-group-title`, `.nav-item`, `.nav-icon`, `.nav-badge`, `.sidebar-footer`, `.status-dot`, `.main`, `.topbar`, `.topbar-title`, `.topbar-info`, `.topbar-status`, `.topbar-clock`, `.content`.

- [ ] **Step 2: Rewrite Layout component**

Replace antd Layout/Menu/Sider with custom div-based layout matching prototype. Add new nav item "指标预测" with route `/prediction`. The component should:
- Accept `children` prop
- Use `useNavigate` + `useLocation` for routing
- Show real-time clock (update every second)
- Show system status indicator with pulse animation
- Support nav badge for alerts count

- [ ] **Step 3: Update App.tsx to add /prediction route**

```typescript
// Add import for PredictionPage
import { PredictionPage } from './pages/Prediction'

// Add route
<Route path="/prediction" element={<PredictionPage />} />
```

- [ ] **Step 4: Verify layout renders in browser**

```bash
cd /home/erribaba/git-workstation/FT1-MONITOR/frontend
npm run dev
```

Open http://localhost:5173 — sidebar and topbar should render with dark theme.

- [ ] **Step 5: Commit**

```bash
git add frontend/src/components/Layout/ frontend/src/App.tsx
git commit -m "refactor: rewrite Layout with custom dark sidebar and topbar"
```

---

### Task 5: Rewrite Dashboard Page

**Covers:** [S4.4]

**Files:**
- Rewrite: `frontend/src/pages/Dashboard/index.tsx`
- Create: `frontend/src/pages/Dashboard/Dashboard.module.css`

**Steps:**

- [ ] **Step 1: Create Dashboard CSS module**

Extract KPI card styles, grid layouts, panel styles, collect-status styles, product-matrix styles from prototype (lines 230-837). Key classes: `.kpi-grid`, `.kpi-card`, `.kpi-header`, `.kpi-label`, `.kpi-icon`, `.kpi-value`, `.kpi-unit`, `.kpi-trend`, `.panel`, `.panel-header`, `.panel-title`, `.panel-body`, `.grid-2-1`, `.grid-2`, `.collect-status`, `.product-matrix`, `.live-indicator`.

- [ ] **Step 2: Rewrite Dashboard component**

Match prototype layout:
1. 5 KPI cards in a row (今日检测, 待处理预警, 今日采集, 平均Cpk, 采集频率) with trend indicators
2. 2-column layout: left = real-time trend chart (ECharts with metric selector), right = collection status panel
3. 2-column layout: left = product Cpk matrix, right = latest alerts table

Use `useChart` hook for the trend chart. Fetch data from `api.getDashboard()` and `api.getStatus()`. Subscribe to WebSocket events.

- [ ] **Step 3: Verify Dashboard renders with mock data**

Start backend + frontend, check Dashboard page shows KPI cards, trend chart, status panel.

- [ ] **Step 4: Commit**

```bash
git add frontend/src/pages/Dashboard/
git commit -m "refactor: rewrite Dashboard with dark theme and ECharts trend"
```

---

### Task 6: Rewrite SPC Control Chart Page

**Covers:** [S4.5]

**Files:**
- Rewrite: `frontend/src/pages/SPC/index.tsx`
- Create: `frontend/src/pages/SPC/SPC.module.css`

**Steps:**

- [ ] **Step 1: Create SPC CSS module**

Styles for filter bar, stats cards (4-column grid), chart panels with limit tags, violations table.

- [ ] **Step 2: Rewrite SPC page**

Match prototype:
1. Filter bar: product, indicator, chart type selector, window size input, query button
2. 4 stats cards: 均值(X̄), 标准差(σ), 违规点数, 过程状态
3. I Chart panel with UCL/CL/LCL/USL/LSL tag indicators + ECharts line chart
4. MR Chart panel with UCL/CL/LCL tags + ECharts line chart

Use `useChart` hook for both charts. Fetch from `api.getSPCData()`. Render MR chart (currently missing in old code).

- [ ] **Step 3: Verify SPC charts render**

Navigate to /spc, select product/indicator, click query. Both I and MR charts should display with control limits and violation points.

- [ ] **Step 4: Commit**

```bash
git add frontend/src/pages/SPC/
git commit -m "refactor: rewrite SPC page with I-MR charts and dark theme"
```

---

### Task 7: Rewrite Capability Page

**Covers:** [S4.6]

**Files:**
- Rewrite: `frontend/src/pages/Capability/index.tsx`
- Create: `frontend/src/pages/Capability/Capability.module.css`

**Steps:**

- [ ] **Step 1: Create Capability CSS module**

Styles for capability grid (4-column), cap-card with status variants (good/warning/danger), grid layouts.

- [ ] **Step 2: Rewrite Capability page**

Match prototype:
1. Filter bar: product, indicator, query button
2. 4 large Cp/Cpk/Pp/Ppk cards with color-coded status
3. 2-column: left = histogram chart (bar + normal curve overlay + spec limits), right = sigma gauge + PPM/pass-rate/CA/grade info
4. Cpk trend line chart

Use `useChart` hook for histogram, gauge, and trend charts. Fetch from `api.getCapabilityData()`.

- [ ] **Step 3: Verify Capability page renders**

Navigate to /capability, check all 3 charts and 4 stat cards display correctly.

- [ ] **Step 4: Commit**

```bash
git add frontend/src/pages/Capability/
git commit -m "refactor: rewrite Capability page with histogram, gauge, and Cpk trend"
```

---

### Task 8: Create Prediction Page

**Covers:** [S4.7]

**Files:**
- Create: `frontend/src/pages/Prediction/index.tsx`
- Create: `frontend/src/pages/Prediction/Prediction.module.css`

**Steps:**

- [ ] **Step 1: Create Prediction CSS module**

Styles for prediction info cards, chart panels, residual chart, model evaluation table.

- [ ] **Step 2: Create Prediction page component**

Match prototype:
1. Filter bar: product, indicator, model selector (ETS/MA/ARIMA), horizon selector
2. 4 stats cards: 预测均值, 预测越限时间, MAPE, 预测置信度
3. Prediction trend chart: historical data line + prediction dashed line + confidence interval area + spec limit marklines
4. 2-column: left = residual bar chart, right = model evaluation table

Use `useChart` hook. Initially render with mock data (backend API will be added in Task 13). The component should accept prediction data as props or fetch from API.

- [ ] **Step 3: Verify Prediction page renders**

Navigate to /prediction, check charts and cards display with mock data.

- [ ] **Step 4: Commit**

```bash
git add frontend/src/pages/Prediction/
git commit -m "feat: add Prediction page with forecast charts and model evaluation"
```

---

### Task 9: Rewrite Alerts Page

**Covers:** [S4.8]

**Files:**
- Rewrite: `frontend/src/pages/Alerts/index.tsx`
- Create: `frontend/src/pages/Alerts/Alerts.module.css`

**Steps:**

- [ ] **Step 1: Create Alerts CSS module**

Styles for alert stat cards, alert table, tag styles, filter row.

- [ ] **Step 2: Rewrite Alerts page**

Match prototype:
1. 3 stat cards: CRITICAL count, WARNING count, INFO count
2. 2-column: left = alert trend bar chart (7 days stacked), right = alert rule distribution pie chart
3. Alert records table with filters (severity dropdown, status dropdown, reset button) + acknowledge button per row

Use `useChart` hook for trend and pie charts. Fetch from `api.getAlerts()`.

- [ ] **Step 3: Verify Alerts page renders**

Navigate to /alerts, check stat cards, charts, and table display.

- [ ] **Step 4: Commit**

```bash
git add frontend/src/pages/Alerts/
git commit -m "refactor: rewrite Alerts page with trend charts and dark theme"
```

---

### Task 10: Rewrite Data Management Page

**Covers:** [S4.9]

**Files:**
- Rewrite: `frontend/src/pages/Data/index.tsx`
- Create: `frontend/src/pages/Data/Data.module.css`

**Steps:**

- [ ] **Step 1: Create Data CSS module**

Styles for data table, filter row, export buttons, status tags.

- [ ] **Step 2: Rewrite Data page**

Match prototype:
1. Filter bar: product select, indicator select, date input, query button, export CSV button, export Excel button
2. Data table: 序号, 采集时间, 品项, 指标, 检测值, 单位, 规格上限, 规格下限, 状态, 数据来源

Fetch from `api.getRecentData()`. Wire export buttons (initially placeholder, backend export added in Task 15).

- [ ] **Step 3: Verify Data page renders**

Navigate to /data, check table displays with mock data.

- [ ] **Step 4: Commit**

```bash
git add frontend/src/pages/Data/
git commit -m "refactor: rewrite Data page with dark theme table and export buttons"
```

---

### Task 11: Rewrite Config Page

**Covers:** [S4.10]

**Files:**
- Rewrite: `frontend/src/pages/Config/index.tsx`
- Create: `frontend/src/pages/Config/Config.module.css`

**Steps:**

- [ ] **Step 1: Create Config CSS module**

Styles for config tables, forms, toggle switches, section panels.

- [ ] **Step 2: Rewrite Config page**

Match prototype layout (split into sections):
1. 2-column: left = 品项管理 table, right = 规格限配置 table
2. 2-column: left = 采集频率配置 table (L0/L1/L2), right = 预警规则配置 table
3. **Data source section** (new): toggle between Mock/SQL Server, DB config form when SQL Server selected

Replace antd Form/Table/Switch/Input with custom HTML+CSS equivalents. Keep existing API calls for config CRUD.

- [ ] **Step 3: Verify Config page renders**

Navigate to /config, check all tables and forms display correctly.

- [ ] **Step 4: Commit**

```bash
git add frontend/src/pages/Config/
git commit -m "refactor: rewrite Config page with product/spec/rule management"
```

---

### Task 12: Restyle Help Page

**Covers:** [S4.11]

**Files:**
- Rewrite: `frontend/src/pages/Help/index.tsx`
- Create: `frontend/src/pages/Help/Help.module.css`

**Steps:**

- [ ] **Step 1: Create Help CSS module**

Styles for help sections, Nelson rules table, term cards.

- [ ] **Step 2: Restyle Help page**

Match prototype: system overview, module descriptions, tech architecture, Nelson rules reference table. Use dark theme styles.

- [ ] **Step 3: Verify Help page renders**

- [ ] **Step 4: Commit**

```bash
git add frontend/src/pages/Help/
git commit -m "refactor: restyle Help page with dark theme"
```

---

### Task 13: Update HelpTooltip for Custom UI

**Covers:** [S4.3]

**Files:**
- Modify: `frontend/src/components/HelpTooltip/index.tsx`
- Create: `frontend/src/components/HelpTooltip/HelpTooltip.module.css`

**Steps:**

- [ ] **Step 1: Replace antd Popover with custom tooltip**

Replace `import { Popover } from 'antd'` with a custom CSS-only popover component. Keep the `helpContentMap` data and the question-mark trigger button. Style with dark theme.

- [ ] **Step 2: Verify tooltips work on any page**

- [ ] **Step 3: Commit**

```bash
git add frontend/src/components/HelpTooltip/
git commit -m "refactor: replace antd Popover with custom dark tooltip"
```

---

### Task 14: Update Types and API Service

**Covers:** [S3.1], [S6.1]

**Files:**
- Modify: `frontend/src/types/index.ts`
- Modify: `frontend/src/services/api.ts`
- Modify: `frontend/src/services/websocket.ts`

**Steps:**

- [ ] **Step 1: Add new types**

Add to `types/index.ts`:
```typescript
export interface PredictionData {
  historical: { time: string; value: number }[]
  predicted: { time: string; value: number }[]
  confidence_upper: number[]
  confidence_lower: number[]
  metrics: {
    mape: number
    rmse: number
    mae: number
    r_squared: number
  }
  model: string
  horizon: number
  risk: string
}

export interface DataSourceConfig {
  source: 'mock' | 'sqlserver'
  connected: boolean
  last_switch: string
}
```

- [ ] **Step 2: Add new API methods**

Add to `services/api.ts`:
```typescript
getPrediction: (product: string, indicator: string, model: string, horizon: number) =>
  http.get(`/predict/forecast`, { params: { product, indicator, model, horizon } }),
switchDataSource: (source: 'mock' | 'sqlserver') =>
  http.post(`/config/source/switch`, { source }),
getDataSourceStatus: () =>
  http.get(`/config/source/status`),
exportData: (params: { format: string; product?: string; indicator?: string }) =>
  http.get(`/data/export`, { params, responseType: 'blob' }),
```

- [ ] **Step 3: Improve WebSocket service**

Add exponential backoff reconnection (1s → 2s → 4s → 8s → max 30s). Add typed event handlers.

- [ ] **Step 4: Verify TypeScript compiles**

```bash
cd /home/erribaba/git-workstation/FT1-MONITOR/frontend
npx tsc --noEmit
```

Expected: zero errors.

- [ ] **Step 5: Commit**

```bash
git add frontend/src/types/ frontend/src/services/
git commit -m "feat: add prediction/source/export types and API methods"
```

---

## Sub-project 2: Backend Enhancement

### Task 15: Wire WebSocket Broadcast in Collection Pipeline

**Covers:** [S5.1]

**Files:**
- Modify: `backend/main.py`
- Modify: `backend/app/api/websocket.py`

**Steps:**

- [ ] **Step 1: Update websocket.py to support typed messages**

Add message type constants and a typed broadcast helper:
```python
async def broadcast_typed(msg_type: str, data: dict):
    message = json.dumps({"type": msg_type, "data": data, "timestamp": datetime.now().isoformat()})
    await broadcast_data(message)
```

- [ ] **Step 2: Wire broadcast into collect_with_alert() in main.py**

After collection completes, call `broadcast_typed("new_data", ...)`. After alert checking, if new alerts found, call `broadcast_typed("alert", ...)`. After stats update, call `broadcast_typed("stats_update", ...)`.

Note: `collect_with_alert()` runs in APScheduler's thread pool, so use `asyncio.run_coroutine_threadsafe()` to call the async broadcast from sync context.

- [ ] **Step 3: Test WebSocket push**

Start backend, open browser WebSocket client (or frontend), trigger manual collect, verify messages arrive.

- [ ] **Step 4: Commit**

```bash
git add backend/main.py backend/app/api/websocket.py
git commit -m "feat: wire WebSocket broadcast into collection pipeline"
```

---

### Task 16: Add Prediction API

**Covers:** [S5.2]

**Files:**
- Create: `backend/app/api/predict.py`
- Modify: `backend/main.py`

**Steps:**

- [ ] **Step 1: Create prediction router**

```python
# backend/app/api/predict.py
from fastapi import APIRouter, Query
import numpy as np
from scipy import stats

router = APIRouter(prefix="/predict", tags=["prediction"])

storage = None  # injected from main.py

@router.get("/forecast")
def forecast(
    product: str = Query(...),
    indicator: str = Query(...),
    model: str = Query("ets", regex="^(ets|ma|arima)$"),
    horizon: int = Query(12, ge=1, le=100),
):
    # Fetch recent data
    data = storage.get_recent_data(indicator_code=indicator, product_code=product, limit=200)
    if len(data) < 20:
        return {"success": False, "message": "Not enough data (need >= 20 points)"}
    
    values = np.array([d['value'] for d in data])
    times = [d['sample_time'] for d in data]
    
    # Apply model
    if model == "ets":
        predictions, upper, lower = _ets_forecast(values, horizon)
    elif model == "ma":
        predictions, upper, lower = _ma_forecast(values, horizon)
    else:  # arima
        predictions, upper, lower = _arima_forecast(values, horizon)
    
    # Calculate accuracy metrics on last 10% as validation
    # ... MAPE, RMSE, MAE, R-squared
    
    return {
        "success": True,
        "data": {
            "historical": [{"time": t, "value": v} for t, v in zip(times[-60:], values[-60:])],
            "predicted": predictions,
            "confidence_upper": upper,
            "confidence_lower": lower,
            "metrics": {"mape": mape, "rmse": rmse, "mae": mae, "r_squared": r2},
            "model": model,
            "horizon": horizon,
        }
    }
```

Implement `_ets_forecast()`, `_ma_forecast()`, `_arima_forecast()` using statsmodels/numpy.

- [ ] **Step 2: Register prediction router in main.py**

```python
from backend.app.api.predict import router as predict_router
import backend.app.api.predict as predict_module
predict_module.storage = storage
app.include_router(predict_router, prefix="/api")
```

- [ ] **Step 3: Test prediction endpoint**

```bash
curl "http://localhost:8000/api/predict/forecast?product=P001&indicator=fat&model=ets&horizon=12"
```

- [ ] **Step 4: Commit**

```bash
git add backend/app/api/predict.py backend/main.py
git commit -m "feat: add prediction API with ETS/MA/ARIMA models"
```

---

### Task 17: Add Data Source Switching

**Covers:** [S5.3]

**Files:**
- Modify: `backend/app/api/config.py`
- Modify: `backend/main.py`

**Steps:**

- [ ] **Step 1: Add source switch endpoint in config.py**

```python
@router.post("/config/source/switch")
def switch_source(body: dict):
    source = body.get("source", "mock")
    if source == "sqlserver":
        # Load db_config.json and db_mapping.json
        # Create SQLServerCollector.from_config()
        # Return success/error
    elif source == "mock":
        # Create MockCollector
        # Return success
    # Signal main.py to swap collector
```

- [ ] **Step 2: Add collector swap logic in main.py**

Add an endpoint or mechanism to swap the active collector at runtime. Stop scheduler, replace collector, restart scheduler.

- [ ] **Step 3: Add source status endpoint**

```python
@router.get("/config/source/status")
def get_source_status():
    return {"source": "mock"|"sqlserver", "connected": True|False}
```

- [ ] **Step 4: Commit**

```bash
git add backend/app/api/config.py backend/main.py
git commit -m "feat: add data source switching between Mock and SQLServer"
```

---

### Task 18: Add Data Export Endpoint

**Covers:** [S5.4]

**Files:**
- Create: `backend/app/api/data.py`
- Modify: `backend/main.py`

**Steps:**

- [ ] **Step 1: Create data export router**

```python
# backend/app/api/data.py
from fastapi import APIRouter, Query
from fastapi.responses import StreamingResponse
import csv
import io

router = APIRouter(prefix="/data", tags=["data"])
storage = None

@router.get("/export")
def export_data(
    format: str = Query("csv", regex="^(csv|xlsx)$"),
    product: str = Query(None),
    indicator: str = Query(None),
):
    data = storage.get_recent_data(indicator_code=indicator, product_code=product, limit=10000)
    
    if format == "csv":
        output = io.StringIO()
        writer = csv.DictWriter(output, fieldnames=data[0].keys() if data else [])
        writer.writeheader()
        writer.writerows(data)
        output.seek(0)
        return StreamingResponse(
            iter([output.getvalue()]),
            media_type="text/csv",
            headers={"Content-Disposition": "attachment; filename=export.csv"}
        )
```

- [ ] **Step 2: Register router in main.py**

- [ ] **Step 3: Test export**

```bash
curl "http://localhost:8000/api/data/export?format=csv" -o test.csv
```

- [ ] **Step 4: Commit**

```bash
git add backend/app/api/data.py backend/main.py
git commit -m "feat: add CSV data export endpoint"
```

---

### Task 19: Fix Bugs and Clean Dead Code

**Covers:** [S5.4], [S5.5]

**Files:**
- Modify: `backend/app/engine/alert/engine.py`
- Remove or refactor: `backend/app/core/` (unused modules)
- Remove or refactor: `backend/app/models/` (unused ORM/schemas)

**Steps:**

- [ ] **Step 1: Fix _is_duplicate bug in alert/engine.py**

Change `e['generated_at']` to `e['created_at']` in the `_is_duplicate` method.

- [ ] **Step 2: Decision on dead code**

Either integrate the Pydantic schemas into endpoints (add `response_model=`) or remove the unused ORM/schema files. Recommend: keep `schemas.py` and add response models to endpoints for type safety. Remove `models/database.py` (ORM) and `core/database.py` (SQLAlchemy engine) since raw sqlite3 is used.

- [ ] **Step 3: Verify backend starts without errors**

```bash
cd /home/erribaba/git-workstation/FT1-MONITOR
python -m uvicorn backend.main:app --host 127.0.0.1 --port 8000
```

- [ ] **Step 4: Commit**

```bash
git add -A
git commit -m "fix: alert dedup bug, clean unused ORM and SQLAlchemy code"
```

---

## Sub-project 3: Frontend-Backend Integration

### Task 20: Integrate Prediction Page with Backend API

**Covers:** [S6.2]

**Files:**
- Modify: `frontend/src/pages/Prediction/index.tsx`

**Steps:**

- [ ] **Step 1: Replace mock data with API call**

Update Prediction page to fetch from `api.getPrediction()` instead of using hardcoded mock data. Handle loading/error states.

- [ ] **Step 2: Test end-to-end prediction flow**

Start backend + frontend, navigate to /prediction, select product/indicator/model, click predict. Verify chart shows real forecast data.

- [ ] **Step 3: Commit**

```bash
git add frontend/src/pages/Prediction/
git commit -m "feat: integrate Prediction page with backend forecast API"
```

---

### Task 21: Wire Real-time WebSocket Updates Across Pages

**Covers:** [S6.3]

**Files:**
- Modify: `frontend/src/pages/Dashboard/index.tsx`
- Modify: `frontend/src/pages/SPC/index.tsx`
- Modify: `frontend/src/pages/Alerts/index.tsx`

**Steps:**

- [ ] **Step 1: Create WebSocket context provider**

Create `frontend/src/services/WebSocketContext.tsx` that manages the WebSocket connection at the app level (not per-page). Provides `useWebSocket()` hook.

- [ ] **Step 2: Update Dashboard to use WebSocket context**

Subscribe to `new_data`, `alert`, `stats_update` events. Auto-refresh trend chart and KPI cards.

- [ ] **Step 3: Update SPC page to auto-refresh on new data**

Subscribe to `new_data` event, re-fetch SPC data when new data arrives.

- [ ] **Step 4: Update Alerts page to auto-add new alerts**

Subscribe to `alert` event, prepend new alert to the list.

- [ ] **Step 5: Test real-time flow**

Start backend + frontend, wait for automatic collection, verify pages update without manual refresh.

- [ ] **Step 6: Commit**

```bash
git add frontend/src/services/WebSocketContext.tsx frontend/src/pages/
git commit -m "feat: wire real-time WebSocket updates across all pages"
```

---

### Task 22: Wire Data Export

**Covers:** [S6.4]

**Files:**
- Modify: `frontend/src/pages/Data/index.tsx`

**Steps:**

- [ ] **Step 1: Wire export buttons to API**

Connect CSV/Excel export buttons to `api.exportData()`. Trigger file download via blob URL.

- [ ] **Step 2: Test export**

Navigate to /data, click export CSV, verify file downloads with correct data.

- [ ] **Step 3: Commit**

```bash
git add frontend/src/pages/Data/
git commit -m "feat: wire data export buttons to backend API"
```

---

## Sub-project 4: Rust Launcher Optimization

### Task 23: Implement Real Config Loading

**Covers:** [S7.1]

**Files:**
- Rewrite: `launcher/src/config.rs`

**Steps:**

- [ ] **Step 1: Implement config file load/save**

```rust
use serde::{Deserialize, Serialize};
use std::path::PathBuf;

#[derive(Debug, Clone, Serialize, Deserialize)]
pub struct AppConfig {
    pub server_port: u16,
    pub auto_start: bool,
    pub log_level: String,
    pub python_path: String,
}

impl Default for AppConfig {
    fn default() -> Self {
        Self {
            server_port: 8000,
            auto_start: true,
            log_level: "info".into(),
            python_path: "python".into(),
        }
    }
}

impl AppConfig {
    pub fn config_path() -> PathBuf {
        let mut path = dirs::config_dir().unwrap_or_else(|| PathBuf::from("."));
        path.push("ft1-monitor");
        path.push("config.json");
        path
    }

    pub fn load() -> Self {
        let path = Self::config_path();
        if path.exists() {
            let content = std::fs::read_to_string(&path).unwrap_or_default();
            serde_json::from_str(&content).unwrap_or_default()
        } else {
            let config = Self::default();
            config.save();
            config
        }
    }

    pub fn save(&self) {
        let path = Self::config_path();
        if let Some(parent) = path.parent() {
            let _ = std::fs::create_dir_all(parent);
        }
        if let Ok(content) = serde_json::to_string_pretty(self) {
            let _ = std::fs::write(path, content);
        }
    }
}
```

- [ ] **Step 2: Wire config into main.rs**

Load config on startup, pass `server_port` and `python_path` to `ServiceManager`.

- [ ] **Step 3: Commit**

```bash
git add launcher/src/config.rs launcher/src/main.rs
git commit -m "feat: implement real config loading for launcher"
```

---

### Task 24: Add Health Checks and Auto-Restart

**Covers:** [S7.2]

**Files:**
- Modify: `launcher/src/service.rs`
- Modify: `launcher/src/main.rs`

**Steps:**

- [ ] **Step 1: Add health check to ServiceManager**

```rust
pub async fn health_check(&self) -> bool {
    let port = self.port;
    let url = format!("http://127.0.0.1:{}/api/health", port);
    reqwest::get(&url).await.map(|r| r.status().is_ok()).unwrap_or(false)
}
```

- [ ] **Step 2: Add health check timer in main.rs**

Use Tauri's async runtime to poll health every 10 seconds. If 3 consecutive failures, auto-restart the server.

- [ ] **Step 3: Add restart counter and logging**

Track restart count in ServiceManager. Log health check results.

- [ ] **Step 4: Commit**

```bash
git add launcher/src/service.rs launcher/src/main.rs
git commit -m "feat: add health check polling and auto-restart to launcher"
```

---

### Task 25: Implement Tray Menu Actions

**Covers:** [S7.3]

**Files:**
- Modify: `launcher/src/tray.rs`

**Steps:**

- [ ] **Step 1: Implement start/stop tray actions**

Wire the `start` and `stop` menu items to actually call `service.start_server()` and `service.stop_server()`. Update menu item enabled/disabled state based on server running status.

- [ ] **Step 2: Add status indicator to tray**

Update tray icon or tooltip to show server status (running/stopped).

- [ ] **Step 3: Commit**

```bash
git add launcher/src/tray.rs
git commit -m "feat: implement tray start/stop actions and status indicator"
```

---

### Task 26: Port Management and Process Improvements

**Covers:** [S7.4], [S7.5]

**Files:**
- Modify: `launcher/src/service.rs`

**Steps:**

- [ ] **Step 1: Use port from config**

Replace hardcoded `8000` with `self.port` from AppConfig.

- [ ] **Step 2: Check port availability before starting**

```rust
fn is_port_available(port: u16) -> bool {
    std::net::TcpListener::bind(("127.0.0.1", port)).is_ok()
}
```

- [ ] **Step 3: Add CREATE_NO_WINDOW on Windows**

```rust
#[cfg(target_os = "windows")]
use std::os::windows::process::CommandExt;
const CREATE_NO_WINDOW: u32 = 0x08000000;

// In start_server():
#[cfg(target_os = "windows")]
cmd.creation_flags(CREATE_NO_WINDOW);
```

- [ ] **Step 4: Add graceful shutdown**

Send SIGTERM (or Ctrl+C on Windows) before killing the process.

- [ ] **Step 5: Commit**

```bash
git add launcher/src/service.rs
git commit -m "feat: port management, CREATE_NO_WINDOW, graceful shutdown"
```

---

## Final Verification

### Task 27: End-to-End Verification

- [ ] **Step 1: Build frontend**

```bash
cd /home/erribaba/git-workstation/FT1-MONITOR/frontend
npm run build
```

Expected: zero errors, clean build.

- [ ] **Step 2: Start full system**

```bash
cd /home/erribaba/git-workstation/FT1-MONITOR
python -m uvicorn backend.main:app --host 127.0.0.1 --port 8000 &
cd frontend && npm run dev &
```

- [ ] **Step 3: Verify all pages**

Open http://localhost:5173 and navigate through all 8 pages:
1. Dashboard: 5 KPI cards, trend chart, status panel, Cpk matrix, alerts table
2. SPC: I chart + MR chart with control limits
3. Capability: Cp/Cpk/Pp/Ppk cards, histogram, gauge, Cpk trend
4. Prediction: forecast chart with confidence interval
5. Alerts: stat cards, trend chart, pie chart, records table
6. Data: data table with export buttons
7. Config: product/spec/frequency/rule tables, source toggle
8. Help: system overview and Nelson rules

- [ ] **Step 4: Verify real-time updates**

Wait for automatic data collection cycle (5 min or trigger manual), verify Dashboard and Alerts update automatically via WebSocket.

- [ ] **Step 5: Build launcher**

```bash
cd /home/erribaba/git-workstation/FT1-MONITOR/launcher
cargo build
```

Expected: clean build.
