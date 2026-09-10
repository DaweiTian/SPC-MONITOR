mod config;
mod service;
mod tray;
mod updater;

use config::AppConfig;
use log::{error, info, warn};
use service::ServiceManager;
use simplelog::{CombinedLogger, WriteLogger};
use std::sync::atomic::{AtomicBool, Ordering};
use std::sync::{Arc, Mutex};
use tauri::{Emitter, Manager};
use tauri_plugin_autostart::{MacosLauncher, ManagerExt};
use tray::TrayMenuItems;
use updater::PendingUpdate;

struct ApiKeyState(String);

fn init_logging() {
    let log_path = AppConfig::log_dir().join("launcher.log");
    if let Ok(log_file) = std::fs::OpenOptions::new().create(true).append(true).open(&log_path) {
        // simplelog 默认只打 HH:MM:SS，跨天无法对齐真实时间；
        // time crate 在 Windows 多线程后取本地偏移会失败，必须在启动其他线程前完成。
        let mut builder = simplelog::ConfigBuilder::new();
        match time::UtcOffset::current_local_offset() {
            Ok(offset) => {
                builder.set_time_offset(offset);
            }
            Err(e) => {
                eprintln!("获取本地时区偏移失败，日志时间将使用 UTC: {e}");
                let _ = builder.set_time_offset_to_local();
            }
        }
        builder.set_time_format_custom(time::macros::format_description!(
            "[year]-[month]-[day] [hour]:[minute]:[second]"
        ));
        let config = builder.build();
        let _ = CombinedLogger::init(vec![WriteLogger::new(
            log::LevelFilter::Warn,
            config,
            log_file,
        )]);
    }
}

pub fn run() {
    init_logging();

    // 自定义 panic handler：将 panic 信息写入日志文件
    let panic_log_path = AppConfig::log_dir().join("panic.log");
    std::panic::set_hook(Box::new(move |info| {
        let msg = if let Some(s) = info.payload().downcast_ref::<String>() {
            s.clone()
        } else if let Some(s) = info.payload().downcast_ref::<&str>() {
            s.to_string()
        } else {
            "Unknown panic".to_string()
        };
        let location = info.location()
            .map(|l| format!("{}:{}:{}", l.file(), l.line(), l.column()))
            .unwrap_or_else(|| "unknown location".to_string());
        let backtrace = std::backtrace::Backtrace::force_capture();
        let full = format!("PANIC: {}\nLocation: {}\nBacktrace:\n{}\n", msg, location, backtrace);
        let _ = std::fs::OpenOptions::new().create(true).append(true).write(true)
            .open(&panic_log_path)
            .and_then(|mut f| { use std::io::Write; f.write_all(full.as_bytes()) });
        eprintln!("{}", full);
    }));

    log::warn!("=== 应用启动 ===");

    let config = AppConfig::load();
    let api_key = config.api_key.clone();
    let service_manager = Arc::new(ServiceManager::new(&config));

    log::warn!("配置加载完成，auto_start={}", config.auto_start);

    if config.auto_start {
        // 启动失败重试：端口残留/杀软扫描可能导致首次 spawn 失败
        let mut started = false;
        for attempt in 1..=3u32 {
            match service_manager.start_server() {
                Ok(()) => {
                    started = true;
                    break;
                }
                Err(e) => {
                    error!("自动启动服务失败(尝试 {}/3): {}", attempt, e);
                    if attempt < 3 {
                        std::thread::sleep(std::time::Duration::from_secs(2 * attempt as u64));
                    }
                }
            }
        }
        if !started {
            error!("自动启动服务在 3 次尝试后仍失败，将由健康检查线程继续拉起");
        }
    }

    let sm_for_handler = service_manager.clone();
    let sm_for_timer = service_manager.clone();
    let auto_start_enabled = config.auto_start;
    let shutdown_flag = Arc::new(AtomicBool::new(false));
    let shutdown_for_thread = shutdown_flag.clone();

    log::warn!("正在初始化 Tauri 运行时...");

    let builder = tauri::Builder::default()
        .plugin(tauri_plugin_opener::init())
        .plugin(tauri_plugin_dialog::init())
        .plugin(tauri_plugin_autostart::init(MacosLauncher::LaunchAgent, None))
        .plugin(tauri_plugin_notification::init())
        .plugin(tauri_plugin_single_instance::init(|app, _args, _cwd| {
            // 重复启动时，聚焦已有窗口
            if let Some(window) = app.get_webview_window("main") {
                let _ = window.show();
                let _ = window.unminimize();
                let _ = window.set_focus();
            }
        }))
        .plugin(tauri_plugin_updater::Builder::new().build())
        .setup(move |app| {
            log::warn!("进入 setup 闭包");
            // 设置 AppUserModelID，使任务栏图标与后端进程区分开
            #[cfg(target_os = "windows")]
            {
                extern "system" {
                    fn SetCurrentProcessExplicitAppUserModelID(app_id: *const u16) -> i32;
                }
                // "SPC.Monitor.Launcher" as null-terminated UTF-16
                let app_id: Vec<u16> = "SPC.Monitor.Launcher\0".encode_utf16().collect();
                unsafe {
                    let _ = SetCurrentProcessExplicitAppUserModelID(app_id.as_ptr());
                }
            }

            // Mica / Blur 窗口特效
            #[cfg(target_os = "windows")]
            {
                if let Some(main_window) = app.get_webview_window("main") {
                    apply_window_effect(&main_window);
                }
            }

            // 创建系统托盘
            tray::create_tray(app, sm_for_handler.clone())?;

            // 与 AppConfig.auto_start 同步开机自启：仅当配置为 true 时启用；
            // 用户已关闭（托盘手动关闭或配置为 false）则不强制重新启用
            if auto_start_enabled {
                let autostart = app.autolaunch();
                if !autostart.is_enabled().unwrap_or(false) {
                    if let Err(e) = autostart.enable() {
                        log::warn!("启用开机自启失败: {}", e);
                    }
                }
            }

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
            // 启动自动更新定时检查（每 3 天）
            updater::spawn_periodic_check(app.handle().clone());
            std::thread::spawn(move || {
                let mut failures = 0u32;
                let mut was_healthy = false;
                let mut was_healthy_once = false;
                // 当前这次进程实例是否曾健康过（重启后重置，避免新进程被旧状态误杀）
                let mut current_proc_healthy_once = false;
                let mut restart_backoff = 0u32;
                // 进程存活但尚未健康的累计秒数（轮询间隔 3s）
                let mut alive_unhealthy_secs = 0u32;
                // 首次启动宽限：Nuitka 独立包解压/杀软扫描在工厂新机上可能超过 60s
                const FIRST_START_GRACE_SECS: u32 = 120;
                // 曾健康后再次不健康：连续失败次数阈值（约 15s）
                const UNHEALTHY_AFTER_READY_FAILURES: u32 = 5;
                let poll_secs = 3u64;

                while !shutdown_for_thread.load(Ordering::Relaxed) {
                    std::thread::sleep(std::time::Duration::from_secs(poll_secs));

                    if shutdown_for_thread.load(Ordering::Relaxed) {
                        break;
                    }

                    if sm_for_timer.has_process() {
                        if sm_for_timer.health_check() {
                            failures = 0;
                            alive_unhealthy_secs = 0;
                            restart_backoff = 0;
                            if !was_healthy {
                                let _ = app_handle.emit("backend-ready", ());
                                if let Some(items) = app_handle.try_state::<TrayMenuItems>() {
                                    items.start.set_enabled(false).ok();
                                    items.stop.set_enabled(true).ok();
                                }
                                was_healthy = true;
                                was_healthy_once = true;
                                current_proc_healthy_once = true;
                            }
                        } else {
                            failures += 1;
                            alive_unhealthy_secs = alive_unhealthy_secs.saturating_add(poll_secs as u32);

                            // 区分「还在启动」与「已卡死」（按当前进程实例判定）
                            // - 当前实例从未健康：给足首启宽限，不要在解压中途杀进程
                            // - 当前实例曾健康：短暂连续失败才判定卡死并重启
                            let should_restart = if current_proc_healthy_once {
                                failures >= UNHEALTHY_AFTER_READY_FAILURES
                            } else {
                                alive_unhealthy_secs >= FIRST_START_GRACE_SECS
                            };

                            if should_restart {
                                warn!(
                                    "后端持续不健康（连续失败 {} 次 / 存活未健康 {}s），尝试重启",
                                    failures, alive_unhealthy_secs
                                );
                                sm_for_timer.stop_server().ok();
                                if let Some(items) = app_handle.try_state::<TrayMenuItems>() {
                                    items.start.set_enabled(true).ok();
                                    items.stop.set_enabled(false).ok();
                                }
                                was_healthy = false;
                                current_proc_healthy_once = false;
                                failures = 0;
                                alive_unhealthy_secs = 0;
                                // 等待端口释放（Windows TIME_WAIT 可能需要数秒）
                                std::thread::sleep(std::time::Duration::from_secs(5));
                                if shutdown_for_thread.load(Ordering::Relaxed) {
                                    break;
                                }
                                if let Err(e) = sm_for_timer.start_server() {
                                    error!("自动重启失败: {}", e);
                                }
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
                        // 进程消失：若开启自启或服务曾成功运行，自动拉起并指数退避（最大 30s）
                        if auto_start_enabled || was_healthy_once {
                            restart_backoff = restart_backoff.saturating_add(1);
                            let shift = restart_backoff.saturating_sub(1).min(4);
                            let delay_secs = (3u64 << shift).min(30);
                            std::thread::sleep(std::time::Duration::from_secs(delay_secs));
                            if shutdown_for_thread.load(Ordering::Relaxed) {
                                break;
                            }
                            // spawn 可能因端口残留失败，连续快速重试几次
                            let mut spawned = false;
                            for attempt in 1..=3u32 {
                                match sm_for_timer.start_server() {
                                    Ok(()) => {
                                        info!(
                                            "后端进程缺失，已自动拉起(第{}次，退避{}s，spawn尝试{})",
                                            restart_backoff, delay_secs, attempt
                                        );
                                        // 新进程实例：重新进入首启宽限
                                        current_proc_healthy_once = false;
                                        alive_unhealthy_secs = 0;
                                        failures = 0;
                                        spawned = true;
                                        break;
                                    }
                                    Err(e) => {
                                        error!(
                                            "自动拉起后端失败(第{}次，退避{}s，spawn尝试{}): {}",
                                            restart_backoff, delay_secs, attempt, e
                                        );
                                        std::thread::sleep(std::time::Duration::from_secs(1));
                                    }
                                }
                            }
                            if !spawned {
                                // 保持 restart_backoff 递增，下轮继续退避重试
                                alive_unhealthy_secs = 0;
                            }
                        }
                    }
                }
            });

            log::warn!("setup 闭包完成");
            Ok(())
        })
        .manage(service_manager)
        .manage(shutdown_flag)
        .manage(ApiKeyState(api_key))
        .manage(Mutex::<Option<PendingUpdate>>::new(None))
        .invoke_handler(tauri::generate_handler![
            start_server,
            stop_server,
            is_server_running,
            check_backend_health,
            set_window_opacity,
            get_widget_data,
            toggle_widget,
            get_api_key,
            updater::check_for_update,
            updater::download_update,
            updater::install_update,
        ]);

    log::warn!("正在启动 Tauri 应用...");
    match builder.run(tauri::generate_context!()) {
        Ok(_) => log::warn!("Tauri 应用正常退出"),
        Err(e) => {
            log::error!("Tauri 应用启动失败: {:?}", e);
            // 在日志目录写入错误文件，方便排查
            let err_path = AppConfig::log_dir().join("tauri-error.log");
            let _ = std::fs::write(&err_path, format!("Tauri 启动失败: {:?}", e));
        }
    }
    // Drop 自动清理后端进程（ServiceManager::Drop）
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

/// 轮询后端健康状态（前端 splash 用于替代 backend-ready 事件）
#[tauri::command]
fn check_backend_health(service: tauri::State<Arc<ServiceManager>>) -> bool {
    service.health_check()
}

#[tauri::command]
fn set_window_opacity(opacity: f64) -> Result<(), String> {
    if !opacity.is_finite() {
        return Err("opacity must be a finite number".to_string());
    }
    let _clamped = opacity.clamp(0.1, 1.0);
    // Tauri v2 WebviewWindow 无 set_opacity API，CSS 已处理透明度
    Ok(())
}

/// 获取小组件数据（异步，不阻塞 UI）
#[tauri::command(async)]
async fn get_widget_data(
    service: tauri::State<'_, Arc<ServiceManager>>,
    api_key_state: tauri::State<'_, ApiKeyState>,
) -> Result<serde_json::Value, String> {
    let port = service.server_port();
    let base = format!("http://127.0.0.1:{}", port);
    let key = api_key_state.0.clone();

    let client = reqwest::Client::builder()
        .timeout(std::time::Duration::from_secs(10))
        .build()
        .map_err(|e| e.to_string())?;

    let mut data: serde_json::Value = client
        .get(format!("{}/api/monitor/dashboard", base))
        .header("X-API-Key", &key)
        .send()
        .await
        .map_err(|e| e.to_string())?
        .json()
        .await
        .map_err(|e| e.to_string())?;

    if let Ok(resp) = client
        .get(format!("{}/api/config/instrument", base))
        .header("X-API-Key", &key)
        .send()
        .await
    {
        if let Ok(instrument) = resp.json::<serde_json::Value>().await {
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

    if let Ok(resp) = client
        .get(format!("{}/api/monitor/widget_spc", base))
        .header("X-API-Key", &key)
        .send()
        .await
    {
        if let Ok(spc) = resp.json::<serde_json::Value>().await {
            if let Some(obj) = data.as_object_mut() {
                for field in &["spc_points", "spc_mean", "spc_ucl", "spc_lcl"] {
                    if let Some(val) = spc.get(*field) {
                        obj.insert((*field).into(), val.clone());
                    }
                }
            }
        }
    }

    if let Ok(resp) = client
        .get(format!("{}/api/monitor/widget_capability", base))
        .header("X-API-Key", &key)
        .send()
        .await
    {
        if let Ok(cap) = resp.json::<serde_json::Value>().await {
            if let Some(obj) = data.as_object_mut() {
                for field in &["avg_cp", "avg_cpk", "avg_pp", "avg_ppk", "avg_sigma", "avg_ppm"] {
                    if let Some(val) = cap.get(*field) {
                        obj.insert((*field).into(), val.clone());
                    }
                }
            }
        }
    }

    Ok(data)
}

#[tauri::command]
fn get_api_key(state: tauri::State<ApiKeyState>) -> String {
    state.0.clone()
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
