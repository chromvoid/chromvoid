#[cfg(test)]
use chromvoid_protocol::MAX_HANDSHAKE_MSG;
use chromvoid_protocol::{RemoteTransport, TransportType};
use tracing::{info, warn};
use uuid::Uuid;

use std::future;
use std::path::Path;
use std::sync::{Arc, Mutex};
#[cfg(test)]
use std::time::Duration;

use super::super::signaling::SignalingClient;
use super::{
    direct_transport::{
        self, DirectTransportAcceptFailure, DirectTransportStopReason,
        DirectTransportTimelineContext, HostRpcShutdownSource,
    },
    now_ms, rpc_loop, set_handshaking_if_current, AcceptorState, ConnectedPeer,
    MobileAcceptorRuntimeState, NetworkConnectionManager, PeerConnection,
};
#[cfg(desktop)]
use super::{force_wss_acceptor_for_test, WEBRTC_RESPONDER_TIMEOUT};
use crate::core_adapter::CoreAdapter;
use crate::mobile_usb::{MobileUsbHostApprovalDecision, MobileUsbHostSessionApprovalView};
#[cfg(test)]
use crate::network::paired_peers::PairedPeerStore;
#[cfg(target_os = "android")]
use tauri::Emitter as _;
mod handshake;
mod pairing;
mod peer_store;

use handshake::{perform_handshake, recv_initial_handshake_message, HandshakeOutcome};
#[cfg(test)]
use handshake::{recv_handshake_message_with_timeout_for, NOISE_HANDSHAKE_MESSAGE_TIMEOUT};
use pairing::confirm_usb_mobile_pairing;
#[cfg(test)]
use peer_store::touch_paired_peer_store_blocking;
use peer_store::{
    load_or_create_local_identity_blocking, load_paired_peer_store_blocking,
    spawn_touch_paired_peer_store,
};

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
    .await
    .map_err(|error| error.to_string())?;
    Ok(accepted.peer_id)
}

#[cfg(test)]
pub(crate) async fn accept_transport_connection(
    runtime: Arc<MobileAcceptorRuntimeState>,
    adapter: Option<Arc<Mutex<Box<dyn CoreAdapter>>>>,
    storage_root: &Path,
    transport: Box<dyn RemoteTransport>,
    transport_type: TransportType,
    peer_label: String,
    shutdown_rx: tokio::sync::oneshot::Receiver<()>,
) -> Result<String, String> {
    let shutdown_rx = direct_transport::shutdown_signal_from_unit_receiver(shutdown_rx);
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
    .await
    .map_err(|error| error.to_string())?;
    Ok(accepted.peer_id)
}

#[cfg(test)]
pub(crate) async fn accept_transport_connection_until_closed(
    runtime: Arc<MobileAcceptorRuntimeState>,
    adapter: Option<Arc<Mutex<Box<dyn CoreAdapter>>>>,
    storage_root: &Path,
    transport: Box<dyn RemoteTransport>,
    transport_type: TransportType,
    peer_label: String,
    shutdown_rx: tokio::sync::oneshot::Receiver<()>,
) -> Result<String, String> {
    let shutdown_rx = direct_transport::shutdown_signal_from_unit_receiver(shutdown_rx);
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
    .map_err(|error| error.to_string())
    .map(|accepted| accepted.peer_id)
}

pub(super) async fn accept_transport_connection_until_closed_internal(
    runtime: Arc<MobileAcceptorRuntimeState>,
    adapter: Option<Arc<Mutex<Box<dyn CoreAdapter>>>>,
    storage_root: &Path,
    transport: Box<dyn RemoteTransport>,
    transport_type: TransportType,
    peer_label: String,
    shutdown_rx: direct_transport::DirectTransportShutdownSignal,
    direct_timeline: Option<DirectTransportTimelineContext>,
) -> Result<AcceptedTransportConnection, DirectTransportAcceptFailure> {
    // Hold the direct-session scope for the whole session so lifecycle-driven
    // listener restarts cannot invalidate this session's acceptor generation.
    let _direct_session_scope = runtime.direct_transport_session_scope();
    let generation = runtime
        .begin_direct_transport_session(peer_label)
        .map_err(DirectTransportAcceptFailure::data_plane_error)?;
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
    mut external_shutdown_rx: Option<direct_transport::DirectTransportShutdownSignal>,
    peer_task_mode: PeerTaskMode,
    direct_timeline: Option<DirectTransportTimelineContext>,
) -> Result<AcceptedTransportConnection, DirectTransportAcceptFailure> {
    info!(
        "mobile_acceptor: awaiting noise msg1 transport_type={:?}",
        transport_type
    );
    let msg1 = recv_initial_handshake_message_for_accept(
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
    if !set_handshaking_if_current(&runtime, generation)
        .map_err(DirectTransportAcceptFailure::data_plane_error)?
    {
        return Err(DirectTransportAcceptFailure::data_plane_error(
            "stale acceptor generation",
        ));
    }

    let store_path = storage_root.join("paired_network_peers.json");
    let store = load_paired_peer_store_blocking(store_path.clone())
        .await
        .map_err(DirectTransportAcceptFailure::data_plane_error)?;
    let local_identity = load_or_create_local_identity_blocking(storage_root.to_path_buf())
        .await
        .map_err(DirectTransportAcceptFailure::data_plane_error)?;
    let local_privkey = hex_decode(&local_identity.static_privkey_hex)
        .map_err(DirectTransportAcceptFailure::data_plane_error)?;
    let outcome = perform_handshake(transport.as_mut(), &msg1, &store, &local_privkey)
        .await
        .map_err(DirectTransportAcceptFailure::protocol_error)?;

    let (noise_transport, peer_id, label) = match outcome {
        HandshakeOutcome::Paired {
            noise,
            peer_id,
            label,
        } => (noise, peer_id, label),
        HandshakeOutcome::UnknownPeer {
            noise,
            remote_pubkey,
        } if transport_type == TransportType::UsbMobile => confirm_usb_mobile_pairing(
            runtime.clone(),
            transport.as_mut(),
            noise,
            store_path.clone(),
            remote_pubkey,
            &local_identity,
        )
        .await
        .map_err(DirectTransportAcceptFailure::protocol_error)?,
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
            runtime
                .with_acceptor_if_current(generation, |a| {
                    if a.state == AcceptorState::Handshaking {
                        a.state = AcceptorState::Listening;
                    }
                })
                .map_err(DirectTransportAcceptFailure::data_plane_error)?;
            return Err(DirectTransportAcceptFailure::PairingComplete {
                peer_pubkey_hex: pubkey_hex,
            });
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
    let (rpc_shutdown_rx, shutdown_bridge_handle, shutdown_source) =
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
    if !runtime
        .add_peer_if_current(generation, peer, connection)
        .map_err(DirectTransportAcceptFailure::data_plane_error)?
    {
        return Err(DirectTransportAcceptFailure::data_plane_error(
            "stale acceptor generation",
        ));
    }

    spawn_touch_paired_peer_store(store_path, peer_id.clone());
    let usb_session_approval = if transport_type == TransportType::UsbMobile {
        let attempt_id = Uuid::new_v4().to_string();
        let expires_at_ms = now_ms().saturating_add(5 * 60 * 1000);
        runtime
            .register_usb_session_approval(MobileUsbHostSessionApprovalView {
                attempt_id: attempt_id.clone(),
                peer_id: peer_id.clone(),
                peer_label: label.clone(),
                transport_type: "usb_mobile".to_string(),
                decision: MobileUsbHostApprovalDecision::Pending,
                expires_at_ms,
            })
            .map_err(DirectTransportAcceptFailure::data_plane_error)?;
        emit_usb_session_approval_required(&attempt_id);
        Some(rpc_loop::UsbHostSessionApproval {
            runtime: runtime.clone(),
            attempt_id,
        })
    } else {
        None
    };

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
    let rpc_shutdown_source = shutdown_source.clone();
    let peer_loop = async move {
        let result = rpc_loop::run_host_rpc_loop_with_shutdown_source(
            adapter,
            transport,
            noise_transport,
            transport_type,
            task_storage_root,
            task_peer_id.clone(),
            rpc_shutdown_rx,
            usb_session_approval,
            rpc_shutdown_source,
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
        let shutdown_source = shutdown_source
            .lock()
            .expect("host rpc shutdown source lock")
            .take();
        direct_transport::stop_reason_from_rpc_loop_result(&result, shutdown_source)
    };
    let stop_reason = match peer_task_mode {
        PeerTaskMode::Detached => {
            let peer_handle = tokio::spawn(async move {
                let _ = peer_loop.await;
            });
            if !runtime
                .store_peer_task_if_current(generation, &peer_id, peer_handle)
                .map_err(DirectTransportAcceptFailure::data_plane_error)?
            {
                return Err(DirectTransportAcceptFailure::data_plane_error(
                    "stale acceptor generation",
                ));
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

async fn recv_initial_handshake_message_for_accept(
    transport: &mut (dyn RemoteTransport + '_),
    transport_type: TransportType,
    external_shutdown_rx: &mut Option<direct_transport::DirectTransportShutdownSignal>,
    label: &'static str,
) -> Result<Vec<u8>, DirectTransportAcceptFailure> {
    if transport_type != TransportType::UsbMobile {
        let mut no_external_shutdown = None;
        return recv_initial_handshake_message(
            transport,
            transport_type,
            &mut no_external_shutdown,
            label,
        )
        .await
        .map_err(DirectTransportAcceptFailure::protocol_error);
    }

    match external_shutdown_rx.as_mut() {
        Some(shutdown_rx) => {
            tokio::select! {
                result = transport.recv() => result
                    .map_err(|error| DirectTransportAcceptFailure::from_transport_error(label, error)),
                _ = shutdown_rx.as_mut() => Err(DirectTransportAcceptFailure::TransportClosed {
                    message: format!("{label}: shutdown before first USB mobile message"),
                }),
            }
        }
        None => transport
            .recv()
            .await
            .map_err(|error| DirectTransportAcceptFailure::from_transport_error(label, error)),
    }
}

fn bridge_peer_shutdown(
    mut peer_shutdown_rx: tokio::sync::oneshot::Receiver<()>,
    mut external_shutdown_rx: Option<direct_transport::DirectTransportShutdownSignal>,
) -> (
    tokio::sync::oneshot::Receiver<()>,
    tokio::task::JoinHandle<()>,
    Arc<Mutex<Option<HostRpcShutdownSource>>>,
) {
    let (rpc_shutdown_tx, rpc_shutdown_rx) = tokio::sync::oneshot::channel();
    let shutdown_source = Arc::new(Mutex::new(None));
    let task_shutdown_source = shutdown_source.clone();
    let handle = tokio::spawn(async move {
        // The source is recorded before `rpc_shutdown_tx` fires, and the host
        // loop only returns `Ok(())` after it receives that signal, so the cell
        // is always populated by the time the stop reason is computed.
        let source = tokio::select! {
            _ = &mut peer_shutdown_rx => HostRpcShutdownSource::PeerRemoved,
            reason = async {
                match external_shutdown_rx.as_mut() {
                    Some(rx) => rx.as_mut().await,
                    None => future::pending::<DirectTransportStopReason>().await,
                }
            } => HostRpcShutdownSource::ExternalStop(reason),
        };
        *task_shutdown_source
            .lock()
            .expect("host rpc shutdown source lock") = Some(source);
        let _ = rpc_shutdown_tx.send(());
    });
    (rpc_shutdown_rx, handle, shutdown_source)
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

fn emit_usb_session_approval_required(attempt_id: &str) {
    #[cfg(target_os = "android")]
    {
        if let Some(app) = crate::mobile::android::app_handle() {
            let _ = app.emit(
                "mobile_usb_host_session_approval_required",
                serde_json::json!({ "attempt_id": attempt_id }),
            );
        }
        crate::mobile::android::notify_mobile_usb_approval_required("session", attempt_id);
    }

    #[cfg(not(target_os = "android"))]
    let _ = attempt_id;
}

#[cfg(test)]
#[path = "accept_tests.rs"]
mod accept_tests;
