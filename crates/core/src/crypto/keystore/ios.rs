//! iOS keystore backend.
//!
//! Implementation uses the OS Keychain via the `keyring` crate.

use super::{
    ios_storage_pepper_locator, KeyringKeystore, Keystore, KeystoreError, STORAGE_PEPPER_LEN,
};

/// iOS storage-pepper entry.
///
/// The Keychain locator is intentionally independent of the app container path,
/// which can change when TestFlight installs an update.
#[derive(Debug)]
pub struct IosKeystore {
    inner: KeyringKeystore,
}

impl IosKeystore {
    pub fn new() -> Result<Self, KeystoreError> {
        let locator = ios_storage_pepper_locator();
        Ok(Self {
            inner: KeyringKeystore::new(locator.service, locator.account)?,
        })
    }
}

impl Keystore for IosKeystore {
    fn load_storage_pepper(&self) -> Result<Option<[u8; STORAGE_PEPPER_LEN]>, KeystoreError> {
        self.inner.load_storage_pepper()
    }

    fn store_storage_pepper(&self, pepper: [u8; STORAGE_PEPPER_LEN]) -> Result<(), KeystoreError> {
        self.inner.store_storage_pepper(pepper)
    }

    fn delete_storage_pepper(&self) -> Result<(), KeystoreError> {
        self.inner.delete_storage_pepper()
    }
}
