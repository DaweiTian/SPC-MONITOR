# Code Review Fixes Implementation Plan

> **For agentic workers:** REQUIRED SUB-SKILL: Use compose:subagent (recommended) or compose:execute to implement this plan task-by-task. Steps use checkbox (`- [ ]`) syntax for tracking.

**Goal:** Fix all critical, important, and minor issues identified in the comprehensive code review of FT1-MONITOR.

**Architecture:** Three-phase approach: (1) Security & Stability, (2) Code Quality, (3) Robustness. Each phase builds on the previous. Parallel subagents handle independent tasks within each phase.

**Tech Stack:** Python 3.11+ / FastAPI, React 18 / TypeScript / Vite, Rust / Tauri 1.5

---

## Phase 1: Security & Stability (Critical)

### Task 1.1: Add API Authentication Middleware

**Files:**
- Create: `backend/app/core/auth.py`
- Modify: `backend/main.py`
- Modify: `frontend/src/services/api.ts`

- [ ] **Step 1: Create auth middleware**

```python
# backend/app/core/auth.py
import os
from fastapi import Security, HTTPException, status
from fastapi.security import APIKeyHeader

API_KEY = os.environ.get("FT1_API_KEY", "ft1-monitor-default-key")
API_KEY_NAME = "X-API-Key"

api_key_header = APIKeyHeader(name=API_KEY_NAME, auto_error=False)

async def verify_api_key(api_key: str = Security(api_key_header)):
    if api_key == API_KEY:
        return api_key
    raise HTTPException(
        status_code=status.HTTP_401_UNAUTHORIZED,
        detail="Invalid or missing API Key",
    )
```

- [ ] **Step 2: Add auth to all routers in main.py**

```python
# In main.py, add after imports:
from backend.app.core.auth import verify_api_key

# Add dependency to each router:
app.include_router(monitor_router, prefix="/api", dependencies=[Security(verify_api_key)])
# ... repeat for all routers
```

- [ ] **Step 3: Add API key header to frontend API client**

```typescript
// In frontend/src/services/api.ts, add to axios instance:
const API_KEY = localStorage.getItem('ft1_api_key') || 'ft1-monitor-default-key'
http.defaults.headers.common['X-API-Key'] = API_KEY
```

- [ ] **Step 4: Test authentication works**

Run: `curl http://localhost:8000/api/health` (should return 401)
Run: `curl -H "X-API-Key: ft1-monitor-default-key" http://localhost:8000/api/health` (should return 200)

---

### Task 1.2: Fix SQL Injection in Config Queries

**Files:**
- Modify: `backend/app/api/config.py:184,262-263`
- Modify: `backend/app/engine/collector/sqlserver.py:256-261,309,317`

- [ ] **Step 1: Add identifier validation function**

```python
# backend/app/core/validation.py
import re

def validate_identifier(name: str) -> str:
    """Validate SQL identifier (table/column name). Only allow alphanumeric and underscore."""
    if not re.match(r'^[a-zA-Z_][a-zA-Z0-9_]*$', name):
        raise ValueError(f"Invalid SQL identifier: {name}")
    return name
```

- [ ] **Step 2: Apply validation to all f-string SQL queries**

In `config.py:184`:
```python
from backend.app.core.validation import validate_identifier
table_name = validate_identifier(table_name)
result = conn.execute(text(f"SELECT COUNT(*) FROM [{table_name}]"))
```

In `sqlserver.py:256-261`:
```python
self.table_name = validate_identifier(mapping_config.get("table_name", ""))
self.time_column = validate_identifier(mapping_config.get("time_column", ""))
# ... etc for all column names
```

- [ ] **Step 3: Parameterize numeric values**

In `sqlserver.py:317`:
```python
# Before: rep_filter = f"AND p.[RepNoRef] = {self.rep_no_ref}"
# After:
rep_filter = "AND p.[RepNoRef] = :rep_no_ref"
# Then pass {"rep_no_ref": self.rep_no_ref} as params
```

---

### Task 1.3: Fix WebSocket Event Name Mismatch

**Files:**
- Modify: `backend/main.py:111-117` OR `frontend/src/pages/Dashboard/index.tsx:268-269`

- [ ] **Step 1: Align event names**

Change backend to match frontend (easier, fewer changes):
```python
# backend/main.py:111-117
if result.get('new_records', 0) > 0:
    asyncio.run_coroutine_threadsafe(
        broadcast_typed('data_update', result),  # was 'new_data'
        loop
    )
if all_new_alerts:
    asyncio.run_coroutine_threadsafe(
        broadcast_typed('new_alert', {'alerts': all_new_alerts}),  # was 'alert'
        loop
    )
```

---

### Task 1.4: Fix Async Blocking I/O

**Files:**
- Modify: `backend/app/api/monitor.py`
- Modify: `backend/app/api/alerts.py`
- Modify: `backend/app/api/spc.py`
- Modify: `backend/app/api/data.py`
- Modify: `backend/app/api/predict.py`

- [ ] **Step 1: Change async def to def for all endpoints with sync I/O**

```python
# Before:
@router.get("/dashboard")
async def get_dashboard():
    ...

# After:
@router.get("/dashboard")
def get_dashboard():
    ...
```

FastAPI automatically runs synchronous `def` endpoints in a thread pool, so this is the simplest fix.

---

### Task 1.5: Fix Bare except Clauses

**Files:**
- Modify: `backend/app/api/config.py:95,186,268,524`
- Modify: `backend/app/engine/collector/mdb.py:20-24`
- Modify: `backend/main.py:54`

- [ ] **Step 1: Replace bare except with specific exceptions**

```python
# Before:
except Exception:
    pass

# After:
except (json.JSONDecodeError, PermissionError, FileNotFoundError) as e:
    logger.warning(f"Failed to load config from {filepath}: {e}")
```

---

### Task 1.6: Add ErrorBoundary to Frontend

**Files:**
- Create: `frontend/src/components/ErrorBoundary.tsx`
- Modify: `frontend/src/App.tsx`

- [ ] **Step 1: Create ErrorBoundary component**

```typescript
// frontend/src/components/ErrorBoundary.tsx
import React, { Component, ErrorInfo, ReactNode } from 'react'

interface Props {
  children: ReactNode
  fallback?: ReactNode
}

interface State {
  hasError: boolean
  error: Error | null
}

export class ErrorBoundary extends Component<Props, State> {
  constructor(props: Props) {
    super(props)
    this.state = { hasError: false, error: null }
  }

  static getDerivedStateFromError(error: Error): State {
    return { hasError: true, error }
  }

  componentDidCatch(error: Error, errorInfo: ErrorInfo) {
    console.error('ErrorBoundary caught:', error, errorInfo)
  }

  render() {
    if (this.state.hasError) {
      return this.props.fallback || (
        <div style={{ padding: 20, textAlign: 'center' }}>
          <h2>页面加载出错</h2>
          <p>{this.state.error?.message}</p>
          <button onClick={() => this.setState({ hasError: false, error: null })}>
            重试
          </button>
        </div>
      )
    }
    return this.props.children
  }
}
```

- [ ] **Step 2: Wrap App with ErrorBoundary**

```typescript
// frontend/src/App.tsx
import { ErrorBoundary } from './components/ErrorBoundary'

const App: React.FC = () => {
  return (
    <ErrorBoundary>
      <AppProvider>
        ...
      </AppProvider>
    </ErrorBoundary>
  )
}
```

---

### Task 1.7: Fix WebSocket Double Retry Count

**Files:**
- Modify: `frontend/src/services/websocket.ts:59-69`

- [ ] **Step 1: Remove retryCount++ from onerror**

```typescript
// Before (line 61):
this.retryCount++

// After: remove the line, let onclose handle all retry counting
this.ws.onerror = (error) => {
  this._connected = false
  // Don't increment here - onclose will be called after onerror
  if (this.retryCount > this.maxRetries) {
    console.log('WebSocket 重连次数超限，停止重连')
    this.ws?.close()
    return
  }
  console.warn(`WebSocket 连接失败`)
  this.ws?.close()
}
```

---

## Phase 2: Code Quality (Important)

### Task 2.1: Add Pydantic Request Models

**Files:**
- Create: `backend/app/models/requests.py`
- Modify: `backend/app/api/config.py`

- [ ] **Step 1: Create request models**

```python
# backend/app/models/requests.py
from pydantic import BaseModel, Field
from typing import Optional, Dict, Any

class DBConfigRequest(BaseModel):
    enabled: bool = False
    source_type: str = "sqlserver"
    auth_type: str = "windows"
    server: str = ""
    database: str = ""
    username: str = ""
    password: str = ""
    driver: str = "ODBC Driver 17 for SQL Server"
    timeout: int = Field(30, ge=1, le=300)

class MDBConfigRequest(BaseModel):
    enabled: bool = False
    mdb_path: str = ""
    sample_table: str = "Sample"
    product_table: str = "Product"
    component_table: str = "Component"
    prediction_table: str = "Prediction"
    time_column: str = "DateTime"
    product_ref_column: str = "ProdRef"
    product_name_column: str = "Name"
    component_ref_column: str = "CompRef"
    component_name_column: str = "Name"
    value_column: str = "Value"
    indicators: Dict[str, Any] = {}

class FTAConfigRequest(BaseModel):
    enabled: bool = False
    server: str = ""
    database: str = ""
    username: str = ""
    password: str = ""
    driver: str = "ODBC Driver 17 for SQL Server"
    timeout: int = Field(30, ge=1, le=300)

class InstrumentSwitchRequest(BaseModel):
    instrument_id: str = Field(..., pattern="^(mock|ft1|ft120|fta)$")

class UpdateConfigRequest(BaseModel):
    default_frequency_minutes: Optional[int] = Field(None, ge=1, le=1440)
    max_frequency_minutes: Optional[int] = Field(None, ge=1, le=1440)
    spc_window_size: Optional[int] = Field(None, ge=5, le=1000)
    cpk_min_threshold: Optional[float] = Field(None, ge=0, le=10)
    alert_sound_enabled: Optional[bool] = None
    alert_popup_enabled: Optional[bool] = None
    data_retention_days: Optional[int] = Field(None, ge=1, le=3650)
```

- [ ] **Step 2: Use models in endpoints**

```python
# Before:
@router.put("/db")
async def update_db_config(config: dict):
    ...

# After:
from backend.app.models.requests import DBConfigRequest

@router.put("/db")
async def update_db_config(config: DBConfigRequest):
    ...
```

---

### Task 2.2: Extract Collector Utilities

**Files:**
- Create: `backend/app/engine/collector/utils.py`
- Modify: `backend/app/engine/collector/base.py`
- Modify: `backend/app/engine/collector/sqlserver.py`
- Modify: `backend/app/engine/collector/mdb.py`
- Modify: `backend/app/engine/collector/fta.py`

- [ ] **Step 1: Create shared utilities**

```python
# backend/app/engine/collector/utils.py
import json
import os
from datetime import datetime
from typing import Optional, Dict, Any

def parse_datetime(time_str: str) -> Optional[datetime]:
    """Parse datetime string handling both ISO format and custom formats."""
    if not time_str:
        return None
    try:
        if 'T' in str(time_str):
            return datetime.fromisoformat(str(time_str).replace('Z', '+00:00'))
        else:
            return datetime.strptime(str(time_str), '%Y-%m-%d %H:%M:%S')
    except (ValueError, TypeError):
        return None

def load_breakpoint(filepath: str) -> Optional[str]:
    """Load breakpoint timestamp from file."""
    if os.path.exists(filepath):
        try:
            with open(filepath, 'r') as f:
                data = json.load(f)
                return data.get('last_timestamp')
        except (json.JSONDecodeError, KeyError):
            return None
    return None

def save_breakpoint(filepath: str, timestamp: str) -> None:
    """Save breakpoint timestamp to file."""
    with open(filepath, 'w') as f:
        json.dump({'last_timestamp': timestamp}, f)

def load_spec_limits(filepath: str, product_code: Optional[str] = None) -> Dict[str, Any]:
    """Load spec limits from file, handling flat and per-product formats."""
    if not os.path.exists(filepath):
        return {}
    try:
        with open(filepath, 'r', encoding='utf-8') as f:
            data = json.load(f)
        # Check if it's a per-product format
        if product_code and product_code in data:
            return data[product_code]
        # Check if it's a flat format (indicators at top level)
        if any(key in data for key in ['fat', 'protein', 'lactose', 'density']):
            return data
        return data
    except (json.JSONDecodeError, KeyError):
        return {}

def build_connection_string(config: Dict[str, Any]) -> str:
    """Build SQL Server connection string from config."""
    server = config.get('server', '')
    database = config.get('database', '')
    username = config.get('username', '')
    password = config.get('password', '')
    driver = config.get('driver', 'ODBC Driver 17 for SQL Server')
    timeout = config.get('timeout', 30)
    
    driver_encoded = driver.replace(' ', '+')
    
    if config.get('auth_type') == 'windows':
        return f"mssql+pyodbc://{server}/{database}?driver={driver_encoded}&trusted_connection=yes&timeout={timeout}"
    else:
        return f"mssql+pyodbc://{username}:{password}@{server}/{database}?driver={driver_encoded}&timeout={timeout}"
```

- [ ] **Step 2: Update collectors to use shared utilities**

In each collector, replace duplicate implementations with imports from utils.py.

---

### Task 2.3: Fix Cpk Trend Chart (Remove Fake Data)

**Files:**
- Modify: `frontend/src/pages/Capability/index.tsx:338-402`

- [ ] **Step 1: Remove fabricated data generation**

```typescript
// Before:
for (let i = 0; i < 10; i++) {
  const variation = (Math.sin(i * 0.8) * 0.06) + (Math.cos(i * 1.3) * 0.03)
  cpkData.push(+(cpkVal + variation).toFixed(2))
}

// After: Remove the fake data loop. If no historical data exists, show a message:
if (!cpkHistory || cpkHistory.length === 0) {
  return (
    <div className={styles.chartCard}>
      <h3>Cpk 趋势变化</h3>
      <p style={{ color: '#999', textAlign: 'center', padding: 40 }}>
        暂无历史 Cpk 数据
      </p>
    </div>
  )
}
```

---

### Task 2.4: ECharts Selective Import

**Files:**
- Modify: `frontend/src/components/Charts/useChart.ts:2`

- [ ] **Step 1: Replace full import with selective imports**

```typescript
// Before:
import * as echarts from 'echarts'

// After:
import * as echarts from 'echarts/core'
import { LineChart, BarChart, GaugeChart, PieChart } from 'echarts/charts'
import {
  TooltipComponent,
  GridComponent,
  LegendComponent,
  MarkLineComponent,
  DataZoomComponent,
  TitleComponent
} from 'echarts/components'
import { CanvasRenderer } from 'echarts/renderers'

echarts.use([
  LineChart, BarChart, GaugeChart, PieChart,
  TooltipComponent, GridComponent, LegendComponent,
  MarkLineComponent, DataZoomComponent, TitleComponent,
  CanvasRenderer
])
```

---

### Task 2.5: Add Missing Dependencies to requirements.txt

**Files:**
- Modify: `backend/requirements.txt`

- [ ] **Step 1: Add missing packages**

```txt
# Add these lines:
pymssql>=2.2.0
access-parser>=0.4.0
```

---

### Task 2.6: Fix Hardcoded Product Limit

**Files:**
- Modify: `backend/main.py:86`

- [ ] **Step 1: Remove the [:10] limit**

```python
# Before:
for product in products[:10]:

# After:
for product in products:
```

---

### Task 2.7: Fix Memory Config Not Persisted

**Files:**
- Modify: `backend/app/api/config.py:18-26`

- [ ] **Step 1: Persist config to file**

```python
CONFIG_FILE = "runtime_config.json"

def _load_runtime_config() -> dict:
    default = {
        "default_frequency_minutes": 5,
        "max_frequency_minutes": 300,
        "spc_window_size": 30,
        "cpk_min_threshold": 1.33,
        "alert_sound_enabled": True,
        "alert_popup_enabled": True,
        "data_retention_days": 90,
    }
    if os.path.exists(CONFIG_FILE):
        try:
            with open(CONFIG_FILE, 'r') as f:
                saved = json.load(f)
                default.update(saved)
        except Exception:
            pass
    return default

_config = _load_runtime_config()

@router.put("")
async def update_config(config: dict):
    _config.update(config)
    # Persist to file
    with open(CONFIG_FILE, 'w') as f:
        json.dump(_config, f)
    return {"success": True, "config": _config}
```

---

### Task 2.8: Add Route-Level Code Splitting

**Files:**
- Modify: `frontend/src/App.tsx`

- [ ] **Step 1: Add lazy imports**

```typescript
import React, { Suspense } from 'react'

const Dashboard = React.lazy(() => import('./pages/Dashboard'))
const SPCPage = React.lazy(() => import('./pages/SPC'))
const CapabilityPage = React.lazy(() => import('./pages/Capability'))
const AlertsPage = React.lazy(() => import('./pages/Alerts'))
const ConfigPage = React.lazy(() => import('./pages/Config'))
const DataPage = React.lazy(() => import('./pages/Data'))
const HelpPage = React.lazy(() => import('./pages/Help'))
const PredictionPage = React.lazy(() => import('./pages/Prediction'))

// In render:
<Suspense fallback={<div>加载中...</div>}>
  <Routes>
    ...
  </Routes>
</Suspense>
```

Note: Each page needs a default export for lazy loading to work.

---

### Task 2.9: Fix CORS Configuration

**Files:**
- Modify: `backend/main.py:28-34`

- [ ] **Step 1: Read CORS from environment**

```python
import os

CORS_ORIGINS = os.environ.get("FT1_CORS_ORIGINS", "http://localhost:5173,http://localhost:5174").split(",")

app.add_middleware(
    CORSMiddleware,
    allow_origins=CORS_ORIGINS,
    allow_credentials=True,
    allow_methods=["GET", "POST", "PUT", "DELETE"],
    allow_headers=["Content-Type", "X-API-Key", "Authorization"],
)
```

---

### Task 2.10: Fix Error Response Consistency

**Files:**
- Create: `backend/app/models/responses.py`
- Modify: `backend/app/api/config.py`
- Modify: `backend/app/api/alerts.py`
- Modify: `backend/app/api/spc.py`

- [ ] **Step 1: Create standard error response**

```python
# backend/app/models/responses.py
from pydantic import BaseModel
from typing import Optional, Any

class ErrorResponse(BaseModel):
    success: bool = False
    error: str
    detail: Optional[str] = None

class SuccessResponse(BaseModel):
    success: bool = True
    message: Optional[str] = None
    data: Optional[Any] = None
```

---

## Phase 3: Robustness (Minor Improvements)

### Task 3.1: Fix Version Inconsistency

**Files:**
- Modify: `backend/main.py:26`
- Modify: `launcher/Cargo.toml:3`
- Modify: `frontend/package.json:3`

- [ ] **Step 1: Set consistent version**

Set all to `1.5.1`:
```python
# backend/main.py
app = FastAPI(title="液奶过程监控系统", version="1.5.1")
```
```toml
# launcher/Cargo.toml
version = "1.5.1"
```
```json
// frontend/package.json
"version": "1.5.1"
```

---

### Task 3.2: Fix Product Code Inconsistency

**Files:**
- Modify: `backend/app/engine/collector/sqlserver.py:523`
- Modify: `backend/app/engine/collector/mdb.py:372`
- Modify: `backend/app/engine/collector/fta.py:268`

- [ ] **Step 1: Standardize product code generation**

Use the same logic in all collectors:
```python
def _generate_product_code(self, product_name: str) -> str:
    """Generate consistent product code from name."""
    return product_name.strip()
```

---

### Task 3.3: Fix SPC Float Truthiness Check

**Files:**
- Modify: `backend/app/api/spc.py:96`

- [ ] **Step 1: Fix the check**

```python
# Before:
if not spec_limits.get('lsl') and not spec_limits.get('usl'):

# After:
if spec_limits.get('lsl') is None and spec_limits.get('usl') is None:
```

---

### Task 3.4: Add Logging Configuration

**Files:**
- Modify: `backend/main.py`

- [ ] **Step 1: Add logging setup**

```python
import logging

logging.basicConfig(
    level=logging.INFO,
    format='%(asctime)s - %(name)s - %(levelname)s - %(message)s',
    handlers=[
        logging.StreamHandler(),
        logging.FileHandler('logs/backend.log', encoding='utf-8')
    ]
)
```

---

### Task 3.5: Fix Hardcoded Unit in SPC

**Files:**
- Modify: `frontend/src/pages/SPC/index.tsx:325`

- [ ] **Step 1: Use dynamic unit**

```typescript
// Before:
<span className={styles.kpiUnit}>g/100g</span>

// After:
<span className={styles.kpiUnit}>{spcData?.spec_limits?.unit || ''}</span>
```

---

### Task 3.6: Fix Prediction Hardcoded Risk

**Files:**
- Modify: `frontend/src/pages/Prediction/index.tsx:254`

- [ ] **Step 1: Compute risk from predictions**

```typescript
// Before:
{ label: '越限风险评估', value: '低风险', tag: 'success' },

// After:
const riskLevel = computeRiskLevel(predictions, specLimits)
{ label: '越限风险评估', value: riskLevel.label, tag: riskLevel.tag },
```

---

### Task 3.7: Remove Unused Dependencies

**Files:**
- Modify: `backend/requirements.txt`

- [ ] **Step 1: Remove pandas and openpyxl if unused**

```txt
# Remove these if not imported anywhere:
# pandas>=2.1.0
# openpyxl>=3.1.0
```

---

### Task 3.8: Fix monitor_start.json Git Tracking

**Files:**
- Modify: `.gitignore`

- [ ] **Step 1: Add to gitignore**

```gitignore
monitor_start.json
data/
frontend/dist/
```

---

### Task 3.9: Extract Metadata Fetching to Shared Hook

**Files:**
- Create: `frontend/src/hooks/useAppMetadata.ts`
- Modify: All pages that fetch aliases/product status/spec limits

- [ ] **Step 1: Create shared hook**

```typescript
// frontend/src/hooks/useAppMetadata.ts
import { useState, useEffect } from 'react'
import api from '../services/api'

export function useAppMetadata() {
  const [aliases, setAliases] = useState<Record<string, string>>({})
  const [productStatus, setProductStatus] = useState<Record<string, boolean>>({})
  const [specLimits, setSpecLimits] = useState<Record<string, any>>({})
  const [loading, setLoading] = useState(true)

  useEffect(() => {
    Promise.all([
      api.getAliases(),
      api.getProductStatus(),
      api.getSpecLimits(),
    ]).then(([aliasData, statusData, limitsData]) => {
      setAliases(aliasData)
      setProductStatus(statusData)
      setSpecLimits(limitsData)
    }).catch(console.error)
      .finally(() => setLoading(false))
  }, [])

  const getIndicatorName = (code: string) => aliases[code] || code

  return { aliases, productStatus, specLimits, loading, getIndicatorName }
}
```

---

### Task 3.10: Fix localStorage in useState (SSR Safety)

**Files:**
- Modify: `frontend/src/contexts/AppContext.tsx:14-22`
- Modify: `frontend/src/pages/Dashboard/index.tsx:63-68`
- Modify: `frontend/src/pages/SPC/index.tsx:47`

- [ ] **Step 1: Use lazy initializer**

```typescript
// Before:
const [product, setProduct] = useState(localStorage.getItem('lastProduct') || '')

// After:
const [product, setProduct] = useState(() => {
  try {
    return localStorage.getItem('lastProduct') || ''
  } catch {
    return ''
  }
})
```

---

## Execution Order

**Phase 1 (Security & Stability):**
1. Task 1.1 (Auth) + Task 1.2 (SQL Injection) + Task 1.6 (ErrorBoundary) — parallel
2. Task 1.3 (WebSocket events) + Task 1.4 (Async blocking) + Task 1.7 (WS retry) — parallel
3. Task 1.5 (Bare except) — sequential after 1.4

**Phase 2 (Code Quality):**
1. Task 2.1 (Pydantic models) + Task 2.2 (Collector utils) + Task 2.4 (ECharts) — parallel
2. Task 2.3 (Cpk chart) + Task 2.5 (Dependencies) + Task 2.6 (Product limit) — parallel
3. Task 2.7 (Config persist) + Task 2.8 (Code splitting) + Task 2.9 (CORS) + Task 2.10 (Error responses) — parallel

**Phase 3 (Robustness):**
All tasks in Phase 3 are independent and can run in parallel.
