import React, { useState, useEffect, useCallback } from 'react'
import { api } from '../../services'
import { AliasConfig } from '../../components/AliasConfig'
import { useToast } from '../../components/Toast'
import type { Product } from '../../types'
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
  type: 'mock' | 'sqlserver' | 'mdb' | 'fta'
}

const INSTRUMENTS: InstrumentInfo[] = [
  { id: 'mock', name: 'Mock 模拟数据', type: 'mock' },
  { id: 'ft1', name: 'FT1 乳品分析仪', type: 'sqlserver' },
  { id: 'ft120', name: 'FT120 乳品分析仪', type: 'mdb' },
  { id: 'fta', name: 'FTA 乳品分析仪', type: 'fta' },
]

const INITIAL_SPECS: SpecLimit[] = [
  { id: '1', product: 'FT1-STD', indicator: '直径(mm)', usl: 10.05, lsl: 9.95, target: 10.00, unit: 'mm' },
  { id: '2', product: 'FT1-STD', indicator: '圆度(μm)', usl: 2.0, lsl: 0, target: 0.5, unit: 'μm' },
  { id: '3', product: 'FT1-HP', indicator: '表面粗糙度', usl: 0.8, lsl: 0, target: 0.3, unit: 'Ra' },
  { id: '4', product: 'FT1-HP', indicator: '硬度(HRC)', usl: 62, lsl: 58, target: 60, unit: 'HRC' },
]

const DEFAULT_DB_CONFIG: DBConfig = {
  enabled: false,
  source_type: 'sqlserver',
  auth_type: 'windows',
  server: '',
  database: '',
  username: '',
  password: '',
  driver: 'pymssql',
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

interface FTAConfig {
  server: string
  database: string
  auth_type: string
  driver: string
  username: string
  password: string
  timeout: number
}

const DEFAULT_FTA_CONFIG: FTAConfig = {
  server: '',
  database: 'Pert_Application',
  auth_type: 'sql',
  driver: 'pymssql',
  username: 'sa',
  password: '',
  timeout: 30,
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
  const [_specs, setSpecs] = useState<SpecLimit[]>(INITIAL_SPECS)
  const [nelsonRules, setNelsonRules] = useState<NelsonRule[]>([])
  const [currentInstrument, setCurrentInstrument] = useState<string>('mock')
  const [sourceLoading, _setSourceLoading] = useState(false)
  const [dbConfig, setDbConfig] = useState<DBConfig>(DEFAULT_DB_CONFIG)
  const [mdbConfig, setMdbConfig] = useState<MDBConfig>(DEFAULT_MDB_CONFIG)
  const [ftaConfig, setFtaConfig] = useState<FTAConfig>(DEFAULT_FTA_CONFIG)
  const [configLoading, setConfigLoading] = useState(false)
  const [testResult, setTestResult] = useState<{ success: boolean; message: string } | null>(null)
  const [saveResult, setSaveResult] = useState<{ success: boolean; message: string } | null>(null)
  const [initStatus, setInitStatus] = useState<InitStatus | null>(null)
  const [showConfirmDialog, setShowConfirmDialog] = useState(false)
  const [initLimit, setInitLimit] = useState(100)
  const [importing, setImporting] = useState(false)
  const [importProgress, setImportProgress] = useState({ current: 0, total: 0, elapsed: 0 })
  const [collectResult, setCollectResult] = useState<{ success: boolean; message: string } | null>(null)
  const [showProductDialog, setShowProductDialog] = useState(false)
  const [editingProduct, setEditingProduct] = useState<ProductItem | null>(null)
  const [availableIndicators, setAvailableIndicators] = useState<Array<{ code: string; name: string }>>([])
  const [indicatorSpecs, setIndicatorSpecs] = useState<IndicatorSpec[]>([])
  const [newProduct, setNewProduct] = useState({ name: '', code: '', status: 'enabled' as 'enabled' | 'disabled' })
  const [productAlias, setProductAlias] = useState('')
  const [productAliases, setProductAliases] = useState<Record<string, string>>({})
  const [indicatorAliases, setIndicatorAliases] = useState<Record<string, string>>({})
  const [savedSpecLimits, setSavedSpecLimits] = useState<Record<string, Record<string, { lsl?: number; usl?: number; target?: number }>>>({})
  const [savedIndicators, setSavedIndicators] = useState<Record<string, string[]>>({})
  const [excludedRemarks, setExcludedRemarks] = useState<string[]>([])
  const [newRemarkKeyword, setNewRemarkKeyword] = useState('')
  const [productCategories, setProductCategories] = useState<Record<string, string>>({})
  const [predictionCategories, setPredictionCategories] = useState<Record<string, { name: string; k: number }>>({})
  const [predictionConfig, setPredictionConfig] = useState<Record<string, Record<string, { source_indicator: string; coefficient: number; enabled: boolean; alert_threshold?: number; alert_enabled?: boolean; usl?: number | null; lsl?: number | null; target?: number | null; unit?: string | null }>>>({})
  const [selectedCategory, setSelectedCategory] = useState('')
  const [predictSaturatedFat, setPredictSaturatedFat] = useState(false)
  const [predCoefficient, setPredCoefficient] = useState('')
  const [predictionMethod, setPredictionMethod] = useState<'linear' | 'random_forest'>('linear')
  const [alertEnabled, setAlertEnabled] = useState(false)
  const [alertThreshold, setAlertThreshold] = useState('10')
  const [predUsl, setPredUsl] = useState('')
  const [predLsl, setPredLsl] = useState('')
  const [predTarget, setPredTarget] = useState('')
  const [predUnit, setPredUnit] = useState('')
  const [productSearch, setProductSearch] = useState('')
  const [deleteConfirm, setDeleteConfirm] = useState<{ show: boolean; productId: string }>({ show: false, productId: '' })
  const { addToast } = useToast()
  const [frequencyStatus, setFrequencyStatus] = useState<{
    current_level: number
    current_interval_minutes: number
    frequency_ladder: number[]
    is_collecting: boolean
    last_collect_time: string | null
  } | null>(null)

  /* Fetch current instrument and configs on mount */
  useEffect(() => {
    api.getDataSourceStatus()
      .then((data: Record<string, unknown>) => {
        if (data?.instrument_type) setCurrentInstrument(String(data.instrument_type))
      })
      .catch(() => { /* default to mock */ })

    api.getDBConfig()
      .then((data) => {
        if (data) setDbConfig({ ...DEFAULT_DB_CONFIG, ...data })
      })
      .catch(() => { /* use defaults */ })

    api.getMDBConfig()
      .then((data) => {
        if (data) setMdbConfig({ ...DEFAULT_MDB_CONFIG, ...data })
      })
      .catch(() => { /* use defaults */ })

    api.getFTAConfig()
      .then((data) => {
        if (data) setFtaConfig({ ...DEFAULT_FTA_CONFIG, ...data })
      })
      .catch(() => { /* use defaults */ })

    // Fetch products from API
    fetchProducts()

    // Fetch frequency status
    const fetchFrequency = async () => {
      try {
        const status = await api.getStatus()
        setFrequencyStatus({
          current_level: status.current_level,
          current_interval_minutes: status.current_interval_minutes,
          frequency_ladder: status.frequency_ladder,
          is_collecting: status.is_collecting,
          last_collect_time: status.last_collect_time ?? null,
        })
      } catch {}
    }
    fetchFrequency()
    const freqInterval = setInterval(fetchFrequency, 15000)
    return () => clearInterval(freqInterval)
  }, [])

  const fetchProducts = async () => {
    try {
      const [productsResult, indicatorsResult, statusResult, limitsResult, rulesResult, aliasResult, savedIndResult, exclRemarksResult, categoriesResult, predCategoriesResult, predConfigResult] = await Promise.all([
        api.getProducts(),
        api.getIndicators(),
        api.getProductStatus().catch(() => ({} as Record<string, string>)),
        api.getSpecLimits().catch(() => ({} as Record<string, Record<string, { lsl?: number; usl?: number; target?: number }>>)),
        api.getAlertRules().catch(() => null),
        api.getAliases().catch(() => ({ products: {}, indicators: {} })),
        api.getSavedIndicators().catch(() => ({} as Record<string, string[]>)),
        api.getExcludedRemarks().catch(() => ['基准样']),
        api.getProductCategories().catch(() => ({})),
        api.getPredictionCategories().catch(() => ({})),
        api.getPredictionConfig().catch(() => ({})),
      ])

      if (exclRemarksResult) setExcludedRemarks(exclRemarksResult)

      if (indicatorsResult?.indicators) {
        setAvailableIndicators(indicatorsResult.indicators)
      }

      if (aliasResult?.products) {
        setProductAliases(aliasResult.products)
      }

      if (aliasResult?.indicators) {
        setIndicatorAliases(aliasResult.indicators)
      }

      if (limitsResult) {
        setSavedSpecLimits(limitsResult)
      }

      if (rulesResult?.rules) {
        setNelsonRules(rulesResult.rules.map((r) => ({
          ...r,
          severity: r.severity as 'CRITICAL' | 'WARNING' | 'INFO',
        })))
      }

      if (savedIndResult) {
        setSavedIndicators(savedIndResult)
      }

      if (categoriesResult) setProductCategories(categoriesResult)
      if (predCategoriesResult) setPredictionCategories(predCategoriesResult)
      if (predConfigResult) setPredictionConfig(predConfigResult)

      if (productsResult?.products) {
        // Fetch recent collection counts for sorting
        const recentCounts = await api.getRecentCounts(10).catch(() => ({ products: {} as Record<string, number>, indicators: {} as Record<string, number> }))

        // Sort products by recent collection count (descending)
        const sortedProducts = [...productsResult.products].sort((a, b) =>
          (recentCounts.products[b.code] || 0) - (recentCounts.products[a.code] || 0)
        )

        // Sort indicator aliases by recent collection count (descending)
        if (recentCounts.indicators && Object.keys(recentCounts.indicators).length > 0) {
          const sortedAliases = Object.entries(indicatorAliases).sort(
            ([a], [b]) => (recentCounts.indicators[b] || 0) - (recentCounts.indicators[a] || 0)
          )
          setIndicatorAliases(Object.fromEntries(sortedAliases))
        }

        // Render products immediately with count=0, then update counts async
        const productList: ProductItem[] = sortedProducts.map((p: Product, index: number) => ({
          id: String(index + 1),
          name: p.name,
          code: p.code,
          indicatorCount: 0,
          status: (statusResult as Record<string, string>)[p.code] === 'disabled' ? 'disabled' : 'enabled'
        }))
        setProducts(productList)

        // Fetch indicator counts in background and update
        const countPromises = sortedProducts.map((p: Product) =>
          api.getProductIndicatorCount(p.code).catch(() => ({ count: 0 }))
        )
        const counts = await Promise.all(countPromises)
        setProducts(prev => prev.map((p, i) => ({
          ...p,
          indicatorCount: counts[i]?.count || 0,
        })))
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

  const handleFtaConfigChange = (field: keyof FTAConfig, value: string | number) => {
    setFtaConfig(prev => ({ ...prev, [field]: value }))
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
      } else if (instrumentInfo.type === 'fta') {
        result = await api.testFTAConnection(ftaConfig)
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
      } else if (instrumentInfo.type === 'fta') {
        result = await api.updateFTAConfig({ ...ftaConfig })
      } else {
        result = await api.updateDBConfig({ ...dbConfig, enabled: true })
      }

      if (result?.success) {
        setSaveResult({ success: true, message: '配置已保存，正在连接数据源...' })

        // Switch instrument immediately so collector is ready before preview/import
        const switchResult = await api.switchInstrument(currentInstrument, initLimit)
        if (switchResult?.success) {
          setSaveResult({ success: true, message: '数据源已连接，正在获取预览...' })
        } else {
          setSaveResult({ success: false, message: switchResult?.message || '数据源连接失败' })
        }

        // Fetch init status for preview dialog (all instrument types)
        let status: any = null
        try {
          if (instrumentInfo.type === 'mdb') {
            status = await api.getMDBInitStatus()
          } else if (instrumentInfo.type === 'fta') {
            status = await api.getFTAInitStatus()
          } else {
            status = await api.getDbInitStatus()
          }
        } catch {
          // ignore
        }

        if (status?.success) {
          setInitStatus(status)
          setShowConfirmDialog(true)
          setSaveResult({ success: true, message: '配置已保存，请确认数据源信息' })
        } else {
          // Preview failed, but instrument is already switched — collect directly
          try {
            const collectResult = await api.manualCollect()
            if (collectResult?.status === 'success') {
              const n = collectResult.new_records || 0
              setSaveResult({ success: true, message: `已切换到 ${currentInstrument.toUpperCase()} 数据源，首次采集 ${n} 条数据` })
            } else {
              setSaveResult({ success: true, message: `已切换到 ${currentInstrument.toUpperCase()} 数据源，首次采集将在后台自动进行` })
            }
          } catch {
            setSaveResult({ success: true, message: `已切换到 ${currentInstrument.toUpperCase()} 数据源` })
          }
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
    setImporting(true)
    setImportProgress({ current: 0, total: initLimit, elapsed: 0 })
    const startTime = Date.now()
    try {
      // Auto-match products from preview if available
      if (initStatus?.recent_records) {
        await fetchProducts()
        const mdbProducts = initStatus.recent_records.reduce((acc, record) => {
          if (!acc.find(p => p.name === record.product_name)) {
            acc.push({ name: record.product_name, code: record.product_name })
          }
          return acc
        }, [] as Array<{ name: string; code: string }>)

        handleAutoMatchProducts(mdbProducts)
      }

      // Instrument is already switched in handleSaveConfig — just collect
      setCollectResult({ success: true, message: '正在采集数据...' })
      const collectResult = await Promise.race([
        api.manualCollect(),
        new Promise((_, reject) => setTimeout(() => reject(new Error('采集超时（60秒）')), 60000))
      ])
      
      if (collectResult?.status === 'success') {
        const newRecords = collectResult.new_records || 0
        setImportProgress({ current: newRecords, total: initLimit, elapsed: Math.floor((Date.now() - startTime) / 1000) })
        setCollectResult({
          success: true,
          message: `采集成功！新增 ${newRecords} 条数据`
        })
        // Snapshot product indicators (one-time per initialization)
        try {
          const snapshot = await api.snapshotProductIndicators()
          if (snapshot?.mapping) {
            setSavedIndicators(snapshot.mapping)
          }
        } catch {}
        // Refresh products after collection
        await fetchProducts()
        // Brief delay to show completion before hiding overlay
        await new Promise(r => setTimeout(r, 1500))
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
      setImporting(false)
    }
  }

  const handleCancelConfirm = () => {
    setShowConfirmDialog(false)
    setInitStatus(null)
    setInitLimit(100)
  }

  const handleEditProduct = async (product: ProductItem) => {
    setEditingProduct(product)
    setNewProduct({ name: product.name, code: product.code, status: product.status })
    setProductAlias(productAliases[product.code] || '')

    // Load per-product spec limits from backend
    let savedLimits: Record<string, { lsl?: number; usl?: number; target?: number }> = {}
    try {
      savedLimits = await api.getSpecLimits(product.code)
    } catch {
      // use empty
    }

    // Use saved indicator codes (from initialization snapshot)
    const indicatorsWithData = new Set<string>(savedIndicators[product.code] || [])

    // Initialize indicator specs - only enable indicators with data or saved limits
    setIndicatorSpecs(availableIndicators.map(ind => {
      const limits = savedLimits[ind.code]
      const hasData = indicatorsWithData.has(ind.code)
      const hasLimits = limits && (limits.usl !== undefined || limits.lsl !== undefined)
      return {
        indicator_code: ind.code,
        indicator_name: ind.name,
        enabled: hasData || hasLimits,
        usl: limits?.usl?.toString() || '',
        lsl: limits?.lsl?.toString() || '',
        target: limits?.target?.toString() || '',
        unit: ''
      }
    }))

    // Load category and prediction config
    setSelectedCategory(productCategories[product.code] || '')
    const prodPred = predictionConfig[product.code] || {} as Record<string, { source_indicator: string; coefficient: number; enabled: boolean; alert_threshold?: number; alert_enabled?: boolean; usl?: number | null; lsl?: number | null; target?: number | null; unit?: string | null }>
    const satFatCfg = prodPred.saturated_fat
    setPredictSaturatedFat(satFatCfg?.enabled || false)
    if (satFatCfg?.coefficient != null) {
      setPredCoefficient(satFatCfg.coefficient.toString())
    } else if (productCategories[product.code] && predictionCategories[productCategories[product.code]]) {
      setPredCoefficient(predictionCategories[productCategories[product.code]].k.toFixed(4))
    } else {
      setPredCoefficient('')
    }
    // Load alert settings
    setAlertEnabled(satFatCfg?.alert_enabled ?? false)
    setAlertThreshold(satFatCfg?.alert_threshold != null ? (satFatCfg.alert_threshold * 100).toString() : '10')
    setPredictionMethod((satFatCfg as any)?.prediction_method || 'linear')
    // Load prediction spec limits
    setPredUsl(satFatCfg?.usl?.toString() || '')
    setPredLsl(satFatCfg?.lsl?.toString() || '')
    setPredTarget(satFatCfg?.target?.toString() || '')
    setPredUnit(satFatCfg?.unit || '')

    setShowProductDialog(true)
  }

  const handleSaveProduct = async () => {
    if (!newProduct.name || !newProduct.code) {
      addToast({ title: '提示', message: '请填写品项名称和编码', severity: 'WARNING' })
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

    // Save product alias
    try {
      await api.updateProductAlias(newProduct.code, productAlias)
      setProductAliases(prev => {
        const next = { ...prev }
        if (productAlias) {
          next[newProduct.code] = productAlias
        } else {
          delete next[newProduct.code]
        }
        return next
      })
    } catch (e) {
      console.error('保存品项别名失败:', e)
    }

    // Save enabled indicator codes for this product
    const enabledCodes = indicatorSpecs.filter(s => s.enabled).map(s => s.indicator_code)
    try {
      await api.updateSavedIndicators(newProduct.code, enabledCodes)
      setSavedIndicators(prev => ({ ...prev, [newProduct.code]: enabledCodes }))
    } catch (e) {
      console.error('保存品项指标失败:', e)
    }

    // Persist spec limits to backend
    // 保存所有启用的指标（包括用户清空值的情况，以便删除之前保存的规格限）
    const enabledSpecs = indicatorSpecs
      .filter(s => s.enabled)
      .map(s => ({
        id: `${newProduct.code}-${s.indicator_code}`,
        product: newProduct.code,
        indicator: s.indicator_name,
        indicator_code: s.indicator_code,
        usl: s.usl != null && s.usl !== '' ? parseFloat(s.usl as string) : undefined,
        lsl: s.lsl != null && s.lsl !== '' ? parseFloat(s.lsl as string) : undefined,
        target: s.target != null && s.target !== '' ? parseFloat(s.target as string) : undefined,
        unit: s.unit
      }))

    // Update local specs state
    setSpecs(prev => [
      ...prev.filter(s => s.product !== newProduct.code),
      ...enabledSpecs.filter(s => s.usl != null || s.lsl != null).map(s => ({
        ...s,
        usl: s.usl ?? 0,
        lsl: s.lsl ?? 0,
        target: s.target ?? 0,
      }))
    ])

    // Save each indicator's spec limits to backend (per-product)
    const productLimits: Record<string, { lsl?: number; usl?: number; target?: number }> = {}
    for (const spec of enabledSpecs) {
      try {
        const limits: { lsl?: number; usl?: number; target?: number; product_code: string } = { product_code: newProduct.code }
        if (spec.lsl != null && spec.lsl) limits.lsl = spec.lsl
        if (spec.usl != null && spec.usl) limits.usl = spec.usl
        if (spec.target != null && spec.target) limits.target = spec.target
        await api.updateSingleSpecLimit(spec.indicator_code, limits)
        if (spec.lsl != null || spec.usl != null) {
          productLimits[spec.indicator_code] = { lsl: limits.lsl, usl: limits.usl, target: limits.target }
        }
      } catch (e) {
        console.error(`保存指标 ${spec.indicator_code} 规格限失败:`, e)
      }
    }
    setSavedSpecLimits(prev => ({ ...prev, [newProduct.code]: productLimits }))

    // Save product category
    try {
      await api.updateProductCategory(newProduct.code, selectedCategory)
      setProductCategories(prev => ({ ...prev, [newProduct.code]: selectedCategory }))
    } catch (e) {
      console.error('保存产品类别失败:', e)
    }

    // Save prediction config (source→target with user-configured coefficient)
    const predIndicators: Record<string, { source_indicator: string; coefficient: number; enabled: boolean; prediction_method?: string; product_category?: string; alert_threshold?: number; alert_enabled?: boolean; usl?: number | null; lsl?: number | null; target?: number | null; unit?: string | null }> = {}
    if (predictSaturatedFat) {
      predIndicators.saturated_fat = {
        source_indicator: 'fat',
        coefficient: parseFloat(predCoefficient) || 0.6278,
        enabled: true,
        prediction_method: predictionMethod,
        product_category: selectedCategory || '',
        alert_enabled: alertEnabled,
        alert_threshold: parseFloat(alertThreshold) / 100 || 0.10,
        usl: predUsl !== '' ? parseFloat(predUsl) : null,
        lsl: predLsl !== '' ? parseFloat(predLsl) : null,
        target: predTarget !== '' ? parseFloat(predTarget) : null,
        unit: predUnit || null,
      }
    }
    try {
      await api.updatePredictionConfig(newProduct.code, predIndicators)
      setPredictionConfig(prev => ({ ...prev, [newProduct.code]: predIndicators }))
    } catch (e) {
      console.error('保存预测配置失败:', e)
    }

    setShowProductDialog(false)
  }

  const confirmDeleteProduct = () => {
    setProducts(prev => prev.filter(p => p.id !== deleteConfirm.productId))
    setDeleteConfirm({ show: false, productId: '' })
  }

  const handleAddExcludedRemark = async () => {
    const keyword = newRemarkKeyword.trim()
    if (!keyword || excludedRemarks.includes(keyword)) return
    const updated = [...excludedRemarks, keyword]
    setExcludedRemarks(updated)
    setNewRemarkKeyword('')
    try { await api.updateExcludedRemarks(updated) } catch (e) { console.error('保存失败:', e) }
  }

  const handleRemoveExcludedRemark = async (keyword: string) => {
    const updated = excludedRemarks.filter(k => k !== keyword)
    setExcludedRemarks(updated)
    try { await api.updateExcludedRemarks(updated) } catch (e) { console.error('保存失败:', e) }
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
          <input
            type="text"
            className={styles.formInput}
            value={productSearch}
            onChange={e => setProductSearch(e.target.value)}
            placeholder="搜索品项名称或编码..."
            style={{ width: '200px', padding: '4px 10px', fontSize: '12px', marginLeft: 'auto' }}
          />
        </div>
        <div className={styles.cardBody}>
          <table className={styles.table}>
            <thead>
              <tr>
                <th>品项名称</th>
                <th>编码</th>
                <th>样品类别</th>
                <th>监测指标数</th>
                <th>规格限 (USL/LSL)</th>
                <th>状态</th>
                <th>操作</th>
              </tr>
            </thead>
            <tbody>
              {products.filter(p => {
                if (!productSearch.trim()) return true
                const q = productSearch.trim().toLowerCase()
                return p.name.toLowerCase().includes(q) || p.code.toLowerCase().includes(q)
              }).map(p => (
                <tr key={p.id}>
                  <td className={styles.tableCellPrimary}>{p.name}</td>
                  <td className={styles.tableCellMono}>{p.code}</td>
                  <td>
                    {productCategories[p.code]
                      ? (predictionCategories[productCategories[p.code]]?.name || productCategories[p.code])
                      : <span style={{ color: 'var(--text-muted)' }}>未配置</span>}
                  </td>
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
                  </td>
                </tr>
              ))}
            </tbody>
          </table>
        </div>
      </div>

      {/* ── 排除备注关键词 ─────────────────────── */}
      <div className={styles.card} style={{ marginBottom: '20px' }}>
        <div className={styles.cardHeader}>
          <span className={styles.cardTitle}>
            <span className={styles.cardTitleDot} />
            排除备注关键词
          </span>
          <span className={styles.cardHint}>包含这些关键词的备注数据不参与SPC/过程能力计算</span>
        </div>
        <div className={styles.remarksSection}>
          <div className={styles.remarksChips}>
            {excludedRemarks.length === 0 && (
              <span className={styles.remarksEmpty}>暂无排除关键词</span>
            )}
            {excludedRemarks.map(kw => (
              <span key={kw} className={styles.tagChip}>
                {kw}
                <button className={styles.tagChipRemove} onClick={() => handleRemoveExcludedRemark(kw)}>×</button>
              </span>
            ))}
          </div>
          <div className={styles.remarksInputRow}>
            <input
              className={styles.formInput}
              placeholder="输入关键词（如：基准样）"
              value={newRemarkKeyword}
              onChange={e => setNewRemarkKeyword(e.target.value)}
              onKeyDown={e => { if (e.key === 'Enter') handleAddExcludedRemark() }}
            />
            <button className={styles.btnSmall} onClick={handleAddExcludedRemark}>添加</button>
          </div>
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
            {frequencyStatus && (
              <span className={styles.freqBadge}>
                L{frequencyStatus.current_level} · {frequencyStatus.current_interval_minutes}min
              </span>
            )}
          </div>
          <div className={styles.cardBody} style={{ padding: '24px' }}>
            {frequencyStatus ? (
              <>
                <div style={{ fontSize: '12px', color: 'var(--text-muted)', marginBottom: '11px', textTransform: 'uppercase', letterSpacing: '0.5px' }}>
                  自适应降级阶梯
                </div>
                <div className={styles.freqLadder}>
                  {(frequencyStatus.frequency_ladder || []).map((freq: number, idx: number) => {
                    const isActive = idx === frequencyStatus.current_level
                    const isPast = idx < frequencyStatus.current_level
                    return (
                      <React.Fragment key={idx}>
                        {idx > 0 && (
                          <div className={`${styles.freqConnector} ${isPast || isActive ? styles.freqConnectorActive : ''}`} />
                        )}
                        <div className={`${styles.freqStep} ${isActive ? styles.freqStepActive : ''} ${isPast ? styles.freqStepPast : ''}`}>
                          <div className={styles.freqStepDot}>
                            {isActive && <div className={styles.freqStepPulse} />}
                          </div>
                          <div className={styles.freqStepLabel}>L{idx}</div>
                          <div className={styles.freqStepValue}>{freq}min</div>
                        </div>
                      </React.Fragment>
                    )
                  })}
                </div>

                <div className={styles.freqInfo}>
                  <div className={styles.freqInfoTitle}>降级策略</div>
                  <div className={styles.freqInfoGrid}>
                    <div className={styles.freqInfoItem}>
                      <div className={styles.freqInfoIcon}>
                        <svg width="16" height="16" viewBox="0 0 24 24" fill="none" stroke="var(--accent-cyan)" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round">
                          <polyline points="23 6 13.5 15.5 8.5 10.5 1 18" /><polyline points="17 6 23 6 23 12" />
                        </svg>
                      </div>
                      <div>
                        <div className={styles.freqInfoLabel}>默认频率</div>
                        <div className={styles.freqInfoDesc}>每 5 分钟采集一次数据</div>
                      </div>
                    </div>
                    <div className={styles.freqInfoItem}>
                      <div className={styles.freqInfoIcon}>
                        <svg width="16" height="16" viewBox="0 0 24 24" fill="none" stroke="var(--accent-orange)" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round">
                          <polyline points="23 18 13.5 8.5 8.5 13.5 1 6" /><polyline points="17 18 23 18 23 12" />
                        </svg>
                      </div>
                      <div>
                        <div className={styles.freqInfoLabel}>自动降级</div>
                        <div className={styles.freqInfoDesc}>连续无数据时逐步降低采集频率</div>
                      </div>
                    </div>
                    <div className={styles.freqInfoItem}>
                      <div className={styles.freqInfoIcon}>
                        <svg width="16" height="16" viewBox="0 0 24 24" fill="none" stroke="var(--accent-green)" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round">
                          <polyline points="1 4 1 10 7 10" /><path d="M3.51 15a9 9 0 1 0 2.13-9.36L1 10" />
                        </svg>
                      </div>
                      <div>
                        <div className={styles.freqInfoLabel}>自动恢复</div>
                        <div className={styles.freqInfoDesc}>采集到新数据后立即恢复至 L0</div>
                      </div>
                    </div>
                  </div>
                </div>
              </>
            ) : (
              <div style={{ color: 'var(--text-muted)', padding: '20px 0', textAlign: 'center' }}>加载中...</div>
            )}
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
                        aria-pressed={rule.enabled}
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
                {instrument.type === 'mock' ? '模拟数据' : instrument.type === 'mdb' ? 'MDB 文件' : instrument.type === 'fta' ? 'FTA SQL Server' : 'FT1 SQL Server'}
              </span>
            </button>
          ))}
        </div>
      </div>

      {/* ── FT1 SQL Server Configuration ── */}
      {currentInstrument === 'ft1' && (
        <div className={styles.dbConfigSection}>
          <div className={styles.dbConfigHeader}>
            <span className={styles.dbConfigTitle}>
              <span className={styles.cardTitleDot} />
              FT1 乳品分析仪 — 数据库配置
            </span>
            <StatusTag label="FT1" color="blue" />
          </div>

          <div className={styles.dbConfigForm} role="group" aria-label="FT1 数据库配置">
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
                  aria-label="服务器地址"
                />
                <span className={styles.formHint}>格式: 主机名\实例名,端口（FT1 专用 SQL Server 实例）</span>
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
                  aria-label="数据库名称"
                />
                <span className={styles.formHint}>FT1 默认数据库: MSCFT1</span>
              </div>
            </div>

            <div className={styles.formRow}>
              <div className={styles.formGroup}>
                <label className={styles.formLabel}>认证方式</label>
                <select
                  className={styles.formSelect}
                  value={dbConfig.auth_type}
                  onChange={e => handleDbConfigChange('auth_type', e.target.value)}
                  aria-label="认证方式"
                >
                  <option value="windows">Windows 认证 (SSPI)</option>
                  <option value="sql">SQL Server 认证</option>
                </select>
              </div>
              <div className={styles.formGroup}>
                <label className={styles.formLabel}>数据库驱动</label>
                <select
                  className={styles.formSelect}
                  value={dbConfig.driver}
                  onChange={e => handleDbConfigChange('driver', e.target.value)}
                  aria-label="数据库驱动"
                >
                  <option value="pymssql">pymssql（无需安装驱动）</option>
                </select>
              </div>
            </div>

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
                    aria-label="用户名"
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
                    aria-label="密码"
                  />
                </div>
              </div>
            )}

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
                  aria-label="连接超时（秒）"
                />
              </div>
            </div>

            <div className={styles.formHint} style={{ margin: '8px 0 12px', padding: '8px 12px', background: 'var(--bg-secondary, #f8f9fa)', borderRadius: 6, fontSize: 13 }}>
              <strong>FT1 数据库结构:</strong> 支持两种模式 — <b>四表关联</b>（Sample、Product、Component、Prediction）和<b>单表宽表</b>模式，具体映射通过字段映射配置文件定义
            </div>

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

      {/* ── FTA (Perten) SQL Server Configuration ── */}
      {currentInstrument === 'fta' && (
        <div className={styles.dbConfigSection}>
          <div className={styles.dbConfigHeader}>
            <span className={styles.dbConfigTitle}>
              <span className={styles.cardTitleDot} />
              FTA (Perten) 乳品分析仪 — 数据库配置
            </span>
            <StatusTag label="FTA (Perten)" color="orange" />
          </div>

          <div className={styles.dbConfigForm} role="group" aria-label="FTA 数据库配置">
            <div className={styles.formRow}>
              <div className={styles.formGroup}>
                <label className={styles.formLabel}>
                  服务器地址
                  <span className={styles.formRequired}>*</span>
                </label>
                <input
                  type="text"
                  className={styles.formInput}
                  value={ftaConfig.server}
                  onChange={e => handleFtaConfigChange('server', e.target.value)}
                  placeholder="例: XTZJ-20230331ga\Perten,1433"
                  aria-label="服务器地址"
                />
                <span className={styles.formHint}>格式: 主机名\实例名,端口（Perten 专用 SQL Server 实例）</span>
              </div>
              <div className={styles.formGroup}>
                <label className={styles.formLabel}>
                  数据库名称
                  <span className={styles.formRequired}>*</span>
                </label>
                <input
                  type="text"
                  className={styles.formInput}
                  value={ftaConfig.database}
                  onChange={e => handleFtaConfigChange('database', e.target.value)}
                  placeholder="例: Pert_Application"
                  aria-label="数据库名称"
                />
                <span className={styles.formHint}>FTA 默认数据库: Pert_Application</span>
              </div>
            </div>

            <div className={styles.formRow}>
              <div className={styles.formGroup}>
                <label className={styles.formLabel}>认证方式</label>
                <select
                  className={styles.formSelect}
                  value={ftaConfig.auth_type}
                  onChange={e => handleFtaConfigChange('auth_type', e.target.value)}
                  aria-label="认证方式"
                >
                  <option value="sql">SQL Server 认证</option>
                  <option value="windows">Windows 认证 (SSPI)</option>
                </select>
              </div>
              <div className={styles.formGroup}>
                <label className={styles.formLabel}>数据库驱动</label>
                <select
                  className={styles.formSelect}
                  value={ftaConfig.driver}
                  onChange={e => handleFtaConfigChange('driver', e.target.value)}
                  aria-label="数据库驱动"
                >
                  <option value="pymssql">pymssql（无需安装驱动）</option>
                </select>
              </div>
            </div>

            {ftaConfig.auth_type === 'sql' && (
              <div className={styles.formRow}>
                <div className={styles.formGroup}>
                  <label className={styles.formLabel}>
                    用户名
                    <span className={styles.formRequired}>*</span>
                  </label>
                  <input
                    type="text"
                    className={styles.formInput}
                    value={ftaConfig.username}
                    onChange={e => handleFtaConfigChange('username', e.target.value)}
                    placeholder="SQL Server 登录用户名"
                    aria-label="用户名"
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
                    value={ftaConfig.password}
                    onChange={e => handleFtaConfigChange('password', e.target.value)}
                    placeholder="SQL Server 登录密码"
                    aria-label="密码"
                  />
                </div>
              </div>
            )}

            <div className={styles.formRow}>
              <div className={styles.formGroup}>
                <label className={styles.formLabel}>连接超时 (秒)</label>
                <input
                  type="number"
                  className={styles.formInput}
                  value={ftaConfig.timeout}
                  onChange={e => handleFtaConfigChange('timeout', parseInt(e.target.value) || 30)}
                  min="5"
                  max="120"
                  aria-label="连接超时（秒）"
                />
              </div>
            </div>

            <div className={styles.formHint} style={{ margin: '8px 0 12px', padding: '8px 12px', background: 'var(--bg-secondary, #f8f9fa)', borderRadius: 6, fontSize: 13 }}>
              <strong>FTA 数据库结构:</strong> EstimateEvent（样本事件）、Estimate（测量结果）、AnalysisParameter（指标定义）、Product（产品）
            </div>

            <div className={styles.formActions}>
              <button
                className={`${styles.btn} ${styles.btnSecondary}`}
                onClick={handleTestConnection}
                disabled={configLoading || !ftaConfig.server || !ftaConfig.database}
              >
                {configLoading ? '测试中...' : '测试连接'}
              </button>
              <button
                className={`${styles.btn} ${styles.btnPrimary}`}
                onClick={handleSaveConfig}
                disabled={configLoading || !ftaConfig.server || !ftaConfig.database}
              >
                {configLoading ? '保存中...' : '保存配置'}
              </button>
            </div>

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

          <div className={styles.dbConfigForm} role="group" aria-label="MDB 文件配置">
            {/* Row 1: MDB File Path */}
            <div className={styles.formRow}>
              <div className={styles.formGroup}>
                <label className={styles.formLabel}>
                  MDB 文件路径
                  <span className={styles.formRequired}>*</span>
                </label>
                <div style={{ display: 'flex', gap: '8px' }}>
                  <input
                    type="text"
                    className={styles.formInput}
                    style={{ flex: 1 }}
                    value={mdbConfig.mdb_path}
                    onChange={e => handleMdbConfigChange('mdb_path', e.target.value)}
                    placeholder="例: /mnt/d/数据/ft120.mdb 或 C:\Data\ft120.mdb"
                    aria-label="MDB 文件路径"
                  />
                  {window.__TAURI__ && (
                    <label className={`${styles.btn} ${styles.btnSecondary}`} style={{ cursor: 'pointer', whiteSpace: 'nowrap', margin: 0 }}
                      onClick={async (e) => {
                        e.preventDefault();
                        try {
                          const { open } = window.__TAURI__.dialog;
                          const path = await open({
                            filters: [{ name: 'MDB Files', extensions: ['mdb', 'accdb'] }],
                            multiple: false,
                          });
                          if (path) {
                            handleMdbConfigChange('mdb_path', path as string);
                          }
                        } catch (err) {
                          console.warn('Tauri dialog failed', err);
                        }
                      }}
                    >
                      <svg width="14" height="14" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round">
                        <path d="M22 19a2 2 0 0 1-2 2H4a2 2 0 0 1-2-2V5a2 2 0 0 1 2-2h5l2 3h9a2 2 0 0 1 2 2z" />
                      </svg>
                      浏览
                    </label>
                  )}
                </div>
                <span className={styles.formHint}>支持本地 .mdb 文件</span>
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
                  aria-label="样本表名"
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
                  aria-label="产品表名"
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
                  aria-label="组件/指标表名"
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
                  aria-label="预测/结果表名"
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
                  aria-label="时间列名"
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
                  aria-label="产品引用列名"
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
                  aria-label="产品名称列名"
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
                  aria-label="组件引用列名"
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
                  aria-label="组件名称列名"
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
                  aria-label="测量值列名"
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
          <div className={styles.confirmDialog} role="dialog" aria-modal="true" aria-label="数据源确认">
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

              {/* Import Limit */}
              {!initStatus.breakpoint && (
                <div className={styles.confirmSection}>
                  <h4>初始导入数量</h4>
                  <div style={{ display: 'flex', alignItems: 'center', gap: 12, padding: '8px 0' }}>
                    <input
                      type="range"
                      min={10}
                      max={1000}
                      step={10}
                      value={initLimit}
                      onChange={e => setInitLimit(Number(e.target.value))}
                      style={{ flex: 1 }}
                      aria-label="初始导入数量"
                    />
                    <input
                      type="number"
                      min={1}
                      max={1000}
                      value={initLimit}
                      onChange={e => setInitLimit(Math.max(1, Math.min(1000, Number(e.target.value) || 1)))}
                      style={{ width: 70, textAlign: 'center', background: 'rgba(255,255,255,0.05)', border: '1px solid rgba(255,255,255,0.1)', borderRadius: 6, color: '#e2e8f0', padding: '4px 8px' }}
                      aria-label="导入数量"
                    />
                    <span style={{ color: '#8b95a7', fontSize: 12, minWidth: 30 }}>条</span>
                  </div>
                  <p style={{ color: '#64748b', fontSize: 11, marginTop: 4 }}>
                    首次导入将从最新数据开始，最多 {initStatus.total_samples} 条可用
                  </p>
                </div>
              )}

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
                      {(initStatus.recent_records || []).slice(0, 10).map((record, index) => (
                        <tr key={index}>
                          <td>{record.product_name}</td>
                          <td>{record.indicator_name}</td>
                          <td>{Number(record.value).toFixed(4)}</td>
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

      {/* ── Import Progress Overlay ── */}
      {importing && (
        <div className={styles.confirmOverlay} style={{ zIndex: 10001 }}>
          <div style={{
            background: 'rgba(10,14,26,0.95)',
            backdropFilter: 'blur(20px)',
            borderRadius: 16,
            padding: '40px 48px',
            textAlign: 'center',
            minWidth: 360,
          }}>
            <div style={{
              width: 48, height: 48, margin: '0 auto 20px',
              border: '3px solid rgba(0,212,255,0.15)',
              borderTopColor: '#00d4ff',
              borderRadius: '50%',
              animation: 'spin 1s linear infinite',
            }} />
            <div style={{ color: '#e2e8f0', fontSize: 16, fontWeight: 600, marginBottom: 8 }}>
              正在导入数据...
            </div>
            <div style={{ color: '#8b95a7', fontSize: 13, marginBottom: 16 }}>
              {collectResult?.message || '准备中...'}
            </div>
            {/* Progress bar */}
            <div style={{ width: '100%', height: 6, background: 'rgba(0,212,255,0.1)', borderRadius: 3, overflow: 'hidden', marginBottom: 12 }}>
              <div style={{
                height: '100%',
                width: importProgress.total > 0 ? `${Math.min(100, (importProgress.current / importProgress.total) * 100)}%` : '30%',
                background: 'linear-gradient(90deg, #00d4ff, #0066ff)',
                borderRadius: 3,
                transition: 'width 0.5s ease',
              }} />
            </div>
            <div style={{ display: 'flex', justifyContent: 'space-between', color: '#64748b', fontSize: 12 }}>
              <span>已导入: {importProgress.current} / {importProgress.total}</span>
              <span>耗时: {importProgress.elapsed}s</span>
            </div>
          </div>
        </div>
      )}

      {/* ── Delete Confirmation Dialog ── */}
      {deleteConfirm.show && (
        <div className={styles.confirmOverlay} onClick={() => setDeleteConfirm({ show: false, productId: '' })}>
          <div className={styles.confirmDialog} style={{ maxWidth: '400px' }} onClick={e => e.stopPropagation()} role="dialog" aria-modal="true" aria-label="删除确认">
            <div className={styles.confirmHeader}>
              <h3>确认删除</h3>
              <button className={styles.confirmClose} onClick={() => setDeleteConfirm({ show: false, productId: '' })}>×</button>
            </div>
            <div className={styles.confirmBody}>
              <p style={{ color: '#e2e8f0' }}>确定要删除这个品项吗？</p>
            </div>
            <div className={styles.confirmFooter}>
              <button
                className={`${styles.btn} ${styles.btnSecondary}`}
                onClick={() => setDeleteConfirm({ show: false, productId: '' })}
              >
                取消
              </button>
              <button
                className={`${styles.btn} ${styles.btnPrimary}`}
                style={{ background: '#ef4444' }}
                onClick={confirmDeleteProduct}
              >
                确认删除
              </button>
            </div>
          </div>
        </div>
      )}

      {/* ── Product Dialog ── */}
      {showProductDialog && (
        <div className={styles.confirmOverlay}>
          <div className={styles.confirmDialog} style={{ maxWidth: '820px' }} role="dialog" aria-modal="true" aria-label={editingProduct ? '编辑品项' : '新增品项'}>
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
                      aria-label="品项名称"
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
                      aria-label="品项编码"
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
                <div className={styles.formGroup} style={{ marginTop: '12px' }}>
                  <label className={styles.formLabel}>品项别名</label>
                  <input
                    type="text"
                    className={styles.formInput}
                    value={productAlias}
                    onChange={e => setProductAlias(e.target.value)}
                    placeholder="可选，配置后界面上显示此别名"
                    aria-label="品项别名"
                  />
                </div>
                <div className={styles.formGroup} style={{ marginTop: '12px' }}>
                  <label className={styles.formLabel}>样品类别</label>
                  <select
                    className={styles.formSelect}
                    value={selectedCategory}
                    onChange={e => {
                      const newCategory = e.target.value
                      setSelectedCategory(newCategory)
                      if (newCategory && predictionCategories[newCategory]) {
                        setPredCoefficient(predictionCategories[newCategory].k.toFixed(4))
                      }
                    }}
                  >
                    <option value="">-- 请选择 --</option>
                    {Object.entries(predictionCategories).map(([code, info]) => (
                      <option key={code} value={code}>{info.name}</option>
                    ))}
                  </select>
                  <div style={{ marginTop: '4px', fontSize: '11px', color: 'var(--text-muted)' }}>
                    选择类别后自动填入推荐系数，可在预测指标中手动修改
                  </div>
                </div>
              </div>

              {/* Indicator Selection & Spec Limits */}
              <div className={styles.confirmSection}>
                <h4>监测指标与规格限</h4>
                <div className={styles.confirmTableWrapper} style={{ maxHeight: '420px' }}>
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
                          <td className={styles.tableCellPrimary}>{indicatorAliases[spec.indicator_code] || spec.indicator_name}</td>
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
                              placeholder="g/100g"
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

              {/* Prediction Indicators */}
              <div className={styles.confirmSection}>
                <h4>预测指标</h4>
                <div style={{ padding: '8px 0' }}>
                  <div style={{ display: 'flex', alignItems: 'center', gap: '12px', marginBottom: '8px', flexWrap: 'wrap' }}>
                    <label style={{ display: 'flex', alignItems: 'center', gap: '8px', cursor: 'pointer' }}>
                      <input
                        type="checkbox"
                        checked={predictSaturatedFat}
                        onChange={e => setPredictSaturatedFat(e.target.checked)}
                      />
                      <span>饱和脂肪</span>
                    </label>
                    <span style={{ fontSize: '12px', color: 'var(--text-muted)' }}>
                      来源: 脂肪(fat) → 饱和脂肪(saturated_fat)
                    </span>
                  </div>

                  {predictSaturatedFat && (
                    <div style={{
                      marginTop: '4px', padding: '10px 12px', fontSize: '12px',
                      background: 'var(--bg-secondary)', borderRadius: '6px',
                      border: '1px solid var(--border-color)',
                    }}>
                      {/* 预测方式选择 */}
                      <div style={{ display: 'flex', alignItems: 'center', gap: '12px', marginBottom: '10px' }}>
                        <span style={{ fontSize: '12px', color: 'var(--text-secondary)' }}>预测方式:</span>
                        <label style={{ display: 'flex', alignItems: 'center', gap: '4px', cursor: 'pointer', fontSize: '12px' }}>
                          <input
                            type="radio"
                            name="predMethod"
                            checked={predictionMethod === 'linear'}
                            onChange={() => setPredictionMethod('linear')}
                          />
                          <span>线性公式 (k值)</span>
                        </label>
                        <label style={{ display: 'flex', alignItems: 'center', gap: '4px', cursor: 'pointer', fontSize: '12px' }}>
                          <input
                            type="radio"
                            name="predMethod"
                            checked={predictionMethod === 'random_forest'}
                            onChange={() => setPredictionMethod('random_forest')}
                          />
                          <span>随机森林 (M8)</span>
                        </label>
                      </div>
                      <div style={{ display: 'flex', alignItems: 'center', gap: '8px', marginBottom: '8px' }}>
                        <span>预测系数 (k):</span>
                        <input
                          type="number"
                          step="0.0001"
                          className={styles.formInput}
                          style={{ width: '100px', padding: '4px 8px' }}
                          value={predCoefficient}
                          onChange={e => setPredCoefficient(e.target.value)}
                          placeholder="例: 0.6278"
                        />
                        {selectedCategory && predictionCategories[selectedCategory] && (
                          <button
                            className={styles.btnEdit}
                            style={{ fontSize: '11px', padding: '2px 8px' }}
                            onClick={() => setPredCoefficient(predictionCategories[selectedCategory].k.toFixed(4))}
                          >
                            恢复默认
                          </button>
                        )}
                      </div>
                      {predictionMethod === 'linear' ? (
                        <div style={{ color: 'var(--text-muted)' }}>
                          公式: 饱和脂肪 = 脂肪 × {predCoefficient || '____'}
                          {selectedCategory && predictionCategories[selectedCategory] && (
                            <span> (类别推荐值: {predictionCategories[selectedCategory].k.toFixed(4)})</span>
                          )}
                        </div>
                      ) : (
                        <div style={{ color: 'var(--text-muted)' }}>
                          模型: M8随机森林 (脂肪 + 蛋白质 + 酸度 + 品项 + 季节)
                          <br />
                          <span style={{ fontSize: '11px' }}>精度: MAPE≈2.4%, R²≈0.9946 | 蛋白质/酸度缺失时自动降级为线性公式</span>
                        </div>
                      )}
                      <div style={{ color: 'var(--text-muted)', marginTop: '4px' }}>
                        系数值可在帮助说明页面查阅参考
                      </div>

                      {/* Prediction Spec Limits - Editable */}
                      <div style={{
                        marginTop: '10px', padding: '8px 10px',
                        background: 'var(--bg-primary)', borderRadius: '4px',
                        border: '1px dashed var(--border-color)',
                      }}>
                        <div style={{ fontWeight: 500, marginBottom: '8px' }}>规格限与目标值</div>
                        <div style={{ display: 'flex', gap: '12px', flexWrap: 'wrap', alignItems: 'center' }}>
                          <label style={{ display: 'flex', alignItems: 'center', gap: '4px', fontSize: '12px' }}>
                            <span>USL:</span>
                            <input
                              type="number"
                              className={styles.formInput}
                              style={{ width: '80px', padding: '4px 8px' }}
                              value={predUsl}
                              onChange={e => setPredUsl(e.target.value)}
                              placeholder="-"
                            />
                          </label>
                          <label style={{ display: 'flex', alignItems: 'center', gap: '4px', fontSize: '12px' }}>
                            <span>LSL:</span>
                            <input
                              type="number"
                              className={styles.formInput}
                              style={{ width: '80px', padding: '4px 8px' }}
                              value={predLsl}
                              onChange={e => setPredLsl(e.target.value)}
                              placeholder="-"
                            />
                          </label>
                          <label style={{ display: 'flex', alignItems: 'center', gap: '4px', fontSize: '12px' }}>
                            <span>目标值:</span>
                            <input
                              type="number"
                              className={styles.formInput}
                              style={{ width: '80px', padding: '4px 8px' }}
                              value={predTarget}
                              onChange={e => setPredTarget(e.target.value)}
                              placeholder="-"
                            />
                          </label>
                          <label style={{ display: 'flex', alignItems: 'center', gap: '4px', fontSize: '12px' }}>
                            <span>单位:</span>
                            <input
                              type="text"
                              className={styles.formInput}
                              style={{ width: '60px', padding: '4px 8px' }}
                              value={predUnit}
                              onChange={e => setPredUnit(e.target.value)}
                              placeholder="g/100g"
                            />
                          </label>
                        </div>
                      </div>

                      {/* Alert Configuration */}
                      <div style={{
                        marginTop: '10px', padding: '8px 10px',
                        background: 'var(--bg-primary)', borderRadius: '4px',
                        border: '1px dashed var(--border-color)',
                      }}>
                        <div style={{ display: 'flex', alignItems: 'center', gap: '12px', marginBottom: '8px' }}>
                          <label style={{ display: 'flex', alignItems: 'center', gap: '8px', cursor: 'pointer' }}>
                            <input
                              type="checkbox"
                              checked={alertEnabled}
                              onChange={e => setAlertEnabled(e.target.checked)}
                            />
                            <span style={{ fontWeight: 500 }}>启用报警</span>
                          </label>
                        </div>
                        {alertEnabled && (
                          <div style={{ display: 'flex', alignItems: 'center', gap: '8px' }}>
                            <span>报警阈值:</span>
                            <input
                              type="number"
                              min="1"
                              max="100"
                              className={styles.formInput}
                              style={{ width: '80px', padding: '4px 8px' }}
                              value={alertThreshold}
                              onChange={e => setAlertThreshold(e.target.value)}
                              placeholder="10"
                            />
                            <span>%</span>
                            <span style={{ fontSize: '11px', color: 'var(--text-muted)' }}>
                              (预测值偏离规格限时触发报警)
                            </span>
                          </div>
                        )}
                      </div>
                    </div>
                  )}
                  <div style={{ marginTop: '8px', fontSize: '11px', color: 'var(--text-muted)' }}>
                    预测类型: 交叉预测（通过已有指标预测关联指标）
                  </div>
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
export default ConfigPage
