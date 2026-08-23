# 采集样品编码和备注并在控制图tooltip展示 Implementation Plan

> **For agentic workers:** REQUIRED SUB-SKILL: Use compose:subagent (recommended) or compose:execute to implement this plan task-by-task. Steps use checkbox (`- [ ]`) syntax for tracking.

**Goal:** Collect sample_id (样品编码) and remark (备注) from all three data sources (SQL Server, MDB, FTA) and display them in control chart tooltips for quick sample identification.

**Architecture:** Add two new columns (`sample_id`, `remark`) to the SQLite `monitor_data` table, propagate them through all three collectors, expose them via the SPC API, and render them in the frontend ECharts tooltip.

**Tech Stack:** Python (FastAPI, sqlite3, pymssql, access_parser), React (TypeScript, ECharts)

## Global Constraints

- SQLite migration must be backward-compatible (ALTER TABLE ADD COLUMN for existing databases)
- All three collectors (SQL Server, MDB, FTA) must produce `sample_id` and `remark` in their record dicts
- `get_recent_data()` uses `SELECT *` so new columns are automatically returned
- Null/empty values must be handled gracefully (don't show empty lines in tooltip)
- `escapeHtml()` must be used for all dynamic tooltip content

---

### Task 1: Storage Layer — Add sample_id and remark columns

**Covers:** Storage schema extension

**Files:**
- Modify: `backend/app/services/storage.py:24-93` (CREATE TABLE + migration + INSERT)

**Interfaces:**
- Produces: `monitor_data` table now has `sample_id TEXT` and `remark TEXT` columns
- `save_data()` accepts records with optional `sample_id` and `remark` keys

- [ ] **Step 1: Add columns to CREATE TABLE statement**

In `storage.py`, modify the `init_db` method's `CREATE TABLE` statement. After `sample_time TEXT NOT NULL,` (line 37), add:

```sql
sample_id TEXT,
remark TEXT,
```

The full CREATE TABLE becomes:
```sql
CREATE TABLE IF NOT EXISTS monitor_data (
    id INTEGER PRIMARY KEY AUTOINCREMENT,
    indicator_code TEXT NOT NULL,
    indicator_name TEXT,
    product_code TEXT NOT NULL,
    product_name TEXT,
    value REAL NOT NULL,
    raw_value REAL,
    correction REAL DEFAULT 0,
    unit TEXT,
    upper_limit REAL,
    lower_limit REAL,
    is_qualified INTEGER DEFAULT 1,
    sample_time TEXT NOT NULL,
    sample_id TEXT,
    remark TEXT,
    created_at TEXT DEFAULT (datetime('now', 'localtime')),
    UNIQUE(indicator_code, product_code, sample_time)
);
```

- [ ] **Step 2: Add migration for existing databases**

In the migration block (after line 92 `if 'correction' not in columns:`), add:

```python
if 'sample_id' not in columns:
    conn.execute("ALTER TABLE monitor_data ADD COLUMN sample_id TEXT")
if 'remark' not in columns:
    conn.execute("ALTER TABLE monitor_data ADD COLUMN remark TEXT")
```

- [ ] **Step 3: Update save_data INSERT statement**

In `save_data()` (line 103-122), change the INSERT to include the two new columns:

```python
conn.execute(
    """INSERT INTO monitor_data
       (indicator_code, indicator_name, product_code, product_name,
        value, raw_value, correction, unit, upper_limit, lower_limit,
        is_qualified, sample_time, sample_id, remark)
       VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?)""",
    (
        record.get("indicator_code"),
        record.get("indicator_name"),
        record.get("product_code"),
        record.get("product_name"),
        record.get("value"),
        record.get("raw_value", record.get("value")),
        record.get("correction", 0),
        record.get("unit"),
        record.get("upper_limit"),
        record.get("lower_limit"),
        record.get("is_qualified", 1),
        record.get("sample_time"),
        record.get("sample_id"),
        record.get("remark"),
    ),
)
```

- [ ] **Step 4: Verify the backend starts without errors**

Run: `cd /home/erribaba/git-workstation/FT1-MONITOR && python3 -c "from backend.app.services.storage import OnlineStorage; s = OnlineStorage('/tmp/test_spc.db'); s.init_db(); print('OK')"`
Expected: `OK`

- [ ] **Step 5: Commit**

```bash
git add backend/app/services/storage.py
git commit -m "feat(storage): add sample_id and remark columns to monitor_data"
```

---

### Task 2: SQL Server Collector — Collect SampleId and Remark

**Covers:** SQL Server data collection enhancement

**Files:**
- Modify: `backend/app/engine/collector/sqlserver.py:357-431` (relational mode SQL + record dict)
- Modify: `backend/app/engine/collector/sqlserver.py:514-577` (flat mode — add remark column support)

**Interfaces:**
- Consumes: `monitor_data` table now has `sample_id` and `remark` columns (Task 1)
- Produces: Record dicts with `sample_id` and `remark` keys

- [ ] **Step 1: Add SampleId and Remark to relational mode SQL**

In `sqlserver.py` `_collect_relational()`, modify the SQL query (lines 357-369). Change:

```python
sql = f"""
    SELECT TOP {top_n}
        s.[SampNo],
        s.[{self.product_ref_col}],
        s.[{self.time_col}],
        p.[{self.component_ref_col}],
        p.[{self.value_col}]
    FROM [{self.sample_table}] s
```

To:

```python
sql = f"""
    SELECT TOP {top_n}
        s.[SampNo],
        s.[{self.product_ref_col}],
        s.[{self.time_col}],
        p.[{self.component_ref_col}],
        p.[{self.value_col}],
        s.[SampleId],
        s.[Remark]
    FROM [{self.sample_table}] s
```

- [ ] **Step 2: Extract SampleId and Remark from query results**

In the row processing loop (lines 387-431), after `value = row[4]` (line 392), add:

```python
sample_id = row[5] if len(row) > 5 else None
remark = row[6] if len(row) > 6 else None
```

- [ ] **Step 3: Add sample_id and remark to record dict**

In the record dict (lines 417-430), add two new fields:

```python
record = {
    'indicator_code': indicator_code,
    'indicator_name': indicator_name,
    'product_code': product_code,
    'product_name': product_name,
    'value': value,
    'raw_value': round(raw_value, 4),
    'correction': correction,
    'unit': 'g/100g',
    'upper_limit': None,
    'lower_limit': None,
    'is_qualified': 1,
    'sample_time': time_str,
    'sample_id': sample_id.strip() if sample_id else None,
    'remark': remark.strip() if remark else None,
}
```

- [ ] **Step 4: Add sample_id to flat mode**

In the flat mode `_parse_row()` method (line 532-577), after `time_str` is computed (line 543), add extraction of sample_id from the row_dict:

```python
sample_id_val = row_dict.get(self.sample_column) if self.sample_column else None
```

Then add to the record dict (after `'sample_time': time_str,`):

```python
'sample_id': str(sample_id_val).strip() if sample_id_val else None,
'remark': None,
```

Note: Flat mode doesn't have a remark column in the current schema, so `remark` is always `None`.

- [ ] **Step 5: Verify no import errors**

Run: `cd /home/erribaba/git-workstation/FT1-MONITOR && python3 -c "from backend.app.engine.collector.sqlserver import SQLServerCollector; print('OK')"`
Expected: `OK`

- [ ] **Step 6: Commit**

```bash
git add backend/app/engine/collector/sqlserver.py
git commit -m "feat(collector/sqlserver): collect SampleId and Remark from source DB"
```

---

### Task 3: MDB Collector — Collect SampleId and Remark from Replicate table

**Covers:** MDB data collection enhancement

**Files:**
- Modify: `backend/app/engine/collector/mdb.py:159-164` (add Replicate loading)
- Modify: `backend/app/engine/collector/mdb.py:236-307` (record building)

**Interfaces:**
- Consumes: `monitor_data` table now has `sample_id` and `remark` columns (Task 1)
- Produces: Record dicts with `sample_id` and `remark` keys

- [ ] **Step 1: Add Replicate table loading method**

In `mdb.py`, after `_load_predictions()` (around line 184), add a new method:

```python
def _load_replicates(self) -> Dict[int, str]:
    """加载 Replicate 表的 Remark（RepNo=32000），按 SampRef 索引"""
    if hasattr(self, '_replicates_cache') and self._replicates_cache is not None:
        return self._replicates_cache
    try:
        replicates = self._parse_table_data('Replicate')
        self._replicates_cache = {}
        for rep in replicates:
            samp_ref = rep.get('SampRef')
            rep_no = rep.get('RepNo')
            remark = rep.get('Remark', '')
            if samp_ref is not None and rep_no == 32000 and remark:
                self._replicates_cache[int(samp_ref)] = _fix_encoding(str(remark))
        return self._replicates_cache
    except Exception:
        self._replicates_cache = {}
        return self._replicates_cache
```

- [ ] **Step 2: Load replicates in collect() method**

In `mdb.py` `collect()` method, after `pred_index = self._load_predictions()` (line 232), add:

```python
replicate_remarks = self._load_replicates()
```

- [ ] **Step 3: Extract SampleId and Remark in sample loop**

In the sample loop (line 236-237), after `sample_time = sample.get(self.time_column)` (line 239), add:

```python
sample_id = sample.get('SampleId')
remark = replicate_remarks.get(int(samp_no)) if samp_no else None
```

- [ ] **Step 4: Add sample_id and remark to record dict**

In the record dict (lines 293-306), add:

```python
record = {
    'indicator_code': indicator_code_lower,
    'indicator_name': indicator_name,
    'product_code': product_code,
    'product_name': product_name,
    'value': value,
    'raw_value': round(raw_value, 4),
    'correction': correction,
    'unit': 'g/100g',
    'upper_limit': None,
    'lower_limit': None,
    'is_qualified': 1,
    'sample_time': time_str,
    'sample_id': sample_id.strip() if isinstance(sample_id, str) else (str(sample_id) if sample_id else None),
    'remark': remark,
}
```

- [ ] **Step 5: Verify no import errors**

Run: `cd /home/erribaba/git-workstation/FT1-MONITOR && python3 -c "from backend.app.engine.collector.mdb import MDBCollector; print('OK')"`
Expected: `OK`

- [ ] **Step 6: Commit**

```bash
git add backend/app/engine/collector/mdb.py
git commit -m "feat(collector/mdb): collect SampleId and Remark from Replicate table"
```

---

### Task 4: FTA Collector — Collect SampleNumber and AnalysisComment

**Covers:** FTA data collection enhancement

**Files:**
- Modify: `backend/app/engine/collector/fta.py:142-215` (SQL query + record dict)

**Interfaces:**
- Consumes: `monitor_data` table now has `sample_id` and `remark` columns (Task 1)
- Produces: Record dicts with `sample_id` and `remark` keys

- [ ] **Step 1: Add AnalysisComment to SQL query**

In `fta.py`, modify the SQL query (lines 142-156). Add `ee.AnalysisComment` to the SELECT:

```python
sql = f"""
    SELECT TOP {top_n}
        ee.EstimateEventID,
        ee.AnalysisStartTime,
        ee.ProductSpecProfileName,
        ee.SampleNumber,
        e.ParameterTypeName,
        e.PredictedResult,
        e.ReportedResult,
        e.UnitTypeName,
        ee.AnalysisComment
    FROM EstimateEvent ee
    INNER JOIN Estimate e ON ee.EstimateEventID = e.EstimateEventID
    {where}
    ORDER BY ee.AnalysisStartTime DESC
"""
```

- [ ] **Step 2: Extract AnalysisComment from query results**

In the row processing (lines 166-174), after `unit_type = row[7]` (line 174), add:

```python
analysis_comment = row[8] if len(row) > 8 else None
```

- [ ] **Step 3: Add sample_id and remark to record dict**

In the record dict (lines 201-214), add:

```python
record = {
    'indicator_code': indicator_code,
    'indicator_name': parameter_name,
    'product_code': product_code,
    'product_name': product_name,
    'value': value,
    'raw_value': round(raw_value, 4),
    'correction': correction,
    'unit': unit_type or '',
    'upper_limit': None,
    'lower_limit': None,
    'is_qualified': 1,
    'sample_time': time_str,
    'sample_id': sample_number.strip() if sample_number else None,
    'remark': analysis_comment.strip() if analysis_comment else None,
}
```

Note: `sample_number` is already extracted at line 170 but was previously discarded.

- [ ] **Step 4: Verify no import errors**

Run: `cd /home/erribaba/git-workstation/FT1-MONITOR && python3 -c "from backend.app.engine.collector.fta import FTACollector; print('OK')"`
Expected: `OK`

- [ ] **Step 5: Commit**

```bash
git add backend/app/engine/collector/fta.py
git commit -m "feat(collector/fta): collect SampleNumber and AnalysisComment"
```

---

### Task 5: SPC API — Include sample_id and remark in data_points

**Covers:** API response enhancement

**Files:**
- Modify: `backend/app/api/spc.py:41-47` (data_points construction)

**Interfaces:**
- Consumes: `get_recent_data()` returns dicts with `sample_id` and `remark` (Task 1)
- Produces: `data_points` array now includes `sample_id` and `remark` per point

- [ ] **Step 1: Add sample_id and remark to data_points**

In `spc.py`, modify the data_points loop (lines 41-47). Change:

```python
data_points = []
for i, (ts, val) in enumerate(zip(timestamps, values)):
    data_points.append({
        "time": ts,
        "value": round(float(val), 4),
        "is_violation": i in violation_indices,
    })
```

To:

```python
data_points = []
for i, (ts, val) in enumerate(zip(timestamps, values)):
    data_points.append({
        "time": ts,
        "value": round(float(val), 4),
        "is_violation": i in violation_indices,
        "sample_id": data[i].get('sample_id'),
        "remark": data[i].get('remark'),
    })
```

- [ ] **Step 2: Verify the backend starts without errors**

Run: `cd /home/erribaba/git-workstation/FT1-MONITOR && python3 -c "from backend.app.api.spc import router; print('OK')"`
Expected: `OK`

- [ ] **Step 3: Commit**

```bash
git add backend/app/api/spc.py
git commit -m "feat(api/spc): include sample_id and remark in data_points response"
```

---

### Task 6: Frontend — Update types and tooltip display

**Covers:** Frontend tooltip enhancement

**Files:**
- Modify: `frontend/src/types/index.ts:73-77` (data_points type)
- Modify: `frontend/src/pages/SPC/index.tsx:167-173` (I Chart tooltip)
- Modify: `frontend/src/pages/SPC/index.tsx:216-222` (MR Chart tooltip)

**Interfaces:**
- Consumes: SPC API response with `sample_id` and `remark` in data_points (Task 5)
- Produces: Tooltip shows sample_id and remark when available

- [ ] **Step 1: Extend data_points TypeScript type**

In `frontend/src/types/index.ts`, modify the `data_points` array type (lines 73-77):

```typescript
data_points: Array<{
  time: string
  value: number
  is_violation: boolean
  sample_id?: string | null
  remark?: string | null
}>
```

- [ ] **Step 2: Update I Chart tooltip formatter**

In `frontend/src/pages/SPC/index.tsx`, modify the I Chart tooltip formatter (lines 167-173). Change:

```tsx
formatter: (params: DefaultLabelFormatterCallbackParams | DefaultLabelFormatterCallbackParams[]) => {
  const p = (Array.isArray(params) ? params[0] : params) as unknown as EChartsParam
  const idx = p.dataIndex
  const pt = data_points[idx]
  const violation = pt.is_violation ? '<br/><span style="color:#ef4444;font-weight:bold">⚠ 违规点</span>' : ''
  return `<b>${escapeHtml(pt.time)}</b><br/>值: <b>${escapeHtml(String(p.value))}</b>${violation}`
},
```

To:

```tsx
formatter: (params: DefaultLabelFormatterCallbackParams | DefaultLabelFormatterCallbackParams[]) => {
  const p = (Array.isArray(params) ? params[0] : params) as unknown as EChartsParam
  const idx = p.dataIndex
  const pt = data_points[idx]
  const sampleInfo = pt.sample_id ? `<br/>样品编码: ${escapeHtml(pt.sample_id)}` : ''
  const remarkInfo = pt.remark ? `<br/>备注: ${escapeHtml(pt.remark)}` : ''
  const violation = pt.is_violation ? '<br/><span style="color:#ef4444;font-weight:bold">⚠ 违规点</span>' : ''
  return `<b>${escapeHtml(pt.time)}</b>${sampleInfo}${remarkInfo}<br/>值: <b>${escapeHtml(String(p.value))}</b>${violation}`
},
```

- [ ] **Step 3: Update MR Chart tooltip formatter**

In `frontend/src/pages/SPC/index.tsx`, modify the MR Chart tooltip formatter (lines 216-222). The MR chart doesn't have direct access to `data_points` — it uses `mrData.times[idx]`. We need to also pass `data_points` info to the MR chart.

Read the MR chart option construction to understand the data flow, then update the MR tooltip to include sample_id and remark from `data_points[idx]`:

```tsx
formatter: (params: DefaultLabelFormatterCallbackParams | DefaultLabelFormatterCallbackParams[]) => {
  const p = (Array.isArray(params) ? params[0] : params) as unknown as EChartsParam
  const idx = p.dataIndex
  const time = mrData.times[idx]
  const mrValue = p.value as number
  const pt = data_points[idx]
  const sampleInfo = pt?.sample_id ? `<br/>样品编码: ${escapeHtml(pt.sample_id)}` : ''
  const remarkInfo = pt?.remark ? `<br/>备注: ${escapeHtml(pt.remark)}` : ''
  const violation = mrValue > ucl ? '<br/><span style="color:#ef4444;font-weight:bold">⚠ 超出UCL</span>' : ''
  return `<b>${escapeHtml(time)}</b>${sampleInfo}${remarkInfo}<br/>MR: <b>${escapeHtml(String(mrValue))}</b>${violation}`
},
```

- [ ] **Step 4: Verify frontend builds without errors**

Run: `cd /home/erribaba/git-workstation/FT1-MONITOR/frontend && npx tsc --noEmit 2>&1 | head -20`
Expected: No TypeScript errors related to our changes

- [ ] **Step 5: Commit**

```bash
git add frontend/src/types/index.ts frontend/src/pages/SPC/index.tsx
git commit -m "feat(frontend/spc): show sample_id and remark in control chart tooltips"
```
