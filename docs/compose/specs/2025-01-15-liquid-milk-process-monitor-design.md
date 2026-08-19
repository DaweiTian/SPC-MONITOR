# 液奶过程监控系统设计文档

## [S1] 项目概述

### 项目名称
液奶过程监控系统 (Liquid Milk Process Monitoring System)

### 项目位置
`/home/erribaba/git-workstation/FT1-MONITOR`

### 项目定位
专注于 FT120 仪器数据的实时检测和分析，提供 SPC 控制图、过程能力分析、实时预警等功能。

### 技术栈
| 层 | 技术 |
|----|------|
| 前端 | React 18 + TypeScript + Ant Design 5 + ECharts 5 |
| 后端 | FastAPI + Uvicorn |
| 数据 | SQLite + pandas |
| 分析 | NumPy + SciPy + statsmodels |
| 启动器 | Rust + Tauri |

---

## [S2] 项目架构

### 整体架构

```
FT1-MONITOR/
├── backend/                    # FastAPI 后端
│   ├── app/
│   │   ├── api/               # API 路由
│   │   ├── core/              # 核心配置
│   │   ├── models/            # 数据模型
│   │   ├── services/          # 业务服务
│   │   └── engine/            # 分析引擎
│   │       ├── spc/           # SPC 分析
│   │       ├── alert/         # 预警引擎
│   │       └── collector/     # 数据采集
│   ├── main.py
│   └── requirements.txt
├── frontend/                   # React 前端
│   ├── src/
│   │   ├── components/        # 通用组件
│   │   ├── pages/             # 页面
│   │   ├── services/          # API 服务
│   │   └── utils/             # 工具函数
│   ├── package.json
│   └── vite.config.ts
├── launcher/                   # Rust 启动器
│   ├── src/
│   │   ├── main.rs
│   │   ├── tray.rs
│   │   ├── service.rs
│   │   └── updater.rs
│   └── Cargo.toml
├── config/                     # 配置文件
│   ├── items.yaml
│   └── spc_rules.yaml
└── README.md
```

### 核心模块

1. **数据采集层**: SQL Server 连接 + 自适应调度
2. **分析引擎层**: SPC 控制图 + 过程能力 + Nelson 规则
3. **预警引擎层**: 实时预警生成 + 声音/弹窗提醒
4. **API 层**: RESTful API + WebSocket 实时推送
5. **前端展示层**: React + Ant Design + ECharts

---

## [S3] 后端设计

### 模块划分

```
backend/
├── app/
│   ├── api/
│   │   ├── __init__.py
│   │   ├── monitor.py         # 监控 API (看板/状态/采集)
│   │   ├── spc.py             # SPC 分析 API
│   │   ├── alerts.py          # 预警 API
│   │   ├── config.py          # 配置 API
│   │   └── websocket.py       # WebSocket 推送
│   ├── core/
│   │   ├── __init__.py
│   │   ├── config.py          # 全局配置
│   │   ├── database.py        # 数据库连接
│   │   └── dependencies.py    # 依赖注入
│   ├── models/
│   │   ├── __init__.py
│   │   ├── schemas.py         # Pydantic 模型
│   │   └── database.py        # SQLAlchemy 模型
│   ├── services/
│   │   ├── __init__.py
│   │   ├── monitor_service.py # 监控服务
│   │   ├── spc_service.py     # SPC 服务
│   │   └── alert_service.py   # 预警服务
│   └── engine/
│       ├── __init__.py
│       ├── spc/
│       │   ├── __init__.py
│       │   ├── control_charts.py  # 控制图
│       │   ├── rules.py          # Nelson 规则
│       │   └── capability.py     # 过程能力
│       ├── alert/
│       │   ├── __init__.py
│       │   └── engine.py         # 预警引擎
│       └── collector/
│           ├── __init__.py
│           ├── base.py           # 采集器基类
│           ├── sqlserver.py      # SQL Server 采集器
│           ├── mock.py           # Mock 采集器
│           └── scheduler.py      # 自适应调度器
├── main.py
└── requirements.txt
```

### 核心功能

1. **数据采集**: SQL Server 连接 + 自适应降级调度
2. **SPC 分析**: I-MR 控制图 + 8 条 Nelson 规则
3. **过程能力**: Cp/Cpk/Pp/Ppk 计算
4. **预警系统**: 实时预警 + WebSocket 推送
5. **配置管理**: 数据库连接 + 采集参数 + 预警阈值

---

## [S4] 前端设计

### 模块划分

```
frontend/
├── src/
│   ├── components/
│   │   ├── Layout/            # 布局组件
│   │   │   ├── Header.tsx
│   │   │   ├── Sidebar.tsx
│   │   │   └── index.tsx
│   │   ├── Charts/            # 图表组件
│   │   │   ├── SPCChart.tsx
│   │   │   └── CapabilityChart.tsx
│   │   ├── Alert/             # 预警组件
│   │   │   ├── AlertCard.tsx
│   │   │   └── AlertSound.tsx
│   │   └── Common/            # 通用组件
│   │       ├── KPICard.tsx
│   │       └── StatusTag.tsx
│   ├── pages/
│   │   ├── Dashboard/         # 实时看板
│   │   │   └── index.tsx
│   │   ├── SPC/               # SPC 控制图
│   │   │   └── index.tsx
│   │   ├── Capability/        # 过程能力分析
│   │   │   └── index.tsx
│   │   ├── Alerts/            # 预警列表
│   │   │   └── index.tsx
│   │   └── Config/            # 配置管理
│   │       └── index.tsx
│   ├── services/
│   │   ├── api.ts             # API 客户端
│   │   ├── websocket.ts       # WebSocket 服务
│   │   └── alarm.ts           # 报警声音
│   ├── hooks/                 # 自定义 Hooks
│   │   ├── useWebSocket.ts
│   │   └── useAlarm.ts
│   ├── types/                 # TypeScript 类型
│   │   └── index.ts
│   └── App.tsx
├── package.json
└── vite.config.ts
```

### 页面功能

1. **实时看板**: KPI 卡片 + 最近数据 + 最新预警 + 采集状态
2. **SPC 控制图**: I-MR 图 + Nelson 规则检测 + 规格限对比
3. **过程能力分析**: Cp/Cpk/Pp/Ppk + 直方图 + 能力仪表盘
4. **预警列表**: 预警筛选 + 统计 + 处理操作
5. **配置管理**: 数据库连接 + 采集参数 + 预警阈值

### 技术选型

- React 18 + TypeScript
- Ant Design 5
- ECharts 5
- Axios
- WebSocket

---

## [S5] Rust 启动器设计

### 模块划分

```
launcher/
├── src/
│   ├── main.rs               # 主入口
│   ├── app.rs                # 应用状态管理
│   ├── tray.rs               # 系统托盘
│   ├── service.rs            # 服务管理
│   │   ├── start()
│   │   ├── stop()
│   │   └── status()
│   ├── updater.rs            # 自动更新
│   │   ├── check_update()
│   │   ├── download()
│   │   └── apply_update()
│   ├── config.rs             # 配置管理
│   └── utils.rs              # 工具函数
├── Cargo.toml
└── build.rs
```

### 核心功能

1. **系统托盘**
   - 显示服务状态（运行中/已停止）
   - 右键菜单：启动/停止服务、打开浏览器、查看日志、退出
   - 双击打开状态窗口

2. **服务管理**
   - 启动/停止后端服务（Python 进程）
   - 启动/停止前端静态文件服务
   - 进程监控和自动重启
   - 日志收集和管理

3. **自动更新**
   - 检查远程版本
   - 下载更新包
   - 备份当前版本
   - 应用更新并重启

4. **配置管理**
   - 开机自启设置
   - 服务端口配置
   - 日志级别配置

### 技术选型

- Tauri（轻量级，比 Electron 小 10x）
- tokio（异步运行时）
- reqwest（HTTP 客户端）
- serde（序列化）

---

## [S6] 数据流设计

### 数据流向

```
FT120 SQL Server
       ↓
  数据采集器 (SQL Server Collector)
       ↓
  自适应调度器 (Adaptive Scheduler)
       ↓
  SQLite 存储 (Online Storage)
       ↓
  分析引擎 (SPC + Capability)
       ↓
  预警引擎 (Alert Engine)
       ↓
  WebSocket 推送 + REST API
       ↓
  React 前端展示
```

### 实时数据流

1. 调度器定时触发采集
2. 采集器从 SQL Server 读取新数据
3. 数据存储到 SQLite
4. 分析引擎计算 SPC 和过程能力
5. 预警引擎检查规则并生成预警
6. 通过 WebSocket 推送到前端
7. 前端实时更新看板和图表

### 降级策略

- 无数据时：5m → 15m → 30m → 1h → 2h → 5h
- 有数据时：立即恢复到 5m
- 手动采集：不影响自动调度

### 预警规则

1. Nelson 8 条判异规则
2. Cpk 低于阈值（默认 1.33）
3. 超出规格限（USL/LSL）

---

## [S7] API 设计

### REST API 端点

```
# 监控相关
GET  /api/monitor/dashboard          # 看板数据
GET  /api/monitor/status             # 采集状态
POST /api/monitor/collect/manual     # 手动采集
GET  /api/monitor/products           # 品项列表
GET  /api/monitor/indicators         # 指标列表
GET  /api/monitor/data/recent        # 最近数据

# SPC 分析
GET  /api/spc/{product}/{indicator}  # SPC 数据
GET  /api/capability/{product}/{indicator}  # 过程能力

# 预警相关
GET  /api/alerts                     # 预警列表
POST /api/alerts/{id}/resolve        # 处理预警

# 配置相关
GET  /api/config                     # 获取配置
PUT  /api/config                     # 更新配置
GET  /api/config/db                  # 数据库配置
PUT  /api/config/db                  # 更新数据库配置
POST /api/config/db/test             # 测试连接
POST /api/config/db/explore          # 探查数据库结构
GET  /api/config/db/table/{name}/columns  # 获取表列信息
PUT  /api/config/db/mapping          # 更新字段映射

# WebSocket
WS   /api/ws                         # 实时数据推送
```

### WebSocket 消息类型

- `connected`: 连接成功
- `data_update`: 数据更新
- `new_alert`: 新预警
- `heartbeat`: 心跳
- `pong`: 心跳响应

---

## [S8] 数据库设计

### SQLite 表结构

```sql
-- 检测数据表
CREATE TABLE monitor_data (
    id INTEGER PRIMARY KEY AUTOINCREMENT,
    indicator_code TEXT NOT NULL,
    indicator_name TEXT,
    product_code TEXT NOT NULL,
    product_name TEXT,
    value REAL NOT NULL,
    unit TEXT,
    upper_limit REAL,
    lower_limit REAL,
    is_qualified INTEGER DEFAULT 1,
    sample_time TEXT NOT NULL,
    created_at TEXT DEFAULT (datetime('now', 'localtime')),
    UNIQUE(indicator_code, product_code, sample_time)
);

-- 预警表
CREATE TABLE alerts (
    id INTEGER PRIMARY KEY AUTOINCREMENT,
    alert_id TEXT NOT NULL UNIQUE,
    alert_type TEXT NOT NULL,
    severity TEXT NOT NULL DEFAULT 'warning',
    indicator_code TEXT,
    product_code TEXT,
    rule_type TEXT,
    rule_desc TEXT,
    test_value REAL,
    control_limit TEXT,
    message TEXT NOT NULL,
    detail TEXT,
    status TEXT NOT NULL DEFAULT 'pending',
    created_at TEXT DEFAULT (datetime('now', 'localtime')),
    resolved_at TEXT,
    resolved_by TEXT,
    resolve_note TEXT
);

-- 采集日志表
CREATE TABLE sync_log (
    id INTEGER PRIMARY KEY AUTOINCREMENT,
    source TEXT NOT NULL,
    sync_type TEXT NOT NULL DEFAULT 'data',
    status TEXT NOT NULL DEFAULT 'success',
    records_count INTEGER DEFAULT 0,
    error_message TEXT,
    started_at TEXT NOT NULL,
    finished_at TEXT DEFAULT (datetime('now', 'localtime'))
);

-- 索引
CREATE INDEX idx_data_indicator ON monitor_data(indicator_code, product_code);
CREATE INDEX idx_data_sample_time ON monitor_data(sample_time);
CREATE INDEX idx_alerts_status ON alerts(status);
CREATE INDEX idx_alerts_severity ON alerts(severity);
CREATE INDEX idx_sync_log_started ON sync_log(started_at);
```

---

## [S9] 实施计划

### 分阶段实施

**阶段 1: 项目基础 (1-2 天)**
- 创建项目目录结构
- 初始化后端 (FastAPI)
- 初始化前端 (React + Vite)
- 初始化启动器 (Rust + Tauri)
- 配置开发环境

**阶段 2: 后端核心 (2-3 天)**
- 数据库模型和连接
- 数据采集器 (SQL Server + Mock)
- 自适应调度器
- SPC 分析引擎
- 过程能力分析
- 预警引擎

**阶段 3: 后端 API (1-2 天)**
- REST API 端点
- WebSocket 推送
- 配置管理 API
- 数据库探查 API

**阶段 4: 前端开发 (3-4 天)**
- 布局组件
- 实时看板页面
- SPC 控制图页面
- 过程能力分析页面
- 预警列表页面
- 配置管理页面

**阶段 5: 启动器开发 (2-3 天)**
- 系统托盘
- 服务管理
- 自动更新
- 打包发布

**阶段 6: 测试和优化 (1-2 天)**
- 功能测试
- 性能优化
- 文档编写

---

## [S10] 设计决策

### 为什么选择 FastAPI？
- 复用现有代码，迁移成本低
- 异步支持好，适合实时监控场景
- 自动 API 文档生成

### 为什么选择 React + Ant Design？
- 与 Rust 启动器技术栈一致
- Ant Design 组件丰富，适合企业级应用
- TypeScript 支持好，类型安全

### 为什么选择 Tauri？
- 比 Electron 小 10x，启动更快
- Rust 原生性能，资源占用低
- 跨平台支持好

### 为什么选择 SQLite？
- 轻量级，无需额外服务
- 适合单机部署场景
- 复用现有方案，迁移成本低

---

## [S11] 风险和缓解

### 技术风险

1. **SQL Server 连接稳定性**
   - 缓解：连接池 + 自动重连 + 降级策略

2. **实时数据推送延迟**
   - 缓解：WebSocket + 心跳机制 + 自动重连

3. **前端性能问题**
   - 缓解：虚拟滚动 + 数据分页 + 图表懒加载

### 项目风险

1. **开发周期紧张**
   - 缓解：分阶段实施，优先核心功能

2. **技术栈切换成本**
   - 缓解：复用现有后端代码，前端重写

---

## [S12] 验收标准

### 功能验收

1. ✅ 能够连接 SQL Server 并采集 FT120 数据
2. ✅ 能够显示 SPC 控制图并检测 Nelson 规则违规
3. ✅ 能够计算过程能力指数 (Cp/Cpk/Pp/Ppk)
4. ✅ 能够实时预警并推送通知
5. ✅ 能够配置数据库连接和采集参数
6. ✅ Rust 启动器能够管理服务生命周期

### 性能验收

1. ✅ 数据采集延迟 < 5 秒
2. ✅ 页面加载时间 < 2 秒
3. ✅ WebSocket 推送延迟 < 1 秒
4. ✅ 启动器内存占用 < 50MB

### 质量验收

1. ✅ 代码覆盖率 > 80%
2. ✅ 无严重 Bug
3. ✅ 文档完整
