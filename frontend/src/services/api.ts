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
  getAlerts: (params?: { severity?: string; status?: string; limit?: number }) =>
    http.get<{ alerts: Alert[] }>('/alerts', { params }).then(r => r.data),
  resolveAlert: (alertId: string, resolvedBy?: string, note?: string) =>
    http.post(`/alerts/${alertId}/resolve`, null, { params: { resolved_by: resolvedBy, note } }).then(r => r.data),
  getConfig: () => http.get<Config>('/config').then(r => r.data),
  updateConfig: (config: Partial<Config>) => http.put('/config', config).then(r => r.data),
  getDBConfig: () => http.get<DBConfig>('/config/db').then(r => r.data),
  updateDBConfig: (config: DBConfig) => http.put('/config/db', config).then(r => r.data),
  testDBConnection: (config: DBConfig) => http.post('/config/db/test', config).then(r => r.data),
  exploreDBStructure: (config: DBConfig) => http.post('/config/db/explore', config).then(r => r.data),
  getTableColumns: (tableName: string) => http.get(`/config/db/table/${tableName}/columns`).then(r => r.data),
  updateFieldMapping: (mapping: FieldMapping) => http.put('/config/db/mapping', mapping).then(r => r.data),
  getFieldMapping: () => http.get<FieldMapping>('/config/db/mapping').then(r => r.data),
}
