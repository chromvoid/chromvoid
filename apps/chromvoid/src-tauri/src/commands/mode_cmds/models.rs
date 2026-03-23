use serde::Serialize;

use crate::core_adapter::{ConnectionState, CoreMode};

#[derive(Debug, Clone, Serialize)]
pub(crate) struct ModeInfo {
    pub mode: CoreMode,
    pub connection_state: ConnectionState,
    pub transport_type: Option<String>,
}

#[derive(Debug, Clone, Serialize)]
pub(crate) struct ModeSwitchResult {
    pub previous_mode: CoreMode,
    pub current_mode: CoreMode,
    pub auto_locked: bool,
    pub drain_completed: bool,
}

pub(crate) struct IosPresenceResolution {
    pub presence: crate::network::HostPresence,
    pub source: &'static str,
    pub wake_attempted: bool,
}
