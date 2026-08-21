#![cfg_attr(
    all(not(debug_assertions), target_os = "windows"),
    windows_subsystem = "windows"
)]

mod config;
mod service;
mod tray;

use config::AppConfig;
use log::error;
use service::ServiceManager;
use simplelog::{CombinedLogger, Config, WriteLogger};
use std::fs::File;
use std::sync::Arc;
use tauri::Manager;

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

fn main() {
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
        .system_tray(tray::create_system_tray())
        .on_system_tray_event(tray::create_tray_handler(sm_for_handler))
        .manage(service_manager)
        .invoke_handler(tauri::generate_handler![
            start_server,
            stop_server,
            is_server_running,
            set_window_opacity,
        ])
        .setup(move |app| {
            // 拦截关闭事件：关闭时隐藏到托盘，不停止后端
            let window = app.get_window("main").unwrap();
            let window_clone = window.clone();
            window.on_window_event(move |event| {
                if let tauri::WindowEvent::CloseRequested { api, .. } = event {
                    api.prevent_close();
                    if let Err(e) = window_clone.hide() {
                        error!("隐藏窗口失败: {}", e);
                    }
                }
            });

            // 启动后端健康检查线程
            std::thread::spawn(move || {
                let mut failures = 0u32;
                loop {
                    std::thread::sleep(std::time::Duration::from_secs(10));
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
                        }
                    }
                }
            });
            Ok(())
        })
        .run(tauri::generate_context!())
        .expect("error while running tauri application");
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
fn set_window_opacity(window: tauri::Window, opacity: f64) -> Result<(), String> {
    window
        .set_opacity(opacity)
        .map_err(|e| format!("设置透明度失败: {}", e))
}
