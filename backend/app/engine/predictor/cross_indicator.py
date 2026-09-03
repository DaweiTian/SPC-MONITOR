"""通用指标交叉预测引擎

支持双模式预测:
  - linear: 目标指标值 = 源指标值 × coefficient（传统线性）
  - random_forest: M8 随机森林模型预测（仅饱和脂肪）

coefficient 由用户在品项管理页面配置（prediction_config.json），
选择产品类别时自动填入默认推荐值，用户可手动覆盖。
"""

import logging

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


def fetch_cooccurring_features(storage, product_code: str, sample_id: str = None, sample_time: str = None) -> dict:
    """
    尝试获取与脂肪同批次的蛋白质和酸度数据。

    优先级:
      1. 同 sample_id 的蛋白质/酸度（同一样品）
      2. 同日内的最新蛋白质/酸度（当天数据）
      3. 最近一条蛋白质/酸度（兜底）

    Returns:
        {"protein": float|None, "acidity": float|None, "source": str}
        source 说明数据来源: "same_sample" / "same_day" / "latest" / "missing"
    """
    result = {"protein": None, "acidity": None, "source": "missing"}

    def _find_by_sample_id(indicator_code):
        if not sample_id:
            return None
        rows = storage.get_recent_data(indicator_code, product_code, limit=20)
        for r in rows:
            if r.get("sample_id") == sample_id and r.get("value") is not None:
                return float(r["value"])
        return None

    def _find_by_same_day(indicator_code):
        if not sample_time:
            return None
        day = str(sample_time)[:10]  # "2026-09-03"
        rows = storage.get_recent_data(indicator_code, product_code, limit=20)
        for r in rows:
            r_day = str(r.get("sample_time", ""))[:10]
            if r_day == day and r.get("value") is not None:
                return float(r["value"])
        return None

    def _find_latest(indicator_code):
        rows = storage.get_recent_data(indicator_code, product_code, limit=1)
        if rows and rows[0].get("value") is not None:
            return float(rows[0]["value"])
        return None

    # 逐级查找蛋白质
    protein = _find_by_sample_id("protein")
    if protein is not None:
        result["source"] = "same_sample"
    else:
        protein = _find_by_same_day("protein")
        if protein is not None:
            result["source"] = "same_day"
        else:
            protein = _find_latest("protein")
            if protein is not None:
                result["source"] = "latest"

    # 酸度用同样逻辑
    acidity = _find_by_sample_id("acidity")
    if acidity is None:
        acidity = _find_by_same_day("acidity")
    if acidity is None:
        acidity = _find_latest("acidity")

    result["protein"] = protein
    result["acidity"] = acidity

    # 如果两个都找不到
    if protein is None and acidity is None:
        result["source"] = "missing"

    return result


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
    prediction_method: str = "linear",
    product_category: str = "",
    product_name: str = "",
    protein: float = None,
    acidity: float = None,
    sample_time: str = None,
) -> dict:
    """
    通用指标交叉预测（支持线性 / M8 双模式）

    Args:
        source_value: 源指标的实时值
        coefficient: 用户配置的预测系数
        source_indicator: 源指标code（仅用于生成公式描述）
        target_indicator: 目标指标code（仅用于查元数据）
        prediction_method: 预测方式 "linear" | "random_forest"
        product_category: 品项英文编码（M8需要）
        product_name: 品项中文名（M8可选）
        protein: 蛋白质值（M8需要）
        acidity: 酸度值（M8需要）
        sample_time: 采样时间 ISO 格式（M8可选）

    Returns:
        {"predicted_value", "coefficient", "formula", "target_name", "target_unit", "method"}
        M8 成功时额外包含 "features"。
    """
    meta = TARGET_INDICATOR_META.get(target_indicator, {"name": target_indicator, "unit": ""})
    source_meta = SOURCE_INDICATOR_META.get(source_indicator, {"name": source_indicator})

    # --- M8 随机森林模式（仅限饱和脂肪） ---
    if prediction_method == "random_forest" and target_indicator == "saturated_fat":
        try:
            from backend.app.engine.predictor.m8_model import predict_m8

            m8_result = predict_m8(
                fat_value=source_value,
                product_category=product_category,
                product_name=product_name,
                protein=protein,
                acidity=acidity,
                sample_time=sample_time,
            )
            # 合并线性预测的基础字段
            result = {
                "predicted_value": m8_result["predicted_value"],
                "coefficient": round(coefficient, 6),
                "formula": f"{meta['name']} = M8随机森林({source_meta['name']})",
                "target_name": meta["name"],
                "target_unit": meta["unit"],
                "method": "random_forest",
                "features": m8_result.get("features", {}),
            }
            return result
        except (ImportError, RuntimeError) as exc:
            logger.warning("M8 模型异常，降级到线性预测: %s", exc)
        except Exception as exc:
            logger.warning("M8 预测失败（%s: %s），降级到线性预测", type(exc).__name__, exc)

        # 降级到线性
        predicted = round(source_value * coefficient, 4)
        return {
            "predicted_value": predicted,
            "coefficient": round(coefficient, 6),
            "formula": f"{meta['name']} = {source_meta['name']} × {coefficient:.4f}",
            "target_name": meta["name"],
            "target_unit": meta["unit"],
            "method": "linear_fallback",
        }

    # --- 线性预测（默认） ---
    predicted = round(source_value * coefficient, 4)
    return {
        "predicted_value": predicted,
        "coefficient": round(coefficient, 6),
        "formula": f"{meta['name']} = {source_meta['name']} × {coefficient:.4f}",
        "target_name": meta["name"],
        "target_unit": meta["unit"],
        "method": "linear",
    }
