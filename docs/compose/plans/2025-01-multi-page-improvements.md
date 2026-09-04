# Multi-Page Improvements Implementation Plan

> **For agentic workers:** REQUIRED SUB-SKILL: Use compose:subagent (recommended) or compose:execute to implement this plan task-by-task. Steps use checkbox (`- [ ]`) syntax for tracking.

**Goal:** Fix 18 issues across Data Management, Config Management, Help, and Navigation pages in the spc-monitor system.

**Architecture:** Backend changes add new API endpoints and persist config state. Frontend changes update page components, icons, and layout. Each task is self-contained and independently testable.

**Tech Stack:** React + TypeScript (frontend), FastAPI + SQLite (backend), CSS Modules, SVG icons.

## Global Constraints

- All icons must be SVG line-art matching the cyan/tech theme — no emoji icons
- Disabled products must be filtered from ALL page dropdowns
- Show indicator aliases when configured (alias name, not DB name)
- Charts must always be in DOM (no conditional rendering around chart refs)
- Version: 1.5.1

---

### Task 1: Backend — Data List API

**Covers:** 1.1 (data persistence + browsing all saved data)

**Files:**
- Modify: `backend/app/api/data.py` — add `GET /data/list` endpoint
- Modify: `backend/app/services/storage.py` — add `get_all_data()` method

**Interfaces:**
- Produces: `GET /data/list?page=1&page_size=20&date=2025-01-01&product_code=xxx&indicator_code=xxx` → `{ data: [...], total: N, page: N, page_size: N }`

- [ ] **Step 1: Add `get_all_data()` to storage**

In `backend/app/services/storage.py`, add after `get_recent_data()`:

```python
def get_all_data(
    self,
    page: int = 1,
    page_size: int = 20,
    date: str | None = None,
    product_code: str | None = None,
    indicator_code: str | None = None,
) -> dict[str, Any]:
    conn = self._connect()
    try:
        conditions: list[str] = []
        params: list[Any] = []
        if date:
            conditions.append("sample_time LIKE ?")
            params.append(f"{date}%")
        if product_code:
            conditions.append("product_code = ?")
            params.append(product_code)
        if indicator_code:
            conditions.append("indicator_code = ?")
            params.append(indicator_code)
        where = f"WHERE {' AND '.join(conditions)}" if conditions else ""
        cursor = conn.execute(f"SELECT COUNT(*) FROM monitor_data {where}", params)
        total = cursor.fetchone()[0]
        offset = (page - 1) * page_size
        params.extend([page_size, offset])
        cursor = conn.execute(
            f"SELECT * FROM monitor_data {where} ORDER BY sample_time DESC LIMIT ? OFFSET ?",
            params,
        )
        return {"data": [dict(row) for row in cursor.fetchall()], "total": total, "page": page, "page_size": page_size}
    finally:
        conn.close()
```

- [ ] **Step 2: Add `GET /data/list` endpoint**

In `backend/app/api/data.py`, add before `export_data`:

```python
@router.get("/list")
def list_data(
    page: int = Query(1, ge=1),
    page_size: int = Query(20, ge=1, le=100),
    date: str = Query(None),
    product_code: str = Query(None),
    indicator_code: str = Query(None),
):
    return storage.get_all_data(
        page=page,
        page_size=page_size,
        date=date,
        product_code=product_code,
        indicator_code=indicator_code,
    )
```

- [ ] **Step 3: Add API function to frontend**

In `frontend/src/services/api.ts`, add inside the `api` object:

```typescript
getDataList: (params: { page?: number; page_size?: number; date?: string; product_code?: string; indicator_code?: string }) =>
  http.get('/data/list', { params }).then(r => r.data),
```

- [ ] **Step 4: Verify**

Start backend, call `GET /api/data/list?page=1&page_size=20` — should return `{ data: [], total: 0, page: 1, page_size: 20 }`.

- [ ] **Step 5: Commit**

```bash
git add backend/app/api/data.py backend/app/services/storage.py frontend/src/services/api.ts
git commit -m "feat: add paginated data list API for browsing all saved data"
```

---

### Task 2: Frontend — Data Page Overhaul (1.2, 1.3, 1.4)

**Covers:** 1.2 (remove FTE title), 1.3 (SVG icons), 1.4 (filter alignment + default date)

**Files:**
- Modify: `frontend/src/pages/Data/index.tsx`
- Modify: `frontend/src/pages/Data/Data.module.css`

**Interfaces:**
- Consumes: `api.getDataList()` from Task 1
- Consumes: `useProducts()`, `useIndicators()` hooks

- [ ] **Step 1: Update Data page component**

Replace `frontend/src/pages/Data/index.tsx` with the following changes:

1. Change `fetchData` to use `api.getDataList()` instead of `api.getRecentData()`:
```typescript
const fetchData = useCallback(async () => {
  setLoading(true)
  try {
    const result = await api.getDataList({
      page,
      page_size: PAGE_SIZE,
      date: filter.date || undefined,
      product_code: filter.product_code || undefined,
      indicator_code: filter.indicator_code || undefined,
    })
    setData(result.data || [])
    setTotal(result.total || 0)
  } catch (e) {
    console.error('获取数据失败:', e)
  } finally {
    setLoading(false)
  }
}, [filter.product_code, filter.indicator_code, filter.date, page])
```

2. Add `total` state: `const [total, setTotal] = useState(0)`
3. Remove `product_code` and `indicator_code` from the required filter check — allow browsing without filters.
4. Change auto-fetch useEffect to trigger on filter changes AND page changes:
```typescript
useEffect(() => {
  fetchData()
}, [fetchData])
```

5. Replace panel title (line 110-112):
```tsx
<div className={styles.panelTitle}>
  <svg width="18" height="18" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round">
    <ellipse cx="12" cy="5" rx="9" ry="3" /><path d="M21 12c0 1.66-4 3-9 3s-9-1.34-9-3" />
    <path d="M3 5v14c0 1.66 4 3 9 3s9-1.34 9-3V5" />
  </svg>
  数据管理
</div>
```

6. Replace export button emojis with SVG:
```tsx
<button className={styles.btnGhost} onClick={() => handleExport('csv')}>
  <svg width="14" height="14" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round">
    <path d="M21 15v4a2 2 0 0 1-2 2H5a2 2 0 0 1-2-2v-4" /><polyline points="7 10 12 15 17 10" /><line x1="12" y1="15" x2="12" y2="3" />
  </svg>
  导出CSV
</button>
<button className={styles.btnGhost} onClick={() => handleExport('excel')}>
  <svg width="14" height="14" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round">
    <path d="M14 2H6a2 2 0 0 0-2 2v16a2 2 0 0 0 2 2h12a2 2 0 0 0 2-2V8z" /><polyline points="14 2 14 8 20 8" /><line x1="16" y1="13" x2="8" y2="13" /><line x1="16" y1="17" x2="8" y2="17" /><polyline points="10 9 9 9 8 9" />
  </svg>
  导出Excel
</button>
```

7. Set default date to today:
```typescript
const today = new Date().toISOString().split('T')[0]
const [filter, setFilter] = useState({
  product_code: '',
  indicator_code: '',
  date: today,
})
```

8. Update pagination to use server-side total:
```typescript
const totalPages = Math.max(1, Math.ceil(total / PAGE_SIZE))
```

9. Remove the client-side slicing since data is already paginated from server:
```typescript
const pagedData = data  // already paginated
const startIdx = total === 0 ? 0 : (page - 1) * PAGE_SIZE + 1
const endIdx = Math.min(page * PAGE_SIZE, total)
```

10. Update display text in pagination:
```tsx
显示 {startIdx} - {endIdx} 条，共 {total} 条
```

- [ ] **Step 2: Update CSS for filter alignment**

In `frontend/src/pages/Data/Data.module.css`, change `.panelActions`:
```css
.panelActions {
  display: flex;
  gap: 8px;
  align-items: center;
  flex-wrap: wrap;
}
```

Remove `justify-content: space-between` from `.panelHeader` and add:
```css
.panelHeader {
  display: flex;
  align-items: center;
  padding: 16px 20px;
  border-bottom: 1px solid var(--border-color);
  flex-wrap: wrap;
  gap: 12px;
}
```

- [ ] **Step 3: Verify**

Start frontend, navigate to Data Management page. Should show:
- Title "数据管理" with SVG database icon
- Default date filter set to today
- Data table loads automatically
- Export buttons have SVG icons
- Filter area left-aligned

- [ ] **Step 4: Commit**

```bash
git add frontend/src/pages/Data/index.tsx frontend/src/pages/Data/Data.module.css
git commit -m "feat: data page overhaul - SVG icons, default date, server-side pagination"
```

---

### Task 3: Frontend — Config Page Cleanup (2.1, 2.2, 2.5)

**Covers:** 2.1 (remove 系统配置 title), 2.2 (remove 新增品项 button), 2.5 (remove standalone spec limits card)

**Files:**
- Modify: `frontend/src/pages/Config/index.tsx`

- [ ] **Step 1: Remove page title**

Delete lines 574-578 (the `<h1 className={styles.pageTitle}>` block).

- [ ] **Step 2: Remove 新增品项 button**

Delete lines 587-592 (the `<button className={...} onClick={handleAddProduct}>+ 新增品项</button>`).

- [ ] **Step 3: Remove standalone spec limits card**

Delete lines 669-680 (the entire "规格限配置" card div).

Remove the `SpecLimitsConfig` import (line 4):
```typescript
import { SpecLimitsConfig } from '../../components/SpecLimitsConfig'
```

- [ ] **Step 4: Verify**

Start frontend, navigate to Config page. Should show:
- No "系统配置" heading
- Product management card without "新增品项" button
- No standalone "规格限配置" card
- Edit button still works on products

- [ ] **Step 5: Commit**

```bash
git add frontend/src/pages/Config/index.tsx
git commit -m "feat: config page cleanup - remove title, add button, standalone spec card"
```

---

### Task 4: Backend + Frontend — Dynamic Indicator Count (2.3)

**Covers:** 2.3 (show actual indicator count per product)

**Files:**
- Modify: `backend/app/services/storage.py` — add `get_product_indicator_count()`
- Modify: `backend/app/api/monitor.py` — add endpoint
- Modify: `frontend/src/services/api.ts` — add API call
- Modify: `frontend/src/pages/Config/index.tsx` — use dynamic count

**Interfaces:**
- Produces: `GET /monitor/products/{code}/indicator-count` → `{ count: N }`

- [ ] **Step 1: Add storage method**

In `backend/app/services/storage.py`, add:

```python
def get_product_indicator_count(self, product_code: str) -> int:
    conn = self._connect()
    try:
        cursor = conn.execute(
            "SELECT COUNT(DISTINCT indicator_code) FROM monitor_data WHERE product_code = ?",
            (product_code,),
        )
        return cursor.fetchone()[0]
    finally:
        conn.close()
```

- [ ] **Step 2: Add API endpoint**

In `backend/app/api/monitor.py`, add:

```python
@router.get("/products/{product_code}/indicator-count")
async def get_product_indicator_count(product_code: str):
    count = storage.get_product_indicator_count(product_code)
    return {"count": count}
```

- [ ] **Step 3: Add frontend API call**

In `frontend/src/services/api.ts`, add:

```typescript
getProductIndicatorCount: (productCode: string) =>
  http.get<{ count: number }>(`/monitor/products/${productCode}/indicator-count`).then(r => r.data),
```

- [ ] **Step 4: Update Config page fetchProducts**

In `frontend/src/pages/Config/index.tsx`, update the `fetchProducts` function to fetch indicator counts per product:

Replace the `productList` mapping (around line 240-247):
```typescript
if (productsResult?.products) {
  // Fetch indicator counts for each product
  const countPromises = productsResult.products.map((p: any) =>
    api.getProductIndicatorCount(p.code).catch(() => ({ count: 0 }))
  )
  const counts = await Promise.all(countPromises)
  
  const productList: ProductItem[] = productsResult.products.map((p: any, index: number) => ({
    id: String(index + 1),
    name: p.name,
    code: p.code,
    indicatorCount: counts[index]?.count || 0,
    status: (statusResult as Record<string, string>)[p.code] === 'disabled' ? 'disabled' : 'enabled'
  }))
  setProducts(productList)
}
```

- [ ] **Step 5: Verify**

Start backend + frontend. Navigate to Config → Product Management. Each product should show the actual count of indicators with data (not the total available count).

- [ ] **Step 6: Commit**

```bash
git add backend/app/services/storage.py backend/app/api/monitor.py frontend/src/services/api.ts frontend/src/pages/Config/index.tsx
git commit -m "feat: show dynamic indicator count per product from actual data"
```

---

### Task 5: Frontend — Split Alias Config into Two Cards (2.4)

**Covers:** 2.4 (split alias cards, remove duplicate title)

**Files:**
- Modify: `frontend/src/pages/Config/index.tsx`
- Modify: `frontend/src/components/AliasConfig/index.tsx` — split into two exports or add `mode` prop

**Interfaces:**
- `AliasConfig` component accepts a `mode: 'products' | 'indicators'` prop to render only one section

- [ ] **Step 1: Update AliasConfig component**

In `frontend/src/components/AliasConfig/index.tsx`:

1. Add `mode` prop to interface:
```typescript
interface AliasConfigProps {
  products: Array<{ code: string; name: string }>
  indicators: Array<{ code: string; name: string }>
  onUpdate: () => void
  mode?: 'products' | 'indicators'
}
```

2. Update component to accept mode:
```typescript
export const AliasConfig: React.FC<AliasConfigProps> = ({ products, indicators, onUpdate, mode }) => {
```

3. Remove the duplicate `<h3 className={styles.title}>别名配置</h3>` and `<p className={styles.description}>` from the component (lines 100-103).

4. Wrap product alias section in `{mode !== 'indicators' && (...)}` and indicator section in `{mode !== 'products' && (...)}`.

- [ ] **Step 2: Split into two cards in Config page**

In `frontend/src/pages/Config/index.tsx`, replace the single alias card (lines 650-667) with two cards:

```tsx
{/* ── 品项别名 ─────────────────────── */}
<div className={styles.card} style={{ marginBottom: '20px' }}>
  <div className={styles.cardHeader}>
    <span className={styles.cardTitle}>
      <span className={styles.cardTitleDot} />
      品项别名
    </span>
  </div>
  <div className={styles.cardBody} style={{ padding: 0 }}>
    <AliasConfig
      products={products.map(p => ({ code: p.code, name: p.name }))}
      indicators={availableIndicators}
      onUpdate={() => {}}
      mode="products"
    />
  </div>
</div>

{/* ── 检验项目别名 ─────────────────────── */}
<div className={styles.card} style={{ marginBottom: '20px' }}>
  <div className={styles.cardHeader}>
    <span className={styles.cardTitle}>
      <span className={styles.cardTitleDot} />
      检验项目别名
    </span>
  </div>
  <div className={styles.cardBody} style={{ padding: 0 }}>
    <AliasConfig
      products={products.map(p => ({ code: p.code, name: p.name }))}
      indicators={availableIndicators}
      onUpdate={() => {}}
      mode="indicators"
    />
  </div>
</div>
```

- [ ] **Step 3: Verify**

Config page should show two separate cards: "品项别名" and "检验项目别名", each with only their respective table.

- [ ] **Step 4: Commit**

```bash
git add frontend/src/pages/Config/index.tsx frontend/src/components/AliasConfig/index.tsx
git commit -m "feat: split alias config into two separate cards"
```

---

### Task 6: Backend + Frontend — Alert Rules Persistence (2.7, 2.8)

**Covers:** 2.7 (persist rule toggle), 2.8 (add CPK + spec breach rules)

**Files:**
- Modify: `backend/app/api/config.py` — add alert rules config endpoints
- Modify: `frontend/src/services/api.ts` — add API calls
- Modify: `frontend/src/pages/Config/index.tsx` — load/save rules, add new rules

**Interfaces:**
- `GET /config/alert-rules` → `{ rules: NelsonRule[] }`
- `PUT /config/alert-rules` → save rules state
- New rules: `cpk_below_target` and `spec_limit_breach`

- [ ] **Step 1: Add alert rules config to backend**

In `backend/app/api/config.py`, add:

```python
ALERT_RULES_FILE = "alert_rules.json"

_default_alert_rules = [
    {"id": 1, "rule": "规则1", "description": "1个点超出3σ控制限", "severity": "CRITICAL", "enabled": True, "rule_type": "nelson_1"},
    {"id": 2, "rule": "规则2", "description": "连续9个点在中心线同一侧", "severity": "CRITICAL", "enabled": True, "rule_type": "nelson_2"},
    {"id": 3, "rule": "规则3", "description": "连续6个点递增或递减", "severity": "WARNING", "enabled": True, "rule_type": "nelson_3"},
    {"id": 4, "rule": "规则4", "description": "连续14个点交替升降", "severity": "WARNING", "enabled": True, "rule_type": "nelson_4"},
    {"id": 5, "rule": "规则5", "description": "连续3个点中有2个超出2σ", "severity": "CRITICAL", "enabled": True, "rule_type": "nelson_5"},
    {"id": 6, "rule": "规则6", "description": "连续5个点中有4个超出1σ", "severity": "WARNING", "enabled": False, "rule_type": "nelson_6"},
    {"id": 7, "rule": "规则7", "description": "连续15个点在1σ以内（层叠）", "severity": "INFO", "enabled": False, "rule_type": "nelson_7"},
    {"id": 8, "rule": "规则8", "description": "连续8个点在1σ以外（混合）", "severity": "INFO", "enabled": False, "rule_type": "nelson_8"},
    {"id": 9, "rule": "CPK预警", "description": "CPK低于目标值", "severity": "WARNING", "enabled": True, "rule_type": "cpk_below_target"},
    {"id": 10, "rule": "规格越限", "description": "检测值超出规格线（USL/LSL）", "severity": "CRITICAL", "enabled": True, "rule_type": "spec_limit_breach"},
]


@router.get("/alert-rules")
async def get_alert_rules():
    return _load_json_config(ALERT_RULES_FILE, {"rules": _default_alert_rules})


@router.put("/alert-rules")
async def update_alert_rules(config: dict):
    success = _save_json_config(ALERT_RULES_FILE, config)
    if success:
        return {"success": True, "message": "预警规则已保存"}
    return {"success": False, "message": "保存失败"}
```

- [ ] **Step 2: Add frontend API calls**

In `frontend/src/services/api.ts`, add:

```typescript
getAlertRules: () => http.get<{ rules: Array<{ id: number; rule: string; description: string; severity: string; enabled: boolean; rule_type: string }> }>('/config/alert-rules').then(r => r.data),
updateAlertRules: (config: { rules: Array<{ id: number; rule: string; description: string; severity: string; enabled: boolean; rule_type: string }> }) =>
  http.put('/config/alert-rules', config).then(r => r.data),
```

- [ ] **Step 3: Update Config page to load/save rules**

In `frontend/src/pages/Config/index.tsx`:

1. Replace `INITIAL_NELSON` constant with dynamic loading from API:
```typescript
const [nelsonRules, setNelsonRules] = useState<NelsonRule[]>([])
```

2. Add `rule_type` to `NelsonRule` interface:
```typescript
interface NelsonRule {
  id: number
  rule: string
  description: string
  severity: 'CRITICAL' | 'WARNING' | 'INFO'
  enabled: boolean
  rule_type: string
}
```

3. Load rules on mount in `fetchProducts`:
```typescript
const rulesResult = await api.getAlertRules().catch(() => null)
if (rulesResult?.rules) {
  setNelsonRules(rulesResult.rules)
}
```

4. Update `toggleNelsonRule` to persist:
```typescript
const toggleNelsonRule = async (id: number) => {
  const newRules = nelsonRules.map(r => r.id === id ? { ...r, enabled: !r.enabled } : r)
  setNelsonRules(newRules)
  try {
    await api.updateAlertRules({ rules: newRules })
  } catch (e) {
    console.error('保存预警规则失败:', e)
  }
}
```

- [ ] **Step 4: Verify**

Start backend + frontend. Navigate to Config → Alert Rules. Toggle a rule, refresh page — state should persist. Should see 10 rules including CPK and spec limit rules.

- [ ] **Step 5: Commit**

```bash
git add backend/app/api/config.py frontend/src/services/api.ts frontend/src/pages/Config/index.tsx
git commit -m "feat: persist alert rules state, add CPK and spec limit breach rules"
```

---

### Task 7: Frontend — Frequency Display + Manual Collect (2.6)

**Covers:** 2.6 (auto-degrade frequency display, manual collect button)

**Files:**
- Modify: `frontend/src/pages/Config/index.tsx` — replace static frequency table with dynamic display

**Interfaces:**
- Consumes: `GET /monitor/status` → `{ current_level, current_interval_minutes, frequency_ladder }`
- Consumes: `POST /monitor/collect/manual`

- [ ] **Step 1: Add frequency state**

In `frontend/src/pages/Config/index.tsx`, add state:

```typescript
const [frequencyStatus, setFrequencyStatus] = useState<{
  current_level: number
  current_interval_minutes: number
  frequency_ladder: number[]
  is_collecting: boolean
  last_collect_time: string | null
} | null>(null)
```

- [ ] **Step 2: Fetch frequency status on mount**

Add to the existing `useEffect`:
```typescript
const fetchFrequency = async () => {
  try {
    const status = await api.getStatus()
    setFrequencyStatus(status)
  } catch {}
}
fetchFrequency()
const interval = setInterval(fetchFrequency, 15000)
return () => clearInterval(interval)
```

- [ ] **Step 3: Replace static frequency table**

Replace the frequency card content (lines 692-718) with:

```tsx
<div className={styles.cardBody} style={{ padding: '16px 20px' }}>
  {frequencyStatus ? (
    <>
      <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center', marginBottom: '16px' }}>
        <div>
          <div style={{ fontSize: '24px', fontWeight: 700, color: 'var(--accent-cyan)' }}>
            {frequencyStatus.current_interval_minutes} 分钟
          </div>
          <div style={{ fontSize: '12px', color: 'var(--text-muted)', marginTop: '4px' }}>
            当前采集频率 · L{frequencyStatus.current_level}
          </div>
        </div>
        <button
          className={`${styles.btn} ${styles.btnPrimary}`}
          onClick={async () => {
            await api.manualCollect()
            // Refresh frequency status
            const status = await api.getStatus()
            setFrequencyStatus(status)
          }}
        >
          立即采集
        </button>
      </div>
      <div style={{ display: 'flex', gap: '8px', flexWrap: 'wrap' }}>
        {frequencyStatus.frequency_ladder.map((freq, idx) => (
          <div
            key={idx}
            style={{
              padding: '6px 12px',
              borderRadius: '6px',
              fontSize: '12px',
              background: idx === frequencyStatus.current_level ? 'rgba(0, 212, 255, 0.15)' : 'var(--bg-secondary)',
              border: `1px solid ${idx === frequencyStatus.current_level ? 'var(--accent-cyan)' : 'var(--border-color)'}`,
              color: idx === frequencyStatus.current_level ? 'var(--accent-cyan)' : 'var(--text-muted)',
              fontWeight: idx === frequencyStatus.current_level ? 600 : 400,
            }}
          >
            L{idx} · {freq}min
          </div>
        ))}
      </div>
    </>
  ) : (
    <div style={{ color: 'var(--text-muted)', padding: '20px 0', textAlign: 'center' }}>加载中...</div>
  )}
</div>
```

- [ ] **Step 4: Remove unused FREQUENCY_ROWS constant**

Delete the `FREQUENCY_ROWS` constant (lines 96-100) and its interface (lines 27-32).

- [ ] **Step 5: Verify**

Config page shows dynamic frequency display with current level highlighted, "立即采集" button resets to L0.

- [ ] **Step 6: Commit**

```bash
git add frontend/src/pages/Config/index.tsx
git commit -m "feat: dynamic frequency display with auto-degrade and manual collect"
```

---

### Task 8: Frontend — MDB File Browser (2.9)

**Covers:** 2.9 (file picker for MDB path)

**Files:**
- Modify: `frontend/src/pages/Config/index.tsx`

- [ ] **Step 1: Add file input ref and handler**

In the MDB config section, add a hidden file input and a browse button next to the path input:

Replace the MDB file path form group (lines 953-967):

```tsx
<div className={styles.formGroup}>
  <label className={styles.formLabel}>
    MDB 文件路径
    <span className={styles.formRequired}>*</span>
  </label>
  <div style={{ display: 'flex', gap: '8px' }}>
    <input
      type="text"
      className={styles.formInput}
      style={{ flex: 1 }}
      value={mdbConfig.mdb_path}
      onChange={e => handleMdbConfigChange('mdb_path', e.target.value)}
      placeholder="例: /mnt/d/数据/ft120.mdb 或 C:\Data\ft120.mdb"
    />
    <label className={`${styles.btn} ${styles.btnSecondary}`} style={{ cursor: 'pointer', whiteSpace: 'nowrap' }}>
      <svg width="14" height="14" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round">
        <path d="M22 19a2 2 0 0 1-2 2H4a2 2 0 0 1-2-2V5a2 2 0 0 1 2-2h5l2 3h9a2 2 0 0 1 2 2z" />
      </svg>
      浏览
      <input
        type="file"
        accept=".mdb,.accdb"
        style={{ display: 'none' }}
        onChange={e => {
          const file = e.target.files?.[0]
          if (file) {
            // Use webkitRelativePath or just the file name
            // For Electron/Tauri we'd use a native dialog, but for web we use the file name
            handleMdbConfigChange('mdb_path', file.name)
          }
        }}
      />
    </label>
  </div>
  <span className={styles.formHint}>支持本地 .mdb 文件</span>
</div>
```

Note: In a browser environment, `<input type="file">` doesn't expose the full file path for security reasons. For a desktop app (Electron/Tauri), we'd use the native dialog. For the web version, the browse button shows the file name as a reference. The user can still type the full path manually.

- [ ] **Step 2: Verify**

MDB config section shows the path input with a "浏览" button. Clicking it opens a file picker filtered to .mdb/.accdb files.

- [ ] **Step 3: Commit**

```bash
git add frontend/src/pages/Config/index.tsx
git commit -m "feat: add file browser for MDB path selection"
```

---

### Task 9: Frontend — Help Page HTML Documents (3.1)

**Covers:** 3.1 (embed HTML documents in help page)

**Files:**
- Modify: `frontend/src/pages/Help/index.tsx`
- Modify: `frontend/src/pages/Help/Help.module.css`

**Interfaces:**
- HTML docs at: `/docs/数据分析名词手册.html`, `/docs/数据分析名词可视化手册.html`

- [ ] **Step 1: Add tab state and document sections**

In `frontend/src/pages/Help/index.tsx`:

```tsx
import React, { useState } from 'react'
import styles from './Help.module.css'

// ... existing modules and nelsonRules arrays ...

type TabKey = 'overview' | 'glossary' | 'visual'

export const HelpPage: React.FC = () => {
  const [activeTab, setActiveTab] = useState<TabKey>('overview')

  const tabs: { key: TabKey; label: string }[] = [
    { key: 'overview', label: '系统说明' },
    { key: 'glossary', label: '数据分析名词手册' },
    { key: 'visual', label: '名词可视化手册' },
  ]

  return (
    <div className={styles.container}>
      <div className={styles.tabBar}>
        {tabs.map(tab => (
          <button
            key={tab.key}
            className={activeTab === tab.key ? styles.tabActive : styles.tab}
            onClick={() => setActiveTab(tab.key)}
          >
            {tab.label}
          </button>
        ))}
      </div>

      {activeTab === 'overview' && (
        <>
          <h3 className={styles.sectionTitle}>系统简介</h3>
          <p>
            液奶过程监控系统是一套面向乳制品生产过程的实时SPC分析平台，集成FT1数据定时采集、统计过程控制（SPC）分析、过程能力评估、指标趋势预测和分级预警功能，帮助质量管理人员实时掌握生产过程稳定性。
          </p>
          {/* ... rest of existing content ... */}
        </>
      )}

      {activeTab === 'glossary' && (
        <div className={styles.docFrame}>
          <iframe
            src="/docs/数据分析名词手册.html"
            className={styles.docIframe}
            title="数据分析名词手册"
          />
        </div>
      )}

      {activeTab === 'visual' && (
        <div className={styles.docFrame}>
          <iframe
            src="/docs/数据分析名词可视化手册.html"
            className={styles.docIframe}
            title="数据分析名词可视化手册"
          />
        </div>
      )}
    </div>
  )
}
```

- [ ] **Step 2: Add tab CSS**

In `frontend/src/pages/Help/Help.module.css`, add:

```css
.tabBar {
  display: flex;
  gap: 4px;
  margin-bottom: 24px;
  padding: 4px;
  background: var(--bg-secondary);
  border-radius: 10px;
  border: 1px solid var(--border-color);
}

.tab {
  padding: 10px 20px;
  border-radius: 8px;
  border: none;
  background: transparent;
  color: var(--text-secondary);
  font-size: 13px;
  font-weight: 500;
  cursor: pointer;
  transition: all 0.2s;
}

.tab:hover {
  color: var(--text-primary);
  background: rgba(0, 212, 255, 0.05);
}

.tabActive {
  composes: tab;
  background: var(--gradient-cyan);
  color: #fff;
  box-shadow: 0 2px 8px rgba(0, 212, 255, 0.25);
}

.docFrame {
  border: 1px solid var(--border-color);
  border-radius: 12px;
  overflow: hidden;
  background: #fff;
}

.docIframe {
  width: 100%;
  height: 80vh;
  border: none;
  display: block;
}
```

- [ ] **Step 3: Verify**

Help page shows three tabs. "系统说明" shows existing content. Other tabs load the HTML documents in iframes.

- [ ] **Step 4: Commit**

```bash
git add frontend/src/pages/Help/index.tsx frontend/src/pages/Help/Help.module.css
git commit -m "feat: help page tabs with embedded HTML documents"
```

---

### Task 10: Frontend + Backend — Dynamic Status & Version (4.1, 4.2, 4.3, 4.4)

**Covers:** 4.1 (version 1.5.1), 4.2 (dynamic status text), 4.3 (connection status), 4.4 (status bar UI redesign)

**Files:**
- Modify: `backend/main.py` — version number
- Modify: `frontend/src/components/Layout/index.tsx` — dynamic status, version, UI
- Modify: `frontend/src/components/Layout/Layout.module.css` — status bar styles

**Interfaces:**
- Consumes: `GET /monitor/status` → `{ source, connected, instrument_type }`

- [ ] **Step 1: Update backend version**

In `backend/main.py`, line 25:
```python
app = FastAPI(title="液奶过程监控系统", version="1.5.1")
```

- [ ] **Step 2: Add status state to Layout**

In `frontend/src/components/Layout/index.tsx`:

Add state for source status:
```typescript
const [sourceStatus, setSourceStatus] = useState<{
  source: string
  connected: boolean
  instrument_type: string
}>({ source: 'mock', connected: false, instrument_type: 'mock' })
```

Add fetch in a useEffect alongside the alerts count:
```typescript
useEffect(() => {
  const fetchStatus = async () => {
    try {
      const status = await api.getStatus()
      setSourceStatus({
        source: status.source || 'mock',
        connected: status.connected ?? false,
        instrument_type: status.instrument_type || 'mock',
      })
    } catch {
      // keep default
    }
  }
  fetchStatus()
  const interval = setInterval(fetchStatus, 15000)
  return () => clearInterval(interval)
}, [])
```

- [ ] **Step 3: Compute status display**

Add helper to determine display text:
```typescript
const getStatusDisplay = () => {
  if (sourceStatus.source === 'mock') {
    return { text: '模拟数据运行中', color: 'blue' as const }
  }
  if (sourceStatus.connected) {
    return { text: '采集服务运行中', color: 'green' as const }
  }
  return { text: '连接异常', color: 'red' as const }
}

const statusDisplay = getStatusDisplay()
```

- [ ] **Step 4: Redesign sidebar footer**

Replace the sidebarFooter section (lines 173-179) with:

```tsx
<div className={styles.sidebarFooter}>
  <div className={styles.footerStatus}>
    <span className={`${styles.footerDot} ${styles[`footerDot${statusDisplay.color.charAt(0).toUpperCase() + statusDisplay.color.slice(1)}`]}`} />
    <span className={styles.footerStatusText}>{statusDisplay.text}</span>
  </div>
  <div className={styles.footerVersion}>
    <span className={styles.footerVersionBadge}>v1.5.1</span>
  </div>
</div>
```

- [ ] **Step 5: Update footer CSS**

In `frontend/src/components/Layout/Layout.module.css`, replace `.sidebarFooter` and related styles:

```css
.sidebarFooter {
  padding: 12px 16px;
  border-top: 1px solid var(--border-color);
  display: flex;
  align-items: center;
  justify-content: space-between;
  gap: 8px;
}

.footerStatus {
  display: flex;
  align-items: center;
  gap: 8px;
  font-size: 12px;
  color: var(--text-secondary);
}

.footerDot {
  width: 7px;
  height: 7px;
  border-radius: 50%;
  flex-shrink: 0;
  animation: pulse 2s infinite;
}

.footerDotGreen {
  background: var(--accent-green);
  box-shadow: 0 0 6px rgba(16, 185, 129, 0.5);
}

.footerDotBlue {
  background: var(--accent-blue);
  box-shadow: 0 0 6px rgba(59, 130, 246, 0.5);
}

.footerDotRed {
  background: var(--accent-red);
  box-shadow: 0 0 6px rgba(239, 68, 68, 0.5);
  animation: none;
}

.footerStatusText {
  white-space: nowrap;
  overflow: hidden;
  text-overflow: ellipsis;
}

.footerVersion {
  display: flex;
  align-items: center;
}

.footerVersionBadge {
  font-size: 10px;
  padding: 2px 8px;
  border-radius: 4px;
  background: rgba(0, 212, 255, 0.08);
  border: 1px solid rgba(0, 212, 255, 0.15);
  color: var(--text-muted);
  font-family: 'Courier New', monospace;
  white-space: nowrap;
}
```

- [ ] **Step 6: Remove old statusDot and footerSub styles**

Delete `.statusDot` and `.footerSub` CSS rules (lines 147-159).

- [ ] **Step 7: Verify**

Sidebar footer shows:
- Mock mode: blue dot + "模拟数据运行中" + "v1.5.1"
- Real source connected: green dot + "采集服务运行中" + "v1.5.1"
- Real source disconnected: red dot + "连接异常" + "v1.5.1"
- Status updates every 15 seconds

- [ ] **Step 8: Commit**

```bash
git add backend/main.py frontend/src/components/Layout/index.tsx frontend/src/components/Layout/Layout.module.css
git commit -m "feat: dynamic status display, version 1.5.1, status bar redesign"
```

---

### Task 11: Integration Test

**Covers:** All items — verification pass

- [ ] **Step 1: Start backend and frontend**

```bash
cd /home/erribaba/git-workstation/spc-monitor
# Terminal 1: backend
python -m uvicorn backend.main:app --host 127.0.0.1 --port 8000 --reload
# Terminal 2: frontend
cd frontend && npm run dev
```

- [ ] **Step 2: Verify Data Management page**

- Title shows "数据管理" with SVG icon (no "FTE")
- Default date is today, data loads automatically
- Export buttons have SVG icons
- Filter area left-aligned
- Pagination works with server-side data

- [ ] **Step 3: Verify Config Management page**

- No "系统配置" title
- No "新增品项" button
- No standalone "规格限配置" card
- Indicator counts show actual data-based numbers
- Two separate alias cards (品项别名, 检验项目别名)
- Frequency display is dynamic with "立即采集" button
- Alert rules persist after toggle and refresh
- 10 rules shown (8 Nelson + CPK + Spec)
- MDB file path has "浏览" button

- [ ] **Step 4: Verify Help page**

- Three tabs: 系统说明, 数据分析名词手册, 名词可视化手册
- HTML documents load in iframes

- [ ] **Step 5: Verify Navigation**

- Version shows "v1.5.1"
- Status text is dynamic (matches source state)
- Status updates every 15 seconds
- Status bar design is clean and consistent

- [ ] **Step 6: Final commit**

```bash
git add -A
git commit -m "feat: multi-page improvements - data, config, help, navigation"
```
