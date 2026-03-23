//! Mobile Core Host acceptor — listens for incoming Desktop connections.
//!
//! Manages the responder side of the network connection lifecycle:
//! signaling room join → peer identity verification → Noise handshake → io_task.
//!
//! State machine: `Idle → Listening → Handshaking → Connected → Disconnected`.
//!
//! Accepts both WebRTC DataChannel and WSS relay connections. WebRTC is attempted
//! first; if it fails, the acceptor falls back to WSS relay transport.
//!
//! For unknown peers (XX handshake with no matching pubkey in `PairedPeerStore`),
//! the handshake completes but the connection is delegated to the pairing flow
//! via `pairing::confirm_pairing` semantics rather than hard-rejected.

use std::io::Read as _;
use std::sync::Arc;
use std::sync::Mutex;
use std::time::{SystemTime, UNIX_EPOCH};

use chromvoid_core::rpc::types::{RpcRequest, RpcResponse, PROTOCOL_VERSION};
use chromvoid_core::rpc::{RpcInputStream, RpcReply, RpcStreamMeta};
use chromvoid_protocol::{
    frame_continuation, frame_from_heartbeat, Frame, FrameType, NoiseTransport, RemoteTransport,
    TransportType, FLAG_HAS_CONTINUATION,
};
use serde::{Deserialize, Serialize};
use tracing::{info, warn};

use super::connection::NetworkConnectionManager;
use super::paired_peers::{PairedPeer, PairedPeerStore};
use super::signaling::SignalingClient;
use crate::core_adapter::{CoreAdapter, LocalCoreAdapter};

// ── Types ──────────────────────────────────────────────────────────────

/// Acceptor lifecycle state.
#[derive(Debug, Clone, Copy, PartialEq, Eq, Serialize, Deserialize)]
#[serde(rename_all = "snake_case")]
pub enum AcceptorState {
    /// Not listening — default after creation or explicit stop.
    Idle,
    /// Signaling room joined, waiting for Desktop to connect.
    Listening,
    /// Noise handshake in progress with an incoming peer.
    Handshaking,
    /// At least one Desktop peer connected and io_task running.
    Connected,
    /// Connection lost unexpectedly (eligible for restart).
    Disconnected,
}

/// Information about a connected Desktop peer.
#[derive(Debug, Clone, Serialize, Deserialize)]
pub struct ConnectedPeer {
    pub peer_id: String,
    pub label: String,
    pub connected_at_ms: u64,
    pub transport_type: String,
}

/// Snapshot of the acceptor's current status returned to callers.
#[derive(Debug, Clone, Serialize)]
pub struct AcceptorStatus {
    pub state: AcceptorState,
    pub connected_peers: Vec<ConnectedPeer>,
    pub relay_url: Option<String>,
    pub room_id: Option<String>,
}

/// Outcome of a Noise handshake — either a known paired peer or an unknown peer
/// whose remote public key needs to be routed through the pairing flow.
enum HandshakeOutcome {
    /// Peer is known (found in `PairedPeerStore`). Ready for io_task.
    Paired {
        noise: NoiseTransport,
        peer_id: String,
        label: String,
    },
    /// Peer is unknown. The handshake completed (transport mode established)
    /// but the remote pubkey is not in the paired store. The caller should
    /// delegate to the pairing confirmation flow.
    UnknownPeer {
        _noise: NoiseTransport,
        remote_pubkey: Vec<u8>,
    },
}

// ── Internal state ─────────────────────────────────────────────────────

const HEARTBEAT_INTERVAL: std::time::Duration = std::time::Duration::from_secs(30);
const STREAM_CHUNK_SIZE: usize = 1024 * 1024;

fn frame_from_rpc_response(message_id: u64, resp: &RpcResponse) -> Frame {
    let payload = serde_json::to_vec(resp).unwrap_or_else(|_| b"{}".to_vec());
    Frame {
        frame_type: FrameType::RpcResponse,
        message_id,
        flags: 0,
        payload,
    }
}

fn frame_stream_meta_response(message_id: u64, meta: &RpcStreamMeta) -> Frame {
    let payload = serde_json::to_vec(meta).unwrap_or_else(|_| b"{}".to_vec());
    Frame {
        frame_type: FrameType::RpcResponse,
        message_id,
        flags: FLAG_HAS_CONTINUATION,
        payload,
    }
}

fn is_upload_stream_command(command: &str) -> bool {
    matches!(command, "catalog:upload" | "catalog:secret:write")
}

fn is_download_stream_command(command: &str) -> bool {
    matches!(
        command,
        "catalog:download" | "catalog:secret:read" | "vault:export:download"
    )
}

/// Per-peer connection tracking: NetworkConnectionManager for state + shutdown handle.
struct PeerConnection {
    conn_mgr: NetworkConnectionManager,
    shutdown_tx: Option<tokio::sync::oneshot::Sender<()>>,
}

struct AcceptorInner {
    state: AcceptorState,
    relay_url: Option<String>,
    room_id: Option<String>,
    connected_peers: Vec<ConnectedPeer>,
    /// Send `()` to shut down the background listener task.
    shutdown_tx: Option<tokio::sync::oneshot::Sender<()>>,
    /// Per-peer connection state: NetworkConnectionManager + io_task channel.
    peer_connections: Vec<(String, PeerConnection)>,
}

impl AcceptorInner {
    fn new() -> Self {
        Self {
            state: AcceptorState::Idle,
            relay_url: None,
            room_id: None,
            connected_peers: Vec::new(),
            shutdown_tx: None,
            peer_connections: Vec::new(),
        }
    }

    fn status(&self) -> AcceptorStatus {
        AcceptorStatus {
            state: self.state,
            connected_peers: self.connected_peers.clone(),
            relay_url: self.relay_url.clone(),
            room_id: self.room_id.clone(),
        }
    }
}

static ACCEPTOR: Mutex<Option<AcceptorInner>> = Mutex::new(None);
static SHARED_APP_ADAPTER: Mutex<Option<Arc<Mutex<Box<dyn CoreAdapter>>>>> = Mutex::new(None);

fn with_acceptor<F, R>(f: F) -> R
where
    F: FnOnce(&mut AcceptorInner) -> R,
{
    let mut guard = ACCEPTOR.lock().unwrap();
    let inner = guard.get_or_insert_with(AcceptorInner::new);
    f(inner)
}

pub fn register_shared_app_adapter(adapter: Arc<Mutex<Box<dyn CoreAdapter>>>) {
    let mut guard = SHARED_APP_ADAPTER.lock().unwrap();
    *guard = Some(adapter);
}

fn shared_app_adapter() -> Option<Arc<Mutex<Box<dyn CoreAdapter>>>> {
    SHARED_APP_ADAPTER.lock().unwrap().as_ref().cloned()
}

#[allow(dead_code)] // Used by tests and runtime listener loop
fn now_ms() -> u64 {
    SystemTime::now()
        .duration_since(UNIX_EPOCH)
        .map(|d| d.as_millis() as u64)
        .unwrap_or(0)
}

#[cfg(any(desktop, test))]
fn force_wss_acceptor_for_test() -> bool {
    cfg!(debug_assertions)
        && std::env::var("CHROMVOID_TEST_FORCE_WSS_ACCEPTOR")
            .ok()
            .as_deref()
            == Some("1")
}

// ── MobileAcceptor struct ─────────────────────────────────────────────

/// High-level API for the mobile acceptor.
///
/// Wraps the module-level static state and provides a struct-based interface
/// for starting/stopping the listener and querying status.
pub struct MobileAcceptor;

impl MobileAcceptor {
    /// Begin listening for incoming Desktop connections.
    pub async fn start(
        relay_url: &str,
        room_id: &str,
        storage_root: &std::path::Path,
    ) -> Result<AcceptorStatus, String> {
        start_listening(relay_url, room_id, storage_root).await
    }

    /// Stop listening and disconnect all peers.
    pub fn stop() -> AcceptorStatus {
        stop_listening()
    }

    /// Get current acceptor status + connected peers.
    pub fn status() -> AcceptorStatus {
        get_status()
    }

    /// Get list of currently connected Desktop peers.
    pub fn connected_peers() -> Vec<ConnectedPeer> {
        get_connected_peers()
    }
}

// ── Public API (free functions, used by Tauri commands) ────────────────

/// Begin listening for incoming Desktop connections.
///
/// On desktop builds this joins the relay signaling endpoint and awaits
/// WebRTC negotiation offers. On iOS/mobile builds it skips signaling
/// entirely and waits for direct WSS relay connections on the published room.
/// Returns the room_id that Desktop should target.
pub async fn start_listening(
    relay_url: &str,
    room_id: &str,
    storage_root: &std::path::Path,
) -> Result<AcceptorStatus, String> {
    if relay_url.is_empty() {
        return Err("relay_url is required".to_string());
    }
    if room_id.is_empty() {
        return Err("room_id is required".to_string());
    }

    // Prevent double-start.
    let current = with_acceptor(|a| a.state);
    info!(
        "mobile_acceptor: start_listening requested relay={} room_id={} current_state={:?}",
        relay_url, room_id, current
    );
    if matches!(
        current,
        AcceptorState::Listening | AcceptorState::Handshaking | AcceptorState::Connected
    ) {
        return Err(format!("acceptor already in {:?} state", current));
    }

    #[cfg(desktop)]
    let signaling = if force_wss_acceptor_for_test() {
        info!(
            "mobile_acceptor: skipping signaling room join on desktop due to forced WSS test override relay={} room_id={}",
            relay_url, room_id
        );
        None
    } else {
        Some(
            SignalingClient::connect(relay_url, room_id)
                .await
                .map_err(|e| format!("signaling connect failed: {e}"))?,
        )
    };

    #[cfg(not(desktop))]
    let signaling = {
        info!(
            "mobile_acceptor: skipping signaling room join for mobile-only listener relay={} room_id={}",
            relay_url, room_id
        );
        None
    };

    let (shutdown_tx, shutdown_rx) = tokio::sync::oneshot::channel::<()>();

    // Transition to Listening and store metadata.
    let relay_owned = relay_url.to_string();
    let room_owned = room_id.to_string();
    let status = with_acceptor(|a| {
        a.state = AcceptorState::Listening;
        a.relay_url = Some(relay_owned.clone());
        a.room_id = Some(room_owned.clone());
        a.connected_peers.clear();
        a.peer_connections.clear();
        a.shutdown_tx = Some(shutdown_tx);
        a.status()
    });

    let storage_root = storage_root.to_path_buf();

    // Spawn background listener task.
    tokio::spawn(async move {
        listener_loop(
            signaling,
            shutdown_rx,
            storage_root,
            relay_owned,
            room_owned,
        )
        .await;
    });

    info!(
        "mobile_acceptor: listening relay={} room_id={} state={:?}",
        relay_url, room_id, status.state
    );
    Ok(status)
}

/// Stop listening and disconnect all peers.
pub fn stop_listening() -> AcceptorStatus {
    with_acceptor(|a| {
        // Signal the background task to shut down.
        if let Some(tx) = a.shutdown_tx.take() {
            let _ = tx.send(());
        }
        // Disconnect all peer connection managers.
        for (_id, pc) in a.peer_connections.iter_mut() {
            pc.conn_mgr.disconnect();
            if let Some(tx) = pc.shutdown_tx.take() {
                let _ = tx.send(());
            }
        }
        a.state = AcceptorState::Idle;
        a.relay_url = None;
        a.room_id = None;
        a.connected_peers.clear();
        a.peer_connections.clear();
        info!("Mobile acceptor stopped");
        a.status()
    })
}

/// Get current acceptor status + connected peers.
pub fn get_status() -> AcceptorStatus {
    with_acceptor(|a| a.status())
}

/// Get list of currently connected Desktop peers.
pub fn get_connected_peers() -> Vec<ConnectedPeer> {
    with_acceptor(|a| a.connected_peers.clone())
}

// ── Peer management (called from listener task) ────────────────────────

/// Record a new connected peer. Transitions state to Connected.
#[allow(dead_code)] // Called by listener task at runtime
pub(crate) fn add_connected_peer(peer: ConnectedPeer) {
    with_acceptor(|a| {
        a.connected_peers.push(peer);
        a.state = AcceptorState::Connected;
    });
}

/// Remove a peer by ID. If no peers left, transitions to Listening.
#[allow(dead_code)] // Called by listener task at runtime
pub(crate) fn remove_connected_peer(peer_id: &str) {
    with_acceptor(|a| {
        a.connected_peers.retain(|p| p.peer_id != peer_id);
        a.peer_connections.retain(|(id, _)| id != peer_id);
        if a.connected_peers.is_empty()
            && (a.state == AcceptorState::Connected || a.state == AcceptorState::Handshaking)
        {
            // Back to listening if relay is still up.
            a.state = if a.relay_url.is_some() {
                AcceptorState::Listening
            } else {
                AcceptorState::Idle
            };
        }
    });
}

/// Transition to Handshaking state (called when signaling offer received).
pub(crate) fn set_handshaking() {
    with_acceptor(|a| {
        if a.state == AcceptorState::Listening {
            a.state = AcceptorState::Handshaking;
        }
    });
}

/// Transition to Disconnected state (called on unexpected connection loss).
#[allow(dead_code)] // Called on unexpected connection loss at runtime
pub(crate) fn set_disconnected() {
    with_acceptor(|a| {
        a.state = AcceptorState::Disconnected;
        a.connected_peers.clear();
    });
}

/// Check if a peer is known (paired) by looking up their public key.
pub fn is_peer_known(peer_pubkey: &[u8], store: &PairedPeerStore) -> Option<PairedPeer> {
    store
        .list()
        .into_iter()
        .find(|p| p.peer_pubkey == peer_pubkey)
        .cloned()
}

// ── Background listener ────────────────────────────────────────────────

/// IK msg1 minimum size (96+ bytes: encrypted static key + ephemeral).
/// XX msg1 is ~32 bytes (just ephemeral key).
const IK_MSG1_MIN_SIZE: usize = 96;

/// Timeout for WebRTC responder before falling back to WSS.
#[cfg(any(desktop, test))]
const WEBRTC_RESPONDER_TIMEOUT: std::time::Duration = std::time::Duration::from_secs(15);
const NEXT_ACCEPT_READY_POLL_INTERVAL: std::time::Duration = std::time::Duration::from_millis(100);
const RETRY_DELAY_OTHER_BASE_MS: u64 = 500;
const RETRY_DELAY_OTHER_CAP_MS: u64 = 5_000;
const RETRY_DELAY_PRE_HANDSHAKE_BASE_MS: u64 = 1_000;
const RETRY_DELAY_PRE_HANDSHAKE_CAP_MS: u64 = 10_000;
const RETRY_DELAY_RATE_LIMIT_BASE_MS: u64 = 5_000;
const RETRY_DELAY_RATE_LIMIT_CAP_MS: u64 = 30_000;

#[derive(Debug, Clone, Copy, PartialEq, Eq)]
enum AcceptErrorClass {
    RoomFull,
    RoomExpired,
    ModeMismatch,
    RateLimit,
    PreMsg1Closed,
    Other,
}

impl AcceptErrorClass {
    fn classify(error: &str) -> Self {
        let error = error.to_ascii_lowercase();
        if error.contains("429 too many requests")
            || error.contains("code=4029")
            || error.contains("reason=rate limit exceeded")
        {
            Self::RateLimit
        } else if error.contains("code=4001") || error.contains("reason=room full") {
            Self::RoomFull
        } else if error.contains("code=4002") || error.contains("reason=room expired") {
            Self::RoomExpired
        } else if error.contains("code=4003")
            || error.contains("reason=room mode mismatch")
            || error.contains("reason=mode mismatch")
        {
            Self::ModeMismatch
        } else if error.contains("msg1 recv")
            && (error.contains("wss closed")
                || error.contains("without close frame")
                || error.contains("transport closed"))
        {
            Self::PreMsg1Closed
        } else {
            Self::Other
        }
    }

    fn label(self) -> &'static str {
        match self {
            Self::RoomFull => "room_full",
            Self::RoomExpired => "room_expired",
            Self::ModeMismatch => "mode_mismatch",
            Self::RateLimit => "rate_limit",
            Self::PreMsg1Closed => "pre_msg1_closed",
            Self::Other => "other",
        }
    }
}

#[derive(Debug, Default, Clone, Copy)]
struct RetryBackoffState {
    pre_handshake_failures: usize,
    rate_limit_failures: usize,
    other_failures: usize,
    last_logged_class: Option<AcceptErrorClass>,
    last_logged_delay_ms: Option<u64>,
}

impl RetryBackoffState {
    fn note_msg1_received(&mut self) {
        self.pre_handshake_failures = 0;
    }

    fn note_success(&mut self) {
        *self = Self::default();
    }

    fn register_failure(&mut self, class: AcceptErrorClass) -> (usize, std::time::Duration, bool) {
        let (failure_count, retry_delay) = match class {
            AcceptErrorClass::RateLimit => {
                self.rate_limit_failures += 1;
                self.pre_handshake_failures = 0;
                self.other_failures = 0;
                (
                    self.rate_limit_failures,
                    capped_backoff(
                        RETRY_DELAY_RATE_LIMIT_BASE_MS,
                        self.rate_limit_failures,
                        RETRY_DELAY_RATE_LIMIT_CAP_MS,
                    ),
                )
            }
            AcceptErrorClass::RoomFull
            | AcceptErrorClass::RoomExpired
            | AcceptErrorClass::PreMsg1Closed => {
                self.pre_handshake_failures += 1;
                self.rate_limit_failures = 0;
                self.other_failures = 0;
                (
                    self.pre_handshake_failures,
                    capped_backoff(
                        RETRY_DELAY_PRE_HANDSHAKE_BASE_MS,
                        self.pre_handshake_failures,
                        RETRY_DELAY_PRE_HANDSHAKE_CAP_MS,
                    ),
                )
            }
            AcceptErrorClass::ModeMismatch | AcceptErrorClass::Other => {
                self.other_failures += 1;
                self.pre_handshake_failures = 0;
                self.rate_limit_failures = 0;
                (
                    self.other_failures,
                    capped_backoff(
                        RETRY_DELAY_OTHER_BASE_MS,
                        self.other_failures,
                        RETRY_DELAY_OTHER_CAP_MS,
                    ),
                )
            }
        };

        let retry_delay_ms = retry_delay.as_millis() as u64;
        let should_warn = self.last_logged_class != Some(class)
            || self.last_logged_delay_ms != Some(retry_delay_ms);
        self.last_logged_class = Some(class);
        self.last_logged_delay_ms = Some(retry_delay_ms);

        (failure_count, retry_delay, should_warn)
    }
}

#[derive(Debug, Default)]
struct AcceptAttemptProgress {
    saw_msg1: bool,
}

fn capped_backoff(base_ms: u64, failure_count: usize, cap_ms: u64) -> std::time::Duration {
    let shift = failure_count.saturating_sub(1).min(16) as u32;
    let multiplier = 1u64 << shift;
    std::time::Duration::from_millis(base_ms.saturating_mul(multiplier).min(cap_ms))
}

async fn wait_until_next_accept_ready(
    shutdown_rx: &mut tokio::sync::oneshot::Receiver<()>,
) -> bool {
    let mut logged_block = false;

    loop {
        let blocked = with_acceptor(|a| {
            if a.connected_peers.is_empty() {
                None
            } else {
                Some((a.state, a.connected_peers.len(), a.room_id.clone()))
            }
        });

        let Some((state, peer_count, room_id)) = blocked else {
            return true;
        };

        if !logged_block {
            if state == AcceptorState::Connected {
                info!(
                    "mobile_acceptor: delaying next accept until active peer disconnects room_id={:?} peer_count={}",
                    room_id, peer_count
                );
            } else {
                warn!(
                    "mobile_acceptor: delaying next accept with active peers in unexpected state={:?} room_id={:?} peer_count={}",
                    state, room_id, peer_count
                );
            }
            logged_block = true;
        }

        tokio::select! {
            biased;

            _ = &mut *shutdown_rx => return false,
            _ = tokio::time::sleep(NEXT_ACCEPT_READY_POLL_INTERVAL) => {}
        }
    }
}

/// Main listener loop: accepts connections via WebRTC (primary) or WSS (fallback).
///
/// For each connection attempt:
/// 1. Try WebRTC responder via signaling (primary path)
/// 2. If WebRTC fails, try WSS relay transport (fallback path)
/// 3. Perform Noise handshake over whichever transport succeeded
/// 4. Create NetworkConnectionManager + spawn io_task
async fn listener_loop(
    mut signaling: Option<SignalingClient>,
    mut shutdown_rx: tokio::sync::oneshot::Receiver<()>,
    storage_root: std::path::PathBuf,
    relay_url: String,
    room_id: String,
) {
    let mut retry_state = RetryBackoffState::default();
    loop {
        if !wait_until_next_accept_ready(&mut shutdown_rx).await {
            info!("Mobile acceptor listener shutting down");
            break;
        }

        tokio::select! {
            biased;

            _ = &mut shutdown_rx => {
                info!("Mobile acceptor listener shutting down");
                break;
            }

            result = async {
                let mut progress = AcceptAttemptProgress::default();
                let result = accept_connection(
                    signaling.as_mut(),
                    &storage_root,
                    &relay_url,
                    &room_id,
                    &mut progress,
                )
                .await;
                (result, progress)
            } => {
                let (result, progress) = result;
                match result {
                    Ok(peer_id) => {
                        retry_state.note_success();
                        info!("Desktop peer connected: {}", peer_id);
                    }
                    Err(e) => {
                        if progress.saw_msg1 {
                            retry_state.note_msg1_received();
                        }
                        with_acceptor(|a| {
                            if a.state == AcceptorState::Handshaking {
                                a.state = AcceptorState::Listening;
                            }
                        });
                        let class = AcceptErrorClass::classify(&e);
                        let (failure_count, retry_delay, should_warn) =
                            retry_state.register_failure(class);
                        let retry_delay_ms = retry_delay.as_millis() as u64;
                        if should_warn {
                            warn!(
                                "mobile_acceptor: accept retry scheduled relay={} room_id={} class={} failure_count={} pre_handshake_failures={} delay_ms={} error={}",
                                relay_url,
                                room_id,
                                class.label(),
                                failure_count,
                                retry_state.pre_handshake_failures,
                                retry_delay_ms,
                                e
                            );
                        } else {
                            info!(
                                "mobile_acceptor: accept retry scheduled relay={} room_id={} class={} failure_count={} pre_handshake_failures={} delay_ms={} error={}",
                                relay_url,
                                room_id,
                                class.label(),
                                failure_count,
                                retry_state.pre_handshake_failures,
                                retry_delay_ms,
                                e
                            );
                        }
                        tokio::select! {
                            biased;

                            _ = &mut shutdown_rx => {
                                info!("Mobile acceptor listener shutting down");
                                break;
                            }

                            _ = tokio::time::sleep(retry_delay) => {}
                        }
                    }
                }
            }
        }
    }
}

async fn send_encrypted_frame(
    transport: &mut dyn RemoteTransport,
    noise: &mut NoiseTransport,
    frame: Frame,
) -> Result<(), String> {
    let encrypted = noise
        .encrypt(&frame.encode())
        .map_err(|e| format!("encrypt: {e}"))?;
    transport
        .send(&encrypted)
        .await
        .map_err(|e| format!("send: {e}"))
}

async fn recv_decrypted_frame(
    transport: &mut dyn RemoteTransport,
    noise: &mut NoiseTransport,
) -> Result<Frame, String> {
    let bytes = transport.recv().await.map_err(|e| format!("recv: {e}"))?;
    let decrypted = noise.decrypt(&bytes).map_err(|e| format!("decrypt: {e}"))?;
    Frame::decode(&decrypted).map_err(|e| format!("decode: {e}"))
}

async fn run_host_rpc_loop(
    mut transport: Box<dyn RemoteTransport>,
    mut noise: NoiseTransport,
    storage_root: std::path::PathBuf,
    peer_id: String,
    mut shutdown_rx: tokio::sync::oneshot::Receiver<()>,
) -> Result<(), String> {
    enum HostRpcAdapter {
        Shared(Arc<Mutex<Box<dyn CoreAdapter>>>),
        Local(LocalCoreAdapter),
    }

    impl HostRpcAdapter {
        fn load(storage_root: std::path::PathBuf) -> Result<Self, String> {
            if let Some(adapter) = shared_app_adapter() {
                info!("mobile_acceptor: using shared app adapter for host rpc loop");
                return Ok(Self::Shared(adapter));
            }

            warn!("mobile_acceptor: shared app adapter missing, falling back to LocalCoreAdapter");
            Ok(Self::Local(LocalCoreAdapter::new(storage_root)?))
        }

        fn handle(&mut self, req: &RpcRequest) -> Result<RpcResponse, String> {
            match self {
                Self::Shared(adapter) => {
                    let mut adapter = adapter
                        .lock()
                        .map_err(|_| "shared adapter mutex poisoned".to_string())?;
                    let resp = adapter.handle(req);
                    adapter.save()?;
                    Ok(resp)
                }
                Self::Local(adapter) => {
                    let resp = adapter.handle(req);
                    adapter.save()?;
                    Ok(resp)
                }
            }
        }

        fn handle_with_stream(
            &mut self,
            req: &RpcRequest,
            stream: Option<RpcInputStream>,
        ) -> Result<RpcReply, String> {
            match self {
                Self::Shared(adapter) => {
                    let mut adapter = adapter
                        .lock()
                        .map_err(|_| "shared adapter mutex poisoned".to_string())?;
                    let reply = adapter.handle_with_stream(req, stream);
                    adapter.save()?;
                    Ok(reply)
                }
                Self::Local(adapter) => {
                    let reply = adapter.handle_with_stream(req, stream);
                    adapter.save()?;
                    Ok(reply)
                }
            }
        }
    }

    let mut adapter = HostRpcAdapter::load(storage_root)?;
    let mut anti_replay = chromvoid_protocol::AntiReplay::new();
    let mut heartbeat_interval = tokio::time::interval(HEARTBEAT_INTERVAL);
    let mut server_msg_id = rand::random::<u64>() | 1;

    loop {
        tokio::select! {
            biased;

            _ = &mut shutdown_rx => {
                info!("mobile_acceptor: host rpc loop shutdown peer_id={}", peer_id);
                let _ = transport.close().await;
                return Ok(());
            }

            _ = heartbeat_interval.tick() => {
                let heartbeat = frame_from_heartbeat(server_msg_id, PROTOCOL_VERSION);
                server_msg_id = server_msg_id.wrapping_add(1).max(1);
                send_encrypted_frame(transport.as_mut(), &mut noise, heartbeat).await?;
            }

            frame = recv_decrypted_frame(transport.as_mut(), &mut noise) => {
                let frame = frame?;
                match frame.frame_type {
                    FrameType::Heartbeat => continue,
                    FrameType::Error => return Err("peer sent error frame".to_string()),
                    FrameType::RpcResponse => continue,
                    FrameType::RpcRequest => {}
                }

                anti_replay
                    .check(frame.message_id)
                    .map_err(|e| format!("anti_replay: {e}"))?;

                let req: RpcRequest = serde_json::from_slice(&frame.payload)
                    .map_err(|e| format!("request parse: {e}"))?;

                if is_upload_stream_command(&req.command) && frame.has_continuation() {
                    let total_size = req.data.get("size").and_then(|v| v.as_u64()).unwrap_or(0);
                    let mut offset = req.data.get("offset").and_then(|v| v.as_u64()).unwrap_or(0);
                    anti_replay.set_active_stream(frame.message_id);

                    let mut stream_ok = true;
                    loop {
                        let chunk_frame = recv_decrypted_frame(transport.as_mut(), &mut noise).await?;
                        if chunk_frame.frame_type != FrameType::RpcRequest || chunk_frame.message_id != frame.message_id {
                            let err = RpcResponse::Error {
                                ok: false,
                                error: "stream message_id mismatch".to_string(),
                                code: Some("INVALID_FORMAT".to_string()),
                            };
                            let _ = send_encrypted_frame(
                                transport.as_mut(),
                                &mut noise,
                                frame_from_rpc_response(frame.message_id, &err),
                            ).await;
                            stream_ok = false;
                            break;
                        }

                        anti_replay
                            .check(chunk_frame.message_id)
                            .map_err(|e| format!("anti_replay: {e}"))?;

                        let mut chunk_data = req.data.clone();
                        let Some(obj) = chunk_data.as_object_mut() else {
                            let err = RpcResponse::Error {
                                ok: false,
                                error: "upload request data must be an object".to_string(),
                                code: Some("BAD_REQUEST".to_string()),
                            };
                            let _ = send_encrypted_frame(
                                transport.as_mut(),
                                &mut noise,
                                frame_from_rpc_response(frame.message_id, &err),
                            ).await;
                            stream_ok = false;
                            break;
                        };
                        obj.insert("offset".to_string(), serde_json::json!(offset));
                        obj.insert("size".to_string(), serde_json::json!(total_size));

                        let chunk_req = RpcRequest {
                            v: PROTOCOL_VERSION,
                            command: req.command.clone(),
                            data: chunk_data,
                        };

                        match adapter.handle_with_stream(
                            &chunk_req,
                            Some(RpcInputStream::from_bytes(chunk_frame.payload.clone())),
                        )? {
                            RpcReply::Json(resp) => {
                                if !resp.is_ok() {
                                    let _ = send_encrypted_frame(
                                        transport.as_mut(),
                                        &mut noise,
                                        frame_from_rpc_response(frame.message_id, &resp),
                                    ).await;
                                    stream_ok = false;
                                    break;
                                }
                            }
                            RpcReply::Stream(_) => {
                                let err = RpcResponse::Error {
                                    ok: false,
                                    error: "unexpected streaming response for upload".to_string(),
                                    code: Some("STREAM_UNEXPECTED".to_string()),
                                };
                                let _ = send_encrypted_frame(
                                    transport.as_mut(),
                                    &mut noise,
                                    frame_from_rpc_response(frame.message_id, &err),
                                ).await;
                                stream_ok = false;
                                break;
                            }
                        }

                        offset += chunk_frame.payload.len() as u64;
                        if !chunk_frame.has_continuation() {
                            break;
                        }
                    }

                    anti_replay.clear_active_stream();

                    if !stream_ok {
                        return Err(format!("host upload stream aborted peer_id={}", peer_id));
                    }

                    let success = RpcResponse::success(serde_json::json!({"uploaded": offset}));
                    send_encrypted_frame(
                        transport.as_mut(),
                        &mut noise,
                        frame_from_rpc_response(frame.message_id, &success),
                    ).await?;
                    continue;
                }

                if is_download_stream_command(&req.command) {
                    match adapter.handle_with_stream(&req, None)? {
                        RpcReply::Stream(output) => {
                            send_encrypted_frame(
                                transport.as_mut(),
                                &mut noise,
                                frame_stream_meta_response(frame.message_id, &output.meta),
                            ).await?;

                            let mut reader = output.reader;
                            let mut current_buf = vec![0u8; STREAM_CHUNK_SIZE];
                            let mut n = reader.read(&mut current_buf).unwrap_or(0);

                            while n > 0 {
                                let mut next_buf = vec![0u8; STREAM_CHUNK_SIZE];
                                let next_n = reader.read(&mut next_buf).unwrap_or(0);
                                let has_more = next_n > 0;
                                let chunk = frame_continuation(
                                    FrameType::RpcResponse,
                                    frame.message_id,
                                    current_buf[..n].to_vec(),
                                    has_more,
                                );
                                send_encrypted_frame(transport.as_mut(), &mut noise, chunk).await?;
                                current_buf = next_buf;
                                n = next_n;
                            }
                        }
                        RpcReply::Json(resp) => {
                            send_encrypted_frame(
                                transport.as_mut(),
                                &mut noise,
                                frame_from_rpc_response(frame.message_id, &resp),
                            ).await?;
                        }
                    }
                    continue;
                }

                let resp = adapter.handle(&req)?;
                send_encrypted_frame(
                    transport.as_mut(),
                    &mut noise,
                    frame_from_rpc_response(frame.message_id, &resp),
                ).await?;
            }
        }
    }
}

/// Accept a single incoming Desktop connection.
///
/// Full flow:
/// 1. Transport setup: WebRTC responder (primary), WSS relay (fallback)
/// 2. Noise IK handshake for known peers, XX for unknown
/// 3. Peer identity verification against `PairedPeerStore`
/// 4. For unknown peers: delegate to pairing flow
/// 5. Create `NetworkConnectionManager` + `spawn_network_io_task`
/// 6. Register connected peer
async fn accept_connection(
    _signaling: Option<&mut SignalingClient>,
    storage_root: &std::path::Path,
    relay_url: &str,
    room_id: &str,
    progress: &mut AcceptAttemptProgress,
) -> Result<String, String> {
    use super::wss_transport::WssTransport;
    use chromvoid_protocol::MAX_HANDSHAKE_MSG;

    info!(
        "mobile_acceptor: accept_connection:start relay={} room_id={}",
        relay_url, room_id
    );

    let (mut transport, transport_type): (Box<dyn RemoteTransport>, TransportType) = {
        #[cfg(desktop)]
        {
            use super::fallback::default_ice_servers;
            use super::webrtc_transport::WebRtcTransport;

            if force_wss_acceptor_for_test() {
                info!(
                    "mobile_acceptor: forcing WSS transport on desktop for test relay={} room_id={}",
                    relay_url, room_id
                );
                let wss = WssTransport::connect_with_context(
                    relay_url,
                    room_id,
                    "mobile_acceptor_test_force_wss",
                )
                .await
                .map_err(|e| format!("WSS connect failed: {e}"))?;
                info!("WSS relay transport established (forced test override)");
                (Box::new(wss), TransportType::WssRelay)
            } else {
                let signaling =
                    _signaling.ok_or("signaling client missing on desktop".to_string())?;
                let ice_servers = default_ice_servers();
                let webrtc_result = tokio::time::timeout(
                    WEBRTC_RESPONDER_TIMEOUT,
                    WebRtcTransport::connect_as_responder(signaling, ice_servers),
                )
                .await;

                match webrtc_result {
                    Ok(Ok(t)) => {
                        info!("WebRTC responder transport established");
                        (Box::new(t), TransportType::WebRtcDataChannel)
                    }
                    Ok(Err(e)) => {
                        warn!("WebRTC responder failed: {e}, falling back to WSS");
                        let wss = WssTransport::connect_with_context(
                            relay_url,
                            room_id,
                            "mobile_acceptor_webrtc_fallback_error",
                        )
                        .await
                        .map_err(|e| format!("WSS fallback also failed: {e}"))?;
                        info!("WSS relay transport established (fallback)");
                        (Box::new(wss), TransportType::WssRelay)
                    }
                    Err(_) => {
                        warn!("WebRTC responder timed out, falling back to WSS");
                        let wss = WssTransport::connect_with_context(
                            relay_url,
                            room_id,
                            "mobile_acceptor_webrtc_fallback_timeout",
                        )
                        .await
                        .map_err(|e| format!("WSS fallback also failed: {e}"))?;
                        info!("WSS relay transport established (fallback after timeout)");
                        (Box::new(wss), TransportType::WssRelay)
                    }
                }
            }
        }
        #[cfg(not(desktop))]
        {
            let wss = WssTransport::connect_with_context(
                relay_url,
                room_id,
                "mobile_acceptor_mobile_only",
            )
            .await
            .map_err(|e| format!("WSS connect failed: {e}"))?;
            info!("WSS relay transport established (mobile-only)");
            (Box::new(wss), TransportType::WssRelay)
        }
    };

    // Step 2: Noise handshake over the established transport.
    info!(
        "mobile_acceptor: awaiting noise msg1 relay={} room_id={} transport_type={:?}",
        relay_url, room_id, transport_type
    );
    let msg1 = transport
        .recv()
        .await
        .map_err(|e| format!("noise msg1 recv: {e}"))?;
    info!(
        "mobile_acceptor: received noise msg1 relay={} room_id={} len={}",
        relay_url,
        room_id,
        msg1.len()
    );
    progress.saw_msg1 = true;
    set_handshaking();

    let store_path = storage_root.join("paired_network_peers.json");
    let store = PairedPeerStore::load(&store_path);

    let mut buf = vec![0u8; MAX_HANDSHAKE_MSG];
    let outcome = if msg1.len() >= IK_MSG1_MIN_SIZE {
        noise_ik_responder(transport.as_mut(), &msg1, &mut buf, &store).await?
    } else {
        noise_xx_responder(transport.as_mut(), &msg1, &mut buf, &store).await?
    };

    // Step 3: Handle handshake outcome.
    let (noise_transport, peer_id, label) = match outcome {
        HandshakeOutcome::Paired {
            noise,
            peer_id,
            label,
        } => (noise, peer_id, label),
        HandshakeOutcome::UnknownPeer {
            _noise,
            remote_pubkey,
        } => {
            // Unknown peer — delegate to pairing flow.
            // The Noise session is established but we don't start io_task yet.
            // Instead, we signal that a pairing confirmation is needed.
            // The remote pubkey is hex-encoded for the pairing module.
            let _ = _noise;
            let pubkey_hex = remote_pubkey
                .iter()
                .map(|b| format!("{b:02x}"))
                .collect::<String>();
            warn!(
                "Unknown peer with pubkey {} — pairing confirmation required",
                pubkey_hex
            );
            // Transition back to Listening — the pairing flow is handled
            // out-of-band via Task 2's confirm_pairing API.
            with_acceptor(|a| {
                if a.state == AcceptorState::Handshaking {
                    a.state = AcceptorState::Listening;
                }
            });
            return Err(format!("unknown_peer:{}", pubkey_hex));
        }
    };

    let transport_type_name = match transport_type {
        TransportType::WebRtcDataChannel => "webrtc",
        TransportType::WssRelay => "wss",
        _ => "unknown",
    };
    info!(
        "Noise handshake completed with peer={} ({})",
        peer_id, transport_type_name
    );

    // Step 4: Create NetworkConnectionManager for state tracking.
    let mut conn_mgr = NetworkConnectionManager::new();
    conn_mgr.transition(crate::core_adapter::ConnectionState::Syncing);

    // Step 5: Spawn the host responder loop. It owns both the raw transport and the Noise session.
    let (shutdown_tx, shutdown_rx) = tokio::sync::oneshot::channel::<()>();
    let task_storage_root = storage_root.to_path_buf();
    let task_peer_id = peer_id.clone();
    tokio::spawn(async move {
        let result = run_host_rpc_loop(
            transport,
            noise_transport,
            task_storage_root,
            task_peer_id.clone(),
            shutdown_rx,
        )
        .await;
        if let Err(error) = result {
            warn!(
                "mobile_acceptor: host rpc loop ended peer_id={} error={}",
                task_peer_id, error
            );
        } else {
            info!(
                "mobile_acceptor: host rpc loop stopped peer_id={}",
                task_peer_id
            );
        }
        remove_connected_peer(&task_peer_id);
    });

    // Step 6: Update last_seen timestamp.
    {
        let mut store = PairedPeerStore::load(&store_path);
        store.touch(&peer_id);
        let _ = store.save();
    }

    // Step 7: Register the connected peer with conn_mgr and io_task channel.
    let peer = ConnectedPeer {
        peer_id: peer_id.clone(),
        label: label.clone(),
        connected_at_ms: now_ms(),
        transport_type: transport_type_name.to_string(),
    };
    add_connected_peer(peer);
    with_acceptor(|a| {
        a.peer_connections.push((
            peer_id.clone(),
            PeerConnection {
                conn_mgr,
                shutdown_tx: Some(shutdown_tx),
            },
        ));
    });

    Ok(peer_id)
}

/// IK responder handshake over a transport (2 messages).
///
/// The initiator sends msg1 containing their encrypted static key + ephemeral.
/// We respond with msg2, then transition to transport mode.
/// Returns `HandshakeOutcome::Paired` if the remote key is in the store,
/// or `HandshakeOutcome::UnknownPeer` if not (should not happen for IK, but handled).
async fn noise_ik_responder(
    transport: &mut (dyn RemoteTransport + '_),
    msg1: &[u8],
    buf: &mut [u8],
    store: &PairedPeerStore,
) -> Result<HandshakeOutcome, String> {
    use chromvoid_protocol::NOISE_PARAMS_IK;
    use snow::params::NoiseParams;

    // Find any paired peer to get our local private key.
    let all_peers = store.list();
    let first_peer = all_peers
        .first()
        .ok_or("no paired peers — cannot perform IK handshake")?;
    let local_privkey = hex_decode(&first_peer.client_privkey_hex)?;

    let params: NoiseParams = NOISE_PARAMS_IK
        .parse()
        .map_err(|e: snow::Error| format!("IK params: {e}"))?;

    let mut responder = snow::Builder::new(params)
        .local_private_key(&local_privkey)
        .map_err(|e| format!("IK local_private_key: {e}"))?
        .build_responder()
        .map_err(|e| format!("IK build_responder: {e}"))?;

    // IK msg1: -> e, es, s, ss (from initiator — already received)
    responder
        .read_message(msg1, buf)
        .map_err(|e| format!("IK msg1 read: {e}"))?;

    let remote_pubkey = responder
        .get_remote_static()
        .ok_or("IK: no remote static key")?
        .to_vec();

    // IK msg2: <- e, ee, se (our response)
    let len = responder
        .write_message(&[], buf)
        .map_err(|e| format!("IK msg2 write: {e}"))?;
    transport
        .send(&buf[..len])
        .await
        .map_err(|e| format!("IK msg2 send: {e}"))?;

    let ts = responder
        .into_transport_mode()
        .map_err(|e| format!("IK into_transport: {e}"))?;

    let noise = NoiseTransport::new(ts, remote_pubkey.clone());

    match is_peer_known(&remote_pubkey, store) {
        Some(paired) => Ok(HandshakeOutcome::Paired {
            noise,
            peer_id: paired.peer_id,
            label: paired.label,
        }),
        None => Ok(HandshakeOutcome::UnknownPeer {
            _noise: noise,
            remote_pubkey,
        }),
    }
}

/// XX responder handshake over a transport (3 messages).
///
/// Used when the initiator is unknown or when IK is not applicable.
/// msg1 is already received; we send msg2, receive msg3, then check identity.
/// Returns `HandshakeOutcome::Paired` if known, `HandshakeOutcome::UnknownPeer` if not.
async fn noise_xx_responder(
    transport: &mut (dyn RemoteTransport + '_),
    msg1: &[u8],
    buf: &mut [u8],
    store: &PairedPeerStore,
) -> Result<HandshakeOutcome, String> {
    use chromvoid_protocol::NOISE_PARAMS_XX;
    use snow::params::NoiseParams;

    let params: NoiseParams = NOISE_PARAMS_XX
        .parse()
        .map_err(|e: snow::Error| format!("XX params: {e}"))?;

    // Use the first paired peer's key if available, otherwise generate ephemeral.
    let all_peers = store.list();
    let local_privkey = if let Some(peer) = all_peers.first() {
        hex_decode(&peer.client_privkey_hex)?
    } else {
        let kp = snow::Builder::new(params.clone())
            .generate_keypair()
            .map_err(|e| format!("XX keygen: {e}"))?;
        kp.private
    };

    let mut responder = snow::Builder::new(params)
        .local_private_key(&local_privkey)
        .map_err(|e| format!("XX local_private_key: {e}"))?
        .build_responder()
        .map_err(|e| format!("XX build_responder: {e}"))?;

    // XX msg1: <- e (already received)
    responder
        .read_message(msg1, buf)
        .map_err(|e| format!("XX msg1 read: {e}"))?;

    // XX msg2: -> e, ee, s, es
    let len2 = responder
        .write_message(&[], buf)
        .map_err(|e| format!("XX msg2 write: {e}"))?;
    transport
        .send(&buf[..len2])
        .await
        .map_err(|e| format!("XX msg2 send: {e}"))?;

    // XX msg3: <- s, se
    let msg3 = transport
        .recv()
        .await
        .map_err(|e| format!("XX msg3 recv: {e}"))?;
    responder
        .read_message(&msg3, buf)
        .map_err(|e| format!("XX msg3 read: {e}"))?;

    let remote_pubkey = responder
        .get_remote_static()
        .ok_or("XX: no remote static key")?
        .to_vec();

    let ts = responder
        .into_transport_mode()
        .map_err(|e| format!("XX into_transport: {e}"))?;

    let noise = NoiseTransport::new(ts, remote_pubkey.clone());

    match is_peer_known(&remote_pubkey, store) {
        Some(paired) => Ok(HandshakeOutcome::Paired {
            noise,
            peer_id: paired.peer_id,
            label: paired.label,
        }),
        None => Ok(HandshakeOutcome::UnknownPeer {
            _noise: noise,
            remote_pubkey,
        }),
    }
}

/// Decode a hex string to bytes.
fn hex_decode(s: &str) -> Result<Vec<u8>, String> {
    let s = s.trim();
    if s.len() % 2 != 0 {
        return Err("hex string has odd length".to_string());
    }
    (0..s.len())
        .step_by(2)
        .map(|i| {
            u8::from_str_radix(&s[i..i + 2], 16).map_err(|e| format!("invalid hex at {i}: {e}"))
        })
        .collect()
}

// ── Tests ──────────────────────────────────────────────────────────────

#[cfg(test)]
mod tests {
    use super::*;
    use std::sync::Mutex;
    use std::time::Duration;

    static ACCEPTOR_TEST_LOCK: Mutex<()> = Mutex::new(());

    /// Helper: create a fresh AcceptorInner for isolated testing.
    fn fresh() -> AcceptorInner {
        AcceptorInner::new()
    }

    fn reset_global_acceptor() {
        let mut guard = ACCEPTOR.lock().unwrap();
        *guard = Some(AcceptorInner::new());
    }

    #[test]
    fn force_wss_acceptor_override_only_enables_for_explicit_test_env() {
        let _guard = ACCEPTOR_TEST_LOCK
            .lock()
            .unwrap_or_else(|poisoned| poisoned.into_inner());
        let original = std::env::var_os("CHROMVOID_TEST_FORCE_WSS_ACCEPTOR");

        unsafe {
            std::env::remove_var("CHROMVOID_TEST_FORCE_WSS_ACCEPTOR");
        }
        assert!(!force_wss_acceptor_for_test());

        unsafe {
            std::env::set_var("CHROMVOID_TEST_FORCE_WSS_ACCEPTOR", "1");
        }
        assert!(force_wss_acceptor_for_test());

        match original {
            Some(value) => unsafe {
                std::env::set_var("CHROMVOID_TEST_FORCE_WSS_ACCEPTOR", value);
            },
            None => unsafe {
                std::env::remove_var("CHROMVOID_TEST_FORCE_WSS_ACCEPTOR");
            },
        }
    }

    #[test]
    fn initial_state_is_idle() {
        let a = fresh();
        assert_eq!(a.state, AcceptorState::Idle);
        assert!(a.connected_peers.is_empty());
        assert!(a.relay_url.is_none());
        assert!(a.room_id.is_none());
    }

    #[test]
    fn status_snapshot_reflects_state() {
        let mut a = fresh();
        a.state = AcceptorState::Listening;
        a.relay_url = Some("wss://relay.test".to_string());
        a.room_id = Some("room-abc".to_string());

        let status = a.status();
        assert_eq!(status.state, AcceptorState::Listening);
        assert_eq!(status.relay_url.as_deref(), Some("wss://relay.test"));
        assert_eq!(status.room_id.as_deref(), Some("room-abc"));
        assert!(status.connected_peers.is_empty());
    }

    #[test]
    fn lifecycle_idle_to_listening() {
        let mut a = fresh();
        assert_eq!(a.state, AcceptorState::Idle);

        a.state = AcceptorState::Listening;
        a.relay_url = Some("wss://relay.test".to_string());
        a.room_id = Some("room-123".to_string());

        assert_eq!(a.state, AcceptorState::Listening);
        assert!(a.relay_url.is_some());
    }

    #[test]
    fn classify_accept_error_detects_room_full() {
        assert_eq!(
            AcceptErrorClass::classify(
                "noise msg1 recv: transport I/O error: wss closed code=4001 reason=room full"
            ),
            AcceptErrorClass::RoomFull
        );
    }

    #[test]
    fn classify_accept_error_detects_room_expired() {
        assert_eq!(
            AcceptErrorClass::classify(
                "noise msg1 recv: transport I/O error: wss closed code=4002 reason=room expired"
            ),
            AcceptErrorClass::RoomExpired
        );
    }

    #[test]
    fn classify_accept_error_detects_rate_limit() {
        assert_eq!(
            AcceptErrorClass::classify(
                "WSS connect failed: WSS connect: HTTP error: 429 Too Many Requests"
            ),
            AcceptErrorClass::RateLimit
        );
    }

    #[test]
    fn classify_accept_error_detects_pre_msg1_closed() {
        assert_eq!(
            AcceptErrorClass::classify(
                "noise msg1 recv: transport I/O error: wss peer disconnected without close frame"
            ),
            AcceptErrorClass::PreMsg1Closed
        );
    }

    #[test]
    fn classify_accept_error_defaults_to_other() {
        assert_eq!(
            AcceptErrorClass::classify("noise xx read failed"),
            AcceptErrorClass::Other
        );
    }

    #[test]
    fn pre_handshake_backoff_grows_and_caps() {
        let mut state = RetryBackoffState::default();
        let delays = (0..5)
            .map(|_| {
                state
                    .register_failure(AcceptErrorClass::PreMsg1Closed)
                    .1
                    .as_millis() as u64
            })
            .collect::<Vec<_>>();
        assert_eq!(delays, vec![1_000, 2_000, 4_000, 8_000, 10_000]);
    }

    #[test]
    fn rate_limit_backoff_grows_and_caps() {
        let mut state = RetryBackoffState::default();
        let delays = (0..4)
            .map(|_| {
                state
                    .register_failure(AcceptErrorClass::RateLimit)
                    .1
                    .as_millis() as u64
            })
            .collect::<Vec<_>>();
        assert_eq!(delays, vec![5_000, 10_000, 20_000, 30_000]);
    }

    #[test]
    fn msg1_received_resets_pre_handshake_counter() {
        let mut state = RetryBackoffState::default();
        state.register_failure(AcceptErrorClass::PreMsg1Closed);
        state.register_failure(AcceptErrorClass::PreMsg1Closed);
        state.note_msg1_received();

        let (failure_count, delay, _) = state.register_failure(AcceptErrorClass::PreMsg1Closed);
        assert_eq!(failure_count, 1);
        assert_eq!(delay.as_millis(), 1_000);
    }

    #[test]
    fn success_resets_backoff_state() {
        let mut state = RetryBackoffState::default();
        state.register_failure(AcceptErrorClass::RateLimit);
        state.register_failure(AcceptErrorClass::RateLimit);
        state.note_success();

        let (failure_count, delay, _) = state.register_failure(AcceptErrorClass::RateLimit);
        assert_eq!(failure_count, 1);
        assert_eq!(delay.as_millis(), 5_000);
    }

    #[test]
    fn new_backoff_bucket_promotes_log_level_to_warn() {
        let mut state = RetryBackoffState::default();

        let (_, _, should_warn_first) = state.register_failure(AcceptErrorClass::PreMsg1Closed);
        let (_, _, should_warn_second_bucket) =
            state.register_failure(AcceptErrorClass::PreMsg1Closed);
        let (_, _, should_warn_third_bucket) =
            state.register_failure(AcceptErrorClass::PreMsg1Closed);
        let (_, _, should_warn_fourth_bucket) =
            state.register_failure(AcceptErrorClass::PreMsg1Closed);
        let (_, _, should_warn_cap_bucket) =
            state.register_failure(AcceptErrorClass::PreMsg1Closed);
        let (_, _, should_warn_repeat_cap_bucket) =
            state.register_failure(AcceptErrorClass::PreMsg1Closed);

        assert!(should_warn_first);
        assert!(should_warn_second_bucket);
        assert!(should_warn_third_bucket);
        assert!(should_warn_fourth_bucket);
        assert!(should_warn_cap_bucket);
        assert!(!should_warn_repeat_cap_bucket);
    }

    #[test]
    fn class_change_promotes_log_level_to_warn() {
        let mut state = RetryBackoffState::default();
        let _ = state.register_failure(AcceptErrorClass::PreMsg1Closed);
        let (_, _, should_warn) = state.register_failure(AcceptErrorClass::Other);
        assert!(should_warn);
    }

    #[test]
    fn rate_limit_failure_resets_pre_handshake_counter() {
        let mut state = RetryBackoffState::default();
        state.register_failure(AcceptErrorClass::PreMsg1Closed);
        state.register_failure(AcceptErrorClass::PreMsg1Closed);
        let _ = state.register_failure(AcceptErrorClass::RateLimit);
        assert_eq!(state.pre_handshake_failures, 0);
    }

    #[test]
    fn other_backoff_grows_and_caps() {
        let mut state = RetryBackoffState::default();
        let delays = (0..5)
            .map(|_| {
                state
                    .register_failure(AcceptErrorClass::Other)
                    .1
                    .as_millis() as u64
            })
            .collect::<Vec<_>>();
        assert_eq!(delays, vec![500, 1_000, 2_000, 4_000, 5_000]);
    }

    #[test]
    fn classify_accept_error_detects_mode_mismatch() {
        assert_eq!(
            AcceptErrorClass::classify(
                "noise msg1 recv: transport I/O error: wss closed code=4003 reason=room mode mismatch"
            ),
            AcceptErrorClass::ModeMismatch
        );
    }

    #[test]
    fn lifecycle_listening_to_handshaking_to_connected() {
        let mut a = fresh();
        a.state = AcceptorState::Listening;

        // Offer received → handshaking
        a.state = AcceptorState::Handshaking;
        assert_eq!(a.state, AcceptorState::Handshaking);

        // Handshake complete → connected
        let peer = ConnectedPeer {
            peer_id: "desktop-1".to_string(),
            label: "My Desktop".to_string(),
            connected_at_ms: now_ms(),
            transport_type: "webrtc".to_string(),
        };
        a.connected_peers.push(peer);
        a.state = AcceptorState::Connected;

        assert_eq!(a.state, AcceptorState::Connected);
        assert_eq!(a.connected_peers.len(), 1);
        assert_eq!(a.connected_peers[0].peer_id, "desktop-1");
    }

    #[test]
    fn stop_resets_to_idle() {
        let mut a = fresh();
        a.state = AcceptorState::Connected;
        a.relay_url = Some("wss://relay.test".to_string());
        a.room_id = Some("room-456".to_string());
        a.connected_peers.push(ConnectedPeer {
            peer_id: "desktop-1".to_string(),
            label: "Desktop".to_string(),
            connected_at_ms: now_ms(),
            transport_type: "webrtc".to_string(),
        });

        // Simulate stop_listening
        a.state = AcceptorState::Idle;
        a.relay_url = None;
        a.room_id = None;
        a.connected_peers.clear();
        a.peer_connections.clear();

        assert_eq!(a.state, AcceptorState::Idle);
        assert!(a.connected_peers.is_empty());
        assert!(a.relay_url.is_none());
    }

    #[test]
    fn remove_last_peer_transitions_to_listening() {
        let mut a = fresh();
        a.state = AcceptorState::Connected;
        a.relay_url = Some("wss://relay.test".to_string());
        a.connected_peers.push(ConnectedPeer {
            peer_id: "desktop-1".to_string(),
            label: "Desktop".to_string(),
            connected_at_ms: now_ms(),
            transport_type: "webrtc".to_string(),
        });

        a.connected_peers.retain(|p| p.peer_id != "desktop-1");
        a.peer_connections.retain(|(id, _)| id != "desktop-1");
        if a.connected_peers.is_empty() && a.relay_url.is_some() {
            a.state = AcceptorState::Listening;
        }

        assert_eq!(a.state, AcceptorState::Listening);
    }

    #[test]
    fn remove_peer_keeps_connected_if_others_remain() {
        let mut a = fresh();
        a.state = AcceptorState::Connected;
        a.relay_url = Some("wss://relay.test".to_string());
        a.connected_peers.push(ConnectedPeer {
            peer_id: "desktop-1".to_string(),
            label: "Desktop 1".to_string(),
            connected_at_ms: now_ms(),
            transport_type: "webrtc".to_string(),
        });
        a.connected_peers.push(ConnectedPeer {
            peer_id: "desktop-2".to_string(),
            label: "Desktop 2".to_string(),
            connected_at_ms: now_ms(),
            transport_type: "wss".to_string(),
        });

        a.connected_peers.retain(|p| p.peer_id != "desktop-1");
        assert_eq!(a.connected_peers.len(), 1);
        assert_eq!(a.state, AcceptorState::Connected);
    }

    #[tokio::test(flavor = "current_thread")]
    async fn wait_until_next_accept_ready_blocks_while_peer_is_connected() {
        let _guard = ACCEPTOR_TEST_LOCK.lock().unwrap();
        reset_global_acceptor();
        with_acceptor(|a| {
            a.state = AcceptorState::Connected;
            a.relay_url = Some("wss://relay.test".to_string());
            a.room_id = Some("room-123".to_string());
            a.connected_peers.push(ConnectedPeer {
                peer_id: "desktop-1".to_string(),
                label: "Desktop".to_string(),
                connected_at_ms: now_ms(),
                transport_type: "wss".to_string(),
            });
        });

        let (_shutdown_tx, mut shutdown_rx) = tokio::sync::oneshot::channel::<()>();
        let wait_task =
            tokio::spawn(async move { wait_until_next_accept_ready(&mut shutdown_rx).await });

        tokio::time::sleep(Duration::from_millis(50)).await;
        assert!(
            !wait_task.is_finished(),
            "listener gate must keep waiting while peer is still connected"
        );

        remove_connected_peer("desktop-1");

        let ready = tokio::time::timeout(Duration::from_secs(1), wait_task)
            .await
            .expect("gate should unblock after peer removal")
            .expect("join should succeed");
        assert!(
            ready,
            "gate should report ready when peer list becomes empty"
        );
        assert_eq!(get_status().state, AcceptorState::Listening);
    }

    #[tokio::test(flavor = "current_thread")]
    async fn wait_until_next_accept_ready_returns_immediately_after_last_peer_removed() {
        let _guard = ACCEPTOR_TEST_LOCK.lock().unwrap();
        reset_global_acceptor();
        with_acceptor(|a| {
            a.state = AcceptorState::Connected;
            a.relay_url = Some("wss://relay.test".to_string());
            a.room_id = Some("room-123".to_string());
            a.connected_peers.push(ConnectedPeer {
                peer_id: "desktop-1".to_string(),
                label: "Desktop".to_string(),
                connected_at_ms: now_ms(),
                transport_type: "wss".to_string(),
            });
        });

        remove_connected_peer("desktop-1");
        assert_eq!(get_status().state, AcceptorState::Listening);

        let (_shutdown_tx, mut shutdown_rx) = tokio::sync::oneshot::channel::<()>();
        let ready = wait_until_next_accept_ready(&mut shutdown_rx).await;
        assert!(
            ready,
            "listener gate should allow the next accept after peer removal"
        );
    }

    #[test]
    fn reconnect_after_last_peer_reuses_same_room_lifecycle() {
        let _guard = ACCEPTOR_TEST_LOCK.lock().unwrap();
        reset_global_acceptor();
        with_acceptor(|a| {
            a.state = AcceptorState::Connected;
            a.relay_url = Some("wss://relay.test".to_string());
            a.room_id = Some("room-123".to_string());
            a.connected_peers.push(ConnectedPeer {
                peer_id: "desktop-1".to_string(),
                label: "Desktop 1".to_string(),
                connected_at_ms: now_ms(),
                transport_type: "wss".to_string(),
            });
        });

        remove_connected_peer("desktop-1");
        let after_disconnect = get_status();
        assert_eq!(after_disconnect.state, AcceptorState::Listening);
        assert_eq!(after_disconnect.room_id.as_deref(), Some("room-123"));
        assert!(after_disconnect.connected_peers.is_empty());

        add_connected_peer(ConnectedPeer {
            peer_id: "desktop-2".to_string(),
            label: "Desktop 2".to_string(),
            connected_at_ms: now_ms(),
            transport_type: "wss".to_string(),
        });

        let after_reconnect = get_status();
        assert_eq!(after_reconnect.state, AcceptorState::Connected);
        assert_eq!(after_reconnect.room_id.as_deref(), Some("room-123"));
        assert_eq!(after_reconnect.connected_peers.len(), 1);
        assert_eq!(after_reconnect.connected_peers[0].peer_id, "desktop-2");
    }

    #[test]
    fn disconnected_state_clears_peers() {
        let mut a = fresh();
        a.state = AcceptorState::Connected;
        a.connected_peers.push(ConnectedPeer {
            peer_id: "desktop-1".to_string(),
            label: "Desktop".to_string(),
            connected_at_ms: now_ms(),
            transport_type: "webrtc".to_string(),
        });

        a.state = AcceptorState::Disconnected;
        a.connected_peers.clear();

        assert_eq!(a.state, AcceptorState::Disconnected);
        assert!(a.connected_peers.is_empty());
    }

    #[test]
    fn is_peer_known_finds_matching_pubkey() {
        let dir = tempfile::tempdir().expect("tempdir");
        let path = dir.path().join("test_peers.json");
        let mut store = PairedPeerStore::load(&path);

        let peer = PairedPeer {
            peer_id: "desktop-1".to_string(),
            label: "My Desktop".to_string(),
            relay_url: "wss://relay.test".to_string(),
            peer_pubkey: vec![10, 20, 30],
            client_pubkey: vec![40, 50, 60],
            client_privkey_hex: "aabbcc".to_string(),
            last_seen: 0,
            paired_at: 0,
        };
        store.upsert(peer);
        store.save().unwrap();

        let found = is_peer_known(&[10, 20, 30], &store);
        assert!(found.is_some());
        assert_eq!(found.unwrap().peer_id, "desktop-1");

        let not_found = is_peer_known(&[99, 99, 99], &store);
        assert!(not_found.is_none());
    }

    #[test]
    fn acceptor_state_serialization() {
        let states = vec![
            (AcceptorState::Idle, "\"idle\""),
            (AcceptorState::Listening, "\"listening\""),
            (AcceptorState::Handshaking, "\"handshaking\""),
            (AcceptorState::Connected, "\"connected\""),
            (AcceptorState::Disconnected, "\"disconnected\""),
        ];
        for (state, expected) in states {
            let json = serde_json::to_string(&state).unwrap();
            assert_eq!(json, expected, "AcceptorState::{:?} serialization", state);
        }
    }

    #[test]
    fn connected_peer_serialization_roundtrip() {
        let peer = ConnectedPeer {
            peer_id: "desktop-1".to_string(),
            label: "My Desktop".to_string(),
            connected_at_ms: 1700000000000,
            transport_type: "webrtc".to_string(),
        };
        let json = serde_json::to_string(&peer).unwrap();
        let deserialized: ConnectedPeer = serde_json::from_str(&json).unwrap();
        assert_eq!(deserialized.peer_id, "desktop-1");
        assert_eq!(deserialized.connected_at_ms, 1700000000000);
    }

    #[test]
    fn wss_transport_type_in_connected_peer() {
        let peer = ConnectedPeer {
            peer_id: "desktop-wss".to_string(),
            label: "Desktop via WSS".to_string(),
            connected_at_ms: now_ms(),
            transport_type: "wss".to_string(),
        };
        assert_eq!(peer.transport_type, "wss");
        let json = serde_json::to_string(&peer).unwrap();
        assert!(json.contains("\"wss\""));
    }

    #[test]
    fn mobile_acceptor_struct_api_delegates() {
        // MobileAcceptor::status() should return the same as get_status()
        let status = MobileAcceptor::status();
        let status2 = get_status();
        assert_eq!(status.state, status2.state);
    }

    #[test]
    fn peer_connection_tracking() {
        let mut a = fresh();
        a.state = AcceptorState::Connected;
        a.relay_url = Some("wss://relay.test".to_string());

        // Simulate adding a peer with connection tracking
        a.connected_peers.push(ConnectedPeer {
            peer_id: "desktop-1".to_string(),
            label: "Desktop".to_string(),
            connected_at_ms: now_ms(),
            transport_type: "webrtc".to_string(),
        });

        // Verify peer_connections can be added (conn_mgr is created per-peer)
        let conn_mgr = NetworkConnectionManager::new();
        a.peer_connections.push((
            "desktop-1".to_string(),
            PeerConnection {
                conn_mgr,
                shutdown_tx: None,
            },
        ));
        assert_eq!(a.peer_connections.len(), 1);
        assert_eq!(a.peer_connections[0].0, "desktop-1");

        // Remove peer cleans up both lists
        a.connected_peers.retain(|p| p.peer_id != "desktop-1");
        a.peer_connections.retain(|(id, _)| id != "desktop-1");
        assert!(a.connected_peers.is_empty());
        assert!(a.peer_connections.is_empty());
    }

    #[test]
    fn unknown_peer_error_format() {
        // Verify the error format for unknown peers contains the pubkey hex
        let pubkey = vec![0xab, 0xcd, 0xef];
        let hex: String = pubkey.iter().map(|b| format!("{b:02x}")).collect();
        let err = format!("unknown_peer:{hex}");
        assert!(err.starts_with("unknown_peer:"));
        assert!(err.contains("abcdef"));
    }

    #[test]
    fn hex_decode_valid() {
        assert_eq!(hex_decode("aabbcc").unwrap(), vec![0xaa, 0xbb, 0xcc]);
        assert_eq!(hex_decode("00ff").unwrap(), vec![0x00, 0xff]);
        assert_eq!(hex_decode("").unwrap(), Vec::<u8>::new());
    }

    #[test]
    fn hex_decode_invalid() {
        assert!(hex_decode("abc").is_err()); // odd length
        assert!(hex_decode("zz").is_err()); // invalid hex
    }
}
