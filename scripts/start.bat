@echo off
REM 液奶过程监控系统 - 生产模式启动脚本 (Windows)
REM 构建前端并启动后端服务

setlocal enabledelayedexpansion

set SCRIPT_DIR=%~dp0
set PROJECT_DIR=%SCRIPT_DIR%..

echo ==========================================
echo   液奶过程监控系统 - 生产模式
echo ==========================================
echo.

REM 检查 Python
where python >nul 2>nul
if %errorlevel% neq 0 (
    echo 错误: 未找到 python，请先安装 Python 3.11+
    pause
    exit /b 1
)

REM 安装后端依赖
echo [1/3] 安装后端依赖...
cd /d "%PROJECT_DIR%\backend"
pip install -r requirements.txt -q 2>nul
if %errorlevel% neq 0 (
    pip install -r requirements.txt
)

REM 构建前端
echo [2/3] 构建前端...
cd /d "%PROJECT_DIR%\frontend"
if not exist "node_modules" (
    call npm install
)
call npm run build

REM 创建数据目录
if not exist "%PROJECT_DIR%\data" mkdir "%PROJECT_DIR%\data"

REM 启动后端服务
echo [3/3] 启动后端服务 (端口 18080)...
echo.
echo ==========================================
echo   生产服务已启动
echo ==========================================
echo.
echo   访问: http://localhost:18080
echo   API 文档: http://localhost:18080/docs
echo.
echo   按 Ctrl+C 停止服务
echo.

cd /d "%PROJECT_DIR%"
python -m uvicorn backend.main:app --host 0.0.0.0 --port 18080
