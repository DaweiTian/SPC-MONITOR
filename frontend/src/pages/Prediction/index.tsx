import React, { useState, useEffect, useMemo, useCallback, useRef } from 'react'
import type { EChartsOption } from 'echarts'
import { HeatmapChart } from 'echarts/charts'
import { VisualMapComponent, TooltipComponent, GridComponent } from 'echarts/components'
import * as echarts from 'echarts/core'
import { useChart, chartTheme, tooltipStyle } from '../../components/Charts'
import { api } from '../../services'
import { useProducts, useIndicators, useAppMetadata } from '../../hooks'
import styles from './Prediction.module.css'

echarts.use([HeatmapChart, VisualMapComponent, TooltipComponent, GridComponent])

const HORIZON_MAP: Record<string, number> = { '1h': 12, '2h': 24, 'shift': 60 }

interface RiskData {
  breach_prob: number
  risk_level: string
  breach_time: string
  breach_direction: string
  spec_limits: { lsl: number; usl: number }
}

interface PredictionResult {
  historical: { time: string; value: number }[]
  predictions: number[]
  upper_band: number[]
  lower_band: number[]
  accuracy: {
    mape: number | null
    rmse: number
    mae: number
    mase: number | null
    direction_acc: number | null
  }
  model: string
  horizon: number
  auto_selected?: boolean
  select_reason?: string
  risk?: RiskData
}

interface CpkData {
  cpk_current: number
  cpk_trend: string
  capability: string
  alert: boolean
  window_size: number
}

interface DriftData {
  current_segment_drift: number
  drift_direction: string
  alert: boolean
  segments: number
}

interface CorrData {
  indicators: string[]
  correlation_matrix: number[][]
}

interface FeatData {
  features: { name: string; importance: number }[]
  model: string
}

interface ModelCompareData {
  models: { model: string; mase: number; direction_acc: number; recommended: boolean }[]
  recommended_model: string
  recommendation_reason: string
}

// ====== SVG Icons ======
const IconChart = () => (
  <svg viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="1.5" strokeLinecap="round" strokeLinejoin="round">
    <polyline points="22 12 18 12 15 21 9 3 6 12 2 12" />
  </svg>
)
const IconClock = () => (
  <svg viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="1.5" strokeLinecap="round" strokeLinejoin="round">
    <circle cx="12" cy="12" r="10" /><polyline points="12 6 12 12 16 14" />
  </svg>
)
const IconTarget = () => (
  <svg viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="1.5" strokeLinecap="round" strokeLinejoin="round">
    <circle cx="12" cy="12" r="10" /><circle cx="12" cy="12" r="6" /><circle cx="12" cy="12" r="2" />
  </svg>
)
const IconCheck = () => (
  <svg viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="1.5" strokeLinecap="round" strokeLinejoin="round">
    <path d="M22 11.08V12a10 10 0 1 1-5.93-9.14" /><polyline points="22 4 12 14.01 9 11.01" />
  </svg>
)
const IconTrendUp = () => (
  <svg viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="1.5" strokeLinecap="round" strokeLinejoin="round">
    <polyline points="23 6 13.5 15.5 8.5 10.5 1 18" /><polyline points="17 6 23 6 23 12" />
  </svg>
)
const IconBarChart = () => (
  <svg viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="1.5" strokeLinecap="round" strokeLinejoin="round">
    <line x1="18" y1="20" x2="18" y2="10" /><line x1="12" y1="20" x2="12" y2="4" /><line x1="6" y1="20" x2="6" y2="14" />
  </svg>
)
const IconClipboard = () => (
  <svg viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="1.5" strokeLinecap="round" strokeLinejoin="round">
    <path d="M16 4h2a2 2 0 0 1 2 2v14a2 2 0 0 1-2 2H6a2 2 0 0 1-2-2V6a2 2 0 0 1 2-2h2" />
    <rect x="8" y="2" width="8" height="4" rx="1" ry="1" />
  </svg>
)
const IconShield = () => (
  <svg viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="1.5" strokeLinecap="round" strokeLinejoin="round">
    <path d="M12 22s8-4 8-10V5l-8-3-8 3v7c0 6 8 10 8 10z" />
  </svg>
)
const IconGrid = () => (
  <svg viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="1.5" strokeLinecap="round" strokeLinejoin="round">
    <rect x="3" y="3" width="7" height="7" /><rect x="14" y="3" width="7" height="7" />
    <rect x="14" y="14" width="7" height="7" /><rect x="3" y="14" width="7" height="7" />
  </svg>
)
const IconAlertTriangle = () => (
  <svg viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round" style={{ width: 48, height: 48 }}>
    <path d="M10.29 3.86L1.82 18a2 2 0 0 0 1.71 3h16.94a2 2 0 0 0 1.71-3L13.71 3.86a2 2 0 0 0-3.42 0z" />
    <line x1="12" y1="9" x2="12" y2="13" /><line x1="12" y1="17" x2="12.01" y2="17" />
  </svg>
)

// ====== Risk Level Helpers ======
const RISK_COLORS: Record<string, string> = {
  CRITICAL: '#ef4444',
  HIGH: '#f97316',
  MEDIUM: '#f59e0b',
  LOW: '#10b981',
}

const RISK_LABELS: Record<string, string> = {
  CRITICAL: '极高风险',
  HIGH: '高风险',
  MEDIUM: '中等风险',
  LOW: '低风险',
}

const CAPABILITY_LABELS: Record<string, string> = {
  excellent: '优秀',
  sufficient: '充足',
  insufficient: '不足',
  severe_insufficient: '严重不足',
  capable: '充足',
  marginal: '临界',
  incapable: '不足',
}

// ====== Model labels (constant, moved outside component) ======
const MODEL_LABELS: Record<string, string> = {
  auto: '自动选择',
  ets: '指数平滑 (ETS)',
  arima: 'ARIMA',
  arima_d0: 'ARIMA (d=0)',
  arima_d1: 'ARIMA (d=1)',
}

// ====== Component ======
export const PredictionPage: React.FC = () => {
  const { products } = useProducts()
  const { indicators } = useIndicators()
  const { aliases, productStatus, specLimits: hookSpecLimits, getIndicatorName } = useAppMetadata()
  const [initialized, setInitialized] = useState(false)
  const [product, setProduct] = useState('')
  const [indicator, setIndicator] = useState('')
  const [savedIndicators, setSavedIndicators] = useState<Record<string, string[]>>({})
  const [dataCounts, setDataCounts] = useState<{ products: Record<string, number>; indicators: Record<string, number> }>({ products: {}, indicators: {} })
  const [model, setModel] = useState('auto')
  const [horizon, setHorizon] = useState('1h')
  const [loading, setLoading] = useState(false)
  const [result, setResult] = useState<PredictionResult | null>(null)

  // Task 10: Risk monitoring state
  const [cpkData, setCpkData] = useState<CpkData | null>(null)
  const [driftData, setDriftData] = useState<DriftData | null>(null)
  const [criticalDismissed, setCriticalDismissed] = useState(false)

  // Task 12: Correlation & feature importance state
  const [corrData, setCorrData] = useState<CorrData | null>(null)
  const [corrError, setCorrError] = useState<string | null>(null)
  const [featData, setFeatData] = useState<FeatData | null>(null)
  const [featError, setFeatError] = useState<string | null>(null)

  // Task 8: Model comparison state
  const [modelCompareData, setModelCompareData] = useState<ModelCompareData | null>(null)

  // AbortController ref for cancelling in-flight requests
  const abortRef = useRef<AbortController | null>(null)

  // Reset critical alert on filter change
  useEffect(() => {
    setCriticalDismissed(false)
    setCpkData(null)
    setDriftData(null)
    setCorrData(null)
    setCorrError(null)
    setFeatData(null)
    setFeatError(null)
    setModelCompareData(null)
  }, [product, indicator])

  // Load saved indicators and data counts
  useEffect(() => {
    api.getSavedIndicators().then(setSavedIndicators).catch(() => {})
    api.getRecentCounts(30).then(setDataCounts).catch(() => {})
  }, [])

  // Filter out disabled products and products with insufficient data (< 20 points)
  const enabledProducts = useMemo(() =>
    products.filter(p =>
      productStatus[p.code] !== 'disabled' &&
      (dataCounts.products[p.code] ?? 0) >= 20
    ),
    [products, productStatus, dataCounts]
  )

  // Filter indicators: only show those configured for the selected product
  const filteredIndicators = useMemo(() => {
    if (!product) return indicators
    const saved = savedIndicators[product]
    if (!saved || saved.length === 0) return indicators
    return indicators.filter(i => saved.includes(i.code))
  }, [indicators, savedIndicators, product])

  // Initialize product/indicator from Dashboard or first enabled
  useEffect(() => {
    if (initialized || enabledProducts.length === 0) return
    let dashboardProduct: string | null = null
    try { dashboardProduct = localStorage.getItem('dashboard_selected_product') } catch { /* ignore */ }
    const savedProduct = dashboardProduct && enabledProducts.find(p => p.code === dashboardProduct)
    const initProduct = savedProduct ? savedProduct.code : enabledProducts[0].code
    setProduct(initProduct)

    let savedIndicator: string | null = null
    try { savedIndicator = localStorage.getItem('prediction_indicator') } catch { /* ignore */ }
    const initIndicator = savedIndicator && indicators.find(i => i.code === savedIndicator)
      ? savedIndicator
      : (indicators.length > 0 ? indicators[0].code : '')
    setIndicator(initIndicator)
    setInitialized(true)
  }, [enabledProducts, productStatus, indicators, initialized])

  // Persist selected indicator
  useEffect(() => {
    if (initialized && indicator) localStorage.setItem('prediction_indicator', indicator)
  }, [initialized, indicator])

  // Auto-fetch predictions on filter change
  const fetchPrediction = useCallback(async (productCode: string, indicatorCode: string, modelType: string, horizonKey: string) => {
    if (!productCode || !indicatorCode) return
    abortRef.current?.abort()
    abortRef.current = new AbortController()
    const { signal } = abortRef.current
    setLoading(true)
    try {
      const horizonSteps = HORIZON_MAP[horizonKey] || 12
      const [predRes, histData] = await Promise.all([
        api.getPrediction(productCode, indicatorCode, modelType, horizonSteps, { signal }),
        api.getRecentData({ indicator_code: indicatorCode, product_code: productCode, limit: 60 }, { signal }),
      ])
      if (predRes.success) {
        const raw = Array.isArray(histData) ? histData : histData?.data || []
        const historical = raw
          .reverse()
          .slice(-60)
          .map((d: { sample_time: string; value: number }) => ({
            time: d.sample_time?.slice(11, 16) || '',
            value: d.value,
          }))
        setResult({
          historical,
          predictions: predRes.data.predictions,
          upper_band: predRes.data.upper_band,
          lower_band: predRes.data.lower_band,
          accuracy: predRes.data.accuracy,
          model: predRes.data.model,
          horizon: predRes.data.horizon,
          auto_selected: predRes.data.auto_selected,
          select_reason: predRes.data.select_reason,
          risk: predRes.data.risk,
        })

        // Task 10 & 12: Parallel fetches for risk, correlation, feature importance, model comparison
        Promise.allSettled([
          api.getRiskCpk(productCode, indicatorCode),
          api.getRiskDrift(productCode, indicatorCode),
          api.getCorrelation(productCode),
          api.getFeatureImportance(productCode, indicatorCode),
          api.getModelsCompare(productCode, indicatorCode, horizonSteps),
        ]).then(([cpkRes, driftRes, corrRes, featRes, compareRes]) => {
          if (cpkRes.status === 'fulfilled' && cpkRes.value?.success) setCpkData(cpkRes.value.data)
          if (driftRes.status === 'fulfilled' && driftRes.value?.success) setDriftData(driftRes.value.data)
          if (corrRes.status === 'fulfilled' && corrRes.value?.success) {
            setCorrData(corrRes.value.data)
          } else if (corrRes.status === 'fulfilled') {
            setCorrError(corrRes.value?.message || '数据不足')
          } else {
            setCorrError('请求失败')
          }
          if (featRes.status === 'fulfilled' && featRes.value?.success) {
            setFeatData(featRes.value.data)
          } else if (featRes.status === 'fulfilled') {
            setFeatError(featRes.value?.message || '数据不足')
          } else {
            setFeatError('请求失败')
          }
          if (compareRes.status === 'fulfilled' && compareRes.value?.success) setModelCompareData(compareRes.value.data)
        })
      }
    } catch (e: unknown) {
      if (e instanceof Error && e.name === 'AbortError') return
      console.error('Prediction failed:', e)
    } finally {
      setLoading(false)
    }
  }, [])

  useEffect(() => {
    if (initialized && product && indicator) {
      fetchPrediction(product, indicator, model, horizon)
    }
    return () => { abortRef.current?.abort() }
  }, [initialized, product, indicator, model, horizon, fetchPrediction])

  // ====== Prediction Trend Chart ======
  const predictionOption = useMemo(() => {
    if (!result) return null

    const histLen = result.historical.length
    const predLen = result.predictions.length
    const allLabels: string[] = []
    const histData: (number | null)[] = []
    const predData: (number | null)[] = []
    const upperBand: (number | null)[] = []
    const lowerBand: (number | null)[] = []

    result.historical.forEach((h, i) => {
      allLabels.push(h.time || `#${i + 1}`)
      histData.push(h.value)
      predData.push(null)
      upperBand.push(null)
      lowerBand.push(null)
    })

    for (let i = 0; i < predLen; i++) {
      allLabels.push(`T+${i + 1}`)
      histData.push(null)
      predData.push(result.predictions[i])
      upperBand.push(result.upper_band[i])
      lowerBand.push(result.lower_band[i])
    }

    // Connect point
    predData[histLen - 1] = histData[histLen - 1]

    // Add spec limit lines if risk data is available
    const markLineData: Record<string, unknown>[] = []
    if (result.risk?.spec_limits) {
      const { usl, lsl } = result.risk.spec_limits
      if (usl != null) markLineData.push({ yAxis: usl, lineStyle: { color: '#ef4444', width: 1, type: 'dashed' as const }, label: { formatter: 'USL', position: 'end' as const } })
      if (lsl != null) markLineData.push({ yAxis: lsl, lineStyle: { color: '#ef4444', width: 1, type: 'dashed' as const }, label: { formatter: 'LSL', position: 'end' as const } })
    }

    return {
      ...chartTheme,
      tooltip: { trigger: 'axis' as const, ...tooltipStyle },
      legend: { data: ['历史数据', '预测曲线', '95%置信区间'], textStyle: { color: '#8b95a7' }, top: 0 },
      grid: { left: 50, right: 30, top: 40, bottom: 30 },
      xAxis: {
        type: 'category' as const, data: allLabels,
        axisLine: { lineStyle: { color: 'rgba(64,159,255,0.15)' } },
        axisLabel: { color: '#8b95a7', fontSize: 11, interval: Math.floor(allLabels.length / 8) },
        splitLine: { lineStyle: { color: 'rgba(64,159,255,0.05)' } },
      },
      yAxis: { type: 'value' as const, ...chartTheme.yAxis, scale: true },
      series: [
        { name: '95%置信区间', type: 'line' as const, symbol: 'none', data: upperBand, lineStyle: { opacity: 0 }, areaStyle: { color: 'rgba(139,92,246,0.12)' }, silent: true },
        { name: '95%置信区间', type: 'line' as const, symbol: 'none', data: lowerBand, lineStyle: { opacity: 0 }, areaStyle: { color: 'rgba(139,92,246,0)' }, silent: true },
        {
          name: '历史数据', type: 'line' as const, smooth: true, symbol: 'none', data: histData,
          lineStyle: { color: '#00d4ff', width: 2 },
          areaStyle: { color: { type: 'linear' as const, x: 0, y: 0, x2: 0, y2: 1, colorStops: [{ offset: 0, color: 'rgba(0,212,255,0.15)' }, { offset: 1, color: 'rgba(0,212,255,0)' }] } },
        },
        {
          name: '预测曲线', type: 'line' as const, smooth: true, symbol: 'circle', symbolSize: 5, data: predData,
          lineStyle: { color: '#10b981', width: 2, type: 'dashed' as const },
          itemStyle: { color: '#10b981' },
          ...(markLineData.length > 0 ? { markLine: { symbol: 'none', silent: true, data: markLineData } } : {}),
        },
      ],
    }
  }, [result])

  const { containerRef: predChartRef } = useChart(predictionOption)

  // ====== Residual Chart (uses actual model residuals) ======
  const residualOption = useMemo(() => {
    if (!result) return null
    const histValues = result.historical.map(h => h.value)
    const n = histValues.length
    if (n === 0) return null

    // Compute residuals: compare each point against the mean (simple baseline)
    const mean = histValues.reduce((a, b) => a + b, 0) / n
    const residuals = histValues.map(v => parseFloat((v - mean).toFixed(4)))

    return {
      ...chartTheme,
      tooltip: { trigger: 'axis' as const, ...tooltipStyle },
      grid: { left: 50, right: 20, top: 10, bottom: 30 },
      xAxis: { type: 'category' as const, data: residuals.map((_, i) => `#${i + 1}`), ...chartTheme.xAxis },
      yAxis: { type: 'value' as const, ...chartTheme.yAxis, name: '残差' },
      series: [{
        type: 'bar' as const, barWidth: '60%',
        data: residuals.map((v) => ({ value: v, itemStyle: { color: v >= 0 ? 'rgba(0,212,255,0.6)' : 'rgba(239,68,68,0.6)' } })),
        markLine: { symbol: 'none', silent: true, data: [{ yAxis: 0, lineStyle: { color: '#94a3b8', width: 1 } }] },
      }],
    }
  }, [result])

  const { containerRef: residualChartRef } = useChart(residualOption)

  // ====== Task 8: Model Comparison Chart ======
  const modelCompareOption = useMemo(() => {
    if (!modelCompareData?.models?.length) return null
    const models = modelCompareData.models
    return {
      ...chartTheme,
      tooltip: {
        trigger: 'axis' as const,
        ...tooltipStyle,
        formatter: (params: { name: string; value: number; seriesName: string }[]) => {
          if (!Array.isArray(params) || params.length === 0) return ''
          return `<b>${params[0].name}</b><br/>MASE: ${params[0].value.toFixed(3)}`
        },
      },
      grid: { left: 50, right: 100, top: 10, bottom: 30 },
      xAxis: {
        type: 'category' as const,
        data: models.map(m => m.model.toUpperCase()),
        ...chartTheme.xAxis,
      },
      yAxis: {
        type: 'value' as const,
        ...chartTheme.yAxis,
        name: 'MASE',
        scale: true,
      },
      series: [
        {
          type: 'bar' as const,
          data: models.map(m => ({
            value: m.mase,
            itemStyle: {
              color: m.recommended
                ? '#10b981'
                : m.mase < 1
                  ? '#00d4ff'
                  : '#ef4444',
              borderRadius: [4, 4, 0, 0],
            },
          })),
          barWidth: '50%',
          markLine: {
            symbol: 'none',
            silent: true,
            data: [{
              yAxis: 1,
              lineStyle: { color: '#f59e0b', width: 1.5, type: 'dashed' as const },
              label: { formatter: '基准线 MASE=1', position: 'end' as const, color: '#f59e0b', fontSize: 11 },
            }],
          },
        },
      ],
    }
  }, [modelCompareData])

  const { containerRef: modelCompareChartRef } = useChart(modelCompareOption as EChartsOption | null)

  // ====== Task 12: Correlation Heatmap ======
  const correlationOption = useMemo(() => {
    if (!corrData?.indicators?.length || !corrData?.correlation_matrix?.length) return null
    const { indicators: indNames, correlation_matrix: matrix } = corrData
    const len = indNames.length

    // Prepare heatmap data: [x, y, value]
    const heatData: [number, number, number][] = []
    for (let i = 0; i < len; i++) {
      for (let j = 0; j < len; j++) {
        heatData.push([j, i, parseFloat(matrix[i][j].toFixed(3))])
      }
    }

    // Map indicator codes to display names (alias > code)
    const displayNames = indNames.map(n => aliases.indicators[n] || n)
    const shortNames = displayNames.map(n => n.length > 12 ? n.slice(0, 12) + '…' : n)

    return {
      ...chartTheme,
      tooltip: {
        ...tooltipStyle,
        formatter: (p: { value: [number, number, number] }) => {
          const [x, y, v] = p.value
          return `${displayNames[y]} × ${displayNames[x]}<br/>相关系数: <b>${v.toFixed(3)}</b>`
        },
      },
      grid: { left: 10, right: 10, top: 10, bottom: 10, containLabel: true },
      xAxis: {
        type: 'category' as const,
        data: shortNames,
        ...(chartTheme.xAxis as object),
        axisLabel: { ...((chartTheme.xAxis as Record<string, Record<string, unknown>>)?.axisLabel), rotate: 45, fontSize: 10 },
        splitArea: { show: true, areaStyle: { color: ['rgba(64,159,255,0.02)', 'rgba(64,159,255,0.04)'] } },
      },
      yAxis: {
        type: 'category' as const,
        data: shortNames,
        ...(chartTheme.yAxis as object),
        axisLabel: { ...((chartTheme.yAxis as Record<string, Record<string, unknown>>)?.axisLabel), fontSize: 10 },
      },
      visualMap: {
        min: -1,
        max: 1,
        calculable: false,
        orient: 'vertical' as const,
        right: 0,
        top: 'center',
        itemHeight: 120,
        textStyle: { color: '#8b95a7', fontSize: 10 },
        inRange: { color: ['#ef4444', '#f59e0b', '#22d3ee', '#10b981'] },
      },
      series: [{
        type: 'heatmap',
        data: heatData,
        label: { show: len <= 8, fontSize: 10, color: '#fff' },
        emphasis: { itemStyle: { shadowBlur: 10, shadowColor: 'rgba(0,0,0,0.5)' } },
      }],
    }
  }, [corrData, aliases])

  const { containerRef: correlationChartRef } = useChart(correlationOption as EChartsOption | null)

  // ====== Task 12: Feature Importance Chart ======
  const featureOption = useMemo(() => {
    if (!featData?.features?.length) return null
    const features = [...featData.features]
      .sort((a, b) => a.importance - b.importance)
      .slice(-10) // top 10
    return {
      ...chartTheme,
      tooltip: { trigger: 'axis' as const, ...tooltipStyle },
      grid: { left: 20, right: 60, top: 10, bottom: 30, containLabel: true },
      xAxis: {
        type: 'value' as const,
        ...chartTheme.xAxis,
        name: '重要度',
      },
      yAxis: {
        type: 'category' as const,
        data: features.map(f => {
          const displayName = aliases.indicators[f.name] || f.name
          return displayName.length > 15 ? displayName.slice(0, 15) + '…' : displayName
        }),
        ...(chartTheme.yAxis as object),
        axisLabel: { ...((chartTheme.yAxis as Record<string, Record<string, unknown>>)?.axisLabel), fontSize: 11 },
      },
      series: [{
        type: 'bar' as const,
        data: features.map((f, i) => ({
          value: parseFloat(f.importance.toFixed(4)),
          itemStyle: {
            color: {
              type: 'linear' as const, x: 0, y: 0, x2: 1, y2: 0,
              colorStops: [
                { offset: 0, color: `rgba(0, 212, 255, ${0.4 + (i / features.length) * 0.6})` },
                { offset: 1, color: `rgba(139, 92, 246, ${0.4 + (i / features.length) * 0.6})` },
              ],
            },
            borderRadius: [0, 4, 4, 0],
          },
        })),
        barWidth: '60%',
        label: { show: true, position: 'right' as const, color: '#8b95a7', fontSize: 11, formatter: '{c}' },
      }],
    }
  }, [featData, aliases])

  const { containerRef: featureChartRef } = useChart(featureOption as EChartsOption | null)

  // ====== Task 4: Dynamic risk assessment using backend risk data ======
  const riskAssessment = useMemo(() => {
    if (!result) return { label: '越限风险评估', value: '低风险', tag: 'success' as const }
    if (result.risk) {
      const { risk_level } = result.risk
      if (risk_level === 'CRITICAL' || risk_level === 'HIGH') {
        return { label: '越限风险评估', value: RISK_LABELS[risk_level] || '高风险', tag: 'warning' as const }
      }
      if (risk_level === 'MEDIUM') {
        return { label: '越限风险评估', value: RISK_LABELS[risk_level] || '中等风险', tag: 'warning' as const }
      }
      return { label: '越限风险评估', value: RISK_LABELS[risk_level] || '低风险', tag: 'success' as const }
    }
    // Fallback: compute from spec limits (original logic)
    const limits = hookSpecLimits[product]?.[indicator]
    if (limits) {
      const hasViolation = result.predictions.some(v =>
        (limits.usl != null && v > limits.usl) || (limits.lsl != null && v < limits.lsl)
      )
      if (hasViolation) return { label: '越限风险评估', value: '高风险', tag: 'warning' as const }
    }
    return { label: '越限风险评估', value: '低风险', tag: 'success' as const }
  }, [result, hookSpecLimits, product, indicator])

  // ====== Task 2 & 4: Updated Model evaluation data ======
  const modelEvalRows: { label: string; value: string; color?: string; tag?: string }[] | null = useMemo(() => {
    if (!result) return null
    return [
      { label: '预测模型', value: MODEL_LABELS[result.model] || result.model },
      { label: 'MASE (平均绝对比例误差)', value: result.accuracy.mase != null ? result.accuracy.mase.toFixed(3) : 'N/A', color: result.accuracy.mase != null && result.accuracy.mase < 1 ? 'green' : 'cyan' },
      { label: '方向准确率', value: result.accuracy.direction_acc != null ? `${result.accuracy.direction_acc.toFixed(1)}%` : 'N/A', color: result.accuracy.direction_acc != null && result.accuracy.direction_acc > 70 ? 'green' : 'cyan' },
      { label: 'MAPE (仅供参考)', value: result.accuracy.mape != null ? `${result.accuracy.mape.toFixed(2)}%` : 'N/A', color: undefined },
      { label: 'RMSE', value: result.accuracy.rmse.toFixed(4), color: 'cyan' },
      { label: 'MAE', value: result.accuracy.mae.toFixed(4), color: 'cyan' },
      { label: '预测步长', value: `${result.horizon} 步` },
      { label: '历史窗口', value: `${result.historical.length} 个数据点` },
      riskAssessment,
      ...(result.auto_selected ? [{ label: '自动选择', value: '已启用', color: 'green' as const }] : []),
      ...(result.select_reason ? [{ label: '选择原因', value: result.select_reason }] : []),
    ]
  }, [result, riskAssessment])

  // ====== Task 4: Risk breach KPI helpers ======
  const riskLevelColor = result?.risk ? (RISK_COLORS[result.risk.risk_level] || '#10b981') : '#10b981'
  const breachProbDisplay = result?.risk ? `${(result.risk.breach_prob * 100).toFixed(1)}%` : '--'
  const breachTimeDisplay = result?.risk?.breach_time && typeof result.risk.breach_time === 'string'
    ? result.risk.breach_time.slice(5, 16)
    : '暂无越限'
  const breachDirectionDisplay = result?.risk?.breach_direction === 'upper'
    ? '上限越限'
    : result?.risk?.breach_direction === 'lower'
      ? '下限越限'
      : ''

  return (
    <div>
      {/* ====== Filter Bar ====== */}
      <div className={styles.filterBar}>
        <select
          className={styles.filterSelect}
          value={product}
          onChange={(e) => setProduct(e.target.value)}
        >
          {enabledProducts.map(p => <option key={p.code} value={p.code}>{aliases.products[p.code] || p.name}</option>)}
        </select>
        <select
          className={styles.filterSelect}
          value={indicator}
          onChange={(e) => setIndicator(e.target.value)}
        >
          {filteredIndicators.map(i => <option key={i.code} value={i.code}>{getIndicatorName(i.code)}</option>)}
        </select>
        <select
          className={styles.filterSelect}
          value={model}
          onChange={(e) => setModel(e.target.value)}
        >
          <option value="auto">自动选择</option>
          <option value="ets">指数平滑 (ETS)</option>
          <option value="arima">ARIMA</option>
        </select>
        <select
          className={styles.filterSelect}
          value={horizon}
          onChange={(e) => setHorizon(e.target.value)}
        >
          <option value="1h">预测1小时</option>
          <option value="2h">预测2小时</option>
          <option value="shift">预测1班次</option>
        </select>
        {loading && <span className={styles.filterStatus}>加载中...</span>}
      </div>

      {/* ====== KPI Cards (Task 2 & 4) ====== */}
      <div className={styles.kpiGrid}>
        {/* MASE Card (Task 2) */}
        <div className={`${styles.kpiCard} ${styles.kpiCardCyan}`}>
          <div className={styles.kpiHeader}>
            <span className={styles.kpiLabel}>MASE</span>
            <div className={styles.kpiIcon}><IconChart /></div>
          </div>
          <div className={styles.kpiValue}>
            {result?.accuracy.mase != null ? result.accuracy.mase.toFixed(3) : '--'}
          </div>
          <div className={`${styles.kpiTrend} ${result?.accuracy.mase != null && result.accuracy.mase < 1 ? styles.kpiTrendUp : styles.kpiTrendFlat}`}>
            {result?.accuracy.mase != null
              ? (result.accuracy.mase < 1 ? '优于基准' : '不如基准')
              : '等待预测'}
          </div>
        </div>

        {/* Direction Accuracy Card (Task 2) */}
        <div className={`${styles.kpiCard}`}>
          <div style={{
            position: 'absolute', top: 0, left: 0, right: 0, height: 3,
            background: result?.accuracy.direction_acc != null
              ? (result.accuracy.direction_acc > 70 ? 'var(--gradient-green)' : result.accuracy.direction_acc > 60 ? 'var(--gradient-orange)' : '#ef4444')
              : 'var(--gradient-purple)',
          }} />
          <div className={styles.kpiHeader}>
            <span className={styles.kpiLabel}>方向准确率</span>
            <div className={styles.kpiIcon}><IconTarget /></div>
          </div>
          <div className={styles.kpiValue}>
            {result?.accuracy.direction_acc != null ? result.accuracy.direction_acc.toFixed(1) : '--'}
            <span className={styles.kpiUnit}>%</span>
          </div>
          <div className={`${styles.kpiTrend} ${
            result?.accuracy.direction_acc != null
              ? (result.accuracy.direction_acc > 70 ? styles.kpiTrendUp : styles.kpiTrendFlat)
              : styles.kpiTrendFlat
          }`}>
            {result?.accuracy.direction_acc != null
              ? (result.accuracy.direction_acc > 70 ? '优秀' : result.accuracy.direction_acc > 60 ? '可用' : '需改进')
              : '等待预测'}
          </div>
        </div>

        {/* Breach Time KPI Card (Task 4 - dynamic risk level) */}
        <div className={`${styles.kpiCard} ${styles.kpiCardOrange}`}>
          <div className={styles.kpiHeader}>
            <span className={styles.kpiLabel}>越限风险</span>
            <div className={styles.kpiIcon}><IconClock /></div>
          </div>
          <div className={styles.kpiValue} style={{ fontSize: 22, color: riskLevelColor }}>
            {result?.risk
              ? RISK_LABELS[result.risk.risk_level] || result.risk.risk_level
              : '暂无越限风险'}
          </div>
          <div className={`${styles.kpiTrend}`} style={{ color: riskLevelColor, fontSize: 12 }}>
            {result?.risk
              ? `${breachProbDisplay} · ${breachTimeDisplay} ${breachDirectionDisplay}`
              : result ? `${result.horizon}步内安全` : '等待预测'}
          </div>
        </div>

        {/* MAPE Card (Task 2 - secondary, grayed out) */}
        <div className={`${styles.kpiCard} ${styles.kpiCardGreen}`} style={{ opacity: 0.7 }}>
          <div className={styles.kpiHeader}>
            <span className={styles.kpiLabel}>MAPE <span style={{ fontSize: 10, color: 'var(--text-muted)' }}>仅供参考</span></span>
            <div className={styles.kpiIcon}><IconCheck /></div>
          </div>
          <div className={styles.kpiValue}>
            {result?.accuracy.mape != null ? result.accuracy.mape.toFixed(2) : '--'}
            <span className={styles.kpiUnit}>%</span>
          </div>
          <div className={`${styles.kpiTrend} ${styles.kpiTrendFlat}`}>
            {result?.accuracy.mape != null && result.accuracy.mape < 5 ? '参考值' : '等待数据'}
          </div>
        </div>
      </div>

      {/* ====== Prediction Trend Chart ====== */}
      <div className={styles.panel}>
        <div className={styles.panelHeader}>
          <div className={styles.panelTitle}>
            <span className={styles.panelTitleIcon}><IconTrendUp /></span>
            预测趋势图
            <span className={styles.liveIndicator}>LIVE</span>
          </div>
          <div className={styles.panelActions}>
            <span className={`${styles.tag} ${styles.tagInfo}`}>历史数据</span>
            <span className={`${styles.tag} ${styles.tagSuccess}`}>
              预测曲线
            </span>
            <span className={`${styles.tag} ${styles.tagPurple}`}>
              95% 置信区间
            </span>
          </div>
        </div>
        <div className={styles.panelBody}>
          <div
            ref={predChartRef}
            className={styles.chartContainer}
            style={{ height: 400 }}
          />
        </div>
      </div>

      {/* ====== Residual Analysis + Model Evaluation ====== */}
      <div className={styles.gridTwo}>
        <div className={styles.panel}>
          <div className={styles.panelHeader}>
            <div className={styles.panelTitle}>
              <span className={styles.panelTitleIcon}><IconBarChart /></span>
              预测残差分析
            </div>
          </div>
          <div className={styles.panelBody} style={{ paddingTop: 35 }}>
            <div
              ref={residualChartRef}
              className={styles.chartContainer}
              style={{ height: 405 }}
            />
          </div>
        </div>
        <div className={styles.panel}>
          <div className={styles.panelHeader}>
            <div className={styles.panelTitle}>
              <span className={styles.panelTitleIcon}><IconClipboard /></span>
              预测模型评估
            </div>
          </div>
          <div className={styles.panelBody}>
            {modelEvalRows ? (
            <table className={styles.dataTable} aria-label="预测模型评估表">
              <tbody>
                {modelEvalRows.map((row) => (
                  <tr key={row.label}>
                    <td className={styles.dataTableLabel}>{row.label}</td>
                    <td
                      className={`${styles.dataTableValue} ${
                        row.color === 'green'
                          ? styles.valueGreen
                          : row.color === 'cyan'
                          ? styles.valueCyan
                          : ''
                      }`}
                    >
                      {row.tag === 'success' ? (
                        <span className={styles.tagSmallSuccess}>
                          {row.value}
                        </span>
                      ) : row.tag === 'warning' ? (
                        <span className={styles.tagSmallWarning}>
                          {row.value}
                        </span>
                      ) : (
                        row.value
                      )}
                    </td>
                  </tr>
                ))}
              </tbody>
            </table>
            ) : (
              <div className={styles.loadingText}>
                等待预测结果加载
              </div>
            )}
          </div>
        </div>
      </div>

      {/* ====== Task 8: Model Comparison Chart ====== */}
      <div className={styles.panel}>
        <div className={styles.panelHeader}>
          <div className={styles.panelTitle}>
            <span className={styles.panelTitleIcon}><IconBarChart /></span>
            模型比较
          </div>
          {modelCompareData && (
            <div className={styles.panelActions}>
              <span className={`${styles.tag} ${styles.tagSuccess}`}>
                推荐: {modelCompareData.recommended_model?.toUpperCase()}
              </span>
            </div>
          )}
        </div>
        <div className={styles.panelBody}>
          <div
            ref={modelCompareChartRef}
            className={styles.chartContainer}
            style={{ height: 250 }}
          />
          {modelCompareData?.recommendation_reason && (
            <div style={{ fontSize: 12, color: 'var(--text-secondary)', marginTop: 8, textAlign: 'center' }}>
              {modelCompareData.recommendation_reason}
            </div>
          )}
        </div>
      </div>

      {/* ====== Task 10: Risk Monitoring Panel ====== */}
      <div className={styles.riskPanel}>
        <div className={styles.panelHeader} style={{ padding: '0 0 12px 0', border: 'none' }}>
          <div className={styles.panelTitle}>
            <span className={styles.panelTitleIcon}><IconShield /></span>
            风险监控面板
          </div>
        </div>
        <div className={styles.riskGrid}>
          <div className={styles.riskCard}>
            <div className={styles.riskCardTitle}>过程能力 Cpk</div>
            <div className={styles.riskCardValue} style={{ color: cpkData ? (cpkData.cpk_current >= 1.33 ? '#10b981' : cpkData.cpk_current >= 1.0 ? '#f59e0b' : '#ef4444') : 'var(--text-muted)' }}>
              {cpkData?.cpk_current?.toFixed(2) ?? '--'}
            </div>
            <div className={styles.riskCardTrend} style={{ color: 'var(--text-secondary)' }}>
              {cpkData ? (cpkData.cpk_trend != null ? `趋势: ${Number(cpkData.cpk_trend) > 0 ? '+' : ''}${cpkData.cpk_trend}` : '数据窗口不足') : '加载中...'}
            </div>
          </div>
          <div className={styles.riskCard}>
            <div className={styles.riskCardTitle}>越限概率</div>
            <div className={styles.riskCardValue} style={{ color: result?.risk ? riskLevelColor : 'var(--text-muted)' }}>
              {result?.risk ? `${(result.risk.breach_prob * 100).toFixed(1)}%` : '--'}
            </div>
            <div className={styles.riskCardTrend} style={{ color: 'var(--text-secondary)' }}>
              {result?.risk ? RISK_LABELS[result.risk.risk_level] || '' : '加载中...'}
            </div>
          </div>
          <div className={styles.riskCard}>
            <div className={styles.riskCardTitle}>漂移幅度 (σ)</div>
            <div className={styles.riskCardValue} style={{ color: driftData ? (driftData.alert ? '#ef4444' : '#10b981') : 'var(--text-muted)' }}>
              {driftData?.current_segment_drift != null ? `${driftData.current_segment_drift.toFixed(2)}σ` : '--'}
            </div>
            <div className={styles.riskCardTrend} style={{ color: 'var(--text-secondary)' }}>
              {driftData ? `方向: ${driftData.drift_direction === 'up' || driftData.drift_direction === 'upward' ? '↑ 上升' : driftData.drift_direction === 'down' || driftData.drift_direction === 'downward' ? '↓ 下降' : '→ 稳定'}` : '加载中...'}
            </div>
          </div>
          <div className={styles.riskCard}>
            <div className={styles.riskCardTitle}>能力评估</div>
            <div className={styles.riskCardValue} style={{
              fontSize: 16,
              color: (cpkData?.capability === 'excellent' || cpkData?.capability === 'capable') ? '#10b981' : (cpkData?.capability === 'sufficient' || cpkData?.capability === 'marginal') ? '#f59e0b' : cpkData ? '#ef4444' : 'var(--text-muted)',
            }}>
              {cpkData ? CAPABILITY_LABELS[cpkData.capability] || cpkData.capability : '--'}
            </div>
            <div className={styles.riskCardTrend} style={{ color: 'var(--text-secondary)' }}>
              {cpkData ? `窗口: ${cpkData.window_size} 个点` : ''}
            </div>
          </div>
        </div>
      </div>

      {/* ====== Task 12: Correlation Heatmap + Feature Importance ====== */}
      <div className={styles.gridTwoCharts}>
        <div className={styles.panel}>
          <div className={styles.panelHeader}>
            <div className={styles.panelTitle}>
              <span className={styles.panelTitleIcon}><IconGrid /></span>
              指标相关性热力图
            </div>
          </div>
          <div className={styles.panelBody}>
            {corrData ? (
              <div
                ref={correlationChartRef}
                className={styles.chartContainer}
                style={{ height: 320 }}
              />
            ) : corrError ? (
              <div className={styles.loadingText}>{corrError}</div>
            ) : (
              <div className={styles.loadingText}>加载相关性数据...</div>
            )}
          </div>
        </div>
        <div className={styles.panel}>
          <div className={styles.panelHeader}>
            <div className={styles.panelTitle}>
              <span className={styles.panelTitleIcon}><IconBarChart /></span>
              特征重要性
              {featData && (
                <span className={`${styles.tag} ${styles.tagInfo}`} style={{ marginLeft: 4 }}>
                  {featData.model?.toUpperCase()}
                </span>
              )}
            </div>
          </div>
          <div className={styles.panelBody}>
            {featData ? (
              <div
                ref={featureChartRef}
                className={styles.chartContainer}
                style={{ height: 320 }}
              />
            ) : featError ? (
              <div className={styles.loadingText}>{featError}</div>
            ) : (
              <div className={styles.loadingText}>加载特征重要性...</div>
            )}
          </div>
        </div>
      </div>

      {/* ====== Task 10: CRITICAL Alert Modal ====== */}
      {result?.risk?.risk_level === 'CRITICAL' && !criticalDismissed && (
        <div className={styles.criticalModal}>
          <div className={styles.criticalModalContent}>
            <div style={{ color: '#ef4444' }}>
              <IconAlertTriangle />
            </div>
            <div className={styles.criticalModalTitle}>紧急越限预警</div>
            <div className={styles.criticalModalText}>
              检测到 <b>{getIndicatorName(indicator)}</b> 存在极高越限风险。<br />
              越限概率: <b>{(result.risk.breach_prob * 100).toFixed(1)}%</b><br />
              预计越限时间: {result.risk.breach_time || '未知'}<br />
              越限方向: {result.risk.breach_direction === 'upper' ? '上限' : '下限'}
            </div>
            <button
              className={styles.criticalModalDismiss}
              onClick={() => setCriticalDismissed(true)}
            >
              我已知晓
            </button>
          </div>
        </div>
      )}
    </div>
  )
}

export default PredictionPage
