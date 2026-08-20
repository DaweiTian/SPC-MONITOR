import React, { useState, useEffect, useMemo } from 'react'
import { useChart } from '../../components/Charts/useChart'
import { tooltipStyle } from '../../components/Charts/theme'
import { api } from '../../services'
import type { Alert } from '../../types'
import type { EChartsOption } from 'echarts'
import styles from './Alerts.module.css'

/* ---------- 工具函数 ---------- */
function getLast7Days(): string[] {
  const days: string[] = []
  for (let i = 6; i >= 0; i--) {
    const d = new Date()
    d.setDate(d.getDate() - i)
    days.push(`${d.getMonth() + 1}/${d.getDate()}`)
  }
  return days
}

function dayKey(date: Date): string {
  return `${date.getMonth() + 1}/${date.getDate()}`
}

/* ---------- 图表子组件 ---------- */

function TrendChart({ alerts }: { alerts: Alert[] }) {
  const days = getLast7Days()

  const { critical, warning, info } = useMemo(() => {
    const c: number[] = Array(7).fill(0)
    const w: number[] = Array(7).fill(0)
    const i: number[] = Array(7).fill(0)
    alerts.forEach((a) => {
      const dk = dayKey(new Date(a.created_at))
      const idx = days.indexOf(dk)
      if (idx === -1) return
      if (a.severity === 'CRITICAL') c[idx]++
      else if (a.severity === 'WARNING') w[idx]++
      else i[idx]++
    })
    return { critical: c, warning: w, info: i }
  }, [alerts, days])

  const option: EChartsOption = useMemo(
    () => ({
      tooltip: {
        ...tooltipStyle,
        trigger: 'axis',
        axisPointer: { type: 'shadow' },
      },
      legend: {
        top: 0,
        right: 0,
        textStyle: { color: '#8b95a7', fontSize: 11 },
        itemWidth: 10,
        itemHeight: 10,
        itemGap: 16,
      },
      grid: { left: 40, right: 16, top: 36, bottom: 4 },
      xAxis: {
        type: 'category',
        data: days,
        axisLabel: { color: '#8b95a7', fontSize: 11 },
        axisLine: { lineStyle: { color: 'rgba(64,159,255,0.15)' } },
      },
      yAxis: {
        type: 'value',
        minInterval: 1,
        axisLabel: { color: '#8b95a7', fontSize: 11 },
        splitLine: { lineStyle: { color: 'rgba(64,159,255,0.06)' } },
        axisLine: { show: false },
      },
      series: [
        {
          name: '严重',
          type: 'bar',
          stack: 'total',
          data: critical,
          itemStyle: { color: '#ef4444', borderRadius: [0, 0, 0, 0] },
          barWidth: '40%',
        },
        {
          name: '警告',
          type: 'bar',
          stack: 'total',
          data: warning,
          itemStyle: { color: '#f59e0b' },
          barWidth: '40%',
        },
        {
          name: '提示',
          type: 'bar',
          stack: 'total',
          data: info,
          itemStyle: { color: '#3b82f6', borderRadius: [3, 3, 0, 0] },
          barWidth: '40%',
        },
      ],
    }),
    [days, critical, warning, info],
  )

  const { containerRef } = useChart(option)

  return (
    <div className={styles.chartCard}>
      <div className={styles.chartTitle}>预警趋势（近7天）</div>
      <div ref={containerRef} className={styles.chartContainer} />
    </div>
  )
}

function PieChart({ alerts }: { alerts: Alert[] }) {
  const distribution = useMemo(() => {
    const map: Record<string, number> = {}
    alerts.forEach((a) => {
      const key = a.rule_type || '其他'
      map[key] = (map[key] || 0) + 1
    })
    const colors = ['#00d4ff', '#8b5cf6', '#f59e0b', '#10b981', '#ef4444']
    return Object.entries(map).map(([name, value], idx) => ({
      name,
      value,
      itemStyle: { color: colors[idx % colors.length] },
    }))
  }, [alerts])

  const option: EChartsOption = useMemo(
    () => ({
      tooltip: {
        ...tooltipStyle,
        trigger: 'item',
        formatter: '{b}: {c} ({d}%)',
      },
      legend: {
        orient: 'vertical',
        right: 8,
        top: 'center',
        textStyle: { color: '#8b95a7', fontSize: 11 },
        itemWidth: 10,
        itemHeight: 10,
        itemGap: 12,
      },
      series: [
        {
          type: 'pie',
          radius: ['40%', '65%'],
          center: ['40%', '50%'],
          avoidLabelOverlap: false,
          label: { show: false },
          emphasis: {
            label: { show: true, color: '#e2e8f0', fontSize: 13, fontWeight: 600 },
            itemStyle: { shadowBlur: 20, shadowColor: 'rgba(0,0,0,0.4)' },
          },
          labelLine: { show: false },
          data: distribution,
        },
      ],
    }),
    [distribution],
  )

  const { containerRef } = useChart(option)

  return (
    <div className={styles.chartCard}>
      <div className={styles.chartTitle}>规则类型分布</div>
      <div ref={containerRef} className={styles.chartContainer} />
    </div>
  )
}

/* ---------- 主组件 ---------- */

export const AlertsPage: React.FC = () => {
  const [alerts, setAlerts] = useState<Alert[]>([])
  const [loading, setLoading] = useState(false)
  const [filter, setFilter] = useState({ severity: '', status: '' })
  const [confirmId, setConfirmId] = useState<string | null>(null)

  const fetchAlerts = async () => {
    setLoading(true)
    try {
      const data = await api.getAlerts({
        severity: filter.severity || undefined,
        status: filter.status || undefined,
      })
      setAlerts(data.alerts)
    } catch (e) {
      console.error('获取预警失败:', e)
    } finally {
      setLoading(false)
    }
  }

  useEffect(() => {
    fetchAlerts()
  }, [filter])

  /* ---- 统计 ---- */
  const stats = useMemo(
    () => ({
      CRITICAL: alerts.filter((a) => a.status === 'pending' && a.severity === 'CRITICAL').length,
      WARNING: alerts.filter((a) => a.status === 'pending' && a.severity === 'WARNING').length,
      INFO: alerts.filter((a) => a.status === 'pending' && a.severity === 'INFO').length,
    }),
    [alerts],
  )

  /* ---- 处理预警 ---- */
  const handleResolve = async (alertId: string) => {
    try {
      await api.resolveAlert(alertId, 'user')
      setConfirmId(null)
      fetchAlerts()
    } catch (e) {
      console.error('处理失败:', e)
    }
  }

  /* ---- 严重程度渲染 ---- */
  const renderSeverity = (severity: string) => {
    const cls =
      severity === 'CRITICAL'
        ? styles.badgeCritical
        : severity === 'WARNING'
          ? styles.badgeWarning
          : styles.badgeInfo
    return <span className={`${styles.badge} ${cls}`}>{severity}</span>
  }

  const renderStatus = (status: string) => {
    const cls = status === 'pending' ? styles.statusPending : styles.statusResolved
    return (
      <span className={`${styles.badge} ${cls}`}>
        {status === 'pending' ? '待处理' : '已处理'}
      </span>
    )
  }

  return (
    <div className={styles.page}>
      <div className={styles.pageTitle}>预警列表</div>

      {/* ---- 统计卡片 ---- */}
      <div className={styles.alertStats}>
        <div className={styles.statCard}>
          <div className={`${styles.statIcon} ${styles.statIconCritical}`}>
            {/* ExclamationCircle icon */}
            <svg width="22" height="22" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round">
              <circle cx="12" cy="12" r="10" />
              <line x1="12" y1="8" x2="12" y2="12" />
              <line x1="12" y1="16" x2="12.01" y2="16" />
            </svg>
          </div>
          <div className={styles.statBody}>
            <span className={styles.statLabel}>CRITICAL</span>
            <span className={styles.statValue}>{stats.CRITICAL}</span>
          </div>
        </div>
        <div className={styles.statCard}>
          <div className={`${styles.statIcon} ${styles.statIconWarning}`}>
            <svg width="22" height="22" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round">
              <path d="M10.29 3.86L1.82 18a2 2 0 001.71 3h16.94a2 2 0 001.71-3L13.71 3.86a2 2 0 00-3.42 0z" />
              <line x1="12" y1="9" x2="12" y2="13" />
              <line x1="12" y1="17" x2="12.01" y2="17" />
            </svg>
          </div>
          <div className={styles.statBody}>
            <span className={styles.statLabel}>WARNING</span>
            <span className={styles.statValue}>{stats.WARNING}</span>
          </div>
        </div>
        <div className={styles.statCard}>
          <div className={`${styles.statIcon} ${styles.statIconInfo}`}>
            <svg width="22" height="22" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round">
              <circle cx="12" cy="12" r="10" />
              <line x1="12" y1="16" x2="12" y2="12" />
              <line x1="12" y1="8" x2="12.01" y2="8" />
            </svg>
          </div>
          <div className={styles.statBody}>
            <span className={styles.statLabel}>INFO</span>
            <span className={styles.statValue}>{stats.INFO}</span>
          </div>
        </div>
      </div>

      {/* ---- 图表 ---- */}
      <div className={styles.chartsRow}>
        <TrendChart alerts={alerts} />
        <PieChart alerts={alerts} />
      </div>

      {/* ---- 筛选栏 ---- */}
      <div className={styles.filterBar}>
        <select
          className={styles.filterSelect}
          value={filter.severity}
          onChange={(e) => setFilter({ ...filter, severity: e.target.value })}
        >
          <option value="">全部严重程度</option>
          <option value="CRITICAL">CRITICAL</option>
          <option value="WARNING">WARNING</option>
          <option value="INFO">INFO</option>
        </select>
        <select
          className={styles.filterSelect}
          value={filter.status}
          onChange={(e) => setFilter({ ...filter, status: e.target.value })}
        >
          <option value="">全部状态</option>
          <option value="pending">待处理</option>
          <option value="resolved">已处理</option>
        </select>
        <button
          className={styles.filterResetBtn}
          onClick={() => setFilter({ severity: '', status: '' })}
        >
          重置
        </button>
      </div>

      {/* ---- 表格 ---- */}
      <div className={styles.tableCard}>
        <div className={styles.tableHeader}>
          <span className={styles.tableTitle}>预警记录</span>
          <span className={styles.tableCount}>共 {alerts.length} 条</span>
        </div>
        {loading ? (
          <div className={styles.loadingOverlay}>
            <div className={styles.spinner} />
            加载中...
          </div>
        ) : alerts.length === 0 ? (
          <div className={styles.emptyState}>暂无预警记录</div>
        ) : (
          <div className={styles.tableWrapper}>
            <table className={styles.table}>
              <thead>
                <tr>
                  <th>预警编号</th>
                  <th>严重程度</th>
                  <th>规则类型</th>
                  <th>描述</th>
                  <th>检测值</th>
                  <th>时间</th>
                  <th>状态</th>
                  <th>操作</th>
                </tr>
              </thead>
              <tbody>
                {alerts.map((alert) => (
                  <tr key={alert.id}>
                    <td>
                      <code className={styles.codeId}>{alert.alert_id}</code>
                    </td>
                    <td>{renderSeverity(alert.severity)}</td>
                    <td>{alert.rule_type || '-'}</td>
                    <td>{alert.rule_desc || alert.message || '-'}</td>
                    <td>{alert.test_value != null ? alert.test_value.toFixed(4) : '-'}</td>
                    <td>{new Date(alert.created_at).toLocaleString('zh-CN')}</td>
                    <td>{renderStatus(alert.status)}</td>
                    <td>
                      {alert.status === 'pending' && (
                        <button
                          className={styles.actionBtn}
                          onClick={() => setConfirmId(alert.alert_id)}
                        >
                          处理
                        </button>
                      )}
                    </td>
                  </tr>
                ))}
              </tbody>
            </table>
          </div>
        )}
      </div>

      {/* ---- 确认弹窗 ---- */}
      {confirmId && (
        <div className={styles.modalOverlay} onClick={() => setConfirmId(null)}>
          <div className={styles.modalBox} onClick={(e) => e.stopPropagation()}>
            <div className={styles.modalTitle}>确认处理</div>
            <div className={styles.modalBody}>确认处理此预警？处理后状态将变更为已处理。</div>
            <div className={styles.modalActions}>
              <button className={styles.modalCancel} onClick={() => setConfirmId(null)}>
                取消
              </button>
              <button className={styles.modalConfirm} onClick={() => handleResolve(confirmId)}>
                确认
              </button>
            </div>
          </div>
        </div>
      )}
    </div>
  )
}
