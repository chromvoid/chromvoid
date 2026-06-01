use std::path::{Path, PathBuf};
use std::sync::{Arc, Mutex};
use std::time::{Duration, SystemTime, UNIX_EPOCH};

use chromvoid_protocol::{NoiseTransport, RemoteTransport};
use serde::{Deserialize, Serialize};
use tracing::{info, warn};

use super::ios_control::{
    create_pairing_session, fetch_pairing_session, publish_host_presence,
    CreatePairingSessionRequest, CreatePairingSessionResponse, HostPresence, PairingOffer,
    PublishHostPresenceRequest,
};
use super::local_identity::{LocalDeviceIdentity, LocalDeviceIdentityStore};
use super::mobile_acceptor::{self, ConnectedPeer, MobileAcceptorRuntimeState};
use super::paired_peers::{PairedPeer, PairedPeerStore};
use super::pairing::pin_to_psk;
use super::wss_transport::WssTransport;
use crate::core_adapter::CoreAdapter;
use crate::network::host_responder_task::HostResponderTaskRuntime;

const HOST_PRESENCE_TTL_MS: u64 = 5 * 60 * 1000;
const PAIRING_HANDSHAKE_TIMEOUT: Duration = Duration::from_secs(15);
const PAIRING_INITIAL_WAIT_FLOOR: Duration = Duration::from_secs(30);
const APP_EXIT_OFFLINE_PRESENCE_TIMEOUT: Duration = Duration::from_secs(1);

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
        "mobile_host: generated room_id context={} room_id={}",
        context, room_id
    );
    room_id
}

fn local_identity_path(storage_root: &Path) -> PathBuf {
    storage_root.join("network_local_identity.json")
}

fn legacy_peers_path(storage_root: &Path) -> PathBuf {
    storage_root.join("paired_network_peers.json")
}

fn host_mode_path(storage_root: &Path) -> PathBuf {
    storage_root.join("mobile_host_mode.json")
}

fn load_or_create_identity(
    storage_root: &Path,
    fallback_label: &str,
) -> Result<LocalDeviceIdentity, String> {
    let mut store = LocalDeviceIdentityStore::load(&local_identity_path(storage_root));
    store.get_or_create(fallback_label)
}

async fn load_or_create_identity_blocking(
    storage_root: PathBuf,
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
#[serde(rename_all = "snake_case")]
pub enum MobileHostPlatform {
    Ios,
    Android,
}

impl MobileHostPlatform {
    pub fn as_str(self) -> &'static str {
        match self {
            Self::Ios => "ios",
            Self::Android => "android",
        }
    }
}

#[derive(Debug, Clone, Copy, Serialize, Deserialize, PartialEq, Eq)]
pub enum MobileHostPhase {
    Idle,
    Pairing,
    Ready,
    Error,
}

#[derive(Debug, Clone, Serialize, Deserialize)]
pub struct MobilePairingOffer {
    pub session_id: String,
    pub relay_base_url: String,
    pub device_label: String,
    pub expires_at_ms: u64,
    #[serde(default)]
    pub platform: Option<String>,
}

impl MobilePairingOffer {
    fn from_offer(offer: PairingOffer, platform: MobileHostPlatform) -> Self {
        Self {
            session_id: offer.session_id,
            relay_base_url: offer.relay_base_url,
            device_label: offer.device_label,
            expires_at_ms: offer.expires_at_ms,
            platform: Some(platform.as_str().to_string()),
        }
    }
}

#[derive(Debug, Clone, Serialize, Deserialize)]
pub struct MobileHostStatus {
    pub phase: MobileHostPhase,
    pub platform: String,
    pub relay_url: Option<String>,
    pub device_id: Option<String>,
    pub device_label: Option<String>,
    pub pairing_pin: Option<String>,
    pub pairing_offer: Option<MobilePairingOffer>,
    pub expires_at_ms: Option<u64>,
    pub presence: Option<HostPresence>,
    pub paired_peer_id: Option<String>,
    pub connected_peers: Vec<ConnectedPeer>,
    pub error: Option<String>,
}

impl MobileHostStatus {
    fn idle(platform: MobileHostPlatform) -> Self {
        Self {
            phase: MobileHostPhase::Idle,
            platform: platform.as_str().to_string(),
            relay_url: None,
            device_id: None,
            device_label: None,
            pairing_pin: None,
            pairing_offer: None,
            expires_at_ms: None,
            presence: None,
            paired_peer_id: None,
            connected_peers: Vec::new(),
            error: None,
        }
    }
}

#[derive(Debug, Clone, Serialize, Deserialize, Default)]
struct PersistedMobileHostMode {
    relay_url: Option<String>,
    device_label: Option<String>,
    enabled: bool,
    updated_at: u64,
}

#[derive(Debug, Clone, Serialize, Deserialize)]
pub struct MobileHostPairedPeer {
    pub peer_id: String,
    pub label: String,
    pub relay_url: String,
    pub last_seen: u64,
    pub paired_at: u64,
    pub platform: String,
}

#[derive(Debug, Clone, Serialize, Deserialize)]
struct PairingHello {
    peer_id: String,
    peer_label: String,
    peer_pubkey_hex: String,
    platform: String,
}

pub struct AndroidHostRuntimeState {
    status: Mutex<Option<MobileHostStatus>>,
    responder_task: HostResponderTaskRuntime,
}

impl AndroidHostRuntimeState {
    pub fn new() -> Self {
        Self {
            status: Mutex::new(None),
            responder_task: HostResponderTaskRuntime::new(),
        }
    }

    fn set_status(
        &self,
        connected_peers: Vec<ConnectedPeer>,
        mutator: impl FnOnce(&mut MobileHostStatus),
    ) -> Result<MobileHostStatus, String> {
        let mut guard = self
            .status
            .lock()
            .map_err(|_| "Android host status mutex poisoned".to_string())?;
        let state =
            guard.get_or_insert_with(|| MobileHostStatus::idle(MobileHostPlatform::Android));
        mutator(state);
        state.connected_peers = connected_peers;
        Ok(state.clone())
    }

    fn status(&self, connected_peers: Vec<ConnectedPeer>) -> Result<MobileHostStatus, String> {
        let mut status = self
            .status
            .lock()
            .map_err(|_| "Android host status mutex poisoned".to_string())?
            .clone()
            .unwrap_or_else(|| MobileHostStatus::idle(MobileHostPlatform::Android));
        status.connected_peers = connected_peers;
        Ok(status)
    }

    fn begin_responder_task(&self) -> Result<u64, String> {
        self.responder_task
            .begin("Android host responder mutex poisoned")
    }

    fn store_responder_task(
        &self,
        generation: u64,
        handle: tauri::async_runtime::JoinHandle<()>,
    ) -> Result<(), String> {
        self.responder_task
            .store(generation, handle, "Android host responder mutex poisoned")
    }

    fn cancel_responder_task(&self) -> Result<(), String> {
        self.responder_task
            .cancel("Android host responder mutex poisoned")
    }

    fn is_responder_generation_current(&self, generation: u64) -> bool {
        self.responder_task.is_generation_current(generation)
    }

    fn clear_responder_task_if_current(&self, generation: u64) -> Result<(), String> {
        self.responder_task
            .clear_if_current(generation, "Android host responder mutex poisoned")
    }
}

impl Default for AndroidHostRuntimeState {
    fn default() -> Self {
        Self::new()
    }
}

fn load_persisted_host_mode(storage_root: &Path) -> PersistedMobileHostMode {
    let path = host_mode_path(storage_root);
    crate::helpers::storage::read_json_or_default(&path, "network: android host mode")
}

async fn load_persisted_host_mode_blocking(
    storage_root: PathBuf,
    task_label: &'static str,
) -> Result<PersistedMobileHostMode, String> {
    tauri::async_runtime::spawn_blocking(move || load_persisted_host_mode(&storage_root))
        .await
        .map_err(|error| format!("{task_label} task failed: {error}"))
}

fn save_persisted_host_mode(
    storage_root: &Path,
    mut config: PersistedMobileHostMode,
) -> Result<(), String> {
    config.updated_at = now_secs();
    crate::helpers::storage::write_json_pretty_atomic(&host_mode_path(storage_root), &config)
        .map_err(|e| format!("write mobile host mode: {e}"))
}

fn update_persisted_host_mode(
    storage_root: &Path,
    relay_url: Option<&str>,
    enabled: bool,
    device_label: Option<&str>,
) -> Result<(), String> {
    let mut config = load_persisted_host_mode(storage_root);
    if let Some(url) = relay_url.map(str::trim).filter(|url| !url.is_empty()) {
        config.relay_url = Some(url.to_string());
    }
    if let Some(label) = device_label
        .map(str::trim)
        .filter(|label| !label.is_empty())
    {
        config.device_label = Some(label.to_string());
    }
    config.enabled = enabled;
    save_persisted_host_mode(storage_root, config)
}

async fn update_persisted_host_mode_blocking(
    storage_root: PathBuf,
    relay_url: Option<String>,
    enabled: bool,
    device_label: Option<String>,
    task_label: &'static str,
) -> Result<(), String> {
    tauri::async_runtime::spawn_blocking(move || {
        update_persisted_host_mode(
            &storage_root,
            relay_url.as_deref(),
            enabled,
            device_label.as_deref(),
        )
    })
    .await
    .map_err(|error| format!("{task_label} task failed: {error}"))?
}

fn current_connected_peers(
    acceptor_runtime: &MobileAcceptorRuntimeState,
) -> Result<Vec<ConnectedPeer>, String> {
    Ok(mobile_acceptor::get_status(acceptor_runtime)?.connected_peers)
}

fn set_android_status(
    runtime: &AndroidHostRuntimeState,
    acceptor_runtime: &MobileAcceptorRuntimeState,
    mutator: impl FnOnce(&mut MobileHostStatus),
) -> Result<MobileHostStatus, String> {
    runtime.set_status(current_connected_peers(acceptor_runtime)?, mutator)
}

fn android_status(
    runtime: &AndroidHostRuntimeState,
    acceptor_runtime: &MobileAcceptorRuntimeState,
) -> Result<MobileHostStatus, String> {
    runtime.status(current_connected_peers(acceptor_runtime)?)
}

fn has_effective_ready_presence(presence: Option<&HostPresence>) -> bool {
    presence.is_some_and(|presence| presence.status == "ready" && presence.expires_at_ms > now_ms())
}

async fn publish_android_presence_inner(
    runtime: Arc<AndroidHostRuntimeState>,
    acceptor_runtime: Arc<MobileAcceptorRuntimeState>,
    relay_url: &str,
    storage_root: &Path,
) -> Result<MobileHostStatus, String> {
    let identity = load_or_create_identity_blocking(
        storage_root.to_path_buf(),
        "ChromVoid Android".to_string(),
        "Android host presence identity",
    )
    .await?;
    let acceptor = mobile_acceptor::get_status(&acceptor_runtime)?;
    let room_id = acceptor
        .room_id
        .clone()
        .ok_or("acceptor has no active room_id".to_string())?;
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

    if let Err(error) = update_persisted_host_mode_blocking(
        storage_root.to_path_buf(),
        Some(relay_url.to_string()),
        true,
        Some(identity.device_label.clone()),
        "Android host mode presence persistence",
    )
    .await
    {
        warn!("mobile_host: failed to persist android host mode: {error}");
    }

    set_android_status(&runtime, &acceptor_runtime, |state| {
        state.phase = MobileHostPhase::Ready;
        state.platform = MobileHostPlatform::Android.as_str().to_string();
        state.relay_url = Some(relay_url.to_string());
        state.device_id = Some(identity.device_id.clone());
        state.device_label = Some(identity.device_label.clone());
        state.presence = Some(presence);
        state.error = None;
    })
}

pub fn android_host_status(
    runtime: &AndroidHostRuntimeState,
    acceptor_runtime: &MobileAcceptorRuntimeState,
) -> Result<MobileHostStatus, String> {
    android_status(runtime, acceptor_runtime)
}

pub async fn start_android_host_mode(
    runtime: Arc<AndroidHostRuntimeState>,
    acceptor_runtime: Arc<MobileAcceptorRuntimeState>,
    adapter: Option<Arc<Mutex<Box<dyn CoreAdapter>>>>,
    relay_url: &str,
    storage_root: &Path,
    fallback_label: &str,
) -> Result<MobileHostStatus, String> {
    if relay_url.trim().is_empty() {
        return Err("relay_url is required".to_string());
    }

    let identity = load_or_create_identity_blocking(
        storage_root.to_path_buf(),
        fallback_label.to_string(),
        "Android host mode identity",
    )
    .await?;

    if let Err(error) = update_persisted_host_mode_blocking(
        storage_root.to_path_buf(),
        Some(relay_url.to_string()),
        false,
        Some(identity.device_label.clone()),
        "Android host mode pairing persistence",
    )
    .await
    {
        warn!("mobile_host: failed to persist android pairing config: {error}");
    }

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

    let responder_generation = runtime.begin_responder_task()?;
    let status = match set_android_status(&runtime, &acceptor_runtime, |state| {
        state.phase = MobileHostPhase::Pairing;
        state.platform = MobileHostPlatform::Android.as_str().to_string();
        state.relay_url = Some(relay_url.to_string());
        state.device_id = Some(identity.device_id.clone());
        state.device_label = Some(identity.device_label.clone());
        state.pairing_pin = Some(session.pin.clone());
        state.pairing_offer = Some(MobilePairingOffer::from_offer(
            session.offer.clone(),
            MobileHostPlatform::Android,
        ));
        state.expires_at_ms = Some(session.expires_at_ms);
        state.presence = None;
        state.paired_peer_id = None;
        state.error = None;
    }) {
        Ok(status) => status,
        Err(error) => {
            let _ = runtime.cancel_responder_task();
            return Err(error);
        }
    };

    let storage_root = storage_root.to_path_buf();
    let runtime_clone = runtime.clone();
    let acceptor_runtime_clone = acceptor_runtime.clone();
    let adapter_clone = adapter.clone();
    let responder_handle = tauri::async_runtime::spawn(async move {
        if let Err(error) = run_android_pairing_responder(
            runtime_clone.clone(),
            acceptor_runtime_clone,
            adapter_clone,
            session,
            storage_root,
            identity,
            responder_generation,
        )
        .await
        {
            warn!("mobile_host: android host mode failed: {error}");
            if runtime_clone.is_responder_generation_current(responder_generation) {
                let _ = runtime_clone.set_status(Vec::new(), |state| {
                    state.phase = MobileHostPhase::Error;
                    state.error = Some(error);
                });
            }
        }
        let _ = runtime_clone.clear_responder_task_if_current(responder_generation);
    });
    if let Err(error) = runtime.store_responder_task(responder_generation, responder_handle) {
        let _ = runtime.set_status(Vec::new(), |state| {
            state.phase = MobileHostPhase::Error;
            state.error = Some(error.clone());
        });
        return Err(error);
    }

    Ok(status)
}

pub async fn stop_android_host_mode(
    runtime: Arc<AndroidHostRuntimeState>,
    acceptor_runtime: Arc<MobileAcceptorRuntimeState>,
    storage_root: &Path,
) -> Result<MobileHostStatus, String> {
    runtime.cancel_responder_task()?;
    let current = android_status(&runtime, &acceptor_runtime)?;
    let _ = mobile_acceptor::stop_listening(&acceptor_runtime);

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

    if let Err(error) = update_persisted_host_mode_blocking(
        storage_root.to_path_buf(),
        current.relay_url.clone(),
        false,
        current.device_label.clone(),
        "Android host mode disable persistence",
    )
    .await
    {
        warn!("mobile_host: failed to disable android host mode: {error}");
    }

    set_android_status(&runtime, &acceptor_runtime, |state| {
        *state = MobileHostStatus::idle(MobileHostPlatform::Android)
    })
}

pub async fn shutdown_android_host_mode_for_app_exit(
    runtime: Arc<AndroidHostRuntimeState>,
    acceptor_runtime: Arc<MobileAcceptorRuntimeState>,
) -> Result<MobileHostStatus, String> {
    let cancel_result = runtime.cancel_responder_task();
    let current = match android_status(&runtime, &acceptor_runtime) {
        Ok(status) => Some(status),
        Err(error) => {
            warn!("mobile_host: failed to read android host status during app exit: {error}");
            None
        }
    };

    if let Err(error) = mobile_acceptor::stop_listening(&acceptor_runtime) {
        warn!("mobile_host: failed to stop mobile acceptor during app exit: {error}");
    }

    if let Some(current) = current.as_ref() {
        publish_offline_presence_for_app_exit(current).await;
    }

    let status_result = set_android_status(&runtime, &acceptor_runtime, |state| {
        *state = MobileHostStatus::idle(MobileHostPlatform::Android)
    });

    if let Err(error) = cancel_result {
        return Err(error);
    }
    status_result
}

async fn publish_offline_presence_for_app_exit(current: &MobileHostStatus) {
    let (Some(relay_url), Some(device_id), Some(presence)) = (
        current.relay_url.as_ref(),
        current.device_id.as_ref(),
        current.presence.as_ref(),
    ) else {
        return;
    };

    let request = PublishHostPresenceRequest {
        relay_url: relay_url.clone(),
        room_id: presence.room_id.clone(),
        status: "offline".to_string(),
        ttl_ms: Some(1_000),
    };
    match tokio::time::timeout(
        APP_EXIT_OFFLINE_PRESENCE_TIMEOUT,
        publish_host_presence(relay_url, device_id, &request),
    )
    .await
    {
        Ok(Ok(_)) => {}
        Ok(Err(error)) => {
            warn!(
                "mobile_host: failed to publish android offline presence during app exit: {error}"
            );
        }
        Err(_) => {
            warn!(
                "mobile_host: android offline presence publish timed out after {:?} during app exit",
                APP_EXIT_OFFLINE_PRESENCE_TIMEOUT
            );
        }
    }
}

pub async fn publish_android_presence(
    runtime: Arc<AndroidHostRuntimeState>,
    acceptor_runtime: Arc<MobileAcceptorRuntimeState>,
    relay_url: &str,
    storage_root: &Path,
) -> Result<MobileHostStatus, String> {
    publish_android_presence_inner(runtime, acceptor_runtime, relay_url, storage_root).await
}

pub async fn resume_android_host_mode_if_enabled(
    runtime: Arc<AndroidHostRuntimeState>,
    acceptor_runtime: Arc<MobileAcceptorRuntimeState>,
    adapter: Option<Arc<Mutex<Box<dyn CoreAdapter>>>>,
    storage_root: &Path,
) -> Result<Option<MobileHostStatus>, String> {
    let config =
        load_persisted_host_mode_blocking(storage_root.to_path_buf(), "Android host mode load")
            .await?;
    if !config.enabled {
        return Ok(None);
    }

    let relay_url = config
        .relay_url
        .as_deref()
        .map(str::trim)
        .filter(|url| !url.is_empty())
        .ok_or("android host mode is enabled but relay_url is missing".to_string())?;

    let status = android_status(&runtime, &acceptor_runtime)?;
    let acceptor = mobile_acceptor::get_status(&acceptor_runtime)?;
    let acceptor_active = matches!(
        acceptor.state,
        mobile_acceptor::AcceptorState::Listening | mobile_acceptor::AcceptorState::Connected
    ) && acceptor.relay_url.as_deref() == Some(relay_url);

    if acceptor_active && has_effective_ready_presence(status.presence.as_ref()) {
        return Ok(Some(status));
    }

    if acceptor_active {
        return publish_android_presence_inner(runtime, acceptor_runtime, relay_url, storage_root)
            .await
            .map(Some);
    }

    let room_id = generate_room_id_for("android_resume_host_mode");
    let _ = mobile_acceptor::stop_listening(&acceptor_runtime);
    mobile_acceptor::start_listening(
        acceptor_runtime.clone(),
        adapter,
        relay_url,
        &room_id,
        storage_root,
    )
    .await?;
    publish_android_presence_inner(runtime, acceptor_runtime, relay_url, storage_root)
        .await
        .map(Some)
}

pub(crate) fn schedule_android_host_mode_resume(
    task_lifecycle: Arc<crate::task_lifecycle::TaskLifecycleRuntime>,
    runtime: Arc<AndroidHostRuntimeState>,
    acceptor_runtime: Arc<MobileAcceptorRuntimeState>,
    adapter: Option<Arc<Mutex<Box<dyn CoreAdapter>>>>,
    storage_root: PathBuf,
    context: &'static str,
) -> Result<(), String> {
    task_lifecycle.spawn_unique_async(
        crate::task_lifecycle::ManagedTaskName::AndroidHostModeResume,
        move |mut shutdown_rx| async move {
            let resume = resume_android_host_mode_if_enabled(
                runtime,
                acceptor_runtime,
                adapter,
                &storage_root,
            );
            tokio::select! {
                result = resume => {
                    if let Err(error) = result {
                        warn!(
                            "android mobile host resume failed: context={} error={}",
                            context, error
                        );
                    }
                }
                changed = shutdown_rx.changed() => {
                    if changed.is_ok() && shutdown_rx.borrow().is_some() {
                        info!(
                            "android mobile host resume stopped by lifecycle shutdown: context={}",
                            context
                        );
                    }
                }
            }
        },
    )
}

pub async fn desktop_pair_android_host(
    offer: &MobilePairingOffer,
    pin: &str,
    storage_root: &Path,
    fallback_label: &str,
) -> Result<MobileHostPairedPeer, String> {
    let (peer, paired) =
        desktop_pair_android_host_peer(offer, pin, storage_root, fallback_label).await?;
    persist_desktop_paired_android_host(storage_root, peer)?;
    Ok(paired)
}

pub async fn desktop_pair_android_host_peer(
    offer: &MobilePairingOffer,
    pin: &str,
    storage_root: &Path,
    fallback_label: &str,
) -> Result<(PairedPeer, MobileHostPairedPeer), String> {
    let session = fetch_pairing_session(&offer.relay_base_url, &offer.session_id).await?;
    if session.expires_at_ms <= now_ms() {
        return Err("pairing offer expired".to_string());
    }

    let identity = load_or_create_identity_blocking(
        storage_root.to_path_buf(),
        fallback_label.to_string(),
        "Desktop Android host pair identity",
    )
    .await?;
    let local_privkey = hex::decode(&identity.static_privkey_hex)
        .map_err(|e| format!("invalid local identity privkey: {e}"))?;
    let mut transport = Box::new(
        WssTransport::connect_with_context(
            &session.relay_url,
            &session.room_id,
            "desktop_pair_android_host",
        )
        .await?,
    ) as Box<dyn RemoteTransport>;
    let mut noise = xxpsk0_initiator(transport.as_mut(), &local_privkey, &pin_to_psk(pin)).await?;

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
    let remote = recv_pairing_hello(transport.as_mut(), &mut noise).await?;
    let remote_static_hex = hex::encode(noise.remote_pubkey());
    if remote.peer_pubkey_hex != remote_static_hex {
        return Err("pairing hello pubkey mismatch".to_string());
    }

    let peer = PairedPeer {
        peer_id: remote.peer_id,
        label: remote.peer_label,
        relay_url: session.relay_url,
        peer_pubkey: noise.remote_pubkey().to_vec(),
        client_pubkey: hex::decode(&identity.static_pubkey_hex)
            .map_err(|e| format!("invalid local identity pubkey: {e}"))?,
        client_privkey_hex: identity.static_privkey_hex.clone(),
        last_seen: now_secs(),
        paired_at: now_secs(),
        platform: "android".to_string(),
    };

    let paired = MobileHostPairedPeer {
        peer_id: peer.peer_id.clone(),
        label: peer.label.clone(),
        relay_url: peer.relay_url.clone(),
        last_seen: peer.last_seen,
        paired_at: peer.paired_at,
        platform: peer.platform.clone(),
    };

    Ok((peer, paired))
}

pub fn persist_desktop_paired_android_host(
    storage_root: &Path,
    peer: PairedPeer,
) -> Result<(), String> {
    persist_paired_peer_to_legacy_store(storage_root, peer)
}

fn persist_paired_peer_to_legacy_store(
    storage_root: &Path,
    peer: PairedPeer,
) -> Result<(), String> {
    let mut store = PairedPeerStore::load(&legacy_peers_path(storage_root));
    store.upsert(peer);
    store.save()
}

async fn persist_paired_peer_to_legacy_store_blocking(
    storage_root: PathBuf,
    peer: PairedPeer,
    task_label: &'static str,
) -> Result<(), String> {
    tauri::async_runtime::spawn_blocking(move || {
        persist_paired_peer_to_legacy_store(&storage_root, peer)
    })
    .await
    .map_err(|error| format!("{task_label} task failed: {error}"))?
}

async fn run_android_pairing_responder(
    runtime: Arc<AndroidHostRuntimeState>,
    acceptor_runtime: Arc<MobileAcceptorRuntimeState>,
    adapter: Option<Arc<Mutex<Box<dyn CoreAdapter>>>>,
    session: CreatePairingSessionResponse,
    storage_root: PathBuf,
    identity: LocalDeviceIdentity,
    responder_generation: u64,
) -> Result<(), String> {
    let local_privkey = hex::decode(&identity.static_privkey_hex)
        .map_err(|e| format!("invalid local identity privkey: {e}"))?;
    let local_pubkey = hex::decode(&identity.static_pubkey_hex)
        .map_err(|e| format!("invalid local identity pubkey: {e}"))?;
    let mut transport = Box::new(
        WssTransport::connect_with_context(
            &session.relay_url,
            &session.room_id,
            "android_pairing_responder",
        )
        .await?,
    ) as Box<dyn RemoteTransport>;
    let initial_msg_timeout = pairing_initial_wait_timeout(session.expires_at_ms);
    let mut noise = xxpsk0_responder(
        transport.as_mut(),
        &local_privkey,
        &pin_to_psk(&session.pin),
        initial_msg_timeout,
    )
    .await?;

    let remote = recv_pairing_hello(transport.as_mut(), &mut noise).await?;
    let remote_static = noise.remote_pubkey().to_vec();
    if remote.peer_pubkey_hex != hex::encode(&remote_static) {
        return Err("desktop pairing hello pubkey mismatch".to_string());
    }
    if !runtime.is_responder_generation_current(responder_generation) {
        return Ok(());
    }

    send_pairing_hello(
        transport.as_mut(),
        &mut noise,
        &PairingHello {
            peer_id: identity.device_id.clone(),
            peer_label: identity.device_label.clone(),
            peer_pubkey_hex: identity.static_pubkey_hex.clone(),
            platform: MobileHostPlatform::Android.as_str().to_string(),
        },
    )
    .await?;
    if !runtime.is_responder_generation_current(responder_generation) {
        return Ok(());
    }

    let paired_peer = PairedPeer {
        peer_id: remote.peer_id.clone(),
        label: remote.peer_label.clone(),
        relay_url: session.relay_url.clone(),
        peer_pubkey: remote_static,
        client_pubkey: local_pubkey,
        client_privkey_hex: identity.static_privkey_hex.clone(),
        last_seen: now_secs(),
        paired_at: now_secs(),
        platform: remote.platform,
    };
    persist_paired_peer_to_legacy_store_blocking(
        storage_root.clone(),
        paired_peer,
        "Android pairing responder peer persistence",
    )
    .await?;

    let host_room_id = generate_room_id_for("android_post_pairing_ready_host");
    let _ = mobile_acceptor::stop_listening(&acceptor_runtime);
    mobile_acceptor::start_listening(
        acceptor_runtime.clone(),
        adapter,
        &session.relay_url,
        &host_room_id,
        &storage_root,
    )
    .await?;
    if !runtime.is_responder_generation_current(responder_generation) {
        return Ok(());
    }
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

    if let Err(error) = update_persisted_host_mode_blocking(
        storage_root.clone(),
        Some(session.relay_url.clone()),
        true,
        Some(identity.device_label.clone()),
        "Android host mode ready persistence",
    )
    .await
    {
        warn!("mobile_host: failed to persist ready android host mode: {error}");
    }
    if !runtime.is_responder_generation_current(responder_generation) {
        return Ok(());
    }

    set_android_status(&runtime, &acceptor_runtime, |state| {
        state.phase = MobileHostPhase::Ready;
        state.platform = MobileHostPlatform::Android.as_str().to_string();
        state.relay_url = Some(session.relay_url.clone());
        state.device_id = Some(identity.device_id.clone());
        state.device_label = Some(identity.device_label.clone());
        state.pairing_pin = Some(session.pin.clone());
        state.pairing_offer = Some(MobilePairingOffer::from_offer(
            session.offer.clone(),
            MobileHostPlatform::Android,
        ));
        state.expires_at_ms = Some(session.expires_at_ms);
        state.presence = Some(presence);
        state.paired_peer_id = Some(remote.peer_id);
        state.error = None;
    })?;
    Ok(())
}

async fn send_pairing_hello(
    transport: &mut dyn RemoteTransport,
    noise: &mut NoiseTransport,
    hello: &PairingHello,
) -> Result<(), String> {
    let payload = serde_json::to_vec(hello).map_err(|e| format!("serialize pairing hello: {e}"))?;
    let encrypted = noise
        .encrypt(&payload)
        .map_err(|e| format!("encrypt pairing hello: {e}"))?;
    transport
        .send(&encrypted)
        .await
        .map_err(|e| format!("send pairing hello: {e}"))
}

fn pairing_initial_wait_timeout(expires_at_ms: u64) -> Duration {
    let remaining_ms = expires_at_ms.saturating_sub(now_ms());
    PAIRING_INITIAL_WAIT_FLOOR.max(Duration::from_millis(remaining_ms))
}

async fn recv_pairing_hello(
    transport: &mut dyn RemoteTransport,
    noise: &mut NoiseTransport,
) -> Result<PairingHello, String> {
    let encrypted = recv_with_timeout(transport, "pairing hello recv").await?;
    let decrypted = noise
        .decrypt(&encrypted)
        .map_err(|e| format!("decrypt pairing hello: {e}"))?;
    serde_json::from_slice(&decrypted).map_err(|e| format!("decode pairing hello: {e}"))
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
    let mut handshake = snow::Builder::new(params)
        .local_private_key(local_privkey)
        .map_err(|e| format!("local_private_key: {e}"))?
        .psk(0, psk)
        .map_err(|e| format!("psk: {e}"))?
        .build_initiator()
        .map_err(|e| format!("build_initiator: {e}"))?;

    let mut buf = vec![0u8; MAX_HANDSHAKE_MSG];
    let len = handshake
        .write_message(&[], &mut buf)
        .map_err(|e| format!("xxpsk0 msg1 write: {e}"))?;
    transport
        .send(&buf[..len])
        .await
        .map_err(|e| format!("xxpsk0 msg1 send: {e}"))?;

    let msg2 = recv_with_timeout(transport, "xxpsk0 msg2 recv").await?;
    handshake
        .read_message(&msg2, &mut buf)
        .map_err(|e| format!("xxpsk0 msg2 read: {e}"))?;

    let len = handshake
        .write_message(&[], &mut buf)
        .map_err(|e| format!("xxpsk0 msg3 write: {e}"))?;
    transport
        .send(&buf[..len])
        .await
        .map_err(|e| format!("xxpsk0 msg3 send: {e}"))?;

    let remote_static = handshake
        .get_remote_static()
        .ok_or("xxpsk0: no remote static key")?
        .to_vec();
    let transport = handshake
        .into_transport_mode()
        .map_err(|e| format!("xxpsk0 into_transport_mode: {e}"))?;
    Ok(NoiseTransport::new(transport, remote_static))
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
    let mut handshake = snow::Builder::new(params)
        .local_private_key(local_privkey)
        .map_err(|e| format!("local_private_key: {e}"))?
        .psk(0, psk)
        .map_err(|e| format!("psk: {e}"))?
        .build_responder()
        .map_err(|e| format!("build_responder: {e}"))?;

    let mut buf = vec![0u8; MAX_HANDSHAKE_MSG];
    let msg1 = recv_with_timeout_for(transport, "xxpsk0 msg1 recv", initial_msg_timeout).await?;
    handshake
        .read_message(&msg1, &mut buf)
        .map_err(|e| format!("xxpsk0 msg1 read: {e}"))?;

    let len = handshake
        .write_message(&[], &mut buf)
        .map_err(|e| format!("xxpsk0 msg2 write: {e}"))?;
    transport
        .send(&buf[..len])
        .await
        .map_err(|e| format!("xxpsk0 msg2 send: {e}"))?;

    let msg3 = recv_with_timeout(transport, "xxpsk0 msg3 recv").await?;
    handshake
        .read_message(&msg3, &mut buf)
        .map_err(|e| format!("xxpsk0 msg3 read: {e}"))?;

    let remote_static = handshake
        .get_remote_static()
        .ok_or("xxpsk0: no remote static key")?
        .to_vec();
    let transport = handshake
        .into_transport_mode()
        .map_err(|e| format!("xxpsk0 into_transport_mode: {e}"))?;
    Ok(NoiseTransport::new(transport, remote_static))
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
    timeout: Duration,
) -> Result<Vec<u8>, String> {
    tokio::time::timeout(timeout, transport.recv())
        .await
        .map_err(|_| format!("{label}: timeout"))?
        .map_err(|e| format!("{label}: {e}"))
}

#[cfg(test)]
mod tests {
    use super::*;
    use std::sync::atomic::{AtomicBool, Ordering};

    struct DropFlag(Arc<AtomicBool>);

    impl Drop for DropFlag {
        fn drop(&mut self) {
            self.0.store(true, Ordering::Release);
        }
    }

    #[tokio::test]
    async fn android_responder_replacement_invalidates_and_aborts_previous_task() {
        let runtime = AndroidHostRuntimeState::new();
        let generation = runtime.begin_responder_task().expect("begin responder");
        let dropped = Arc::new(AtomicBool::new(false));
        let drop_flag = DropFlag(dropped.clone());
        let handle = tauri::async_runtime::spawn(async move {
            let _drop_flag = drop_flag;
            std::future::pending::<()>().await;
        });
        runtime
            .store_responder_task(generation, handle)
            .expect("store responder");

        let replacement_generation = runtime.begin_responder_task().expect("replace responder");

        assert!(!runtime.is_responder_generation_current(generation));
        assert!(runtime.is_responder_generation_current(replacement_generation));
        tokio::time::sleep(Duration::from_millis(20)).await;
        assert!(dropped.load(Ordering::Acquire));
    }

    #[tokio::test]
    async fn android_responder_cancel_invalidates_generation() {
        let runtime = AndroidHostRuntimeState::new();
        let generation = runtime.begin_responder_task().expect("begin responder");
        let handle = tauri::async_runtime::spawn(async {});
        runtime
            .store_responder_task(generation, handle)
            .expect("store responder");

        runtime.cancel_responder_task().expect("cancel responder");

        assert!(!runtime.is_responder_generation_current(generation));
        assert!(!runtime
            .responder_task
            .has_task_for_test("Android host responder mutex poisoned")
            .expect("responder task status"));
    }

    #[tokio::test]
    async fn android_responder_clear_only_clears_current_generation() {
        let runtime = AndroidHostRuntimeState::new();
        let generation = runtime.begin_responder_task().expect("begin responder");
        let handle = tauri::async_runtime::spawn(async {});
        runtime
            .store_responder_task(generation, handle)
            .expect("store responder");

        runtime
            .clear_responder_task_if_current(generation.saturating_sub(1))
            .expect("clear stale generation");
        assert!(runtime
            .responder_task
            .has_task_for_test("Android host responder mutex poisoned")
            .expect("responder task status"));

        runtime
            .clear_responder_task_if_current(generation)
            .expect("clear current generation");
        assert!(!runtime
            .responder_task
            .has_task_for_test("Android host responder mutex poisoned")
            .expect("responder task status"));
    }

    #[tokio::test]
    async fn android_app_exit_shutdown_cancels_responder_and_resets_status() {
        let runtime = Arc::new(AndroidHostRuntimeState::new());
        let acceptor_runtime = Arc::new(MobileAcceptorRuntimeState::new());
        let generation = runtime.begin_responder_task().expect("begin responder");
        let handle = tauri::async_runtime::spawn(std::future::pending::<()>());
        runtime
            .store_responder_task(generation, handle)
            .expect("store responder");

        let status = shutdown_android_host_mode_for_app_exit(runtime.clone(), acceptor_runtime)
            .await
            .expect("app exit shutdown");

        assert_eq!(status.phase, MobileHostPhase::Idle);
        assert!(!runtime.is_responder_generation_current(generation));
        assert!(!runtime
            .responder_task
            .has_task_for_test("Android host responder mutex poisoned")
            .expect("responder task status"));
    }

    #[test]
    fn android_responder_poison_returns_controlled_error() {
        let runtime = AndroidHostRuntimeState::new();
        let _ = std::panic::catch_unwind(std::panic::AssertUnwindSafe(|| {
            runtime.responder_task.poison_for_test();
        }));

        assert_eq!(
            runtime
                .begin_responder_task()
                .expect_err("poison should fail"),
            "Android host responder mutex poisoned"
        );
    }
}
