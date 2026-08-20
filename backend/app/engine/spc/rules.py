import numpy as np
from dataclasses import dataclass
from typing import List

@dataclass
class RuleViolation:
    rule_id: int
    rule_name: str
    description: str
    severity: str
    violation_points: List[int]

class NelsonRules:
    """Nelson 8 条判异规则"""
    
    def check_all(self, values: np.ndarray, cl: float, sigma: float) -> List[RuleViolation]:
        violations = []
        
        if len(values) < 2:
            return violations
        
        # 规则 1: 1点超出3σ
        violations.extend(self._rule1(values, cl, sigma))
        
        # 规则 2: 连续9点在中心线同一侧
        violations.extend(self._rule2(values, cl))
        
        # 规则 3: 连续6点持续递增或递减
        violations.extend(self._rule3(values))
        
        # 规则 4: 连续14点交替上下
        violations.extend(self._rule4(values))
        
        # 规则 5: 连续3点中有2点在2σ外（同侧）
        violations.extend(self._rule5(values, cl, sigma))
        
        # 规则 6: 连续5点中有4点在1σ外（同侧）
        violations.extend(self._rule6(values, cl, sigma))
        
        # 规则 7: 连续15点在1σ内（变异过小）
        violations.extend(self._rule7(values, cl, sigma))
        
        # 规则 8: 连续8点在1σ外（变异过大）
        violations.extend(self._rule8(values, cl, sigma))
        
        return violations
    
    def _rule1(self, values, cl, sigma) -> List[RuleViolation]:
        ucl = cl + 3 * sigma
        lcl = cl - 3 * sigma
        violation_points = [i for i, v in enumerate(values) if v > ucl or v < lcl]
        
        if violation_points:
            return [RuleViolation(
                rule_id=1,
                rule_name="1点超出3σ",
                description=f"1点超出3σ控制限 (UCL={ucl:.4f}, LCL={lcl:.4f})",
                severity="CRITICAL",
                violation_points=violation_points,
            )]
        return []
    
    def _rule2(self, values, cl) -> List[RuleViolation]:
        violation_points = []
        for i in range(8, len(values)):
            segment = values[i-8:i+1]
            if all(v > cl for v in segment) or all(v < cl for v in segment):
                violation_points.extend(range(i-8, i+1))
        
        if violation_points:
            return [RuleViolation(
                rule_id=2,
                rule_name="连续9点同侧",
                description="连续9点在中心线同一侧",
                severity="CRITICAL",
                violation_points=list(set(violation_points)),
            )]
        return []
    
    def _rule3(self, values) -> List[RuleViolation]:
        violation_points = []
        for i in range(5, len(values)):
            segment = values[i-5:i+1]
            if all(segment[j] < segment[j+1] for j in range(5)) or \
               all(segment[j] > segment[j+1] for j in range(5)):
                violation_points.extend(range(i-5, i+1))
        
        if violation_points:
            return [RuleViolation(
                rule_id=3,
                rule_name="连续6点趋势",
                description="连续6点持续递增或递减",
                severity="WARNING",
                violation_points=list(set(violation_points)),
            )]
        return []
    
    def _rule4(self, values) -> List[RuleViolation]:
        violation_points = []
        for i in range(13, len(values)):
            segment = values[i-13:i+1]
            alternating = all(
                (segment[j] - segment[j-1]) * (segment[j+1] - segment[j]) < 0
                for j in range(1, 13)
            )
            if alternating:
                violation_points.extend(range(i-13, i+1))
        
        if violation_points:
            return [RuleViolation(
                rule_id=4,
                rule_name="连续14点交替",
                description="连续14点交替上下（锯齿状）",
                severity="WARNING",
                violation_points=list(set(violation_points)),
            )]
        return []
    
    def _rule5(self, values, cl, sigma) -> List[RuleViolation]:
        violation_points = []
        for i in range(2, len(values)):
            segment = values[i-2:i+1]
            above = sum(1 for v in segment if v > cl + 2 * sigma)
            below = sum(1 for v in segment if v < cl - 2 * sigma)
            if above >= 2 or below >= 2:
                violation_points.extend(range(i-2, i+1))
        
        if violation_points:
            return [RuleViolation(
                rule_id=5,
                rule_name="3点中2点在2σ外",
                description="连续3点中有2点在2σ外（同侧）",
                severity="WARNING",
                violation_points=list(set(violation_points)),
            )]
        return []
    
    def _rule6(self, values, cl, sigma) -> List[RuleViolation]:
        violation_points = []
        for i in range(4, len(values)):
            segment = values[i-4:i+1]
            above = sum(1 for v in segment if v > cl + sigma)
            below = sum(1 for v in segment if v < cl - sigma)
            if above >= 4 or below >= 4:
                violation_points.extend(range(i-4, i+1))
        
        if violation_points:
            return [RuleViolation(
                rule_id=6,
                rule_name="5点中4点在1σ外",
                description="连续5点中有4点在1σ外（同侧）",
                severity="WARNING",
                violation_points=list(set(violation_points)),
            )]
        return []
    
    def _rule7(self, values, cl, sigma) -> List[RuleViolation]:
        violation_points = []
        for i in range(14, len(values)):
            segment = values[i-14:i+1]
            if all(cl - sigma < v < cl + sigma for v in segment):
                violation_points.extend(range(i-14, i+1))
        
        if violation_points:
            return [RuleViolation(
                rule_id=7,
                rule_name="连续15点在1σ内",
                description="连续15点在1σ内（变异过小）",
                severity="INFO",
                violation_points=list(set(violation_points)),
            )]
        return []
    
    def _rule8(self, values, cl, sigma) -> List[RuleViolation]:
        violation_points = []
        for i in range(7, len(values)):
            segment = values[i-7:i+1]
            if all(v > cl + sigma or v < cl - sigma for v in segment):
                violation_points.extend(range(i-7, i+1))
        
        if violation_points:
            return [RuleViolation(
                rule_id=8,
                rule_name="连续8点在1σ外",
                description="连续8点在1σ外（变异过大）",
                severity="INFO",
                violation_points=list(set(violation_points)),
            )]
        return []
