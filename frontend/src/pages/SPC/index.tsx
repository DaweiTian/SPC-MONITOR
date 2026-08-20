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
  const [filter, setFilter] = useState({
    product_code: 'P001',
    indicator_code: 'fat',
    chart_type: 'imr',
    window: 30,
  })

  const fetchSPCData = async () => {
    setLoading(true)
    try {
      const data = await api.getSPCData(filter.product_code, filter.indicator_code, filter.window)
      setSPCData(data)
    } catch (e) {
      console.error('获取SPC数据失败:', e)
    } finally {
      setLoading(false)
    }
  }

  useEffect(() => {
    fetchSPCData()
  }, [])

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

  // Compute MR values from data points
  const mrValues = useMemo(() => {
    if (!spcData) return []
    const { data_points } = spcData
    const mrs: number[] = []
    for (let i = 1; i < data_points.length; i++) {
      mrs.push(Math.abs(data_points[i].value - data_points[i - 1].value))
    }
    return mrs
  }, [spcData])

  // I Chart option
  const iChartOption = useMemo<EChartsOption | null>(() => {
    if (!spcData) return null
    const { data_points, i_chart, spec_limits } = spcData
    const times = data_points.map((_, i) => `#${i + 1}`)
    const values = data_points.map(p => p.value)
    const { ucl, cl, lcl } = i_chart
    const { usl, lsl } = spec_limits

    return {
      ...chartTheme,
      tooltip: { trigger: 'axis', ...tooltipStyle },
      grid: { left: 50, right: 20, top: 30, bottom: 30 },
      xAxis: { type: 'category', data: times, ...chartTheme.xAxis },
      yAxis: { type: 'value', ...chartTheme.yAxis, scale: true },
      series: [{
        name: '单值',
        type: 'line',
        symbol: 'circle',
        symbolSize: 7,
        data: values.map((v) => ({
          value: v,
          itemStyle: (v > ucl || v < lcl || v > usl || v < lsl)
            ? { color: '#ef4444' }
            : { color: '#00d4ff' },
        })),
        lineStyle: { color: '#00d4ff', width: 2 },
        markLine: {
          symbol: 'none',
          silent: true,
          data: [
            {
              yAxis: ucl,
              lineStyle: { color: '#f59e0b', type: 'dashed' },
              label: { formatter: `UCL=${ucl.toFixed(3)}`, color: '#f59e0b', fontSize: 10, position: 'end' },
            },
            {
              yAxis: cl,
              lineStyle: { color: '#94a3b8', type: 'solid', width: 1 },
              label: { formatter: `CL=${cl.toFixed(3)}`, color: '#94a3b8', fontSize: 10, position: 'end' },
            },
            {
              yAxis: lcl,
              lineStyle: { color: '#f59e0b', type: 'dashed' },
              label: { formatter: `LCL=${lcl.toFixed(3)}`, color: '#f59e0b', fontSize: 10, position: 'end' },
            },
            ...(usl != null ? [{
              yAxis: usl,
              lineStyle: { color: '#ef4444', type: 'dotted' as const, width: 1.5 },
              label: { formatter: `USL=${usl}`, color: '#ef4444', fontSize: 10, position: 'start' as const },
            }] : []),
            ...(lsl != null ? [{
              yAxis: lsl,
              lineStyle: { color: '#ef4444', type: 'dotted' as const, width: 1.5 },
              label: { formatter: `LSL=${lsl}`, color: '#ef4444', fontSize: 10, position: 'start' as const },
            }] : []),
          ],
        },
      }],
    }
  }, [spcData])

  // MR Chart option
  const mrChartOption = useMemo<EChartsOption | null>(() => {
    if (!spcData || mrValues.length === 0) return null
    const { mr_chart } = spcData
    const { ucl, cl } = mr_chart
    const times = mrValues.map((_, i) => `#${i + 2}`)

    return {
      ...chartTheme,
      tooltip: { trigger: 'axis', ...tooltipStyle },
      grid: { left: 50, right: 20, top: 20, bottom: 30 },
      xAxis: { type: 'category', data: times, ...chartTheme.xAxis },
      yAxis: { type: 'value', ...chartTheme.yAxis, scale: true },
      series: [{
        name: '移动极差',
        type: 'line',
        symbol: 'circle',
        symbolSize: 6,
        data: mrValues.map((v) => ({
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
              label: { formatter: `UCL=${ucl.toFixed(3)}`, color: '#f59e0b', fontSize: 10, position: 'end' },
            },
            {
              yAxis: cl,
              lineStyle: { color: '#94a3b8', type: 'solid', width: 1 },
              label: { formatter: `CL=${cl.toFixed(3)}`, color: '#94a3b8', fontSize: 10, position: 'end' },
            },
          ],
        },
      }],
    }
  }, [spcData, mrValues])

  const { containerRef: iChartRef } = useChart(iChartOption)
  const { containerRef: mrChartRef } = useChart(mrChartOption)

  const handleQuery = () => {
    fetchSPCData()
  }

  return (
    <div className={styles.page}>
      <div className={styles.pageTitle}>
        <div className={styles.pageTitleIcon}>📈</div>
        SPC控制图分析
      </div>

      {/* Filter Bar */}
      <div className={styles.filterBar}>
        <div className={styles.filterGroup}>
          <span className={styles.filterLabel}>品项</span>
          <select
            className={styles.filterSelect}
            value={filter.product_code}
            onChange={e => setFilter({ ...filter, product_code: e.target.value })}
          >
            {products.map((p, index) => (
              <option key={`${p.code}-${index}`} value={p.code}>{p.name}</option>
            ))}
          </select>
        </div>
        <div className={styles.filterGroup}>
          <span className={styles.filterLabel}>指标</span>
          <select
            className={styles.filterSelect}
            value={filter.indicator_code}
            onChange={e => setFilter({ ...filter, indicator_code: e.target.value })}
          >
            {indicators.map(i => (
              <option key={i.code} value={i.code}>{i.name}</option>
            ))}
          </select>
        </div>
        <div className={styles.filterGroup}>
          <span className={styles.filterLabel}>图表类型</span>
          <select
            className={styles.filterSelect}
            value={filter.chart_type}
            onChange={e => setFilter({ ...filter, chart_type: e.target.value })}
          >
            <option value="imr">I-MR 控制图</option>
            <option value="xbar">X-bar R 控制图</option>
          </select>
        </div>
        <div className={styles.filterGroup}>
          <span className={styles.filterLabel}>窗口</span>
          <input
            className={styles.filterInput}
            type="number"
            value={filter.window}
            onChange={e => setFilter({ ...filter, window: parseInt(e.target.value) || 30 })}
            min={10}
            max={100}
          />
        </div>
        <button className={styles.btnQuery} onClick={handleQuery} disabled={loading}>
          🔍 查询
        </button>
      </div>

      {/* KPI Stats Cards */}
      <div className={styles.kpiGrid}>
        <div className={`${styles.kpiCard} ${styles.kpiCardCyan}`}>
          <div className={styles.kpiHeader}>
            <span className={styles.kpiLabel}>均值 (X̄)</span>
            <div className={styles.kpiIcon}>📊</div>
          </div>
          <div className={styles.kpiValue}>
            {stats?.mean.toFixed(2) || '-'}
            <span className={styles.kpiUnit}>g/100g</span>
          </div>
        </div>
        <div className={`${styles.kpiCard} ${styles.kpiCardPurple}`}>
          <div className={styles.kpiHeader}>
            <span className={styles.kpiLabel}>标准差 (σ)</span>
            <div className={styles.kpiIcon}>📐</div>
          </div>
          <div className={styles.kpiValue}>
            {stats?.std.toFixed(3) || '-'}
          </div>
        </div>
        <div className={`${styles.kpiCard} ${styles.kpiCardOrange}`}>
          <div className={styles.kpiHeader}>
            <span className={styles.kpiLabel}>违规点数</span>
            <div className={styles.kpiIcon}>⚠️</div>
          </div>
          <div className={styles.kpiValue}>
            {stats?.violationCount ?? '-'}
            <span className={styles.kpiUnit}>/ {stats?.total ?? '-'}</span>
          </div>
        </div>
        <div className={`${styles.kpiCard} ${styles.kpiCardGreen}`}>
          <div className={styles.kpiHeader}>
            <span className={styles.kpiLabel}>过程状态</span>
            <div className={styles.kpiIcon}>✅</div>
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
            <span className={styles.chartPanelTitleIcon}>📉</span>
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
            <span className={styles.chartPanelTitleIcon}>📉</span>
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
              <span style={{ color: 'var(--accent-orange)' }}>⚡</span>
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
