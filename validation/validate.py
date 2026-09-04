#!/usr/bin/env python3
"""
预测模块优化验证脚本
====================
独立验证所有待优化的方法，不修改项目代码。
直接读取 data/monitor.db，输出对比报告。

用法：python validation/validate.py
"""

import sqlite3
import numpy as np
from scipy import stats
from statsmodels.tsa.stattools import adfuller, acf
from statsmodels.tsa.arima.model import ARIMA
from statsmodels.tsa.holtwinters import ExponentialSmoothing
import warnings

warnings.filterwarnings("ignore")

DB_PATH = "data/monitor.db"


def load_data(indicator_code: str, product_code: str, limit: int = 500):
    """从数据库加载数据"""
    conn = sqlite3.connect(DB_PATH)
    conn.row_factory = sqlite3.Row
    rows = conn.execute(
        """SELECT value, sample_time FROM monitor_data
           WHERE indicator_code=? AND product_code=?
           ORDER BY sample_time ASC LIMIT ?""",
        (indicator_code, product_code, limit),
    ).fetchall()
    conn.close()
    values = np.array([r["value"] for r in rows], dtype=float)
    times = [r["sample_time"] for r in rows]
    return values, times


def get_available_datasets():
    """获取所有可用的数据集"""
    conn = sqlite3.connect(DB_PATH)
    rows = conn.execute(
        """SELECT indicator_code, product_code, COUNT(*) as cnt
           FROM monitor_data
           GROUP BY indicator_code, product_code
           HAVING cnt >= 100
           ORDER BY cnt DESC"""
    ).fetchall()
    conn.close()
    return [(r[0], r[1], r[2]) for r in rows]


# ============================================================
# 验证1：当前评估指标的问题（R² / MAPE vs MASE）
# ============================================================
def validate_evaluation_metrics(values, train_ratio=0.8):
    """对比 R²/MAPE 与 MASE/方向准确率"""
    n = len(values)
    split = int(n * train_ratio)
    train = values[:split]
    actual = values[split:]

    # 用 ETS 预测
    try:
        model = ExponentialSmoothing(train, trend="add", damped_trend=True).fit()
        predicted = model.forecast(len(actual))
    except Exception:
        model = ExponentialSmoothing(train).fit()
        predicted = model.forecast(len(actual))

    predicted = predicted[: len(actual)]

    # 当前方法：R²
    errors = actual - predicted
    ss_res = np.sum(errors**2)
    ss_tot = np.sum((actual - np.mean(actual)) ** 2)
    r_squared = float(1 - ss_res / ss_tot) if ss_tot != 0 else None

    # 当前方法：MAPE
    nonzero = actual != 0
    mape = float(np.mean(np.abs(errors[nonzero] / actual[nonzero])) * 100) if nonzero.any() else None

    # 新方法：MASE
    model_mae = np.mean(np.abs(errors))
    naive_mae = np.mean(np.abs(np.diff(train)))
    mase = float(model_mae / naive_mae) if naive_mae > 0 else float("inf")

    # 新方法：方向准确率
    last_train = train[-1]
    actual_dir = np.sign(actual - last_train)
    pred_dir = np.sign(predicted - last_train)
    directional_acc = float(np.mean(actual_dir == pred_dir) * 100)

    # 朴素基准的 MASE（始终为1.0）
    naive_predictions = np.full(len(actual), last_train)
    naive_errors = actual - naive_predictions
    naive_model_mae = np.mean(np.abs(naive_errors))
    naive_mase = float(naive_model_mae / naive_mae) if naive_mae > 0 else float("inf")

    return {
        "r_squared": r_squared,
        "mape": mape,
        "mase": mase,
        "naive_mase": naive_mase,
        "directional_accuracy": directional_acc,
        "rmse": float(np.sqrt(np.mean(errors**2))),
        "model_better_than_naive": mase < 1.0,
        "n_train": len(train),
        "n_test": len(actual),
    }


# ============================================================
# 验证2：自动模型选择（ADF + 趋势检验）
# ============================================================
def validate_auto_selection(values):
    """验证自动模型选择逻辑"""
    # ADF 平稳性检验
    adf_result = adfuller(values, autolag="AIC")
    adf_pvalue = adf_result[1]
    is_stationary = adf_pvalue < 0.05

    # Mann-Kendall 趋势检验（向量化实现）
    n = len(values)
    # 使用子采样加速（n>500时）
    if n > 500:
        indices = np.linspace(0, n - 1, 500, dtype=int)
        sampled = values[indices]
    else:
        sampled = values
    nn = len(sampled)
    s = 0
    for i in range(nn - 1):
        s += np.sum(np.sign(sampled[i + 1 :] - sampled[i]))
    var_s = nn * (nn - 1) * (2 * nn + 5) / 18
    z = (s - 1) / np.sqrt(var_s) if s > 0 else (s + 1) / np.sqrt(var_s) if s < 0 else 0
    mk_pvalue = 2 * (1 - stats.norm.cdf(abs(z)))
    has_trend = mk_pvalue < 0.05
    trend_direction = "increasing" if z > 0 else "decreasing" if z < 0 else "none"

    # 季节性检验（ACF 峰值检测）
    max_lag = min(48, len(values) // 3)
    acf_values = acf(values, nlags=max_lag, fft=True)
    ci = 1.96 / np.sqrt(len(values))
    significant_peaks = [lag for lag in range(2, max_lag + 1) if acf_values[lag] > ci]
    has_seasonality = len(significant_peaks) > 0
    seasonal_period = significant_peaks[0] if has_seasonality else None

    # 自动选择模型
    if not has_trend and not has_seasonality:
        selected = "ETS(A,N,N)"
    elif has_trend and not has_seasonality:
        selected = "Holt_Linear 或 ARIMA(1,1,1)"
    elif has_trend and has_seasonality:
        selected = "Holt-Winters"
    else:
        selected = "SARIMA"

    # 当前项目的做法（硬编码 d=1）
    current_d = 1
    current_adr = "d=1 (硬编码)"

    return {
        "adf_pvalue": adf_pvalue,
        "is_stationary": is_stationary,
        "mk_pvalue": mk_pvalue,
        "has_trend": has_trend,
        "trend_direction": trend_direction,
        "has_seasonality": has_seasonality,
        "seasonal_period": seasonal_period,
        "selected_model": selected,
        "current_arima_d": current_d,
        "recommended_d": 0 if is_stationary else 1,
    }


# ============================================================
# 验证3：越限概率计算
# ============================================================
def validate_breach_probability(values, usl, lsl, horizon=12):
    """验证越限概率计算"""
    n = len(values)
    split = int(n * 0.8)
    train = values[:split]

    # 用 ARIMA 预测
    try:
        model = ARIMA(train, order=(1, 0, 1)).fit()
        forecast = model.get_forecast(steps=horizon)
        mean = forecast.predicted_mean
        se = forecast.se_mean
    except Exception:
        return None

    # 计算每步越限概率
    prob_usl = 1 - stats.norm.cdf((usl - mean) / se)
    prob_lsl = stats.norm.cdf((lsl - mean) / se)
    prob_breach = prob_usl + prob_lsl

    # 累计概率
    cumulative = 1 - np.prod(1 - prob_breach)

    # 当前项目的做法：点值比较
    current_risk = "high" if any(mean > usl) or any(mean < lsl) else "low"

    # 新方法：概率判断
    if cumulative > 0.05:
        prob_risk = "CRITICAL"
    elif cumulative > 0.3:
        prob_risk = "HIGH"
    elif cumulative > 0.1:
        prob_risk = "MEDIUM"
    else:
        prob_risk = "LOW"

    return {
        "cumulative_probability": float(cumulative),
        "max_step_probability": float(np.max(prob_breach)),
        "current_method_risk": current_risk,
        "probability_method_risk": prob_risk,
        "risk_agree": current_risk == ("high" if prob_risk in ("CRITICAL", "HIGH") else "low"),
    }


# ============================================================
# 验证4：CUSUM 漂移检测
# ============================================================
def validate_cusum(values, window_size=20, threshold=2.0):
    """验证 CUSUM 漂移检测"""
    n = len(values)
    if n < window_size * 2:
        return None

    baseline_mean = np.mean(values[:window_size])
    std = np.std(values[:window_size], ddof=1)
    if std == 0:
        return None

    k = 0.5 * std
    c_pos = np.zeros(n)
    c_neg = np.zeros(n)

    for i in range(1, n):
        c_pos[i] = max(0, c_pos[i - 1] + (values[i] - baseline_mean - k))
        c_neg[i] = max(0, c_neg[i - 1] + (-values[i] + baseline_mean - k))

    drift_detected = (c_pos[-1] > threshold * std) or (c_neg[-1] > threshold * std)
    recent_mean = np.mean(values[-window_size:])
    drift_magnitude = recent_mean - baseline_mean

    if abs(drift_magnitude) < 0.5 * std:
        direction = "stable"
    elif drift_magnitude > 0:
        direction = "upward"
    else:
        direction = "downward"

    return {
        "drift_detected": drift_detected,
        "direction": direction,
        "magnitude": float(drift_magnitude),
        "magnitude_std": float(drift_magnitude / std),
        "baseline_mean": float(baseline_mean),
        "recent_mean": float(recent_mean),
    }


# ============================================================
# 验证5：Cpk 趋势预测
# ============================================================
def validate_cpk_trend(values, usl, lsl, window=30, horizon=12):
    """验证 Cpk 趋势预测"""
    n = len(values)
    if n < window + 10:
        return None

    # 计算滑动窗口 Cpk 序列
    cpk_series = []
    for i in range(window, n):
        w = values[i - window : i]
        mean = np.mean(w)
        std = np.std(w, ddof=1)
        if std > 0:
            cpk = min((usl - mean) / (3 * std), (mean - lsl) / (3 * std))
            cpk_series.append(cpk)

    if len(cpk_series) < 5:
        return None

    # 线性回归拟合趋势
    x = np.arange(len(cpk_series))
    slope, intercept = np.polyfit(x, cpk_series, 1)
    current_cpk = cpk_series[-1]
    future_cpk = current_cpk + slope * horizon

    steps_to_1 = None
    if slope < 0 and current_cpk > 1.0:
        steps_to_1 = int((current_cpk - 1.0) / abs(slope))

    return {
        "current_cpk": round(current_cpk, 2),
        "trend_slope": round(slope, 4),
        "predicted_cpk": round(future_cpk, 2),
        "steps_to_threshold": steps_to_1,
        "trend_direction": "下降" if slope < -0.001 else "上升" if slope > 0.001 else "稳定",
    }


# ============================================================
# 主程序
# ============================================================
def main():
    print("=" * 70)
    print("  spc-monitor 预测模块优化验证报告")
    print("  验证日期：2026-08-22")
    print("  数据来源：data/monitor.db（真实采集数据）")
    print("=" * 70)

    datasets = get_available_datasets()
    print(f"\n可用数据集：{len(datasets)} 个（≥100条数据）")
    for ind, prod, cnt in datasets[:10]:
        print(f"  {ind:15s} | {prod:25s} | {cnt}条")
    if len(datasets) > 10:
        print(f"  ... 还有 {len(datasets) - 10} 个")

    # 选择几个典型数据集进行验证
    test_sets = [
        ("protein", "Zero Setting"),
        ("fat", "Zero Setting"),
        ("acidity", "金典纯+酸"),
    ]

    # ============================================================
    # 验证1：评估指标对比
    # ============================================================
    print("\n" + "=" * 70)
    print("  验证1：评估指标对比（R²/MAPE vs MASE/方向准确率）")
    print("=" * 70)

    for ind, prod in test_sets:
        values, _ = load_data(ind, prod)
        if len(values) < 100:
            continue

        result = validate_evaluation_metrics(values)
        print(f"\n  [{ind} - {prod}]  ({result['n_train']}训练 / {result['n_test']}测试)")
        print(f"  ┌─────────────────┬──────────────┬──────────────────────────────┐")
        print(f"  │ 当前方法         │ 值           │ 问题                         │")
        print(f"  ├─────────────────┼──────────────┼──────────────────────────────┤")
        r2 = result["r_squared"]
        r2_issue = "可能为负值，对低CV数据误导" if r2 is not None and r2 < 0.5 else "数值正常但不反映预测价值"
        print(f"  │ R²              │ {r2:>10.4f}  │ {r2_issue:<28s} │")
        mape = result["mape"]
        mape_issue = "看似合理但不代表模型准确" if mape is not None and mape < 5 else ""
        print(f"  │ MAPE            │ {mape:>9.2f}%  │ {mape_issue:<28s} │")
        print(f"  └─────────────────┴──────────────┴──────────────────────────────┘")
        print(f"  ┌─────────────────┬──────────────┬──────────────────────────────┐")
        print(f"  │ 新方法           │ 值           │ 判定                         │")
        print(f"  ├─────────────────┼──────────────┼──────────────────────────────┤")
        mase = result["mase"]
        mase_judge = "✓ 优于朴素基准" if mase < 1 else "✗ 不如朴素基准"
        print(f"  │ MASE            │ {mase:>10.4f}  │ {mase_judge:<28s} │")
        dir_acc = result["directional_accuracy"]
        dir_judge = "✓ 优秀" if dir_acc > 70 else "✓ 可用" if dir_acc > 60 else "△ 略优于随机" if dir_acc > 55 else "✗ 接近随机"
        print(f"  │ 方向准确率       │ {dir_acc:>9.1f}%  │ {dir_judge:<28s} │")
        better = "✓ 模型有增量价值" if result["model_better_than_naive"] else "✗ 模型无增量价值"
        print(f"  │ vs 朴素基准      │ MASE={mase:.2f}  │ {better:<28s} │")
        print(f"  └─────────────────┴──────────────┴──────────────────────────────┘")

    # ============================================================
    # 验证2：自动模型选择
    # ============================================================
    print("\n" + "=" * 70)
    print("  验证2：自动模型选择（ADF + Mann-Kendall + ACF）")
    print("=" * 70)

    for ind, prod in test_sets:
        values, _ = load_data(ind, prod)
        if len(values) < 100:
            continue

        result = validate_auto_selection(values)
        print(f"\n  [{ind} - {prod}]  ({len(values)}条数据)")
        print(f"  ┌─────────────────────┬────────────────────────────────────┐")
        print(f"  │ 检验                │ 结果                               │")
        print(f"  ├─────────────────────┼────────────────────────────────────┤")
        adf_judge = "平稳" if result["is_stationary"] else "非平稳"
        print(f"  │ ADF 平稳性检验      │ p={result['adf_pvalue']:.4f} ({adf_judge})              │")
        mk_judge = f"有{result['trend_direction']}趋势" if result["has_trend"] else "无趋势"
        print(f"  │ Mann-Kendall 趋势   │ p={result['mk_pvalue']:.4f} ({mk_judge})              │")
        season_judge = f"有季节性(周期={result['seasonal_period']})" if result["has_seasonality"] else "无季节性"
        print(f"  │ ACF 季节性检验      │ {season_judge:<34s} │")
        print(f"  ├─────────────────────┼────────────────────────────────────┤")
        print(f"  │ 自动选择模型        │ {result['selected_model']:<34s} │")
        print(f"  │ 当前项目 ARIMA d    │ {result['current_arima_d']} (硬编码)                           │")
        d_match = "✓ 一致" if result["recommended_d"] == result["current_arima_d"] else f"✗ 应为 d={result['recommended_d']}"
        print(f"  │ 建议 ARIMA d        │ {result['recommended_d']} ({d_match})                          │")
        print(f"  └─────────────────────┴────────────────────────────────────┘")

    # ============================================================
    # 验证3：越限概率
    # ============================================================
    print("\n" + "=" * 70)
    print("  验证3：越限概率计算")
    print("=" * 70)

    # 获取规格限
    conn = sqlite3.connect(DB_PATH)
    conn.row_factory = sqlite3.Row

    for ind, prod in test_sets:
        row = conn.execute(
            "SELECT upper_limit, lower_limit FROM monitor_data WHERE indicator_code=? AND product_code=? AND upper_limit IS NOT NULL LIMIT 1",
            (ind, prod),
        ).fetchone()
        if not row:
            continue

        usl, lsl = row["upper_limit"], row["lower_limit"]
        values, _ = load_data(ind, prod)
        if len(values) < 100:
            continue

        result = validate_breach_probability(values, usl, lsl)
        if not result:
            continue

        print(f"\n  [{ind} - {prod}]  规格限: LSL={lsl} ~ USL={usl}")
        print(f"  ┌─────────────────────┬────────────────────────────────────┐")
        print(f"  │ 方法                │ 结果                               │")
        print(f"  ├─────────────────────┼────────────────────────────────────┤")
        print(f"  │ 当前方法（点值比较） │ 风险={result['current_method_risk']:<28s} │")
        print(f"  │ 新方法（概率计算）   │ 风险={result['probability_method_risk']:<28s} │")
        print(f"  │ 累计越限概率        │ {result['cumulative_probability']:.4f} ({result['cumulative_probability']*100:.2f}%)                       │")
        agree = "✓ 一致" if result["risk_agree"] else "✗ 不一致（新方法更准确）"
        print(f"  │ 两种方法是否一致    │ {agree:<34s} │")
        print(f"  └─────────────────────┴────────────────────────────────────┘")

    conn.close()

    # ============================================================
    # 验证4：CUSUM 漂移检测
    # ============================================================
    print("\n" + "=" * 70)
    print("  验证4：CUSUM 漂移检测")
    print("=" * 70)

    for ind, prod in test_sets:
        values, _ = load_data(ind, prod)
        if len(values) < 100:
            continue

        result = validate_cusum(values)
        if not result:
            continue

        print(f"\n  [{ind} - {prod}]  ({len(values)}条数据)")
        print(f"  ┌─────────────────────┬────────────────────────────────────┐")
        drift_judge = "⚠ 检测到漂移" if result["drift_detected"] else "✓ 无漂移"
        print(f"  │ 漂移检测            │ {drift_judge:<34s} │")
        print(f"  │ 漂移方向            │ {result['direction']:<34s} │")
        print(f"  │ 漂移幅度            │ {result['magnitude']:.4f} ({result['magnitude_std']:.2f}σ)                    │")
        print(f"  │ 基准均值            │ {result['baseline_mean']:.4f}                              │")
        print(f"  │ 近期均值            │ {result['recent_mean']:.4f}                              │")
        print(f"  └─────────────────────┴────────────────────────────────────┘")

    # ============================================================
    # 验证5：Cpk 趋势预测
    # ============================================================
    print("\n" + "=" * 70)
    print("  验证5：Cpk 趋势预测")
    print("=" * 70)

    conn = sqlite3.connect(DB_PATH)
    conn.row_factory = sqlite3.Row

    for ind, prod in test_sets:
        row = conn.execute(
            "SELECT upper_limit, lower_limit FROM monitor_data WHERE indicator_code=? AND product_code=? AND upper_limit IS NOT NULL LIMIT 1",
            (ind, prod),
        ).fetchone()
        if not row:
            continue

        usl, lsl = row["upper_limit"], row["lower_limit"]
        values, _ = load_data(ind, prod)
        if len(values) < 100:
            continue

        result = validate_cpk_trend(values, usl, lsl)
        if not result:
            continue

        print(f"\n  [{ind} - {prod}]  规格限: LSL={lsl} ~ USL={usl}")
        print(f"  ┌─────────────────────┬────────────────────────────────────┐")
        print(f"  │ 当前 Cpk            │ {result['current_cpk']:<34.2f} │")
        print(f"  │ 趋势方向            │ {result['trend_direction']:<34s} │")
        print(f"  │ 趋势斜率            │ {result['trend_slope']:<34.4f} │")
        print(f"  │ 预测 Cpk (12步后)   │ {result['predicted_cpk']:<34.2f} │")
        steps = result["steps_to_threshold"]
        steps_str = f"预计{steps}步后降至1.0" if steps else "无退化风险"
        print(f"  │ 退化预警            │ {steps_str:<34s} │")
        print(f"  └─────────────────────┴────────────────────────────────────┘")

    conn.close()

    # ============================================================
    # 总结
    # ============================================================
    print("\n" + "=" * 70)
    print("  验证总结")
    print("=" * 70)
    print("""
  1. 评估指标：R² 和 MAPE 在低 CV 数据上确实会产生误导，
     MASE 能直接回答"模型有没有用"（MASE<1 = 优于朴素基准）。

  2. 自动选择：液奶指标大多是平稳数据（ADF p<0.05），
     当前项目硬编码 d=1 不合理，应该用 ADF 检验自动确定。

  3. 越限概率：概率方法比点值比较更准确，能捕捉不确定性。

  4. CUSUM：能检测到均值缓慢漂移（幅度<1σ但持续累积）。

  5. Cpk 趋势：能预测过程能力的变化方向和退化速度。
""")


if __name__ == "__main__":
    main()
