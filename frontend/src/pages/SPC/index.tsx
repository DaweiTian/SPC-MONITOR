import React, { useState, useEffect, useMemo } from 'react'
import type { EChartsOption } from 'echarts'
import { useChart, chartTheme, tooltipStyle } from '../../components/Charts'
import { useProducts, useIndicators } from '../../hooks'
import { api } from '../../services'
import type { SPCData } from '../../types'
import styles from './SPC.module.css'

export const SPCPage: React.FC = () => {
  const { products } = useProducts()
  const { indicators } = useIndicators()
  const [spcData, setSPCData] = useState<SPCData | null>(null)
  const [loading, setLoading] = useState(false)
  const [productStatus, setProductStatus] = useState<Record<string, string> | null>(null)
  const [aliases, setAliases] = useState<{ products: Record<string, string>; indicators: Record<string, string> }>({ products: {}, indicators: {} })
  const [initialized, setInitialized] = useState(false)
  const [filter, setFilter] = useState({
    product_code: '',
    indicator_code: 'fat',
    window: 30,
  })

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

  // Filter out disabled products (show all until status loaded)
  const enabledProducts = useMemo(() =>
    productStatus === null ? products : products.filter(p => productStatus[p.code] !== 'disabled'),
    [products, productStatus]
  )

  // Set initial product code once: prefer Dashboard's saved product, then first enabled
  useEffect(() => {
    if (initialized || enabledProducts.length === 0 || productStatus === null) return
    const dashboardProduct = localStorage.getItem('dashboard_selected_product')
    const saved = dashboardProduct && enabledProducts.find(p => p.code === dashboardProduct)
    setFilter(f => ({
      ...f,
      product_code: saved ? saved.code : enabledProducts[0].code,
    }))
    setInitialized(true)
  }, [enabledProducts, productStatus, initialized])

  // Auto-fetch when product or indicator changes (only after initialization)
  const fetchSPCData = async (productCode: string, indicatorCode: string, window: number) => {
    if (!productCode || !indicatorCode) return
    setLoading(true)
    try {
      const data = await api.getSPCData(productCode, indicatorCode, window)
      setSPCData(data)
    } catch (e) {
      console.error('获取SPC数据失败:', e)
    } finally {
      setLoading(false)
    }
  }

  useEffect(() => {
    if (initialized && filter.product_code && filter.indicator_code) {
      fetchSPCData(filter.product_code, filter.indicator_code, filter.window)
    }
  }, [initialized, filter.product_code, filter.indicator_code, filter.window])

  // Helper: get alias or original name
  const getIndicatorName = (code: string) => aliases.indicators[code] || indicators.find(i => i.code === code)?.name || code

  // Compute derived values
  const stats = useMemo(() => {
    if (!spcData) return null
    const { data_points, spec_limits, violations, sigma } = spcData
    const mean = spec_limits.mean
    const std = spec_limits.std || sigma
    const violationCount = data_points.filter(p => p.is_violation).length
    const total = data_points.length
    let status = '受控'
    if (violations.length > 2) status = '失控'
    else if (violations.length > 0) status = '基本受控'
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

  // Format time for x-axis display
  const formatTime = (timeStr: string) => {
    if (!timeStr) return ''
    const parts = timeStr.split(' ')
    const timePart = parts.length > 1 ? parts[1] : parts[0]
    return timePart.substring(0, 5)
  }

  // I Chart option
  const iChartOption = useMemo<EChartsOption | null>(() => {
    if (!spcData) return null
    const { data_points, i_chart, spec_limits } = spcData
    const times = data_points.map(p => formatTime(p.time))
    const values = data_points.map(p => p.value)
    const { ucl, cl, lcl } = i_chart
    const { usl, lsl } = spec_limits

    const markLineData: any[] = [
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

    return {
      ...chartTheme,
      tooltip: {
        trigger: 'axis',
        ...tooltipStyle,
        formatter: (params: any) => {
          const p = Array.isArray(params) ? params[0] : params
          const idx = p.dataIndex
          const pt = data_points[idx]
          const violation = pt.is_violation ? '<br/><span style="color:#ef4444;font-weight:bold">⚠ 违规点</span>' : ''
          return `<b>${pt.time}</b><br/>值: <b>${p.value}</b>${violation}`
        },
      },
      grid: { left: 50, right: 80, top: 30, bottom: 30 },
      xAxis: {
        type: 'category',
        data: times,
        ...chartTheme.xAxis,
        axisLabel: { ...(chartTheme.xAxis as any)?.axisLabel, rotate: times.length > 15 ? 30 : 0 },
      },
      yAxis: { type: 'value', ...chartTheme.yAxis, scale: true },
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
      }],
    }
  }, [spcData])

  // MR Chart option
  const mrChartOption = useMemo<EChartsOption | null>(() => {
    if (!spcData || mrData.values.length === 0) return null
    const { mr_chart, data_points } = spcData
    const { ucl, cl } = mr_chart
    const times = mrData.times.map(t => formatTime(t))

    return {
      ...chartTheme,
      tooltip: {
        trigger: 'axis',
        ...tooltipStyle,
        formatter: (params: any) => {
          const p = Array.isArray(params) ? params[0] : params
          const idx = p.dataIndex
          const time = mrData.times[idx]
          const violation = p.value > ucl ? '<br/><span style="color:#ef4444;font-weight:bold">⚠ 超出UCL</span>' : ''
          return `<b>${time}</b><br/>MR: <b>${p.value}</b>${violation}`
        },
      },
      grid: { left: 50, right: 80, top: 20, bottom: 30 },
      xAxis: {
        type: 'category',
        data: times,
        ...chartTheme.xAxis,
        axisLabel: { ...(chartTheme.xAxis as any)?.axisLabel, rotate: times.length > 15 ? 30 : 0 },
      },
      yAxis: { type: 'value', ...chartTheme.yAxis, scale: true },
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

  const { containerRef: iChartRef } = useChart(iChartOption)
  const { containerRef: mrChartRef } = useChart(mrChartOption)

  return (
    <div className={styles.page}>
      {/* Filter Bar */}
      <div className={styles.filterBar}>
        <div className={styles.filterGroup}>
          <span className={styles.filterLabel}>品项</span>
          <select
            className={styles.filterSelect}
            value={filter.product_code}
            onChange={e => setFilter(f => ({ ...f, product_code: e.target.value }))}
          >
            {enabledProducts.map((p, index) => (
              <option key={`${p.code}-${index}`} value={p.code}>{p.name}</option>
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
            {indicators.map(i => (
              <option key={i.code} value={i.code}>{getIndicatorName(i.code)}</option>
            ))}
          </select>
        </div>
        <div className={styles.filterGroup}>
          <span className={styles.filterLabel}>窗口</span>
          <input
            className={styles.filterInput}
            type="number"
            value={filter.window}
            onChange={e => setFilter(f => ({ ...f, window: parseInt(e.target.value) || 30 }))}
            min={10}
            max={100}
          />
        </div>
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
            <span className={styles.kpiUnit}>g/100g</span>
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
        <div className={`${styles.kpiCard} ${styles.kpiCardGreen}`}>
          <div className={styles.kpiHeader}>
            <span className={styles.kpiLabel}>过程状态</span>
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

      {/* I Chart */}
      <div className={styles.chartPanel}>
        <div className={styles.chartPanelHeader}>
          <div className={styles.chartPanelTitle}>
            <span className={styles.chartPanelTitleIcon}>
              <svg width="16" height="16" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round">
                <polyline points="22 12 18 12 15 21 9 3 6 12 2 12" />
              </svg>
            </span>
            单值控制图 (I Chart)
          </div>
          <div className={styles.chartPanelActions}>
            <span className={`${styles.tag} ${styles.tagSuccess}`}>UCL: {spcData?.i_chart.ucl.toFixed(3) || '-'}</span>
            <span className={`${styles.tag} ${styles.tagInfo}`}>CL: {spcData?.i_chart.cl.toFixed(3) || '-'}</span>
            <span className={`${styles.tag} ${styles.tagSuccess}`}>LCL: {spcData?.i_chart.lcl.toFixed(3) || '-'}</span>
            {spcData?.spec_limits.usl != null && (
              <span className={`${styles.tag} ${styles.tagCritical}`}>USL: {spcData.spec_limits.usl}</span>
            )}
            {spcData?.spec_limits.lsl != null && (
              <span className={`${styles.tag} ${styles.tagCritical}`}>LSL: {spcData.spec_limits.lsl}</span>
            )}
          </div>
        </div>
        <div className={styles.chartPanelBody}>
          <div ref={iChartRef} style={{ height: 340 }} />
        </div>
      </div>

      {/* MR Chart */}
      <div className={styles.chartPanel}>
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
            <span className={`${styles.tag} ${styles.tagSuccess}`}>UCL: {spcData?.mr_chart.ucl.toFixed(3) || '-'}</span>
            <span className={`${styles.tag} ${styles.tagInfo}`}>CL: {spcData?.mr_chart.cl.toFixed(3) || '-'}</span>
            <span className={`${styles.tag} ${styles.tagSuccess}`}>LCL: {spcData?.mr_chart.lcl ?? 0}</span>
          </div>
        </div>
        <div className={styles.chartPanelBody}>
          <div ref={mrChartRef} style={{ height: 240 }} />
        </div>
      </div>

      {/* Nelson Rules Violations */}
      {spcData?.violations && spcData.violations.length > 0 && (
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
            <table className={styles.violationsTable}>
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
