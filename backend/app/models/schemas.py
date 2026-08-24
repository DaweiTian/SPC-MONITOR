from pydantic import BaseModel
from typing import Optional, List
from datetime import datetime

class MonitorDataResponse(BaseModel):
    id: int
    indicator_code: str
    indicator_name: Optional[str]
    product_code: str
    product_name: Optional[str]
    value: float
    raw_value: Optional[float] = None
    correction: Optional[float] = None
    unit: Optional[str]
    upper_limit: Optional[float]
    lower_limit: Optional[float]
    is_qualified: int
    is_voided: Optional[bool] = None
    sample_id: Optional[str] = None
    remark: Optional[str] = None
    sample_time: str
    created_at: datetime

class AlertResponse(BaseModel):
    id: int
    alert_id: str
    alert_type: str
    severity: str
    indicator_code: Optional[str]
    product_code: Optional[str]
    rule_type: Optional[str]
    rule_desc: Optional[str]
    test_value: Optional[float]
    control_limit: Optional[str]
    message: str
    detail: Optional[str]
    status: str
    created_at: datetime
    resolved_at: Optional[datetime]
    resolved_by: Optional[str]
    resolve_note: Optional[str]

class DashboardResponse(BaseModel):
    today_data_count: int
    today_sync_count: int
    pending_alerts: dict
    recent_alerts: List[AlertResponse]

class SPCResponse(BaseModel):
    product_code: str
    indicator_code: str
    i_chart: dict
    mr_chart: dict
    spec_limits: dict
    sigma: float
    data_points: List[dict]
    violations: List[dict]

class CapabilityResponse(BaseModel):
    product_code: str
    indicator_code: str
    spec_limits: dict
    result: dict

class ConfigResponse(BaseModel):
    default_frequency_minutes: int
    max_frequency_minutes: int
    spc_window_size: int
    cpk_min_threshold: float
    alert_sound_enabled: bool
    alert_popup_enabled: bool
    data_retention_days: int

class DBConfigResponse(BaseModel):
    enabled: bool
    source_type: str
    auth_type: str
    server: str
    database: str
    username: str
    driver: str
    timeout: int

class FieldMappingResponse(BaseModel):
    table_name: str
    time_column: str
    product_column: str
    sample_column: str
    indicators: dict
