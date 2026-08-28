# EWMA 控制图 + Mann-Kendall 趋势检验

**Date:** 2026-08-23
**Status:** Approved
**Scope:** SPC 模块新增 EWMA 控制图；预测模块集成 Mann-Kendall 趋势检验

---

## [S1] Problem

当前 SPC 模块仅有 I-MR（Shewhart）控制图 + Nelson 规则。I-MR 图对 3σ 以上的大偏移敏感，但对 0.5σ~1.5σ 的缓慢漂移检测能力弱。乳品生产中常见的均一化效果缓慢下降、脂肪含量渐进偏移等场景，需要 EWMA 控制图来补充。

预测模块的自动模型选择（`_auto_select_model`）仅依赖 ADF 平稳性检验 + MASE 对比，缺少趋势方向信号。Mann-Kendall 趋势检验可提供非参数趋势判断，辅助模型选择决策。

## [S2] Solution Overview

### EWMA 控制图（SPC 模块）

- 后端：新增 `EWMAControlChart` 类，与 `IMRControlChart` 并列
- API：扩展现有 `GET /spc/{product_code}/{indicator_code}`，新增 `chart_type` 参数
- 前端：SPC 页面新增 EWMA tab，含 λ 滑块控件

### Mann-Kendall 趋势检验（预测模块）

- 后端：新增 `_mann_kendall_test()` 函数，集成到 `_auto_select_model` 返回结果
- API：`GET /predict/forecast` 响应中新增 `trend_analysis` 字段
- 前端：预测页面 KPI 区域新增趋势分析卡片

## [S3] EWMA 后端实现

### 文件：`backend/app/engine/spc/control_charts.py`

新增 `EWMAControlChart` 类：

```python
class EWMAControlChart:
    """EWMA 指数加权移动平均控制图"""

    def calculate(self, values: np.ndarray, lambda_: float = 0.2, L: float = 3.0) -> dict:
        """
        参数:
            values: 数据序列
            lambda_: 平滑系数 (0.05~0.5)，越小越平滑
            L: 控制限宽度倍数（默认 3σ）

        返回:
            ewma_values: EWMA 统计量序列
            ucl: 上控制限序列（随时间变化）
            cl: 中心线（目标均值 μ₀）
            lcl: 下控制限序列
            violations: 越界点索引列表
        """
```

核心公式：
- `Z_i = λ·x_i + (1-λ)·Z_{i-1}`，Z₀ = μ₀
- `UCL_i = μ₀ + L·σ·√(λ/(2-λ)·(1-(1-λ)^2i))`
- `LCL_i = μ₀ - L·σ·√(λ/(2-λ)·(1-(1-λ)^2i))`

其中 σ 使用 MR-bar / 1.128（与 I-MR 图一致），μ₀ 使用历史均值。

### 文件：`backend/app/api/spc.py`

修改 `get_spc_data` 端点：

- 新增查询参数：`chart_type: str = "imr"`（可选 `imr` / `ewma`）
- 新增查询参数：`lambda_: float = Query(0.2, ge=0.05, le=0.5)`（仅 ewma 模式生效）
- `chart_type=ewma` 时，返回 `ewma_chart` 字段（替代 `i_chart`/`mr_chart`）
- `chart_type=imr` 时，行为不变（向后兼容）

响应结构（ewma 模式）：
```json
{
  "chart_type": "ewma",
  "ewma_chart": {
    "values": [3.92, 3.93, ...],
    "ucl": [3.98, 3.97, ...],
    "cl": 3.90,
    "lcl": [3.82, 3.83, ...],
    "violations": [15, 23],
    "lambda": 0.2
  },
  "spec_limits": { ... },
  "data_points": [ ... ]
}
```

## [S4] EWMA 前端实现

### 文件：`frontend/src/pages/SPC/index.tsx`

- 新增 `chartType` state（`"imr" | "ewma"`），默认 `"imr"`
- 新增 `ewmaLambda` state，默认 0.2
- 在图表区域上方添加 tab 切换按钮：`I-MR 图 | EWMA 图`
- EWMA tab 下显示：
  - λ 滑块控件（range 0.05~0.5，step 0.05）
  - EWMA 折线图（ECharts）+ UCL/LCL 动态控制限（面积填充或虚线）
  - 越界点红色高亮（复用 I-MR 的 violation 样式）
  - USL/LSL 规格限标线（复用现有逻辑）

### 文件：`frontend/src/types/index.ts`

扩展 `SPCData` 接口，新增可选字段：
```typescript
chart_type?: 'imr' | 'ewma'
ewma_chart?: {
  values: number[]
  ucl: number[]
  lcl: number[]
  cl: number
  violations: number[]
  lambda: number
}
```

## [S5] Mann-Kendall 后端实现

### 文件：`backend/app/api/predict.py`

新增 `_mann_kendall_test(values)` 函数：

```python
def _mann_kendall_test(values: np.ndarray) -> dict:
    """
    Mann-Kendall 趋势检验 + Sen 斜率估计。

    返回:
        p_value: 显著性 p 值
        z: Z 统计量
        trend: "increasing" | "decreasing" | "none"
        sen_slope: Sen 斜率（每单位时间变化量）
        has_trend: bool (p < 0.05)
    """
```

实现要点：
- 向量化 S 统计量计算（参考 `validation/validate.py:124-140`）
- 大样本（n>500）子采样加速
- Sen 斜率：`β = median[(xⱼ - xᵢ)/(j-i)]`
- 使用 `scipy.stats.norm` 计算 p 值

集成到 `_auto_select_model`：
- 函数内部调用 `_mann_kendall_test(values)`
- 返回值新增 `mk_result` 字段（dict）

修改 `forecast` 端点响应（`data` 字段内新增）：
```json
{
  "trend_analysis": {
    "p_value": 0.0032,
    "z": 2.96,
    "trend": "increasing",
    "sen_slope": 0.0015,
    "has_trend": true
  }
}
```

所有模型模式（auto/ets/arima/ma）均返回 `trend_analysis`，不仅限于 auto。

## [S6] Mann-Kendall 前端实现

### 文件：`frontend/src/pages/Prediction/index.tsx`

在 KPI 卡片区域（现有 MASE、方向准确率、越限风险、MAPE 之后）新增趋势分析卡片：

- 趋势方向：↑ 上升（绿色）/ ↓ 下降（红色）/ → 无趋势（灰色）
- p 值：显示数值 + 显著性标注（p<0.01 "***" / p<0.05 "**" / p<0.1 "*" / 否则 "n.s."）
- Sen 斜率：每单位时间变化量

### 文件：`frontend/src/types/index.ts`

在预测结果类型中新增：
```typescript
trend_analysis?: {
  p_value: number
  z: number
  trend: 'increasing' | 'decreasing' | 'none'
  sen_slope: number
  has_trend: boolean
}
```

## [S7] 不做的事

- 不做 MACD（金融指标，SPC 无标准依据）
- 不做 EWMA 漂移检测（CUSUM 已覆盖）
- 不做 Mann-Kendall 趋势线叠加图（KPI 卡片足够）
- 不改数据库 schema（EWMA 和 MK 均为实时计算）
- 不改告警引擎（EWMA 越界仅在 SPC 页面展示，不触发告警）

## [S8] 验证标准

1. EWMA 控制图：λ=0.2 时，已知数据集的 EWMA 值与手工计算一致（误差 < 0.001）
2. EWMA 控制图：越界点标记正确（EWMA 值超出 UCL/LCL 的点）
3. Mann-Kendall：验证脚本中的测试数据（`validate.py` 酸度数据）结果一致
4. Mann-Kendall：p<0.05 时 `has_trend=true`，趋势方向与 Z 值符号一致
5. 前端：EWMA tab 切换正常，λ 滑块实时更新图表
6. 前端：趋势分析卡片在有/无数据时均正常显示
7. 向后兼容：`chart_type=imr`（默认）行为不变
