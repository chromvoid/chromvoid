use super::*;
use crate::crypto::keystore::{InMemoryKeystore, Keystore, KeystoreError, STORAGE_PEPPER_LEN};
use crate::vault::DecryptedChunkCacheKey;
use std::collections::BTreeMap;
use std::path::{Path, PathBuf};
use std::sync::atomic::{AtomicBool, AtomicUsize, Ordering};
use std::sync::Mutex;
use tempfile::TempDir;
use zeroize::Zeroizing;

fn create_test_storage() -> (Storage, TempDir, InMemoryKeystore) {
    let temp_dir = TempDir::new().expect("failed to create temp dir");
    let storage = Storage::new(temp_dir.path()).expect("failed to create storage");
    let keystore = InMemoryKeystore::new();
    (storage, temp_dir, keystore)
}

fn unlock(storage: &Storage, keystore: &InMemoryKeystore, password: &str) -> Result<VaultSession> {
    Vault::unlock_with_keystore(storage, password, Some(keystore))
}

#[test]
fn test_vault_session_vault_key_is_zeroizing() {
    fn assert_zeroizing_key(_: &Zeroizing<[u8; KEY_SIZE]>) {}

    let (storage, _temp_dir, keystore) = create_test_storage();
    let session = unlock(&storage, &keystore, "password").expect("should unlock");
    assert_zeroizing_key(&session.vault_key);
}

#[test]
fn test_unlock_empty_vault() {
    let (storage, _temp_dir, keystore) = create_test_storage();

    let session = unlock(&storage, &keystore, "password").expect("should unlock");

    assert!(session.is_empty());
    assert_eq!(session.stats().node_count, 1);
}

#[test]
fn test_unlock_and_save() {
    let (storage, _temp_dir, keystore) = create_test_storage();

    {
        let mut session = unlock(&storage, &keystore, "password").expect("should unlock");

        session
            .catalog_mut()
            .create_dir("/", "documents")
            .expect("should create dir");

        let _ = session.save(&storage).expect("should save");
    }

    {
        let session = unlock(&storage, &keystore, "password").expect("should unlock");

        assert!(!session.is_empty());
        assert!(session.catalog().find_by_path("/documents").is_some());
    }
}

#[test]
fn test_plausible_deniability_different_passwords() {
    let (storage, _temp_dir, keystore) = create_test_storage();

    {
        let mut session = unlock(&storage, &keystore, "password1").expect("should unlock");
        session
            .catalog_mut()
            .create_dir("/", "secret_docs")
            .expect("should create dir");
        let _ = session.save(&storage).expect("should save");
    }

    {
        let session = unlock(&storage, &keystore, "password2").expect("should unlock");
        assert!(session.is_empty());
        assert!(session.catalog().find_by_path("/secret_docs").is_none());
    }

    {
        let session = unlock(&storage, &keystore, "password1").expect("should unlock");
        assert!(!session.is_empty());
        assert!(session.catalog().find_by_path("/secret_docs").is_some());
    }
}

#[test]
fn test_multiple_vaults_same_storage() {
    let (storage, _temp_dir, keystore) = create_test_storage();

    {
        let mut session = unlock(&storage, &keystore, "vault1_pass").expect("should unlock");
        session
            .catalog_mut()
            .create_dir("/", "vault1_data")
            .expect("should create dir");
        let _ = session.save(&storage).expect("should save");
    }

    {
        let mut session = unlock(&storage, &keystore, "vault2_pass").expect("should unlock");
        session
            .catalog_mut()
            .create_dir("/", "vault2_data")
            .expect("should create dir");
        let _ = session.save(&storage).expect("should save");
    }

    {
        let session = unlock(&storage, &keystore, "vault1_pass").expect("should unlock");
        assert!(session.catalog().find_by_path("/vault1_data").is_some());
        assert!(session.catalog().find_by_path("/vault2_data").is_none());
    }

    {
        let session = unlock(&storage, &keystore, "vault2_pass").expect("should unlock");
        assert!(session.catalog().find_by_path("/vault2_data").is_some());
        assert!(session.catalog().find_by_path("/vault1_data").is_none());
    }
}

#[test]
fn test_session_dirty_flag() {
    let (storage, _temp_dir, keystore) = create_test_storage();

    let mut session = unlock(&storage, &keystore, "password").expect("should unlock");

    assert!(!session.is_dirty());

    session
        .catalog_mut()
        .create_dir("/", "test")
        .expect("should create");

    assert!(session.is_dirty());

    let _ = session.save(&storage).expect("should save");

    assert!(!session.is_dirty());
}

#[test]
fn test_lock_with_save() {
    let (storage, _temp_dir, keystore) = create_test_storage();

    {
        let mut session = unlock(&storage, &keystore, "password").expect("should unlock");
        session
            .catalog_mut()
            .create_dir("/", "test")
            .expect("should create");
        session.lock(Some(&storage)).expect("should lock");
    }

    {
        let session = unlock(&storage, &keystore, "password").expect("should unlock");
        assert!(session.catalog().find_by_path("/test").is_some());
    }
}

#[test]
fn test_lock_clears_decrypted_chunk_cache() {
    let (storage, _temp_dir, keystore) = create_test_storage();
    let mut session = unlock(&storage, &keystore, "password").expect("should unlock");
    let cache = session.decrypted_chunk_cache();
    let generation = session.decrypted_chunk_cache_generation();
    cache.insert(
        generation,
        DecryptedChunkCacheKey {
            node_id: 7,
            source_revision: 11,
            chunk_index: 0,
            chunk_size: 4,
        },
        b"test",
    );
    assert_eq!(cache.stats().entries, 1);

    session.lock(Some(&storage)).expect("should lock");

    let stats = cache.stats();
    assert_eq!(stats.entries, 0);
    assert_eq!(stats.bytes, 0);
    assert!(stats.generation > generation);
}

#[test]
fn test_unlock_creates_new_decrypted_chunk_cache() {
    let (storage, _temp_dir, keystore) = create_test_storage();
    let mut first = unlock(&storage, &keystore, "password").expect("should unlock");
    let first_cache = first.decrypted_chunk_cache();
    first.lock(Some(&storage)).expect("should lock");

    let second = unlock(&storage, &keystore, "password").expect("should unlock");
    let second_cache = second.decrypted_chunk_cache();

    assert!(!std::sync::Arc::ptr_eq(&first_cache, &second_cache));
    assert_eq!(second_cache.stats().entries, 0);
}

#[test]
fn test_vault_stats() {
    let (storage, _temp_dir, keystore) = create_test_storage();

    let mut session = unlock(&storage, &keystore, "password").expect("should unlock");

    session
        .catalog_mut()
        .create_dir("/", "dir1")
        .expect("should create");
    session
        .catalog_mut()
        .create_file("/", "file.txt", 1024, None)
        .expect("should create");

    let stats = session.stats();

    assert_eq!(stats.node_count, 3);
    assert_eq!(stats.total_size, 1024);
}

#[derive(Debug, Clone, Copy)]
enum PepperLoadFailure {
    Missing,
    Unavailable,
    PermissionDenied,
    KeyInvalidated,
    Corrupted,
}

#[derive(Debug)]
struct FailingPepperKeystore {
    failure: PepperLoadFailure,
    store_calls: AtomicUsize,
}

impl FailingPepperKeystore {
    fn new(failure: PepperLoadFailure) -> Self {
        Self {
            failure,
            store_calls: AtomicUsize::new(0),
        }
    }
}

impl Keystore for FailingPepperKeystore {
    fn load_storage_pepper(
        &self,
    ) -> std::result::Result<Option<[u8; STORAGE_PEPPER_LEN]>, KeystoreError> {
        match self.failure {
            PepperLoadFailure::Missing => Ok(None),
            PepperLoadFailure::Unavailable => Err(KeystoreError::Unavailable),
            PepperLoadFailure::PermissionDenied => Err(KeystoreError::PermissionDenied),
            PepperLoadFailure::KeyInvalidated => Err(KeystoreError::KeyInvalidated),
            PepperLoadFailure::Corrupted => Err(KeystoreError::Corrupted),
        }
    }

    fn store_storage_pepper(
        &self,
        _pepper: [u8; STORAGE_PEPPER_LEN],
    ) -> std::result::Result<(), KeystoreError> {
        self.store_calls.fetch_add(1, Ordering::SeqCst);
        Ok(())
    }

    fn delete_storage_pepper(&self) -> std::result::Result<(), KeystoreError> {
        Ok(())
    }
}

#[derive(Debug, Clone, Copy, PartialEq, Eq)]
enum PepperOperation {
    Load { salt_exists: bool },
    Store { salt_exists: bool },
}

#[derive(Debug)]
struct RecordingPepperKeystore {
    salt_path: PathBuf,
    corrupt_next_readback: AtomicBool,
    pepper: Mutex<Option<[u8; STORAGE_PEPPER_LEN]>>,
    operations: Mutex<Vec<PepperOperation>>,
}

impl RecordingPepperKeystore {
    fn new(storage_root: &Path, corrupt_readback: bool) -> Self {
        Self {
            salt_path: storage_root.join("salt"),
            corrupt_next_readback: AtomicBool::new(corrupt_readback),
            pepper: Mutex::new(None),
            operations: Mutex::new(Vec::new()),
        }
    }

    fn operations(&self) -> Vec<PepperOperation> {
        self.operations.lock().expect("operations").clone()
    }
}

impl Keystore for RecordingPepperKeystore {
    fn load_storage_pepper(
        &self,
    ) -> std::result::Result<Option<[u8; STORAGE_PEPPER_LEN]>, KeystoreError> {
        self.operations
            .lock()
            .expect("operations")
            .push(PepperOperation::Load {
                salt_exists: self.salt_path.exists(),
            });
        let mut pepper = *self.pepper.lock().expect("pepper");
        if let Some(value) = pepper.as_mut() {
            if self.corrupt_next_readback.swap(false, Ordering::SeqCst) {
                value[0] ^= 1;
            }
        }
        Ok(pepper)
    }

    fn store_storage_pepper(
        &self,
        pepper: [u8; STORAGE_PEPPER_LEN],
    ) -> std::result::Result<(), KeystoreError> {
        self.operations
            .lock()
            .expect("operations")
            .push(PepperOperation::Store {
                salt_exists: self.salt_path.exists(),
            });
        *self.pepper.lock().expect("pepper") = Some(pepper);
        Ok(())
    }

    fn delete_storage_pepper(&self) -> std::result::Result<(), KeystoreError> {
        *self.pepper.lock().expect("pepper") = None;
        Ok(())
    }
}

fn snapshot_storage_files(root: &Path) -> BTreeMap<PathBuf, Vec<u8>> {
    fn collect(root: &Path, current: &Path, files: &mut BTreeMap<PathBuf, Vec<u8>>) {
        for entry in std::fs::read_dir(current).expect("read storage directory") {
            let entry = entry.expect("storage directory entry");
            let path = entry.path();
            if path.is_dir() {
                collect(root, &path, files);
            } else if path.is_file() {
                let relative = path.strip_prefix(root).expect("relative storage path");
                files.insert(
                    relative.to_path_buf(),
                    std::fs::read(&path).expect("read storage file"),
                );
            }
        }
    }

    let mut files = BTreeMap::new();
    collect(root, root, &mut files);
    files
}

#[test]
fn unlock_existing_storage_keystore_failures_do_not_mutate_storage() {
    let (storage, temp_dir, keystore) = create_test_storage();
    let mut session = unlock(&storage, &keystore, "password").expect("initial unlock");
    session
        .catalog_mut()
        .create_dir("/", "persisted")
        .expect("create persisted directory");
    session.save(&storage).expect("persist catalog");
    assert!(storage.has_any_chunk().expect("chunks"));

    let expected_snapshot = snapshot_storage_files(temp_dir.path());
    for failure in [
        PepperLoadFailure::Missing,
        PepperLoadFailure::Unavailable,
        PepperLoadFailure::PermissionDenied,
        PepperLoadFailure::KeyInvalidated,
        PepperLoadFailure::Corrupted,
    ] {
        let failing_keystore = FailingPepperKeystore::new(failure);
        let error = match Vault::unlock_with_keystore(&storage, "password", Some(&failing_keystore))
        {
            Ok(_) => panic!("unlock must fail closed"),
            Err(error) => error,
        };

        match failure {
            PepperLoadFailure::Missing => {
                assert!(matches!(error, Error::StoragePepperRequired));
            }
            PepperLoadFailure::Unavailable
            | PepperLoadFailure::PermissionDenied
            | PepperLoadFailure::KeyInvalidated
            | PepperLoadFailure::Corrupted => {
                assert!(matches!(error, Error::KeystoreUnavailable(_)));
            }
        }
        assert_eq!(failing_keystore.store_calls.load(Ordering::SeqCst), 0);
        assert_eq!(snapshot_storage_files(temp_dir.path()), expected_snapshot);
    }
}

#[test]
fn unlock_initialized_empty_storage_does_not_replace_missing_pepper() {
    let (storage, temp_dir, _keystore) = create_test_storage();
    storage.get_or_create_salt().expect("initialize vault salt");
    assert!(!storage.has_any_chunk().expect("chunks"));
    let expected_snapshot = snapshot_storage_files(temp_dir.path());
    let missing_keystore = FailingPepperKeystore::new(PepperLoadFailure::Missing);

    let error = match Vault::unlock_with_keystore(&storage, "password", Some(&missing_keystore)) {
        Ok(_) => panic!("initialized storage must not create a replacement pepper"),
        Err(error) => error,
    };

    assert!(matches!(error, Error::StoragePepperRequired));
    assert_eq!(missing_keystore.store_calls.load(Ordering::SeqCst), 0);
    assert_eq!(snapshot_storage_files(temp_dir.path()), expected_snapshot);
}

#[test]
fn unlock_existing_chunks_with_missing_salt_does_not_create_replacement_salt() {
    let (storage, temp_dir, keystore) = create_test_storage();
    let mut session = unlock(&storage, &keystore, "password").expect("initial unlock");
    session
        .catalog_mut()
        .create_dir("/", "persisted")
        .expect("create persisted directory");
    session.save(&storage).expect("persist catalog");
    std::fs::remove_file(temp_dir.path().join("salt")).expect("remove salt for fixture");
    let expected_snapshot = snapshot_storage_files(temp_dir.path());

    let error = match unlock(&storage, &keystore, "password") {
        Ok(_) => panic!("missing salt must fail closed"),
        Err(error) => error,
    };

    assert!(matches!(error, Error::InvalidDataFormat(_)));
    assert!(!storage.salt_exists());
    assert_eq!(snapshot_storage_files(temp_dir.path()), expected_snapshot);
}

#[test]
fn unlock_empty_storage_verifies_stored_pepper_before_creating_salt() {
    let temp_dir = TempDir::new().expect("temp dir");
    let storage = Storage::new(temp_dir.path()).expect("storage");
    let keystore = RecordingPepperKeystore::new(temp_dir.path(), false);

    assert!(!storage.salt_exists());
    Vault::unlock_with_keystore(&storage, "password", Some(&keystore))
        .expect("empty storage unlock");

    assert_eq!(
        keystore.operations(),
        vec![
            PepperOperation::Load { salt_exists: false },
            PepperOperation::Store { salt_exists: false },
            PepperOperation::Load { salt_exists: false },
        ]
    );
    assert!(storage.salt_exists());
}

#[test]
fn unlock_empty_storage_rejects_pepper_readback_mismatch_then_accepts_later_load() {
    let temp_dir = TempDir::new().expect("temp dir");
    let storage = Storage::new(temp_dir.path()).expect("storage");
    let keystore = RecordingPepperKeystore::new(temp_dir.path(), true);

    let error = match Vault::unlock_with_keystore(&storage, "password", Some(&keystore)) {
        Ok(_) => panic!("mismatched readback must fail"),
        Err(error) => error,
    };

    assert!(matches!(error, Error::KeystoreUnavailable(_)));
    assert_eq!(
        keystore.operations(),
        vec![
            PepperOperation::Load { salt_exists: false },
            PepperOperation::Store { salt_exists: false },
            PepperOperation::Load { salt_exists: false },
        ]
    );
    assert!(!storage.salt_exists());

    Vault::unlock_with_keystore(&storage, "password", Some(&keystore))
        .expect("later authoritative load should initialize pristine storage");

    assert_eq!(
        keystore.operations(),
        vec![
            PepperOperation::Load { salt_exists: false },
            PepperOperation::Store { salt_exists: false },
            PepperOperation::Load { salt_exists: false },
            PepperOperation::Load { salt_exists: false },
        ]
    );
    assert!(storage.salt_exists());
}
