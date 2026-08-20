import React, { useState, useEffect, useCallback } from 'react'
import { api } from '../../services'
import styles from './Config.module.css'

/* ── Mock data for initial display ───────────────────────────── */

interface ProductItem {
  id: string
  name: string
  code: string
  indicatorCount: number
  status: 'enabled' | 'disabled'
}

interface SpecLimit {
  id: string
  product: string
  indicator: string
  usl: number
  lsl: number
  target: number
  unit: string
}

interface FrequencyRow {
  level: string
  frequency: string
  trigger: string
  status: 'current' | 'standby'
}

interface NelsonRule {
  id: number
  rule: string
  description: string
  severity: 'CRITICAL' | 'WARNING' | 'INFO'
  enabled: boolean
}

const INITIAL_PRODUCTS: ProductItem[] = [
  { id: '1', name: 'FT1-标准型', code: 'FT1-STD', indicatorCount: 8, status: 'enabled' },
  { id: '2', name: 'FT1-高精度型', code: 'FT1-HP', indicatorCount: 6, status: 'enabled' },
  { id: '3', name: 'FT1-经济型', code: 'FT1-ECO', indicatorCount: 5, status: 'disabled' },
]

const INITIAL_SPECS: SpecLimit[] = [
  { id: '1', product: 'FT1-STD', indicator: '直径(mm)', usl: 10.05, lsl: 9.95, target: 10.00, unit: 'mm' },
  { id: '2', product: 'FT1-STD', indicator: '圆度(μm)', usl: 2.0, lsl: 0, target: 0.5, unit: 'μm' },
  { id: '3', product: 'FT1-HP', indicator: '表面粗糙度', usl: 0.8, lsl: 0, target: 0.3, unit: 'Ra' },
  { id: '4', product: 'FT1-HP', indicator: '硬度(HRC)', usl: 62, lsl: 58, target: 60, unit: 'HRC' },
]

const FREQUENCY_ROWS: FrequencyRow[] = [
  { level: 'L0', frequency: '1 分钟', trigger: '产线运行时持续', status: 'current' },
  { level: 'L1', frequency: '5 分钟', trigger: '常规监控', status: 'standby' },
  { level: 'L2', frequency: '30 分钟', trigger: '待机/低负荷', status: 'standby' },
]

const INITIAL_NELSON: NelsonRule[] = [
  { id: 1, rule: '规则1', description: '1个点超出3σ控制限', severity: 'CRITICAL', enabled: true },
  { id: 2, rule: '规则2', description: '连续9个点在中心线同一侧', severity: 'CRITICAL', enabled: true },
  { id: 3, rule: '规则3', description: '连续6个点递增或递减', severity: 'WARNING', enabled: true },
  { id: 4, rule: '规则4', description: '连续14个点交替升降', severity: 'WARNING', enabled: true },
  { id: 5, rule: '规则5', description: '连续3个点中有2个超出2σ', severity: 'CRITICAL', enabled: true },
  { id: 6, rule: '规则6', description: '连续5个点中有4个超出1σ', severity: 'WARNING', enabled: false },
  { id: 7, rule: '规则7', description: '连续15个点在1σ以内（层叠）', severity: 'INFO', enabled: false },
  { id: 8, rule: '规则8', description: '连续8个点在1σ以外（混合）', severity: 'INFO', enabled: false },
]

/* ── Tag helper ──────────────────────────────────────────────── */

const StatusTag: React.FC<{ label: string; color: 'green' | 'blue' | 'orange' | 'red' }> = ({ label, color }) => (
  <span className={`${styles.tag} ${styles[`tag${color.charAt(0).toUpperCase() + color.slice(1)}`]}`}>
    <span className={`${styles.tagDot} ${styles[`tagDot${color.charAt(0).toUpperCase() + color.slice(1)}`]}`} />
    {label}
  </span>
)

/* ── Component ───────────────────────────────────────────────── */

export const ConfigPage: React.FC = () => {
  const [products] = useState<ProductItem[]>(INITIAL_PRODUCTS)
  const [specs] = useState<SpecLimit[]>(INITIAL_SPECS)
  const [nelsonRules, setNelsonRules] = useState<NelsonRule[]>(INITIAL_NELSON)
  const [dataSource, setDataSource] = useState<'mock' | 'sqlserver'>('mock')
  const [sourceLoading, setSourceLoading] = useState(false)
  const [lastSwitch, setLastSwitch] = useState<string>('')

  /* Fetch current data source on mount */
  useEffect(() => {
    api.getDataSourceStatus()
      .then((data: any) => {
        if (data?.source) setDataSource(data.source)
        if (data?.last_switch) setLastSwitch(data.last_switch)
      })
      .catch(() => { /* default to mock */ })
  }, [])

  const handleSwitchSource = useCallback(async (source: 'mock' | 'sqlserver') => {
    setSourceLoading(true)
    try {
      const result = await api.switchDataSource(source)
      setDataSource(source)
      if (result?.last_switch) setLastSwitch(result.last_switch)
    } catch {
      // Silently fail — source stays unchanged
    } finally {
      setSourceLoading(false)
    }
  }, [])

  const toggleNelsonRule = (id: number) => {
    setNelsonRules(prev =>
      prev.map(r => r.id === id ? { ...r, enabled: !r.enabled } : r)
    )
  }

  const severityTag = (severity: string) => {
    if (severity === 'CRITICAL') return <StatusTag label="严重" color="red" />
    if (severity === 'WARNING') return <StatusTag label="警告" color="orange" />
    return <StatusTag label="信息" color="blue" />
  }

  return (
    <div className={styles.page}>
      {/* Page title */}
      <h1 className={styles.pageTitle}>
        <span className={styles.pageTitleIcon}>⚙</span>
        系统配置
      </h1>

      {/* ── Grid 1: 品项管理 + 规格限配置 ───────────────────── */}
      <div className={styles.grid}>
        {/* 品项管理 */}
        <div className={styles.card}>
          <div className={styles.cardHeader}>
            <span className={styles.cardTitle}>
              <span className={styles.cardTitleDot} />
              品项管理
            </span>
            <button className={`${styles.btn} ${styles.btnPrimary} ${styles.btnSmall}`}>
              + 新增品项
            </button>
          </div>
          <div className={styles.cardBody}>
            <table className={styles.table}>
              <thead>
                <tr>
                  <th>品项名称</th>
                  <th>编码</th>
                  <th>监测指标数</th>
                  <th>状态</th>
                  <th>操作</th>
                </tr>
              </thead>
              <tbody>
                {products.map(p => (
                  <tr key={p.id}>
                    <td className={styles.tableCellPrimary}>{p.name}</td>
                    <td className={styles.tableCellMono}>{p.code}</td>
                    <td>{p.indicatorCount}</td>
                    <td>
                      {p.status === 'enabled'
                        ? <StatusTag label="启用" color="green" />
                        : <StatusTag label="停用" color="orange" />}
                    </td>
                    <td>
                      <button className={styles.btnEdit}>编辑</button>
                    </td>
                  </tr>
                ))}
              </tbody>
            </table>
          </div>
        </div>

        {/* 规格限配置 */}
        <div className={styles.card}>
          <div className={styles.cardHeader}>
            <span className={styles.cardTitle}>
              <span className={styles.cardTitleDot} />
              规格限配置
            </span>
            <button className={`${styles.btn} ${styles.btnPrimary} ${styles.btnSmall}`}>
              + 新增配置
            </button>
          </div>
          <div className={styles.cardBody}>
            <table className={styles.table}>
              <thead>
                <tr>
                  <th>品项</th>
                  <th>指标</th>
                  <th>USL</th>
                  <th>LSL</th>
                  <th>目标值</th>
                  <th>单位</th>
                  <th>操作</th>
                </tr>
              </thead>
              <tbody>
                {specs.map(s => (
                  <tr key={s.id}>
                    <td className={styles.tableCellPrimary}>{s.product}</td>
                    <td>{s.indicator}</td>
                    <td className={styles.tableCellMono}>{s.usl}</td>
                    <td className={styles.tableCellMono}>{s.lsl}</td>
                    <td className={styles.tableCellMono}>{s.target}</td>
                    <td>{s.unit}</td>
                    <td>
                      <button className={styles.btnEdit}>编辑</button>
                    </td>
                  </tr>
                ))}
              </tbody>
            </table>
          </div>
        </div>
      </div>

      {/* ── Grid 2: 采集频率 + 预警规则 ─────────────────────── */}
      <div className={styles.grid}>
        {/* 采集频率配置 */}
        <div className={styles.card}>
          <div className={styles.cardHeader}>
            <span className={styles.cardTitle}>
              <span className={styles.cardTitleDot} />
              采集频率配置
            </span>
          </div>
          <div className={styles.cardBody}>
            <table className={styles.table}>
              <thead>
                <tr>
                  <th>级别</th>
                  <th>频率</th>
                  <th>触发条件</th>
                  <th>状态</th>
                </tr>
              </thead>
              <tbody>
                {FREQUENCY_ROWS.map(f => (
                  <tr key={f.level}>
                    <td className={styles.tableCellPrimary}>{f.level}</td>
                    <td className={styles.tableCellMono}>{f.frequency}</td>
                    <td>{f.trigger}</td>
                    <td>
                      {f.status === 'current'
                        ? <StatusTag label="当前" color="green" />
                        : <StatusTag label="待命" color="blue" />}
                    </td>
                  </tr>
                ))}
              </tbody>
            </table>
          </div>
        </div>

        {/* 预警规则配置 */}
        <div className={styles.card}>
          <div className={styles.cardHeader}>
            <span className={styles.cardTitle}>
              <span className={styles.cardTitleDot} />
              预警规则配置
            </span>
          </div>
          <div className={styles.cardBody}>
            <table className={styles.table}>
              <thead>
                <tr>
                  <th>规则</th>
                  <th>描述</th>
                  <th>级别</th>
                  <th>状态</th>
                </tr>
              </thead>
              <tbody>
                {nelsonRules.map(rule => (
                  <tr key={rule.id}>
                    <td className={styles.tableCellPrimary}>{rule.rule}</td>
                    <td>{rule.description}</td>
                    <td>{severityTag(rule.severity)}</td>
                    <td>
                      <button
                        className={`${styles.toggle} ${rule.enabled ? styles.toggleActive : ''}`}
                        onClick={() => toggleNelsonRule(rule.id)}
                        title={rule.enabled ? '点击禁用' : '点击启用'}
                      >
                        <span className={styles.toggleDot} />
                      </button>
                    </td>
                  </tr>
                ))}
              </tbody>
            </table>
          </div>
        </div>
      </div>

      {/* ── Data Source Toggle ──────────────────────────────── */}
      <div className={styles.sourceSection}>
        <div className={styles.sourceHeader}>
          <span className={styles.sourceTitle}>
            <span className={styles.cardTitleDot} />
            数据源切换
          </span>
          <div className={styles.sourceToggle}>
            <button
              className={`${styles.sourceBtn} ${dataSource === 'mock' ? styles.sourceBtnActive : ''}`}
              onClick={() => handleSwitchSource('mock')}
              disabled={sourceLoading}
            >
              Mock 数据
            </button>
            <button
              className={`${styles.sourceBtn} ${dataSource === 'sqlserver' ? styles.sourceBtnActive : ''}`}
              onClick={() => handleSwitchSource('sqlserver')}
              disabled={sourceLoading}
            >
              SQL Server
            </button>
          </div>
        </div>
        <div className={styles.sourceInfo}>
          <span>
            <span className={styles.sourceLabel}>当前数据源:</span>
            <span className={styles.sourceValue}>
              {dataSource === 'mock' ? 'Mock 模拟数据' : 'SQL Server 实时数据'}
            </span>
          </span>
          {dataSource === 'mock'
            ? <StatusTag label="当前" color="green" />
            : <StatusTag label="当前" color="green" />}
          {lastSwitch && (
            <span>
              <span className={styles.sourceLabel}>上次切换:</span>
              <span className={styles.sourceValue}>{lastSwitch}</span>
            </span>
          )}
        </div>
      </div>
    </div>
  )
}
