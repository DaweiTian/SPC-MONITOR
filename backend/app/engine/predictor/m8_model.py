"""M8 随机森林饱和脂肪预测引擎

模型: RandomForestRegressor (n_estimators=100, max_depth=10, random_state=42)
特征: [脂肪, 品项编码, 季节编码, 蛋白质, 酸度]
"""

import logging
import os
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

# 反向映射: 中文名 → 英文编码
CHINESE_TO_CATEGORY = {v: k for k, v in CATEGORY_TO_CHINESE.items()}

# ---------------------------------------------------------------------------
# LabelEncoder 类名 (与训练时一致)
# ---------------------------------------------------------------------------
PRODUCT_LABELS = [
    "乳味饮料", "乳饮料", "发酵乳", "复合蛋白饮料", "奶油",
    "果蔬汁类饮料", "植物蛋白饮品", "灭菌乳", "茶饮料", "调制乳",
    "谷物类饮料", "超滤纯牛奶", "风味饮料",
]

SEASON_LABELS = ["冬季", "夏季", "春秋"]

# 纳入训练的品项 (中文名)
TRAINED_CATEGORIES = {
    "调制乳", "发酵乳", "风味饮料", "灭菌乳",
    "乳味饮料", "乳饮料", "植物蛋白饮品",
}




class FeatureMissingError(ValueError):
    """当必要特征缺失时抛出"""
    pass


def _get_season(month: int) -> str:
    """根据月份返回季节编码中文名: 6/7/8=夏季, 12/1/2=冬季, 其他=春秋"""
    if month in (6, 7, 8):
        return "夏季"
    if month in (12, 1, 2):
        return "冬季"
    return "春秋"


class M8ModelEngine:
    """M8 随机森林饱和脂肪预测引擎 (单例)"""

    _instance = None

    def __new__(cls):
        if cls._instance is None:
            cls._instance = super().__new__(cls)
            cls._instance._initialized = False
        return cls._instance

    def __init__(self):
        if self._initialized:
            return
        self._initialized = True
        self._model = None
        self._product_encoder = None
        self._season_encoder = None
        self._load_model()

    # ------------------------------------------------------------------
    # 模型加载
    # ------------------------------------------------------------------

    def _load_model(self):
        """加载 pkl 模型文件，提取模型和 LabelEncoder"""
        model_path = os.path.join(
            os.path.dirname(__file__), "..", "..", "..", "models", "m8_saturated_fat.pkl"
        )
        try:
            data = joblib.load(model_path)
            self._model = data["model"]
            self._product_encoder = data["le_type"]
            self._season_encoder = data["le_season"]
            logger.info("M8 模型加载成功: %s", model_path)
        except Exception as exc:
            logger.warning("M8 模型加载失败 (%s): %s", model_path, exc)
            self._model = None
            self._product_encoder = None
            self._season_encoder = None

    @property
    def is_available(self) -> bool:
        """模型是否可用"""
        return self._model is not None

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
        预测饱和脂肪值

        Args:
            fat_value: 脂肪值 (必填)
            product_category: 品项英文编码，如 'sterilized_milk' (必填)
            product_name: 品项中文名 (可选，优先级低于 product_category)
            protein: 蛋白质值 (可选，默认兜底值)
            acidity: 酸度值 (可选，默认兜底值)
            sample_time: 采样时间 ISO 格式 (可选，默认当前时间)

        Returns:
            {"predicted_value": float, "method": "random_forest", "features": {...}}

        Raises:
            FeatureMissingError: 当品项无法识别时
            RuntimeError: 当模型未加载时
        """
        if self._model is None:
            raise RuntimeError("M8 模型未加载，无法执行预测")

        # --- 解析品项中文名 ---
        category_cn = CATEGORY_TO_CHINESE.get(product_category, "")
        if not category_cn and product_name:
            # 尝试从中文名反查
            category_cn = product_name
            product_category = CHINESE_TO_CATEGORY.get(product_name, product_category)

        if not category_cn:
            raise FeatureMissingError(
                f"无法识别的品项编码: '{product_category}'，"
                f"支持的编码: {list(CATEGORY_TO_CHINESE.keys())}"
            )

        # --- 品项编码 ---
        try:
            product_encoded = int(
                self._product_encoder.transform([category_cn])[0]
            )
        except ValueError:
            raise FeatureMissingError(
                f"品项 '{category_cn}' 不在模型 LabelEncoder 中"
            )

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

        # --- 校验必要特征 ---
        if protein is None:
            raise FeatureMissingError("蛋白质数据缺失")
        if acidity is None:
            raise FeatureMissingError("酸度数据缺失")

        # --- 构造特征向量: [脂肪, 品项编码, 季节编码, 蛋白质, 酸度] ---
        features = np.array([[fat_value, product_encoded, season_encoded, protein, acidity]])

        predicted = float(self._model.predict(features)[0])

        return {
            "predicted_value": round(predicted, 4),
            "method": "random_forest",
            "features": {
                "fat": fat_value,
                "product_type": category_cn,
                "season": season_cn,
                "protein": protein,
                "acidity": acidity,
            },
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
    """便捷入口: 获取单例引擎并执行预测"""
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
    """检查 M8 模型是否已成功加载"""
    return M8ModelEngine().is_available
