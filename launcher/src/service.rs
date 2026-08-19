use std::process::{Child, Command};
use std::sync::Mutex;

pub struct ServiceManager {
    server_process: Mutex<Option<Child>>,
    is_running: Mutex<bool>,
}

impl ServiceManager {
    pub fn new() -> Self {
        Self {
            server_process: Mutex::new(None),
            is_running: Mutex::new(false),
        }
    }

    pub fn start_server(&self) -> Result<(), String> {
        let mut process = self.server_process.lock().unwrap();
        let mut is_running = self.is_running.lock().unwrap();

        if *is_running {
            return Ok(());
        }

        let child = Command::new("python")
            .args(&["-m", "uvicorn", "backend.main:app", "--host", "127.0.0.1", "--port", "8000"])
            .spawn()
            .map_err(|e| format!("启动服务失败: {}", e))?;

        *process = Some(child);
        *is_running = true;

        Ok(())
    }

    pub fn stop_server(&self) -> Result<(), String> {
        let mut process = self.server_process.lock().unwrap();
        let mut is_running = self.is_running.lock().unwrap();

        if let Some(mut child) = process.take() {
            child.kill().map_err(|e| format!("停止服务失败: {}", e))?;
        }

        *is_running = false;

        Ok(())
    }

    pub fn is_running(&self) -> bool {
        *self.is_running.lock().unwrap()
    }
}
