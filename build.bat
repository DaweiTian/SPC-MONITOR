@echo off
REM 液奶过程监控系统 - Windows 一键构建脚本
REM 产物：安装版 (.exe) + 免安装版 (.zip)

setlocal enabledelayedexpansion

set SCRIPT_DIR=%~dp0
set PROJECT_DIR=%SCRIPT_DIR%
set NSIS_CACHE=%LOCALAPPDATA%\tauri\NSIS
set BACKEND_DIR=%PROJECT_DIR%backend
set FRONTEND_DIR=%PROJECT_DIR%frontend
set LAUNCHER_DIR=%PROJECT_DIR%launcher
set BACKEND_DIST=%LAUNCHER_DIR%\ft1-backend
set RELEASE_DIR=%LAUNCHER_DIR%\target\release
set OUTPUT_DIR=%PROJECT_DIR%dist

echo ==========================================
echo   液奶过程监控系统 - 一键构建
echo   产出: 安装版 + 免安装版
echo ==========================================
echo.

REM ===== 第1步：构建前端 =====
echo [1/5] 构建前端...
cd /d "%FRONTEND_DIR%"
call npm run build
if %errorlevel% neq 0 (
    echo   前端构建失败！
    pause
    exit /b 1
)
echo   前端构建完成
echo.

REM ===== 第2步：打包后端 =====
echo [2/5] 打包后端 (PyInstaller)...
cd /d "%BACKEND_DIR%"

where pyinstaller >nul 2>nul
if %errorlevel% neq 0 (
    echo   安装 PyInstaller...
    pip install pyinstaller -q
)

if exist "dist\ft1-backend" rmdir /s /q "dist\ft1-backend"
if exist "build" rmdir /s /q "build"

pyinstaller ft1-backend.spec --noconfirm --clean 2>nul
if %errorlevel% neq 0 (
    echo   后端打包失败！
    pause
    exit /b 1
)
echo   后端打包完成
echo.

REM ===== 第3步：复制后端到启动器目录 =====
echo [3/5] 复制后端到构建目录...
if exist "%BACKEND_DIST%" rmdir /s /q "%BACKEND_DIST%"
xcopy /E /I /Q /Y "dist\ft1-backend" "%BACKEND_DIST%" >nul
echo   复制完成
echo.

REM ===== 第4步：构建 Tauri 应用 =====
echo [4/5] 构建 Tauri 应用...
cd /d "%LAUNCHER_DIR%"

if not exist "%NSIS_CACHE%\makensis.exe" (
    echo   NSIS 未找到，请先手动下载:
    echo   https://github.com/tauri-apps/binary-releases/releases/download/nsis-3/nsis-3.zip
    echo   解压到: %NSIS_CACHE%
    pause
    exit /b 1
)

cargo tauri build
if %errorlevel% neq 0 (
    echo   Tauri 构建失败！
    pause
    exit /b 1
)
echo   构建完成
echo.

REM ===== 第5步：打包免安装版 =====
echo [5/5] 打装免安装版...
if not exist "%OUTPUT_DIR%" mkdir "%OUTPUT_DIR%"

REM 创建免安装版临时目录
set PORTABLE_DIR=%OUTPUT_DIR%\FT1-MONITOR-Portable
if exist "%PORTABLE_DIR%" rmdir /s /q "%PORTABLE_DIR%"
mkdir "%PORTABLE_DIR%"

REM 复制启动器 exe
copy /Y "%RELEASE_DIR%\ft1-monitor-launcher.exe" "%PORTABLE_DIR%\" >nul

REM 复制后端
xcopy /E /I /Q /Y "%BACKEND_DIST%" "%PORTABLE_DIR%\ft1-backend" >nul

REM 复制数据目录（如果存在）
if exist "%PROJECT_DIR%\data" xcopy /E /I /Q /Y "%PROJECT_DIR%\data" "%PORTABLE_DIR%\data" >nul

REM 打包为 zip
powershell -Command "Compress-Archive -Path '%PORTABLE_DIR%\*' -DestinationPath '%OUTPUT_DIR%\液奶过程监控系统_免安装版.zip' -Force"

REM 复制安装包
copy /Y "%LAUNCHER_DIR%\target\release\bundle\nsis\*.exe" "%OUTPUT_DIR%\" >nul

REM 清理临时目录
rmdir /s /q "%PORTABLE_DIR%"

echo.
echo ==========================================
echo   构建完成！产物位于 dist\ 目录:
echo.
echo   安装版:   dist\液奶过程监控系统_*_x64-setup.exe
echo   免安装版: dist\液奶过程监控系统_免安装版.zip
echo ==========================================
pause
