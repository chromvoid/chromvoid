use super::*;
use std::sync::atomic::{AtomicUsize, Ordering};
use std::sync::{Arc, Mutex};

#[derive(Default)]
struct MockAndroidKeystoreBackend {
    pepper: Mutex<Option<Vec<u8>>>,
    load_error: Mutex<Option<KeystoreError>>,
    store_calls: AtomicUsize,
    delete_calls: AtomicUsize,
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
        self.store_calls.fetch_add(1, Ordering::SeqCst);
        *self.pepper.lock().expect("pepper lock poisoned") = Some(pepper.to_vec());
        Ok(())
    }

    fn delete_storage_pepper(&self) -> Result<(), KeystoreError> {
        self.delete_calls.fetch_add(1, Ordering::SeqCst);
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

#[test]
fn android_keystore_read_failure_preserves_pepper_and_allows_retry() {
    let backend = Arc::new(MockAndroidKeystoreBackend::default());
    let keystore = AndroidKeystore::with_backend(backend.clone());
    let pepper = [0x7Bu8; STORAGE_PEPPER_LEN];
    keystore.store_storage_pepper(pepper).expect("store pepper");

    for error in [
        KeystoreError::Unavailable,
        KeystoreError::KeyInvalidated,
        KeystoreError::PermissionDenied,
        KeystoreError::Corrupted,
    ] {
        backend.fail_load_once(error);
        assert!(keystore.load_storage_pepper().is_err());
        assert_eq!(
            keystore.load_storage_pepper().expect("retry load"),
            Some(pepper)
        );
    }
    assert_eq!(backend.store_calls.load(Ordering::SeqCst), 1);
    assert_eq!(backend.delete_calls.load(Ordering::SeqCst), 0);
}

#[test]
fn android_keystore_invalid_length_preserves_corrupted_state() {
    let backend = Arc::new(MockAndroidKeystoreBackend::default());
    let corrupted = vec![0x5A; STORAGE_PEPPER_LEN - 1];
    *backend.pepper.lock().expect("pepper") = Some(corrupted.clone());
    let keystore = AndroidKeystore::with_backend(backend.clone());

    assert!(matches!(
        keystore.load_storage_pepper(),
        Err(KeystoreError::Corrupted)
    ));
    assert_eq!(*backend.pepper.lock().expect("pepper"), Some(corrupted));
    assert_eq!(backend.store_calls.load(Ordering::SeqCst), 0);
    assert_eq!(backend.delete_calls.load(Ordering::SeqCst), 0);
}
