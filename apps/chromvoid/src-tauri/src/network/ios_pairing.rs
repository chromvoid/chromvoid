//! iOS-specific pairing and host-mode orchestration over WSS relay.

use std::path::Path;
use std::sync::Mutex;
use std::time::{Duration, SystemTime, UNIX_EPOCH};

use chromvoid_protocol::{NoiseTransport, RemoteTransport};
use serde::{Deserialize, Serialize};
use tracing::{info, warn};

use super::ios_control::{
    create_pairing_session, fetch_pairing_session, fetch_wake_request, publish_host_presence,
    CreatePairingSessionRequest, CreatePairingSessionResponse, HostPresence, PairingOffer,
    PublishHostPresenceRequest,
};
use super::ios_peers::{PairedIosPeer, PairedIosPeerStore};
use super::local_identity::{LocalDeviceIdentity, LocalDeviceIdentityStore};
use super::mobile_acceptor;
use super::paired_peers::{PairedPeer, PairedPeerStore};
use super::pairing::pin_to_psk;
use super::wss_transport::WssTransport;

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

#[derive(Debug, Clone, Serialize, Deserialize, Default)]
struct PersistedIosHostMode {
    relay_url: Option<String>,
    enabled: bool,
    updated_at: u64,
}

fn load_persisted_host_mode(storage_root: &Path) -> PersistedIosHostMode {
    let path = host_mode_path(storage_root);
    if !path.exists() {
        return PersistedIosHostMode::default();
    }

    std::fs::read_to_string(path)
        .ok()
        .and_then(|contents| serde_json::from_str::<PersistedIosHostMode>(&contents).ok())
        .unwrap_or_default()
}

fn save_persisted_host_mode(
    storage_root: &Path,
    mut config: PersistedIosHostMode,
) -> Result<(), String> {
    config.updated_at = now_secs();
    let json = serde_json::to_string_pretty(&config)
        .map_err(|e| format!("serialize ios host mode: {e}"))?;
    std::fs::write(host_mode_path(storage_root), json)
        .map_err(|e| format!("write ios host mode: {e}"))
}

fn update_persisted_host_mode(
    storage_root: &Path,
    relay_url: Option<&str>,
    enabled: bool,
) -> Result<(), String> {
    let mut config = load_persisted_host_mode(storage_root);
    if let Some(url) = relay_url.map(str::trim).filter(|url| !url.is_empty()) {
        config.relay_url = Some(url.to_string());
    }
    config.enabled = enabled;
    save_persisted_host_mode(storage_root, config)
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

static IOS_HOST_STATUS: Mutex<IosHostStatus> = Mutex::new(IosHostStatus {
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
});

fn set_status(mutator: impl FnOnce(&mut IosHostStatus)) -> IosHostStatus {
    let mut guard = IOS_HOST_STATUS.lock().unwrap();
    mutator(&mut guard);
    guard.clone()
}

pub fn host_status() -> IosHostStatus {
    IOS_HOST_STATUS.lock().unwrap().clone()
}

fn has_effective_ready_presence(presence: Option<&HostPresence>) -> bool {
    presence.is_some_and(|presence| presence.status == "ready" && presence.expires_at_ms > now_ms())
}

fn should_republish_presence_for_active_acceptor(
    relay_url: &str,
    acceptor: &mobile_acceptor::AcceptorStatus,
    status: &IosHostStatus,
) -> bool {
    matches!(
        acceptor.state,
        mobile_acceptor::AcceptorState::Listening | mobile_acceptor::AcceptorState::Connected
    ) && acceptor.relay_url.as_deref() == Some(relay_url)
        && !has_effective_ready_presence(status.presence.as_ref())
}

pub fn is_host_mode_enabled(storage_root: &Path) -> bool {
    load_persisted_host_mode(storage_root).enabled
}

pub fn persisted_host_mode_relay_url(storage_root: &Path) -> Option<String> {
    load_persisted_host_mode(storage_root)
        .relay_url
        .as_deref()
        .map(str::trim)
        .filter(|url| !url.is_empty())
        .map(ToOwned::to_owned)
}

async fn pending_wake_requested(relay_url: &str, peer_id: &str) -> Result<bool, String> {
    let wake = fetch_wake_request(relay_url, peer_id).await?;
    Ok(wake.is_some_and(|request| request.status == "waking"))
}

pub async fn handle_pending_wake_if_enabled(
    storage_root: &Path,
) -> Result<Option<IosHostStatus>, String> {
    let config = load_persisted_host_mode(storage_root);
    if !config.enabled {
        info!("ios_pairing: pending wake check skipped because host mode is disabled");
        return Ok(None);
    }

    let relay_url = config
        .relay_url
        .as_deref()
        .map(str::trim)
        .filter(|url| !url.is_empty())
        .ok_or("ios host mode is enabled but relay_url is missing".to_string())?;

    let identity = load_or_create_identity(storage_root, "ChromVoid iPhone")?;
    let pending_wake = pending_wake_requested(relay_url, &identity.device_id).await?;
    info!(
        "ios_pairing: pending wake check peer_id={} relay_url={} pending_wake={}",
        identity.device_id, relay_url, pending_wake
    );
    if !pending_wake {
        return Ok(None);
    }

    info!(
        "ios_pairing: pending wake detected for peer_id={}, refreshing presence",
        identity.device_id
    );
    let status = handle_wake(relay_url, storage_root).await?;
    Ok(Some(status))
}

pub async fn resume_host_mode_if_enabled(
    storage_root: &Path,
) -> Result<Option<IosHostStatus>, String> {
    let config = load_persisted_host_mode(storage_root);
    if !config.enabled {
        info!("ios_pairing: resume host mode skipped because host mode is disabled");
        return Ok(None);
    }

    let relay_url = config
        .relay_url
        .as_deref()
        .map(str::trim)
        .filter(|url| !url.is_empty())
        .ok_or("ios host mode is enabled but relay_url is missing".to_string())?;

    let acceptor = mobile_acceptor::get_status();
    let status = host_status();
    info!(
        "ios_pairing: resume host mode check relay_url={} acceptor_state={:?} acceptor_room_id={:?}",
        relay_url, acceptor.state, acceptor.room_id
    );
    if should_republish_presence_for_active_acceptor(relay_url, &acceptor, &status) {
        info!(
            "ios_pairing: resume host mode republishing stale or missing presence relay_url={} room_id={:?}",
            relay_url, acceptor.room_id
        );
        return match publish_presence(relay_url, storage_root).await {
            Ok(status) => Ok(Some(status)),
            Err(error) => {
                warn!(
                    "ios_pairing: resume host mode failed to republish presence, falling back to wake flow: {error}"
                );
                let status = handle_wake(relay_url, storage_root).await?;
                Ok(Some(status))
            }
        };
    }

    if matches!(
        acceptor.state,
        mobile_acceptor::AcceptorState::Listening | mobile_acceptor::AcceptorState::Connected
    ) && acceptor.relay_url.as_deref() == Some(relay_url)
    {
        info!(
            "ios_pairing: resume host mode reusing active acceptor relay_url={} room_id={:?}",
            relay_url, acceptor.room_id
        );
        return Ok(Some(status));
    }

    info!(
        "ios_pairing: resume host mode starting fresh wake flow relay_url={}",
        relay_url
    );
    let status = handle_wake(relay_url, storage_root).await?;
    Ok(Some(status))
}

pub async fn handle_pending_wake_or_resume_host_mode(
    storage_root: &Path,
) -> Result<Option<IosHostStatus>, String> {
    if let Some(status) = handle_pending_wake_if_enabled(storage_root).await? {
        return Ok(Some(status));
    }

    resume_host_mode_if_enabled(storage_root).await
}

pub async fn start_host_mode(
    relay_url: &str,
    storage_root: &Path,
    fallback_label: &str,
) -> Result<IosHostStatus, String> {
    if relay_url.trim().is_empty() {
        return Err("relay_url is required".to_string());
    }

    if let Err(error) = update_persisted_host_mode(storage_root, Some(relay_url), false) {
        warn!("ios_pairing: failed to persist pairing relay_url: {error}");
    }

    let identity = load_or_create_identity(storage_root, fallback_label)?;
    info!(
        "ios_pairing: start_host_mode:created_pairing_session peer_id={} relay_url={}",
        identity.device_id, relay_url
    );
    let session = create_pairing_session(
        relay_url,
        &CreatePairingSessionRequest {
            peer_id: identity.device_id.clone(),
            device_label: identity.device_label.clone(),
            peer_pubkey_hex: identity.static_pubkey_hex.clone(),
            relay_url: relay_url.to_string(),
        },
    )
    .await?;
    info!(
        "ios_pairing: start_host_mode:session_ready session_id={} room_id={} expires_at_ms={}",
        session.session_id, session.room_id, session.expires_at_ms
    );

    let status = set_status(|state| {
        state.phase = IosHostPhase::Pairing;
        state.relay_url = Some(relay_url.to_string());
        state.device_id = Some(identity.device_id.clone());
        state.device_label = Some(identity.device_label.clone());
        state.pairing_pin = Some(session.pin.clone());
        state.pairing_offer = Some(session.offer.clone());
        state.expires_at_ms = Some(session.expires_at_ms);
        state.presence = None;
        state.paired_peer_id = None;
        state.error = None;
    });

    let storage_root = storage_root.to_path_buf();
    let identity_clone = identity.clone();
    tauri::async_runtime::spawn(async move {
        if let Err(error) = run_pairing_responder(session, storage_root, identity_clone).await {
            warn!("ios_pairing: host mode failed: {error}");
            set_status(|state| {
                state.phase = IosHostPhase::Error;
                state.error = Some(error);
            });
        }
    });

    Ok(status)
}

pub async fn stop_host_mode(storage_root: &Path) -> Result<IosHostStatus, String> {
    let current = host_status();
    let _ = mobile_acceptor::stop_listening();

    if let (Some(relay_url), Some(device_id), Some(presence)) = (
        current.relay_url.clone(),
        current.device_id.clone(),
        current.presence.clone(),
    ) {
        let relay_url_for_body = relay_url.clone();
        let _ = publish_host_presence(
            &relay_url,
            &device_id,
            &PublishHostPresenceRequest {
                relay_url: relay_url_for_body,
                room_id: presence.room_id,
                status: "offline".to_string(),
                ttl_ms: Some(1_000),
            },
        )
        .await;
    }

    if let Err(error) =
        update_persisted_host_mode(storage_root, current.relay_url.as_deref(), false)
    {
        warn!("ios_pairing: failed to disable persisted host mode: {error}");
    }

    if let Err(error) = crate::mobile::ios::background_refresh::cancel() {
        warn!("ios_pairing: failed to cancel background refresh: {error}");
    }

    Ok(set_status(|state| *state = IosHostStatus::default()))
}

pub async fn publish_presence(
    relay_url: &str,
    storage_root: &Path,
) -> Result<IosHostStatus, String> {
    let identity = load_or_create_identity(storage_root, "ChromVoid iPhone")?;
    let acceptor = mobile_acceptor::get_status();
    let room_id = acceptor
        .room_id
        .clone()
        .ok_or("acceptor has no active room_id".to_string())?;
    info!(
        "ios_pairing: publish_presence peer_id={} relay_url={} room_id={} acceptor_state={:?}",
        identity.device_id, relay_url, room_id, acceptor.state
    );

    let presence = publish_host_presence(
        relay_url,
        &identity.device_id,
        &PublishHostPresenceRequest {
            relay_url: relay_url.to_string(),
            room_id,
            status: "ready".to_string(),
            ttl_ms: Some(HOST_PRESENCE_TTL_MS),
        },
    )
    .await?;

    if let Err(error) = update_persisted_host_mode(storage_root, Some(relay_url), true) {
        warn!("ios_pairing: failed to persist ready host mode: {error}");
    }

    if let Err(error) =
        crate::network::ios_push::sync_push_registration_for_relay(relay_url, storage_root).await
    {
        warn!("ios_pairing: failed to sync push registration: {error}");
    }

    if let Err(error) = crate::mobile::ios::background_refresh::schedule() {
        warn!("ios_pairing: failed to schedule background refresh: {error}");
    }

    info!(
        "ios_pairing: publish_presence:ready peer_id={} room_id={} expires_at_ms={}",
        identity.device_id, presence.room_id, presence.expires_at_ms
    );
    Ok(set_status(|state| {
        state.phase = IosHostPhase::Ready;
        state.relay_url = Some(relay_url.to_string());
        state.device_id = Some(identity.device_id.clone());
        state.device_label = Some(identity.device_label.clone());
        state.presence = Some(presence);
        state.error = None;
    }))
}

pub async fn handle_wake(relay_url: &str, storage_root: &Path) -> Result<IosHostStatus, String> {
    let identity = load_or_create_identity(storage_root, "ChromVoid iPhone")?;
    let acceptor = mobile_acceptor::get_status();
    info!(
        "ios_pairing: handle_wake:start peer_id={} relay_url={} previous_state={:?} previous_room_id={:?} reuse_existing_acceptor=false",
        identity.device_id, relay_url, acceptor.state, acceptor.room_id
    );
    let room_id = generate_room_id_for("handle_wake");
    info!(
        "ios_pairing: handle_wake:restarting_acceptor peer_id={} room_id={}",
        identity.device_id, room_id
    );
    let _ = mobile_acceptor::stop_listening();
    mobile_acceptor::start_listening(relay_url, &room_id, storage_root).await?;

    let presence = publish_host_presence(
        relay_url,
        &identity.device_id,
        &PublishHostPresenceRequest {
            relay_url: relay_url.to_string(),
            room_id,
            status: "ready".to_string(),
            ttl_ms: Some(HOST_PRESENCE_TTL_MS),
        },
    )
    .await?;

    if let Err(error) = update_persisted_host_mode(storage_root, Some(relay_url), true) {
        warn!("ios_pairing: failed to persist wake host mode: {error}");
    }

    if let Err(error) =
        crate::network::ios_push::sync_push_registration_for_relay(relay_url, storage_root).await
    {
        warn!("ios_pairing: failed to sync push registration after wake: {error}");
    }

    if let Err(error) = crate::mobile::ios::background_refresh::schedule() {
        warn!("ios_pairing: failed to schedule background refresh after wake: {error}");
    }

    info!(
        "ios_pairing: handle_wake:ready peer_id={} room_id={} expires_at_ms={}",
        identity.device_id, presence.room_id, presence.expires_at_ms
    );
    Ok(set_status(|state| {
        state.phase = IosHostPhase::Ready;
        state.relay_url = Some(relay_url.to_string());
        state.device_id = Some(identity.device_id.clone());
        state.device_label = Some(identity.device_label.clone());
        state.presence = Some(presence);
        state.error = None;
    }))
}

pub async fn desktop_pair(
    offer: &PairingOffer,
    pin: &str,
    storage_root: &Path,
    fallback_label: &str,
) -> Result<PairedIosPeer, String> {
    info!(
        "ios_pairing: desktop_pair:start session_id={} relay_base_url={} offer_device_label={} pin_len={} fallback_label={}",
        offer.session_id,
        offer.relay_base_url,
        offer.device_label,
        pin.len(),
        fallback_label
    );
    let session = fetch_pairing_session(&offer.relay_base_url, &offer.session_id).await?;
    info!(
        "ios_pairing: desktop_pair:fetched_session session_id={} relay_url={} room_id={} expires_at_ms={}",
        session.session_id, session.relay_url, session.room_id, session.expires_at_ms
    );
    if session.expires_at_ms <= now_ms() {
        return Err("pairing offer expired".to_string());
    }

    let identity = load_or_create_identity(storage_root, fallback_label)?;
    info!(
        "ios_pairing: desktop_pair:identity_ready device_id={} device_label={}",
        identity.device_id, identity.device_label
    );
    let local_privkey = hex::decode(&identity.static_privkey_hex)
        .map_err(|e| format!("invalid local identity privkey: {e}"))?;
    info!(
        "ios_pairing: desktop_pair:connecting_transport relay_url={} room_id={}",
        session.relay_url, session.room_id
    );
    let mut transport = Box::new(
        WssTransport::connect_with_context(&session.relay_url, &session.room_id, "desktop_pairing")
            .await?,
    ) as Box<dyn RemoteTransport>;
    info!(
        "ios_pairing: desktop_pair:transport_connected session_id={} room_id={}",
        session.session_id, session.room_id
    );

    info!(
        "ios_pairing: desktop_pair:noise_handshake:start session_id={}",
        session.session_id
    );
    let mut noise = xxpsk0_initiator(transport.as_mut(), &local_privkey, &pin_to_psk(pin)).await?;
    info!(
        "ios_pairing: desktop_pair:noise_handshake:done session_id={}",
        session.session_id
    );

    info!(
        "ios_pairing: desktop_pair:send_hello session_id={} peer_id={}",
        session.session_id, identity.device_id
    );
    send_pairing_hello(
        transport.as_mut(),
        &mut noise,
        &PairingHello {
            peer_id: identity.device_id.clone(),
            peer_label: identity.device_label.clone(),
            peer_pubkey_hex: identity.static_pubkey_hex.clone(),
            platform: if cfg!(desktop) {
                "desktop".to_string()
            } else {
                "mobile".to_string()
            },
        },
    )
    .await?;
    info!(
        "ios_pairing: desktop_pair:recv_hello:start session_id={}",
        session.session_id
    );
    let remote = recv_pairing_hello(transport.as_mut(), &mut noise).await?;
    info!(
        "ios_pairing: desktop_pair:recv_hello:done session_id={} remote_peer_id={} remote_label={}",
        session.session_id, remote.peer_id, remote.peer_label
    );

    let remote_static_hex = hex::encode(noise.remote_pubkey());
    if remote.peer_pubkey_hex != remote_static_hex {
        return Err("pairing hello pubkey mismatch".to_string());
    }

    let peer = PairedIosPeer {
        peer_id: remote.peer_id,
        peer_label: remote.peer_label,
        peer_pubkey_hex: remote.peer_pubkey_hex,
        relay_url: session.relay_url,
        last_seen: now_secs(),
        paired_at: now_secs(),
        platform: "ios".to_string(),
    };

    let mut store = PairedIosPeerStore::load(&ios_peers_path(storage_root));
    store.upsert(peer.clone());
    store.save()?;
    info!(
        "ios_pairing: desktop_pair:stored_peer session_id={} peer_id={}",
        session.session_id, peer.peer_id
    );
    Ok(peer)
}

async fn run_pairing_responder(
    session: CreatePairingSessionResponse,
    storage_root: std::path::PathBuf,
    identity: LocalDeviceIdentity,
) -> Result<(), String> {
    info!(
        "ios_pairing: waiting for desktop peer in session={} room={}",
        session.session_id, session.room_id
    );

    let local_privkey = hex::decode(&identity.static_privkey_hex)
        .map_err(|e| format!("invalid local identity privkey: {e}"))?;
    let local_pubkey = hex::decode(&identity.static_pubkey_hex)
        .map_err(|e| format!("invalid local identity pubkey: {e}"))?;
    info!(
        "ios_pairing: run_pairing_responder:connecting_transport session_id={} room_id={}",
        session.session_id, session.room_id
    );
    let mut transport = Box::new(
        WssTransport::connect_with_context(
            &session.relay_url,
            &session.room_id,
            "ios_pairing_responder",
        )
        .await?,
    ) as Box<dyn RemoteTransport>;
    info!(
        "ios_pairing: run_pairing_responder:transport_connected session_id={} room_id={}",
        session.session_id, session.room_id
    );
    info!(
        "ios_pairing: run_pairing_responder:noise_handshake:start session_id={}",
        session.session_id
    );
    let initial_msg_timeout = pairing_initial_wait_timeout(session.expires_at_ms);
    info!(
        "ios_pairing: run_pairing_responder:awaiting_desktop_msg1 session_id={} timeout_secs={}",
        session.session_id,
        initial_msg_timeout.as_secs()
    );
    let mut noise = xxpsk0_responder(
        transport.as_mut(),
        &local_privkey,
        &pin_to_psk(&session.pin),
        initial_msg_timeout,
    )
    .await?;
    info!(
        "ios_pairing: run_pairing_responder:noise_handshake:done session_id={}",
        session.session_id
    );

    info!(
        "ios_pairing: run_pairing_responder:recv_hello:start session_id={}",
        session.session_id
    );
    let remote = recv_pairing_hello(transport.as_mut(), &mut noise).await?;
    info!(
        "ios_pairing: run_pairing_responder:recv_hello:done session_id={} remote_peer_id={} remote_label={}",
        session.session_id, remote.peer_id, remote.peer_label
    );
    let remote_static = noise.remote_pubkey().to_vec();
    if remote.peer_pubkey_hex != hex::encode(&remote_static) {
        return Err("desktop pairing hello pubkey mismatch".to_string());
    }

    info!(
        "ios_pairing: run_pairing_responder:send_hello session_id={} peer_id={}",
        session.session_id, identity.device_id
    );
    send_pairing_hello(
        transport.as_mut(),
        &mut noise,
        &PairingHello {
            peer_id: identity.device_id.clone(),
            peer_label: identity.device_label.clone(),
            peer_pubkey_hex: identity.static_pubkey_hex.clone(),
            platform: "ios".to_string(),
        },
    )
    .await?;

    let mut legacy_store = PairedPeerStore::load(&legacy_peers_path(&storage_root));
    legacy_store.upsert(PairedPeer {
        peer_id: remote.peer_id.clone(),
        label: remote.peer_label.clone(),
        relay_url: session.relay_url.clone(),
        peer_pubkey: remote_static,
        client_pubkey: local_pubkey,
        client_privkey_hex: identity.static_privkey_hex.clone(),
        last_seen: now_secs(),
        paired_at: now_secs(),
    });
    legacy_store.save()?;
    info!(
        "ios_pairing: run_pairing_responder:stored_legacy_peer session_id={} peer_id={}",
        session.session_id, remote.peer_id
    );

    let host_room_id = generate_room_id_for("post_pairing_ready_host");
    info!(
        "ios_pairing: run_pairing_responder:restart_acceptor_for_ready_host session_id={} room_id={}",
        session.session_id, host_room_id
    );
    let _ = mobile_acceptor::stop_listening();
    mobile_acceptor::start_listening(&session.relay_url, &host_room_id, &storage_root).await?;
    let presence = publish_host_presence(
        &session.relay_url,
        &identity.device_id,
        &PublishHostPresenceRequest {
            relay_url: session.relay_url.clone(),
            room_id: host_room_id,
            status: "ready".to_string(),
            ttl_ms: Some(HOST_PRESENCE_TTL_MS),
        },
    )
    .await?;

    if let Err(error) = update_persisted_host_mode(&storage_root, Some(&session.relay_url), true) {
        warn!("ios_pairing: failed to persist paired host mode: {error}");
    }

    if let Err(error) = crate::network::ios_push::sync_push_registration_for_relay(
        &session.relay_url,
        &storage_root,
    )
    .await
    {
        warn!("ios_pairing: failed to sync push registration after pairing: {error}");
    }

    if let Err(error) = crate::mobile::ios::background_refresh::schedule() {
        warn!("ios_pairing: failed to schedule background refresh after pairing: {error}");
    }

    set_status(|state| {
        state.phase = IosHostPhase::Ready;
        state.relay_url = Some(session.relay_url.clone());
        state.device_id = Some(identity.device_id.clone());
        state.device_label = Some(identity.device_label.clone());
        state.presence = Some(presence);
        state.paired_peer_id = Some(remote.peer_id);
        state.error = None;
    });
    Ok(())
}

async fn send_pairing_hello(
    transport: &mut dyn RemoteTransport,
    noise: &mut NoiseTransport,
    hello: &PairingHello,
) -> Result<(), String> {
    let plaintext =
        serde_json::to_vec(hello).map_err(|e| format!("serialize pairing hello: {e}"))?;
    let encrypted = noise
        .encrypt(&plaintext)
        .map_err(|e| format!("encrypt pairing hello: {e}"))?;
    transport
        .send(&encrypted)
        .await
        .map_err(|e| format!("send pairing hello: {e}"))
}

async fn recv_with_timeout(
    transport: &mut dyn RemoteTransport,
    label: &str,
) -> Result<Vec<u8>, String> {
    recv_with_timeout_for(transport, label, PAIRING_HANDSHAKE_TIMEOUT).await
}

async fn recv_with_timeout_for(
    transport: &mut dyn RemoteTransport,
    label: &str,
    timeout_duration: Duration,
) -> Result<Vec<u8>, String> {
    match tokio::time::timeout(timeout_duration, transport.recv()).await {
        Ok(Ok(data)) => Ok(data),
        Ok(Err(error)) => Err(format!("{label}: {error}")),
        Err(_) => Err(format!(
            "{label}: timeout after {}s",
            timeout_duration.as_secs()
        )),
    }
}

fn pairing_initial_wait_timeout(expires_at_ms: u64) -> Duration {
    Duration::from_millis(expires_at_ms.saturating_sub(now_ms())).max(PAIRING_INITIAL_WAIT_FLOOR)
}

async fn recv_pairing_hello(
    transport: &mut dyn RemoteTransport,
    noise: &mut NoiseTransport,
) -> Result<PairingHello, String> {
    let encrypted = recv_with_timeout(transport, "recv pairing hello").await?;
    let plaintext = noise
        .decrypt(&encrypted)
        .map_err(|e| format!("decrypt pairing hello: {e}"))?;
    serde_json::from_slice::<PairingHello>(&plaintext)
        .map_err(|e| format!("decode pairing hello: {e}"))
}

async fn xxpsk0_initiator(
    transport: &mut dyn RemoteTransport,
    local_privkey: &[u8],
    psk: &[u8; 32],
) -> Result<NoiseTransport, String> {
    use chromvoid_protocol::{MAX_HANDSHAKE_MSG, NOISE_PARAMS_XXPSK0};
    use snow::params::NoiseParams;

    let params: NoiseParams = NOISE_PARAMS_XXPSK0
        .parse()
        .map_err(|e: snow::Error| format!("noise params: {e}"))?;
    let mut initiator = snow::Builder::new(params)
        .psk(0, psk)
        .map_err(|e| format!("psk setup: {e}"))?
        .local_private_key(local_privkey)
        .map_err(|e| format!("local_private_key: {e}"))?
        .build_initiator()
        .map_err(|e| format!("build_initiator: {e}"))?;
    let mut buf = vec![0u8; MAX_HANDSHAKE_MSG];

    let len1 = initiator
        .write_message(&[], &mut buf)
        .map_err(|e| format!("xxpsk0 msg1 write: {e}"))?;
    transport
        .send(&buf[..len1])
        .await
        .map_err(|e| format!("xxpsk0 msg1 send: {e}"))?;

    let msg2 = recv_with_timeout(transport, "xxpsk0 msg2 recv").await?;
    initiator
        .read_message(&msg2, &mut buf)
        .map_err(|e| format!("xxpsk0 msg2 read: {e}"))?;

    let len3 = initiator
        .write_message(&[], &mut buf)
        .map_err(|e| format!("xxpsk0 msg3 write: {e}"))?;
    transport
        .send(&buf[..len3])
        .await
        .map_err(|e| format!("xxpsk0 msg3 send: {e}"))?;

    let remote_pubkey = initiator
        .get_remote_static()
        .ok_or("xxpsk0: no remote static key")?
        .to_vec();
    let state = initiator
        .into_transport_mode()
        .map_err(|e| format!("xxpsk0 into_transport_mode: {e}"))?;
    Ok(NoiseTransport::new(state, remote_pubkey))
}

async fn xxpsk0_responder(
    transport: &mut dyn RemoteTransport,
    local_privkey: &[u8],
    psk: &[u8; 32],
    initial_msg_timeout: Duration,
) -> Result<NoiseTransport, String> {
    use chromvoid_protocol::{MAX_HANDSHAKE_MSG, NOISE_PARAMS_XXPSK0};
    use snow::params::NoiseParams;

    let params: NoiseParams = NOISE_PARAMS_XXPSK0
        .parse()
        .map_err(|e: snow::Error| format!("noise params: {e}"))?;
    let mut responder = snow::Builder::new(params)
        .psk(0, psk)
        .map_err(|e| format!("psk setup: {e}"))?
        .local_private_key(local_privkey)
        .map_err(|e| format!("local_private_key: {e}"))?
        .build_responder()
        .map_err(|e| format!("build_responder: {e}"))?;
    let mut buf = vec![0u8; MAX_HANDSHAKE_MSG];

    let msg1 = recv_with_timeout_for(transport, "xxpsk0 msg1 recv", initial_msg_timeout).await?;
    responder
        .read_message(&msg1, &mut buf)
        .map_err(|e| format!("xxpsk0 msg1 read: {e}"))?;

    let len2 = responder
        .write_message(&[], &mut buf)
        .map_err(|e| format!("xxpsk0 msg2 write: {e}"))?;
    transport
        .send(&buf[..len2])
        .await
        .map_err(|e| format!("xxpsk0 msg2 send: {e}"))?;

    let msg3 = recv_with_timeout(transport, "xxpsk0 msg3 recv").await?;
    responder
        .read_message(&msg3, &mut buf)
        .map_err(|e| format!("xxpsk0 msg3 read: {e}"))?;

    let remote_pubkey = responder
        .get_remote_static()
        .ok_or("xxpsk0: no remote static key")?
        .to_vec();
    let state = responder
        .into_transport_mode()
        .map_err(|e| format!("xxpsk0 into_transport_mode: {e}"))?;
    Ok(NoiseTransport::new(state, remote_pubkey))
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
