"""跨指标预测报警检查器"""
from typing import Optional, Dict, Any
from datetime import datetime
import uuid


def check_prediction_alert(
    predicted_value: float,
    usl: Optional[float],
    lsl: Optional[float],
    threshold: float = 0.10,
) -> Optional[Dict[str, Any]]:
    """
    检查预测值是否触发报警

    Args:
        predicted_value: 预测值
        usl: 规格上限
        lsl: 规格下限
        threshold: 报警阈值（小数形式，0.10表示10%）

    Returns:
        报警信息字典，无报警返回None
    """
    if usl is None and lsl is None:
        return None

    alert = None

    # 检查是否超出USL + 阈值
    if usl is not None:
        usl_threshold = usl * (1 + threshold)
        if predicted_value > usl_threshold:
            alert = {
                "alert_type": "prediction_above_usl",
                "severity": "WARNING",
                "message": f"预测值 {predicted_value:.4f} 超出规格上限 {usl:.4f} 的 {threshold*100:.0f}%",
                "test_value": predicted_value,
                "control_limit": f"USL={usl:.4f}, 阈值={threshold*100:.0f}%",
            }

    # 检查是否低于LSL - 阈值
    if lsl is not None:
        lsl_threshold = lsl * (1 - threshold)
        if predicted_value < lsl_threshold:
            alert = {
                "alert_type": "prediction_below_lsl",
                "severity": "WARNING",
                "message": f"预测值 {predicted_value:.4f} 低于规格下限 {lsl:.4f} 的 {threshold*100:.0f}%",
                "test_value": predicted_value,
                "control_limit": f"LSL={lsl:.4f}, 阈值={threshold*100:.0f}%",
            }

    if alert:
        alert["alert_id"] = f"PA-{datetime.now().strftime('%Y%m%d')}-{uuid.uuid4().hex[:6].upper()}"
        alert["rule_type"] = alert["alert_type"]
        alert["rule_desc"] = alert["message"]
        alert["generated_at"] = datetime.now().isoformat()

    return alert
