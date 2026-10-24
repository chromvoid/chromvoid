//! Shared PIN pairing wire operations for desktop, iOS and Android hosts.
//! Successful Noise/hello exchange is not trust admission: callers validate the hello
//! against the remote static key and own offer expiry, confirmation and persistence.

use crate::acceptor::handshake::recv_handshake_message_with_timeout_for as recv_with_timeout_for;
use chromvoid_protocol::{NoiseTransport, RemoteTransport};
use serde::{Deserialize, Serialize};
use sha2::{Digest, Sha256};
use std::time::Duration;

const PAIRING_HANDSHAKE_TIMEOUT: Duration = Duration::from_secs(15);

#[derive(Debug, Clone, Serialize, Deserialize)]
pub struct PairingHello {
    pub peer_id: String,
    pub peer_label: String,
    pub peer_pubkey_hex: String,
    pub platform: String,
}

/// Existing wire derivation: SHA-256 of the exact PIN bytes, with no normalization.
pub fn pin_to_psk(pin: &str) -> [u8; 32] {
    Sha256::digest(pin.as_bytes()).into()
}

pub async fn send_pairing_hello(
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
    label: &'static str,
) -> Result<Vec<u8>, String> {
    recv_with_timeout_for(transport, label, PAIRING_HANDSHAKE_TIMEOUT).await
}

pub async fn recv_pairing_hello(
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

pub async fn xxpsk0_initiator(
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

pub async fn xxpsk0_responder(
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
#[path = "pairing_transport_tests.rs"]
mod tests;
