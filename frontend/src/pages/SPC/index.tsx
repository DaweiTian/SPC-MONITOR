import React, { useState, useEffect, useMemo, useCallback, useRef } from 'react'
import { useSearchParams } from 'react-router-dom'
import type { EChartsOption, DefaultLabelFormatterCallbackParams, MarkLineComponentOption } from 'echarts'
import { useChart, chartTheme, tooltipStyle } from '../../components/Charts'
import { useProducts, useIndicators, useAppMetadata } from '../../hooks'
import { api } from '../../services'
import { escapeHtml } from '../../utils/html'
import type { SPCData, EChartsParam } from '../../types'
import styles from './SPC.module.css'

export const SPCPage: React.FC = () => {
  const [searchParams] = useSearchParams()
  const { products } = useProducts()
  const { indicators } = useIndicators()
  const { productStatus, getIndicatorName, aliases } = useAppMetadata()
  const [spcData, setSPCData] = useState<SPCData | null>(null)
  const [loading, setLoading] = useState(false)
  const [initialized, setInitialized] = useState(false)
  const [savedIndicators, setSavedIndicators] = useState<Record<string, string[]>>({})
  const [savedIndicatorsLoaded, setSavedIndicatorsLoaded] = useState(false)
  const [predData, setPredData] = useState<{ enabled: boolean; data: Array<{ value: number; sample_time: string }>; model_info: { target_name: string; coefficient: number; formula: string; method?: string; method_label?: string } | null } | null>(null)
  const [predictionConfig, setPredictionConfig] = useState<Record<string, Record<string, { source_indicator: string; coefficient: number; enabled: boolean }>>>({})
  const [filter, setFilter] = useState({
    product_code: '',
    indicator_code: 'fat',
    window: 30,
    date_from: '',
    date_to: '',
    remark: '',
  })
  const [analysisMode, setAnalysisMode] = useState<'process' | 'stability'>('process')
  const [chartType, setChartType] = useState<'imr' | 'ewma'>('imr')
  const [ewmaLambda, setEwmaLambda] = useState(0.2)

  // AbortController ref for cancelling in-flight requests
  const abortRef = useRef<AbortController | null>(null)

  // Load saved indicators per product
  useEffect(() => {
    api.getSavedIndicators().then(data => { setSavedIndicators(data); setSavedIndicatorsLoaded(true) }).catch(() => setSavedIndicatorsLoaded(true))
    api.getPredictionConfig().then(setPredictionConfig).catch(() => {})
  }, [])

  // Fetch prediction data when current indicator is a source for some prediction
  useEffect(() => {
    const prodPreds = predictionConfig[filter.product_code] || {}
    const matchingTarget = Object.entries(prodPreds).find(
      ([, cfg]) => cfg.source_indicator === filter.indicator_code && cfg.enabled
    )
    if (matchingTarget) {
      const [targetCode] = matchingTarget
      api.getCrossIndicatorPrediction(filter.product_code, targetCode, 100)
        .then(setPredData).catch(() => setPredData(null))
    } else {
      setPredData(null)
    }
  }, [filter.product_code, filter.indicator_code, predictionConfig])

  // Filter out disabled products (show all until status loaded)
  const enabledProducts = useMemo(() =>
    productStatus === null ? products : products.filter(p => productStatus[p.code] !== 'disabled'),
    [products, productStatus]
  )

  // Filter indicators: only show those configured for the selected product
  const filteredIndicators = useMemo(() => {
    if (!filter.product_code) return indicators
    const saved = savedIndicators[filter.product_code]
    if (!saved || saved.length === 0) return indicators
    return indicators.filter(i => saved.includes(i.code))
  }, [indicators, savedIndicators, filter.product_code])

  // Set initial product/indicator: URL params > Dashboard saved > first enabled
  useEffect(() => {
    if (initialized || enabledProducts.length === 0 || !savedIndicatorsLoaded) return
    const urlProduct = searchParams.get('product')
    const urlIndicator = searchParams.get('indicator')
    const dashboardProduct = (() => { try { return localStorage.getItem('dashboard_selected_product') } catch { return null } })()
    const productFromUrl = urlProduct && enabledProducts.find(p => p.code === urlProduct)
    const productFromDash = dashboardProduct && enabledProducts.find(p => p.code === dashboardProduct)
    const initProduct = productFromUrl ? productFromUrl.code : productFromDash ? productFromDash.code : enabledProducts[0].code

    // Pick initial indicator: URL > saved indicators for product > first available
    let initIndicator: string | undefined
    if (urlIndicator && indicators.find(i => i.code === urlIndicator)) {
      initIndicator = urlIndicator
    } else {
      const saved = savedIndicators[initProduct]
      if (saved && saved.length > 0) {
        initIndicator = saved[0]
      } else if (indicators.length > 0) {
        initIndicator = indicators[0].code
      }
    }

    setFilter(f => ({
      ...f,
      product_code: initProduct,
      ...(initIndicator ? { indicator_code: initIndicator } : {}),
    }))
    setInitialized(true)
  }, [enabledProducts, productStatus, indicators, savedIndicators, savedIndicatorsLoaded, initialized, searchParams])

  // When product changes, auto-select first saved indicator if current isn't in list
  useEffect(() => {
    if (!initialized || !filter.product_code) return
    const saved = savedIndicators[filter.product_code]
    if (saved && saved.length > 0 && !saved.includes(filter.indicator_code)) {
      setFilter(f => ({ ...f, indicator_code: saved[0] }))
    }
  }, [initialized, filter.product_code, savedIndicators])

  // Auto-fetch when product or indicator changes (only after initialization)
  const fetchSPCData = useCallback(async (productCode: string, indicatorCode: string, window: number, filters?: { date_from?: string; date_to?: string; remark?: string }, mode?: string, chartTypeParam?: string, lambdaParam?: number) => {
    if (!productCode || !indicatorCode) return
    abortRef.current?.abort()
    abortRef.current = new AbortController()
    const { signal } = abortRef.current
    setLoading(true)
    try {
      const data = await api.getSPCData(productCode, indicatorCode, window, filters, mode, chartTypeParam, lambdaParam, { signal })
      setSPCData(data)
    } catch (e: unknown) {
      if (e instanceof Error && (e.name === 'AbortError' || e.name === 'CanceledError' || e.message === 'canceled')) return
      console.error('获取SPC数据失败:', e)
    } finally {
      setLoading(false)
    }
  }, [])

  const hasDateOrRemarkFilter = filter.date_from || filter.date_to || filter.remark

  useEffect(() => {
    if (initialized && filter.product_code && filter.indicator_code) {
      const filters = hasDateOrRemarkFilter
        ? { date_from: filter.date_from || undefined, date_to: filter.date_to || undefined, remark: filter.remark || undefined }
        : undefined
      fetchSPCData(filter.product_code, filter.indicator_code, filter.window, filters, analysisMode, chartType, ewmaLambda)
    }
    return () => { abortRef.current?.abort() }
  }, [initialized, filter.product_code, filter.indicator_code, filter.window, filter.date_from, filter.date_to, filter.remark, analysisMode, chartType, ewmaLambda, fetchSPCData])

  // getIndicatorName provided by useAppMetadata hook

  // Compute derived values
  const stats = useMemo(() => {
    if (!spcData) return null
    const { data_points, spec_limits, violations, sigma } = spcData
    const mean = spec_limits.mean
    const std = spec_limits.std || sigma
    const violationCount = data_points.filter(p => p.is_violation).length
    const total = data_points.length

    // Process status: only check recent 10 points for current state
    const recentN = Math.min(10, total)
    const recentStart = total - recentN
    const recentViolationCount = violations.filter(v =>
      v.violation_points.some((i: number) => i >= recentStart)
    ).length
    let status = '受控'
    if (recentViolationCount > 2) status = '失控'
    else if (recentViolationCount > 0) status = '基本受控'
    return { mean, std, violationCount, total, status }
  }, [spcData])

  // Compute MR values and timestamps from data points
  const mrData = useMemo(() => {
    if (!spcData) return { values: [], times: [] }
    const { data_points } = spcData
    const mrs: number[] = []
    const times: string[] = []
    for (let i = 1; i < data_points.length; i++) {
      mrs.push(Math.abs(data_points[i].value - data_points[i - 1].value))
      times.push(data_points[i].time)
    }
    return { values: mrs, times }
  }, [spcData])

  // Format time for x-axis display (handles both "2025-07-13 10:30:00" and ISO "2025-07-13T10:30:00")
  const formatTime = (timeStr: string) => {
    if (!timeStr) return ''
    const parts = timeStr.includes('T') ? timeStr.split('T') : timeStr.split(' ')
    const timePart = parts.length > 1 ? parts[1] : parts[0]
    return timePart.substring(0, 5)
  }

  // I Chart option
  const iChartOption = useMemo<EChartsOption | null>(() => {
    if (!spcData || !spcData.i_chart) return null
    const { data_points, i_chart, spec_limits } = spcData
    const times = data_points.map(p => formatTime(p.time))
    const values = data_points.map(p => p.value)
    const { ucl, cl, lcl } = i_chart
    const { usl, lsl } = spec_limits

    const markLineData: NonNullable<MarkLineComponentOption['data']> = [
      {
        yAxis: ucl,
        lineStyle: { color: '#f59e0b', type: 'dashed' },
        label: { formatter: `UCL=${ucl.toFixed(3)}`, color: '#f59e0b', fontSize: 10, position: 'insideEndTop' },
      },
      {
        yAxis: cl,
        lineStyle: { color: '#94a3b8', type: 'solid', width: 1 },
        label: { formatter: `CL=${cl.toFixed(3)}`, color: '#94a3b8', fontSize: 10, position: 'insideEndTop' },
      },
      {
        yAxis: lcl,
        lineStyle: { color: '#f59e0b', type: 'dashed' },
        label: { formatter: `LCL=${lcl.toFixed(3)}`, color: '#f59e0b', fontSize: 10, position: 'insideEndTop' },
      },
    ]

    if (usl != null) {
      markLineData.push({
        yAxis: usl,
        lineStyle: { color: '#ef4444', type: 'dotted', width: 1.5 },
        label: { formatter: `USL=${usl}`, color: '#ef4444', fontSize: 10, position: 'insideEndTop' },
      })
    }
    if (lsl != null) {
      markLineData.push({
        yAxis: lsl,
        lineStyle: { color: '#ef4444', type: 'dotted', width: 1.5 },
        label: { formatter: `LSL=${lsl}`, color: '#ef4444', fontSize: 10, position: 'insideEndTop' },
      })
    }

    // Prediction overlay data — use full timestamp for exact matching (avoids HH:MM collisions)
    const showPrediction = predData?.enabled && predData.data && predData.data.length > 0
    let predValues: (number | null)[] = []
    if (showPrediction) {
      const predMap = new Map(predData!.data.map(d => [d.sample_time, d.value]))
      predValues = data_points.map(p => predMap.get(p.time) ?? null)
    }

    return {
      ...chartTheme,
      tooltip: {
        trigger: 'axis',
        ...tooltipStyle,
        formatter: (params: DefaultLabelFormatterCallbackParams | DefaultLabelFormatterCallbackParams[]) => {
          const p = (Array.isArray(params) ? params[0] : params) as unknown as EChartsParam
          const idx = p.dataIndex
          const pt = data_points[idx]
          const sampleInfo = pt?.sample_id ? `<br/>样品编码: ${escapeHtml(pt.sample_id)}` : ''
          const remarkInfo = pt?.remark ? `<br/>备注: ${escapeHtml(pt.remark)}` : ''
          const violation = pt?.is_violation ? '<br/><span style="color:#ef4444;font-weight:bold">⚠ 违规点</span>' : ''
          const predInfo = (showPrediction && predValues[idx] != null)
            ? `<br/><span style="color:#f59e0b">● ${predData?.model_info?.target_name || '预测'}(${predData?.model_info?.method_label || ''}): <b>${predValues[idx]?.toFixed(4)}</b></span>`
            : ''
          return `<b>${escapeHtml(pt?.time ?? '')}</b>${sampleInfo}${remarkInfo}<br/>值: <b>${escapeHtml(String(p.value))}</b>${violation}${predInfo}`
        },
      },
      grid: { left: 50, right: showPrediction ? 90 : 80, top: 30, bottom: 30 },
      xAxis: {
        type: 'category',
        data: times,
        ...chartTheme.xAxis,
        axisLabel: { ...(chartTheme.xAxis as { axisLabel?: Record<string, unknown> })?.axisLabel, rotate: times.length > 15 ? 30 : 0 },
      },
      yAxis: showPrediction
        ? [
            { type: 'value' as const, ...chartTheme.yAxis, scale: true },
            {
              type: 'value' as const, position: 'right' as const, splitLine: { show: false },
              axisLabel: { color: '#f59e0b', fontSize: 10 },
              axisLine: { show: true, lineStyle: { color: '#f59e0b' } },
            },
          ]
        : { type: 'value' as const, ...chartTheme.yAxis, scale: true },
      series: [{
        name: '单值',
        type: 'line',
        symbol: 'circle',
        symbolSize: 7,
        data: values.map((v) => ({
          value: v,
          itemStyle: (v > ucl || v < lcl || (usl != null && v > usl) || (lsl != null && v < lsl))
            ? { color: '#ef4444' }
            : { color: '#00d4ff' },
        })),
        lineStyle: { color: '#00d4ff', width: 2 },
        markLine: {
          symbol: 'none',
          silent: true,
          data: markLineData,
        },
      }, {
        name: '_ref',
        type: 'scatter' as const,
        symbolSize: 0,
        data: [ucl, cl, lcl, ...(usl != null ? [usl] : []), ...(lsl != null ? [lsl] : [])],
        silent: true,
      }, ...(showPrediction ? [{
        name: `${predData?.model_info?.target_name || '预测值'}(${predData?.model_info?.method_label || ''})`,
        type: 'line' as const,
        yAxisIndex: 1,
        symbol: 'emptyCircle' as const,
        symbolSize: 6,
        data: predValues,
        lineStyle: { color: '#f59e0b', width: 2, type: 'dashed' as const },
        itemStyle: { color: '#f59e0b' },
        connectNulls: true,
      }] : [])],
    }
  }, [spcData, predData])

  // MR Chart option
  const mrChartOption = useMemo<EChartsOption | null>(() => {
    if (!spcData || !spcData.mr_chart || mrData.values.length === 0) return null
    const { mr_chart, data_points } = spcData
    const { ucl, cl } = mr_chart
    const times = mrData.times.map(t => formatTime(t))

    return {
      ...chartTheme,
      tooltip: {
        trigger: 'axis',
        ...tooltipStyle,
        formatter: (params: DefaultLabelFormatterCallbackParams | DefaultLabelFormatterCallbackParams[]) => {
          const p = (Array.isArray(params) ? params[0] : params) as unknown as EChartsParam
          const idx = p.dataIndex
          const time = mrData.times[idx]
          const mrValue = p.value as number
          const pt = data_points[idx]
          const sampleInfo = pt?.sample_id ? `<br/>样品编码: ${escapeHtml(pt.sample_id)}` : ''
          const remarkInfo = pt?.remark ? `<br/>备注: ${escapeHtml(pt.remark)}` : ''
          const violation = mrValue > ucl ? '<br/><span style="color:#ef4444;font-weight:bold">⚠ 超出UCL</span>' : ''
          return `<b>${escapeHtml(time)}</b>${sampleInfo}${remarkInfo}<br/>MR: <b>${escapeHtml(String(mrValue))}</b>${violation}`
        },
      },
      grid: { left: 50, right: 80, top: 20, bottom: 30 },
      xAxis: {
        type: 'category',
        data: times,
        ...chartTheme.xAxis,
        axisLabel: { ...(chartTheme.xAxis as { axisLabel?: Record<string, unknown> })?.axisLabel, rotate: times.length > 15 ? 30 : 0 },
      },
      yAxis: { type: 'value' as const, ...chartTheme.yAxis, scale: true },
      series: [{
        name: '移动极差',
        type: 'line',
        symbol: 'circle',
        symbolSize: 6,
        data: mrData.values.map((v) => ({
          value: parseFloat(v.toFixed(3)),
          itemStyle: v > ucl ? { color: '#ef4444' } : { color: '#8b5cf6' },
        })),
        lineStyle: { color: '#8b5cf6', width: 2 },
        markLine: {
          symbol: 'none',
          silent: true,
          data: [
            {
              yAxis: ucl,
              lineStyle: { color: '#f59e0b', type: 'dashed' },
              label: { formatter: `UCL=${ucl.toFixed(3)}`, color: '#f59e0b', fontSize: 10, position: 'insideEndTop' },
            },
            {
              yAxis: cl,
              lineStyle: { color: '#94a3b8', type: 'solid', width: 1 },
              label: { formatter: `CL=${cl.toFixed(3)}`, color: '#94a3b8', fontSize: 10, position: 'insideEndTop' },
            },
          ],
        },
      }],
    }
  }, [spcData, mrData])

  // EWMA Chart option
  const ewmaChartOption = useMemo<EChartsOption | null>(() => {
    if (!spcData || chartType !== 'ewma' || !spcData.ewma_chart) return null
    const { ewma_chart, data_points, spec_limits } = spcData
    const { values, ucl, lcl, cl, violations } = ewma_chart
    const times = data_points.map(p => formatTime(p.time))
    const { usl, lsl } = spec_limits

    const markLineData: NonNullable<MarkLineComponentOption['data']> = [
      {
        yAxis: cl,
        lineStyle: { color: '#94a3b8', type: 'solid', width: 1 },
        label: { formatter: `CL=${cl.toFixed(3)}`, color: '#94a3b8', fontSize: 10, position: 'insideEndTop' },
      },
    ]

    if (usl != null) {
      markLineData.push({
        yAxis: usl,
        lineStyle: { color: '#ef4444', type: 'dotted', width: 1.5 },
        label: { formatter: `USL=${usl}`, color: '#ef4444', fontSize: 10, position: 'insideEndTop' },
      })
    }
    if (lsl != null) {
      markLineData.push({
        yAxis: lsl,
        lineStyle: { color: '#ef4444', type: 'dotted', width: 1.5 },
        label: { formatter: `LSL=${lsl}`, color: '#ef4444', fontSize: 10, position: 'insideEndTop' },
      })
    }

    const violationSet = new Set(violations)

    return {
      ...chartTheme,
      tooltip: {
        trigger: 'axis',
        ...tooltipStyle,
        formatter: (params: DefaultLabelFormatterCallbackParams | DefaultLabelFormatterCallbackParams[]) => {
          const p = (Array.isArray(params) ? params[0] : params) as unknown as EChartsParam
          const idx = p.dataIndex
          const pt = data_points[idx]
          const sampleInfo = pt?.sample_id ? `<br/>样品编码: ${escapeHtml(pt.sample_id)}` : ''
          const remarkInfo = pt?.remark ? `<br/>备注: ${escapeHtml(pt.remark)}` : ''
          const isViolation = violationSet.has(idx)
          const violation = isViolation ? '<br/><span style="color:#ef4444;font-weight:bold">⚠ 越界点</span>' : ''
          const uclVal = ucl[idx]?.toFixed(4) ?? '-'
          const lclVal = lcl[idx]?.toFixed(4) ?? '-'
          return `<b>${escapeHtml(pt?.time ?? '')}</b>${sampleInfo}${remarkInfo}<br/>EWMA: <b>${escapeHtml(String((p.value as number).toFixed(4)))}</b><br/>UCL: ${uclVal} / LCL: ${lclVal}${violation}`
        },
      },
      grid: { left: 50, right: 80, top: 30, bottom: 30 },
      xAxis: {
        type: 'category',
        data: times,
        ...chartTheme.xAxis,
        axisLabel: { ...(chartTheme.xAxis as { axisLabel?: Record<string, unknown> })?.axisLabel, rotate: times.length > 15 ? 30 : 0 },
      },
      yAxis: { type: 'value' as const, ...chartTheme.yAxis, scale: true },
      series: [
        {
          name: 'EWMA',
          type: 'line',
          smooth: true,
          symbol: 'circle',
          symbolSize: 6,
          data: values.map((v, i) => ({
            value: parseFloat(v.toFixed(4)),
            itemStyle: violationSet.has(i)
              ? { color: '#ef4444' }
              : { color: '#8b5cf6' },
          })),
          lineStyle: { color: '#8b5cf6', width: 2 },
          markLine: {
            symbol: 'none',
            silent: true,
            data: markLineData,
          },
        },
        {
          name: 'UCL',
          type: 'line',
          symbol: 'none',
          lineStyle: { color: '#f59e0b', type: 'dashed', width: 1.5 },
          data: ucl.map(v => parseFloat(v.toFixed(4))),
          z: 1,
        },
        {
          name: 'LCL',
          type: 'line',
          symbol: 'none',
          lineStyle: { color: '#f59e0b', type: 'dashed', width: 1.5 },
          data: lcl.map(v => parseFloat(v.toFixed(4))),
          z: 1,
        },
        {
          name: '_ref',
          type: 'scatter' as const,
          symbolSize: 0,
          data: [cl, ...(usl != null ? [usl] : []), ...(lsl != null ? [lsl] : [])],
          silent: true,
        },
      ],
    }
  }, [spcData, chartType])

  const { containerRef: iChartRef, chartClassName: iChartClassName } = useChart(iChartOption)
  const { containerRef: mrChartRef, chartClassName: mrChartClassName } = useChart(mrChartOption)
  const { containerRef: ewmaChartRef, chartClassName: ewmaChartClassName } = useChart(ewmaChartOption)

  return (
    <div className={styles.page}>
      {/* Filter Bar */}
      <div className={styles.filterBar}>
        <div className={styles.filterGroup}>
          <span className={styles.filterLabel}>分析模式</span>
          <select
            className={styles.filterSelect}
            value={analysisMode}
            onChange={e => setAnalysisMode(e.target.value as 'process' | 'stability')}
          >
            <option value="process">过程分析</option>
            <option value="stability">稳定性分析</option>
          </select>
        </div>
        <div className={styles.filterGroup}>
          <span className={styles.filterLabel}>品项</span>
          <select
            className={styles.filterSelect}
            value={filter.product_code}
            onChange={e => setFilter(f => ({ ...f, product_code: e.target.value }))}
          >
            {enabledProducts.map((p, index) => (
              <option key={`${p.code}-${index}`} value={p.code}>{aliases.products[p.code] || p.name}</option>
            ))}
          </select>
        </div>
        <div className={styles.filterGroup}>
          <span className={styles.filterLabel}>指标</span>
          <select
            className={styles.filterSelect}
            value={filter.indicator_code}
            onChange={e => setFilter(f => ({ ...f, indicator_code: e.target.value }))}
          >
            {filteredIndicators.map(i => (
              <option key={i.code} value={i.code}>{getIndicatorName(i.code)}</option>
            ))}
          </select>
        </div>
        <div className={styles.filterGroup}>
          <span className={styles.filterLabel}>窗口</span>
          <div className={styles.stepper}>
            <button
              className={styles.stepperBtn}
              onClick={() => setFilter(f => ({ ...f, window: Math.max(10, f.window - 10) }))}
              disabled={filter.window <= 10 || !!hasDateOrRemarkFilter}
              aria-label="减少窗口"
            >−</button>
            <span className={styles.stepperValue}>{filter.window}</span>
            <button
              className={styles.stepperBtn}
              onClick={() => setFilter(f => ({ ...f, window: Math.min(100, f.window + 10) }))}
              disabled={filter.window >= 100 || !!hasDateOrRemarkFilter}
              aria-label="增加窗口"
            >+</button>
          </div>
        </div>
        <div className={styles.filterDivider} />
        <div className={styles.filterGroup}>
          <span className={styles.filterLabel}>开始日期</span>
          <input
            type="date"
            className={styles.filterDateInput}
            value={filter.date_from}
            onChange={e => setFilter(f => ({ ...f, date_from: e.target.value }))}
          />
        </div>
        <div className={styles.filterGroup}>
          <span className={styles.filterLabel}>结束日期</span>
          <input
            type="date"
            className={styles.filterDateInput}
            value={filter.date_to}
            onChange={e => setFilter(f => ({ ...f, date_to: e.target.value }))}
          />
        </div>
        <div className={styles.filterGroup}>
          <span className={styles.filterLabel}>备注</span>
          <input
            type="text"
            className={styles.filterTextInput}
            placeholder="模糊搜索备注..."
            value={filter.remark}
            onChange={e => setFilter(f => ({ ...f, remark: e.target.value }))}
          />
        </div>
        {hasDateOrRemarkFilter && (
          <button
            className={styles.btnReset}
            onClick={() => setFilter(f => ({ ...f, date_from: '', date_to: '', remark: '' }))}
          >重置筛选</button>
        )}
        {loading && <span className={styles.loadingText}>加载中...</span>}
      </div>

      {/* KPI Stats Cards */}
      <div className={styles.kpiGrid}>
        <div className={`${styles.kpiCard} ${styles.kpiCardCyan}`}>
          <div className={styles.kpiHeader}>
            <span className={styles.kpiLabel}>均值 (X̄)</span>
            <div className={styles.kpiIcon}>
              <svg width="18" height="18" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round">
                <line x1="4" y1="12" x2="20" y2="12" />
                <polyline points="8 8 4 12 8 16" />
                <polyline points="16 8 20 12 16 16" />
              </svg>
            </div>
          </div>
          <div className={styles.kpiValue}>
            {stats?.mean.toFixed(2) || '-'}
            <span className={styles.kpiUnit}>{spcData?.spec_limits.unit || ''}</span>
          </div>
        </div>
        <div className={`${styles.kpiCard} ${styles.kpiCardPurple}`}>
          <div className={styles.kpiHeader}>
            <span className={styles.kpiLabel}>标准差 (σ)</span>
            <div className={styles.kpiIcon}>
              <svg width="18" height="18" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round">
                <path d="M21 16V8a2 2 0 0 0-1-1.73l-7-4a2 2 0 0 0-2 0l-7 4A2 2 0 0 0 3 8v8a2 2 0 0 0 1 1.73l7 4a2 2 0 0 0 2 0l7-4A2 2 0 0 0 21 16z" />
                <polyline points="7.5 4.21 12 6.81 16.5 4.21" />
                <line x1="12" y1="22.08" x2="12" y2="6.81" />
              </svg>
            </div>
          </div>
          <div className={styles.kpiValue}>
            {stats?.std.toFixed(3) || '-'}
          </div>
        </div>
        <div className={`${styles.kpiCard} ${styles.kpiCardOrange}`}>
          <div className={styles.kpiHeader}>
            <span className={styles.kpiLabel}>违规点数</span>
            <div className={styles.kpiIcon}>
              <svg width="18" height="18" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round">
                <path d="M10.29 3.86L1.82 18a2 2 0 0 0 1.71 3h16.94a2 2 0 0 0 1.71-3L13.71 3.86a2 2 0 0 0-3.42 0z" />
                <line x1="12" y1="9" x2="12" y2="13" />
                <line x1="12" y1="17" x2="12.01" y2="17" />
              </svg>
            </div>
          </div>
          <div className={styles.kpiValue}>
            {stats?.violationCount ?? '-'}
            <span className={styles.kpiUnit}>/ {stats?.total ?? '-'}</span>
          </div>
        </div>
        <div className={`${styles.kpiCard} ${stats?.status === '失控' ? styles.kpiCardRed : stats?.status === '基本受控' ? styles.kpiCardOrange : styles.kpiCardGreen}`}>
          <div className={styles.kpiHeader}>
            <span className={styles.kpiLabel}>{analysisMode === 'stability' ? '稳定性状态' : '过程状态'}</span>
            <div className={styles.kpiIcon}>
              <svg width="18" height="18" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round">
                <path d="M22 11.08V12a10 10 0 1 1-5.93-9.14" />
                <polyline points="22 4 12 14.01 9 11.01" />
              </svg>
            </div>
          </div>
          <div className={styles.kpiValue}>
            <span className={styles.kpiStatusText}>{stats?.status || '-'}</span>
          </div>
        </div>
      </div>

      {/* Chart Type Tab Switcher */}
      <div className={styles.chartTypeBar}>
        <button
          className={`${styles.tabBtn} ${chartType === 'imr' ? styles.tabBtnActive : ''}`}
          onClick={() => setChartType('imr')}
        >
          I-MR 图
        </button>
        <button
          className={`${styles.tabBtn} ${chartType === 'ewma' ? styles.tabBtnActive : ''}`}
          onClick={() => setChartType('ewma')}
        >
          EWMA 图
        </button>
        {chartType === 'ewma' && (
          <div className={styles.lambdaControl}>
            <span className={styles.filterLabel}>λ</span>
            <input
              type="range"
              min={0.05}
              max={0.5}
              step={0.05}
              value={ewmaLambda}
              onChange={e => setEwmaLambda(parseFloat(e.target.value))}
              className={styles.lambdaSlider}
            />
            <span className={styles.lambdaValue}>{ewmaLambda.toFixed(2)}</span>
          </div>
        )}
      </div>

      {/* I Chart */}
      {chartType === 'imr' && (
      <>
      <div className={styles.chartPanel} aria-label="单值控制图">
        <div className={styles.chartPanelHeader}>
          <div className={styles.chartPanelTitle}>
            <span className={styles.chartPanelTitleIcon}>
              <svg width="16" height="16" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round">
                <polyline points="22 12 18 12 15 21 9 3 6 12 2 12" />
              </svg>
            </span>
            {analysisMode === 'stability' ? '检测稳定性监控图 (I Chart)' : '单值控制图 (I Chart)'}
          </div>
          <div className={styles.chartPanelActions}>
            <span className={`${styles.tag} ${styles.tagSuccess}`}>UCL: {spcData?.i_chart?.ucl.toFixed(3) || '-'}</span>
            <span className={`${styles.tag} ${styles.tagInfo}`}>CL: {spcData?.i_chart?.cl.toFixed(3) || '-'}</span>
            <span className={`${styles.tag} ${styles.tagSuccess}`}>LCL: {spcData?.i_chart?.lcl.toFixed(3) || '-'}</span>
            {analysisMode !== 'stability' && spcData?.spec_limits.usl != null && (
              <span className={`${styles.tag} ${styles.tagCritical}`}>USL: {spcData.spec_limits.usl}</span>
            )}
            {analysisMode !== 'stability' && spcData?.spec_limits.lsl != null && (
              <span className={`${styles.tag} ${styles.tagCritical}`}>LSL: {spcData.spec_limits.lsl}</span>
            )}
          </div>
        </div>
        <div className={styles.chartPanelBody}>
          <div ref={iChartRef} className={iChartClassName} style={{ height: 340 }} />
          {spcData?.data_points.length === 0 && (
            <div className={styles.emptyChart}>暂无匹配数据，请调整筛选条件</div>
          )}
        </div>
      </div>

      {/* MR Chart */}
      <div className={styles.chartPanel} aria-label="移动极差控制图">
        <div className={styles.chartPanelHeader}>
          <div className={styles.chartPanelTitle}>
            <span className={styles.chartPanelTitleIcon}>
              <svg width="16" height="16" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round">
                <polyline points="23 6 13.5 15.5 8.5 10.5 1 18" />
                <polyline points="17 6 23 6 23 12" />
              </svg>
            </span>
            移动极差控制图 (MR Chart)
          </div>
          <div className={styles.chartPanelActions}>
            <span className={`${styles.tag} ${styles.tagSuccess}`}>UCL: {spcData?.mr_chart?.ucl.toFixed(3) || '-'}</span>
            <span className={`${styles.tag} ${styles.tagInfo}`}>CL: {spcData?.mr_chart?.cl.toFixed(3) || '-'}</span>
            <span className={`${styles.tag} ${styles.tagSuccess}`}>LCL: {spcData?.mr_chart?.lcl ?? 0}</span>
          </div>
        </div>
        <div className={styles.chartPanelBody}>
          <div ref={mrChartRef} className={mrChartClassName} style={{ height: 240 }} />
        </div>
      </div>
      </>
      )}

      {/* EWMA Chart */}
      {chartType === 'ewma' && spcData?.ewma_chart && (
      <div className={styles.chartPanel} aria-label="EWMA控制图">
        <div className={styles.chartPanelHeader}>
          <div className={styles.chartPanelTitle}>
            <span className={styles.chartPanelTitleIcon}>
              <svg width="16" height="16" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round">
                <polyline points="22 12 18 12 15 21 9 3 6 12 2 12" />
              </svg>
            </span>
            EWMA 控制图 (λ={spcData.ewma_chart.lambda})
          </div>
          <div className={styles.chartPanelActions}>
            <span className={`${styles.tag} ${styles.tagInfo}`}>CL: {spcData.ewma_chart.cl.toFixed(3)}</span>
            <span className={`${styles.tag} ${styles.tagSuccess}`}>λ: {spcData.ewma_chart.lambda}</span>
            {spcData.ewma_chart.violations.length > 0 && (
              <span className={`${styles.tag} ${styles.tagCritical}`}>越界: {spcData.ewma_chart.violations.length}</span>
            )}
          </div>
        </div>
        <div className={styles.chartPanelBody}>
          <div ref={ewmaChartRef} className={ewmaChartClassName} style={{ height: 340 }} />
        </div>
      </div>
      )}

      {/* Violations: Nelson Rules (IMR) or EWMA out-of-control points */}
      {chartType === 'ewma' && spcData?.ewma_chart && spcData.ewma_chart.violations.length > 0 && (
        <div className={styles.violationsPanel}>
          <div className={styles.violationsHeader}>
            <div className={styles.violationsTitle}>
              <svg width="16" height="16" viewBox="0 0 24 24" fill="none" stroke="var(--accent-orange)" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round">
                <circle cx="12" cy="12" r="10" />
                <line x1="12" y1="8" x2="12" y2="12" />
                <line x1="12" y1="16" x2="12.01" y2="16" />
              </svg>
              EWMA 越界点 (λ={spcData.ewma_chart.lambda})
            </div>
          </div>
          <div className={styles.violationsBody}>
            <table className={styles.violationsTable} aria-label="EWMA越界点表">
              <thead>
                <tr>
                  <th>序号</th>
                  <th>时间</th>
                  <th>检测值</th>
                  <th>EWMA 值</th>
                  <th>控制限</th>
                  <th>状态</th>
                </tr>
              </thead>
              <tbody>
                {spcData.ewma_chart.violations.map(idx => {
                  const dp = spcData.data_points[idx]
                  const ewmaVal = spcData.ewma_chart!.values[idx]
                  const ucl = spcData.ewma_chart!.ucl[idx]
                  const lcl = spcData.ewma_chart!.lcl[idx]
                  const isAbove = ewmaVal > ucl
                  return (
                    <tr key={idx}>
                      <td>{idx + 1}</td>
                      <td>{dp?.time ? formatTime(dp.time) : '-'}</td>
                      <td>{dp?.value?.toFixed(4) ?? '-'}</td>
                      <td>{ewmaVal.toFixed(4)}</td>
                      <td>{isAbove ? `UCL=${ucl.toFixed(4)}` : `LCL=${lcl.toFixed(4)}`}</td>
                      <td>
                        <span className={`${styles.tag} ${styles.tagCritical}`}>
                          {isAbove ? '↑ 超上限' : '↓ 超下限'}
                        </span>
                      </td>
                    </tr>
                  )
                })}
              </tbody>
            </table>
          </div>
        </div>
      )}
      {chartType === 'imr' && spcData?.violations && spcData.violations.length > 0 && (
        <div className={styles.violationsPanel}>
          <div className={styles.violationsHeader}>
            <div className={styles.violationsTitle}>
              <svg width="16" height="16" viewBox="0 0 24 24" fill="none" stroke="var(--accent-orange)" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round">
                <circle cx="12" cy="12" r="10" />
                <line x1="12" y1="8" x2="12" y2="12" />
                <line x1="12" y1="16" x2="12.01" y2="16" />
              </svg>
              Nelson 规则违规
            </div>
          </div>
          <div className={styles.violationsBody}>
            <table className={styles.violationsTable} aria-label="Nelson规则违规表">
              <thead>
                <tr>
                  <th>规则</th>
                  <th>规则名称</th>
                  <th>描述</th>
                  <th>严重程度</th>
                </tr>
              </thead>
              <tbody>
                {spcData.violations.map(v => (
                  <tr key={v.rule_id}>
                    <td>
                      <span className={`${styles.tag} ${
                        v.severity === 'CRITICAL' ? styles.tagCritical
                          : v.severity === 'WARNING' ? styles.tagWarning
                            : styles.tagInfo
                      }`}>R{v.rule_id}</span>
                    </td>
                    <td>{v.rule_name}</td>
                    <td>{v.description}</td>
                    <td>
                      <span className={`${styles.tag} ${
                        v.severity === 'CRITICAL' ? styles.tagCritical
                          : v.severity === 'WARNING' ? styles.tagWarning
                            : styles.tagInfo
                      }`}>{v.severity}</span>
                    </td>
                  </tr>
                ))}
              </tbody>
            </table>
          </div>
        </div>
      )}
    </div>
  )
}

export default SPCPage
