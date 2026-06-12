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

mod accept;
mod listener;
mod rpc_loop;
mod state;

use std::sync::{Arc, Mutex};
use std::time::{SystemTime, UNIX_EPOCH};

use serde::{Deserialize, Serialize};
use tracing::info;

use super::connection::NetworkConnectionManager;
use super::paired_peers::{PairedPeer, PairedPeerStore};
use super::signaling::SignalingClient;
use crate::core_adapter::CoreAdapter;
#[cfg(test)]
use accept::hex_decode;
use listener::listener_loop;
#[cfg(test)]
use listener::{wait_until_next_accept_ready, AcceptErrorClass, RetryBackoffState};
#[cfg(test)]
use state::AcceptorInner;
pub use state::MobileAcceptorRuntimeState;
use state::PeerConnection;

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

// ── Internal state ─────────────────────────────────────────────────────

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
/// Wraps app-scoped runtime state and provides a struct-based interface
/// for starting/stopping the listener and querying status.
pub struct MobileAcceptor;

impl MobileAcceptor {
    /// Begin listening for incoming Desktop connections.
    pub async fn start(
        runtime: Arc<MobileAcceptorRuntimeState>,
        adapter: Option<Arc<Mutex<Box<dyn CoreAdapter>>>>,
        relay_url: &str,
        room_id: &str,
        storage_root: &std::path::Path,
    ) -> Result<AcceptorStatus, String> {
        start_listening(runtime, adapter, relay_url, room_id, storage_root).await
    }

    /// Stop listening and disconnect all peers.
    pub fn stop(runtime: &MobileAcceptorRuntimeState) -> Result<AcceptorStatus, String> {
        stop_listening(runtime)
    }

    /// Get current acceptor status + connected peers.
    pub fn status(runtime: &MobileAcceptorRuntimeState) -> Result<AcceptorStatus, String> {
        get_status(runtime)
    }

    /// Get list of currently connected Desktop peers.
    pub fn connected_peers(
        runtime: &MobileAcceptorRuntimeState,
    ) -> Result<Vec<ConnectedPeer>, String> {
        get_connected_peers(runtime)
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
    runtime: Arc<MobileAcceptorRuntimeState>,
    adapter: Option<Arc<Mutex<Box<dyn CoreAdapter>>>>,
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
    let current = runtime.with_acceptor(|a| a.state)?;
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

    let generation = runtime.begin_listener_task()?;
    let (shutdown_tx, shutdown_rx) = tokio::sync::oneshot::channel::<()>();

    // Transition to Listening and store metadata.
    let relay_owned = relay_url.to_string();
    let room_owned = room_id.to_string();
    let status = runtime.with_acceptor(|a| {
        if let Some(tx) = a.shutdown_tx.take() {
            let _ = tx.send(());
        }
        for (_id, pc) in a.peer_connections.iter_mut() {
            pc.conn_mgr.disconnect();
            if let Some(tx) = pc.shutdown_tx.take() {
                let _ = tx.send(());
            }
            if let Some(handle) = pc.task_handle.take() {
                handle.abort();
            }
        }
        a.state = AcceptorState::Listening;
        a.relay_url = Some(relay_owned.clone());
        a.room_id = Some(room_owned.clone());
        a.connected_peers.clear();
        a.peer_connections.clear();
        a.shutdown_tx = Some(shutdown_tx);
        a.status()
    })?;

    let storage_root = storage_root.to_path_buf();
    let listener_runtime = runtime.clone();

    // Spawn background listener task.
    let listener_handle = tokio::spawn(async move {
        listener_loop(
            listener_runtime,
            generation,
            adapter,
            signaling,
            shutdown_rx,
            storage_root,
            relay_owned,
            room_owned,
        )
        .await;
    });
    runtime.store_listener_task(generation, listener_handle)?;

    info!(
        "mobile_acceptor: listening relay={} room_id={} state={:?}",
        relay_url, room_id, status.state
    );
    Ok(status)
}

/// Stop listening and disconnect all peers.
pub fn stop_listening(runtime: &MobileAcceptorRuntimeState) -> Result<AcceptorStatus, String> {
    let status = runtime.cancel_all_tasks()?;
    info!("Mobile acceptor stopped");
    Ok(status)
}

/// Get current acceptor status + connected peers.
pub fn get_status(runtime: &MobileAcceptorRuntimeState) -> Result<AcceptorStatus, String> {
    runtime.with_acceptor(|a| a.status())
}

/// Get list of currently connected Desktop peers.
pub fn get_connected_peers(
    runtime: &MobileAcceptorRuntimeState,
) -> Result<Vec<ConnectedPeer>, String> {
    runtime.with_acceptor(|a| a.connected_peers.clone())
}

// ── Peer management (called from listener task) ────────────────────────

/// Record a new connected peer. Transitions state to Connected.
#[cfg(test)]
pub(crate) fn add_connected_peer(
    runtime: &MobileAcceptorRuntimeState,
    peer: ConnectedPeer,
) -> Result<(), String> {
    runtime.with_acceptor(|a| {
        a.connected_peers.push(peer);
        a.state = AcceptorState::Connected;
    })
}

/// Remove a peer by ID. If no peers left, transitions to Listening.
#[cfg(test)]
pub(crate) fn remove_connected_peer(
    runtime: &MobileAcceptorRuntimeState,
    peer_id: &str,
) -> Result<(), String> {
    runtime.with_acceptor(|a| {
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
    })
}

pub(crate) fn set_handshaking_if_current(
    runtime: &MobileAcceptorRuntimeState,
    generation: u64,
) -> Result<bool, String> {
    runtime
        .with_acceptor_if_current(generation, |a| {
            if a.state == AcceptorState::Listening {
                a.state = AcceptorState::Handshaking;
            }
        })
        .map(|result| result.is_some())
}

/// Transition to Disconnected state (called on unexpected connection loss).
#[allow(dead_code)] // Called on unexpected connection loss at runtime
pub(crate) fn set_disconnected(runtime: &MobileAcceptorRuntimeState) -> Result<(), String> {
    runtime.with_acceptor(|a| {
        a.state = AcceptorState::Disconnected;
        a.connected_peers.clear();
    })
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

/// Timeout for WebRTC responder before falling back to WSS.
#[cfg(any(desktop, test))]
const WEBRTC_RESPONDER_TIMEOUT: std::time::Duration = std::time::Duration::from_secs(15);

// ── Tests ──────────────────────────────────────────────────────────────

#[cfg(test)]
mod tests {
    use super::*;
    use std::sync::atomic::{AtomicBool, Ordering};
    use std::sync::Arc;
    use std::sync::Mutex;
    use std::time::Duration;

    static TEST_ACCEPTOR_LOCK: Mutex<()> = Mutex::new(());

    /// Helper: create a fresh AcceptorInner for isolated testing.
    fn fresh() -> AcceptorInner {
        AcceptorInner::new()
    }

    fn fresh_runtime() -> MobileAcceptorRuntimeState {
        MobileAcceptorRuntimeState::new()
    }

    struct DropFlag(Arc<AtomicBool>);

    impl Drop for DropFlag {
        fn drop(&mut self) {
            self.0.store(true, Ordering::Release);
        }
    }

    #[test]
    fn force_wss_acceptor_override_only_enables_for_explicit_test_env() {
        let _guard = TEST_ACCEPTOR_LOCK
            .lock()
            .unwrap_or_else(|poisoned| poisoned.into_inner());
        let original = std::env::var_os("CHROMVOID_TEST_FORCE_WSS_ACCEPTOR");

        // SAFETY: env mutation in test fixture; serialised by ACCEPTOR_TEST_LOCK Mutex (line 325) and restored at end of test.
        unsafe {
            std::env::remove_var("CHROMVOID_TEST_FORCE_WSS_ACCEPTOR");
        }
        assert!(!force_wss_acceptor_for_test());

        // SAFETY: env mutation in test fixture; serialised by ACCEPTOR_TEST_LOCK Mutex (line 325) and restored at end of test.
        unsafe {
            std::env::set_var("CHROMVOID_TEST_FORCE_WSS_ACCEPTOR", "1");
        }
        assert!(force_wss_acceptor_for_test());

        match original {
            // SAFETY: env mutation in test fixture; serialised by ACCEPTOR_TEST_LOCK Mutex (line 325) and restored at end of test.
            Some(value) => unsafe {
                std::env::set_var("CHROMVOID_TEST_FORCE_WSS_ACCEPTOR", value);
            },
            // SAFETY: env mutation in test fixture; serialised by ACCEPTOR_TEST_LOCK Mutex (line 325) and restored at end of test.
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
    fn runtime_instances_are_isolated() {
        let first = fresh_runtime();
        let second = fresh_runtime();

        first
            .with_acceptor(|a| {
                a.state = AcceptorState::Listening;
                a.room_id = Some("room-a".to_string());
            })
            .unwrap();

        let first_status = get_status(&first).unwrap();
        let second_status = get_status(&second).unwrap();

        assert_eq!(first_status.state, AcceptorState::Listening);
        assert_eq!(first_status.room_id.as_deref(), Some("room-a"));
        assert_eq!(second_status.state, AcceptorState::Idle);
        assert!(second_status.room_id.is_none());
    }

    #[tokio::test]
    async fn listener_replacement_invalidates_and_aborts_previous_task() {
        let runtime = fresh_runtime();
        let generation = runtime.begin_listener_task().expect("begin listener");
        let dropped = Arc::new(AtomicBool::new(false));
        let drop_flag = DropFlag(dropped.clone());
        let handle = tokio::spawn(async move {
            let _drop_flag = drop_flag;
            std::future::pending::<()>().await;
        });
        runtime
            .store_listener_task(generation, handle)
            .expect("store listener");

        let replacement_generation = runtime.begin_listener_task().expect("replace listener");

        assert!(!runtime.is_generation_current(generation));
        assert!(runtime.is_generation_current(replacement_generation));
        tokio::time::sleep(Duration::from_millis(20)).await;
        assert!(dropped.load(Ordering::Acquire));
    }

    #[tokio::test]
    async fn cancel_all_tasks_aborts_listener_and_peer_handles() {
        let runtime = fresh_runtime();
        let generation = runtime.begin_listener_task().expect("begin listener");
        let listener_dropped = Arc::new(AtomicBool::new(false));
        let listener_drop_flag = DropFlag(listener_dropped.clone());
        let listener_handle = tokio::spawn(async move {
            let _drop_flag = listener_drop_flag;
            std::future::pending::<()>().await;
        });
        runtime
            .store_listener_task(generation, listener_handle)
            .expect("store listener");

        let peer_dropped = Arc::new(AtomicBool::new(false));
        let peer_drop_flag = DropFlag(peer_dropped.clone());
        let peer_handle = tokio::spawn(async move {
            let _drop_flag = peer_drop_flag;
            std::future::pending::<()>().await;
        });
        let (shutdown_tx, _shutdown_rx) = tokio::sync::oneshot::channel::<()>();
        runtime
            .with_acceptor(|a| {
                a.state = AcceptorState::Connected;
                a.relay_url = Some("wss://relay.test".to_string());
                a.room_id = Some("room-123".to_string());
                a.connected_peers.push(ConnectedPeer {
                    peer_id: "desktop-1".to_string(),
                    label: "Desktop".to_string(),
                    connected_at_ms: now_ms(),
                    transport_type: "wss".to_string(),
                });
                a.peer_connections.push((
                    "desktop-1".to_string(),
                    PeerConnection {
                        conn_mgr: NetworkConnectionManager::new(),
                        generation,
                        shutdown_tx: Some(shutdown_tx),
                        task_handle: Some(peer_handle),
                    },
                ));
            })
            .expect("seed peer");

        let status = runtime.cancel_all_tasks().expect("cancel all");

        assert_eq!(status.state, AcceptorState::Idle);
        assert!(status.connected_peers.is_empty());
        assert!(status.relay_url.is_none());
        assert!(status.room_id.is_none());
        tokio::time::sleep(Duration::from_millis(20)).await;
        assert!(listener_dropped.load(Ordering::Acquire));
        assert!(peer_dropped.load(Ordering::Acquire));
    }

    #[test]
    fn stale_generation_cannot_add_connected_peer() {
        let runtime = fresh_runtime();
        let generation = runtime.begin_listener_task().expect("begin listener");
        let stale_generation = generation.saturating_sub(1);
        let peer = ConnectedPeer {
            peer_id: "desktop-1".to_string(),
            label: "Desktop".to_string(),
            connected_at_ms: now_ms(),
            transport_type: "wss".to_string(),
        };
        let added = runtime
            .add_peer_if_current(
                stale_generation,
                peer,
                PeerConnection {
                    conn_mgr: NetworkConnectionManager::new(),
                    generation: stale_generation,
                    shutdown_tx: None,
                    task_handle: None,
                },
            )
            .expect("add stale peer");

        assert!(!added);
        assert!(get_connected_peers(&runtime).unwrap().is_empty());
        assert_eq!(get_status(&runtime).unwrap().state, AcceptorState::Idle);
    }

    #[test]
    fn stale_generation_cannot_remove_current_peer() {
        let runtime = fresh_runtime();
        let generation = runtime.begin_listener_task().expect("begin listener");
        let peer = ConnectedPeer {
            peer_id: "desktop-1".to_string(),
            label: "Desktop".to_string(),
            connected_at_ms: now_ms(),
            transport_type: "wss".to_string(),
        };
        assert!(runtime
            .add_peer_if_current(
                generation,
                peer,
                PeerConnection {
                    conn_mgr: NetworkConnectionManager::new(),
                    generation,
                    shutdown_tx: None,
                    task_handle: None,
                },
            )
            .expect("add peer"));

        let removed = runtime
            .remove_peer_if_current(generation.saturating_sub(1), "desktop-1")
            .expect("remove stale peer");

        assert!(!removed);
        assert_eq!(get_connected_peers(&runtime).unwrap().len(), 1);
        assert_eq!(
            get_status(&runtime).unwrap().state,
            AcceptorState::Connected
        );
    }

    #[tokio::test]
    async fn clear_listener_task_only_clears_current_generation() {
        let runtime = fresh_runtime();
        let generation = runtime.begin_listener_task().expect("begin listener");
        let handle = tokio::spawn(async {});
        runtime
            .store_listener_task(generation, handle)
            .expect("store listener");

        runtime
            .clear_listener_task_if_current(generation.saturating_sub(1))
            .expect("clear stale listener");
        assert!(runtime
            .with_acceptor(|a| a.listener_task.is_some())
            .expect("listener task status"));

        runtime
            .clear_listener_task_if_current(generation)
            .expect("clear current listener");
        assert!(!runtime
            .with_acceptor(|a| a.listener_task.is_some())
            .expect("listener task status"));
    }

    #[test]
    fn poisoned_runtime_mutex_returns_controlled_error() {
        let runtime = fresh_runtime();
        let _ = std::panic::catch_unwind(std::panic::AssertUnwindSafe(|| {
            let _ = runtime.with_acceptor(|_| panic!("poison mobile acceptor mutex"));
        }));

        let error = runtime.cancel_all_tasks().expect_err("poison error");

        assert_eq!(error, "Mobile acceptor mutex poisoned");
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
    fn classify_accept_error_detects_pre_msg1_timeout() {
        assert_eq!(
            AcceptErrorClass::classify("noise msg1 recv: timeout after 5s"),
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
        let runtime = std::sync::Arc::new(fresh_runtime());
        runtime
            .with_acceptor(|a| {
                a.state = AcceptorState::Connected;
                a.relay_url = Some("wss://relay.test".to_string());
                a.room_id = Some("room-123".to_string());
                a.connected_peers.push(ConnectedPeer {
                    peer_id: "desktop-1".to_string(),
                    label: "Desktop".to_string(),
                    connected_at_ms: now_ms(),
                    transport_type: "wss".to_string(),
                });
            })
            .unwrap();

        let (_shutdown_tx, mut shutdown_rx) = tokio::sync::oneshot::channel::<()>();
        let wait_runtime = runtime.clone();
        let wait_task = tokio::spawn(async move {
            wait_until_next_accept_ready(&wait_runtime, &mut shutdown_rx).await
        });

        tokio::time::sleep(Duration::from_millis(50)).await;
        assert!(
            !wait_task.is_finished(),
            "listener gate must keep waiting while peer is still connected"
        );

        remove_connected_peer(&runtime, "desktop-1").unwrap();

        let ready = tokio::time::timeout(Duration::from_secs(1), wait_task)
            .await
            .expect("gate should unblock after peer removal")
            .expect("join should succeed");
        assert!(
            ready,
            "gate should report ready when peer list becomes empty"
        );
        assert_eq!(
            get_status(&runtime).unwrap().state,
            AcceptorState::Listening
        );
    }

    #[tokio::test(flavor = "current_thread")]
    async fn wait_until_next_accept_ready_returns_immediately_after_last_peer_removed() {
        let runtime = fresh_runtime();
        runtime
            .with_acceptor(|a| {
                a.state = AcceptorState::Connected;
                a.relay_url = Some("wss://relay.test".to_string());
                a.room_id = Some("room-123".to_string());
                a.connected_peers.push(ConnectedPeer {
                    peer_id: "desktop-1".to_string(),
                    label: "Desktop".to_string(),
                    connected_at_ms: now_ms(),
                    transport_type: "wss".to_string(),
                });
            })
            .unwrap();

        remove_connected_peer(&runtime, "desktop-1").unwrap();
        assert_eq!(
            get_status(&runtime).unwrap().state,
            AcceptorState::Listening
        );

        let (_shutdown_tx, mut shutdown_rx) = tokio::sync::oneshot::channel::<()>();
        let ready = wait_until_next_accept_ready(&runtime, &mut shutdown_rx).await;
        assert!(
            ready,
            "listener gate should allow the next accept after peer removal"
        );
    }

    #[test]
    fn reconnect_after_last_peer_reuses_same_room_lifecycle() {
        let runtime = fresh_runtime();
        runtime
            .with_acceptor(|a| {
                a.state = AcceptorState::Connected;
                a.relay_url = Some("wss://relay.test".to_string());
                a.room_id = Some("room-123".to_string());
                a.connected_peers.push(ConnectedPeer {
                    peer_id: "desktop-1".to_string(),
                    label: "Desktop 1".to_string(),
                    connected_at_ms: now_ms(),
                    transport_type: "wss".to_string(),
                });
            })
            .unwrap();

        remove_connected_peer(&runtime, "desktop-1").unwrap();
        let after_disconnect = get_status(&runtime).unwrap();
        assert_eq!(after_disconnect.state, AcceptorState::Listening);
        assert_eq!(after_disconnect.room_id.as_deref(), Some("room-123"));
        assert!(after_disconnect.connected_peers.is_empty());

        add_connected_peer(
            &runtime,
            ConnectedPeer {
                peer_id: "desktop-2".to_string(),
                label: "Desktop 2".to_string(),
                connected_at_ms: now_ms(),
                transport_type: "wss".to_string(),
            },
        )
        .unwrap();

        let after_reconnect = get_status(&runtime).unwrap();
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
            platform: "desktop".to_string(),
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
        let runtime = fresh_runtime();
        let status = MobileAcceptor::status(&runtime).unwrap();
        let status2 = get_status(&runtime).unwrap();
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
                generation: 0,
                shutdown_tx: None,
                task_handle: None,
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
