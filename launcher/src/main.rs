#![cfg_attr(
    all(not(debug_assertions), target_os = "windows"),
    windows_subsystem = "windows"
)]

mod config;
mod service;
mod tray;

use service::ServiceManager;
use std::sync::Arc;

fn main() {
    let service_manager = Arc::new(ServiceManager::new());

    tauri::Builder::default()
        .system_tray(tray::create_system_tray())
        .on_system_tray_event(tray::handle_system_tray_event)
        .manage(service_manager)
        .invoke_handler(tauri::generate_handler![
            start_server,
            stop_server,
            is_server_running,
        ])
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
