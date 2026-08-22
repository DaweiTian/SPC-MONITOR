mod config;
mod service;
mod tray;

use config::AppConfig;
use log::{error, warn};
use service::ServiceManager;
use simplelog::{CombinedLogger, Config, WriteLogger};
use std::fs::File;
use std::sync::Arc;
use tauri::{Emitter, Manager};
use tray::TrayMenuItems;

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
                let mut was_healthy = false;
                loop {
                    std::thread::sleep(std::time::Duration::from_secs(3));

                    // 健康检查 — use has_process() (checks process existence only)
                    // instead of is_running() (requires healthy=true, which creates a deadlock)
                    if sm_for_timer.has_process() {
                        if !sm_for_timer.health_check() {
                            failures += 1;
                            if failures >= 3 {
                                sm_for_timer.stop_server().ok();
                                if let Some(items) = app_handle.try_state::<TrayMenuItems>() {
                                    items.start.set_enabled(true).ok();
                                    items.stop.set_enabled(false).ok();
                                }
                                was_healthy = false;
                                if let Err(e) = sm_for_timer.start_server() {
                                    error!("自动重启失败: {}", e);
                                } else {
                                    failures = 0;
                                }
                            }
                        } else {
                            failures = 0;
                            // Only emit on transition from unhealthy to healthy
                            if !was_healthy {
                                let _ = app_handle.emit("backend-ready", ());
                                if let Some(items) = app_handle.try_state::<TrayMenuItems>() {
                                    items.start.set_enabled(false).ok();
                                    items.stop.set_enabled(true).ok();
                                }
                                was_healthy = true;
                            }
                        }
                    } else {
                        if was_healthy {
                            if let Some(items) = app_handle.try_state::<TrayMenuItems>() {
                                items.start.set_enabled(true).ok();
                                items.stop.set_enabled(false).ok();
                            }
                            was_healthy = false;
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
    use window_vibrancy::{apply_blur, apply_mica};
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
    if !opacity.is_finite() {
        return Err("opacity must be a finite number".to_string());
    }
    let clamped = opacity.clamp(0.1, 1.0);
    // set_opacity not available on WebviewWindow in Tauri v2.11;
    // slider UI remains functional as no-op until API is available
    let _ = (window, clamped);
    Ok(())
}

#[tauri::command]
fn get_widget_data(
    service: tauri::State<Arc<ServiceManager>>,
) -> Result<serde_json::Value, String> {
    let port = service.server_port();
    let base = format!("http://127.0.0.1:{}", port);
    let key = "ft1-monitor-default-key";
    let client = reqwest::blocking::Client::builder()
        .timeout(std::time::Duration::from_secs(10))
        .build()
        .map_err(|e| e.to_string())?;

    // Fetch dashboard data
    let mut data: serde_json::Value = client
        .get(format!("{}/api/monitor/dashboard", base))
        .header("X-API-Key", key)
        .send()
        .map_err(|e| e.to_string())?
        .json()
        .map_err(|e| e.to_string())?;

    // Fetch instrument config and merge instrument_name into response
    if let Ok(resp) = client
        .get(format!("{}/api/config/instrument", base))
        .header("X-API-Key", key)
        .send()
    {
        if let Ok(instrument) = resp.json::<serde_json::Value>() {
            if let Some(obj) = data.as_object_mut() {
                let inst_name = instrument
                    .pointer("/current_instrument")
                    .and_then(|v| v.as_str())
                    .unwrap_or("mock");
                let display = instrument
                    .pointer(&format!("/instruments/{}/name", inst_name))
                    .and_then(|v| v.as_str())
                    .unwrap_or(inst_name);
                obj.insert("instrument_name".into(), serde_json::json!(display));
            }
        }
    }

    Ok(data)
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
    } else {
        warn!("toggle_widget: widget window not found");
    }
    Ok(())
}
