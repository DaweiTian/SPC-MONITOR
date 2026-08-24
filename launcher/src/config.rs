use serde::{Deserialize, Serialize};
use std::path::PathBuf;

fn generate_api_key() -> String {
    use std::time::{SystemTime, UNIX_EPOCH};
    let ts = SystemTime::now().duration_since(UNIX_EPOCH).unwrap_or_default().as_nanos();
    // Simple random-ish key: timestamp + process id, hex-encoded
    format!("ft1-{:x}-{:x}", ts, std::process::id())
}

#[derive(Debug, Clone, Serialize, Deserialize)]
pub struct AppConfig {
    pub server_port: u16,
    pub auto_start: bool,
    pub log_level: String,
    pub python_path: String,
    #[serde(default = "generate_api_key")]
    pub api_key: String,
}

impl Default for AppConfig {
    fn default() -> Self {
        Self {
            server_port: 18080,
            auto_start: true,
            log_level: "info".to_string(),
            python_path: "python".to_string(),
            api_key: generate_api_key(),
        }
    }
}

fn config_dir() -> PathBuf {
    let dir = dirs::config_dir()
        .unwrap_or_else(|| PathBuf::from("."))
        .join("ft1-monitor");
    std::fs::create_dir_all(&dir).ok();
    dir
}

fn config_path() -> PathBuf {
    config_dir().join("config.json")
}

impl AppConfig {
    pub fn load() -> Self {
        let path = config_path();
        let mut cfg = match std::fs::read_to_string(&path) {
            Ok(data) => serde_json::from_str::<Self>(&data).unwrap_or_default(),
            Err(_) => {
                let c = Self::default();
                c.save();
                c
            }
        };
        // CSP 硬编码端口 18080，强制修正
        if cfg.server_port != 18080 {
            log::warn!("server_port={} 与 CSP 不匹配，已强制修正为 18080", cfg.server_port);
            cfg.server_port = 18080;
        }
        cfg
    }

    pub fn save(&self) {
        let path = config_path();
        if let Ok(data) = serde_json::to_string_pretty(self) {
            std::fs::write(path, data).ok();
        }
    }

    pub fn log_dir() -> PathBuf {
        let dir = config_dir().join("logs");
        std::fs::create_dir_all(&dir).ok();
        dir
    }
}
