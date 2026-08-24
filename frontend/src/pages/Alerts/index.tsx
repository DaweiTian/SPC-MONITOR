import React, { useState, useEffect, useMemo, useCallback } from 'react'
import { useNavigate } from 'react-router-dom'
import { useChart } from '../../components/Charts/useChart'
import { tooltipStyle } from '../../components/Charts/theme'
import { api } from '../../services'
import { escapeHtml } from '../../utils/html'
import { useAppMetadata } from '../../hooks'
import { RULE_TYPE_CN } from '../../constants/alertRules'
import type { Alert, EChartsParam } from '../../types'
import type { EChartsOption, DefaultLabelFormatterCallbackParams } from 'echarts'
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

const SEVERITY_CN: Record<string, string> = { CRITICAL: '严重警告', WARNING: '警告', INFO: '提示' }

interface AlertRule {
  id: number
  rule: string
  description: string
  severity: string
  enabled: boolean
  rule_type: string
}

/* ---------- SVG Icons ---------- */
const IconAlertCircle = () => (
  <svg width="22" height="22" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round">
    <circle cx="12" cy="12" r="10" /><line x1="12" y1="8" x2="12" y2="12" /><line x1="12" y1="16" x2="12.01" y2="16" />
  </svg>
)
const IconTriangle = () => (
  <svg width="22" height="22" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round">
    <path d="M10.29 3.86L1.82 18a2 2 0 001.71 3h16.94a2 2 0 001.71-3L13.71 3.86a2 2 0 00-3.42 0z" />
    <line x1="12" y1="9" x2="12" y2="13" /><line x1="12" y1="17" x2="12.01" y2="17" />
  </svg>
)
const IconInfo = () => (
  <svg width="22" height="22" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round">
    <circle cx="12" cy="12" r="10" /><line x1="12" y1="16" x2="12" y2="12" /><line x1="12" y1="8" x2="12.01" y2="8" />
  </svg>
)
const IconTrendUp = () => (
  <svg width="16" height="16" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round">
    <polyline points="23 6 13.5 15.5 8.5 10.5 1 18" /><polyline points="17 6 23 6 23 12" />
  </svg>
)
const IconPieChart = () => (
  <svg width="16" height="16" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round">
    <path d="M21.21 15.89A10 10 0 1 1 8 2.83" /><path d="M22 12A10 10 0 0 0 12 2v10z" />
  </svg>
)
const IconLink = () => (
  <svg width="12" height="12" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round">
    <path d="M18 13v6a2 2 0 0 1-2 2H5a2 2 0 0 1-2-2V8a2 2 0 0 1 2-2h6" /><polyline points="15 3 21 3 21 9" /><line x1="10" y1="14" x2="21" y2="3" />
  </svg>
)

/* ---------- 图表子组件 ---------- */

const TrendChart = React.memo(function TrendChart({ alerts }: { alerts: Alert[] }) {
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
      tooltip: { ...tooltipStyle, trigger: 'axis', axisPointer: { type: 'shadow' } },
      legend: { top: 0, right: 0, textStyle: { color: '#8b95a7', fontSize: 11 }, itemWidth: 10, itemHeight: 10, itemGap: 16 },
      grid: { left: 40, right: 16, top: 31, bottom: 24 },
      xAxis: { type: 'category', data: days, axisLabel: { color: '#8b95a7', fontSize: 11 }, axisLine: { lineStyle: { color: 'rgba(64,159,255,0.15)' } } },
      yAxis: { type: 'value', minInterval: 1, axisLabel: { color: '#8b95a7', fontSize: 11 }, splitLine: { lineStyle: { color: 'rgba(64,159,255,0.06)' } }, axisLine: { show: false } },
      series: [
        { name: '严重', type: 'bar', stack: 'total', data: critical, itemStyle: { color: '#ef4444' }, barWidth: '40%' },
        { name: '警告', type: 'bar', stack: 'total', data: warning, itemStyle: { color: '#f59e0b' }, barWidth: '40%' },
        { name: '提示', type: 'bar', stack: 'total', data: info, itemStyle: { color: '#3b82f6', borderRadius: [3, 3, 0, 0] }, barWidth: '40%' },
      ],
    }),
    [days, critical, warning, info],
  )

  const { containerRef } = useChart(option)

  return (
    <div className={styles.chartCard}>
      <div className={styles.chartTitle}>
        <span className={styles.chartTitleIcon}><IconTrendUp /></span>
        预警趋势（近7天）
      </div>
      <div ref={containerRef} className={styles.chartContainer} />
    </div>
  )
})

const PieChart = React.memo(function PieChart({ alerts, ruleMap }: { alerts: Alert[]; ruleMap: Record<string, AlertRule> }) {
  const distribution = useMemo(() => {
    const map: Record<string, number> = {}
    alerts.forEach((a) => {
      const key = a.rule_type || '其他'
      map[key] = (map[key] || 0) + 1
    })
    const colors = ['#00d4ff', '#8b5cf6', '#f59e0b', '#10b981', '#ef4444']
    return Object.entries(map).map(([name, value], idx) => ({
      name: ruleMap[name]?.rule || RULE_TYPE_CN[name] || name,
      value,
      itemStyle: { color: colors[idx % colors.length] },
      description: ruleMap[name]?.description || '',
    }))
  }, [alerts, ruleMap])

  const option: EChartsOption = useMemo(
    () => ({
      tooltip: {
        ...tooltipStyle,
        trigger: 'item',
        formatter: (params: DefaultLabelFormatterCallbackParams | DefaultLabelFormatterCallbackParams[]) => {
          const p = (Array.isArray(params) ? params[0] : params) as unknown as EChartsParam
          const desc = p.data?.description as string | undefined
          return desc
            ? `<strong>${escapeHtml(p.name)}</strong><br/>${escapeHtml(String(p.value))} 条 (${escapeHtml(String(p.percent))}%)<br/><span style="color:#94a3b8;font-size:12px">${escapeHtml(desc)}</span>`
            : `<strong>${escapeHtml(p.name)}</strong><br/>${escapeHtml(String(p.value))} 条 (${escapeHtml(String(p.percent))}%)`
        },
      },
      legend: { orient: 'vertical', right: 8, top: 'center', textStyle: { color: '#8b95a7', fontSize: 11 }, itemWidth: 10, itemHeight: 10, itemGap: 12 },
      series: [{
        type: 'pie', radius: ['48%', '78%'], center: ['38%', '50%'],
        avoidLabelOverlap: false, label: { show: false },
        emphasis: { label: { show: true, color: '#e2e8f0', fontSize: 13, fontWeight: 600 }, itemStyle: { shadowBlur: 20, shadowColor: 'rgba(0,0,0,0.4)' } },
        labelLine: { show: false }, data: distribution,
      }],
    }),
    [distribution],
  )

  const { containerRef } = useChart(option)

  return (
    <div className={styles.chartCard}>
      <div className={styles.chartTitle}>
        <span className={styles.chartTitleIcon}><IconPieChart /></span>
        规则类型分布
      </div>
      <div ref={containerRef} className={styles.chartContainer} />
    </div>
  )
})

/* ---------- 主组件 ---------- */

export const AlertsPage: React.FC = () => {
  const navigate = useNavigate()
  const { aliases } = useAppMetadata()
  const [alerts, setAlerts] = useState<Alert[]>([])
  const [overviewAlerts, setOverviewAlerts] = useState<Alert[]>([])
  const [total, setTotal] = useState(0)
  const [page, setPage] = useState(1)
  const [pageSize] = useState(20)
  const [loading, setLoading] = useState(false)
  const [filter, setFilter] = useState({ severity: '', status: 'pending', product: '', search: '' })
  const [searchInput, setSearchInput] = useState('')
  const [debouncedSearch, setDebouncedSearch] = useState('')
  const [confirmId, setConfirmId] = useState<string | null>(null)
  const [resolveNote, setResolveNote] = useState('')
  const [resolveAction, setResolveAction] = useState<'confirm' | 'void_data'>('confirm')
  const [selected, setSelected] = useState<Set<string>>(new Set())
  const [batchConfirm, setBatchConfirm] = useState(false)
  const [batchNote, setBatchNote] = useState('')
  const [batchAction, setBatchAction] = useState<'confirm' | 'void_data'>('confirm')
  const [alertProducts, setAlertProducts] = useState<string[]>([])
  const [alertRules, setAlertRules] = useState<AlertRule[]>([])

  // Load alert product list and alert rules
  useEffect(() => {
    Promise.all([
      api.getAlertProducts(),
      api.getAlertRules().catch(() => ({ rules: [] })),
    ]).then(([prodData, rulesData]) => {
      setAlertRules(rulesData.rules || [])
      setAlertProducts(prodData.products || [])
    }).catch(console.error)
  }, [])

  // 总览数据：不受筛选条件影响，用于统计卡片和图表
  const fetchOverview = useCallback(async () => {
    try {
      const data = await api.getAlerts({ page: 1, page_size: 500 })
      setOverviewAlerts(data?.alerts || [])
    } catch (e) {
      console.error('获取总览数据失败:', e)
    }
  }, [])

  useEffect(() => { fetchOverview() }, [fetchOverview])

  // 搜索防抖：输入停止300ms后才触发请求
  useEffect(() => {
    const timer = setTimeout(() => setDebouncedSearch(searchInput), 300)
    return () => clearTimeout(timer)
  }, [searchInput])

  // 列表数据：受筛选条件影响，仅用于下方表格
  const fetchAlerts = useCallback(async () => {
    setLoading(true)
    try {
      const data = await api.getAlerts({
        severity: filter.severity || undefined,
        status: filter.status || undefined,
        product_code: filter.product || undefined,
        search: debouncedSearch || undefined,
        page,
        page_size: pageSize,
      })
      setAlerts(data?.alerts || [])
      setTotal(data?.total || 0)
    } catch (e) {
      console.error('获取预警失败:', e)
    } finally {
      setLoading(false)
    }
  }, [filter.severity, filter.status, filter.product, debouncedSearch, page, pageSize])

  useEffect(() => { fetchAlerts() }, [fetchAlerts])

  // Reset to page 1 when filter changes (debouncedSearch uses its own effect)
  useEffect(() => { setPage(1) }, [filter.severity, filter.status, filter.product, debouncedSearch])

  /* ---- 统计（基于总览数据，不受筛选影响） ---- */
  const stats = useMemo(
    () => ({
      CRITICAL: overviewAlerts.filter((a) => a.status === 'pending' && a.severity === 'CRITICAL').length,
      WARNING: overviewAlerts.filter((a) => a.status === 'pending' && a.severity === 'WARNING').length,
      INFO: overviewAlerts.filter((a) => a.status === 'pending' && a.severity === 'INFO').length,
    }),
    [overviewAlerts],
  )

  const totalPages = Math.ceil(total / pageSize)

  /* ---- 处理单条预警 ---- */
  const handleResolve = async (alertId: string) => {
    try {
      await api.resolveAlert(alertId, 'user', resolveNote, resolveAction)
      setConfirmId(null)
      setResolveNote('')
      fetchAlerts()
      fetchOverview()
      window.dispatchEvent(new Event('alerts-updated'))
    } catch (e) {
      console.error('处理失败:', e)
    }
  }

  /* ---- 批量处理 ---- */
  const handleBatchResolve = async () => {
    try {
      await api.batchResolveAlerts(Array.from(selected), 'user', batchNote, batchAction)
      setBatchConfirm(false)
      setBatchNote('')
      setSelected(new Set())
      fetchAlerts()
      fetchOverview()
      window.dispatchEvent(new Event('alerts-updated'))
    } catch (e) {
      console.error('批量处理失败:', e)
    }
  }

  /* ---- 全选/反选 ---- */
  const pendingAlerts = alerts.filter(a => a.status === 'pending')
  const allSelected = pendingAlerts.length > 0 && pendingAlerts.every(a => selected.has(a.alert_id))
  const toggleAll = () => {
    if (allSelected) setSelected(new Set())
    else setSelected(new Set(pendingAlerts.map(a => a.alert_id)))
  }
  const toggleOne = (id: string) => {
    const next = new Set(selected)
    if (next.has(id)) next.delete(id)
    else next.add(id)
    setSelected(next)
  }

  /* ---- 别名辅助 ---- */
  const getProductName = (code: string) => aliases.products[code] || code || '-'
  const getIndicatorName = (code: string) => aliases.indicators[code] || code || '-'

  /* ---- 规则映射 ---- */
  const ruleMap = useMemo(() => {
    const map: Record<string, AlertRule> = {}
    alertRules.forEach(r => { map[r.rule_type] = r })
    return map
  }, [alertRules])

  /* ---- 渲染 ---- */
  const renderSeverity = (severity: string) => {
    const cls = severity === 'CRITICAL' ? styles.badgeCritical : severity === 'WARNING' ? styles.badgeWarning : styles.badgeInfo
    return <span className={`${styles.badge} ${cls}`}>{SEVERITY_CN[severity] || severity}</span>
  }

  const renderRuleType = (ruleType: string) => {
    const rule = ruleMap[ruleType]
    const label = rule?.rule || RULE_TYPE_CN[ruleType] || ruleType || '-'
    const desc = rule?.description || ''
    const severity = rule?.severity || ''
    const cls = severity === 'CRITICAL' || ruleType?.startsWith('nelson_')
      ? styles.ruleCritical
      : severity === 'WARNING'
        ? styles.ruleWarning
        : styles.ruleInfo
    return <span className={`${styles.ruleBadge} ${cls}`} title={desc || undefined}>{label}</span>
  }

  const renderStatus = (alert: Alert) => {
    const isPending = alert.status === 'pending'
    const cls = isPending ? styles.statusPending : styles.statusResolved
    const badge = <span className={`${styles.badge} ${cls}`}>{isPending ? '待处理' : '已处理'}</span>
    if (!isPending && alert.resolve_note) {
      return <span className={styles.statusWithTip} title={alert.resolve_note}>{badge}</span>
    }
    return badge
  }

  return (
    <div className={styles.page}>
      {/* ---- 统计卡片 ---- */}
      <div className={styles.alertStats}>
        <div className={styles.statCard}>
          <div className={`${styles.statIcon} ${styles.statIconCritical}`}><IconAlertCircle /></div>
          <div className={styles.statBody}>
            <span className={styles.statLabel}>严重警告</span>
            <span className={styles.statValue}>{stats.CRITICAL}</span>
          </div>
        </div>
        <div className={styles.statCard}>
          <div className={`${styles.statIcon} ${styles.statIconWarning}`}><IconTriangle /></div>
          <div className={styles.statBody}>
            <span className={styles.statLabel}>警告</span>
            <span className={styles.statValue}>{stats.WARNING}</span>
          </div>
        </div>
        <div className={styles.statCard}>
          <div className={`${styles.statIcon} ${styles.statIconInfo}`}><IconInfo /></div>
          <div className={styles.statBody}>
            <span className={styles.statLabel}>提示</span>
            <span className={styles.statValue}>{stats.INFO}</span>
          </div>
        </div>
      </div>

      {/* ---- 图表 ---- */}
      <div className={styles.chartsRow}>
        <TrendChart alerts={overviewAlerts} />
        <PieChart alerts={overviewAlerts} ruleMap={ruleMap} />
      </div>

      {/* ---- 筛选栏 ---- */}
      <div className={styles.filterBar}>
        <select className={styles.filterSelect} value={filter.severity} onChange={(e) => setFilter({ ...filter, severity: e.target.value })} aria-label="筛选严重程度">
          <option value="">全部严重程度</option>
          <option value="CRITICAL">严重警告</option>
          <option value="WARNING">警告</option>
          <option value="INFO">提示</option>
        </select>
        <select className={styles.filterSelect} value={filter.status} onChange={(e) => setFilter({ ...filter, status: e.target.value })} aria-label="筛选状态">
          <option value="">全部状态</option>
          <option value="pending">待处理</option>
          <option value="resolved">已处理</option>
        </select>
        <select className={styles.filterSelect} value={filter.product} onChange={(e) => setFilter({ ...filter, product: e.target.value })} aria-label="筛选品项">
          <option value="">全部品项</option>
          {alertProducts.map(p => <option key={p} value={p}>{getProductName(p)}</option>)}
        </select>
        <input
          className={styles.filterInput}
          type="text"
          placeholder="搜索品项/指标/描述..."
          value={searchInput}
          onChange={(e) => setSearchInput(e.target.value)}
          aria-label="搜索预警"
        />
        <button className={styles.filterResetBtn} onClick={() => { setFilter({ severity: '', status: 'pending', product: '', search: '' }); setSearchInput('') }}>重置</button>
        {selected.size > 0 && (
          <button className={styles.batchBtn} onClick={() => { setBatchConfirm(true); setBatchAction('confirm') }}>批量处理 ({selected.size})</button>
        )}
      </div>

      {/* ---- 表格 ---- */}
      <div className={styles.tableCard}>
        <div className={styles.tableHeader}>
          <span className={styles.tableTitle}>预警记录</span>
          <span className={styles.tableCount} aria-live="polite">共 {total} 条</span>
        </div>
        {loading ? (
          <div className={styles.loadingOverlay}><div className={styles.spinner} />加载中...</div>
        ) : alerts.length === 0 ? (
          <div className={styles.emptyState}>暂无预警记录</div>
        ) : (
          <div className={styles.tableWrapper}>
            <table className={styles.table} aria-label="预警记录表">
              <thead>
                <tr>
                  <th style={{ width: 36 }}><input type="checkbox" checked={allSelected} onChange={toggleAll} /></th>
                  <th>品项</th>
                  <th>指标</th>
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
                      {alert.status === 'pending' && (
                        <input type="checkbox" checked={selected.has(alert.alert_id)} onChange={() => toggleOne(alert.alert_id)} />
                      )}
                    </td>
                    <td>{getProductName(alert.product_code || '')}</td>
                    <td>{getIndicatorName(alert.indicator_code || '')}</td>
                    <td>{renderSeverity(alert.severity)}</td>
                    <td>{renderRuleType(alert.rule_type || '')}</td>
                    <td>{alert.rule_desc || alert.message || '-'}</td>
                    <td>
                      <span className={styles.testValue}>{alert.test_value != null ? alert.test_value.toFixed(4) : '-'}</span>
                      {(alert.indicator_code || alert.product_code) && (
                        <button className={styles.spcLink} title="跳转SPC控制图" onClick={() => navigate(`/spc?product=${alert.product_code}&indicator=${alert.indicator_code}`)}>
                          <IconLink />
                        </button>
                      )}
                    </td>
                    <td className={styles.timeCell}>{new Date(alert.created_at).toLocaleString('zh-CN')}</td>
                    <td>{renderStatus(alert)}</td>
                    <td>
                      {alert.status === 'pending' && (
                        <button className={styles.actionBtn} onClick={() => { setConfirmId(alert.alert_id); setResolveNote(''); setResolveAction('confirm') }}>处理</button>
                      )}
                    </td>
                  </tr>
                ))}
              </tbody>
            </table>
          </div>
        )}
        {/* ---- 分页 ---- */}
        {totalPages > 1 && (
          <div className={styles.pagination}>
            <button className={styles.pageBtn} disabled={page <= 1} onClick={() => setPage(p => p - 1)}>上一页</button>
            <span className={styles.pageInfo}>第 {page} / {totalPages} 页</span>
            <button className={styles.pageBtn} disabled={page >= totalPages} onClick={() => setPage(p => p + 1)}>下一页</button>
          </div>
        )}
      </div>

      {/* ---- 单条处理弹窗 ---- */}
      {confirmId && (
        <div className={styles.modalOverlay} onClick={() => setConfirmId(null)}>
          <div className={styles.modalBox} onClick={(e) => e.stopPropagation()} role="dialog" aria-modal="true" aria-label="处理预警">
            <div className={styles.modalTitle}>处理预警</div>
            <div className={styles.modalBody}>
              <p>请选择处理方式：</p>
              <select className={styles.actionSelect} value={resolveAction} onChange={e => setResolveAction(e.target.value as 'confirm' | 'void_data')} aria-label="处理方式">
                <option value="confirm">确认处理（仅关闭预警）</option>
                <option value="void_data">作废数据（同时作废关联数据记录）</option>
              </select>
              <textarea className={styles.noteInput} placeholder="处理备注（可选）" value={resolveNote} onChange={(e) => setResolveNote(e.target.value)} rows={3} aria-label="处理备注" />
            </div>
            <div className={styles.modalActions}>
              <button className={styles.modalCancel} onClick={() => setConfirmId(null)}>取消</button>
              <button className={styles.modalConfirm} onClick={() => handleResolve(confirmId)}>确认处理</button>
            </div>
          </div>
        </div>
      )}

      {/* ---- 批量处理弹窗 ---- */}
      {batchConfirm && (
        <div className={styles.modalOverlay} onClick={() => setBatchConfirm(false)}>
          <div className={styles.modalBox} onClick={(e) => e.stopPropagation()} role="dialog" aria-modal="true" aria-label="批量处理预警">
            <div className={styles.modalTitle}>批量处理预警</div>
            <div className={styles.modalBody}>
              <p>确认批量处理选中的 {selected.size} 条预警？</p>
              <select className={styles.actionSelect} value={batchAction} onChange={e => setBatchAction(e.target.value as 'confirm' | 'void_data')} aria-label="处理方式">
                <option value="confirm">确认处理（仅关闭预警）</option>
                <option value="void_data">作废数据（同时作废关联数据记录）</option>
              </select>
              <textarea className={styles.noteInput} placeholder="处理备注（可选）" value={batchNote} onChange={(e) => setBatchNote(e.target.value)} rows={3} aria-label="批量处理备注" />
            </div>
            <div className={styles.modalActions}>
              <button className={styles.modalCancel} onClick={() => setBatchConfirm(false)}>取消</button>
              <button className={styles.modalConfirm} onClick={handleBatchResolve}>确认处理</button>
            </div>
          </div>
        </div>
      )}
    </div>
  )
}

export default AlertsPage
