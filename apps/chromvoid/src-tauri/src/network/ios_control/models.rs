use serde::{Deserialize, Serialize};

#[derive(Debug, Clone, Serialize, Deserialize)]
pub struct PairingOffer {
    pub session_id: String,
    pub relay_base_url: String,
    pub device_label: String,
    pub expires_at_ms: u64,
}

#[derive(Debug, Clone, Serialize, Deserialize)]
pub struct CreatePairingSessionRequest {
    pub peer_id: String,
    pub device_label: String,
    pub peer_pubkey_hex: String,
    pub relay_url: String,
}

#[derive(Debug, Clone, Serialize, Deserialize)]
pub struct CreatePairingSessionResponse {
    pub session_id: String,
    pub room_id: String,
    pub pin: String,
    pub relay_url: String,
    pub expires_at_ms: u64,
    pub offer: PairingOffer,
}

#[derive(Debug, Clone, Serialize, Deserialize)]
pub struct PairingSessionSnapshot {
    pub session_id: String,
    pub room_id: String,
    pub relay_url: String,
    pub device_label: String,
    pub peer_id: String,
    pub peer_pubkey_hex: String,
    pub expires_at_ms: u64,
    pub status: String,
}

#[derive(Debug, Clone, Serialize, Deserialize)]
pub struct PublishHostPresenceRequest {
    pub relay_url: String,
    pub room_id: String,
    pub status: String,
    pub ttl_ms: Option<u64>,
}

#[derive(Debug, Clone, Serialize, Deserialize)]
pub struct HostPresence {
    pub peer_id: String,
    pub relay_url: String,
    pub room_id: String,
    pub expires_at_ms: u64,
    pub status: String,
}

#[derive(Debug, Clone, Serialize, Deserialize)]
pub struct WakeHostResponse {
    pub accepted: bool,
    pub peer_id: String,
    pub status: String,
    pub delivery: String,
}

#[derive(Debug, Clone, Serialize, Deserialize)]
pub struct RegisterPushRegistrationRequest {
    pub relay_url: String,
    pub device_token: String,
    pub environment: String,
    pub bundle_id: String,
}

#[derive(Debug, Clone, Serialize, Deserialize)]
pub struct PushRegistration {
    pub peer_id: String,
    pub relay_url: String,
    pub device_token: String,
    pub environment: String,
    pub bundle_id: String,
    pub updated_at_ms: u64,
}

#[derive(Debug, Clone, Serialize, Deserialize)]
pub struct WakeRequest {
    pub peer_id: String,
    pub requested_at_ms: u64,
    pub status: String,
}
