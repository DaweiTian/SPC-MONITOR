#!/usr/bin/env python3
"""深度验证（精简版，避免超时）"""

import sqlite3, numpy as np
from scipy import stats
from statsmodels.tsa.stattools import adfuller
from statsmodels.tsa.arima.model import ARIMA
from statsmodels.tsa.holtwinters import ExponentialSmoothing
import warnings
warnings.filterwarnings("ignore")

DB_PATH = "data/monitor.db"

def load_data(ind, prod, limit=500):
    conn = sqlite3.connect(DB_PATH)
    conn.row_factory = sqlite3.Row
    rows = conn.execute(
        "SELECT value FROM monitor_data WHERE indicator_code=? AND product_code=? ORDER BY sample_time ASC LIMIT ?",
        (ind, prod, limit)).fetchall()
    conn.close()
    return np.array([r["value"] for r in rows], dtype=float)

def mase(actual, predicted, train):
    mae = np.mean(np.abs(actual - predicted))
    naive_mae = np.mean(np.abs(np.diff(train)))
    return float(mae / naive_mae) if naive_mae > 0 else float("inf")

# ============ 验证6：三种模型对比 ============
print("=" * 70)
print("  验证6：三种模型（ETS / MA / ARIMA）MASE 对比")
print("=" * 70)

cases = [
    ("protein", "砖纯牛奶"), ("fat", "砖纯牛奶"), ("acidity", "金典纯+酸"),
    ("protein", "金典纯+酸"), ("fat", "枕纯牛奶+酸度"), ("snf", "砖纯牛奶"),
]

print(f"\n  {'指标':<10s} {'品项':<14s} {'ETS':>6s} {'MA':>6s} {'ARIMA*':>7s} {'ARIMA_d1':>9s} {'最优':<8s} {'ADF_d':>5s}")
print("  " + "-" * 75)

for ind, prod in cases:
    v = load_data(ind, prod)
    if len(v) < 100: continue
    n = len(v); sp = int(n*0.8)
    train, actual = v[:sp], v[sp:]; h = len(actual)
    
    # ETS
    try:
        ets_m = ExponentialSmoothing(train, trend="add", damped_trend=True).fit()
        ets_mase = mase(actual, ets_m.forecast(h)[:h], train)
    except: ets_mase = None
    
    # MA
    try:
        w = min(10, len(train)); lw = train[-w:]
        sl, ic = np.polyfit(np.arange(w), lw, 1)
        ma_pred = np.array([ic + sl*(w+i) for i in range(h)])
        ma_mase = mase(actual, ma_pred, train)
    except: ma_mase = None
    
    # ARIMA (ADF auto d)
    try:
        adf_p = adfuller(train)[1]; d = 0 if adf_p < 0.05 else 1
        best_aic, best_o = float("inf"), (1,d,1)
        for p,q in [(1,1),(2,1),(1,2),(2,2)]:
            try:
                a = ARIMA(train, order=(p,d,q)).fit()
                if a.aic < best_aic: best_aic, best_o = a.aic, (p,d,q)
            except: pass
        arima_m = ARIMA(train, order=best_o).fit()
        arima_mase = mase(actual, arima_m.get_forecast(h).predicted_mean[:h], train)
    except: arima_mase = None; adf_p = None; d = None
    
    # ARIMA d=1 (current)
    try:
        best_aic, best_o = float("inf"), (1,1,1)
        for p,q in [(1,1),(2,1),(1,2),(2,2)]:
            try:
                a = ARIMA(train, order=(p,1,q)).fit()
                if a.aic < best_aic: best_aic, best_o = a.aic, (p,1,q)
            except: pass
        arima_d1_m = ARIMA(train, order=best_o).fit()
        arima_d1_mase = mase(actual, arima_d1_m.get_forecast(h).predicted_mean[:h], train)
    except: arima_d1_mase = None
    
    def fmt(x): return f"{x:.3f}" if x else "  -  "
    all_m = {k:v for k,v in {"ETS":ets_mase,"MA":ma_mase,"ARIMA":arima_mase,"d1":arima_d1_mase}.items() if v is not None}
    best = min(all_m, key=all_m.get) if all_m else "-"
    d_str = f"d={d}" if d is not None else "-"
    
    print(f"  {ind:<10s} {prod:<14s} {fmt(ets_mase):>6s} {fmt(ma_mase):>6s} {fmt(arima_mase):>7s} {fmt(arima_d1_mase):>9s} {best:<8s} {d_str:>5s}")

print("\n  ARIMA* = ADF自动选d，ARIMA_d1 = 硬编码d=1（当前项目）")
print("  MASE<1 = 优于朴素基准")

# ============ 验证7：指标间关联分析 ============
print("\n" + "=" * 70)
print("  验证7：指标间关联分析")
print("=" * 70)

conn = sqlite3.connect(DB_PATH)
conn.row_factory = sqlite3.Row

for prod_name, inds in [("砖纯牛奶", ["fat","protein","snf","acidity"]), ("金典纯+酸", ["fat","protein","acidity"])]:
    data = {}
    for ind in inds:
        rows = conn.execute(
            "SELECT value FROM monitor_data WHERE indicator_code=? AND product_code=? ORDER BY sample_time ASC LIMIT 500",
            (ind, prod_name)).fetchall()
        if rows: data[ind] = np.array([r["value"] for r in rows], dtype=float)
    
    if len(data) < 2: continue
    print(f"\n  [{prod_name}]")
    print(f"  {'指标对':<25s} {'Pearson':>8s} {'p值':>10s} {'Spearman':>9s} {'强度':>4s} {'方向':>4s}")
    print("  " + "-" * 65)
    
    avail = sorted(data.keys())
    for i in range(len(avail)):
        for j in range(i+1, len(avail)):
            a, b = avail[i], avail[j]
            n = min(len(data[a]), len(data[b]))
            va, vb = data[a][:n], data[b][:n]
            r, p = stats.pearsonr(va, vb)
            rho, _ = stats.spearmanr(va, vb)
            strength = "强" if abs(r) > 0.7 else "中" if abs(r) > 0.4 else "弱"
            direction = "正" if r > 0 else "负"
            print(f"  {a+' ↔ '+b:<25s} {r:>8.4f} {p:>10.6f} {rho:>9.4f} {strength:>4s} {direction:>4s}")

conn.close()

# ============ 验证8：不同预测步数 ============
print("\n" + "=" * 70)
print("  验证8：不同预测步数下的 MASE 变化")
print("=" * 70)

for ind, prod in [("protein", "砖纯牛奶"), ("fat", "砖纯牛奶")]:
    v = load_data(ind, prod)
    if len(v) < 200: continue
    n = len(v); sp = int(n*0.8)
    train, actual_full = v[:sp], v[sp:]
    
    print(f"\n  [{ind} - {prod}]  ({len(train)}训练)")
    print(f"  {'步数':>6s} {'MASE':>8s} {'方向准确率':>10s} {'判定':<20s}")
    print("  " + "-" * 50)
    
    for h in [6, 12, 24, 48, 60]:
        if h > len(actual_full): continue
        actual = actual_full[:h]
        try:
            m = ExponentialSmoothing(train, trend="add", damped_trend=True).fit()
            pred = m.forecast(h)[:h]
            mase_val = mase(actual, pred, train)
            last = train[-1]
            dir_acc = float(np.mean(np.sign(actual-last) == np.sign(pred-last)) * 100)
            judge = "✓优于基准" if mase_val < 1 else "✗不如基准"
            dir_j = "优秀" if dir_acc > 70 else "可用" if dir_acc > 60 else "一般"
            print(f"  {h:>6d} {mase_val:>8.4f} {dir_acc:>9.1f}% {judge}, 方向{dir_j}")
        except: pass

# ============ 验证9：CV 分布 ============
print("\n" + "=" * 70)
print("  验证9：各数据集 CV（变异系数）分布")
print("=" * 70)

conn = sqlite3.connect(DB_PATH)
rows = conn.execute(
    "SELECT indicator_code, product_code, COUNT(*) as cnt "
    "FROM monitor_data GROUP BY indicator_code, product_code HAVING cnt >= 200 ORDER BY cnt DESC"
).fetchall()
conn.close()

cv_list = []
for r in rows:
    v = load_data(r[0], r[1], 500)
    if len(v) < 50: continue
    mean, std = np.mean(v), np.std(v, ddof=1)
    cv = (std/mean*100) if mean != 0 else 0
    cv_list.append((r[0], r[1], len(v), mean, std, cv))

cv_list.sort(key=lambda x: x[5])
print(f"\n  {'指标':<10s} {'品项':<18s} {'量':>5s} {'均值':>10s} {'标准差':>10s} {'CV%':>8s}")
print("  " + "-" * 65)
for ind, prod, cnt, mean, std, cv in cv_list[:15]:
    print(f"  {ind:<10s} {prod:<18s} {cnt:>5d} {mean:>10.4f} {std:>10.4f} {cv:>7.2f}%")
print("  ...")
for ind, prod, cnt, mean, std, cv in cv_list[-5:]:
    print(f"  {ind:<10s} {prod:<18s} {cnt:>5d} {mean:>10.4f} {std:>10.4f} {cv:>7.2f}%")

cvs = [x[5] for x in cv_list]
print(f"\n  CV 分布（{len(cvs)} 个数据集）：")
print(f"    <2%: {sum(1 for c in cvs if c<2)}个 ({sum(1 for c in cvs if c<2)/len(cvs)*100:.0f}%)")
print(f"    <5%: {sum(1 for c in cvs if c<5)}个 ({sum(1 for c in cvs if c<5)/len(cvs)*100:.0f}%)")
print(f"    ≥5%: {sum(1 for c in cvs if c>=5)}个 ({sum(1 for c in cvs if c>=5)/len(cvs)*100:.0f}%)")
print(f"    中位数: {np.median(cvs):.2f}%")
