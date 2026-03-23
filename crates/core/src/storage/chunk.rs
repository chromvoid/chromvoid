//! Encrypted chunk operations

use crate::crypto::{decrypt, encrypt};
use crate::error::Result;
use crate::types::KEY_SIZE;

/// Represents an encrypted chunk with its name
#[derive(Debug, Clone)]
pub struct EncryptedChunk {
    /// 64-character hex name
    pub name: String,
    /// Encrypted data (nonce || ciphertext || tag)
    pub data: Vec<u8>,
}

impl EncryptedChunk {
    /// Create a new encrypted chunk from plaintext
    pub fn from_plaintext(name: String, plaintext: &[u8], key: &[u8; KEY_SIZE]) -> Result<Self> {
        let data = encrypt(plaintext, key, name.as_bytes())?;
        Ok(Self { name, data })
    }

    /// Decrypt the chunk data
    pub fn decrypt(&self, key: &[u8; KEY_SIZE]) -> Result<Vec<u8>> {
        decrypt(&self.data, key, self.name.as_bytes())
    }

    /// Get the path components for this chunk
    ///
    /// Returns (first_char, next_two_chars, full_name)
    /// Example: "01a2b3..." -> ("0", "1a", "01a2b3...")
    pub fn path_components(&self) -> Option<(&str, &str, &str)> {
        if self.name.len() < 3 {
            return None;
        }
        Some((&self.name[0..1], &self.name[1..3], &self.name))
    }
}

#[cfg(test)]
#[path = "chunk_tests.rs"]
mod tests;
