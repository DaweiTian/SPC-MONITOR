# 开发文档

## 开发环境

### 后端

```bash
cd backend
python -m venv venv
source venv/bin/activate  # Linux/Mac
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

## 代码规范

### Python

- 使用 Black 格式化
- 使用 Ruff 检查
- 类型注解: Python 3.11+

### TypeScript

- 使用 ESLint
- 使用 Prettier
- 严格类型检查

### Rust

- 使用 rustfmt
- 使用 clippy

## 测试

### 后端测试

```bash
cd backend
pytest
```

### 前端测试

```bash
cd frontend
npm test
```

## 提交规范

使用 Conventional Commits:

- feat: 新功能
- fix: 修复
- docs: 文档
- style: 格式
- refactor: 重构
- test: 测试
- chore: 构建/工具
