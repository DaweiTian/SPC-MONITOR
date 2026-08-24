# 指标交叉预测功能 实施方案

> **For agentic workers:** REQUIRED SUB-SKILL: Use compose:subagent (recommended) or compose:execute to implement this plan task-by-task. Steps use checkbox (`- [ ]`) syntax for tracking.

**Goal:** 构建通用的"指标交叉预测"框架——通过已有指标实时预测关联指标。首期落地"脂肪→饱和脂肪"，框架支持未来扩展任意指标对。在品项管理中配置源指标和目标指标，预测结果在实时看板和SPC控制图中叠加展示。

**Architecture:** 采用"配置驱动+轻量计算"架构。预测配置存储在JSON文件中，定义"源指标→目标指标"的映射关系及系数。预测引擎作为独立模块，在数据采集完成后自动触发，预测结果写入SQLite `monitor_data`表（`is_predicted=1`标记）。实时看板和SPC页面通过overlay方式叠加显示预测曲线。

**Tech Stack:** FastAPI (Python backend), React+TypeScript (frontend), SQLite (storage), JSON files (config)

## Global Constraints

- 配置存储使用JSON文件，与现有`product_status.json`/`spec_limits.json`模式保持一致
- 预测引擎不引入新的Python依赖（仅使用numpy，已在项目中）
- 前端使用现有CSS Module样式体系，不引入新UI库
- 预测结果写入`monitor_data`表时标记`is_predicted=1`，`indicator_name`带"(预测)"后缀
- 预测配置采用通用的"源指标→目标指标"模型，首期支持fat→saturated_fat，未来可扩展
- 产品类别下拉选项使用建模分析确定的14种类型
- 预测系数默认值来自建模结果，但允许用户在配置中覆盖

## 两种预测模式说明

| 模式 | 说明 | 示例 | 实现 |
|------|------|------|------|
| **交叉预测**（本方案） | 通过A指标实时值预测B指标 | 脂肪→饱和脂肪 | 品项管理配置源/目标指标，采集后自动触发 |
| 趋势预测（已有） | 根据历史数据预测未来趋势 | 脂肪未来12个点 | 现有predict.py的ETS/ARIMA模型 |

本方案实现"交叉预测"模式，与现有"趋势预测"互不干扰。

---

## Task 1: 后端 — 产品类别配置存储

**Covers:** 产品→类别映射持久化

**Files:**
- Create: `product_categories.json`（项目根目录）
- Modify: `backend/app/api/config.py` — 新增类别配置API端点
- Modify: `backend/app/models/requests.py` — 新增请求模型

**Interfaces:**
- Produces: `GET /api/config/product-categories` 返回 `{"product_code": "category_code"}`
- Produces: `PUT /api/config/product-categories/{product_code}` 更新单个产品类别
- Produces: `GET /api/config/prediction-categories` 返回可用类别定义（含系数）

### 数据结构

`product_categories.json` 格式：
```json
{
  "砖纯牛奶": "sterilized_milk",
  "枕纯牛奶": "sterilized_milk",
  "自立袋植选豆奶饮品": "plant_protein"
}
```

类别枚举值（对应建模分析的14种类型）：
| code | 中文名 | 预测系数k |
|------|--------|----------|
| `sterilized_milk` | 灭菌乳 | 0.6277 |
| `fermented_milk` | 发酵乳 | 0.6232 |
| `milk_drink` | 乳饮料 | 0.6230 |
| `modified_milk` | 调制乳 | 0.6320 |
| `uf_pure_milk` | 超滤纯牛奶 | 0.6255 |
| `milk_flavored_drink` | 乳味饮料 | 0.6301 |
| `plant_protein` | 植物蛋白饮品 | 0.1742 |
| `juice_drink` | 果蔬汁类饮料 | 0.6187 |
| `flavored_drink` | 风味饮料 | 0.5480 |
| `compound_protein` | 复合蛋白饮料 | 0.3231 |
| `cream` | 奶油 | 0.6470 |
| `tea_drink` | 茶饮料 | 0.7370 |
| `grain_drink` | 谷物类饮料 | 0.1310 |
| `mineral_water` | 矿泉水 | 0.6250 |

### Steps

- [ ] **Step 1: 创建请求模型**

在 `backend/app/models/requests.py` 末尾添加：
```python
class ProductCategoryRequest(BaseModel):
    category: str
```

- [ ] **Step 2: 创建初始配置文件**

在项目根目录创建 `product_categories.json`：
```json
{}
```

- [ ] **Step 3: 添加API端点**

在 `backend/app/api/config.py` 中添加：

```python
from backend.app.models.requests import ProductCategoryRequest

PRODUCT_CATEGORIES_FILE = "product_categories.json"

PREDICTION_CATEGORIES = {
    "sterilized_milk": {"name": "灭菌乳", "k": 0.6277},
    "fermented_milk": {"name": "发酵乳", "k": 0.6232},
    "milk_drink": {"name": "乳饮料", "k": 0.6230},
    "modified_milk": {"name": "调制乳", "k": 0.6320},
    "uf_pure_milk": {"name": "超滤纯牛奶", "k": 0.6255},
    "milk_flavored_drink": {"name": "乳味饮料", "k": 0.6301},
    "plant_protein": {"name": "植物蛋白饮品", "k": 0.1742},
    "juice_drink": {"name": "果蔬汁类饮料", "k": 0.6187},
    "flavored_drink": {"name": "风味饮料", "k": 0.5480},
    "compound_protein": {"name": "复合蛋白饮料", "k": 0.3231},
    "cream": {"name": "奶油", "k": 0.6470},
    "tea_drink": {"name": "茶饮料", "k": 0.7370},
    "grain_drink": {"name": "谷物类饮料", "k": 0.1310},
    "mineral_water": {"name": "矿泉水", "k": 0.6250},
}

@router.get("/product-categories")
def get_product_categories():
    if os.path.exists(PRODUCT_CATEGORIES_FILE):
        with open(PRODUCT_CATEGORIES_FILE, "r", encoding="utf-8") as f:
            return json.load(f)
    return {}

@router.put("/product-categories/{product_code}")
def update_product_category(product_code: str, req: ProductCategoryRequest):
    data = {}
    if os.path.exists(PRODUCT_CATEGORIES_FILE):
        with open(PRODUCT_CATEGORIES_FILE, "r", encoding="utf-8") as f:
            data = json.load(f)
    if req.category:
        data[product_code] = req.category
    else:
        data.pop(product_code, None)
    with open(PRODUCT_CATEGORIES_FILE, "w", encoding="utf-8") as f:
        json.dump(data, f, ensure_ascii=False, indent=2)
    return {"status": "ok"}

@router.get("/prediction-categories")
def get_prediction_categories():
    return PREDICTION_CATEGORIES
```

- [ ] **Step 4: 验证**

`GET /api/config/product-categories` 返回 `{}`；`PUT` 写入后 `GET` 能读到。`GET /api/config/prediction-categories` 返回14种类别。

- [ ] **Step 5: Commit**

```bash
git add product_categories.json backend/app/api/config.py backend/app/models/requests.py
git commit -m "feat: add product category config API with prediction categories"
```

---

## Task 2: 后端 — 交叉预测配置存储

**Covers:** 源指标→目标指标的预测开关和映射配置

**Files:**
- Create: `prediction_config.json`（项目根目录）
- Modify: `backend/app/api/config.py` — 新增预测配置API端点

**Interfaces:**
- Produces: `GET /api/config/prediction-config` 返回完整配置
- Produces: `PUT /api/config/prediction-config/{product_code}` 更新某产品的预测配置

### 数据结构

`prediction_config.json` 格式——通用的"源指标→目标指标"模型，系数由用户自行管理：
```json
{
  "砖纯牛奶": {
    "saturated_fat": {
      "source_indicator": "fat",
      "coefficient": 0.6277,
      "enabled": true
    }
  },
  "枕纯牛奶": {
    "saturated_fat": {
      "source_indicator": "fat",
      "coefficient": 0.6278,
      "enabled": true
    }
  }
}
```

**设计说明：**
- 外层key是产品编码
- 内层key是目标指标code（如`saturated_fat`）
- `source_indicator`：数据来源指标code（如`fat`），预测公式基于此指标的实时值
- `coefficient`：用户配置的预测系数（选择产品类别时自动填入默认值，用户可手动修改）
- `enabled`：是否开启预测
- 未来扩展：同一个产品可以配置多组预测，如增加`saturated_fat_from_protein`等

### Steps

- [ ] **Step 1: 创建初始配置文件**

在项目根目录创建 `prediction_config.json`：
```json
{}
```

- [ ] **Step 2: 添加API端点**

在 `backend/app/api/config.py` 中添加：

```python
PREDICTION_CONFIG_FILE = "prediction_config.json"

@router.get("/prediction-config")
def get_prediction_config():
    if os.path.exists(PREDICTION_CONFIG_FILE):
        with open(PREDICTION_CONFIG_FILE, "r", encoding="utf-8") as f:
            return json.load(f)
    return {}

@router.put("/prediction-config/{product_code}")
def update_prediction_config(product_code: str, indicators: dict):
    data = {}
    if os.path.exists(PREDICTION_CONFIG_FILE):
        with open(PREDICTION_CONFIG_FILE, "r", encoding="utf-8") as f:
            data = json.load(f)
    data[product_code] = indicators
    with open(PREDICTION_CONFIG_FILE, "w", encoding="utf-8") as f:
        json.dump(data, f, ensure_ascii=False, indent=2)
    return {"status": "ok"}
```

- [ ] **Step 3: 验证**

`GET` 返回 `{}`；`PUT` 写入含source_indicator的结构后能正确读回。

- [ ] **Step 4: Commit**

```bash
git add prediction_config.json backend/app/api/config.py
git commit -m "feat: add cross-indicator prediction config API"
```

---

## Task 3: 后端 — 交叉预测引擎

**Covers:** 通用的指标→指标预测计算逻辑

**Files:**
- Create: `backend/app/engine/predictor/__init__.py`
- Create: `backend/app/engine/predictor/cross_indicator.py`

**Interfaces:**
- Produces: `predict_cross_indicator(source_value: float, coefficient: float, source_indicator: str, target_indicator: str) -> dict`
- coefficient来自用户在品项管理页面配置的值（prediction_config.json），不从类别硬编码查找

### Steps

- [ ] **Step 1: 创建predictor模块**

创建 `backend/app/engine/predictor/__init__.py`（空文件）

- [ ] **Step 2: 实现通用预测函数**

创建 `backend/app/engine/predictor/cross_indicator.py`：

```python
"""通用指标交叉预测引擎

预测公式: 目标指标值 = 源指标值 × coefficient
coefficient 由用户在品项管理页面配置（prediction_config.json），
选择产品类别时自动填入默认推荐值，用户可手动覆盖。
"""

# 目标指标元数据（名称、单位）
TARGET_INDICATOR_META = {
    "saturated_fat": {"name": "饱和脂肪", "unit": "g/100g"},
}

# 类别默认系数（仅用于自动填充，实际预测用用户配置的coefficient）
CATEGORY_DEFAULT_K = {
    "sterilized_milk": 0.6277,
    "fermented_milk": 0.6232,
    "milk_drink": 0.6230,
    "modified_milk": 0.6320,
    "uf_pure_milk": 0.6255,
    "milk_flavored_drink": 0.6301,
    "plant_protein": 0.1742,
    "juice_drink": 0.6187,
    "flavored_drink": 0.5480,
    "compound_protein": 0.3231,
    "cream": 0.6470,
    "tea_drink": 0.7370,
    "grain_drink": 0.1310,
    "mineral_water": 0.6250,
}


def get_default_coefficient(category_code: str = None) -> float:
    """获取类别的默认推荐系数"""
    if category_code and category_code in CATEGORY_DEFAULT_K:
        return CATEGORY_DEFAULT_K[category_code]
    return 0.6278  # 乳制品统一默认值


def predict_cross_indicator(
    source_value: float,
    coefficient: float,
    source_indicator: str = "",
    target_indicator: str = "",
) -> dict:
    """
    通用指标交叉预测: 目标值 = 源值 × coefficient
    
    Args:
        source_value: 源指标的实时值
        coefficient: 用户配置的预测系数
        source_indicator: 源指标code（仅用于生成公式描述）
        target_indicator: 目标指标code（仅用于查元数据）
    
    Returns:
        {"predicted_value", "coefficient", "formula", "target_name", "target_unit"}
    """
    meta = TARGET_INDICATOR_META.get(target_indicator, {"name": target_indicator, "unit": ""})
    predicted = round(source_value * coefficient, 4)

    return {
        "predicted_value": predicted,
        "coefficient": round(coefficient, 6),
        "formula": f"{meta['name']} = {source_indicator} × {coefficient:.4f}",
        "target_name": meta["name"],
        "target_unit": meta["unit"],
    }
```

- [ ] **Step 3: 验证**

```python
from backend.app.engine.predictor.cross_indicator import predict_cross_indicator
r = predict_cross_indicator(3.5, "fat", "saturated_fat", "sterilized_milk")
assert abs(r["predicted_value"] - 2.197) < 0.01
assert r["confidence"] == "高"
```

- [ ] **Step 4: Commit**

```bash
git add backend/app/engine/predictor/
git commit -m "feat: add generic cross-indicator prediction engine"
```

---

## Task 4: 后端 — 预测结果存储与采集触发

**Covers:** 预测结果写入SQLite、数据采集后自动触发预测

**Files:**
- Modify: `backend/app/services/storage.py` — 新增`is_predicted`列和`save_predicted_data`方法
- Modify: `backend/main.py` — 在采集完成后触发预测计算

**Interfaces:**
- Consumes: `predict_cross_indicator()` from Task 3
- Consumes: `product_categories.json` from Task 1, `prediction_config.json` from Task 2

### Steps

- [ ] **Step 1: monitor_data表增加is_predicted字段**

在 `storage.py` 的 `_init_db` 方法中，CREATE TABLE之后添加迁移：
```python
cursor.execute("PRAGMA table_info(monitor_data)")
columns = [col[1] for col in cursor.fetchall()]
if 'is_predicted' not in columns:
    cursor.execute("ALTER TABLE monitor_data ADD COLUMN is_predicted INTEGER DEFAULT 0")
```

同时在 `save_data` 方法的 INSERT 语句中加入 `is_predicted` 字段（默认0）。

- [ ] **Step 2: 添加save_predicted_data方法**

在 `storage.py` 的 `OnlineStorage` 类中添加：
```python
def save_predicted_data(self, records: list[dict]):
    """保存预测数据，自动标记is_predicted=1"""
    if not records:
        return 0
    conn = sqlite3.connect(self.db_path)
    cursor = conn.cursor()
    saved = 0
    for r in records:
        try:
            cursor.execute("""
                INSERT OR REPLACE INTO monitor_data 
                (indicator_code, indicator_name, product_code, product_name,
                 value, unit, sample_time, is_predicted)
                VALUES (?, ?, ?, ?, ?, ?, ?, 1)
            """, (
                r["indicator_code"], r["indicator_name"],
                r["product_code"], r["product_name"],
                r["value"], r.get("unit", "g/100g"),
                r["sample_time"],
            ))
            saved += 1
        except Exception:
            continue
    conn.commit()
    conn.close()
    return saved
```

- [ ] **Step 3: 在main.py中添加预测触发逻辑**

在 `main.py` 的 `collect_with_alert()` 中，`storage.save_data(records)` 之后添加：

```python
def _run_cross_predictions(storage, records):
    """对新采集的数据执行交叉预测"""
    import json
    from backend.app.engine.predictor.cross_indicator import predict_cross_indicator

    try:
        with open("prediction_config.json", "r", encoding="utf-8") as f:
            pred_config = json.load(f)
    except (FileNotFoundError, json.JSONDecodeError):
        pred_config = {}

    predicted_records = []
    for record in records:
        source_code = record.get("indicator_code", "")
        product_code = record.get("product_code", "")
        product_preds = pred_config.get(product_code, {})

        for target_code, cfg in product_preds.items():
            if not cfg.get("enabled", False):
                continue
            if cfg.get("source_indicator") != source_code:
                continue
            coefficient = cfg.get("coefficient")
            if coefficient is None:
                continue
            result = predict_cross_indicator(
                record["value"], coefficient, source_code, target_code
            )
            if "error" in result:
                continue
            predicted_records.append({
                "indicator_code": target_code,
                "indicator_name": f"{result['target_name']}(预测)",
                "product_code": product_code,
                "product_name": record.get("product_name", ""),
                "value": result["predicted_value"],
                "unit": result.get("target_unit", "g/100g"),
                "sample_time": record.get("sample_time", ""),
            })

    if predicted_records:
        storage.save_predicted_data(predicted_records)

# 在 collect_with_alert() 中，storage.save_data(records) 之后调用
_run_cross_predictions(storage, records)
```

- [ ] **Step 4: 验证**

Mock采集器配置某产品fat→saturated_fat预测，触发采集后检查`monitor_data`中出现`saturated_fat`记录且`is_predicted=1`。

- [ ] **Step 5: Commit**

```bash
git add backend/app/services/storage.py backend/main.py
git commit -m "feat: auto-predict cross-indicator values after data collection"
```

---

## Task 5: 后端 — 交叉预测查询API

**Covers:** 前端查询预测结果和模型信息

**Files:**
- Modify: `backend/app/api/predict.py` — 新增交叉预测查询端点

**Interfaces:**
- Produces: `GET /api/predict/cross-indicator?product=XXX&target=saturated_fat`

### Steps

- [ ] **Step 1: 添加端点**

在 `predict.py` 中添加：

```python
@router.get("/cross-indicator")
def get_cross_indicator_prediction(
    product: str = Query(..., description="产品编码"),
    target: str = Query("saturated_fat", description="目标指标code"),
    limit: int = Query(50, ge=1, le=200),
):
    import json
    from backend.app.engine.predictor.cross_indicator import TARGET_INDICATOR_META

    try:
        with open("prediction_config.json", "r", encoding="utf-8") as f:
            pred_config = json.load(f)
    except (FileNotFoundError, json.JSONDecodeError):
        pred_config = {}

    product_pred = pred_config.get(product, {})
    target_cfg = product_pred.get(target, {})
    if not target_cfg.get("enabled", False):
        return {"enabled": False, "data": [], "model_info": None}

    source = target_cfg.get("source_indicator", "")
    coefficient = target_cfg.get("coefficient", 0.6278)
    meta = TARGET_INDICATOR_META.get(target, {"name": target, "unit": ""})

    data = storage.get_recent_data(target, product, limit=limit)
    data.reverse()

    return {
        "enabled": True,
        "source_indicator": source,
        "target_indicator": target,
        "data": [{"value": d["value"], "sample_time": d["sample_time"]} for d in data],
        "model_info": {
            "target_name": meta["name"],
            "coefficient": coefficient,
            "formula": f"{meta['name']} = {source} × {coefficient:.4f}",
        },
    }
```

- [ ] **Step 2: 验证**

`GET /api/predict/cross-indicator?product=砖纯牛奶&target=saturated_fat` 返回预测数据和模型信息。

- [ ] **Step 3: Commit**

```bash
git add backend/app/api/predict.py
git commit -m "feat: add cross-indicator prediction query API"
```

---

## Task 6: 前端 — API服务层

**Covers:** 前端调用后端新增API

**Files:**
- Modify: `frontend/src/services/api.ts`

### Steps

- [ ] **Step 1: 添加API方法**

```typescript
// 产品类别配置
getProductCategories: () =>
  http.get<Record<string, string>>('/config/product-categories').then(r => r.data),
updateProductCategory: (productCode: string, category: string) =>
  http.put(`/config/product-categories/${productCode}`, { category }).then(r => r.data),
getPredictionCategories: () =>
  http.get<Record<string, { name: string; k: number }>>('/config/prediction-categories').then(r => r.data),

// 交叉预测配置
getPredictionConfig: () =>
  http.get<Record<string, Record<string, { source_indicator: string; coefficient: number; enabled: boolean }>>>('/config/prediction-config').then(r => r.data),
updatePredictionConfig: (productCode: string, indicators: Record<string, { source_indicator: string; coefficient: number; enabled: boolean }>) =>
  http.put(`/config/prediction-config/${productCode}`, indicators).then(r => r.data),

// 交叉预测结果
getCrossIndicatorPrediction: (product: string, target = 'saturated_fat', limit = 50) =>
  http.get('/predict/cross-indicator', { params: { product, target, limit } }).then(r => r.data),
```

- [ ] **Step 2: Commit**

```bash
git add frontend/src/services/api.ts
git commit -m "feat: add cross-indicator prediction API methods"
```

---

## Task 7: 前端 — 品项管理界面改造

**Covers:** 品项表格增加"样品类别"列、编辑弹窗增加类别下拉和"预测指标"模块（含源指标+目标指标配置）

**Files:**
- Modify: `frontend/src/pages/Config/index.tsx`

### Steps

- [ ] **Step 1: 新增状态变量**

```typescript
const [productCategories, setProductCategories] = useState<Record<string, string>>({})
const [predictionCategories, setPredictionCategories] = useState<Record<string, { name: string; k: number }>>({})
const [predictionConfig, setPredictionConfig] = useState<Record<string, Record<string, { source_indicator: string; coefficient: number; enabled: boolean }>>>({})
const [selectedCategory, setSelectedCategory] = useState('')
const [predictSaturatedFat, setPredictSaturatedFat] = useState(false)
const [predCoefficient, setPredCoefficient] = useState('')  // 用户可编辑的系数
```

- [ ] **Step 2: fetchProducts中加载配置**

```typescript
const [categories, predCategories, predConfig] = await Promise.all([
  api.getProductCategories().catch(() => ({})),
  api.getPredictionCategories().catch(() => ({})),
  api.getPredictionConfig().catch(() => ({})),
])
setProductCategories(categories)
setPredictionCategories(predCategories)
setPredictionConfig(predConfig)
```

- [ ] **Step 3: 品项表格增加"样品类别"列**

在 `<thead>` 的"状态"列之前添加 `<th>样品类别</th>`，`<tbody>` 对应位置：
```html
<td>
  {productCategories[p.code]
    ? (predictionCategories[productCategories[p.code]]?.name || productCategories[p.code])
    : <span style={{ color: 'var(--text-muted)' }}>未配置</span>}
</td>
```

- [ ] **Step 4: 编辑弹窗 — 基本信息区增加"样品类别"下拉**

在"品项别名"下方添加：
```html
<div className={styles.formGroup} style={{ marginTop: '12px' }}>
  <label className={styles.formLabel}>样品类别</label>
  <select
    className={styles.formSelect}
    value={selectedCategory}
    onChange={e => {
      const newCategory = e.target.value
      setSelectedCategory(newCategory)
      // 自动填入该类别的推荐系数
      if (newCategory && predictionCategories[newCategory]) {
        setPredCoefficient(predictionCategories[newCategory].k.toFixed(4))
      }
    }}
  >
    <option value="">-- 请选择 --</option>
    {Object.entries(predictionCategories).map(([code, info]) => (
      <option key={code} value={code}>{info.name}</option>
    ))}
  </select>
  <div style={{ marginTop: '4px', fontSize: '11px', color: 'var(--text-muted)' }}>
    选择类别后自动填入推荐系数，可在下方手动修改
  </div>
</div>
```

- [ ] **Step 5: 编辑弹窗 — "预测指标"模块（含源指标+目标指标+可编辑系数）**

在"监测指标与规格限"下方添加。选择产品类别时自动填入推荐系数，用户可手动修改：
```html
<div className={styles.confirmSection}>
  <h4>预测指标</h4>
  <div style={{ padding: '8px 0' }}>
    {/* fat → saturated_fat 配置行 */}
    <div style={{ display: 'flex', alignItems: 'center', gap: '12px', marginBottom: '8px', flexWrap: 'wrap' }}>
      <label style={{ display: 'flex', alignItems: 'center', gap: '8px', cursor: 'pointer' }}>
        <input
          type="checkbox"
          checked={predictSaturatedFat}
          onChange={e => setPredictSaturatedFat(e.target.checked)}
        />
        <span>饱和脂肪</span>
      </label>
      <span style={{ fontSize: '12px', color: 'var(--text-muted)' }}>
        来源: 脂肪(fat) → 饱和脂肪(saturated_fat)
      </span>
    </div>

    {predictSaturatedFat && (
      <div style={{
        marginTop: '4px', padding: '10px 12px', fontSize: '12px',
        background: 'var(--bg-secondary)', borderRadius: '6px',
        border: '1px solid var(--border-color)',
      }}>
        <div style={{ display: 'flex', alignItems: 'center', gap: '8px', marginBottom: '8px' }}>
          <span>预测系数 (k):</span>
          <input
            type="number"
            step="0.0001"
            className={styles.formInput}
            style={{ width: '100px', padding: '4px 8px' }}
            value={predCoefficient}
            onChange={e => setPredCoefficient(e.target.value)}
            placeholder="例: 0.6278"
          />
          {selectedCategory && predictionCategories[selectedCategory] && (
            <button
              className={styles.btnEdit}
              style={{ fontSize: '11px', padding: '2px 8px' }}
              onClick={() => setPredCoefficient(predictionCategories[selectedCategory].k.toFixed(4))}
            >
              恢复默认
            </button>
          )}
        </div>
        <div style={{ color: 'var(--text-muted)' }}>
          公式: 饱和脂肪 = 脂肪 × {predCoefficient || '____'}
          {selectedCategory && predictionCategories[selectedCategory] && (
            <span> (类别推荐值: {predictionCategories[selectedCategory].k.toFixed(4)})</span>
          )}
        </div>
        <div style={{ color: 'var(--text-muted)', marginTop: '4px' }}>
          系数值可在帮助说明页面查阅参考
        </div>
      </div>
    )}
    <div style={{ marginTop: '8px', fontSize: '11px', color: 'var(--text-muted)' }}>
      预测类型: 交叉预测（通过已有指标预测关联指标）
    </div>
  </div>
</div>
```

- [ ] **Step 6: handleEditProduct中回显状态**

```typescript
setSelectedCategory(productCategories[product.code] || '')
const prodPred = predictionConfig[product.code] || {}
const satFatCfg = prodPred.saturated_fat || {} as any
setPredictSaturatedFat(satFatCfg.enabled || false)
setPredCoefficient(satFatCfg.coefficient?.toString() || '')
// 如果没有保存过系数但有类别，用类别默认值预填
if (!satFatCfg.coefficient && productCategories[product.code]) {
  const catK = predictionCategories[productCategories[product.code]]?.k
  if (catK) setPredCoefficient(catK.toFixed(4))
}
```

- [ ] **Step 7: handleSaveProduct中保存**

```typescript
// 保存产品类别
try {
  await api.updateProductCategory(newProduct.code, selectedCategory)
  setProductCategories(prev => ({ ...prev, [newProduct.code]: selectedCategory }))
} catch (e) { console.error('保存产品类别失败:', e) }

// 保存预测配置（通用的source→target结构，含用户配置的系数）
const predIndicators: Record<string, { source_indicator: string; coefficient: number; enabled: boolean }> = {}
if (predictSaturatedFat) {
  predIndicators.saturated_fat = {
    source_indicator: 'fat',
    coefficient: parseFloat(predCoefficient) || 0.6278,
    enabled: true,
  }
}
try {
  await api.updatePredictionConfig(newProduct.code, predIndicators)
  setPredictionConfig(prev => ({ ...prev, [newProduct.code]: predIndicators }))
} catch (e) { console.error('保存预测配置失败:', e) }
```

- [ ] **Step 8: 验证**

1. 表格显示"样品类别"列
2. 编辑弹窗可选类别、可勾选饱和脂肪预测
3. 勾选后显示"来源: 脂肪 → 饱和脂肪"和公式
4. 保存后JSON文件正确写入含source_indicator的结构

- [ ] **Step 9: Commit**

```bash
git add frontend/src/pages/Config/index.tsx
git commit -m "feat: product dialog with category dropdown and cross-indicator prediction config"
```

---

## Task 8: 前端 — SPC页面叠加预测曲线

**Covers:** 在脂肪SPC控制图上叠加显示预测饱和脂肪曲线

**Files:**
- Modify: `frontend/src/pages/SPC/index.tsx`

**展示效果：** 左Y轴=脂肪实测(蓝色实线)，右Y轴=饱和脂肪预测(橙色虚线)，tooltip同时显示两值。仅在查看源指标(fat)且该产品开启了对应预测时显示。

### Steps

- [ ] **Step 1: 新增状态和数据获取**

```typescript
const [predData, setPredData] = useState<any>(null)
const [predictionConfig, setPredictionConfig] = useState<Record<string, any>>({})

useEffect(() => {
  api.getPredictionConfig().then(setPredictionConfig).catch(() => {})
}, [])

useEffect(() => {
  // 找出当前指标是否是某个预测的源指标
  const prodPreds = predictionConfig[filter.product_code] || {}
  const matchingTarget = Object.entries(prodPreds).find(
    ([, cfg]: [string, any]) => cfg.source_indicator === filter.indicator_code && cfg.enabled
  )
  if (matchingTarget) {
    const [targetCode] = matchingTarget
    api.getCrossIndicatorPrediction(filter.product_code, targetCode, 100)
      .then(setPredData).catch(() => setPredData(null))
  } else {
    setPredData(null)
  }
}, [filter.product_code, filter.indicator_code, predictionConfig])
```

- [ ] **Step 2: iChartOption中叠加预测series**

在 `iChartOption` 的 useMemo 中，当 `predData?.enabled` 时添加第二series：

```typescript
const showPrediction = predData?.enabled && predData.data?.length > 0

// 时间对齐
let predValues: (number | null)[] = []
if (showPrediction) {
  predValues = times.map(t => {
    const match = predData.data.find((d: any) => formatTime(d.sample_time) === t)
    return match ? match.value : null
  })
}

// 双Y轴配置
yAxis: showPrediction
  ? [
      { type: 'value', ...chartTheme.yAxis, scale: true },  // 左轴: 源指标
      {
        type: 'value', position: 'right', splitLine: { show: false },
        axisLabel: { color: '#f59e0b', fontSize: 10 },
        axisLine: { show: true, lineStyle: { color: '#f59e0b' } },
        name: predData.model_info?.target_name || '预测值',
        nameTextStyle: { color: '#f59e0b', fontSize: 10 },
      },
    ]
  : { type: 'value', ...chartTheme.yAxis, scale: true },

// 追加series
...(showPrediction ? [{
  name: predData.model_info?.target_name || '预测值',
  type: 'line',
  yAxisIndex: 1,
  symbol: 'emptyCircle',
  symbolSize: 6,
  data: predValues,
  lineStyle: { color: '#f59e0b', width: 2, type: 'dashed' },
  itemStyle: { color: '#f59e0b' },
  connectNulls: true,
}] : []),
```

- [ ] **Step 3: tooltip中显示预测值**

```typescript
const predInfo = (showPrediction && predValues[idx] != null)
  ? `<br/><span style="color:#f59e0b">● ${predData.model_info?.target_name || '预测'}: <b>${predValues[idx]?.toFixed(4)}</b></span>`
  : ''
// 追加到return字符串
```

- [ ] **Step 4: 验证**

选择fat指标的SPC图，预测曲线叠加显示；切换到其他指标时消失。

- [ ] **Step 5: Commit**

```bash
git add frontend/src/pages/SPC/index.tsx
git commit -m "feat: overlay cross-indicator prediction curve on SPC chart"
```

---

## Task 9: 前端 — 实时看板叠加预测曲线

**Covers:** Dashboard实时数据趋势图叠加预测曲线，与SPC页面逻辑一致

**Files:**
- Modify: `frontend/src/pages/Dashboard/index.tsx`

**展示效果：** 与Task 8相同的双Y轴叠加模式。当看板轮播到源指标(如fat)时，自动叠加目标指标(如饱和脂肪)的预测曲线。

### Steps

- [ ] **Step 1: 新增状态和数据获取**

```typescript
const [predData, setPredData] = useState<any>(null)
const [predictionConfig, setPredictionConfig] = useState<Record<string, any>>({})

// 加载预测配置
useEffect(() => {
  api.getPredictionConfig().then(setPredictionConfig).catch(() => {})
}, [])

// 当当前品项和指标变化时获取预测数据
useEffect(() => {
  if (!currentProduct || !currentIndicator) { setPredData(null); return }
  const prodPreds = predictionConfig[currentProduct.code] || {}
  const matchingTarget = Object.entries(prodPreds).find(
    ([, cfg]: [string, any]) => cfg.source_indicator === currentIndicator.code && cfg.enabled
  )
  if (matchingTarget) {
    const [targetCode] = matchingTarget
    api.getCrossIndicatorPrediction(currentProduct.code, targetCode, 100)
      .then(setPredData).catch(() => setPredData(null))
  } else {
    setPredData(null)
  }
}, [currentProduct?.code, currentIndicator?.code, predictionConfig])
```

- [ ] **Step 2: chartOption中叠加预测series**

与Task 8 Step 2相同的逻辑——在Dashboard的 `chartOption` useMemo中，当 `predData?.enabled` 时：

```typescript
const showPrediction = predData?.enabled && predData.data?.length > 0

let predValues: (number | null)[] = []
if (showPrediction) {
  const sortedTimes = sorted.map(d =>
    new Date(d.sample_time).toLocaleTimeString('zh-CN', { hour: '2-digit', minute: '2-digit' })
  )
  predValues = sortedTimes.map(t => {
    const match = predData.data.find((d: any) =>
      new Date(d.sample_time).toLocaleTimeString('zh-CN', { hour: '2-digit', minute: '2-digit' }) === t
    )
    return match ? match.value : null
  })
}

// legend更新
legend: {
  data: [
    currentIndicator.name,
    ...(showPrediction ? [predData.model_info?.target_name || '预测值'] : []),
  ],
  textStyle: { color: '#8b95a7' },
  top: 0, right: 10,
},

// 双Y轴
yAxis: showPrediction
  ? [
      { type: 'value', ...chartTheme.yAxis, scale: true },
      {
        type: 'value', position: 'right', splitLine: { show: false },
        axisLabel: { color: '#f59e0b', fontSize: 10 },
        axisLine: { show: true, lineStyle: { color: '#f59e0b' } },
        name: predData.model_info?.target_name || '预测值',
        nameTextStyle: { color: '#f59e0b', fontSize: 10 },
      },
    ]
  : { type: 'value', ...chartTheme.yAxis, scale: true },

// 追加预测series到series数组末尾（_ref之前）
...(showPrediction ? [{
  name: predData.model_info?.target_name || '预测值',
  type: 'line',
  yAxisIndex: 1,
  symbol: 'emptyCircle',
  symbolSize: 5,
  data: predValues,
  lineStyle: { color: '#f59e0b', width: 2, type: 'dashed' },
  itemStyle: { color: '#f59e0b' },
  connectNulls: true,
}] : []),
```

- [ ] **Step 3: tooltip中显示预测值**

与Task 8 Step 3相同的逻辑。

- [ ] **Step 4: 验证**

1. Dashboard选择某开启了fat→saturated_fat预测的产品
2. 轮播到"脂肪"指标时，趋势图自动叠加橙色虚线(预测饱和脂肪)
3. 轮播到其他指标(如蛋白质)时，预测曲线消失
4. Legend显示两个指标名
5. Hover tooltip同时显示脂肪值和预测饱和脂肪值

- [ ] **Step 5: Commit**

```bash
git add frontend/src/pages/Dashboard/index.tsx
git commit -m "feat: overlay cross-indicator prediction curve on dashboard trend chart"
```

---

## Task 10: 帮助说明页面 — 预测系数参考表

**Covers:** 将建模分析得到的推荐系数作为参考文档放入帮助页面

**Files:**
- Modify: `frontend/src/pages/Help/ManualPage.tsx` 或相关帮助页面组件

**说明：** 用户在品项管理中自行配置预测系数，帮助页面提供推荐参考值和使用说明。

### Steps

- [ ] **Step 1: 在帮助页面添加"交叉预测"章节**

在帮助页面中新增两个章节：

**章节一：预测系数参考表**

```markdown
## 交叉预测 — 脂肪→饱和脂肪 系数参考

通过脂肪值实时预测饱和脂肪，公式为：**饱和脂肪 = 脂肪 × 系数(k)**

### 推荐系数（基于4138条历史数据建模）

| 产品类别 | 推荐系数k | 数据拟合度(R²) | 样本数 | 建议 |
|---------|----------|--------------|--------|------|
| 灭菌乳 | 0.6277 | 0.92 | 2226 | ★★★★★ 直接使用 |
| 调制乳 | 0.6320 | 0.98 | 604 | ★★★★★ 直接使用 |
| 乳饮料 | 0.6230 | 0.97 | 837 | ★★★★★ 直接使用 |
| 发酵乳 | 0.6232 | 0.67 | 299 | ★★★★☆ 可用，波动稍大 |
| 超滤纯牛奶 | 0.6255 | — | 10 | ★★★☆☆ 样本少，建议验证 |
| 乳味饮料 | 0.6301 | 0.13 | 35 | ★★★☆☆ 样本少，建议验证 |
| 果蔬汁类饮料 | 0.6187 | 0.96 | 48 | ★★★★☆ 可用 |
| 植物蛋白饮品 | 0.1742 | — | 23 | ★★☆☆☆ 数据离散，仅作参考 |
| 风味饮料 | 0.5480 | 0.81 | 23 | ★★★☆☆ 样本少 |
| 复合蛋白饮料 | 0.3231 | — | 3 | ★★☆☆☆ 样本极少 |
| 奶油 | 0.6470 | 0.99 | 3 | ★★★★★ 样本少但拟合好 |

### 统一默认系数
如不区分类别，乳制品统一使用 **k ≈ 0.6278**（R²=0.98，覆盖灭菌乳/发酵乳/乳饮料/调制乳）

### 使用说明
1. 在品项管理中选择产品类别，系统自动填入推荐系数
2. 系数可手动修改，修改后预测公式立即更新
3. 建议先用默认系数运行一段时间，对比实际检测值后再微调
4. 植物蛋白饮品系数(0.1742)离散度较高，建议仅作参考
```

**章节二：方法对比与精度分析（辅助用户决策）**

```markdown
## 预测方法对比与精度分析

本系统采用"线性公式预测"作为交叉预测的计算方法。以下对比了多种预测方法的精度，
帮助用户理解预测结果的可信度和局限性。

### 一、乳制品主组（灭菌乳/调制乳/乳饮料，n=3667）

| 方法 | R² | 平均误差(MAE) | 说明 |
|------|-----|-------------|------|
| **线性公式（当前采用）** | **0.985** | **0.071** | 饱和脂肪 = 脂肪 × 0.6278 |
| 线性+截距 | 0.985 | 0.071 | 饱和脂肪 = 0.6187×脂肪 + 0.036 |
| 二次多项式 | 0.985 | 0.071 | 无显著提升 |
| 随机森林(ML) | 0.986 | 0.068 | 提升0.001，不值得增加复杂度 |
| 梯度提升(ML) | 0.986 | 0.068 | 同上 |

**结论：线性公式已是该场景的最优解。** 机器学习方法仅提升0.1%的R²，
但增加了模型复杂度和维护成本，性价比极低。

### 二、乳制品主组误差分布

| 指标 | 值 |
|------|-----|
| 平均绝对误差 | 0.071 g/100g |
| 中位绝对误差 | 0.052 g/100g |
| 90%样本误差 | < 0.155 g/100g |
| 95%样本误差 | < 0.196 g/100g |
| **误差 < ±5% 的比例** | **74.7%** |
| **误差 < ±10% 的比例** | **96.5%** |
| **误差 < ±15% 的比例** | **98.4%** |

### 三、发酵乳（R²=0.67，精度偏低）

| 方法 | R² | 说明 |
|------|-----|------|
| 线性公式 | 0.64 | 当前采用 |
| 随机森林(ML) | 0.61 | 反而更差 |
| 梯度提升(ML) | 0.60 | 反而更差 |

**结论：发酵乳的精度限制来自数据本身，不是模型问题。**
发酵过程中乳酸菌分解脂肪的比例不固定，导致同一脂肪含量对应的饱和脂肪有自然波动。
这是生产工艺的固有特征，任何预测模型都无法消除。

### 四、植物蛋白饮品（R²为负值，不建议预测）

| 方法 | R² | 说明 |
|------|-----|------|
| 线性公式 | 负值 | 23个样本，ratio从0.14到0.36 |
| 线性+截距 | 0.08 | 几乎无解释力 |
| 梯度提升(ML) | 负值 | 样本太少，ML完全失效 |

**结论：植物蛋白饮品的脂肪组成差异大（豆奶vs杏仁奶vs椰奶），
仅靠脂肪值无法预测饱和脂肪。** 建议该类型不做预测，或仅作极粗略参考。

### 五、为什么不用机器学习？

| 维度 | 线性公式 | 机器学习(GBDT/RF) |
|------|---------|------------------|
| 乳制品R² | 0.985 | 0.986（仅+0.001） |
| 可解释性 | 公式直观，用户可验算 | 黑盒，无法手工验证 |
| 计算开销 | 一次乘法，<1ms | 需加载模型，~10ms |
| 维护成本 | 改系数即可 | 需重新训练、版本管理 |
| 实时性 | 即时 | 需模型文件部署 |

**总结：当单指标线性关系已经很强（R²>0.98）时，ML方法的边际收益极小，
但引入的复杂度和维护成本显著增加。** 线性公式是实时生产环境的最佳选择。

### 六、如何提升精度？

如果未来需要更高精度，唯一的路径是**多指标联合预测**：

饱和脂肪 = a×脂肪 + b×蛋白质 + c×非脂乳固体 + d

FT1/FT120仪器通常已采集蛋白质和非脂乳固体数据，
多指标模型对发酵乳和植物蛋白饮品可能有实质提升。
```

- [ ] **Step 2: 验证**

帮助页面中能看到预测系数参考表，内容与建模分析结果一致。

- [ ] **Step 3: Commit**

```bash
git add frontend/src/pages/Help/
git commit -m "docs: add cross-indicator prediction coefficient reference to help page"
```

---

## 实施顺序与依赖关系

```
Task 1 (类别配置) ──┐
                    ├──→ Task 4 (采集触发) ──→ Task 5 (查询API) ──┬→ Task 8 (SPC叠加)
Task 2 (预测配置) ──┤                                              └→ Task 9 (看板叠加)
                    │
Task 3 (预测引擎) ──┘

Task 6 (前端API) ──┬→ Task 7 (前端UI) ──→ Task 10 (帮助页面)
                    ├──→ Task 8 (SPC叠加)
                    └──→ Task 9 (看板叠加)
```

**建议执行顺序：** 1 → 2 → 3 → 4 → 5 → 6 → 7 → 8 → 9 → 10

**预计工作量：**
- Task 1-3: 后端基础（约30分钟）
- Task 4-5: 后端集成（约30分钟）
- Task 6-7: 前端品项管理改造（约45分钟）
- Task 8: SPC叠加（约20分钟）
- Task 9: 看板叠加（约20分钟）
- Task 10: 帮助页面（约10分钟）

## 验收标准

1. 品项管理表格显示"样品类别"列
2. 编辑弹窗可选择产品类别（14种下拉选项），选择后自动填入推荐系数
3. 编辑弹窗显示"预测指标"模块，含源指标→目标指标说明和**可编辑的系数输入框**
4. 系数输入框旁有"恢复默认"按钮（从类别推荐值恢复）
5. 配置保存后JSON文件正确写入（含`source_indicator`和`coefficient`字段）
6. Mock采集触发后，`monitor_data`表中出现`saturated_fat`记录（`is_predicted=1`），值=脂肪×用户配置的系数
7. **SPC页面**：查看脂肪指标时，图表叠加橙色虚线(预测饱和脂肪)，双Y轴，tooltip含预测值
8. **实时看板**：轮播到脂肪指标时，趋势图同样叠加预测曲线
9. 切换到非源指标时，预测曲线自动消失
10. **帮助页面**：显示预测系数参考表（含R²、建议等级）+ 方法对比精度分析（含误差分布、ML对比、使用建议）
