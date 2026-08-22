from pydantic import BaseModel, Field
from typing import Optional, Dict, Any


class DBConfigRequest(BaseModel):
    enabled: bool = False
    source_type: str = "sqlserver"
    auth_type: str = "windows"
    server: str = ""
    database: str = ""
    username: str = ""
    password: str = ""
    driver: str = "ODBC Driver 17 for SQL Server"
    timeout: int = Field(30, ge=1, le=300)


class MDBConfigRequest(BaseModel):
    enabled: bool = False
    mdb_path: str = ""
    sample_table: str = "Sample"
    product_table: str = "Product"
    component_table: str = "Component"
    prediction_table: str = "Prediction"
    time_column: str = "DateTime"
    product_ref_column: str = "ProdRef"
    product_name_column: str = "Name"
    component_ref_column: str = "CompRef"
    component_name_column: str = "Name"
    value_column: str = "Value"
    indicators: Dict[str, Any] = {}


class FTAConfigRequest(BaseModel):
    enabled: bool = False
    server: str = ""
    database: str = ""
    username: str = ""
    password: str = ""
    driver: str = "ODBC Driver 17 for SQL Server"
    timeout: int = Field(30, ge=1, le=300)


class InstrumentSwitchRequest(BaseModel):
    instrument_id: str = Field(..., pattern="^(mock|ft1|ft120|fta)$")
    init_limit: int = Field(100, ge=1, le=1000, description="首次导入数据条数上限")


class UpdateConfigRequest(BaseModel):
    default_frequency_minutes: Optional[int] = Field(None, ge=1, le=1440)
    max_frequency_minutes: Optional[int] = Field(None, ge=1, le=1440)
    spc_window_size: Optional[int] = Field(None, ge=5, le=1000)
    cpk_min_threshold: Optional[float] = Field(None, ge=0, le=10)
    alert_sound_enabled: Optional[bool] = None
    alert_popup_enabled: Optional[bool] = None
    data_retention_days: Optional[int] = Field(None, ge=1, le=3650)


class SpecLimitRequest(BaseModel):
    product_code: str
    indicator_code: str
    lsl: Optional[float] = None
    usl: Optional[float] = None
    target: Optional[float] = None


class AliasRequest(BaseModel):
    aliases: Dict[str, str]


class ProductStatusRequest(BaseModel):
    products: Dict[str, bool]
