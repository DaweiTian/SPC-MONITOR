# 网络共享访问功能实现计划

> **For agentic workers:** REQUIRED SUB-SKILL: Use compose:subagent (recommended) or compose:execute to implement this plan task-by-task. Steps use checkbox (`- [ ]`) syntax for tracking.

**Goal:** 支持同一实验室局域网内其他电脑访问监控页面，并限制远程用户的模块访问权限

**Architecture:** 
- 后端：添加 server_config.json 配置文件控制监听地址，添加 IP 检测中间件识别本地/远程访问
- 前端：根据后端返回的权限配置动态显示/隐藏菜单项，远程用户只能访问监控中心相关模块

**Tech Stack:** FastAPI, React, TypeScript

## Global Constraints

- 监听地址默认 `127.0.0.1`（仅本机），配置 `0.0.0.0` 开启网络共享
- 保持现有 API Key 验证机制不变
- 远程用户隐藏的模块：修正值管理、数据管理、配置管理
- 远程用户可见的模块：监控中心（实时看板、SPC控制图、过程能力、指标预测、预警中心）、帮助说明

---

## File Structure

| 文件 | 操作 | 说明 |
|------|------|------|
| `backend/server_config.json` | 新建 | 服务器配置文件（host, port） |
| `backend/app/core/config.py` | 修改 | 添加服务器配置加载逻辑 |
| `backend/main.py` | 修改 | 读取配置启动服务，添加权限查询和网络配置接口 |
| `frontend/src/services/api.ts` | 修改 | 添加权限查询和网络配置 API |
| `frontend/src/contexts/AppContext.tsx` | 修改 | 添加权限状态管理 |
| `frontend/src/components/Layout/index.tsx` | 修改 | 根据权限过滤菜单项 |
| `frontend/src/App.tsx` | 修改 | 添加路由守卫 |
| `frontend/src/pages/Settings/NetworkSettings.tsx` | 新建 | 网络设置页面组件 |

---

### Task 1: 后端 - 添加服务器配置文件

**Covers:** 网络共享配置

**Files:**
- Create: `backend/server_config.json`

- [ ] **Step 1: 创建配置文件**

```json
{
  "host": "127.0.0.1",
  "port": 18080
}
```

- [ ] **Step 2: 验证配置文件格式**

```bash
cd backend
python -c "import json; json.load(open('server_config.json')); print('OK')"
```

---

### Task 2: 后端 - 配置加载逻辑

**Covers:** 配置文件读取

**Files:**
- Modify: `backend/app/core/config.py`

**Interfaces:**
- Produces: `get_server_config()` 函数返回 `{ host: str, port: int }`

- [ ] **Step 1: 添加配置加载函数**

在 `backend/app/core/config.py` 中添加：

```python
import json
import os

# 服务器配置
SERVER_CONFIG_FILE = os.path.join(os.path.dirname(os.path.dirname(os.path.dirname(__file__))), "server_config.json")

def get_server_config() -> dict:
    """获取服务器配置（host, port）"""
    default = {"host": "127.0.0.1", "port": 18080}
    try:
        if os.path.exists(SERVER_CONFIG_FILE):
            with open(SERVER_CONFIG_FILE, 'r', encoding='utf-8') as f:
                config = json.load(f)
                return {
                    "host": config.get("host", default["host"]),
                    "port": int(config.get("port", default["port"]))
                }
    except Exception:
        pass
    return default
```

- [ ] **Step 2: 验证函数**

```bash
cd backend
python -c "from app.core.config import get_server_config; print(get_server_config())"
```

---

### Task 3: 后端 - 修改启动逻辑

**Covers:** 服务器监听地址配置

**Files:**
- Modify: `backend/main.py:547-549`
- Modify: `backend/run.py:70-82`

- [ ] **Step 1: 修改 main.py 启动代码**

将 `backend/main.py` 底部的：
```python
if __name__ == "__main__":
    import uvicorn
    uvicorn.run(app, host="127.0.0.1", port=18080)
```

修改为：
```python
if __name__ == "__main__":
    import uvicorn
    from app.core.config import get_server_config
    config = get_server_config()
    uvicorn.run(app, host=config["host"], port=config["port"])
```

- [ ] **Step 2: 修改 run.py 启动代码**

将 `backend/run.py` 中的：
```python
parser.add_argument('--host', default='127.0.0.1')
parser.add_argument('--port', type=int, default=18080)
```

修改为：
```python
from backend.app.core.config import get_server_config
server_config = get_server_config()

parser.add_argument('--host', default=server_config['host'])
parser.add_argument('--port', type=int, default=server_config['port'])
```

- [ ] **Step 3: 验证配置生效**

```bash
cd backend
python -c "
from app.core.config import get_server_config
config = get_server_config()
print(f'Server will listen on {config[\"host\"]}:{config[\"port\"]}')
"
```

---

### Task 4: 后端 - 添加权限查询接口

**Covers:** 访问权限控制

**Files:**
- Modify: `backend/main.py` (添加新接口)
- Modify: `backend/app/api/config.py` (或在 main.py 中直接添加)

**Interfaces:**
- Produces: `GET /api/permissions` 返回 `{ isLocal: bool, allowedModules: string[] }`

- [ ] **Step 1: 添加权限查询接口**

在 `backend/main.py` 中添加（在现有路由之后）：

```python
from fastapi import Request

# 模块权限配置
LOCAL_ONLY_MODULES = {"correction", "data", "config"}  # 仅本机可访问的模块

def is_local_request(request: Request) -> bool:
    """判断请求是否来自本机"""
    client_host = request.client.host if request.client else "127.0.0.1"
    return client_host in ("127.0.0.1", "::1", "localhost")

@app.get("/api/permissions")
async def get_permissions(request: Request):
    """获取当前客户端的模块访问权限"""
    is_local = is_local_request(request)
    return {
        "isLocal": is_local,
        "allowedModules": "all" if is_local else "restricted",
        "restrictedModules": list(LOCAL_ONLY_MODULES) if not is_local else []
    }
```

- [ ] **Step 2: 验证接口**

```bash
cd backend
python -c "
import requests
# 需要先启动服务
# r = requests.get('http://localhost:18080/api/permissions')
# print(r.json())
print('接口定义正确')
"
```

---

### Task 5: 前端 - 添加权限查询 API

**Covers:** 前端权限获取

**Files:**
- Modify: `frontend/src/services/api.ts`

**Interfaces:**
- Produces: `api.getPermissions()` 返回 `Promise<{ isLocal: boolean, allowedModules: string, restrictedModules: string[] }>`

- [ ] **Step 1: 添加 API 方法**

在 `frontend/src/services/api.ts` 的 api 对象中添加：

```typescript
// 在现有 API 方法之后添加
getPermissions: () =>
  http.get<{ isLocal: boolean; allowedModules: string; restrictedModules: string[] }>('/permissions')
    .then(r => r.data),
```

---

### Task 6: 前端 - 添加权限状态管理

**Covers:** 权限状态管理

**Files:**
- Modify: `frontend/src/contexts/AppContext.tsx`

**Interfaces:**
- Produces: `usePermissions()` hook 返回 `{ isLocal: boolean, canAccess: (module: string) => boolean }`

- [ ] **Step 1: 添加权限状态**

在 AppContext 中添加权限相关的状态和逻辑：

```typescript
// 在 AppContext 的类型定义中添加
interface AppState {
  // ... 现有字段
  permissions: {
    isLocal: boolean
    restrictedModules: string[]
  }
}

// 在 context 值中添加
const [permissions, setPermissions] = useState({
  isLocal: true,  // 默认本机访问
  restrictedModules: [] as string[]
})

// 在初始化时获取权限
useEffect(() => {
  api.getPermissions().then(p => {
    setPermissions(p)
  }).catch(() => {
    // 默认本机权限
    setPermissions({ isLocal: true, restrictedModules: [] })
  })
}, [])

// 辅助函数
const canAccess = (moduleKey: string) => {
  if (permissions.isLocal) return true
  return !permissions.restrictedModules.includes(moduleKey)
}
```

---

### Task 7: 前端 - 修改侧边栏过滤菜单

**Covers:** 菜单权限过滤

**Files:**
- Modify: `frontend/src/components/Layout/index.tsx`

- [ ] **Step 1: 获取权限状态**

在 Layout 组件中获取权限：

```typescript
import { useApp } from '../../contexts/AppContext'

// 在组件内部
const { permissions } = useApp()
```

- [ ] **Step 2: 过滤导航项**

修改 navGroups 的使用，根据权限过滤：

```typescript
// 在渲染前过滤 navGroups
const filteredNavGroups = navGroups.map(group => ({
  ...group,
  items: group.items.filter(item => {
    // 数据管理组的项需要检查权限
    if (group.title === '数据管理') {
      return permissions.isLocal
    }
    return true
  })
})).filter(group => group.items.length > 0)  // 移除空组
```

- [ ] **Step 3: 使用过滤后的导航**

将渲染部分的 `navGroupsWithBadge` 替换为基于 `filteredNavGroups` 计算的版本

---

### Task 8: 前端 - 添加路由守卫

**Covers:** 路由权限保护

**Files:**
- Modify: `frontend/src/App.tsx`

- [ ] **Step 1: 创建路由守卫组件**

```typescript
import { Navigate } from 'react-router-dom'
import { useApp } from './contexts/AppContext'

function ProtectedRoute({ children, moduleKey }: { children: React.ReactNode, moduleKey: string }) {
  const { permissions } = useApp()
  
  if (!permissions.isLocal && permissions.restrictedModules.includes(moduleKey)) {
    return <Navigate to="/dashboard" replace />
  }
  
  return <>{children}</>
}
```

- [ ] **Step 2: 应用路由守卫**

修改路由定义，为受限模块添加守卫：

```typescript
<Route path="/correction" element={
  <ProtectedRoute moduleKey="correction">
    <CorrectionPage />
  </ProtectedRoute>
} />
<Route path="/data" element={
  <ProtectedRoute moduleKey="data">
    <DataPage />
  </ProtectedRoute>
} />
<Route path="/config" element={
  <ProtectedRoute moduleKey="config">
    <ConfigPage />
  </ProtectedRoute>
} />
```

---

### Task 9: 前端 - 网络设置页面

**Covers:** 网络配置界面

**Files:**
- Create: `frontend/src/pages/Settings/NetworkSettings.tsx`
- Modify: `frontend/src/components/Layout/index.tsx` (添加设置入口)

**功能需求：**
- 显示当前监听状态（地址、端口）
- 开关网络共享（127.0.0.1 ↔ 0.0.0.0）
- 显示局域网访问地址（可复制）
- 显示当前连接的客户端信息

- [ ] **Step 1: 创建网络设置组件**

```tsx
// frontend/src/pages/Settings/NetworkSettings.tsx
import { useState, useEffect } from 'react'
import { api } from '../../services/api'
import { useToast } from '../../contexts/ToastContext'

interface NetworkConfig {
  host: string
  port: number
  isNetworkEnabled: boolean
  localIp: string
  accessUrl: string | null
}

export function NetworkSettings() {
  const [config, setConfig] = useState<NetworkConfig | null>(null)
  const [loading, setLoading] = useState(true)
  const [saving, setSaving] = useState(false)
  const { showToast } = useToast()

  useEffect(() => {
    loadConfig()
  }, [])

  const loadConfig = async () => {
    try {
      const data = await api.getNetworkConfig()
      setConfig(data)
    } catch (e) {
      showToast('加载网络配置失败', 'error')
    } finally {
      setLoading(false)
    }
  }

  const toggleNetworkSharing = async () => {
    if (!config) return
    setSaving(true)
    try {
      const newHost = config.isNetworkEnabled ? '127.0.0.1' : '0.0.0.0'
      await api.updateNetworkConfig({ host: newHost })
      await loadConfig()
      showToast(
        config.isNetworkEnabled 
          ? '网络共享已关闭，重启服务后生效' 
          : '网络共享已开启，重启服务后生效',
        'success'
      )
    } catch (e) {
      showToast('保存失败', 'error')
    } finally {
      setSaving(false)
    }
  }

  const copyAccessUrl = () => {
    if (config?.accessUrl) {
      navigator.clipboard.writeText(config.accessUrl)
      showToast('已复制访问地址', 'success')
    }
  }

  if (loading) return <div className="settings-loading">加载中...</div>
  if (!config) return <div className="settings-error">加载失败</div>

  return (
    <div className="network-settings">
      <h3>网络共享设置</h3>
      <p className="settings-desc">配置是否允许同一局域网内的其他设备访问监控系统</p>
      
      <div className="setting-card">
        <div className="setting-item">
          <div className="setting-label">
            <span className="setting-title">网络共享</span>
            <span className="setting-hint">
              {config.isNetworkEnabled 
                ? '同一局域网内的设备可以访问本系统' 
                : '当前仅本机可访问'}
            </span>
          </div>
          <button 
            onClick={toggleNetworkSharing}
            disabled={saving}
            className={`toggle-btn ${config.isNetworkEnabled ? 'active' : ''}`}
          >
            {saving ? '保存中...' : config.isNetworkEnabled ? '已开启' : '已关闭'}
          </button>
        </div>

        {config.isNetworkEnabled && (
          <>
            <div className="setting-item">
              <div className="setting-label">
                <span className="setting-title">局域网访问地址</span>
                <span className="setting-hint">分享此地址给需要访问的同事</span>
              </div>
              <div className="url-display">
                <code>{config.accessUrl}</code>
                <button onClick={copyAccessUrl} className="copy-btn">复制</button>
              </div>
            </div>
            
            <div className="setting-item">
              <div className="setting-label">
                <span className="setting-title">本机 IP 地址</span>
              </div>
              <code className="ip-display">{config.localIp}</code>
            </div>
          </>
        )}

        <div className="setting-item">
          <div className="setting-label">
            <span className="setting-title">服务端口</span>
          </div>
          <code>{config.port}</code>
        </div>
      </div>

      <div className="settings-tip">
        <strong>提示：</strong>修改配置后需要重启服务才能生效
      </div>
    </div>
  )
}
```

- [ ] **Step 2: 添加 CSS 样式**

在 `frontend/src/pages/Settings/NetworkSettings.css` 或相关样式文件中添加：

```css
.network-settings {
  padding: 24px;
  max-width: 600px;
}

.settings-desc {
  color: var(--text-secondary);
  margin-bottom: 24px;
}

.setting-card {
  background: var(--bg-card);
  border-radius: 8px;
  border: 1px solid var(--border-color);
  overflow: hidden;
}

.setting-item {
  display: flex;
  justify-content: space-between;
  align-items: center;
  padding: 16px 20px;
  border-bottom: 1px solid var(--border-color);
}

.setting-item:last-child {
  border-bottom: none;
}

.setting-label {
  display: flex;
  flex-direction: column;
  gap: 4px;
}

.setting-title {
  font-weight: 500;
}

.setting-hint {
  font-size: 12px;
  color: var(--text-secondary);
}

.toggle-btn {
  padding: 8px 16px;
  border-radius: 6px;
  border: 1px solid var(--border-color);
  background: var(--bg-secondary);
  cursor: pointer;
  transition: all 0.2s;
}

.toggle-btn.active {
  background: var(--color-primary);
  color: white;
  border-color: var(--color-primary);
}

.url-display {
  display: flex;
  align-items: center;
  gap: 8px;
}

.url-display code {
  background: var(--bg-secondary);
  padding: 6px 12px;
  border-radius: 4px;
  font-size: 13px;
}

.copy-btn {
  padding: 6px 12px;
  font-size: 12px;
}

.settings-tip {
  margin-top: 16px;
  padding: 12px;
  background: var(--color-warning-bg, #fff3cd);
  border-radius: 6px;
  font-size: 13px;
}
```

- [ ] **Step 3: 添加后端接口**

在 `backend/main.py` 中添加：

```python
import socket

def get_local_ip() -> str:
    """获取本机局域网 IP"""
    try:
        s = socket.socket(socket.AF_INET, socket.SOCK_DGRAM)
        s.connect(("8.8.8.8", 80))
        ip = s.getsockname()[0]
        s.close()
        return ip
    except:
        return "127.0.0.1"

@app.get("/api/network/config")
async def get_network_config():
    """获取网络配置"""
    from app.core.config import get_server_config
    config = get_server_config()
    local_ip = get_local_ip()
    is_network_enabled = config["host"] == "0.0.0.0"
    
    return {
        "host": config["host"],
        "port": config["port"],
        "isNetworkEnabled": is_network_enabled,
        "localIp": local_ip,
        "accessUrl": f"http://{local_ip}:{config['port']}/app/" if is_network_enabled else None
    }

@app.put("/api/network/config")
async def update_network_config(body: dict):
    """更新网络配置"""
    import json
    from app.core.config import SERVER_CONFIG_FILE, get_server_config
    
    current = get_server_config()
    new_host = body.get("host", current["host"])
    
    # 验证 host 值
    if new_host not in ("127.0.0.1", "0.0.0.0"):
        return {"success": False, "message": "无效的监听地址"}
    
    # 更新配置文件
    config = {"host": new_host, "port": current["port"]}
    with open(SERVER_CONFIG_FILE, 'w', encoding='utf-8') as f:
        json.dump(config, f, ensure_ascii=False, indent=2)
    
    return {"success": True, "message": "配置已保存，重启服务后生效"}
```

- [ ] **Step 4: 添加前端 API**

在 `frontend/src/services/api.ts` 中添加：

```typescript
getNetworkConfig: () =>
  http.get('/network/config').then(r => r.data),

updateNetworkConfig: (config: { host: string }) =>
  http.put('/network/config', config).then(r => r.data),
```

- [ ] **Step 5: 添加设置入口**

在侧边栏底部或配置管理中添加"网络设置"入口

---

### Task 10: 测试与验证

**Covers:** 功能验证

- [ ] **Step 1: 测试本机访问**

```bash
# 启动服务
cd backend && python main.py

# 浏览器访问 http://localhost:18080/app/
# 验证：所有模块可见
```

- [ ] **Step 2: 测试网络访问**

```bash
# 修改 server_config.json 为 {"host": "0.0.0.0", "port": 18080}
# 重启服务

# 从其他电脑访问 http://<本机IP>:18080/app/
# 验证：只看到监控中心和帮助，看不到数据管理组
```

- [ ] **Step 3: 测试权限接口**

```bash
# 本机访问
curl http://localhost:18080/api/permissions
# 预期: {"isLocal": true, "allowedModules": "all", "restrictedModules": []}

# 从其他电脑访问
curl http://<IP>:18080/api/permissions
# 预期: {"isLocal": false, "allowedModules": "restricted", "restrictedModules": ["correction", "data", "config"]}
```

- [ ] **Step 4: 测试路由保护**

```
# 从其他电脑直接访问 http://<IP>:18080/app/config
# 预期：自动跳转到 /dashboard
```

---

## 配置说明

### 开启网络共享

编辑 `backend/server_config.json`：
```json
{
  "host": "0.0.0.0",
  "port": 18080
}
```

重启服务后，同一局域网内的设备可通过 `http://<本机IP>:18080/app/` 访问。

### 查看本机 IP

Windows: `ipconfig | findstr IPv4`
Linux/Mac: `ifconfig | grep inet`

---

## 安全说明

- 网络共享时仍需 API Key 验证（默认: `ft1-monitor-default-key`）
- 远程用户无法访问数据管理相关功能
- 建议在可信的局域网环境使用
