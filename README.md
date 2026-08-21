# 液奶过程监控系统

FT120 仪器数据的实时检测和分析平台

## 功能特性

- **实时数据采集**: 支持 SQL Server 数据源，自适应降级调度
- **SPC 控制图**: I-MR 单值移动极差控制图，8 条 Nelson 判异规则
- **过程能力分析**: Cp/Cpk/Pp/Ppk 指数，西格玛水平计算
- **实时预警**: Nelson 规则违规、Cpk 偏低、超出规格限自动预警
- **WebSocket 推送**: 实时数据更新和预警通知
- **配置管理**: 数据库连接、采集参数、预警阈值可配置

## 技术栈

| 层 | 技术 |
|----|------|
| 前端 | React 18 + TypeScript + Ant Design 5 + ECharts 5 |
| 后端 | FastAPI + Uvicorn |
| 数据 | SQLite + pandas |
| 分析 | NumPy + SciPy + statsmodels |
| 启动器 | Rust + Tauri |

## 快速开始

### 环境要求

- Python 3.11+
- Node.js 18+
- Rust 1.70+ (仅启动器)

### 一键启动（推荐）

#### Linux / macOS

```bash
# 开发模式（同时启动前端和后端）
./scripts/dev.sh

# 生产模式（构建前端并启动后端）
./scripts/start.sh

# 停止服务
./scripts/stop.sh
```

#### Windows

```cmd
# 开发模式（同时启动前端和后端）
scripts\dev.bat

# 生产模式（构建前端并启动后端）
scripts\start.bat
```

### 手动启动

#### 后端

```bash
cd backend
pip install -r requirements.txt
python main.py
```

#### 前端

```bash
cd frontend
npm install
npm run dev
```

#### 启动器

```bash
cd launcher
cargo tauri dev
```

## 访问

- 前端开发: http://localhost:5173
- 后端 API: http://localhost:18080
- 生产模式: http://localhost:18080

## 项目结构

```
FT1-MONITOR/
├── backend/           # FastAPI 后端
│   ├── app/
│   │   ├── api/       # API 路由
│   │   ├── core/      # 核心配置
│   │   ├── models/    # 数据模型
│   │   ├── services/  # 业务服务
│   │   └── engine/    # 分析引擎
│   ├── main.py
│   └── requirements.txt
├── frontend/          # React 前端
│   ├── src/
│   │   ├── components/
│   │   ├── pages/
│   │   ├── services/
│   │   └── types/
│   └── package.json
├── launcher/          # Rust 启动器
│   ├── src/
│   └── Cargo.toml
├── scripts/           # 启动脚本
│   ├── dev.sh         # Linux/macOS 开发模式
│   ├── dev.bat        # Windows 开发模式
│   ├── start.sh       # Linux/macOS 生产模式
│   ├── start.bat      # Windows 生产模式
│   └── stop.sh        # 停止服务
├── config/            # 配置文件
├── data/              # 数据存储
└── docs/              # 文档
```

## API 文档

启动后端后访问: http://localhost:18080/docs
