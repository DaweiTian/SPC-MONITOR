import logging
from datetime import datetime
from typing import Dict, Any, List, Optional
from .base import BaseCollector

logger = logging.getLogger(__name__)

class SQLServerCollector(BaseCollector):
    """SQL Server 数据采集器"""
    
    def __init__(
        self,
        connection_string: str,
        storage=None,
        table_name: str = "",
        time_column: str = "",
        product_column: str = "",
        sample_column: str = "",
        indicators: Optional[Dict[str, str]] = None,
    ):
        super().__init__(storage)
        self.connection_string = connection_string
        self.table_name = table_name
        self.time_column = time_column
        self.product_column = product_column
        self.sample_column = sample_column
        self.indicators = indicators or {}
        self._last_collect_time: Optional[datetime] = None
        self._engine = None
    
    @classmethod
    def from_config(cls, db_config: dict, mapping_config: dict, storage=None):
        conn_str = cls._build_connection_string(db_config)
        return cls(
            connection_string=conn_str,
            storage=storage,
            table_name=mapping_config.get("table_name", ""),
            time_column=mapping_config.get("time_column", ""),
            product_column=mapping_config.get("product_column", ""),
            sample_column=mapping_config.get("sample_column", ""),
            indicators=mapping_config.get("indicators", {}),
        )
    
    @staticmethod
    def _build_connection_string(config: dict) -> str:
        server = config.get("server", "")
        database = config.get("database", "")
        driver = config.get("driver", "ODBC Driver 17 for SQL Server")
        auth_type = config.get("auth_type", "windows")
        driver_encoded = driver.replace(" ", "+")
        
        if auth_type == "windows":
            return f"mssql+pyodbc://@{server}/{database}?driver={driver_encoded}&trusted_connection=yes"
        else:
            username = config.get("username", "")
            password = config.get("password", "")
            return f"mssql+pyodbc://{username}:{password}@{server}/{database}?driver={driver_encoded}"
    
    @property
    def engine(self):
        if self._engine is None:
            from sqlalchemy import create_engine
            self._engine = create_engine(
                self.connection_string,
                echo=False,
                pool_pre_ping=True,
            )
        return self._engine
    
    def test_connection(self) -> bool:
        try:
            from sqlalchemy import text
            with self.engine.connect() as conn:
                conn.execute(text("SELECT 1"))
            return True
        except Exception as e:
            logger.error(f"SQL Server 连接失败: {e}")
            return False
    
    def collect(self) -> Dict[str, Any]:
        if not self.table_name or not self.time_column or not self.indicators:
            return {
                'new_records': 0,
                'error': '未配置字段映射',
                'timestamp': datetime.now().isoformat(),
            }
        
        now = datetime.now()
        columns = self._build_column_list()
        where_clause, params = self._build_where_clause()
        
        sql = f"""
            SELECT {', '.join(columns)}
            FROM [{self.table_name}]
            {where_clause}
            ORDER BY [{self.time_column}] DESC
        """
        
        records = []
        try:
            from sqlalchemy import text
            with self.engine.connect() as conn:
                result = conn.execute(text(sql), params)
                rows = result.fetchmany(100)
                column_names = result.keys()
                
                for row in rows:
                    row_dict = dict(zip(column_names, row))
                    parsed = self._parse_row(row_dict)
                    if parsed:
                        records.extend(parsed)
        except Exception as e:
            logger.error(f"采集失败: {e}", exc_info=True)
            return {
                'new_records': 0,
                'error': str(e),
                'timestamp': now.isoformat(),
            }
        
        saved_count = 0
        if self.storage and records:
            saved_count = self.storage.save_data(records)
        
        if records:
            max_time = max(r['sample_time'] for r in records)
            self._last_collect_time = datetime.fromisoformat(max_time)
        
        return {
            'new_records': saved_count,
            'timestamp': now.isoformat(),
        }
    
    def get_breakpoint(self) -> Dict[str, Any]:
        return {
            'last_collect_time': self._last_collect_time.isoformat() if self._last_collect_time else None,
            'table_name': self.table_name,
        }
    
    def set_breakpoint(self, last_collect_time: str):
        self._last_collect_time = datetime.fromisoformat(last_collect_time)
    
    def _build_column_list(self) -> List[str]:
        columns = [f"[{self.time_column}]", f"[{self.product_column}]"]
        if self.sample_column:
            columns.append(f"[{self.sample_column}]")
        for indicator_code, col_name in self.indicators.items():
            columns.append(f"[{col_name}]")
        return columns
    
    def _build_where_clause(self) -> tuple:
        if self._last_collect_time:
            return (
                f"WHERE [{self.time_column}] > :last_time",
                {"last_time": self._last_collect_time}
            )
        return "", {}
    
    def _parse_row(self, row_dict: Dict) -> List[Dict[str, Any]]:
        records = []
        test_time = row_dict.get(self.time_column)
        product_name = row_dict.get(self.product_column, '未知产品')
        
        if test_time is None:
            return records
        
        if isinstance(test_time, datetime):
            time_str = test_time.isoformat()
        else:
            time_str = str(test_time)
        
        for indicator_code, col_name in self.indicators.items():
            value = row_dict.get(col_name)
            if value is None:
                continue
            
            try:
                value = float(value)
            except (ValueError, TypeError):
                continue
            
            record = {
                'indicator_code': indicator_code,
                'indicator_name': indicator_code,
                'product_code': self._generate_product_code(product_name),
                'product_name': product_name,
                'value': round(value, 4),
                'unit': '',
                'upper_limit': None,
                'lower_limit': None,
                'is_qualified': 1,
                'sample_time': time_str,
            }
            records.append(record)
        
        return records
    
    def _generate_product_code(self, product_name: str) -> str:
        return product_name[:10].strip()
    
    def get_products(self) -> List[Dict[str, str]]:
        if not self.table_name or not self.product_column:
            return []
        
        from sqlalchemy import text
        sql = f"""
            SELECT DISTINCT [{self.product_column}] as product_name
            FROM [{self.table_name}]
            WHERE [{self.product_column}] IS NOT NULL
            ORDER BY [{self.product_column}]
        """
        
        try:
            with self.engine.connect() as conn:
                result = conn.execute(text(sql))
                rows = result.fetchall()
                return [
                    {'code': self._generate_product_code(r[0]), 'name': r[0]}
                    for r in rows if r[0]
                ]
        except Exception as e:
            logger.error(f"查询产品列表失败: {e}")
            return []
    
    def get_indicators(self) -> List[Dict[str, Any]]:
        return [
            {'code': code, 'name': code}
            for code in self.indicators.keys()
        ]
    
    def get_spec_limits(self) -> Dict[str, Dict[str, float]]:
        return {}
    
    def close(self):
        if self._engine:
            self._engine.dispose()
            self._engine = None
