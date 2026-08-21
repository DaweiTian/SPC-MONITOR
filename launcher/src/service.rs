use crate::config::AppConfig;
use log::{error, info, warn};
use std::path::PathBuf;
use std::process::{Child, Command, Stdio};
use std::sync::Mutex;

struct State {
    server_process: Option<Child>,
    is_running: bool,
}

pub struct ServiceManager {
    inner: Mutex<State>,
    server_port: u16,
    python_path: String,
    backend_exe: Option<PathBuf>,
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
            inner: Mutex::new(State {
                server_process: None,
                is_running: false,
            }),
            server_port: config.server_port,
            python_path: config.python_path.clone(),
            backend_exe,
        }
    }

    /// 查找打包的后端 exe
    /// 优先级：
    ///   1. exe 同目录下的 ft1-backend/ft1-backend.exe
    ///   2. exe 同目录下的 ft1-backend.exe
    fn find_backend_exe() -> Option<PathBuf> {
        let exe_dir = std::env::current_exe()
            .ok()
            .and_then(|p| p.parent().map(|p| p.to_path_buf()))
            .unwrap_or_else(|| PathBuf::from("."));

        // 打包模式：ft1-backend/ft1-backend.exe
        let bundled = exe_dir.join("ft1-backend").join("ft1-backend.exe");
        if bundled.exists() {
            return Some(bundled);
        }

        // 同目录模式：ft1-backend.exe
        let same_dir = exe_dir.join("ft1-backend.exe");
        if same_dir.exists() {
            return Some(same_dir);
        }

        None
    }

    pub fn start_server(&self) -> Result<(), String> {
        let mut state = self.inner.lock().unwrap();

        if let Some(ref mut child) = state.server_process {
            match child.try_wait() {
                Ok(Some(_)) => {
                    warn!("后端进程已退出，清理状态");
                    state.server_process = None;
                    state.is_running = false;
                }
                Ok(None) => return Ok(()),
                Err(e) => {
                    error!("检查进程状态失败: {}", e);
                    state.server_process = None;
                    state.is_running = false;
                }
            }
        }

        let mut cmd = if let Some(ref exe_path) = self.backend_exe {
            // 使用打包的后端 exe
            let mut c = Command::new(exe_path);
            c.args(["--host", "127.0.0.1", "--port", &self.server_port.to_string()]);
            c
        } else {
            // 回退到 Python
            let mut c = Command::new(&self.python_path);
            c.args([
                "-m", "uvicorn", "backend.main:app",
                "--host", "127.0.0.1",
                "--port", &self.server_port.to_string(),
            ]);
            c
        };

        #[cfg(target_os = "windows")]
        {
            use std::os::windows::process::CommandExt;
            cmd.creation_flags(0x08000000);
        }

        let child = cmd
            .stdout(Stdio::piped())
            .stderr(Stdio::piped())
            .spawn()
            .map_err(|e| format!("启动服务失败: {}", e))?;

        info!("后端服务已启动，PID: {:?}", child.id());
        state.server_process = Some(child);
        state.is_running = true;

        Ok(())
    }

    pub fn stop_server(&self) -> Result<(), String> {
        let mut state = self.inner.lock().unwrap();
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
        state.is_running = false;
        Ok(())
    }

    pub fn health_check(&self) -> bool {
        // Snapshot state under lock, then drop guard before HTTP request
        let (is_running, server_alive) = {
            let mut state = self.inner.lock().unwrap();

            if !state.is_running {
                return false;
            }

            let mut alive = true;
            if let Some(ref mut child) = state.server_process {
                match child.try_wait() {
                    Ok(Some(status)) => {
                        warn!("后端进程异常退出: {:?}", status);
                        state.server_process = None;
                        state.is_running = false;
                        alive = false;
                    }
                    Ok(None) => {}
                    Err(e) => {
                        error!("检查进程状态失败: {}", e);
                        state.server_process = None;
                        state.is_running = false;
                        alive = false;
                    }
                }
            }

            if !alive {
                return false;
            }

            (state.is_running, alive)
        }; // lock dropped here

        // HTTP check WITHOUT holding the lock
        let url = format!("http://127.0.0.1:{}/api/health", self.server_port);
        let healthy = reqwest::blocking::Client::builder()
            .timeout(std::time::Duration::from_secs(5))
            .build()
            .ok()
            .and_then(|client| client.get(&url).send().ok())
            .map(|r| r.status().is_success())
            .unwrap_or(false);

        // Re-acquire lock to update state
        let mut state = self.inner.lock().unwrap();
        state.is_running = healthy;
        healthy
    }

    pub fn is_running(&self) -> bool {
        self.inner.lock().unwrap().is_running
    }

    pub fn server_port(&self) -> u16 {
        self.server_port
    }
}
