use tauri::{
    CustomMenuItem, Manager, SystemTray, SystemTrayEvent, SystemTrayMenu, SystemTrayMenuItem,
};

pub fn create_system_tray() -> SystemTray {
    let quit = CustomMenuItem::new("quit".to_string(), "退出");
    let show = CustomMenuItem::new("show".to_string(), "显示窗口");
    let start = CustomMenuItem::new("start".to_string(), "启动服务");
    let stop = CustomMenuItem::new("stop".to_string(), "停止服务");
    let open_browser = CustomMenuItem::new("open_browser".to_string(), "打开浏览器");

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

pub fn handle_system_tray_event(app: &tauri::AppHandle, event: SystemTrayEvent) {
    match event {
        SystemTrayEvent::MenuItemClick { id, .. } => match id.as_str() {
            "quit" => {
                std::process::exit(0);
            }
            "show" => {
                if let Some(window) = app.get_window("main") {
                    window.show().unwrap();
                    window.set_focus().unwrap();
                }
            }
            "start" => {}
            "stop" => {}
            "open_browser" => {
                open::that("http://localhost:8000").unwrap();
            }
            _ => {}
        },
        SystemTrayEvent::LeftClick { .. } => {
            if let Some(window) = app.get_window("main") {
                window.show().unwrap();
                window.set_focus().unwrap();
            }
        }
        _ => {}
    }
}
