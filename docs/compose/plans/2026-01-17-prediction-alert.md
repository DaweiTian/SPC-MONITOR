# 跨指标预测报警功能实现计划

> **For agentic workers:** REQUIRED SUB-SKILL: Use compose:subagent (recommended) or compose:execute to implement this plan task-by-task. Steps use checkbox (`- [ ]`) syntax for tracking.

**Goal:** 为跨指标预测功能添加报警机制，当预测值±阈值超出USL/LSL时触发报警，提示用户手工法监测确认。

**Architecture:** 后端主导方案——在预测API中增加阈值检查逻辑，复用现有alerts表和报警引擎，前端在预测页面显示警告弹窗并支持确认操作。

**Tech Stack:** Python/FastAPI (后端), React/TypeScript (前端), SQLite (存储)

## Global Constraints

- 复用现有 `spec_limits.json` 中的USL/LSL配置
- 复用现有 `alerts` 表存储预测报警记录
- 报警阈值可配置，默认10%（0.10）
- 报警展示：页面内警告弹窗 + 报警记录页面
- 确认流程：确认+备注

---

### Task 1: 扩展 prediction_config.json 数据模型

**Covers:** [S2]

**Files:**
- Modify: `backend/app/api/config.py` — 更新 prediction-config 端点的验证逻辑
- Modify: `prediction_config.json` — 添加新字段

**Interfaces:**
- Produces: `prediction_config.json` 中每个指标新增 `alert_threshold: float` 和 `alert_enabled: bool` 字段

- [ ] **Step 1: 读取现有 prediction_config.json**

```bash
cat prediction_config.json
```

- [ ] **Step 2: 更新 prediction_config.json 示例数据**

为现有配置添加报警字段：
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

- [ ] **Step 3: 更新 config.py 的 prediction-config PUT 端点**

在 `update_prediction_config` 函数中添加字段验证：

```python
@router.put("/prediction-config/{product_code}")
def update_prediction_config(product_code: str, indicators: dict):
    """更新某产品的交叉预测指标配置"""
    data = _load_json_config(PREDICTION_CONFIG_FILE, {})
    
    # 验证并设置默认值
    for indicator, cfg in indicators.items():
        if "alert_threshold" in cfg:
            threshold = cfg["alert_threshold"]
            if not (0 < threshold <= 1):
                raise HTTPException(400, "报警阈值必须在0-1之间")
        cfg.setdefault("alert_threshold", 0.10)
        cfg.setdefault("alert_enabled", False)
    
    data[product_code] = indicators
    success = _save_json_config(PREDICTION_CONFIG_FILE, data)
    return {"success": success}
```

- [ ] **Step 4: 验证配置更新**

```bash
curl -X PUT http://localhost:18080/api/config/prediction-config/test_product \
  -H "Content-Type: application/json" \
  -d '{"saturated_fat": {"source_indicator": "fat", "coefficient": 0.623, "enabled": true, "alert_threshold": 0.10, "alert_enabled": true}}'
```

- [ ] **Step 5: Commit**

```bash
git add prediction_config.json backend/app/api/config.py
git commit -m "feat: extend prediction config with alert threshold fields"
```

---

### Task 2: 实现预测报警检查逻辑

**Covers:** [S3]

**Files:**
- Create: `backend/app/engine/predictor/alert_checker.py` — 报警检查逻辑
- Modify: `backend/app/api/predict.py` — 在跨指标预测端点中调用报警检查

**Interfaces:**
- Consumes: `prediction_config.json` 中的 `alert_threshold`, `alert_enabled`
- Consumes: `spec_limits.json` 中的 `usl`, `lsl`
- Produces: `check_prediction_alert(predicted_value, usl, lsl, threshold) -> dict | None`

- [ ] **Step 1: 创建 alert_checker.py**

```python
"""跨指标预测报警检查器"""
from typing import Optional, Dict, Any
from datetime import datetime
import uuid


def check_prediction_alert(
    predicted_value: float,
    usl: Optional[float],
    lsl: Optional[float],
    threshold: float = 0.10,
) -> Optional[Dict[str, Any]]:
    """
    检查预测值是否触发报警
    
    Args:
        predicted_value: 预测值
        usl: 规格上限
        lsl: 规格下限
        threshold: 报警阈值（小数形式，0.10表示10%）
    
    Returns:
        报警信息字典，无报警返回None
    """
    if usl is None and lsl is None:
        return None
    
    alert = None
    
    # 检查是否超出USL + 阈值
    if usl is not None:
        usl_threshold = usl * (1 + threshold)
        if predicted_value > usl_threshold:
            alert = {
                "alert_type": "prediction_above_usl",
                "severity": "WARNING",
                "message": f"预测值 {predicted_value:.4f} 超出规格上限 {usl:.4f} 的 {threshold*100:.0f}%",
                "test_value": predicted_value,
                "control_limit": f"USL={usl:.4f}, 阈值={threshold*100:.0f}%",
            }
    
    # 检查是否低于LSL - 阈值
    if lsl is not None:
        lsl_threshold = lsl * (1 - threshold)
        if predicted_value < lsl_threshold:
            alert = {
                "alert_type": "prediction_below_lsl",
                "severity": "WARNING",
                "message": f"预测值 {predicted_value:.4f} 低于规格下限 {lsl:.4f} 的 {threshold*100:.0f}%",
                "test_value": predicted_value,
                "control_limit": f"LSL={lsl:.4f}, 阈值={threshold*100:.0f}%",
            }
    
    if alert:
        alert["alert_id"] = f"PA-{datetime.now().strftime('%Y%m%d')}-{uuid.uuid4().hex[:6].upper()}"
        alert["rule_type"] = alert["alert_type"]
        alert["rule_desc"] = alert["message"]
        alert["generated_at"] = datetime.now().isoformat()
    
    return alert
```

- [ ] **Step 2: 修改 predict.py 的 get_cross_indicator_prediction 端点**

```python
from backend.app.engine.predictor.alert_checker import check_prediction_alert

@router.get("/cross-indicator")
def get_cross_indicator_prediction(
    product: str = Query(...),
    target: str = Query("saturated_fat"),
    limit: int = Query(200),
):
    # ... 现有逻辑 ...
    
    # 新增：报警检查
    alert = None
    pred_config = _load_prediction_config()
    product_config = pred_config.get(product, {}).get(target, {})
    
    if product_config.get("alert_enabled", False):
        threshold = product_config.get("alert_threshold", 0.10)
        usl, lsl = _get_spec_limits(product, target)
        
        if latest_predicted is not None:
            alert = check_prediction_alert(latest_predicted, usl, lsl, threshold)
            
            if alert:
                # 保存到alerts表
                alert["product_code"] = product
                alert["indicator_code"] = target
                alert["message"] = alert["message"]
                storage.save_alert(alert)
                
                # WebSocket推送
                try:
                    from backend.app.api.websocket import broadcast_typed
                    import asyncio
                    asyncio.ensure_future(broadcast_typed('prediction_alert', alert))
                except Exception:
                    pass
    
    return {
        "success": True,
        "data": {
            # ... 现有返回数据 ...
            "alert": alert,
        }
    }
```

- [ ] **Step 3: 添加 _load_prediction_config 辅助函数**

```python
import json
from pathlib import Path

PREDICTION_CONFIG_FILE = Path(__file__).parent.parent.parent.parent / "prediction_config.json"

def _load_prediction_config() -> dict:
    """加载预测配置"""
    if PREDICTION_CONFIG_FILE.exists():
        with open(PREDICTION_CONFIG_FILE, "r", encoding="utf-8") as f:
            return json.load(f)
    return {}
```

- [ ] **Step 4: 测试报警检查逻辑**

```bash
cd backend
python -c "
from app.engine.predictor.alert_checker import check_prediction_alert

# 测试超出USL
alert = check_prediction_alert(3.5, usl=3.0, lsl=2.0, threshold=0.10)
print('超出USL:', alert)

# 测试低于LSL
alert = check_prediction_alert(1.5, usl=3.0, lsl=2.0, threshold=0.10)
print('低于LSL:', alert)

# 测试正常范围
alert = check_prediction_alert(2.5, usl=3.0, lsl=2.0, threshold=0.10)
print('正常范围:', alert)
"
```

- [ ] **Step 5: Commit**

```bash
git add backend/app/engine/predictor/alert_checker.py backend/app/api/predict.py
git commit -m "feat: add prediction alert checker for cross-indicator prediction"
```

---

### Task 3: 前端配置页面添加报警阈值配置

**Covers:** [S4]

**Files:**
- Modify: `frontend/src/pages/Config/index.tsx` — 在预测指标配置区域添加报警阈值和USL/LSL显示

**Interfaces:**
- Consumes: `GET /api/config/prediction-config` 返回的配置数据
- Consumes: `GET /api/config/spec-limits` 返回的规格限数据
- Produces: `PUT /api/config/prediction-config/{product}` 更新配置

- [ ] **Step 1: 读取现有预测指标配置区域代码**

```bash
grep -n "预测指标" frontend/src/pages/Config/index.tsx
```

- [ ] **Step 2: 添加报警阈值状态**

在组件顶部添加状态：
```typescript
const [alertThreshold, setAlertThreshold] = useState<string>("0.10");
const [alertEnabled, setAlertEnabled] = useState<boolean>(true);
const [specLimits, setSpecLimits] = useState<Record<string, {usl?: number, lsl?: number}>>({});
```

- [ ] **Step 3: 加载规格限数据**

在 useEffect 中添加：
```typescript
useEffect(() => {
  // 加载规格限
  api.getSpecLimits().then(data => {
    if (selectedProduct) {
      const productLimits = data[selectedProduct] || {};
      setSpecLimits(productLimits);
    }
  });
}, [selectedProduct]);
```

- [ ] **Step 4: 扩展预测指标配置UI**

在饱和脂肪配置区域后添加：
```tsx
{predictSaturatedFat && (
  <div style={{ marginTop: '4px', padding: '10px 12px', fontSize: '12px', background: 'var(--bg-secondary)', borderRadius: '6px' }}>
    {/* 现有系数配置 */}
    <div style={{ display: 'flex', alignItems: 'center', gap: '8px', marginBottom: '8px' }}>
      <span>预测系数 (k):</span>
      <input ... />
    </div>
    
    {/* 新增：USL/LSL显示 */}
    {specLimits.saturated_fat && (
      <div style={{ marginBottom: '8px', color: 'var(--text-muted)' }}>
        规格限: USL={specLimits.saturated_fat.usl ?? '未设置'}, LSL={specLimits.saturated_fat.lsl ?? '未设置'}
      </div>
    )}
    
    {/* 新增：报警配置 */}
    <div style={{ borderTop: '1px solid var(--border)', paddingTop: '8px', marginTop: '8px' }}>
      <label style={{ display: 'flex', alignItems: 'center', gap: '8px', marginBottom: '8px' }}>
        <input
          type="checkbox"
          checked={alertEnabled}
          onChange={e => setAlertEnabled(e.target.checked)}
        />
        <span>启用预测报警</span>
      </label>
      
      {alertEnabled && (
        <div style={{ display: 'flex', alignItems: 'center', gap: '8px' }}>
          <span>报警阈值:</span>
          <input
            type="number"
            step="0.01"
            min="0.01"
            max="1"
            className={styles.formInput}
            style={{ width: '80px', padding: '4px 8px' }}
            value={alertThreshold}
            onChange={e => setAlertThreshold(e.target.value)}
            placeholder="0.10"
          />
          <span style={{ color: 'var(--text-muted)' }}>(默认10%)</span>
        </div>
      )}
    </div>
  </div>
)}
```

- [ ] **Step 5: 更新保存逻辑**

在保存预测配置时包含报警字段：
```typescript
const savePredictionConfig = async () => {
  const config = {
    saturated_fat: {
      source_indicator: "fat",
      coefficient: parseFloat(predCoefficient),
      enabled: predictSaturatedFat,
      alert_threshold: parseFloat(alertThreshold),
      alert_enabled: alertEnabled,
    }
  };
  await api.updatePredictionConfig(selectedProduct, config);
};
```

- [ ] **Step 6: Commit**

```bash
git add frontend/src/pages/Config/index.tsx
git commit -m "feat: add alert threshold config to prediction indicators"
```

---

### Task 4: 前端预测页面添加报警警告弹窗

**Covers:** [S4]

**Files:**
- Modify: `frontend/src/pages/Prediction/index.tsx` — 添加预测报警警告弹窗

**Interfaces:**
- Consumes: `GET /api/predict/cross-indicator` 返回的 `alert` 字段
- Produces: 用户确认操作调用 `POST /api/alerts/{alert_id}/resolve`

- [ ] **Step 1: 添加报警弹窗状态**

```typescript
const [predictionAlert, setPredictionAlert] = useState<any>(null);
const [showAlertModal, setShowAlertModal] = useState(false);
const [confirmNote, setConfirmNote] = useState('');
```

- [ ] **Step 2: 在跨指标预测响应中检查报警**

```typescript
const loadCrossPrediction = async () => {
  const result = await api.getCrossIndicatorPrediction(product, target);
  if (result.alert) {
    setPredictionAlert(result.alert);
    setShowAlertModal(true);
  }
};
```

- [ ] **Step 3: 添加报警警告弹窗组件**

```tsx
<Modal
  title="预测值报警"
  open={showAlertModal}
  onCancel={() => setShowAlertModal(false)}
  footer={[
    <Button key="cancel" onClick={() => setShowAlertModal(false)}>
      关闭
    </Button>,
    <Button key="confirm" type="primary" onClick={handleConfirmAlert}>
      确认并继续
    </Button>,
  ]}
>
  {predictionAlert && (
    <div>
      <Alert
        type="warning"
        message={predictionAlert.message}
        showIcon
      />
      <div style={{ marginTop: '16px' }}>
        <p><strong>预测值:</strong> {predictionAlert.test_value?.toFixed(4)}</p>
        <p><strong>规格限:</strong> {predictionAlert.control_limit}</p>
      </div>
      <div style={{ marginTop: '16px' }}>
        <label>确认备注:</label>
        <Input.TextArea
          value={confirmNote}
          onChange={e => setConfirmNote(e.target.value)}
          placeholder="请输入手工法监测确认原因"
          rows={3}
        />
      </div>
    </div>
  )}
</Modal>
```

- [ ] **Step 4: 实现确认处理函数**

```typescript
const handleConfirmAlert = async () => {
  if (!predictionAlert) return;
  
  await api.resolveAlert(
    predictionAlert.alert_id,
    '当前用户', // 实际应从认证系统获取
    confirmNote,
    'confirm'
  );
  
  setShowAlertModal(false);
  setConfirmNote('');
  setPredictionAlert(null);
  
  message.success('已确认报警');
};
```

- [ ] **Step 5: Commit**

```bash
git add frontend/src/pages/Prediction/index.tsx
git commit -m "feat: add prediction alert warning modal"
```

---

### Task 5: 扩展报警页面支持预测报警

**Covers:** [S4]

**Files:**
- Modify: `frontend/src/pages/Alerts/index.tsx` — 添加预测报警类型筛选
- Modify: `frontend/src/constants/alertRules.ts` — 添加预测报警规则类型映射

**Interfaces:**
- Consumes: `GET /api/alerts` 返回的报警列表
- Produces: 预测报警类型的中文显示

- [ ] **Step 1: 添加预测报警规则类型映射**

在 `alertRules.ts` 中添加：
```typescript
export const RULE_TYPE_CN: Record<string, string> = {
  // ... 现有映射 ...
  prediction_above_usl: '预测超上限',
  prediction_below_lsl: '预测低下限',
};
```

- [ ] **Step 2: 在报警规则配置中添加预测报警规则**

在 `alert_rules.json` 中添加：
```json
{
  "id": 11,
  "rule": "预测超上限",
  "description": "预测值超出规格上限的阈值",
  "severity": "WARNING",
  "enabled": true,
  "rule_type": "prediction_above_usl"
},
{
  "id": 12,
  "rule": "预测低下限",
  "description": "预测值低于规格下限的阈值",
  "severity": "WARNING",
  "enabled": true,
  "rule_type": "prediction_below_lsl"
}
```

- [ ] **Step 3: 验证报警页面显示**

启动前端开发服务器，检查预测报警是否正确显示：
```bash
cd frontend && npm run dev
```

- [ ] **Step 4: Commit**

```bash
git add frontend/src/constants/alertRules.ts alert_rules.json
git commit -m "feat: add prediction alert rule types to alerts page"
```

---

### Task 6: 集成测试和验证

**Covers:** [S6]

**Files:**
- Test: 手动测试完整流程

**Interfaces:**
- 验证端到端流程：配置 → 预测 → 报警 → 确认

- [ ] **Step 1: 启动后端服务**

```bash
cd backend && python main.py
```

- [ ] **Step 2: 配置预测报警**

通过API或前端配置页面：
```bash
curl -X PUT http://localhost:18080/api/config/prediction-config/砖草莓味优酸乳乳饮料 \
  -H "Content-Type: application/json" \
  -d '{"saturated_fat": {"source_indicator": "fat", "coefficient": 0.623, "enabled": true, "alert_threshold": 0.10, "alert_enabled": true}}'
```

- [ ] **Step 3: 触发预测并验证报警**

```bash
curl "http://localhost:18080/api/predict/cross-indicator?product=砖草莓味优酸乳乳饮料&target=saturated_fat"
```

验证返回结果中包含 `alert` 字段。

- [ ] **Step 4: 验证报警记录**

```bash
curl "http://localhost:18080/api/alerts?status=pending"
```

验证预测报警记录已保存。

- [ ] **Step 5: 验证前端显示**

1. 打开预测页面，触发预测
2. 验证报警弹窗显示
3. 输入确认备注，点击确认
4. 打开报警页面，验证报警记录显示

- [ ] **Step 6: Commit**

```bash
git add -A
git commit -m "feat: complete prediction alert feature with end-to-end testing"
```
