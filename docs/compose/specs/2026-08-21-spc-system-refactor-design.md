# SPC System Full Refactor Design Spec

> Version: v1.0 | Date: 2026-08-21 | Author: MiMoCode

---

## [S1] Problem Statement

The current spc-monitor project has a working backend with SPC engine, mock data collection, and alert system, but the frontend uses Ant Design's default light theme — far from the industrial-grade dark sci-fi UI specified in the prototype (`docs/index.html`). Key gaps:

- **Visual**: Light theme, no ECharts integration on most pages, no dark mode
- **Missing module**: No prediction/forecasting page
- **Backend gaps**: WebSocket `broadcast_data()` never called, SQLServer collector not activatable, no prediction API
- **Launcher**: Rust launcher has dead code (`config.rs`), stub tray actions, no health checks, no restart logic

## [S2] Solution Overview

Full-stack refactoring in 4 sequential sub-projects:

| # | Sub-project | Scope | Key Deliverable |
|---|------------|-------|-----------------|
| 1 | **Frontend UI Overhaul** | Replace antd with custom dark CSS, restyle all 8 pages, integrate ECharts everywhere | Pixel-perfect dark theme matching prototype |
| 2 | **Backend Enhancement** | Wire WebSocket broadcast, add prediction API, enable data source switching, fix bugs | Real-time push + prediction + flexible collector |
| 3 | **Frontend-Backend Integration** | Connect all pages to real API, add Prediction page, live data flow | Full end-to-end data flow |
| 4 | **Rust Launcher Optimization** | Implement config loading, health checks, restart, tray actions, port management | Production-ready desktop launcher |

## [S3] Design Decisions

### [S3.1] UI Framework: Custom CSS (not antd)

**Decision**: Remove `antd` and `@ant-design/icons` entirely. Build all UI with custom CSS using CSS variables from the prototype.

**Rationale**:
- Prototype uses custom CSS with specific dark sci-fi aesthetic (deep space blue, cyan accents, glow effects)
- antd's theming system cannot replicate the prototype's fine-grained control (custom scrollbar, glow shadows, gradient borders)
- Removing antd reduces bundle size significantly (~1MB)
- All components (tables, forms, selects, buttons, cards) are simple enough to build with raw HTML+CSS

**Trade-off**: More CSS code to write/maintain, but 100% visual fidelity to prototype.

### [S3.2] State Management: No external library

**Decision**: Keep `useState` + `useEffect` pattern. Add custom hooks for repeated patterns.

**Rationale**: Current app has 7 pages with moderate complexity. Zustand/Redux adds unnecessary abstraction. Custom hooks (useProducts, useIndicators, useFetch) solve the code reuse problem without new dependencies.

### [S3.3] Styling Architecture: Single CSS file + CSS Modules

**Decision**: Global variables and base styles in `index.css`. Component-specific styles in co-located `.module.css` files.

**Rationale**: Prototype's CSS variables work well as globals. Component styles stay scoped and maintainable.

### [S3.4] ECharts Integration: Centralized theme + custom hooks

**Decision**: Create a shared ECharts theme config and a `useChart` hook that handles init/dispose/resize lifecycle.

**Rationale**: Current SPC page has manual ECharts management with no cleanup (memory leak). A shared hook prevents this.

### [S3.5] Data Source Switching

**Decision**: Add a `/api/v1/source/switch` endpoint that reads `db_config.json` + `db_mapping.json`, instantiates `SQLServerCollector` or falls back to `MockCollector`. Frontend toggle in Config page.

**Rationale**: User wants flexible Mock ↔ FT1 switching without code changes. The SQLServer collector is already fully implemented.

### [S3.6] Prediction Module

**Decision**: New backend endpoint `/api/v1/predict/forecast` using existing `statsmodels` dependency. Frontend gets a new Prediction page matching the prototype.

**Rationale**: `statsmodels` is already in `requirements.txt`. Implement ETS (exponential smoothing) for short-term prediction, with MA and ARIMA as options.

## [S4] Sub-project 1: Frontend UI Overhaul

### [S4.1] Remove antd Dependencies

- Uninstall `antd` and `@ant-design/icons` from `package.json`
- Remove all `import ... from 'antd'` and `import ... from '@ant-design/icons'`
- Replace antd components with custom HTML+CSS equivalents

### [S4.2] Global Theme (`index.css`)

Replace current light CSS variables with prototype's dark theme:

```
--bg-primary: #0a0e1a       (deep space blue)
--bg-secondary: #0f1420     (dark grey-blue)
--bg-card: #141a2e           (card background)
--bg-sidebar: #0d1120        (sidebar)
--border-color: rgba(64, 159, 255, 0.12)
--accent-cyan: #00d4ff       (primary accent)
--accent-blue: #3b82f6
--accent-purple: #8b5cf6
--accent-green: #10b981
--accent-orange: #f59e0b
--accent-red: #ef4444
```

Plus: custom scrollbar, gradient utilities, glow effects, tag styles, table styles, form controls.

### [S4.3] Layout Component Rewrite

Replace antd `Layout`/`Menu`/`Sider` with custom sidebar matching prototype:
- Sidebar: 220px width, logo area, nav groups with icons, active indicator (cyan left bar + glow)
- Topbar: page title, system info (frequency, product, status), real-time clock
- Content: flex-1 with overflow scroll

Add navigation item: **指标预测** (`/prediction`) — new page.

### [S4.4] Dashboard Page Restyle

- 5 KPI cards (was 4): 今日检测, 待处理预警, 今日采集, 平均Cpk, 采集频率
- Real-time trend chart with ECharts (metric selector: fat/protein/solid)
- Collection status panel (frequency, status, last/next collect, success rate, FT1 connection, manual collect button)
- Product Cpk matrix (grid of product-indicator cards with Cpk values and status colors)
- Latest alerts table (severity tag, description, time)

### [S4.5] SPC Control Chart Page Restyle

- Filter bar: product, indicator, chart type (I-MR / X-bar R), window size
- 4 stats cards: mean, std dev, violation count, process status
- **I Chart**: ECharts line chart with CL/UCL/LCL marklines + USL/LSL + violation points in red
- **MR Chart**: New! Currently data exists but chart not rendered. Add below I chart.
- Nelson rules violation summary

### [S4.6] Capability Page Restyle

- 4 large Cp/Cpk/Pp/Ppk cards with status colors (good/warning/danger)
- **Histogram chart**: New! Normal distribution overlay with spec limits
- **Sigma gauge**: New! ECharts gauge showing sigma level
- PPM, pass rate, CA, capability grade display
- **Cpk trend chart**: New! Line chart showing Cpk over time

### [S4.7] Prediction Page (New)

- Filter bar: product, indicator, model (ETS/MA/ARIMA), forecast horizon
- 4 stats cards: predicted mean, predicted violation time, MAPE, confidence
- **Prediction trend chart**: Historical data + prediction curve + 95% confidence interval + spec limits
- Residual analysis bar chart
- Model evaluation table (MAPE, RMSE, MAE, R-squared, etc.)

### [S4.8] Alert Center Page Restyle

- 3 stat cards: CRITICAL count, WARNING count, INFO count
- Alert trend chart (stacked bar, 7 days)
- Alert rule distribution (pie chart)
- Alert records table with filters (severity, status) + acknowledge button

### [S4.9] Data Management Page Restyle

- Filter bar: product, indicator, date, query button, export CSV/Excel buttons
- Data table with: seq, time, product, indicator, value, unit, USL, LSL, status, source

### [S4.10] Config Management Page Restyle

- Product management table (name, code, indicator count, status, edit)
- Spec limits table (product, indicator, USL, LSL, target, unit, edit)
- Collection frequency table (L0/L1/L2 with conditions)
- Alert rules table (Nelson rules with enable/disable)
- **Data source toggle**: New! Switch between Mock and SQL Server
- DB connection config form (when SQL Server selected)

### [S4.11] Help Page Restyle

- System overview, module descriptions, tech stack, Nelson rules reference table

## [S5] Sub-project 2: Backend Enhancement

### [S5.1] Wire WebSocket Broadcast

In `collect_with_alert()` (main.py), after data collection and alert checking, call `broadcast_data()` to push:
- `type: "new_data"` with new records
- `type: "alert"` with any new alerts
- `type: "stats_update"` with updated dashboard stats

### [S5.2] Prediction API

New endpoint: `GET /api/predict/forecast?product=...&indicator=...&model=...&horizon=...`

Implement in `app/api/predict.py`:
- Fetch recent data from storage
- Apply selected model (ETS/MA/ARIMA) via statsmodels
- Return: historical data, predicted values, confidence intervals, accuracy metrics (MAPE, RMSE, MAE, R-squared)

### [S5.3] Data Source Switching

New endpoint: `POST /api/config/source/switch` with body `{ "source": "mock" | "sqlserver" }`

Logic:
- If "sqlserver": read `db_config.json` + `db_mapping.json`, create `SQLServerCollector.from_config()`, replace active collector
- If "mock": re-instantiate `MockCollector`
- Stop scheduler, swap collector, restart scheduler

### [S5.4] Bug Fixes

- Fix `_is_duplicate()` in `alert/engine.py`: change `generated_at` → `created_at`
- Add data export endpoint: `GET /api/data/export?format=csv|xlsx&product=...&indicator=...&start=...&end=...`

### [S5.5] Remove Dead Code

- Remove or integrate `core/config.py` (Settings), `core/database.py`, `core/dependencies.py`, `models/database.py` (ORM)
- Either use Pydantic response models (`schemas.py`) on endpoints or remove them

## [S6] Sub-project 3: Frontend-Backend Integration

### [S6.1] API Service Update

Update `services/api.ts` to match new/changed endpoints:
- Add prediction API methods
- Add data source switch method
- Add data export method
- Update any changed response shapes

### [S6.2] Prediction Page Integration

Connect the new Prediction page to `/api/predict/forecast`. Display real model output.

### [S6.3] Real-time Data Flow

With WebSocket broadcast wired (S5.1), update Dashboard and other pages to react to real-time pushes:
- Dashboard: auto-refresh trend chart, KPI cards, alerts
- SPC: auto-refresh chart when new data arrives
- Alerts: auto-add new alerts to list

### [S6.4] Data Export

Wire export buttons on Data page to backend export endpoint.

## [S7] Sub-project 4: Rust Launcher Optimization

### [S7.1] Config Loading

- Make `config.rs` actually load/save `config.json` from app data directory
- Use config for: server port, auto-start, log level, Python path
- Wire config into `service.rs` (port from config instead of hardcoded 8000)

### [S7.2] Health Checks & Restart

- Add HTTP health check polling (`GET /api/health`) every 10 seconds
- If health check fails 3 times consecutively, auto-restart the Python process
- Track restart count, log events

### [S7.3] Tray Menu Actions

- Implement `start` tray action: call `service.start_server()`
- Implement `stop` tray action: call `service.stop_server()`
- Update tray menu state (enable/disable items based on server status)

### [S7.4] Port Management

- Read port from config
- Check port availability before starting
- Pass port to Python uvicorn command

### [S7.5] Process Improvements

- Add `CREATE_NO_WINDOW` flag on Windows (hide console)
- Capture stdout/stderr to log files
- Graceful shutdown: send SIGTERM before SIGKILL

## [S8] File Change Summary

### Frontend (major rewrite)

| File | Action | Description |
|------|--------|-------------|
| `package.json` | Modify | Remove antd, @ant-design/icons; add no new deps |
| `src/index.css` | Rewrite | Dark theme CSS variables + global styles |
| `src/App.tsx` | Modify | Add /prediction route |
| `src/components/Layout/index.tsx` | Rewrite | Custom sidebar + topbar matching prototype |
| `src/components/Layout/index.module.css` | New | Layout styles |
| `src/components/HelpTooltip/index.tsx` | Restyle | Keep logic, replace antd Popover with custom tooltip |
| `src/components/Charts/useChart.ts` | New | ECharts lifecycle hook |
| `src/components/Charts/theme.ts` | New | Shared ECharts dark theme |
| `src/hooks/useProducts.ts` | New | Product dropdown data hook |
| `src/hooks/useIndicators.ts` | New | Indicator dropdown data hook |
| `src/pages/Dashboard/index.tsx` | Rewrite | Full dashboard with ECharts |
| `src/pages/SPC/index.tsx` | Rewrite | I-MR charts with ECharts |
| `src/pages/Capability/index.tsx` | Rewrite | Histogram + gauge + trend |
| `src/pages/Prediction/index.tsx` | New | Prediction page |
| `src/pages/Alerts/index.tsx` | Rewrite | Alert center with charts |
| `src/pages/Data/index.tsx` | Rewrite | Data management with export |
| `src/pages/Config/index.tsx` | Rewrite | Full config with source switching |
| `src/pages/Help/index.tsx` | Restyle | Dark theme help page |
| `src/services/api.ts` | Modify | Add prediction/source/export APIs |
| `src/services/websocket.ts` | Modify | Improve reconnect, add event types |
| `src/types/index.ts` | Modify | Add PredictionData, SourceConfig types |

### Backend (targeted changes)

| File | Action | Description |
|------|--------|-------------|
| `main.py` | Modify | Wire broadcast_data, add prediction router |
| `app/api/predict.py` | New | Prediction endpoint |
| `app/api/config.py` | Modify | Add source switch endpoint |
| `app/api/data.py` | New | Data export endpoint |
| `app/api/websocket.py` | Modify | Add message type routing |
| `app/engine/alert/engine.py` | Fix | Fix generated_at → created_at bug |

### Launcher (targeted changes)

| File | Action | Description |
|------|--------|-------------|
| `src/config.rs` | Rewrite | Real config loading/saving |
| `src/service.rs` | Modify | Health checks, port from config, CREATE_NO_WINDOW |
| `src/tray.rs` | Modify | Implement start/stop actions |
| `src/main.rs` | Modify | Wire config, add health check timer |

## [S9] Execution Order

1. **Sub-project 1** (Frontend UI) — can be done independently, no backend changes needed
2. **Sub-project 2** (Backend) — can be done in parallel with #1
3. **Sub-project 3** (Integration) — depends on both #1 and #2
4. **Sub-project 4** (Launcher) — independent, can be done in parallel

## [S10] Verification Criteria

### Frontend
- `npm run build` succeeds with zero TypeScript errors
- All 8 pages render correctly in browser with dark theme
- ECharts charts display on: Dashboard (trend), SPC (I+MR), Capability (histogram+gauge+cpk trend), Prediction (forecast+residual), Alerts (trend+pie)
- Responsive layout works at 1920x1080 and 1366x768

### Backend
- `python -m pytest` or manual API testing: all endpoints return correct data
- WebSocket broadcasts data after collection
- Prediction endpoint returns valid forecast with accuracy metrics
- Source switching works: Mock → SQLServer → Mock

### Launcher
- `cargo build` succeeds
- Config file is loaded on startup
- Health check detects backend down and restarts
- Tray menu start/stop actions work
