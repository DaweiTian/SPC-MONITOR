use crate::service::ServiceManager;
use log::error;
use std::sync::Arc;
use tauri::{
    menu::{Menu, MenuItem, PredefinedMenuItem},
    tray::{MouseButton, MouseButtonState, TrayIconBuilder, TrayIconEvent},
    Emitter, Manager,
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
