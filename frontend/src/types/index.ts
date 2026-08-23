export interface MonitorData {
  id: number
  indicator_code: string
  indicator_name?: string
  product_code: string
  product_name?: string
  value: number
  raw_value?: number
  correction?: number
  unit?: string
  upper_limit?: number
  lower_limit?: number
  is_qualified: number
  sample_time: string
  sample_id?: string | null
  remark?: string | null
  created_at: string
}

export interface Alert {
  id: number
  alert_id: string
  alert_type: string
  severity: 'CRITICAL' | 'WARNING' | 'INFO'
  indicator_code?: string
  product_code?: string
  rule_type?: string
  rule_desc?: string
  test_value?: number
  control_limit?: string
  message: string
  detail?: string
  status: 'pending' | 'resolved'
  created_at: string
  resolved_at?: string
  resolved_by?: string
  resolve_note?: string
}

export interface DashboardData {
  today_data_count: number
  today_sync_count: number
  today_collect_attempts: number
  today_collect_success: number
  today_unqualified_count: number
  pending_alerts: {
    CRITICAL: number
    WARNING: number
    INFO: number
  }
  recent_alerts: Alert[]
}

export interface SPCData {
  product_code: string
  indicator_code: string
  i_chart: {
    cl: number
    ucl: number
    lcl: number
  }
  mr_chart: {
    cl: number
    ucl: number
    lcl: number
  }
  spec_limits: {
    usl: number
    lsl: number
    mean: number
    std: number
    unit?: string
  }
  sigma: number
  data_points: Array<{
    time: string
    value: number
    is_violation: boolean
    sample_id?: string | null
    remark?: string | null
  }>
  violations: Array<{
    rule_id: number
    rule_name: string
    description: string
    severity: string
    violation_points: number[]
  }>
}

export interface CapabilityData {
  product_code: string
  indicator_code: string
  spec_limits: {
    lsl?: number
    usl?: number
  }
  result: {
    cp: number
    cpk: number
    pp: number
    ppk: number
    ca: number
    sigma_level: number
    defect_rate_ppm: number
  }
  cpk_history?: Array<{ time: string; value: number }>
}

export interface SchedulerStatus {
  current_level: number
  current_interval_minutes: number
  is_collecting: boolean
  last_collect_time?: string
  last_record_count: number
  next_collect_time?: string
  frequency_ladder: number[]
  connected?: boolean
  source?: string
  instrument_type?: string
}

export interface Product {
  code: string
  name: string
}

export interface Indicator {
  code: string
  name: string
}

export interface Config {
  default_frequency_minutes: number
  max_frequency_minutes: number
  spc_window_size: number
  cpk_min_threshold: number
  alert_sound_enabled: boolean
  alert_popup_enabled: boolean
  data_retention_days: number
}

export interface DBConfig {
  enabled: boolean
  source_type: string
  auth_type: string
  server: string
  database: string
  username: string
  driver: string
  timeout: number
}

export interface FieldMapping {
  mode?: 'flat' | 'relational'
  table_name: string
  time_column: string
  product_column: string
  sample_column: string
  indicators: Record<string, string>
  // relational mode (MDB-style 4-table)
  sample_table?: string
  product_table?: string
  component_table?: string
  prediction_table?: string
  product_ref_column?: string
  product_name_column?: string
  component_ref_column?: string
  component_name_column?: string
  value_column?: string
  rep_no_ref?: number
}

export interface PredictionData {
  historical: { time: string; value: number }[]
  predicted: { time: string; value: number }[]
  confidence_upper: number[]
  confidence_lower: number[]
  metrics: {
    mape: number
    rmse: number
    mae: number
    r_squared: number
  }
  model: string
  horizon: number
  risk: string
}

export interface DataSourceConfig {
  source: 'mock' | 'sqlserver'
  connected: boolean
  last_switch: string
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
  enabled: boolean
}

export interface InstrumentConfig {
  current_instrument: string
  instruments: Record<string, InstrumentInfo>
}

/** Narrowing type for ECharts formatter params — use after casting from ECharts callback */
export interface EChartsParam {
  value: number | number[]
  name: string
  seriesName?: string
  dataIndex: number
  marker?: string
  percent?: number
  data?: Record<string, unknown>
}
