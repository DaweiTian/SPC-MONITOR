#!/bin/bash
# 液奶过程监控系统 - 生产模式启动脚本 (Linux/macOS)
# 构建前端并启动后端服务

set -e

SCRIPT_DIR="$(cd "$(dirname "$0")" && pwd)"
PROJECT_DIR="$(dirname "$SCRIPT_DIR")"

echo "=========================================="
echo "  液奶过程监控系统 - 生产模式"
echo "=========================================="
echo ""

# 颜色定义
GREEN='\033[0;32m'
YELLOW='\033[1;33m'
RED='\033[0;31m'
NC='\033[0m'

# 检查 Python
if ! command -v python3 &> /dev/null; then
    echo -e "${RED}错误: 未找到 python3，请先安装 Python 3.11+${NC}"
    exit 1
fi

# 安装后端依赖
echo -e "${YELLOW}[1/3] 安装后端依赖...${NC}"
cd "$PROJECT_DIR/backend"
pip install -r requirements.txt -q 2>/dev/null || pip install -r requirements.txt

# 构建前端
echo -e "${YELLOW}[2/3] 构建前端...${NC}"
cd "$PROJECT_DIR/frontend"
if [ ! -d "node_modules" ]; then
    npm install
fi
npm run build

# 创建数据目录
mkdir -p "$PROJECT_DIR/data"

# 启动后端服务
echo -e "${GREEN}[3/3] 启动后端服务 (端口 18080)...${NC}"
cd "$PROJECT_DIR"
echo ""
echo "=========================================="
echo -e "${GREEN}  生产服务已启动${NC}"
echo "=========================================="
echo ""
echo "  访问: http://localhost:18080"
echo "  API 文档: http://localhost:18080/docs"
echo ""
echo "  按 Ctrl+C 停止服务"
echo ""

python3 -m uvicorn backend.main:app --host 0.0.0.0 --port 18080
