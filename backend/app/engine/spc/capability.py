import numpy as np
from dataclasses import dataclass
from typing import Optional
from scipy import stats

@dataclass
class CapabilityResult:
    cp: Optional[float]
    cpk: Optional[float]
    pp: Optional[float]
    ppk: Optional[float]
    ca: Optional[float]
    sigma_level: Optional[float]
    defect_rate_ppm: Optional[float]
    
    def to_dict(self) -> dict:
        return {
            'cp': self.cp,
            'cpk': self.cpk,
            'pp': self.pp,
            'ppk': self.ppk,
            'ca': self.ca,
            'sigma_level': self.sigma_level,
            'defect_rate_ppm': self.defect_rate_ppm,
        }

class ProcessCapability:
    """过程能力分析"""
    
    def analyze(self, values: np.ndarray, spec_min: float, spec_max: float,
                spec_target: float = None) -> CapabilityResult:
        values = np.asarray(values, dtype=float)
        values = values[np.isfinite(values)]
        n = len(values)
        if n < 2:
            raise ValueError("过程能力分析至少需要 2 个有效样本")
        if spec_min is None or spec_max is None or spec_max <= spec_min:
            raise ValueError("规格限无效：需要 lsl < usl")

        if spec_target is None:
            spec_target = (spec_min + spec_max) / 2

        mean = float(np.mean(values))
        mr = np.abs(np.diff(values))
        mr_bar = float(np.mean(mr))
        sigma_within = mr_bar / 1.128
        sigma_overall = float(np.std(values, ddof=1))

        T = spec_max - spec_min

        def _safe_div(num: float, den: float) -> float:
            return num / den if den and den > 0 and np.isfinite(den) else None

        cp = _safe_div(T, 6 * sigma_within)
        cpk_upper = _safe_div(spec_max - mean, 3 * sigma_within)
        cpk_lower = _safe_div(mean - spec_min, 3 * sigma_within)
        if cpk_upper is None or cpk_lower is None:
            cpk = None
        else:
            cpk = min(cpk_upper, cpk_lower)

        pp = _safe_div(T, 6 * sigma_overall)
        ppk_upper = _safe_div(spec_max - mean, 3 * sigma_overall)
        ppk_lower = _safe_div(mean - spec_min, 3 * sigma_overall)
        if ppk_upper is None or ppk_lower is None:
            ppk = None
        else:
            ppk = min(ppk_upper, ppk_lower)

        # 传统 Ca（偏移度）：完美居中 = 0，|mean-target|/(T/2)
        half_t = T / 2 if T else None
        ca = abs(mean - spec_target) / half_t if half_t and half_t > 0 else None
        sigma_level = (3 * cpk + 1.5) if cpk is not None else None
        
        if sigma_overall and sigma_overall > 0:
            z_upper = (spec_max - mean) / sigma_overall
            z_lower = (spec_min - mean) / sigma_overall
            defect_rate = stats.norm.sf(z_upper) + stats.norm.cdf(z_lower)
            defect_rate_ppm = float(defect_rate * 1e6)
        else:
            defect_rate_ppm = 0.0

        def _r(x, nd=4):
            return None if x is None else round(float(x), nd)

        return CapabilityResult(
            cp=_r(cp),
            cpk=_r(cpk),
            pp=_r(pp),
            ppk=_r(ppk),
            ca=_r(ca),
            sigma_level=_r(sigma_level, 2),
            defect_rate_ppm=_r(defect_rate_ppm, 2),
        )
    
    def analyze_one_sided(self, values: np.ndarray, spec_limit: float,
                          limit_type: str = 'upper', spec_target: float = None) -> CapabilityResult:
        values = np.array(values, dtype=float)
        mean = np.mean(values)
        
        mr = np.abs(np.diff(values))
        mr_bar = np.mean(mr)
        sigma_within = mr_bar / 1.128
        sigma_overall = np.std(values, ddof=1)
        
        if limit_type == 'upper':
            cp = (spec_limit - mean) / (3 * sigma_within) if sigma_within > 0 else float('inf')
            cpk = cp
            pp = (spec_limit - mean) / (3 * sigma_overall) if sigma_overall > 0 else float('inf')
            ppk = pp
            z = (spec_limit - mean) / sigma_overall if sigma_overall > 0 else 0
            defect_rate = stats.norm.sf(z)
        else:
            cp = (mean - spec_limit) / (3 * sigma_within) if sigma_within > 0 else float('inf')
            cpk = cp
            pp = (mean - spec_limit) / (3 * sigma_overall) if sigma_overall > 0 else float('inf')
            ppk = pp
            z = (mean - spec_limit) / sigma_overall if sigma_overall > 0 else 0
            defect_rate = stats.norm.cdf(-z)
        
        defect_rate_ppm = float(defect_rate * 1e6)
        ca = None  # 单侧能力无偏移度
        sigma_level = (3 * cpk + 1.5) if np.isfinite(cpk) else None

        def _r(x, nd=4):
            if x is None:
                return None
            x = float(x)
            return None if not np.isfinite(x) else round(x, nd)

        return CapabilityResult(
            cp=_r(cp),
            cpk=_r(cpk),
            pp=_r(pp),
            ppk=_r(ppk),
            ca=ca,
            sigma_level=_r(sigma_level, 2),
            defect_rate_ppm=_r(defect_rate_ppm, 2),
        )
