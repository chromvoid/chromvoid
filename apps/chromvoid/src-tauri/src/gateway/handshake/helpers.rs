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
    if s.len() % 2 != 0 {
        return Err("hex string has odd length".to_string());
    }
    let mut out = Vec::with_capacity(s.len() / 2);
    let mut i = 0;
    while i < s.len() {
        let byte =
            u8::from_str_radix(&s[i..i + 2], 16).map_err(|e| format!("invalid hex at {i}: {e}"))?;
        out.push(byte);
        i += 2;
    }
    Ok(out)
}
