import axios from 'axios'
import type {
  DashboardData,
  SPCData,
  CapabilityData,
  SchedulerStatus,
  Product,
  Indicator,
  Config,
  DBConfig,
  FieldMapping,
  Alert,
  MDBConfig,
  InstrumentConfig,
} from '../types'

const isTauri = '__TAURI__' in window
const http = axios.create({
  baseURL: isTauri ? 'http://127.0.0.1:18080/api' : '/api',
  timeout: 120000,
})

// API key authentication – read from Tauri launcher, localStorage, or default
const DEFAULT_API_KEY = 'ft1-monitor-default-key'
let apiKey: string
try {
  apiKey = localStorage.getItem('ft1_api_key') || DEFAULT_API_KEY
} catch {
  apiKey = DEFAULT_API_KEY
}
http.defaults.headers.common['X-API-Key'] = apiKey

/** Initialize API key from Tauri launcher (call once at app startup) */
export async function initApiKey(): Promise<void> {
  if (!isTauri) return
  try {
    const { invoke } = await import('@tauri-apps/api/core')
    const key = await invoke<string>('get_api_key')
    if (key && key !== apiKey) {
      apiKey = key
      localStorage.setItem('ft1_api_key', key)
      http.defaults.headers.common['X-API-Key'] = key
    }
  } catch {
    // Tauri not available or command not found — keep current key
  }
}

export const api = {
  getDashboard: () => http.get<DashboardData>('/monitor/dashboard').then(r => r.data),
  getStatus: () => http.get<SchedulerStatus>('/monitor/status').then(r => r.data),
  manualCollect: () => http.post('/monitor/collect/manual').then(r => r.data),
  getProducts: () => http.get<{ products: Product[] }>('/monitor/products').then(r => r.data),
  getIndicators: () => http.get<{ indicators: Indicator[] }>('/monitor/indicators').then(r => r.data),
  getRecentData: (params: { indicator_code: string; product_code: string; limit?: number; date_from?: string; date_to?: string; remark?: string }, options?: { signal?: AbortSignal }) =>
    http.get('/monitor/data/recent', { params, signal: options?.signal }).then(r => r.data),
  getProductIndicatorCount: (productCode: string) =>
    http.get<{ count: number }>(`/monitor/products/${productCode}/indicator-count`).then(r => r.data),
  getProductIndicatorCodes: (productCode: string) =>
    http.get<{ codes: string[] }>(`/monitor/products/${productCode}/indicator-codes`).then(r => r.data),
  snapshotProductIndicators: () =>
    http.post<{ success: boolean; count: number; mapping: Record<string, string[]> }>('/monitor/products/snapshot-indicators').then(r => r.data),
  getSavedIndicators: () =>
    http.get<Record<string, string[]>>('/monitor/products/saved-indicators').then(r => r.data),
  updateSavedIndicators: (productCode: string, codes: string[]) =>
    http.put(`/monitor/products/saved-indicators/${productCode}`, { codes }).then(r => r.data),
  getSPCData: (productCode: string, indicatorCode: string, window?: number, filters?: { date_from?: string; date_to?: string; remark?: string }, mode?: string, chartType?: string, lambda_?: number, options?: { signal?: AbortSignal }) =>
    http.get<SPCData>(`/spc/${productCode}/${indicatorCode}`, { params: { window, ...filters, mode, chart_type: chartType, lambda_ }, signal: options?.signal }).then(r => r.data),
  getCapabilityData: (productCode: string, indicatorCode: string, window?: number, filters?: { date_from?: string; date_to?: string; remark?: string }, options?: { signal?: AbortSignal }) =>
    http.get<CapabilityData>(`/capability/${productCode}/${indicatorCode}`, { params: { window, ...filters }, signal: options?.signal }).then(r => r.data),
  getAlerts: (params?: { severity?: string; status?: string; product_code?: string; rule_type?: string; search?: string; date_from?: string; date_to?: string; page?: number; page_size?: number }) =>
    http.get<{ alerts: Alert[]; total: number; page: number; page_size: number }>('/alerts', { params }).then(r => r.data),
  getAlertCount: () =>
    http.get<{ CRITICAL: number; WARNING: number; INFO: number; total: number }>('/alerts/count').then(r => r.data),
  getAlertProducts: () =>
    http.get<{ products: string[] }>('/alerts/products').then(r => r.data),
  resolveAlert: (alertId: string, resolvedBy?: string, note?: string, action?: string) =>
    http.post(`/alerts/${alertId}/resolve`, { resolved_by: resolvedBy, note, action }).then(r => r.data),
  batchResolveAlerts: (alertIds: string[], resolvedBy?: string, note?: string, action?: string) =>
    http.post('/alerts/batch-resolve', { alert_ids: alertIds, resolved_by: resolvedBy, note, action }).then(r => r.data),
  getConfig: () => http.get<Config>('/config').then(r => r.data),
  updateConfig: (config: Partial<Config>) => http.put('/config', config).then(r => r.data),
  getDBConfig: () => http.get<DBConfig>('/config/db').then(r => r.data),
  updateDBConfig: (config: DBConfig) => http.put('/config/db', config).then(r => r.data),
  testDBConnection: (config: DBConfig) => http.post('/config/db/test', config).then(r => r.data),
  exploreDBStructure: (config: DBConfig) => http.post('/config/db/explore', config).then(r => r.data),
  getTableColumns: (tableName: string) => http.get(`/config/db/table/${tableName}/columns`).then(r => r.data),
  updateFieldMapping: (mapping: FieldMapping) => http.put('/config/db/mapping', mapping).then(r => r.data),
  getFieldMapping: () => http.get<FieldMapping>('/config/db/mapping').then(r => r.data),
  getPrediction: (product: string, indicator: string, model: string, horizon: number, options?: { signal?: AbortSignal }) =>
    http.get(`/predict/forecast`, { params: { product, indicator, model, horizon }, signal: options?.signal }).then(r => r.data),
  switchDataSource: (source: 'mock' | 'sqlserver') =>
    http.post(`/config/source/switch`, { source }).then(r => r.data),
  getDataSourceStatus: () =>
    http.get(`/config/source/status`).then(r => r.data),
  getDataList: (params: { page?: number; page_size?: number; date?: string; product_code?: string; indicator_code?: string; date_from?: string; date_to?: string }, options?: { signal?: AbortSignal }) =>
    http.get('/data/list', { params, signal: options?.signal }).then(r => r.data),
  exportData: async (params: { format: string; product?: string; indicator?: string }) => {
    const response = await http.get(`/data/export`, { params, responseType: 'blob' })
    if (response.data instanceof Blob && response.data.type === 'application/json') {
      const text = await response.data.text()
      const json = JSON.parse(text)
      if (!json.success) throw new Error(json.message || '导出失败')
    }
    return response.data
  },
  updateDataCorrection: (recordId: number, correction: number) =>
    http.put(`/data/correction/${recordId}`, { correction }).then(r => r.data),
  updateDataRecord: (recordId: number, fields: { unit?: string; upper_limit?: number; lower_limit?: number }) =>
    http.put(`/data/record/${recordId}`, fields).then(r => r.data),
  voidDataRecord: (recordId: number) =>
    http.post(`/data/void/${recordId}`).then(r => r.data),
  unvoidDataRecord: (recordId: number) =>
    http.post(`/data/unvoid/${recordId}`).then(r => r.data),
  
  // Instrument configuration
  getInstrumentConfig: () => http.get<InstrumentConfig>('/config/instrument').then(r => r.data),
  updateInstrumentConfig: (config: InstrumentConfig) => http.put('/config/instrument', config).then(r => r.data),
  switchInstrument: (instrumentId: string, initLimit?: number) =>
    http.post('/config/instrument/switch', { instrument_id: instrumentId, init_limit: initLimit ?? 100 }).then(r => r.data),
  
  // MDB configuration
  getMDBConfig: () => http.get<MDBConfig>('/config/mdb').then(r => r.data),
  updateMDBConfig: (config: MDBConfig) => http.put('/config/mdb', config).then(r => r.data),
  testMDBConnection: (config: MDBConfig) => http.post('/config/mdb/test', config).then(r => r.data),
  exploreMDBStructure: (config: MDBConfig) => http.post('/config/mdb/explore', config).then(r => r.data),
  getMDBTableColumns: (tableName: string) => http.get(`/config/mdb/table/${tableName}/columns`).then(r => r.data),
  getMDBInitStatus: () => http.get('/config/mdb/init-status').then(r => r.data),

  // FT1 data preview (before import)
  getDbInitStatus: () => http.get('/config/db/init-status').then(r => r.data),

  // FTA (Perten) configuration
  getFTAConfig: () => http.get('/config/fta').then(r => r.data),
  updateFTAConfig: (config: { server: string; database: string; auth_type: string; driver: string; username: string; password: string; timeout: number }) =>
    http.put('/config/fta', config).then(r => r.data),
  testFTAConnection: (config: { server: string; database: string; auth_type: string; driver: string; username: string; password: string; timeout: number }) =>
    http.post('/config/fta/test', config).then(r => r.data),
  // FTA data preview (before import)
  getFTAInitStatus: () => http.get('/config/fta/init-status').then(r => r.data),

  // SQL Server relational (4-table) test
  testRelationalConnection: (dbConfig: DBConfig, mappingConfig: FieldMapping) =>
    http.post('/config/db/test-relational', { db_config: dbConfig, mapping_config: mappingConfig }).then(r => r.data),
  
  // Alias configuration
  getAliases: () => http.get<{ products: Record<string, string>; indicators: Record<string, string> }>('/config/aliases').then(r => r.data),
  updateAliases: (config: { products: Record<string, string>; indicators: Record<string, string> }) =>
    http.put('/config/aliases', config).then(r => r.data),
  updateProductAlias: (productCode: string, alias: string) =>
    http.put(`/config/aliases/product/${productCode}`, { alias }).then(r => r.data),
  updateIndicatorAlias: (indicatorCode: string, alias: string) =>
    http.put(`/config/aliases/indicator/${indicatorCode}`, { alias }).then(r => r.data),
  
  // Product status configuration
  getProductStatus: () => http.get<Record<string, string>>('/config/product-status').then(r => r.data),
  getRecentCounts: (days?: number) => http.get<{ products: Record<string, number>; indicators: Record<string, number> }>('/config/recent-counts', { params: { days } }).then(r => r.data),
  updateProductStatus: (config: Record<string, string>) =>
    http.put('/config/product-status', config).then(r => r.data),
  updateSingleProductStatus: (productCode: string, status: string) =>
    http.put(`/config/product-status/${productCode}`, { status }).then(r => r.data),

  // Excluded remarks configuration
  getExcludedRemarks: () => http.get<string[]>('/config/excluded-remarks').then(r => r.data),
  updateExcludedRemarks: (keywords: string[]) =>
    http.put('/config/excluded-remarks', { keywords }).then(r => r.data),

  // Spec limits configuration
  getSpecLimits: (productCode?: string) =>
    http.get<Record<string, Record<string, { lsl?: number; usl?: number; target?: number }>>>('/config/spec-limits', { params: productCode ? { product_code: productCode } : {} }).then(r => r.data),
  updateSpecLimits: (config: Record<string, Record<string, { lsl?: number; usl?: number; target?: number }>>) =>
    http.put('/config/spec-limits', config).then(r => r.data),
  updateSingleSpecLimit: (indicatorCode: string, limits: { lsl?: number; usl?: number; target?: number; product_code?: string }) =>
    http.put(`/config/spec-limits/${indicatorCode}`, limits).then(r => r.data),

  // Alert rules configuration
  getAlertRules: () =>
    http.get<{ rules: Array<{ id: number; rule: string; description: string; severity: string; enabled: boolean; rule_type: string }> }>('/config/alert-rules').then(r => r.data),
  updateAlertRules: (config: { rules: Array<{ id: number; rule: string; description: string; severity: string; enabled: boolean; rule_type: string }> }) =>
    http.put('/config/alert-rules', config).then(r => r.data),

  // Correction values configuration
  getCorrectionValues: (productCode?: string) =>
    http.get<Record<string, { values: Record<string, number>; updated_at?: string }>>('/config/correction-values', { params: productCode ? { product_code: productCode } : {} }).then(r => r.data),
  updateCorrectionValues: (productCode: string, corrections: Record<string, number>) =>
    http.put(`/config/correction-values/${productCode}`, { corrections }).then(r => r.data),

  // 产品类别配置
  getProductCategories: () =>
    http.get<Record<string, string>>('/config/product-categories').then(r => r.data),
  updateProductCategory: (productCode: string, category: string) =>
    http.put(`/config/product-categories/${productCode}`, { category }).then(r => r.data),
  getPredictionCategories: () =>
    http.get<Record<string, { name: string; k: number }>>('/config/prediction-categories').then(r => r.data),

  // 交叉预测配置
  getPredictionConfig: () =>
    http.get<Record<string, Record<string, { source_indicator: string; coefficient: number; enabled: boolean; alert_threshold?: number; alert_enabled?: boolean }>>>('/config/prediction-config').then(r => r.data),
  updatePredictionConfig: (productCode: string, indicators: Record<string, { source_indicator: string; coefficient: number; enabled: boolean; alert_threshold?: number; alert_enabled?: boolean }>) =>
    http.put(`/config/prediction-config/${productCode}`, indicators).then(r => r.data),

  // 交叉预测结果
  getCrossIndicatorPrediction: (product: string, target = 'saturated_fat', limit = 50) =>
    http.get('/predict/cross-indicator', { params: { product, target, limit } }).then(r => r.data),

  // 模型比较
  getModelsCompare: (product: string, indicator: string, horizon: number) =>
    http.get('/predict/models/compare', { params: { product, indicator, horizon } }).then(r => r.data),
  // 风险评估
  getRiskBreach: (product: string, indicator: string, horizon: number) =>
    http.get('/predict/risk/breach', { params: { product, indicator, horizon } }).then(r => r.data),
  getRiskCpk: (product: string, indicator: string) =>
    http.get('/predict/risk/cpk', { params: { product, indicator } }).then(r => r.data),
  getRiskDrift: (product: string, indicator: string) =>
    http.get('/predict/risk/drift', { params: { product, indicator } }).then(r => r.data),
  // 相关性分析
  getCorrelation: (product: string) =>
    http.get('/predict/correlation', { params: { product } }).then(r => r.data),
  // 特征重要性
  getFeatureImportance: (product: string, indicator: string) =>
    http.get('/predict/feature/importance', { params: { product, indicator } }).then(r => r.data),

  // 权限查询
  getPermissions: () =>
    http.get<{ isLocal: boolean; allowedModules: string; restrictedModules: string[]; passwordRequired: boolean }>('/permissions').then(r => r.data),

  // 网络配置
  getNetworkConfig: () =>
    http.get<{ host: string; port: number; local_ip: string; shared_password: string; password_enabled: boolean }>('/network/config').then(r => r.data),
  updateNetworkConfig: (config: { host?: string; shared_password?: string }) =>
    http.put<{ success: boolean; message: string; host: string; port: number; local_ip: string; shared_password: string; password_enabled: boolean }>('/network/config', config).then(r => r.data),

  // 密码验证
  verifyPassword: (password: string) =>
    http.post<{ success: boolean; message: string }>('/auth/verify', { password }).then(r => r.data),

  // 设备管理
  getDevices: () =>
    http.get<{ devices: Array<{ ip: string; port: number; name: string; added_at?: string }> }>('/devices').then(r => r.data),
  addDevice: (device: { ip: string; port?: number; name?: string; password?: string }) =>
    http.post<{ success: boolean; message?: string; device?: any }>('/devices', device).then(r => r.data),
  removeDevice: (ip: string) =>
    http.delete(`/devices/${ip}`).then(r => r.data),
  discoverDevices: () =>
    http.get<{ devices: Array<{ ip: string; port: number; name: string }>; local_ip: string }>('/network/discover').then(r => r.data),
  openFirewall: () =>
    http.post<{ success: boolean; message: string }>('/network/open-firewall').then(r => r.data),
}
