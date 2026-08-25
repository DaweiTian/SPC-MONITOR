# 跨指标预测报警功能设计文档

## [S1] 架构设计

### 核心流程

1. 用户在品项编辑页面配置预测指标的USL/LSL（复用spec_limits.json）
2. 用户配置报警阈值（默认±10%）
3. 预测计算时，后端同时检查阈值
4. 如果触发报警，返回报警状态和消息
5. 前端显示警告弹窗，用户确认后保存确认记录

### 数据流

```
配置页面 → prediction_config.json (扩展阈值字段)
         → spec_limits.json (复用USL/LSL)

预测API → 检查阈值 → 返回报警状态
前端 → 显示警告 → 用户确认 → 保存确认记录
```

## [S2] 数据模型设计

### 1. prediction_config.json 扩展

```json
{
  "砖草莓味优酸乳乳饮料": {
    "saturated_fat": {
      "source_indicator": "fat",
      "coefficient": 0.623,
      "enabled": true,
      "alert_threshold": 0.10,
      "alert_enabled": true
    }
  }
}
```

**字段说明：**
- `alert_threshold`: 报警阈值，小数形式（0.10表示10%）
- `alert_enabled`: 是否启用报警功能

### 2. 新增 prediction_alerts.json

```json
{
  "alerts": [
    {
      "id": "alert_20260117_001",
      "product": "砖草莓味优酸乳乳饮料",
      "indicator": "saturated_fat",
      "predicted_value": 3.25,
      "usl": 3.0,
      "lsl": 2.0,
      "threshold_percent": 10,
      "alert_type": "above_usl",
      "alert_message": "预测值 3.25 超出规格上限 3.0 的 10%",
      "status": "pending",
      "confirmed_by": null,
      "confirmed_at": null,
      "confirm_note": null,
      "created_at": "2026-01-17T10:30:00"
    }
  ]
}
```

**字段说明：**
- `id`: 唯一报警ID，格式：alert_YYYYMMDD_NNN
- `alert_type`: 报警类型（above_usl/below_lsl）
- `status`: 状态（pending/confirmed）
- `confirmed_by`: 确认人
- `confirmed_at`: 确认时间
- `confirm_note`: 确认备注

### 3. spec_limits.json 复用

直接读取现有配置，无需修改。

## [S3] 后端API设计

### 1. 修改预测API (`predict.py`)

```python
@router.post("/predict")
def predict_indicator(...):
    # 现有预测逻辑
    predicted_value = predict_cross_indicator(...)
    
    # 新增：阈值检查
    alert_config = get_alert_config(product, indicator)
    if alert_config and alert_config.get('alert_enabled'):
        spec_limits = _get_spec_limits(product, indicator)
        threshold = alert_config.get('alert_threshold', 0.10)
        
        alert = check_prediction_alert(
            predicted_value, spec_limits, threshold
        )
        if alert:
            # 保存报警记录
            save_prediction_alert(alert)
            # WebSocket推送
            await broadcast_typed('prediction_alert', alert)
            
    return {
        "predicted_value": predicted_value,
        "alert": alert  # 可能为None
    }
```

### 2. 新增报警确认API

```python
@router.post("/prediction-alerts/{alert_id}/confirm")
def confirm_alert(alert_id: str, note: str):
    # 更新报警状态为confirmed
    # 记录确认人、时间、备注
```

### 3. 新增报警查询API

```python
@router.get("/prediction-alerts")
def get_alerts(product: str = None, status: str = None):
    # 查询报警记录，支持按产品和状态筛选
```

## [S4] 前端UI设计

### 1. 品项编辑页面扩展

在预测指标配置区域添加：
- 报警阈值输入框（默认10%）
- 报警启用开关
- USL/LSL显示（从spec_limits.json读取）

### 2. 预测页面警告弹窗

当预测值触发报警时，显示Modal弹窗：
- 警告图标和标题
- 预测值、USL、LSL、阈值信息
- 确认原因输入框
- 确认按钮

### 3. 报警记录页面

新增或扩展现有报警页面：
- 报警列表（产品、指标、预测值、状态）
- 筛选功能（按产品、状态）
- 确认操作（点击确认，输入备注）

## [S5] 错误处理和边界情况

### 1. 配置缺失处理

- 如果spec_limits.json中没有对应指标的USL/LSL，跳过报警检查
- 如果prediction_config.json中没有阈值配置，使用默认值10%

### 2. 数据验证

- 阈值必须在0-100%之间
- USL必须大于LSL
- 预测值必须为数字

### 3. 并发处理

- 报警记录使用唯一ID避免重复
- 确认操作需要检查报警状态是否为pending

### 4. 用户体验

- 报警弹窗可以关闭，但未确认的报警会持续显示
- 确认后更新报警状态，不再重复提醒

## [S6] 测试策略

### 1. 单元测试

- 测试阈值检查函数
- 测试报警记录生成
- 测试数据验证逻辑

### 2. 集成测试

- 测试预测API的报警流程
- 测试报警确认API
- 测试WebSocket推送

### 3. 前端测试

- 测试配置页面的阈值输入
- 测试警告弹窗的显示和交互
- 测试报警记录页面的筛选和确认

### 4. 端到端测试

- 模拟预测值触发报警的完整流程
- 测试用户确认后的状态更新
