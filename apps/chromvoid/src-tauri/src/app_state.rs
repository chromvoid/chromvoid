use std::sync::Arc;
use std::sync::Mutex;

use crate::core_adapter::CoreAdapter;
use crate::session_settings;

pub(crate) struct AppState {
    pub(crate) adapter: Arc<Mutex<Box<dyn CoreAdapter>>>,
    pub(crate) storage_root: Arc<Mutex<std::path::PathBuf>>,
    #[cfg(desktop)]
    pub(crate) gateway: Arc<Mutex<crate::gateway::GatewayState>>,
    pub(crate) session_settings: Arc<Mutex<session_settings::SessionSettings>>,
    pub(crate) mobile_is_foreground: Arc<Mutex<bool>>,
    pub(crate) last_activity: Arc<Mutex<std::time::Instant>>,
    pub(crate) backup_cancel_requested: Arc<std::sync::atomic::AtomicBool>,
    pub(crate) restore_cancel_requested: Arc<std::sync::atomic::AtomicBool>,
    #[cfg(desktop)]
    pub(crate) volume_manager: Arc<Mutex<crate::volume_manager::VolumeManager>>,
    #[cfg(desktop)]
    pub(crate) exit_in_progress: Arc<std::sync::atomic::AtomicBool>,
    #[cfg(desktop)]
    pub(crate) _sleep_watcher: Option<crate::sleep_watcher::PlatformSleepWatcher>,
    #[cfg(desktop)]
    pub(crate) ssh_agent: Arc<Mutex<crate::ssh_agent::SshAgentState>>,
}
