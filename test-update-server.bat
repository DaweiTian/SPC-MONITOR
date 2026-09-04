@echo off
setlocal enabledelayedexpansion
chcp 65001 >nul
set PROJECT_DIR=%~dp0
set DIST_DIR=%PROJECT_DIR%dist
set TEST_SERVER_PORT=9090

echo ==========================================
echo   自动更新本地测试脚本
echo ==========================================
echo.

REM 检查 dist 目录
if not exist "%DIST_DIR%" (
    echo [ERROR] dist 目录不存在，请先运行 build.bat
    pause
    exit /b 1
)

REM 检查更新包是否存在
set "NSIS_ZIP="
set "NSIS_SIG="
for %%f in ("%DIST_DIR%\*.nsis.zip") do set "NSIS_ZIP=%%~nxf"
for %%f in ("%DIST_DIR%\*.nsis.zip.sig") do set "NSIS_SIG=%%~nxf"

if not defined NSIS_ZIP (
    echo [ERROR] 未在 dist\ 中找到 .nsis.zip 更新包
    echo         请确认 build.bat 已成功完成构建
    pause
    exit /b 1
)

echo [1/3] 更新 latest.json 为测试版本（版本号 +0.0.1）...
echo        更新包: %NSIS_ZIP%

REM 读取签名
set /p SIGNATURE=<"%DIST_DIR%\%NSIS_SIG%"

REM 读取当前版本号并 +1（简单处理：最后一位 +1）
for /f "tokens=*" %%v in ('powershell -Command "(Get-Content '%PROJECT_DIR%launcher\tauri.conf.json' | ConvertFrom-Json).version"') do set "CURRENT_VER=%%v"
for /f "tokens=1-3 delims=." %%a in ("%CURRENT_VER%") do (
    set "MAJOR=%%a"
    set "MINOR=%%b"
    set /a "PATCH=%%c + 1"
)
set "TEST_VER=%MAJOR%.%MINOR%.%PATCH%"

REM 生成 latest.json
(
    echo {
    echo   "version": "%TEST_VER%",
    echo   "notes": "测试更新 - 本地自动更新功能验证",
    echo   "pub_date": "%date:~0,4%-%date:~5,2%-%date:~8,2%T00:00:00Z",
    echo   "platforms": {
    echo     "windows-x86_64": {
    echo       "signature": "!SIGNATURE!",
    echo       "url": "http://localhost:%TEST_SERVER_PORT%/%NSIS_ZIP%"
    echo     }
    echo   }
    echo }
) > "%DIST_DIR%\latest.json"

echo        当前版本: %CURRENT_VER% → 测试版本: %TEST_VER%
echo        latest.json 已生成
echo.

echo [2/3] 启动本地更新服务器 (端口 %TEST_SERVER_PORT%)...
echo        服务目录: %DIST_DIR%
echo.

REM 检查是否有 python 可用
where python >nul 2>nul
if %errorlevel%==0 (
    echo [3/3] 启动 Python HTTP 服务器...
    echo.
    echo ==========================================
    echo   更新服务器已启动！
    echo.
    echo   latest.json:  http://localhost:%TEST_SERVER_PORT%/latest.json
    echo   更新包地址:   http://localhost:%TEST_SERVER_PORT%/%NSIS_ZIP%
    echo.
    echo   测试步骤:
    echo   1. 保持此窗口运行
    echo   2. 在另一个终端运行构建好的应用
    echo   3. 等待 60 秒后观察是否弹出更新提示
    echo   4. 按 Ctrl+C 停止服务器
    echo ==========================================
    echo.
    cd /d "%DIST_DIR%"
    python -m http.server %TEST_SERVER_PORT%
) else (
    echo [3/3] 未找到 python，请手动启动 HTTP 服务器：
    echo.
    echo   在 dist\ 目录下运行：
    echo     npx serve -l %TEST_SERVER_PORT%
    echo   或
    echo     python -m http.server %TEST_SERVER_PORT%
    echo.
    pause
)
