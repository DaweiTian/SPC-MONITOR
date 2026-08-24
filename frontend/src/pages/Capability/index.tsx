import React, { useState, useEffect, useMemo, useCallback, useRef } from 'react'
import type { EChartsOption, DefaultLabelFormatterCallbackParams } from 'echarts'
import { api } from '../../services'
import { useChart, chartTheme, tooltipStyle } from '../../components/Charts'
import { escapeHtml } from '../../utils/html'
import { useProducts } from '../../hooks/useProducts'
import { useIndicators } from '../../hooks/useIndicators'
import { useAppMetadata } from '../../hooks'
import type { CapabilityData, EChartsParam, MonitorData } from '../../types'
import styles from './Capability.module.css'

/* ─────────── helpers ─────────── */

function capLevel(v: number): 'good' | 'warning' | 'danger' {
  if (v >= 1.33) return 'good'
  if (v >= 1.0) return 'warning'
  return 'danger'
}

function capGradeDesc(sigmaLevel: number): string {
  if (sigmaLevel >= 5) return '卓越'
  if (sigmaLevel >= 4) return '充足'
  if (sigmaLevel >= 3) return '合格'
  if (sigmaLevel >= 2) return '不足'
  return '严重不足'
}

function gradeTagClass(sigmaLevel: number): string {
  if (sigmaLevel >= 4) return styles.tagSuccess
  if (sigmaLevel >= 3) return styles.tagInfo
  if (sigmaLevel >= 2) return styles.tagWarning
  return styles.tagCritical
}

/** Build histogram bins from real data values (supports single-sided spec limits) */
function buildHistogramBins(values: number[], lsl?: number | null, usl?: number | null) {
  const dataMin = Math.min(...values)
  const dataMax = Math.max(...values)
  let lo: number, hi: number
  if (lsl != null && usl != null) {
    const range = usl - lsl
    const margin = range * 0.15
    lo = Math.min(lsl - margin, dataMin)
    hi = Math.max(usl + margin, dataMax)
  } else if (usl != null) {
    const span = Math.max(usl - dataMin, dataMax - dataMin) * 0.3
    lo = Math.min(dataMin - span, usl - Math.abs(usl) * 0.15)
    hi = Math.max(usl + span * 0.3, dataMax)
  } else if (lsl != null) {
    const span = Math.max(dataMax - lsl, dataMax - dataMin) * 0.3
    lo = Math.min(lsl - span * 0.3, dataMin)
    hi = Math.max(dataMax + span, lsl + Math.abs(lsl) * 0.15)
  } else {
    const span = (dataMax - dataMin) * 0.3
    lo = dataMin - span
    hi = dataMax + span
  }
  const bins = 15
  const binWidth = (hi - lo) / bins

  // Bar data as [midpoint, count] for value-axis rendering
  const barData: [number, number][] = []
  for (let i = 0; i < bins; i++) {
    const edge = lo + i * binWidth
    const mid = edge + binWidth / 2
    const count = values.filter(v => v >= edge && v < edge + binWidth).length
    barData.push([mid, count])
  }

  // Normal curve overlay
  const mean = values.reduce((a, b) => a + b, 0) / values.length
  const std = Math.sqrt(values.reduce((s, v) => s + (v - mean) ** 2, 0) / (values.length - 1))
  const normalCurve: [number, number][] = []
  if (std > 0) {
    const peak = values.length * binWidth / (std * Math.sqrt(2 * Math.PI))
    for (let i = 0; i < 100; i++) {
      const x = lo + (hi - lo) * i / 99
      const y = peak * Math.exp(-Math.pow((x - mean) / std, 2) / 2)
      normalCurve.push([x, y])
    }
  }

  return { barData, normalCurve, binWidth, lo, hi }
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
  const { productStatus, specLimits: allSpecLimits, getIndicatorName } = useAppMetadata()
  const [capabilityData, setCapabilityData] = useState<CapabilityData | null>(null)
  const [rawValues, setRawValues] = useState<number[]>([])
  const [loading, setLoading] = useState(false)
  const [initialized, setInitialized] = useState(false)
  const [filter, setFilter] = useState({
    product_code: '',
    indicator_code: 'fat',
    window: 30,
    date_from: '',
    date_to: '',
    remark: '',
  })

  // AbortController ref for cancelling in-flight requests
  const abortRef = useRef<AbortController | null>(null)

  // Products with spec limits (at least one indicator has USL or LSL)
  const capableProducts = useMemo(() => {
    const base = products.filter(p => productStatus[p.code] !== 'disabled')
    return base.filter(p => {
      const specs = allSpecLimits[p.code] as Record<string, { lsl?: number; usl?: number }> | undefined
      if (!specs) return false
      return Object.values(specs).some(s => s.usl != null || s.lsl != null)
    })
  }, [products, productStatus, allSpecLimits])

  // Indicators with spec limits for the selected product
  const capableIndicators = useMemo(() => {
    const specs = allSpecLimits[filter.product_code]
    if (!specs) return []
    return indicators.filter(i => {
      const s = specs[i.code]
      return s && (s.usl != null || s.lsl != null)
    })
  }, [indicators, allSpecLimits, filter.product_code])

  // Set initial product and indicator when data loads
  useEffect(() => {
    if (initialized || capableProducts.length === 0) return
    // Prefer Dashboard's saved product if it has spec limits
    let dashboardProduct: string | null = null
    try { dashboardProduct = localStorage.getItem('dashboard_selected_product') } catch { /* ignore */ }
    const savedProduct = dashboardProduct && capableProducts.find(p => p.code === dashboardProduct)
    const product = savedProduct || capableProducts[0]
    // Pick first indicator with spec limits for this product
    const specs = allSpecLimits[product.code] || {}
    const firstIndicator = indicators.find(i => specs[i.code]?.usl != null || specs[i.code]?.lsl != null)
    setFilter(f => ({
      ...f,
      product_code: product.code,
      indicator_code: firstIndicator?.code || f.indicator_code,
    }))
    setInitialized(true)
  }, [capableProducts, productStatus, allSpecLimits, indicators, initialized])

  // When product changes, auto-select first capable indicator
  useEffect(() => {
    if (!initialized) return
    const specs = allSpecLimits[filter.product_code] || {}
    const hasCurrent = specs[filter.indicator_code]?.usl != null || specs[filter.indicator_code]?.lsl != null
    if (!hasCurrent) {
      const first = indicators.find(i => specs[i.code]?.usl != null || specs[i.code]?.lsl != null)
      if (first) {
        setFilter(f => ({ ...f, indicator_code: first.code }))
      }
    }
  }, [filter.product_code, initialized])

  // Auto-fetch when filter changes (after initialization)
  const hasDateOrRemarkFilter = filter.date_from || filter.date_to || filter.remark

  const fetchData = useCallback(async (productCode: string, indicatorCode: string, window: number, filters?: { date_from?: string; date_to?: string; remark?: string }) => {
    if (!productCode || !indicatorCode) return
    abortRef.current?.abort()
    abortRef.current = new AbortController()
    const { signal } = abortRef.current
    setLoading(true)
    try {
      const [capData, recent] = await Promise.all([
        api.getCapabilityData(productCode, indicatorCode, window, filters, { signal }),
        api.getRecentData({ indicator_code: indicatorCode, product_code: productCode, limit: window, ...filters }, { signal }),
      ])
      setCapabilityData(capData)
      const values = (recent.data || recent).map((d: MonitorData) => d.value as number)
      setRawValues(values)
    } catch (e: unknown) {
      if (e instanceof Error && e.name === 'AbortError') return
      console.error('获取过程能力数据失败:', e)
    } finally {
      setLoading(false)
    }
  }, [])

  useEffect(() => {
    if (initialized && filter.product_code && filter.indicator_code) {
      const filters = hasDateOrRemarkFilter
        ? { date_from: filter.date_from || undefined, date_to: filter.date_to || undefined, remark: filter.remark || undefined }
        : undefined
      fetchData(filter.product_code, filter.indicator_code, filter.window, filters)
    }
    return () => { abortRef.current?.abort() }
  }, [initialized, filter.product_code, filter.indicator_code, filter.window, filter.date_from, filter.date_to, filter.remark, fetchData])

  // getIndicatorName provided by useAppMetadata hook

  /* ── Chart options ── */

  const histogramOption = useMemo<EChartsOption | null>(() => {
    if (!capabilityData || rawValues.length === 0) return null
    const { spec_limits } = capabilityData
    if (spec_limits.usl == null && spec_limits.lsl == null) return null

    const { barData, normalCurve, binWidth: _binWidth, lo, hi } = buildHistogramBins(
      rawValues, spec_limits.lsl, spec_limits.usl
    )

    return {
      ...chartTheme,
      tooltip: {
        trigger: 'axis' as const,
        ...tooltipStyle,
        formatter: (params: DefaultLabelFormatterCallbackParams | DefaultLabelFormatterCallbackParams[]) => {
          const p = (Array.isArray(params) ? params[0] : params) as unknown as EChartsParam
          const v = Array.isArray(p.value) ? p.value : [p.value]
          if (p.seriesName === '频数') {
            return `区间中点: ${escapeHtml(String(v[0].toFixed(3)))}<br/>频数: <b>${escapeHtml(String(v[1]))}</b>`
          }
          return `${escapeHtml(p.seriesName ?? '')}: ${escapeHtml(String(v[1]?.toFixed(1) ?? ''))}`
        },
      },
      legend: {
        data: ['频数', '正态分布'],
        textStyle: { color: '#8b95a7' },
        top: 0,
      },
      grid: { left: 50, right: 40, top: 30, bottom: 30 },
      xAxis: {
        type: 'value' as const,
        ...chartTheme.xAxis,
        splitLine: { show: false },
        min: lo,
        max: hi,
      },
      yAxis: {
        type: 'value' as const,
        ...chartTheme.yAxis,
        name: '频数',
        splitLine: { show: false },
      },
      series: [
        {
          name: '频数',
          type: 'bar' as const,
          barWidth: 40,
          data: barData.map(([x, y]) => ({ value: [x, y] })),
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
              ...(spec_limits.usl != null ? [{
                xAxis: spec_limits.usl,
                lineStyle: { color: '#ef4444', type: 'dotted' as const, width: 2 },
                label: { formatter: `USL=${spec_limits.usl}`, color: '#ef4444', fontSize: 10, position: 'insideEndTop' as const },
              }] : []),
              ...(spec_limits.lsl != null ? [{
                xAxis: spec_limits.lsl,
                lineStyle: { color: '#ef4444', type: 'dotted' as const, width: 2 },
                label: { formatter: `LSL=${spec_limits.lsl}`, color: '#ef4444', fontSize: 10, position: 'insideEndTop' as const },
              }] : []),
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
  }, [capabilityData, rawValues])

  const gaugeOption = useMemo<EChartsOption | null>(() => {
    if (!capabilityData) return null
    const sigmaVal = capabilityData.result.sigma_level

    return {
      series: [
        {
          type: 'gauge',
          radius: '90%',
          center: ['50%', '60%'],
          startAngle: 200,
          endAngle: -20,
          min: 0,
          max: Math.max(6, Math.ceil(sigmaVal)),
          splitNumber: Math.max(6, Math.ceil(sigmaVal)),
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
          detail: { show: false },
          data: [{ value: sigmaVal }],
        },
      ],
    }
  }, [capabilityData])

  const cpkTrendOption = useMemo<EChartsOption | null>(() => {
    if (!capabilityData) return null

    // Check if historical Cpk data is available from the API
    const historicalCpk = capabilityData.cpk_history
    if (!historicalCpk || historicalCpk.length === 0) {
      return null
    }

    const dates = historicalCpk.map(h => h.time).reverse()
    const cpkData = historicalCpk.map(h => h.value).reverse()

    const dataMin = Math.min(...cpkData)
    const dataMax = Math.max(...cpkData)

    return {
      ...chartTheme,
      tooltip: { trigger: 'axis' as const, ...tooltipStyle },
      grid: { left: 50, right: 50, top: 30, bottom: 30 },
      xAxis: {
        type: 'category' as const,
        data: dates,
        ...chartTheme.xAxis,
      },
      yAxis: {
        type: 'value' as const,
        ...chartTheme.yAxis,
        min: Math.floor(Math.min(1.0, dataMin - 0.1)),
        max: Math.ceil(dataMax + 0.1),
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
                label: { formatter: '目标 1.33', color: '#f59e0b', fontSize: 10, position: 'insideEndTop' as const },
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
  const isSingleSided = specLimits != null && ((specLimits.usl != null) !== (specLimits.lsl != null))
  const passRate = result
    ? ((1 - result.defect_rate_ppm / 1_000_000) * 100).toFixed(4)
    : '-'
  const gradeDesc = result ? capGradeDesc(result.sigma_level) : '-'
  const gradeTag = result ? gradeTagClass(result.sigma_level) : ''

  return (
    <div className={styles.page}>
      {/* Filter bar */}
      <div className={styles.filterBar}>
        <select
          className={styles.select}
          value={filter.product_code}
          onChange={e => setFilter(f => ({ ...f, product_code: e.target.value }))}
        >
          {capableProducts.map(p => (
            <option key={p.code} value={p.code}>{p.name}</option>
          ))}
        </select>
        <select
          className={styles.select}
          value={filter.indicator_code}
          onChange={e => setFilter(f => ({ ...f, indicator_code: e.target.value }))}
        >
          {capableIndicators.map(i => (
            <option key={i.code} value={i.code}>{getIndicatorName(i.code)}</option>
          ))}
        </select>
        <div className={styles.filterDivider} />
        <div className={styles.filterGroup}>
          <span className={styles.filterLabel}>开始日期</span>
          <input type="date" className={styles.filterDateInput} value={filter.date_from} onChange={e => setFilter(f => ({ ...f, date_from: e.target.value }))} />
        </div>
        <div className={styles.filterGroup}>
          <span className={styles.filterLabel}>结束日期</span>
          <input type="date" className={styles.filterDateInput} value={filter.date_to} onChange={e => setFilter(f => ({ ...f, date_to: e.target.value }))} />
        </div>
        <div className={styles.filterGroup}>
          <span className={styles.filterLabel}>备注</span>
          <input type="text" className={styles.filterTextInput} placeholder="模糊搜索备注..." value={filter.remark} onChange={e => setFilter(f => ({ ...f, remark: e.target.value }))} />
        </div>
        {hasDateOrRemarkFilter && (
          <button className={styles.btnReset} onClick={() => setFilter(f => ({ ...f, date_from: '', date_to: '', remark: '' }))}>重置筛选</button>
        )}
        {loading && <span className={styles.loadingText}>加载中...</span>}
      </div>

      {/* Capability index cards */}
      <div className={styles.capabilityGrid}>
        {CAP_CARDS.map(card => {
          const value = result ? (result as Record<string, number>)[card.key] ?? 0 : 0
          const level = capLevel(value)
          return (
            <div key={card.key} className={`${styles.capCard} ${styles[level]}`}>
              <div className={styles.capCardHeader}>
                <span className={styles.capLabel}>{card.label}</span>
                <div className={styles.capIcon}>
                  <svg width="16" height="16" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round">
                    {card.key === 'cp' && <><line x1="4" y1="12" x2="20" y2="12" /><polyline points="8 8 4 12 8 16" /><polyline points="16 8 20 12 16 16" /></>}
                    {card.key === 'cpk' && <><path d="M12 20V4" /><polyline points="6 10 12 4 18 10" /><line x1="4" y1="20" x2="20" y2="20" /></>}
                    {card.key === 'pp' && <><polyline points="23 6 13.5 15.5 8.5 10.5 1 18" /><polyline points="17 6 23 6 23 12" /></>}
                    {card.key === 'ppk' && <><path d="M21 16V8a2 2 0 0 0-1-1.73l-7-4a2 2 0 0 0-2 0l-7 4A2 2 0 0 0 3 8v8a2 2 0 0 0 1 1.73l7 4a2 2 0 0 0 2 0l7-4A2 2 0 0 0 21 16z" /><polyline points="7.5 4.21 12 6.81 16.5 4.21" /><line x1="12" y1="22.08" x2="12" y2="6.81" /></>}
                  </svg>
                </div>
              </div>
              <div className={styles.capValue}>{value.toFixed(2)}</div>
              <div className={styles.capDesc}>{card.descPrefix} · {level === 'good' ? '充足' : level === 'warning' ? '边缘' : '不足'}</div>
            </div>
          )
        })}
      </div>
      {isSingleSided && (
        <div style={{ textAlign: 'center', color: '#8b95a7', fontSize: 12, marginTop: -4, marginBottom: 8 }}>
          单侧规格限模式：Cp = Cpk，Pp = Ppk
        </div>
      )}

      {/* Histogram + Sigma gauge */}
      <div className={styles.chartGrid}>
        {/* Left: Histogram */}
        <div className={styles.panel}>
          <div className={styles.panelHeader}>
            <div className={styles.panelTitle}>
              <span className={styles.panelIcon}>
                <svg width="16" height="16" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round">
                  <rect x="3" y="12" width="4" height="9" rx="1" /><rect x="10" y="7" width="4" height="14" rx="1" /><rect x="17" y="3" width="4" height="18" rx="1" />
                </svg>
              </span>
              过程能力直方图
            </div>
            {specLimits && (
              <div className={styles.panelActions}>
                {specLimits.usl != null && <span className={styles.tagCritical}>USL: {specLimits.usl}</span>}
                {specLimits.lsl != null && <span className={styles.tagCritical}>LSL: {specLimits.lsl}</span>}
              </div>
            )}
          </div>
          <div className={styles.panelBodyCompact}>
            <div ref={histRef} style={{ flex: 1, minHeight: 0 }} />
          </div>
        </div>

        {/* Right: Sigma gauge + stats */}
        <div className={styles.panel}>
          <div className={styles.panelHeader}>
            <div className={styles.panelTitle}>
              <span className={styles.panelIcon}>
                <svg width="16" height="16" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round">
                  <polygon points="12 2 15.09 8.26 22 9.27 17 14.14 18.18 21.02 12 17.77 5.82 21.02 7 14.14 2 9.27 8.91 8.26 12 2" />
                </svg>
              </span>
              西格玛水平
            </div>
          </div>
          <div className={styles.panelBody}>
            <div ref={gaugeRef} style={{ height: 220, width: '100%' }} />
            <div className={styles.sigmaDisplay}>
              <div className={styles.sigmaValue}>
                {result ? result.sigma_level.toFixed(2) : '0.00'} σ
              </div>
              <div className={styles.sigmaHint}>相当于 Cpk × 3 + 1.5σ偏移</div>
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
                  {result ? (capabilityData?.spec_limits.usl != null && capabilityData?.spec_limits.lsl != null ? result.ca.toFixed(2) : 'N/A (单侧)') : '-'}
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
            <span className={styles.panelIcon}>
              <svg width="16" height="16" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round">
                <polyline points="22 12 18 12 15 21 9 3 6 12 2 12" />
              </svg>
            </span>
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

export default CapabilityPage
