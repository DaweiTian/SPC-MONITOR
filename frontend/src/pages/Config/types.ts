/* ── Shared types and constants for Config page ─────────────── */

export interface ProductItem {
  id: string
  name: string
  code: string
  indicatorCount: number
  status: 'enabled' | 'disabled'
}

export interface SpecLimit {
  id: string
  product: string
  indicator: string
  usl: number
  lsl: number
  target: number
  unit: string
}

export interface NelsonRule {
  id: number
  rule: string
  description: string
  severity: 'CRITICAL' | 'WARNING' | 'INFO'
  enabled: boolean
  rule_type: string
}

export interface DBConfig {
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

export interface MDBConfig {
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

export interface InstrumentInfo {
  id: string
  name: string
  type: 'mock' | 'sqlserver' | 'mdb' | 'fta'
}

export interface FTAConfig {
  server: string
  database: string
  auth_type: string
  driver: string
  username: string
  password: string
  timeout: number
}

export interface InitStatus {
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

export interface IndicatorSpec {
  indicator_code: string
  indicator_name: string
  enabled: boolean
  usl: number | string
  lsl: number | string
  target: number | string
  unit: string
}

export const INSTRUMENTS: InstrumentInfo[] = [
  { id: 'mock', name: 'Mock 模拟数据', type: 'mock' },
  { id: 'ft1', name: 'FT1 乳品分析仪', type: 'sqlserver' },
  { id: 'ft120', name: 'FT120 乳品分析仪', type: 'mdb' },
  { id: 'fta', name: 'FTA 乳品分析仪', type: 'fta' },
]

export const INITIAL_PRODUCTS: ProductItem[] = [
  { id: '1', name: 'FT1-标准型', code: 'FT1-STD', indicatorCount: 8, status: 'enabled' },
  { id: '2', name: 'FT1-高精度型', code: 'FT1-HP', indicatorCount: 6, status: 'enabled' },
  { id: '3', name: 'FT1-经济型', code: 'FT1-ECO', indicatorCount: 5, status: 'disabled' },
]

export const INITIAL_SPECS: SpecLimit[] = [
  { id: '1', product: 'FT1-STD', indicator: '直径(mm)', usl: 10.05, lsl: 9.95, target: 10.00, unit: 'mm' },
  { id: '2', product: 'FT1-STD', indicator: '圆度(μm)', usl: 2.0, lsl: 0, target: 0.5, unit: 'μm' },
  { id: '3', product: 'FT1-HP', indicator: '表面粗糙度', usl: 0.8, lsl: 0, target: 0.3, unit: 'Ra' },
  { id: '4', product: 'FT1-HP', indicator: '硬度(HRC)', usl: 62, lsl: 58, target: 60, unit: 'HRC' },
]

export const DEFAULT_DB_CONFIG: DBConfig = {
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

export const DEFAULT_MDB_CONFIG: MDBConfig = {
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

export const DEFAULT_FTA_CONFIG: FTAConfig = {
  server: '',
  database: 'Pert_Application',
  auth_type: 'sql',
  driver: 'ODBC Driver 17 for SQL Server',
  username: 'sa',
  password: '',
  timeout: 30,
}
