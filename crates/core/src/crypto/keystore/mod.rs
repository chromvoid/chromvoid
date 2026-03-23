//! Keystore abstraction for device-local secrets.
//!
//! ADR v2 requires a portable `storage_pepper` that MUST NOT be stored alongside
//! `chunks/` in plaintext. For desktop/mobile it lives in a platform keystore.
//!
//! The Rust Core is transport/UI agnostic, so it exposes an injectable keystore
//! interface. Production apps provide platform implementations; tests can use
//! `InMemoryKeystore`.

use std::sync::Mutex;

use thiserror::Error;
use zeroize::Zeroizing;

pub const STORAGE_PEPPER_LEN: usize = 32;

// Platform keystore implementations.
//
// These are intentionally kept behind `cfg(target_os=...)` so core stays portable.
// Embedding apps can construct the appropriate type for their target and inject it
// into `RpcRouter::with_keystore`.
#[cfg(target_os = "macos")]
mod macos;
#[cfg(target_os = "macos")]
pub use macos::MacOsKeystore;

#[cfg(target_os = "windows")]
mod windows;
#[cfg(target_os = "windows")]
pub use windows::WindowsKeystore;

#[cfg(all(target_os = "linux", not(target_env = "musl")))]
mod linux;
#[cfg(all(target_os = "linux", not(target_env = "musl")))]
pub use linux::LinuxKeystore;

#[cfg(target_os = "ios")]
mod ios;
#[cfg(target_os = "ios")]
pub use ios::IosKeystore;

#[cfg(any(target_os = "android", test))]
mod android;
#[cfg(target_os = "android")]
pub use android::AndroidKeystore;

#[derive(Debug, Error)]
pub enum KeystoreError {
    #[error("keystore unavailable")]
    Unavailable,
    #[error("keystore key permanently invalidated")]
    KeyInvalidated,
    #[error("keystore permission denied")]
    PermissionDenied,
    #[error("keystore contains invalid data")]
    Corrupted,
    #[error("keystore operation failed: {0}")]
    Other(String),
}

pub trait Keystore: Send + Sync {
    fn load_storage_pepper(&self) -> Result<Option<[u8; STORAGE_PEPPER_LEN]>, KeystoreError>;
    fn store_storage_pepper(&self, pepper: [u8; STORAGE_PEPPER_LEN]) -> Result<(), KeystoreError>;
    fn delete_storage_pepper(&self) -> Result<(), KeystoreError>;
}

// ---- keyring-backed implementation (desktop + iOS) ----

#[cfg(any(
    target_os = "macos",
    target_os = "windows",
    target_os = "ios",
    all(target_os = "linux", not(target_env = "musl"))
))]
#[derive(Debug)]
pub struct KeyringKeystore {
    entry: keyring::Entry,
    op_lock: Mutex<()>,
}

#[cfg(any(
    target_os = "macos",
    target_os = "windows",
    target_os = "ios",
    all(target_os = "linux", not(target_env = "musl"))
))]
impl KeyringKeystore {
    /// Default service name used for ChromVoid secrets in the OS keyring.
    pub const DEFAULT_SERVICE: &'static str = "chromvoid";

    /// Create a keyring-backed keystore entry identified by (service, user).
    pub fn new(service: impl AsRef<str>, user: impl AsRef<str>) -> Result<Self, KeystoreError> {
        let entry = keyring::Entry::new(service.as_ref(), user.as_ref())
            .map_err(|e| KeystoreError::Other(e.to_string()))?;
        Ok(Self {
            entry,
            op_lock: Mutex::new(()),
        })
    }

    /// Construct a keystore scoped to a storage root path.
    ///
    /// Note: the path is hashed to avoid leaking it into keystore metadata.
    pub fn for_storage_path(
        storage_root: impl AsRef<std::path::Path>,
    ) -> Result<Self, KeystoreError> {
        let user = storage_scoped_user(storage_root.as_ref());
        Self::new(Self::DEFAULT_SERVICE, &user)
    }

    fn lock(&self) -> Result<std::sync::MutexGuard<'_, ()>, KeystoreError> {
        self.op_lock
            .lock()
            .map_err(|_| KeystoreError::Other("mutex poisoned".to_string()))
    }
}

#[cfg(any(
    target_os = "macos",
    target_os = "windows",
    target_os = "ios",
    all(target_os = "linux", not(target_env = "musl"))
))]
impl Keystore for KeyringKeystore {
    fn load_storage_pepper(&self) -> Result<Option<[u8; STORAGE_PEPPER_LEN]>, KeystoreError> {
        let _guard = self.lock()?;

        let bytes = match self.entry.get_secret() {
            Ok(b) => b,
            Err(keyring::Error::NoEntry) => return Ok(None),
            Err(keyring::Error::NoStorageAccess(_)) => return Err(KeystoreError::Unavailable),
            Err(keyring::Error::PlatformFailure(_)) => return Err(KeystoreError::Unavailable),
            Err(e) => return Err(KeystoreError::Other(e.to_string())),
        };

        if bytes.len() != STORAGE_PEPPER_LEN {
            return Err(KeystoreError::Corrupted);
        }
        let mut pepper = [0u8; STORAGE_PEPPER_LEN];
        pepper.copy_from_slice(&bytes);
        Ok(Some(pepper))
    }

    fn store_storage_pepper(&self, pepper: [u8; STORAGE_PEPPER_LEN]) -> Result<(), KeystoreError> {
        let _guard = self.lock()?;
        match self.entry.set_secret(&pepper) {
            Ok(()) => Ok(()),
            Err(keyring::Error::NoStorageAccess(_)) => Err(KeystoreError::Unavailable),
            Err(keyring::Error::PlatformFailure(_)) => Err(KeystoreError::Unavailable),
            Err(e) => Err(KeystoreError::Other(e.to_string())),
        }
    }

    fn delete_storage_pepper(&self) -> Result<(), KeystoreError> {
        let _guard = self.lock()?;
        match self.entry.delete_credential() {
            Ok(()) => Ok(()),
            Err(keyring::Error::NoEntry) => Ok(()),
            Err(keyring::Error::NoStorageAccess(_)) => Err(KeystoreError::Unavailable),
            Err(keyring::Error::PlatformFailure(_)) => Err(KeystoreError::Unavailable),
            Err(e) => Err(KeystoreError::Other(e.to_string())),
        }
    }
}

#[cfg(any(
    target_os = "macos",
    target_os = "windows",
    target_os = "ios",
    all(target_os = "linux", not(target_env = "musl"))
))]
fn storage_scoped_user(storage_root: &std::path::Path) -> String {
    // Best-effort canonicalization for stability.
    let path = std::fs::canonicalize(storage_root).unwrap_or_else(|_| storage_root.to_path_buf());
    let path_s = path.to_string_lossy();

    let mut hasher = blake3::Hasher::new();
    hasher.update(b"chromvoid:keystore:storage-pepper:v1:");
    hasher.update(path_s.as_bytes());
    let digest = hasher.finalize();

    format!("storage_pepper:{}", hex_encode(&digest.as_bytes()[..16]))
}

#[cfg(any(
    target_os = "macos",
    target_os = "windows",
    target_os = "ios",
    all(target_os = "linux", not(target_env = "musl"))
))]
fn hex_encode(data: &[u8]) -> String {
    const HEX_CHARS: &[u8; 16] = b"0123456789abcdef";
    let mut result = String::with_capacity(data.len() * 2);
    for byte in data {
        result.push(HEX_CHARS[(byte >> 4) as usize] as char);
        result.push(HEX_CHARS[(byte & 0x0F) as usize] as char);
    }
    result
}

#[derive(Debug, Default)]
pub struct InMemoryKeystore {
    pepper: Mutex<Option<Zeroizing<[u8; STORAGE_PEPPER_LEN]>>>,
}

impl InMemoryKeystore {
    pub fn new() -> Self {
        Self::default()
    }
}

impl Keystore for InMemoryKeystore {
    fn load_storage_pepper(&self) -> Result<Option<[u8; STORAGE_PEPPER_LEN]>, KeystoreError> {
        Ok(self
            .pepper
            .lock()
            .map_err(|_| KeystoreError::Other("mutex poisoned".to_string()))?
            .as_ref()
            .map(|z| **z))
    }

    fn store_storage_pepper(&self, pepper: [u8; STORAGE_PEPPER_LEN]) -> Result<(), KeystoreError> {
        *self
            .pepper
            .lock()
            .map_err(|_| KeystoreError::Other("mutex poisoned".to_string()))? =
            Some(Zeroizing::new(pepper));
        Ok(())
    }

    fn delete_storage_pepper(&self) -> Result<(), KeystoreError> {
        *self
            .pepper
            .lock()
            .map_err(|_| KeystoreError::Other("mutex poisoned".to_string()))? = None;
        Ok(())
    }
}

#[cfg(test)]
#[path = "in_memory_tests.rs"]
mod in_memory_tests;

#[cfg(all(
    test,
    any(
        target_os = "macos",
        target_os = "windows",
        target_os = "ios",
        all(target_os = "linux", not(target_env = "musl"))
    )
))]
#[path = "keyring_tests.rs"]
mod tests;
