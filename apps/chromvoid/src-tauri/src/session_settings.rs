use serde::{Deserialize, Serialize};

#[derive(Debug, Clone, Serialize, Deserialize)]
pub struct SessionSettings {
    /// Auto-lock timeout in seconds. 0 = disabled.
    pub auto_lock_timeout_secs: u64,
    /// Lock vault when system goes to sleep (or mobile app moves to background).
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
    /// Automatically refresh or start the SSH agent after vault unlock on desktop (opt-in).
    #[serde(default)]
    pub auto_start_ssh_agent_after_unlock: bool,
    /// Keep the iPhone screen awake while the vault is open in foreground (opt-in, default off).
    #[serde(default)]
    pub keep_screen_awake_when_unlocked: bool,
    /// Show an Android ongoing notification while the vault is unlocked.
    #[serde(default = "default_android_vault_status_notification_enabled")]
    pub android_vault_status_notification_enabled: bool,
    /// Enable Android Quick Settings tile integration for quick vault locking.
    #[serde(default = "default_android_quick_lock_tile_enabled")]
    pub android_quick_lock_tile_enabled: bool,
    /// Ask for confirmation before deleting files or folders in Files.
    #[serde(default = "default_confirm_file_deletion")]
    pub confirm_file_deletion: bool,
    /// Show dotfiles in Files listings by default.
    #[serde(default)]
    pub show_hidden_files: bool,
    /// Absolute catalog folder where Markdown pasted/dropped image attachments are stored.
    #[serde(default = "default_markdown_attachment_folder_path")]
    pub markdown_attachment_folder_path: String,
}

impl Default for SessionSettings {
    fn default() -> Self {
        Self {
            auto_lock_timeout_secs: 5 * 60, // 5 minutes
            lock_on_sleep: true,
            lock_on_mobile_background: false,
            require_biometric_app_gate: default_require_biometric_app_gate(),
            auto_mount_after_unlock: false,
            auto_start_ssh_agent_after_unlock: false,
            keep_screen_awake_when_unlocked: false,
            android_vault_status_notification_enabled:
                default_android_vault_status_notification_enabled(),
            android_quick_lock_tile_enabled: default_android_quick_lock_tile_enabled(),
            confirm_file_deletion: default_confirm_file_deletion(),
            show_hidden_files: false,
            markdown_attachment_folder_path: default_markdown_attachment_folder_path(),
        }
    }
}

const fn default_require_biometric_app_gate() -> bool {
    true
}

const fn default_android_vault_status_notification_enabled() -> bool {
    true
}

const fn default_android_quick_lock_tile_enabled() -> bool {
    true
}

const fn default_confirm_file_deletion() -> bool {
    true
}

fn default_markdown_attachment_folder_path() -> String {
    "/attachments".to_string()
}

impl SessionSettings {
    pub fn load(path: &std::path::Path) -> Self {
        let bytes = match std::fs::read(path) {
            Ok(bytes) => bytes,
            Err(error) => {
                if error.kind() != std::io::ErrorKind::NotFound {
                    tracing::warn!(
                        "session_settings: failed to read {}: {error}",
                        path.display()
                    );
                }
                return Self::default();
            }
        };

        match serde_json::from_slice(&bytes) {
            Ok(settings) => settings,
            Err(error) => {
                tracing::warn!(
                    "session_settings: failed to parse {}: {error}",
                    path.display()
                );
                Self::default()
            }
        }
    }

    pub fn save(&self, path: &std::path::Path) {
        if let Err(error) = crate::helpers::storage::write_json_pretty_atomic(path, self) {
            tracing::warn!(
                "session_settings: failed to save {}: {error}",
                path.display()
            );
        }
    }
}

#[cfg(test)]
#[path = "session_settings_tests.rs"]
mod tests;
