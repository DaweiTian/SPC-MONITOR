from sqlalchemy import Column, Integer, String, Float, DateTime, Text
from sqlalchemy.sql import func
from backend.app.core.database import Base

class MonitorData(Base):
    __tablename__ = "monitor_data"
    
    id = Column(Integer, primary_key=True, autoincrement=True)
    indicator_code = Column(String, nullable=False)
    indicator_name = Column(String)
    product_code = Column(String, nullable=False)
    product_name = Column(String)
    value = Column(Float, nullable=False)
    unit = Column(String)
    upper_limit = Column(Float)
    lower_limit = Column(Float)
    is_qualified = Column(Integer, default=1)
    sample_time = Column(String, nullable=False)
    created_at = Column(DateTime, default=func.now())

class Alert(Base):
    __tablename__ = "alerts"
    
    id = Column(Integer, primary_key=True, autoincrement=True)
    alert_id = Column(String, unique=True, nullable=False)
    alert_type = Column(String, nullable=False)
    severity = Column(String, default="warning")
    indicator_code = Column(String)
    product_code = Column(String)
    rule_type = Column(String)
    rule_desc = Column(String)
    test_value = Column(Float)
    control_limit = Column(String)
    message = Column(String, nullable=False)
    detail = Column(String)
    status = Column(String, default="pending")
    created_at = Column(DateTime, default=func.now())
    resolved_at = Column(DateTime)
    resolved_by = Column(String)
    resolve_note = Column(String)

class SyncLog(Base):
    __tablename__ = "sync_log"
    
    id = Column(Integer, primary_key=True, autoincrement=True)
    source = Column(String, nullable=False)
    sync_type = Column(String, default="data")
    status = Column(String, default="success")
    records_count = Column(Integer, default=0)
    error_message = Column(String)
    started_at = Column(String, nullable=False)
    finished_at = Column(DateTime, default=func.now())
