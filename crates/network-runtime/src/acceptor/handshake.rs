//! Existing IK/XX host handshake and transport wait policy, shared across clients.
//! An UnknownPeer outcome never grants Core access; the caller owns pairing approval.

use std::time::Duration;

use chromvoid_protocol::{NoiseTransport, RemoteTransport, TransportType, MAX_HANDSHAKE_MSG};

use crate::paired_peers::PairedPeerStore;

/// IK msg1 minimum size (96+ bytes: encrypted static key + ephemeral).
/// XX msg1 is ~32 bytes (just ephemeral key).
const IK_MSG1_MIN_SIZE: usize = 96;
pub const NOISE_HANDSHAKE_MESSAGE_TIMEOUT: Duration = Duration::from_secs(5);

/// Outcome of a Noise handshake — either a known paired peer or an unknown peer
/// whose remote public key needs to be routed through the pairing flow.
pub enum HandshakeOutcome {
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

async fn recv_handshake_message(
    transport: &mut (dyn RemoteTransport + '_),
    label: &'static str,
) -> Result<Vec<u8>, String> {
    recv_handshake_message_with_timeout_for(transport, label, NOISE_HANDSHAKE_MESSAGE_TIMEOUT).await
}

pub async fn recv_initial_handshake_message(
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

pub async fn recv_handshake_message_with_timeout_for(
    transport: &mut (dyn RemoteTransport + '_),
    label: &'static str,
    timeout_duration: Duration,
) -> Result<Vec<u8>, String> {
    tokio::time::timeout(timeout_duration, transport.recv())
        .await
        .map_err(|_| format!("{label}: timeout after {}s", timeout_duration.as_secs()))?
        .map_err(|e| format!("{label}: {e}"))
}

pub async fn perform_handshake(
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

    match store.find_by_public_key(&remote_pubkey).cloned() {
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

    match store.find_by_public_key(&remote_pubkey).cloned() {
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
