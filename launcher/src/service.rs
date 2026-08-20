use crate::config::AppConfig;
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
        if state.is_running {
            return Ok(());
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
            child.kill().map_err(|e| format!("停止服务失败: {}", e))?;
            // Reap the zombie process
            child.wait().ok();
        }
        state.is_running = false;
        Ok(())
    }

    pub fn health_check(&self) -> bool {
        let url = format!("http://127.0.0.1:{}/health", self.server_port);
        let healthy = reqwest::blocking::get(&url)
            .map(|r| r.status().is_success())
            .unwrap_or(false);

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
