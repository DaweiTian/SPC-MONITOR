import numpy as np
from dataclasses import dataclass
from scipy import stats

@dataclass
class CapabilityResult:
    cp: float
    cpk: float
    pp: float
    ppk: float
    ca: float
    sigma_level: float
    defect_rate_ppm: float
    
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
        values = np.array(values, dtype=float)
        n = len(values)
        
        if spec_target is None:
            spec_target = (spec_min + spec_max) / 2
        
        mean = np.mean(values)
        mr = np.abs(np.diff(values))
        mr_bar = np.mean(mr)
        sigma_within = mr_bar / 1.128
        sigma_overall = np.std(values, ddof=1)
        
        T = spec_max - spec_min
        
        cp = T / (6 * sigma_within) if sigma_within > 0 else float('inf')
        cpk_upper = (spec_max - mean) / (3 * sigma_within) if sigma_within > 0 else float('inf')
        cpk_lower = (mean - spec_min) / (3 * sigma_within) if sigma_within > 0 else float('inf')
        cpk = min(cpk_upper, cpk_lower)
        
        pp = T / (6 * sigma_overall) if sigma_overall > 0 else float('inf')
        ppk_upper = (spec_max - mean) / (3 * sigma_overall) if sigma_overall > 0 else float('inf')
        ppk_lower = (mean - spec_min) / (3 * sigma_overall) if sigma_overall > 0 else float('inf')
        ppk = min(ppk_upper, ppk_lower)
        
        ca = cpk / cp if cp > 0 else 0
        sigma_level = 3 * cpk + 1.5
        
        z_upper = (spec_max - mean) / sigma_overall if sigma_overall > 0 else 0
        z_lower = (spec_min - mean) / sigma_overall if sigma_overall > 0 else 0
        defect_rate = stats.norm.sf(z_upper) + stats.norm.cdf(z_lower)
        defect_rate_ppm = defect_rate * 1e6
        
        return CapabilityResult(
            cp=round(cp, 4),
            cpk=round(cpk, 4),
            pp=round(pp, 4),
            ppk=round(ppk, 4),
            ca=round(ca, 4),
            sigma_level=round(sigma_level, 2),
            defect_rate_ppm=round(defect_rate_ppm, 2),
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
        
        defect_rate_ppm = defect_rate * 1e6
        ca = 1.0
        sigma_level = 3 * cpk + 1.5
        
        return CapabilityResult(
            cp=round(cp, 4),
            cpk=round(cpk, 4),
            pp=round(pp, 4),
            ppk=round(ppk, 4),
            ca=round(ca, 4),
            sigma_level=round(sigma_level, 2),
            defect_rate_ppm=round(defect_rate_ppm, 2),
        )
