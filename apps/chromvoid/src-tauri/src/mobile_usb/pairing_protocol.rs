use std::time::Duration;

use chromvoid_protocol::{NoiseTransport, RemoteTransport};
use serde::{Deserialize, Serialize};

const PAIRING_HELLO_TIMEOUT: Duration = Duration::from_secs(5);

#[derive(Debug, Clone, PartialEq, Eq, Serialize, Deserialize)]
pub(crate) struct MobileUsbPairingHello {
    pub peer_id: String,
    pub peer_label: String,
    pub peer_pubkey_hex: String,
    pub platform: String,
}

pub(crate) async fn send_pairing_hello(
    transport: &mut dyn RemoteTransport,
    noise: &mut NoiseTransport,
    hello: &MobileUsbPairingHello,
) -> Result<(), String> {
    let payload = serde_json::to_vec(hello).map_err(|error| format!("serialize hello: {error}"))?;
    let encrypted = noise
        .encrypt(&payload)
        .map_err(|error| format!("encrypt hello: {error}"))?;
    transport
        .send(&encrypted)
        .await
        .map_err(|error| format!("send hello: {error}"))
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

pub(crate) fn hex_encode(bytes: &[u8]) -> String {
    bytes.iter().map(|byte| format!("{byte:02x}")).collect()
}
