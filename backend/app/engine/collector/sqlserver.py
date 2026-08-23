import logging
from datetime import datetime
from typing import Dict, Any, List, Optional
from .base import BaseCollector
from .utils import parse_datetime, load_breakpoint, save_breakpoint, load_spec_limits, build_connection_string
from backend.app.core.validation import validate_identifier

logger = logging.getLogger(__name__)

BREAKPOINT_FILE = "sqlserver_breakpoint.json"


class SQLServerCollector(BaseCollector):
    """SQL Server 数据采集器

    支持两种模式：
    - flat: 单表模式，从一张宽表直接读取指标列（原 FT1 模式）
    - relational: 四表关联模式，与 MDB 结构一致（Sample/Product/Component/Prediction）
    """

    def __init__(
        self,
        connection_string: str,
        storage=None,
        mode: str = "flat",
        # flat mode params
        table_name: str = "",
        time_column: str = "",
        product_column: str = "",
        sample_column: str = "",
        indicators: Optional[Dict[str, str]] = None,
        # relational mode params
        sample_table: str = "Sample",
        product_table: str = "Product",
        component_table: str = "Component",
        prediction_table: str = "Prediction",
        time_col: str = "DateTime",
        product_ref_col: str = "ProdRef",
        product_name_col: str = "Name",
        component_ref_col: str = "CompRef",
        component_name_col: str = "Name",
        value_col: str = "Value",
        rep_no_ref: Optional[int] = 32000,
        init_limit: int = 100,
    ):
        super().__init__(storage, init_limit=init_limit)
        self.connection_string = connection_string
        self.mode = mode
        # flat mode
        self.table_name = table_name
        self.time_column = time_column
        self.product_column = product_column
        self.sample_column = sample_column
        self.indicators = indicators or {}
        # relational mode
        self.sample_table = sample_table
        self.product_table = product_table
        self.component_table = component_table
        self.prediction_table = prediction_table
        self.time_col = time_col
        self.product_ref_col = product_ref_col
        self.product_name_col = product_name_col
        self.component_ref_col = component_ref_col
        self.component_name_col = component_name_col
        self.value_col = value_col
        self.rep_no_ref = rep_no_ref

        self._last_collect_time: Optional[datetime] = self._load_breakpoint()
        self._db_config: Dict[str, Any] = {}
        self._use_pymssql = False
        self._engine = None
        # relational mode caches
        self._products_cache: Optional[Dict[int, str]] = None
        self._components_cache: Optional[Dict[int, str]] = None

    @classmethod
    def from_config(cls, db_config: dict, mapping_config: dict, storage=None, init_limit: int = 100):
        conn_str = cls._build_connection_string(db_config)
        mode = mapping_config.get("mode", "flat")
        instance = cls(
            connection_string=conn_str,
            storage=storage,
            mode=mode,
            init_limit=init_limit,
            # flat mode
            table_name=mapping_config.get("table_name", ""),
            time_column=mapping_config.get("time_column", ""),
            product_column=mapping_config.get("product_column", ""),
            sample_column=mapping_config.get("sample_column", ""),
            indicators=mapping_config.get("indicators", {}),
            # relational mode
            sample_table=mapping_config.get("sample_table", "Sample"),
            product_table=mapping_config.get("product_table", "Product"),
            component_table=mapping_config.get("component_table", "Component"),
            prediction_table=mapping_config.get("prediction_table", "Prediction"),
            time_col=mapping_config.get("time_column", "DateTime"),
            product_ref_col=mapping_config.get("product_ref_column", "ProdRef"),
            product_name_col=mapping_config.get("product_name_column", "Name"),
            component_ref_col=mapping_config.get("component_ref_column", "CompRef"),
            component_name_col=mapping_config.get("component_name_column", "Name"),
            value_col=mapping_config.get("value_column", "Value"),
            rep_no_ref=mapping_config.get("rep_no_ref", 32000),
        )
        instance._db_config = db_config
        instance._use_pymssql = False
        return instance

    def _load_breakpoint(self) -> Optional[datetime]:
        ts = load_breakpoint(BREAKPOINT_FILE)
        return parse_datetime(ts) if ts else None

    def _save_breakpoint(self):
        if self._last_collect_time:
            save_breakpoint(BREAKPOINT_FILE, self._last_collect_time.isoformat())
    
    @staticmethod
    def _build_connection_string(config: dict) -> str:
        return build_connection_string(config)

    @staticmethod
    def _build_pymssql_connection(config: dict):
        """创建 pymssql 连接（当 pyodbc 不可用时的备选方案）"""
        import pymssql
        server = config.get("server", "localhost")
        database = config.get("database", "")
        auth_type = config.get("auth_type", "sql")
        username = config.get("username", "sa")
        password = config.get("password", "")
        if auth_type == "windows":
            return pymssql.connect(server=server, database=database, trusted_connection=True)
        return pymssql.connect(server=server, user=username, password=password, database=database)
    
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
        # Try pymssql first (more reliable on Linux without ODBC)
        try:
            conn = self._build_pymssql_connection(self._db_config)
            cursor = conn.cursor()
            cursor.execute("SELECT 1")
            cursor.fetchone()
            conn.close()
            self._use_pymssql = True
            return True
        except Exception:
            pass
        # Fallback to SQLAlchemy/pyodbc
        try:
            from sqlalchemy import text
            with self.engine.connect() as conn:
                conn.execute(text("SELECT 1"))
            self._use_pymssql = False
            return True
        except Exception as e:
            logger.error(f"SQL Server 连接失败: {e}")
            return False

    def test_tables(self) -> Dict[str, Any]:
        """测试四表结构是否存在，返回详细信息"""
        result = {"success": False, "tables": {}, "message": ""}
        required = [self.sample_table, self.product_table, self.component_table, self.prediction_table]

        if self._use_pymssql:
            try:
                conn = self._build_pymssql_connection(self._db_config)
                cursor = conn.cursor()
                cursor.execute("SELECT name FROM sys.tables")
                existing_tables = {row[0] for row in cursor}
                conn.close()
            except Exception as e:
                result["message"] = f"检查失败: {e}"
                return result
        else:
            try:
                from sqlalchemy import inspect as sa_inspect
                inspector = sa_inspect(self.engine)
                existing_tables = set(inspector.get_table_names())
            except Exception as e:
                result["message"] = f"检查失败: {e}"
                return result

        for t in required:
            found = t.lower() in {e.lower() for e in existing_tables}
            result["tables"][t] = found
        if all(result["tables"].values()):
            result["success"] = True
            result["message"] = "四表结构完整"
        else:
            missing = [t for t, ok in result["tables"].items() if not ok]
            result["message"] = f"缺少表: {', '.join(missing)}"
        return result
    
    def collect(self) -> Dict[str, Any]:
        if self.mode == "relational":
            return self._collect_relational()
        return self._collect_flat()

    def _collect_flat(self) -> Dict[str, Any]:
        """单表模式采集"""
        if not self.table_name or not self.time_column or not self.indicators:
            return {
                'new_records': 0,
                'error': '未配置字段映射',
                'timestamp': datetime.now().isoformat(),
            }

        now = datetime.now()

        # Validate SQL identifiers before building the query
        validate_identifier(self.table_name)
        validate_identifier(self.time_column)
        validate_identifier(self.product_column)

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
                rows = result.fetchmany(self.init_limit)
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

    def _collect_relational(self) -> Dict[str, Any]:
        """四表关联模式采集（与 MDB 结构一致）"""
        now = datetime.now()
        try:
            # Validate SQL identifiers
            validate_identifier(self.time_col)
            validate_identifier(self.product_ref_col)
            validate_identifier(self.component_ref_col)
            validate_identifier(self.value_col)
            validate_identifier(self.sample_table)
            validate_identifier(self.product_table)
            validate_identifier(self.component_table)
            validate_identifier(self.prediction_table)

            products_map = self._load_products_sql()
            components_map = self._load_components_sql()

            # 查询新样本
            where = ""
            params: Dict[str, Any] = {}
            if self._last_collect_time:
                if self._use_pymssql:
                    where = f"WHERE s.[{self.time_col}] > %s"
                    params = (self._last_collect_time,)
                else:
                    where = f"WHERE s.[{self.time_col}] > :last_time"
                    params = {"last_time": self._last_collect_time}

            rep_filter = ""
            if self.rep_no_ref is not None:
                if self._use_pymssql:
                    rep_filter = "AND p.[RepNoRef] = %s"
                    if isinstance(params, tuple):
                        params = params + (self.rep_no_ref,)
                    else:
                        params = (self.rep_no_ref,)
                else:
                    rep_filter = "AND p.[RepNoRef] = :rep_no_ref"
                    params["rep_no_ref"] = self.rep_no_ref

            top_n = self.init_limit if not self._last_collect_time else 200
            sql = f"""
                SELECT TOP {top_n}
                    s.[SampNo],
                    s.[{self.product_ref_col}],
                    s.[{self.time_col}],
                    p.[{self.component_ref_col}],
                    p.[{self.value_col}]
                FROM [{self.sample_table}] s
                INNER JOIN [{self.prediction_table}] p ON s.[SampNo] = p.[SampRef]
                {where}
                {rep_filter}
                ORDER BY s.[{self.time_col}] DESC
            """

            records = []
            if self._use_pymssql:
                conn = self._build_pymssql_connection(self._db_config)
                cursor = conn.cursor()
                if params:
                    cursor.execute(sql, params)
                else:
                    cursor.execute(sql)
                rows = cursor.fetchall()
                conn.close()
            else:
                from sqlalchemy import text
                with self.engine.connect() as conn:
                    result = conn.execute(text(sql), params)
                    rows = result.fetchall()

            for row in rows:
                    samp_no = row[0]
                    prod_ref = row[1]
                    sample_time = row[2]
                    comp_ref = row[3]
                    value = row[4]

                    if samp_no is None or prod_ref is None or sample_time is None:
                        continue

                    product_name = products_map.get(prod_ref, f'Product_{prod_ref}')
                    indicator_name = components_map.get(comp_ref, f'Component_{comp_ref}')

                    try:
                        value = float(value)
                    except (ValueError, TypeError):
                        continue

                    # Get correction value and apply
                    product_code = product_name.strip()
                    indicator_code = indicator_name.lower()
                    correction = self._get_correction(product_code, indicator_code)
                    raw_value = value
                    value = round(value + correction, 4)

                    if isinstance(sample_time, datetime):
                        time_str = sample_time.isoformat()
                    else:
                        time_str = str(sample_time)

                    record = {
                        'indicator_code': indicator_code,
                        'indicator_name': indicator_name,
                        'product_code': product_code,
                        'product_name': product_name,
                        'value': value,
                        'raw_value': round(raw_value, 4),
                        'correction': correction,
                        'unit': 'g/100g',
                        'upper_limit': None,
                        'lower_limit': None,
                        'is_qualified': 1,
                        'sample_time': time_str,
                    }
                    records.append(record)

            saved_count = 0
            if self.storage and records:
                saved_count = self.storage.save_data(records)

            if records:
                max_time = max(r['sample_time'] for r in records)
                parsed = parse_datetime(max_time)
                if parsed:
                    self._last_collect_time = parsed
                    self._save_breakpoint()

            return {
                'new_records': saved_count,
                'timestamp': now.isoformat(),
            }
        except Exception as e:
            logger.error(f"四表关联采集失败: {e}", exc_info=True)
            return {
                'new_records': 0,
                'error': str(e),
                'timestamp': now.isoformat(),
            }

    def _load_products_sql(self) -> Dict[int, str]:
        """从 SQL Server 加载产品映射"""
        if self._products_cache is not None:
            return self._products_cache
        validate_identifier(self.product_table)
        validate_identifier(self.product_name_col)
        sql = f"SELECT [ProdNo], [{self.product_name_col}] FROM [{self.product_table}]"
        try:
            if self._use_pymssql:
                conn = self._build_pymssql_connection(self._db_config)
                cursor = conn.cursor()
                cursor.execute(sql)
                rows = cursor.fetchall()
                conn.close()
            else:
                from sqlalchemy import text
                with self.engine.connect() as conn:
                    rows = conn.execute(text(sql)).fetchall()
            self._products_cache = {row[0]: row[1] for row in rows if row[0] is not None}
        except Exception as e:
            logger.error(f"加载产品表失败: {e}")
            self._products_cache = {}
        return self._products_cache

    def _load_components_sql(self) -> Dict[int, str]:
        """从 SQL Server 加载指标映射"""
        if self._components_cache is not None:
            return self._components_cache
        validate_identifier(self.component_table)
        validate_identifier(self.component_name_col)
        sql = f"SELECT [CompNo], [{self.component_name_col}] FROM [{self.component_table}]"
        try:
            if self._use_pymssql:
                conn = self._build_pymssql_connection(self._db_config)
                cursor = conn.cursor()
                cursor.execute(sql)
                rows = cursor.fetchall()
                conn.close()
            else:
                from sqlalchemy import text
                with self.engine.connect() as conn:
                    rows = conn.execute(text(sql)).fetchall()
            self._components_cache = {row[0]: row[1] for row in rows if row[0] is not None}
        except Exception as e:
            logger.error(f"加载指标表失败: {e}")
            self._components_cache = {}
        return self._components_cache
    
    def get_breakpoint(self) -> Dict[str, Any]:
        return {
            'last_collect_time': self._last_collect_time.isoformat() if self._last_collect_time else None,
            'table_name': self.table_name or self.sample_table,
        }

    def set_breakpoint(self, last_collect_time: str):
        self._last_collect_time = datetime.fromisoformat(last_collect_time)
        self._save_breakpoint()
    
    def _build_column_list(self) -> List[str]:
        columns = [f"[{self.time_column}]", f"[{self.product_column}]"]
        if self.sample_column:
            validate_identifier(self.sample_column)
            columns.append(f"[{self.sample_column}]")
        for indicator_code, col_name in self.indicators.items():
            validate_identifier(col_name)
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

            # Get correction value and apply
            product_code = self._generate_product_code(product_name)
            correction = self._get_correction(product_code, indicator_code)
            raw_value = value
            value = round(value + correction, 4)

            record = {
                'indicator_code': indicator_code,
                'indicator_name': indicator_code,
                'product_code': product_code,
                'product_name': product_name,
                'value': value,
                'raw_value': round(raw_value, 4),
                'correction': correction,
                'unit': 'g/100g',
                'upper_limit': None,
                'lower_limit': None,
                'is_qualified': 1,
                'sample_time': time_str,
            }
            records.append(record)
        
        return records
    
    def _generate_product_code(self, product_name: str) -> str:
        return product_name.strip()
    
    def get_products(self) -> List[Dict[str, str]]:
        if self.mode == "relational":
            return self._get_products_relational()
        return self._get_products_flat()

    def _get_products_flat(self) -> List[Dict[str, str]]:
        if not self.table_name or not self.product_column:
            return []
        validate_identifier(self.table_name)
        validate_identifier(self.product_column)
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

    def _get_products_relational(self) -> List[Dict[str, str]]:
        products_map = self._load_products_sql()
        return [
            {'code': name.strip(), 'name': name}
            for name in products_map.values()
        ]

    def get_indicators(self) -> List[Dict[str, Any]]:
        if self.mode == "relational":
            return self._get_indicators_relational()
        return [
            {'code': code, 'name': code}
            for code in self.indicators.keys()
        ]

    def _get_indicators_relational(self) -> List[Dict[str, Any]]:
        components_map = self._load_components_sql()
        return [
            {'code': name.lower(), 'name': name}
            for name in components_map.values()
        ]

    def get_spec_limits(self, product_code: str = None) -> Dict[str, Dict[str, float]]:
        return load_spec_limits("spec_limits.json", product_code)

    def clear_cache(self):
        self._products_cache = None
        self._components_cache = None

    def close(self):
        if self._engine:
            self._engine.dispose()
            self._engine = None
