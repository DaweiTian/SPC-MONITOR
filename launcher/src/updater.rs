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
/// `expected_version`：前端确认过的版本号；服务器版本不一致时拒绝下载，避免 TOCTOU
#[tauri::command(async)]
pub async fn download_update(
    app: AppHandle,
    expected_version: Option<String>,
) -> Result<UpdateInfo, String> {
    // 已下载过且版本匹配则直接复用，避免重复下载
    {
        let state = app.state::<Mutex<Option<PendingUpdate>>>();
        let guard = state.lock().map_err(|e| e.to_string())?;
        if let Some(p) = guard.as_ref() {
            let pending_ver = p.update.version.clone();
            let notes = p.update.body.clone();
            let matches = expected_version
                .as_ref()
                .map(|e| e == &pending_ver)
                .unwrap_or(true);
            if matches {
                return Ok(UpdateInfo {
                    version: pending_ver,
                    notes,
                });
            }
        }
    }

    let update = app
        .updater().map_err(|e| e.to_string())?
        .check()
        .await
        .map_err(|e| e.to_string())?
        .ok_or("没有可用的更新")?;

    if let Some(expected) = &expected_version {
        if &update.version != expected {
            return Err(format!(
                "服务器版本已变化（期望 {}，实际 {}），请重新检查更新",
                expected, update.version
            ));
        }
    }

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
    // 先取出待装包，确认存在后再停后端，避免“停了却没得装”
    let pending = app
        .state::<Mutex<Option<PendingUpdate>>>()
        .lock()
        .map_err(|e| e.to_string())?
        .take();

    let p = pending.ok_or("没有已下载的更新")?;

    // install() 内部会 process::exit，需先停后端（绕过 Drop）
    if let Some(sm) = app.try_state::<std::sync::Arc<crate::service::ServiceManager>>() {
        let _ = sm.stop_server();
    }

    match p.update.install(p.bytes) {
        Ok(()) => Ok(()),
        Err(e) => {
            // 安装失败则尽量把后端拉回来，避免应用处于“无后端”状态
            if let Some(sm) = app.try_state::<std::sync::Arc<crate::service::ServiceManager>>() {
                let _ = sm.start_server();
            }
            Err(e.to_string())
        }
    }
}

/// 启动后台定时检查任务（每 3 天一次，首次延迟 60 秒）
pub fn spawn_periodic_check(app: AppHandle) {
    tauri::async_runtime::spawn(async move {
        log::info!("更新检查任务已启动，60 秒后首次检查");
        tokio::time::sleep(Duration::from_secs(60)).await;

        loop {
            match try_check_and_download(&app).await {
                Ok(Some(info)) => {
                    log::info!("发现新版本 {}，已静默下载", info.version);
                    app.emit("update-ready", &info).ok();
                }
                Ok(None) => {
                    log::info!("当前已是最新版本");
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

    // 后台任务与手动下载共享 PendingUpdate：同版本已就绪则不重复下载/弹窗
    {
        let state = app.state::<Mutex<Option<PendingUpdate>>>();
        let guard = state.lock().map_err(|e| e.to_string())?;
        if let Some(p) = guard.as_ref() {
            if p.update.version == version {
                log::info!("版本 {} 已下载过，跳过", version);
                return Ok(None);
            }
        }
    }

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
