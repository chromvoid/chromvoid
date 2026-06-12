use super::*;
use crate::error::Error;
use crate::storage::backend::fault::{FaultRule, StorageOperation};
use crate::storage::{StorageArtifact, StorageTempNamespace};
use tempfile::TempDir;

fn create_test_storage() -> (Storage, TempDir) {
    let temp_dir = TempDir::new().expect("failed to create temp dir");
    let storage = Storage::new(temp_dir.path()).expect("failed to create storage");
    (storage, temp_dir)
}

fn test_chunk_name(index: u8) -> String {
    format!("{index:02x}a2b3c4d5e6f7890123456789abcdef01a2b3c4d5e6f7890123456789abcdef")
}

fn temp_chunk_file_count(root: &std::path::Path) -> usize {
    fn walk(path: &std::path::Path, count: &mut usize) {
        let Ok(entries) = std::fs::read_dir(path) else {
            return;
        };
        for entry in entries.flatten() {
            let path = entry.path();
            if path.is_dir() {
                walk(&path, count);
            } else if path
                .file_name()
                .and_then(|name| name.to_str())
                .is_some_and(|name| name.starts_with(".batch."))
            {
                *count += 1;
            }
        }
    }

    let mut count = 0;
    walk(&root.join("chunks"), &mut count);
    count
}

fn temp_artifact_file_count(root: &std::path::Path) -> usize {
    let Ok(entries) = std::fs::read_dir(root) else {
        return 0;
    };
    entries
        .flatten()
        .filter(|entry| {
            entry
                .file_name()
                .to_str()
                .is_some_and(|name| name.starts_with(".artifact."))
        })
        .count()
}

#[test]
fn test_storage_creation() {
    let (storage, _temp_dir) = create_test_storage();

    assert!(storage.base_path().join("chunks").exists());
}

#[test]
fn test_salt_creation() {
    let (storage, _temp_dir) = create_test_storage();

    assert!(!storage.salt_exists());

    let salt = storage.get_or_create_salt().expect("should create salt");

    assert!(storage.salt_exists());
    assert_eq!(salt.len(), SALT_SIZE);

    assert!(salt.iter().any(|&b| b != 0));
}

#[test]
fn test_salt_persistence() {
    let temp_dir = TempDir::new().expect("failed to create temp dir");

    let storage1 = Storage::new(temp_dir.path()).expect("failed to create storage");
    let salt1 = storage1.get_or_create_salt().expect("should create salt");

    let storage2 = Storage::new(temp_dir.path()).expect("failed to create storage");
    let salt2 = storage2
        .get_or_create_salt()
        .expect("should read existing salt");

    assert_eq!(salt1, salt2);
}

#[test]
fn test_write_read_chunk() {
    let (storage, _temp_dir) = create_test_storage();

    let name = "01a2b3c4d5e6f7890123456789abcdef01a2b3c4d5e6f7890123456789abcdef";
    let data = b"Hello, KeepPrivy!";

    storage.write_chunk(name, data).expect("should write chunk");

    let read_data = storage.read_chunk(name).expect("should read chunk");

    assert_eq!(read_data, data);
}

#[test]
fn test_chunk_path_structure() {
    let (storage, _temp_dir) = create_test_storage();

    let name = "a1b2c3d4e5f67890123456789abcdef01a2b3c4d5e6f7890123456789abcdef0";
    let data = b"test";

    storage.write_chunk(name, data).expect("should write chunk");

    let expected_path = storage
        .base_path()
        .join("chunks")
        .join("a")
        .join("1b")
        .join(name);

    assert!(expected_path.exists());
}

#[test]
fn test_chunk_exists() {
    let (storage, _temp_dir) = create_test_storage();

    let name = "01a2b3c4d5e6f7890123456789abcdef01a2b3c4d5e6f7890123456789abcdef";

    assert!(!storage.chunk_exists(name).unwrap());

    storage.write_chunk(name, b"test").expect("should write");

    assert!(storage.chunk_exists(name).unwrap());
}

#[test]
fn test_delete_chunk() {
    let (storage, _temp_dir) = create_test_storage();

    let name = "01a2b3c4d5e6f7890123456789abcdef01a2b3c4d5e6f7890123456789abcdef";

    storage.write_chunk(name, b"test").expect("should write");
    assert!(storage.chunk_exists(name).unwrap());

    storage.delete_chunk(name).expect("should delete");
    assert!(!storage.chunk_exists(name).unwrap());
}

#[test]
fn test_delete_nonexistent_chunk() {
    let (storage, _temp_dir) = create_test_storage();

    let name = "01a2b3c4d5e6f7890123456789abcdef01a2b3c4d5e6f7890123456789abcdef";

    storage.delete_chunk(name).expect("should not error");
}

#[test]
fn test_read_nonexistent_chunk() {
    let (storage, _temp_dir) = create_test_storage();

    let name = "01a2b3c4d5e6f7890123456789abcdef01a2b3c4d5e6f7890123456789abcdef";

    let result = storage.read_chunk(name);

    assert!(result.is_err());
    assert!(matches!(result, Err(Error::ChunkNotFound(_))));
}

#[test]
fn test_list_chunks() {
    let (storage, _temp_dir) = create_test_storage();

    let names = [
        "01a2b3c4d5e6f7890123456789abcdef01a2b3c4d5e6f7890123456789abcdef",
        "a1b2c3d4e5f67890123456789abcdef01a2b3c4d5e6f7890123456789abcdef0",
        "f1e2d3c4b5a67890123456789abcdef01a2b3c4d5e6f7890123456789abcdef0",
    ];

    for name in &names {
        storage.write_chunk(name, b"test").expect("should write");
    }

    let listed = storage.list_chunks().expect("should list chunks");

    assert_eq!(listed.len(), names.len());
    for name in &names {
        assert!(listed.contains(&name.to_string()));
    }
}

#[test]
fn test_list_chunks_ignores_non_real_chunk_names() {
    let (storage, _temp_dir) = create_test_storage();
    let valid_name = "01a2b3c4d5e6f7890123456789abcdef01a2b3c4d5e6f7890123456789abcdef";
    storage
        .write_chunk(valid_name, b"valid")
        .expect("write valid chunk");

    let invalid_names = [
        "ABCDEF0123456789ABCDEF0123456789ABCDEF0123456789ABCDEF0123456789",
        "abcdef0123456789abcdef0123456789abcdef0123456789abcdef012345678",
        "abcdef0123456789abcdef0123456789abcdef0123456789abcdef01234567890",
    ];
    for name in invalid_names {
        let path = storage
            .base_path()
            .join("chunks")
            .join(&name[0..1])
            .join(&name[1..3])
            .join(name);
        std::fs::create_dir_all(path.parent().expect("parent")).expect("mkdir");
        std::fs::write(path, b"invalid").expect("write invalid chunk name");
    }

    let listed = storage.list_chunks().expect("list chunks");
    assert_eq!(listed, vec![valid_name.to_string()]);
    assert!(storage.has_any_chunk().expect("has any chunk"));
}

#[test]
fn test_invalid_chunk_name_short() {
    let (storage, _temp_dir) = create_test_storage();

    let result = storage.write_chunk("ab", b"test");

    assert!(result.is_err());
    assert!(matches!(result, Err(Error::InvalidChunkName(_))));
}

#[test]
fn test_invalid_chunk_name_uppercase() {
    let (storage, _temp_dir) = create_test_storage();

    let result = storage.write_chunk(
        "ABCDEF0123456789ABCDEF0123456789ABCDEF0123456789ABCDEF0123456789",
        b"test",
    );

    assert!(result.is_err());
    assert!(matches!(result, Err(Error::InvalidChunkName(_))));
}

#[test]
fn test_invalid_chunk_name_not_hex() {
    let (storage, _temp_dir) = create_test_storage();

    let result = storage.write_chunk("xyz123", b"test");

    assert!(result.is_err());
    assert!(matches!(result, Err(Error::InvalidChunkName(_))));
}

#[test]
fn test_artifact_write_read_remove_roundtrip() {
    let (storage, _temp_dir) = create_test_storage();

    for artifact in [
        StorageArtifact::FormatVersion,
        StorageArtifact::Salt,
        StorageArtifact::MasterSalt,
        StorageArtifact::MasterVerify,
        StorageArtifact::MasterVerifyRekeyTemp,
        StorageArtifact::RekeyTransaction,
        StorageArtifact::RekeyTransactionV2,
        StorageArtifact::MasterRekeyTransaction,
        StorageArtifact::RestoreTransaction,
    ] {
        storage
            .write_artifact_atomic(artifact, b"artifact")
            .expect("write artifact");
        assert!(storage.artifact_exists(artifact).expect("exists"));
        assert_eq!(
            storage.read_artifact(artifact).expect("read artifact"),
            Some(b"artifact".to_vec())
        );
        storage.remove_artifact(artifact).expect("remove artifact");
        assert!(!storage.artifact_exists(artifact).expect("removed"));
        assert_eq!(
            storage
                .read_artifact(artifact)
                .expect("read removed artifact"),
            None
        );
    }
}

#[test]
fn test_artifact_temp_write_fault_leaves_no_canonical_artifact() {
    let temp_dir = TempDir::new().expect("temp dir");
    let (storage, _handle) = Storage::fault_injecting_for_tests(
        temp_dir.path(),
        Some(FaultRule {
            operation: StorageOperation::WriteArtifactTemp,
            fail_on: 1,
        }),
    )
    .expect("fault storage");

    let result = storage.write_artifact_durable(StorageArtifact::MasterVerify, b"verify");

    assert!(result.is_err());
    assert!(!storage
        .artifact_exists(StorageArtifact::MasterVerify)
        .expect("artifact exists"));
    assert_eq!(temp_artifact_file_count(temp_dir.path()), 0);
}

#[test]
fn test_artifact_temp_sync_fault_rolls_back_temp() {
    let temp_dir = TempDir::new().expect("temp dir");
    let (storage, _handle) = Storage::fault_injecting_for_tests(
        temp_dir.path(),
        Some(FaultRule {
            operation: StorageOperation::SyncArtifactTemp,
            fail_on: 1,
        }),
    )
    .expect("fault storage");

    let result = storage.write_artifact_durable(StorageArtifact::MasterVerify, b"verify");

    assert!(result.is_err());
    assert!(!storage
        .artifact_exists(StorageArtifact::MasterVerify)
        .expect("artifact exists"));
    assert_eq!(temp_artifact_file_count(temp_dir.path()), 0);
}

#[test]
fn test_artifact_rename_fault_leaves_no_canonical_artifact() {
    let temp_dir = TempDir::new().expect("temp dir");
    let (storage, _handle) = Storage::fault_injecting_for_tests(
        temp_dir.path(),
        Some(FaultRule {
            operation: StorageOperation::RenameArtifactTemp,
            fail_on: 1,
        }),
    )
    .expect("fault storage");

    let result = storage.write_artifact_durable(StorageArtifact::MasterVerify, b"verify");

    assert!(result.is_err());
    assert!(!storage
        .artifact_exists(StorageArtifact::MasterVerify)
        .expect("artifact exists"));
    assert_eq!(temp_artifact_file_count(temp_dir.path()), 0);
}

#[test]
fn test_artifact_parent_sync_fault_reports_committed_state() {
    let temp_dir = TempDir::new().expect("temp dir");
    let (storage, handle) = Storage::fault_injecting_for_tests(
        temp_dir.path(),
        Some(FaultRule {
            operation: StorageOperation::SyncArtifactParent,
            fail_on: 1,
        }),
    )
    .expect("fault storage");

    let result = storage.write_artifact_durable(StorageArtifact::MasterVerify, b"verify");

    let error = result.expect_err("parent sync should fail");
    assert!(error.committed);
    assert!(storage
        .artifact_exists(StorageArtifact::MasterVerify)
        .expect("artifact exists"));
    assert!(handle
        .operations()
        .contains(&StorageOperation::SyncArtifactParent));
}

#[test]
fn test_fault_injecting_storage_records_and_fails_selected_operation() {
    let temp_dir = TempDir::new().expect("temp dir");
    let (storage, fault_handle) = Storage::fault_injecting_for_tests(
        temp_dir.path(),
        Some(FaultRule {
            operation: StorageOperation::WriteChunkAtomic,
            fail_on: 1,
        }),
    )
    .expect("fault storage");

    let result = storage.write_chunk_atomic(
        "01a2b3c4d5e6f7890123456789abcdef01a2b3c4d5e6f7890123456789abcdef",
        b"data",
    );

    assert!(matches!(result, Err(Error::StorageIo(_))));
    assert_eq!(
        fault_handle.operations(),
        vec![StorageOperation::WriteChunkAtomic]
    );
}

#[test]
fn test_temp_namespace_create_sync_and_cleanup() {
    let (storage, temp_dir) = create_test_storage();
    let mut temp = storage
        .create_temp_file(StorageTempNamespace::BackupLocal, "backup-local-", ".pack")
        .expect("create temp");
    let temp_path = temp.path().to_path_buf();
    assert!(temp_path.starts_with(temp_dir.path().join(".storage-tmp").join("backup-local")));

    std::io::Write::write_all(temp.as_file_mut(), b"snapshot").expect("write");
    temp.sync_file_and_parent().expect("sync temp");

    #[cfg(unix)]
    {
        use std::os::unix::fs::PermissionsExt;
        let mode = std::fs::metadata(&temp_path)
            .expect("temp metadata")
            .permissions()
            .mode()
            & 0o777;
        assert_eq!(mode, 0o600);
    }

    let _temp_guard = temp.into_artifact();
    let removed = storage
        .cleanup_temp_namespace(StorageTempNamespace::BackupLocal)
        .expect("cleanup namespace");
    assert_eq!(removed, 1);
    assert!(!temp_path.exists());
}

#[test]
fn test_temp_namespace_cleanup_ignores_unrelated_files_and_removes_legacy_paths() {
    let (storage, temp_dir) = create_test_storage();
    let top_level_keep = temp_dir.path().join("not-a-backup.pack");
    std::fs::write(&top_level_keep, b"keep").expect("write unrelated");
    let legacy_backup = temp_dir.path().join(".backup-local-stale.pack");
    std::fs::write(&legacy_backup, b"stale").expect("write legacy backup");

    let legacy_export_dir = temp_dir.path().join(".vault-export-tmp");
    std::fs::create_dir_all(&legacy_export_dir).expect("legacy export dir");
    let legacy_export = legacy_export_dir.join("chromvoid-export-stale.tar");
    let export_keep = legacy_export_dir.join("unrelated.tar");
    std::fs::write(&legacy_export, b"stale").expect("write legacy export");
    std::fs::write(&export_keep, b"keep").expect("write unrelated export");

    assert_eq!(
        storage
            .cleanup_legacy_temp_files(StorageTempNamespace::BackupLocal)
            .expect("cleanup backup legacy"),
        1
    );
    assert!(!legacy_backup.exists());
    assert!(top_level_keep.exists());

    assert_eq!(
        storage
            .cleanup_legacy_temp_files(StorageTempNamespace::VaultExport)
            .expect("cleanup export legacy"),
        1
    );
    assert!(!legacy_export.exists());
    assert!(export_keep.exists());
}

#[test]
fn test_reset_vault_contents_removes_chunks_reset_artifacts_and_temps() {
    let (storage, temp_dir) = create_test_storage();
    let first = test_chunk_name(11);
    let second = test_chunk_name(12);
    storage.write_chunk(&first, b"first").expect("write first");
    storage
        .write_chunk(&second, b"second")
        .expect("write second");
    storage
        .write_artifact_durable(StorageArtifact::FormatVersion, b"1")
        .expect("write format");
    storage
        .write_artifact_durable(StorageArtifact::Salt, &[7; SALT_SIZE])
        .expect("write salt");
    storage
        .write_artifact_durable(StorageArtifact::MasterSalt, &[8; SALT_SIZE])
        .expect("write master salt");
    storage
        .write_artifact_durable(StorageArtifact::MasterVerify, &[9; 32])
        .expect("write master verify");

    let mut temp = storage
        .create_temp_file(StorageTempNamespace::BackupLocal, "backup-local-", ".pack")
        .expect("create temp");
    std::io::Write::write_all(temp.as_file_mut(), b"temp").expect("write temp");
    let temp_artifact = temp.into_artifact();
    assert!(temp_artifact.path().exists());
    let legacy_export_dir = temp_dir.path().join(".vault-export-tmp");
    std::fs::create_dir_all(&legacy_export_dir).expect("legacy export dir");
    std::fs::write(
        legacy_export_dir.join("chromvoid-export-reset-test.tar"),
        b"legacy",
    )
    .expect("write legacy export");

    let outcome = storage.reset_vault_contents().expect("reset");

    assert_eq!(outcome.removed_chunks, 2);
    assert!(outcome
        .removed_artifacts
        .contains(&StorageArtifact::FormatVersion));
    assert!(outcome.removed_artifacts.contains(&StorageArtifact::Salt));
    assert!(outcome.cleaned_temp_files >= 2);
    assert!(storage.list_chunks().expect("list chunks").is_empty());
    assert!(!storage
        .artifact_exists(StorageArtifact::FormatVersion)
        .expect("format exists"));
    assert!(!storage
        .artifact_exists(StorageArtifact::Salt)
        .expect("salt exists"));
    assert!(storage
        .artifact_exists(StorageArtifact::MasterSalt)
        .expect("master salt exists"));
    assert!(storage
        .artifact_exists(StorageArtifact::MasterVerify)
        .expect("master verify exists"));
}

#[test]
fn test_erase_all_uses_reset_vault_contents_wrapper() {
    let (storage, _temp_dir) = create_test_storage();
    let name = test_chunk_name(13);
    storage.write_chunk(&name, b"data").expect("write chunk");
    storage
        .write_artifact_durable(StorageArtifact::Salt, &[1; SALT_SIZE])
        .expect("write salt");

    storage.erase_all().expect("erase");

    assert!(storage.list_chunks().expect("list chunks").is_empty());
    assert!(!storage
        .artifact_exists(StorageArtifact::Salt)
        .expect("salt exists"));
}

#[test]
fn test_reset_vault_contents_fault_on_delete_chunk_is_retryable() {
    let temp_dir = TempDir::new().expect("temp dir");
    let name = test_chunk_name(14);
    let storage = Storage::new(temp_dir.path()).expect("storage");
    storage.write_chunk(&name, b"data").expect("write chunk");
    storage
        .write_artifact_durable(StorageArtifact::MasterVerify, &[9; 32])
        .expect("write master verify");

    let (faulty, handle) = Storage::fault_injecting_for_tests(
        temp_dir.path(),
        Some(FaultRule {
            operation: StorageOperation::DeleteChunk,
            fail_on: 1,
        }),
    )
    .expect("fault storage");

    let result = faulty.reset_vault_contents();

    assert!(matches!(result, Err(Error::StorageIo(_))));
    assert!(handle.operations().contains(&StorageOperation::DeleteChunk));
    assert!(faulty
        .artifact_exists(StorageArtifact::MasterVerify)
        .expect("master verify exists"));

    let retry = Storage::new(temp_dir.path()).expect("retry storage");
    retry.reset_vault_contents().expect("retry reset");
    assert!(retry.list_chunks().expect("list chunks").is_empty());
    assert!(retry
        .artifact_exists(StorageArtifact::MasterVerify)
        .expect("master verify remains"));
}

#[test]
fn test_temp_namespace_fault_operations_are_observable() {
    let temp_dir = TempDir::new().expect("temp dir");
    let (storage, handle) = Storage::fault_injecting_for_tests(
        temp_dir.path(),
        Some(FaultRule {
            operation: StorageOperation::SyncTempFile,
            fail_on: 1,
        }),
    )
    .expect("fault storage");

    let mut temp = storage
        .create_temp_file(
            StorageTempNamespace::VaultExport,
            "chromvoid-export-",
            ".tar",
        )
        .expect("create temp");
    std::io::Write::write_all(temp.as_file_mut(), b"export").expect("write");

    let result = temp.sync_file_and_parent();

    assert!(matches!(result, Err(Error::StorageIo(_))));
    assert!(handle
        .operations()
        .contains(&StorageOperation::SyncTempFile));
}

#[test]
fn test_chunk_write_batch_writes_multiple_chunks_and_syncs_parent() {
    let (storage, _temp_dir) = create_test_storage();
    let first = test_chunk_name(1);
    let second = test_chunk_name(2);

    let mut batch = storage.begin_chunk_write_batch("flat-test");
    batch
        .write_chunk(first.clone(), b"first")
        .expect("stage first");
    batch
        .write_chunk(second.clone(), b"second")
        .expect("stage second");
    let outcome = batch.commit().expect("commit batch");

    assert_eq!(outcome.written_names, vec![first.clone(), second.clone()]);
    assert_eq!(storage.read_chunk(&first).expect("read first"), b"first");
    assert_eq!(storage.read_chunk(&second).expect("read second"), b"second");
}

#[test]
fn test_chunk_write_batch_temp_write_fault_leaves_no_canonical_chunk() {
    let temp_dir = TempDir::new().expect("temp dir");
    let (storage, _handle) = Storage::fault_injecting_for_tests(
        temp_dir.path(),
        Some(FaultRule {
            operation: StorageOperation::WriteChunkBatchTemp,
            fail_on: 1,
        }),
    )
    .expect("fault storage");
    let name = test_chunk_name(3);

    let mut batch = storage.begin_chunk_write_batch("write-fault");
    batch.write_chunk(name.clone(), b"data").expect("stage");
    let result = batch.commit();

    assert!(matches!(result, Err(Error::StorageIo(_))));
    drop(batch);
    assert!(!storage.chunk_exists(&name).expect("chunk exists"));
    assert_eq!(temp_chunk_file_count(temp_dir.path()), 0);
}

#[test]
fn test_chunk_write_batch_temp_sync_fault_rolls_back_temp() {
    let temp_dir = TempDir::new().expect("temp dir");
    let (storage, _handle) = Storage::fault_injecting_for_tests(
        temp_dir.path(),
        Some(FaultRule {
            operation: StorageOperation::SyncChunkBatchTemp,
            fail_on: 1,
        }),
    )
    .expect("fault storage");
    let name = test_chunk_name(4);

    let mut batch = storage.begin_chunk_write_batch("sync-fault");
    batch.write_chunk(name.clone(), b"data").expect("stage");
    let result = batch.commit();

    assert!(matches!(result, Err(Error::StorageIo(_))));
    drop(batch);
    assert!(!storage.chunk_exists(&name).expect("chunk exists"));
    assert_eq!(temp_chunk_file_count(temp_dir.path()), 0);
}

#[test]
fn test_chunk_write_batch_rename_fault_records_operation() {
    let temp_dir = TempDir::new().expect("temp dir");
    let (storage, handle) = Storage::fault_injecting_for_tests(
        temp_dir.path(),
        Some(FaultRule {
            operation: StorageOperation::RenameChunkBatchTemp,
            fail_on: 1,
        }),
    )
    .expect("fault storage");
    let name = test_chunk_name(5);

    let mut batch = storage.begin_chunk_write_batch("rename-fault");
    batch.write_chunk(name.clone(), b"data").expect("stage");
    let result = batch.commit();

    assert!(matches!(result, Err(Error::StorageIo(_))));
    assert!(handle
        .operations()
        .contains(&StorageOperation::RenameChunkBatchTemp));
    drop(batch);
    assert!(!storage.chunk_exists(&name).expect("chunk exists"));
}

#[test]
fn test_chunk_write_batch_parent_sync_is_observable() {
    let temp_dir = TempDir::new().expect("temp dir");
    let (storage, handle) =
        Storage::fault_injecting_for_tests(temp_dir.path(), None).expect("fault storage");
    let name = test_chunk_name(6);

    let mut batch = storage.begin_chunk_write_batch("parent-sync");
    batch.write_chunk(name, b"data").expect("stage");
    batch.commit().expect("commit");

    assert!(handle
        .operations()
        .contains(&StorageOperation::SyncChunkBatchParent));
}
