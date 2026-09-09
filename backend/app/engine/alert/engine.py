import uuid
from datetime import datetime, timedelta
from typing import Dict, Any, List, Optional

import numpy as np

from backend.app.engine.spc.rules import NelsonRules
from backend.app.engine.spc.control_charts import IMRControlChart
from backend.app.engine.spc.capability import ProcessCapability

NELSON_RULE_DESCRIPTIONS = {
    1: "1点超出3σ控制限",
    2: "连续9点在中心线同一侧",
    3: "连续6点持续递增或递减",
    4: "连续14点交替上下",
    5: "连续3点中有2点在2σ外（同侧）",
    6: "连续5点中有4点在1σ外（同侧）",
    7: "连续15点在1σ内（变异过小）",
    8: "连续8点在1σ外（变异过大）",
}

RULE_SEVERITY = {
    1: 'CRITICAL',
    2: 'CRITICAL',
    3: 'WARNING',
    4: 'WARNING',
    5: 'WARNING',
    6: 'WARNING',
    7: 'INFO',
    8: 'INFO',
}

class AlertEngine:
    """预警生成引擎"""

    def __init__(self, storage, config: Optional[Dict] = None):
        self.storage = storage
        self.config = config or {}
        self.nelson_rules = NelsonRules()
        self.imr_chart = IMRControlChart()
        self.capability = ProcessCapability()
        self.monitoring_start = datetime.now()

    def check_and_alert(
        self,
        product_code: str,
        indicator_code: str,
        values: List[float],
        timestamps: List[datetime],
        spec_limits: Optional[Dict[str, float]] = None,
        window_size: int = 30,
    ) -> List[Dict[str, Any]]:
        new_alerts = []

        if len(values) < 2:
            return new_alerts

        # Filter: only analyze data collected after monitoring started
        recent_values = []
        recent_times = []
        for v, t in zip(values, timestamps):
            if t >= self.monitoring_start:
                recent_values.append(v)
                recent_times.append(t)

        if len(recent_values) < 2:
            return new_alerts

        values = recent_values
        timestamps = recent_times

        if len(values) > window_size:
            values = values[-window_size:]
            timestamps = timestamps[-window_size:]
        
        values_arr = np.array(values, dtype=float)
        
        # 计算 I-MR 控制图
        chart_result = self.imr_chart.calculate(values_arr)
        cl = chart_result['i_chart'].cl
        sigma = chart_result['sigma_estimate']
        ucl = chart_result['i_chart'].ucl
        lcl = chart_result['i_chart'].lcl
        
        # Nelson 规则检测
        violations = self.nelson_rules.check_all(values_arr, cl, sigma)
        
        # Fetch pending alerts ONCE for duplicate detection (avoids N+1 queries)
        existing_pending = self.storage.get_alerts(status='pending', limit=500)
        pending_alerts = existing_pending.get('alerts', []) if isinstance(existing_pending, dict) else existing_pending
        cutoff = datetime.now() - timedelta(hours=24)
        pending_keys: set[tuple] = set()
        for a in pending_alerts:
            if datetime.fromisoformat(a['created_at']) > cutoff:
                pending_keys.add((a.get('product_code'), a.get('indicator_code'), a.get('rule_type')))
        
        # 生成 Nelson 规则预警
        for violation in violations:
            for point_idx in violation.violation_points:
                alert = {
                    'alert_id': self._gen_alert_id(),
                    'product_code': product_code,
                    'indicator_code': indicator_code,
                    'severity': violation.severity,
                    'rule_type': f'nelson_{violation.rule_id}',
                    'rule_desc': violation.description,
                    'violation_count': len(violation.violation_points),
                    'test_value': float(values_arr[point_idx]),
                    'control_limit': f'UCL={ucl:.4f}, LCL={lcl:.4f}',
                    'generated_at': datetime.now(),
                    'data_time_range': f'{timestamps[0]} - {timestamps[-1]}',
                }
                
                if not self._is_duplicate_cached(alert, pending_keys):
                    self.storage.save_alert(alert)
                    new_alerts.append(alert)
                    pending_keys.add((product_code, indicator_code, alert['rule_type']))
        
        # Cpk 检查
        if spec_limits and len(values_arr) >= 5:
            cpk_threshold = float(self.config.get('cpk_min_threshold', '1.33'))
            
            if spec_limits.get('lsl') is not None and spec_limits.get('usl') is not None:
                result = self.capability.analyze(values_arr, spec_limits['lsl'], spec_limits['usl'])
                cpk = result.cpk
            elif spec_limits.get('usl') is not None:
                result = self.capability.analyze_one_sided(values_arr, spec_limits['usl'], 'upper')
                cpk = result.cpk
            elif spec_limits.get('lsl') is not None:
                result = self.capability.analyze_one_sided(values_arr, spec_limits['lsl'], 'lower')
                cpk = result.cpk
            else:
                cpk = None
            
            if cpk is not None and cpk < cpk_threshold:
                alert = {
                    'alert_id': self._gen_alert_id(),
                    'product_code': product_code,
                    'indicator_code': indicator_code,
                    'severity': 'WARNING',
                    'rule_type': 'cpk_low',
                    'rule_desc': f'过程能力指数 Cpk={cpk:.2f} 低于阈值 {cpk_threshold}',
                    'violation_count': 0,
                    'test_value': float(np.mean(values_arr)),
                    'control_limit': f'Cpk={cpk:.2f}',
                    'generated_at': datetime.now(),
                    'data_time_range': None,
                }
                
                if not self._is_duplicate_cached(alert, pending_keys):
                    self.storage.save_alert(alert)
                    new_alerts.append(alert)
                    pending_keys.add((product_code, indicator_code, 'cpk_low'))
        
        # 超出规格限检查
        if spec_limits and len(values_arr) > 0:
            latest_value = float(values_arr[-1])
            
            if spec_limits.get('usl') is not None and latest_value > spec_limits['usl']:
                alert = {
                    'alert_id': self._gen_alert_id(),
                    'product_code': product_code,
                    'indicator_code': indicator_code,
                    'severity': 'CRITICAL',
                    'rule_type': 'above_usl',
                    'rule_desc': f'检测值 {latest_value:.4f} 超出规格上限 {spec_limits["usl"]}',
                    'violation_count': 1,
                    'test_value': latest_value,
                    'control_limit': f'USL={spec_limits["usl"]}',
                    'generated_at': datetime.now(),
                    'data_time_range': None,
                }
                if not self._is_duplicate_cached(alert, pending_keys):
                    self.storage.save_alert(alert)
                    new_alerts.append(alert)
                    pending_keys.add((product_code, indicator_code, 'above_usl'))
            
            if spec_limits.get('lsl') is not None and latest_value < spec_limits['lsl']:
                alert = {
                    'alert_id': self._gen_alert_id(),
                    'product_code': product_code,
                    'indicator_code': indicator_code,
                    'severity': 'CRITICAL',
                    'rule_type': 'below_lsl',
                    'rule_desc': f'检测值 {latest_value:.4f} 低于规格下限 {spec_limits["lsl"]}',
                    'violation_count': 1,
                    'test_value': latest_value,
                    'control_limit': f'LSL={spec_limits["lsl"]}',
                    'generated_at': datetime.now(),
                    'data_time_range': None,
                }
                if not self._is_duplicate_cached(alert, pending_keys):
                    self.storage.save_alert(alert)
                    new_alerts.append(alert)
                    pending_keys.add((product_code, indicator_code, 'below_lsl'))
        
        return new_alerts
    
    def _gen_alert_id(self) -> str:
        return f"OM-{datetime.now().strftime('%Y%m%d')}-{uuid.uuid4().hex[:6].upper()}"
    
    def _is_duplicate_cached(self, alert: Dict[str, Any], pending_keys: set[tuple]) -> bool:
        """Check duplicate against pre-fetched pending keys set (O(1) lookup)."""
        key = (alert.get('product_code'), alert.get('indicator_code'), alert.get('rule_type'))
        return key in pending_keys
