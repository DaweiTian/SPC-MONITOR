@echo off
setlocal enabledelayedexpansion
chcp 65001 >nul
set PROJECT_DIR=%~dp0
set LAUNCHER_DIR=%PROJECT_DIR%launcher
set OUTPUT_DIR=%PROJECT_DIR%dist

echo ==========================================
echo   过程SPC监控平台 v1.6.2 - 一键构建
echo ==========================================

echo [0/5] 清理旧构建产物...
if exist "%PROJECT_DIR%ft1-backend-dist" rmdir /s /q "%PROJECT_DIR%ft1-backend-dist"
if exist "%OUTPUT_DIR%" rmdir /s /q "%OUTPUT_DIR%"
if exist "%PROJECT_DIR%data\frontend" rmdir /s /q "%PROJECT_DIR%data\frontend"
echo   已清理 ft1-backend-dist, dist, data/frontend
echo   注意: launcher/target 已保留（增量编译），如需完全重建请手动删除

echo [1/5] 构建前端...
cd /d "%PROJECT_DIR%frontend"
call npm run build || (echo 前端构建失败 & pause & exit /b 1)

echo [2/5] Nuitka 编译后端...
REM 复制前端 dist 到 data/frontend（供浏览器访问）
if exist "%PROJECT_DIR%data\frontend" rmdir /s /q "%PROJECT_DIR%data\frontend"
xcopy /E /I /Q /Y "%PROJECT_DIR%frontend\dist" "%PROJECT_DIR%data\frontend" >nul 2>nul
cd /d "%PROJECT_DIR%"
python -m nuitka --standalone --output-dir=ft1-backend-dist --windows-console-mode=disable --jobs=0 --include-package=backend --include-package=fastapi --include-package=uvicorn --include-package=sqlalchemy --include-package=pydantic --include-package=statsmodels --include-package=pymssql --include-package=apscheduler --include-package=access_parser --include-package=pydantic_settings --include-package=multipart --include-package=websockets --include-package=yaml --include-package=pyodbc --include-package=sklearn --include-package=pandas --include-package=starlette --include-package=scipy._external --include-module=ctypes --include-data-dir=data=data --nofollow-import-to=scipy.io,scipy.cluster --nofollow-import-to=numpy.tests --nofollow-import-to=pandas.conftest --nofollow-import-to=sklearn.tests --nofollow-import-to=sklearn.utils.tests --nofollow-import-to=pandas.tests backend/run.py || (echo 后端编译失败 & pause & exit /b 1)

echo [3/5] 复制后端...
set BACKEND_DIST=%LAUNCHER_DIR%\ft1-backend
if exist "%BACKEND_DIST%" rmdir /s /q "%BACKEND_DIST%"
if not exist "ft1-backend-dist\run.dist\run.exe" (echo Nuitka 编译产物不存在 & pause & exit /b 1)
move /Y "ft1-backend-dist\run.dist\run.exe" "ft1-backend-dist\run.dist\ft1-backend.exe" >nul
REM 去除后端 exe 图标（避免任务栏出现两个图标）
python -c "import pefile; pe=pefile.PE(r'ft1-backend-dist\run.dist\ft1-backend.exe'); d=pe.OPTIONAL_HEADER.DATA_DIRECTORY[pefile.DIRECTORY_ENTRY['IMAGE_DIRECTORY_ENTRY_RESOURCE']]; d.VirtualAddress=0;d.Size=0;pe.write(r'ft1-backend-dist\run.dist\ft1-backend.exe')" 2>nul
xcopy /E /I /Q /Y ft1-backend-dist\run.dist "%BACKEND_DIST%" >nul || (echo 后端复制失败 & pause & exit /b 1)
xcopy /E /I /Q /Y data "%BACKEND_DIST%\data" >nul 2>nul
REM 复制配置文件
for %%f in (server_config.json instrument_config.json prediction_config.json db_mapping.json product_categories.json product_indicators.json product_status.json excluded_remarks.json alias_config.json alert_rules.json fta_config.json spec_limits.json db_config.json mdb_config.json) do copy /Y "!PROJECT_DIR!%%f" "%BACKEND_DIST%\" >nul 2>nul

echo [4/5] 构建 Tauri...
cd /d "%LAUNCHER_DIR%"
cargo tauri build || (echo Tauri 构建失败 & pause & exit /b 1)

echo [5/5] 打包免安装版...
if not exist "%OUTPUT_DIR%" mkdir "%OUTPUT_DIR%"
set PORTABLE=%OUTPUT_DIR%\FT1-MONITOR-Portable
if exist "%PORTABLE%" rmdir /s /q "%PORTABLE%"
mkdir "%PORTABLE%"
copy /Y "%LAUNCHER_DIR%\target\release\SPC-Monitor.exe" "%PORTABLE%\过程SPC监控平台.exe" >nul || (echo 复制主程序失败 & pause & exit /b 1)
xcopy /E /I /Q /Y "%BACKEND_DIST%" "%PORTABLE%\ft1-backend" >nul || (echo 复制后端到打包目录失败 & pause & exit /b 1)
powershell -Command "Compress-Archive -Path '%PORTABLE%\*' -DestinationPath '%OUTPUT_DIR%\过程SPC监控平台_免安装版.zip' -Force" || (echo 压缩打包失败 & pause & exit /b 1)
rmdir /s /q "%PORTABLE%"
copy /Y "%LAUNCHER_DIR%\target\release\bundle\nsis\*.exe" "%OUTPUT_DIR%\" >nul || (echo 复制安装包失败 & pause & exit /b 1)

echo.
echo   构建完成! 产物: dist\
pause
