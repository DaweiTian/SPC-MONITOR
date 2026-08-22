import React, { useMemo } from 'react'
import type { EChartsOption } from 'echarts'
import { useChart } from '../../components/Charts'
import { FloatingToc } from '../../components/FloatingToc'
import s from './Manual.module.css'

/* ─── Reusable bits (same as GlossaryPage) ─── */
const SectionCard: React.FC<{ id: string; icon: React.ReactNode; title: string; subtitle?: string; tag?: string; tagClass?: string; children: React.ReactNode }> =
  ({ id, icon, title, subtitle, tag, tagClass, children }) => (
    <section id={id}>
      <div className={s.card}>
        <div className={s.cardHeader}>
          <div className={s.cardHeaderIcon}>{icon}</div>
          <div>
            <span className={s.cardTitle}>{title}</span>
            {subtitle && <div style={{ fontSize: 12, color: 'var(--text-muted)', marginTop: 2 }}>{subtitle}</div>}
          </div>
          {tag && <span className={`${s.cardTag} ${tagClass ?? ''}`}>{tag}</span>}
        </div>
        {children}
      </div>
    </section>
  )

const DefBox: React.FC<{ children: React.ReactNode }> = ({ children }) => (
  <div className={s.defBox}>{children}</div>
)
const FormulaBox: React.FC<{ children: React.ReactNode }> = ({ children }) => (
  <div className={s.formulaBox}>{children}</div>
)
const NoteBox: React.FC<{ children: React.ReactNode }> = ({ children }) => <div className={s.noteBox}>{children}</div>

const ChartWrap: React.FC<{ title: string; height?: number; option: EChartsOption | null }> = ({ title, height = 300, option }) => {
  const { containerRef } = useChart(option)
  return (
    <div className={s.chartWrap}>
      <div className={s.chartTitle}>{title}</div>
      <div className={s.chartBody}><div ref={containerRef} style={{ height, width: '100%' }} /></div>
    </div>
  )
}

const Concept: React.FC<{ id: string; title: string; tag?: string; tagClass?: string; children: React.ReactNode }> = ({ id, title, tag, tagClass, children }) => (
  <div className={s.concept} id={id}>
    <div className={s.conceptTitle}>
      {tag && <span className={`${s.conceptTag} ${tagClass ?? ''}`}>{tag}</span>}
      {title}
    </div>
    <div className={s.conceptBody}>{children}</div>
  </div>
)

/* ─── Icons ─── */
const svgBar = <svg width="18" height="18" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2"><rect x="3" y="12" width="4" height="9"/><rect x="10" y="7" width="4" height="14"/><rect x="17" y="3" width="4" height="18"/></svg>
const svgLine = <svg width="18" height="18" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2"><polyline points="23 18 13.5 8.5 8.5 13.5 1 6"/><polyline points="17 18 23 18 23 12"/></svg>
const svgTarget = <svg width="18" height="18" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2"><circle cx="12" cy="12" r="10"/><circle cx="12" cy="12" r="6"/><circle cx="12" cy="12" r="2"/></svg>
const svgDoc = <svg width="18" height="18" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2"><path d="M16 4h2a2 2 0 0 1 2 2v14a2 2 0 0 1-2 2H6a2 2 0 0 1-2-2V6a2 2 0 0 1 2-2h2"/><rect x="8" y="2" width="8" height="4" rx="1"/></svg>
const svgSigma = <svg width="18" height="18" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2"><path d="M18 4H6l6 8-6 8h12"/></svg>
const svgSearch = <svg width="18" height="18" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2"><circle cx="11" cy="11" r="8"/><line x1="21" y1="21" x2="16.65" y2="16.65"/></svg>
const svgTrend = <svg width="18" height="18" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2"><polyline points="23 6 13.5 15.5 8.5 10.5 1 18"/><polyline points="17 6 23 6 23 12"/></svg>
const svgMean = <svg width="18" height="18" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2"><path d="M2 12h20"/><path d="M6 8v8"/><path d="M10 10v4"/><path d="M14 8v8"/><path d="M18 10v4"/></svg>
const svgWave = <svg width="18" height="18" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2"><path d="M2 12c2-3 4-3 6 0s4 3 6 0 4-3 6 0"/></svg>
const svgFlask = <svg width="18" height="18" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2"><path d="M9 3h6v6l5 8H4l5-8V3z"/></svg>

const cyan = 'rgba(0,212,255,0.12)'
const green = 'rgba(16,185,129,0.12)'
const red = 'rgba(239,68,68,0.15)'
const amber = 'rgba(245,158,11,0.15)'

/* ════════════════════ CHARTS ════════════════════ */

/* Chart: 标准差对比 */
const StdChart: React.FC = () => {
  const opt = useMemo<EChartsOption>(() => {
    const stable = Array.from({ length: 30 }, () => parseFloat((3.9 + (Math.random() - 0.5) * 0.1).toFixed(3)))
    const volatile = Array.from({ length: 30 }, () => parseFloat((3.9 + (Math.random() - 0.5) * 0.45).toFixed(3)))
    return {
      tooltip: { trigger: 'axis' },
      legend: { data: ['σ=0.05 (稳定)', 'σ=0.15 (波动大)'], bottom: 0, textStyle: { fontSize: 11 } },
      grid: { left: 50, right: 20, top: 20, bottom: 40 },
      xAxis: { type: 'category', data: Array.from({ length: 30 }, (_, i) => i + 1) },
      yAxis: { type: 'value', name: '脂肪(%)', min: 3.4, max: 4.4 },
      series: [
        { name: 'σ=0.05 (稳定)', type: 'line', data: stable, lineStyle: { width: 1.5 }, itemStyle: { color: '#2563eb' }, symbol: 'circle', symbolSize: 4 },
        { name: 'σ=0.15 (波动大)', type: 'line', data: volatile, lineStyle: { width: 1.5 }, itemStyle: { color: '#dc2626' }, symbol: 'circle', symbolSize: 4 },
      ],
    }
  }, [])
  return <ChartWrap title="不同标准差下的数据分布对比" height={280} option={opt} />
}

/* Chart: 正态分布钟形曲线 */
const NormalDistChart: React.FC = () => {
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
          { xAxis: mu + 3 * sigma, lineStyle: { color: '#dc2626', type: 'dashed' }, label: { formatter: 'μ+3σ', fontSize: 9, color: '#dc2626', position: 'end' } },
        ] },
        markArea: { silent: true, itemStyle: { color: 'rgba(22,163,74,0.08)' }, data: [[{ xAxis: mu - sigma }, { xAxis: mu + sigma }]] },
      }],
    }
  }, [])
  return <ChartWrap title="正态分布钟形曲线与概率区间" height={300} option={opt} />
}

/* Chart: 控制图分区示意 */
const ZoneChart: React.FC = () => {
  const opt = useMemo<EChartsOption>(() => {
    const mu = 3.9, sigma = 0.08
    const data = Array.from({ length: 30 }, (_, i) => parseFloat((mu + Math.sin(i * 0.5) * 0.04 + (Math.random() - 0.5) * 0.03).toFixed(4)))
    return {
      tooltip: { trigger: 'axis' },
      grid: { left: 50, right: 30, top: 20, bottom: 30 },
      xAxis: { type: 'category', data: data.map((_, i) => `#${i + 1}`), axisLabel: { fontSize: 9 } },
      yAxis: { type: 'value', name: '脂肪(%)', min: 3.6, max: 4.2 },
      series: [{
        type: 'line', data, symbol: 'circle', symbolSize: 5,
        lineStyle: { width: 1.5, color: '#334155' }, itemStyle: { color: '#334155' },
        markLine: { silent: true, symbol: 'none', data: [
          { yAxis: mu + 3 * sigma, lineStyle: { color: '#dc2626', type: 'dashed' }, label: { formatter: 'UCL', fontSize: 9, color: '#dc2626', position: 'end' } },
          { yAxis: mu + 2 * sigma, lineStyle: { color: '#d97706', type: 'dotted' }, label: { formatter: 'μ+2σ', fontSize: 9, color: '#d97706', position: 'end' } },
          { yAxis: mu + sigma, lineStyle: { color: '#16a34a', type: 'dotted' }, label: { formatter: 'μ+1σ', fontSize: 9, color: '#16a34a', position: 'end' } },
          { yAxis: mu, lineStyle: { color: '#0891b2', width: 1.5 }, label: { formatter: 'CL', fontSize: 10, color: '#0891b2', position: 'end' } },
          { yAxis: mu - sigma, lineStyle: { color: '#16a34a', type: 'dotted' }, label: { formatter: 'μ-1σ', fontSize: 9, color: '#16a34a', position: 'start' } },
          { yAxis: mu - 2 * sigma, lineStyle: { color: '#d97706', type: 'dotted' }, label: { formatter: 'μ-2σ', fontSize: 9, color: '#d97706', position: 'start' } },
          { yAxis: mu - 3 * sigma, lineStyle: { color: '#dc2626', type: 'dashed' }, label: { formatter: 'LCL', fontSize: 9, color: '#dc2626', position: 'start' } },
        ] },
        markArea: { silent: true, data: [
          [{ yAxis: mu - sigma, itemStyle: { color: 'rgba(22,163,74,0.08)' } }, { yAxis: mu + sigma }],
          [{ yAxis: mu - 2 * sigma, itemStyle: { color: 'rgba(217,119,6,0.06)' } }, { yAxis: mu - sigma }],
          [{ yAxis: mu + sigma, itemStyle: { color: 'rgba(217,119,6,0.06)' } }, { yAxis: mu + 2 * sigma }],
        ] },
      }],
    }
  }, [])
  return <ChartWrap title="控制图分区示意（A/B/C区）" height={300} option={opt} />
}

/* Chart: I-MR 完整示例 */
const IMRFullChart: React.FC = () => {
  const opt = useMemo<EChartsOption>(() => {
    const raw = Array.from({ length: 30 }, (_, i) => {
      if (i === 14) return 4.12
      if (i === 22) return 3.72
      return parseFloat((3.9 + Math.sin(i * 0.5) * 0.04 + (Math.random() - 0.5) * 0.03).toFixed(4))
    })
    const mr = raw.map((v, i) => i === 0 ? null : parseFloat(Math.abs(v - raw[i - 1]).toFixed(4)))
    const mrValid = mr.filter(v => v !== null) as number[]
    const mean = raw.reduce((a, b) => a + b, 0) / raw.length
    const mrMean = mrValid.reduce((a, b) => a + b, 0) / mrValid.length
    const ucl = mean + 2.66 * mrMean, lcl = mean - 2.66 * mrMean, mrUcl = 3.267 * mrMean
    return {
      tooltip: { trigger: 'axis' },
      grid: [{ left: 55, right: 25, top: 20, height: '40%' }, { left: 55, right: 25, top: '58%', height: '35%' }],
      xAxis: [{ type: 'category', gridIndex: 0, data: raw.map((_, i) => `#${i + 1}`), axisLabel: { show: false } }, { type: 'category', gridIndex: 1, data: raw.map((_, i) => `#${i + 1}`), axisLabel: { fontSize: 9 } }],
      yAxis: [{ type: 'value', gridIndex: 0, name: 'I图', min: 3.6, max: 4.2 }, { type: 'value', gridIndex: 1, name: 'MR图', min: 0, max: 0.25 }],
      series: [
        { name: 'I图', type: 'line', xAxisIndex: 0, yAxisIndex: 0, data: raw, symbol: 'circle', symbolSize: 5, lineStyle: { width: 1.5, color: '#334155' }, itemStyle: { color: (p: any) => (p.value > ucl || p.value < lcl) ? '#dc2626' : '#334155' }, markLine: { silent: true, symbol: 'none', data: [{ yAxis: ucl, lineStyle: { color: '#dc2626', type: 'dashed' }, label: { formatter: `UCL=${ucl.toFixed(3)}`, fontSize: 9 } }, { yAxis: mean, lineStyle: { color: '#0891b2' }, label: { formatter: `CL=${mean.toFixed(3)}`, fontSize: 9 } }, { yAxis: lcl, lineStyle: { color: '#dc2626', type: 'dashed' }, label: { formatter: `LCL=${lcl.toFixed(3)}`, fontSize: 9 } }] } },
        { name: 'MR图', type: 'line', xAxisIndex: 1, yAxisIndex: 1, data: mr, symbol: 'circle', symbolSize: 4, lineStyle: { width: 1.5, color: '#64748b' }, itemStyle: { color: '#64748b' }, markLine: { silent: true, symbol: 'none', data: [{ yAxis: mrUcl, lineStyle: { color: '#dc2626', type: 'dashed' }, label: { formatter: `UCL=${mrUcl.toFixed(3)}`, fontSize: 9 } }, { yAxis: mrMean, lineStyle: { color: '#0891b2' }, label: { formatter: `CL=${mrMean.toFixed(3)}`, fontSize: 9 } }] } },
      ],
    }
  }, [])
  return <ChartWrap title="I-MR 控制图完整示例（脂肪·30个检测点）" height={480} option={opt} />
}

/* Chart: Nelson 规则示例 */
const NelsonChart: React.FC<{ data: number[]; mean: number; sigma: number; redIdx?: number[]; yellowIdx?: number[] }> = ({ data, mean, sigma, redIdx = [], yellowIdx = [] }) => {
  const opt = useMemo<EChartsOption>(() => ({
    tooltip: { trigger: 'axis' },
    grid: { left: 50, right: 20, top: 10, bottom: 25 },
    xAxis: { type: 'category', data: data.map((_, i) => `#${i + 1}`), axisLabel: { fontSize: 8 } },
    yAxis: { type: 'value', min: mean - 4 * sigma, max: mean + 4 * sigma },
    series: [{
      type: 'line', data, symbol: 'circle', symbolSize: 5,
      lineStyle: { width: 1.5, color: '#334155' },
      itemStyle: { color: (p: any) => redIdx.includes(p.dataIndex) ? '#dc2626' : yellowIdx.includes(p.dataIndex) ? '#d97706' : '#334155' },
      markLine: { silent: true, symbol: 'none', data: [
        { yAxis: mean + 3 * sigma, lineStyle: { color: '#dc2626', type: 'dashed', width: 1 }, label: { formatter: 'UCL', fontSize: 9, color: '#dc2626' } },
        { yAxis: mean, lineStyle: { color: '#0891b2', width: 1 }, label: { formatter: 'CL', fontSize: 9, color: '#0891b2' } },
        { yAxis: mean - 3 * sigma, lineStyle: { color: '#dc2626', type: 'dashed', width: 1 }, label: { formatter: 'LCL', fontSize: 9, color: '#dc2626' } },
      ] },
    }],
  }), [data, mean, sigma, redIdx, yellowIdx])
  return <ChartWrap title="Nelson规则违规模式" height={200} option={opt} />
}

/* Chart: Cpk 仪表盘 */
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

/* Chart: Z-Score */
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

/* Chart: IQR 箱线图 */
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

/* Chart: EWMA */
const EWMAChart: React.FC = () => {
  const opt = useMemo<EChartsOption>(() => {
    const lambda = 0.15, mu0 = 3.9, sigma = 0.04
    const raw = Array.from({ length: 40 }, (_, i) => mu0 + (i >= 20 ? 0.02 * (i - 19) : 0) + (Math.random() - 0.5) * 0.08)
    const ewma: number[] = []; let prev = mu0
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

/* Chart: ARIMA */
const ARIMAChart: React.FC = () => {
  const opt = useMemo<EChartsOption>(() => {
    const hist = Array.from({ length: 40 }, (_, i) => parseFloat((3.9 + Math.sin(i * 0.3) * 0.05 + (Math.random() - 0.5) * 0.04).toFixed(4)))
    const pred = Array.from({ length: 10 }, (_, i) => parseFloat((3.9 + Math.sin((40 + i) * 0.3) * 0.05).toFixed(4)))
    const upper = pred.map((v, i) => parseFloat((v + 0.03 + 0.005 * i).toFixed(4)))
    return {
      tooltip: { trigger: 'axis' },
      legend: { data: ['历史数据', '预测值', '95%置信区间'], bottom: 0, textStyle: { fontSize: 10 } },
      grid: { left: 50, right: 25, top: 20, bottom: 40 },
      xAxis: { type: 'category', data: [...hist.map((_, i) => `T${i + 1}`), ...pred.map((_, i) => `F${i + 1}`)], axisLabel: { fontSize: 8 } },
      yAxis: { type: 'value', name: '脂肪(%)', min: 3.7, max: 4.1 },
      series: [
        { name: '历史数据', type: 'line', data: [...hist, ...Array(10).fill(null)], symbol: 'circle', symbolSize: 4, lineStyle: { width: 1.5, color: '#2563eb' }, itemStyle: { color: '#2563eb' } },
        { name: '95%置信区间', type: 'line', data: [...Array(40).fill(null), ...upper], symbol: 'none', lineStyle: { width: 0 }, areaStyle: { color: 'rgba(37,99,235,0.1)' }, stack: 'ci' },
        { name: '预测值', type: 'line', data: [...Array(40).fill(null), ...pred], symbol: 'diamond', symbolSize: 6, lineStyle: { width: 2, color: '#dc2626', type: 'dashed' }, itemStyle: { color: '#dc2626' } },
      ],
    }
  }, [])
  return <ChartWrap title="ARIMA 预测示例" height={300} option={opt} />
}

/* ════════════════════ MAIN COMPONENT ════════════════════ */
export const VisualGuidePage: React.FC = () => {
  const floatingTocItems = [
    { id: 'stats', title: '统计学基础' },
    { id: 'normal', title: '正态分布与3σ' },
    { id: 'spc', title: 'SPC 统计过程控制' },
    { id: 'imr', title: 'I-MR 控制图' },
    { id: 'nelson', title: 'Nelson 8条规则' },
    { id: 'cpk', title: 'Cpk / Cp' },
    { id: 'zscore', title: 'Z-Score' },
    { id: 'iqr', title: 'IQR 四分位距' },
    { id: 'ewma', title: 'EWMA' },
    { id: 'arima', title: 'ARIMA 模型' },
    { id: 'mk', title: 'Mann-Kendall' },
    { id: 'compliance', title: '3σ合规判定' },
    { id: 'products', title: '液奶指标体系' },
  ]

  return (
    <div className={s.page}>
      <FloatingToc items={floatingTocItems} />
      {/* Hero */}
      <div className={s.hero}>
        <div className={s.heroTitle}>📊 数据分析专有名词可视化手册</div>
        <div className={s.heroSub}>用图表理解每一个统计概念</div>
      </div>

      {/* ─── 统计学基础 ─── */}
      <SectionCard id="stats" icon={svgMean} title="统计学基础概念" subtitle="所有数据分析方法的底层基石" tag="统计" tagClass={s.tagStat}>
        <Concept id="mean" title="均值（Mean / μ）" tag="统计" tagClass={s.tagStat}>
          <p>所有数据点的算术平均值，是最常用的集中趋势度量。</p>
          <FormulaBox><p>μ = (1/N) × Σxᵢ</p></FormulaBox>
        </Concept>
        <Concept id="std" title="标准差（Standard Deviation / σ）" tag="统计" tagClass={s.tagStat}>
          <p>衡量数据分散程度，σ 越大数据越分散。</p>
          <StdChart />
        </Concept>
        <Concept id="median" title="中位数（Median）" tag="统计" tagClass={s.tagStat}>
          <p>将数据排序后位于正中间的值，不受极端值影响。</p>
        </Concept>
        <Concept id="quartile" title="四分位数（Q1 / Q2 / Q3）" tag="统计" tagClass={s.tagStat}>
          <p>将数据四等分的三个值。Q2 即中位数。</p>
          <FormulaBox><p>IQR = Q3 - Q1（四分位距）</p></FormulaBox>
        </Concept>
      </SectionCard>

      {/* ─── 正态分布 ─── */}
      <SectionCard id="normal" icon={svgSigma} title="正态分布与3σ原则" subtitle="SPC与过程能力的理论根基" tag="统计" tagClass={s.tagStat}>
        <Concept id="normal-dist" title="正态分布（Normal Distribution）" tag="统计" tagClass={s.tagStat}>
          <p>连续概率分布，呈钟形曲线，由 μ 和 σ 完全确定。</p>
          <FormulaBox><p>f(x) = (1/(σ√2π)) × exp(-(x-μ)²/(2σ²))</p></FormulaBox>
          <NormalDistChart />
        </Concept>
        <Concept id="three-sigma" title="3σ原则（68-95-99.7法则）" tag="统计" tagClass={s.tagStat}>
          <p>99.73% 的数据落在 μ ± 3σ 范围内。</p>
          <table className={s.table}>
            <thead><tr><th>范围</th><th>包含比例</th></tr></thead>
            <tbody>
              <tr><td>μ ± 1σ</td><td>68.27%</td></tr>
              <tr><td>μ ± 2σ</td><td>95.45%</td></tr>
              <tr><td>μ ± 3σ</td><td>99.73%</td></tr>
            </tbody>
          </table>
        </Concept>
      </SectionCard>

      {/* ─── SPC ─── */}
      <SectionCard id="spc" icon={svgBar} title="SPC 统计过程控制" subtitle="用数据判断过程是否稳定" tag="SPC" tagClass={s.tagSpc}>
        <Concept id="spc-concept" title="SPC 核心概念" tag="SPC" tagClass={s.tagSpc}>
          <p>通过控制图监控过程，区分<strong>普通原因变异</strong>（随机波动）和<strong>特殊原因变异</strong>（异常波动）。</p>
        </Concept>
        <Concept id="control-limits" title="控制限（UCL / CL / LCL）" tag="SPC" tagClass={s.tagSpc}>
          <p>由历史数据计算的统计边界，不是规格限。</p>
          <FormulaBox>
            <p>UCL = CL + 3σ̂　　CL = x̄　　LCL = CL - 3σ̂</p>
          </FormulaBox>
          <ZoneChart />
        </Concept>
      </SectionCard>

      {/* ─── I-MR 控制图 ─── */}
      <SectionCard id="imr" icon={svgLine} title="I-MR 控制图" subtitle="Individuals & Moving Range Chart" tag="SPC" tagClass={s.tagSpc}>
        <Concept id="imr-overview" title="I-MR 控制图" tag="SPC" tagClass={s.tagSpc}>
          <p>由 <strong>I 图</strong>（单值图）和 <strong>MR 图</strong>（移动极差图）组成，适用于每次只取一个观测值的场景。</p>
          <FormulaBox>
            <p><strong>I 图</strong>: UCL = x̄ + 2.66 × M̄R̄　　LCL = x̄ - 2.66 × M̄R̄</p>
            <p><strong>MR 图</strong>: UCL = 3.267 × M̄R̄　　LCL = 0</p>
          </FormulaBox>
          <IMRFullChart />
        </Concept>
      </SectionCard>

      {/* ─── Nelson 规则 ─── */}
      <SectionCard id="nelson" icon={svgDoc} title="Nelson 8条规则" subtitle="识别控制图上的8种异常模式" tag="SPC" tagClass={s.tagSpc}>
        {[
          { id: 'r1', title: '规则1：1个点超出3σ控制限', data: [3.90,3.92,3.88,3.91,3.89,3.93,4.15,3.90,3.88,3.91,3.92,3.89], mean: 3.90, sigma: 0.05, red: [6], yellow: [] as number[] },
          { id: 'r2', title: '规则2：连续9个点在中心线同侧', data: [3.90,3.92,3.88,3.91,3.89,3.85,3.84,3.83,3.86,3.82,3.84,3.85,3.83,3.86,3.84], mean: 3.90, sigma: 0.05, red: [5,6,7,8,9,10,11,12,13], yellow: [] as number[] },
          { id: 'r3', title: '规则3：连续6个点持续递增', data: [3.88,3.90,3.85,3.87,3.89,3.91,3.93,3.95,3.97,3.99,4.01,3.88,3.90], mean: 3.92, sigma: 0.05, red: [] as number[], yellow: [4,5,6,7,8,9] },
          { id: 'r4', title: '规则4：连续14个点交替上下', data: [3.96,3.84,3.95,3.85,3.94,3.86,3.93,3.87,3.92,3.88,3.91,3.89,3.90,3.88,3.91], mean: 3.90, sigma: 0.05, red: [] as number[], yellow: [] as number[] },
        ].map(r => (
          <Concept key={r.id} id={r.id} title={r.title} tag="SPC" tagClass={s.tagSpc}>
            <NelsonChart data={r.data} mean={r.mean} sigma={r.sigma} redIdx={r.red} yellowIdx={r.yellow} />
          </Concept>
        ))}
      </SectionCard>

      {/* ─── Cpk ─── */}
      <SectionCard id="cpk" icon={svgTarget} title="Cpk / Cp 过程能力指数" subtitle="过程能否稳定产出合格品？" tag="过程能力" tagClass={s.tagCapability}>
        <Concept id="cp" title="Cp（过程能力指数）" tag="能力" tagClass={s.tagCapability}>
          <p>衡量过程的潜在能力（不考虑偏移）。</p>
          <FormulaBox><p>Cp = (USL - LSL) / (6σ̂)</p></FormulaBox>
        </Concept>
        <Concept id="cpk" title="Cpk（过程能力指数，考虑偏移）" tag="能力" tagClass={s.tagCapability}>
          <p>同时考虑过程的离散程度和中心偏移。</p>
          <FormulaBox><p>Cpk = min((USL - x̄)/(3σ̂), (x̄ - LSL)/(3σ̂))</p></FormulaBox>
          <CpkGauge />
        </Concept>
      </SectionCard>

      {/* ─── Z-Score ─── */}
      <SectionCard id="zscore" icon={svgSearch} title="Z-Score 标准分数检验" subtitle="用标准差倍数衡量异常程度" tag="异常检测" tagClass={s.tagAnomaly}>
        <Concept id="zscore-concept" title="Z-Score" tag="异常" tagClass={s.tagAnomaly}>
          <p>Z = (x - μ) / σ，|Z| &gt; 2 为可疑，|Z| &gt; 3 为异常。</p>
          <ZScoreChart />
        </Concept>
      </SectionCard>

      {/* ─── IQR ─── */}
      <SectionCard id="iqr" icon={svgBar} title="IQR 四分位距法" subtitle="箱线图异常检测原理" tag="异常检测" tagClass={s.tagAnomaly}>
        <Concept id="iqr-concept" title="IQR" tag="异常" tagClass={s.tagAnomaly}>
          <p>IQR = Q3 - Q1，超出 Q1-1.5×IQR 或 Q3+1.5×IQR 的值为异常值。</p>
          <IQRChart />
        </Concept>
      </SectionCard>

      {/* ─── EWMA ─── */}
      <SectionCard id="ewma" icon={svgLine} title="EWMA 指数加权移动平均" subtitle="对小偏移敏感的异常监控" tag="异常检测" tagClass={s.tagAnomaly}>
        <Concept id="ewma-concept" title="EWMA" tag="异常" tagClass={s.tagAnomaly}>
          <p>通过指数衰减加权历史数据，对小偏移比 Shewhart 图更敏感。</p>
          <FormulaBox><p>Zᵢ = λ × xᵢ + (1-λ) × Zᵢ₋₁</p></FormulaBox>
          <EWMAChart />
        </Concept>
      </SectionCard>

      {/* ─── ARIMA ─── */}
      <SectionCard id="arima" icon={svgTrend} title="ARIMA 模型" subtitle="时间序列预测" tag="趋势" tagClass={s.tagTrend}>
        <Concept id="arima-concept" title="ARIMA(p,d,q)" tag="趋势" tagClass={s.tagTrend}>
          <p>自回归(AR) + 差分(I) + 移动平均(MA)，经典时间序列预测模型。</p>
          <ARIMAChart />
        </Concept>
      </SectionCard>

      {/* ─── Mann-Kendall ─── */}
      <SectionCard id="mk" icon={svgTrend} title="Mann-Kendall 趋势检验" subtitle="非参数趋势检验" tag="趋势" tagClass={s.tagTrend}>
        <Concept id="mk-concept" title="Mann-Kendall 检验" tag="趋势" tagClass={s.tagTrend}>
          <p>不需要正态分布假设的非参数趋势检验方法。</p>
          <FormulaBox><p>S = Σᵢ₌₁ⁿ⁻¹ Σⱼ₌ᵢ₊₁ⁿ sgn(xⱼ - xᵢ)</p></FormulaBox>
        </Concept>
      </SectionCard>

      {/* ─── 合规判定 ─── */}
      <SectionCard id="compliance" icon={svgFlask} title="3σ合规判定" subtitle="基于规格限的产品合格性判定" tag="质量" tagClass={s.tagQuality}>
        <Concept id="compliance-rules" title="合规判定规则" tag="质量" tagClass={s.tagQuality}>
          <table className={s.table}>
            <thead><tr><th>检测值位置</th><th>判定</th></tr></thead>
            <tbody>
              <tr><td>LSL &lt; x &lt; USL 且在控制限内</td><td style={{ color: '#10b981' }}>合规</td></tr>
              <tr><td>超出控制限但在规格限内</td><td style={{ color: '#d97706' }}>关注</td></tr>
              <tr><td>超出规格限</td><td style={{ color: '#dc2626' }}>不合规</td></tr>
            </tbody>
          </table>
        </Concept>
      </SectionCard>

      {/* ─── 液奶指标体系 ─── */}
      <SectionCard id="products" icon={svgFlask} title="液奶关键指标体系" subtitle="FT120 仪器检测的8项核心指标" tag="质量" tagClass={s.tagQuality}>
        <table className={s.table}>
          <thead><tr><th>指标</th><th>英文</th><th>单位</th><th>典型范围</th></tr></thead>
          <tbody>
            <tr><td>蛋白质</td><td>Protein</td><td>%</td><td>2.8 ~ 3.6</td></tr>
            <tr><td>脂肪</td><td>Fat</td><td>%</td><td>3.0 ~ 5.0</td></tr>
            <tr><td>非脂乳固体</td><td>SNF</td><td>%</td><td>8.0 ~ 9.5</td></tr>
            <tr><td>乳糖</td><td>Lactose</td><td>%</td><td>4.4 ~ 5.2</td></tr>
            <tr><td>密度</td><td>Density</td><td>g/cm³</td><td>1.026 ~ 1.034</td></tr>
            <tr><td>酸度</td><td>Acidity</td><td>°T</td><td>12 ~ 18</td></tr>
            <tr><td>冰点</td><td>Freezing Pt</td><td>°C</td><td>-0.550 ~ -0.510</td></tr>
            <tr><td>水分</td><td>Moisture</td><td>%</td><td>85 ~ 89</td></tr>
          </tbody>
        </table>
      </SectionCard>
    </div>
  )
}

export default VisualGuidePage
