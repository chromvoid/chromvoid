//! Noise Protocol transport layer for ChromVoid.
//!
//! ADR-006: XX pattern for initial pairing (both sides anonymous),
//! IK pattern for known peers (initiator knows responder pubkey).
//! ADR-018: XXpsk0 pattern for first-time pairing using a PSK (e.g. PIN).

use snow::TransportState;

/// Noise protocol pattern: XX for initial pairing (both sides anonymous).
/// ADR-006: Noise_XX_25519_ChaChaPoly_BLAKE2s
pub const NOISE_PARAMS_XX: &str = "Noise_XX_25519_ChaChaPoly_BLAKE2s";

/// Noise protocol pattern: XXpsk0 for first-time pairing using a PSK.
/// ADR-018: Extension pairing uses XXpsk0 with PIN as PSK.
pub const NOISE_PARAMS_XXPSK0: &str = "Noise_XXpsk0_25519_ChaChaPoly_BLAKE2s";

/// Noise protocol pattern: IK for known peers (initiator knows responder pubkey).
/// ADR-006: Noise_IK — anti-downgrade: IK mandatory for paired clients.
pub const NOISE_PARAMS_IK: &str = "Noise_IK_25519_ChaChaPoly_BLAKE2s";

/// Maximum Noise handshake message size.
pub const MAX_HANDSHAKE_MSG: usize = 65535;

/// Errors that may occur during Noise handshake or encrypted transport.
#[derive(Debug)]
pub enum NoiseError {
    Handshake(String),
    Encrypt(String),
    Decrypt(String),
    InvalidState(String),
}

impl std::fmt::Display for NoiseError {
    fn fmt(&self, f: &mut std::fmt::Formatter<'_>) -> std::fmt::Result {
        match self {
            Self::Handshake(e) => write!(f, "handshake error: {}", e),
            Self::Encrypt(e) => write!(f, "encrypt error: {}", e),
            Self::Decrypt(e) => write!(f, "decrypt error: {}", e),
            Self::InvalidState(e) => write!(f, "invalid state: {}", e),
        }
    }
}

impl std::error::Error for NoiseError {}

/// Holds the Noise transport state after a successful handshake.
/// Provides encrypt/decrypt methods over the established session.
pub struct NoiseTransport {
    transport: TransportState,
    remote_pubkey: Vec<u8>,
}

impl NoiseTransport {
    pub fn new(transport: TransportState, remote_pubkey: Vec<u8>) -> Self {
        Self {
            transport,
            remote_pubkey,
        }
    }

    /// Returns the remote peer's static public key.
    pub fn remote_pubkey(&self) -> &[u8] {
        &self.remote_pubkey
    }

    /// Encrypt a plaintext payload. Returns ciphertext with Poly1305 auth tag.
    pub fn encrypt(&mut self, plaintext: &[u8]) -> Result<Vec<u8>, NoiseError> {
        let mut buf = vec![0u8; plaintext.len() + 64]; // overhead for Poly1305 tag
        let len = self
            .transport
            .write_message(plaintext, &mut buf)
            .map_err(|e| NoiseError::Encrypt(e.to_string()))?;
        buf.truncate(len);
        Ok(buf)
    }

    /// Decrypt a ciphertext payload. Returns the original plaintext.
    pub fn decrypt(&mut self, ciphertext: &[u8]) -> Result<Vec<u8>, NoiseError> {
        let mut buf = vec![0u8; ciphertext.len()];
        let len = self
            .transport
            .read_message(ciphertext, &mut buf)
            .map_err(|e| NoiseError::Decrypt(e.to_string()))?;
        buf.truncate(len);
        Ok(buf)
    }
}

#[cfg(test)]
#[path = "noise_tests.rs"]
mod tests;
