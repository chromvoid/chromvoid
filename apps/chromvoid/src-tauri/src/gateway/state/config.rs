use serde::{Deserialize, Serialize};

use super::super::types::{
    AccessDuration, CapabilityPolicy, GatewayActorKind, PairedAgent, PairedExtension,
};

// ---------------------------------------------------------------------------
// Config & Pairing Session
// ---------------------------------------------------------------------------

pub const GATEWAY_PAIRING_MAX_ATTEMPTS: u8 = 5;
pub const GATEWAY_PAIRING_LOCKOUT_MS: u64 = 60_000;

#[derive(Debug, Clone, Serialize, Deserialize)]
pub struct GatewayConfig {
    pub enabled: bool,
    pub access_duration: AccessDuration,
    pub paired_extensions: Vec<PairedExtension>,
    /// Product CLI identities. Kept separate from extensions so a static key
    /// paired for `/agent` can never authorize the generic `/extension` RPC
    /// surface (and vice versa).
    #[serde(default)]
    pub paired_agents: Vec<PairedAgent>,
    /// Session max duration in minutes. Forces reconnect for fresh Noise handshake (PFS).
    /// Min 15, max 240, default 60.
    #[serde(default = "default_session_max_duration_mins")]
    pub session_max_duration_mins: u32,
    /// Per-extension capability policies (persistent).
    #[serde(default)]
    pub capability_policies: Vec<CapabilityPolicy>,
    /// Persistent Noise static private key for IK handshakes (hex-encoded, 32 bytes).
    /// Runtime-only compatibility slot. Production serialization omits this
    /// field; the key is persisted in the platform keychain.
    #[serde(default)]
    #[cfg_attr(not(test), serde(skip_serializing))]
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
            paired_agents: Vec::new(),
            session_max_duration_mins: default_session_max_duration_mins(),
            capability_policies: Vec::new(),
            gateway_privkey_hex: None,
        }
    }
}

#[derive(Debug, Clone)]
pub struct PairingSession {
    /// Internal, unforgeable identity for this exact pairing ceremony. It is
    /// never exposed to the browser extension or CLI and changes whenever a
    /// ceremony is started or replaced.
    pub(crate) ceremony_nonce: [u8; 32],
    pub actor_kind: GatewayActorKind,
    pub pairing_token: String,
    pub pin: String,
    pub token_expires_at_ms: u64,
    pub pin_expires_at_ms: u64,
    pub attempts_left: u8,
    pub locked_until_ms: Option<u64>,
}
