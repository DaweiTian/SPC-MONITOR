import React, { useState, useEffect, useCallback } from 'react'
import { api } from '../../services'
import { AliasConfig } from '../../components/AliasConfig'
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
  rule_type: string
}

interface DBConfig {
  enabled: boolean
  source_type: string
  auth_type: string
  server: string
  database: string
  username: string
  password: string
  driver: string
  timeout: number
}

interface MDBConfig {
  enabled: boolean
  mdb_path: string
  sample_table: string
  product_table: string
  component_table: string
  prediction_table: string
  time_column: string
  product_ref_column: string
  product_name_column: string
  component_ref_column: string
  component_name_column: string
  value_column: string
  indicators: Record<string, string>
}

interface InstrumentInfo {
  id: string
  name: string
  type: 'mock' | 'sqlserver' | 'mdb'
}

const INSTRUMENTS: InstrumentInfo[] = [
  { id: 'mock', name: 'Mock 模拟数据', type: 'mock' },
  { id: 'ft1', name: 'FT1 乳品分析仪', type: 'sqlserver' },
  { id: 'ft120', name: 'FT120 乳品分析仪', type: 'mdb' },
  { id: 'fta', name: 'FTA 乳品分析仪', type: 'sqlserver' },
]

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

const DEFAULT_DB_CONFIG: DBConfig = {
  enabled: false,
  source_type: 'sqlserver',
  auth_type: 'windows',
  server: '',
  database: '',
  username: '',
  password: '',
  driver: 'ODBC Driver 17 for SQL Server',
  timeout: 30,
}

const DEFAULT_MDB_CONFIG: MDBConfig = {
  enabled: false,
  mdb_path: '',
  sample_table: 'Sample',
  product_table: 'Product',
  component_table: 'Component',
  prediction_table: 'Prediction',
  time_column: 'DateTime',
  product_ref_column: 'ProdRef',
  product_name_column: 'Name',
  component_ref_column: 'CompRef',
  component_name_column: 'Name',
  value_column: 'Value',
  indicators: {},
}

/* ── Tag helper ──────────────────────────────────────────────── */

const StatusTag: React.FC<{ label: string; color: 'green' | 'blue' | 'orange' | 'red' }> = ({ label, color }) => (
  <span className={`${styles.tag} ${styles[`tag${color.charAt(0).toUpperCase() + color.slice(1)}`]}`}>
    <span className={`${styles.tagDot} ${styles[`tagDot${color.charAt(0).toUpperCase() + color.slice(1)}`]}`} />
    {label}
  </span>
)

/* ── Component ───────────────────────────────────────────────── */

interface InitStatus {
  breakpoint: { last_collect_time?: string; mdb_path?: string } | null
  recent_records: Array<{
    sample_no: number
    product_name: string
    indicator_name: string
    value: number
    sample_time: string
  }>
  total_samples: number
  total_products: number
  total_indicators: number
}

interface IndicatorSpec {
  indicator_code: string
  indicator_name: string
  enabled: boolean
  usl: number | string
  lsl: number | string
  target: number | string
  unit: string
}

export const ConfigPage: React.FC = () => {
  const [products, setProducts] = useState<ProductItem[]>([])
  const [specs, setSpecs] = useState<SpecLimit[]>(INITIAL_SPECS)
  const [nelsonRules, setNelsonRules] = useState<NelsonRule[]>([])
  const [currentInstrument, setCurrentInstrument] = useState<string>('mock')
  const [sourceLoading, setSourceLoading] = useState(false)
  const [dbConfig, setDbConfig] = useState<DBConfig>(DEFAULT_DB_CONFIG)
  const [mdbConfig, setMdbConfig] = useState<MDBConfig>(DEFAULT_MDB_CONFIG)
  const [configLoading, setConfigLoading] = useState(false)
  const [testResult, setTestResult] = useState<{ success: boolean; message: string } | null>(null)
  const [saveResult, setSaveResult] = useState<{ success: boolean; message: string } | null>(null)
  const [initStatus, setInitStatus] = useState<InitStatus | null>(null)
  const [showConfirmDialog, setShowConfirmDialog] = useState(false)
  const [collectResult, setCollectResult] = useState<{ success: boolean; message: string } | null>(null)
  const [showProductDialog, setShowProductDialog] = useState(false)
  const [editingProduct, setEditingProduct] = useState<ProductItem | null>(null)
  const [availableIndicators, setAvailableIndicators] = useState<Array<{ code: string; name: string }>>([])
  const [indicatorSpecs, setIndicatorSpecs] = useState<IndicatorSpec[]>([])
  const [newProduct, setNewProduct] = useState({ name: '', code: '', status: 'enabled' as 'enabled' | 'disabled' })
  const [savedSpecLimits, setSavedSpecLimits] = useState<Record<string, Record<string, { lsl?: number; usl?: number; target?: number }>>>({})

  /* Fetch current instrument and configs on mount */
  useEffect(() => {
    api.getDataSourceStatus()
      .then((data: any) => {
        if (data?.instrument_type) setCurrentInstrument(data.instrument_type)
      })
      .catch(() => { /* default to mock */ })

    api.getDBConfig()
      .then((data: any) => {
        if (data) setDbConfig({ ...DEFAULT_DB_CONFIG, ...data })
      })
      .catch(() => { /* use defaults */ })

    api.getMDBConfig()
      .then((data: any) => {
        if (data) setMdbConfig({ ...DEFAULT_MDB_CONFIG, ...data })
      })
      .catch(() => { /* use defaults */ })

    // Fetch products from API
    fetchProducts()
  }, [])

  const fetchProducts = async () => {
    try {
      const [productsResult, indicatorsResult, statusResult, limitsResult, rulesResult] = await Promise.all([
        api.getProducts(),
        api.getIndicators(),
        api.getProductStatus().catch(() => ({} as Record<string, string>)),
        api.getSpecLimits().catch(() => ({} as Record<string, Record<string, { lsl?: number; usl?: number; target?: number }>>)),
        api.getAlertRules().catch(() => null),
      ])

      if (indicatorsResult?.indicators) {
        setAvailableIndicators(indicatorsResult.indicators)
      }

      if (limitsResult) {
        setSavedSpecLimits(limitsResult)
      }

      if (rulesResult?.rules) {
        setNelsonRules(rulesResult.rules)
      }

      if (productsResult?.products) {
        // Fetch indicator counts per product from actual data
        const countPromises = productsResult.products.map((p: any) =>
          api.getProductIndicatorCount(p.code).catch(() => ({ count: 0 }))
        )
        const counts = await Promise.all(countPromises)

        const productList: ProductItem[] = productsResult.products.map((p: any, index: number) => ({
          id: String(index + 1),
          name: p.name,
          code: p.code,
          indicatorCount: counts[index]?.count || 0,
          status: (statusResult as Record<string, string>)[p.code] === 'disabled' ? 'disabled' : 'enabled'
        }))
        setProducts(productList)
      }
    } catch {
      // Use empty array if fetch fails
      setProducts([])
    }
  }

  const getCurrentInstrumentInfo = (): InstrumentInfo => {
    return INSTRUMENTS.find(i => i.id === currentInstrument) || INSTRUMENTS[0]
  }

  const handleSwitchInstrument = useCallback(async (instrumentId: string) => {
    // Just switch the UI view, don't activate the collector yet
    setCurrentInstrument(instrumentId)
    setTestResult(null)
    setSaveResult(null)
  }, [])

  const handleActivateInstrument = useCallback(async (instrumentId: string) => {
    setSourceLoading(true)
    setTestResult(null)
    setSaveResult(null)
    try {
      const result = await api.switchInstrument(instrumentId)
      if (result?.success) {
        setTestResult({ success: true, message: result.message || '激活成功' })
      } else {
        setTestResult({ success: false, message: result?.message || '激活失败' })
      }
    } catch {
      setTestResult({ success: false, message: '激活请求失败' })
    } finally {
      setSourceLoading(false)
    }
  }, [])

  const handleDbConfigChange = (field: keyof DBConfig, value: string | number | boolean) => {
    setDbConfig(prev => ({ ...prev, [field]: value }))
    setTestResult(null)
    setSaveResult(null)
  }

  const handleMdbConfigChange = (field: keyof MDBConfig, value: string | number | boolean | Record<string, string>) => {
    setMdbConfig(prev => ({ ...prev, [field]: value }))
    setTestResult(null)
    setSaveResult(null)
  }

  const handleTestConnection = async () => {
    setConfigLoading(true)
    setTestResult(null)
    try {
      const instrumentInfo = getCurrentInstrumentInfo()
      let result
      if (instrumentInfo.type === 'mdb') {
        result = await api.testMDBConnection(mdbConfig)
      } else {
        result = await api.testDBConnection(dbConfig)
      }
      setTestResult(result)
    } catch {
      setTestResult({ success: false, message: '测试请求失败' })
    } finally {
      setConfigLoading(false)
    }
  }

  const handleSaveConfig = async () => {
    setConfigLoading(true)
    setSaveResult(null)
    setInitStatus(null)
    try {
      const instrumentInfo = getCurrentInstrumentInfo()
      let result
      if (instrumentInfo.type === 'mdb') {
        result = await api.updateMDBConfig({ ...mdbConfig, enabled: true })
      } else {
        result = await api.updateDBConfig({ ...dbConfig, enabled: true })
      }
      
      if (result?.success) {
        setSaveResult({ success: true, message: '配置已保存，正在分析数据源...' })
        
        // Fetch init status for MDB
        if (instrumentInfo.type === 'mdb') {
          try {
            const status = await api.getMDBInitStatus()
            if (status?.success) {
              setInitStatus(status)
              setShowConfirmDialog(true)
              setSaveResult({ success: true, message: '配置已保存，请确认数据源信息' })
            } else {
              setSaveResult({ success: false, message: status?.message || '获取数据源信息失败' })
            }
          } catch {
            setSaveResult({ success: false, message: '获取数据源信息失败' })
          }
        } else {
          // For SQL Server, just activate
          await handleActivateInstrument(currentInstrument)
        }
      } else {
        setSaveResult(result)
      }
    } catch {
      setSaveResult({ success: false, message: '保存失败' })
    } finally {
      setConfigLoading(false)
    }
  }

  const handleConfirmAndCollect = async () => {
    setShowConfirmDialog(false)
    setConfigLoading(true)
    setCollectResult(null)
    try {
      // Auto-match products from MDB if available
      if (initStatus?.recent_records) {
        const mdbProducts = initStatus.recent_records.reduce((acc, record) => {
          if (!acc.find(p => p.name === record.product_name)) {
            acc.push({ name: record.product_name, code: record.product_name })
          }
          return acc
        }, [] as Array<{ name: string; code: string }>)
        
        handleAutoMatchProducts(mdbProducts)
      }

      // Activate instrument
      const activateResult = await api.switchInstrument(currentInstrument)
      if (!activateResult?.success) {
        setCollectResult({ success: false, message: activateResult?.message || '激活失败' })
        return
      }
      
      // Perform first collection
      setCollectResult({ success: true, message: '正在采集数据...' })
      const collectResult = await api.manualCollect()
      
      if (collectResult?.status === 'success') {
        setCollectResult({ 
          success: true, 
          message: `采集成功！新增 ${collectResult.new_records || 0} 条数据` 
        })
        // Refresh products after collection
        await fetchProducts()
      } else {
        setCollectResult({ 
          success: false, 
          message: collectResult?.error || '采集失败' 
        })
      }
    } catch {
      setCollectResult({ success: false, message: '操作失败' })
    } finally {
      setConfigLoading(false)
    }
  }

  const handleCancelConfirm = () => {
    setShowConfirmDialog(false)
    setInitStatus(null)
  }

  const handleAddProduct = () => {
    setEditingProduct(null)
    setNewProduct({ name: '', code: '', status: 'enabled' })

    // New product starts with empty limits
    setIndicatorSpecs(availableIndicators.map(ind => ({
      indicator_code: ind.code,
      indicator_name: ind.name,
      enabled: true,
      usl: '',
      lsl: '',
      target: '',
      unit: ''
    })))
    setShowProductDialog(true)
  }

  const handleEditProduct = async (product: ProductItem) => {
    setEditingProduct(product)
    setNewProduct({ name: product.name, code: product.code, status: product.status })

    // Load per-product spec limits from backend
    let savedLimits: Record<string, { lsl?: number; usl?: number; target?: number }> = {}
    try {
      savedLimits = await api.getSpecLimits(product.code)
    } catch {
      // use empty
    }

    // Initialize indicator specs - all enabled by default, pre-fill from backend
    setIndicatorSpecs(availableIndicators.map(ind => {
      const limits = savedLimits[ind.code]
      return {
        indicator_code: ind.code,
        indicator_name: ind.name,
        enabled: true,
        usl: limits?.usl?.toString() || '',
        lsl: limits?.lsl?.toString() || '',
        target: limits?.target?.toString() || '',
        unit: ''
      }
    }))

    setShowProductDialog(true)
  }

  const handleSaveProduct = async () => {
    if (!newProduct.name || !newProduct.code) {
      alert('请填写品项名称和编码')
      return
    }

    // Update product
    if (editingProduct) {
      // Edit existing product
      setProducts(prev => prev.map(p => 
        p.id === editingProduct.id 
          ? { 
              ...p, 
              name: newProduct.name, 
              code: newProduct.code, 
              status: newProduct.status,
              indicatorCount: indicatorSpecs.filter(s => s.enabled).length
            }
          : p
      ))
    } else {
      // Add new product
      const newId = String(products.length + 1)
      setProducts(prev => [...prev, {
        id: newId,
        name: newProduct.name,
        code: newProduct.code,
        indicatorCount: indicatorSpecs.filter(s => s.enabled).length,
        status: newProduct.status
      }])
    }

    // Save product status to backend
    try {
      await api.updateSingleProductStatus(newProduct.code, newProduct.status)
    } catch (e) {
      console.error('保存品项状态失败:', e)
    }

    // Persist spec limits to backend
    const enabledSpecs = indicatorSpecs
      .filter(s => s.enabled && (s.usl || s.lsl))
      .map(s => ({
        id: `${newProduct.code}-${s.indicator_code}`,
        product: newProduct.code,
        indicator: s.indicator_name,
        indicator_code: s.indicator_code,
        usl: parseFloat(s.usl as string) || 0,
        lsl: parseFloat(s.lsl as string) || 0,
        target: parseFloat(s.target as string) || 0,
        unit: s.unit
      }))

    // Update local specs state
    setSpecs(prev => [
      ...prev.filter(s => s.product !== newProduct.code),
      ...enabledSpecs
    ])

    // Save each indicator's spec limits to backend (per-product)
    const productLimits: Record<string, { lsl?: number; usl?: number; target?: number }> = {}
    for (const spec of enabledSpecs) {
      try {
        const limits: { lsl?: number; usl?: number; target?: number; product_code: string } = { product_code: newProduct.code }
        if (spec.lsl) limits.lsl = spec.lsl
        if (spec.usl) limits.usl = spec.usl
        if (spec.target) limits.target = spec.target
        await api.updateSingleSpecLimit(spec.indicator_code, limits)
        productLimits[spec.indicator_code] = { lsl: limits.lsl, usl: limits.usl, target: limits.target }
      } catch (e) {
        console.error(`保存指标 ${spec.indicator_code} 规格限失败:`, e)
      }
    }
    setSavedSpecLimits(prev => ({ ...prev, [newProduct.code]: productLimits }))

    setShowProductDialog(false)
  }

  const handleDeleteProduct = (productId: string) => {
    if (confirm('确定要删除这个品项吗？')) {
      setProducts(prev => prev.filter(p => p.id !== productId))
    }
  }

  const handleAutoMatchProducts = (mdbProducts: Array<{ name: string; code: string }>) => {
    // Auto-match MDB products with existing products
    const existingCodes = new Set(products.map(p => p.code))
    const newProducts: ProductItem[] = mdbProducts
      .filter(p => !existingCodes.has(p.code))
      .map((p, index) => ({
        id: String(products.length + index + 1),
        name: p.name,
        code: p.code,
        indicatorCount: 0,
        status: 'enabled' as const
      }))
    
    if (newProducts.length > 0) {
      setProducts(prev => [...prev, ...newProducts])
    }
  }

  const toggleNelsonRule = async (id: number) => {
    const newRules = nelsonRules.map(r => r.id === id ? { ...r, enabled: !r.enabled } : r)
    setNelsonRules(newRules)
    try {
      await api.updateAlertRules({ rules: newRules })
    } catch (e) {
      console.error('保存预警规则失败:', e)
    }
  }

  const severityTag = (severity: string) => {
    if (severity === 'CRITICAL') return <StatusTag label="严重" color="red" />
    if (severity === 'WARNING') return <StatusTag label="警告" color="orange" />
    return <StatusTag label="信息" color="blue" />
  }

  return (
    <div className={styles.page}>
      {/* ── 品项管理（合并品项管理 + 规格限配置）───────────── */}
      <div className={styles.card} style={{ marginBottom: '20px' }}>
        <div className={styles.cardHeader}>
          <span className={styles.cardTitle}>
            <span className={styles.cardTitleDot} />
            品项管理
          </span>
        </div>
        <div className={styles.cardBody}>
          <table className={styles.table}>
            <thead>
              <tr>
                <th>品项名称</th>
                <th>编码</th>
                <th>监测指标数</th>
                <th>规格限 (USL/LSL)</th>
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
                    {savedSpecLimits[p.code] && Object.keys(savedSpecLimits[p.code]).length > 0
                      ? Object.entries(savedSpecLimits[p.code])
                          .map(([k, v]) => {
                            const indName = availableIndicators.find(i => i.code === k)?.name || k
                            return `${indName}: ${v.usl ?? '-'}/${v.lsl ?? '-'}`
                          })
                          .join(', ')
                      : <span style={{ color: 'var(--text-muted)' }}>未配置</span>
                    }
                  </td>
                  <td>
                    {p.status === 'enabled'
                      ? <StatusTag label="启用" color="green" />
                      : <StatusTag label="停用" color="orange" />}
                  </td>
                  <td>
                    <button 
                      className={styles.btnEdit}
                      onClick={() => handleEditProduct(p)}
                    >
                      编辑
                    </button>
                    <button 
                      className={`${styles.btnEdit} ${styles.btnDanger}`}
                      onClick={() => handleDeleteProduct(p.id)}
                      style={{ marginLeft: '8px' }}
                    >
                      删除
                    </button>
                  </td>
                </tr>
              ))}
            </tbody>
          </table>
        </div>
      </div>

      {/* ── 品项别名 ─────────────────────── */}
      <div className={styles.card} style={{ marginBottom: '20px' }}>
        <div className={styles.cardHeader}>
          <span className={styles.cardTitle}>
            <span className={styles.cardTitleDot} />
            品项别名
          </span>
        </div>
        <div className={styles.cardBody} style={{ padding: 0 }}>
          <AliasConfig
            products={products.map(p => ({ code: p.code, name: p.name }))}
            indicators={availableIndicators}
            onUpdate={() => {}}
            mode="products"
          />
        </div>
      </div>

      {/* ── 检验项目别名 ─────────────────────── */}
      <div className={styles.card} style={{ marginBottom: '20px' }}>
        <div className={styles.cardHeader}>
          <span className={styles.cardTitle}>
            <span className={styles.cardTitleDot} />
            检验项目别名
          </span>
        </div>
        <div className={styles.cardBody} style={{ padding: 0 }}>
          <AliasConfig
            products={products.map(p => ({ code: p.code, name: p.name }))}
            indicators={availableIndicators}
            onUpdate={() => {}}
            mode="indicators"
          />
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

      {/* ── Instrument Selector ──────────────────────────────── */}
      <div className={styles.sourceSection}>
        <div className={styles.sourceHeader}>
          <span className={styles.sourceTitle}>
            <span className={styles.cardTitleDot} />
            仪器选择
          </span>
          <StatusTag label={getCurrentInstrumentInfo().name} color="green" />
        </div>
        <div className={styles.instrumentGrid}>
          {INSTRUMENTS.map(instrument => (
            <button
              key={instrument.id}
              className={`${styles.instrumentBtn} ${currentInstrument === instrument.id ? styles.instrumentBtnActive : ''}`}
              onClick={() => handleSwitchInstrument(instrument.id)}
              disabled={sourceLoading}
            >
              <span className={styles.instrumentIcon}>
                {instrument.type === 'mock' ? '🎭' : instrument.type === 'mdb' ? '📁' : '🗄️'}
              </span>
              <span className={styles.instrumentName}>{instrument.name}</span>
              <span className={styles.instrumentType}>
                {instrument.type === 'mock' ? '模拟数据' : instrument.type === 'mdb' ? 'MDB 文件' : 'SQL Server'}
              </span>
            </button>
          ))}
        </div>
      </div>

      {/* ── SQL Server Configuration (for FT1/FTA) ── */}
      {(currentInstrument === 'ft1' || currentInstrument === 'fta') && (
        <div className={styles.dbConfigSection}>
          <div className={styles.dbConfigHeader}>
            <span className={styles.dbConfigTitle}>
              <span className={styles.cardTitleDot} />
              SQL Server 连接配置
            </span>
            <StatusTag label={currentInstrument.toUpperCase()} color="blue" />
          </div>

          <div className={styles.dbConfigForm}>
            {/* Row 1: Server & Database */}
            <div className={styles.formRow}>
              <div className={styles.formGroup}>
                <label className={styles.formLabel}>
                  服务器地址
                  <span className={styles.formRequired}>*</span>
                </label>
                <input
                  type="text"
                  className={styles.formInput}
                  value={dbConfig.server}
                  onChange={e => handleDbConfigChange('server', e.target.value)}
                  placeholder="例: XTZJ-20230331ga\MSCFT1SQLSERVER,49382"
                />
                <span className={styles.formHint}>格式: 主机名\实例名,端口</span>
              </div>
              <div className={styles.formGroup}>
                <label className={styles.formLabel}>
                  数据库名称
                  <span className={styles.formRequired}>*</span>
                </label>
                <input
                  type="text"
                  className={styles.formInput}
                  value={dbConfig.database}
                  onChange={e => handleDbConfigChange('database', e.target.value)}
                  placeholder="例: MSCFT1"
                />
              </div>
            </div>

            {/* Row 2: Auth Type & Driver */}
            <div className={styles.formRow}>
              <div className={styles.formGroup}>
                <label className={styles.formLabel}>认证方式</label>
                <select
                  className={styles.formSelect}
                  value={dbConfig.auth_type}
                  onChange={e => handleDbConfigChange('auth_type', e.target.value)}
                >
                  <option value="windows">Windows 认证 (SSPI)</option>
                  <option value="sql">SQL Server 认证</option>
                </select>
              </div>
              <div className={styles.formGroup}>
                <label className={styles.formLabel}>ODBC 驱动</label>
                <select
                  className={styles.formSelect}
                  value={dbConfig.driver}
                  onChange={e => handleDbConfigChange('driver', e.target.value)}
                >
                  <option value="ODBC Driver 17 for SQL Server">ODBC Driver 17</option>
                  <option value="ODBC Driver 18 for SQL Server">ODBC Driver 18</option>
                  <option value="SQL Server">SQL Server (旧版)</option>
                </select>
              </div>
            </div>

            {/* Row 3: Username & Password (SQL auth only) */}
            {dbConfig.auth_type === 'sql' && (
              <div className={styles.formRow}>
                <div className={styles.formGroup}>
                  <label className={styles.formLabel}>
                    用户名
                    <span className={styles.formRequired}>*</span>
                  </label>
                  <input
                    type="text"
                    className={styles.formInput}
                    value={dbConfig.username}
                    onChange={e => handleDbConfigChange('username', e.target.value)}
                    placeholder="SQL Server 登录用户名"
                  />
                </div>
                <div className={styles.formGroup}>
                  <label className={styles.formLabel}>
                    密码
                    <span className={styles.formRequired}>*</span>
                  </label>
                  <input
                    type="password"
                    className={styles.formInput}
                    value={dbConfig.password}
                    onChange={e => handleDbConfigChange('password', e.target.value)}
                    placeholder="SQL Server 登录密码"
                  />
                </div>
              </div>
            )}

            {/* Row 4: Timeout */}
            <div className={styles.formRow}>
              <div className={styles.formGroup}>
                <label className={styles.formLabel}>连接超时 (秒)</label>
                <input
                  type="number"
                  className={styles.formInput}
                  value={dbConfig.timeout}
                  onChange={e => handleDbConfigChange('timeout', parseInt(e.target.value) || 30)}
                  min="5"
                  max="120"
                />
              </div>
            </div>

            {/* Action Buttons */}
            <div className={styles.formActions}>
              <button
                className={`${styles.btn} ${styles.btnSecondary}`}
                onClick={handleTestConnection}
                disabled={configLoading || !dbConfig.server || !dbConfig.database}
              >
                {configLoading ? '测试中...' : '测试连接'}
              </button>
              <button
                className={`${styles.btn} ${styles.btnPrimary}`}
                onClick={handleSaveConfig}
                disabled={configLoading || !dbConfig.server || !dbConfig.database}
              >
                {configLoading ? '保存中...' : '保存配置'}
              </button>
            </div>

            {/* Result Messages */}
            {testResult && (
              <div className={`${styles.formMessage} ${testResult.success ? styles.formMessageSuccess : styles.formMessageError}`}>
                {testResult.message}
              </div>
            )}
            {saveResult && (
              <div className={`${styles.formMessage} ${saveResult.success ? styles.formMessageSuccess : styles.formMessageError}`}>
                {saveResult.message}
              </div>
            )}
          </div>
        </div>
      )}

      {/* ── MDB Configuration (for FT120) ── */}
      {currentInstrument === 'ft120' && (
        <div className={styles.dbConfigSection}>
          <div className={styles.dbConfigHeader}>
            <span className={styles.dbConfigTitle}>
              <span className={styles.cardTitleDot} />
              MDB 文件配置
            </span>
            <StatusTag label="FT120" color="blue" />
          </div>

          <div className={styles.dbConfigForm}>
            {/* Row 1: MDB File Path */}
            <div className={styles.formRow}>
              <div className={styles.formGroup}>
                <label className={styles.formLabel}>
                  MDB 文件路径
                  <span className={styles.formRequired}>*</span>
                </label>
                <input
                  type="text"
                  className={styles.formInput}
                  value={mdbConfig.mdb_path}
                  onChange={e => handleMdbConfigChange('mdb_path', e.target.value)}
                  placeholder="例: /mnt/d/数据/ft120.mdb 或 C:\Data\ft120.mdb"
                />
                <span className={styles.formHint}>支持本地文件路径</span>
              </div>
            </div>

            {/* Row 2: Table Names */}
            <div className={styles.formRow}>
              <div className={styles.formGroup}>
                <label className={styles.formLabel}>样本表名</label>
                <input
                  type="text"
                  className={styles.formInput}
                  value={mdbConfig.sample_table}
                  onChange={e => handleMdbConfigChange('sample_table', e.target.value)}
                  placeholder="Sample"
                />
              </div>
              <div className={styles.formGroup}>
                <label className={styles.formLabel}>产品表名</label>
                <input
                  type="text"
                  className={styles.formInput}
                  value={mdbConfig.product_table}
                  onChange={e => handleMdbConfigChange('product_table', e.target.value)}
                  placeholder="Product"
                />
              </div>
            </div>

            {/* Row 3: More Table Names */}
            <div className={styles.formRow}>
              <div className={styles.formGroup}>
                <label className={styles.formLabel}>组件/指标表名</label>
                <input
                  type="text"
                  className={styles.formInput}
                  value={mdbConfig.component_table}
                  onChange={e => handleMdbConfigChange('component_table', e.target.value)}
                  placeholder="Component"
                />
              </div>
              <div className={styles.formGroup}>
                <label className={styles.formLabel}>预测/结果表名</label>
                <input
                  type="text"
                  className={styles.formInput}
                  value={mdbConfig.prediction_table}
                  onChange={e => handleMdbConfigChange('prediction_table', e.target.value)}
                  placeholder="Prediction"
                />
              </div>
            </div>

            {/* Row 4: Column Names */}
            <div className={styles.formRow}>
              <div className={styles.formGroup}>
                <label className={styles.formLabel}>时间列名</label>
                <input
                  type="text"
                  className={styles.formInput}
                  value={mdbConfig.time_column}
                  onChange={e => handleMdbConfigChange('time_column', e.target.value)}
                  placeholder="DateTime"
                />
              </div>
              <div className={styles.formGroup}>
                <label className={styles.formLabel}>产品引用列名</label>
                <input
                  type="text"
                  className={styles.formInput}
                  value={mdbConfig.product_ref_column}
                  onChange={e => handleMdbConfigChange('product_ref_column', e.target.value)}
                  placeholder="ProdRef"
                />
              </div>
            </div>

            {/* Row 5: More Column Names */}
            <div className={styles.formRow}>
              <div className={styles.formGroup}>
                <label className={styles.formLabel}>产品名称列名</label>
                <input
                  type="text"
                  className={styles.formInput}
                  value={mdbConfig.product_name_column}
                  onChange={e => handleMdbConfigChange('product_name_column', e.target.value)}
                  placeholder="Name"
                />
              </div>
              <div className={styles.formGroup}>
                <label className={styles.formLabel}>组件引用列名</label>
                <input
                  type="text"
                  className={styles.formInput}
                  value={mdbConfig.component_ref_column}
                  onChange={e => handleMdbConfigChange('component_ref_column', e.target.value)}
                  placeholder="CompRef"
                />
              </div>
            </div>

            {/* Row 6: Value Column */}
            <div className={styles.formRow}>
              <div className={styles.formGroup}>
                <label className={styles.formLabel}>组件名称列名</label>
                <input
                  type="text"
                  className={styles.formInput}
                  value={mdbConfig.component_name_column}
                  onChange={e => handleMdbConfigChange('component_name_column', e.target.value)}
                  placeholder="Name"
                />
              </div>
              <div className={styles.formGroup}>
                <label className={styles.formLabel}>测量值列名</label>
                <input
                  type="text"
                  className={styles.formInput}
                  value={mdbConfig.value_column}
                  onChange={e => handleMdbConfigChange('value_column', e.target.value)}
                  placeholder="Value"
                />
              </div>
            </div>

            {/* Action Buttons */}
            <div className={styles.formActions}>
              <button
                className={`${styles.btn} ${styles.btnSecondary}`}
                onClick={handleTestConnection}
                disabled={configLoading || !mdbConfig.mdb_path}
              >
                {configLoading ? '测试中...' : '测试连接'}
              </button>
              <button
                className={`${styles.btn} ${styles.btnPrimary}`}
                onClick={handleSaveConfig}
                disabled={configLoading || !mdbConfig.mdb_path}
              >
                {configLoading ? '保存中...' : '保存配置'}
              </button>
            </div>

            {/* Result Messages */}
            {testResult && (
              <div className={`${styles.formMessage} ${testResult.success ? styles.formMessageSuccess : styles.formMessageError}`}>
                {testResult.message}
              </div>
            )}
            {saveResult && (
              <div className={`${styles.formMessage} ${saveResult.success ? styles.formMessageSuccess : styles.formMessageError}`}>
                {saveResult.message}
              </div>
            )}
            {collectResult && (
              <div className={`${styles.formMessage} ${collectResult.success ? styles.formMessageSuccess : styles.formMessageError}`}>
                {collectResult.message}
              </div>
            )}
          </div>
        </div>
      )}

      {/* ── Confirmation Dialog ── */}
      {showConfirmDialog && initStatus && (
        <div className={styles.confirmOverlay}>
          <div className={styles.confirmDialog}>
            <div className={styles.confirmHeader}>
              <h3>数据源确认</h3>
              <button className={styles.confirmClose} onClick={handleCancelConfirm}>×</button>
            </div>
            
            <div className={styles.confirmBody}>
              {/* Breakpoint Info */}
              <div className={styles.confirmSection}>
                <h4>断点信息</h4>
                {initStatus.breakpoint ? (
                  <div className={styles.confirmInfo}>
                    <p><strong>上次采集时间:</strong> {initStatus.breakpoint.last_collect_time || '无'}</p>
                    <p><strong>数据源路径:</strong> {initStatus.breakpoint.mdb_path || '无'}</p>
                  </div>
                ) : (
                  <p className={styles.confirmWarning}>首次采集，无断点信息</p>
                )}
              </div>

              {/* Data Summary */}
              <div className={styles.confirmSection}>
                <h4>数据源概览</h4>
                <div className={styles.confirmStats}>
                  <div className={styles.confirmStat}>
                    <span className={styles.confirmStatValue}>{initStatus.total_samples}</span>
                    <span className={styles.confirmStatLabel}>样本总数</span>
                  </div>
                  <div className={styles.confirmStat}>
                    <span className={styles.confirmStatValue}>{initStatus.total_products}</span>
                    <span className={styles.confirmStatLabel}>品项数</span>
                  </div>
                  <div className={styles.confirmStat}>
                    <span className={styles.confirmStatValue}>{initStatus.total_indicators}</span>
                    <span className={styles.confirmStatLabel}>指标数</span>
                  </div>
                </div>
              </div>

              {/* Recent Records Preview */}
              <div className={styles.confirmSection}>
                <h4>最近数据预览 (共 {initStatus.recent_records.length} 条)</h4>
                <div className={styles.confirmTableWrapper}>
                  <table className={styles.confirmTable}>
                    <thead>
                      <tr>
                        <th>品项</th>
                        <th>指标</th>
                        <th>值</th>
                        <th>时间</th>
                      </tr>
                    </thead>
                    <tbody>
                      {initStatus.recent_records.slice(0, 10).map((record, index) => (
                        <tr key={index}>
                          <td>{record.product_name}</td>
                          <td>{record.indicator_name}</td>
                          <td>{record.value.toFixed(4)}</td>
                          <td>{record.sample_time}</td>
                        </tr>
                      ))}
                    </tbody>
                  </table>
                </div>
              </div>
            </div>

            <div className={styles.confirmFooter}>
              <button 
                className={`${styles.btn} ${styles.btnSecondary}`}
                onClick={handleCancelConfirm}
                disabled={configLoading}
              >
                取消
              </button>
              <button 
                className={`${styles.btn} ${styles.btnPrimary}`}
                onClick={handleConfirmAndCollect}
                disabled={configLoading}
              >
                {configLoading ? '采集中...' : '确认并开始采集'}
              </button>
            </div>
          </div>
        </div>
      )}

      {/* ── Product Dialog ── */}
      {showProductDialog && (
        <div className={styles.confirmOverlay}>
          <div className={styles.confirmDialog} style={{ maxWidth: '700px' }}>
            <div className={styles.confirmHeader}>
              <h3>{editingProduct ? '编辑品项' : '新增品项'}</h3>
              <button className={styles.confirmClose} onClick={() => setShowProductDialog(false)}>×</button>
            </div>
            
            <div className={styles.confirmBody}>
              {/* Basic Info */}
              <div className={styles.confirmSection}>
                <h4>基本信息</h4>
                <div className={styles.formRow}>
                  <div className={styles.formGroup}>
                    <label className={styles.formLabel}>
                      品项名称
                      <span className={styles.formRequired}>*</span>
                    </label>
                    <input
                      type="text"
                      className={styles.formInput}
                      value={newProduct.name}
                      onChange={e => setNewProduct(prev => ({ ...prev, name: e.target.value }))}
                      placeholder="例: 砖纯牛奶"
                    />
                  </div>
                  <div className={styles.formGroup}>
                    <label className={styles.formLabel}>
                      品项编码
                      <span className={styles.formRequired}>*</span>
                    </label>
                    <input
                      type="text"
                      className={styles.formInput}
                      value={newProduct.code}
                      onChange={e => setNewProduct(prev => ({ ...prev, code: e.target.value }))}
                      placeholder="例: FT1-STD"
                    />
                  </div>
                </div>
                <div className={styles.formGroup} style={{ marginTop: '12px' }}>
                  <label className={styles.formLabel}>状态</label>
                  <select
                    className={styles.formSelect}
                    value={newProduct.status}
                    onChange={e => setNewProduct(prev => ({ ...prev, status: e.target.value as 'enabled' | 'disabled' }))}
                  >
                    <option value="enabled">启用</option>
                    <option value="disabled">停用</option>
                  </select>
                </div>
              </div>

              {/* Indicator Selection & Spec Limits */}
              <div className={styles.confirmSection}>
                <h4>监测指标与规格限</h4>
                <div className={styles.confirmTableWrapper} style={{ maxHeight: '300px' }}>
                  <table className={styles.confirmTable}>
                    <thead>
                      <tr>
                        <th style={{ width: '40px' }}>启用</th>
                        <th>指标名称</th>
                        <th>USL (上限)</th>
                        <th>LSL (下限)</th>
                        <th>目标值</th>
                        <th>单位</th>
                      </tr>
                    </thead>
                    <tbody>
                      {indicatorSpecs.map((spec, index) => (
                        <tr key={spec.indicator_code}>
                          <td>
                            <input
                              type="checkbox"
                              checked={spec.enabled}
                              onChange={e => {
                                const newSpecs = [...indicatorSpecs]
                                newSpecs[index] = { ...spec, enabled: e.target.checked }
                                setIndicatorSpecs(newSpecs)
                              }}
                            />
                          </td>
                          <td className={styles.tableCellPrimary}>{spec.indicator_name}</td>
                          <td>
                            <input
                              type="number"
                              className={styles.formInput}
                              style={{ width: '80px', padding: '4px 8px' }}
                              value={spec.usl}
                              onChange={e => {
                                const newSpecs = [...indicatorSpecs]
                                newSpecs[index] = { ...spec, usl: e.target.value }
                                setIndicatorSpecs(newSpecs)
                              }}
                              placeholder="-"
                              disabled={!spec.enabled}
                            />
                          </td>
                          <td>
                            <input
                              type="number"
                              className={styles.formInput}
                              style={{ width: '80px', padding: '4px 8px' }}
                              value={spec.lsl}
                              onChange={e => {
                                const newSpecs = [...indicatorSpecs]
                                newSpecs[index] = { ...spec, lsl: e.target.value }
                                setIndicatorSpecs(newSpecs)
                              }}
                              placeholder="-"
                              disabled={!spec.enabled}
                            />
                          </td>
                          <td>
                            <input
                              type="number"
                              className={styles.formInput}
                              style={{ width: '80px', padding: '4px 8px' }}
                              value={spec.target}
                              onChange={e => {
                                const newSpecs = [...indicatorSpecs]
                                newSpecs[index] = { ...spec, target: e.target.value }
                                setIndicatorSpecs(newSpecs)
                              }}
                              placeholder="-"
                              disabled={!spec.enabled}
                            />
                          </td>
                          <td>
                            <input
                              type="text"
                              className={styles.formInput}
                              style={{ width: '60px', padding: '4px 8px' }}
                              value={spec.unit}
                              onChange={e => {
                                const newSpecs = [...indicatorSpecs]
                                newSpecs[index] = { ...spec, unit: e.target.value }
                                setIndicatorSpecs(newSpecs)
                              }}
                              placeholder="%"
                              disabled={!spec.enabled}
                            />
                          </td>
                        </tr>
                      ))}
                    </tbody>
                  </table>
                </div>
                <div style={{ marginTop: '8px', fontSize: '12px', color: 'var(--text-muted)' }}>
                  已选择 {indicatorSpecs.filter(s => s.enabled).length} / {indicatorSpecs.length} 个指标
                </div>
              </div>
            </div>

            <div className={styles.confirmFooter}>
              <button 
                className={`${styles.btn} ${styles.btnSecondary}`}
                onClick={() => setShowProductDialog(false)}
              >
                取消
              </button>
              <button 
                className={`${styles.btn} ${styles.btnPrimary}`}
                onClick={handleSaveProduct}
              >
                保存
              </button>
            </div>
          </div>
        </div>
      )}
    </div>
  )
}
