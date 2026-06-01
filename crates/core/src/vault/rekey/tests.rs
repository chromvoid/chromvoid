use std::cell::Cell;
use std::collections::BTreeSet;

use crate::crypto::keystore::InMemoryKeystore;
use crate::crypto::{blob_chunk_name, decrypt, encrypt, otp_chunk_name};
use crate::error::Error;
use crate::storage::{Storage, StorageArtifact};
use crate::types::DEFAULT_CHUNK_SIZE;
use crate::vault::{Vault, VaultRekeyRequest, VaultSession};
use tempfile::TempDir;

fn setup_storage() -> (Storage, TempDir, InMemoryKeystore) {
    std::env::set_var("CHROMVOID_TEST_FAST_KDF", "1");
    let temp_dir = TempDir::new().expect("temp dir");
    let storage = Storage::new(temp_dir.path()).expect("storage");
    let keystore = InMemoryKeystore::new();
    (storage, temp_dir, keystore)
}

fn unlock(storage: &Storage, keystore: &InMemoryKeystore, password: &str) -> VaultSession {
    Vault::unlock_with_keystore(storage, password, Some(keystore)).expect("unlock")
}

fn write_blob(storage: &Storage, session: &VaultSession, node_id: u64, bytes: &[u8]) {
    write_blob_part(storage, session, node_id, 0, bytes);
}

fn write_blob_part(
    storage: &Storage,
    session: &VaultSession,
    node_id: u64,
    part_index: u32,
    bytes: &[u8],
) {
    let name = blob_chunk_name(session.vault_key(), node_id as u32, part_index);
    let encrypted = encrypt(bytes, session.vault_key(), name.as_bytes()).expect("encrypt blob");
    storage
        .write_chunk(&name, &encrypted)
        .expect("write blob chunk");
}

fn write_otp(storage: &Storage, session: &VaultSession, node_id: u64, bytes: &[u8]) {
    let name = otp_chunk_name(session.vault_key(), node_id);
    let encrypted = encrypt(bytes, session.vault_key(), name.as_bytes()).expect("encrypt otp");
    storage
        .write_chunk(&name, &encrypted)
        .expect("write otp chunk");
}

fn chunk_set(storage: &Storage) -> BTreeSet<String> {
    storage
        .list_chunks()
        .expect("list chunks")
        .into_iter()
        .collect()
}

#[test]
fn rekey_changes_password_and_preserves_catalog_blob_and_otp() {
    let (storage, _temp_dir, keystore) = setup_storage();
    let file_bytes = b"vault file bytes";
    let otp_bytes = br#"{"secrets":[]}"#;
    let file_id;

    {
        let mut session = unlock(&storage, &keystore, "old-password");
        session
            .catalog_mut()
            .create_dir("/", "docs")
            .expect("create dir");
        file_id = session
            .catalog_mut()
            .create_file(
                "/docs",
                "note.txt",
                file_bytes.len() as u64,
                Some("text/plain".into()),
            )
            .expect("create file");
        write_blob(&storage, &session, file_id, file_bytes);
        write_otp(&storage, &session, file_id, otp_bytes);
        session.save(&storage).expect("save old");

        let mut progress = Vec::new();
        let result = session
            .rekey_password(
                &storage,
                &keystore,
                VaultRekeyRequest {
                    current_password: "old-password".to_string(),
                    new_password: "new-password".to_string(),
                },
                &|| false,
                &mut |event| progress.push(event),
            )
            .expect("rekey");
        assert!(result.migrated_chunks >= 4);
        assert!(result.deleted_old_chunks >= 4);
        assert!(result.backup_recommended);
        assert_eq!(
            progress.last().map(|event| event.phase.as_str()),
            Some("completed")
        );

        let new_blob_name = blob_chunk_name(session.vault_key(), file_id as u32, 0);
        let encrypted_blob = storage.read_chunk(&new_blob_name).expect("new blob");
        let decrypted_blob = decrypt(
            &encrypted_blob,
            session.vault_key(),
            new_blob_name.as_bytes(),
        )
        .expect("blob decrypt");
        assert_eq!(decrypted_blob, file_bytes);

        let new_otp_name = otp_chunk_name(session.vault_key(), file_id);
        let encrypted_otp = storage.read_chunk(&new_otp_name).expect("new otp");
        let decrypted_otp = decrypt(&encrypted_otp, session.vault_key(), new_otp_name.as_bytes())
            .expect("otp decrypt");
        assert_eq!(decrypted_otp, otp_bytes);
    }

    let new_session = unlock(&storage, &keystore, "new-password");
    assert!(new_session
        .catalog()
        .find_by_path("/docs/note.txt")
        .is_some());

    let old_session = unlock(&storage, &keystore, "old-password");
    assert!(old_session
        .catalog()
        .find_by_path("/docs/note.txt")
        .is_none());
}

#[test]
fn rekey_preserves_decoy_vault_chunks() {
    let (storage, _temp_dir, keystore) = setup_storage();

    {
        let mut session = unlock(&storage, &keystore, "old-password");
        session
            .catalog_mut()
            .create_dir("/", "active")
            .expect("active dir");
        session.save(&storage).expect("save active");
    }
    {
        let mut session = unlock(&storage, &keystore, "decoy-password");
        session
            .catalog_mut()
            .create_dir("/", "decoy")
            .expect("decoy dir");
        session.save(&storage).expect("save decoy");
    }

    let before = chunk_set(&storage);
    {
        let mut session = unlock(&storage, &keystore, "old-password");
        session
            .rekey_password(
                &storage,
                &keystore,
                VaultRekeyRequest {
                    current_password: "old-password".to_string(),
                    new_password: "new-password".to_string(),
                },
                &|| false,
                &mut |_| {},
            )
            .expect("rekey");
    }
    let after = chunk_set(&storage);
    assert!(after.len() >= before.len().saturating_sub(4));

    let decoy = unlock(&storage, &keystore, "decoy-password");
    assert!(decoy.catalog().find_by_path("/decoy").is_some());
    assert!(decoy.catalog().find_by_path("/active").is_none());
}

#[test]
fn rekey_wrong_current_password_leaves_chunks_unchanged() {
    let (storage, _temp_dir, keystore) = setup_storage();
    let mut session = unlock(&storage, &keystore, "old-password");
    session
        .catalog_mut()
        .create_dir("/", "docs")
        .expect("create dir");
    session.save(&storage).expect("save");
    let before = chunk_set(&storage);

    let result = session.rekey_password(
        &storage,
        &keystore,
        VaultRekeyRequest {
            current_password: "wrong-password".to_string(),
            new_password: "new-password".to_string(),
        },
        &|| false,
        &mut |_| {},
    );

    assert!(matches!(result, Err(Error::RekeyInvalidCurrentPassword)));
    assert_eq!(chunk_set(&storage), before);
}

#[test]
fn rekey_cancel_before_commit_rolls_back_staged_chunks() {
    let (storage, _temp_dir, keystore) = setup_storage();
    let file_bytes = b"cancel me";
    let file_id;
    let mut session = unlock(&storage, &keystore, "old-password");
    file_id = session
        .catalog_mut()
        .create_file("/", "cancel.txt", file_bytes.len() as u64, None)
        .expect("create file");
    write_blob(&storage, &session, file_id, file_bytes);
    session.save(&storage).expect("save");
    let before = chunk_set(&storage);
    let calls = Cell::new(0usize);

    let result = session.rekey_password(
        &storage,
        &keystore,
        VaultRekeyRequest {
            current_password: "old-password".to_string(),
            new_password: "new-password".to_string(),
        },
        &|| {
            let next = calls.get().saturating_add(1);
            calls.set(next);
            next > 2
        },
        &mut |_| {},
    );

    assert!(matches!(result, Err(Error::RekeyCancelled)));
    assert_eq!(chunk_set(&storage), before);
    assert!(!storage
        .artifact_exists(StorageArtifact::RekeyTransaction)
        .expect("transaction exists check"));

    let old_session = unlock(&storage, &keystore, "old-password");
    assert!(old_session.catalog().find_by_path("/cancel.txt").is_some());
    let new_session = unlock(&storage, &keystore, "new-password");
    assert!(new_session.catalog().find_by_path("/cancel.txt").is_none());
}

#[test]
fn rekey_tolerates_incomplete_blob_upload_placeholders() {
    let (storage, _temp_dir, keystore) = setup_storage();
    let first_chunk = b"partial upload bytes";
    let file_id;
    let mut session = unlock(&storage, &keystore, "old-password");
    file_id = session
        .catalog_mut()
        .create_file("/", "partial.bin", (DEFAULT_CHUNK_SIZE as u64) + 1, None)
        .expect("create partial file");
    write_blob_part(&storage, &session, file_id, 0, first_chunk);
    session.save(&storage).expect("save partial catalog");

    session
        .rekey_password(
            &storage,
            &keystore,
            VaultRekeyRequest {
                current_password: "old-password".to_string(),
                new_password: "new-password".to_string(),
            },
            &|| false,
            &mut |_| {},
        )
        .expect("rekey should not fail on a missing blob tail");

    let new_chunk_name = blob_chunk_name(session.vault_key(), file_id as u32, 0);
    let encrypted = storage
        .read_chunk(&new_chunk_name)
        .expect("existing blob chunk migrated");
    let decrypted = decrypt(&encrypted, session.vault_key(), new_chunk_name.as_bytes())
        .expect("migrated chunk decrypts");
    assert_eq!(decrypted, first_chunk);

    let missing_tail_name = blob_chunk_name(session.vault_key(), file_id as u32, 1);
    assert!(matches!(
        storage.read_chunk(&missing_tail_name),
        Err(Error::ChunkNotFound(_))
    ));

    let old_session = unlock(&storage, &keystore, "old-password");
    assert!(old_session.catalog().find_by_path("/partial.bin").is_none());
    let new_session = unlock(&storage, &keystore, "new-password");
    assert!(new_session.catalog().find_by_path("/partial.bin").is_some());
}
