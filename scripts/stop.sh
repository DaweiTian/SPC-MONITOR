#!/bin/bash
# 液奶过程监控系统 - 停止服务脚本

echo "正在停止液奶过程监控系统..."

# 停止 uvicorn 进程
pkill -f "uvicorn backend.main:app" 2>/dev/null && echo "后端服务已停止" || echo "后端服务未运行"

# 停止 vite 进程
pkill -f "vite" 2>/dev/null && echo "前端服务已停止" || echo "前端服务未运行"

echo "完成"
