@echo off
setlocal enabledelayedexpansion
chcp 65001 >nul
set PROJECT_DIR=%~dp0
set LAUNCHER_DIR=%PROJECT_DIR%launcher
set OUTPUT_DIR=%PROJECT_DIR%dist

echo ==========================================
echo   液奶过程监控系统 v2.0 - 一键构建
echo ==========================================

echo [1/5] 构建前端...
cd /d "%PROJECT_DIR%frontend"
call npm run build || (echo 前端构建失败 & pause & exit /b 1)

echo [2/5] Nuitka 编译后端...
cd /d "%PROJECT_DIR%"
python -m nuitka --standalone --output-dir=ft1-backend-dist --windows-console-mode=disable --jobs=0 --include-docstrings --include-package=backend --include-package=fastapi --include-package=uvicorn --include-package=sqlalchemy --include-package=pydantic --include-package=statsmodels --include-package=pymssql --include-package=apscheduler --include-package=access_parser --include-package=pydantic_settings --include-package=python_multipart --include-package=websockets --include-package=yaml --include-package=pyodbc --include-package=numpy --include-package=scipy.stats --include-package=scipy._lib --include-package=scipy._external --include-package=statsmodels.tsa --include-data-dir=data=data --nofollow-import-to=tkinter --nofollow-import-to=matplotlib --nofollow-import-to=PIL --nofollow-import-to=pytest --nofollow-import-to=unittest backend/run.py || (echo 后端编译失败 & pause & exit /b 1)

echo [3/5] 复制后端...
set BACKEND_DIST=%LAUNCHER_DIR%\ft1-backend
if exist "%BACKEND_DIST%" rmdir /s /q "%BACKEND_DIST%"
if not exist "ft1-backend-dist\run.dist\run.exe" (echo Nuitka 编译产物不存在 & pause & exit /b 1)
move /Y "ft1-backend-dist\run.dist\run.exe" "ft1-backend-dist\run.dist\ft1-backend.exe" >nul
xcopy /E /I /Q /Y ft1-backend-dist\run.dist "%BACKEND_DIST%" >nul
xcopy /E /I /Q /Y data "%BACKEND_DIST%\data" >nul 2>nul
REM 复制配置文件
for %%f in ("%PROJECT_DIR%*.json") do copy /Y "%%f" "%BACKEND_DIST%\" >nul 2>nul

echo [4/5] 构建 Tauri...
cd /d "%LAUNCHER_DIR%"
cargo tauri build || (echo Tauri 构建失败 & pause & exit /b 1)

echo [5/5] 打包免安装版...
if not exist "%OUTPUT_DIR%" mkdir "%OUTPUT_DIR%"
set PORTABLE=%OUTPUT_DIR%\FT1-MONITOR-Portable
if exist "%PORTABLE%" rmdir /s /q "%PORTABLE%"
mkdir "%PORTABLE%"
copy /Y "%LAUNCHER_DIR%\target\release\ft1-monitor-launcher.exe" "%PORTABLE%\" >nul
xcopy /E /I /Q /Y "%BACKEND_DIST%" "%PORTABLE%\ft1-backend" >nul
powershell -Command "Compress-Archive -Path '%PORTABLE%\*' -DestinationPath '%OUTPUT_DIR%\液奶过程监控系统_免安装版.zip' -Force"
rmdir /s /q "%PORTABLE%"
copy /Y "%LAUNCHER_DIR%\target\release\bundle\nsis\*.exe" "%OUTPUT_DIR%\" >nul

echo.
echo   构建完成! 产物: dist\
pause
