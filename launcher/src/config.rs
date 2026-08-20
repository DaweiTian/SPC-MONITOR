use serde::{Deserialize, Serialize};
use std::path::PathBuf;

#[derive(Debug, Clone, Serialize, Deserialize)]
pub struct AppConfig {
    pub server_port: u16,
    pub auto_start: bool,
    pub log_level: String,
    pub python_path: String,
}

impl Default for AppConfig {
    fn default() -> Self {
        Self {
            server_port: 8000,
            auto_start: true,
            log_level: "info".to_string(),
            python_path: "python".to_string(),
        }
    }
}

fn config_path() -> PathBuf {
    let dir = dirs::config_dir()
        .unwrap_or_else(|| PathBuf::from("."))
        .join("ft1-monitor");
    std::fs::create_dir_all(&dir).ok();
    dir.join("config.json")
}

impl AppConfig {
    pub fn load() -> Self {
        let path = config_path();
        match std::fs::read_to_string(&path) {
            Ok(data) => serde_json::from_str(&data).unwrap_or_default(),
            Err(_) => {
                let cfg = Self::default();
                cfg.save();
                cfg
            }
        }
    }

    pub fn save(&self) {
        let path = config_path();
        if let Ok(data) = serde_json::to_string_pretty(self) {
            std::fs::write(path, data).ok();
        }
    }
}
