"""通用指标交叉预测引擎

预测公式: 目标指标值 = 源指标值 × coefficient
coefficient 由用户在品项管理页面配置（prediction_config.json），
选择产品类别时自动填入默认推荐值，用户可手动覆盖。
"""

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
    source_meta = SOURCE_INDICATOR_META.get(source_indicator, {"name": source_indicator})
    predicted = round(source_value * coefficient, 4)

    return {
        "predicted_value": predicted,
        "coefficient": round(coefficient, 6),
        "formula": f"{meta['name']} = {source_meta['name']} × {coefficient:.4f}",
        "target_name": meta["name"],
        "target_unit": meta["unit"],
    }
