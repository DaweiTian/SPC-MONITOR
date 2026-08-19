# 液奶过程监控系统

FT120 仪器数据的实时检测和分析平台

## 功能

- 实时数据采集 (SQL Server)
- SPC 控制图分析
- 过程能力分析 (Cp/Cpk/Pp/Ppk)
- 实时预警推送
- 配置管理

## 快速开始

### 后端
```bash
cd backend
pip install -r requirements.txt
python main.py
```

### 前端
```bash
cd frontend
npm install
npm run dev
```

### 启动器
```bash
cd launcher
cargo tauri dev
```
