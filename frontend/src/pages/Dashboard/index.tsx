import React, { useState, useEffect, useCallback, useMemo, useRef } from 'react'
import type { EChartsOption, LinearGradientObject, MarkLineComponentOption } from 'echarts'
import { api, websocketService } from '../../services'
import { useChart, chartTheme, tooltipStyle } from '../../components/Charts'
import { useAppContext } from '../../contexts/AppContext'
import { useAppMetadata } from '../../hooks'
import type { DashboardData, SchedulerStatus, Product, Indicator, MonitorData, CapabilityData } from '../../types'
import styles from './Dashboard.module.css'

/* ────────── 品项模式 ────────── */
type ProductMode = 'auto' | 'manual'

/* ────────── Cpk 等级判定 ────────── */
function cpkLevel(v: number): 'good' | 'warn' | 'bad' {
  if (v >= 1.33) return 'good'
  if (v >= 1.0) return 'warn'
  return 'bad'
}

function cpkLabel(level: 'good' | 'warn' | 'bad'): string {
  if (level === 'good') return '能力充足'
  if (level === 'warn') return '能力勉强'
  return '能力不足'
}

function cpkBorderStyle(level: 'good' | 'warn' | 'bad'): string {
  if (level === 'good') return 'rgba(16,185,129,0.3)'
  if (level === 'warn') return 'rgba(245,158,11,0.3)'
  return 'rgba(239,68,68,0.3)'
}

/* ────────── 预警级别标签 ────────── */
const severityTagClass: Record<string, string> = {
  CRITICAL: styles.tagCritical,
  WARNING: styles.tagWarning,
  INFO: styles.tagInfo,
}
const severityLabel: Record<string, string> = {
  CRITICAL: '严重',
  WARNING: '警告',
  INFO: '信息',
}
const ruleTypeLabel: Record<string, string> = {
  spc_violation: 'SPC失控',
  out_of_spec: '超规格限',
  trend_detected: '趋势异常',
  mean_shift: '均值偏移',
  high_variation: '变异过大',
  low_cpk: '能力不足',
  cpk_below_target: 'CPK预警',
  cpk_low: 'CPK预警',
  spec_limit_breach: '规格越限',
  above_usl: '规格越限',
  below_lsl: '规格越限',
  nelson_1: 'Nelson规则1',
  nelson_2: 'Nelson规则2',
  nelson_3: 'Nelson规则3',
  nelson_4: 'Nelson规则4',
  nelson_5: 'Nelson规则5',
  nelson_6: 'Nelson规则6',
  nelson_7: 'Nelson规则7',
  nelson_8: 'Nelson规则8',
}

/* ────────── 时间格式化 ────────── */
function fmtTime(iso?: string): string {
  if (!iso) return '-'
  return new Date(iso).toLocaleTimeString('zh-CN', { hour: '2-digit', minute: '2-digit', second: '2-digit' })
}

/* ================================================================
 *  Dashboard Page
 * ================================================================ */
export const Dashboard: React.FC = () => {
  /* ── 全局状态 ── */
  const { setCurrentProduct, setCollectionFrequency } = useAppContext()
  const { aliases, productStatus, specLimits: allSpecLimits } = useAppMetadata()
  
  /* ── state ── */
  const [dashboard, setDashboard] = useState<DashboardData | null>(null)
  const [status, setStatus] = useState<SchedulerStatus | null>(null)
  const [products, setProducts] = useState<Product[]>([])
  const [indicators, setIndicators] = useState<Indicator[]>([])
  const [recentData, setRecentData] = useState<MonitorData[]>([])
  const [capMatrix, setCapMatrix] = useState<CapabilityData[]>([])
  const [alertRules, setAlertRules] = useState<Record<string, { rule: string; description: string }>>({})
  const [collecting, setCollecting] = useState(false)
  
  /* ── 品项选择状态（从 localStorage 恢复） ── */
  const [productMode, setProductMode] = useState<ProductMode>(() => {
    try { return (localStorage.getItem('dashboard_product_mode') as ProductMode) || 'auto' } catch { return 'auto' }
  })
  const [selectedProduct, setSelectedProduct] = useState<string>(() => {
    try { return localStorage.getItem('dashboard_selected_product') || '' } catch { return '' }
  })
  const [autoProducts, setAutoProducts] = useState<Product[]>([])
  const [autoProductIndex, setAutoProductIndex] = useState(0)
  
  /* ── 指标跑马灯状态 ── */
  const [activeIndicators, setActiveIndicators] = useState<Indicator[]>([])
  const [currentIndicatorIndex, setCurrentIndicatorIndex] = useState(0)
  
  /* ── 定时器引用 ── */
  const productTimerRef = useRef<ReturnType<typeof setInterval> | null>(null)
  const indicatorTimerRef = useRef<ReturnType<typeof setInterval> | null>(null)

  /* ── 获取当前品项 ── */
  const currentProduct = useMemo(() => {
    if (productMode === 'manual' && selectedProduct) {
      return products.find(p => p.code === selectedProduct)
    }
    if (productMode === 'auto' && autoProducts.length > 0) {
      return autoProducts[autoProductIndex]
    }
    return products[0]
  }, [productMode, selectedProduct, autoProducts, autoProductIndex, products])

  /* ── 获取当前指标 ── */
  const currentIndicator = useMemo(() => {
    if (activeIndicators.length > 0) {
      return activeIndicators[currentIndicatorIndex]
    }
    return null
  }, [activeIndicators, currentIndicatorIndex])

  /* ── 更新全局状态 ── */
  useEffect(() => {
    if (currentProduct) {
      const displayName = productMode === 'auto' 
        ? `🔄 ${currentProduct.name}`
        : currentProduct.name
      setCurrentProduct(displayName, currentProduct.code)
    }
  }, [currentProduct, productMode, setCurrentProduct])

  useEffect(() => {
    if (currentIndicator) {
      try { localStorage.setItem('app_current_indicator', currentIndicator.name) } catch {}
    }
  }, [currentIndicator])

  useEffect(() => {
    api.getAlertRules().then((res) => {
      const map: Record<string, { rule: string; description: string }> = {}
      ;(res.rules || []).forEach((r: { rule_type: string; rule: string; description: string }) => {
        map[r.rule_type] = { rule: r.rule, description: r.description }
      })
      setAlertRules(map)
    }).catch(() => {})
  }, [])

  useEffect(() => {
    if (status) {
      const freqLabel = `L${status.current_level} · ${status.current_interval_minutes}min`
      setCollectionFrequency(freqLabel)
    }
  }, [status, setCollectionFrequency])

  /* ── data fetching ── */
  const fetchDashboard = useCallback(async () => {
    try {
      const [dash, st] = await Promise.all([api.getDashboard(), api.getStatus()])
      setDashboard(dash)
      setStatus(st)
    } catch (e) {
      console.error('获取看板数据失败:', e)
    }
  }, [])

  const fetchMeta = useCallback(async () => {
    try {
      const [p, i] = await Promise.all([
        api.getProducts(),
        api.getIndicators(),
      ])

      // 过滤掉停用的品项
      const enabledProducts = p.products.filter((product: Product) =>
        productStatus[product.code] !== 'disabled'
      )

      setProducts(enabledProducts)
      setIndicators(i.indicators)
      
      // 自动模式时，取最近3个启用的品项
      if (productMode === 'auto') {
        const recentProducts = enabledProducts.slice(0, 3)
        setAutoProducts(recentProducts)
      }
    } catch (e) {
      console.error('获取元数据失败:', e)
    }
  }, [productMode, productStatus])

  /* ── 获取有数据的指标 ── */
  const fetchActiveIndicators = useCallback(async () => {
    if (!currentProduct || indicators.length === 0) {
      setActiveIndicators([])
      return
    }

    try {
      // 检查每个指标是否有数据
      const indicatorChecks = await Promise.all(
        indicators.map(async (ind) => {
          try {
            const result = await api.getRecentData({
              indicator_code: ind.code,
              product_code: currentProduct.code,
              limit: 1,
            })
            const data = Array.isArray(result) ? result : result.data || []
            return data.length > 0 ? ind : null
          } catch {
            return null
          }
        })
      )
      
      const active = indicatorChecks.filter(Boolean) as Indicator[]
      setActiveIndicators(active)
    } catch (e) {
      console.error('获取活跃指标失败:', e)
      setActiveIndicators(indicators) // fallback to all
    }
  }, [currentProduct, indicators])

  /* ── 获取趋势数据（限制30条） ── */
  const fetchTrend = useCallback(async () => {
    if (!currentProduct || !currentIndicator) {
      setRecentData([])
      return
    }
    try {
      const result = await api.getRecentData({
        indicator_code: currentIndicator.code,
        product_code: currentProduct.code,
        limit: 30,
      })
      setRecentData(Array.isArray(result) ? result : result.data || [])
    } catch (e) {
      console.error('获取趋势数据失败:', e)
    }
  }, [currentProduct, currentIndicator])

  /* ── 获取过程能力数据（只获取当前品项的） ── */
  const fetchCapMatrix = useCallback(async () => {
    if (!currentProduct || indicators.length === 0) {
      setCapMatrix([])
      return
    }
    try {
      const productLimits = allSpecLimits[currentProduct.code] || {}
      const capIndicators = indicators.filter(ind => {
        const s = productLimits[ind.code]
        return s && s.usl != null && s.lsl != null
      })
      const pairs: Array<[string, string]> = capIndicators.map(ind => [currentProduct.code, ind.code])
      const results = await Promise.all(
        pairs.map(([pc, ic]) => api.getCapabilityData(pc, ic).catch(() => null)),
      )
      setCapMatrix(results.filter(Boolean) as CapabilityData[])
    } catch (e) {
      console.error('获取过程能力数据失败:', e)
    }
  }, [currentProduct, indicators, allSpecLimits])

  /* ── 品项轮换定时器 ── */
  useEffect(() => {
    if (productMode === 'auto' && autoProducts.length > 1) {
      productTimerRef.current = setInterval(() => {
        setAutoProductIndex(prev => (prev + 1) % autoProducts.length)
      }, 30000) // 30秒轮换一次品项
      
      return () => {
        if (productTimerRef.current) {
          clearInterval(productTimerRef.current)
        }
      }
    }
  }, [productMode, autoProducts])

  /* ── 指标跑马灯定时器 ── */
  useEffect(() => {
    if (activeIndicators.length > 1) {
      indicatorTimerRef.current = setInterval(() => {
        setCurrentIndicatorIndex(prev => (prev + 1) % activeIndicators.length)
      }, 10000) // 10秒轮换一次指标
      
      return () => {
        if (indicatorTimerRef.current) {
          clearInterval(indicatorTimerRef.current)
        }
      }
    }
  }, [activeIndicators])

  /* ── lifecycle ── */
  useEffect(() => {
    fetchDashboard()
    fetchMeta()
    websocketService.connect()

    const onData = () => { fetchDashboard(); fetchTrend() }
    const onAlert = () => { fetchDashboard() }
    websocketService.on('data_update', onData)
    websocketService.on('new_alert', onAlert)

    return () => {
      websocketService.off('data_update', onData)
      websocketService.off('new_alert', onAlert)
      websocketService.disconnect()
    }
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [])

  /* ── 品项变化时获取活跃指标 ── */
  useEffect(() => {
    fetchActiveIndicators()
  }, [fetchActiveIndicators])

  /* ── 指标变化时获取趋势数据 ── */
  useEffect(() => {
    fetchTrend()
  }, [fetchTrend])

  /* ── 品项变化时获取过程能力数据 ── */
  useEffect(() => {
    fetchCapMatrix()
  }, [fetchCapMatrix])

  /* ── manual collect ── */
  const handleCollect = async () => {
    setCollecting(true)
    try {
      await api.manualCollect()
      fetchDashboard()
      fetchActiveIndicators() // 重新获取活跃指标
    } catch (e) {
      console.error('手动采集失败:', e)
    } finally {
      setCollecting(false)
    }
  }

  /* ── derived data ── */
  const pendingAlerts = dashboard
    ? (dashboard.pending_alerts?.CRITICAL || 0) + (dashboard.pending_alerts?.WARNING || 0)
    : 0

  const avgCpk = useMemo(() => {
    if (capMatrix.length === 0) return 0
    const sum = capMatrix.reduce((s, c) => s + c.result.cpk, 0)
    return +(sum / capMatrix.length).toFixed(2)
  }, [capMatrix])

  /* ── 变异系数 CV% ── */
  const cvPercent = useMemo(() => {
    if (recentData.length < 2) return null
    const values = recentData.map(d => d.value).filter(v => v != null)
    if (values.length < 2) return null
    const mean = values.reduce((s, v) => s + v, 0) / values.length
    if (mean === 0) return null
    const variance = values.reduce((s, v) => s + Math.pow(v - mean, 2), 0) / (values.length - 1)
    const std = Math.sqrt(variance)
    return +((std / Math.abs(mean)) * 100).toFixed(2)
  }, [recentData])

  /* ── 偏移量（相对目标值） ── */
  const shiftValue = useMemo(() => {
    if (recentData.length === 0 || !currentProduct || !currentIndicator) return null
    const limits = allSpecLimits[currentProduct.code]?.[currentIndicator.code]
    const target = limits?.target
    if (target == null || target === 0) return null
    const values = recentData.map(d => d.value).filter(v => v != null)
    if (values.length === 0) return null
    const mean = values.reduce((s, v) => s + v, 0) / values.length
    return +((mean - target).toFixed(4))
  }, [recentData, currentProduct, currentIndicator, allSpecLimits])

  /* ── 偏移百分比 ── */
  const shiftPercent = useMemo(() => {
    if (shiftValue == null || !currentProduct || !currentIndicator) return null
    const limits = allSpecLimits[currentProduct.code]?.[currentIndicator.code]
    const target = limits?.target
    if (target == null || target === 0) return null
    return +((shiftValue / Math.abs(target)) * 100).toFixed(2)
  }, [shiftValue, currentProduct, currentIndicator, allSpecLimits])

  /* ── trend chart option ── */
  const chartOption: EChartsOption | null = useMemo(() => {
    if (recentData.length === 0 || !currentIndicator) return null

    const sorted = [...recentData].sort(
      (a, b) => new Date(a.sample_time).getTime() - new Date(b.sample_time).getTime(),
    )
    const times = sorted.map(d =>
      new Date(d.sample_time).toLocaleTimeString('zh-CN', { hour: '2-digit', minute: '2-digit' }),
    )
    const values = sorted.map(d => d.value)

    // use first data point's spec limits, or fall back to config spec limits
    const first = sorted[0]
    const dataUsl = first.upper_limit ?? null
    const dataLsl = first.lower_limit ?? null
    const productLimits = currentProduct ? allSpecLimits[currentProduct.code] : undefined
    const configLimits = currentIndicator && productLimits ? productLimits[currentIndicator.code] : undefined
    const usl = dataUsl ?? configLimits?.usl ?? null
    const lsl = dataLsl ?? configLimits?.lsl ?? null

    const markLineData: NonNullable<MarkLineComponentOption['data']> = []
    if (usl !== null) {
      markLineData.push({
        yAxis: usl,
        lineStyle: { color: '#ef4444', type: 'dashed', width: 1 },
        label: { formatter: `USL=${usl}`, color: '#ef4444', fontSize: 10, position: 'end' },
      })
    }
    if (lsl !== null) {
      markLineData.push({
        yAxis: lsl,
        lineStyle: { color: '#ef4444', type: 'dashed', width: 1 },
        label: { formatter: `LSL=${lsl}`, color: '#ef4444', fontSize: 10, position: 'end' },
      })
    }

    return {
      ...chartTheme,
      tooltip: { trigger: 'axis', ...tooltipStyle },
      legend: {
        data: [currentIndicator.name],
        textStyle: { color: '#8b95a7' },
        top: 0,
        right: 10,
      },
      grid: { left: 50, right: 60, top: 40, bottom: 30 },
      xAxis: {
        type: 'category',
        data: times,
        ...chartTheme.xAxis,
      },
      yAxis: { type: 'value', ...chartTheme.yAxis, scale: true },
      series: [
        {
          name: currentIndicator.name,
          type: 'line',
          smooth: true,
          symbol: 'circle',
          symbolSize: 5,
          data: values,
          lineStyle: { color: '#00d4ff', width: 2 },
          itemStyle: { color: '#00d4ff', borderColor: '#0a0e1a', borderWidth: 1 },
          areaStyle: {
            color: {
              type: 'linear',
              x: 0, y: 0, x2: 0, y2: 1,
              colorStops: [
                { offset: 0, color: 'rgba(0,212,255,0.25)' },
                { offset: 1, color: 'rgba(0,212,255,0)' },
              ],
            } as LinearGradientObject,
          },
          ...(markLineData.length > 0
            ? { markLine: { symbol: 'none', silent: true, data: markLineData } }
            : {}),
        },
      ],
    }
  }, [recentData, currentIndicator, currentProduct, allSpecLimits])

  const { containerRef } = useChart(chartOption)

  /* ── product name lookup (with alias support) ── */
  const productNameMap = useMemo(() => {
    const m: Record<string, string> = {}
    products.forEach(p => { 
      m[p.code] = aliases.products[p.code] || p.name 
    })
    return m
  }, [products, aliases.products])

  const indicatorNameMap = useMemo(() => {
    const m: Record<string, string> = {}
    indicators.forEach(i => { 
      m[i.code] = aliases.indicators[i.code] || i.name 
    })
    return m
  }, [indicators, aliases.indicators])

  /* ── status helpers ── */
  const freqLabel = status
    ? `L${status.current_level} · ${status.current_interval_minutes}分钟`
    : 'L0 · 5分钟'

  const isRunning = status?.is_collecting ?? false

  /* ================================================================
   *  Render
   * ================================================================ */
  return (
    <div>
      {/* ─── KPI 卡片 ─── */}
      <div className={styles.kpiGrid} aria-label="关键绩效指标">
        {/* 今日检测 */}
        <div className={`${styles.kpiCard} ${styles.kpiCardCyan}`} aria-label="今日检测">
          <div className={styles.kpiHeader}>
            <span className={styles.kpiLabel}>今日检测</span>
            <div className={styles.kpiIcon}>
              <svg width="18" height="18" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round">
                <path d="M9 11l3 3L22 4" />
                <path d="M21 12v7a2 2 0 01-2 2H5a2 2 0 01-2-2V5a2 2 0 012-2h11" />
              </svg>
            </div>
          </div>
          <div className={styles.kpiValue}>
            {dashboard?.today_data_count ?? 0}<span className={styles.kpiUnit}>次</span>
          </div>
          <div className={`${styles.kpiTrend} ${styles.kpiTrendUp}`}>↑ 数据正常</div>
        </div>

        {/* 待处理预警 */}
        <div className={`${styles.kpiCard} ${styles.kpiCardRed}`} aria-label="待处理预警">
          <div className={styles.kpiHeader}>
            <span className={styles.kpiLabel}>待处理预警</span>
            <div className={styles.kpiIcon}>
              <svg width="18" height="18" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round">
                <path d="M10.29 3.86L1.82 18a2 2 0 001.71 3h16.94a2 2 0 001.71-3L13.71 3.86a2 2 0 00-3.42 0z" />
                <line x1="12" y1="9" x2="12" y2="13" />
                <line x1="12" y1="17" x2="12.01" y2="17" />
              </svg>
            </div>
          </div>
          <div className={styles.kpiValue}>
            {pendingAlerts}<span className={styles.kpiUnit}>条</span>
          </div>
          <div className={`${styles.kpiTrend} ${pendingAlerts > 0 ? styles.kpiTrendDown : styles.kpiTrendFlat}`}>
            {pendingAlerts > 0 ? `↑ ${pendingAlerts}条待处理` : '→ 无预警'}
          </div>
        </div>

        {/* 平均Cpk */}
        <div className={`${styles.kpiCard} ${styles.kpiCardPurple}`} aria-label="平均Cpk">
          <div className={styles.kpiHeader}>
            <span className={styles.kpiLabel}>平均Cpk</span>
            <div className={styles.kpiIcon}>
              <svg width="18" height="18" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round">
                <circle cx="12" cy="12" r="10" />
                <circle cx="12" cy="12" r="6" />
                <circle cx="12" cy="12" r="2" />
              </svg>
            </div>
          </div>
          <div className={styles.kpiValue}>
            {avgCpk || '-'}<span className={styles.kpiUnit} />
          </div>
          <div className={`${styles.kpiTrend} ${avgCpk >= 1.33 ? styles.kpiTrendFlat : styles.kpiTrendDown}`}>
            {avgCpk >= 1.33 ? '→ 能力充足' : avgCpk >= 1.0 ? '→ 能力勉强' : '→ 能力不足'}
          </div>
        </div>

        {/* 变异系数 CV% */}
        <div className={`${styles.kpiCard} ${styles.kpiCardBlue}`} aria-label="变异系数">
          <div className={styles.kpiHeader}>
            <span className={styles.kpiLabel}>变异 (CV%)</span>
            <div className={styles.kpiIcon}>
              <svg width="18" height="18" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round">
                <polyline points="22 12 18 12 15 21 9 3 6 12 2 12" />
              </svg>
            </div>
          </div>
          <div className={styles.kpiValue}>
            {cvPercent != null ? cvPercent : '-'}<span className={styles.kpiUnit}>%</span>
          </div>
          <div className={`${styles.kpiTrend} ${cvPercent != null && cvPercent <= 5 ? styles.kpiTrendFlat : styles.kpiTrendDown}`}>
            {cvPercent != null ? (cvPercent <= 5 ? '→ 稳定' : cvPercent <= 10 ? '→ 波动' : '→ 不稳定') : '→ 无数据'}
          </div>
        </div>

        {/* 偏移量 */}
        <div className={`${styles.kpiCard} ${styles.kpiCardOrange}`} aria-label="偏移">
          <div className={styles.kpiHeader}>
            <span className={styles.kpiLabel}>偏移</span>
            <div className={styles.kpiIcon}>
              <svg width="18" height="18" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round">
                <line x1="12" y1="19" x2="12" y2="5" />
                <polyline points="5 12 12 5 19 12" />
              </svg>
            </div>
          </div>
          <div className={styles.kpiValue}>
            {shiftPercent != null ? `${shiftPercent > 0 ? '+' : ''}${shiftPercent}` : '-'}<span className={styles.kpiUnit}>%</span>
          </div>
          <div className={`${styles.kpiTrend} ${shiftPercent != null && Math.abs(shiftPercent) <= 5 ? styles.kpiTrendFlat : styles.kpiTrendDown}`}>
            {shiftPercent != null ? (Math.abs(shiftPercent) <= 5 ? '→ 正常' : Math.abs(shiftPercent) <= 15 ? '→ 偏离' : '→ 严重偏离') : '→ 无目标值'}
          </div>
        </div>
      </div>

      {/* ─── 实时趋势 + 采集状态 ─── */}
      <div className={styles.grid21}>
        {/* 趋势图 */}
        <div className={styles.panel}>
          <div className={styles.panelHeader}>
            <div className={styles.panelTitle}>
              <span className={styles.panelTitleIcon}>
                <svg width="16" height="16" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round">
                  <polyline points="22 12 18 12 15 21 9 3 6 12 2 12" />
                </svg>
              </span>
              实时数据趋势
              <span className={styles.liveIndicator} aria-live="polite">LIVE</span>
              {/* 品项选择器 */}
              <div className={styles.productSelector}>
                <select
                  className={styles.productSelect}
                  value={productMode === 'manual' ? selectedProduct : 'auto'}
                  onChange={e => {
                    const value = e.target.value
                    if (value === 'auto') {
                      setProductMode('auto')
                      setAutoProductIndex(0)
                      localStorage.setItem('dashboard_product_mode', 'auto')
                      localStorage.removeItem('dashboard_selected_product')
                    } else {
                      setProductMode('manual')
                      setSelectedProduct(value)
                      localStorage.setItem('dashboard_product_mode', 'manual')
                      localStorage.setItem('dashboard_selected_product', value)
                    }
                  }}
                >
                  <option value="auto">🔄 自动轮换</option>
                  {products.map(p => (
                    <option key={p.code} value={p.code}>{productNameMap[p.code] || p.name}</option>
                  ))}
                </select>
              </div>
            </div>
            <div className={styles.panelActions}>
              {/* 指标指示器 */}
              {activeIndicators.length > 1 && (
                <div className={styles.indicatorDots}>
                  {activeIndicators.map((ind, idx) => (
                    <span
                      key={ind.code}
                      className={`${styles.indicatorDot} ${idx === currentIndicatorIndex ? styles.indicatorDotActive : ''}`}
                      title={indicatorNameMap[ind.code] || ind.name}
                    />
                  ))}
                </div>
              )}
              {/* 当前指标名称 */}
              {currentIndicator && (
                <span className={styles.currentIndicator}>
                  {indicatorNameMap[currentIndicator.code] || currentIndicator.name}
                </span>
              )}
            </div>
          </div>
          <div className={styles.panelBody}>
            <div ref={containerRef} className={styles.chartContainer} />
            {/* 当前品项和指标信息 */}
            <div className={styles.productInfo}>
              {currentProduct && (
                <>
                  <span>
                    监测品项: {productNameMap[currentProduct.code] || currentProduct.name}
                    {productMode === 'auto' && (
                      <span className={styles.autoLabel}>
                        (自动 {autoProductIndex + 1}/{autoProducts.length})
                      </span>
                    )}
                  </span>
                  {currentIndicator && (
                    <span>
                      检验项目: {indicatorNameMap[currentIndicator.code] || currentIndicator.name}
                      {activeIndicators.length > 1 && (
                        <span className={styles.indicatorLabel}>
                          ({currentIndicatorIndex + 1}/{activeIndicators.length})
                        </span>
                      )}
                    </span>
                  )}
                </>
              )}
            </div>
          </div>
        </div>

        {/* 采集状态 */}
        <div className={styles.panel}>
          <div className={styles.panelHeader}>
            <div className={styles.panelTitle}>
              <span className={styles.panelTitleIcon}>
                <svg width="16" height="16" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round">
                  <circle cx="12" cy="12" r="10" /><polyline points="12 6 12 12 16 14" />
                </svg>
              </span>
              采集状态
            </div>
          </div>
          <div className={styles.panelBody}>
            <div className={styles.collectStatus}>
              <div className={styles.collectStatusItem}>
                <span className={styles.collectLabel}>当前频率</span>
                <span className={`${styles.collectValue} ${styles.collectValueCyan}`}>{freqLabel}</span>
              </div>
              <div className={styles.collectStatusItem}>
                <span className={styles.collectLabel}>运行状态</span>
                <span className={`${styles.collectValue} ${styles.collectValueGreen}`}>
                  {isRunning ? '● 采集中...' : '● 正常运行'}
                </span>
              </div>
              <div className={styles.collectStatusItem}>
                <span className={styles.collectLabel}>上次采集</span>
                <span className={styles.collectValue}>{fmtTime(status?.last_collect_time)}</span>
              </div>
              <div className={styles.collectStatusItem}>
                <span className={styles.collectLabel}>下次采集</span>
                <span className={styles.collectValue}>{fmtTime(status?.next_collect_time)}</span>
              </div>
              <div className={styles.collectStatusItem}>
                <span className={styles.collectLabel}>今日成功率</span>
                <span className={`${styles.collectValue} ${dashboard?.today_collect_attempts ? styles.collectValueGreen : ''}`}>
                  {dashboard?.today_collect_attempts ? `${((dashboard.today_collect_success / dashboard.today_collect_attempts) * 100).toFixed(1)}%` : '-'}
                </span>
              </div>
              <div className={styles.collectStatusItem}>
                <span className={styles.collectLabel}>数据源连接</span>
                <span className={`${styles.collectValue} ${status?.connected ? styles.collectValueGreen : styles.collectValueRed}`}>
                  {status?.connected ? '● 已连接' : '○ 未连接'}
                </span>
              </div>
              <button
                className={styles.btnPrimary}
                onClick={handleCollect}
                disabled={collecting}
              >
                {collecting ? '采集中...' : '立即采集'}
              </button>
            </div>
          </div>
        </div>
      </div>

      {/* ─── 品项Cpk矩阵 + 最新预警 ─── */}
      <div className={styles.grid2}>
        {/* Cpk 矩阵 */}
        <div className={styles.panel}>
          <div className={styles.panelHeader}>
            <div className={styles.panelTitle}>
              <span className={styles.panelTitleIcon}>
                <svg width="16" height="16" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round">
                  <circle cx="12" cy="12" r="10" /><circle cx="12" cy="12" r="6" /><circle cx="12" cy="12" r="2" />
                </svg>
              </span>
              品项过程能力概览
              {currentProduct && (
                <span className={styles.productBadge}>{productNameMap[currentProduct.code] || currentProduct.name}</span>
              )}
            </div>
          </div>
          <div className={styles.panelBody}>
            {capMatrix.length > 0 ? (
              <div className={styles.productMatrix}>
                {capMatrix.map((cap, idx) => {
                  const level = cpkLevel(cap.result.cpk)
                  return (
                    <div
                      key={`${cap.product_code}-${cap.indicator_code}-${idx}`}
                      className={styles.productMatrixItem}
                      style={{ borderColor: cpkBorderStyle(level) }}
                    >
                      <div className={styles.pmName}>
                        {indicatorNameMap[cap.indicator_code] || cap.indicator_code}
                      </div>
                      <div
                        className={styles.pmCpk}
                        style={{ color: level === 'good' ? 'var(--accent-green)' : level === 'warn' ? 'var(--accent-orange)' : 'var(--accent-red)' }}
                      >
                        {cap.result.cpk.toFixed(2)}
                      </div>
                      <div className={`${styles.pmStatus} ${level === 'good' ? styles.pmStatusGood : level === 'warn' ? styles.pmStatusWarn : styles.pmStatusBad}`}>
                        {cpkLabel(level)}
                      </div>
                    </div>
                  )
                })}
              </div>
            ) : (
              <div style={{ textAlign: 'center', padding: 40, color: 'var(--text-muted)' }}>
                暂无过程能力数据
              </div>
            )}
          </div>
        </div>

        {/* 最新预警 */}
        <div className={styles.panel}>
          <div className={styles.panelHeader}>
            <div className={styles.panelTitle}>
              <span className={styles.panelTitleIcon}>
                <svg width="16" height="16" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round">
                  <path d="M10.29 3.86L1.82 18a2 2 0 0 0 1.71 3h16.94a2 2 0 0 0 1.71-3L13.71 3.86a2 2 0 0 0-3.42 0z" />
                  <line x1="12" y1="9" x2="12" y2="13" /><line x1="12" y1="17" x2="12.01" y2="17" />
                </svg>
              </span>
              最新预警
            </div>
            <button className={styles.btnGhost} onClick={() => window.location.href = '/alerts'}>
              查看全部 →
            </button>
          </div>
          <div className={`${styles.panelBody} ${styles.panelBodyFlush}`}>
            <table className={styles.dataTable} aria-label="监控数据表">
              <thead>
                <tr>
                  <th>品项</th>
                  <th>项目</th>
                  <th>检测值</th>
                  <th>预警级别</th>
                  <th>规则类型</th>
                  <th>预警时间</th>
                  <th>状态</th>
                </tr>
              </thead>
              <tbody>
                {dashboard?.recent_alerts && dashboard.recent_alerts.length > 0 ? (
                  dashboard.recent_alerts.map(alert => {
                    const rule = alertRules[alert.rule_type || '']
                    const ruleName = rule?.rule || ruleTypeLabel[alert.rule_type || ''] || alert.rule_type || alert.alert_type || '-'
                    const isPending = alert.status === 'pending'
                    return (
                      <tr key={alert.id}>
                        <td>{aliases.products[alert.product_code || ''] || alert.product_code || '-'}</td>
                        <td>{aliases.indicators[alert.indicator_code || ''] || alert.indicator_code || '-'}</td>
                        <td>{alert.test_value != null ? Number(alert.test_value).toFixed(2) : '-'}</td>
                        <td>
                          <span className={`${styles.tag} ${severityTagClass[alert.severity] || ''}`}>
                            {severityLabel[alert.severity] || alert.severity}
                          </span>
                        </td>
                        <td title={rule?.description || undefined}>{ruleName}</td>
                        <td>{fmtTime(alert.created_at)}</td>
                        <td>
                          <span className={`${styles.tag} ${isPending ? styles.tagCritical : ''}`}>
                            {isPending ? '待处理' : '已处理'}
                          </span>
                        </td>
                      </tr>
                    )
                  })
                ) : (
                  <tr>
                    <td colSpan={7} style={{ textAlign: 'center', padding: 24, color: 'var(--text-muted)' }}>
                      暂无预警
                    </td>
                  </tr>
                )}
              </tbody>
            </table>
          </div>
        </div>
      </div>
    </div>
  )
}

export default Dashboard
