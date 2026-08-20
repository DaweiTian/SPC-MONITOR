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

const http = axios.create({
  baseURL: '/api',
  timeout: 120000,
})

export const api = {
  getDashboard: () => http.get<DashboardData>('/monitor/dashboard').then(r => r.data),
  getStatus: () => http.get<SchedulerStatus>('/monitor/status').then(r => r.data),
  manualCollect: () => http.post('/monitor/collect/manual').then(r => r.data),
  getProducts: () => http.get<{ products: Product[] }>('/monitor/products').then(r => r.data),
  getIndicators: () => http.get<{ indicators: Indicator[] }>('/monitor/indicators').then(r => r.data),
  getRecentData: (params: { indicator_code: string; product_code: string; limit?: number }) =>
    http.get('/monitor/data/recent', { params }).then(r => r.data),
  getSPCData: (productCode: string, indicatorCode: string, window?: number) =>
    http.get<SPCData>(`/spc/${productCode}/${indicatorCode}`, { params: { window } }).then(r => r.data),
  getCapabilityData: (productCode: string, indicatorCode: string, window?: number) =>
    http.get<CapabilityData>(`/capability/${productCode}/${indicatorCode}`, { params: { window } }).then(r => r.data),
  getAlerts: (params?: { severity?: string; status?: string; product_code?: string; search?: string; page?: number; page_size?: number }) =>
    http.get<{ alerts: Alert[]; total: number; page: number; page_size: number }>('/alerts', { params }).then(r => r.data),
  getAlertCount: () =>
    http.get<{ CRITICAL: number; WARNING: number; INFO: number; total: number }>('/alerts/count').then(r => r.data),
  getAlertProducts: () =>
    http.get<{ products: string[] }>('/alerts/products').then(r => r.data),
  resolveAlert: (alertId: string, resolvedBy?: string, note?: string) =>
    http.post(`/alerts/${alertId}/resolve`, { resolved_by: resolvedBy, note }).then(r => r.data),
  batchResolveAlerts: (alertIds: string[], resolvedBy?: string, note?: string) =>
    http.post('/alerts/batch-resolve', { alert_ids: alertIds, resolved_by: resolvedBy, note }).then(r => r.data),
  getConfig: () => http.get<Config>('/config').then(r => r.data),
  updateConfig: (config: Partial<Config>) => http.put('/config', config).then(r => r.data),
  getDBConfig: () => http.get<DBConfig>('/config/db').then(r => r.data),
  updateDBConfig: (config: DBConfig) => http.put('/config/db', config).then(r => r.data),
  testDBConnection: (config: DBConfig) => http.post('/config/db/test', config).then(r => r.data),
  exploreDBStructure: (config: DBConfig) => http.post('/config/db/explore', config).then(r => r.data),
  getTableColumns: (tableName: string) => http.get(`/config/db/table/${tableName}/columns`).then(r => r.data),
  updateFieldMapping: (mapping: FieldMapping) => http.put('/config/db/mapping', mapping).then(r => r.data),
  getFieldMapping: () => http.get<FieldMapping>('/config/db/mapping').then(r => r.data),
  getPrediction: (product: string, indicator: string, model: string, horizon: number) =>
    http.get(`/predict/forecast`, { params: { product, indicator, model, horizon } }).then(r => r.data),
  switchDataSource: (source: 'mock' | 'sqlserver') =>
    http.post(`/config/source/switch`, { source }).then(r => r.data),
  getDataSourceStatus: () =>
    http.get(`/config/source/status`).then(r => r.data),
  exportData: (params: { format: string; product?: string; indicator?: string }) =>
    http.get(`/data/export`, { params, responseType: 'blob' }).then(r => r.data),
  
  // Instrument configuration
  getInstrumentConfig: () => http.get<InstrumentConfig>('/config/instrument').then(r => r.data),
  updateInstrumentConfig: (config: InstrumentConfig) => http.put('/config/instrument', config).then(r => r.data),
  switchInstrument: (instrumentId: string) =>
    http.post('/config/instrument/switch', { instrument_id: instrumentId }).then(r => r.data),
  
  // MDB configuration
  getMDBConfig: () => http.get<MDBConfig>('/config/mdb').then(r => r.data),
  updateMDBConfig: (config: MDBConfig) => http.put('/config/mdb', config).then(r => r.data),
  testMDBConnection: (config: MDBConfig) => http.post('/config/mdb/test', config).then(r => r.data),
  exploreMDBStructure: (config: MDBConfig) => http.post('/config/mdb/explore', config).then(r => r.data),
  getMDBTableColumns: (tableName: string) => http.get(`/config/mdb/table/${tableName}/columns`).then(r => r.data),
  getMDBInitStatus: () => http.get('/config/mdb/init-status').then(r => r.data),
  
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
  updateProductStatus: (config: Record<string, string>) =>
    http.put('/config/product-status', config).then(r => r.data),
  updateSingleProductStatus: (productCode: string, status: string) =>
    http.put(`/config/product-status/${productCode}`, { status }).then(r => r.data),
  
  // Spec limits configuration
  getSpecLimits: (productCode?: string) =>
    http.get<Record<string, Record<string, { lsl?: number; usl?: number; target?: number }>>>('/config/spec-limits', { params: productCode ? { product_code: productCode } : {} }).then(r => r.data),
  updateSpecLimits: (config: Record<string, Record<string, { lsl?: number; usl?: number; target?: number }>>) =>
    http.put('/config/spec-limits', config).then(r => r.data),
  updateSingleSpecLimit: (indicatorCode: string, limits: { lsl?: number; usl?: number; target?: number; product_code?: string }) =>
    http.put(`/config/spec-limits/${indicatorCode}`, limits).then(r => r.data),
}
