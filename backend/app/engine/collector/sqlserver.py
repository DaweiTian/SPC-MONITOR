import logging
from datetime import datetime
from typing import Dict, Any, List, Optional
from .base import BaseCollector
from .utils import (
    parse_datetime,
    load_breakpoint,
    save_breakpoint,
    load_spec_limits,
    build_connection_string,
    resolve_instance_port,
)
from backend.app.core.validation import validate_identifier
from backend.app.core.config import get_conf_path

logger = logging.getLogger(__name__)

BREAKPOINT_FILE = get_conf_path("sqlserver_breakpoint.json")


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
        # 尊重 db_config.driver 配置：pymssql 时预设 _use_pymssql=True，
        # 与 test_connection 的标志语义保持一致（odbc/空则走 ODBC 默认路径）
        driver = str(db_config.get("driver", "") or "").strip().lower()
        if driver == "pymssql" or "pymssql" in driver:
            instance._use_pymssql = True
            logger.info("SQLServerCollector: 配置指定 driver=pymssql，将使用 pymssql 通道")
        else:
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
    def _resolve_host(host: str) -> str:
        from backend.app.engine.collector.utils import resolve_host
        return resolve_host(host)

    @staticmethod
    def _build_pymssql_connection(config: dict):
        """创建 pymssql 连接（当 pyodbc 不可用时的备选方案）"""
        import pymssql
        server_raw = config.get("server", "localhost")
        database = config.get("database", "")
        auth_type = config.get("auth_type", "sql")
        username = config.get("username", "sa")
        password = config.get("password", "")

        # pymssql/FreeTDS 处理命名实例不可靠，解析为 host:port 格式
        # 支持格式: "host\instance,port" / "host,port" / "host\instance" / "host"
        host = server_raw
        port = None
        instance = None
        # 提取端口 (逗号后面)
        if ',' in server_raw:
            parts = server_raw.rsplit(',', 1)
            host = parts[0]
            try:
                port = int(parts[1])
            except ValueError:
                pass
        # 提取命名实例 (反斜杠后面)
        if '\\' in host:
            parts = host.split('\\', 1)
            host = parts[0]
            instance = parts[1]

        # 解析主机名到IP地址（解决中文主机名问题）
        host = SQLServerCollector._resolve_host(host)

        # 命名实例且未显式给端口：尝试 SQL Browser 解析 TCP 端口
        # pymssql/FreeTDS 对 host\instance 支持差，ODBC 靠 Browser 可以，这里补齐
        if instance and not port:
            browser_port = resolve_instance_port(host, instance)
            if browser_port:
                port = browser_port
                instance = None

        # 构建 pymssql server 参数：优先 host:port，否则 host\instance
        if port:
            server = f"{host}:{port}"
        elif instance:
            server = f"{host}\\{instance}"
            logger.warning(
                f"pymssql 使用命名实例格式 {server}；若连接失败请改用 IP:端口"
                f"（可先在 SSMS 查看实例端口，或确保 SQL Browser/UDP 1434 可达）"
            )
        else:
            server = host

        logger.info(f"pymssql 连接参数: server={server}, database={database}, auth={auth_type}")
        connect_kwargs = {
            "server": server,
            "database": database,
            "login_timeout": 10,
            "timeout": 30,
        }
        if auth_type == "windows":
            # pymssql Windows 认证：不传 user/password，由 SSPI 自动处理
            return pymssql.connect(**connect_kwargs)
        connect_kwargs["user"] = username
        connect_kwargs["password"] = password
        return pymssql.connect(**connect_kwargs)
    
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
        driver = self._db_config.get("driver", "")

        # 明确选择 pymssql 时，跳过 ODBC
        if driver == "pymssql":
            try:
                conn = self._build_pymssql_connection(self._db_config)
                cursor = conn.cursor()
                cursor.execute("SELECT 1")
                cursor.fetchone()
                conn.close()
                self._use_pymssql = True
                logger.info("SQL Server 连接成功 (pymssql)")
                return True
            except Exception as e:
                logger.error(f"pymssql 连接失败: {e}")
                return False

        # 明确选择 ODBC 时，跳过 pymssql
        if driver == "odbc":
            try:
                from sqlalchemy import text
                with self.engine.connect() as conn:
                    conn.execute(text("SELECT 1"))
                self._use_pymssql = False
                logger.info("SQL Server 连接成功 (ODBC)")
                return True
            except Exception as e:
                logger.error(f"ODBC 连接失败: {e}")
                return False

        # 其他情况：pymssql 优先，pyodbc 兜底
        try:
            conn = self._build_pymssql_connection(self._db_config)
            cursor = conn.cursor()
            cursor.execute("SELECT 1")
            cursor.fetchone()
            conn.close()
            self._use_pymssql = True
            logger.info("SQL Server 连接成功 (pymssql)")
            return True
        except Exception as e:
            logger.warning(f"pymssql 连接失败: {e}")
        try:
            from sqlalchemy import text
            with self.engine.connect() as conn:
                conn.execute(text("SELECT 1"))
            self._use_pymssql = False
            logger.info("SQL Server 连接成功 (pyodbc)")
            return True
        except Exception as e:
            logger.error(f"pyodbc 连接也失败: {e}")
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
            if self._use_pymssql:
                # flat 模式走 pymssql：与 relational 模式同样的分支逻辑
                logger.info("flat 模式使用 pymssql 通道采集")
                conn = self._build_pymssql_connection(self._db_config)
                try:
                    cursor = conn.cursor()
                    if params:
                        cursor.execute(sql, params)
                    else:
                        cursor.execute(sql)
                    rows = cursor.fetchmany(self.init_limit)
                    column_names = [desc[0] for desc in cursor.description] if cursor.description else []
                    for row in rows:
                        row_dict = dict(zip(column_names, row))
                        parsed = self._parse_row(row_dict)
                        if parsed:
                            records.extend(parsed)
                finally:
                    conn.close()
            else:
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
            parsed = parse_datetime(max_time)
            if parsed:
                self._last_collect_time = parsed
                self._save_breakpoint()

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

            # 查询新样本：时间条件作用在 Sample 子查询上
            sample_where = ""
            join_where = ""
            if self._use_pymssql:
                time_params: tuple = ()
                rep_params: tuple = ()
                if self._last_collect_time:
                    sample_where = f"WHERE s0.[{self.time_col}] > %s"
                    time_params = (self._last_collect_time,)
                if self.rep_no_ref is not None:
                    join_where = "WHERE p.[RepNoRef] = %s"
                    rep_params = (self.rep_no_ref,)
                params: Any = time_params + rep_params
            else:
                named: Dict[str, Any] = {}
                if self._last_collect_time:
                    sample_where = f"WHERE s0.[{self.time_col}] > :last_time"
                    named["last_time"] = self._last_collect_time
                if self.rep_no_ref is not None:
                    join_where = "WHERE p.[RepNoRef] = :rep_no_ref"
                    named["rep_no_ref"] = self.rep_no_ref
                params = named

            # 初始导入：TOP N 取「样本数」而不是关联行数。
            # 每个样本在 Prediction 中有多组分行；若对 JOIN 结果 TOP 1000，
            # 可能只覆盖约 1000/组分数 个样本（例如每样本 250 组分 → 仅 4 个样本），
            # 导致「脂肪」等单指标只剩几条。先取最新 N 个样本，再展开组分。
            top_n = self.init_limit if not self._last_collect_time else 200
            sql = f"""
                SELECT
                    s.[SampNo],
                    s.[{self.product_ref_col}],
                    s.[{self.time_col}],
                    p.[{self.component_ref_col}],
                    p.[{self.value_col}],
                    s.[SampleId],
                    s.[Remark]
                FROM (
                    SELECT TOP {top_n}
                        s0.[SampNo],
                        s0.[{self.product_ref_col}],
                        s0.[{self.time_col}],
                        s0.[SampleId],
                        s0.[Remark]
                    FROM [{self.sample_table}] s0
                    {sample_where}
                    ORDER BY s0.[{self.time_col}] DESC
                ) s
                INNER JOIN [{self.prediction_table}] p ON s.[SampNo] = p.[SampRef]
                {join_where}
                ORDER BY s.[{self.time_col}] DESC
            """
            logger.info(
                f"关系模式采集: 取最新 {top_n} 个样本再展开组分"
                f"（增量={bool(self._last_collect_time)}, driver={'pymssql' if self._use_pymssql else 'odbc'}）"
            )

            records = []
            if self._use_pymssql:
                conn = self._build_pymssql_connection(self._db_config)
                try:
                    cursor = conn.cursor()
                    if params:
                        cursor.execute(sql, params)
                    else:
                        cursor.execute(sql)
                    rows = cursor.fetchall()
                finally:
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
                    sample_id = row[5] if len(row) > 5 else None
                    remark = row[6] if len(row) > 6 else None

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
                        'sample_id': sample_id.strip() if isinstance(sample_id, str) else (str(sample_id) if sample_id else None),
                        'remark': remark.strip() if isinstance(remark, str) and remark.strip() else None,
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
                try:
                    cursor = conn.cursor()
                    cursor.execute(sql)
                    rows = cursor.fetchall()
                finally:
                    conn.close()
            else:
                from sqlalchemy import text
                with self.engine.connect() as conn:
                    rows = conn.execute(text(sql)).fetchall()
            self._products_cache = {row[0]: row[1] for row in rows if row[0] is not None}
        except Exception as e:
            logger.error(f"加载产品表失败: {e}")
            self._products_cache = None  # 不缓存失败结果，下次重试
        return self._products_cache or {}

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
                try:
                    cursor = conn.cursor()
                    cursor.execute(sql)
                    rows = cursor.fetchall()
                finally:
                    conn.close()
            else:
                from sqlalchemy import text
                with self.engine.connect() as conn:
                    rows = conn.execute(text(sql)).fetchall()
            self._components_cache = {row[0]: row[1] for row in rows if row[0] is not None}
        except Exception as e:
            logger.error(f"加载指标表失败: {e}")
            self._components_cache = None  # 不缓存失败结果，下次重试
        return self._components_cache or {}
    
    def get_breakpoint(self) -> Dict[str, Any]:
        return {
            'last_collect_time': self._last_collect_time.isoformat() if self._last_collect_time else None,
            'table_name': self.table_name or self.sample_table,
        }

    def set_breakpoint(self, last_collect_time: str):
        parsed = parse_datetime(last_collect_time)
        if parsed:
            self._last_collect_time = parsed
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
            if self._use_pymssql:
                return (
                    f"WHERE [{self.time_column}] > %s",
                    (self._last_collect_time,)
                )
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

        sample_id_val = row_dict.get(self.sample_column) if hasattr(self, 'sample_column') and self.sample_column else None
        
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
                'sample_id': str(sample_id_val).strip() if sample_id_val else None,
                'remark': None,
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
        sql = f"""
            SELECT DISTINCT [{self.product_column}] as product_name
            FROM [{self.table_name}]
            WHERE [{self.product_column}] IS NOT NULL
            ORDER BY [{self.product_column}]
        """
        try:
            if self._use_pymssql:
                conn = self._build_pymssql_connection(self._db_config)
                try:
                    cursor = conn.cursor()
                    cursor.execute(sql)
                    rows = cursor.fetchall()
                finally:
                    conn.close()
            else:
                from sqlalchemy import text
                with self.engine.connect() as conn:
                    rows = conn.execute(text(sql)).fetchall()
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
        return load_spec_limits(get_conf_path("spec_limits.json"), product_code)

    def clear_cache(self):
        self._products_cache = None
        self._components_cache = None

    def close(self):
        if self._engine:
            self._engine.dispose()
            self._engine = None
