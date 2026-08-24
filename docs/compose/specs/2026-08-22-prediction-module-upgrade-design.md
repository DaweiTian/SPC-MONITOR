# 预测模块升级设计规格

> 日期：2026-08-22
> 来源：`docs/预测模块优化探讨.md`、`docs/预测模块升级开发方案.md`
> 范围：P0 - P3 全阶段实施

---

## [S1] 问题诊断

当前预测模块存在 5 个核心问题 + 6 个代码级缺陷：

| 问题 | 严重程度 | 现状 |
|------|---------|------|
| R² 全负失效 | 高 | KPI 卡片展示 R² > 0.8 判定"良好" |
| MAPE 极端值 | 高 | Zero Setting 导致 MAPE 5990% |
| 越限风险漏判 | **极高** | 酸度越限概率 98.6% 被判定 low |
| 无基准对比 | 高 | 无法判断模型增量价值 |
| MA 方法最差 | 中 | MASE 5-12，应淘汰 |

代码级缺陷：越限时间硬编码、越限风险点值比较、ARIMA d=1 硬编码、残差分析假图、CI 不一致、API 完成度 30%。

---

## [S2] 升级目标

| 维度 | 当前 → 升级后 |
|------|--------------|
| 评估指标 | MAPE + R² → **MASE + 方向准确率**（MAPE 降为参考） |
| 预测方法 | ETS/MA/ARIMA 手动 → **ETS/ARIMA 自动选择**（MA 淘汰） |
| 风险评估 | 点值比较 → **概率法越限 + CUSUM + Cpk 趋势** |
| API | 1/7 部分实现 → **7/7 全部实现** |
| 持久化 | 无 → **3 张新表** |
| 高级模型 | 无 → **GBDT + 特征工程 + 多变量预测** |

---

## [S3] 技术架构

不变：Tauri → FastAPI → React + ECharts + SQLite

新增依赖：
- P3 阶段引入 `scikit-learn`（+30-50MB）
- `pandas` 取消注释（已在 requirements.txt 中注释）

---

## [S4] 分阶段实施规格

### P0：评估体系重构

**改动文件：** `backend/app/api/predict.py`、`frontend/src/pages/Prediction/index.tsx`

**后端任务：**
1. `_naive_forecast(values, horizon)` — 朴素基准：重复最后观测值
2. `_calc_mase(actual, predicted)` — MASE = MAE_model / MAE_naive
3. `_calc_direction_accuracy(actual, predicted)` — 方向准确率 = 正确判断涨跌比例 × 100%
4. 修改 `_calc_accuracy()` — 移除 r_squared，新增 mase + direction_acc
5. 从默认方法列表移除 MA（保留 ETS + ARIMA）

**前端任务：**
1. KPI 卡片改造：MAPE → MASE、R² → 方向准确率
2. MASE < 1 绿色"优于基准"，>= 1 红色
3. 方向准确率 > 70% 绿、60-70% 黄、< 60% 红
4. MAPE 卡片灰色降级
5. 方法选择器移除 MA 选项

**验收：** `/forecast` 响应含 mase + direction_acc，不含 r_squared

### P0.5：越限概率与风险等级

**改动文件：** `backend/app/api/predict.py`、`frontend/src/pages/Prediction/index.tsx`

**后端任务：**
1. `_calc_breach_prob(mean, std, usl, lsl)` — 同时计算 USL/LSL 方向，取较大值
2. `_determine_risk_level(prob)` — < 5% LOW / 5-25% MEDIUM / 25-75% HIGH / > 75% CRITICAL
3. `_calc_breach_time(predictions, upper, lower, usl, lsl, times)` — 从预测序列计算首次越限时间
4. `/forecast` 响应新增 `risk` 字段

**前端任务：**
1. KPI 卡片新增风险等级指示器（四级颜色）

**验收：** 酸度越限概率 >= 90%，风险等级为 CRITICAL（非 low）

### P1：自动模型选择 + Cpk + 残差修复

**改动文件：** `backend/app/api/predict.py`、`frontend/src/pages/Prediction/index.tsx`、`frontend/src/services/api.ts`

**后端任务：**
1. `_adf_test(values)` — ADF 平稳性检验
2. `_auto_select_d(values, horizon)` — 双拟合 d=0/d=1，取 MASE 更优
3. `_auto_select_model(values, horizon)` — ETS vs ARIMA，取 MASE 最优
4. `/models/compare` 接口 — 四模型 MASE 对比
5. `_sliding_window_cpk(values, usl, lsl, window=100)` — 滑动窗口 Cpk
6. `/risk/cpk` 接口
7. 修复残差计算（actual - predicted，非 data - mean）
8. 统一 CI 计算（residual_std * sqrt(step)）

**前端任务：**
1. 模型对比图表（MASE 柱状图，推荐模型高亮）
2. API 客户端新增 `getModelsCompare`、`getRiskCpk`

**验收：** `model=auto` 自动选择最优模型，残差图真实

### P2：CUSUM + 风险面板 + WebSocket + 持久化

**改动文件：** `backend/app/api/predict.py`、`frontend/src/pages/Prediction/index.tsx`、`frontend/src/services/api.ts`、数据库

**后端任务：**
1. 创建 3 张新表（prediction_results、risk_predictions、process_segments）
2. `_parse_segments(data)` — 解析 HG/换罐 标记
3. `_segmented_cusum(values, segments)` — 分段 CUSUM
4. `/risk/drift` 接口
5. 5 分钟缓存层
6. 持久化逻辑
7. WebSocket 推送

**前端任务：**
1. 风险面板 UI（四指标卡片 + Cpk 趋势图 + 告警列表）
2. CRITICAL 弹窗 + 声音告警
3. API 客户端新增 `getRiskDrift`

**验收：** 风险面板四指标实时更新，CRITICAL 弹窗告警

### P3：特征工程 + GBDT + 多变量预测

**改动文件：** `backend/app/api/predict.py`、`backend/app/features/`（新建）、`backend/app/models/`（新建）、`frontend/src/pages/Prediction/index.tsx`、`requirements.txt`

**后端任务：**
1. 新增 `scikit-learn` 依赖
2. 特征工程模块（滞后、滚动统计、换料标记）
3. 关联分析（修正为正相关预期）
4. `/correlation` 接口
5. GBDT 单变量预测
6. 多变量预测
7. 特征重要性分析
8. `/feature/importance` 接口

**前端任务：**
1. 关联热力图 + 特征重要性柱状图
2. API 客户端新增 `getCorrelation`、`getFeatureImportance`

**验收：** GBDT 可用，关联热力图正确展示

---

## [S5] API 接口规格

详见 `docs/预测模块升级开发方案.md` 第四章。7 个接口：

| 接口 | 阶段 | 方法 |
|------|------|------|
| `/predict/forecast` | P0 增强 | GET |
| `/predict/models/compare` | P1 新增 | GET |
| `/predict/risk/breach` | P0.5 新增 | GET |
| `/predict/risk/cpk` | P1 新增 | GET |
| `/predict/risk/drift` | P2 新增 | GET |
| `/predict/correlation` | P3 新增 | GET |
| `/predict/feature/importance` | P3 新增 | GET |

---

## [S6] 数据库变更

P2 阶段创建 3 张新表，DDL 详见 `docs/预测模块升级开发方案.md` 第五章。

---

## [S7] 关键技术决策

| 决策 | 结论 |
|------|------|
| 预测方法 | 仅 ETS + ARIMA（MA 淘汰） |
| ARIMA d 参数 | 双拟合 d=0/d=1，取 MASE 更优 |
| 越限概率 | max(prob_USL, prob_LSL) |
| Cpk 趋势 | 滑动窗口 100 点 |
| CI 计算 | 统一 residual_std * sqrt(step) |
| 缓存 | 5 分钟，按 (indicator, product, horizon, model) |
| 模型训练 | 每次重新拟合 |
| 关联假设 | 正相关（脂肪↔蛋白质 r=0.78） |
| 低 CV 数据 | CV < 2% 回退朴素基准 |
| 依赖引入 | P3 引入 sklearn |
