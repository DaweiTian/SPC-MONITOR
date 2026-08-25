import logging
import sqlite3
import threading
from contextlib import contextmanager
from datetime import datetime, date
from pathlib import Path
from typing import Any

logger = logging.getLogger(__name__)

class OnlineStorage:
    """在线监控数据的 SQLite 存储管理"""
    
    def __init__(self, db_path: str) -> None:
        self.db_path = db_path
        self._disabled_products: set[str] = set()
        self._excluded_remarks: list[str] = []
        self._local = threading.local()
        Path(db_path).parent.mkdir(parents=True, exist_ok=True)

    def set_disabled_products(self, product_codes: set[str]) -> None:
        self._disabled_products = product_codes

    def set_excluded_remarks(self, keywords: list[str]) -> None:
        self._excluded_remarks = keywords
    
    def _connect(self) -> sqlite3.Connection:
        conn = sqlite3.connect(self.db_path)
        conn.row_factory = sqlite3.Row
        conn.execute("PRAGMA journal_mode=WAL")
        conn.execute("PRAGMA foreign_keys=ON")
        return conn

    def _get_conn(self) -> sqlite3.Connection:
        """Get or create a thread-local connection."""
        if not hasattr(self._local, 'conn') or self._local.conn is None:
            self._local.conn = self._connect()
        return self._local.conn

    @contextmanager
    def _connection(self):
        """Context manager yielding a thread-local connection (no close on exit)."""
        conn = self._get_conn()
        try:
            yield conn
        except Exception:
            conn.rollback()
            raise
    
    def init_db(self) -> None:
        with self._connection() as conn:
            conn.executescript("""
                CREATE TABLE IF NOT EXISTS monitor_data (
                    id INTEGER PRIMARY KEY AUTOINCREMENT,
                    indicator_code TEXT NOT NULL,
                    indicator_name TEXT,
                    product_code TEXT NOT NULL,
                    product_name TEXT,
                    value REAL NOT NULL,
                    raw_value REAL,
                    correction REAL DEFAULT 0,
                    unit TEXT,
                    upper_limit REAL,
                    lower_limit REAL,
                    is_qualified INTEGER DEFAULT 1,
                    sample_time TEXT NOT NULL,
                    sample_id TEXT,
                    remark TEXT,
                    created_at TEXT DEFAULT (datetime('now', 'localtime')),
                    UNIQUE(indicator_code, product_code, sample_time)
                );

                CREATE TABLE IF NOT EXISTS alerts (
                    id INTEGER PRIMARY KEY AUTOINCREMENT,
                    alert_id TEXT NOT NULL UNIQUE,
                    alert_type TEXT NOT NULL,
                    severity TEXT NOT NULL DEFAULT 'warning',
                    indicator_code TEXT,
                    indicator_name TEXT,
                    source_indicator TEXT,
                    product_code TEXT,
                    rule_type TEXT,
                    rule_desc TEXT,
                    test_value REAL,
                    control_limit TEXT,
                    message TEXT NOT NULL,
                    detail TEXT,
                    sample_id TEXT,
                    remark TEXT,
                    status TEXT NOT NULL DEFAULT 'pending',
                    created_at TEXT DEFAULT (datetime('now', 'localtime')),
                    resolved_at TEXT,
                    resolved_by TEXT,
                    resolve_note TEXT
                );
                
                CREATE TABLE IF NOT EXISTS sync_log (
                    id INTEGER PRIMARY KEY AUTOINCREMENT,
                    source TEXT NOT NULL,
                    sync_type TEXT NOT NULL DEFAULT 'data',
                    status TEXT NOT NULL DEFAULT 'success',
                    records_count INTEGER DEFAULT 0,
                    error_message TEXT,
                    started_at TEXT NOT NULL,
                    finished_at TEXT DEFAULT (datetime('now', 'localtime'))
                );
                
                CREATE INDEX IF NOT EXISTS idx_data_indicator
                    ON monitor_data(indicator_code, product_code);
                CREATE INDEX IF NOT EXISTS idx_data_sample_time
                    ON monitor_data(sample_time);
                CREATE INDEX IF NOT EXISTS idx_alerts_status
                    ON alerts(status);
                CREATE INDEX IF NOT EXISTS idx_alerts_severity
                    ON alerts(severity);
                CREATE INDEX IF NOT EXISTS idx_sync_log_started
                    ON sync_log(started_at);

                CREATE TABLE IF NOT EXISTS prediction_results (
                    id INTEGER PRIMARY KEY AUTOINCREMENT,
                    product_code TEXT NOT NULL,
                    indicator_code TEXT NOT NULL,
                    model TEXT NOT NULL,
                    horizon INTEGER NOT NULL,
                    predictions_json TEXT,
                    risk_json TEXT,
                    created_at TEXT DEFAULT (datetime('now', 'localtime'))
                );

                CREATE TABLE IF NOT EXISTS risk_predictions (
                    id INTEGER PRIMARY KEY AUTOINCREMENT,
                    product_code TEXT NOT NULL,
                    indicator_code TEXT NOT NULL,
                    risk_level TEXT NOT NULL,
                    breach_probability REAL,
                    breach_direction TEXT,
                    details_json TEXT,
                    created_at TEXT DEFAULT (datetime('now', 'localtime'))
                );

                CREATE TABLE IF NOT EXISTS process_segments (
                    id INTEGER PRIMARY KEY AUTOINCREMENT,
                    product_code TEXT NOT NULL,
                    indicator_code TEXT NOT NULL,
                    segment_start INTEGER NOT NULL,
                    segment_end INTEGER NOT NULL,
                    segment_length INTEGER,
                    cusum_pos_max REAL,
                    cusum_neg_max REAL,
                    drift_detected INTEGER DEFAULT 0,
                    drift_direction TEXT,
                    created_at TEXT DEFAULT (datetime('now', 'localtime'))
                );

                CREATE INDEX IF NOT EXISTS idx_prediction_results_product
                    ON prediction_results(product_code, indicator_code);
                CREATE INDEX IF NOT EXISTS idx_risk_predictions_product
                    ON risk_predictions(product_code, indicator_code);
                CREATE INDEX IF NOT EXISTS idx_process_segments_product
                    ON process_segments(product_code, indicator_code);
            """)
            conn.commit()

            # Migration: add raw_value and correction columns if missing
            cursor = conn.execute("PRAGMA table_info(monitor_data)")
            columns = {row[1] for row in cursor.fetchall()}
            if 'raw_value' not in columns:
                conn.execute("ALTER TABLE monitor_data ADD COLUMN raw_value REAL")
            if 'correction' not in columns:
                conn.execute("ALTER TABLE monitor_data ADD COLUMN correction REAL DEFAULT 0")
            if 'sample_id' not in columns:
                conn.execute("ALTER TABLE monitor_data ADD COLUMN sample_id TEXT")
            if 'remark' not in columns:
                conn.execute("ALTER TABLE monitor_data ADD COLUMN remark TEXT")
            if 'is_voided' not in columns:
                conn.execute("ALTER TABLE monitor_data ADD COLUMN is_voided INTEGER DEFAULT 0")
            if 'is_predicted' not in columns:
                conn.execute("ALTER TABLE monitor_data ADD COLUMN is_predicted INTEGER DEFAULT 0")
            conn.commit()

    def save_data(self, records: list[dict[str, Any]]) -> int:
        with self._connection() as conn:
            count = 0
            for record in records:
                product_code = record.get("product_code")
                if product_code and product_code in self._disabled_products:
                    continue
                try:
                    conn.execute(
                        """INSERT INTO monitor_data
                           (indicator_code, indicator_name, product_code, product_name,
                            value, raw_value, correction, unit, upper_limit, lower_limit,
                            is_qualified, sample_time, sample_id, remark)
                           VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?)""",
                        (
                            record.get("indicator_code"),
                            record.get("indicator_name"),
                            product_code,
                            record.get("product_name"),
                            record.get("value"),
                            record.get("raw_value", record.get("value")),
                            record.get("correction", 0),
                            record.get("unit"),
                            record.get("upper_limit"),
                            record.get("lower_limit"),
                            record.get("is_qualified", 1),
                            record.get("sample_time"),
                            record.get("sample_id"),
                            record.get("remark"),
                        ),
                    )
                    count += 1
                except sqlite3.IntegrityError:
                    logger.debug(f"Duplicate skipped: {record.get('indicator_code')}/{record.get('product_code')}")
            conn.commit()
            return count

    def save_predicted_data(self, records: list[dict[str, Any]]) -> int:
        """保存预测数据，自动标记is_predicted=1。不覆盖已有的真实数据。"""
        if not records:
            return 0
        with self._connection() as conn:
            saved = 0
            for r in records:
                try:
                    cursor = conn.execute(
                        """INSERT INTO monitor_data
                           (indicator_code, indicator_name, product_code, product_name,
                            value, unit, sample_time, is_predicted)
                           SELECT ?, ?, ?, ?, ?, ?, ?, 1
                           WHERE NOT EXISTS (
                               SELECT 1 FROM monitor_data
                               WHERE indicator_code = ? AND product_code = ? AND sample_time = ? AND is_predicted = 0
                           )""",
                        (
                            r.get("indicator_code"),
                            r.get("indicator_name"),
                            r.get("product_code"),
                            r.get("product_name"),
                            r.get("value"),
                            r.get("unit", "g/100g"),
                            r.get("sample_time"),
                            r.get("indicator_code"),
                            r.get("product_code"),
                            r.get("sample_time"),
                        ),
                    )
                    if cursor.rowcount > 0:
                        saved += 1
                except Exception as e:
                    logger.warning(f"保存预测记录失败: {e}")
                    continue
            conn.commit()
            return saved

    def save_alert(self, alert: dict[str, Any]) -> int:
        with self._connection() as conn:
            # 确保新列存在
            for col in ['indicator_name', 'source_indicator', 'sample_id', 'remark']:
                try:
                    conn.execute(f"ALTER TABLE alerts ADD COLUMN {col} TEXT")
                except sqlite3.OperationalError:
                    pass  # 列已存在
            
            cursor = conn.execute(
                """INSERT OR IGNORE INTO alerts
                   (alert_id, alert_type, severity, indicator_code, indicator_name, source_indicator, product_code,
                    rule_type, rule_desc, test_value, control_limit, message, detail, sample_id, remark, status)
                   VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?)""",
                (
                    alert.get("alert_id"),
                    alert.get("alert_type", "spc_violation"),
                    alert.get("severity", "warning"),
                    alert.get("indicator_code"),
                    alert.get("indicator_name"),
                    alert.get("source_indicator"),
                    alert.get("product_code"),
                    alert.get("rule_type"),
                    alert.get("rule_desc"),
                    alert.get("test_value"),
                    alert.get("control_limit"),
                    alert.get("message", alert.get("rule_desc", "")),
                    alert.get("detail"),
                    alert.get("sample_id"),
                    alert.get("remark"),
                    alert.get("status", "pending"),
                ),
            )
            conn.commit()
            return cursor.lastrowid
    
    def get_recent_data(
        self, indicator_code: str, product_code: str, limit: int = 20,
        exclude_remarks: list[str] | None = None,
    ) -> list[dict[str, Any]]:
        with self._connection() as conn:
            conditions = ["indicator_code = ?", "product_code = ?", "(is_voided = 0 OR is_voided IS NULL)"]
            params: list[Any] = [indicator_code, product_code]
            for kw in (exclude_remarks or []):
                conditions.append("(remark IS NULL OR remark NOT LIKE ?)")
                params.append(f"%{kw}%")
            where = f"WHERE {' AND '.join(conditions)}"
            params.append(limit)
            cursor = conn.execute(
                f"SELECT * FROM monitor_data {where} ORDER BY sample_time DESC LIMIT ?",
                params,
            )
            return [dict(row) for row in cursor.fetchall()]

    def get_filtered_data(
        self,
        indicator_code: str,
        product_code: str,
        date_from: str | None = None,
        date_to: str | None = None,
        remark: str | None = None,
        limit: int = 500,
        exclude_remarks: list[str] | None = None,
    ) -> list[dict[str, Any]]:
        with self._connection() as conn:
            conditions = ["indicator_code = ?", "product_code = ?", "(is_voided = 0 OR is_voided IS NULL)"]
            params: list[Any] = [indicator_code, product_code]
            if date_from:
                conditions.append("sample_time >= ?")
                params.append(date_from)
            if date_to:
                conditions.append("sample_time <= ?")
                params.append(date_to + " 23:59:59")
            if remark:
                conditions.append("remark LIKE ?")
                params.append(f"%{remark}%")
            for kw in (exclude_remarks or []):
                conditions.append("(remark IS NULL OR remark NOT LIKE ?)")
                params.append(f"%{kw}%")
            where = f"WHERE {' AND '.join(conditions)}"
            params.append(limit)
            cursor = conn.execute(
                f"SELECT * FROM monitor_data {where} ORDER BY sample_time DESC LIMIT ?",
                params,
            )
            return [dict(row) for row in cursor.fetchall()]

    def get_all_data(
        self,
        page: int = 1,
        page_size: int = 20,
        date: str | None = None,
        product_code: str | None = None,
        indicator_code: str | None = None,
        date_from: str | None = None,
        date_to: str | None = None,
    ) -> dict[str, Any]:
        with self._connection() as conn:
            conditions: list[str] = []
            params: list[Any] = []
            if date_from:
                conditions.append("sample_time >= ?")
                params.append(date_from)
            if date_to:
                conditions.append("sample_time <= ?")
                params.append(date_to + " 23:59:59")
            elif date:
                conditions.append("sample_time LIKE ?")
                params.append(f"{date}%")
            if product_code:
                conditions.append("product_code = ?")
                params.append(product_code)
            if indicator_code:
                conditions.append("indicator_code = ?")
                params.append(indicator_code)
            where = f"WHERE {' AND '.join(conditions)}" if conditions else ""
            cursor = conn.execute(f"SELECT COUNT(*) FROM monitor_data {where}", params)
            total = cursor.fetchone()[0]
            offset = (page - 1) * page_size
            params.extend([page_size, offset])
            cursor = conn.execute(
                f"SELECT * FROM monitor_data {where} ORDER BY sample_time DESC LIMIT ? OFFSET ?",
                params,
            )
            return {"data": [dict(row) for row in cursor.fetchall()], "total": total, "page": page, "page_size": page_size}

    def get_product_indicator_count(self, product_code: str) -> int:
        with self._connection() as conn:
            cursor = conn.execute(
                "SELECT COUNT(DISTINCT indicator_code) FROM monitor_data WHERE product_code = ?",
                (product_code,),
            )
            return cursor.fetchone()[0]

    def get_product_indicator_codes(self, product_code: str) -> list[str]:
        with self._connection() as conn:
            cursor = conn.execute(
                "SELECT DISTINCT indicator_code FROM monitor_data WHERE product_code = ?",
                (product_code,),
            )
            return [row["indicator_code"] for row in cursor.fetchall()]

    def get_all_product_indicator_codes(self) -> dict[str, list[str]]:
        with self._connection() as conn:
            cursor = conn.execute(
                "SELECT DISTINCT product_code, indicator_code FROM monitor_data ORDER BY product_code"
            )
            result: dict[str, list[str]] = {}
            for row in cursor.fetchall():
                pc = row["product_code"]
                if pc not in result:
                    result[pc] = []
                result[pc].append(row["indicator_code"])
            return result

    def get_alerts(
        self,
        severity: str | None = None,
        status: str | None = None,
        product_code: str | None = None,
        rule_type: str | None = None,
        search: str | None = None,
        date_from: str | None = None,
        date_to: str | None = None,
        limit: int = 50,
        offset: int = 0,
    ) -> dict[str, Any]:
        with self._connection() as conn:
            conditions: list[str] = []
            params: list[Any] = []
            if severity is not None:
                conditions.append("severity = ?")
                params.append(severity)
            if status is not None:
                conditions.append("status = ?")
                params.append(status)
            if product_code is not None:
                conditions.append("product_code = ?")
                params.append(product_code)
            if rule_type is not None:
                conditions.append("rule_type = ?")
                params.append(rule_type)
            if search is not None:
                conditions.append("(product_code LIKE ? OR indicator_code LIKE ? OR message LIKE ? OR rule_desc LIKE ?)")
                like = f"%{search}%"
                params.extend([like, like, like, like])
            if date_from is not None:
                conditions.append("created_at >= ?")
                params.append(date_from)
            if date_to is not None:
                conditions.append("created_at <= ? || ' 23:59:59'")
                params.append(date_to)

            where = f"WHERE {' AND '.join(conditions)}" if conditions else ""

            # Count total
            cursor = conn.execute(f"SELECT COUNT(*) FROM alerts {where}", params)
            total = cursor.fetchone()[0]

            # Fetch page
            params.extend([limit, offset])
            cursor = conn.execute(
                f"""SELECT * FROM alerts
                    {where}
                    ORDER BY created_at DESC
                    LIMIT ? OFFSET ?""",
                params,
            )
            return {"alerts": [dict(row) for row in cursor.fetchall()], "total": total}
    
    def resolve_alert(self, alert_id: str, resolved_by: str, note: str = "") -> bool:
        with self._connection() as conn:
            cursor = conn.execute(
                """UPDATE alerts
                   SET status = 'resolved',
                       resolved_at = datetime('now', 'localtime'),
                       resolved_by = ?,
                       resolve_note = ?
                   WHERE alert_id = ? AND status = 'pending'""",
                (resolved_by, note, alert_id),
            )
            conn.commit()
            return cursor.rowcount > 0

    def resolve_alert_and_void(self, alert_id: str, resolved_by: str, note: str = "") -> bool:
        with self._connection() as conn:
            cursor = conn.execute(
                "SELECT indicator_code, product_code, test_value FROM alerts WHERE alert_id = ? AND status = 'pending'",
                (alert_id,),
            )
            alert_row = cursor.fetchone()
            if not alert_row:
                return False
            indicator_code = alert_row["indicator_code"]
            product_code = alert_row["product_code"]
            test_value = alert_row["test_value"]
            if indicator_code and product_code:
                if test_value is not None:
                    cursor = conn.execute(
                        """UPDATE monitor_data SET is_voided = 1
                           WHERE indicator_code = ? AND product_code = ?
                             AND value = ? AND (is_voided = 0 OR is_voided IS NULL)
                           ORDER BY sample_time DESC LIMIT 1""",
                        (indicator_code, product_code, round(float(test_value), 4)),
                    )
                else:
                    cursor = conn.execute(
                        """UPDATE monitor_data SET is_voided = 1
                           WHERE indicator_code = ? AND product_code = ?
                             AND (is_voided = 0 OR is_voided IS NULL)
                           ORDER BY sample_time DESC LIMIT 1""",
                        (indicator_code, product_code),
                    )
            void_note = f"[作废数据] {note}" if note else "[作废数据]"
            cursor = conn.execute(
                """UPDATE alerts
                   SET status = 'resolved',
                       resolved_at = datetime('now', 'localtime'),
                       resolved_by = ?,
                       resolve_note = ?
                   WHERE alert_id = ? AND status = 'pending'""",
                (resolved_by, void_note, alert_id),
            )
            conn.commit()
            return cursor.rowcount > 0

    def clear_pending_alerts(self) -> int:
        with self._connection() as conn:
            cursor = conn.execute("DELETE FROM alerts WHERE status = 'pending'")
            conn.commit()
            return cursor.rowcount

    def count_pending_alerts(self) -> dict[str, Any]:
        with self._connection() as conn:
            cursor = conn.execute(
                "SELECT severity, COUNT(*) as cnt FROM alerts WHERE status = 'pending' GROUP BY severity"
            )
            counts = {"CRITICAL": 0, "WARNING": 0, "INFO": 0, "total": 0}
            for row in cursor.fetchall():
                sev = row["severity"]
                cnt = row["cnt"]
                if sev in counts:
                    counts[sev] = cnt
                counts["total"] += cnt
            return counts

    def get_distinct_alert_products(self) -> list[str]:
        with self._connection() as conn:
            cursor = conn.execute(
                "SELECT DISTINCT product_code FROM alerts WHERE product_code IS NOT NULL AND product_code != '' ORDER BY product_code"
            )
            return [row["product_code"] for row in cursor.fetchall()]

    def get_today_stats(self) -> dict[str, Any]:
        with self._connection() as conn:
            today = date.today().isoformat()
            
            cursor = conn.execute(
                "SELECT COUNT(*) FROM monitor_data WHERE sample_time LIKE ? AND (is_voided = 0 OR is_voided IS NULL)",
                (f"{today}%",),
            )
            data_count = cursor.fetchone()[0]

            cursor = conn.execute(
                """SELECT COUNT(*) FROM monitor_data
                   WHERE sample_time LIKE ? AND is_qualified = 0 AND (is_voided = 0 OR is_voided IS NULL)""",
                (f"{today}%",),
            )
            unqualified_count = cursor.fetchone()[0]
            
            cursor = conn.execute(
                "SELECT COUNT(*) FROM alerts WHERE created_at LIKE ?",
                (f"{today}%",),
            )
            alert_count = cursor.fetchone()[0]
            
            cursor = conn.execute(
                "SELECT COUNT(*) FROM alerts WHERE status = 'pending'"
            )
            pending_alerts = cursor.fetchone()[0]
            
            cursor = conn.execute(
                "SELECT COUNT(*) FROM sync_log WHERE started_at LIKE ?",
                (f"{today}%",),
            )
            sync_count = cursor.fetchone()[0]
            
            # Collection success stats
            cursor = conn.execute(
                "SELECT COUNT(*) FROM sync_log WHERE started_at LIKE ? AND status = 'success'",
                (f"{today}%",),
            )
            collect_success = cursor.fetchone()[0]
            
            cursor = conn.execute(
                "SELECT COUNT(*) FROM sync_log WHERE started_at LIKE ?",
                (f"{today}%",),
            )
            collect_attempts = cursor.fetchone()[0]
            
            return {
                "date": today,
                "data_count": data_count,
                "unqualified_count": unqualified_count,
                "alert_count": alert_count,
                "pending_alerts": pending_alerts,
                "sync_count": sync_count,
                "collect_attempts": collect_attempts,
                "collect_success": collect_success,
            }
    
    def get_products_with_data(self, limit: int = 50) -> list[dict[str, Any]]:
        """Get products that have data in the database."""
        with self._connection() as conn:
            cursor = conn.execute(
                """SELECT product_code, product_name, COUNT(*) as data_count
                   FROM monitor_data
                   GROUP BY product_code
                   ORDER BY data_count DESC
                   LIMIT ?""",
                (limit,),
            )
            return [dict(row) for row in cursor.fetchall()]

    def get_recent_collection_counts(self, days: int = 10) -> dict[str, dict[str, int]]:
        """Get collection counts per product_code and indicator_code for the last N days."""
        with self._connection() as conn:
            # Per-product counts
            cursor = conn.execute(
                """SELECT product_code, COUNT(*) as cnt
                   FROM monitor_data
                   WHERE sample_time >= datetime('now', 'localtime', ?)
                   GROUP BY product_code""",
                (f'-{days} days',),
            )
            product_counts = {row["product_code"]: row["cnt"] for row in cursor.fetchall()}

            # Per-indicator counts
            cursor = conn.execute(
                """SELECT indicator_code, COUNT(*) as cnt
                   FROM monitor_data
                   WHERE sample_time >= datetime('now', 'localtime', ?)
                   GROUP BY indicator_code""",
                (f'-{days} days',),
            )
            indicator_counts = {row["indicator_code"]: row["cnt"] for row in cursor.fetchall()}

            return {"products": product_counts, "indicators": indicator_counts}
    
    def log_collection(self, status: str, records_count: int = 0, error_message: str | None = None) -> None:
        """Log a collection attempt to sync_log."""
        with self._connection() as conn:
            conn.execute(
                """INSERT INTO sync_log (source, sync_type, status, records_count, error_message, started_at)
                   VALUES (?, ?, ?, ?, ?, datetime('now', 'localtime'))""",
                ("collector", "data", status, records_count, error_message),
            )
            conn.commit()

    def update_correction(self, record_id: int, correction: float) -> bool:
        """Update correction value for a specific record and recalculate value."""
        with self._connection() as conn:
            cursor = conn.execute(
                "SELECT value, raw_value FROM monitor_data WHERE id = ?",
                (record_id,)
            )
            row = cursor.fetchone()
            if not row:
                return False
            # For old data where raw_value is null, use current value (correction was 0)
            raw_value = row["raw_value"] if row["raw_value"] is not None else row["value"]
            new_value = round(raw_value + correction, 4)
            cursor = conn.execute(
                """UPDATE monitor_data
                   SET correction = ?, value = ?, raw_value = ?
                   WHERE id = ?""",
                (correction, new_value, raw_value, record_id),
            )
            conn.commit()
            return cursor.rowcount > 0

    def update_record_fields(self, record_id: int, fields: dict[str, Any]) -> bool:
        """Update specific fields for a record (unit, upper_limit, lower_limit)."""
        allowed_fields = {"unit", "upper_limit", "lower_limit"}
        updates = {k: v for k, v in fields.items() if k in allowed_fields}
        if not updates:
            return False
        with self._connection() as conn:
            set_clause = ", ".join(f"{k} = ?" for k in updates)
            values = list(updates.values())
            values.append(record_id)
            cursor = conn.execute(
                f"UPDATE monitor_data SET {set_clause} WHERE id = ?",
                values,
            )
            conn.commit()
            return cursor.rowcount > 0

    def void_record(self, record_id: int) -> bool:
        with self._connection() as conn:
            cursor = conn.execute(
                "UPDATE monitor_data SET is_voided = 1 WHERE id = ?",
                (record_id,),
            )
            conn.commit()
            return cursor.rowcount > 0

    def unvoid_record(self, record_id: int) -> bool:
        with self._connection() as conn:
            cursor = conn.execute(
                "UPDATE monitor_data SET is_voided = 0 WHERE id = ?",
                (record_id,),
            )
            conn.commit()
            return cursor.rowcount > 0
