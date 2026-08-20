import json
import logging
import os
from datetime import datetime
from typing import Dict, Any, List, Optional
from .base import BaseCollector

logger = logging.getLogger(__name__)

# Suppress noisy access-parser warnings about MSysObjects
logging.getLogger('access_parser').setLevel(logging.ERROR)

BREAKPOINT_FILE = "mdb_breakpoint.json"

def _fix_encoding(s):
    """Fix encoding for Chinese characters from .mdb files (typically GBK/GB2312)"""
    if isinstance(s, str):
        try:
            return s.encode('latin-1').decode('gbk')
        except:
            try:
                return s.encode('latin-1').decode('gb2312')
            except:
                return s
    return s

class MDBCollector(BaseCollector):
    """Microsoft Access (.mdb) 数据采集器"""
    
    def __init__(
        self,
        mdb_path: str,
        storage=None,
        sample_table: str = "Sample",
        product_table: str = "Product",
        component_table: str = "Component",
        prediction_table: str = "Prediction",
        time_column: str = "DateTime",
        product_ref_column: str = "ProdRef",
        product_name_column: str = "Name",
        component_ref_column: str = "CompRef",
        component_name_column: str = "Name",
        value_column: str = "Value",
        indicators: Optional[Dict[str, str]] = None,
    ):
        super().__init__(storage)
        self.mdb_path = mdb_path
        self.sample_table = sample_table
        self.product_table = product_table
        self.component_table = component_table
        self.prediction_table = prediction_table
        self.time_column = time_column
        self.product_ref_column = product_ref_column
        self.product_name_column = product_name_column
        self.component_ref_column = component_ref_column
        self.component_name_column = component_name_column
        self.value_column = value_column
        self.indicators = indicators or {}
        self._last_collect_time: Optional[datetime] = self._load_breakpoint()
        self._db = None
        self._products_cache: Optional[Dict[int, str]] = None
        self._components_cache: Optional[Dict[int, str]] = None
        self._samples_cache: Optional[List[Dict[str, Any]]] = None
        self._predictions_cache: Optional[Dict[int, Dict[int, float]]] = None
    
    @classmethod
    def from_config(cls, config: dict, storage=None):
        """从配置创建采集器"""
        return cls(
            mdb_path=config.get("mdb_path", ""),
            storage=storage,
            sample_table=config.get("sample_table", "Sample"),
            product_table=config.get("product_table", "Product"),
            component_table=config.get("component_table", "Component"),
            prediction_table=config.get("prediction_table", "Prediction"),
            time_column=config.get("time_column", "DateTime"),
            product_ref_column=config.get("product_ref_column", "ProdRef"),
            product_name_column=config.get("product_name_column", "Name"),
            component_ref_column=config.get("component_ref_column", "CompRef"),
            component_name_column=config.get("component_name_column", "Name"),
            value_column=config.get("value_column", "Value"),
            indicators=config.get("indicators", {}),
        )
    
    def _load_breakpoint(self) -> Optional[datetime]:
        """从文件加载断点"""
        if os.path.exists(BREAKPOINT_FILE):
            try:
                with open(BREAKPOINT_FILE, 'r', encoding='utf-8') as f:
                    data = json.load(f)
                    last_time = data.get('last_collect_time')
                    if last_time:
                        # Handle both ISO format and space-separated format
                        if 'T' in last_time:
                            return datetime.fromisoformat(last_time)
                        else:
                            return datetime.strptime(last_time, '%Y-%m-%d %H:%M:%S')
            except Exception as e:
                logger.warning(f"加载断点失败: {e}")
        return None
    
    def _save_breakpoint(self):
        """保存断点到文件"""
        try:
            data = {
                'last_collect_time': self._last_collect_time.isoformat() if self._last_collect_time else None,
                'mdb_path': self.mdb_path,
                'updated_at': datetime.now().isoformat()
            }
            with open(BREAKPOINT_FILE, 'w', encoding='utf-8') as f:
                json.dump(data, f, ensure_ascii=False, indent=2)
        except Exception as e:
            logger.warning(f"保存断点失败: {e}")
    
    @property
    def db(self):
        if self._db is None:
            from access_parser import AccessParser
            self._db = AccessParser(self.mdb_path)
        return self._db
    
    def test_connection(self) -> bool:
        """测试连接"""
        try:
            from access_parser import AccessParser
            db = AccessParser(self.mdb_path)
            # Try to parse a table to verify the file is valid
            db.parse_table(self.sample_table)
            return True
        except Exception as e:
            logger.error(f"MDB 文件连接失败: {e}")
            return False
    
    def _parse_table_data(self, table_name: str) -> List[Dict[str, Any]]:
        """解析表数据为字典列表"""
        try:
            raw_data = self.db.parse_table(table_name)
            if not raw_data:
                return []
            
            columns = list(raw_data.keys())
            if not columns:
                return []
            
            # Get the minimum length across all columns to avoid index errors
            min_len = min(len(raw_data[col]) for col in columns)
            result = []
            
            for i in range(min_len):
                try:
                    row = {col: raw_data[col][i] for col in columns}
                    result.append(row)
                except (IndexError, KeyError) as e:
                    logger.warning(f"跳过行 {i}: {e}")
                    continue
            
            return result
        except Exception as e:
            logger.error(f"解析表 {table_name} 失败: {e}")
            return []
    
    def _load_products(self) -> Dict[int, str]:
        """加载产品映射（带缓存）"""
        if self._products_cache is not None:
            return self._products_cache
        products = self._parse_table_data(self.product_table)
        self._products_cache = {p['ProdNo']: _fix_encoding(p[self.product_name_column]) for p in products if 'ProdNo' in p}
        return self._products_cache
    
    def _load_components(self) -> Dict[int, str]:
        """加载组件/指标映射（带缓存）"""
        if self._components_cache is not None:
            return self._components_cache
        components = self._parse_table_data(self.component_table)
        self._components_cache = {c['CompNo']: _fix_encoding(c[self.component_name_column]) for c in components if 'CompNo' in c}
        return self._components_cache
    
    def _load_samples(self) -> List[Dict[str, Any]]:
        """加载样本数据（带缓存）"""
        if self._samples_cache is not None:
            return self._samples_cache
        self._samples_cache = self._parse_table_data(self.sample_table)
        return self._samples_cache
    
    def _load_predictions(self) -> Dict[int, Dict[int, float]]:
        """加载预测数据（带缓存）"""
        if self._predictions_cache is not None:
            return self._predictions_cache
        
        predictions = self._parse_table_data(self.prediction_table)
        pred_index: Dict[int, Dict[int, float]] = {}
        for pred in predictions:
            samp_ref = pred.get('SampRef')
            comp_ref = pred.get('CompRef')
            value = pred.get(self.value_column)
            
            if samp_ref is None or comp_ref is None or value is None:
                continue
            
            if samp_ref not in pred_index:
                pred_index[samp_ref] = {}
            pred_index[samp_ref][comp_ref] = float(value)
        
        self._predictions_cache = pred_index
        return pred_index
    
    def collect(self) -> Dict[str, Any]:
        """执行数据采集"""
        now = datetime.now()
        
        try:
            # Load mappings (cached)
            products_map = self._load_products()
            components_map = self._load_components()
            
            # Load samples (cached)
            samples = self._load_samples()
            if not samples:
                return {
                    'new_records': 0,
                    'error': '无样本数据',
                    'timestamp': now.isoformat(),
                }
            
            # If no breakpoint (first run), only take the last 50 samples
            if not self._last_collect_time:
                samples = samples[-50:]
                logger.info(f"首次采集，仅处理最近 {len(samples)} 条样本")
            else:
                # Filter samples by breakpoint
                filtered_samples = []
                for sample in samples:
                    sample_time = sample.get(self.time_column)
                    if sample_time is None:
                        continue
                    
                    if isinstance(sample_time, str):
                        try:
                            if 'T' in sample_time:
                                sample_dt = datetime.fromisoformat(sample_time)
                            else:
                                sample_dt = datetime.strptime(sample_time, '%Y-%m-%d %H:%M:%S')
                        except ValueError:
                            continue
                    else:
                        sample_dt = sample_time
                    
                    if sample_dt > self._last_collect_time:
                        filtered_samples.append(sample)
                
                samples = filtered_samples
                logger.info(f"断点过滤后，处理 {len(samples)} 条样本")
            
            # Load predictions (cached)
            pred_index = self._load_predictions()
            
            # Build records
            records = []
            for sample in samples:
                samp_no = sample.get('SampNo')
                prod_ref = sample.get(self.product_ref_column)
                sample_time = sample.get(self.time_column)
                
                if samp_no is None or prod_ref is None or sample_time is None:
                    continue
                
                # Filter by breakpoint
                if self._last_collect_time:
                    if isinstance(sample_time, str):
                        try:
                            # Handle both ISO format and space-separated format
                            if 'T' in sample_time:
                                sample_dt = datetime.fromisoformat(sample_time)
                            else:
                                sample_dt = datetime.strptime(sample_time, '%Y-%m-%d %H:%M:%S')
                        except ValueError:
                            continue
                    else:
                        sample_dt = sample_time
                    
                    if sample_dt <= self._last_collect_time:
                        continue
                
                # Get product name
                product_name = products_map.get(prod_ref, f'Product_{prod_ref}')
                product_code = self._generate_product_code(product_name)
                
                # Get predictions for this sample
                sample_preds = pred_index.get(samp_no, {})
                
                # Filter indicators if configured
                target_components = self.indicators if self.indicators else {v: v for v in components_map.values()}
                
                for indicator_code, indicator_name in target_components.items():
                    # Find component number for this indicator
                    comp_no = None
                    for cn, cn_name in components_map.items():
                        if cn_name == indicator_name or cn_name == indicator_code:
                            comp_no = cn
                            break
                    
                    if comp_no is None:
                        continue
                    
                    value = sample_preds.get(comp_no)
                    if value is None:
                        continue
                    
                    # Format time
                    if isinstance(sample_time, str):
                        time_str = sample_time
                    else:
                        time_str = sample_time.isoformat()
                    
                    record = {
                        'indicator_code': indicator_code.lower(),
                        'indicator_name': indicator_name,
                        'product_code': product_code,
                        'product_name': product_name,
                        'value': round(value, 4),
                        'unit': '',
                        'upper_limit': None,
                        'lower_limit': None,
                        'is_qualified': 1,
                        'sample_time': time_str,
                    }
                    records.append(record)
            
            # Save records
            saved_count = 0
            if self.storage and records:
                saved_count = self.storage.save_data(records)
            
            # Update and persist breakpoint
            if records:
                max_time = max(r['sample_time'] for r in records)
                try:
                    # Handle both ISO format and space-separated format
                    if 'T' in max_time:
                        self._last_collect_time = datetime.fromisoformat(max_time)
                    else:
                        self._last_collect_time = datetime.strptime(max_time, '%Y-%m-%d %H:%M:%S')
                    self._save_breakpoint()
                except ValueError as e:
                    logger.warning(f"解析时间失败: {max_time}, 错误: {e}")
            
            return {
                'new_records': saved_count,
                'timestamp': now.isoformat(),
            }
            
        except Exception as e:
            logger.error(f"MDB 采集失败: {e}", exc_info=True)
            return {
                'new_records': 0,
                'error': str(e),
                'timestamp': now.isoformat(),
            }
    
    def get_breakpoint(self) -> Dict[str, Any]:
        return {
            'last_collect_time': self._last_collect_time.isoformat() if self._last_collect_time else None,
            'mdb_path': self.mdb_path,
        }
    
    def set_breakpoint(self, last_collect_time: str):
        self._last_collect_time = datetime.fromisoformat(last_collect_time)
        self._save_breakpoint()
    
    def _generate_product_code(self, product_name: str) -> str:
        # Use full name as code to avoid duplicates
        return product_name.strip()
    
    def get_products(self) -> List[Dict[str, str]]:
        """获取产品列表"""
        products_map = self._load_products()
        return [
            {'code': self._generate_product_code(name), 'name': name}
            for name in products_map.values()
        ]
    
    def get_indicators(self) -> List[Dict[str, Any]]:
        """获取指标列表"""
        components_map = self._load_components()
        return [
            {'code': name.lower(), 'name': name}
            for name in components_map.values()
        ]
    
    def get_spec_limits(self) -> Dict[str, Dict[str, float]]:
        return {}
    
    def clear_cache(self):
        """清除所有缓存"""
        self._db = None
        self._products_cache = None
        self._components_cache = None
        self._samples_cache = None
        self._predictions_cache = None
    
    def close(self):
        self.clear_cache()
