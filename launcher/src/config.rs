use serde::{Deserialize, Serialize};

#[derive(Debug, Clone, Serialize, Deserialize)]
pub struct AppConfig {
    pub server_port: u16,
    pub auto_start: bool,
    pub log_level: String,
}

impl Default for AppConfig {
    fn default() -> Self {
        Self {
            server_port: 8000,
            auto_start: true,
            log_level: "info".to_string(),
        }
    }
}
