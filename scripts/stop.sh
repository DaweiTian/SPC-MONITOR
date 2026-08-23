#!/bin/bash
# 液奶过程监控系统 - 停止服务脚本

SCRIPT_DIR="$(cd "$(dirname "$0")" && pwd)"
PROJECT_DIR="$(dirname "$SCRIPT_DIR")"
LOG_DIR="$PROJECT_DIR/logs"

echo "正在停止液奶过程监控系统..."

# 通过 PID 文件停止后端（杀整个进程组）
if [ -f "$LOG_DIR/backend.pid" ]; then
    BACKEND_PID=$(cat "$LOG_DIR/backend.pid")
    if kill -0 "$BACKEND_PID" 2>/dev/null; then
        kill -- -"$BACKEND_PID" 2>/dev/null || kill "$BACKEND_PID" 2>/dev/null
        echo "后端服务已停止 (PID: $BACKEND_PID)"
    else
        echo "后端服务未运行"
    fi
    rm -f "$LOG_DIR/backend.pid"
fi

# 回退：杀所有占用 18080 端口的进程
if command -v fuser &> /dev/null; then
    fuser -k 18080/tcp 2>/dev/null && echo "端口 18080 已释放" || true
fi
pkill -f "uvicorn.*backend.main" 2>/dev/null && echo "后端服务已停止 (pkill)" || true

# 通过 PID 文件停止前端
if [ -f "$LOG_DIR/frontend.pid" ]; then
    FRONTEND_PID=$(cat "$LOG_DIR/frontend.pid")
    if kill -0 "$FRONTEND_PID" 2>/dev/null; then
        kill "$FRONTEND_PID" 2>/dev/null && echo "前端服务已停止 (PID: $FRONTEND_PID)"
    else
        echo "前端服务未运行"
    fi
    rm -f "$LOG_DIR/frontend.pid"
else
    # 回退到 pkill
    pkill -f "vite" 2>/dev/null && echo "前端服务已停止" || echo "前端服务未运行"
fi

echo "完成"
