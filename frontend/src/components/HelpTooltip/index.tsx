import React from 'react'
import { Popover, Tag, Button } from 'antd'
import { QuestionCircleOutlined, InfoCircleOutlined } from '@ant-design/icons'
import type { PopoverProps } from 'antd'

/* ------------------------------------------------------------------ */
/*  Types                                                              */
/* ------------------------------------------------------------------ */

interface HelpData {
  title: string
  tag: string
  tagColor: string
  description: string
  formula?: string
  example?: string
  note?: string
}

interface HelpTooltipProps {
  /** Key into helpContentMap (e.g. "mean", "nelson-r1") */
  termId: string
  /** Popover placement */
  placement?: PopoverProps['placement']
  /** Popover width in px */
  width?: number
  /** Icon size: small / middle / large */
  size?: 'small' | 'middle' | 'large'
}

/* ------------------------------------------------------------------ */
/*  Term definitions — 35 entries, 8 categories                        */
/* ------------------------------------------------------------------ */

const helpContentMap: Record<string, HelpData> = {
  // ===================== Basic Statistics =====================
  mean: {
    title: '均值（Mean / μ）',
    tag: '基础',
    tagColor: 'blue',
    description: '全部数据的算术平均值，反映数据的集中趋势。在SPC中作为控制图的中心线（CL）。',
    formula: 'x̄ = Σxᵢ / n',
    example: '31108条灭菌乳数据中，蛋白质均值 = 3.32%',
    note: '均值对极端值敏感，常与中位数对比判断数据偏态',
  },
  std: {
    title: '标准差（Standard Deviation / σ）',
    tag: '基础',
    tagColor: 'blue',
    description: '衡量数据偏离均值的离散程度。标准差越大，数据波动越剧烈。',
    formula: 's = √[ Σ(xᵢ - x̄)² / (n - 1) ]',
    example: 'SPC控制限的宽度由标准差决定',
    note: '平台使用样本标准差（ddof=1），更保守',
  },
  median: {
    title: '中位数（Median）',
    tag: '基础',
    tagColor: 'blue',
    description: '将数据从小到大排列后处于正中间的值。不受极端值影响。',
    formula: 'n为奇数：Median = x₍ₙ₊₁₎/₂；n为偶数：Median = (xₙ/₂ + xₙ/₂₊₁) / 2',
    example: '常与均值对比判断数据偏态',
  },
  quartile: {
    title: '四分位数（Q1 / Q2 / Q3）',
    tag: '基础',
    tagColor: 'blue',
    description: '将数据分为四个等份的三个分割点。Q2即中位数。',
    formula: 'IQR = Q3 - Q1',
    example: '四分位数是箱线图和IQR异常检测的基础',
  },
  'moving-range': {
    title: '移动极差（Moving Range / MR）',
    tag: '基础',
    tagColor: 'blue',
    description: '相邻两个数据点之差的绝对值。用于估计短期过程波动。',
    formula: 'MRᵢ = |xᵢ - xᵢ₋₁|',
    example: 'I-MR控制图中用于计算控制限宽度的核心统计量',
  },
  window: {
    title: '滑动窗口（Sliding Window）',
    tag: '基础',
    tagColor: 'blue',
    description: '只取最近N个数据点进行计算，确保分析结果反映当前过程状态。',
    example: '高频数据建议窗口30，中频50，低频100',
  },

  // ===================== Normal Distribution =====================
  'normal-dist': {
    title: '正态分布（Normal Distribution）',
    tag: '核心',
    tagColor: 'orange',
    description: '自然界和生产过程中最常见的连续概率分布，呈"钟形曲线"。',
    formula: 'f(x) = (1 / (σ√2π)) × e^[-(x-μ)² / (2σ²)]',
    note: '液奶检测指标近似服从正态分布，这是SPC方法适用的前提',
  },
  'three-sigma': {
    title: '3σ原则（68-95-99.7法则）',
    tag: '核心',
    tagColor: 'orange',
    description: '正态分布中，99.73%的数据落在均值±3个标准差范围内。',
    formula: 'P(μ - 3σ < X < μ + 3σ) ≈ 0.9973',
    note: '超出±3σ的概率仅0.27%，这是SPC控制图的理论基础',
  },
  'zone-division': {
    title: '控制图区域划分（A/B/C区）',
    tag: '核心',
    tagColor: 'orange',
    description: '以中心线为基准，将控制图划分为6个等宽区域。',
    example: 'C区：μ±1σ，B区：μ±1σ~2σ，A区：μ±2σ~3σ',
  },

  // ===================== SPC Core =====================
  'spc-concept': {
    title: 'SPC（统计过程控制）',
    tag: '核心',
    tagColor: 'blue',
    description: '利用统计方法对生产过程进行实时监控，区分正常波动和异常波动。',
    note: 'SPC是"监控过程"→在趋势偏离初期就预警，避免产生次品',
  },
  'control-limits': {
    title: '控制限（UCL / CL / LCL）',
    tag: '核心',
    tagColor: 'blue',
    description: '控制图的三条关键水平线，基于过程自身数据计算。',
    formula: 'UCL = x̄ + 2.66 × MR̄，LCL = x̄ - 2.66 × MR̄',
    note: '控制限是过程告诉你的，规格限是标准告诉你的',
  },
  'spec-vs-control': {
    title: '规格限 vs 控制限',
    tag: '易混',
    tagColor: 'orange',
    description: '规格限来自外部标准，控制限来自过程数据。两者本质不同。',
    example: '脂肪规格限：≥3.0%（国标）；控制限：UCL=3.99, LCL=3.89（过程实际波动）',
  },

  // ===================== I-MR Chart =====================
  'imr-overview': {
    title: 'I-MR 控制图',
    tag: '核心',
    tagColor: 'blue',
    description: '由两张图上下排列组成的控制图，适用于每次检测只有1个数据值的场景。',
    formula: 'I图：x̄ ± 2.66×MR̄；MR图：[0, 3.267×MR̄]',
    note: '液奶检验数据通常是每个批次一个检测值，因此选用I-MR图',
  },
  'control-chart-constants': {
    title: '控制图常数表',
    tag: '参考',
    tagColor: 'default',
    description: 'I-MR控制图使用n=2对应的常数。',
    example: 'd₂=1.128，D₃=0，D₄=3.267，E₂=2.660',
  },
  'calc-example': {
    title: '完整计算示例',
    tag: '实例',
    tagColor: 'green',
    description: '以"砖纯牛奶·脂肪"最近5个检测值为例。',
    example: '3.95, 3.92, 3.98, 3.88, 3.93 → x̄=3.932, MR̄=0.06',
  },

  // ===================== Nelson Rules =====================
  'nelson-r1': {
    title: '规则1：1个点超出3σ控制限',
    tag: 'CRITICAL',
    tagColor: 'red',
    description: '任何一个数据点落在UCL之上或LCL之下。最经典的失控信号。',
    formula: '条件：xᵢ > UCL 或 xᵢ < LCL',
    note: '概率仅0.27%，可能原因：原料突变、设备故障',
  },
  'nelson-r2': {
    title: '规则2：连续9个点在中心线同一侧',
    tag: 'CRITICAL',
    tagColor: 'red',
    description: '连续9个点全部高于或低于中心线，表明过程均值发生系统性偏移。',
    formula: '条件：连续9个xᵢ全部 > CL 或全部 < CL',
    note: '可能原因：原料供应商更换、配方调整',
  },
  'nelson-r3': {
    title: '规则3：连续6个点持续递增或递减',
    tag: 'WARNING',
    tagColor: 'orange',
    description: '连续6个点形成单调上升或下降趋势，表明存在渐进性漂移。',
    formula: '条件：xᵢ < xᵢ₊₁ < ... < xᵢ₊₅（递增）或相反（递减）',
    note: '可能原因：设备逐渐老化、温度缓慢漂移',
  },
  'nelson-r4': {
    title: '规则4：连续14个点交替上下',
    tag: 'WARNING',
    tagColor: 'orange',
    description: '连续14个点呈锯齿状交替上升下降，表示存在两个交替变化的因素。',
    formula: '条件：(xᵢ - xᵢ₋₁) × (xᵢ₊₁ - xᵢ) < 0，持续14个点',
    note: '可能原因：两台设备轮流生产、两个操作员交替操作',
  },
  'nelson-r5': {
    title: '规则5：连续3点中有2点在A区或以外（同侧）',
    tag: 'WARNING',
    tagColor: 'orange',
    description: '连续3个点中，有2个点落在同一侧的A区或超出控制限。',
    formula: '条件：连续3点中 ≥2 点 > μ + 2σ 或 < μ - 2σ',
    note: '表示过程均值可能正在偏移',
  },
  'nelson-r6': {
    title: '规则6：连续5点中有4点在B区或以外（同侧）',
    tag: 'WARNING',
    tagColor: 'orange',
    description: '连续5个点中，有4个点落在同一侧的B区或更远。',
    formula: '条件：连续5点中 ≥4 点 > μ + 1σ 或 < μ - 1σ',
    note: '比规则5更温和的均值偏移信号',
  },
  'nelson-r7': {
    title: '规则7：连续15个点在C区（中心线附近）',
    tag: 'INFO',
    tagColor: 'blue',
    description: '连续15个点全部落在C区（μ±1σ）内。看似"好"实则异常。',
    formula: '条件：连续15点全部在 [μ - 1σ, μ + 1σ] 范围内',
    note: '波动过小不符合统计预期，可能数据造假或测量系统问题',
  },
  'nelson-r8': {
    title: '规则8：连续8点在C区以外（两侧都有）',
    tag: 'INFO',
    tagColor: 'blue',
    description: '连续8个点全部不在C区内，且两侧都有。表示过程波动增大。',
    formula: '条件：连续8点全部在C区外，且上侧和下侧各至少1点',
    note: '数据过于分散，需要关注过程稳定性',
  },

  // ===================== Process Capability =====================
  cp: {
    title: 'Cp（过程能力指数）',
    tag: '核心',
    tagColor: 'green',
    description: '衡量过程潜在能力——如果过程均值恰好对准规格中心，过程能达到多好的能力。',
    formula: 'Cp = (USL - LSL) / (6σ)',
    example: 'Cp=1表示规格限恰好等于±3σ；Cp=2表示规格宽度是过程宽度的2倍',
    note: 'Cp不考虑均值偏移，是理论上的最佳能力',
  },
  cpk: {
    title: 'Cpk（过程能力指数，考虑偏移）',
    tag: '核心',
    tagColor: 'green',
    description: '衡量过程实际能力——考虑了均值偏离规格中心的影响。',
    formula: 'Cpk = min(Cpl, Cpu) = min((μ - LSL) / (3σ), (USL - μ) / (3σ))',
    example: 'Cpk < 1.33触发WARNING预警，1.33是工业界普遍认可的最低门槛',
    note: 'Cpk ≤ Cp，当均值恰好对准规格中心时Cpk = Cp',
  },
  ppm: {
    title: 'PPM（百万分之缺陷率）',
    tag: '过程能力',
    tagColor: 'green',
    description: '每百万个产品中的缺陷数。将Cpk指数转换为更直观的"废品率"概念。',
    formula: 'PPM = (P(X < LSL) + P(X > USL)) × 1,000,000',
    example: 'Cpk=1.33时，PPM≈126（合格率99.987%）',
  },
  'spec-limits': {
    title: '规格限（USL / LSL / T）',
    tag: '过程能力',
    tagColor: 'green',
    description: '产品标准或客户要求规定的质量指标允许范围。',
    example: '蛋白质：USL=3.6, LSL=2.9, T=3.2 g/100g',
    note: '规格限与过程的统计特性无关，是外部设定的标准',
  },

  // ===================== Anomaly Detection =====================
  zscore: {
    title: 'Z-Score（标准分数）',
    tag: '异常检测',
    tagColor: 'red',
    description: '衡量一个数据点偏离均值多少个标准差。将不同量纲的数据转换为统一的无量纲分数。',
    formula: 'Z = (x - μ) / σ',
    example: '|Z| > 3时判定为异常（置信度99.7%，误报率0.3%）',
    note: '计算简单但对极端值敏感，适用于近似正态分布的数据',
  },
  iqr: {
    title: 'IQR（四分位距）',
    tag: '异常检测',
    tagColor: 'red',
    description: '第三四分位数（Q3）与第一四分位数（Q1）之差，衡量数据中间50%的离散程度。',
    formula: 'IQR = Q3 - Q1；异常边界：Q1 - 1.5×IQR ~ Q3 + 1.5×IQR',
    example: '基于IQR的异常检测方法不受极端值影响（鲁棒性强）',
    note: '无分布假设（非参数方法），适用于任意分布数据',
  },
  ewma: {
    title: 'EWMA（指数加权移动平均）',
    tag: '异常检测',
    tagColor: 'red',
    description: '给予近期数据更大权重的移动平均方法。对小偏移（1~1.5σ）的检测灵敏度高于常规控制图。',
    formula: 'Zᵢ = λ × xᵢ + (1 - λ) × Zᵢ₋₁',
    example: 'λ=0.2为推荐默认值，检测1.5σ级别偏移',
    note: 'EWMA对小偏移的累积非常敏感，与Shewhart图互补使用效果最佳',
  },

  // ===================== Trend Prediction =====================
  arima: {
    title: 'ARIMA 模型',
    tag: '趋势预测',
    tagColor: 'orange',
    description: '时间序列预测中最经典的统计模型，通过组合自回归（AR）、差分（I）和移动平均（MA）三个组件。',
    formula: 'ARIMA(p, d, q)：Φ(B)(1-B)ᵈXₜ = Θ(B)εₜ',
    example: '典型参数：ARIMA(1,1,1)或ARIMA(2,0,1)',
    note: '通过AIC/BIC准则自动选择最优参数',
  },
  'mann-kendall': {
    title: 'Mann-Kendall 趋势检验',
    tag: '趋势预测',
    tagColor: 'orange',
    description: '非参数趋势检验方法，用于检测时间序列中是否存在单调递增或递减趋势。',
    formula: 'S = Σᵢ₌₁ⁿ⁻¹ Σⱼ₌ᵢ₊₁ⁿ sgn(xⱼ - xᵢ)',
    example: 'S>0：上升趋势；S<0：下降趋势；S=0：无趋势',
    note: '不假设数据服从特定分布，对异常值鲁棒',
  },
}

/* ------------------------------------------------------------------ */
/*  Icon size map                                                      */
/* ------------------------------------------------------------------ */

const iconSizeMap: Record<string, number> = {
  small: 12,
  middle: 14,
  large: 16,
}

/* ------------------------------------------------------------------ */
/*  Tag color mapping (string → Ant Design preset)                     */
/* ------------------------------------------------------------------ */

const tagColorMap: Record<string, string> = {
  blue: 'blue',
  green: 'green',
  orange: 'orange',
  red: 'red',
  default: 'default',
}

/* ------------------------------------------------------------------ */
/*  Component                                                          */
/* ------------------------------------------------------------------ */

const HelpTooltip: React.FC<HelpTooltipProps> = ({
  termId,
  placement = 'top',
  width = 360,
  size = 'middle',
}) => {
  const data = helpContentMap[termId]

  // If termId is unknown, render a disabled icon
  if (!data) {
    return (
      <QuestionCircleOutlined
        style={{ color: 'var(--text-muted)', cursor: 'not-allowed', fontSize: iconSizeMap[size] }}
      />
    )
  }

  const tagColor = tagColorMap[data.tagColor] || 'default'

  /* ---------- Popover content ---------- */

  const content = (
    <div style={{ maxWidth: width - 32 }}>
      {/* Header */}
      <div
        style={{
          display: 'flex',
          alignItems: 'center',
          gap: 8,
          marginBottom: 10,
          paddingBottom: 8,
          borderBottom: '1px solid var(--border)',
        }}
      >
        <span
          style={{
            fontSize: 15,
            fontWeight: 600,
            color: 'var(--text-primary)',
            lineHeight: 1.4,
          }}
        >
          {data.title}
        </span>
        <Tag
          color={tagColor}
          style={{ marginLeft: 'auto', flexShrink: 0, fontWeight: 500 }}
        >
          {data.tag}
        </Tag>
      </div>

      {/* Description */}
      <p
        style={{
          margin: '0 0 10px',
          fontSize: 13,
          lineHeight: 1.7,
          color: 'var(--text-secondary)',
        }}
      >
        {data.description}
      </p>

      {/* Formula */}
      {data.formula && (
        <div
          style={{
            padding: '8px 12px',
            marginBottom: 10,
            borderLeft: '3px solid var(--primary)',
            borderRadius: 'var(--radius-sm)',
            background: 'var(--primary-bg)',
            fontFamily: 'source-code-pro, Menlo, Monaco, Consolas, monospace',
            fontSize: 13,
            color: 'var(--primary-dark)',
            lineHeight: 1.6,
            wordBreak: 'break-all',
          }}
        >
          {data.formula}
        </div>
      )}

      {/* Example */}
      {data.example && (
        <div
          style={{
            padding: '8px 12px',
            marginBottom: 10,
            borderLeft: '3px solid var(--success)',
            borderRadius: 'var(--radius-sm)',
            background: '#f0faf4',
            fontSize: 13,
            color: 'var(--text-secondary)',
            lineHeight: 1.6,
          }}
        >
          {data.example}
        </div>
      )}

      {/* Note */}
      {data.note && (
        <div
          style={{
            display: 'flex',
            alignItems: 'flex-start',
            gap: 6,
            padding: '8px 12px',
            borderRadius: 'var(--radius-sm)',
            background: '#fef9e7',
            fontSize: 12,
            lineHeight: 1.6,
            color: '#7d6608',
          }}
        >
          <InfoCircleOutlined style={{ marginTop: 3, flexShrink: 0 }} />
          <span>{data.note}</span>
        </div>
      )}
    </div>
  )

  /* ---------- Popover trigger ---------- */

  return (
    <Popover
      content={content}
      placement={placement}
      overlayStyle={{ maxWidth: width }}
      overlayInnerStyle={{ borderRadius: 'var(--radius-md)' }}
    >
      <Button
        type="text"
        size="small"
        icon={
          <QuestionCircleOutlined
            style={{
              color: 'var(--primary)',
              fontSize: iconSizeMap[size],
            }}
          />
        }
        style={{
          display: 'inline-flex',
          alignItems: 'center',
          justifyContent: 'center',
          width: iconSizeMap[size] + 10,
          height: iconSizeMap[size] + 10,
          minWidth: 'auto',
          padding: 0,
        }}
      />
    </Popover>
  )
}

export default HelpTooltip
export { helpContentMap }
export type { HelpTooltipProps, HelpData }
