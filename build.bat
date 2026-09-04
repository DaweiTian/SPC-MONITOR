@echo off
setlocal enabledelayedexpansion
chcp 65001 >nul
set PROJECT_DIR=%~dp0
set LAUNCHER_DIR=%PROJECT_DIR%launcher
set OUTPUT_DIR=%PROJECT_DIR%dist

REM 从 tauri.conf.json 读取版本号（唯一版本源）
for /f "usebackq tokens=* delims=" %%v in (`powershell -NoProfile -Command "(Get-Content '%LAUNCHER_DIR%\tauri.conf.json' -Raw | ConvertFrom-Json).version"`) do set "VERSION=%%v"
if not defined VERSION (echo 错误: 无法从 tauri.conf.json 读取版本号 & pause & exit /b 1)

echo ==========================================
echo   过程SPC监控平台 v!VERSION! - 一键构建
echo ==========================================

echo [0/6] 清理旧构建产物...
if exist "%PROJECT_DIR%ft1-backend-dist" rmdir /s /q "%PROJECT_DIR%ft1-backend-dist"
if exist "%OUTPUT_DIR%" rmdir /s /q "%OUTPUT_DIR%"
if exist "%PROJECT_DIR%data\frontend" rmdir /s /q "%PROJECT_DIR%data\frontend"
echo   已清理 ft1-backend-dist, dist, data/frontend
echo   注意: launcher/target 已保留（增量编译），如需完全重建请手动删除

echo [1/6] 构建前端...
cd /d "%PROJECT_DIR%frontend"
call npm run build || (echo 前端构建失败 & pause & exit /b 1)

echo [2/6] Nuitka 编译后端...
REM 复制前端 dist 到 data/frontend（供浏览器访问）
if exist "%PROJECT_DIR%data\frontend" rmdir /s /q "%PROJECT_DIR%data\frontend"
xcopy /E /I /Q /Y "%PROJECT_DIR%frontend\dist" "%PROJECT_DIR%data\frontend" >nul 2>nul
cd /d "%PROJECT_DIR%"
python -m nuitka --standalone --output-dir=ft1-backend-dist --windows-console-mode=disable --jobs=0 --include-package=backend --include-package=fastapi --include-package=uvicorn --include-package=sqlalchemy --include-package=pydantic --include-package=statsmodels --include-package=pymssql --include-package=apscheduler --include-package=access_parser --include-package=pydantic_settings --include-package=multipart --include-package=websockets --include-package=yaml --include-package=pyodbc --include-package=sklearn --include-package=pandas --include-package=starlette --include-package=scipy._external --include-module=ctypes --include-data-dir=data=data --nofollow-import-to=scipy.io,scipy.cluster --nofollow-import-to=numpy.tests --nofollow-import-to=pandas.conftest --nofollow-import-to=sklearn.tests --nofollow-import-to=sklearn.utils.tests --nofollow-import-to=pandas.tests backend/run.py || (echo 后端编译失败 & pause & exit /b 1)

echo [3/6] 复制后端...
set BACKEND_DIST=%LAUNCHER_DIR%\ft1-backend
if exist "%BACKEND_DIST%" rmdir /s /q "%BACKEND_DIST%"
if not exist "ft1-backend-dist\run.dist\run.exe" (echo Nuitka 编译产物不存在 & pause & exit /b 1)
move /Y "ft1-backend-dist\run.dist\run.exe" "ft1-backend-dist\run.dist\ft1-backend.exe" >nul
REM 去除后端 exe 图标（避免任务栏出现两个图标）
python -c "import pefile; pe=pefile.PE(r'ft1-backend-dist\run.dist\ft1-backend.exe'); d=pe.OPTIONAL_HEADER.DATA_DIRECTORY[pefile.DIRECTORY_ENTRY['IMAGE_DIRECTORY_ENTRY_RESOURCE']]; d.VirtualAddress=0;d.Size=0;pe.write(r'ft1-backend-dist\run.dist\ft1-backend.exe')" 2>nul
xcopy /E /I /Q /Y ft1-backend-dist\run.dist "%BACKEND_DIST%" >nul || (echo 后端复制失败 & pause & exit /b 1)
xcopy /E /I /Q /Y data "%BACKEND_DIST%\data" >nul 2>nul
REM 复制配置文件（全部在 backend/conf/ 目录下）
if not exist "!PROJECT_DIR!backend\conf" (echo 错误: backend\conf 目录不存在 & pause & exit /b 1)
xcopy /E /I /Q /Y "!PROJECT_DIR!backend\conf" "%BACKEND_DIST%\conf" >nul || (echo 配置文件复制失败 & pause & exit /b 1)
REM 验证关键配置文件已复制
if not exist "%BACKEND_DIST%\conf\spec_limits.json" (echo   WARNING: conf\spec_limits.json 不存在，将使用默认规格限)
if not exist "%BACKEND_DIST%\conf\db_config.json" (echo   WARNING: conf\db_config.json 不存在，将使用默认数据库配置)
REM 复制 M8 模型文件（pkl，Nuitka 不自动包含非 Python 数据文件）
REM 注意: _resolve_model_dir() 用 __file__ 上溯3级解析路径，保留 backend/ 层级
if not exist "%BACKEND_DIST%\backend\models" mkdir "%BACKEND_DIST%\backend\models"
xcopy /I /Q /Y "!PROJECT_DIR!backend\models\*.pkl" "%BACKEND_DIST%\backend\models\" >nul || echo   WARNING: M8 model files (*.pkl) not found - prediction will fallback to linear K-value

echo [4/6] 构建 Tauri...
cd /d "%LAUNCHER_DIR%"
cargo tauri build || (echo Tauri 构建失败 & pause & exit /b 1)

echo [5/6] 打包免安装版...
if not exist "%OUTPUT_DIR%" mkdir "%OUTPUT_DIR%"
set PORTABLE=%OUTPUT_DIR%\spc-monitor-Portable
if exist "%PORTABLE%" rmdir /s /q "%PORTABLE%"
mkdir "%PORTABLE%"
copy /Y "%LAUNCHER_DIR%\target\release\SPC-Monitor.exe" "%PORTABLE%\过程SPC监控平台.exe" >nul || (echo 复制主程序失败 & pause & exit /b 1)
xcopy /E /I /Q /Y "%BACKEND_DIST%" "%PORTABLE%\ft1-backend" >nul || (echo 复制后端到打包目录失败 & pause & exit /b 1)
xcopy /E /I /Q /Y "%PROJECT_DIR%scripts" "%PORTABLE%\scripts" >nul 2>nul
powershell -Command "Compress-Archive -Path '%PORTABLE%\*' -DestinationPath '%OUTPUT_DIR%\过程SPC监控平台_免安装版.zip' -Force" || (echo 压缩打包失败 & pause & exit /b 1)
rmdir /s /q "%PORTABLE%"
copy /Y "%LAUNCHER_DIR%\target\release\bundle\nsis\*.exe" "%OUTPUT_DIR%\" >nul || (echo 复制安装包失败 & pause & exit /b 1)

echo [6/6] 生成更新清单 latest.json...
set "SETUP_EXE="
set "SETUP_SIG="
for %%f in ("%LAUNCHER_DIR%\target\release\bundle\nsis\*!VERSION!*-setup.exe") do set "SETUP_EXE=%%f"
for %%f in ("%LAUNCHER_DIR%\target\release\bundle\nsis\*!VERSION!*-setup.exe.sig") do set "SETUP_SIG=%%f"

if defined SETUP_SIG (
    copy /Y "!SETUP_SIG!" "%OUTPUT_DIR%\" >nul
    REM 读取签名内容
    set /p SIGNATURE=<!SETUP_SIG!
    REM 获取安装包文件名
    for %%n in ("!SETUP_EXE!") do set "EXE_NAME=%%~nxn"
    REM 从 CHANGELOG.md 提取更新日志
    for /f "delims=" %%n in ('powershell -NoProfile -Command "$ver = '!VERSION!'; $escaped = [regex]::Escape($ver); $lines = Get-Content '%PROJECT_DIR%CHANGELOG.md' -Encoding utf8; $in = $false; $notes = @(); foreach ($l in $lines) { if ($l -match \"^## \\[$escaped\\]\") { $in = $true; continue }; if ($in -and $l -match '^## \\[') { break }; if ($in -and $l -match '^- ') { $notes += $l.Substring(2) } }; if ($notes.Count -gt 0) { $notes -join '; ' } else { \"v$ver 更新\" }"') do set "NOTES=%%n"

    REM 生成 pub_date（locale 无关）
    for /f %%d in ('powershell -NoProfile -Command "Get-Date -Format 'yyyy-MM-ddTHH:mm:ssZ'"') do set "PUB_DATE=%%d"

    (
        echo {
        echo   "version": "!VERSION!",
        echo   "notes": "!NOTES!",
        echo   "pub_date": "!PUB_DATE!",
        echo   "platforms": {
        echo     "windows-x86_64": {
        echo       "signature": "!SIGNATURE!",
        echo       "url": "http://106.13.77.213:9090/!EXE_NAME!"
        echo     }
        echo   }
        echo }
    ) > "%OUTPUT_DIR%\latest.json"

    echo   latest.json 已生成，请将 %OUTPUT_DIR% 目录下的文件上传到更新服务器
) else (
    echo   WARNING: 未找到更新签名文件，跳过 latest.json 生成
)

echo.
echo   构建完成! 产物: dist\
pause
