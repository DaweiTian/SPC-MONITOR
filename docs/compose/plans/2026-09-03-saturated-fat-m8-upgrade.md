# 饱和脂肪跨指标预测升级：单k值 → M8随机森林

> **For agentic workers:** REQUIRED SUB-SKILL: Use compose:subagent (recommended) or compose:execute to implement this plan task-by-task. Steps use checkbox (`- [ ]`) syntax for tracking.

**Goal:** 将饱和脂肪跨指标预测从单一线性k值公式升级为M8随机森林模型，保留线性预测作为降级方案。

**Architecture:** 新增M8模型引擎模块，与现有线性预测并存。`prediction_config.json` 新增 `prediction_method` 字段（`"linear"` / `"random_forest"`）。随机森林模式下自动从历史数据获取蛋白质和酸度，特征缺失时自动降级到线性预测。前端品项管理UI新增预测方式切换。

**Tech Stack:** Python 3.x, FastAPI, scikit-learn (joblib), React + TypeScript, CSS Modules

## Global Constraints

- 模型文件: `脂肪-饱和脂肪多特征回归数据_m8_model.pkl`（已训练好，5特征：脂肪+品项编码+季节编码+蛋白质+酸度）
- LabelEncoder品项映射: 灭菌乳=7, 调制乳=9, 发酵乳=2, 乳饮料=1, 超滤纯牛奶=11, 乳味饮料=0, 植物蛋白饮品=6, 果蔬汁类饮料=5, 风味饮料=12, 复合蛋白饮料=3, 奶油=4, 茶饮料=8, 谷物类饮料=10
- LabelEncoder季节映射: 冬季=0, 夏季=1, 春秋=2
- 现有 `CATEGORY_DEFAULT_K` 字典和 `PREDICTION_CATEGORIES` 必须保留（线性降级方案使用）
- 后端已有 `scikit-learn>=1.3.0` 依赖，无需新增
- 前端 `prediction_config.json` schema 向后兼容：新增字段均为可选，旧配置无需迁移

---

### Task 1: 部署M8模型文件

**Covers:** 模型文件部署

**Files:**
- Copy: `/mnt/d/伊利/数据建模/脂肪-饱和脂肪多特征回归数据_m8_model.pkl` → `backend/models/m8_saturated_fat.pkl`

- [ ] **Step 1: 创建models目录并复制模型文件**

```bash
mkdir -p /home/erribaba/git-workstation/spc-monitor/backend/models
cp "/mnt/d/伊利/数据建模/脂肪-饱和脂肪多特征回归数据_m8_model.pkl" \
   /home/erribaba/git-workstation/spc-monitor/backend/models/m8_saturated_fat.pkl
```

- [ ] **Step 2: 验证模型文件可加载**

Run:
```bash
cd /home/erribaba/git-workstation/spc-monitor
python3 -c "
import joblib
data = joblib.load('backend/models/m8_saturated_fat.pkl')
print('Keys:', list(data.keys()))
print('Features:', data['model'].n_features_in_)
print('Types:', list(data['le_type'].classes_))
print('Seasons:', list(data['le_season'].classes_))
print('OK')
"
```
Expected: 打印模型信息，最后输出 `OK`

- [ ] **Step 3: Commit**

```bash
git add backend/models/m8_saturated_fat.pkl
git commit -m "feat: deploy M8 random forest model for saturated fat prediction"
```

---

### Task 2: 创建M8模型预测引擎

**Covers:** 核心预测逻辑

**Files:**
- Create: `backend/app/engine/predictor/m8_model.py`

**Interfaces:**
- Produces: `predict_m8(source_value, product_category, product_name, protein, acidity, sample_time=None) -> dict`
  - 返回: `{"predicted_value": float, "method": "random_forest", "features": dict, "confidence_note": str}`
  - 异常: 特征缺失时抛出 `FeatureMissingError`
- Produces: `is_m8_available() -> bool` — 检查模型文件是否可加载
- Produces: `CATEGORY_TO_CHINESE: dict[str, str]` — 品项编码到中文名的映射

- [ ] **Step 1: 创建M8模型引擎模块**

```python
"""M8随机森林预测引擎 - 饱和脂肪跨指标预测

模型特征: [脂肪, 品项编码, 季节编码, 蛋白质, 酸度]
模型文件: backend/models/m8_saturated_fat.pkl
"""
import os
import logging
from datetime import datetime
from typing import Optional

import joblib
import numpy as np

logger = logging.getLogger(__name__)

# 品项编码 → 中文名（与模型LabelEncoder一致）
CATEGORY_TO_CHINESE = {
    "sterilized_milk": "灭菌乳",
    "fermented_milk": "发酵乳",
    "milk_drink": "乳饮料",
    "modified_milk": "调制乳",
    "uf_pure_milk": "超滤纯牛奶",
    "milk_flavored_drink": "乳味饮料",
    "plant_protein": "植物蛋白饮品",
    "juice_drink": "果蔬汁类饮料",
    "flavored_drink": "风味饮料",
    "compound_protein": "复合蛋白饮料",
    "cream": "奶油",
    "tea_drink": "茶饮料",
    "grain_drink": "谷物类饮料",
    "mineral_water": "矿泉水",
}

# 反向映射：中文名 → category_code
_CHINESE_TO_CATEGORY = {v: k for k, v in CATEGORY_TO_CHINESE.items()}


class FeatureMissingError(ValueError):
    """模型所需特征缺失"""


class M8ModelEngine:
    """M8随机森林模型单例引擎"""

    _instance: Optional["M8ModelEngine"] = None
    _model = None
    _le_type = None
    _le_season = None
    _loaded = False

    def __new__(cls):
        if cls._instance is None:
            cls._instance = super().__new__(cls)
        return cls._instance

    def load(self, model_path: str = None) -> bool:
        if self._loaded:
            return True
        if model_path is None:
            model_path = os.path.join(
                os.path.dirname(__file__), "..", "..", "..", "models", "m8_saturated_fat.pkl"
            )
        if not os.path.exists(model_path):
            logger.warning(f"M8模型文件不存在: {model_path}")
            return False
        try:
            data = joblib.load(model_path)
            self._model = data["model"]
            self._le_type = data["le_type"]
            self._le_season = data["le_season"]
            self._loaded = True
            logger.info("M8随机森林模型加载成功")
            return True
        except Exception as e:
            logger.error(f"M8模型加载失败: {e}")
            return False

    @property
    def is_available(self) -> bool:
        if not self._loaded:
            return self.load()
        return True

    def _get_season(self, sample_time: str = None) -> str:
        """根据采样时间或当前时间确定季节"""
        if sample_time:
            try:
                # sample_time 格式: "2026-09-03 10:00:00" 或类似
                dt = datetime.strptime(str(sample_time)[:10], "%Y-%m-%d")
                month = dt.month
            except (ValueError, TypeError):
                month = datetime.now().month
        else:
            month = datetime.now().month
        if month in [6, 7, 8]:
            return "夏季"
        elif month in [12, 1, 2]:
            return "冬季"
        return "春秋"

    def predict(
        self,
        fat_value: float,
        product_category: str,
        product_name: str = "",
        protein: Optional[float] = None,
        acidity: Optional[float] = None,
        sample_time: str = None,
    ) -> dict:
        """
        M8随机森林预测饱和脂肪

        Args:
            fat_value: 脂肪含量 (g/100g)
            product_category: 品项编码 (如 "sterilized_milk")
            product_name: 产品名称（用于检测特殊品项如娟姗）
            protein: 蛋白质含量 (g/100g)，None则缺失
            acidity: 酸度 (°T)，None则缺失
            sample_time: 采样时间字符串

        Returns:
            {"predicted_value": float, "method": "random_forest", "features": dict}

        Raises:
            FeatureMissingError: 蛋白质或酸度数据缺失
        """
        if not self.is_available:
            raise FeatureMissingError("M8模型不可用")

        # 验证输入
        if fat_value is None or fat_value <= 0:
            raise FeatureMissingError(f"脂肪值无效: {fat_value}")
        if protein is None:
            raise FeatureMissingError("蛋白质数据缺失")
        if acidity is None:
            raise FeatureMissingError("酸度数据缺失")

        # 映射品项
        chinese_type = CATEGORY_TO_CHINESE.get(product_category)
        if chinese_type is None:
            raise FeatureMissingError(f"未知品项编码: {product_category}")
        try:
            type_encoded = self._le_type.transform([chinese_type])[0]
        except ValueError:
            raise FeatureMissingError(f"品项 '{chinese_type}' 不在模型训练范围内")

        # 映射季节
        season = self._get_season(sample_time)
        season_encoded = self._le_season.transform([season])[0]

        # 构造特征向量 [脂肪, 品项编码, 季节编码, 蛋白质, 酸度]
        X = np.array([[fat_value, type_encoded, season_encoded, protein, acidity]])
        predicted = float(self._model.predict(X)[0])

        return {
            "predicted_value": round(predicted, 4),
            "method": "random_forest",
            "features": {
                "fat": fat_value,
                "product_type": chinese_type,
                "season": season,
                "protein": protein,
                "acidity": acidity,
            },
        }


# 模块级便捷函数
_engine = M8ModelEngine()


def predict_m8(
    fat_value: float,
    product_category: str,
    product_name: str = "",
    protein: Optional[float] = None,
    acidity: Optional[float] = None,
    sample_time: str = None,
) -> dict:
    return _engine.predict(fat_value, product_category, product_name, protein, acidity, sample_time)


def is_m8_available() -> bool:
    return _engine.is_available
```

- [ ] **Step 2: 验证模块可导入**

Run:
```bash
cd /home/erribaba/git-workstation/spc-monitor
python3 -c "
from backend.app.engine.predictor.m8_model import predict_m8, is_m8_available, FeatureMissingError
print('M8 available:', is_m8_available())
result = predict_m8(3.6, 'sterilized_milk', '', 3.2, 15.0)
print('Prediction:', result)
"
```
Expected: `M8 available: True` 和预测结果

- [ ] **Step 3: Commit**

```bash
git add backend/app/engine/predictor/m8_model.py
git commit -m "feat: add M8 random forest prediction engine for saturated fat"
```

---

### Task 3: 修改cross_indicator.py支持双模式预测

**Covers:** 核心预测逻辑集成

**Files:**
- Modify: `backend/app/engine/predictor/cross_indicator.py`

**Interfaces:**
- Consumes: `predict_m8()`, `is_m8_available()`, `FeatureMissingError` from `m8_model`
- Consumes: `storage.get_recent_data()` for fetching protein/acidity
- Modifies: `predict_cross_indicator()` 新增可选参数，内部自动选择预测方式

- [ ] **Step 1: 重写cross_indicator.py**

```python
"""通用指标交叉预测引擎

支持两种预测方式:
1. 线性预测: 目标指标值 = 源指标值 × coefficient（默认/降级方案）
2. M8随机森林: 基于脂肪+蛋白质+酸度+品项+季节的多特征预测

prediction_method 由用户在品项管理页面配置（prediction_config.json），
随机森林模式下特征缺失时自动降级到线性预测。
"""

import logging
from typing import Optional

logger = logging.getLogger(__name__)

TARGET_INDICATOR_META = {
    "saturated_fat": {"name": "饱和脂肪", "unit": "g/100g"},
}

SOURCE_INDICATOR_META = {
    "fat": {"name": "脂肪"},
    "protein": {"name": "蛋白质"},
    "snf": {"name": "非脂乳固体"},
    "ts": {"name": "全脂乳固体"},
    "acidity": {"name": "酸度"},
}

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
    return 0.6278


def predict_cross_indicator(
    source_value: float,
    coefficient: float,
    source_indicator: str = "",
    target_indicator: str = "",
    # M8模式新增参数
    prediction_method: str = "linear",
    product_category: str = "",
    product_name: str = "",
    protein: Optional[float] = None,
    acidity: Optional[float] = None,
    sample_time: str = None,
) -> dict:
    """
    通用指标交叉预测，支持线性/M8双模式

    Args:
        source_value: 源指标的实时值（脂肪）
        coefficient: 用户配置的预测系数（线性模式使用）
        source_indicator: 源指标code
        target_indicator: 目标指标code
        prediction_method: "linear" 或 "random_forest"
        product_category: 品项编码（M8模式需要）
        product_name: 产品名称（M8模式可选，用于特殊品项检测）
        protein: 蛋白质含量（M8模式需要）
        acidity: 酸度（M8模式需要）
        sample_time: 采样时间（M8模式可选，用于确定季节）

    Returns:
        {"predicted_value", "coefficient", "formula", "target_name", "target_unit", "method"}
    """
    meta = TARGET_INDICATOR_META.get(target_indicator, {"name": target_indicator, "unit": ""})
    source_meta = SOURCE_INDICATOR_META.get(source_indicator, {"name": source_indicator})

    method_used = "linear"

    # 尝试M8随机森林预测
    if prediction_method == "random_forest" and target_indicator == "saturated_fat":
        try:
            from backend.app.engine.predictor.m8_model import predict_m8, FeatureMissingError
            result = predict_m8(
                fat_value=source_value,
                product_category=product_category,
                product_name=product_name,
                protein=protein,
                acidity=acidity,
                sample_time=sample_time,
            )
            return {
                "predicted_value": result["predicted_value"],
                "coefficient": round(coefficient, 6),
                "formula": f"{meta['name']} = RF(脂肪={source_value:.2f}, 蛋白质={protein:.2f}, 酸度={acidity:.1f})",
                "target_name": meta["name"],
                "target_unit": meta["unit"],
                "method": "random_forest",
                "features": result.get("features"),
            }
        except Exception as e:
            logger.info(f"M8预测失败，降级到线性预测: {e}")
            method_used = "linear_fallback"

    # 线性预测（默认或降级）
    predicted = round(source_value * coefficient, 4)
    return {
        "predicted_value": predicted,
        "coefficient": round(coefficient, 6),
        "formula": f"{meta['name']} = {source_meta['name']} × {coefficient:.4f}",
        "target_name": meta["name"],
        "target_unit": meta["unit"],
        "method": method_used,
    }
```

- [ ] **Step 2: 验证向后兼容**

Run:
```bash
cd /home/erribaba/git-workstation/spc-monitor
python3 -c "
from backend.app.engine.predictor.cross_indicator import predict_cross_indicator

# 线性模式（向后兼容）
r1 = predict_cross_indicator(3.6, 0.6277, 'fat', 'saturated_fat')
print('Linear:', r1)
assert r1['method'] == 'linear'
assert r1['predicted_value'] == round(3.6 * 0.6277, 4)

# M8模式
r2 = predict_cross_indicator(3.6, 0.6277, 'fat', 'saturated_fat',
    prediction_method='random_forest', product_category='sterilized_milk',
    protein=3.2, acidity=15.0)
print('M8:', r2)
assert r2['method'] == 'random_forest'

# M8降级（缺少蛋白质）
r3 = predict_cross_indicator(3.6, 0.6277, 'fat', 'saturated_fat',
    prediction_method='random_forest', product_category='sterilized_milk',
    protein=None, acidity=15.0)
print('Fallback:', r3)
assert r3['method'] == 'linear_fallback'

print('All OK')
"
```
Expected: 三种模式均输出正确，最后 `All OK`

- [ ] **Step 3: Commit**

```bash
git add backend/app/engine/predictor/cross_indicator.py
git commit -m "feat: add dual-mode prediction (linear/M8) to cross_indicator engine"
```

---

### Task 4: 更新main.py数据采集循环

**Covers:** 数据采集时的预测调用

**Files:**
- Modify: `backend/main.py:172-224` (`_run_cross_predictions` 函数)

- [ ] **Step 1: 修改_run_cross_predictions支持M8模式**

将 `backend/main.py` 中 `_run_cross_predictions` 函数修改为：

```python
def _run_cross_predictions(storage):
    """对最新采集的数据执行交叉预测（如 fat → saturated_fat）"""
    try:
        with open(get_conf_path("prediction_config.json"), "r", encoding="utf-8") as f:
            pred_config = json.load(f)
    except (FileNotFoundError, json.JSONDecodeError):
        return

    if not pred_config:
        return

    from backend.app.engine.predictor.cross_indicator import predict_cross_indicator

    predicted_records = []
    for product_code, targets in pred_config.items():
        for target_code, cfg in targets.items():
            try:
                if not cfg.get("enabled", False):
                    continue
                source_code = cfg.get("source_indicator", "")
                coefficient = cfg.get("coefficient")
                if not source_code or coefficient is None:
                    continue

                # Read the latest source indicator value for this product
                recent = storage.get_recent_data(source_code, product_code, limit=1)
                if not recent:
                    continue

                latest = recent[0]
                if latest.get("value") is None:
                    continue

                # M8模式: 获取蛋白质和酸度数据
                prediction_method = cfg.get("prediction_method", "linear")
                protein_val = None
                acidity_val = None
                sample_time = latest.get("sample_time")
                product_category = cfg.get("product_category", "")
                product_name = latest.get("product_name", "")

                if prediction_method == "random_forest":
                    # 获取最新蛋白质数据
                    protein_recent = storage.get_recent_data("protein", product_code, limit=1)
                    if protein_recent and protein_recent[0].get("value") is not None:
                        protein_val = float(protein_recent[0]["value"])
                    # 获取最新酸度数据
                    acidity_recent = storage.get_recent_data("acidity", product_code, limit=1)
                    if acidity_recent and acidity_recent[0].get("value") is not None:
                        acidity_val = float(acidity_recent[0]["value"])

                result = predict_cross_indicator(
                    latest["value"], float(coefficient), source_code, target_code,
                    prediction_method=prediction_method,
                    product_category=product_category,
                    product_name=product_name,
                    protein=protein_val,
                    acidity=acidity_val,
                    sample_time=sample_time,
                )
                predicted_records.append({
                    "indicator_code": target_code,
                    "indicator_name": f"{result['target_name']}(预测)",
                    "product_code": product_code,
                    "product_name": latest.get("product_name", ""),
                    "value": result["predicted_value"],
                    "unit": result.get("target_unit", "g/100g"),
                    "sample_time": latest.get("sample_time", ""),
                })
            except Exception as e:
                logger.warning(f"交叉预测失败 {product_code}/{target_code}: {e}")
                continue

    if predicted_records:
        saved = storage.save_predicted_data(predicted_records)
        if saved > 0:
            logger.info(f"交叉预测: 生成 {saved} 条预测记录")
```

- [ ] **Step 2: Commit**

```bash
git add backend/main.py
git commit -m "feat: integrate M8 prediction into data collection loop"
```

---

### Task 5: 更新API端点

**Covers:** API层集成

**Files:**
- Modify: `backend/app/api/predict.py:1011-1074` (`get_cross_indicator_prediction` 函数)

- [ ] **Step 1: 修改cross-indicator API端点**

将 `backend/app/api/predict.py` 中 `get_cross_indicator_prediction` 函数的预测循环部分修改为：

```python
    # 在 source_data 循环中，替换原来的简单调用
    prediction_method = target_cfg.get("prediction_method", "linear")
    product_category = target_cfg.get("product_category", "")

    predicted_data = []
    latest_predicted = None
    latest_sample_id = None
    latest_remark = None
    for d in source_data:
        src_val = d.get("value")
        if src_val is None:
            continue

        # M8模式: 获取蛋白质和酸度
        protein_val = None
        acidity_val = None
        if prediction_method == "random_forest":
            protein_recent = storage.get_recent_data("protein", product, limit=1)
            if protein_recent and protein_recent[0].get("value") is not None:
                protein_val = float(protein_recent[0]["value"])
            acidity_recent = storage.get_recent_data("acidity", product, limit=1)
            if acidity_recent and acidity_recent[0].get("value") is not None:
                acidity_val = float(acidity_recent[0]["value"])

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
        })
        latest_predicted = result["predicted_value"]
        latest_sample_id = d.get("sample_id")
        latest_remark = d.get("remark")
```

- [ ] **Step 2: Commit**

```bash
git add backend/app/api/predict.py
git commit -m "feat: update cross-indicator API to support M8 prediction mode"
```

---

### Task 6: 更新前端配置UI

**Covers:** 品项管理UI新增预测方式切换

**Files:**
- Modify: `frontend/src/pages/Config/index.tsx` — 新增 `predictionMethod` 状态和UI切换
- Modify: `frontend/src/services/api.ts` — 确保API类型兼容

- [ ] **Step 1: 在Config/index.tsx中新增状态变量**

在现有 `predCoefficient` 状态附近（约203行）新增：

```typescript
const [predictionMethod, setPredictionMethod] = useState<'linear' | 'random_forest'>('linear')
```

- [ ] **Step 2: 在品项编辑弹窗加载时读取prediction_method**

修改 `handleEditProduct` 函数中加载预测配置的部分（约579行），在 `setPredCoefficient` 之后新增：

```typescript
setPredictionMethod((satFatCfg as any)?.prediction_method || 'linear')
```

- [ ] **Step 3: 在保存时写入prediction_method**

修改 `handleSaveProduct` 函数中构建 `predIndicators` 的部分（约719行），在 `saturated_fat` 对象中新增字段：

```typescript
predIndicators.saturated_fat = {
    source_indicator: 'fat',
    coefficient: parseFloat(predCoefficient) || 0.6278,
    enabled: true,
    prediction_method: predictionMethod,  // 新增
    product_category: selectedCategory || '',  // 新增：品项编码供M8使用
    alert_enabled: alertEnabled,
    alert_threshold: parseFloat(alertThreshold) / 100 || 0.10,
    usl: predUsl !== '' ? parseFloat(predUsl) : null,
    lsl: predLsl !== '' ? parseFloat(predLsl) : null,
    target: predTarget !== '' ? parseFloat(predTarget) : null,
    unit: predUnit || null,
}
```

- [ ] **Step 4: 在预测指标UI区域新增预测方式切换**

在"预测指标"区域（约2017行 `{predictSaturatedFat && (` 之后），在预测系数输入框之前新增：

```tsx
{/* 预测方式选择 */}
<div style={{ display: 'flex', alignItems: 'center', gap: '12px', marginBottom: '10px' }}>
    <span style={{ fontSize: '12px', color: 'var(--text-secondary)' }}>预测方式:</span>
    <label style={{ display: 'flex', alignItems: 'center', gap: '4px', cursor: 'pointer', fontSize: '12px' }}>
        <input
            type="radio"
            name="predMethod"
            checked={predictionMethod === 'linear'}
            onChange={() => setPredictionMethod('linear')}
        />
        <span>线性公式 (k值)</span>
    </label>
    <label style={{ display: 'flex', alignItems: 'center', gap: '4px', cursor: 'pointer', fontSize: '12px' }}>
        <input
            type="radio"
            name="predMethod"
            checked={predictionMethod === 'random_forest'}
            onChange={() => setPredictionMethod('random_forest')}
        />
        <span>随机森林 (M8)</span>
    </label>
</div>
```

- [ ] **Step 5: 根据预测方式显示不同提示**

将现有的公式显示区域（约2044行 `公式: 饱和脂肪 = 脂肪 × ...`）改为条件渲染：

```tsx
{predictionMethod === 'linear' ? (
    <div style={{ color: 'var(--text-muted)' }}>
        公式: 饱和脂肪 = 脂肪 × {predCoefficient || '____'}
        {selectedCategory && predictionCategories[selectedCategory] && (
            <span> (类别推荐值: {predictionCategories[selectedCategory].k.toFixed(4)})</span>
        )}
    </div>
) : (
    <div style={{ color: 'var(--text-muted)' }}>
        模型: M8随机森林 (脂肪 + 蛋白质 + 酸度 + 品项 + 季节)
        <br />
        <span style={{ fontSize: '11px' }}>精度: MAPE≈2.4%, R²≈0.9946 | 蛋白质/酸度缺失时自动降级为线性公式</span>
    </div>
)}
```

- [ ] **Step 6: Commit**

```bash
git add frontend/src/pages/Config/index.tsx
git commit -m "feat: add prediction method toggle (linear/M8) in product config UI"
```

---

### Task 7: 验证与集成测试

**Covers:** 端到端验证

**Files:**
- Test: 手动验证

- [ ] **Step 1: 后端模块集成验证**

Run:
```bash
cd /home/erribaba/git-workstation/spc-monitor
python3 -c "
from backend.app.engine.predictor.cross_indicator import predict_cross_indicator

# 1. 线性模式（向后兼容）
r1 = predict_cross_indicator(3.6, 0.6277, 'fat', 'saturated_fat')
assert r1['method'] == 'linear'
print('1. Linear OK:', r1['predicted_value'])

# 2. M8模式
r2 = predict_cross_indicator(3.6, 0.6277, 'fat', 'saturated_fat',
    prediction_method='random_forest', product_category='sterilized_milk',
    protein=3.2, acidity=15.0)
assert r2['method'] == 'random_forest'
print('2. M8 OK:', r2['predicted_value'])

# 3. M8降级（缺蛋白质）
r3 = predict_cross_indicator(3.6, 0.6277, 'fat', 'saturated_fat',
    prediction_method='random_forest', product_category='sterilized_milk',
    protein=None, acidity=15.0)
assert r3['method'] == 'linear_fallback'
print('3. Fallback OK:', r3['predicted_value'])

# 4. M8不同品项
r4 = predict_cross_indicator(3.5, 0.6232, 'fat', 'saturated_fat',
    prediction_method='random_forest', product_category='fermented_milk',
    protein=3.0, acidity=70.0)
assert r4['method'] == 'random_forest'
print('4. Fermented milk OK:', r4['predicted_value'])

print('All integration tests passed!')
"
```
Expected: `All integration tests passed!`

- [ ] **Step 2: 前端构建验证**

Run:
```bash
cd /home/erribaba/git-workstation/spc-monitor/frontend
npm run build
```
Expected: 构建成功，无TypeScript错误

- [ ] **Step 3: Commit最终状态**

```bash
cd /home/erribaba/git-workstation/spc-monitor
git add -A
git status
```
确认所有改动已暂存。
