#!/usr/bin/env python3
"""模拟插入高脂肪数据来测试预测报警"""
import sqlite3
import sys
from datetime import datetime
from pathlib import Path

# 数据库路径
DB_PATH = Path(__file__).parent / "data" / "monitor.db"

def insert_test_data():
    """插入测试数据"""
    if not DB_PATH.exists():
        print(f"数据库不存在: {DB_PATH}")
        return False
    
    conn = sqlite3.connect(str(DB_PATH))
    
    # 插入高脂肪数据 (3.6 g/100g)
    # 预测饱和脂肪 = 3.6 * 0.6277 = 2.26 > USL(2) * 1.1 = 2.2
    fat_value = 3.6
    product_code = "砖高钙低脂奶"
    product_name = "砖高钙低脂奶"
    sample_time = datetime.now().isoformat()
    
    try:
        conn.execute(
            """INSERT INTO monitor_data
               (indicator_code, indicator_name, product_code, product_name,
                value, raw_value, correction, unit, upper_limit, lower_limit,
                is_qualified, sample_time)
               VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?)""",
            (
                "fat",           # indicator_code
                "脂肪",          # indicator_name
                product_code,
                product_name,
                fat_value,       # value
                fat_value,       # raw_value
                0,               # correction
                "g/100g",        # unit
                5.0,             # upper_limit (假设)
                3.0,             # lower_limit (假设)
                1,               # is_qualified
                sample_time,
            ),
        )
        conn.commit()
        print(f"✅ 成功插入测试数据:")
        print(f"   产品: {product_name}")
        print(f"   指标: 脂肪 (fat)")
        print(f"   值: {fat_value} g/100g")
        print(f"   时间: {sample_time}")
        print(f"\n📊 预测计算:")
        print(f"   饱和脂肪 = 脂肪 × 0.6277 = {fat_value * 0.6277:.4f} g/100g")
        print(f"   USL = 2.0, 阈值 = 10%")
        print(f"   报警触发条件: 预测值 > 2.0 × 1.1 = 2.2")
        print(f"   预测值 {fat_value * 0.6277:.4f} > 2.2 → 应触发报警 ⚠️")
        return True
    except Exception as e:
        print(f"❌ 插入失败: {e}")
        return False
    finally:
        conn.close()

if __name__ == "__main__":
    insert_test_data()
