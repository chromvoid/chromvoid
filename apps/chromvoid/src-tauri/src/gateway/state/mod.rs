mod config;
mod gateway_state;

use std::time::{SystemTime, UNIX_EPOCH};

pub use config::{GatewayConfig, PairingSession};
pub use gateway_state::GatewayState;

// Re-export helper functions used by other gateway files.
pub use super::types::{AccessDuration, CapabilityPolicy, GrantStore, PairedExtension};

pub fn now_ms() -> u64 {
    SystemTime::now()
        .duration_since(UNIX_EPOCH)
        .map(|d| d.as_millis() as u64)
        .unwrap_or(0)
}

pub fn hex_encode(data: &[u8]) -> String {
    const HEX_CHARS: &[u8; 16] = b"0123456789abcdef";
    let mut result = String::with_capacity(data.len() * 2);
    for byte in data {
        result.push(HEX_CHARS[(byte >> 4) as usize] as char);
        result.push(HEX_CHARS[(byte & 0x0F) as usize] as char);
    }
    result
}

#[cfg(test)]
mod tests;
