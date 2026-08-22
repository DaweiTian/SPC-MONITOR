import React, { useMemo } from 'react'
import type { EChartsOption } from 'echarts'
import { useChart } from '../../components/Charts'
import { FloatingToc } from '../../components/FloatingToc'
import s from './Manual.module.css'

/* ─── Reusable bits ─── */
const SectionCard: React.FC<{ id: string; icon: React.ReactNode; title: string; tag?: string; tagClass?: string; children: React.ReactNode }> =
  ({ id, icon, title, tag, tagClass, children }) => (
    <section id={id}>
      <div className={s.card}>
        <div className={s.cardHeader}>
          <div className={s.cardHeaderIcon}>{icon}</div>
          <span className={s.cardTitle}>{title}</span>
          {tag && <span className={`${s.cardTag} ${tagClass ?? ''}`}>{tag}</span>}
        </div>
        {children}
      </div>
    </section>
  )

const DefBox: React.FC<{ label?: string; children: React.ReactNode }> = ({ label = '定义', children }) => (
  <div className={s.defBox}><div className={s.defBoxLabel}>{label}</div><div>{children}</div></div>
)
const FormulaBox: React.FC<{ label?: string; children: React.ReactNode }> = ({ label = '公式', children }) => (
  <div className={s.formulaBox}><div className={s.formulaLabel}>{label}</div>{children}</div>
)
const NoteBox: React.FC<{ children: React.ReactNode }> = ({ children }) => <div className={s.noteBox}>{children}</div>
const WarnBox: React.FC<{ children: React.ReactNode }> = ({ children }) => <div className={s.warnBox}>{children}</div>

const ChartWrap: React.FC<{ title: string; height?: number; option: EChartsOption | null }> = ({ title, height = 300, option }) => {
  const { containerRef } = useChart(option)
  return (
    <div className={s.chartWrap}>
      <div className={s.chartTitle}>{title}</div>
      <div className={s.chartBody}><div ref={containerRef} style={{ height, width: '100%' }} /></div>
    </div>
  )
}

/* ─── Icon helpers ─── */
const svgBar = <svg width="18" height="18" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2"><rect x="3" y="12" width="4" height="9"/><rect x="10" y="7" width="4" height="14"/><rect x="17" y="3" width="4" height="18"/></svg>
const svgLine = <svg width="18" height="18" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2"><polyline points="23 18 13.5 8.5 8.5 13.5 1 6"/><polyline points="17 18 23 18 23 12"/></svg>
const svgTarget = <svg width="18" height="18" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2"><circle cx="12" cy="12" r="10"/><circle cx="12" cy="12" r="6"/><circle cx="12" cy="12" r="2"/></svg>
const svgDoc = <svg width="18" height="18" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2"><path d="M16 4h2a2 2 0 0 1 2 2v14a2 2 0 0 1-2 2H6a2 2 0 0 1-2-2V6a2 2 0 0 1 2-2h2"/><rect x="8" y="2" width="8" height="4" rx="1"/></svg>
const svgSigma = <svg width="18" height="18" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2"><path d="M18 4H6l6 8-6 8h12"/></svg>
const svgSearch = <svg width="18" height="18" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2"><circle cx="11" cy="11" r="8"/><line x1="21" y1="21" x2="16.65" y2="16.65"/></svg>
const svgTrend = <svg width="18" height="18" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2"><polyline points="23 6 13.5 15.5 8.5 10.5 1 18"/><polyline points="17 6 23 6 23 12"/></svg>
const svgMean = <svg width="18" height="18" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2"><path d="M2 12h20"/><path d="M6 8v8"/><path d="M10 10v4"/><path d="M14 8v8"/><path d="M18 10v4"/></svg>

const cyan = 'rgba(0,212,255,0.12)'
const green = 'rgba(16,185,129,0.12)'
const red = 'rgba(239,68,68,0.15)'
const amber = 'rgba(245,158,11,0.15)'

/* ─── Chart: I-MR 示例 ─── */
const IMRChart: React.FC = () => {
  const opt = useMemo<EChartsOption>(() => {
    const raw = [3.90,3.92,3.88,3.91,3.89,3.93,4.15,3.90,3.88,3.91,3.92,3.89,
      3.87,3.90,3.72,3.93,3.91,3.88,3.90,3.92,3.89,3.91,4.05,3.88,3.90,3.92,3.89,3.91,3.90,3.88]
    const mr = raw.map((v, i) => i === 0 ? null : Math.abs(v - raw[i - 1]))
    const mrValid = mr.filter(v => v !== null) as number[]
    const mean = raw.reduce((a, b) => a + b, 0) / raw.length
    const mrMean = mrValid.reduce((a, b) => a + b, 0) / mrValid.length
    const ucl = mean + 2.66 * mrMean
    const lcl = mean - 2.66 * mrMean
    const mrUcl = 3.267 * mrMean
    const labels = raw.map((_, i) => `#${i + 1}`)
    return {
      tooltip: { trigger: 'axis' },
      grid: [{ left: 55, right: 25, top: 20, height: '40%' }, { left: 55, right: 25, top: '58%', height: '35%' }],
      xAxis: [{ type: 'category', gridIndex: 0, data: labels, axisLabel: { show: false } }, { type: 'category', gridIndex: 1, data: labels, axisLabel: { fontSize: 9, interval: 4 } }],
      yAxis: [{ type: 'value', gridIndex: 0, name: 'I图', min: 3.6, max: 4.2 }, { type: 'value', gridIndex: 1, name: 'MR图', min: 0, max: 0.25 }],
      series: [
        { name: 'I图', type: 'line', xAxisIndex: 0, yAxisIndex: 0, data: raw, symbol: 'circle', symbolSize: 5, lineStyle: { width: 1.5, color: '#94a3b8' }, itemStyle: { color: (p: any) => (p.value > ucl || p.value < lcl) ? '#dc2626' : '#94a3b8' }, markLine: { silent: true, symbol: 'none', data: [{ yAxis: ucl, lineStyle: { color: '#dc2626', type: 'dashed' }, label: { formatter: `UCL=${ucl.toFixed(3)}`, fontSize: 9 } }, { yAxis: mean, lineStyle: { color: '#0891b2' }, label: { formatter: `CL=${mean.toFixed(3)}`, fontSize: 9 } }, { yAxis: lcl, lineStyle: { color: '#dc2626', type: 'dashed' }, label: { formatter: `LCL=${lcl.toFixed(3)}`, fontSize: 9 } }] } },
        { name: 'MR图', type: 'line', xAxisIndex: 1, yAxisIndex: 1, data: mr, symbol: 'circle', symbolSize: 4, lineStyle: { width: 1.5, color: '#64748b' }, itemStyle: { color: '#64748b' }, markLine: { silent: true, symbol: 'none', data: [{ yAxis: mrUcl, lineStyle: { color: '#dc2626', type: 'dashed' }, label: { formatter: `UCL=${mrUcl.toFixed(3)}`, fontSize: 9 } }, { yAxis: mrMean, lineStyle: { color: '#0891b2' }, label: { formatter: `CL=${mrMean.toFixed(3)}`, fontSize: 9 } }] } },
      ],
    }
  }, [])
  return <ChartWrap title="I-MR 控制图示例（蛋白质检测值，含Nelson规则违规标记）" height={480} option={opt} />
}

/* ─── Chart: Nelson 规则示例 ─── */
const NelsonChart: React.FC<{ data: number[]; mean: number; sigma: number; redIdx?: number[]; yellowIdx?: number[] }> = ({ data, mean, sigma, redIdx = [], yellowIdx = [] }) => {
  const opt = useMemo<EChartsOption>(() => ({
    tooltip: { trigger: 'axis' },
    grid: { left: 50, right: 20, top: 10, bottom: 25 },
    xAxis: { type: 'category', data: data.map((_, i) => `#${i + 1}`), axisLabel: { fontSize: 8 } },
    yAxis: { type: 'value', min: mean - 4 * sigma, max: mean + 4 * sigma },
    series: [{
      type: 'line', data, symbol: 'circle', symbolSize: 5,
      lineStyle: { width: 1.5, color: '#94a3b8' },
      itemStyle: { color: (p: any) => redIdx.includes(p.dataIndex) ? '#dc2626' : yellowIdx.includes(p.dataIndex) ? '#d97706' : '#94a3b8' },
      markLine: { silent: true, symbol: 'none', data: [
        { yAxis: mean + 3 * sigma, lineStyle: { color: '#dc2626', type: 'dashed', width: 1 }, label: { formatter: 'UCL', fontSize: 9, color: '#dc2626' } },
        { yAxis: mean, lineStyle: { color: '#0891b2', width: 1 }, label: { formatter: 'CL', fontSize: 9, color: '#0891b2' } },
        { yAxis: mean - 3 * sigma, lineStyle: { color: '#dc2626', type: 'dashed', width: 1 }, label: { formatter: 'LCL', fontSize: 9, color: '#dc2626' } },
      ] },
    }],
  }), [data, mean, sigma, redIdx, yellowIdx])
  return <ChartWrap title="Nelson规则违规模式示例" height={260} option={opt} />
}

/* ─── Chart: 正态分布 3σ ─── */
const SigmaChart: React.FC = () => {
  const opt = useMemo<EChartsOption>(() => {
    const mu = 3.9, sigma = 0.08
    const xs = Array.from({ length: 200 }, (_, i) => 3.4 + i * 0.005)
    const pdf = (x: number) => (1 / (sigma * Math.sqrt(2 * Math.PI))) * Math.exp(-((x - mu) ** 2) / (2 * sigma ** 2))
    const data = xs.map(x => [x, pdf(x)])
    return {
      tooltip: { trigger: 'axis' },
      grid: { left: 50, right: 30, top: 20, bottom: 40 },
      xAxis: { type: 'value', name: '脂肪(%)', min: 3.4, max: 4.4 },
      yAxis: { type: 'value', name: '概率密度' },
      series: [{
        type: 'line', data, smooth: true, symbol: 'none',
        lineStyle: { width: 2, color: '#2563eb' },
        areaStyle: { color: { type: 'linear', x: 0, y: 0, x2: 0, y2: 1, colorStops: [{ offset: 0, color: 'rgba(37,99,235,0.25)' }, { offset: 1, color: 'rgba(37,99,235,0.02)' }] } },
        markLine: { silent: true, symbol: 'none', data: [
          { xAxis: mu - sigma, lineStyle: { color: '#d97706', type: 'dashed' }, label: { formatter: 'μ-1σ', fontSize: 10, color: '#d97706' } },
          { xAxis: mu, lineStyle: { color: '#16a34a', width: 1.5 }, label: { formatter: 'μ', fontSize: 11, color: '#16a34a' } },
          { xAxis: mu + sigma, lineStyle: { color: '#d97706', type: 'dashed' }, label: { formatter: 'μ+1σ', fontSize: 10, color: '#d97706' } },
          { xAxis: mu - 3 * sigma, lineStyle: { color: '#dc2626', type: 'dashed' }, label: { formatter: 'μ-3σ', fontSize: 9, color: '#dc2626', position: 'start' } },
          { xAxis: mu + 3 * sigma, lineStyle: { color: '#dc2626', type: 'dashed' }, label: { formatter: 'μ+3σ', fontSize: 9, color: '#dc2626' } },
        ] },
        markArea: { silent: true, itemStyle: { color: 'rgba(22,163,74,0.08)' }, data: [[{ xAxis: mu - sigma }, { xAxis: mu + sigma }]] },
      }],
    }
  }, [])
  return <ChartWrap title="正态分布与 3σ 原则" height={300} option={opt} />
}

/* ─── Chart: Cpk 仪表盘 ─── */
const CpkGauge: React.FC = () => {
  const opt = useMemo<EChartsOption>(() => ({
    series: [{
      type: 'gauge', min: 0, max: 2.5, startAngle: 225, endAngle: -45, splitNumber: 5,
      progress: { show: true, width: 18 },
      axisLine: { lineStyle: { width: 18, color: [[0.268, '#dc2626'], [0.4, '#d97706'], [0.532, '#d97706'], [0.668, '#16a34a'], [1, '#16a34a']] } },
      axisTick: { show: true, distance: -30, length: 6, lineStyle: { color: '#94a3b8', width: 1 } },
      splitLine: { show: true, distance: -34, length: 10, lineStyle: { color: '#94a3b8', width: 2 } },
      axisLabel: { distance: -50, fontSize: 10, formatter: (v: number) => { if (v === 0) return '0'; if (Math.abs(v - 0.67) < 0.05) return '{red|严重不足}'; if (Math.abs(v - 1.0) < 0.05) return '{orange|不足}'; if (Math.abs(v - 1.33) < 0.05) return '{orange|尚可}'; if (Math.abs(v - 1.67) < 0.05) return '{green|良好}'; if (Math.abs(v - 2.5) < 0.05) return '{green|优秀}'; return '' }, rich: { red: { color: '#dc2626', fontSize: 10, fontWeight: 600 }, orange: { color: '#d97706', fontSize: 10, fontWeight: 600 }, green: { color: '#16a34a', fontSize: 10, fontWeight: 600 } } },
      pointer: { width: 5 },
      detail: { valueAnimation: true, formatter: '{value}', fontSize: 28, offsetCenter: [0, '70%'] },
      title: { offsetCenter: [0, '95%'], fontSize: 12 },
      data: [{ value: 1.52, name: 'Cpk = 1.52 (良好)' }],
    }],
  }), [])
  return <ChartWrap title="Cpk 过程能力仪表盘" height={280} option={opt} />
}

/* ─── Chart: Z-Score 散点 ─── */
const ZScoreChart: React.FC = () => {
  const opt = useMemo<EChartsOption>(() => {
    const raw = [3.90,3.92,3.88,3.91,3.89,3.93,3.87,3.90,3.88,3.91,3.92,3.89,3.90,3.88,3.91,4.18,3.90,3.88,3.91,3.89,3.92,3.90,3.88,3.91,3.89,3.90,3.92,3.62,3.91,3.89,3.90,3.92,4.05,3.88,3.91,3.89,3.90,3.88,3.92,3.90]
    const mu = raw.reduce((a, b) => a + b, 0) / raw.length
    const std = Math.sqrt(raw.reduce((a, b) => a + (b - mu) ** 2, 0) / (raw.length - 1))
    return {
      tooltip: { trigger: 'axis' },
      grid: { left: 50, right: 25, top: 20, bottom: 30 },
      xAxis: { type: 'category', data: raw.map((_, i) => `#${i + 1}`), axisLabel: { fontSize: 8 } },
      yAxis: { type: 'value', name: '检测值' },
      series: [{
        type: 'scatter', data: raw, symbolSize: 8,
        itemStyle: { color: (p: any) => { const z = Math.abs((p.value - mu) / std); return z > 3 ? '#dc2626' : z > 2 ? '#d97706' : '#2563eb' } },
        markLine: { silent: true, symbol: 'none', data: [
          { yAxis: mu + 3 * std, lineStyle: { color: '#dc2626', type: 'dashed' }, label: { formatter: 'μ+3σ', fontSize: 9, color: '#dc2626' } },
          { yAxis: mu + 2 * std, lineStyle: { color: '#d97706', type: 'dashed' }, label: { formatter: 'μ+2σ', fontSize: 9, color: '#d97706' } },
          { yAxis: mu, lineStyle: { color: '#0891b2' }, label: { formatter: 'μ', fontSize: 9, color: '#0891b2' } },
          { yAxis: mu - 2 * std, lineStyle: { color: '#d97706', type: 'dashed' }, label: { formatter: 'μ-2σ', fontSize: 9, color: '#d97706' } },
          { yAxis: mu - 3 * std, lineStyle: { color: '#dc2626', type: 'dashed' }, label: { formatter: 'μ-3σ', fontSize: 9, color: '#dc2626' } },
        ] },
      }],
    }
  }, [])
  return <ChartWrap title="Z-Score 异常检测示意" height={300} option={opt} />
}

/* ─── Chart: IQR 箱线图 ─── */
const IQRChart: React.FC = () => {
  const opt = useMemo<EChartsOption>(() => ({
    grid: { left: 60, right: 30, top: 10, bottom: 30 },
    xAxis: { type: 'value', name: '脂肪(%)', min: 3.3, max: 4.5 },
    yAxis: { type: 'category', data: ['检测值'] },
    series: [
      { type: 'boxplot', data: [[3.72, 3.85, 3.93, 4.01, 4.15]], itemStyle: { color: '#dbeafe', borderColor: '#2563eb' } },
      { type: 'scatter', data: [[4.35, 0], [3.45, 0], [4.28, 0]], symbolSize: 10, itemStyle: { color: '#dc2626' }, name: '异常值' },
    ],
  }), [])
  return <ChartWrap title="IQR 箱线图异常检测示意" height={200} option={opt} />
}

/* ─── Chart: EWMA ─── */
const EWMAChart: React.FC = () => {
  const opt = useMemo<EChartsOption>(() => {
    const lambda = 0.15, mu0 = 3.9, sigma = 0.04
    const raw = Array.from({ length: 40 }, (_, i) => mu0 + (i >= 20 ? 0.02 * (i - 19) : 0) + (Math.random() - 0.5) * 0.08)
    const ewma: number[] = []
    let prev = mu0
    for (const x of raw) { prev = lambda * x + (1 - lambda) * prev; ewma.push(parseFloat(prev.toFixed(4))) }
    const ucl = mu0 + 3 * sigma * Math.sqrt(lambda / (2 - lambda))
    const lcl = mu0 - 3 * sigma * Math.sqrt(lambda / (2 - lambda))
    return {
      tooltip: { trigger: 'axis' },
      legend: { data: ['原始数据', 'EWMA'], bottom: 0, textStyle: { fontSize: 10 } },
      grid: { left: 50, right: 25, top: 20, bottom: 40 },
      xAxis: { type: 'category', data: raw.map((_, i) => `#${i + 1}`), axisLabel: { fontSize: 8 } },
      yAxis: { type: 'value', name: '脂肪(%)', min: 3.8, max: 4.3 },
      series: [
        { name: '原始数据', type: 'scatter', data: raw.map(v => parseFloat(v.toFixed(4))), symbolSize: 5, itemStyle: { color: '#94a3b8' } },
        { name: 'EWMA', type: 'line', data: ewma, symbol: 'none', lineStyle: { width: 2, color: '#dc2626' }, markLine: { silent: true, symbol: 'none', data: [{ yAxis: ucl, lineStyle: { color: '#dc2626', type: 'dashed' }, label: { formatter: 'UCL', fontSize: 9 } }, { yAxis: mu0, lineStyle: { color: '#0891b2' }, label: { formatter: 'μ₀', fontSize: 9 } }, { yAxis: lcl, lineStyle: { color: '#dc2626', type: 'dashed' }, label: { formatter: 'LCL', fontSize: 9 } }] }, markArea: { silent: true, data: [[{ xAxis: '#21', itemStyle: { color: 'rgba(220,38,38,0.05)' } }, { xAxis: '#40' }]] } },
      ],
    }
  }, [])
  return <ChartWrap title="EWMA 对小偏移的敏感性（λ=0.15）" height={300} option={opt} />
}

/* ─── Chart: ARIMA 预测 ─── */
const ARIMAChart: React.FC = () => {
  const opt = useMemo<EChartsOption>(() => {
    const hist = Array.from({ length: 40 }, (_, i) => parseFloat((3.9 + Math.sin(i * 0.3) * 0.05 + (Math.random() - 0.5) * 0.04).toFixed(4)))
    const pred = Array.from({ length: 10 }, (_, i) => parseFloat((3.9 + Math.sin((40 + i) * 0.3) * 0.05).toFixed(4)))
    const upper = pred.map((v, i) => parseFloat((v + 0.03 + 0.005 * i).toFixed(4)))
    const labels = [...hist.map((_, i) => `T${i + 1}`), ...pred.map((_, i) => `F${i + 1}`)]
    return {
      tooltip: { trigger: 'axis' },
      legend: { data: ['历史数据', '预测值', '95%置信区间'], bottom: 0, textStyle: { fontSize: 10 } },
      grid: { left: 50, right: 25, top: 20, bottom: 40 },
      xAxis: { type: 'category', data: labels, axisLabel: { fontSize: 8 } },
      yAxis: { type: 'value', name: '脂肪(%)', min: 3.7, max: 4.1 },
      series: [
        { name: '历史数据', type: 'line', data: [...hist, ...Array(10).fill(null)], symbol: 'circle', symbolSize: 4, lineStyle: { width: 1.5, color: '#2563eb' }, itemStyle: { color: '#2563eb' } },
        { name: '95%置信区间', type: 'line', data: [...Array(40).fill(null), ...upper], symbol: 'none', lineStyle: { width: 0 }, areaStyle: { color: 'rgba(37,99,235,0.1)' }, stack: 'ci' },
        { name: '预测值', type: 'line', data: [...Array(40).fill(null), ...pred], symbol: 'diamond', symbolSize: 6, lineStyle: { width: 2, color: '#dc2626', type: 'dashed' }, itemStyle: { color: '#dc2626' } },
      ],
    }
  }, [])
  return <ChartWrap title="ARIMA 预测示例（脂肪含量趋势预测）" height={300} option={opt} />
}

/* ════════════════════ MAIN COMPONENT ════════════════════ */
export const GlossaryPage: React.FC = () => {
  const floatingTocItems = [
    { id: 'spc', title: 'SPC 统计过程控制' },
    { id: 'imr-chart', title: 'I-MR 控制图' },
    { id: 'control-limits', title: '控制限' },
    { id: 'nelson', title: 'Nelson 规则' },
    { id: 'sigma', title: '3σ 原则' },
    { id: 'cpk', title: 'Cpk / Cp / Ppk' },
    { id: 'ppm', title: 'PPM 缺陷率' },
    { id: 'spec-limits', title: '规格限' },
    { id: 'zscore', title: 'Z-Score' },
    { id: 'iqr', title: 'IQR 四分位距' },
    { id: 'ewma', title: 'EWMA' },
    { id: 'arima', title: 'ARIMA 模型' },
    { id: 'mann-kendall', title: 'Mann-Kendall' },
    { id: 'mean-std', title: '均值与标准差' },
    { id: 'normal-dist', title: '正态分布' },
    { id: 'confidence-interval', title: '置信区间' },
    { id: 'sliding-window', title: '滑动窗口' },
    { id: 'appendix', title: '术语速查表' },
  ]

  /* ── TOC sections ── */
  const tocItems = [
    { id: 'spc', icon: svgBar, title: 'SPC 统计过程控制', desc: '控制图、控制限、Nelson规则' },
    { id: 'cpk', icon: svgTarget, title: '过程能力分析', desc: 'Cpk、Cp、PPM缺陷率' },
    { id: 'zscore', icon: svgSearch, title: '异常检测', desc: 'Z-Score、IQR、EWMA' },
    { id: 'arima', icon: svgTrend, title: '趋势预测', desc: 'ARIMA、Mann-Kendall' },
    { id: 'mean-std', icon: svgMean, title: '基础统计', desc: '均值、标准差、正态分布' },
    { id: 'sliding-window', icon: svgLine, title: '滑动窗口', desc: '动态数据窗口' },
  ]

  return (
    <div className={s.page}>
      <FloatingToc items={floatingTocItems} />
      {/* Hero */}
      <div className={s.hero}>
        <div className={s.heroTitle}>液奶成品检验数据分析平台</div>
        <div className={s.heroSub}>专有名词解释 · 计算逻辑 · 公式推导</div>
        <div className={s.heroMeta}>
          <div><div className={s.heroMetaNum}>6</div><div className={s.heroMetaLbl}>名词分类</div></div>
          <div><div className={s.heroMetaNum}>20+</div><div className={s.heroMetaLbl}>专有名词</div></div>
          <div><div className={s.heroMetaNum}>15+</div><div className={s.heroMetaLbl}>可视化图表</div></div>
        </div>
      </div>

      {/* TOC Grid */}
      <div className={s.tocGrid}>
        {tocItems.map(t => (
          <a key={t.id} className={s.tocCard} href={`#${t.id}`}>
            <div style={{ width: 36, height: 36, borderRadius: 8, display: 'flex', alignItems: 'center', justifyContent: 'center', background: cyan, flexShrink: 0 }}>{t.icon}</div>
            <div><div className={s.tocCardTitle}>{t.title}</div><div className={s.tocCardDesc}>{t.desc}</div></div>
          </a>
        ))}
      </div>

      {/* ─── Section 1: SPC ─── */}
      <SectionCard id="spc" icon={svgBar} title="SPC（统计过程控制）" tag="SPC" tagClass={s.tagSpc}>
        <DefBox>
          <p><strong>SPC（Statistical Process Control）</strong>是一种利用统计方法对生产过程进行实时监控的质量管理技术。通过采集过程数据、绘制控制图、应用判异规则，判断过程是否处于"统计受控"状态。</p>
        </DefBox>
        <h3 className={s.h3}>核心思想</h3>
        <table className={s.table}>
          <thead><tr><th>变异类型</th><th>含义</th><th>示例</th><th>处理方式</th></tr></thead>
          <tbody>
            <tr><td><strong>普通原因变异</strong></td><td>过程固有的、随机的波动</td><td>仪器测量误差</td><td>无需干预</td></tr>
            <tr><td><strong>特殊原因变异</strong></td><td>非随机的、异常的波动</td><td>仪器校准偏移</td><td>立即排查</td></tr>
          </tbody>
        </table>
        <NoteBox>SPC 的目标不是消除所有变异，而是<strong>区分普通原因和特殊原因变异</strong>。</NoteBox>
      </SectionCard>

      {/* ─── Section 2: I-MR ─── */}
      <SectionCard id="imr-chart" icon={svgLine} title="I-MR 控制图（单值-移动极差图）" tag="SPC" tagClass={s.tagSpc}>
        <DefBox>
          <p><strong>I-MR 控制图</strong>用于单值数据，由两张子图组成：</p>
          <ul style={{ marginLeft: 20, marginTop: 8 }}>
            <li><strong>I 图</strong>：绘制每个单值数据点，监控过程均值</li>
            <li><strong>MR 图</strong>：绘制相邻数据点之差的绝对值，监控过程波动</li>
          </ul>
        </DefBox>
        <NoteBox>液奶检验数据通常是每个批次一个检测值，因此选用 I-MR 图。</NoteBox>
        <h3 className={s.h3}>I 图计算逻辑</h3>
        <FormulaBox>
          <p><strong>CL</strong> = x̄ = (1/n) × Σxᵢ</p>
          <p><strong>M̄R̄</strong> = (1/(n-1)) × Σ|xᵢ - xᵢ₋₁|</p>
          <p><strong>UCL</strong> = x̄ + 2.66 × M̄R̄</p>
          <p><strong>LCL</strong> = x̄ - 2.66 × M̄R̄</p>
        </FormulaBox>
        <WarnBox><strong>2.66 的来源</strong>：系数 2.66 = 3 / d₂，其中 d₂ = 1.128（n=2 时）。</WarnBox>
        <h3 className={s.h3}>MR 图计算逻辑</h3>
        <FormulaBox>
          <p><strong>CL</strong> = M̄R̄</p>
          <p><strong>UCL</strong> = 3.267 × M̄R̄</p>
          <p><strong>LCL</strong> = 0</p>
        </FormulaBox>
        <IMRChart />
      </SectionCard>

      {/* ─── Section 3: 控制限 ─── */}
      <SectionCard id="control-limits" icon={svgMean} title="控制限（UCL / LCL / CL）" tag="SPC" tagClass={s.tagSpc}>
        <DefBox><p>控制限是控制图上用于判断过程是否受控的统计边界线，由历史数据计算得出。</p></DefBox>
        <table className={s.table}>
          <thead><tr><th>符号</th><th>名称</th><th>含义</th><th>计算方式</th></tr></thead>
          <tbody>
            <tr><td><strong>CL</strong></td><td>中心线</td><td>过程均值</td><td>x̄</td></tr>
            <tr><td><strong>UCL</strong></td><td>控制上限</td><td>正常波动上边界</td><td>CL + 3σ̂</td></tr>
            <tr><td><strong>LCL</strong></td><td>控制下限</td><td>正常波动下边界</td><td>CL - 3σ̂</td></tr>
          </tbody>
        </table>
        <WarnBox><strong>控制限 vs 规格限</strong>：控制限是过程告诉你的（基于数据），规格限是标准告诉你的（基于要求）。</WarnBox>
      </SectionCard>

      {/* ─── Section 4: Nelson 规则 ─── */}
      <SectionCard id="nelson" icon={svgDoc} title="Nelson 规则（8 条判异规则）" tag="SPC" tagClass={s.tagSpc}>
        <DefBox><p><strong>Nelson 规则</strong>是 SPC 中判断控制图上数据点是否呈现异常模式的 8 条规则。</p></DefBox>
        <table className={s.table}>
          <thead><tr><th>规则</th><th>描述</th><th>严重程度</th></tr></thead>
          <tbody>
            <tr><td><strong>R1</strong></td><td>1 个点超出 3σ</td><td><span className={s.badgeCritical}>CRITICAL</span></td></tr>
            <tr><td><strong>R2</strong></td><td>连续 9 个点在中心线同侧</td><td><span className={s.badgeCritical}>CRITICAL</span></td></tr>
            <tr><td><strong>R3</strong></td><td>连续 6 个点持续递增或递减</td><td><span className={s.badgeWarning}>WARNING</span></td></tr>
            <tr><td><strong>R4</strong></td><td>连续 14 个点交替上下</td><td><span className={s.badgeWarning}>WARNING</span></td></tr>
            <tr><td><strong>R5</strong></td><td>连续 3 点中 2 点在 A 区（同侧）</td><td><span className={s.badgeWarning}>WARNING</span></td></tr>
            <tr><td><strong>R6</strong></td><td>连续 5 点中 4 点在 B 区（同侧）</td><td><span className={s.badgeWarning}>WARNING</span></td></tr>
            <tr><td><strong>R7</strong></td><td>连续 15 个点在 C 区</td><td><span className={s.badgeInfo}>INFO</span></td></tr>
            <tr><td><strong>R8</strong></td><td>连续 8 个点在 C 区以外</td><td><span className={s.badgeInfo}>INFO</span></td></tr>
          </tbody>
        </table>
        <NoteBox><strong>规则设计原理</strong>：在正态分布下，纯随机数据出现这些模式的概率极低（通常 &lt; 1%）。</NoteBox>
        <NelsonChart data={[3.90,3.92,3.88,3.91,3.89,3.93,4.15,3.90,3.88,3.91,3.92,3.89]} mean={3.90} sigma={0.05} redIdx={[6]} />
      </SectionCard>

      {/* ─── Section 5: 3σ ─── */}
      <SectionCard id="sigma" icon={svgSigma} title="3σ 原则（经验法则）" tag="SPC" tagClass={s.tagSpc}>
        <DefBox><p><strong>3σ 原则</strong>指出：对于近似正态分布的数据，99.73% 的数据值会落在均值 ± 3 个标准差范围内。</p></DefBox>
        <table className={s.table}>
          <thead><tr><th>范围</th><th>包含比例</th><th>排除概率</th></tr></thead>
          <tbody>
            <tr><td>μ ± 1σ</td><td>68.27%</td><td>31.73%</td></tr>
            <tr><td>μ ± 2σ</td><td>95.45%</td><td>4.55%</td></tr>
            <tr><td>μ ± 3σ</td><td>99.73%</td><td>0.27%</td></tr>
          </tbody>
        </table>
        <FormulaBox><p>P(μ - 3σ &lt; X &lt; μ + 3σ) ≈ 0.9973</p></FormulaBox>
        <SigmaChart />
      </SectionCard>

      {/* ─── Section 6: Cpk ─── */}
      <SectionCard id="cpk" icon={svgTarget} title="Cpk / Cp / Ppk（过程能力指数）" tag="过程能力" tagClass={s.tagCapability}>
        <DefBox><p>过程能力指数衡量过程产出合格品的能力，是 SPC 的核心评估指标。</p></DefBox>
        <h3 className={s.h3}>三大指数对比</h3>
        <table className={s.table}>
          <thead><tr><th>指数</th><th>含义</th><th>公式</th></tr></thead>
          <tbody>
            <tr><td><strong>Cp</strong></td><td>过程潜力（不考虑偏移）</td><td>(USL - LSL) / (6σ)</td></tr>
            <tr><td><strong>Cpk</strong></td><td>过程能力（考虑偏移）</td><td>min((USL-x̄)/3σ, (x̄-LSL)/3σ)</td></tr>
            <tr><td><strong>Ppk</strong></td><td>过程性能（整体变异）</td><td>类似 Cpk，用整体标准差</td></tr>
          </tbody>
        </table>
        <FormulaBox label="公式">
          <p><strong>Cp</strong> = (USL - LSL) / (6 × σ̂_within)</p>
          <p><strong>Cpk</strong> = min((USL - x̄) / (3σ̂), (x̄ - LSL) / (3σ̂))</p>
        </FormulaBox>
        <h3 className={s.h3}>Cpk 评级标准</h3>
        <div className={s.ratingBar}>
          <div className={s.ratingSeg} style={{ background: 'rgba(239,68,68,0.2)', color: '#ef4444' }}>&lt; 0.67 严重不足</div>
          <div className={s.ratingSeg} style={{ background: 'rgba(245,158,11,0.2)', color: '#f59e0b' }}>0.67~1.0 不足</div>
          <div className={s.ratingSeg} style={{ background: 'rgba(245,158,11,0.15)', color: '#f59e0b' }}>1.0~1.33 尚可</div>
          <div className={s.ratingSeg} style={{ background: 'rgba(16,185,129,0.15)', color: '#10b981' }}>1.33~1.67 良好</div>
          <div className={s.ratingSeg} style={{ background: 'rgba(16,185,129,0.2)', color: '#10b981' }}>&gt; 1.67 优秀</div>
        </div>
        <CpkGauge />
      </SectionCard>

      {/* ─── Section 7: PPM ─── */}
      <SectionCard id="ppm" icon={svgBar} title="PPM（百万分之缺陷率）" tag="过程能力" tagClass={s.tagCapability}>
        <DefBox><p><strong>PPM</strong>（Parts Per Million）表示每百万件产品中的不合格品数量。</p></DefBox>
        <FormulaBox label="公式">
          <p>PPM = (P(X &lt; LSL) + P(X &gt; USL)) × 1,000,000</p>
          <p>PPM ≈ 2 × (1 - Φ(3 × Cpk)) × 1,000,000</p>
        </FormulaBox>
        <table className={s.table}>
          <thead><tr><th>Cpk</th><th>PPM</th><th>合格率</th></tr></thead>
          <tbody>
            <tr><td>1.00</td><td>2,700</td><td>99.73%</td></tr>
            <tr><td>1.33</td><td>63</td><td>99.9937%</td></tr>
            <tr><td>1.67</td><td>0.57</td><td>99.99994%</td></tr>
            <tr><td>2.00</td><td>0.002</td><td>99.9999998%</td></tr>
          </tbody>
        </table>
      </SectionCard>

      {/* ─── Section 8: 规格限 ─── */}
      <SectionCard id="spec-limits" icon={svgSigma} title="规格限（USL / LSL / T）" tag="过程能力" tagClass={s.tagCapability}>
        <DefBox><p>规格限是产品标准设定的质量边界，与控制限（数据驱动）完全不同。</p></DefBox>
        <table className={s.table}>
          <thead><tr><th>符号</th><th>名称</th><th>含义</th></tr></thead>
          <tbody>
            <tr><td><strong>USL</strong></td><td>规格上限</td><td>允许的最大值</td></tr>
            <tr><td><strong>LSL</strong></td><td>规格下限</td><td>允许的最小值</td></tr>
            <tr><td><strong>T</strong></td><td>目标值</td><td>理想值 (USL+LSL)/2</td></tr>
          </tbody>
        </table>
      </SectionCard>

      {/* ─── Section 9: Z-Score ─── */}
      <SectionCard id="zscore" icon={svgSearch} title="Z-Score（标准分数）" tag="异常检测" tagClass={s.tagAnomaly}>
        <DefBox><p><strong>Z-Score</strong>表示一个数据点距离均值有多少个标准差。</p></DefBox>
        <FormulaBox><p>Z = (x - μ) / σ</p></FormulaBox>
        <table className={s.table}>
          <thead><tr><th>|Z| 范围</th><th>含义</th><th>颜色</th></tr></thead>
          <tbody>
            <tr><td>|Z| ≤ 2</td><td>正常</td><td style={{ color: '#2563eb' }}>蓝色</td></tr>
            <tr><td>2 &lt; |Z| ≤ 3</td><td>可疑</td><td style={{ color: '#d97706' }}>黄色</td></tr>
            <tr><td>|Z| &gt; 3</td><td>异常</td><td style={{ color: '#dc2626' }}>红色</td></tr>
          </tbody>
        </table>
        <ZScoreChart />
      </SectionCard>

      {/* ─── Section 10: IQR ─── */}
      <SectionCard id="iqr" icon={svgBar} title="IQR（四分位距）" tag="异常检测" tagClass={s.tagAnomaly}>
        <DefBox><p><strong>IQR</strong>（Interquartile Range）= Q3 - Q1，用于箱线图异常检测。</p></DefBox>
        <FormulaBox>
          <p>下界 = Q1 - 1.5 × IQR</p>
          <p>上界 = Q3 + 1.5 × IQR</p>
          <p>超出上下界的值判定为异常值</p>
        </FormulaBox>
        <IQRChart />
      </SectionCard>

      {/* ─── Section 11: EWMA ─── */}
      <SectionCard id="ewma" icon={svgLine} title="EWMA（指数加权移动平均）" tag="异常检测" tagClass={s.tagAnomaly}>
        <DefBox><p><strong>EWMA</strong>对小偏移比 Shewhart 控制图更敏感，通过指数衰减加权历史数据。</p></DefBox>
        <FormulaBox>
          <p>Z₀ = x̄</p>
          <p>Zᵢ = λ × xᵢ + (1 - λ) × Zᵢ₋₁</p>
          <p>UCL/LCL = x̄ ± 3σ × √(λ/(2-λ) × (1-(1-λ)²ⁱ))</p>
        </FormulaBox>
        <EWMAChart />
      </SectionCard>

      {/* ─── Section 12: ARIMA ─── */}
      <SectionCard id="arima" icon={svgTrend} title="ARIMA 模型" tag="趋势预测" tagClass={s.tagTrend}>
        <DefBox><p><strong>ARIMA(p,d,q)</strong>是经典的时间序列预测模型，由自回归(AR)、差分(I)、移动平均(MA)三部分组成。</p></DefBox>
        <table className={s.table}>
          <thead><tr><th>组件</th><th>含义</th><th>参数</th></tr></thead>
          <tbody>
            <tr><td><strong>AR(p)</strong></td><td>自回归</td><td>用过去 p 个值预测当前值</td></tr>
            <tr><td><strong>I(d)</strong></td><td>差分</td><td>差分 d 次使序列平稳</td></tr>
            <tr><td><strong>MA(q)</strong></td><td>移动平均</td><td>用过去 q 个误差项修正</td></tr>
          </tbody>
        </table>
        <ARIMAChart />
      </SectionCard>

      {/* ─── Section 13: Mann-Kendall ─── */}
      <SectionCard id="mann-kendall" icon={svgTrend} title="Mann-Kendall 趋势检验" tag="趋势预测" tagClass={s.tagTrend}>
        <DefBox><p><strong>Mann-Kendall</strong>是非参数趋势检验方法，不需要正态分布假设。</p></DefBox>
        <FormulaBox label="公式">
          <p>S = Σᵢ₌₁ⁿ⁻¹ Σⱼ₌ᵢ₊₁ⁿ sgn(xⱼ - xᵢ)</p>
          <p>Z = (S - 1) / √Var(S)　（S &gt; 0 时）</p>
          <p>Sen's 斜率: β = median[(xⱼ - xᵢ) / (j - i)]</p>
        </FormulaBox>
        <table className={s.table}>
          <thead><tr><th>|Z| 范围</th><th>显著性</th></tr></thead>
          <tbody>
            <tr><td>&gt; 2.576</td><td>99% 显著（α=0.01）</td></tr>
            <tr><td>&gt; 1.960</td><td>95% 显著（α=0.05）</td></tr>
            <tr><td>&gt; 1.645</td><td>90% 显著（α=0.10）</td></tr>
          </tbody>
        </table>
      </SectionCard>

      {/* ─── Section 14: 均值与标准差 ─── */}
      <SectionCard id="mean-std" icon={svgMean} title="均值与标准差" tag="基础统计" tagClass={s.tagStat}>
        <FormulaBox>
          <p><strong>总体均值</strong> μ = (1/N) × Σxᵢ</p>
          <p><strong>样本均值</strong> x̄ = (1/n) × Σxᵢ</p>
          <p><strong>总体标准差</strong> σ = √[(1/N) × Σ(xᵢ - μ)²]</p>
          <p><strong>样本标准差</strong> s = √[(1/(n-1)) × Σ(xᵢ - x̄)²]</p>
        </FormulaBox>
        <WarnBox>样本标准差用 n-1（贝塞尔校正），避免对总体标准差的低估。</WarnBox>
      </SectionCard>

      {/* ─── Section 15: 正态分布 ─── */}
      <SectionCard id="normal-dist" icon={svgSigma} title="正态分布（高斯分布）" tag="基础统计" tagClass={s.tagStat}>
        <DefBox><p>正态分布是连续概率分布，呈钟形曲线，由均值 μ 和标准差 σ 完全确定。</p></DefBox>
        <FormulaBox>
          <p>f(x) = (1/(σ√2π)) × exp(-(x-μ)²/(2σ²))</p>
        </FormulaBox>
      </SectionCard>

      {/* ─── Section 16: 置信区间 ─── */}
      <SectionCard id="confidence-interval" icon={svgSearch} title="置信区间（CI）" tag="基础统计" tagClass={s.tagStat}>
        <DefBox><p>置信区间给出了总体参数的估计范围。</p></DefBox>
        <FormulaBox>
          <p>CI = x̄ ± Z_(α/2) × (σ / √n)</p>
          <p>90% CI → Z = 1.645</p>
          <p>95% CI → Z = 1.96</p>
          <p>99% CI → Z = 2.576</p>
        </FormulaBox>
      </SectionCard>

      {/* ─── Section 17: 滑动窗口 ─── */}
      <SectionCard id="sliding-window" icon={svgLine} title="滑动窗口（Sliding Window）" tag="基础统计" tagClass={s.tagStat}>
        <DefBox><p>滑动窗口是 SPC 和趋势分析中常用的数据切片策略，只取最近 N 个数据点进行计算。</p></DefBox>
        <table className={s.table}>
          <thead><tr><th>场景</th><th>推荐窗口大小</th></tr></thead>
          <tbody>
            <tr><td>SPC 控制图</td><td>20~30</td></tr>
            <tr><td>趋势预测</td><td>30~50</td></tr>
            <tr><td>异常检测</td><td>50~100</td></tr>
          </tbody>
        </table>
      </SectionCard>

      {/* ─── Appendix: 术语速查表 ─── */}
      <SectionCard id="appendix" icon={svgDoc} title="附录：术语速查表">
        <table className={s.table}>
          <thead><tr><th>术语</th><th>英文</th><th>含义</th><th>所属领域</th></tr></thead>
          <tbody>
            <tr><td>SPC</td><td>Statistical Process Control</td><td>统计过程控制</td><td>质量控制</td></tr>
            <tr><td>UCL</td><td>Upper Control Limit</td><td>控制上限</td><td>SPC</td></tr>
            <tr><td>LCL</td><td>Lower Control Limit</td><td>控制下限</td><td>SPC</td></tr>
            <tr><td>CL</td><td>Center Line</td><td>中心线</td><td>SPC</td></tr>
            <tr><td>Cpk</td><td>Process Capability Index</td><td>过程能力指数</td><td>过程能力</td></tr>
            <tr><td>Cp</td><td>Process Capability</td><td>过程潜力指数</td><td>过程能力</td></tr>
            <tr><td>PPM</td><td>Parts Per Million</td><td>百万分之缺陷率</td><td>质量指标</td></tr>
            <tr><td>USL</td><td>Upper Spec Limit</td><td>规格上限</td><td>规格限</td></tr>
            <tr><td>LSL</td><td>Lower Spec Limit</td><td>规格下限</td><td>规格限</td></tr>
            <tr><td>EWMA</td><td>Exp. Weighted Moving Avg</td><td>指数加权移动平均</td><td>异常检测</td></tr>
            <tr><td>IQR</td><td>Interquartile Range</td><td>四分位距</td><td>异常检测</td></tr>
            <tr><td>ARIMA</td><td>AutoRegressive Integrated MA</td><td>自回归积分移动平均</td><td>预测</td></tr>
            <tr><td>MR</td><td>Moving Range</td><td>移动极差</td><td>SPC</td></tr>
            <tr><td>Nelson Rules</td><td>Nelson Rules</td><td>8条判异规则</td><td>SPC</td></tr>
          </tbody>
        </table>
      </SectionCard>
    </div>
  )
}

export default GlossaryPage
