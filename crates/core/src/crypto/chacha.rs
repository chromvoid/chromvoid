//! ChaCha20-Poly1305 encryption/decryption

use chacha20poly1305::{
    aead::{Aead, KeyInit, Payload},
    ChaCha20Poly1305, Nonce,
};
use getrandom::getrandom;

use crate::error::{Error, Result};
use crate::types::{KEY_SIZE, NONCE_SIZE, TAG_SIZE};

/// Encrypt data using ChaCha20-Poly1305
///
/// # Format
/// Returns: nonce (12 bytes) || ciphertext || tag (16 bytes)
///
/// # Parameters
/// - `plaintext`: Data to encrypt
/// - `key`: 32-byte encryption key
/// - `aad`: Additional Authenticated Data (must include chunk identity)
///
/// # Returns
/// Encrypted data (28 + plaintext.len() bytes)
pub fn encrypt(plaintext: &[u8], key: &[u8; KEY_SIZE], aad: &[u8]) -> Result<Vec<u8>> {
    // Generate random nonce
    let mut nonce_bytes = [0u8; NONCE_SIZE];
    getrandom(&mut nonce_bytes).map_err(|e| Error::EncryptionFailed(e.to_string()))?;

    let cipher = ChaCha20Poly1305::new(key.into());
    let nonce = Nonce::from_slice(&nonce_bytes);

    let ciphertext = cipher
        .encrypt(
            nonce,
            Payload {
                msg: plaintext,
                aad,
            },
        )
        .map_err(|e| Error::EncryptionFailed(e.to_string()))?;

    // Combine: nonce || ciphertext (includes tag)
    let mut result = Vec::with_capacity(NONCE_SIZE + ciphertext.len());
    result.extend_from_slice(&nonce_bytes);
    result.extend_from_slice(&ciphertext);

    Ok(result)
}

/// Decrypt data using ChaCha20-Poly1305
///
/// # Format
/// Expects: nonce (12 bytes) || ciphertext || tag (16 bytes)
///
/// # Parameters
/// - `encrypted`: Data to decrypt (must be at least 28 bytes)
/// - `key`: 32-byte encryption key
/// - `aad`: Additional Authenticated Data (must match the encrypt-side AAD)
///
/// # Returns
/// Decrypted plaintext
pub fn decrypt(encrypted: &[u8], key: &[u8; KEY_SIZE], aad: &[u8]) -> Result<Vec<u8>> {
    // Minimum size: nonce (12) + tag (16) = 28 bytes
    if encrypted.len() < NONCE_SIZE + TAG_SIZE {
        return Err(Error::InvalidDataFormat(format!(
            "encrypted data too short: {} bytes (minimum {})",
            encrypted.len(),
            NONCE_SIZE + TAG_SIZE
        )));
    }

    let nonce = Nonce::from_slice(&encrypted[..NONCE_SIZE]);
    let ciphertext = &encrypted[NONCE_SIZE..];

    let cipher = ChaCha20Poly1305::new(key.into());

    cipher
        .decrypt(
            nonce,
            Payload {
                msg: ciphertext,
                aad,
            },
        )
        .map_err(|_| Error::DecryptionFailed("authentication failed".to_string()))
}

#[cfg(test)]
#[path = "chacha_tests.rs"]
mod tests;
