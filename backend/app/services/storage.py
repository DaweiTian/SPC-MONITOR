import sqlite3
from datetime import datetime, date
from pathlib import Path
from typing import Any

class OnlineStorage:
    """在线监控数据的 SQLite 存储管理"""
    
    def __init__(self, db_path: str) -> None:
        self.db_path = db_path
        Path(db_path).parent.mkdir(parents=True, exist_ok=True)
    
    def _connect(self) -> sqlite3.Connection:
        conn = sqlite3.connect(self.db_path)
        conn.row_factory = sqlite3.Row
        conn.execute("PRAGMA journal_mode=WAL")
        conn.execute("PRAGMA foreign_keys=ON")
        return conn
    
    def init_db(self) -> None:
        conn = self._connect()
        try:
            conn.executescript("""
                CREATE TABLE IF NOT EXISTS monitor_data (
                    id INTEGER PRIMARY KEY AUTOINCREMENT,
                    indicator_code TEXT NOT NULL,
                    indicator_name TEXT,
                    product_code TEXT NOT NULL,
                    product_name TEXT,
                    value REAL NOT NULL,
                    unit TEXT,
                    upper_limit REAL,
                    lower_limit REAL,
                    is_qualified INTEGER DEFAULT 1,
                    sample_time TEXT NOT NULL,
                    created_at TEXT DEFAULT (datetime('now', 'localtime')),
                    UNIQUE(indicator_code, product_code, sample_time)
                );
                
                CREATE TABLE IF NOT EXISTS alerts (
                    id INTEGER PRIMARY KEY AUTOINCREMENT,
                    alert_id TEXT NOT NULL UNIQUE,
                    alert_type TEXT NOT NULL,
                    severity TEXT NOT NULL DEFAULT 'warning',
                    indicator_code TEXT,
                    product_code TEXT,
                    rule_type TEXT,
                    rule_desc TEXT,
                    test_value REAL,
                    control_limit TEXT,
                    message TEXT NOT NULL,
                    detail TEXT,
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
            """)
            conn.commit()
        finally:
            conn.close()
    
    def save_data(self, records: list[dict[str, Any]]) -> int:
        conn = self._connect()
        try:
            count = 0
            for record in records:
                try:
                    conn.execute(
                        """INSERT INTO monitor_data
                           (indicator_code, indicator_name, product_code, product_name,
                            value, unit, upper_limit, lower_limit, is_qualified, sample_time)
                           VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?, ?)""",
                        (
                            record.get("indicator_code"),
                            record.get("indicator_name"),
                            record.get("product_code"),
                            record.get("product_name"),
                            record.get("value"),
                            record.get("unit"),
                            record.get("upper_limit"),
                            record.get("lower_limit"),
                            record.get("is_qualified", 1),
                            record.get("sample_time"),
                        ),
                    )
                    count += 1
                except sqlite3.IntegrityError:
                    pass
            conn.commit()
            return count
        finally:
            conn.close()
    
    def save_alert(self, alert: dict[str, Any]) -> int:
        conn = self._connect()
        try:
            cursor = conn.execute(
                """INSERT OR IGNORE INTO alerts
                   (alert_id, alert_type, severity, indicator_code, product_code,
                    rule_type, rule_desc, test_value, control_limit, message, detail, status)
                   VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?)""",
                (
                    alert.get("alert_id"),
                    alert.get("alert_type", "spc_violation"),
                    alert.get("severity", "warning"),
                    alert.get("indicator_code"),
                    alert.get("product_code"),
                    alert.get("rule_type"),
                    alert.get("rule_desc"),
                    alert.get("test_value"),
                    alert.get("control_limit"),
                    alert.get("message", alert.get("rule_desc", "")),
                    alert.get("detail"),
                    alert.get("status", "pending"),
                ),
            )
            conn.commit()
            return cursor.lastrowid
        finally:
            conn.close()
    
    def get_recent_data(
        self, indicator_code: str, product_code: str, limit: int = 20
    ) -> list[dict[str, Any]]:
        conn = self._connect()
        try:
            cursor = conn.execute(
                """SELECT * FROM monitor_data
                   WHERE indicator_code = ? AND product_code = ?
                   ORDER BY sample_time DESC
                   LIMIT ?""",
                (indicator_code, product_code, limit),
            )
            return [dict(row) for row in cursor.fetchall()]
        finally:
            conn.close()
    
    def get_alerts(
        self,
        severity: str | None = None,
        status: str | None = None,
        limit: int = 50,
    ) -> list[dict[str, Any]]:
        conn = self._connect()
        try:
            conditions: list[str] = []
            params: list[Any] = []
            if severity is not None:
                conditions.append("severity = ?")
                params.append(severity)
            if status is not None:
                conditions.append("status = ?")
                params.append(status)
            
            where = f"WHERE {' AND '.join(conditions)}" if conditions else ""
            params.append(limit)
            
            cursor = conn.execute(
                f"""SELECT * FROM alerts
                    {where}
                    ORDER BY created_at DESC
                    LIMIT ?""",
                params,
            )
            return [dict(row) for row in cursor.fetchall()]
        finally:
            conn.close()
    
    def resolve_alert(self, alert_id: int, resolved_by: str, note: str = "") -> bool:
        conn = self._connect()
        try:
            cursor = conn.execute(
                """UPDATE alerts
                   SET status = 'resolved',
                       resolved_at = datetime('now', 'localtime'),
                       resolved_by = ?,
                       resolve_note = ?
                   WHERE id = ? AND status = 'pending'""",
                (resolved_by, note, alert_id),
            )
            conn.commit()
            return cursor.rowcount > 0
        finally:
            conn.close()
    
    def get_today_stats(self) -> dict[str, Any]:
        conn = self._connect()
        try:
            today = date.today().isoformat()
            
            cursor = conn.execute(
                "SELECT COUNT(*) FROM monitor_data WHERE sample_time LIKE ?",
                (f"{today}%",),
            )
            data_count = cursor.fetchone()[0]
            
            cursor = conn.execute(
                """SELECT COUNT(*) FROM monitor_data
                   WHERE sample_time LIKE ? AND is_qualified = 0""",
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
        finally:
            conn.close()
    
    def get_products_with_data(self, limit: int = 50) -> list[dict[str, Any]]:
        """Get products that have data in the database."""
        conn = self._connect()
        try:
            cursor = conn.execute(
                """SELECT product_code, product_name, COUNT(*) as data_count
                   FROM monitor_data
                   GROUP BY product_code
                   ORDER BY data_count DESC
                   LIMIT ?""",
                (limit,),
            )
            return [dict(row) for row in cursor.fetchall()]
        finally:
            conn.close()
    
    def log_collection(self, status: str, records_count: int = 0, error_message: str = None) -> None:
        """Log a collection attempt to sync_log."""
        conn = self._connect()
        try:
            conn.execute(
                """INSERT INTO sync_log (source, sync_type, status, records_count, error_message, started_at)
                   VALUES (?, ?, ?, ?, ?, datetime('now', 'localtime'))""",
                ("collector", "data", status, records_count, error_message),
            )
            conn.commit()
        finally:
            conn.close()
