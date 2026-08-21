@echo off
REM 液奶过程监控系统 - Windows 构建脚本
REM 自动处理 NSIS 依赖并构建 Tauri 应用

setlocal enabledelayedexpansion

set SCRIPT_DIR=%~dp0
set NSIS_CACHE=%LOCALAPPDATA%\tauri\NSIS
set NSIS_SOURCE=%SCRIPT_DIR%tools\nsis-3.zip

echo ==========================================
echo   液奶过程监控系统 - 构建 Windows 安装包
echo ==========================================
echo.

REM 检查 NSIS 缓存目录
if exist "%NSIS_CACHE%\makensis.exe" (
    echo [1/2] NSIS 已就绪，跳过下载
    goto :build
)

echo [1/2] 准备 NSIS 打包工具...

REM 检查本地是否有预下载的 NSIS
if exist "%NSIS_SOURCE%" (
    echo   从本地 tools\ 目录解压 NSIS...
    mkdir "%NSIS_CACHE%" 2>nul
    powershell -Command "Expand-Archive -Path '%NSIS_SOURCE%' -DestinationPath '%NSIS_CACHE%' -Force"
    if exist "%NSIS_CACHE%\makensis.exe" (
        echo   NSIS 解压成功
        goto :build
    )
)

echo   本地未找到 NSIS，尝试下载...
mkdir "%NSIS_CACHE%" 2>nul

REM 尝试从 GitHub 下载
powershell -Command "try { Invoke-WebRequest -Uri 'https://github.com/tauri-apps/binary-releases/releases/download/nsis-3/nsis-3.zip' -OutFile '%TEMP%\nsis-3.zip' -TimeoutSec 30; Expand-Archive -Path '%TEMP%\nsis-3.zip' -DestinationPath '%NSIS_CACHE%' -Force; Remove-Item '%TEMP%\nsis-3.zip' } catch { Write-Host '   GitHub 下载失败' }"

if exist "%NSIS_CACHE%\makensis.exe" (
    echo   NSIS 下载成功
    goto :build
)

REM 下载失败，提示手动放置
echo.
echo   自动下载失败。请手动操作：
echo   1. 浏览器下载: https://github.com/tauri-apps/binary-releases/releases/download/nsis-3/nsis-3.zip
echo   2. 将 zip 文件放到: %SCRIPT_DIR%tools\
echo   3. 重新运行此脚本
echo.
pause
exit /b 1

:build
echo [2/2] 构建应用...
cd /d "%SCRIPT_DIR%frontend"
call npm run build
cd /d "%SCRIPT_DIR%launcher"
cargo tauri build

echo.
echo ==========================================
echo   构建完成！
echo   安装包位置: launcher\target\release\bundle\nsis\
echo ==========================================
pause
