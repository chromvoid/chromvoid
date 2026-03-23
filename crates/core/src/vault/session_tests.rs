use super::*;
use crate::crypto::keystore::InMemoryKeystore;
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
