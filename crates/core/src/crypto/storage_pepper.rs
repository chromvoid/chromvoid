//! Portable storage pepper (ADR-010 / ADR-012 / SPEC-100).
//!
//! - Pepper is a 32-byte secret stored in a platform keystore (desktop/mobile) or
//!   in an encrypted file (Orange Pi).
//! - Pepper is exported only as wrapped bytes inside `metadata.enc`.

use thiserror::Error;

use super::chacha::{decrypt, encrypt};
use super::keystore::{Keystore, KeystoreError, STORAGE_PEPPER_LEN};

pub const STORAGE_PEPPER_AAD: &[u8] = b"storage_pepper:v1";

#[derive(Debug, Error)]
pub enum StoragePepperError {
    #[error("random generation failed: {0}")]
    Random(String),
    #[error("pepper wrap failed: {0}")]
    WrapFailed(String),
    #[error(transparent)]
    Keystore(#[from] KeystoreError),
    #[error("invalid wrapped pepper length: {0}")]
    InvalidWrappedLength(usize),
    #[error("pepper unwrap failed")]
    UnwrapFailed,
}

pub struct StoragePepper;

impl StoragePepper {
    pub fn generate() -> Result<[u8; STORAGE_PEPPER_LEN], StoragePepperError> {
        let mut pepper = [0u8; STORAGE_PEPPER_LEN];
        getrandom::getrandom(&mut pepper).map_err(|e| StoragePepperError::Random(e.to_string()))?;
        Ok(pepper)
    }

    pub fn load(
        keystore: &dyn Keystore,
    ) -> Result<Option<[u8; STORAGE_PEPPER_LEN]>, StoragePepperError> {
        Ok(keystore.load_storage_pepper()?)
    }

    pub fn store(
        keystore: &dyn Keystore,
        pepper: [u8; STORAGE_PEPPER_LEN],
    ) -> Result<(), StoragePepperError> {
        Ok(keystore.store_storage_pepper(pepper)?)
    }

    pub fn delete(keystore: &dyn Keystore) -> Result<(), StoragePepperError> {
        Ok(keystore.delete_storage_pepper()?)
    }

    pub fn get_or_create(
        keystore: &dyn Keystore,
    ) -> Result<[u8; STORAGE_PEPPER_LEN], StoragePepperError> {
        if let Some(existing) = Self::load(keystore)? {
            return Ok(existing);
        }

        let pepper = Self::generate()?;
        Self::store(keystore, pepper)?;
        Ok(pepper)
    }

    pub fn wrap_for_backup(
        pepper: [u8; STORAGE_PEPPER_LEN],
        backup_key: &[u8; 32],
    ) -> Result<Vec<u8>, StoragePepperError> {
        encrypt(&pepper, backup_key, STORAGE_PEPPER_AAD)
            .map_err(|e| StoragePepperError::WrapFailed(e.to_string()))
    }

    pub fn unwrap_from_backup(
        wrapped: &[u8],
        backup_key: &[u8; 32],
    ) -> Result<[u8; STORAGE_PEPPER_LEN], StoragePepperError> {
        // ChaCha20-Poly1305: nonce(12) + ciphertext(32) + tag(16)
        if wrapped.len() != 12 + STORAGE_PEPPER_LEN + 16 {
            return Err(StoragePepperError::InvalidWrappedLength(wrapped.len()));
        }

        let plain = decrypt(wrapped, backup_key, STORAGE_PEPPER_AAD)
            .map_err(|_| StoragePepperError::UnwrapFailed)?;
        let out: [u8; STORAGE_PEPPER_LEN] = plain
            .as_slice()
            .try_into()
            .map_err(|_| StoragePepperError::UnwrapFailed)?;
        Ok(out)
    }
}

#[cfg(test)]
#[path = "storage_pepper_tests.rs"]
mod tests;
