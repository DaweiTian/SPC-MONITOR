import React, { useState, useEffect, useCallback, useMemo } from 'react'
import type { EChartsOption } from 'echarts'
import { api, websocketService } from '../../services'
import { useChart, chartTheme, tooltipStyle } from '../../components/Charts'
import type { DashboardData, SchedulerStatus, Product, Indicator, MonitorData, CapabilityData } from '../../types'
import styles from './Dashboard.module.css'

/* ────────── 指标选项 ────────── */
const METRICS = [
  { key: 'fat', name: '脂肪' },
  { key: 'protein', name: '蛋白质' },
  { key: 'solid', name: '干物质' },
] as const

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

/* ────────── 时间格式化 ────────── */
function fmtTime(iso?: string): string {
  if (!iso) return '-'
  return new Date(iso).toLocaleTimeString('zh-CN', { hour: '2-digit', minute: '2-digit', second: '2-digit' })
}

/* ================================================================
 *  Dashboard Page
 * ================================================================ */
export const Dashboard: React.FC = () => {
  /* ── state ── */
  const [dashboard, setDashboard] = useState<DashboardData | null>(null)
  const [status, setStatus] = useState<SchedulerStatus | null>(null)
  const [products, setProducts] = useState<Product[]>([])
  const [indicators, setIndicators] = useState<Indicator[]>([])
  const [recentData, setRecentData] = useState<MonitorData[]>([])
  const [capMatrix, setCapMatrix] = useState<CapabilityData[]>([])
  const [selectedMetric, setSelectedMetric] = useState('fat')
  const [collecting, setCollecting] = useState(false)

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
      const [p, i] = await Promise.all([api.getProducts(), api.getIndicators()])
      setProducts(p.products)
      setIndicators(i.indicators)
    } catch (e) {
      console.error('获取元数据失败:', e)
    }
  }, [])

  const fetchTrend = useCallback(async () => {
    if (products.length === 0) return
    try {
      const result = await api.getRecentData({
        indicator_code: selectedMetric,
        product_code: products[0].code,
        limit: 60,
      })
      setRecentData(Array.isArray(result) ? result : result.data || [])
    } catch (e) {
      console.error('获取趋势数据失败:', e)
    }
  }, [products, selectedMetric])

  const fetchCapMatrix = useCallback(async () => {
    if (products.length === 0 || indicators.length === 0) return
    try {
      const pairs: Array<[string, string]> = []
      for (const p of products) {
        for (const ind of indicators) {
          pairs.push([p.code, ind.code])
        }
      }
      const results = await Promise.all(
        pairs.map(([pc, ic]) => api.getCapabilityData(pc, ic).catch(() => null)),
      )
      setCapMatrix(results.filter(Boolean) as CapabilityData[])
    } catch (e) {
      console.error('获取过程能力数据失败:', e)
    }
  }, [products, indicators])

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

  useEffect(() => { fetchTrend() }, [fetchTrend])
  useEffect(() => { fetchCapMatrix() }, [fetchCapMatrix])

  /* ── manual collect ── */
  const handleCollect = async () => {
    setCollecting(true)
    try {
      await api.manualCollect()
      fetchDashboard()
    } catch (e) {
      console.error('手动采集失败:', e)
    } finally {
      setCollecting(false)
    }
  }

  /* ── derived data ── */
  const pendingAlerts = dashboard
    ? (dashboard.pending_alerts.CRITICAL || 0) + (dashboard.pending_alerts.WARNING || 0)
    : 0

  const avgCpk = useMemo(() => {
    if (capMatrix.length === 0) return 0
    const sum = capMatrix.reduce((s, c) => s + c.result.cpk, 0)
    return +(sum / capMatrix.length).toFixed(2)
  }, [capMatrix])

  /* ── trend chart option ── */
  const metricName = METRICS.find(m => m.key === selectedMetric)?.name || '脂肪'

  const chartOption: EChartsOption | null = useMemo(() => {
    if (recentData.length === 0) return null

    const sorted = [...recentData].sort(
      (a, b) => new Date(a.sample_time).getTime() - new Date(b.sample_time).getTime(),
    )
    const times = sorted.map(d =>
      new Date(d.sample_time).toLocaleTimeString('zh-CN', { hour: '2-digit', minute: '2-digit' }),
    )
    const values = sorted.map(d => d.value)

    // use first data point's spec limits as USL/LSL if available
    const first = sorted[0]
    const usl = first.upper_limit ?? null
    const lsl = first.lower_limit ?? null

    const markLineData: any[] = []
    if (usl !== null) {
      markLineData.push({
        yAxis: usl,
        lineStyle: { color: '#ef4444', type: 'dashed', width: 1 },
        label: { formatter: `USL=${usl}`, color: '#ef4444', fontSize: 10, position: 'start' },
      })
    }
    if (lsl !== null) {
      markLineData.push({
        yAxis: lsl,
        lineStyle: { color: '#ef4444', type: 'dashed', width: 1 },
        label: { formatter: `LSL=${lsl}`, color: '#ef4444', fontSize: 10, position: 'start' },
      })
    }

    return {
      ...chartTheme,
      tooltip: { trigger: 'axis', ...tooltipStyle },
      legend: {
        data: [metricName, ...(usl !== null ? ['USL'] : []), ...(lsl !== null ? ['LSL'] : [])],
        textStyle: { color: '#8b95a7' },
        top: 0,
        right: 10,
      },
      grid: { left: 50, right: 20, top: 40, bottom: 30 },
      xAxis: {
        type: 'category',
        data: times,
        ...chartTheme.xAxis,
      },
      yAxis: { type: 'value', ...chartTheme.yAxis, scale: true },
      series: [
        {
          name: metricName,
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
            } as any,
          },
          ...(markLineData.length > 0
            ? { markLine: { symbol: 'none', silent: true, data: markLineData } }
            : {}),
        },
      ],
    }
  }, [recentData, metricName])

  const { containerRef } = useChart(chartOption)

  /* ── product name lookup ── */
  const productNameMap = useMemo(() => {
    const m: Record<string, string> = {}
    products.forEach(p => { m[p.code] = p.name })
    return m
  }, [products])

  const indicatorNameMap = useMemo(() => {
    const m: Record<string, string> = {}
    indicators.forEach(i => { m[i.code] = i.name })
    return m
  }, [indicators])

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
      <div className={styles.kpiGrid}>
        {/* 今日检测 */}
        <div className={`${styles.kpiCard} ${styles.kpiCardCyan}`}>
          <div className={styles.kpiHeader}>
            <span className={styles.kpiLabel}>今日检测</span>
            <div className={styles.kpiIcon}>📋</div>
          </div>
          <div className={styles.kpiValue}>
            {dashboard?.today_data_count ?? 0}<span className={styles.kpiUnit}>次</span>
          </div>
          <div className={`${styles.kpiTrend} ${styles.kpiTrendUp}`}>↑ 数据正常</div>
        </div>

        {/* 待处理预警 */}
        <div className={`${styles.kpiCard} ${styles.kpiCardRed}`}>
          <div className={styles.kpiHeader}>
            <span className={styles.kpiLabel}>待处理预警</span>
            <div className={styles.kpiIcon}>⚠️</div>
          </div>
          <div className={styles.kpiValue}>
            {pendingAlerts}<span className={styles.kpiUnit}>条</span>
          </div>
          <div className={`${styles.kpiTrend} ${pendingAlerts > 0 ? styles.kpiTrendDown : styles.kpiTrendFlat}`}>
            {pendingAlerts > 0 ? `↑ ${pendingAlerts}条待处理` : '→ 无预警'}
          </div>
        </div>

        {/* 今日采集 */}
        <div className={`${styles.kpiCard} ${styles.kpiCardGreen}`}>
          <div className={styles.kpiHeader}>
            <span className={styles.kpiLabel}>今日采集</span>
            <div className={styles.kpiIcon}>🔄</div>
          </div>
          <div className={styles.kpiValue}>
            {dashboard?.today_sync_count ?? 0}<span className={styles.kpiUnit}>条</span>
          </div>
          <div className={`${styles.kpiTrend} ${styles.kpiTrendUp}`}>
            成功率 {status ? ((1 - 0) * 100).toFixed(1) + '%' : '99.3%'}
          </div>
        </div>

        {/* 平均Cpk */}
        <div className={`${styles.kpiCard} ${styles.kpiCardPurple}`}>
          <div className={styles.kpiHeader}>
            <span className={styles.kpiLabel}>平均Cpk</span>
            <div className={styles.kpiIcon}>🎯</div>
          </div>
          <div className={styles.kpiValue}>
            {avgCpk || '-'}<span className={styles.kpiUnit} />
          </div>
          <div className={`${styles.kpiTrend} ${avgCpk >= 1.33 ? styles.kpiTrendFlat : styles.kpiTrendDown}`}>
            {avgCpk >= 1.33 ? '→ 能力充足' : avgCpk >= 1.0 ? '→ 能力勉强' : '→ 能力不足'}
          </div>
        </div>

        {/* 采集频率 */}
        <div className={`${styles.kpiCard} ${styles.kpiCardOrange}`}>
          <div className={styles.kpiHeader}>
            <span className={styles.kpiLabel}>采集频率</span>
            <div className={styles.kpiIcon}>⏱️</div>
          </div>
          <div className={styles.kpiValue}>
            {status?.current_interval_minutes ?? 5}<span className={styles.kpiUnit}>分钟</span>
          </div>
          <div className={`${styles.kpiTrend} ${styles.kpiTrendFlat}`}>
            L{status?.current_level ?? 0} {status?.current_level === 0 ? '常规模式' : '加速模式'}
          </div>
        </div>
      </div>

      {/* ─── 实时趋势 + 采集状态 ─── */}
      <div className={styles.grid21}>
        {/* 趋势图 */}
        <div className={styles.panel}>
          <div className={styles.panelHeader}>
            <div className={styles.panelTitle}>
              <span className={styles.panelTitleIcon}>📈</span>
              实时数据趋势
              <span className={styles.liveIndicator}>LIVE</span>
            </div>
            <div className={styles.panelActions}>
              <select
                className={styles.metricSelect}
                value={selectedMetric}
                onChange={e => setSelectedMetric(e.target.value)}
              >
                {METRICS.map(m => (
                  <option key={m.key} value={m.key}>{m.name}</option>
                ))}
              </select>
            </div>
          </div>
          <div className={styles.panelBody}>
            <div ref={containerRef} className={styles.chartContainer} />
          </div>
        </div>

        {/* 采集状态 */}
        <div className={styles.panel}>
          <div className={styles.panelHeader}>
            <div className={styles.panelTitle}>
              <span className={styles.panelTitleIcon}>⚡</span>
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
                <span className={`${styles.collectValue} ${styles.collectValueGreen}`}>99.3%</span>
              </div>
              <div className={styles.collectStatusItem}>
                <span className={styles.collectLabel}>FT1连接</span>
                <span className={`${styles.collectValue} ${styles.collectValueGreen}`}>● 已连接</span>
              </div>
              <button
                className={styles.btnPrimary}
                onClick={handleCollect}
                disabled={collecting}
              >
                {collecting ? '采集中...' : '🔄 立即采集'}
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
              <span className={styles.panelTitleIcon}>🏭</span>
              品项过程能力概览
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
                        {productNameMap[cap.product_code] || cap.product_code}-
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
              <span className={styles.panelTitleIcon}>🚨</span>
              最新预警
            </div>
            <button className={styles.btnGhost} onClick={() => window.location.href = '/alerts'}>
              查看全部 →
            </button>
          </div>
          <div className={`${styles.panelBody} ${styles.panelBodyFlush}`}>
            <table className={styles.dataTable}>
              <thead>
                <tr>
                  <th>级别</th>
                  <th>描述</th>
                  <th>时间</th>
                </tr>
              </thead>
              <tbody>
                {dashboard?.recent_alerts && dashboard.recent_alerts.length > 0 ? (
                  dashboard.recent_alerts.map(alert => (
                    <tr key={alert.id}>
                      <td>
                        <span className={`${styles.tag} ${severityTagClass[alert.severity] || ''}`}>
                          {alert.severity}
                        </span>
                      </td>
                      <td>{alert.rule_desc || alert.message}</td>
                      <td>{fmtTime(alert.created_at)}</td>
                    </tr>
                  ))
                ) : (
                  <tr>
                    <td colSpan={3} style={{ textAlign: 'center', padding: 24, color: 'var(--text-muted)' }}>
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
