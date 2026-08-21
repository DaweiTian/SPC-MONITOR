use crate::service::ServiceManager;
use log::error;
use std::sync::Arc;
use tauri::{
    CustomMenuItem, Manager, SystemTray, SystemTrayEvent, SystemTrayMenu, SystemTrayMenuItem,
};

pub fn create_system_tray() -> SystemTray {
    let show = CustomMenuItem::new("show".to_string(), "显示窗口");
    let start = CustomMenuItem::new("start".to_string(), "启动服务");
    let stop = CustomMenuItem::new("stop".to_string(), "停止服务");
    let open_browser = CustomMenuItem::new("open_browser".to_string(), "打开浏览器");
    let quit = CustomMenuItem::new("quit".to_string(), "退出");

    let tray_menu = SystemTrayMenu::new()
        .add_item(show)
        .add_native_item(SystemTrayMenuItem::Separator)
        .add_item(start)
        .add_item(stop)
        .add_item(open_browser)
        .add_native_item(SystemTrayMenuItem::Separator)
        .add_item(quit);

    SystemTray::new().with_menu(tray_menu)
}

pub fn create_tray_handler(
    service_manager: Arc<ServiceManager>,
) -> impl Fn(&tauri::AppHandle, SystemTrayEvent) {
    move |app, event| match event {
        SystemTrayEvent::MenuItemClick { id, .. } => match id.as_str() {
            "quit" => {
                service_manager.stop_server().ok();
                app.exit(0);
            }
            "show" => {
                if let Some(window) = app.get_window("main") {
                    let _ = window.show();
                    let _ = window.set_focus();
                }
            }
            "start" => {
                if let Err(e) = service_manager.start_server() {
                    error!("启动服务失败: {}", e);
                }
            }
            "stop" => {
                if let Err(e) = service_manager.stop_server() {
                    error!("停止服务失败: {}", e);
                }
            }
            "open_browser" => {
                let port = service_manager.server_port();
                let url = format!("http://localhost:{}", port);
                if let Err(e) = open::that(&url) {
                    error!("打开浏览器失败: {}", e);
                }
            }
            _ => {}
        },
        SystemTrayEvent::LeftClick { .. } => {
            if let Some(window) = app.get_window("main") {
                let _ = window.show();
                let _ = window.set_focus();
            }
        }
        _ => {}
    }
}
