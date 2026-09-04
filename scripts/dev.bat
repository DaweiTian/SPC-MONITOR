@echo off
REM 液奶过程监控系统 - 开发模式启动脚本 (Windows)
REM 同时启动后端和前端开发服务器

setlocal enabledelayedexpansion

set SCRIPT_DIR=%~dp0
set PROJECT_DIR=%SCRIPT_DIR%..

echo ==========================================
echo   液奶过程监控系统 - 开发模式
echo ==========================================
echo.

REM 检查 Python
where python >nul 2>nul
if %errorlevel% neq 0 (
    echo 错误: 未找到 python，请先安装 Python 3.11+
    pause
    exit /b 1
)

REM 检查 Node.js
where node >nul 2>nul
if %errorlevel% neq 0 (
    echo 错误: 未找到 node，请先安装 Node.js 18+
    pause
    exit /b 1
)

REM 安装后端依赖
echo [1/4] 安装后端依赖...
cd /d "%PROJECT_DIR%\backend"
pip install -r requirements.txt -q 2>nul
if %errorlevel% neq 0 (
    pip install -r requirements.txt
)

REM 安装前端依赖
echo [2/4] 安装前端依赖...
cd /d "%PROJECT_DIR%\frontend"
if not exist "node_modules" (
    call npm install
) else (
    echo   前端依赖已存在，跳过安装
)

REM 创建数据目录
if not exist "%PROJECT_DIR%\data" mkdir "%PROJECT_DIR%\data"

echo.
echo [3/4] 启动后端服务 (端口 18080)...
cd /d "%PROJECT_DIR%"
for /f "delims=" %%i in ('python -c "from backend.app.core.config import get_server_config; print(get_server_config()['host'])" 2^>nul') do set BACKEND_HOST=%%i
if "%BACKEND_HOST%"=="" set BACKEND_HOST=0.0.0.0
start "SPC-Monitor Backend" python -m uvicorn backend.main:app --host %BACKEND_HOST% --port 18080 --reload

echo [4/4] 启动前端服务 (端口 5173)...
cd /d "%PROJECT_DIR%\frontend"
start "SPC-Monitor Frontend" npm run dev

echo.
echo ==========================================
echo   开发服务已启动
echo ==========================================
echo.
echo   前端: http://localhost:5173
echo   后端: http://localhost:18080
echo   API 文档: http://localhost:18080/docs
echo.
echo   关闭命令行窗口停止所有服务
echo.
pause
