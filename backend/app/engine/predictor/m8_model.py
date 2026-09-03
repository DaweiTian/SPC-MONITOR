"""M8 随机森林饱和脂肪预测引擎

双模型架构:
  - M8 完整模型 (5特征): 脂肪+品项+季节+蛋白质+酸度
  - M8-Lite 模型 (4特征): 脂肪+品项+季节+蛋白质（无酸度时自动切换）

酸度可用 → M8 完整 (MAPE≈2.4%)
酸度缺失 → M8-Lite  (MAPE≈3.0%，仍远优于线性K值 MAPE≈5.1%)
"""

import copy
import logging
import os
import threading
from datetime import datetime

import joblib
import numpy as np

logger = logging.getLogger(__name__)

# ---------------------------------------------------------------------------
# 品项编码(英文) → 中文名 映射
# ---------------------------------------------------------------------------
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

CHINESE_TO_CATEGORY = {v: k for k, v in CATEGORY_TO_CHINESE.items()}

PRODUCT_LABELS = [
    "乳味饮料", "乳饮料", "发酵乳", "复合蛋白饮料", "奶油",
    "果蔬汁类饮料", "植物蛋白饮品", "灭菌乳", "茶饮料", "调制乳",
    "谷物类饮料", "超滤纯牛奶", "风味饮料",
]

SEASON_LABELS = ["冬季", "夏季", "春秋"]

TRAINED_CATEGORIES = {
    "调制乳", "发酵乳", "风味饮料", "灭菌乳",
    "乳味饮料", "乳饮料", "植物蛋白饮品",
}

_DEFAULT_PROTEIN = 3.2
_DEFAULT_ACIDITY = 15.0  # 训练集灭菌乳均值酸度


class FeatureMissingError(ValueError):
    """当必要特征缺失时抛出"""
    pass


def _get_season(month: int) -> str:
    if month in (6, 7, 8):
        return "夏季"
    if month in (12, 1, 2):
        return "冬季"
    return "春秋"


def _resolve_model_dir():
    return os.path.join(os.path.dirname(__file__), "..", "..", "..", "models")


class M8ModelEngine:
    """M8 双模型预测引擎 (单例)

    自动管理两个模型:
      - _model_full:  5特征 (含酸度)
      - _model_lite:  4特征 (无酸度)
    """

    _instance = None
    _lock = threading.Lock()

    def __new__(cls):
        if cls._instance is None:
            with cls._lock:
                if cls._instance is None:
                    cls._instance = super().__new__(cls)
                    cls._instance._initialized = False
        return cls._instance

    def __init__(self):
        if self._initialized:
            return
        self._initialized = True
        self._model_full = None   # 5特征
        self._model_lite = None   # 4特征
        self._product_encoder = None
        self._season_encoder = None
        self._full_meta = {}      # version, metrics 等元信息
        self._lite_meta = {}
        self._load_models()

    # ------------------------------------------------------------------
    # 模型加载
    # ------------------------------------------------------------------

    def _load_models(self):
        model_dir = _resolve_model_dir()

        # 完整模型 (5特征)
        full_path = os.path.join(model_dir, "m8_saturated_fat.pkl")
        try:
            data = joblib.load(full_path)
            if not isinstance(data, dict) or "model" not in data:
                logger.error("M8 完整模型 pkl 结构异常: 期望 dict 含 'model' 键，实际: %s",
                             list(data.keys()) if isinstance(data, dict) else type(data).__name__)
            else:
                self._model_full = data["model"]
                self._product_encoder = data["le_type"]
                self._season_encoder = data["le_season"]
                self._full_meta = {
                    "version": data.get("version", ""),
                    "metrics": data.get("metrics", {}),
                }
                logger.info("M8 完整模型加载成功 (5特征) version=%s", self._full_meta["version"] or "unknown")
        except Exception as exc:
            logger.warning("M8 完整模型加载失败: %r", exc)

        # Lite模型 (4特征)
        lite_path = os.path.join(model_dir, "m8_lite_saturated_fat.pkl")
        try:
            data = joblib.load(lite_path)
            if not isinstance(data, dict) or "model" not in data:
                logger.error("M8-Lite 模型 pkl 结构异常: 期望 dict 含 'model' 键，实际: %s",
                             list(data.keys()) if isinstance(data, dict) else type(data).__name__)
            else:
                self._model_lite = data["model"]
                if self._product_encoder is None:
                    self._product_encoder = data["le_type"]
                if self._season_encoder is None:
                    self._season_encoder = data["le_season"]
                self._lite_meta = {
                    "version": data.get("version", ""),
                    "metrics": data.get("metrics", {}),
                }
                logger.info("M8-Lite 模型加载成功 (4特征) version=%s", self._lite_meta["version"] or "unknown")
        except Exception as exc:
            logger.warning("M8-Lite 模型加载失败: %r", exc)

    @property
    def is_available(self) -> bool:
        return self._model_full is not None or self._model_lite is not None

    @property
    def has_full_model(self) -> bool:
        return self._model_full is not None

    @property
    def has_lite_model(self) -> bool:
        return self._model_lite is not None

    @property
    def model_info(self) -> dict:
        """返回当前加载模型的版本和性能信息 (返回副本，不暴露内部状态)"""
        info = {"full": None, "lite": None}
        if self._model_full is not None:
            info["full"] = {
                "version": self._full_meta.get("version", ""),
                "metrics": dict(self._full_meta.get("metrics", {})),
            }
        if self._model_lite is not None:
            info["lite"] = {
                "version": self._lite_meta.get("version", ""),
                "metrics": dict(self._lite_meta.get("metrics", {})),
            }
        return info

    # ------------------------------------------------------------------
    # 预测
    # ------------------------------------------------------------------

    def predict(
        self,
        fat_value: float,
        product_category: str,
        product_name: str = "",
        protein: float = None,
        acidity: float = None,
        sample_time: str = None,
    ) -> dict:
        """
        预测饱和脂肪值。自动选择模型:
          - 有酸度 → M8 完整 (5特征)
          - 无酸度 → M8-Lite (4特征)
          - 无蛋白质 → 抛出 FeatureMissingError
        """
        if self._model_full is None and self._model_lite is None:
            raise RuntimeError("M8 模型未加载，无法执行预测")

        # --- 解析品项 ---
        category_cn = CATEGORY_TO_CHINESE.get(product_category, "")
        if not category_cn and product_name:
            category_cn = product_name
            product_category = CHINESE_TO_CATEGORY.get(product_name, product_category)
        if not category_cn:
            raise FeatureMissingError(
                f"无法识别的品项编码: '{product_category}'，"
                f"支持的编码: {list(CATEGORY_TO_CHINESE.keys())}"
            )

        try:
            product_encoded = int(self._product_encoder.transform([category_cn])[0])
        except ValueError:
            raise FeatureMissingError(f"品项 '{category_cn}' 不在模型 LabelEncoder 中")

        # --- 季节编码 ---
        if sample_time:
            try:
                dt = datetime.fromisoformat(sample_time)
                month = dt.month
            except (ValueError, TypeError):
                month = datetime.now().month
        else:
            month = datetime.now().month
        season_cn = _get_season(month)
        season_encoded = int(self._season_encoder.transform([season_cn])[0])

        # --- 蛋白质兜底 ---
        used_defaults = []
        if protein is None:
            protein = _DEFAULT_PROTEIN
            used_defaults.append("protein")

        # --- 选择模型并预测 ---
        if acidity is not None and self._model_full is not None:
            # 有酸度 → M8 完整模型 (5特征)
            features = np.array([[fat_value, product_encoded, season_encoded, protein, acidity]])
            predicted = float(self._model_full.predict(features)[0])
            model_name = "M8"
        elif self._model_lite is not None:
            # 无酸度 → M8-Lite 模型 (4特征)
            if acidity is None:
                used_defaults.append("acidity")
            features = np.array([[fat_value, product_encoded, season_encoded, protein]])
            predicted = float(self._model_lite.predict(features)[0])
            model_name = "M8-Lite"
        else:
            # 只有完整模型可用，用默认酸度
            acidity = _DEFAULT_ACIDITY
            used_defaults.append("acidity")
            features = np.array([[fat_value, product_encoded, season_encoded, protein, acidity]])
            predicted = float(self._model_full.predict(features)[0])
            model_name = "M8(默认酸度)"

        return {
            "predicted_value": round(predicted, 4),
            "method": "random_forest",
            "model_name": model_name,
            "model_key": "lite" if model_name == "M8-Lite" else "full",
            "features": {
                "fat": fat_value,
                "product_type": category_cn,
                "season": season_cn,
                "protein": protein,
                "acidity": acidity,
            },
            "used_defaults": used_defaults,
        }


# ---------------------------------------------------------------------------
# 模块级便捷函数
# ---------------------------------------------------------------------------

def predict_m8(
    fat_value: float,
    product_category: str,
    product_name: str = "",
    protein: float = None,
    acidity: float = None,
    sample_time: str = None,
) -> dict:
    engine = M8ModelEngine()
    return engine.predict(
        fat_value=fat_value,
        product_category=product_category,
        product_name=product_name,
        protein=protein,
        acidity=acidity,
        sample_time=sample_time,
    )


def is_m8_available() -> bool:
    return M8ModelEngine().is_available


def get_m8_model_info() -> dict:
    """获取当前加载的 M8 模型版本和性能信息"""
    return M8ModelEngine().model_info
