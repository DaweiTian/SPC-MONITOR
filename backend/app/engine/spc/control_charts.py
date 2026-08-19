import numpy as np
from dataclasses import dataclass

@dataclass
class ControlLimits:
    cl: float
    ucl: float
    lcl: float

class IMRControlChart:
    """I-MR 单值-移动极差控制图"""
    
    def calculate(self, values: np.ndarray) -> dict:
        values = np.array(values, dtype=float)
        n = len(values)
        
        if n < 2:
            raise ValueError("至少需要 2 个数据点")
        
        # I 图
        mean = np.mean(values)
        mr = np.abs(np.diff(values))
        mr_bar = np.mean(mr)
        sigma = mr_bar / 1.128  # d2 for n=2
        
        i_chart = ControlLimits(
            cl=round(mean, 4),
            ucl=round(mean + 3 * sigma, 4),
            lcl=round(mean - 3 * sigma, 4),
        )
        
        # MR 图
        d4 = 3.267  # for n=2
        mr_chart = ControlLimits(
            cl=round(mr_bar, 4),
            ucl=round(mr_bar * d4, 4),
            lcl=0,
        )
        
        return {
            'i_chart': i_chart,
            'mr_chart': mr_chart,
            'sigma_estimate': round(sigma, 4),
        }
