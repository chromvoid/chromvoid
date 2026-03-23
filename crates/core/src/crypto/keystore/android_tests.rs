use super::*;
use std::sync::{Arc, Mutex};

#[derive(Default)]
struct MockAndroidKeystoreBackend {
    pepper: Mutex<Option<Vec<u8>>>,
    load_error: Mutex<Option<KeystoreError>>,
}

impl MockAndroidKeystoreBackend {
    fn fail_load_once(&self, err: KeystoreError) {
        *self.load_error.lock().expect("load_error lock poisoned") = Some(err);
    }
}

impl AndroidKeystoreBackend for MockAndroidKeystoreBackend {
    fn load_storage_pepper(&self) -> Result<Option<Vec<u8>>, KeystoreError> {
        if let Some(err) = self
            .load_error
            .lock()
            .expect("load_error lock poisoned")
            .take()
        {
            return Err(err);
        }

        Ok(self.pepper.lock().expect("pepper lock poisoned").clone())
    }

    fn store_storage_pepper(&self, pepper: [u8; STORAGE_PEPPER_LEN]) -> Result<(), KeystoreError> {
        *self.pepper.lock().expect("pepper lock poisoned") = Some(pepper.to_vec());
        Ok(())
    }

    fn delete_storage_pepper(&self) -> Result<(), KeystoreError> {
        *self.pepper.lock().expect("pepper lock poisoned") = None;
        Ok(())
    }
}

#[test]
fn android_keystore_roundtrip() {
    let backend = Arc::new(MockAndroidKeystoreBackend::default());
    let keystore = AndroidKeystore::with_backend(backend);

    assert_eq!(keystore.load_storage_pepper().expect("initial load"), None);

    let pepper = [0x5Au8; STORAGE_PEPPER_LEN];
    keystore
        .store_storage_pepper(pepper)
        .expect("store pepper to android keystore");

    assert_eq!(
        keystore.load_storage_pepper().expect("load after store"),
        Some(pepper)
    );

    keystore
        .delete_storage_pepper()
        .expect("delete pepper from android keystore");
    assert_eq!(
        keystore.load_storage_pepper().expect("load after delete"),
        None
    );
}

#[test]
fn android_keystore_invalidation() {
    let backend = Arc::new(MockAndroidKeystoreBackend::default());
    backend.fail_load_once(KeystoreError::KeyInvalidated);
    let keystore = AndroidKeystore::with_backend(backend);

    let err = keystore
        .load_storage_pepper()
        .expect_err("invalidated key must return typed error");
    assert!(matches!(err, KeystoreError::KeyInvalidated));
}
