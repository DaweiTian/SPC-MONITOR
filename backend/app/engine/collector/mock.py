import random
from datetime import datetime, timedelta
from typing import Dict, Any, List
from .base import BaseCollector

MOCK_PRODUCTS = [
    {'code': 'P001', 'name': '砖纯牛奶'},
    {'code': 'P002', 'name': '枕纯牛奶'},
    {'code': 'P003', 'name': '砖金典'},
]

MOCK_INDICATORS = [
    {'code': 'fat', 'name': '脂肪', 'unit': '%', 'mean': 3.8, 'std': 0.15, 'lsl': 3.0, 'usl': 5.0},
    {'code': 'protein', 'name': '蛋白质', 'unit': '%', 'mean': 3.3, 'std': 0.1, 'lsl': 2.9, 'usl': 3.6},
    {'code': 'ts', 'name': '全脂乳固体', 'unit': '%', 'mean': 12.5, 'std': 0.3, 'lsl': 11.5, 'usl': 13.0},
    {'code': 'acidity', 'name': '酸度', 'unit': '°T', 'mean': 14.5, 'std': 0.5, 'lsl': 13.0, 'usl': 16.0},
]

class MockCollector(BaseCollector):
    """Mock 数据采集器"""
    
    def __init__(self, storage=None):
        super().__init__(storage)
        self._last_collect_time = datetime.now() - timedelta(hours=1)
        self._collect_count = 0
    
    def collect(self) -> Dict[str, Any]:
        now = datetime.now()
        self._collect_count += 1
        
        num_records = random.randint(1, 3)
        records = []
        
        for _ in range(num_records):
            product = random.choice(MOCK_PRODUCTS)
            indicator = random.choice(MOCK_INDICATORS)
            value = random.gauss(indicator['mean'], indicator['std'])
            
            if random.random() < 0.05:
                if random.random() < 0.5:
                    value = indicator['usl'] + random.uniform(0.1, 0.5)
                else:
                    value = indicator['lsl'] - random.uniform(0.1, 0.5)
            
            sample_time = self._last_collect_time + timedelta(seconds=random.randint(1, 300))
            
            record = {
                'indicator_code': indicator['code'],
                'indicator_name': indicator['name'],
                'product_code': product['code'],
                'product_name': product['name'],
                'value': round(value, 4),
                'unit': indicator['unit'],
                'upper_limit': indicator['usl'],
                'lower_limit': indicator['lsl'],
                'is_qualified': 1 if indicator['lsl'] <= value <= indicator['usl'] else 0,
                'sample_time': sample_time.isoformat(),
            }
            records.append(record)
        
        saved_count = 0
        if self.storage:
            saved_count = self.storage.save_data(records)
        
        if records:
            max_time = max(r['sample_time'] for r in records)
            self._last_collect_time = datetime.fromisoformat(max_time)
        
        return {
            'new_records': saved_count,
            'timestamp': now.isoformat(),
            'collect_count': self._collect_count,
        }
    
    def get_breakpoint(self) -> Dict[str, Any]:
        return {
            'last_collect_time': self._last_collect_time.isoformat(),
            'collect_count': self._collect_count,
        }
    
    def set_breakpoint(self, last_collect_time: str):
        self._last_collect_time = datetime.fromisoformat(last_collect_time)
    
    def get_spec_limits(self) -> Dict[str, Dict[str, float]]:
        return {
            ind['code']: {'lsl': ind['lsl'], 'usl': ind['usl']}
            for ind in MOCK_INDICATORS
        }
    
    def get_products(self) -> List[Dict[str, str]]:
        return MOCK_PRODUCTS
    
    def get_indicators(self) -> List[Dict[str, Any]]:
        return MOCK_INDICATORS
