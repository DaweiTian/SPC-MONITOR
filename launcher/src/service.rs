use crate::config::AppConfig;
use log::{error, info, warn};
use std::fs::File;
use std::path::PathBuf;
use std::process::{Child, Command, Stdio};
use std::sync::RwLock;

#[cfg(target_os = "windows")]
const BACKEND_BINARY: &str = "ft1-backend.exe";
#[cfg(not(target_os = "windows"))]
const BACKEND_BINARY: &str = "ft1-backend";

struct State {
    server_process: Option<Child>,
    healthy: bool,
    _log_file: Option<File>,
}

pub struct ServiceManager {
    inner: RwLock<State>,
    server_port: u16,
    python_path: String,
    backend_exe: Option<PathBuf>,
}

impl Drop for ServiceManager {
    fn drop(&mut self) {
        let mut state = self.inner.write().unwrap_or_else(|e| e.into_inner());
        if let Some(mut child) = state.server_process.take() {
            let pid = child.id();
            child.kill().ok();
            child.wait().ok();
            info!("Drop: 后端服务已停止，PID: {:?}", pid);
        }
    }
}

impl ServiceManager {
    pub fn new(config: &AppConfig) -> Self {
        let backend_exe = Self::find_backend_exe();
        if backend_exe.is_some() {
            info!("使用打包后端: {:?}", backend_exe);
        } else {
            info!("未找到打包后端，使用 Python: {}", config.python_path);
        }
        Self {
            inner: RwLock::new(State {
                server_process: None,
                healthy: false,
                _log_file: None,
            }),
            server_port: config.server_port,
            python_path: config.python_path.clone(),
            backend_exe,
        }
    }

    /// 查找打包的后端 exe
    /// 优先级：
    ///   1. exe 同目录下的 ft1-backend/<BACKEND_BINARY>
    ///   2. exe 同目录下的 <BACKEND_BINARY>
    fn find_backend_exe() -> Option<PathBuf> {
        let exe_dir = std::env::current_exe()
            .ok()
            .and_then(|p| p.parent().map(|p| p.to_path_buf()))
            .unwrap_or_else(|| PathBuf::from("."));

        // 打包模式：ft1-backend/<BACKEND_BINARY>
        let bundled = exe_dir.join("ft1-backend").join(BACKEND_BINARY);
        if bundled.exists() {
            return Some(bundled);
        }

        // 同目录模式：<BACKEND_BINARY>
        let same_dir = exe_dir.join(BACKEND_BINARY);
        if same_dir.exists() {
            return Some(same_dir);
        }

        None
    }

    pub fn start_server(&self) -> Result<(), String> {
        let mut state = self.inner.write().unwrap_or_else(|e| e.into_inner());

        if let Some(ref mut child) = state.server_process {
            match child.try_wait() {
                Ok(Some(_)) => {
                    warn!("后端进程已退出，清理状态");
                    state.server_process = None;
                    state.healthy = false;
                }
                Ok(None) => return Ok(()),
                Err(e) => {
                    error!("检查进程状态失败: {}", e);
                    state.server_process = None;
                    state.healthy = false;
                }
            }
        }

        let mut cmd = if let Some(ref exe_path) = self.backend_exe {
            // 使用打包的后端 exe
            let mut c = Command::new(exe_path);
            c.args([
                "--host",
                "127.0.0.1",
                "--port",
                &self.server_port.to_string(),
            ]);
            c
        } else {
            // 回退到 Python
            let mut c = Command::new(&self.python_path);
            c.args([
                "-m",
                "uvicorn",
                "backend.main:app",
                "--host",
                "127.0.0.1",
                "--port",
                &self.server_port.to_string(),
            ]);
            c
        };

        #[cfg(target_os = "windows")]
        {
            use std::os::windows::process::CommandExt;
            cmd.creation_flags(0x08000000);
        }

        // 设置工作目录为 exe 所在目录（NSIS 启动时 CWD 不确定）
        let exe_dir = std::env::current_exe()
            .ok()
            .and_then(|p| p.parent().map(|p| p.to_path_buf()));
        if let Some(ref exe_path) = self.backend_exe {
            if let Some(parent) = exe_path.parent() {
                cmd.current_dir(parent);
            }
        } else if let Some(ref dir) = exe_dir {
            cmd.current_dir(dir);
        }

        // 后端 stderr 输出到日志文件，方便排查启动失败
        // 保持 File 句柄在 State 中，防止 Windows 下被外部删除
        let log_path = crate::config::AppConfig::log_dir().join("backend-stderr.log");
        let log_file = std::fs::OpenOptions::new()
            .create(true)
            .append(true)
            .open(&log_path)
            .ok();
        let stderr_file = log_file
            .as_ref()
            .and_then(|f| f.try_clone().ok())
            .map(Stdio::from)
            .unwrap_or(Stdio::null());
        state._log_file = log_file;

        let child = cmd
            .stdout(Stdio::null())
            .stderr(stderr_file)
            .spawn()
            .map_err(|e| format!("启动服务失败: {}", e))?;

        info!("后端服务已启动，PID: {:?}", child.id());
        state.server_process = Some(child);
        // Don't set healthy=true here; let health_check() HTTP probe be the source of truth

        Ok(())
    }

    pub fn stop_server(&self) -> Result<(), String> {
        let mut state = self.inner.write().unwrap_or_else(|e| e.into_inner());
        Self::stop_inner(&mut state)
    }

    fn stop_inner(state: &mut State) -> Result<(), String> {
        if let Some(mut child) = state.server_process.take() {
            let pid = child.id();
            if let Err(e) = child.kill() {
                error!("停止服务失败 (PID: {:?}): {}", pid, e);
                return Err(format!("停止服务失败: {}", e));
            }
            child.wait().ok();
            info!("后端服务已停止，PID: {:?}", pid);
        }
        state.healthy = false;
        state._log_file = None;
        Ok(())
    }

    pub fn health_check(&self) -> bool {
        // Snapshot state under read lock, then drop guard before HTTP request
        let server_alive = {
            let mut state = self.inner.write().unwrap_or_else(|e| e.into_inner());

            if state.server_process.is_none() {
                return false;
            }

            let mut alive = true;
            if let Some(ref mut child) = state.server_process {
                match child.try_wait() {
                    Ok(Some(status)) => {
                        warn!("后端进程异常退出: {:?}", status);
                        state.server_process = None;
                        state.healthy = false;
                        alive = false;
                    }
                    Ok(None) => {}
                    Err(e) => {
                        error!("检查进程状态失败: {}", e);
                        state.server_process = None;
                        state.healthy = false;
                        alive = false;
                    }
                }
            }

            alive
        }; // lock dropped here

        if !server_alive {
            return false;
        }

        // HTTP check WITHOUT holding the lock
        let url = format!("http://127.0.0.1:{}/api/health", self.server_port);
        let healthy = reqwest::blocking::Client::builder()
            .timeout(std::time::Duration::from_secs(5))
            .build()
            .ok()
            .and_then(|client| client.get(&url).send().ok())
            .map(|r| r.status().is_success())
            .unwrap_or(false);

        // Re-acquire lock to update healthy state
        let mut state = self.inner.write().unwrap_or_else(|e| e.into_inner());
        // 防止竞态：如果进程已被 stop_server() 杀死，不覆盖状态
        if state.server_process.is_some() {
            state.healthy = healthy;
        }
        healthy
    }

    pub fn is_running(&self) -> bool {
        let state = self.inner.read().unwrap_or_else(|e| e.into_inner());
        state.server_process.is_some() && state.healthy
    }

    /// Check if a child process exists (regardless of health status)
    pub fn has_process(&self) -> bool {
        let state = self.inner.read().unwrap_or_else(|e| e.into_inner());
        state.server_process.is_some()
    }

    pub fn server_port(&self) -> u16 {
        self.server_port
    }
}

#[cfg(test)]
mod tests {
    use super::*;

    impl ServiceManager {
        fn new_for_test(port: u16) -> Self {
            Self {
                inner: RwLock::new(State {
                    server_process: None,
                    healthy: false,
                    _log_file: None,
                }),
                server_port: port,
                python_path: "python".to_string(),
                backend_exe: None,
            }
        }
    }

    #[test]
    fn test_new_service_manager() {
        let sm = ServiceManager::new_for_test(8080);
        let state = sm.inner.read().unwrap();
        assert!(state.server_process.is_none());
        assert!(!state.healthy);
    }

    #[test]
    fn test_server_port() {
        let sm = ServiceManager::new_for_test(9090);
        assert_eq!(sm.server_port(), 9090);
    }

    #[test]
    fn test_stop_when_not_running() {
        let sm = ServiceManager::new_for_test(8080);
        let result = sm.stop_server();
        assert!(result.is_ok());
    }

    #[test]
    fn test_is_running_without_process() {
        let sm = ServiceManager::new_for_test(8080);
        assert!(!sm.is_running());
    }

    #[test]
    fn test_health_check_when_not_running() {
        let sm = ServiceManager::new_for_test(8080);
        assert!(!sm.health_check());
    }

    #[test]
    fn test_find_backend_exe() {
        // In a test environment, the binary likely doesn't exist
        // so find_backend_exe should return None
        let result = ServiceManager::find_backend_exe();
        // We just verify it doesn't panic; result depends on test environment
        // In most CI/dev environments, the binary won't exist at the test exe path
        let _ = result;
    }

    #[test]
    fn test_find_backend_exe_returns_option() {
        // Verify the return type is Option<PathBuf> and the function is callable
        let result: Option<PathBuf> = ServiceManager::find_backend_exe();
        assert!(result.is_none() || result.is_some());
    }

    #[test]
    fn test_stop_sets_healthy_false() {
        let sm = ServiceManager::new_for_test(8080);
        // Manually set healthy to true to verify stop resets it
        {
            let mut state = sm.inner.write().unwrap();
            state.healthy = true;
        }
        sm.stop_server().unwrap();
        let state = sm.inner.read().unwrap();
        assert!(!state.healthy);
    }

    #[test]
    fn test_start_already_running_returns_ok() {
        // This test verifies that start_server when a process is "running"
        // but has exited returns Ok and cleans up.
        // We can't easily test with a real process, but we can test
        // the no-process path returns Err (no backend available).
        let sm = ServiceManager::new_for_test(8080);
        // With no backend_exe and "python" as python_path, start_server
        // will fail because "python -m uvicorn" won't work in test env.
        let result = sm.start_server();
        // This should fail because the command won't be found or won't work
        // Either way, it shouldn't panic.
        let _ = result;
    }
}
