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


class EWMAControlChart:
    """EWMA 指数加权移动平均控制图"""

    def calculate(self, values: np.ndarray, lambda_: float = 0.2, L: float = 3.0) -> dict:
        values = np.array(values, dtype=float)
        n = len(values)
        if n < 2:
            raise ValueError("至少需要 2 个数据点")
        if not (0.05 <= lambda_ <= 0.5):
            raise ValueError("lambda_ 必须在 0.05~0.5 之间")

        mu0 = np.mean(values)
        mr = np.abs(np.diff(values))
        mr_bar = np.mean(mr)
        sigma = mr_bar / 1.128

        ewma = np.empty(n)
        ewma[0] = mu0
        for i in range(1, n):
            ewma[i] = lambda_ * values[i] + (1 - lambda_) * ewma[i - 1]

        factor = L * sigma * np.sqrt(lambda_ / (2 - lambda_))
        indices = np.arange(1, n + 1)
        decay = (1 - lambda_) ** (2 * indices)
        ucl = mu0 + factor * np.sqrt(1 - decay)
        lcl = mu0 - factor * np.sqrt(1 - decay)

        violations = [i for i in range(n) if ewma[i] > ucl[i] or ewma[i] < lcl[i]]

        return {
            'ewma_values': [round(float(v), 4) for v in ewma],
            'ucl': [round(float(v), 4) for v in ucl],
            'lcl': [round(float(v), 4) for v in lcl],
            'cl': round(float(mu0), 4),
            'violations': violations,
            'lambda_': lambda_,
        }
