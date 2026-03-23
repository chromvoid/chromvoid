use serde::{Deserialize, Serialize};

use super::super::types::{AccessDuration, CapabilityPolicy, PairedExtension};

// ---------------------------------------------------------------------------
// Config & Pairing Session
// ---------------------------------------------------------------------------

#[derive(Debug, Clone, Serialize, Deserialize)]
pub struct GatewayConfig {
    pub enabled: bool,
    pub access_duration: AccessDuration,
    pub paired_extensions: Vec<PairedExtension>,
    /// Session max duration in minutes. Forces reconnect for fresh Noise handshake (PFS).
    /// Min 15, max 240, default 60.
    #[serde(default = "default_session_max_duration_mins")]
    pub session_max_duration_mins: u32,
    /// Per-extension capability policies (persistent).
    #[serde(default)]
    pub capability_policies: Vec<CapabilityPolicy>,
    /// Persistent Noise static private key for IK handshakes (hex-encoded, 32 bytes).
    /// Generated on first pairing, reused for all subsequent IK reconnects.
    #[serde(default)]
    pub gateway_privkey_hex: Option<String>,
}

fn default_session_max_duration_mins() -> u32 {
    60
}

impl Default for GatewayConfig {
    fn default() -> Self {
        Self {
            enabled: false,
            access_duration: AccessDuration::default(),
            paired_extensions: Vec::new(),
            session_max_duration_mins: default_session_max_duration_mins(),
            capability_policies: Vec::new(),
            gateway_privkey_hex: None,
        }
    }
}

#[derive(Debug, Clone)]
pub struct PairingSession {
    pub pairing_token: String,
    pub pin: String,
    pub token_expires_at_ms: u64,
    pub pin_expires_at_ms: u64,
    pub attempts_left: u8,
    pub locked_until_ms: Option<u64>,
}
