use chromvoid_protocol::{NoiseTransport, RemoteTransport, TransportType, MAX_HANDSHAKE_MSG};
use tracing::{info, warn};

use std::future;
use std::path::{Path, PathBuf};
use std::sync::{Arc, Mutex};
use std::time::Duration;

use super::super::paired_peers::{PairedPeer, PairedPeerStore};
use super::super::signaling::SignalingClient;
use super::{
    direct_transport::{self, DirectTransportStopReason, DirectTransportTimelineContext},
    is_peer_known, now_ms, rpc_loop, set_handshaking_if_current, AcceptorState, ConnectedPeer,
    MobileAcceptorRuntimeState, NetworkConnectionManager, PeerConnection,
};
#[cfg(desktop)]
use super::{force_wss_acceptor_for_test, WEBRTC_RESPONDER_TIMEOUT};
use crate::core_adapter::CoreAdapter;
use crate::mobile_usb::{
    mobile_usb_hex_encode, recv_mobile_usb_pairing_hello, send_mobile_usb_pairing_hello,
    MobileUsbPairingHello,
};
use crate::network::{LocalDeviceIdentity, LocalDeviceIdentityStore};

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
        noise: NoiseTransport,
        remote_pubkey: Vec<u8>,
    },
}

#[derive(Debug, Default)]
pub(super) struct AcceptAttemptProgress {
    pub(super) saw_msg1: bool,
}

#[derive(Debug, Clone, Copy, PartialEq, Eq)]
enum PeerTaskMode {
    Detached,
    WaitUntilClosed,
}

pub(super) struct AcceptedTransportConnection {
    pub(super) peer_id: String,
    #[cfg_attr(not(any(target_os = "android", test)), allow(dead_code))]
    pub(super) stop_reason: Option<DirectTransportStopReason>,
}

/// IK msg1 minimum size (96+ bytes: encrypted static key + ephemeral).
/// XX msg1 is ~32 bytes (just ephemeral key).
const IK_MSG1_MIN_SIZE: usize = 96;
const NOISE_HANDSHAKE_MESSAGE_TIMEOUT: Duration = Duration::from_secs(5);

/// Accept a single incoming Desktop connection.
///
/// Full flow:
/// 1. Transport setup: WebRTC responder (primary), WSS relay (fallback)
/// 2. Noise IK handshake for known peers, XX for unknown
/// 3. Peer identity verification against `PairedPeerStore`
/// 4. For unknown peers: delegate to pairing flow
/// 5. Create `NetworkConnectionManager` + host RPC loop
/// 6. Register connected peer
pub(super) async fn accept_connection(
    runtime: Arc<MobileAcceptorRuntimeState>,
    generation: u64,
    adapter: Option<Arc<Mutex<Box<dyn CoreAdapter>>>>,
    signaling: Option<&mut SignalingClient>,
    storage_root: &std::path::Path,
    relay_url: &str,
    room_id: &str,
    progress: &mut AcceptAttemptProgress,
) -> Result<String, String> {
    info!(
        "mobile_acceptor: accept_connection:start relay={} room_id={}",
        relay_url, room_id
    );

    let (transport, transport_type) = establish_transport(signaling, relay_url, room_id).await?;

    info!(
        "mobile_acceptor: awaiting noise msg1 relay={} room_id={} transport_type={:?}",
        relay_url, room_id, transport_type
    );
    let accepted = accept_transport_connection_for_generation(
        runtime,
        generation,
        adapter,
        storage_root,
        transport,
        transport_type,
        progress,
        None,
        PeerTaskMode::Detached,
        None,
    )
    .await?;
    Ok(accepted.peer_id)
}

#[cfg_attr(not(target_os = "android"), allow(dead_code))]
pub(crate) async fn accept_transport_connection(
    runtime: Arc<MobileAcceptorRuntimeState>,
    adapter: Option<Arc<Mutex<Box<dyn CoreAdapter>>>>,
    storage_root: &Path,
    transport: Box<dyn RemoteTransport>,
    transport_type: TransportType,
    peer_label: String,
    shutdown_rx: tokio::sync::oneshot::Receiver<()>,
) -> Result<String, String> {
    let generation = runtime.begin_direct_transport_session(peer_label)?;
    let mut progress = AcceptAttemptProgress::default();
    let accepted = accept_transport_connection_for_generation(
        runtime,
        generation,
        adapter,
        storage_root,
        transport,
        transport_type,
        &mut progress,
        Some(shutdown_rx),
        PeerTaskMode::Detached,
        None,
    )
    .await?;
    Ok(accepted.peer_id)
}

#[cfg_attr(not(target_os = "android"), allow(dead_code))]
pub(crate) async fn accept_transport_connection_until_closed(
    runtime: Arc<MobileAcceptorRuntimeState>,
    adapter: Option<Arc<Mutex<Box<dyn CoreAdapter>>>>,
    storage_root: &Path,
    transport: Box<dyn RemoteTransport>,
    transport_type: TransportType,
    peer_label: String,
    shutdown_rx: tokio::sync::oneshot::Receiver<()>,
) -> Result<String, String> {
    accept_transport_connection_until_closed_internal(
        runtime,
        adapter,
        storage_root,
        transport,
        transport_type,
        peer_label,
        shutdown_rx,
        None,
    )
    .await
    .map(|accepted| accepted.peer_id)
}

pub(super) async fn accept_transport_connection_until_closed_internal(
    runtime: Arc<MobileAcceptorRuntimeState>,
    adapter: Option<Arc<Mutex<Box<dyn CoreAdapter>>>>,
    storage_root: &Path,
    transport: Box<dyn RemoteTransport>,
    transport_type: TransportType,
    peer_label: String,
    shutdown_rx: tokio::sync::oneshot::Receiver<()>,
    direct_timeline: Option<DirectTransportTimelineContext>,
) -> Result<AcceptedTransportConnection, String> {
    let generation = runtime.begin_direct_transport_session(peer_label)?;
    let mut progress = AcceptAttemptProgress::default();
    accept_transport_connection_for_generation(
        runtime,
        generation,
        adapter,
        storage_root,
        transport,
        transport_type,
        &mut progress,
        Some(shutdown_rx),
        PeerTaskMode::WaitUntilClosed,
        direct_timeline,
    )
    .await
}

async fn accept_transport_connection_for_generation(
    runtime: Arc<MobileAcceptorRuntimeState>,
    generation: u64,
    adapter: Option<Arc<Mutex<Box<dyn CoreAdapter>>>>,
    storage_root: &Path,
    mut transport: Box<dyn RemoteTransport>,
    transport_type: TransportType,
    progress: &mut AcceptAttemptProgress,
    mut external_shutdown_rx: Option<tokio::sync::oneshot::Receiver<()>>,
    peer_task_mode: PeerTaskMode,
    direct_timeline: Option<DirectTransportTimelineContext>,
) -> Result<AcceptedTransportConnection, String> {
    info!(
        "mobile_acceptor: awaiting noise msg1 transport_type={:?}",
        transport_type
    );
    let msg1 = recv_initial_handshake_message(
        transport.as_mut(),
        transport_type,
        &mut external_shutdown_rx,
        "noise msg1 recv",
    )
    .await?;
    info!(
        "mobile_acceptor: received noise msg1 transport_type={:?} len={}",
        transport_type,
        msg1.len()
    );
    progress.saw_msg1 = true;
    if !set_handshaking_if_current(&runtime, generation)? {
        return Err("stale acceptor generation".to_string());
    }

    let store_path = storage_root.join("paired_network_peers.json");
    let store = load_paired_peer_store_blocking(store_path.clone()).await?;
    let local_identity = load_or_create_local_identity_blocking(storage_root.to_path_buf()).await?;
    let local_privkey = hex_decode(&local_identity.static_privkey_hex)?;
    let outcome = perform_handshake(transport.as_mut(), &msg1, &store, &local_privkey).await?;

    let (noise_transport, peer_id, label) = match outcome {
        HandshakeOutcome::Paired {
            noise,
            peer_id,
            label,
        } => (noise, peer_id, label),
        HandshakeOutcome::UnknownPeer {
            noise,
            remote_pubkey,
        } if transport_type == TransportType::UsbMobile => {
            confirm_usb_mobile_pairing(
                transport.as_mut(),
                noise,
                store_path.clone(),
                remote_pubkey,
                &local_identity,
            )
            .await?
        }
        HandshakeOutcome::UnknownPeer {
            noise: _,
            remote_pubkey,
        } => {
            let pubkey_hex = remote_pubkey
                .iter()
                .map(|b| format!("{b:02x}"))
                .collect::<String>();
            warn!(
                "Unknown peer with pubkey {} — pairing confirmation required",
                pubkey_hex
            );
            runtime.with_acceptor_if_current(generation, |a| {
                if a.state == AcceptorState::Handshaking {
                    a.state = AcceptorState::Listening;
                }
            })?;
            return Err(format!("unknown_peer:{}", pubkey_hex));
        }
    };

    let transport_type_name = acceptor_transport_type_name(transport_type);
    info!(
        "Noise handshake completed with peer={} ({})",
        peer_id, transport_type_name
    );

    let mut conn_mgr = NetworkConnectionManager::new();
    conn_mgr.transition(crate::core_adapter::ConnectionState::Syncing);

    let (shutdown_tx, shutdown_rx) = tokio::sync::oneshot::channel::<()>();
    let (rpc_shutdown_rx, shutdown_bridge_handle) =
        bridge_peer_shutdown(shutdown_rx, external_shutdown_rx);

    let peer = ConnectedPeer {
        peer_id: peer_id.clone(),
        label: label.clone(),
        connected_at_ms: now_ms(),
        transport_type: transport_type_name.to_string(),
    };
    let connection = PeerConnection {
        conn_mgr,
        generation,
        shutdown_tx: Some(shutdown_tx),
        task_handle: None,
    };
    if !runtime.add_peer_if_current(generation, peer, connection)? {
        return Err("stale acceptor generation".to_string());
    }

    spawn_touch_paired_peer_store(store_path, peer_id.clone());

    if let Some(timeline) = direct_timeline.as_ref() {
        crate::mobile_usb::observability::log_timeline_event(
            crate::mobile_usb::observability::MobileUsbTimelineEvent {
                trace_id: Some(&timeline.trace_id),
                usb_session_id: timeline.usb_session_id.as_deref(),
                owner: "android_host",
                phase: "host_rpc_loop_started",
                operation: "accept_direct_transport",
                peer_id: Some(&peer_id),
                bridge_kind: timeline.bridge_kind,
                ..crate::mobile_usb::observability::MobileUsbTimelineEvent::default()
            },
        );
    }

    let task_storage_root = storage_root.to_path_buf();
    let task_peer_id = peer_id.clone();
    let task_runtime = runtime.clone();
    let peer_loop = async move {
        let result = rpc_loop::run_host_rpc_loop(
            adapter,
            transport,
            noise_transport,
            transport_type,
            task_storage_root,
            task_peer_id.clone(),
            rpc_shutdown_rx,
        )
        .await;
        shutdown_bridge_handle.abort();
        if let Err(error) = &result {
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
        let _ = task_runtime.remove_peer_if_current(generation, &task_peer_id);
        direct_transport::stop_reason_from_rpc_loop_result(&result)
    };
    let stop_reason = match peer_task_mode {
        PeerTaskMode::Detached => {
            let peer_handle = tokio::spawn(async move {
                let _ = peer_loop.await;
            });
            if !runtime.store_peer_task_if_current(generation, &peer_id, peer_handle)? {
                return Err("stale acceptor generation".to_string());
            }
            None
        }
        PeerTaskMode::WaitUntilClosed => Some(peer_loop.await),
    };

    Ok(AcceptedTransportConnection {
        peer_id,
        stop_reason,
    })
}

fn acceptor_transport_type_name(transport_type: TransportType) -> &'static str {
    match transport_type {
        TransportType::WebRtcDataChannel => "webrtc",
        TransportType::WssRelay => "wss",
        TransportType::UsbMobile => "usb_mobile",
        _ => "unknown",
    }
}

fn bridge_peer_shutdown(
    mut peer_shutdown_rx: tokio::sync::oneshot::Receiver<()>,
    mut external_shutdown_rx: Option<tokio::sync::oneshot::Receiver<()>>,
) -> (
    tokio::sync::oneshot::Receiver<()>,
    tokio::task::JoinHandle<()>,
) {
    let (rpc_shutdown_tx, rpc_shutdown_rx) = tokio::sync::oneshot::channel();
    let handle = tokio::spawn(async move {
        tokio::select! {
            _ = &mut peer_shutdown_rx => {}
            _ = async {
                match external_shutdown_rx.as_mut() {
                    Some(rx) => {
                        let _ = rx.await;
                    }
                    None => future::pending::<()>().await,
                }
            } => {}
        }
        let _ = rpc_shutdown_tx.send(());
    });
    (rpc_shutdown_rx, handle)
}

async fn load_paired_peer_store_blocking(store_path: PathBuf) -> Result<PairedPeerStore, String> {
    tauri::async_runtime::spawn_blocking(move || PairedPeerStore::load(&store_path))
        .await
        .map_err(|error| format!("mobile acceptor peer store load task failed: {error}"))
}

async fn load_or_create_local_identity_blocking(
    storage_root: PathBuf,
) -> Result<LocalDeviceIdentity, String> {
    tauri::async_runtime::spawn_blocking(move || {
        let mut store =
            LocalDeviceIdentityStore::load(&storage_root.join("network_local_identity.json"));
        store.get_or_create("ChromVoid Host")
    })
    .await
    .map_err(|error| format!("mobile acceptor identity load task failed: {error}"))?
}

async fn touch_paired_peer_store_blocking(
    store_path: PathBuf,
    peer_id: String,
) -> Result<(), String> {
    tauri::async_runtime::spawn_blocking(move || {
        let mut loaded = PairedPeerStore::load(&store_path);
        loaded.touch(&peer_id);
        loaded.save()
    })
    .await
    .map_err(|error| format!("mobile acceptor peer store touch task failed: {error}"))?
}

fn spawn_touch_paired_peer_store(store_path: PathBuf, peer_id: String) {
    tauri::async_runtime::spawn(async move {
        if let Err(error) = touch_paired_peer_store_blocking(store_path, peer_id).await {
            warn!("mobile_acceptor: failed to update paired peer last_seen: {error}");
        }
    });
}

async fn confirm_usb_mobile_pairing(
    transport: &mut dyn RemoteTransport,
    mut noise: NoiseTransport,
    store_path: PathBuf,
    remote_pubkey: Vec<u8>,
    local_identity: &LocalDeviceIdentity,
) -> Result<(NoiseTransport, String, String), String> {
    let hello = recv_mobile_usb_pairing_hello(transport, &mut noise).await?;
    let remote_pubkey_hex = mobile_usb_hex_encode(&remote_pubkey);
    if hello.peer_pubkey_hex != remote_pubkey_hex {
        return Err("USB pairing hello pubkey mismatch".to_string());
    }

    let local_pubkey = hex_decode(&local_identity.static_pubkey_hex)?;
    persist_usb_mobile_pairing_blocking(
        store_path,
        PairedPeer {
            peer_id: hello.peer_id.clone(),
            label: hello.peer_label.clone(),
            relay_url: "usb://android-aoa".to_string(),
            peer_pubkey: remote_pubkey,
            client_pubkey: local_pubkey,
            client_privkey_hex: local_identity.static_privkey_hex.clone(),
            last_seen: now_secs(),
            paired_at: now_secs(),
            platform: hello.platform,
        },
    )
    .await?;

    send_mobile_usb_pairing_hello(
        transport,
        &mut noise,
        &MobileUsbPairingHello {
            peer_id: local_identity.device_id.clone(),
            peer_label: local_identity.device_label.clone(),
            peer_pubkey_hex: local_identity.static_pubkey_hex.clone(),
            platform: "android".to_string(),
        },
    )
    .await?;

    Ok((noise, hello.peer_id, hello.peer_label))
}

async fn persist_usb_mobile_pairing_blocking(
    store_path: PathBuf,
    peer: PairedPeer,
) -> Result<(), String> {
    tauri::async_runtime::spawn_blocking(move || {
        let mut store = PairedPeerStore::load(&store_path);
        store.upsert(peer);
        store.save()
    })
    .await
    .map_err(|error| format!("USB mobile pairing persistence task failed: {error}"))?
}

fn now_secs() -> u64 {
    std::time::SystemTime::now()
        .duration_since(std::time::UNIX_EPOCH)
        .map(|duration| duration.as_secs())
        .unwrap_or_default()
}

async fn establish_transport(
    #[cfg(desktop)] signaling: Option<&mut SignalingClient>,
    #[cfg(not(desktop))] _signaling: Option<&mut SignalingClient>,
    relay_url: &str,
    room_id: &str,
) -> Result<(Box<dyn RemoteTransport>, TransportType), String> {
    #[cfg(desktop)]
    {
        use super::super::fallback::default_ice_servers;
        use super::super::webrtc_transport::WebRtcTransport;
        use super::super::wss_transport::WssTransport;

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
            return Ok((Box::new(wss), TransportType::WssRelay));
        }

        let signaling = signaling.ok_or("signaling client missing on desktop".to_string())?;
        let ice_servers = default_ice_servers();
        let webrtc_result = tokio::time::timeout(
            WEBRTC_RESPONDER_TIMEOUT,
            WebRtcTransport::connect_as_responder(signaling, ice_servers),
        )
        .await;

        match webrtc_result {
            Ok(Ok(t)) => {
                info!("WebRTC responder transport established");
                Ok((Box::new(t), TransportType::WebRtcDataChannel))
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
                Ok((Box::new(wss), TransportType::WssRelay))
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
                Ok((Box::new(wss), TransportType::WssRelay))
            }
        }
    }
    #[cfg(not(desktop))]
    {
        use super::super::wss_transport::WssTransport;

        let wss =
            WssTransport::connect_with_context(relay_url, room_id, "mobile_acceptor_mobile_only")
                .await
                .map_err(|e| format!("WSS connect failed: {e}"))?;
        info!("WSS relay transport established (mobile-only)");
        Ok((Box::new(wss), TransportType::WssRelay))
    }
}

async fn recv_handshake_message(
    transport: &mut (dyn RemoteTransport + '_),
    label: &'static str,
) -> Result<Vec<u8>, String> {
    recv_handshake_message_with_timeout_for(transport, label, NOISE_HANDSHAKE_MESSAGE_TIMEOUT).await
}

async fn recv_initial_handshake_message(
    transport: &mut (dyn RemoteTransport + '_),
    transport_type: TransportType,
    external_shutdown_rx: &mut Option<tokio::sync::oneshot::Receiver<()>>,
    label: &'static str,
) -> Result<Vec<u8>, String> {
    if transport_type != TransportType::UsbMobile {
        return recv_handshake_message(transport, label).await;
    }

    match external_shutdown_rx.as_mut() {
        Some(shutdown_rx) => {
            tokio::select! {
                result = transport.recv() => result.map_err(|e| format!("{label}: {e}")),
                _ = shutdown_rx => Err(format!("{label}: shutdown before first USB mobile message")),
            }
        }
        None => transport.recv().await.map_err(|e| format!("{label}: {e}")),
    }
}

async fn recv_handshake_message_with_timeout_for(
    transport: &mut (dyn RemoteTransport + '_),
    label: &'static str,
    timeout_duration: Duration,
) -> Result<Vec<u8>, String> {
    tokio::time::timeout(timeout_duration, transport.recv())
        .await
        .map_err(|_| format!("{label}: timeout after {}s", timeout_duration.as_secs()))?
        .map_err(|e| format!("{label}: {e}"))
}

async fn perform_handshake(
    transport: &mut (dyn RemoteTransport + '_),
    msg1: &[u8],
    store: &PairedPeerStore,
    local_privkey: &[u8],
) -> Result<HandshakeOutcome, String> {
    let mut buf = vec![0u8; MAX_HANDSHAKE_MSG];
    if msg1.len() >= IK_MSG1_MIN_SIZE {
        noise_ik_responder(transport, msg1, &mut buf, store, local_privkey).await
    } else {
        noise_xx_responder(transport, msg1, &mut buf, store, local_privkey).await
    }
}

/// IK responder handshake over a transport (2 messages).
async fn noise_ik_responder(
    transport: &mut (dyn RemoteTransport + '_),
    msg1: &[u8],
    buf: &mut [u8],
    store: &PairedPeerStore,
    local_privkey: &[u8],
) -> Result<HandshakeOutcome, String> {
    use chromvoid_protocol::NOISE_PARAMS_IK;
    use snow::params::NoiseParams;

    let params: NoiseParams = NOISE_PARAMS_IK
        .parse()
        .map_err(|e: snow::Error| format!("IK params: {e}"))?;

    let mut responder = snow::Builder::new(params)
        .local_private_key(local_privkey)
        .map_err(|e| format!("IK local_private_key: {e}"))?
        .build_responder()
        .map_err(|e| format!("IK build_responder: {e}"))?;

    responder
        .read_message(msg1, buf)
        .map_err(|e| format!("IK msg1 read: {e}"))?;

    let remote_pubkey = responder
        .get_remote_static()
        .ok_or("IK: no remote static key")?
        .to_vec();

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
            noise,
            remote_pubkey,
        }),
    }
}

/// XX responder handshake over a transport (3 messages).
async fn noise_xx_responder(
    transport: &mut (dyn RemoteTransport + '_),
    msg1: &[u8],
    buf: &mut [u8],
    store: &PairedPeerStore,
    local_privkey: &[u8],
) -> Result<HandshakeOutcome, String> {
    use chromvoid_protocol::NOISE_PARAMS_XX;
    use snow::params::NoiseParams;

    let params: NoiseParams = NOISE_PARAMS_XX
        .parse()
        .map_err(|e: snow::Error| format!("XX params: {e}"))?;

    let mut responder = snow::Builder::new(params)
        .local_private_key(local_privkey)
        .map_err(|e| format!("XX local_private_key: {e}"))?
        .build_responder()
        .map_err(|e| format!("XX build_responder: {e}"))?;

    responder
        .read_message(msg1, buf)
        .map_err(|e| format!("XX msg1 read: {e}"))?;

    let len2 = responder
        .write_message(&[], buf)
        .map_err(|e| format!("XX msg2 write: {e}"))?;
    transport
        .send(&buf[..len2])
        .await
        .map_err(|e| format!("XX msg2 send: {e}"))?;

    let msg3 = recv_handshake_message(transport, "XX msg3 recv").await?;
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
            noise,
            remote_pubkey,
        }),
    }
}

pub(super) fn hex_decode(s: &str) -> Result<Vec<u8>, String> {
    let s = s.trim();
    let bytes = s.as_bytes();
    if bytes.len() % 2 != 0 {
        return Err("hex string has odd length".to_string());
    }
    let mut out = Vec::with_capacity(bytes.len() / 2);
    for (pair_idx, pair) in bytes.chunks_exact(2).enumerate() {
        let hi = hex_nibble(pair[0])
            .ok_or_else(|| format!("invalid hex at {}: invalid digit", pair_idx * 2))?;
        let lo = hex_nibble(pair[1])
            .ok_or_else(|| format!("invalid hex at {}: invalid digit", pair_idx * 2 + 1))?;
        out.push((hi << 4) | lo);
    }
    Ok(out)
}

fn hex_nibble(byte: u8) -> Option<u8> {
    match byte {
        b'0'..=b'9' => Some(byte - b'0'),
        b'a'..=b'f' => Some(byte - b'a' + 10),
        b'A'..=b'F' => Some(byte - b'A' + 10),
        _ => None,
    }
}

#[cfg(test)]
mod tests {
    use super::*;
    use crate::network::{LocalDeviceIdentity, PairedPeer};
    use chromvoid_core::rpc::types::{RpcRequest, RpcResponse};
    use chromvoid_core::rpc::RpcReply;
    use chromvoid_protocol::{
        Frame, FrameType, NoiseTransport, TransportError, NOISE_PARAMS_IK, NOISE_PARAMS_XX,
    };
    use snow::params::NoiseParams;
    use std::sync::atomic::{AtomicBool, Ordering};
    use tokio::sync::mpsc;

    struct PendingTransport;

    struct RecordingAdapter {
        commands: Arc<Mutex<Vec<String>>>,
        unlocked: Arc<AtomicBool>,
    }

    impl CoreAdapter for RecordingAdapter {
        fn mode(&self) -> crate::core_adapter::CoreMode {
            crate::core_adapter::CoreMode::Local
        }

        fn connection_state(&self) -> crate::core_adapter::ConnectionState {
            crate::core_adapter::ConnectionState::Ready
        }

        fn is_unlocked(&self) -> bool {
            self.unlocked.load(Ordering::SeqCst)
        }

        fn handle(&mut self, req: &RpcRequest) -> RpcResponse {
            self.commands
                .lock()
                .expect("commands")
                .push(req.command.clone());
            match req.command.as_str() {
                "core:capabilities" => RpcResponse::success(serde_json::json!({
                    "features": [],
                    "protocol_version": 1,
                })),
                "vault:status" => RpcResponse::success(serde_json::json!({
                    "is_unlocked": self.is_unlocked(),
                    "session_started_at": 1,
                })),
                "vault:lock" => {
                    self.unlocked.store(false, Ordering::SeqCst);
                    RpcResponse::success(serde_json::Value::Null)
                }
                _ => RpcResponse::success(serde_json::Value::Null),
            }
        }

        fn handle_with_stream(
            &mut self,
            req: &RpcRequest,
            _stream: Option<chromvoid_core::rpc::RpcInputStream>,
        ) -> RpcReply {
            RpcReply::Json(self.handle(req))
        }

        fn save(&mut self) -> Result<(), String> {
            Ok(())
        }

        fn take_events(&mut self) -> Vec<serde_json::Value> {
            Vec::new()
        }

        fn set_master_key(&mut self, _key: Option<String>) {}
    }

    #[async_trait::async_trait]
    impl RemoteTransport for PendingTransport {
        async fn send(&mut self, _data: &[u8]) -> Result<(), chromvoid_protocol::TransportError> {
            Ok(())
        }

        async fn recv(&mut self) -> Result<Vec<u8>, chromvoid_protocol::TransportError> {
            std::future::pending().await
        }

        async fn close(&mut self) -> Result<(), chromvoid_protocol::TransportError> {
            Ok(())
        }

        fn transport_type(&self) -> TransportType {
            TransportType::WssRelay
        }
    }

    struct ChannelTransport {
        incoming: mpsc::UnboundedReceiver<Vec<u8>>,
        outgoing: mpsc::UnboundedSender<Vec<u8>>,
        transport_type: TransportType,
    }

    impl ChannelTransport {
        fn pair(transport_type: TransportType) -> (Self, Self) {
            let (left_tx, left_rx) = mpsc::unbounded_channel();
            let (right_tx, right_rx) = mpsc::unbounded_channel();
            (
                Self {
                    incoming: left_rx,
                    outgoing: right_tx,
                    transport_type,
                },
                Self {
                    incoming: right_rx,
                    outgoing: left_tx,
                    transport_type,
                },
            )
        }
    }

    #[async_trait::async_trait]
    impl RemoteTransport for ChannelTransport {
        async fn send(&mut self, data: &[u8]) -> Result<(), TransportError> {
            self.outgoing
                .send(data.to_vec())
                .map_err(|_| TransportError::Closed)
        }

        async fn recv(&mut self) -> Result<Vec<u8>, TransportError> {
            self.incoming.recv().await.ok_or(TransportError::Closed)
        }

        async fn close(&mut self) -> Result<(), TransportError> {
            self.incoming.close();
            Ok(())
        }

        fn transport_type(&self) -> TransportType {
            self.transport_type
        }
    }

    fn hex_encode(bytes: &[u8]) -> String {
        bytes.iter().map(|byte| format!("{byte:02x}")).collect()
    }

    fn paired_ik_store(storage_root: &Path) -> Result<(Vec<u8>, Vec<u8>, Vec<u8>), String> {
        let store_path = storage_root.join("paired_network_peers.json");
        let params: NoiseParams = NOISE_PARAMS_IK
            .parse()
            .map_err(|error: snow::Error| error.to_string())?;
        let builder = snow::Builder::new(params);
        let host_keypair = builder
            .generate_keypair()
            .map_err(|error| error.to_string())?;
        let client_keypair = builder
            .generate_keypair()
            .map_err(|error| error.to_string())?;
        crate::helpers::storage::write_json_pretty_atomic(
            &storage_root.join("network_local_identity.json"),
            &LocalDeviceIdentity {
                device_id: "android-host-1".to_string(),
                device_label: "Android Host".to_string(),
                static_pubkey_hex: hex_encode(&host_keypair.public),
                static_privkey_hex: hex_encode(&host_keypair.private),
                created_at: 1,
            },
        )?;
        let mut store = PairedPeerStore::load(&store_path);
        store.upsert(PairedPeer {
            peer_id: "desktop-usb-1".to_string(),
            label: "Desktop USB".to_string(),
            relay_url: "usb://android".to_string(),
            peer_pubkey: client_keypair.public.clone(),
            client_pubkey: host_keypair.public.clone(),
            client_privkey_hex: "00".to_string(),
            last_seen: 1,
            paired_at: 1,
            platform: "desktop".to_string(),
        });
        store.save()?;
        Ok((
            client_keypair.private,
            host_keypair.public,
            client_keypair.public,
        ))
    }

    async fn complete_ik_initiator_handshake(
        transport: &mut dyn RemoteTransport,
        client_private: &[u8],
        host_public: &[u8],
    ) -> Result<(), String> {
        let _ =
            complete_ik_initiator_handshake_with_transport(transport, client_private, host_public)
                .await?;
        Ok(())
    }

    async fn complete_ik_initiator_handshake_with_transport(
        transport: &mut dyn RemoteTransport,
        client_private: &[u8],
        host_public: &[u8],
    ) -> Result<NoiseTransport, String> {
        let params: NoiseParams = NOISE_PARAMS_IK
            .parse()
            .map_err(|error: snow::Error| error.to_string())?;
        let mut initiator = snow::Builder::new(params)
            .local_private_key(client_private)
            .map_err(|error| error.to_string())?
            .remote_public_key(host_public)
            .map_err(|error| error.to_string())?
            .build_initiator()
            .map_err(|error| error.to_string())?;
        let mut buf = vec![0_u8; MAX_HANDSHAKE_MSG];
        let msg1_len = initiator
            .write_message(&[], &mut buf)
            .map_err(|error| error.to_string())?;
        transport
            .send(&buf[..msg1_len])
            .await
            .map_err(|error| error.to_string())?;
        let msg2 = transport.recv().await.map_err(|error| error.to_string())?;
        initiator
            .read_message(&msg2, &mut buf)
            .map_err(|error| error.to_string())?;
        let transport_state = initiator
            .into_transport_mode()
            .map_err(|error| error.to_string())?;
        Ok(NoiseTransport::new(transport_state, host_public.to_vec()))
    }

    async fn complete_xx_initiator_handshake_with_transport(
        transport: &mut dyn RemoteTransport,
        client_private: &[u8],
    ) -> Result<NoiseTransport, String> {
        let params: NoiseParams = NOISE_PARAMS_XX
            .parse()
            .map_err(|error: snow::Error| error.to_string())?;
        let mut initiator = snow::Builder::new(params)
            .local_private_key(client_private)
            .map_err(|error| error.to_string())?
            .build_initiator()
            .map_err(|error| error.to_string())?;
        let mut buf = vec![0_u8; MAX_HANDSHAKE_MSG];
        let msg1_len = initiator
            .write_message(&[], &mut buf)
            .map_err(|error| error.to_string())?;
        transport
            .send(&buf[..msg1_len])
            .await
            .map_err(|error| error.to_string())?;
        let msg2 = transport.recv().await.map_err(|error| error.to_string())?;
        initiator
            .read_message(&msg2, &mut buf)
            .map_err(|error| error.to_string())?;
        let msg3_len = initiator
            .write_message(&[], &mut buf)
            .map_err(|error| error.to_string())?;
        transport
            .send(&buf[..msg3_len])
            .await
            .map_err(|error| error.to_string())?;
        let host_public = initiator
            .get_remote_static()
            .ok_or("XX initiator: no remote static key")?
            .to_vec();
        let transport_state = initiator
            .into_transport_mode()
            .map_err(|error| error.to_string())?;
        Ok(NoiseTransport::new(transport_state, host_public))
    }

    #[test]
    fn hex_decode_rejects_multibyte_input_without_panic() {
        assert!(hex_decode("éé").is_err());
        assert!(hex_decode("0é").is_err());
    }

    #[tokio::test]
    async fn recv_handshake_message_times_out() {
        let mut transport = PendingTransport;

        let error = recv_handshake_message_with_timeout_for(
            &mut transport,
            "noise msg1 recv",
            Duration::from_millis(5),
        )
        .await
        .expect_err("pending transport should time out");

        assert!(error.contains("noise msg1 recv: timeout"));
    }

    #[tokio::test]
    async fn touch_paired_peer_store_blocking_updates_last_seen() {
        let dir = tempfile::tempdir().expect("tempdir");
        let store_path = dir.path().join("paired_network_peers.json");
        let peer_id = "desktop-1".to_string();
        let mut seed_store = PairedPeerStore::load(&store_path);
        seed_store.upsert(PairedPeer {
            peer_id: peer_id.clone(),
            label: "Desktop".to_string(),
            relay_url: "wss://relay.test".to_string(),
            peer_pubkey: vec![1, 2, 3],
            client_pubkey: vec![4, 5, 6],
            client_privkey_hex: "00".to_string(),
            last_seen: 1,
            paired_at: 1,
            platform: "desktop".to_string(),
        });
        seed_store.save().expect("save seed peer");

        touch_paired_peer_store_blocking(store_path.clone(), peer_id.clone())
            .await
            .expect("touch peer");

        let loaded = PairedPeerStore::load(&store_path);
        let touched = loaded.get(&peer_id).expect("peer should exist");
        assert!(touched.last_seen > 1);
    }

    #[tokio::test]
    async fn accept_transport_connection_registers_usb_mobile_peer() {
        let dir = tempfile::tempdir().expect("tempdir");
        let (client_private, host_public, _client_public) =
            paired_ik_store(dir.path()).expect("paired store");
        let runtime = Arc::new(MobileAcceptorRuntimeState::new());
        let (mut client_transport, host_transport) =
            ChannelTransport::pair(TransportType::UsbMobile);
        let (_shutdown_tx, shutdown_rx) = tokio::sync::oneshot::channel();
        let storage_root = dir.path().to_path_buf();
        let accept_runtime = runtime.clone();

        let accept_task = tokio::spawn(async move {
            accept_transport_connection(
                accept_runtime,
                None,
                &storage_root,
                Box::new(host_transport),
                TransportType::UsbMobile,
                "android-device-1".to_string(),
                shutdown_rx,
            )
            .await
        });

        complete_ik_initiator_handshake(&mut client_transport, &client_private, &host_public)
            .await
            .expect("client IK handshake");
        let peer_id = accept_task.await.expect("accept task").expect("accept");

        assert_eq!(peer_id, "desktop-usb-1");
        let status = runtime
            .with_acceptor(|acceptor| acceptor.status())
            .expect("status");
        assert_eq!(status.state, AcceptorState::Connected);
        assert_eq!(status.connected_peers.len(), 1);
        assert_eq!(status.connected_peers[0].transport_type, "usb_mobile");
        assert!(status.relay_url.is_none());
    }

    #[tokio::test]
    async fn accept_transport_connection_usb_mobile_persists_unknown_xx_pairing() {
        let dir = tempfile::tempdir().expect("tempdir");
        let params: NoiseParams = NOISE_PARAMS_XX.parse().expect("XX params");
        let host_keypair = snow::Builder::new(params.clone())
            .generate_keypair()
            .expect("host keypair");
        let client_keypair = snow::Builder::new(params)
            .generate_keypair()
            .expect("client keypair");
        crate::helpers::storage::write_json_pretty_atomic(
            &dir.path().join("network_local_identity.json"),
            &LocalDeviceIdentity {
                device_id: "android-host-1".to_string(),
                device_label: "Android Host".to_string(),
                static_pubkey_hex: hex_encode(&host_keypair.public),
                static_privkey_hex: hex_encode(&host_keypair.private),
                created_at: 1,
            },
        )
        .expect("write identity");

        let runtime = Arc::new(MobileAcceptorRuntimeState::new());
        let (mut client_transport, host_transport) =
            ChannelTransport::pair(TransportType::UsbMobile);
        let (_shutdown_tx, shutdown_rx) = tokio::sync::oneshot::channel();
        let storage_root = dir.path().to_path_buf();
        let accept_runtime = runtime.clone();
        let accept_task = tokio::spawn(async move {
            accept_transport_connection(
                accept_runtime,
                None,
                &storage_root,
                Box::new(host_transport),
                TransportType::UsbMobile,
                "android-device-1".to_string(),
                shutdown_rx,
            )
            .await
        });

        let mut client_noise = complete_xx_initiator_handshake_with_transport(
            &mut client_transport,
            &client_keypair.private,
        )
        .await
        .expect("client XX handshake");
        crate::mobile_usb::send_mobile_usb_pairing_hello(
            &mut client_transport,
            &mut client_noise,
            &crate::mobile_usb::MobileUsbPairingHello {
                peer_id: "desktop-usb-new".to_string(),
                peer_label: "Desktop USB".to_string(),
                peer_pubkey_hex: hex_encode(&client_keypair.public),
                platform: "desktop".to_string(),
            },
        )
        .await
        .expect("send pairing hello");
        let ack = crate::mobile_usb::recv_mobile_usb_pairing_hello(
            &mut client_transport,
            &mut client_noise,
        )
        .await
        .expect("recv pairing ack");
        let peer_id = accept_task.await.expect("accept task").expect("accept");

        assert_eq!(peer_id, "desktop-usb-new");
        assert_eq!(ack.peer_id, "android-host-1");
        assert_eq!(ack.peer_label, "Android Host");
        assert_eq!(ack.peer_pubkey_hex, hex_encode(&host_keypair.public));
        assert_eq!(ack.platform, "android");

        let loaded = PairedPeerStore::load(&dir.path().join("paired_network_peers.json"));
        let persisted = loaded.get("desktop-usb-new").expect("persisted peer");
        assert_eq!(persisted.label, "Desktop USB");
        assert_eq!(persisted.relay_url, "usb://android-aoa");
        assert_eq!(persisted.peer_pubkey, client_keypair.public);
        assert_eq!(persisted.client_pubkey, host_keypair.public);
        assert_eq!(
            persisted.client_privkey_hex,
            hex_encode(&host_keypair.private)
        );
        assert_eq!(persisted.platform, "desktop");
    }

    #[tokio::test]
    async fn accept_transport_connection_until_closed_keeps_usb_rpc_loop_alive() {
        let dir = tempfile::tempdir().expect("tempdir");
        let (client_private, host_public, _client_public) =
            paired_ik_store(dir.path()).expect("paired store");
        let runtime = Arc::new(MobileAcceptorRuntimeState::new());
        let (mut client_transport, host_transport) =
            ChannelTransport::pair(TransportType::UsbMobile);
        let (shutdown_tx, shutdown_rx) = tokio::sync::oneshot::channel();
        let storage_root = dir.path().to_path_buf();
        let accept_runtime = runtime.clone();

        let mut accept_task = tokio::spawn(async move {
            accept_transport_connection_until_closed(
                accept_runtime,
                None,
                &storage_root,
                Box::new(host_transport),
                TransportType::UsbMobile,
                "android-device-1".to_string(),
                shutdown_rx,
            )
            .await
        });

        let mut client_noise = complete_ik_initiator_handshake_with_transport(
            &mut client_transport,
            &client_private,
            &host_public,
        )
        .await
        .expect("client IK handshake");
        assert!(
            tokio::time::timeout(Duration::from_millis(50), &mut accept_task)
                .await
                .is_err(),
            "USB direct accept task must stay alive after IK while host rpc loop is active"
        );

        let request = RpcRequest::new("core:capabilities", serde_json::json!({}));
        let request_frame = Frame {
            frame_type: FrameType::RpcRequest,
            message_id: 7,
            flags: 0,
            payload: serde_json::to_vec(&request).expect("request json"),
        };
        let encrypted_request = client_noise
            .encrypt(&request_frame.encode())
            .expect("encrypt request");
        client_transport
            .send(&encrypted_request)
            .await
            .expect("send startup RPC");
        let encrypted_response =
            tokio::time::timeout(Duration::from_secs(1), client_transport.recv())
                .await
                .expect("startup RPC response timeout")
                .expect("startup RPC response");
        let decrypted_response = client_noise
            .decrypt(&encrypted_response)
            .expect("decrypt response");
        let response_frame = Frame::decode(&decrypted_response).expect("response frame");
        assert_eq!(response_frame.frame_type, FrameType::RpcResponse);
        assert_eq!(response_frame.message_id, 7);
        let response: RpcResponse =
            serde_json::from_slice(&response_frame.payload).expect("response json");
        assert!(response.is_ok());

        shutdown_tx.send(()).expect("shutdown send");
        let peer_id = tokio::time::timeout(Duration::from_secs(1), accept_task)
            .await
            .expect("accept task should stop after shutdown")
            .expect("accept task")
            .expect("accept result");
        assert_eq!(peer_id, "desktop-usb-1");
        let status = runtime
            .with_acceptor(|acceptor| acceptor.status())
            .expect("status");
        assert_eq!(status.state, AcceptorState::Idle);
        assert!(status.connected_peers.is_empty());
    }

    #[tokio::test]
    async fn remote_vault_lock_disconnects_without_locking_mobile_vault() {
        let dir = tempfile::tempdir().expect("tempdir");
        let (client_private, host_public, _client_public) =
            paired_ik_store(dir.path()).expect("paired store");
        let runtime = Arc::new(MobileAcceptorRuntimeState::new());
        let (mut client_transport, host_transport) =
            ChannelTransport::pair(TransportType::UsbMobile);
        let (_shutdown_tx, shutdown_rx) = tokio::sync::oneshot::channel();
        let storage_root = dir.path().to_path_buf();
        let accept_runtime = runtime.clone();
        let commands = Arc::new(Mutex::new(Vec::<String>::new()));
        let unlocked = Arc::new(AtomicBool::new(true));
        let adapter: Arc<Mutex<Box<dyn CoreAdapter>>> =
            Arc::new(Mutex::new(Box::new(RecordingAdapter {
                commands: commands.clone(),
                unlocked: unlocked.clone(),
            })));

        let accept_task = tokio::spawn(async move {
            accept_transport_connection_until_closed(
                accept_runtime,
                Some(adapter),
                &storage_root,
                Box::new(host_transport),
                TransportType::UsbMobile,
                "android-device-1".to_string(),
                shutdown_rx,
            )
            .await
        });

        let mut client_noise = complete_ik_initiator_handshake_with_transport(
            &mut client_transport,
            &client_private,
            &host_public,
        )
        .await
        .expect("client IK handshake");
        let request = RpcRequest::new("vault:lock", serde_json::json!({}));
        let request_frame = Frame {
            frame_type: FrameType::RpcRequest,
            message_id: 17,
            flags: 0,
            payload: serde_json::to_vec(&request).expect("request json"),
        };
        let encrypted_request = client_noise
            .encrypt(&request_frame.encode())
            .expect("encrypt request");
        client_transport
            .send(&encrypted_request)
            .await
            .expect("send remote vault lock");

        let encrypted_response =
            tokio::time::timeout(Duration::from_secs(1), client_transport.recv())
                .await
                .expect("remote lock response timeout")
                .expect("remote lock response");
        let decrypted_response = client_noise
            .decrypt(&encrypted_response)
            .expect("decrypt response");
        let response_frame = Frame::decode(&decrypted_response).expect("response frame");
        assert_eq!(response_frame.frame_type, FrameType::RpcResponse);
        assert_eq!(response_frame.message_id, 17);
        let response: RpcResponse =
            serde_json::from_slice(&response_frame.payload).expect("response json");
        assert!(response.is_ok());

        let peer_id = tokio::time::timeout(Duration::from_secs(1), accept_task)
            .await
            .expect("accept task should stop after remote lock")
            .expect("accept task")
            .expect("accept result");
        assert_eq!(peer_id, "desktop-usb-1");
        assert!(unlocked.load(Ordering::SeqCst));
        assert!(!commands
            .lock()
            .expect("commands")
            .iter()
            .any(|command| command == "vault:lock"));

        let status = runtime
            .with_acceptor(|acceptor| acceptor.status())
            .expect("status");
        assert_eq!(status.state, AcceptorState::Idle);
        assert!(status.connected_peers.is_empty());
    }

    #[tokio::test]
    async fn known_usb_mobile_peer_accepts_pairing_preflight_before_rpc() {
        let dir = tempfile::tempdir().expect("tempdir");
        let (client_private, host_public, client_public) =
            paired_ik_store(dir.path()).expect("paired store");
        let runtime = Arc::new(MobileAcceptorRuntimeState::new());
        let (mut client_transport, host_transport) =
            ChannelTransport::pair(TransportType::UsbMobile);
        let (shutdown_tx, shutdown_rx) = tokio::sync::oneshot::channel();
        let storage_root = dir.path().to_path_buf();
        let accept_runtime = runtime.clone();

        let accept_task = tokio::spawn(async move {
            accept_transport_connection_until_closed(
                accept_runtime,
                None,
                &storage_root,
                Box::new(host_transport),
                TransportType::UsbMobile,
                "android-device-1".to_string(),
                shutdown_rx,
            )
            .await
        });

        let mut client_noise = complete_ik_initiator_handshake_with_transport(
            &mut client_transport,
            &client_private,
            &host_public,
        )
        .await
        .expect("client IK handshake");
        crate::mobile_usb::send_mobile_usb_pairing_hello(
            &mut client_transport,
            &mut client_noise,
            &crate::mobile_usb::MobileUsbPairingHello {
                peer_id: "desktop-usb-1".to_string(),
                peer_label: "Desktop USB".to_string(),
                peer_pubkey_hex: hex_encode(&client_public),
                platform: "desktop".to_string(),
            },
        )
        .await
        .expect("send pairing preflight");
        let ack = crate::mobile_usb::recv_mobile_usb_pairing_hello(
            &mut client_transport,
            &mut client_noise,
        )
        .await
        .expect("recv pairing preflight ack");
        assert_eq!(ack.peer_pubkey_hex, hex_encode(&host_public));

        let request = RpcRequest::new("core:capabilities", serde_json::json!({}));
        let request_frame = Frame {
            frame_type: FrameType::RpcRequest,
            message_id: 11,
            flags: 0,
            payload: serde_json::to_vec(&request).expect("request json"),
        };
        let encrypted_request = client_noise
            .encrypt(&request_frame.encode())
            .expect("encrypt request");
        client_transport
            .send(&encrypted_request)
            .await
            .expect("send startup RPC");
        let encrypted_response =
            tokio::time::timeout(Duration::from_secs(1), client_transport.recv())
                .await
                .expect("startup RPC response timeout")
                .expect("startup RPC response");
        let decrypted_response = client_noise
            .decrypt(&encrypted_response)
            .expect("decrypt response");
        let response_frame = Frame::decode(&decrypted_response).expect("response frame");
        assert_eq!(response_frame.frame_type, FrameType::RpcResponse);
        assert_eq!(response_frame.message_id, 11);

        shutdown_tx.send(()).expect("shutdown send");
        let peer_id = tokio::time::timeout(Duration::from_secs(1), accept_task)
            .await
            .expect("accept task should stop after shutdown")
            .expect("accept task")
            .expect("accept result");
        assert_eq!(peer_id, "desktop-usb-1");
    }

    #[tokio::test]
    async fn direct_transport_until_closed_returns_terminal_outcome() {
        let dir = tempfile::tempdir().expect("tempdir");
        let (client_private, host_public, _client_public) =
            paired_ik_store(dir.path()).expect("paired store");
        let runtime = Arc::new(MobileAcceptorRuntimeState::new());
        let (mut client_transport, host_transport) =
            ChannelTransport::pair(TransportType::UsbMobile);
        let (shutdown_tx, shutdown_rx) = tokio::sync::oneshot::channel();
        let storage_root = dir.path().to_path_buf();
        let accept_runtime = runtime.clone();

        let mut accept_task = tokio::spawn(async move {
            crate::network::mobile_acceptor::accept_direct_transport_until_closed(
                accept_runtime,
                None,
                &storage_root,
                Box::new(host_transport),
                TransportType::UsbMobile,
                "android-device-1".to_string(),
                shutdown_rx,
                crate::network::mobile_acceptor::DirectTransportTimelineContext::android_usb(
                    "android-session-1",
                ),
            )
            .await
        });

        complete_ik_initiator_handshake(&mut client_transport, &client_private, &host_public)
            .await
            .expect("client IK handshake");
        assert!(
            tokio::time::timeout(Duration::from_millis(50), &mut accept_task)
                .await
                .is_err(),
            "direct transport accept task must stay alive after IK"
        );

        shutdown_tx.send(()).expect("shutdown send");
        let outcome = tokio::time::timeout(Duration::from_secs(1), accept_task)
            .await
            .expect("accept task should stop after shutdown")
            .expect("accept task")
            .expect("accept outcome");

        assert_eq!(outcome.peer_id, "desktop-usb-1");
        assert_eq!(outcome.transport_type, TransportType::UsbMobile);
        assert_eq!(
            outcome.stop_reason,
            crate::network::mobile_acceptor::DirectTransportStopReason::Shutdown
        );
    }

    #[tokio::test]
    async fn accept_transport_connection_usb_mobile_waits_for_late_first_msg1() {
        let dir = tempfile::tempdir().expect("tempdir");
        let (client_private, host_public, _client_public) =
            paired_ik_store(dir.path()).expect("paired store");
        let runtime = Arc::new(MobileAcceptorRuntimeState::new());
        let (mut client_transport, host_transport) =
            ChannelTransport::pair(TransportType::UsbMobile);
        let (_shutdown_tx, shutdown_rx) = tokio::sync::oneshot::channel();
        let storage_root = dir.path().to_path_buf();
        let accept_runtime = runtime.clone();

        let accept_task = tokio::spawn(async move {
            accept_transport_connection(
                accept_runtime,
                None,
                &storage_root,
                Box::new(host_transport),
                TransportType::UsbMobile,
                "android-device-1".to_string(),
                shutdown_rx,
            )
            .await
        });

        tokio::time::sleep(NOISE_HANDSHAKE_MESSAGE_TIMEOUT + Duration::from_millis(250)).await;

        complete_ik_initiator_handshake(&mut client_transport, &client_private, &host_public)
            .await
            .expect("client IK handshake after delayed connect");
        let peer_id = accept_task.await.expect("accept task").expect("accept");

        assert_eq!(peer_id, "desktop-usb-1");
        let status = runtime
            .with_acceptor(|acceptor| acceptor.status())
            .expect("status");
        assert_eq!(status.state, AcceptorState::Connected);
        assert_eq!(status.connected_peers.len(), 1);
        assert_eq!(status.connected_peers[0].transport_type, "usb_mobile");
    }
}
