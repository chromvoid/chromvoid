//! Argon2id key derivation

use argon2::{Algorithm, Argon2, Params, Version};
use zeroize::Zeroizing;

use crate::error::{Error, Result};
use crate::types::{argon2_params, KEY_SIZE};

const TEST_FAST_KDF_ENV: &str = "CHROMVOID_TEST_FAST_KDF";

const FAST_KDF_MEMORY_COST: u32 = 8 * 1024;
const FAST_KDF_TIME_COST: u32 = 1;
const FAST_KDF_PARALLELISM: u32 = 1;

fn use_fast_kdf() -> bool {
    // Unit tests compile the crate with cfg(test), but integration tests do not.
    // For integration tests, we allow opting into fast params via env var, but
    // only in debug builds to avoid weakening production builds.
    if cfg!(test) {
        return true;
    }
    if !cfg!(debug_assertions) {
        return false;
    }

    match std::env::var(TEST_FAST_KDF_ENV) {
        Ok(v) => {
            let v = v.trim().to_ascii_lowercase();
            matches!(v.as_str(), "1" | "true" | "yes" | "fast")
        }
        Err(_) => false,
    }
}

pub(crate) fn derive_vault_key_with_salt(
    password: &str,
    salt: &[u8],
) -> Result<Zeroizing<[u8; KEY_SIZE]>> {
    let (memory_cost, time_cost, parallelism) = if use_fast_kdf() {
        (
            FAST_KDF_MEMORY_COST,
            FAST_KDF_TIME_COST,
            FAST_KDF_PARALLELISM,
        )
    } else {
        (
            argon2_params::MEMORY_COST,
            argon2_params::TIME_COST,
            argon2_params::PARALLELISM,
        )
    };

    let params = Params::new(memory_cost, time_cost, parallelism, Some(KEY_SIZE))
        .map_err(|e| Error::KeyDerivationFailed(e.to_string()))?;

    let argon2 = Argon2::new(Algorithm::Argon2id, Version::V0x13, params);

    let mut key = Zeroizing::new([0u8; KEY_SIZE]);
    argon2
        .hash_password_into(password.as_bytes(), salt, key.as_mut())
        .map_err(|e| Error::KeyDerivationFailed(e.to_string()))?;

    Ok(key)
}

/// Derive a vault key from password and salt using Argon2id
///
/// # Parameters
/// - `password`: User password (will be zeroized after use)
/// - `salt`: 16-byte salt (unique per vault)
///
/// # Returns
/// 32-byte derived key
pub fn derive_vault_key(password: &str, salt: &[u8; 16]) -> Result<Zeroizing<[u8; KEY_SIZE]>> {
    derive_vault_key_with_salt(password, salt)
}

#[cfg(test)]
#[path = "argon2_tests.rs"]
mod tests;
