use std::time::Duration;

use chromvoid_protocol::{NoiseTransport, RemoteTransport};
use hmac::{Hmac, Mac};
use serde::{Deserialize, Serialize};
use sha2::{Digest as _, Sha256};

type HmacSha256 = Hmac<Sha256>;

const PAIRING_HELLO_TIMEOUT: Duration = Duration::from_secs(5);
const PAIRING_APPROVAL_TIMEOUT: Duration = Duration::from_secs(300);
pub(crate) const USB_PAIRING_CANCEL_V1: &str = "usb_pairing_cancel_v1";

#[derive(Debug, Clone, PartialEq, Eq, Serialize, Deserialize)]
pub(crate) struct MobileUsbPairingHello {
    pub peer_id: String,
    pub peer_label: String,
    pub peer_pubkey_hex: String,
    pub platform: String,
    #[serde(default, skip_serializing_if = "Vec::is_empty")]
    pub capabilities: Vec<String>,
}

#[derive(Debug, Clone, PartialEq, Eq, Serialize, Deserialize)]
pub(crate) struct MobileUsbPairingApprovalChallenge {
    pub attempt_id: String,
    pub salt_hex: String,
    pub host_pubkey_hex: String,
    pub peer_fingerprint: String,
    pub attempts_left: u8,
    pub expires_at_ms: u64,
}

#[derive(Debug, Clone, PartialEq, Eq, Serialize, Deserialize)]
pub(crate) struct MobileUsbPairingApprovalProof {
    pub attempt_id: String,
    pub proof_hex: String,
    #[serde(
        default,
        skip_serializing_if = "MobileUsbPairingApprovalAction::is_confirm"
    )]
    pub action: MobileUsbPairingApprovalAction,
}

#[derive(Debug, Clone, Copy, Default, PartialEq, Eq, Serialize, Deserialize)]
#[serde(rename_all = "snake_case")]
pub(crate) enum MobileUsbPairingApprovalAction {
    #[default]
    Confirm,
    Cancel,
}

impl MobileUsbPairingApprovalAction {
    fn is_confirm(&self) -> bool {
        *self == Self::Confirm
    }
}

#[derive(Debug, Clone, PartialEq, Eq, Serialize, Deserialize)]
pub(crate) struct MobileUsbPairingApprovalAck {
    pub attempt_id: String,
    pub accepted: bool,
    pub error: Option<String>,
    pub attempts_left: u8,
}

pub(crate) async fn send_pairing_hello(
    transport: &mut dyn RemoteTransport,
    noise: &mut NoiseTransport,
    hello: &MobileUsbPairingHello,
) -> Result<(), String> {
    send_encrypted(transport, noise, hello, "hello").await
}

pub(crate) async fn recv_pairing_hello(
    transport: &mut dyn RemoteTransport,
    noise: &mut NoiseTransport,
) -> Result<MobileUsbPairingHello, String> {
    let encrypted = tokio::time::timeout(PAIRING_HELLO_TIMEOUT, transport.recv())
        .await
        .map_err(|_| {
            format!(
                "recv hello: timeout after {}s",
                PAIRING_HELLO_TIMEOUT.as_secs()
            )
        })?
        .map_err(|error| format!("recv hello: {error}"))?;
    let decrypted = noise
        .decrypt(&encrypted)
        .map_err(|error| format!("decrypt hello: {error}"))?;
    serde_json::from_slice(&decrypted).map_err(|error| format!("decode hello: {error}"))
}

pub(crate) async fn send_pairing_approval_challenge(
    transport: &mut dyn RemoteTransport,
    noise: &mut NoiseTransport,
    challenge: &MobileUsbPairingApprovalChallenge,
) -> Result<(), String> {
    send_encrypted(transport, noise, challenge, "approval challenge").await
}

pub(crate) async fn recv_pairing_approval_challenge(
    transport: &mut dyn RemoteTransport,
    noise: &mut NoiseTransport,
) -> Result<MobileUsbPairingApprovalChallenge, String> {
    recv_encrypted(
        transport,
        noise,
        PAIRING_HELLO_TIMEOUT,
        "approval challenge",
    )
    .await
}

pub(crate) async fn send_pairing_approval_proof(
    transport: &mut dyn RemoteTransport,
    noise: &mut NoiseTransport,
    proof: &MobileUsbPairingApprovalProof,
) -> Result<(), String> {
    send_encrypted(transport, noise, proof, "approval proof").await
}

pub(crate) async fn recv_pairing_approval_proof(
    transport: &mut dyn RemoteTransport,
    noise: &mut NoiseTransport,
) -> Result<MobileUsbPairingApprovalProof, String> {
    recv_encrypted(transport, noise, PAIRING_APPROVAL_TIMEOUT, "approval proof").await
}

pub(crate) async fn send_pairing_approval_ack(
    transport: &mut dyn RemoteTransport,
    noise: &mut NoiseTransport,
    ack: &MobileUsbPairingApprovalAck,
) -> Result<(), String> {
    send_encrypted(transport, noise, ack, "approval ack").await
}

pub(crate) async fn recv_pairing_approval_ack(
    transport: &mut dyn RemoteTransport,
    noise: &mut NoiseTransport,
) -> Result<MobileUsbPairingApprovalAck, String> {
    recv_encrypted(transport, noise, PAIRING_HELLO_TIMEOUT, "approval ack").await
}

async fn send_encrypted<T: Serialize>(
    transport: &mut dyn RemoteTransport,
    noise: &mut NoiseTransport,
    value: &T,
    label: &'static str,
) -> Result<(), String> {
    let payload =
        serde_json::to_vec(value).map_err(|error| format!("serialize {label}: {error}"))?;
    let encrypted = noise
        .encrypt(&payload)
        .map_err(|error| format!("encrypt {label}: {error}"))?;
    transport
        .send(&encrypted)
        .await
        .map_err(|error| format!("send {label}: {error}"))
}

async fn recv_encrypted<T: for<'de> Deserialize<'de>>(
    transport: &mut dyn RemoteTransport,
    noise: &mut NoiseTransport,
    timeout_duration: Duration,
    label: &'static str,
) -> Result<T, String> {
    let encrypted = tokio::time::timeout(timeout_duration, transport.recv())
        .await
        .map_err(|_| {
            format!(
                "recv {label}: timeout after {}s",
                timeout_duration.as_secs()
            )
        })?
        .map_err(|error| format!("recv {label}: {error}"))?;
    let decrypted = noise
        .decrypt(&encrypted)
        .map_err(|error| format!("decrypt {label}: {error}"))?;
    serde_json::from_slice(&decrypted).map_err(|error| format!("decode {label}: {error}"))
}

pub(crate) fn hex_encode(bytes: &[u8]) -> String {
    bytes.iter().map(|byte| format!("{byte:02x}")).collect()
}

pub(crate) fn pairing_fingerprint(pubkey: &[u8]) -> String {
    let digest = Sha256::digest(pubkey);
    hex_encode(&digest[..8])
}

pub(crate) fn pairing_approval_proof_hex(
    pin: &str,
    attempt_id: &str,
    salt_hex: &str,
    desktop_pubkey_hex: &str,
    host_pubkey_hex: &str,
) -> Result<String, String> {
    let psk = crate::network::pairing::pin_to_psk(pin);
    let mut mac = HmacSha256::new_from_slice(&psk)
        .map_err(|error| format!("approval proof hmac key: {error}"))?;
    mac.update(b"chromvoid mobile usb pairing approval");
    mac.update(attempt_id.as_bytes());
    mac.update(salt_hex.as_bytes());
    mac.update(desktop_pubkey_hex.as_bytes());
    mac.update(host_pubkey_hex.as_bytes());
    Ok(hex_encode(&mac.finalize().into_bytes()))
}

pub(crate) fn verify_pairing_approval_proof(
    pin: &str,
    attempt_id: &str,
    salt_hex: &str,
    desktop_pubkey_hex: &str,
    host_pubkey_hex: &str,
    proof_hex: &str,
) -> Result<bool, String> {
    let psk = crate::network::pairing::pin_to_psk(pin);
    let mut mac = HmacSha256::new_from_slice(&psk)
        .map_err(|error| format!("approval proof hmac key: {error}"))?;
    mac.update(b"chromvoid mobile usb pairing approval");
    mac.update(attempt_id.as_bytes());
    mac.update(salt_hex.as_bytes());
    mac.update(desktop_pubkey_hex.as_bytes());
    mac.update(host_pubkey_hex.as_bytes());
    let proof =
        hex::decode(proof_hex).map_err(|error| format!("decode approval proof: {error}"))?;
    Ok(mac.verify_slice(&proof).is_ok())
}

#[cfg(test)]
mod compatibility_tests {
    use super::*;

    #[test]
    fn legacy_pairing_hello_defaults_capabilities_to_empty() {
        let hello: MobileUsbPairingHello = serde_json::from_value(serde_json::json!({
            "peer_id": "legacy-peer",
            "peer_label": "Legacy peer",
            "peer_pubkey_hex": "00",
            "platform": "android"
        }))
        .expect("legacy hello");

        assert!(hello.capabilities.is_empty());
    }

    #[test]
    fn legacy_pairing_proof_defaults_to_confirm_and_confirm_stays_wire_compatible() {
        let proof: MobileUsbPairingApprovalProof = serde_json::from_value(serde_json::json!({
            "attempt_id": "attempt-1",
            "proof_hex": "abcd"
        }))
        .expect("legacy proof");
        assert_eq!(proof.action, MobileUsbPairingApprovalAction::Confirm);

        let encoded = serde_json::to_value(proof).expect("encode confirm proof");
        assert!(encoded.get("action").is_none());
    }
}
