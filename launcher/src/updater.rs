use serde::{Deserialize, Serialize};
use sha2::{Digest, Sha256};
use std::collections::HashMap;
use std::io::{Read, Write};
use std::path::{Component, Path, PathBuf};
use std::sync::atomic::{AtomicBool, Ordering};
use std::sync::Mutex;
use std::time::Duration;
use tauri::{AppHandle, Emitter, Manager};
use tauri_plugin_updater::UpdaterExt;

/// 增量安装进行中：健康检查线程不得自动拉起后端
static UPDATE_MAINTENANCE: AtomicBool = AtomicBool::new(false);
/// 防止手动/后台并发下载互相覆盖
static DOWNLOAD_IN_FLIGHT: AtomicBool = AtomicBool::new(false);

pub fn update_in_progress() -> bool {
    UPDATE_MAINTENANCE.load(Ordering::SeqCst)
}

#[derive(Clone, Serialize)]
pub struct UpdateInfo {
    pub version: String,
    pub notes: Option<String>,
    /// true = 增量包已下载；false = 全量安装包已下载
    #[serde(rename = "isIncremental")]
    pub is_incremental: bool,
    /// 增量包下载大小（字节），仅增量时有值
    #[serde(rename = "downloadSize")]
    pub download_size: Option<u64>,
}

#[derive(Debug, Clone, Deserialize)]
struct LatestManifest {
    version: String,
    notes: Option<String>,
    platforms: HashMap<String, PlatformEntry>,
}

#[derive(Debug, Clone, Deserialize)]
struct PlatformEntry {
    #[allow(dead_code)]
    url: String,
    patch: Option<PatchMeta>,
}

#[derive(Debug, Clone, Deserialize)]
struct PatchMeta {
    from_versions: Vec<String>,
    url: String,
    sha256: String,
    size: u64,
}

/// 暂存的更新：增量 zip 或全量 Tauri 更新
pub enum PendingUpdate {
    Patch {
        version: String,
        notes: Option<String>,
        zip_path: PathBuf,
        size: u64,
        /// 下载时校验过的 zip 摘要，安装前复验，防暂存文件被替换
        sha256: String,
    },
    Full {
        update: tauri_plugin_updater::Update,
        bytes: Vec<u8>,
    },
}

fn platform_key() -> &'static str {
    if cfg!(all(target_os = "windows", target_arch = "x86_64")) {
        "windows-x86_64"
    } else if cfg!(all(target_os = "windows", target_arch = "aarch64")) {
        "windows-aarch64"
    } else if cfg!(all(target_os = "macos", target_arch = "x86_64")) {
        "darwin-x86_64"
    } else if cfg!(all(target_os = "macos", target_arch = "aarch64")) {
        "darwin-aarch64"
    } else if cfg!(target_os = "linux") {
        "linux-x86_64"
    } else {
        "unknown"
    }
}

fn install_root() -> PathBuf {
    std::env::current_exe()
        .ok()
        .and_then(|p| p.parent().map(|p| p.to_path_buf()))
        .unwrap_or_else(|| PathBuf::from("."))
}

fn staging_dir() -> Result<PathBuf, String> {
    let dir = dirs::data_local_dir()
        .unwrap_or_else(|| PathBuf::from("."))
        .join("ft1-monitor")
        .join("update-staging");
    std::fs::create_dir_all(&dir).map_err(|e| format!("创建暂存目录失败: {e}"))?;
    Ok(dir)
}

/// 相对路径是否安全（拒绝绝对路径、盘符前缀、`..`、盘符相对路径）
fn is_safe_rel_path(rel: &str) -> bool {
    if rel.is_empty() || rel.contains('\0') {
        return false;
    }
    if rel.split(['/', '\\']).any(|s| s == "..") {
        return false;
    }
    let p = Path::new(rel);
    if p.is_absolute() || p.has_root() {
        return false;
    }
    for c in p.components() {
        match c {
            Component::Normal(_) | Component::CurDir => {}
            // ParentDir / RootDir / Prefix（含 C:）一律拒绝
            _ => return false,
        }
    }
    true
}

/// 运行时数据保护：SQLite / 日志不得被增量包覆盖
fn is_protected_runtime_path(rel: &str) -> bool {
    let lower = rel.replace('\\', "/").to_ascii_lowercase();
    const EXT: [&str; 4] = [".db", ".db-journal", ".db-wal", ".db-shm"];
    if EXT.iter().any(|e| lower.ends_with(e)) {
        return true;
    }
    lower.contains("/logs/") || lower.starts_with("logs/")
}

fn resolve_under_root(root: &Path, rel: &str) -> Result<PathBuf, String> {
    if !is_safe_rel_path(rel) {
        return Err(format!("非法相对路径: {rel}"));
    }
    let dest = root.join(rel.replace('/', std::path::MAIN_SEPARATOR_STR));
    // 词法校验：拼接结果必须仍在 root 之下（防 Windows 盘符/UNC 技巧）
    let dest_s = dest.to_string_lossy().replace('/', "\\");
    let root_s = root.to_string_lossy().replace('/', "\\");
    let root_trim = root_s.trim_end_matches('\\');
    if !(dest_s.eq_ignore_ascii_case(root_trim)
        || dest_s
            .to_ascii_lowercase()
            .starts_with(&(root_trim.to_ascii_lowercase() + "\\")))
    {
        return Err(format!("路径越界: {rel}"));
    }
    Ok(dest)
}

fn updater_endpoints() -> Vec<String> {
    // 与 tauri.conf.json 保持单一来源
    const CONF: &str = include_str!("../tauri.conf.json");
    serde_json::from_str::<serde_json::Value>(CONF)
        .ok()
        .and_then(|v| {
            v.get("plugins")?
                .get("updater")?
                .get("endpoints")?
                .as_array()
                .map(|arr| {
                    arr.iter()
                        .filter_map(|x| x.as_str().map(|s| s.to_string()))
                        .collect::<Vec<_>>()
                })
        })
        .unwrap_or_default()
}

async fn fetch_latest(_app: &AppHandle) -> Result<LatestManifest, String> {
    let endpoints = updater_endpoints();
    if endpoints.is_empty() {
        return Err("未配置更新端点".into());
    }

    let client = reqwest::Client::builder()
        .timeout(Duration::from_secs(30))
        .build()
        .map_err(|e| e.to_string())?;

    let mut last_err = String::new();
    for ep in &endpoints {
        match client.get(ep).send().await {
            Ok(resp) if resp.status().is_success() => {
                let text = resp.text().await.map_err(|e| e.to_string())?;
                return serde_json::from_str(&text).map_err(|e| format!("解析 latest.json 失败: {e}"));
            }
            Ok(resp) => {
                last_err = format!("HTTP {}", resp.status());
            }
            Err(e) => {
                last_err = e.to_string();
            }
        }
    }
    Err(format!("检查更新失败: {last_err}"))
}

/// 前端调用：检查是否有可用更新
#[tauri::command(async)]
pub async fn check_for_update(app: AppHandle) -> Result<Option<UpdateInfo>, String> {
    let current = app.package_info().version.to_string();
    let latest = match fetch_latest(&app).await {
        Ok(l) => l,
        Err(e) => {
            // 回退到 tauri 官方检查（无 patch 信息）
            log::warn!("自定义 latest.json 检查失败，回退官方 updater: {e}");
            let update = app
                .updater()
                .map_err(|err| err.to_string())?
                .check()
                .await
                .map_err(|err| err.to_string())?;
            return Ok(update.map(|u| UpdateInfo {
                version: u.version.clone(),
                notes: u.body.clone(),
                is_incremental: false,
                download_size: None,
            }));
        }
    };

    if latest.version == current {
        return Ok(None);
    }

    // 简单版本比较：不相等且服务器侧更新才提示
    if !is_newer_version(&latest.version, &current) {
        return Ok(None);
    }

    let plat = latest.platforms.get(platform_key());
    let patch_available = plat
        .and_then(|p| p.patch.as_ref())
        .map(|p| p.from_versions.contains(&current))
        .unwrap_or(false);
    let patch_size = plat
        .and_then(|p| p.patch.as_ref())
        .filter(|p| p.from_versions.contains(&current))
        .map(|p| p.size);

    Ok(Some(UpdateInfo {
        version: latest.version,
        notes: latest.notes,
        is_incremental: patch_available,
        download_size: patch_size,
    }))
}

fn is_newer_version(new: &str, old: &str) -> bool {
    let parse = |s: &str| -> Vec<u64> {
        s.split('.')
            .filter_map(|x| x.parse::<u64>().ok())
            .collect()
    };
    let a = parse(new);
    let b = parse(old);
    for i in 0..a.len().max(b.len()) {
        let x = a.get(i).copied().unwrap_or(0);
        let y = b.get(i).copied().unwrap_or(0);
        if x != y {
            return x > y;
        }
    }
    false
}

fn sha256_file(path: &Path) -> Result<String, String> {
    let mut file = std::fs::File::open(path).map_err(|e| format!("打开文件失败: {e}"))?;
    let mut hasher = Sha256::new();
    let mut buf = [0u8; 1024 * 256];
    loop {
        let n = file.read(&mut buf).map_err(|e| format!("读取文件失败: {e}"))?;
        if n == 0 {
            break;
        }
        hasher.update(&buf[..n]);
    }
    Ok(hex::encode(hasher.finalize()))
}

/// 前端调用：静默下载更新并暂存，供后续安装
/// `expected_version`：前端确认过的版本号；服务器版本不一致时拒绝下载，避免 TOCTOU
#[tauri::command(async)]
pub async fn download_update(
    app: AppHandle,
    expected_version: Option<String>,
) -> Result<UpdateInfo, String> {
    // 防并发：手动下载与后台任务共享 PendingUpdate
    if DOWNLOAD_IN_FLIGHT
        .compare_exchange(false, true, Ordering::SeqCst, Ordering::SeqCst)
        .is_err()
    {
        return Err("已有更新正在下载，请稍候".into());
    }
    struct DownloadGuard;
    impl Drop for DownloadGuard {
        fn drop(&mut self) {
            DOWNLOAD_IN_FLIGHT.store(false, Ordering::SeqCst);
        }
    }
    let _guard = DownloadGuard;

    let current = app.package_info().version.to_string();

    // 已下载过且版本匹配则直接复用
    {
        let state = app.state::<Mutex<Option<PendingUpdate>>>();
        let guard = state.lock().map_err(|e| e.to_string())?;
        if let Some(p) = guard.as_ref() {
            let (ver, notes, incr, size) = match p {
                PendingUpdate::Patch {
                    version,
                    notes,
                    size,
                    ..
                } => (version.clone(), notes.clone(), true, Some(*size)),
                PendingUpdate::Full { update, .. } => {
                    (update.version.clone(), update.body.clone(), false, None)
                }
            };
            let matches = expected_version
                .as_ref()
                .map(|e| e == &ver)
                .unwrap_or(true);
            if matches {
                return Ok(UpdateInfo {
                    version: ver,
                    notes,
                    is_incremental: incr,
                    download_size: size,
                });
            }
        }
    }

    // 优先增量
    if let Ok(latest) = fetch_latest(&app).await {
        if let Some(expected) = &expected_version {
            if &latest.version != expected {
                return Err(format!(
                    "服务器版本已变化（期望 {}，实际 {}），请重新检查更新",
                    expected, latest.version
                ));
            }
        }

        if let Some(plat) = latest.platforms.get(platform_key()) {
            if let Some(patch) = &plat.patch {
                if patch.from_versions.contains(&current) {
                    match download_patch(app.clone(), &latest, patch).await {
                        Ok(info) => return Ok(info),
                        Err(e) => {
                            log::warn!("增量包下载失败，回退全量: {e}");
                        }
                    }
                }
            }
        }
    }

    // 回退：Tauri 全量
    download_full(app, expected_version).await
}

async fn download_patch(
    app: AppHandle,
    latest: &LatestManifest,
    patch: &PatchMeta,
) -> Result<UpdateInfo, String> {
    let staging = staging_dir()?;
    let file_name = patch
        .url
        .rsplit('/')
        .next()
        .filter(|s| !s.is_empty())
        .unwrap_or("update-patch.zip");
    // 路径清洗，防止目录穿越
    let safe_name: String = file_name
        .chars()
        .filter(|c| c.is_alphanumeric() || *c == '.' || *c == '-' || *c == '_')
        .collect();
    if safe_name.is_empty() {
        return Err("增量包文件名无效".into());
    }
    let zip_path = staging.join(safe_name);

    // patch.url 必须与更新端点同源，拒绝清单被篡改后指向任意外域
    if let Some(endpoints) = updater_endpoints().into_iter().next() {
        if let (Some(ep_origin), Some(url_origin)) = (
            origin_of(&endpoints),
            origin_of(&patch.url),
        ) {
            if !ep_origin.eq_ignore_ascii_case(&url_origin) {
                return Err(format!(
                    "增量包域名与更新端点不一致，已拒绝: {url_origin}"
                ));
            }
        }
    }

    let client = reqwest::Client::builder()
        .timeout(Duration::from_secs(600))
        .build()
        .map_err(|e| e.to_string())?;
    let mut resp = client
        .get(&patch.url)
        .send()
        .await
        .map_err(|e| format!("下载增量包失败: {e}"))?;
    if !resp.status().is_success() {
        return Err(format!("增量包 HTTP {}", resp.status()));
    }

    // 流式落盘 + 增量哈希，避免整包驻留内存
    let mut file = std::fs::File::create(&zip_path).map_err(|e| format!("创建增量包文件失败: {e}"))?;
    let mut hasher = Sha256::new();
    let mut total: u64 = 0;
    while let Some(chunk) = resp.chunk().await.map_err(|e| e.to_string())? {
        total += chunk.len() as u64;
        if patch.size > 0 && total > patch.size {
            let _ = std::fs::remove_file(&zip_path);
            return Err(format!(
                "增量包超出声明大小（期望 {}，已收 {}）",
                patch.size, total
            ));
        }
        hasher.update(&chunk);
        file.write_all(&chunk)
            .map_err(|e| format!("写入增量包失败: {e}"))?;
    }
    file.flush().map_err(|e| format!("刷新增量包失败: {e}"))?;
    drop(file);

    if patch.size > 0 && total != patch.size {
        let _ = std::fs::remove_file(&zip_path);
        return Err(format!(
            "增量包大小不符（期望 {}，实际 {}）",
            patch.size, total
        ));
    }

    let digest = hex::encode(hasher.finalize());
    if !digest.eq_ignore_ascii_case(&patch.sha256) {
        let _ = std::fs::remove_file(&zip_path);
        return Err("增量包 SHA256 校验失败".into());
    }

    *app
        .state::<Mutex<Option<PendingUpdate>>>()
        .lock()
        .map_err(|e| e.to_string())? = Some(PendingUpdate::Patch {
        version: latest.version.clone(),
        notes: latest.notes.clone(),
        zip_path,
        size: total,
        sha256: digest,
    });

    Ok(UpdateInfo {
        version: latest.version.clone(),
        notes: latest.notes.clone(),
        is_incremental: true,
        download_size: Some(total),
    })
}

fn origin_of(url: &str) -> Option<String> {
    // 取 scheme://host[:port]
    let after_scheme = url.split_once("://")?.1;
    let host_port = after_scheme
        .split(['/', '?', '#'])
        .next()
        .filter(|s| !s.is_empty())?;
    let scheme = url.split("://").next().unwrap_or("http");
    Some(format!("{scheme}://{host_port}").to_ascii_lowercase())
}

async fn download_full(
    app: AppHandle,
    expected_version: Option<String>,
) -> Result<UpdateInfo, String> {
    let update = app
        .updater()
        .map_err(|e| e.to_string())?
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
        .map_err(|e| e.to_string())? = Some(PendingUpdate::Full { update, bytes });

    Ok(UpdateInfo {
        version,
        notes,
        is_incremental: false,
        download_size: None,
    })
}

/// 前端调用：安装已下载的更新（增量热替换 / 全量安装，最终会退出应用）
#[tauri::command(async)]
pub async fn install_update(app: AppHandle) -> Result<(), String> {
    let taken = app
        .state::<Mutex<Option<PendingUpdate>>>()
        .lock()
        .map_err(|e| e.to_string())?
        .take();

    let Some(p) = taken else {
        return Err("没有已下载的更新".into());
    };

    // 进入维护模式，阻止健康检查线程在覆盖期间自动拉起后端
    UPDATE_MAINTENANCE.store(true, Ordering::SeqCst);

    // 先停后端，避免文件锁
    if let Some(sm) = app.try_state::<std::sync::Arc<crate::service::ServiceManager>>() {
        if let Err(e) = sm.stop_server() {
            log::warn!("停止后端失败（继续尝试更新）: {e}");
        }
    }

    match p {
        PendingUpdate::Patch {
            version,
            notes,
            zip_path,
            size,
            sha256,
        } => {
            let zip_for_apply = zip_path.clone();
            let hash_for_apply = sha256.clone();
            let apply = tauri::async_runtime::spawn_blocking(move || {
                apply_patch(&zip_for_apply, &hash_for_apply)
            })
            .await;
            let result = match apply {
                Ok(inner) => inner,
                Err(e) => Err(format!("更新任务异常: {e}")),
            };
            match result {
                Ok(exe_path) => {
                    log::warn!("增量更新已应用，正在重启: {}", exe_path.display());
                    if let Err(e) = std::process::Command::new(&exe_path).spawn() {
                        log::error!("启动新版本失败: {e}");
                        UPDATE_MAINTENANCE.store(false, Ordering::SeqCst);
                        if zip_path.exists() {
                            *app.state::<Mutex<Option<PendingUpdate>>>()
                                .lock()
                                .map_err(|err| err.to_string())? = Some(PendingUpdate::Patch {
                                version,
                                notes,
                                zip_path,
                                size,
                                sha256,
                            });
                        }
                        if let Some(sm) =
                            app.try_state::<std::sync::Arc<crate::service::ServiceManager>>()
                        {
                            let _ = sm.start_server();
                        }
                        return Err(format!("更新已应用但启动失败: {e}"));
                    }
                    // 给子进程一点时间完成创建
                    std::thread::sleep(Duration::from_millis(500));
                    app.exit(0);
                    Ok(())
                }
                Err(e) => {
                    UPDATE_MAINTENANCE.store(false, Ordering::SeqCst);
                    // zip 仍在则放回，便于用户重试
                    if zip_path.exists() {
                        *app.state::<Mutex<Option<PendingUpdate>>>()
                            .lock()
                            .map_err(|err| err.to_string())? = Some(PendingUpdate::Patch {
                            version,
                            notes,
                            zip_path,
                            size,
                            sha256,
                        });
                    }
                    if let Some(sm) = app.try_state::<std::sync::Arc<crate::service::ServiceManager>>()
                    {
                        let _ = sm.start_server();
                    }
                    Err(e)
                }
            }
        }
        PendingUpdate::Full { update, bytes } => match update.install(bytes) {
            Ok(()) => {
                UPDATE_MAINTENANCE.store(false, Ordering::SeqCst);
                Ok(())
            }
            Err(e) => {
                UPDATE_MAINTENANCE.store(false, Ordering::SeqCst);
                if let Some(sm) = app.try_state::<std::sync::Arc<crate::service::ServiceManager>>() {
                    let _ = sm.start_server();
                }
                Err(e.to_string())
            }
        },
    }
}

#[derive(Debug, Deserialize)]
struct PatchFileEntry {
    sha256: String,
    #[allow(dead_code)]
    size: u64,
}

#[derive(Debug, Deserialize)]
struct PatchManifest {
    #[allow(dead_code)]
    version: String,
    #[serde(default)]
    deleted: Vec<String>,
    files: HashMap<String, PatchFileEntry>,
}

/// 解压增量包并覆盖安装目录；返回应启动的主程序路径
/// `expected_zip_sha256`：下载阶段校验过的 zip 摘要，安装前复验
fn apply_patch(zip_path: &Path, expected_zip_sha256: &str) -> Result<PathBuf, String> {
    // 安装前复验暂存 zip，防 TOCTOU 替换
    let actual = sha256_file(zip_path)?;
    if !actual.eq_ignore_ascii_case(expected_zip_sha256) {
        return Err("增量包在暂存后被修改，已拒绝安装".into());
    }

    let root = install_root();
    let staging = staging_dir()?.join("extract");
    if staging.exists() {
        let _ = std::fs::remove_dir_all(&staging);
    }
    std::fs::create_dir_all(&staging).map_err(|e| e.to_string())?;

    // 解压到暂存
    {
        let file = std::fs::File::open(zip_path).map_err(|e| format!("打开增量包失败: {e}"))?;
        let mut archive =
            zip::ZipArchive::new(file).map_err(|e| format!("增量包格式无效: {e}"))?;
        for i in 0..archive.len() {
            let mut entry = archive.by_index(i).map_err(|e| e.to_string())?;
            let Some(rel) = entry.enclosed_name().map(|p| p.to_path_buf()) else {
                continue; // 跳过不安全路径
            };
            let out_path = staging.join(&rel);
            if entry.is_dir() {
                std::fs::create_dir_all(&out_path).map_err(|e| e.to_string())?;
                continue;
            }
            if let Some(parent) = out_path.parent() {
                std::fs::create_dir_all(parent).map_err(|e| e.to_string())?;
            }
            let mut outfile =
                std::fs::File::create(&out_path).map_err(|e| e.to_string())?;
            std::io::copy(&mut entry, &mut outfile).map_err(|e| e.to_string())?;
        }
    }

    // 读取清单
    let manifest_path = staging.join("patch.json");
    let manifest_raw =
        std::fs::read_to_string(&manifest_path).map_err(|e| format!("读取 patch.json 失败: {e}"))?;
    let manifest: PatchManifest =
        serde_json::from_str(&manifest_raw).map_err(|e| format!("解析 patch.json 失败: {e}"))?;

    // 校验 zip 内每个文件哈希
    for (rel, meta) in &manifest.files {
        if !is_safe_rel_path(rel) {
            return Err(format!("清单含非法路径: {rel}"));
        }
        let src = staging.join(rel.replace('/', std::path::MAIN_SEPARATOR_STR));
        if !src.exists() {
            return Err(format!("增量包缺少文件: {rel}"));
        }
        let digest = sha256_file(&src)?;
        if !digest.eq_ignore_ascii_case(&meta.sha256) {
            return Err(format!("文件校验失败: {rel}"));
        }
    }

    let current_exe = std::env::current_exe().map_err(|e| e.to_string())?;
    let mut launch_exe: Option<PathBuf> = None;

    // 删除已移除文件（忽略失败，运行中文件可能占用）
    for rel in &manifest.deleted {
        if !is_safe_rel_path(rel) || is_protected_runtime_path(rel) {
            continue;
        }
        let Ok(target) = resolve_under_root(&root, rel) else {
            continue;
        };
        let _ = std::fs::remove_file(&target);
    }

    // 覆盖文件
    for rel in manifest.files.keys() {
        if rel == "patch.json" {
            continue;
        }
        if is_protected_runtime_path(rel) {
            log::info!("跳过运行时数据（不覆盖用户文件）: {rel}");
            continue;
        }
        let dest = resolve_under_root(&root, rel)?;
        let src = staging.join(rel.replace('/', std::path::MAIN_SEPARATOR_STR));

        if let Some(parent) = dest.parent() {
            std::fs::create_dir_all(parent).map_err(|e| e.to_string())?;
        }

        let dest_is_running = dest
            .canonicalize()
            .ok()
            .zip(current_exe.canonicalize().ok())
            .map(|(a, b)| a == b)
            .unwrap_or_else(|| {
                dest.file_name() == current_exe.file_name()
                    && dest.parent() == current_exe.parent()
            });

        if dest_is_running {
            // Windows 允许重命名正在运行的 exe
            let old = dest.with_extension("exe.old");
            if old.exists() {
                let _ = std::fs::remove_file(&old);
            }
            if dest.exists() {
                std::fs::rename(&dest, &old).map_err(|e| format!("重命名运行中程序失败: {e}"))?;
            }
            if let Err(e) = std::fs::copy(&src, &dest) {
                // 复制失败必须把旧 exe 放回，避免安装目录没有可启动主程序
                if old.exists() {
                    let _ = std::fs::rename(&old, &dest);
                }
                return Err(format!("写入新程序失败（已尝试恢复旧版）: {e}"));
            }
            launch_exe = Some(dest.clone());
        } else {
            // 非当前 exe：直接覆盖
            if dest.exists() {
                let _ = std::fs::remove_file(&dest);
            }
            std::fs::copy(&src, &dest).map_err(|e| format!("覆盖文件失败 {rel}: {e}"))?;
            // 若清单包含主程序但路径判断未命中，记录候选
            if launch_exe.is_none() {
                if let Some(name) = dest.file_name() {
                    let n = name.to_string_lossy();
                    if n.ends_with(".exe") && !n.contains("ft1-backend") && n != "python.exe" {
                        // 仅当目标与当前 exe 同目录且名称类似主程序
                        if dest.parent() == current_exe.parent() {
                            launch_exe = Some(dest.clone());
                        }
                    }
                }
            }
        }
    }

    let launch = launch_exe.unwrap_or(current_exe);

    // 清理暂存
    let _ = std::fs::remove_dir_all(&staging);
    let _ = std::fs::remove_file(zip_path);

    Ok(launch)
}

/// 启动后台定时检查任务（每 3 天一次，首次延迟 60 秒）
pub fn spawn_periodic_check(app: AppHandle) {
    tauri::async_runtime::spawn(async move {
        log::info!("更新检查任务已启动，60 秒后首次检查");
        tokio::time::sleep(Duration::from_secs(60)).await;

        loop {
            match try_check_and_download(&app).await {
                Ok(Some(info)) => {
                    log::info!(
                        "发现新版本 {}（{}），已静默下载",
                        info.version,
                        if info.is_incremental { "增量" } else { "全量" }
                    );
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
    let info = match check_for_update(app.clone()).await {
        Ok(Some(i)) => i,
        Ok(None) => return Ok(None),
        Err(e) => return Err(e),
    };

    // 后台任务与手动下载共享 PendingUpdate：同版本已就绪则不重复下载/弹窗
    {
        let state = app.state::<Mutex<Option<PendingUpdate>>>();
        let guard = state.lock().map_err(|e| e.to_string())?;
        if let Some(p) = guard.as_ref() {
            let ver = match p {
                PendingUpdate::Patch { version, .. } => version.clone(),
                PendingUpdate::Full { update, .. } => update.version.clone(),
            };
            if ver == info.version {
                log::info!("版本 {} 已下载过，跳过", info.version);
                return Ok(None);
            }
        }
    }

    let downloaded = download_update(app.clone(), Some(info.version.clone())).await?;
    Ok(Some(downloaded))
}

#[cfg(test)]
mod tests {
    use super::*;

    #[test]
    fn path_traversal_rejected() {
        assert!(!is_safe_rel_path("../evil.exe"));
        assert!(!is_safe_rel_path("ft1-backend/../../evil.exe"));
        assert!(!is_safe_rel_path("..\\evil.exe"));
        assert!(!is_safe_rel_path("C:/Windows/System32/evil.dll"));
        assert!(!is_safe_rel_path("C:\\Windows\\System32\\evil.dll"));
        assert!(!is_safe_rel_path("/abs/evil.dll"));
        assert!(!is_safe_rel_path("\\\\server\\share\\evil"));
        assert!(!is_safe_rel_path(""));
    }

    #[test]
    fn normal_rel_paths_accepted() {
        assert!(is_safe_rel_path("ft1-backend/ft1-backend.exe"));
        assert!(is_safe_rel_path("过程SPC监控平台.exe"));
        assert!(is_safe_rel_path("./ft1-backend/data/frontend/index.html"));
    }

    #[test]
    fn runtime_db_protected() {
        assert!(is_protected_runtime_path("ft1-backend/data/monitor.db"));
        assert!(is_protected_runtime_path("ft1-backend\\data\\monitor.db"));
        assert!(is_protected_runtime_path("ft1-backend/logs/app.log"));
        assert!(!is_protected_runtime_path("ft1-backend/ft1-backend.exe"));
        assert!(!is_protected_runtime_path("ft1-backend/conf/db_mapping.json"));
    }

    #[test]
    fn resolve_stays_under_root() {
        let root = PathBuf::from("C:\\App\\过程SPC监控平台");
        let ok = resolve_under_root(&root, "ft1-backend/a.dll").unwrap();
        assert!(ok.starts_with(&root));
        assert!(resolve_under_root(&root, "../outside.exe").is_err());
        assert!(resolve_under_root(&root, "C:/Windows/evil.dll").is_err());
    }

    #[test]
    fn version_compare_numeric() {
        assert!(is_newer_version("1.7.6", "1.7.5"));
        assert!(is_newer_version("1.8.0", "1.7.9"));
        assert!(!is_newer_version("1.7.5", "1.7.5"));
        assert!(!is_newer_version("1.7.4", "1.7.5"));
        assert!(is_newer_version("2.0", "1.9.9"));
    }

    #[test]
    fn origin_check_helper() {
        assert_eq!(
            origin_of("http://106.13.77.213:9090/latest.json"),
            Some("http://106.13.77.213:9090".to_string())
        );
        assert_eq!(
            origin_of("http://106.13.77.213:9090/patch.zip"),
            origin_of("http://106.13.77.213:9090/latest.json")
        );
        assert_ne!(
            origin_of("http://evil.example/patch.zip"),
            origin_of("http://106.13.77.213:9090/latest.json")
        );
    }
}
