//! SPEC-100 portable KDF entrypoint.
//!
//! NOTE: The legacy v1 KDF lives in `argon2.rs` as `derive_vault_key`.
//! The v2 KDF here is used by the vault session when portable pepper is enabled.

use zeroize::Zeroizing;

use crate::error::Result;

pub const STRETCHED_SALT_LEN: usize = 32;

/// Derive a 32-byte stretched salt from a 16-byte vault_salt and 32-byte storage_pepper.
///
/// SPEC-100 (ADR-010):
/// `stretched_salt = BLAKE3(vault_salt || storage_pepper || "vault-salt-v2")[..32]`
pub fn derive_stretched_salt(
    vault_salt: &[u8; 16],
    storage_pepper: &[u8; 32],
) -> [u8; STRETCHED_SALT_LEN] {
    let mut hasher = blake3::Hasher::new();
    hasher.update(vault_salt);
    hasher.update(storage_pepper);
    hasher.update(b"vault-salt-v2");
    let out = hasher.finalize();
    out.as_bytes()[..STRETCHED_SALT_LEN]
        .try_into()
        .expect("slice must be 32 bytes")
}

/// Derive a vault key using v2 portable pepper plumbing.
///
/// The v2 KDF is defined by SPEC-100.
///
/// `storage_pepper` is obtained from the platform keystore (or restored from backup)
/// by the caller (see `crate::vault::session`).
pub fn derive_vault_key_v2(
    password: &str,
    vault_salt: &[u8; 16],
    storage_pepper: &[u8; 32],
) -> Result<Zeroizing<[u8; crate::types::KEY_SIZE]>> {
    let stretched_salt = derive_stretched_salt(vault_salt, storage_pepper);

    crate::crypto::argon2::derive_vault_key_with_salt(password, &stretched_salt)
}

#[cfg(test)]
#[path = "derive_vault_key_tests.rs"]
mod tests;
