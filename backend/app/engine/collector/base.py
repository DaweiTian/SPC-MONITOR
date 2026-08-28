from abc import ABC, abstractmethod
from typing import Dict, Any, List, Optional
import json
import os
import logging
from backend.app.core.config import get_conf_path

logger = logging.getLogger(__name__)


SPEC_LIMITS_FILE = get_conf_path("spec_limits.json")


class BaseCollector(ABC):
    """采集器基类"""

    def __init__(self, storage=None, init_limit: int = 100):
        self.storage = storage
        self.init_limit = init_limit
        self._correction_cache: Dict[str, Dict[str, float]] | None = None
        self._correction_mtime: float = 0

    def _load_correction_values(self) -> Dict[str, Dict[str, float]]:
        """从 spec_limits.json 加载修正值配置（带 mtime 缓存）"""
        try:
            mtime = os.path.getmtime(SPEC_LIMITS_FILE)
            if self._correction_cache is not None and mtime == self._correction_mtime:
                return self._correction_cache
            with open(SPEC_LIMITS_FILE, 'r', encoding='utf-8') as f:
                raw = json.load(f)
                result = {}
                for product_code, indicators in raw.items():
                    if not isinstance(indicators, dict):
                        continue
                    corrections = {}
                    for indicator_code, limits in indicators.items():
                        if isinstance(limits, dict) and "correction" in limits:
                            corrections[indicator_code] = limits["correction"]
                    if corrections:
                        result[product_code] = corrections
                self._correction_cache = result
                self._correction_mtime = mtime
                return result
        except (FileNotFoundError, json.JSONDecodeError, PermissionError) as e:
            logger.warning(f"加载修正值配置失败: {e}")
            return {}

    def _apply_correction(self, value: float, product_code: str, indicator_code: str) -> float:
        """应用修正值到原始值"""
        corrections = self._load_correction_values()
        product_corrections = corrections.get(product_code, {})
        correction = product_corrections.get(indicator_code, 0.0)
        return round(value + correction, 4)

    def _get_correction(self, product_code: str, indicator_code: str) -> float:
        """获取修正值"""
        corrections = self._load_correction_values()
        product_corrections = corrections.get(product_code, {})
        return product_corrections.get(indicator_code, 0.0)

    @abstractmethod
    def collect(self) -> Dict[str, Any]:
        """执行数据采集"""
        pass

    @abstractmethod
    def get_breakpoint(self) -> Dict[str, Any]:
        """获取断点信息"""
        pass

    @abstractmethod
    def set_breakpoint(self, last_collect_time: str):
        """设置断点"""
        pass

    @abstractmethod
    def get_spec_limits(self, product_code: str = None) -> Dict[str, Dict[str, float]]:
        """获取规格限配置"""
        pass

    @abstractmethod
    def get_products(self) -> List[Dict[str, str]]:
        """获取品项列表"""
        pass

    @abstractmethod
    def get_indicators(self) -> List[Dict[str, Any]]:
        """获取指标列表"""
        pass
