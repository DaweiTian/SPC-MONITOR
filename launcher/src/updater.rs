use serde::Serialize;
use std::sync::Mutex;
use std::time::Duration;
use tauri::{AppHandle, Emitter, Manager};
use tauri_plugin_updater::UpdaterExt;

#[derive(Clone, Serialize)]
pub struct UpdateInfo {
    pub version: String,
    pub notes: Option<String>,
}

pub struct PendingUpdate {
    pub update: tauri_plugin_updater::Update,
    pub bytes: Vec<u8>,
}

/// 前端调用：检查是否有可用更新
#[tauri::command(async)]
pub async fn check_for_update(app: AppHandle) -> Result<Option<UpdateInfo>, String> {
    let update = app.updater().map_err(|e| e.to_string())?.check().await.map_err(|e| e.to_string())?;
    Ok(update.map(|u| UpdateInfo {
        version: u.version.clone(),
        notes: u.body.clone(),
    }))
}

/// 前端调用：静默下载更新并暂存，供后续安装
#[tauri::command(async)]
pub async fn download_update(app: AppHandle) -> Result<UpdateInfo, String> {
    let update = app
        .updater().map_err(|e| e.to_string())?
        .check()
        .await
        .map_err(|e| e.to_string())?
        .ok_or("没有可用的更新")?;

    let version = update.version.clone();
    let notes = update.body.clone();

    let bytes = update
        .download(|_chunk, _total| {}, || {})
        .await
        .map_err(|e| e.to_string())?;

    *app.state::<Mutex<Option<PendingUpdate>>>()
        .lock()
        .map_err(|e| e.to_string())? = Some(PendingUpdate { update, bytes });

    Ok(UpdateInfo { version, notes })
}

/// 前端调用：安装已下载的更新（会退出应用）
#[tauri::command(async)]
pub async fn install_update(app: AppHandle) -> Result<(), String> {
    // 安装前显式停止后端进程（install() 内部调用 process::exit 会绕过 Drop）
    if let Some(sm) = app.try_state::<std::sync::Arc<crate::service::ServiceManager>>() {
        let _ = sm.stop_server();
    }

    let pending = app
        .state::<Mutex<Option<PendingUpdate>>>()
        .lock()
        .map_err(|e| e.to_string())?
        .take();

    if let Some(p) = pending {
        p.update.install(p.bytes).map_err(|e| e.to_string())?;
    }
    Ok(())
}

/// 启动后台定时检查任务（每 3 天一次，首次延迟 60 秒）
pub fn spawn_periodic_check(app: AppHandle) {
    tauri::async_runtime::spawn(async move {
        log::warn!("更新检查任务已启动，5 秒后首次检查");
        tokio::time::sleep(Duration::from_secs(5)).await;
        log::warn!("开始检查更新...");

        loop {
            log::warn!("正在请求更新服务器...");
            match try_check_and_download(&app).await {
                Ok(Some(info)) => {
                    log::warn!("发现新版本 {}，已静默下载", info.version);
                    app.emit("update-ready", &info).ok();
                }
                Ok(None) => {
                    log::warn!("当前已是最新版本");
                }
                Err(e) => {
                    log::warn!("检查更新失败: {}", e);
                }
            }

            tokio::time::sleep(Duration::from_secs(3 * 24 * 3600)).await;
        }
    });
}

/// 内部：检查更新 → 下载 → 暂存
async fn try_check_and_download(app: &AppHandle) -> Result<Option<UpdateInfo>, String> {
    // 调试：手动模拟 updater 的请求方式
    use reqwest::header::HeaderValue;
    let client = reqwest::Client::builder()
        .user_agent(concat!(env!("CARGO_PKG_NAME"), "/", env!("CARGO_PKG_VERSION")))
        .build()
        .map_err(|e| e.to_string())?;
    match client.get("http://106.13.77.213:9090/latest.json")
        .header("Accept", HeaderValue::from_static("application/json"))
        .send().await
    {
        Ok(resp) => {
            let status = resp.status();
            match resp.bytes().await {
                Ok(body) => {
                    log::warn!("调试2 - HTTP {}, 长度: {}字节", status, body.len());
                    match serde_json::from_slice::<serde_json::Value>(&body) {
                        Ok(val) => log::warn!("调试2 - JSON 解析成功: {}", serde_json::to_string(&val).unwrap_or_default().chars().take(200).collect::<String>()),
                        Err(e) => log::error!("调试2 - JSON 解析失败: {}", e),
                    }
                }
                Err(e) => log::error!("调试2 - 读取响应体失败: {}", e),
            }
        }
        Err(e) => log::error!("调试2 - HTTP 请求失败: {}", e),
    }

    log::warn!("调试 - 当前应用版本: {}", app.config().version.as_deref().unwrap_or("unknown"));

    let update = app.updater().map_err(|e| e.to_string())?.check().await.map_err(|e| e.to_string())?;

    let Some(update) = update else {
        return Ok(None);
    };

    let version = update.version.clone();
    let notes = update.body.clone();

    let bytes = update
        .download(|_chunk, _total| {}, || {})
        .await
        .map_err(|e| e.to_string())?;

    *app
        .state::<Mutex<Option<PendingUpdate>>>()
        .lock()
        .map_err(|e| e.to_string())? = Some(PendingUpdate { update, bytes });

    Ok(Some(UpdateInfo { version, notes }))
}
