use serde::{Deserialize, Serialize};

#[derive(Debug, Clone, Serialize, Deserialize)]
pub struct SessionSettings {
    /// Auto-lock timeout in seconds. 0 = disabled.
    pub auto_lock_timeout_secs: u64,
    /// Lock vault when system goes to sleep.
    pub lock_on_sleep: bool,
    /// Lock vault when the mobile app moves to background.
    #[serde(default)]
    pub lock_on_mobile_background: bool,
    /// Require biometric app gate on supported mobile runtimes before showing the app.
    #[serde(default = "default_require_biometric_app_gate")]
    pub require_biometric_app_gate: bool,
    /// Automatically mount virtual volume after vault unlock (opt-in, default off).
    #[serde(default)]
    pub auto_mount_after_unlock: bool,
    /// Keep the iPhone screen awake while the vault is open in foreground (opt-in, default off).
    #[serde(default)]
    pub keep_screen_awake_when_unlocked: bool,
}

impl Default for SessionSettings {
    fn default() -> Self {
        Self {
            auto_lock_timeout_secs: 5 * 60, // 5 minutes
            lock_on_sleep: true,
            lock_on_mobile_background: false,
            require_biometric_app_gate: default_require_biometric_app_gate(),
            auto_mount_after_unlock: false,
            keep_screen_awake_when_unlocked: false,
        }
    }
}

const fn default_require_biometric_app_gate() -> bool {
    true
}

impl SessionSettings {
    pub fn load(path: &std::path::Path) -> Self {
        std::fs::read(path)
            .ok()
            .and_then(|b| serde_json::from_slice(&b).ok())
            .unwrap_or_default()
    }

    pub fn save(&self, path: &std::path::Path) {
        if let Ok(json) = serde_json::to_vec_pretty(self) {
            let _ = std::fs::write(path, json);
        }
    }
}

#[cfg(test)]
#[path = "session_settings_tests.rs"]
mod tests;
