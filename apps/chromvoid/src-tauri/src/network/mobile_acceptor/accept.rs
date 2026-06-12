use chromvoid_protocol::{NoiseTransport, RemoteTransport, TransportType, MAX_HANDSHAKE_MSG};
use tracing::{info, warn};

use std::path::PathBuf;
use std::sync::{Arc, Mutex};
use std::time::Duration;

use super::super::paired_peers::PairedPeerStore;
use super::super::signaling::SignalingClient;
#[cfg(desktop)]
use super::{force_wss_acceptor_for_test, WEBRTC_RESPONDER_TIMEOUT};
use super::{
    is_peer_known, now_ms, rpc_loop, set_handshaking_if_current, AcceptorState, ConnectedPeer,
    MobileAcceptorRuntimeState, NetworkConnectionManager, PeerConnection,
};
use crate::core_adapter::CoreAdapter;

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

#[derive(Debug, Default)]
pub(super) struct AcceptAttemptProgress {
    pub(super) saw_msg1: bool,
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

    let (mut transport, transport_type) =
        establish_transport(signaling, relay_url, room_id).await?;

    info!(
        "mobile_acceptor: awaiting noise msg1 relay={} room_id={} transport_type={:?}",
        relay_url, room_id, transport_type
    );
    let msg1 = recv_handshake_message(transport.as_mut(), "noise msg1 recv").await?;
    info!(
        "mobile_acceptor: received noise msg1 relay={} room_id={} len={}",
        relay_url,
        room_id,
        msg1.len()
    );
    progress.saw_msg1 = true;
    if !set_handshaking_if_current(&runtime, generation)? {
        return Err("stale acceptor generation".to_string());
    }

    let store_path = storage_root.join("paired_network_peers.json");
    let store = load_paired_peer_store_blocking(store_path.clone()).await?;
    let outcome = perform_handshake(transport.as_mut(), &msg1, &store).await?;

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
            let _ = _noise;
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

    let transport_type_name = match transport_type {
        TransportType::WebRtcDataChannel => "webrtc",
        TransportType::WssRelay => "wss",
        _ => "unknown",
    };
    info!(
        "Noise handshake completed with peer={} ({})",
        peer_id, transport_type_name
    );

    let mut conn_mgr = NetworkConnectionManager::new();
    conn_mgr.transition(crate::core_adapter::ConnectionState::Syncing);

    let (shutdown_tx, shutdown_rx) = tokio::sync::oneshot::channel::<()>();

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

    if let Err(error) = touch_paired_peer_store_blocking(store_path, peer_id.clone()).await {
        warn!("mobile_acceptor: failed to update paired peer last_seen: {error}");
    }

    let task_storage_root = storage_root.to_path_buf();
    let task_peer_id = peer_id.clone();
    let task_runtime = runtime.clone();
    let peer_handle = tokio::spawn(async move {
        let result = rpc_loop::run_host_rpc_loop(
            adapter,
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
        let _ = task_runtime.remove_peer_if_current(generation, &task_peer_id);
    });
    if !runtime.store_peer_task_if_current(generation, &peer_id, peer_handle)? {
        return Err("stale acceptor generation".to_string());
    }

    Ok(peer_id)
}

async fn load_paired_peer_store_blocking(store_path: PathBuf) -> Result<PairedPeerStore, String> {
    tauri::async_runtime::spawn_blocking(move || PairedPeerStore::load(&store_path))
        .await
        .map_err(|error| format!("mobile acceptor peer store load task failed: {error}"))
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
) -> Result<HandshakeOutcome, String> {
    let mut buf = vec![0u8; MAX_HANDSHAKE_MSG];
    if msg1.len() >= IK_MSG1_MIN_SIZE {
        noise_ik_responder(transport, msg1, &mut buf, store).await
    } else {
        noise_xx_responder(transport, msg1, &mut buf, store).await
    }
}

/// IK responder handshake over a transport (2 messages).
async fn noise_ik_responder(
    transport: &mut (dyn RemoteTransport + '_),
    msg1: &[u8],
    buf: &mut [u8],
    store: &PairedPeerStore,
) -> Result<HandshakeOutcome, String> {
    use chromvoid_protocol::NOISE_PARAMS_IK;
    use snow::params::NoiseParams;

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
            _noise: noise,
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
) -> Result<HandshakeOutcome, String> {
    use chromvoid_protocol::NOISE_PARAMS_XX;
    use snow::params::NoiseParams;

    let params: NoiseParams = NOISE_PARAMS_XX
        .parse()
        .map_err(|e: snow::Error| format!("XX params: {e}"))?;

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
            _noise: noise,
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
    use crate::network::PairedPeer;

    struct PendingTransport;

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
}
