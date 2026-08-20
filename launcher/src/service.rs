use crate::config::AppConfig;
use log::{error, info, warn};
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
}

impl ServiceManager {
    pub fn new(config: &AppConfig) -> Self {
        Self {
            inner: Mutex::new(State {
                server_process: None,
                is_running: false,
            }),
            server_port: config.server_port,
            python_path: config.python_path.clone(),
        }
    }

    pub fn start_server(&self) -> Result<(), String> {
        let mut state = self.inner.lock().unwrap();

        // Check if child process is still alive
        if let Some(ref mut child) = state.server_process {
            match child.try_wait() {
                Ok(Some(_)) => {
                    warn!("后端进程已退出，清理状态");
                    state.server_process = None;
                    state.is_running = false;
                }
                Ok(None) => return Ok(()), // Still running
                Err(e) => {
                    error!("检查进程状态失败: {}", e);
                    state.server_process = None;
                    state.is_running = false;
                }
            }
        }

        let mut cmd = Command::new(&self.python_path);
        cmd.args([
            "-m",
            "uvicorn",
            "backend.main:app",
            "--host",
            "127.0.0.1",
            "--port",
            &self.server_port.to_string(),
        ]);

        #[cfg(target_os = "windows")]
        {
            use std::os::windows::process::CommandExt;
            cmd.creation_flags(0x08000000); // CREATE_NO_WINDOW
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
        let mut state = self.inner.lock().unwrap();

        if !state.is_running {
            return false;
        }

        // Check if the child process has crashed
        if let Some(ref mut child) = state.server_process {
            match child.try_wait() {
                Ok(Some(status)) => {
                    warn!("后端进程异常退出: {:?}", status);
                    state.server_process = None;
                    state.is_running = false;
                    return false;
                }
                Ok(None) => {}
                Err(e) => {
                    error!("检查进程状态失败: {}", e);
                    state.server_process = None;
                    state.is_running = false;
                    return false;
                }
            }
        }

        let url = format!("http://127.0.0.1:{}/health", self.server_port);
        let healthy = reqwest::blocking::get(&url)
            .map(|r| r.status().is_success())
            .unwrap_or(false);

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
