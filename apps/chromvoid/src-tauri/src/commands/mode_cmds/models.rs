use serde::Serialize;

use crate::core_adapter::{ConnectionState, CoreMode};

#[derive(Debug, Clone, Serialize)]
pub(crate) struct ModeInfo {
    pub mode: CoreMode,
    pub connection_state: ConnectionState,
    pub transport_type: Option<String>,
    pub remote_core_features: Vec<String>,
    #[serde(skip_serializing_if = "Option::is_none")]
    pub transport_session_generation: Option<u64>,
}

#[derive(Debug, Clone, Serialize)]
pub(crate) struct ModeSwitchResult {
    pub previous_mode: CoreMode,
    pub current_mode: CoreMode,
    pub remote_core_features: Vec<String>,
    #[serde(skip_serializing_if = "Option::is_none")]
    pub transport_session_generation: Option<u64>,
    pub auto_locked: bool,
    pub drain_completed: bool,
}

pub(crate) struct IosPresenceResolution {
    pub presence: crate::network::HostPresence,
    pub source: &'static str,
    pub wake_attempted: bool,
}
