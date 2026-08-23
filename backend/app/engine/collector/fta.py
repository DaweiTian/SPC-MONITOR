import logging
from datetime import datetime
from typing import Dict, Any, List, Optional
from .base import BaseCollector
from .utils import parse_datetime, load_breakpoint, save_breakpoint, build_connection_string

logger = logging.getLogger(__name__)

BREAKPOINT_FILE = "fta_breakpoint.json"


class FTACollector(BaseCollector):
    """FTA (Perten) 数据采集器

    Perten 品牌乳品分析仪，数据库结构：
    - EstimateEvent: 样本事件（产品名、时间、样本号）
    - Estimate: 测量结果（指标名、预测值、报告值）
    - ProductSpecParameter: 规格限
    - AnalysisParameter: 指标定义
    """

    def __init__(
        self,
        connection_string: str,
        storage=None,
        use_pymssql: bool = True,
        db_config: Optional[Dict[str, Any]] = None,
        init_limit: int = 100,
    ):
        super().__init__(storage, init_limit=init_limit)
        self.connection_string = connection_string
        self._use_pymssql = use_pymssql
        self._db_config = db_config or {}
        self._last_collect_time: Optional[datetime] = self._load_breakpoint()
        self._engine = None
        self._products_cache: Optional[List[Dict[str, str]]] = None
        self._indicators_cache: Optional[List[Dict[str, Any]]] = None

    @classmethod
    def from_config(cls, db_config: dict, storage=None, init_limit: int = 100):
        conn_str = build_connection_string(db_config)
        instance = cls(
            connection_string=conn_str,
            storage=storage,
            db_config=db_config,
            init_limit=init_limit,
        )
        return instance

    def _load_breakpoint(self) -> Optional[datetime]:
        ts = load_breakpoint(BREAKPOINT_FILE)
        return parse_datetime(ts) if ts else None

    def _save_breakpoint(self):
        if self._last_collect_time:
            save_breakpoint(BREAKPOINT_FILE, self._last_collect_time.isoformat())

    def _get_connection(self):
        import pymssql
        server = self._db_config.get("server", "localhost")

        # Parse server\instance,port format
        # Example: XTZJ-20230331ga\Perten,1433
        host = server
        port = self._db_config.get("port")

        if "\\" in server:
            parts = server.split("\\")
            host = parts[0]
            instance_port = parts[1]
            if "," in instance_port:
                instance, port_str = instance_port.split(",", 1)
                if not port:
                    port = int(port_str)
        elif "," in server:
            host, port_str = server.split(",", 1)
            if not port:
                port = int(port_str)

        kwargs = {
            "server": host,
            "database": self._db_config.get("database", "Pert_Application"),
        }

        auth_type = self._db_config.get("auth_type", "sql")
        if auth_type != "windows":
            kwargs["user"] = self._db_config.get("username", "sa")
            kwargs["password"] = self._db_config.get("password", "")
        # Windows 认证：不传 user/password，pymssql 自动使用 SSPI

        if port:
            kwargs["port"] = int(port)
        return pymssql.connect(**kwargs)

    def test_connection(self) -> bool:
        try:
            conn = self._get_connection()
            cursor = conn.cursor()
            cursor.execute("SELECT 1")
            cursor.fetchone()
            conn.close()
            return True
        except Exception as e:
            logger.error(f"FTA 数据库连接失败: {e}")
            return False

    def test_tables(self) -> Dict[str, Any]:
        result = {"success": False, "tables": {}, "message": ""}
        required = ["EstimateEvent", "Estimate", "AnalysisParameter", "Product"]
        try:
            conn = self._get_connection()
            cursor = conn.cursor()
            cursor.execute("SELECT name FROM sys.tables")
            existing_tables = {row[0] for row in cursor}
            conn.close()
            for t in required:
                result["tables"][t] = t in existing_tables
            if all(result["tables"].values()):
                result["success"] = True
                result["message"] = "FTA 表结构完整"
            else:
                missing = [t for t, ok in result["tables"].items() if not ok]
                result["message"] = f"缺少表: {', '.join(missing)}"
        except Exception as e:
            result["message"] = f"检查失败: {e}"
        return result

    def collect(self) -> Dict[str, Any]:
        now = datetime.now()
        try:
            conn = self._get_connection()
            cursor = conn.cursor()

            # 查询新样本
            where = ""
            params = ()
            if self._last_collect_time:
                where = "WHERE ee.AnalysisStartTime > %s"
                params = (self._last_collect_time,)

            top_n = self.init_limit if not self._last_collect_time else 200
            sql = f"""
                SELECT TOP {top_n}
                    ee.EstimateEventID,
                    ee.AnalysisStartTime,
                    ee.ProductSpecProfileName,
                    ee.SampleNumber,
                    e.ParameterTypeName,
                    e.PredictedResult,
                    e.ReportedResult,
                    e.UnitTypeName
                FROM EstimateEvent ee
                INNER JOIN Estimate e ON ee.EstimateEventID = e.EstimateEventID
                {where}
                ORDER BY ee.AnalysisStartTime DESC
            """

            if params:
                cursor.execute(sql, params)
            else:
                cursor.execute(sql)
            rows = cursor.fetchall()
            conn.close()

            records = []
            for row in rows:
                event_id = row[0]
                analysis_time = row[1]
                product_name = row[2]
                sample_number = row[3]
                parameter_name = row[4]
                predicted_result = row[5]
                reported_result = row[6]
                unit_type = row[7]

                if analysis_time is None or product_name is None or parameter_name is None:
                    continue

                # 使用 ReportedResult 优先，否则 PredictedResult
                value = reported_result if reported_result is not None else predicted_result
                if value is None:
                    continue

                try:
                    value = float(value)
                except (ValueError, TypeError):
                    continue

                # Get correction value and apply
                product_code = product_name.strip()
                indicator_code = parameter_name.lower()
                correction = self._get_correction(product_code, indicator_code)
                raw_value = value
                value = round(value + correction, 4)

                if isinstance(analysis_time, datetime):
                    time_str = analysis_time.isoformat()
                else:
                    time_str = str(analysis_time)

                record = {
                    'indicator_code': indicator_code,
                    'indicator_name': parameter_name,
                    'product_code': product_code,
                    'product_name': product_name,
                    'value': value,
                    'raw_value': round(raw_value, 4),
                    'correction': correction,
                    'unit': unit_type or '',
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
            logger.error(f"FTA 采集失败: {e}", exc_info=True)
            return {
                'new_records': 0,
                'error': str(e),
                'timestamp': now.isoformat(),
            }

    def get_products(self) -> List[Dict[str, str]]:
        if self._products_cache is not None:
            return self._products_cache
        try:
            conn = self._get_connection()
            cursor = conn.cursor()
            cursor.execute("""
                SELECT DISTINCT ProductSpecProfileName
                FROM EstimateEvent
                WHERE ProductSpecProfileName IS NOT NULL
                ORDER BY ProductSpecProfileName
            """)
            rows = cursor.fetchall()
            conn.close()
            self._products_cache = [
                {'code': row[0].strip(), 'name': row[0]}
                for row in rows if row[0]
            ]
        except Exception as e:
            logger.error(f"FTA 获取产品列表失败: {e}")
            self._products_cache = []
        return self._products_cache

    def get_indicators(self) -> List[Dict[str, Any]]:
        if self._indicators_cache is not None:
            return self._indicators_cache
        try:
            conn = self._get_connection()
            cursor = conn.cursor()
            cursor.execute("""
                SELECT DISTINCT ParameterTypeName, UnitTypeName
                FROM Estimate
                WHERE ParameterTypeName IS NOT NULL
                ORDER BY ParameterTypeName
            """)
            rows = cursor.fetchall()
            conn.close()
            self._indicators_cache = [
                {'code': row[0].lower(), 'name': row[0], 'unit': row[1] or ''}
                for row in rows if row[0]
            ]
        except Exception as e:
            logger.error(f"FTA 获取指标列表失败: {e}")
            self._indicators_cache = []
        return self._indicators_cache

    def get_spec_limits(self, product_code: str = None) -> Dict[str, Dict[str, float]]:
        # FTA 的规格限存储在 ProductSpecParameter 表中
        # 可以后续扩展
        return {}

    def get_breakpoint(self) -> Dict[str, Any]:
        return {
            'last_collect_time': self._last_collect_time.isoformat() if self._last_collect_time else None,
        }

    def set_breakpoint(self, last_collect_time: str):
        self._last_collect_time = datetime.fromisoformat(last_collect_time)
        self._save_breakpoint()

    def close(self):
        if self._engine:
            self._engine.dispose()
            self._engine = None
