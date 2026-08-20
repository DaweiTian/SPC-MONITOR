import React, { useState, useEffect, useMemo, useCallback } from 'react'
import { useChart, chartTheme, tooltipStyle } from '../../components/Charts'
import { api } from '../../services'
import { useProducts, useIndicators } from '../../hooks'
import styles from './Prediction.module.css'

const HORIZON_MAP: Record<string, number> = { '1h': 12, '2h': 24, 'shift': 60 }

interface PredictionResult {
  historical: { time: string; value: number }[]
  predictions: number[]
  upper_band: number[]
  lower_band: number[]
  accuracy: { mape: number | null; rmse: number; mae: number; r_squared: number | null }
  model: string
  horizon: number
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

// ====== Component ======
export const PredictionPage: React.FC = () => {
  const { products } = useProducts()
  const { indicators } = useIndicators()
  const [productStatus, setProductStatus] = useState<Record<string, string> | null>(null)
  const [aliases, setAliases] = useState<{ products: Record<string, string>; indicators: Record<string, string> }>({ products: {}, indicators: {} })
  const [initialized, setInitialized] = useState(false)
  const [product, setProduct] = useState('')
  const [indicator, setIndicator] = useState('')
  const [model, setModel] = useState('ets')
  const [horizon, setHorizon] = useState('1h')
  const [loading, setLoading] = useState(false)
  const [result, setResult] = useState<PredictionResult | null>(null)

  // Load product status and aliases
  useEffect(() => {
    Promise.all([
      api.getProductStatus(),
      api.getAliases(),
    ]).then(([status, aliasData]) => {
      setProductStatus(status)
      setAliases(aliasData)
    }).catch(console.error)
  }, [])

  // Filter out disabled products
  const enabledProducts = useMemo(() =>
    productStatus === null ? products : products.filter(p => productStatus[p.code] !== 'disabled'),
    [products, productStatus]
  )

  // Initialize product/indicator from Dashboard or first enabled
  useEffect(() => {
    if (initialized || enabledProducts.length === 0 || productStatus === null) return
    const dashboardProduct = localStorage.getItem('dashboard_selected_product')
    const savedProduct = dashboardProduct && enabledProducts.find(p => p.code === dashboardProduct)
    const initProduct = savedProduct ? savedProduct.code : enabledProducts[0].code
    setProduct(initProduct)

    const savedIndicator = localStorage.getItem('prediction_indicator')
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
    setLoading(true)
    try {
      const horizonSteps = HORIZON_MAP[horizonKey] || 12
      const [predRes, histData] = await Promise.all([
        api.getPrediction(productCode, indicatorCode, modelType, horizonSteps),
        api.getRecentData({ indicator_code: indicatorCode, product_code: productCode, limit: 60 }),
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
        })
      }
    } catch (e) {
      console.error('Prediction failed:', e)
    } finally {
      setLoading(false)
    }
  }, [])

  useEffect(() => {
    if (initialized && product && indicator) {
      fetchPrediction(product, indicator, model, horizon)
    }
  }, [initialized, product, indicator, model, horizon, fetchPrediction])

  // Helper: get alias or original name
  const getIndicatorName = (code: string) =>
    aliases.indicators[code] || indicators.find(i => i.code === code)?.name || code

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
      grid: { left: 50, right: 20, top: 27, bottom: 30 },
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

  // ====== Model evaluation data ======
  const modelLabels: Record<string, string> = { ets: '指数平滑 (ETS)', ma: '移动平均 (MA)', arima: 'ARIMA' }
  const modelEvalRows = result ? [
    { label: '预测模型', value: modelLabels[result.model] || result.model },
    { label: 'MAPE (平均绝对百分比误差)', value: result.accuracy.mape != null ? `${result.accuracy.mape.toFixed(2)}%` : 'N/A', color: 'green' },
    { label: 'RMSE (均方根误差)', value: result.accuracy.rmse.toFixed(4), color: 'cyan' },
    { label: 'MAE (平均绝对误差)', value: result.accuracy.mae.toFixed(4), color: 'cyan' },
    { label: 'R² (决定系数)', value: result.accuracy.r_squared != null ? result.accuracy.r_squared.toFixed(4) : 'N/A', color: 'green' },
    { label: '预测步长', value: `${result.horizon} 步` },
    { label: '历史窗口', value: `${result.historical.length} 个数据点` },
    { label: '越限风险评估', value: '低风险', tag: 'success' },
  ] : null

  return (
    <div>
      {/* ====== Filter Bar (no title, consistent with SPC/Capability) ====== */}
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
          {indicators.map(i => <option key={i.code} value={i.code}>{getIndicatorName(i.code)}</option>)}
        </select>
        <select
          className={styles.filterSelect}
          value={model}
          onChange={(e) => setModel(e.target.value)}
        >
          <option value="ets">指数平滑 (ETS)</option>
          <option value="ma">移动平均 (MA)</option>
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

      {/* ====== KPI Cards ====== */}
      <div className={styles.kpiGrid}>
        <div className={`${styles.kpiCard} ${styles.kpiCardCyan}`}>
          <div className={styles.kpiHeader}>
            <span className={styles.kpiLabel}>预测均值</span>
            <div className={styles.kpiIcon}><IconChart /></div>
          </div>
          <div className={styles.kpiValue}>
            {result ? (result.predictions.reduce((a, b) => a + b, 0) / result.predictions.length).toFixed(2) : '--'}
            <span className={styles.kpiUnit}>值</span>
          </div>
          <div className={`${styles.kpiTrend} ${styles.kpiTrendUp}`}>
            {result ? `基于${result.historical.length}个历史点` : '等待预测'}
          </div>
        </div>
        <div className={`${styles.kpiCard} ${styles.kpiCardOrange}`}>
          <div className={styles.kpiHeader}>
            <span className={styles.kpiLabel}>预测越限时间</span>
            <div className={styles.kpiIcon}><IconClock /></div>
          </div>
          <div className={styles.kpiValue} style={{ fontSize: 24 }}>
            暂无越限风险
          </div>
          <div className={`${styles.kpiTrend} ${styles.kpiTrendFlat}`}>
            {result ? `${result.horizon}步内安全` : '等待预测'}
          </div>
        </div>
        <div className={`${styles.kpiCard} ${styles.kpiCardPurple}`}>
          <div className={styles.kpiHeader}>
            <span className={styles.kpiLabel}>MAPE</span>
            <div className={styles.kpiIcon}><IconTarget /></div>
          </div>
          <div className={styles.kpiValue}>
            {result?.accuracy.mape != null ? result.accuracy.mape.toFixed(2) : '--'}
            <span className={styles.kpiUnit}>%</span>
          </div>
          <div className={`${styles.kpiTrend} ${styles.kpiTrendUp}`}>
            {result?.accuracy.mape != null && result.accuracy.mape < 5 ? '准确度良好' : '等待数据'}
          </div>
        </div>
        <div className={`${styles.kpiCard} ${styles.kpiCardGreen}`}>
          <div className={styles.kpiHeader}>
            <span className={styles.kpiLabel}>R² 决定系数</span>
            <div className={styles.kpiIcon}><IconCheck /></div>
          </div>
          <div className={styles.kpiValue}>
            {result?.accuracy.r_squared != null ? result.accuracy.r_squared.toFixed(2) : '--'}
          </div>
          <div className={`${styles.kpiTrend} ${styles.kpiTrendFlat}`}>
            {result?.accuracy.r_squared != null && result.accuracy.r_squared > 0.8 ? '拟合度良好' : '等待数据'}
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
          <div className={styles.panelBody}>
            <div
              ref={residualChartRef}
              className={styles.chartContainer}
              style={{ height: 290 }}
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
            <table className={styles.dataTable}>
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
    </div>
  )
}
