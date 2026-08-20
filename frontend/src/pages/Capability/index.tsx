import React, { useState, useEffect, useMemo } from 'react'
import type { EChartsOption } from 'echarts'
import { api } from '../../services'
import { useChart, chartTheme, tooltipStyle } from '../../components/Charts'
import { useProducts } from '../../hooks/useProducts'
import { useIndicators } from '../../hooks/useIndicators'
import type { CapabilityData } from '../../types'
import HelpTooltip from '../../components/HelpTooltip'
import styles from './Capability.module.css'

/* ─────────── helpers ─────────── */

/** Classify a capability value: good / warning / danger */
function capLevel(v: number): 'good' | 'warning' | 'danger' {
  if (v >= 1.33) return 'good'
  if (v >= 1.0) return 'warning'
  return 'danger'
}

/** Short description for capability grade */
function capGradeDesc(sigmaLevel: number): string {
  if (sigmaLevel >= 5) return '卓越'
  if (sigmaLevel >= 4) return '充足'
  if (sigmaLevel >= 3) return '合格'
  if (sigmaLevel >= 2) return '不足'
  return '严重不足'
}

/** Capability grade tag class */
function gradeTagClass(sigmaLevel: number): string {
  if (sigmaLevel >= 4) return styles.tagSuccess
  if (sigmaLevel >= 3) return styles.tagInfo
  if (sigmaLevel >= 2) return styles.tagWarning
  return styles.tagCritical
}

/** Generate histogram bins + normal curve from spec limits and sigma */
function generateHistogramData(lsl: number, usl: number, cpk: number) {
  const range = usl - lsl
  const mean = (usl + lsl) / 2
  const sigma = range / (6 * Math.max(cpk, 0.1))
  const bins = 12
  const binWidth = range / bins

  const binLabels: string[] = []
  const binData: number[] = []
  for (let i = 0; i < bins; i++) {
    const lo = lsl + i * binWidth
    const hi = lo + binWidth
    binLabels.push(lo.toFixed(2))
    // Probability mass in this bin using normal CDF approximation
    const zLo = (lo - mean) / sigma
    const zHi = (hi - mean) / sigma
    const pLo = 0.5 * (1 + erf(zLo / Math.SQRT2))
    const pHi = 0.5 * (1 + erf(zHi / Math.SQRT2))
    // Scale to "counts" similar to prototype (peak ~22)
    binData.push(Math.round((pHi - pLo) * 100))
  }

  // Normal distribution curve overlay
  const normalCurve: [number, number][] = []
  const peak = Math.round(100 / (sigma * Math.sqrt(2 * Math.PI)))
  for (let i = 0; i < 100; i++) {
    const x = lsl + range * i / 99
    const y = peak * Math.exp(-Math.pow((x - mean) / sigma, 2) / 2)
    normalCurve.push([x, y])
  }

  return { binLabels, binData, normalCurve }
}

/** Error function approximation */
function erf(x: number): number {
  const a1 = 0.254829592, a2 = -0.284496736, a3 = 1.421413741
  const a4 = -1.453152027, a5 = 1.061405429, p = 0.3275911
  const sign = x < 0 ? -1 : 1
  const t = 1 / (1 + p * Math.abs(x))
  const y = 1 - (((((a5 * t + a4) * t) + a3) * t + a2) * t + a1) * t * Math.exp(-x * x)
  return sign * y
}

/* ─────────── cap card data ─────────── */
interface CapCardInfo {
  key: string
  label: string
  shortLabel: string
  descPrefix: string
}

const CAP_CARDS: CapCardInfo[] = [
  { key: 'cp', label: 'Cp (过程能力指数)', shortLabel: 'Cp', descPrefix: '短期能力' },
  { key: 'cpk', label: 'Cpk (修正能力指数)', shortLabel: 'Cpk', descPrefix: '短期修正' },
  { key: 'pp', label: 'Pp (过程性能指数)', shortLabel: 'Pp', descPrefix: '长期性能' },
  { key: 'ppk', label: 'Ppk (修正性能指数)', shortLabel: 'Ppk', descPrefix: '长期修正' },
]

/* ─────────── Component ─────────── */

export const CapabilityPage: React.FC = () => {
  const { products } = useProducts()
  const { indicators } = useIndicators()
  const [capabilityData, setCapabilityData] = useState<CapabilityData | null>(null)
  const [loading, setLoading] = useState(false)
  const [filter, setFilter] = useState({
    product_code: 'P001',
    indicator_code: 'fat',
    window: 30,
  })

  const fetchCapabilityData = async () => {
    setLoading(true)
    try {
      const data = await api.getCapabilityData(filter.product_code, filter.indicator_code, filter.window)
      setCapabilityData(data)
    } catch (e) {
      console.error('获取过程能力数据失败:', e)
    } finally {
      setLoading(false)
    }
  }

  useEffect(() => {
    fetchCapabilityData()
  }, [filter])

  /* ── Chart options ── */

  const histogramOption = useMemo<EChartsOption | null>(() => {
    if (!capabilityData) return null
    const { spec_limits, result } = capabilityData
    if (spec_limits.usl == null || spec_limits.lsl == null) return null

    const { binLabels, binData, normalCurve } = generateHistogramData(
      spec_limits.lsl, spec_limits.usl, result.cpk
    )

    return {
      ...chartTheme,
      tooltip: { trigger: 'axis' as const, ...tooltipStyle },
      legend: {
        data: ['频数', '正态分布'],
        textStyle: { color: '#8b95a7' },
        top: 0,
      },
      grid: { left: 50, right: 50, top: 40, bottom: 40 },
      xAxis: {
        type: 'category' as const,
        data: binLabels,
        ...chartTheme.xAxis,
        name: '测量值',
      },
      yAxis: {
        type: 'value' as const,
        ...chartTheme.yAxis,
        name: '频数',
      },
      series: [
        {
          name: '频数',
          type: 'bar' as const,
          barWidth: '70%',
          data: binData,
          itemStyle: {
            color: {
              type: 'linear' as const,
              x: 0, y: 0, x2: 0, y2: 1,
              colorStops: [
                { offset: 0, color: 'rgba(0,212,255,0.6)' },
                { offset: 1, color: 'rgba(0,212,255,0.1)' },
              ],
            },
            borderRadius: [4, 4, 0, 0],
          },
          markLine: {
            symbol: 'none',
            silent: true,
            data: [
              {
                xAxis: binLabels[binLabels.length - 1],
                lineStyle: { color: '#ef4444', type: 'dotted' as const, width: 2 },
                label: { formatter: 'USL', color: '#ef4444', fontSize: 10 },
              },
              {
                xAxis: binLabels[0],
                lineStyle: { color: '#ef4444', type: 'dotted' as const, width: 2 },
                label: { formatter: 'LSL', color: '#ef4444', fontSize: 10 },
              },
            ],
          },
        },
        {
          name: '正态分布',
          type: 'line' as const,
          smooth: true,
          symbol: 'none',
          data: normalCurve,
          lineStyle: { color: '#8b5cf6', width: 2 },
          itemStyle: { color: '#8b5cf6' },
        },
      ],
    }
  }, [capabilityData])

  const gaugeOption = useMemo<EChartsOption | null>(() => {
    if (!capabilityData) return null
    const sigmaVal = capabilityData.result.sigma_level

    return {
      series: [
        {
          type: 'gauge',
          radius: '90%',
          startAngle: 200,
          endAngle: -20,
          min: 0,
          max: 6,
          splitNumber: 6,
          axisLine: {
            lineStyle: {
              width: 12,
              color: [
                [0.33, '#ef4444'],
                [0.5, '#f59e0b'],
                [0.67, '#10b981'],
                [1, '#00d4ff'],
              ],
            },
          },
          pointer: {
            width: 4,
            length: '60%',
            itemStyle: { color: '#00d4ff' },
          },
          axisTick: {
            distance: -12,
            length: 4,
            lineStyle: { color: 'rgba(255,255,255,0.3)' },
          },
          splitLine: {
            distance: -12,
            length: 8,
            lineStyle: { color: 'rgba(255,255,255,0.4)' },
          },
          axisLabel: {
            color: '#8b95a7',
            distance: -28,
            fontSize: 10,
          },
          detail: {
            valueAnimation: true,
            formatter: '{value}\u03C3',
            color: '#10b981',
            fontSize: 20,
            offsetCenter: [0, '30%'],
          },
          data: [{ value: sigmaVal }],
        },
      ],
    }
  }, [capabilityData])

  const cpkTrendOption = useMemo<EChartsOption | null>(() => {
    if (!capabilityData) return null
    const cpkVal = capabilityData.result.cpk

    // Generate synthetic trend data around the current Cpk value
    const days = 12
    const dates: string[] = []
    const cpkData: number[] = []
    const now = new Date()
    for (let i = days - 1; i >= 0; i--) {
      const d = new Date(now)
      d.setDate(d.getDate() - i)
      dates.push(`${d.getMonth() + 1}/${d.getDate()}`)
      // Slight random variation around the cpk value
      const variation = (Math.sin(i * 0.8) * 0.06) + (Math.cos(i * 1.3) * 0.03)
      cpkData.push(+(cpkVal + variation).toFixed(2))
    }

    return {
      ...chartTheme,
      tooltip: { trigger: 'axis' as const, ...tooltipStyle },
      grid: { left: 50, right: 30, top: 30, bottom: 30 },
      xAxis: {
        type: 'category' as const,
        data: dates,
        ...chartTheme.xAxis,
      },
      yAxis: {
        type: 'value' as const,
        ...chartTheme.yAxis,
        min: Math.min(1.0, Math.min(...cpkData) - 0.1),
        max: Math.max(1.7, Math.max(...cpkData) + 0.1),
      },
      series: [
        {
          type: 'line',
          smooth: true,
          symbol: 'circle',
          symbolSize: 7,
          data: cpkData,
          lineStyle: { color: '#10b981', width: 2 },
          itemStyle: { color: '#10b981', borderColor: '#0a0e1a', borderWidth: 1 },
          areaStyle: {
            color: {
              type: 'linear' as const,
              x: 0, y: 0, x2: 0, y2: 1,
              colorStops: [
                { offset: 0, color: 'rgba(16,185,129,0.25)' },
                { offset: 1, color: 'rgba(16,185,129,0)' },
              ],
            },
          },
          markLine: {
            symbol: 'none',
            silent: true,
            data: [
              {
                yAxis: 1.33,
                lineStyle: { color: '#f59e0b', type: 'dashed' as const },
                label: { formatter: '目标 1.33', color: '#f59e0b', fontSize: 10 },
              },
            ],
          },
        },
      ],
    }
  }, [capabilityData])

  /* ── Chart hooks ── */
  const { containerRef: histRef } = useChart(histogramOption)
  const { containerRef: gaugeRef } = useChart(gaugeOption)
  const { containerRef: cpkTrendRef } = useChart(cpkTrendOption)

  /* ── Derived values ── */
  const result = capabilityData?.result
  const specLimits = capabilityData?.spec_limits
  const passRate = result
    ? ((1 - result.defect_rate_ppm / 1_000_000) * 100).toFixed(4)
    : '-'
  const gradeDesc = result ? capGradeDesc(result.sigma_level) : '-'
  const gradeTag = result ? gradeTagClass(result.sigma_level) : ''

  return (
    <div className={styles.page}>
      {/* Filter bar */}
      <div className={styles.filterBar}>
        <span className={styles.filterLabel}>
          <span className={styles.filterIcon}>🎯</span>
          过程能力分析
          <HelpTooltip termId="cp" placement="right" />
        </span>
        <select
          className={styles.select}
          value={filter.product_code}
          onChange={e => setFilter({ ...filter, product_code: e.target.value })}
        >
          {products.map(p => (
            <option key={p.code} value={p.code}>{p.name}</option>
          ))}
        </select>
        <select
          className={styles.select}
          value={filter.indicator_code}
          onChange={e => setFilter({ ...filter, indicator_code: e.target.value })}
        >
          {indicators.map(i => (
            <option key={i.code} value={i.code}>{i.name}</option>
          ))}
        </select>
        <button
          className={styles.btnPrimary}
          onClick={fetchCapabilityData}
          disabled={loading}
        >
          {loading ? '⏳ 加载中...' : '🔍 查询'}
        </button>
      </div>

      {/* Capability index cards */}
      <div className={styles.capabilityGrid}>
        {CAP_CARDS.map(card => {
          const value = result ? (result as Record<string, number>)[card.key] ?? 0 : 0
          const level = capLevel(value)
          return (
            <div key={card.key} className={`${styles.capCard} ${styles[level]}`}>
              <div className={styles.capLabel}>{card.label}</div>
              <div className={styles.capValue}>{value.toFixed(2)}</div>
              <div className={styles.capDesc}>{card.descPrefix} · {level === 'good' ? '充足' : level === 'warning' ? '边缘' : '不足'}</div>
            </div>
          )
        })}
      </div>

      {/* Histogram + Sigma gauge */}
      <div className={styles.chartGrid}>
        {/* Left: Histogram */}
        <div className={styles.panel}>
          <div className={styles.panelHeader}>
            <div className={styles.panelTitle}>
              <span className={styles.panelIcon}>📊</span>
              过程能力直方图
            </div>
            {specLimits && (
              <div className={styles.panelActions}>
                {specLimits.usl != null && <span className={styles.tagCritical}>USL: {specLimits.usl}</span>}
                {specLimits.lsl != null && <span className={styles.tagCritical}>LSL: {specLimits.lsl}</span>}
              </div>
            )}
          </div>
          <div className={styles.panelBody}>
            <div ref={histRef} style={{ height: 360, width: '100%' }} />
          </div>
        </div>

        {/* Right: Sigma gauge + stats */}
        <div className={styles.panel}>
          <div className={styles.panelHeader}>
            <div className={styles.panelTitle}>
              <span className={styles.panelIcon}>⭐</span>
              西格玛水平
            </div>
          </div>
          <div className={styles.panelBody}>
            <div ref={gaugeRef} style={{ height: 220, width: '100%' }} />
            <div className={styles.sigmaDisplay}>
              <div className={styles.sigmaValue}>
                {result ? result.sigma_level.toFixed(2) : '0.00'} σ
              </div>
              <div className={styles.sigmaHint}>相当于 Cpk × 3</div>
            </div>
            <div className={styles.statsList}>
              <div className={styles.statRow}>
                <span className={styles.statLabel}>不合格率 (PPM)</span>
                <span className={styles.statValueGreen}>
                  {result ? result.defect_rate_ppm.toFixed(1) : '-'}
                </span>
              </div>
              <div className={styles.statRow}>
                <span className={styles.statLabel}>合格率</span>
                <span className={styles.statValueGreen}>{passRate}%</span>
              </div>
              <div className={styles.statRow}>
                <span className={styles.statLabel}>偏移系数 (Ca)</span>
                <span className={styles.statValueCyan}>
                  {result ? result.ca.toFixed(2) : '-'}
                </span>
              </div>
              <div className={styles.statRow}>
                <span className={styles.statLabel}>能力等级</span>
                <span className={gradeTag}>{gradeDesc}</span>
              </div>
            </div>
          </div>
        </div>
      </div>

      {/* Cpk trend chart */}
      <div className={styles.panel}>
        <div className={styles.panelHeader}>
          <div className={styles.panelTitle}>
            <span className={styles.panelIcon}>📉</span>
            Cpk 趋势变化
          </div>
        </div>
        <div className={styles.panelBody}>
          <div ref={cpkTrendRef} style={{ height: 280, width: '100%' }} />
        </div>
      </div>
    </div>
  )
}
