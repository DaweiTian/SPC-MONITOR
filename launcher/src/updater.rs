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
        tokio::time::sleep(Duration::from_secs(60)).await;

        loop {
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
