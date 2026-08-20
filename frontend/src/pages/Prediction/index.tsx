import React, { useState, useMemo } from 'react'
import { useChart, chartTheme, tooltipStyle } from '../../components/Charts'
import styles from './Prediction.module.css'

// ====== Mock Data Generation ======
function generatePredictionData() {
  const histN = 40
  const predN = 12
  const base = 3.52

  const histData: (number | null)[] = []
  const predData: (number | null)[] = []
  const upperBand: (number | null)[] = []
  const lowerBand: (number | null)[] = []
  const allLabels: string[] = []

  for (let i = 0; i < histN; i++) {
    const val = base + (Math.random() - 0.5) * 0.15 + Math.sin(i / 10) * 0.03
    histData.push(parseFloat(val.toFixed(3)))
    predData.push(null)
    upperBand.push(null)
    lowerBand.push(null)
    const t = new Date(Date.now() - (histN - i) * 5 * 60000)
    allLabels.push(
      `${String(t.getHours()).padStart(2, '0')}:${String(t.getMinutes()).padStart(2, '0')}`
    )
  }

  const lastVal = histData[histData.length - 1]!
  for (let i = 0; i < predN; i++) {
    const val = lastVal + 0.002 * (i + 1) + (Math.random() - 0.5) * 0.02
    histData.push(null)
    predData.push(parseFloat(val.toFixed(3)))
    upperBand.push(parseFloat((val + 0.03 + i * 0.005).toFixed(3)))
    lowerBand.push(parseFloat((val - 0.03 - i * 0.005).toFixed(3)))
    const t = new Date(Date.now() + (i + 1) * 5 * 60000)
    allLabels.push(
      `${String(t.getHours()).padStart(2, '0')}:${String(t.getMinutes()).padStart(2, '0')}`
    )
  }

  // Connect historical to prediction
  predData[histN - 1] = histData[histN - 1]

  return { histData, predData, upperBand, lowerBand, allLabels }
}

function generateResiduals() {
  const residuals: number[] = []
  for (let i = 0; i < 30; i++) {
    residuals.push(parseFloat(((Math.random() - 0.5) * 0.04).toFixed(4)))
  }
  return residuals
}

// ====== Component ======
export const PredictionPage: React.FC = () => {
  const [product, setProduct] = useState('砖纯牛奶')
  const [indicator, setIndicator] = useState('脂肪')
  const [model, setModel] = useState('ets')
  const [horizon, setHorizon] = useState('1h')

  // Generate mock data (stable across renders until "predict" is clicked)
  const [predictionData] = useState(() => generatePredictionData())
  const [residuals] = useState(() => generateResiduals())

  const handlePredict = () => {
    // In the future, this will call api.getPrediction()
    // For now, just regenerate mock data
    window.location.reload()
  }

  // ====== Prediction Trend Chart ======
  const predictionOption = useMemo(() => {
    const { histData, predData, upperBand, lowerBand, allLabels } = predictionData

    return {
      ...chartTheme,
      tooltip: {
        trigger: 'axis' as const,
        ...tooltipStyle,
      },
      legend: {
        data: ['历史数据', '预测曲线', '95%置信区间'],
        textStyle: { color: '#8b95a7' },
        top: 0,
      },
      grid: { left: 50, right: 30, top: 40, bottom: 30 },
      xAxis: {
        type: 'category' as const,
        data: allLabels,
        axisLine: { lineStyle: { color: 'rgba(64,159,255,0.15)' } },
        axisLabel: { color: '#8b95a7', fontSize: 11, interval: 4 },
        splitLine: { lineStyle: { color: 'rgba(64,159,255,0.05)' } },
      },
      yAxis: {
        type: 'value' as const,
        ...chartTheme.yAxis,
        scale: true,
        min: 3.3,
        max: 3.8,
      },
      series: [
        {
          name: '95%置信区间',
          type: 'line' as const,
          symbol: 'none',
          data: upperBand,
          lineStyle: { opacity: 0 },
          areaStyle: { color: 'rgba(139,92,246,0.12)' },
          silent: true,
        },
        {
          name: '95%置信区间',
          type: 'line' as const,
          symbol: 'none',
          data: lowerBand,
          lineStyle: { opacity: 0 },
          areaStyle: { color: 'rgba(139,92,246,0)' },
          silent: true,
        },
        {
          name: '历史数据',
          type: 'line' as const,
          smooth: true,
          symbol: 'none',
          data: histData,
          lineStyle: { color: '#00d4ff', width: 2 },
          areaStyle: {
            color: {
              type: 'linear' as const,
              x: 0,
              y: 0,
              x2: 0,
              y2: 1,
              colorStops: [
                { offset: 0, color: 'rgba(0,212,255,0.15)' },
                { offset: 1, color: 'rgba(0,212,255,0)' },
              ],
            },
          },
        },
        {
          name: '预测曲线',
          type: 'line' as const,
          smooth: true,
          symbol: 'circle',
          symbolSize: 5,
          data: predData,
          lineStyle: { color: '#10b981', width: 2, type: 'dashed' as const },
          itemStyle: { color: '#10b981' },
          markLine: {
            symbol: 'none',
            silent: true,
            data: [
              {
                yAxis: 3.8,
                lineStyle: { color: '#ef4444', type: 'dotted' as const },
                label: { formatter: 'USL', color: '#ef4444', fontSize: 10 },
              },
              {
                yAxis: 3.25,
                lineStyle: { color: '#ef4444', type: 'dotted' as const },
                label: { formatter: 'LSL', color: '#ef4444', fontSize: 10 },
              },
            ],
          },
        },
      ],
    }
  }, [predictionData])

  const { containerRef: predChartRef } = useChart(predictionOption)

  // ====== Residual Chart ======
  const residualOption = useMemo(() => {
    return {
      ...chartTheme,
      tooltip: {
        trigger: 'axis' as const,
        ...tooltipStyle,
      },
      grid: { left: 50, right: 20, top: 20, bottom: 30 },
      xAxis: {
        type: 'category' as const,
        data: residuals.map((_, i) => `#${i + 1}`),
        ...chartTheme.xAxis,
      },
      yAxis: {
        type: 'value' as const,
        ...chartTheme.yAxis,
        name: '残差',
      },
      series: [
        {
          type: 'bar' as const,
          barWidth: '60%',
          data: residuals.map((v) => ({
            value: v,
            itemStyle: {
              color: v >= 0 ? 'rgba(0,212,255,0.6)' : 'rgba(239,68,68,0.6)',
            },
          })),
          markLine: {
            symbol: 'none',
            silent: true,
            data: [
              { yAxis: 0, lineStyle: { color: '#94a3b8', width: 1 } },
            ],
          },
        },
      ],
    }
  }, [residuals])

  const { containerRef: residualChartRef } = useChart(residualOption)

  // ====== Model evaluation data ======
  const modelEvalRows = [
    { label: '预测模型', value: '指数平滑 (ETS)' },
    { label: 'MAPE (平均绝对百分比误差)', value: '1.85%', color: 'green' },
    { label: 'RMSE (均方根误差)', value: '0.023', color: 'cyan' },
    { label: 'MAE (平均绝对误差)', value: '0.018', color: 'cyan' },
    { label: 'R² (决定系数)', value: '0.92', color: 'green' },
    { label: '预测步长', value: '12 步 (1小时)' },
    { label: '历史窗口', value: '最近 60 个数据点' },
    { label: '越限风险评估', value: '低风险', tag: 'success' },
  ]

  return (
    <div>
      {/* ====== Filter Bar ====== */}
      <div className={styles.filterBar}>
        <span className={styles.filterLabel}>🔮 指标预测分析</span>
        <select
          className={styles.filterSelect}
          value={product}
          onChange={(e) => setProduct(e.target.value)}
        >
          <option value="砖纯牛奶">砖纯牛奶</option>
          <option value="枕纯牛奶">枕纯牛奶</option>
        </select>
        <select
          className={styles.filterSelect}
          value={indicator}
          onChange={(e) => setIndicator(e.target.value)}
        >
          <option value="脂肪">脂肪</option>
          <option value="蛋白质">蛋白质</option>
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
        <button className={styles.predictBtn} onClick={handlePredict}>
          🔮 开始预测
        </button>
      </div>

      {/* ====== KPI Cards ====== */}
      <div className={styles.kpiGrid}>
        <div className={`${styles.kpiCard} ${styles.kpiCardCyan}`}>
          <div className={styles.kpiHeader}>
            <span className={styles.kpiLabel}>预测均值</span>
            <div className={styles.kpiIcon}>📊</div>
          </div>
          <div className={styles.kpiValue}>
            3.54<span className={styles.kpiUnit}>g/100g</span>
          </div>
          <div className={`${styles.kpiTrend} ${styles.kpiTrendUp}`}>
            ↑ 0.02 vs 当前
          </div>
        </div>
        <div className={`${styles.kpiCard} ${styles.kpiCardOrange}`}>
          <div className={styles.kpiHeader}>
            <span className={styles.kpiLabel}>预测越限时间</span>
            <div className={styles.kpiIcon}>⏰</div>
          </div>
          <div className={styles.kpiValue} style={{ fontSize: 24 }}>
            暂无越限风险
          </div>
          <div className={`${styles.kpiTrend} ${styles.kpiTrendFlat}`}>
            1小时内安全
          </div>
        </div>
        <div className={`${styles.kpiCard} ${styles.kpiCardPurple}`}>
          <div className={styles.kpiHeader}>
            <span className={styles.kpiLabel}>MAPE</span>
            <div className={styles.kpiIcon}>📐</div>
          </div>
          <div className={styles.kpiValue}>
            1.85<span className={styles.kpiUnit}>%</span>
          </div>
          <div className={`${styles.kpiTrend} ${styles.kpiTrendUp}`}>
            准确度良好
          </div>
        </div>
        <div className={`${styles.kpiCard} ${styles.kpiCardGreen}`}>
          <div className={styles.kpiHeader}>
            <span className={styles.kpiLabel}>预测置信度</span>
            <div className={styles.kpiIcon}>✅</div>
          </div>
          <div className={styles.kpiValue}>
            95<span className={styles.kpiUnit}>%</span>
          </div>
          <div className={`${styles.kpiTrend} ${styles.kpiTrendFlat}`}>
            置信区间可靠
          </div>
        </div>
      </div>

      {/* ====== Prediction Trend Chart ====== */}
      <div className={styles.panel}>
        <div className={styles.panelHeader}>
          <div className={styles.panelTitle}>
            <span className={styles.panelTitleIcon}>📈</span>
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
            <span className={`${styles.tag} ${styles.tagCritical}`}>
              规格限
            </span>
          </div>
        </div>
        <div className={styles.panelBody}>
          <div
            ref={predChartRef}
            className={styles.chartContainer}
            style={{ height: 380 }}
          />
        </div>
      </div>

      {/* ====== Residual Analysis + Model Evaluation ====== */}
      <div className={styles.gridTwo}>
        <div className={styles.panel}>
          <div className={styles.panelHeader}>
            <div className={styles.panelTitle}>
              <span className={styles.panelTitleIcon}>📊</span>
              预测残差分析
            </div>
          </div>
          <div className={styles.panelBody}>
            <div
              ref={residualChartRef}
              className={styles.chartContainer}
              style={{ height: 260 }}
            />
          </div>
        </div>
        <div className={styles.panel}>
          <div className={styles.panelHeader}>
            <div className={styles.panelTitle}>
              <span className={styles.panelTitleIcon}>📋</span>
              预测模型评估
            </div>
          </div>
          <div className={styles.panelBody}>
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
          </div>
        </div>
      </div>
    </div>
  )
}
