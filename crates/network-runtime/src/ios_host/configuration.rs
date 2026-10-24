use chromvoid_core::storage::{
    atomic_file::write_json_pretty_atomic, json_file::read_json_or_default,
};
use serde::{Deserialize, Serialize};
use std::path::Path;
use std::time::{SystemTime, UNIX_EPOCH};

/// Non-vault host preferences. `enabled` records intent, not a live listener or Core authority.
#[derive(Debug, Clone, Serialize, Deserialize, Default)]
pub struct IosHostConfiguration {
    pub relay_url: Option<String>,
    pub enabled: bool,
    pub updated_at: u64,
}

impl IosHostConfiguration {
    pub fn load(path: &Path) -> Self {
        read_json_or_default(path, "network: iOS host mode")
    }

    pub fn update(path: &Path, relay_url: Option<&str>, enabled: bool) -> Result<(), String> {
        let mut config = Self::load(path);
        if let Some(url) = relay_url.map(str::trim).filter(|url| !url.is_empty()) {
            config.relay_url = Some(url.to_string());
        }
        config.enabled = enabled;
        config.updated_at = SystemTime::now()
            .duration_since(UNIX_EPOCH)
            .unwrap_or_default()
            .as_secs();
        write_json_pretty_atomic(path, &config)
            .map_err(|error| format!("write ios host mode: {error}"))
    }
}
