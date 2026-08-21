@echo off
REM 液奶过程监控系统 - Windows 一键构建脚本
REM 构建前端 + 后端打包 + Tauri 应用

setlocal enabledelayedexpansion

set SCRIPT_DIR=%~dp0
set PROJECT_DIR=%SCRIPT_DIR%
set NSIS_CACHE=%LOCALAPPDATA%\tauri\NSIS
set BACKEND_DIR=%PROJECT_DIR%backend
set FRONTEND_DIR=%PROJECT_DIR%frontend
set LAUNCHER_DIR=%PROJECT_DIR%launcher
set BACKEND_DIST=%LAUNCHER_DIR%\ft1-backend

echo ==========================================
echo   液奶过程监控系统 - 一键构建
echo ==========================================
echo.

REM ===== 第1步：构建前端 =====
echo [1/4] 构建前端...
cd /d "%FRONTEND_DIR%"
call npm run build
if %errorlevel% neq 0 (
    echo 前端构建失败！
    pause
    exit /b 1
)
echo   前端构建完成
echo.

REM ===== 第2步：打包后端 =====
echo [2/4] 打包后端 (PyInstaller)...
cd /d "%BACKEND_DIR%"

REM 检查 PyInstaller
where pyinstaller >nul 2>nul
if %errorlevel% neq 0 (
    echo   安装 PyInstaller...
    pip install pyinstaller -q
)

REM 清理旧产物
if exist "dist\ft1-backend" rmdir /s /q "dist\ft1-backend"
if exist "build" rmdir /s /q "build"

REM 打包
pyinstaller ft1-backend.spec --noconfirm --clean 2>nul
if %errorlevel% neq 0 (
    echo 后端打包失败！
    pause
    exit /b 1
)
echo   后端打包完成
echo.

REM ===== 第3步：复制后端到启动器目录 =====
echo [3/4] 复制后端到构建目录...
if exist "%BACKEND_DIST%" rmdir /s /q "%BACKEND_DIST%"
xcopy /E /I /Q /Y "dist\ft1-backend" "%BACKEND_DIST%" >nul
echo   复制完成: %BACKEND_DIST%
echo.

REM ===== 第4步：构建 Tauri 应用 =====
echo [4/4] 构建安装包...
cd /d "%LAUNCHER_DIR%"

REM 检查 NSIS
if not exist "%NSIS_CACHE%\makensis.exe" (
    echo   NSIS 未找到，请先手动下载:
    echo   https://github.com/tauri-apps/binary-releases/releases/download/nsis-3/nsis-3.zip
    echo   解压到: %NSIS_CACHE%
    pause
    exit /b 1
)

cargo tauri build
if %errorlevel% neq 0 (
    echo Tauri 构建失败！
    pause
    exit /b 1
)

echo.
echo ==========================================
echo   构建完成！
echo.
echo   安装包位置:
echo   %LAUNCHER_DIR%target\release\bundle\nsis\
echo ==========================================
pause
