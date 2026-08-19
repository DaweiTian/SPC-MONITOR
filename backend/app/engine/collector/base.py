from abc import ABC, abstractmethod
from typing import Dict, Any, List, Optional

class BaseCollector(ABC):
    """采集器基类"""
    
    def __init__(self, storage=None):
        self.storage = storage
    
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
    def get_spec_limits(self) -> Dict[str, Dict[str, float]]:
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
