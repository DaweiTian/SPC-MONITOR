#!/bin/bash
# 液奶过程监控系统 - 开发模式启动脚本 (Linux/macOS)
# 同时启动后端和前端开发服务器

set -e

SCRIPT_DIR="$(cd "$(dirname "$0")" && pwd)"
PROJECT_DIR="$(dirname "$SCRIPT_DIR")"
LOG_DIR="$PROJECT_DIR/logs"

GREEN='\033[0;32m'
YELLOW='\033[1;33m'
RED='\033[0;31m'
NC='\033[0m'

echo "=========================================="
echo "  液奶过程监控系统 - 开发模式"
echo "=========================================="
echo ""

# 检查 Python
if ! command -v python3 &> /dev/null; then
    echo -e "${RED}错误: 未找到 python3，请先安装 Python 3.11+${NC}"
    exit 1
fi

# 检查 Node.js
if ! command -v node &> /dev/null; then
    echo -e "${RED}错误: 未找到 node，请先安装 Node.js 18+${NC}"
    exit 1
fi

# 安装后端依赖
echo -e "${YELLOW}[1/4] 安装后端依赖...${NC}"
cd "$PROJECT_DIR/backend"
if [ ! -d "venv" ]; then
    python3 -m venv venv
fi
source venv/bin/activate
pip install -r requirements.txt -q 2>/dev/null || pip install -r requirements.txt

# 安装前端依赖
echo -e "${YELLOW}[2/4] 安装前端依赖...${NC}"
cd "$PROJECT_DIR/frontend"
if [ ! -d "node_modules" ]; then
    npm install
else
    echo "  前端依赖已存在，跳过安装"
fi

# 创建数据目录和日志目录
mkdir -p "$PROJECT_DIR/data"
mkdir -p "$LOG_DIR"

echo ""
echo -e "${GREEN}[3/4] 启动后端服务 (端口 18080)...${NC}"
cd "$PROJECT_DIR"
# 前端默认发送 'ft1-monitor-default-key'，本地开发需与之一致；生产环境请设置强随机密钥
export FT1_API_KEY="${FT1_API_KEY:-ft1-monitor-default-key}"
BACKEND_HOST=$(python3 -c "from backend.app.core.config import get_server_config; print(get_server_config()['host'])" 2>/dev/null || echo "0.0.0.0")
nohup python3 -m uvicorn backend.main:app \
    --host "$BACKEND_HOST" \
    --port 18080 \
    --reload \
    --reload-exclude "conf/*" \
    --reload-exclude "logs/*" \
    --reload-exclude "data/*" \
    --log-level warning \
    > "$LOG_DIR/backend.log" 2>&1 &
BACKEND_PID=$!
echo "  后端 PID: $BACKEND_PID"

echo -e "${GREEN}[4/4] 启动前端服务 (端口 5173)...${NC}"
cd "$PROJECT_DIR/frontend"
nohup npm run dev > "$LOG_DIR/frontend.log" 2>&1 &
FRONTEND_PID=$!
echo "  前端 PID: $FRONTEND_PID"

# 保存 PID 供 stop.sh 使用
echo "$BACKEND_PID" > "$LOG_DIR/backend.pid"
echo "$FRONTEND_PID" > "$LOG_DIR/frontend.pid"

echo ""
echo "=========================================="
echo -e "${GREEN}  开发服务已在后台启动${NC}"
echo "=========================================="
echo ""
echo "  前端: http://localhost:5173"
echo "  后端: http://0.0.0.0:18080 (局域网可访问)"
echo "  API 文档: http://localhost:18080/docs"
echo ""
echo "  日志文件:"
echo "    后端: $LOG_DIR/backend.log"
echo "    前端: $LOG_DIR/frontend.log"
echo ""
echo "  查看日志: tail -f $LOG_DIR/backend.log"
echo "  停止服务: ./scripts/stop.sh"
echo ""
