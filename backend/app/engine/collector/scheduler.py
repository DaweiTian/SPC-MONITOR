import logging
import threading
from datetime import datetime
from typing import Callable, Optional, Dict, Any
from apscheduler.schedulers.background import BackgroundScheduler
from apscheduler.triggers.interval import IntervalTrigger

logger = logging.getLogger(__name__)

FREQUENCY_LADDER = [5, 15, 30, 60, 120, 300]

class AdaptiveScheduler:
    """自适应降级采集调度器"""
    
    def __init__(
        self,
        collect_func: Callable[[], Dict[str, Any]],
        status_change_callback: Optional[Callable[[Dict], None]] = None,
    ):
        self.collect_func = collect_func
        self.status_change_callback = status_change_callback
        self.scheduler = BackgroundScheduler()
        self.current_level = 0
        self.last_collect_time: Optional[datetime] = None
        self.last_record_count = 0
        self._collect_lock = threading.Lock()
        self._is_collecting = False
        self.job = None
    
    @property
    def current_interval(self) -> int:
        return FREQUENCY_LADDER[self.current_level]
    
    @property
    def next_collect_time(self) -> Optional[datetime]:
        try:
            if self.job and self.job.next_run_time:
                return self.job.next_run_time
        except Exception:
            pass
        return None
    
    def start(self):
        self._reschedule(0)
        self.scheduler.start()
        logger.info("降级采集调度器已启动，初始频率: 5 分钟")
    
    def stop(self):
        self.scheduler.shutdown(wait=False)
        logger.info("降级采集调度器已停止")
    
    def _reschedule(self, level: int):
        if self.job:
            self.job.remove()
        
        interval = FREQUENCY_LADDER[level]
        self.current_level = level
        
        self.job = self.scheduler.add_job(
            func=self._run_collection,
            trigger=IntervalTrigger(minutes=interval),
            id="adaptive_collect",
            name=f"自适应采集 (L{level}, {interval}min)",
            replace_existing=True,
            max_instances=1,
            coalesce=True,
            misfire_grace_time=interval * 60,
        )
        
        if self.status_change_callback:
            self.status_change_callback({
                "level": level,
                "interval_minutes": interval,
                "action": "rescheduled",
                "timestamp": datetime.now().isoformat(),
            })
        
        logger.info(f"采集频率调整为: L{level} = {interval} 分钟")
    
    def _run_collection(self):
        if self._is_collecting:
            logger.warning("上一次采集尚未完成，跳过本次")
            return
        with self._collect_lock:
            if self._is_collecting:
                logger.warning("上一次采集尚未完成，跳过本次")
                return
            self._is_collecting = True
        try:
            result = self.collect_func()
            count = result.get("new_records", 0)
            self.last_record_count = count
            self.last_collect_time = datetime.now()
            
            if count > 0:
                if self.current_level > 0:
                    logger.info(f"采集到 {count} 条新数据，恢复到 5 分钟频率")
                    self._reschedule(0)
            else:
                if self.current_level < len(FREQUENCY_LADDER) - 1:
                    next_level = self.current_level + 1
                    logger.info(f"无新数据，降级: L{self.current_level} → L{next_level}")
                    self._reschedule(next_level)
            
            if self.status_change_callback:
                self.status_change_callback({
                    "level": self.current_level,
                    "interval_minutes": self.current_interval,
                    "action": "collected",
                    "new_records": count,
                    "timestamp": datetime.now().isoformat(),
                })
        except Exception as e:
            logger.error(f"采集异常: {e}", exc_info=True)
        finally:
            self._is_collecting = False
    
    def trigger_manual(self) -> Dict[str, Any]:
        logger.info("手动采集触发")
        try:
            result = self.collect_func()
            count = result.get("new_records", 0)
            self.last_record_count = count
            self.last_collect_time = datetime.now()
            
            if count > 0 and self.current_level > 0:
                self._reschedule(0)
            
            return {
                "status": "success",
                "new_records": count,
                "timestamp": datetime.now().isoformat(),
            }
        except Exception as e:
            logger.error(f"手动采集异常: {e}", exc_info=True)
            return {
                "status": "failed",
                "error": str(e),
                "timestamp": datetime.now().isoformat(),
            }
    
    def get_status(self) -> Dict[str, Any]:
        return {
            "current_level": self.current_level,
            "current_interval_minutes": self.current_interval,
            "is_collecting": self._is_collecting,
            "last_collect_time": self.last_collect_time.isoformat() if self.last_collect_time else None,
            "last_record_count": self.last_record_count,
            "next_collect_time": self.next_collect_time.isoformat() if self.next_collect_time else None,
            "frequency_ladder": FREQUENCY_LADDER,
        }
