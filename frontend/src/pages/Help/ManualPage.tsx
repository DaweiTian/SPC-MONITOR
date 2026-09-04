import React, { useState, useEffect, useCallback, useMemo } from 'react'
import type { EChartsOption } from 'echarts'
import { useChart } from '../../components/Charts'
import s from './Manual.module.css'

/* ─── Reusable bits ─── */
const SectionCard: React.FC<{ id: string; icon: React.ReactNode; title: string; subtitle?: string; tag?: string; tagClass?: string; children: React.ReactNode }> =
  ({ id, icon, title, subtitle, tag, tagClass, children }) => (
    <section id={id}>
      <div className={s.card}>
        <div className={s.cardHeader}>
          <div className={s.cardHeaderIcon}>{icon}</div>
          <div>
            <span className={s.cardTitle}>{title}</span>
            {subtitle && <span className={s.cardSubtitle}>{subtitle}</span>}
          </div>
          {tag && <span className={`${s.cardTag} ${tagClass ?? ''}`}>{tag}</span>}
        </div>
        {children}
      </div>
    </section>
  )

const Concept: React.FC<{ id: string; title: string; tag?: string; tagClass?: string; children: React.ReactNode }> =
  ({ id, title, tag, tagClass, children }) => (
    <div id={id} className={s.concept}>
      <div className={s.conceptHead}>
        <span className={s.conceptTitle}>{title}</span>
        {tag && <span className={`${s.conceptTag} ${tagClass ?? ''}`}>{tag}</span>}
      </div>
      <div className={s.conceptBody}>{children}</div>
    </div>
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
  const { containerRef, chartClassName } = useChart(option)
  return (
    <div className={s.chartWrap}>
      <div className={s.chartTitle}>{title}</div>
      <div className={s.chartBody}><div ref={containerRef} className={chartClassName} style={{ height, width: '100%' }} /></div>
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
const svgFlask = <svg width="18" height="18" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2"><path d="M9 3h6v6l5 8H4l5-8V3z"/><line x1="9" y1="3" x2="15" y2="3" /></svg>
const svgGear = <svg width="18" height="18" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2"><circle cx="12" cy="12" r="3"/><path d="M19.4 15a1.65 1.65 0 0 0 .33 1.82l.06.06a2 2 0 1 1-2.83 2.83l-.06-.06a1.65 1.65 0 0 0-1.82-.33 1.65 1.65 0 0 0-1 1.51V21a2 2 0 0 1-4 0v-.09A1.65 1.65 0 0 0 9 19.4a1.65 1.65 0 0 0-1.82.33l-.06.06a2 2 0 1 1-2.83-2.83l.06-.06A1.65 1.65 0 0 0 4.68 15a1.65 1.65 0 0 0-1.51-1H3a2 2 0 0 1 0-4h.09A1.65 1.65 0 0 0 4.6 9a1.65 1.65 0 0 0-.33-1.82l-.06-.06a2 2 0 1 1 2.83-2.83l.06.06A1.65 1.65 0 0 0 9 4.68a1.65 1.65 0 0 0 1-1.51V3a2 2 0 0 1 4 0v.09a1.65 1.65 0 0 0 1 1.51 1.65 1.65 0 0 0 1.82-.33l.06-.06a2 2 0 1 1 2.83 2.83l-.06.06A1.65 1.65 0 0 0 19.4 9a1.65 1.65 0 0 0 1.51 1H21a2 2 0 0 1 0 4h-.09a1.65 1.65 0 0 0-1.51 1z"/></svg>
const svgLayers = <svg width="18" height="18" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2"><polygon points="12 2 2 7 12 12 22 7 12 2"/><polyline points="2 17 12 22 22 17"/><polyline points="2 12 12 17 22 12"/></svg>

/* ════════════════════ CHARTS ════════════════════ */

/* Chart: 均值标准差示意 — 带标准差带 */
const StdChart: React.FC = () => {
  const opt = useMemo<EChartsOption>(() => {
    const data = [3.82,3.85,3.88,3.90,3.92,3.95,3.98,4.00,3.97,3.93,3.89,3.86,3.91,3.94,3.96]
    const mu = data.reduce((a, b) => a + b, 0) / data.length
    const std = Math.sqrt(data.reduce((a, b) => a + (b - mu) ** 2, 0) / (data.length - 1))
    const labels = data.map((_, i) => `批次${i + 1}`)
    return {
      tooltip: { trigger: 'axis', backgroundColor: 'rgba(15,23,42,0.95)', borderColor: 'rgba(0,212,255,0.3)', textStyle: { color: '#e2e8f0', fontSize: 12 } },
      grid: { left: 55, right: 25, top: 30, bottom: 35 },
      xAxis: { type: 'category', data: labels, axisLabel: { fontSize: 9, color: '#64748b' }, axisLine: { lineStyle: { color: '#1e293b' } } },
      yAxis: { type: 'value', name: '脂肪 (g/100g)', nameTextStyle: { color: '#94a3b8', fontSize: 11 }, min: 3.70, max: 4.10, splitLine: { lineStyle: { color: 'rgba(30,41,59,0.6)' } }, axisLine: { show: false } },
      series: [
        { type: 'line', data, symbol: 'circle', symbolSize: 7, smooth: true,
          lineStyle: { color: '#3b82f6', width: 2.5, shadowColor: 'rgba(59,130,246,0.4)', shadowBlur: 8 },
          itemStyle: { color: '#3b82f6', borderColor: '#1e3a5f', borderWidth: 2 },
          areaStyle: { color: { type: 'linear', x: 0, y: 0, x2: 0, y2: 1, colorStops: [{ offset: 0, color: 'rgba(59,130,246,0.15)' }, { offset: 1, color: 'rgba(59,130,246,0)' }] } } },
        { type: 'line', data: Array(data.length).fill(mu), symbol: 'none',
          lineStyle: { color: '#f43f5e', type: [8, 4], width: 1.5 }, name: `μ = ${mu.toFixed(3)}`,
          label: { show: true, formatter: 'μ', position: 'insideTopRight', color: '#f43f5e', fontSize: 11, fontWeight: 700 } },
        { type: 'line', data: Array(data.length).fill(mu + std), symbol: 'none', lineStyle: { color: 'rgba(251,146,60,0.5)', type: 'dotted', width: 1 } },
        { type: 'line', data: Array(data.length).fill(mu - std), symbol: 'none', lineStyle: { color: 'rgba(251,146,60,0.5)', type: 'dotted', width: 1 } },
      ],
      graphic: [{ type: 'text', left: '70%', top: 15, style: { text: `σ = ${std.toFixed(4)}`, fill: '#94a3b8', fontSize: 11, fontWeight: 600 } }],
    }
  }, [])
  return <ChartWrap title="某批次脂肪含量均值与标准差示意（μ ± σ 范围标注）" height={240} option={opt} />
}

/* Chart: 正态分布 — 带68-95-99.7彩色分区 */
const NormalDistChart: React.FC = () => {
  const opt = useMemo<EChartsOption>(() => {
    const mu = 3.90, sigma = 0.08
    const points: [number, number][] = []
    for (let x = mu - 4 * sigma; x <= mu + 4 * sigma; x += sigma / 20) {
      const y = Math.exp(-0.5 * ((x - mu) / sigma) ** 2) / (sigma * Math.sqrt(2 * Math.PI))
      points.push([parseFloat(x.toFixed(4)), parseFloat(y.toFixed(4))])
    }
    return {
      tooltip: { trigger: 'axis', backgroundColor: 'rgba(15,23,42,0.95)', borderColor: 'rgba(0,212,255,0.3)', textStyle: { color: '#e2e8f0', fontSize: 12 } },
      grid: { left: 55, right: 25, top: 30, bottom: 35 },
      xAxis: { type: 'value', name: '脂肪 (g/100g)', nameTextStyle: { color: '#94a3b8' }, min: 3.55, max: 4.25, splitLine: { lineStyle: { color: 'rgba(30,41,59,0.6)' } } },
      yAxis: { type: 'value', show: false },
      series: [
        { type: 'line', data: points, symbol: 'none', smooth: true,
          lineStyle: { color: '#3b82f6', width: 2.5, shadowColor: 'rgba(59,130,246,0.5)', shadowBlur: 10 },
          areaStyle: { color: { type: 'linear', x: 0, y: 0, x2: 0, y2: 1, colorStops: [{ offset: 0, color: 'rgba(59,130,246,0.25)' }, { offset: 1, color: 'rgba(59,130,246,0.02)' }] } },
          markArea: {
            silent: true, itemStyle: { borderWidth: 0 },
            data: [
              [{ xAxis: mu - sigma, itemStyle: { color: 'rgba(16,185,129,0.15)' } }, { xAxis: mu + sigma }],
              [{ xAxis: mu - 2 * sigma, itemStyle: { color: 'rgba(59,130,246,0.08)' } }, { xAxis: mu - sigma }],
              [{ xAxis: mu + sigma, itemStyle: { color: 'rgba(59,130,246,0.08)' } }, { xAxis: mu + 2 * sigma }],
              [{ xAxis: mu - 3 * sigma, itemStyle: { color: 'rgba(245,158,11,0.06)' } }, { xAxis: mu - 2 * sigma }],
              [{ xAxis: mu + 2 * sigma, itemStyle: { color: 'rgba(245,158,11,0.06)' } }, { xAxis: mu + 3 * sigma }],
            ]
          },
          markLine: { silent: true, symbol: 'none', data: [
            { xAxis: mu, lineStyle: { color: '#f43f5e', width: 1.5, type: 'solid' }, label: { formatter: 'μ', position: 'insideEndTop', color: '#f43f5e', fontSize: 11, fontWeight: 700 } },
            { xAxis: mu + sigma, lineStyle: { color: '#10b981', width: 1, type: 'dashed' }, label: { formatter: '68.27%', position: 'insideEndTop', color: '#10b981', fontSize: 9 } },
            { xAxis: mu + 2 * sigma, lineStyle: { color: '#3b82f6', width: 1, type: 'dashed' }, label: { formatter: '95.45%', position: 'insideEndTop', color: '#3b82f6', fontSize: 9 } },
            { xAxis: mu + 3 * sigma, lineStyle: { color: '#f59e0b', width: 1, type: 'dashed' }, label: { formatter: '99.73%', position: 'insideEndTop', color: '#f59e0b', fontSize: 9 } },
          ] },
        },
      ],
    }
  }, [])
  return <ChartWrap title="正态分布曲线 — 68-95-99.7 法则可视化（脂肪含量示例）" height={260} option={opt} />
}

/* Chart: I-MR 示例 — 带异常点高亮与分区色带 */
const IMRChart: React.FC = () => {
  const opt = useMemo<EChartsOption>(() => {
    const raw = [3.90,3.92,3.88,3.91,3.89,3.93,4.15,3.90,3.88,3.91,3.92,3.89,
      3.87,3.90,3.72,3.93,3.91,3.88,3.90,3.92,3.89,3.91,4.05,3.88,3.90,3.92,3.89,3.91,3.90,3.88]
    const mu = raw.reduce((a, b) => a + b, 0) / raw.length
    const mr = raw.slice(1).map((v, i) => Math.abs(v - raw[i]))
    const mrBar = mr.reduce((a, b) => a + b, 0) / mr.length
    const ucl = mu + 2.66 * mrBar, lcl = mu - 2.66 * mrBar
    return {
      tooltip: { trigger: 'axis', backgroundColor: 'rgba(15,23,42,0.95)', borderColor: 'rgba(0,212,255,0.3)', textStyle: { color: '#e2e8f0', fontSize: 12 } },
      legend: { data: ['检测值', 'UCL', 'CL', 'LCL'], top: 5, right: 10, textStyle: { color: '#94a3b8', fontSize: 10 } },
      grid: { left: 55, right: 25, top: 40, bottom: 35 },
      xAxis: { type: 'category', data: raw.map((_, i) => `#${i + 1}`), axisLabel: { fontSize: 8, color: '#64748b' }, axisLine: { lineStyle: { color: '#1e293b' } } },
      yAxis: { type: 'value', name: '脂肪 (g/100g)', nameTextStyle: { color: '#94a3b8', fontSize: 11 }, min: 3.55, max: 4.30, splitLine: { lineStyle: { color: 'rgba(30,41,59,0.6)' } } },
      series: [
        { type: 'line', name: '检测值', data: raw, symbol: 'circle', symbolSize: 6, smooth: true,
          lineStyle: { color: '#3b82f6', width: 2 },
          itemStyle: { color: (p: any) => (p.value > ucl || p.value < lcl) ? '#ef4444' : '#3b82f6', borderColor: '#1e3a5f', borderWidth: 2 },
          markArea: { silent: true, data: [
            [{ yAxis: ucl, itemStyle: { color: 'rgba(239,68,68,0.05)' } }, { yAxis: ucl + 1 }],
            [{ yAxis: lcl - 1, itemStyle: { color: 'rgba(239,68,68,0.05)' } }, { yAxis: lcl }],
          ] } },
        { type: 'line', name: 'UCL', data: Array(raw.length).fill(ucl), symbol: 'none', lineStyle: { color: '#ef4444', type: [8, 4], width: 1.5 },
          label: { show: true, formatter: `UCL=${ucl.toFixed(3)}`, position: 'insideTopRight', color: '#ef4444', fontSize: 9 } },
        { type: 'line', name: 'CL', data: Array(raw.length).fill(mu), symbol: 'none', lineStyle: { color: '#06b6d4', width: 1.5 },
          label: { show: true, formatter: `CL=${mu.toFixed(3)}`, position: 'insideTopRight', color: '#06b6d4', fontSize: 9 } },
        { type: 'line', name: 'LCL', data: Array(raw.length).fill(lcl), symbol: 'none', lineStyle: { color: '#ef4444', type: [8, 4], width: 1.5 },
          label: { show: true, formatter: `LCL=${lcl.toFixed(3)}`, position: 'insideTopRight', color: '#ef4444', fontSize: 9 } },
      ],
    }
  }, [])
  return <ChartWrap title="I-MR 控制图 — 脂肪含量监控（异常点红色高亮）" height={320} option={opt} />
}

/* Chart: Nelson 规则示例 */
const NelsonChart: React.FC<{ data: number[]; mean: number; sigma: number; redIdx: number[]; yellowIdx: number[] }> = ({ data, mean, sigma, redIdx, yellowIdx }) => {
  const opt = useMemo<EChartsOption>(() => {
    const dataMin = Math.min(...data)
    const dataMax = Math.max(...data)
    const clampedMin = Math.min(mean - 4 * sigma, dataMin - sigma)
    const clampedMax = Math.max(mean + 4 * sigma, dataMax + sigma)
    return {
      tooltip: { trigger: 'axis', backgroundColor: 'rgba(15,23,42,0.95)', borderColor: 'rgba(0,212,255,0.3)', textStyle: { color: '#e2e8f0', fontSize: 12 } },
      grid: { left: 55, right: 25, top: 20, bottom: 30 },
      xAxis: { type: 'category', data: data.map((_, i) => `#${i + 1}`), axisLabel: { fontSize: 8, color: '#64748b' }, axisLine: { lineStyle: { color: '#1e293b' } } },
      yAxis: { type: 'value', min: clampedMin, max: clampedMax, splitLine: { lineStyle: { color: 'rgba(30,41,59,0.6)' } } },
      series: [
        { type: 'line', data, symbol: 'circle', symbolSize: 7, smooth: true, lineStyle: { color: '#3b82f6', width: 2 }, itemStyle: { color: '#3b82f6', borderColor: '#1e3a5f', borderWidth: 2 } },
        { type: 'scatter', data: data.map((v, i) => redIdx.includes(i) || yellowIdx.includes(i) ? v : null), symbolSize: 14,
          itemStyle: { color: (p: any) => { const i = p.dataIndex; return redIdx.includes(i) ? '#ef4444' : '#f59e0b' }, borderColor: '#fff', borderWidth: 1, shadowBlur: 6, shadowColor: 'rgba(0,0,0,0.3)' } },
        { type: 'line', data: Array(data.length).fill(mean + 3 * sigma), symbol: 'none', lineStyle: { color: '#ef4444', type: 'dashed', width: 1 } },
        { type: 'line', data: Array(data.length).fill(mean), symbol: 'none', lineStyle: { color: '#06b6d4', width: 1 } },
        { type: 'line', data: Array(data.length).fill(mean - 3 * sigma), symbol: 'none', lineStyle: { color: '#ef4444', type: 'dashed', width: 1 } },
      ],
    }
  }, [data, mean, sigma, redIdx, yellowIdx])
  return <ChartWrap title="" height={240} option={opt} />
}

/* Chart: 控制限分区图 */
const ZoneChart: React.FC = () => {
  const opt = useMemo<EChartsOption>(() => {
    const mu = 3.90, sigma = 0.05
    return {
      tooltip: { trigger: 'axis', backgroundColor: 'rgba(15,23,42,0.95)', borderColor: 'rgba(0,212,255,0.3)', textStyle: { color: '#e2e8f0', fontSize: 12 } },
      grid: { left: 70, right: 30, top: 20, bottom: 35 },
      xAxis: { type: 'value', name: '脂肪 (g/100g)', nameTextStyle: { color: '#94a3b8' }, min: 3.65, max: 4.20, splitLine: { lineStyle: { color: 'rgba(30,41,59,0.6)' } } },
      yAxis: { type: 'category', data: [''], show: false },
      series: [
        { type: 'bar', data: [[mu, mu + sigma]], barWidth: 50, name: 'C区 (μ~μ+σ)', itemStyle: { color: 'rgba(16,185,129,0.15)', borderColor: 'rgba(16,185,129,0.4)', borderWidth: 1 } },
        { type: 'bar', data: [[mu + sigma, mu + 2 * sigma]], barWidth: 50, name: 'B区 (μ+σ~μ+2σ)', itemStyle: { color: 'rgba(59,130,246,0.1)', borderColor: 'rgba(59,130,246,0.3)', borderWidth: 1 } },
        { type: 'bar', data: [[mu + 2 * sigma, mu + 3 * sigma]], barWidth: 50, name: 'A区 (μ+2σ~μ+3σ)', itemStyle: { color: 'rgba(245,158,11,0.1)', borderColor: 'rgba(245,158,11,0.3)', borderWidth: 1 } },
        { type: 'bar', data: [[mu - sigma, mu]], barWidth: 50, name: '', itemStyle: { color: 'rgba(16,185,129,0.15)', borderColor: 'rgba(16,185,129,0.4)', borderWidth: 1 } },
        { type: 'bar', data: [[mu - 2 * sigma, mu - sigma]], barWidth: 50, name: '', itemStyle: { color: 'rgba(59,130,246,0.1)', borderColor: 'rgba(59,130,246,0.3)', borderWidth: 1 } },
        { type: 'bar', data: [[mu - 3 * sigma, mu - 2 * sigma]], barWidth: 50, name: '', itemStyle: { color: 'rgba(245,158,11,0.1)', borderColor: 'rgba(245,158,11,0.3)', borderWidth: 1 } },
      ],
      graphic: [
        { type: 'text', left: 'center', top: '60%', style: { text: `CL = ${mu}`, fill: '#06b6d4', fontSize: 11, fontWeight: 700 } },
      ],
    }
  }, [])
  return <ChartWrap title="控制限分区示意（A/B/C 区域对称分布）" height={260} option={opt} />
}

/* Chart: Cpk 仪表盘 */
const CpkGauge: React.FC = () => {
  const opt = useMemo<EChartsOption>(() => ({
    series: [{
      type: 'gauge', min: 0, max: 2.5, splitNumber: 5,
      axisLine: { lineStyle: { width: 18, color: [[0.4, '#ef4444'], [0.53, '#f59e0b'], [0.67, '#3b82f6'], [0.8, '#06b6d4'], [1, '#10b981']] } },
      pointer: { width: 6, length: '65%', itemStyle: { color: '#e2e8f0', shadowColor: 'rgba(0,0,0,0.3)', shadowBlur: 5 } },
      axisTick: { show: true, distance: -18, length: 6, lineStyle: { color: '#64748b', width: 1 } },
      splitLine: { distance: -22, length: 14, lineStyle: { color: '#94a3b8', width: 1.5 } },
      axisLabel: { distance: -30, fontSize: 10, color: '#94a3b8', formatter: (v: number) => v.toFixed(1) },
      detail: { valueAnimation: true, formatter: 'Cpk = {value}', fontSize: 22, offsetCenter: [0, '87%'], color: '#10b981', fontWeight: 700 },
      title: { offsetCenter: [0, '110%'], fontSize: 12, color: '#64748b' },
      data: [{ value: 1.67, name: '脂肪含量' }],
    }],
  }), [])
  return <ChartWrap title="Cpk 仪表盘 — 过程能力一目了然" height={220} option={opt} />
}

/* Chart: Z-Score 散点 — 带分区色带 */
const ZScoreChart: React.FC = () => {
  const opt = useMemo<EChartsOption>(() => {
    const raw = [3.90,3.92,3.88,3.91,3.89,3.93,3.87,3.90,3.88,3.91,3.92,3.89,3.90,3.88,3.91,4.18,3.90,3.88,3.91,3.89,3.92,3.90,3.88,3.91,3.89,3.90,3.92,3.62,3.91,3.89,3.90,3.92,4.05,3.88,3.91,3.89,3.90,3.88,3.92,3.90]
    const mu = raw.reduce((a, b) => a + b, 0) / raw.length
    const std = Math.sqrt(raw.reduce((a, b) => a + (b - mu) ** 2, 0) / (raw.length - 1))
    const yMin = Math.floor((mu - 3.5 * std) * 10) / 10
    const yMax = Math.ceil((mu + 3.5 * std) * 10) / 10
    return {
      tooltip: { trigger: 'axis', backgroundColor: 'rgba(15,23,42,0.95)', borderColor: 'rgba(0,212,255,0.3)', textStyle: { color: '#e2e8f0', fontSize: 12 } },
      grid: { left: 60, right: 35, top: 35, bottom: 35 },
      xAxis: { type: 'category', data: raw.map((_, i) => `#${i + 1}`), axisLabel: { fontSize: 8, color: '#64748b' }, axisLine: { lineStyle: { color: '#1e293b' } } },
      yAxis: { type: 'value', name: '脂肪 (g/100g)', nameTextStyle: { color: '#94a3b8', fontSize: 11 }, min: yMin, max: yMax, splitLine: { lineStyle: { color: 'rgba(30,41,59,0.6)' } } },
      series: [{
        type: 'scatter', data: raw, symbolSize: 9,
        itemStyle: { color: (p: any) => { const z = Math.abs((p.value - mu) / std); return z > 3 ? '#ef4444' : z > 2 ? '#f59e0b' : '#3b82f6' }, borderColor: '#1e3a5f', borderWidth: 1.5, shadowBlur: 4, shadowColor: 'rgba(0,0,0,0.2)' },
        markArea: { silent: true, data: [
          [{ yAxis: mu - std, itemStyle: { color: 'rgba(16,185,129,0.06)' } }, { yAxis: mu + std }],
          [{ yAxis: mu - 2 * std, itemStyle: { color: 'rgba(59,130,246,0.04)' } }, { yAxis: mu - std }],
          [{ yAxis: mu + std, itemStyle: { color: 'rgba(59,130,246,0.04)' } }, { yAxis: mu + 2 * std }],
        ] },
        markLine: { silent: true, symbol: 'none', data: [
          { yAxis: mu + 3 * std, lineStyle: { color: '#ef4444', type: [8, 4], width: 2 }, label: { formatter: 'μ+3σ (Z=3)', fontSize: 10, color: '#ef4444', position: 'insideEndTop' } },
          { yAxis: mu + 2 * std, lineStyle: { color: '#f59e0b', type: 'dashed', width: 1 }, label: { formatter: 'μ+2σ', fontSize: 10, color: '#f59e0b', position: 'insideEndTop' } },
          { yAxis: mu, lineStyle: { color: '#06b6d4', width: 2 }, label: { formatter: 'μ (Z=0)', fontSize: 10, color: '#06b6d4', position: 'insideEndTop' } },
          { yAxis: mu - 2 * std, lineStyle: { color: '#f59e0b', type: 'dashed', width: 1 }, label: { formatter: 'μ-2σ', fontSize: 10, color: '#f59e0b', position: 'insideEndBottom' } },
          { yAxis: mu - 3 * std, lineStyle: { color: '#ef4444', type: [8, 4], width: 2 }, label: { formatter: 'μ-3σ (Z=-3)', fontSize: 10, color: '#ef4444', position: 'insideEndBottom' } },
        ] },
      }],
    }
  }, [])
  return <ChartWrap title="Z-Score 异常检测 — 脂肪含量散点图（红=异常 黄=可疑 蓝=正常）" height={360} option={opt} />
}

/* Chart: IQR 箱线图 */
const IQRChart: React.FC = () => {
  const opt = useMemo<EChartsOption>(() => ({
    tooltip: { trigger: 'item', backgroundColor: 'rgba(15,23,42,0.95)', borderColor: 'rgba(0,212,255,0.3)', textStyle: { color: '#e2e8f0', fontSize: 12 } },
    grid: { left: 70, right: 35, top: 20, bottom: 35 },
    xAxis: { type: 'value', name: '脂肪 (g/100g)', nameTextStyle: { color: '#94a3b8' }, min: 3.3, max: 4.6, splitLine: { lineStyle: { color: 'rgba(30,41,59,0.6)' } } },
    yAxis: { type: 'category', data: ['液奶脂肪含量'] },
    series: [
      { type: 'boxplot', data: [[3.72, 3.85, 3.93, 4.01, 4.15]], itemStyle: { color: 'rgba(59,130,246,0.15)', borderColor: '#3b82f6', borderWidth: 2 } },
      { type: 'scatter', data: [[4.35, 0], [3.45, 0], [4.28, 0]], symbolSize: 12,
        itemStyle: { color: '#ef4444', borderColor: '#fff', borderWidth: 1.5, shadowBlur: 6, shadowColor: 'rgba(239,68,68,0.5)' }, name: '异常值',
        label: { show: true, formatter: (p: any) => `${p.value[0]}`, position: 'right', color: '#ef4444', fontSize: 10 } },
    ],
  }), [])
  return <ChartWrap title="IQR 箱线图 — 脂肪含量异常值检测" height={160} option={opt} />
}

/* Chart: EWMA */
const EWMAChart: React.FC = () => {
  const opt = useMemo<EChartsOption>(() => {
    const lambda = 0.15, mu0 = 3.9, sigma = 0.04
    const raw = [3.91,3.89,3.92,3.88,3.90,3.93,3.87,3.91,3.89,3.92,3.88,3.90,3.91,3.89,3.88,3.93,3.91,3.89,3.92,3.90,
      3.93,3.95,3.94,3.96,3.97,3.95,3.98,3.96,3.99,3.97,4.00,3.98,4.01,3.99,4.02,4.00,4.03,4.01,4.04,4.02]
    const ewma: number[] = []; let prev = mu0
    for (const x of raw) { prev = lambda * x + (1 - lambda) * prev; ewma.push(parseFloat(prev.toFixed(4))) }
    const ucl = mu0 + 3 * sigma * Math.sqrt(lambda / (2 - lambda))
    const lcl = mu0 - 3 * sigma * Math.sqrt(lambda / (2 - lambda))
    return {
      tooltip: { trigger: 'axis', backgroundColor: 'rgba(15,23,42,0.95)', borderColor: 'rgba(0,212,255,0.3)', textStyle: { color: '#e2e8f0', fontSize: 12 } },
      legend: { data: ['EWMA', 'UCL', 'CL', 'LCL'], top: 5, right: 10, textStyle: { color: '#94a3b8', fontSize: 10 } },
      grid: { left: 55, right: 25, top: 40, bottom: 35 },
      xAxis: { type: 'category', data: raw.map((_, i) => `#${i + 1}`), axisLabel: { fontSize: 8, color: '#64748b' }, axisLine: { lineStyle: { color: '#1e293b' } } },
      yAxis: { type: 'value', name: 'EWMA', nameTextStyle: { color: '#94a3b8', fontSize: 11 }, min: 3.75, max: 4.15, splitLine: { lineStyle: { color: 'rgba(30,41,59,0.6)' } } },
      series: [
        { type: 'line', name: 'EWMA', data: ewma, symbol: 'none', smooth: true,
          lineStyle: { color: '#8b5cf6', width: 2.5, shadowColor: 'rgba(139,92,246,0.4)', shadowBlur: 8 },
          areaStyle: { color: { type: 'linear', x: 0, y: 0, x2: 0, y2: 1, colorStops: [{ offset: 0, color: 'rgba(139,92,246,0.15)' }, { offset: 1, color: 'rgba(139,92,246,0)' }] } } },
        { type: 'line', name: 'UCL', data: Array(raw.length).fill(ucl), symbol: 'none', lineStyle: { color: '#ef4444', type: [8, 4], width: 1.5 },
          label: { show: true, formatter: 'UCL', position: 'insideTopRight', color: '#ef4444', fontSize: 9 } },
        { type: 'line', name: 'CL', data: Array(raw.length).fill(mu0), symbol: 'none', lineStyle: { color: '#06b6d4', width: 1.5 } },
        { type: 'line', name: 'LCL', data: Array(raw.length).fill(lcl), symbol: 'none', lineStyle: { color: '#ef4444', type: [8, 4], width: 1.5 } },
      ],
    }
  }, [])
  return <ChartWrap title="EWMA 控制图 — 检测均值微小漂移（含量逐渐上升趋势）" height={320} option={opt} />
}

/* Chart: ARIMA */
const ARIMAChart: React.FC = () => {
  const opt = useMemo<EChartsOption>(() => {
    const hist = [3.90,3.92,3.88,3.91,3.89,3.93,3.87,3.90,3.88,3.91,3.92,3.89,3.90,3.88,3.91,3.89,3.92,3.90,3.88,3.91,3.89,3.90,3.92,3.88,3.91,3.89,3.90,3.88,3.92,3.91,3.89,3.90,3.88,3.91,3.92,3.89,3.90,3.88,3.91,3.89]
    const pred = [3.90,3.91,3.90,3.91,3.90,3.91,3.90,3.91,3.90,3.91]
    const upper = pred.map((v, i) => parseFloat((v + 0.05 + i * 0.008).toFixed(4)))
    const lower = pred.map((v, i) => parseFloat((v - 0.05 - i * 0.008).toFixed(4)))
    const allLabels = [...hist, ...pred].map((_, i) => i < hist.length ? `T${i + 1}` : `T+${i - hist.length + 1}`)
    return {
      tooltip: { trigger: 'axis', backgroundColor: 'rgba(15,23,42,0.95)', borderColor: 'rgba(0,212,255,0.3)', textStyle: { color: '#e2e8f0', fontSize: 12 } },
      legend: { data: ['历史数据', '预测值', '95%置信区间'], top: 5, right: 10, textStyle: { color: '#94a3b8', fontSize: 10 } },
      grid: { left: 55, right: 25, top: 40, bottom: 35 },
      xAxis: { type: 'category', data: allLabels, axisLabel: { fontSize: 8, color: '#64748b' }, axisLine: { lineStyle: { color: '#1e293b' } } },
      yAxis: { type: 'value', name: '脂肪 (g/100g)', nameTextStyle: { color: '#94a3b8', fontSize: 11 }, min: 3.65, max: 4.15, splitLine: { lineStyle: { color: 'rgba(30,41,59,0.6)' } } },
      series: [
        { name: '历史数据', type: 'line', data: [...hist, ...Array(10).fill(null)], symbol: 'circle', symbolSize: 4, smooth: true, lineStyle: { width: 2, color: '#3b82f6' }, itemStyle: { color: '#3b82f6' },
          areaStyle: { color: { type: 'linear', x: 0, y: 0, x2: 0, y2: 1, colorStops: [{ offset: 0, color: 'rgba(59,130,246,0.1)' }, { offset: 1, color: 'rgba(59,130,246,0)' }] } } },
        { name: '95%置信区间', type: 'line', data: [...Array(40).fill(null), ...upper], symbol: 'none', lineStyle: { width: 0 }, areaStyle: { color: 'rgba(139,92,246,0.12)' }, stack: 'ci' },
        { name: '', type: 'line', data: [...Array(40).fill(null), ...lower], symbol: 'none', lineStyle: { width: 0 }, areaStyle: { color: 'rgba(139,92,246,0.12)' }, stack: 'ci' },
        { name: '预测值', type: 'line', data: [...Array(40).fill(null), ...pred], symbol: 'diamond', symbolSize: 8, lineStyle: { width: 2.5, color: '#8b5cf6', type: [6, 3] }, itemStyle: { color: '#8b5cf6', borderColor: '#c4b5fd', borderWidth: 2 } },
      ],
    }
  }, [])
  return <ChartWrap title="ARIMA 预测 — 脂肪含量趋势预测与95%置信区间" height={300} option={opt} />
}

/* Chart: Mann-Kendall 趋势图 */
const MKChart: React.FC = () => {
  const opt = useMemo<EChartsOption>(() => {
    const data = [3.88,3.89,3.87,3.90,3.88,3.91,3.89,3.92,3.90,3.93,3.91,3.94,3.92,3.95,3.93,3.96,3.94,3.97,3.95,3.98,3.96,3.99,3.97,4.00,3.98,4.01,3.99,4.02,4.00,4.03]
    const trend = data.map((_, i) => parseFloat((3.87 + i * 0.0055).toFixed(4)))
    return {
      tooltip: { trigger: 'axis', backgroundColor: 'rgba(15,23,42,0.95)', borderColor: 'rgba(0,212,255,0.3)', textStyle: { color: '#e2e8f0', fontSize: 12 } },
      legend: { data: ['检测值', 'Mann-Kendall趋势线'], top: 5, right: 10, textStyle: { color: '#94a3b8', fontSize: 10 } },
      grid: { left: 55, right: 25, top: 40, bottom: 35 },
      xAxis: { type: 'category', data: data.map((_, i) => `T${i + 1}`), axisLabel: { fontSize: 8, color: '#64748b' }, axisLine: { lineStyle: { color: '#1e293b' } } },
      yAxis: { type: 'value', name: '脂肪 (g/100g)', nameTextStyle: { color: '#94a3b8', fontSize: 11 }, min: 3.82, max: 4.10, splitLine: { lineStyle: { color: 'rgba(30,41,59,0.6)' } } },
      series: [
        { type: 'line', name: '检测值', data, symbol: 'circle', symbolSize: 5, smooth: true, lineStyle: { color: '#3b82f6', width: 2 }, itemStyle: { color: '#3b82f6' },
          areaStyle: { color: { type: 'linear', x: 0, y: 0, x2: 0, y2: 1, colorStops: [{ offset: 0, color: 'rgba(59,130,246,0.1)' }, { offset: 1, color: 'rgba(59,130,246,0)' }] } } },
        { type: 'line', name: 'Mann-Kendall趋势线', data: trend, symbol: 'none', lineStyle: { color: '#f43f5e', width: 2.5, type: [8, 4] },
          label: { show: true, formatter: '↑ 显著上升趋势', position: 'insideTopRight', color: '#f43f5e', fontSize: 10 } },
      ],
    }
  }, [])
  return <ChartWrap title="Mann-Kendall 趋势检验 — 某指标长期上升趋势检测" height={260} option={opt} />
}

/* Chart: 滑动窗口示意 */
const SlidingWindowChart: React.FC = () => {
  const opt = useMemo<EChartsOption>(() => {
    const data = [3.90,3.92,3.88,3.91,3.89,3.93,3.87,3.90,3.88,3.91,3.92,3.89,3.90,3.88,3.91,3.89,3.92,3.90,3.88,3.91,3.89,3.90,3.92,3.88,3.91,3.89,3.90,3.88,3.92,3.91]
    const win = 10
    const rolling = data.map((_, i) => {
      if (i < win - 1) return null
      const slice = data.slice(i - win + 1, i + 1)
      return parseFloat((slice.reduce((a, b) => a + b, 0) / win).toFixed(4))
    })
    return {
      tooltip: { trigger: 'axis', backgroundColor: 'rgba(15,23,42,0.95)', borderColor: 'rgba(0,212,255,0.3)', textStyle: { color: '#e2e8f0', fontSize: 12 } },
      legend: { data: ['原始数据', `滑动均值 (N=${win})`], top: 5, right: 10, textStyle: { color: '#94a3b8', fontSize: 10 } },
      grid: { left: 55, right: 25, top: 40, bottom: 35 },
      xAxis: { type: 'category', data: data.map((_, i) => `#${i + 1}`), axisLabel: { fontSize: 8, color: '#64748b' }, axisLine: { lineStyle: { color: '#1e293b' } } },
      yAxis: { type: 'value', name: '脂肪 (g/100g)', nameTextStyle: { color: '#94a3b8', fontSize: 11 }, min: 3.82, max: 3.98, splitLine: { lineStyle: { color: 'rgba(30,41,59,0.6)' } } },
      series: [
        { type: 'line', name: '原始数据', data, symbol: 'circle', symbolSize: 4, lineStyle: { color: 'rgba(59,130,246,0.5)', width: 1 }, itemStyle: { color: 'rgba(59,130,246,0.5)' } },
        { type: 'line', name: `滑动均值 (N=${win})`, data: rolling, symbol: 'none', smooth: true,
          lineStyle: { color: '#10b981', width: 3, shadowColor: 'rgba(16,185,129,0.4)', shadowBlur: 8 },
          areaStyle: { color: { type: 'linear', x: 0, y: 0, x2: 0, y2: 1, colorStops: [{ offset: 0, color: 'rgba(16,185,129,0.12)' }, { offset: 1, color: 'rgba(16,185,129,0)' }] } } },
      ],
    }
  }, [])
  return <ChartWrap title="滑动窗口 — 窗口大小N=10的滚动均值平滑效果" height={260} option={opt} />
}

/* Chart: 合规判定示意 */
const ComplianceChart: React.FC = () => {
  const opt = useMemo<EChartsOption>(() => {
    const mu = 3.90, sigma = 0.05
    const lsl = 3.6, usl = 4.2
    const ucl = mu + 3 * sigma, lcl = mu - 3 * sigma
    const data = [3.90,3.92,3.88,3.91,3.89,3.93,3.87,3.90,3.88,3.91,4.18,3.89,3.90,3.88,3.91,3.89,3.92,3.90,3.88,3.91]
    return {
      tooltip: { trigger: 'axis', backgroundColor: 'rgba(15,23,42,0.95)', borderColor: 'rgba(0,212,255,0.3)', textStyle: { color: '#e2e8f0', fontSize: 12 } },
      legend: { data: ['检测值', 'USL', 'UCL', 'CL', 'LCL', 'LSL'], top: 5, right: 10, textStyle: { color: '#94a3b8', fontSize: 9 } },
      grid: { left: 55, right: 25, top: 40, bottom: 35 },
      xAxis: { type: 'category', data: data.map((_, i) => `#${i + 1}`), axisLabel: { fontSize: 8, color: '#64748b' }, axisLine: { lineStyle: { color: '#1e293b' } } },
      yAxis: { type: 'value', name: '脂肪 (g/100g)', nameTextStyle: { color: '#94a3b8', fontSize: 11 }, min: 3.5, max: 4.3, splitLine: { lineStyle: { color: 'rgba(30,41,59,0.6)' } } },
      series: [
        { type: 'line', name: '检测值', data, symbol: 'circle', symbolSize: 6, smooth: true, lineStyle: { color: '#3b82f6', width: 2 },
          itemStyle: { color: (p: any) => p.value > usl || p.value < lsl ? '#ef4444' : p.value > ucl || p.value < lcl ? '#f59e0b' : '#10b981', borderColor: '#1e3a5f', borderWidth: 2 } },
        { type: 'line', name: 'USL', data: Array(data.length).fill(usl), symbol: 'none', lineStyle: { color: '#ef4444', width: 2 }, label: { show: true, formatter: 'USL', position: 'insideTopRight', color: '#ef4444', fontSize: 10 } },
        { type: 'line', name: 'UCL', data: Array(data.length).fill(ucl), symbol: 'none', lineStyle: { color: '#f59e0b', type: [6, 3], width: 1.5 }, label: { show: true, formatter: 'UCL', position: 'insideTopRight', color: '#f59e0b', fontSize: 9 } },
        { type: 'line', name: 'CL', data: Array(data.length).fill(mu), symbol: 'none', lineStyle: { color: '#06b6d4', width: 1.5 } },
        { type: 'line', name: 'LCL', data: Array(data.length).fill(lcl), symbol: 'none', lineStyle: { color: '#f59e0b', type: [6, 3], width: 1.5 } },
        { type: 'line', name: 'LSL', data: Array(data.length).fill(lsl), symbol: 'none', lineStyle: { color: '#ef4444', width: 2 }, label: { show: true, formatter: 'LSL', position: 'insideTopRight', color: '#ef4444', fontSize: 10 } },
      ],
    }
  }, [])
  return <ChartWrap title="3σ合规判定 — 控制限与规格限关系示意" height={320} option={opt} />
}

/* Chart: 六西格玛 DMAIC 流程 */
const DMAICChart: React.FC = () => {
  const opt = useMemo<EChartsOption>(() => ({
    tooltip: { trigger: 'item', backgroundColor: 'rgba(15,23,42,0.95)', borderColor: 'rgba(0,212,255,0.3)', textStyle: { color: '#e2e8f0', fontSize: 12 } },
    grid: { left: 60, right: 30, top: 30, bottom: 30 },
    xAxis: { type: 'value', show: false, min: 0, max: 5 },
    yAxis: { type: 'category', data: ['DMAIC'], show: false },
    series: [{
      type: 'bar', data: [1], barWidth: 60, stack: 'a',
      itemStyle: { color: '#3b82f6', borderRadius: [6, 0, 0, 6] },
      label: { show: true, formatter: 'D\n定义', color: '#fff', fontSize: 11, fontWeight: 700 },
    }, {
      type: 'bar', data: [1], barWidth: 60, stack: 'a',
      itemStyle: { color: '#8b5cf6' },
      label: { show: true, formatter: 'M\n测量', color: '#fff', fontSize: 11, fontWeight: 700 },
    }, {
      type: 'bar', data: [1], barWidth: 60, stack: 'a',
      itemStyle: { color: '#06b6d4' },
      label: { show: true, formatter: 'A\n分析', color: '#fff', fontSize: 11, fontWeight: 700 },
    }, {
      type: 'bar', data: [1], barWidth: 60, stack: 'a',
      itemStyle: { color: '#10b981' },
      label: { show: true, formatter: 'I\n改进', color: '#fff', fontSize: 11, fontWeight: 700 },
    }, {
      type: 'bar', data: [1], barWidth: 60, stack: 'a',
      itemStyle: { color: '#f59e0b', borderRadius: [0, 6, 6, 0] },
      label: { show: true, formatter: 'C\n控制', color: '#fff', fontSize: 11, fontWeight: 700 },
    }],
  }), [])
  return <ChartWrap title="DMAIC 五阶段流程" height={100} option={opt} />
}

/* ════════════════════ MAIN COMPONENT ════════════════════ */
const tocItems = [
  { id: 'stats', title: '统计学基础' },
  { id: 'normal', title: '正态分布与3σ' },
  { id: 'spc', title: 'SPC 统计过程控制' },
  { id: 'imr', title: 'I-MR 控制图' },
  { id: 'nelson', title: 'Nelson 8条规则' },
  { id: 'cpk', title: 'Cpk / Cp / Ppk' },
  { id: 'ppm', title: 'PPM 缺陷率' },
  { id: 'spec-limits', title: '规格限' },
  { id: 'zscore', title: 'Z-Score' },
  { id: 'iqr', title: 'IQR 四分位距' },
  { id: 'ewma', title: 'EWMA' },
  { id: 'arima', title: 'ARIMA 模型' },
  { id: 'mk', title: 'Mann-Kendall' },
  { id: 'sixsigma', title: '六西格玛 DMAIC' },
  { id: 'confidence', title: '置信区间' },
  { id: 'sliding', title: '滑动窗口' },
  { id: 'compliance', title: '3σ合规判定' },
  { id: 'products', title: '液奶指标体系' },
  { id: 'cross-predict', title: '交叉预测' },
  { id: 'appendix', title: '术语速查表' },
]

export const ManualPage: React.FC = () => {
  const [activeId, setActiveId] = useState('')

  // Track which section is currently visible
  useEffect(() => {
    const observers: IntersectionObserver[] = []
    const visible = new Map<string, number>()
    const observer = new IntersectionObserver(
      (entries) => {
        entries.forEach(entry => {
          if (entry.isIntersecting) visible.set(entry.target.id, entry.intersectionRatio)
          else visible.delete(entry.target.id)
        })
        let bestId = ''
        let bestRatio = 0
        visible.forEach((ratio, id) => { if (ratio > bestRatio) { bestRatio = ratio; bestId = id } })
        if (bestId) setActiveId(bestId)
      },
      { threshold: [0, 0.25, 0.5], rootMargin: '-80px 0px -60% 0px' }
    )
    tocItems.forEach(({ id }) => { const el = document.getElementById(id); if (el) observer.observe(el) })
    observers.push(observer)
    return () => observers.forEach(o => o.disconnect())
  }, [])

  const handleNav = useCallback((id: string) => {
    document.getElementById(id)?.scrollIntoView({ behavior: 'smooth', block: 'start' })
  }, [])

  return (
    <div className={s.page}>
      {/* Fixed Left Sidebar */}
      <nav className={s.sidebar}>
        <div className={s.sidebarTitle}>目录</div>
        {tocItems.map(item => (
          <button
            key={item.id}
            className={`${s.sidebarItem} ${activeId === item.id ? s.sidebarItemActive : ''}`}
            onClick={() => handleNav(item.id)}
          >
            {item.title}
          </button>
        ))}
      </nav>

      {/* Scrollable Content */}
      <div className={s.content}>
        {/* Hero */}
        <div className={s.hero}>
        <div className={s.heroTitle}>液奶成品检验数据分析手册</div>
        <div className={s.heroSub}>专有名词 · 计算逻辑 · 可视化图解 · 乳品行业应用</div>
        <div className={s.heroMeta}>
          <div><div className={s.heroMetaNum}>8</div><div className={s.heroMetaLbl}>名词分类</div></div>
          <div><div className={s.heroMetaNum}>30+</div><div className={s.heroMetaLbl}>专有名词</div></div>
          <div><div className={s.heroMetaNum}>18+</div><div className={s.heroMetaLbl}>可视化图表</div></div>
        </div>
      </div>

      {/* ─── 统计学基础 ─── */}
      <SectionCard id="stats" icon={svgMean} title="统计学基础概念" subtitle="所有数据分析方法的底层基石" tag="统计" tagClass={s.tagStat}>
        <Concept id="mean" title="均值（Mean / μ）" tag="统计" tagClass={s.tagStat}>
          <DefBox>
            <p>所有数据点的<strong>算术平均值</strong>，是最常用的集中趋势度量。在乳品检验中，均值代表某段时间内某项指标的"中心水平"，例如某月脂肪含量的平均值。</p>
          </DefBox>
          <FormulaBox><p>μ = (1/N) × Σxᵢ &nbsp;&nbsp;（N 为样本数，xᵢ 为第 i 个检测值）</p></FormulaBox>
          <NoteBox><strong>乳品应用</strong>：对 FT120 连续采集的 30 批脂肪含量求均值，可快速判断当前脂肪水平是否偏离产品配方目标值（如 3.8 g/100g）。若均值偏离超过 0.1，需排查原料乳质量或标准化工序。</NoteBox>
          <StdChart />
        </Concept>
        <Concept id="std" title="标准差（Standard Deviation / σ）" tag="统计" tagClass={s.tagStat}>
          <DefBox>
            <p>衡量数据<strong>离散程度</strong>的统计量。σ 越大表示检测值越分散，过程波动越大；σ 越小表示数据越集中，过程越稳定。</p>
          </DefBox>
          <FormulaBox><p>σ = √[Σ(xᵢ - μ)² / (N-1)] &nbsp;&nbsp;（样本标准差，N-1 为自由度校正）</p></FormulaBox>
          <NoteBox><strong>乳品应用</strong>：脂肪含量标准差反映"均一化"工艺效果。好的均一化过程 σ &lt; 0.05 g/100g；若 σ &gt; 0.1，则提示均一化压力不足或原料乳脂肪含量波动过大。</NoteBox>
        </Concept>
        <Concept id="median" title="中位数（Median）" tag="统计" tagClass={s.tagStat}>
          <DefBox>
            <p>将数据排序后位于<strong>正中间</strong>的值。与均值不同，中位数不受极端异常值影响，是衡量"典型水平"的稳健统计量。</p>
          </DefBox>
          <NoteBox><strong>乳品应用</strong>：当某批次因仪器故障产生极端读数（如脂肪 = 0.01），均值会被拉偏，但中位数仍能反映真实质量水平。</NoteBox>
        </Concept>
        <Concept id="quartile" title="四分位数（Q1 / Q2 / Q3）" tag="统计" tagClass={s.tagStat}>
          <DefBox>
            <p>将数据<strong>四等分</strong>的三个值。Q2 即中位数；Q1（第 25 百分位）和 Q3（第 75 百分位）之间的范围包含了中间 50% 的数据。</p>
          </DefBox>
          <FormulaBox>
            <p>Q1 = 第 25 百分位数</p>
            <p>Q2 = 中位数（第 50 百分位数）</p>
            <p>Q3 = 第 75 百分位数</p>
            <p><strong>IQR</strong> = Q3 - Q1（四分位距，衡量中间 50% 数据的分散程度）</p>
          </FormulaBox>
        </Concept>
      </SectionCard>

      {/* ─── 正态分布与3σ ─── */}
      <SectionCard id="normal" icon={svgSigma} title="正态分布与3σ原则" subtitle="SPC与过程能力的理论根基" tag="统计" tagClass={s.tagStat}>
        <Concept id="normal-dist" title="正态分布（Normal Distribution）" tag="统计" tagClass={s.tagStat}>
          <DefBox>
            <p>最重要的连续概率分布，呈<strong>钟形对称曲线</strong>，由均值 μ 和标准差 σ 两个参数完全确定。大量自然现象（包括乳品检测数据）在排除系统性偏差后，通常近似服从正态分布。</p>
          </DefBox>
          <FormulaBox><p>f(x) = (1/(σ√2π)) × exp(-(x-μ)²/(2σ²))</p></FormulaBox>
          <WarnBox><strong>正态性假设</strong>：SPC 和过程能力分析的前提是数据近似正态。若数据严重偏态（如酸度、冰点），需先做 Box-Cox 变换或使用非参数方法（如 Mann-Kendall）。</WarnBox>
          <NormalDistChart />
        </Concept>
        <Concept id="three-sigma" title="3σ原则（68-95-99.7法则）" tag="统计" tagClass={s.tagStat}>
          <DefBox>
            <p>正态分布中，数据落在 μ ± kσ 范围内的概率由 k 决定，这是控制图"3σ"控制限的理论基础。</p>
          </DefBox>
          <table className={s.table}>
            <thead><tr><th>范围</th><th>包含比例</th><th>含义（以1000批为例）</th></tr></thead>
            <tbody>
              <tr><td>μ ± 1σ</td><td>68.27%</td><td>约 317 批超出此范围</td></tr>
              <tr><td>μ ± 2σ</td><td>95.45%</td><td>约 45 批超出此范围</td></tr>
              <tr><td>μ ± 3σ</td><td>99.73%</td><td>仅约 3 批超出此范围</td></tr>
            </tbody>
          </table>
          <NoteBox><strong>乳品应用</strong>：若脂肪均值 μ = 3.90、σ = 0.08，则 3σ 下限 = 3.66、上限 = 4.14。超出此范围的批次需触发特殊原因调查。</NoteBox>
        </Concept>
        <Concept id="confidence" title="置信区间（Confidence Interval）" tag="统计" tagClass={s.tagStat}>
          <DefBox>
            <p>在一定<strong>置信水平</strong>下，总体参数（如真实均值）可能落入的区间范围。置信区间越窄，估计越精确。</p>
          </DefBox>
          <FormulaBox><p>CI = x̄ ± Z_(α/2) × (σ/√n)</p></FormulaBox>
          <table className={s.table}>
            <thead><tr><th>置信水平</th><th>Z 值</th><th>含义</th></tr></thead>
            <tbody>
              <tr><td>90%</td><td>1.645</td><td>100 次抽样中约 90 次包含真值</td></tr>
              <tr><td>95%</td><td>1.960</td><td>最常用的置信水平</td></tr>
              <tr><td>99%</td><td>2.576</td><td>高置信要求时使用</td></tr>
            </tbody>
          </table>
          <NoteBox><strong>乳品应用</strong>：抽样 30 批检测脂肪均值 3.90，σ = 0.08，则 95% CI = 3.90 ± 1.96 × 0.08/√30 = [3.871, 3.929]。意味着真实均值有 95% 概率落在此区间。</NoteBox>
        </Concept>
      </SectionCard>

      {/* ─── SPC ─── */}
      <SectionCard id="spc" icon={svgBar} title="SPC 统计过程控制" subtitle="用数据判断过程是否稳定" tag="SPC" tagClass={s.tagSpc}>
        <DefBox>
          <p><strong>SPC（Statistical Process Control）</strong>起源于 1920 年代 Walter Shewhart 的开创性工作，是一种利用统计方法对生产过程进行实时监控的质量管理技术。通过采集过程数据、绘制控制图、应用判异规则，判断过程是否处于"统计受控"状态。</p>
        </DefBox>
        <h3 className={s.h3}>核心思想 — 两类变异</h3>
        <table className={s.table}>
          <thead><tr><th>变异类型</th><th>含义</th><th>乳品示例</th><th>处理方式</th></tr></thead>
          <tbody>
            <tr><td><strong>普通原因变异</strong><br/>(Common Cause)</td><td>过程固有的、随机的、不可避免的波动</td><td>FT120 仪器的测量精度波动（±0.02）</td><td>无需干预，属于过程固有噪声</td></tr>
            <tr><td><strong>特殊原因变异</strong><br/>(Special Cause)</td><td>非随机的、可识别的、可消除的异常波动</td><td>原料乳掺水导致脂肪骤降；仪器校准偏移</td><td>立即排查根因并消除</td></tr>
          </tbody>
        </table>
        <NoteBox>SPC 的目标不是消除所有变异，而是<strong>区分普通原因和特殊原因变异</strong>。对普通原因变异过度干预（"过度调整"）反而会增大过程波动——这是 Deming 博士的核心洞见。</NoteBox>
        <h3 className={s.h3}>控制图的基本结构</h3>
        <p>控制图由三条核心线组成：</p>
        <table className={s.table}>
          <thead><tr><th>线</th><th>计算方式</th><th>含义</th></tr></thead>
          <tbody>
            <tr><td><strong>CL</strong>（中心线）</td><td>x̄（均值）</td><td>过程的中心水平</td></tr>
            <tr><td><strong>UCL</strong>（上控制限）</td><td>CL + 3σ</td><td>过程自然波动的上限</td></tr>
            <tr><td><strong>LCL</strong>（下控制限）</td><td>CL - 3σ</td><td>过程自然波动的下限</td></tr>
          </tbody>
        </table>
        <WarnBox><strong>控制限 ≠ 规格限</strong>：控制限由过程数据计算得出，反映过程的固有变异；规格限由产品标准或客户要求设定。两者是完全独立的概念。</WarnBox>
      </SectionCard>

      {/* ─── I-MR 控制图 ─── */}
      <SectionCard id="imr" icon={svgLine} title="I-MR 控制图（单值-移动极差图）" subtitle="Individuals & Moving Range Chart" tag="SPC" tagClass={s.tagSpc}>
        <DefBox>
          <p><strong>I-MR 控制图</strong>是 Shewhart 控制图中最常用的类型之一，适用于<strong>每个子组只有一个观测值</strong>的场景，由两张子图组成：</p>
          <ul style={{ marginLeft: 20, marginTop: 8 }}>
            <li><strong>I 图（单值图）</strong>：绘制每个单值数据点，监控过程均值是否稳定</li>
            <li><strong>MR 图（移动极差图）</strong>：绘制相邻数据点之差的绝对值 |xᵢ - xᵢ₋₁|，监控过程波动性是否稳定</li>
          </ul>
        </DefBox>
        <NoteBox><strong>为什么液奶检验用 I-MR？</strong> 液奶生产线通常是连续流程，每个批次产出一个检测值（如脂肪 3.90 g/100g），无法像零件加工那样取子组均值。因此 I-MR 图是最合适的选择。</NoteBox>
        <h3 className={s.h3}>I 图计算逻辑</h3>
        <FormulaBox>
          <p><strong>CL</strong> = x̄ = (1/n) × Σxᵢ</p>
          <p><strong>M̄R</strong> = (1/(n-1)) × Σ|xᵢ - xᵢ₋₁|</p>
          <p><strong>UCL</strong> = x̄ + 2.66 × M̄R</p>
          <p><strong>LCL</strong> = x̄ - 2.66 × M̄R</p>
        </FormulaBox>
        <WarnBox><strong>2.66 的来源</strong>：系数 2.66 = 3 / d₂，其中 d₂ = 1.128（子组大小 n=2 时的常数，来自极差分布表）。它将移动极差转换为与标准差等价的控制限宽度。</WarnBox>
        <h3 className={s.h3}>MR 图计算逻辑</h3>
        <FormulaBox>
          <p><strong>CL</strong> = M̄R</p>
          <p><strong>UCL</strong> = 3.267 × M̄R &nbsp;&nbsp;（D₄ 系数，n=2 时）</p>
          <p><strong>LCL</strong> = 0 &nbsp;&nbsp;（极差不可能为负）</p>
        </FormulaBox>
        <IMRChart />
        <h3 className={s.h3}>控制限分区（A / B / C 区）</h3>
        <p>控制图以中心线为基准，上下各分三个区，用于后续 Nelson 规则的判异逻辑：</p>
        <table className={s.table}>
          <thead><tr><th>区域</th><th>范围</th><th>用途</th><th>Nelson 规则关联</th></tr></thead>
          <tbody>
            <tr><td><strong>C 区</strong></td><td>CL ± 1σ</td><td>正常波动区（68% 落在此）</td><td>规则 7（15 点在 C 区内）</td></tr>
            <tr><td><strong>B 区</strong></td><td>1σ ~ 2σ</td><td>关注区</td><td>规则 5（2/3 点在 B 区外）</td></tr>
            <tr><td><strong>A 区</strong></td><td>2σ ~ 3σ</td><td>警告区</td><td>规则 6（4/5 点在 A 区）</td></tr>
          </tbody>
        </table>
        <ZoneChart />
      </SectionCard>

      {/* ─── Nelson 规则 ─── */}
      <SectionCard id="nelson" icon={svgDoc} title="Nelson 8条规则（判异准则）" subtitle="识别控制图上的8种非随机模式" tag="SPC" tagClass={s.tagSpc}>
        <DefBox>
          <p><strong>Nelson 规则</strong>（又称 Western Electric 规则 / WECO 规则）由 Lloyd S. Nelson 于 1984 年在《Journal of Quality Technology》发表，是一套用于判断控制图上数据点是否出现"非随机模式"的判异准则。即使所有点都在控制限内，仍可能违反这些规则。</p>
        </DefBox>
        <NoteBox>本系统默认启用规则 1-5，规则 6-8 可在配置管理中手动开启。同时启用过多规则可能导致"误报"——对高能力过程（Cpk &gt; 2）尤其需谨慎。</NoteBox>
        <h3 className={s.h3}>规则详解与可视化</h3>
        {[
          { id: 'r1', title: '规则1：1个点超出 ±3σ 控制限', desc: '最基础的判异规则。单点超出控制限意味着出现极端异常，概率仅 0.27%。在乳品生产中，可能是原料乳掺假、设备故障或 FT120 仪器异常。', data: [3.90,3.92,3.88,3.91,3.89,3.93,4.15,3.90,3.88,3.91,3.92,3.89], mean: 3.90, sigma: 0.05, red: [6], yellow: [] as number[] },
          { id: 'r2', title: '规则2：连续9个点在中心线同侧', desc: '表明过程均值发生了偏移。在乳品中，可能是标准化工序的脂肪目标值设置偏移，或原料乳批次间差异导致的系统性偏差。', data: [3.90,3.92,3.88,3.91,3.89,3.85,3.84,3.83,3.86,3.82,3.84,3.85,3.83,3.86,3.84], mean: 3.90, sigma: 0.05, red: [5,6,7,8,9,10,11,12,13], yellow: [] as number[] },
          { id: 'r3', title: '规则3：连续6个点持续递增（或递减）', desc: '表明存在趋势性变化。在乳品中，可能是设备磨损导致均一化效果逐渐下降，或季节性原料乳成分变化（夏季脂肪偏低）。', data: [3.88,3.90,3.85,3.87,3.89,3.91,3.93,3.95,3.97,3.99,4.01,3.88,3.90], mean: 3.92, sigma: 0.05, red: [] as number[], yellow: [4,5,6,7,8,9] },
          { id: 'r4', title: '规则4：连续14个点交替上下波动', desc: '数据呈锯齿状交替，说明可能存在系统性的两个不同来源交替出现（如两台 FT120 交替使用，或两个班次操作差异）。', data: [3.96,3.84,3.95,3.85,3.94,3.86,3.93,3.87,3.92,3.88,3.91,3.89,3.90,3.88,3.91], mean: 3.90, sigma: 0.05, red: [] as number[], yellow: [] as number[] },
        ].map(r => (
          <Concept key={r.id} id={r.id} title={r.title} tag="SPC" tagClass={s.tagSpc}>
            <p style={{ marginBottom: 8 }}>{r.desc}</p>
            <NelsonChart data={r.data} mean={r.mean} sigma={r.sigma} redIdx={r.red} yellowIdx={r.yellow} />
          </Concept>
        ))}
      </SectionCard>

      {/* ─── Cpk ─── */}
      <SectionCard id="cpk" icon={svgTarget} title="Cpk / Cp / Ppk 过程能力指数" subtitle="过程能否稳定产出合格品？" tag="过程能力" tagClass={s.tagCapability}>
        <DefBox>
          <p><strong>过程能力</strong>回答一个核心问题：在当前过程状态下，产出合格品的概率有多高？Cp、Cpk、Ppk 是量化这一能力的标准化指标，源自 AIAG/SPC 手册和 ISO 22514 标准。</p>
        </DefBox>
        <Concept id="cp" title="Cp（过程精密度指数）" tag="能力" tagClass={s.tagCapability}>
          <p>衡量过程的<strong>潜在能力</strong>——假设过程完全居中时，规格宽度能容纳多少个 6σ。Cp 不考虑实际均值偏移。</p>
          <FormulaBox><p>Cp = (USL - LSL) / (6σ̂)</p></FormulaBox>
          <NoteBox><strong>乳品示例</strong>：脂肪规格 [3.0, 5.0]，σ̂ = 0.08，则 Cp = (5.0 - 3.0) / (6 × 0.08) = 4.17，说明规格宽度远大于过程波动，潜力充足。</NoteBox>
        </Concept>
        <Concept id="cpk" title="Cpk（过程能力指数，考虑偏移）" tag="能力" tagClass={s.tagCapability}>
          <p>同时考虑过程的<strong>离散程度</strong>和<strong>中心偏移</strong>。Cpk = Cp 时过程完全居中；Cpk &lt; Cp 表示均值偏离目标值。实际生产中 Cpk 总是 ≤ Cp。</p>
          <FormulaBox><p>Cpk = min[(USL - x̄)/(3σ̂), &nbsp;(x̄ - LSL)/(3σ̂)]</p></FormulaBox>
          <CpkGauge />
        </Concept>
        <Concept id="ppk" title="Ppk（过程性能指数）" tag="能力" tagClass={s.tagCapability}>
          <p>与 Cpk 公式类似，但使用<strong>总体标准差 σ</strong>（包含所有变异源，不只组内），而非组内标准差 σ̂。</p>
          <NoteBox><strong>Cpk vs Ppk</strong>：Cpk 基于组内变异（短期能力），Ppk 基于总体变异（长期性能）。若 Cpk ≈ Ppk，说明过程变异主要来自组内，过程一致；若 Ppk ≪ Cpk，说明存在显著的组间变异（如班次差异、原料批次差异）。</NoteBox>
        </Concept>
        <h3 className={s.h3}>能力等级判定</h3>
        <table className={s.table}>
          <thead><tr><th>Cpk 范围</th><th>等级</th><th>说明</th><th>乳品行业要求</th></tr></thead>
          <tbody>
            <tr><td>Cpk ≥ 1.67</td><td style={{ color: '#10b981' }}>优秀</td><td>过程能力充足，合格率 &gt; 99.99%</td><td>脂肪、蛋白质等关键指标应达到此水平</td></tr>
            <tr><td>1.33 ≤ Cpk &lt; 1.67</td><td style={{ color: '#0891b2' }}>良好</td><td>过程能力尚可，建议监控</td><td>非关键指标（如密度）可接受</td></tr>
            <tr><td>1.00 ≤ Cpk &lt; 1.33</td><td style={{ color: '#d97706' }}>临界</td><td>需要改进，存在不合格风险</td><td>需制定改进计划</td></tr>
            <tr><td>Cpk &lt; 1.00</td><td style={{ color: '#dc2626' }}>不足</td><td>过程能力差，不合格率高</td><td>必须立即采取纠正措施</td></tr>
          </tbody>
        </table>
      </SectionCard>

      {/* ─── PPM ─── */}
      <SectionCard id="ppm" icon={svgBar} title="PPM 缺陷率" subtitle="每百万件中的不合格品数" tag="过程能力" tagClass={s.tagCapability}>
        <DefBox>
          <p><strong>PPM（Parts Per Million）</strong>表示每百万件产品中的不合格品数量，是六西格玛管理中衡量过程质量水平的核心指标。PPM 与西格玛水平直接对应。</p>
        </DefBox>
        <FormulaBox>
          <p>PPM = P(x &lt; LSL 或 x &gt; USL) × 10⁶</p>
          <p>= 2 × Φ(-Cpk × 3) × 10⁶ &nbsp;&nbsp;（Φ 为标准正态分布函数）</p>
        </FormulaBox>
        <h3 className={s.h3}>西格玛水平与 PPM 对应表</h3>
        <table className={s.table}>
          <thead><tr><th>西格玛水平</th><th>PPM</th><th>合格率</th><th>乳品类比</th></tr></thead>
          <tbody>
            <tr><td>1σ</td><td>690,000</td><td>31.00%</td><td>不可接受——超过 2/3 不合格</td></tr>
            <tr><td>2σ</td><td>308,000</td><td>69.20%</td><td>不可接受——近 1/3 不合格</td></tr>
            <tr><td>3σ</td><td>2,700</td><td>99.73%</td><td>每 370 批约 1 批不合格</td></tr>
            <tr><td>4σ</td><td>63</td><td>99.9937%</td><td>乳品行业基本要求水平</td></tr>
            <tr><td>5σ</td><td>0.57</td><td>99.99994%</td><td>优秀水平</td></tr>
            <tr><td>6σ</td><td>0.002</td><td>99.9999998%</td><td>世界级水平（考虑1.5σ偏移后为3.4 PPM）</td></tr>
          </tbody>
        </table>
        <NoteBox><strong>六西格玛的 3.4 PPM</strong>：六西格玛理论假设长期过程中均值会有 ±1.5σ 偏移，因此名义 6σ 水平对应的长期缺陷率为 3.4 PPM，而非 0.002 PPM。</NoteBox>
      </SectionCard>

      {/* ─── 规格限 ─── */}
      <SectionCard id="spec-limits" icon={svgTarget} title="规格限（USL / LSL / Target）" subtitle="产品合格与否的判定标准" tag="过程能力" tagClass={s.tagCapability}>
        <DefBox>
          <p><strong>规格限</strong>是产品设计、国家标准或客户要求设定的质量边界。在乳品行业，规格限主要来自：</p>
          <ul style={{ marginLeft: 20, marginTop: 8 }}>
            <li><strong>国家标准</strong>：如 GB 19645（巴氏杀菌乳）要求蛋白质 ≥ 2.9 g/100g、脂肪 ≥ 3.1 g/100g</li>
            <li><strong>企业内控标准</strong>：通常比国标更严格，如脂肪目标值 3.8 ± 0.3 g/100g</li>
            <li><strong>客户要求</strong>：特定客户或渠道的质量协议</li>
          </ul>
        </DefBox>
        <table className={s.table}>
          <thead><tr><th>术语</th><th>含义</th><th>乳品示例</th></tr></thead>
          <tbody>
            <tr><td><strong>USL</strong>（上规格限）</td><td>允许的最大值</td><td>脂肪 ≤ 4.5 g/100g（防止脂肪过高影响口感）</td></tr>
            <tr><td><strong>LSL</strong>（下规格限）</td><td>允许的最小值</td><td>脂肪 ≥ 3.1 g/100g（GB 19645 巴氏杀菌乳要求）</td></tr>
            <tr><td><strong>Target</strong>（目标值）</td><td>期望达到的值</td><td>脂肪 = 3.8 g/100g（产品配方设计值）</td></tr>
            <tr><td><strong>UCL / LCL</strong>（控制限）</td><td>由数据计算的自然波动限</td><td>由 I-MR 图自动计算，反映过程固有变异</td></tr>
          </tbody>
        </table>
        <WarnBox><strong>控制限 vs 规格限 — 最易混淆的概念</strong>：控制限由数据计算（过程固有），规格限由需求设定（客户要求）。两者独立，不可混淆。一个过程可以完全"受控"（所有点在控制限内），但仍然不合格（均值偏离目标值，Cpk &lt; 1）。</WarnBox>
      </SectionCard>

      {/* ─── Z-Score ─── */}
      <SectionCard id="zscore" icon={svgSearch} title="Z-Score 标准分数检验" subtitle="用标准差倍数衡量异常程度" tag="异常检测" tagClass={s.tagAnomaly}>
        <DefBox>
          <p><strong>Z-Score（标准分数）</strong>表示一个数据点距离均值有多少个标准差。它是所有基于正态分布假设的异常检测方法的基础。Z-Score 是无量纲的，可用于不同指标间的横向比较。</p>
        </DefBox>
        <FormulaBox>
          <p>Z = (x - μ) / σ</p>
          <p>其中 x 为检测值，μ 为均值，σ 为标准差</p>
        </FormulaBox>
        <h3 className={s.h3}>判定规则</h3>
        <table className={s.table}>
          <thead><tr><th>|Z| 范围</th><th>判定</th><th>概率</th><th>乳品处理</th></tr></thead>
          <tbody>
            <tr><td>|Z| ≤ 1</td><td style={{ color: '#10b981' }}>正常</td><td>68.27%</td><td>正常记录，无需关注</td></tr>
            <tr><td>1 &lt; |Z| ≤ 2</td><td style={{ color: '#10b981' }}>正常</td><td>27.18%</td><td>正常记录，可关注趋势</td></tr>
            <tr><td>2 &lt; |Z| ≤ 3</td><td style={{ color: '#d97706' }}>可疑</td><td>4.28%</td><td>标记关注，观察后续批次</td></tr>
            <tr><td>|Z| &gt; 3</td><td style={{ color: '#dc2626' }}>异常</td><td>0.27%</td><td>触发异常报警，需立即排查</td></tr>
          </tbody>
        </table>
        <ZScoreChart />
      </SectionCard>

      {/* ─── IQR ─── */}
      <SectionCard id="iqr" icon={svgBar} title="IQR 四分位距法" subtitle="箱线图异常检测原理" tag="异常检测" tagClass={s.tagAnomaly}>
        <DefBox>
          <p><strong>IQR（Interquartile Range，四分位距）</strong>是 Q3 与 Q1 之差，代表中间 50% 数据的分散范围。IQR 方法不依赖正态分布假设，是一种<strong>稳健的异常检测方法</strong>，特别适合存在偏态或重尾分布的数据。</p>
        </DefBox>
        <FormulaBox>
          <p><strong>IQR</strong> = Q3 - Q1</p>
          <p><strong>温和异常值</strong>：x &lt; Q1 - 1.5×IQR &nbsp;或&nbsp; x &gt; Q3 + 1.5×IQR</p>
          <p><strong>极端异常值</strong>：x &lt; Q1 - 3.0×IQR &nbsp;或&nbsp; x &gt; Q3 + 3.0×IQR</p>
        </FormulaBox>
        <NoteBox><strong>乳品应用</strong>：相比 Z-Score，IQR 方法对极端值不敏感（因为 Q1/Q3 本身不受极端值影响）。适用于酸度、冰点等可能非正态分布的指标。</NoteBox>
        <IQRChart />
      </SectionCard>

      {/* ─── EWMA ─── */}
      <SectionCard id="ewma" icon={svgLine} title="EWMA 指数加权移动平均" subtitle="对小偏移敏感的异常监控" tag="异常检测" tagClass={s.tagAnomaly}>
        <DefBox>
          <p><strong>EWMA（Exponentially Weighted Moving Average）</strong>由 S.W. Roberts 于 1959 年提出，通过指数衰减加权历史数据，对过程均值的<strong>微小偏移</strong>比传统 Shewhart 控制图更敏感。当 λ=1 时退化为普通 I-MR 图。</p>
        </DefBox>
        <FormulaBox>
          <p>Zᵢ = λ × xᵢ + (1-λ) × Zᵢ₋₁ &nbsp;&nbsp;（λ ∈ (0,1]，Z₀ = μ₀）</p>
          <p><strong>UCL</strong> = μ₀ + L × σ × √(λ/(2-λ))</p>
          <p><strong>LCL</strong> = μ₀ - L × σ × √(λ/(2-λ))</p>
        </FormulaBox>
        <table className={s.table}>
          <thead><tr><th>λ 值</th><th>特性</th><th>适用场景</th></tr></thead>
          <tbody>
            <tr><td>0.05 ~ 0.10</td><td>非常平滑，对小偏移极其敏感</td><td>检测缓慢漂移（如季节性脂肪变化）</td></tr>
            <tr><td>0.15 ~ 0.25</td><td>平衡灵敏度与噪声</td><td>乳品日常监控推荐值</td></tr>
            <tr><td>0.40 ~ 1.00</td><td>接近原始数据，对大偏移敏感</td><td>检测突变（如设备故障）</td></tr>
          </tbody>
        </table>
        <NoteBox><strong>EWMA vs I-MR</strong>：EWMA 适合检测 0.5σ~1.5σ 的小偏移（如均一化效果缓慢下降），I-MR 更适合检测 3σ 以上的大偏移。两者互补使用效果最佳。</NoteBox>
        <EWMAChart />
      </SectionCard>

      {/* ─── ARIMA ─── */}
      <SectionCard id="arima" icon={svgTrend} title="ARIMA 模型" subtitle="自回归积分移动平均" tag="趋势" tagClass={s.tagTrend}>
        <DefBox>
          <p><strong>ARIMA(p,d,q)</strong>（Box-Jenkins 模型）是经典的时间序列预测模型，由统计学家 George Box 和 Gwilym Jenkins 于 1970 年代系统化。它假设未来值可以由历史值和历史误差的线性组合来预测。</p>
        </DefBox>
        <h3 className={s.h3}>三个组成部分</h3>
        <table className={s.table}>
          <thead><tr><th>分量</th><th>含义</th><th>参数</th><th>乳品示例</th></tr></thead>
          <tbody>
            <tr><td><strong>AR(p)</strong><br/>自回归</td><td>用过去 p 个值预测当前值</td><td>p = 阶数</td><td>今天的脂肪含量与昨天、前天相关</td></tr>
            <tr><td><strong>I(d)</strong><br/>差分</td><td>差分 d 次使序列平稳</td><td>d = 差分次数</td><td>去除季节性趋势（d=1 或 d=2）</td></tr>
            <tr><td><strong>MA(q)</strong><br/>移动平均</td><td>用过去 q 个误差修正预测</td><td>q = 阶数</td><td>随机冲击（如临时换班）的影响衰减</td></tr>
          </tbody>
        </table>
        <FormulaBox>
          <p>ARIMA(1,1,1): (1-φ₁B)(1-B)xₜ = (1+θ₁B)εₜ</p>
          <p>其中 B 为后移算子（Bxₜ = xₜ₋₁），φ₁ 为 AR 系数，θ₁ 为 MA 系数</p>
        </FormulaBox>
        <NoteBox><strong>乳品应用</strong>：用 ARIMA 预测未来 5-10 批的脂肪含量走势。若预测值持续低于 LSL，可提前调整标准化工艺参数，实现"预防性质量控制"。</NoteBox>
        <ARIMAChart />
      </SectionCard>

      {/* ─── Mann-Kendall ─── */}
      <SectionCard id="mk" icon={svgTrend} title="Mann-Kendall 趋势检验" subtitle="非参数趋势检验" tag="趋势" tagClass={s.tagTrend}>
        <DefBox>
          <p><strong>Mann-Kendall（MK）检验</strong>是一种<strong>非参数方法</strong>，用于检测时间序列中是否存在单调趋势（上升或下降）。其核心优势是<strong>不需要正态分布假设</strong>，对缺失值和异常值也具有稳健性，非常适合乳品现场的复杂数据环境。</p>
        </DefBox>
        <FormulaBox>
          <p><strong>统计量 S</strong> = Σᵢ₌₁ⁿ⁻¹ Σⱼ₌ᵢ₊₁ⁿ sgn(xⱼ - xᵢ)</p>
          <p>sgn(x) = +1 (x &gt; 0), &nbsp;0 (x = 0), &nbsp;-1 (x &lt; 0)</p>
          <p><strong>Z</strong> = (S - 1) / √(n(n-1)(2n+5)/18) &nbsp;&nbsp;（|S| 较大时近似正态）</p>
        </FormulaBox>
        <table className={s.table}>
          <thead><tr><th>结果</th><th>含义</th><th>乳品解读</th></tr></thead>
          <tbody>
            <tr><td>S &gt; 0, p &lt; 0.05</td><td style={{ color: '#ef4444' }}>显著上升趋势</td><td>脂肪含量持续上升 → 均一化效果可能下降</td></tr>
            <tr><td>S &lt; 0, p &lt; 0.05</td><td style={{ color: '#3b82f6' }}>显著下降趋势</td><td>蛋白质持续下降 → 原料乳质量可能恶化</td></tr>
            <tr><td>p ≥ 0.05</td><td style={{ color: '#10b981' }}>无显著趋势</td><td>过程稳定，无系统性变化</td></tr>
          </tbody>
        </table>
        <MKChart />
      </SectionCard>

      {/* ─── 六西格玛 DMAIC ─── */}
      <SectionCard id="sixsigma" icon={svgGear} title="六西格玛 DMAIC 方法论" subtitle="数据驱动的质量改进框架" tag="质量" tagClass={s.tagQuality}>
        <DefBox>
          <p><strong>六西格玛（Six Sigma）</strong>是 Motorola 于 1986 年创立、GE 在 1990 年代推广的数据驱动质量管理方法。其目标是将缺陷率降至每百万机会 3.4 次（3.4 DPMO）。核心方法论 <strong>DMAIC</strong> 是结构化的问题解决流程：</p>
        </DefBox>
        <DMAICChart />
        <h3 className={s.h3}>DMAIC 五阶段详解</h3>
        <table className={s.table}>
          <thead><tr><th>阶段</th><th>核心任务</th><th>乳品示例</th><th>关键工具</th></tr></thead>
          <tbody>
            <tr><td style={{ color: '#3b82f6', fontWeight: 700 }}>D — 定义</td><td>明确问题、目标和范围</td><td>"脂肪含量 Cpk 从 1.8 降至 1.2，需恢复至 1.5 以上"</td><td>SIPOC、项目章程、VOC</td></tr>
            <tr><td style={{ color: '#8b5cf6', fontWeight: 700 }}>M — 测量</td><td>收集数据、评估测量系统</td><td>用 Gage R&amp;R 评估 FT120 的重复性和再现性</td><td>MSA/Gage R&R、数据收集计划</td></tr>
            <tr><td style={{ color: '#06b6d4', fontWeight: 700 }}>A — 分析</td><td>识别根本原因</td><td>通过控制图和回归分析，确认原料乳蛋白波动是主因</td><td>鱼骨图、假设检验、回归分析</td></tr>
            <tr><td style={{ color: '#10b981', fontWeight: 700 }}>I — 改进</td><td>实施改进方案</td><td>优化标准化工艺参数，增加均一化压力</td><td>DOE（实验设计）、响应曲面法</td></tr>
            <tr><td style={{ color: '#f59e0b', fontWeight: 700 }}>C — 控制</td><td>固化改进成果</td><td>建立 SPC 实时监控系统，设定控制限报警</td><td>控制图、控制计划、标准化作业</td></tr>
          </tbody>
        </table>
        <NoteBox><strong>本系统在 DMAIC 中的角色</strong>：SPC-MONITOR 主要服务于 M（测量）和 C（控制）阶段——通过 FT120 仪器自动采集数据、实时绘制控制图、自动应用 Nelson 规则判异，实现乳品质量的持续监控和早期预警。</NoteBox>
      </SectionCard>

      {/* ─── 滑动窗口 ─── */}
      <SectionCard id="sliding" icon={svgLayers} title="滑动窗口（Sliding Window）" subtitle="动态数据窗口分析" tag="统计" tagClass={s.tagStat}>
        <DefBox>
          <p><strong>滑动窗口</strong>是一种数据处理方法，每次只取最近 <strong>N</strong> 个数据点进行统计计算，窗口随时间向前滑动。它既保留了"近期数据更有价值"的直觉，又通过固定窗口大小保持了计算的实时性。</p>
        </DefBox>
        <FormulaBox>
          <p>{'窗口 W = \{xₜ₋ₙ₊₁, xₜ₋ₙ₊₂, ..., xₜ\}'}</p>
          <p>滑动均值 = (1/N) × Σxᵢ, &nbsp;其中 xᵢ ∈ W</p>
          <p>滑动标准差 = √[Σ(xᵢ - x̄_w)² / (N-1)]</p>
        </FormulaBox>
        <table className={s.table}>
          <thead><tr><th>窗口大小</th><th>优势</th><th>劣势</th><th>适用场景</th></tr></thead>
          <tbody>
            <tr><td>N = 10</td><td>对变化响应快</td><td>统计量波动大</td><td>快速切换产品线后</td></tr>
            <tr><td>N = 20~30</td><td>平衡灵敏度与稳定性</td><td>—</td><td>日常生产监控（推荐）</td></tr>
            <tr><td>N = 50+</td><td>统计量稳定</td><td>对变化响应迟钝</td><td>长期趋势分析</td></tr>
          </tbody>
        </table>
        <NoteBox>本系统默认窗口大小为 30，可在配置管理中调整。系统中所有统计计算（均值、标准差、控制限）均基于滑动窗口内的数据。</NoteBox>
        <SlidingWindowChart />
      </SectionCard>

      {/* ─── 合规判定 ─── */}
      <SectionCard id="compliance" icon={svgFlask} title="3σ合规判定" subtitle="基于控制限与规格限的双重判定" tag="质量" tagClass={s.tagQuality}>
        <DefBox>
          <p>本系统采用<strong>双重判定体系</strong>：先用控制限判断过程是否"受控"，再用规格限判断产品是否"合格"。两者结合才能做出完整的质量评价。</p>
        </DefBox>
        <h3 className={s.h3}>判定规则</h3>
        <table className={s.table}>
          <thead><tr><th>检测值位置</th><th>过程状态</th><th>产品状态</th><th>处理建议</th></tr></thead>
          <tbody>
            <tr><td>在控制限内（UCL/LCL）</td><td style={{ color: '#10b981' }}>受控</td><td style={{ color: '#10b981' }}>合格</td><td>正常生产</td></tr>
            <tr><td>超出控制限但在规格限内</td><td style={{ color: '#d97706' }}>失控</td><td style={{ color: '#10b981' }}>合格</td><td>关注并排查特殊原因</td></tr>
            <tr><td>超出规格限（USL/LSL）</td><td style={{ color: '#ef4444' }}>失控</td><td style={{ color: '#ef4444' }}>不合格</td><td>立即隔离产品并排查</td></tr>
          </tbody>
        </table>
        <ComplianceChart />
        <NoteBox><strong>关键区别</strong>：超出控制限说明过程出现了特殊原因变异，但产品本身可能仍合格；超出规格限则产品直接判定为不合格。前者关注"过程改进"，后者关注"产品处置"。</NoteBox>
      </SectionCard>

      {/* ─── 液奶指标体系 ─── */}
      <SectionCard id="products" icon={svgFlask} title="液奶关键指标体系" subtitle="FT120 仪器检测的核心指标" tag="质量" tagClass={s.tagQuality}>
        <DefBox>
          <p>乳品检验的核心指标体系依据 <strong>GB 19645</strong>（巴氏杀菌乳）、<strong>GB 25190</strong>（灭菌乳）、<strong>GB 5416</strong>（全脂乳粉）等国家标准设定。FT120 乳成分分析仪可同时检测以下指标。</p>
        </DefBox>
        <h3 className={s.h3}>核心理化指标</h3>
        <table className={s.table}>
          <thead><tr><th>指标</th><th>英文</th><th>单位</th><th>典型范围</th><th>国标要求（巴氏乳）</th><th>质量意义</th></tr></thead>
          <tbody>
            <tr><td>蛋白质</td><td>Protein</td><td>g/100g</td><td>2.9 ~ 3.6</td><td>≥ 2.9</td><td>营养价值核心指标</td></tr>
            <tr><td>脂肪</td><td>Fat</td><td>g/100g</td><td>3.1 ~ 5.0</td><td>≥ 3.1</td><td>口感与营养关键指标</td></tr>
            <tr><td>非脂乳固体</td><td>SNF</td><td>g/100g</td><td>8.1 ~ 9.5</td><td>≥ 8.1</td><td>蛋白质+乳糖+矿物质总和</td></tr>
            <tr><td>乳糖</td><td>Lactose</td><td>g/100g</td><td>4.4 ~ 5.2</td><td>—</td><td>影响口感甜度与冰点</td></tr>
            <tr><td>密度</td><td>Density</td><td>g/cm³</td><td>1.026 ~ 1.034</td><td>1.026~1.034</td><td>掺水检测关键指标</td></tr>
            <tr><td>酸度</td><td>Acidity</td><td>°T</td><td>12 ~ 18</td><td>12~18</td><td>新鲜度与微生物指标</td></tr>
            <tr><td>冰点</td><td>Freezing Pt</td><td>°C</td><td>-0.550 ~ -0.510</td><td>≤ -0.500</td><td>掺水检测的金标准</td></tr>
            <tr><td>水分</td><td>Moisture</td><td>g/100g</td><td>85 ~ 89</td><td>—</td><td>固形物计算基础</td></tr>
          </tbody>
        </table>
        <h3 className={s.h3}>指标间相关性</h3>
        <table className={s.table}>
          <thead><tr><th>关系</th><th>说明</th><th>异常提示</th></tr></thead>
          <tbody>
            <tr><td>脂肪 ↑ → 密度 ↓</td><td>脂肪密度低于水，脂肪越多密度越低</td><td>脂肪高但密度不降 → 可能掺杂增稠剂</td></tr>
            <tr><td>蛋白质 ↑ → SNF ↑</td><td>蛋白质是非脂乳固体的主要成分</td><td>SNF 高但蛋白质低 → 可能添加三聚氰胺</td></tr>
            <tr><td>冰点 ↓ → 水分 ↑</td><td>掺水使冰点上升（更接近 0°C）</td><td>{'冰点 > -0.500°C → 高度疑似掺水'}</td></tr>
          </tbody>
        </table>
      </SectionCard>

      {/* ─── 术语速查表 ─── */}
      <SectionCard id="appendix" icon={svgDoc} title="术语速查表">
        <table className={s.table}>
          <thead><tr><th>术语</th><th>英文</th><th>含义</th></tr></thead>
          <tbody>
            <tr><td>SPC</td><td>Statistical Process Control</td><td>统计过程控制</td></tr>
            <tr><td>UCL / LCL</td><td>Upper/Lower Control Limit</td><td>上/下控制限（由数据计算）</td></tr>
            <tr><td>USL / LSL</td><td>Upper/Lower Spec Limit</td><td>上/下规格限（由标准设定）</td></tr>
            <tr><td>Cp</td><td>Process Capability Index</td><td>过程精密度指数（不考虑偏移）</td></tr>
            <tr><td>Cpk</td><td>Process Capability Index (centered)</td><td>过程能力指数（含偏移）</td></tr>
            <tr><td>Ppk</td><td>Process Performance Index</td><td>过程性能指数（长期，总体σ）</td></tr>
            <tr><td>PPM</td><td>Parts Per Million</td><td>每百万件缺陷数</td></tr>
            <tr><td>EWMA</td><td>Exponentially Weighted Moving Average</td><td>指数加权移动平均</td></tr>
            <tr><td>ARIMA</td><td>AutoRegressive Integrated Moving Average</td><td>自回归积分移动平均</td></tr>
            <tr><td>IQR</td><td>Interquartile Range</td><td>四分位距</td></tr>
            <tr><td>MK</td><td>Mann-Kendall Test</td><td>非参数趋势检验</td></tr>
            <tr><td>DMAIC</td><td>Define-Measure-Analyze-Improve-Control</td><td>六西格玛改进方法论</td></tr>
            <tr><td>SNF</td><td>Solids-Not-Fat</td><td>非脂乳固体</td></tr>
            <tr><td>FT120</td><td>Foss Turbo 120</td><td>乳成分快速分析仪</td></tr>
            <tr><td>Gage R&R</td><td>Gauge Repeatability & Reproducibility</td><td>测量系统重复性与再现性分析</td></tr>
            <tr><td>DPMO</td><td>Defects Per Million Opportunities</td><td>每百万机会缺陷数</td></tr>
            <tr><td>GB 19645</td><td>—</td><td>食品安全国家标准 巴氏杀菌乳</td></tr>
            <tr><td>GB 25190</td><td>—</td><td>食品安全国家标准 灭菌乳</td></tr>
          </tbody>
        </table>
      </SectionCard>

      {/* ─── 交叉预测系数参考与方法对比 ─── */}
      <SectionCard id="cross-predict" icon={svgMean} title="交叉预测 — 脂肪→饱和脂肪" subtitle="通过已有指标实时预测关联指标的方法、系数参考与精度分析" tag="预测" tagClass={s.tagStat}>
        <Concept id="predict-overview" title="什么是交叉预测？" tag="预测" tagClass={s.tagStat}>
          <p>交叉预测是通过一个已采集指标的实时值，乘以一个系数，预测另一个关联指标。公式为：</p>
          <div className={s.formulaBox}>目标指标值 = 源指标值 × 系数(k)</div>
          <p>首期实现：脂肪 → 饱和脂肪。系数由用户在品项管理页面配置，选择产品类别时自动填入推荐值，可手动修改。</p>
        </Concept>

        <Concept id="predict-coefficients" title="推荐系数参考（基于4138条历史数据建模）" tag="参考" tagClass={s.tagStat}>
          <table className={s.table}>
            <thead><tr><th>产品类别</th><th>推荐系数k</th><th>拟合度(R²)</th><th>样本数</th><th>建议</th></tr></thead>
            <tbody>
              <tr><td>灭菌乳</td><td>0.6277</td><td>0.92</td><td>2226</td><td>★★★★★ 直接使用</td></tr>
              <tr><td>调制乳</td><td>0.6320</td><td>0.98</td><td>604</td><td>★★★★★ 直接使用</td></tr>
              <tr><td>乳饮料</td><td>0.6230</td><td>0.97</td><td>837</td><td>★★★★★ 直接使用</td></tr>
              <tr><td>发酵乳</td><td>0.6232</td><td>0.67</td><td>299</td><td>★★★★☆ 可用，波动稍大</td></tr>
              <tr><td>超滤纯牛奶</td><td>0.6255</td><td>—</td><td>10</td><td>★★★☆☆ 样本少，建议验证</td></tr>
              <tr><td>乳味饮料</td><td>0.6301</td><td>0.13</td><td>35</td><td>★★★☆☆ 样本少，建议验证</td></tr>
              <tr><td>果蔬汁类饮料</td><td>0.6187</td><td>0.96</td><td>48</td><td>★★★★☆ 可用</td></tr>
              <tr><td>植物蛋白饮品</td><td>0.1742</td><td>—</td><td>23</td><td>★★☆☆☆ 数据离散，仅作参考</td></tr>
              <tr><td>风味饮料</td><td>0.5480</td><td>0.81</td><td>23</td><td>★★★☆☆ 样本少</td></tr>
              <tr><td>复合蛋白饮料</td><td>0.3231</td><td>—</td><td>3</td><td>★★☆☆☆ 样本极少</td></tr>
              <tr><td>奶油</td><td>0.6470</td><td>0.99</td><td>3</td><td>★★★★★ 样本少但拟合好</td></tr>
            </tbody>
          </table>
          <p style={{ marginTop: 8, color: 'var(--text-muted, #64748b)', fontSize: 13 }}>如不区分类别，乳制品统一使用 <b>k ≈ 0.6278</b>（R²=0.98，覆盖灭菌乳/发酵乳/乳饮料/调制乳）</p>
        </Concept>

        <Concept id="predict-accuracy" title="方法对比与精度分析" tag="分析" tagClass={s.tagStat}>
          <h4>乳制品主组（灭菌乳/调制乳/乳饮料，n=3667）</h4>
          <table className={s.table}>
            <thead><tr><th>方法</th><th>R²</th><th>平均误差(MAE)</th><th>说明</th></tr></thead>
            <tbody>
              <tr><td><b>线性公式（可选方案一）</b></td><td><b>0.985</b></td><td><b>0.071</b></td><td>饱和脂肪 = 脂肪 × 0.6278</td></tr>
              <tr><td>线性+截距</td><td>0.985</td><td>0.071</td><td>饱和脂肪 = 0.6187×脂肪 + 0.036</td></tr>
              <tr><td><b>M8随机森林（可选方案二）</b></td><td><b>0.986</b></td><td><b>0.068</b></td><td>MAPE≈2.4%，多特征联合建模</td></tr>
              <tr><td>梯度提升(ML)</td><td>0.986</td><td>0.068</td><td>同随机森林，但模型更复杂</td></tr>
            </tbody>
          </table>
          <p>线性公式已是该场景的最优解。机器学习方法仅提升0.1%的R²，但增加了模型复杂度和维护成本。</p>

          <h4>误差分布</h4>
          <table className={s.table}>
            <thead><tr><th>指标</th><th>值</th></tr></thead>
            <tbody>
              <tr><td>平均绝对误差</td><td>0.071 g/100g</td></tr>
              <tr><td>中位绝对误差</td><td>0.052 g/100g</td></tr>
              <tr><td>90%样本误差</td><td>&lt; 0.155 g/100g</td></tr>
              <tr><td>误差 &lt; ±5% 的比例</td><td>74.7%</td></tr>
              <tr><td><b>误差 &lt; ±10% 的比例</b></td><td><b>96.5%</b></td></tr>
              <tr><td>误差 &lt; ±15% 的比例</td><td>98.4%</td></tr>
            </tbody>
          </table>

          <h4>发酵乳（R²=0.67）</h4>
          <p>发酵乳精度偏低是发酵工艺固有特征（乳酸菌分解脂肪比例不固定），ML方法（随机森林R²=0.61、GBDT R²=0.60）反而更差。任何预测模型都无法消除工艺波动。</p>

          <h4>植物蛋白饮品</h4>
          <p>所有方法R²均为负值。23个样本，ratio从0.14到0.36跨度太大。建议该类型不做预测，或仅作极粗略参考。</p>

          <h4>线性公式 vs M8随机森林</h4>
          <table className={s.table}>
            <thead><tr><th>维度</th><th>线性公式</th><th>M8随机森林</th></tr></thead>
            <tbody>
              <tr><td>乳制品R²</td><td>0.985</td><td>0.986（+0.001）</td></tr>
              <tr><td>MAPE</td><td>≈5.1%</td><td>≈2.4%（提升53%）</td></tr>
              <tr><td>可解释性</td><td>公式直观，可手工验算</td><td>多特征联合，需工具辅助</td></tr>
              <tr><td>输入特征</td><td>仅脂肪1个</td><td>脂肪+品项+季节+蛋白质+酸度</td></tr>
              <tr><td>无酸度数据时</td><td>不受影响</td><td>自动降级M8-Lite（4特征，MAPE≈3.0%）</td></tr>
              <tr><td>计算开销</td><td>一次乘法，&lt;1ms</td><td>加载pkl模型，~10ms</td></tr>
              <tr><td>维护成本</td><td>改系数即可</td><td>需重新训练、版本管理</td></tr>
            </tbody>
          </table>
          <p>两种方案均可在品项管理页面切换。线性公式适合快速部署和简单场景；M8随机森林在MAPE上有显著优势（5.1%→2.4%），适合追求更高精度的场景。</p>
        </Concept>

        <Concept id="predict-m8" title="M8 随机森林模型详解" tag="预测" tagClass={s.tagStat}>
          <h4>模型架构</h4>
          <p>M8 是基于 scikit-learn RandomForestRegressor 训练的饱和脂肪预测模型，采用<b>双模型自动切换</b>机制：</p>
          <table className={s.table}>
            <thead><tr><th>模型</th><th>特征数</th><th>输入特征</th><th>MAPE</th><th>适用条件</th></tr></thead>
            <tbody>
              <tr><td><b>M8 完整模型</b></td><td>5</td><td>脂肪 + 品项编码 + 季节 + 蛋白质 + 酸度</td><td>≈2.4%</td><td>有酸度数据时自动使用</td></tr>
              <tr><td><b>M8-Lite 轻量模型</b></td><td>4</td><td>脂肪 + 品项编码 + 季节 + 蛋白质</td><td>≈3.0%</td><td>无酸度数据时自动降级</td></tr>
            </tbody>
          </table>

          <h4>特征说明</h4>
          <table className={s.table}>
            <thead><tr><th>特征</th><th>类型</th><th>说明</th></tr></thead>
            <tbody>
              <tr><td><b>脂肪</b></td><td>数值</td><td>FT1/FT120 实时采集的脂肪含量（g/100g）</td></tr>
              <tr><td><b>品项编码</b></td><td>类别</td><td>LabelEncoder 编码的产品类别（灭菌乳、发酵乳等）</td></tr>
              <tr><td><b>季节</b></td><td>类别</td><td>采集月份映射的季节（1-4：春/夏/秋/冬）</td></tr>
              <tr><td><b>蛋白质</b></td><td>数值</td><td>同批次蛋白质含量，缺失时用训练集均值(3.2)兜底</td></tr>
              <tr><td><b>酸度</b></td><td>数值</td><td>同批次酸度，仅M8完整模型使用</td></tr>
            </tbody>
          </table>

          <h4>已训练品项</h4>
          <p>M8 模型已覆盖以下产品类别：灭菌乳、调制乳、发酵乳、乳饮料、乳味饮料、超滤纯牛奶。未覆盖的品项将回退到线性公式。</p>

          <h4>数据对齐策略</h4>
          <p>跨指标预测时，蛋白质和酸度数据的获取优先级：同批次(sample_id) → 同日数据 → 最新数据。确保使用最相关的特征值。</p>

          <NoteBox><strong>切换方式</strong>：在配置管理 → 品项管理中，找到目标品项的"预测指标"区域，可在线性公式和M8随机森林之间切换。选择品项类别后自动填入推荐系数。</NoteBox>
        </Concept>

        <Concept id="predict-future" title="未来提升方向" tag="展望" tagClass={s.tagStat}>
          <p>如果需要更高精度，唯一的路径是<b>多指标联合预测</b>：</p>
          <div className={s.formulaBox}>饱和脂肪 = a×脂肪 + b×蛋白质 + c×非脂乳固体 + d</div>
          <p>FT1/FT120仪器通常已采集蛋白质和非脂乳固体数据，多指标模型对发酵乳和植物蛋白饮品可能有实质提升。</p>
        </Concept>
      </SectionCard>

      {/* Footer */}
      <div style={{ textAlign: 'center', padding: '32px 0 16px', color: 'var(--text-muted, #64748b)', fontSize: 13, borderTop: '1px solid var(--border-color, #1e293b)', marginTop: 8 }}>
        由液态奶中心实验室编制
      </div>
      </div>
    </div>
  )
}

export default ManualPage
