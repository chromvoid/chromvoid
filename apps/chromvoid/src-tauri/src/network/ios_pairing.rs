//! iOS-specific pairing and host-mode orchestration over WSS relay.

mod host_mode;
mod pairing_session;
mod state;

use std::path::Path;
use std::time::{Duration, SystemTime, UNIX_EPOCH};

use serde::{Deserialize, Serialize};
use tracing::info;

use super::ios_control::{HostPresence, PairingOffer};
use super::local_identity::{LocalDeviceIdentity, LocalDeviceIdentityStore};
use super::mobile_acceptor;
pub use host_mode::{
    handle_pending_wake_if_enabled, handle_pending_wake_or_resume_host_mode, handle_wake,
    publish_presence, resume_host_mode_if_enabled, shutdown_host_mode_for_app_exit,
    start_host_mode, stop_host_mode,
};
pub use pairing_session::desktop_pair;
#[cfg(test)]
use pairing_session::pairing_initial_wait_timeout;
#[cfg(test)]
use state::should_republish_presence_for_active_acceptor;
#[cfg(test)]
use state::update_persisted_host_mode;
#[cfg(test)]
use state::{has_effective_ready_presence, load_persisted_host_mode};
pub use state::{is_host_mode_enabled, persisted_host_mode_relay_url, IosHostRuntimeState};

// Keep this aligned with the relay waiting-room TTL so wake presence does not outlive the room.
const HOST_PRESENCE_TTL_MS: u64 = 5 * 60 * 1000;
const PAIRING_HANDSHAKE_TIMEOUT: Duration = Duration::from_secs(15);
const PAIRING_INITIAL_WAIT_FLOOR: Duration = Duration::from_secs(30);

fn now_secs() -> u64 {
    SystemTime::now()
        .duration_since(UNIX_EPOCH)
        .unwrap_or_default()
        .as_secs()
}

fn now_ms() -> u64 {
    SystemTime::now()
        .duration_since(UNIX_EPOCH)
        .unwrap_or_default()
        .as_millis() as u64
}

fn generate_room_id_for(context: &str) -> String {
    use rand::RngCore;
    let mut bytes = [0u8; 32];
    rand::rngs::OsRng.fill_bytes(&mut bytes);
    let room_id = hex::encode(bytes);
    info!(
        "ios_pairing: generated room_id context={} room_id={}",
        context, room_id
    );
    room_id
}

fn local_identity_path(storage_root: &Path) -> std::path::PathBuf {
    storage_root.join("network_local_identity.json")
}

fn ios_peers_path(storage_root: &Path) -> std::path::PathBuf {
    storage_root.join("paired_ios_peers.json")
}

fn legacy_peers_path(storage_root: &Path) -> std::path::PathBuf {
    storage_root.join("paired_network_peers.json")
}

fn host_mode_path(storage_root: &Path) -> std::path::PathBuf {
    storage_root.join("ios_host_mode.json")
}

fn load_or_create_identity(
    storage_root: &Path,
    fallback_label: &str,
) -> Result<LocalDeviceIdentity, String> {
    let mut store = LocalDeviceIdentityStore::load(&local_identity_path(storage_root));
    store.get_or_create(fallback_label)
}

async fn load_or_create_identity_blocking(
    storage_root: std::path::PathBuf,
    fallback_label: String,
    task_label: &'static str,
) -> Result<LocalDeviceIdentity, String> {
    tauri::async_runtime::spawn_blocking(move || {
        load_or_create_identity(&storage_root, &fallback_label)
    })
    .await
    .map_err(|error| format!("{task_label} task failed: {error}"))?
}

#[derive(Debug, Clone, Copy, Serialize, Deserialize, PartialEq, Eq)]
pub enum IosHostPhase {
    Idle,
    Pairing,
    Ready,
    Error,
}

#[derive(Debug, Clone, Serialize, Deserialize)]
pub struct PairingHello {
    pub peer_id: String,
    pub peer_label: String,
    pub peer_pubkey_hex: String,
    pub platform: String,
}

#[derive(Debug, Clone, Serialize, Deserialize)]
pub struct IosHostStatus {
    pub phase: IosHostPhase,
    pub relay_url: Option<String>,
    pub device_id: Option<String>,
    pub device_label: Option<String>,
    pub pairing_pin: Option<String>,
    pub pairing_offer: Option<PairingOffer>,
    pub expires_at_ms: Option<u64>,
    pub presence: Option<HostPresence>,
    pub paired_peer_id: Option<String>,
    pub error: Option<String>,
}

impl Default for IosHostStatus {
    fn default() -> Self {
        Self {
            phase: IosHostPhase::Idle,
            relay_url: None,
            device_id: None,
            device_label: None,
            pairing_pin: None,
            pairing_offer: None,
            expires_at_ms: None,
            presence: None,
            paired_peer_id: None,
            error: None,
        }
    }
}

#[cfg(test)]
mod tests {
    use super::*;

    #[test]
    fn status_defaults_to_idle() {
        let status = IosHostStatus::default();
        assert_eq!(status.phase, IosHostPhase::Idle);
        assert!(status.pairing_offer.is_none());
    }

    #[test]
    fn persisted_host_mode_roundtrip() {
        let dir = tempfile::tempdir().unwrap();
        update_persisted_host_mode(dir.path(), Some("wss://relay.test"), true).unwrap();

        let enabled = load_persisted_host_mode(dir.path());
        assert!(enabled.enabled);
        assert_eq!(enabled.relay_url.as_deref(), Some("wss://relay.test"));
        assert!(is_host_mode_enabled(dir.path()));

        update_persisted_host_mode(dir.path(), None, false).unwrap();

        let disabled = load_persisted_host_mode(dir.path());
        assert!(!disabled.enabled);
        assert_eq!(disabled.relay_url.as_deref(), Some("wss://relay.test"));
        assert!(!is_host_mode_enabled(dir.path()));
    }

    #[test]
    fn effective_ready_presence_requires_future_ready_status() {
        let future_ready = HostPresence {
            peer_id: "peer-1".to_string(),
            relay_url: "wss://relay.test".to_string(),
            room_id: "room-1".to_string(),
            expires_at_ms: now_ms() + 30_000,
            status: "ready".to_string(),
        };
        let expired_ready = HostPresence {
            expires_at_ms: now_ms().saturating_sub(1),
            ..future_ready.clone()
        };
        let future_offline = HostPresence {
            status: "offline".to_string(),
            ..future_ready.clone()
        };

        assert!(has_effective_ready_presence(Some(&future_ready)));
        assert!(!has_effective_ready_presence(Some(&expired_ready)));
        assert!(!has_effective_ready_presence(Some(&future_offline)));
        assert!(!has_effective_ready_presence(None));
    }

    #[test]
    fn pairing_initial_wait_timeout_preserves_delayed_join_window_beyond_one_minute() {
        let timeout = pairing_initial_wait_timeout(now_ms() + 120_000);
        assert!(
            timeout >= Duration::from_secs(110),
            "delayed desktop joins within canonical expiry must keep more than a 60s wait window"
        );
    }

    #[test]
    fn pairing_initial_wait_timeout_uses_floor_for_near_expiry_sessions() {
        let timeout = pairing_initial_wait_timeout(now_ms() + 5_000);
        assert_eq!(timeout, PAIRING_INITIAL_WAIT_FLOOR);
    }

    #[test]
    fn active_acceptor_republishes_when_cached_presence_is_missing_or_expired() {
        let acceptor = mobile_acceptor::AcceptorStatus {
            state: mobile_acceptor::AcceptorState::Listening,
            connected_peers: Vec::new(),
            relay_url: Some("wss://relay.test".to_string()),
            room_id: Some("room-1".to_string()),
        };
        let missing_presence = IosHostStatus {
            phase: IosHostPhase::Ready,
            relay_url: Some("wss://relay.test".to_string()),
            ..IosHostStatus::default()
        };
        let expired_presence = IosHostStatus {
            phase: IosHostPhase::Ready,
            relay_url: Some("wss://relay.test".to_string()),
            presence: Some(HostPresence {
                peer_id: "peer-1".to_string(),
                relay_url: "wss://relay.test".to_string(),
                room_id: "room-1".to_string(),
                expires_at_ms: now_ms().saturating_sub(1),
                status: "ready".to_string(),
            }),
            ..IosHostStatus::default()
        };
        let valid_presence = IosHostStatus {
            phase: IosHostPhase::Ready,
            relay_url: Some("wss://relay.test".to_string()),
            presence: Some(HostPresence {
                peer_id: "peer-1".to_string(),
                relay_url: "wss://relay.test".to_string(),
                room_id: "room-1".to_string(),
                expires_at_ms: now_ms() + 30_000,
                status: "ready".to_string(),
            }),
            ..IosHostStatus::default()
        };

        assert!(should_republish_presence_for_active_acceptor(
            "wss://relay.test",
            &acceptor,
            &missing_presence
        ));
        assert!(should_republish_presence_for_active_acceptor(
            "wss://relay.test",
            &acceptor,
            &expired_presence
        ));
        assert!(!should_republish_presence_for_active_acceptor(
            "wss://relay.test",
            &acceptor,
            &valid_presence
        ));
    }
}
