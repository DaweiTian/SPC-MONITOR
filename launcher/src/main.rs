#![cfg_attr(
    all(not(debug_assertions), target_os = "windows"),
    windows_subsystem = "windows"
)]

mod config;
mod service;
mod tray;

use config::AppConfig;
use service::ServiceManager;
use std::sync::Arc;

fn main() {
    let config = AppConfig::load();
    let service_manager = Arc::new(ServiceManager::new(&config));

    if config.auto_start {
        if let Err(e) = service_manager.start_server() {
            eprintln!("自动启动服务失败: {}", e);
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
        ])
        .setup(move |app| {
            let handle = app.handle();
            std::thread::spawn(move || {
                let mut failures = 0u32;
                loop {
                    std::thread::sleep(std::time::Duration::from_secs(10));
                    if sm_for_timer.is_running() {
                        if !sm_for_timer.health_check() {
                            failures += 1;
                            eprintln!("健康检查失败 ({}/3)", failures);
                            if failures >= 3 {
                                eprintln!("连续 3 次健康检查失败，尝试自动重启...");
                                sm_for_timer.stop_server().ok();
                                if let Err(e) = sm_for_timer.start_server() {
                                    eprintln!("自动重启失败: {}", e);
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
