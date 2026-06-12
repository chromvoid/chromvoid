use super::super::state::hex_encode;
use tokio_tungstenite::tungstenite::handshake::server::ErrorResponse;
use tokio_tungstenite::tungstenite::http::{Response as HttpResponse, StatusCode};

pub(in crate::gateway) const NOISE_PATTERN_PAIR: &str = chromvoid_protocol::NOISE_PARAMS_XXPSK0;
pub(in crate::gateway) const NOISE_PATTERN_EXTENSION: &str = chromvoid_protocol::NOISE_PARAMS_XX;
pub(in crate::gateway) const NOISE_PATTERN_IK: &str = chromvoid_protocol::NOISE_PARAMS_IK;

/// IK msg1 contains the encrypted initiator static key, making it ~96+ bytes.
/// XX msg1 is just an ephemeral key (~32 bytes).
pub(super) const IK_MSG1_MIN_SIZE: usize = 96;

#[derive(Debug, Clone, Copy, PartialEq, Eq)]
pub(in crate::gateway) enum GatewayWsRoute {
    Pair,
    Extension,
}

pub(in crate::gateway) fn is_allowed_path(path: &str) -> bool {
    matches!(path, "/ws" | "/pair" | "/extension")
}

pub(in crate::gateway) fn pin_to_psk(pin: &str) -> [u8; 32] {
    use sha2::{Digest, Sha256};
    let mut h = Sha256::new();
    h.update(pin.as_bytes());
    let out = h.finalize();
    let mut psk = [0u8; 32];
    psk.copy_from_slice(&out);
    psk
}

pub(in crate::gateway) fn reject_ws_request(status: StatusCode) -> ErrorResponse {
    let reason = status.canonical_reason().unwrap_or("rejected").to_string();
    HttpResponse::builder()
        .status(status)
        .body(Some(reason))
        .unwrap_or_else(|_| HttpResponse::new(Some("rejected".to_string())))
}

/// Extract the remote static public key as hex from a Noise handshake state.
pub(super) fn extract_remote_static_hex(noise: &snow::HandshakeState) -> Result<String, String> {
    let rs = noise
        .get_remote_static()
        .ok_or_else(|| "no remote static key".to_string())?;
    if rs.len() != 32 {
        return Err(format!("remote static key wrong length: {}", rs.len()));
    }
    Ok(hex_encode(rs))
}

/// Decode a hex string to bytes.
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
