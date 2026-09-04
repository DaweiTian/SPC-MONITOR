# Tauri v2 升级 + 桌面小组件 实施计划

> [!NOTE]
> This document may not reflect the current implementation.
> See the final report for up-to-date state:
> [Final Report](../reports/tauri-v2-upgrade.md)

> **For agentic workers:** REQUIRED SUB-SKILL: Use compose:subagent (recommended) or compose:execute to implement this plan task-by-task. Steps use checkbox (`- [ ]`) syntax for tracking.

**Goal:** 将 spc-monitor 启动器从 Tauri v1 升级到 v2，实现 Mica 窗口特效、桌面半透明小组件、启动等待动画，后端打包从 PyInstaller 切换到 Nuitka。

**Architecture:** Tauri v2 多窗口架构（splash + main + widget），window-vibrancy 实现 Mica/Blur 窗口特效，Nuitka 编译 Python 后端为原生 exe，独立进程管理后端生命周期。

**Tech Stack:** Tauri 2.x, Rust 1.88+, window-vibrancy, Nuitka 2.x, Python 3.11+

## Global Constraints

- 后端端口 18080，健康检查 `/api/health`
- 启动器 `service.rs` / `config.rs` 零 Tauri API，不修改
- NSIS 安装包 + zip 免安装版双格式分发
- Windows 10/11 兼容，Mica 失败回退 blur
- 小组件配置持久化到 `config.json`

---

### Task 1: Cargo.toml + tauri.conf.json 迁移

**Covers:** [S3.1], [S3.5]

**Files:**
- Modify: `launcher/Cargo.toml`
- Modify: `launcher/tauri.conf.json`
- Create: `launcher/capabilities/default.json`

- [ ] **Step 1: 更新 Cargo.toml 依赖**

```toml
[package]
name = "ft1-monitor-launcher"
version = "2.0.0"
edition = "2021"

[build-dependencies]
tauri-build = { version = "2", features = [] }

[dependencies]
tauri = { version = "2", features = [] }
tauri-plugin-opener = "2"
tauri-plugin-dialog = "2"
window-vibrancy = "0.6"
tokio = { version = "1", features = ["full"] }
serde = { version = "1", features = ["derive"] }
serde_json = "1"
reqwest = { version = "0.12", features = ["blocking", "json"] }
anyhow = "1"
dirs = "5"
log = "0.4"
simplelog = "0.12"
open = "5"
```

- [ ] **Step 2: 重写 tauri.conf.json**

```json
{
  "productName": "液奶过程监控系统",
  "version": "2.0.0",
  "identifier": "com.ft1.monitor",
  "build": {
    "frontendDist": "../frontend/dist",
    "devUrl": "http://localhost:5173"
  },
  "bundle": {
    "active": true,
    "targets": ["nsis"],
    "icon": ["icons/icon.ico", "icons/icon.png"],
    "resources": ["ft1-backend/*"],
    "windows": {
      "nsis": {
        "installerIcon": "icons/icon.ico",
        "header": "nsis/header.bmp",
        "sidebar": "nsis/sidebar.bmp"
      }
    }
  },
  "app": {
    "windows": [
      {
        "label": "splash",
        "title": "正在启动...",
        "width": 400,
        "height": 300,
        "center": true,
        "decorations": false,
        "resizable": false,
        "transparent": true
      },
      {
        "label": "main",
        "title": "液奶过程监控系统",
        "width": 1200,
        "height": 800,
        "visible": false,
        "resizable": true,
        "transparent": true,
        "decorations": true
      },
      {
        "label": "widget",
        "title": "FT1 看板",
        "url": "widget.html",
        "width": 320,
        "height": 480,
        "visible": false,
        "resizable": true,
        "alwaysOnTop": true,
        "decorations": false,
        "transparent": true,
        "skipTaskbar": true
      }
    ],
    "trayIcon": {
      "iconPath": "icons/icon.png",
      "iconAsTemplate": false
    },
    "security": {
      "csp": "default-src 'self'; script-src 'self'; style-src 'self' 'unsafe-inline'; img-src 'self' asset: http://asset.localhost; connect-src 'self' http://127.0.0.1:*"
    }
  }
}
```

- [ ] **Step 3: 创建权限文件**

`launcher/capabilities/default.json`:
```json
{
  "$schema": "../gen/schemas/desktop-schema.json",
  "identifier": "default",
  "description": "默认权限",
  "windows": ["main", "splash", "widget"],
  "permissions": [
    "core:default",
    "opener:default",
    "dialog:default",
    "window:default",
    "window:allow-show",
    "window:allow-hide",
    "window:allow-close",
    "window:allow-set-focus",
    "window:allow-set-always-on-top",
    "window:allow-set-size",
    "window:allow-set-position",
    "window:allow-create",
    "window:allow-destroy",
    "tray:default",
    "menu:default"
  ]
}
```

- [ ] **Step 4: 删除旧 features 配置**

移除 `Cargo.toml` 中的 `[features]` section（`custom-protocol` 不再需要）。

- [ ] **Step 5: 验证编译**

Run: `cd launcher && cargo check`
Expected: 编译通过（可能有 main.rs/tray.rs 的 API 错误，后续 task 修复）

- [ ] **Step 6: Commit**

```bash
git add launcher/Cargo.toml launcher/tauri.conf.json launcher/capabilities/
git commit -m "feat: migrate Cargo.toml and config to Tauri v2"
```

---

### Task 2: main.rs 重写 + Mica 特效

**Covers:** [S3.3], [S3.4], [S4]

**Files:**
- Create: `launcher/src/lib.rs`
- Rewrite: `launcher/src/main.rs`

- [ ] **Step 1: 创建 lib.rs**

```rust
mod config;
mod service;
mod tray;

use config::AppConfig;
use log::{error, info};
use service::ServiceManager;
use simplelog::{CombinedLogger, Config, WriteLogger};
use std::fs::File;
use std::sync::Arc;
use tauri::{Manager, Emitter};

fn init_logging() {
    let log_path = AppConfig::log_dir().join("launcher.log");
    if let Ok(log_file) = File::create(&log_path) {
        let _ = CombinedLogger::init(vec![WriteLogger::new(
            log::LevelFilter::Info,
            Config::default(),
            log_file,
        )]);
    }
}

pub fn run() {
    init_logging();

    let config = AppConfig::load();
    let service_manager = Arc::new(ServiceManager::new(&config));

    if config.auto_start {
        if let Err(e) = service_manager.start_server() {
            error!("自动启动服务失败: {}", e);
        }
    }

    let sm_for_handler = service_manager.clone();
    let sm_for_timer = service_manager.clone();

    tauri::Builder::default()
        .plugin(tauri_plugin_opener::init())
        .plugin(tauri_plugin_dialog::init())
        .setup(move |app| {
            // Mica / Blur 窗口特效
            #[cfg(target_os = "windows")]
            {
                if let Some(main_window) = app.get_webview_window("main") {
                    apply_window_effect(&main_window);
                }
            }

            // 创建系统托盘
            tray::create_tray(app, sm_for_handler)?;

            // 拦截主窗口关闭：隐藏到托盘
            if let Some(window) = app.get_webview_window("main") {
                let w = window.clone();
                window.on_window_event(move |event| {
                    if let tauri::WindowEvent::CloseRequested { api, .. } = event {
                        api.prevent_close();
                        let _ = w.hide();
                    }
                });
            }

            // 启动后端健康检查 + 就绪通知
            let app_handle = app.handle().clone();
            std::thread::spawn(move || {
                let mut failures = 0u32;
                loop {
                    std::thread::sleep(std::time::Duration::from_secs(3));

                    // 健康检查
                    if sm_for_timer.is_running() {
                        if !sm_for_timer.health_check() {
                            failures += 1;
                            if failures >= 3 {
                                sm_for_timer.stop_server().ok();
                                if let Err(e) = sm_for_timer.start_server() {
                                    error!("自动重启失败: {}", e);
                                } else {
                                    failures = 0;
                                }
                            }
                        } else {
                            failures = 0;
                            // 通知前端后端已就绪
                            let _ = app_handle.emit("backend-ready", ());
                        }
                    }
                }
            });

            Ok(())
        })
        .manage(service_manager)
        .invoke_handler(tauri::generate_handler![
            start_server,
            stop_server,
            is_server_running,
            set_window_opacity,
            get_widget_data,
            toggle_widget,
        ])
        .run(tauri::generate_context!())
        .expect("error while running tauri application");
}

#[cfg(target_os = "windows")]
fn apply_window_effect(window: &tauri::WebviewWindow) {
    use window_vibrancy::{apply_mica, apply_blur};
    if apply_mica(window, Some(true)).is_err() {
        apply_blur(window, Some((18, 18, 18, 125))).ok();
    }
}

#[tauri::command]
fn start_server(service: tauri::State<Arc<ServiceManager>>) -> Result<(), String> {
    service.start_server()
}

#[tauri::command]
fn stop_server(service: tauri::State<Arc<ServiceManager>>) -> Result<(), String> {
    service.stop_server()
}

#[tauri::command]
fn is_server_running(service: tauri::State<Arc<ServiceManager>>) -> bool {
    service.is_running()
}

#[tauri::command]
fn set_window_opacity(window: tauri::WebviewWindow, opacity: f64) -> Result<(), String> {
    window.set_opacity(opacity).map_err(|e| e.to_string())
}

#[tauri::command]
fn get_widget_data(service: tauri::State<Arc<ServiceManager>>) -> Result<serde_json::Value, String> {
    let port = service.server_port();
    let url = format!("http://127.0.0.1:{}/api/monitor/dashboard", port);
    reqwest::blocking::get(&url)
        .map_err(|e| e.to_string())?
        .json::<serde_json::Value>()
        .map_err(|e| e.to_string())
}

#[tauri::command]
fn toggle_widget(app: tauri::AppHandle) -> Result<(), String> {
    if let Some(widget) = app.get_webview_window("widget") {
        if widget.is_visible().unwrap_or(false) {
            widget.hide().map_err(|e| e.to_string())?;
        } else {
            widget.show().map_err(|e| e.to_string())?;
            widget.set_focus().map_err(|e| e.to_string())?;
        }
    }
    Ok(())
}
```

- [ ] **Step 2: 精简 main.rs**

```rust
#![cfg_attr(
    all(not(debug_assertions), target_os = "windows"),
    windows_subsystem = "windows"
)]

fn main() {
    ft1_monitor_launcher::run();
}
```

- [ ] **Step 3: 验证编译**

Run: `cd launcher && cargo check`
Expected: 通过（tray.rs 可能还有错误，Task 3 修复）

- [ ] **Step 4: Commit**

```bash
git add launcher/src/lib.rs launcher/src/main.rs
git commit -m "feat: rewrite main entry with Tauri v2 async + Mica effect"
```

---

### Task 3: tray.rs 重写

**Covers:** [S3.2]

**Files:**
- Rewrite: `launcher/src/tray.rs`

- [ ] **Step 1: 重写 tray.rs**

```rust
use crate::service::ServiceManager;
use log::error;
use std::sync::Arc;
use tauri::{
    menu::{Menu, MenuItem, PredefinedMenuItem},
    tray::{MouseButton, MouseButtonState, TrayIconBuilder, TrayIconEvent},
    Manager, Emitter,
};

pub fn create_tray(app: &tauri::App, service_manager: Arc<ServiceManager>) -> tauri::Result<()> {
    let show = MenuItem::with_id(app, "show", "显示窗口", true, None::<&str>)?;
    let start = MenuItem::with_id(app, "start", "启动服务", true, None::<&str>)?;
    let stop = MenuItem::with_id(app, "stop", "停止服务", true, None::<&str>)?;
    let open_browser = MenuItem::with_id(app, "open_browser", "打开浏览器", true, None::<&str>)?;
    let toggle_widget = MenuItem::with_id(app, "toggle_widget", "桌面小组件", true, None::<&str>)?;
    let quit = MenuItem::with_id(app, "quit", "退出", true, None::<&str>)?;

    let menu = Menu::with_items(
        app,
        &[
            &show,
            &PredefinedMenuItem::separator(app)?,
            &start,
            &stop,
            &open_browser,
            &toggle_widget,
            &PredefinedMenuItem::separator(app)?,
            &quit,
        ],
    )?;

    let sm = service_manager.clone();
    let _tray = TrayIconBuilder::new("main")
        .icon(app.default_window_icon().unwrap().clone())
        .menu(&menu)
        .on_menu_event(move |app, event| {
            match event.id.as_ref() {
                "quit" => {
                    sm.stop_server().ok();
                    app.exit(0);
                }
                "show" => {
                    if let Some(w) = app.get_webview_window("main") {
                        let _ = w.show();
                        let _ = w.set_focus();
                    }
                }
                "start" => {
                    if let Err(e) = sm.start_server() {
                        error!("启动服务失败: {}", e);
                    }
                }
                "stop" => {
                    if let Err(e) = sm.stop_server() {
                        error!("停止服务失败: {}", e);
                    }
                }
                "open_browser" => {
                    let port = sm.server_port();
                    let url = format!("http://localhost:{}", port);
                    if let Err(e) = open::that(&url) {
                        error!("打开浏览器失败: {}", e);
                    }
                }
                "toggle_widget" => {
                    let _ = app.emit("toggle-widget", ());
                }
                _ => {}
            }
        })
        .on_tray_icon_event(|tray, event| {
            if let TrayIconEvent::Click {
                button: MouseButton::Left,
                button_state: MouseButtonState::Up,
                ..
            } = event
            {
                let app = tray.app_handle();
                if let Some(w) = app.get_webview_window("main") {
                    let _ = w.show();
                    let _ = w.set_focus();
                }
            }
        })
        .build(app)?;

    Ok(())
}
```

- [ ] **Step 2: 验证编译**

Run: `cd launcher && cargo check`
Expected: 编译通过

- [ ] **Step 3: Commit**

```bash
git add launcher/src/tray.rs
git commit -m "feat: rewrite tray with Tauri v2 menu API"
```

---

### Task 4: 启动等待动画 (splash)

**Covers:** [S5]

**Files:**
- Create: `frontend/public/splash.html`

- [ ] **Step 1: 创建 splash.html**

```html
<!DOCTYPE html>
<html>
<head>
<meta charset="UTF-8">
<style>
  * { margin: 0; padding: 0; box-sizing: border-box; }
  body {
    background: #0a0e1a;
    display: flex; flex-direction: column;
    align-items: center; justify-content: center;
    height: 100vh; color: #e2e8f0;
    font-family: -apple-system, sans-serif;
    overflow: hidden; user-select: none;
  }
  .ring {
    width: 80px; height: 80px;
    border: 3px solid rgba(0,212,255,0.15);
    border-top-color: #00d4ff;
    border-radius: 50%;
    animation: spin 1s linear infinite;
  }
  @keyframes spin { to { transform: rotate(360deg); } }
  .pulse {
    position: absolute;
    width: 80px; height: 80px;
    border: 2px solid rgba(0,212,255,0.3);
    border-radius: 50%;
    animation: pulse 2s ease-in-out infinite;
  }
  @keyframes pulse {
    0%, 100% { transform: scale(1); opacity: 0.3; }
    50% { transform: scale(1.5); opacity: 0; }
  }
  .text { margin-top: 32px; font-size: 14px; color: #8b95a7; }
  .sub { margin-top: 8px; font-size: 12px; color: #4a5568; }
  .bar-wrap {
    margin-top: 24px; width: 200px; height: 3px;
    background: rgba(0,212,255,0.1); border-radius: 2px;
  }
  .bar {
    height: 100%; width: 30%;
    background: linear-gradient(90deg, #00d4ff, #0066ff);
    border-radius: 2px;
    animation: slide 1.5s ease-in-out infinite;
  }
  @keyframes slide {
    0% { transform: translateX(-100%); }
    100% { transform: translateX(400%); }
  }
</style>
</head>
<body>
  <div class="pulse"></div>
  <div class="ring"></div>
  <div class="text">正在启动后端服务</div>
  <div class="sub">首次启动可能需要几秒钟...</div>
  <div class="bar-wrap"><div class="bar"></div></div>
</body>
</html>
```

- [ ] **Step 2: Commit**

```bash
git add frontend/public/splash.html
git commit -m "feat: add splash screen with loading animation"
```

---

### Task 5: 桌面半透明小组件

**Covers:** [S6]

**Files:**
- Create: `frontend/public/widget.html`

- [ ] **Step 1: 创建 widget.html**

独立 HTML 文件，不依赖 React，直接通过 Tauri IPC 获取数据。包含：
- 半透明深色背景 `rgba(10,14,26,0.85)` + `backdrop-filter: blur(20px)`
- 圆角 12px，可拖拽区域
- Cpk 卡片、CV% 卡片、最近预警列表
- SPC 迷你控制图（Canvas 绘制最近 20 个点）
- 透明度滑块（右上角设置按钮展开）
- 10 秒自动刷新

- [ ] **Step 2: Commit**

```bash
git add frontend/public/widget.html
git commit -m "feat: add desktop widget with semi-transparent cards"
```

---

### Task 6: Nuitka 后端打包

**Covers:** [S7]

**Files:**
- Modify: `backend/run.py`
- Create: `backend/nuitka.config`
- Modify: `backend/requirements.txt`

- [ ] **Step 1: 更新 run.py 兼容 Nuitka**

```python
import sys, os, argparse

if getattr(sys, 'frozen', False) or '__compiled__' in globals():
    os.chdir(os.path.dirname(sys.executable))

os.makedirs('data', exist_ok=True)
os.makedirs('logs', exist_ok=True)

import uvicorn
from backend.main import app

if __name__ == '__main__':
    parser = argparse.ArgumentParser()
    parser.add_argument('--host', default='127.0.0.1')
    parser.add_argument('--port', type=int, default=18080)
    args = parser.parse_args()
    uvicorn.run(app, host=args.host, port=args.port)
```

- [ ] **Step 2: 创建 nuitka.config**

```
--standalone
--onefile
--output-filename=ft1-backend.exe
--windows-console-mode=force
--enable-plugin=numpy
--enable-plugin=scipy
--include-package=fastapi
--include-package=uvicorn
--include-package=backend
--include-package=sqlalchemy
--include-package=pydantic
--include-package=statsmodels
--include-package=pymssql
--include-package=apscheduler
--include-package=access_parser
--include-data-dir=data=data
--nofollow-import-to=tkinter
--nofollow-import-to=matplotlib
--nofollow-import-to=PIL
--nofollow-import-to=pytest
--nofollow-import-to=unittest
run.py
```

- [ ] **Step 3: 更新 requirements.txt**

添加 Nuitka 依赖：
```
nuitka>=2.0.0
ordered-set>=4.1.0
zstandard>=0.22.0
```

- [ ] **Step 4: Commit**

```bash
git add backend/run.py backend/nuitka.config backend/requirements.txt
git commit -m "feat: switch backend packaging to Nuitka"
```

---

### Task 7: 构建脚本更新

**Covers:** [S8]

**Files:**
- Rewrite: `build.bat`

- [ ] **Step 1: 重写 build.bat**

关键变化：
- PyInstaller → Nuitka 构建命令
- 产出到 `dist/` 目录
- 安装版 + 免安装版 zip

```bat
@echo off
setlocal enabledelayedexpansion
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
cd /d "%PROJECT_DIR%backend"
python -m nuitka --config-file=nuitka.config || (echo 后端编译失败 & pause & exit /b 1)

echo [3/5] 复制后端...
set BACKEND_DIST=%LAUNCHER_DIR%\ft1-backend
if exist "%BACKEND_DIST%" rmdir /s /q "%BACKEND_DIST%"
mkdir "%BACKEND_DIST%"
copy /Y ft1-backend.exe "%BACKEND_DIST%\" >nul
xcopy /E /I /Q /Y data "%BACKEND_DIST%\data" >nul 2>nul

echo [4/5] 构建 Tauri...
cd /d "%LAUNCHER_DIR%"
cargo tauri build || (echo Tauri 构建失败 & pause & exit /b 1)

echo [5/5] 打包免安装版...
if not exist "%OUTPUT_DIR%" mkdir "%OUTPUT_DIR%"
set PORTABLE=%OUTPUT_DIR%\spc-monitor-Portable
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
```

- [ ] **Step 2: Commit**

```bash
git add build.bat
git commit -m "feat: update build script for Nuitka + Tauri v2"
```

---

### Task 8: 端到端验证

**Covers:** [S3], [S4], [S5], [S6], [S7]

- [ ] **Step 1: Windows 上拉取最新代码**

```powershell
git pull
rustup default 1.88.0
```

- [ ] **Step 2: 安装 Tauri v2 CLI**

```powershell
cargo install tauri-cli --version "^2"
```

- [ ] **Step 3: 安装 Nuitka**

```powershell
pip install nuitka ordered-set zstandard
```

- [ ] **Step 4: 执行构建**

```powershell
.\build.bat
```

- [ ] **Step 5: 测试安装版**

双击 `dist\液奶过程监控系统_*_x64-setup.exe`：
- 安装界面显示科技风侧边栏和头部
- 安装完成后启动
- splash 等待动画显示
- 后端就绪后自动切换到主窗口
- 主窗口标题栏有 Mica/blur 效果

- [ ] **Step 6: 测试托盘和小组件**

- 关闭窗口 → 隐藏到托盘（不退出）
- 托盘右键 → 桌面小组件 → 半透明小组件弹出
- 托盘右键 → 退出 → 应用完全退出

- [ ] **Step 7: 测试免安装版**

解压 `dist\液奶过程监控系统_免安装版.zip`，双击 exe 验证功能正常。

- [ ] **Step 8: Commit 最终版本**

```bash
git add -A
git commit -m "feat: complete Tauri v2 upgrade with Mica, widget, and Nuitka"
```
