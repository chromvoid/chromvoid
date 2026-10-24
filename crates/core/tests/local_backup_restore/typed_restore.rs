use super::*;
use chromvoid_core::rpc::{LocalRestoreArtifact, LocalRestoreInput, MAX_RESTORE_APPEND_BYTES};
use serde_json::json;
use std::collections::BTreeMap;
use std::path::{Path, PathBuf};

const CONTENT: &[u8] = b"reviewed restore binary content\0\xff";

fn backup_bytes() -> BTreeMap<String, Vec<u8>> {
    let (mut source, _source_dir) = create_router_with_master();
    assert_rpc_ok(&unlock_vault(&mut source, "vault_password"));
    upload_test_file(&mut source, "original.bin", CONTENT.to_vec());
    let snapshot = source
        .prepare_local_backup(MASTER_PASSWORD.to_string(), &|| false)
        .unwrap();
    typed_snapshot::read_artifacts(snapshot)
}

fn input(bytes: &BTreeMap<String, Vec<u8>>) -> LocalRestoreInput {
    let mut input = LocalRestoreInput::new().unwrap();
    for artifact in LocalRestoreArtifact::ALL {
        if let Some(bytes) = bytes.get(artifact.name()) {
            input.append(artifact, &[]).unwrap();
            for chunk in bytes.chunks(MAX_RESTORE_APPEND_BYTES) {
                input.append(artifact, chunk).unwrap();
            }
        }
    }
    input
}

fn files(root: &Path) -> BTreeMap<PathBuf, Vec<u8>> {
    fn visit(root: &Path, directory: &Path, output: &mut BTreeMap<PathBuf, Vec<u8>>) {
        for entry in fs::read_dir(directory).unwrap() {
            let path = entry.unwrap().path();
            if path.is_dir() {
                visit(root, &path, output);
            } else {
                output.insert(
                    path.strip_prefix(root).unwrap().to_path_buf(),
                    fs::read(path).unwrap(),
                );
            }
        }
    }
    let mut output = BTreeMap::new();
    visit(root, root, &mut output);
    output
}

#[test]
fn typed_restore_review_is_read_only_and_consumed_commit_restores_exact_bytes() {
    let mut bytes = backup_bytes();
    let (mut target, target_dir) = create_router_with_master();
    target.set_master_key(None);
    let before = files(target_dir.path());
    let prepared = target
        .prepare_local_restore(input(&bytes), MASTER_PASSWORD.to_string(), &|| false)
        .unwrap();
    assert_eq!(files(target_dir.path()), before);
    assert!(prepared.preview().chunk_count > 0);
    assert_eq!(
        prepared.preview().byte_count,
        bytes["chunks.pack"].len() as u64
    );
    assert_eq!(prepared.preview().version, 2);
    bytes.get_mut("chunks.pack").unwrap().fill(0);
    let count = prepared.preview().chunk_count;
    let result = target.commit_local_restore(prepared, &|| false).unwrap();
    assert_eq!(result["restored_chunks"], count);
    assert_rpc_error(
        &target.handle(&RpcRequest::new("backup:local:start", json!({}))),
        "EMPTY_PAYLOAD",
    );
    assert_rpc_ok(&unlock_vault(&mut target, "vault_password"));
    let items = get_items(&list_dir(&mut target, "/"));
    assert_eq!(get_item_names(&items), ["original.bin"]);
    let id = items[0]["node_id"].as_u64().unwrap();
    match target.handle_with_stream(
        &RpcRequest::new("catalog:download", json!({"node_id": id})),
        None,
    ) {
        RpcReply::Stream(mut stream) => {
            let mut actual = Vec::new();
            stream.reader.read_to_end(&mut actual).unwrap();
            assert_eq!(actual, CONTENT);
        }
        _ => panic!("expected restored file"),
    }
}

#[test]
fn typed_restore_wrong_password_missing_material_and_bad_pack_never_write_target() {
    let original = backup_bytes();
    let (mut target, dir) = create_router_with_master();
    let before = files(dir.path());
    for case in ["password", "salt", "truncated", "extra", "manifest"] {
        let mut bytes = original.clone();
        match case {
            "salt" => {
                bytes.get_mut("master.salt").unwrap().clear();
            }
            "truncated" => {
                bytes.get_mut("chunks.pack").unwrap().pop();
            }
            "extra" => bytes.get_mut("chunks.pack").unwrap().push(0),
            "manifest" => {
                bytes.insert("chunks.manifest.json".to_string(), b"{}".to_vec());
            }
            _ => {}
        }
        let password = if case == "password" {
            "incorrect"
        } else {
            MASTER_PASSWORD
        };
        let error = target
            .prepare_local_restore(input(&bytes), password.to_string(), &|| false)
            .err()
            .expect("invalid source must not produce a review");
        assert_rpc_error(&error, "INVALID_BACKUP");
        assert_eq!(files(dir.path()), before, "{case}");
    }
    let response = target.handle(&RpcRequest::new(
        "restore:local:validateMasterMaterial",
        json!({
            "master_salt": general_purpose::STANDARD.encode(&original["master.salt"]),
            "master_verify": general_purpose::STANDARD.encode(&original["master.verify"]),
        }),
    ));
    assert_eq!(response.result().unwrap()["valid"], true);
    let prepared = target
        .prepare_local_restore(input(&original), MASTER_PASSWORD.to_string(), &|| false)
        .unwrap();
    drop(prepared);
    assert_eq!(files(dir.path()), before);
}

#[test]
fn typed_restore_commit_rechecks_blank_target_without_erasing_new_content() {
    let bytes = backup_bytes();
    let (mut target, dir) = create_router_with_master();
    let prepared = target
        .prepare_local_restore(input(&bytes), MASTER_PASSWORD.to_string(), &|| false)
        .unwrap();
    assert_rpc_ok(&unlock_vault(&mut target, "target_password"));
    upload_test_file(&mut target, "keep.bin", b"existing target".to_vec());
    let before = files(dir.path());
    let error = target
        .commit_local_restore(prepared, &|| false)
        .unwrap_err();
    assert_rpc_error(&error, "STORAGE_NOT_BLANK");
    assert_eq!(files(dir.path()), before);
    assert_eq!(
        get_item_names(&get_items(&list_dir(&mut target, "/"))),
        ["keep.bin"]
    );
}

#[test]
fn typed_restore_cancellation_after_pack_publication_preserves_administrator_setup_and_retries() {
    let bytes = backup_bytes();
    let (mut target, dir) = create_router_with_master();
    let keystore = Arc::new(InMemoryKeystore::new());
    chromvoid_core::crypto::StoragePepper::store(keystore.as_ref(), [9; 32]).unwrap();
    target = target.with_keystore(keystore.clone());
    let before = files(dir.path());
    let prepared = target
        .prepare_local_restore(input(&bytes), MASTER_PASSWORD.to_string(), &|| false)
        .unwrap();
    let observer = Storage::new(dir.path()).unwrap();
    let cancelled = || !observer.list_chunks().unwrap().is_empty();
    let error = target
        .commit_local_restore(prepared, &cancelled)
        .unwrap_err();
    assert_rpc_error(&error, "CANCELLED");
    assert_eq!(files(dir.path()), before);
    assert_eq!(
        chromvoid_core::crypto::StoragePepper::load(keystore.as_ref()).unwrap(),
        Some([9; 32])
    );
    let retry = target
        .prepare_local_restore(input(&bytes), MASTER_PASSWORD.to_string(), &|| false)
        .unwrap();
    target.commit_local_restore(retry, &|| false).unwrap();
    assert_rpc_ok(&unlock_vault(&mut target, "vault_password"));
    assert_eq!(
        get_item_names(&get_items(&list_dir(&mut target, "/"))),
        ["original.bin"]
    );
}

#[test]
fn typed_restore_cancellation_before_review_or_commit_leaves_target_unchanged() {
    let bytes = backup_bytes();
    let (mut target, dir) = create_router_with_master();
    let before = files(dir.path());
    let error = target
        .prepare_local_restore(input(&bytes), MASTER_PASSWORD.to_string(), &|| true)
        .err()
        .expect("canceled review");
    assert_rpc_error(&error, "CANCELLED");
    assert_eq!(files(dir.path()), before);
    let prepared = target
        .prepare_local_restore(input(&bytes), MASTER_PASSWORD.to_string(), &|| false)
        .unwrap();
    assert_rpc_error(
        &target.commit_local_restore(prepared, &|| true).unwrap_err(),
        "CANCELLED",
    );
    assert_eq!(files(dir.path()), before);
}

#[test]
fn typed_restore_cleanup_failure_allows_recovery_and_retry_on_the_same_router() {
    use chromvoid_core::storage::test_util::{
        fault_injecting_storage, FaultRule, StorageOperation,
    };

    let bytes = backup_bytes();
    let (target, dir) = create_router_with_master();
    drop(target);
    let before = files(dir.path());
    let (storage, faults) = fault_injecting_storage(
        dir.path(),
        Some(FaultRule {
            operation: StorageOperation::DeleteChunk,
            fail_on: 1,
        }),
    )
    .unwrap();
    let mut target = RpcRouter::new(storage).with_keystore(Arc::new(InMemoryKeystore::new()));
    let prepared = target
        .prepare_local_restore(input(&bytes), MASTER_PASSWORD.to_string(), &|| false)
        .unwrap();
    let observer = Storage::new(dir.path()).unwrap();
    let error = target
        .commit_local_restore(prepared, &|| !observer.list_chunks().unwrap().is_empty())
        .unwrap_err();
    assert_rpc_error(&error, "INTERNAL_ERROR");
    assert!(faults.operations().contains(&StorageOperation::DeleteChunk));
    assert!(!observer.list_chunks().unwrap().is_empty());

    // The one-shot IO fault has passed; retry must recover without reopening the router.
    let retry = target
        .prepare_local_restore(input(&bytes), MASTER_PASSWORD.to_string(), &|| false)
        .unwrap();
    assert_eq!(files(dir.path()), before);
    target.commit_local_restore(retry, &|| false).unwrap();
    assert_rpc_ok(&unlock_vault(&mut target, "vault_password"));
    assert_eq!(
        get_item_names(&get_items(&list_dir(&mut target, "/"))),
        ["original.bin"]
    );
}

#[test]
fn typed_restore_ingress_rejects_oversized_chunks_and_fixed_material() {
    let mut input = LocalRestoreInput::new().unwrap();
    assert_rpc_error(
        &input
            .append(
                LocalRestoreArtifact::Pack,
                &vec![0; MAX_RESTORE_APPEND_BYTES + 1],
            )
            .unwrap_err(),
        "INVALID_BACKUP",
    );
    assert_rpc_error(
        &input
            .append(LocalRestoreArtifact::MasterSalt, &[0; 17])
            .unwrap_err(),
        "INVALID_BACKUP",
    );
    assert_rpc_error(
        &input
            .append(LocalRestoreArtifact::MasterVerify, &[0; 33])
            .unwrap_err(),
        "INVALID_BACKUP",
    );
}

#[test]
fn typed_restore_rejects_live_restore_and_recovers_interrupted_staging_before_review() {
    let bytes = backup_bytes();
    let (mut target, dir) = create_router_with_master();
    let keystore = Arc::new(InMemoryKeystore::new());
    target = target.with_keystore(keystore.clone());
    let before = files(dir.path());
    let start = target.handle(&RpcRequest::new(
        "restore:local:start",
        json!({"backup_path": "test-source"}),
    ));
    let id = start.result().unwrap()["restore_id"].as_str().unwrap();
    let manifest: serde_json::Value =
        serde_json::from_slice(&bytes["chunks.manifest.json"]).unwrap();
    match target.handle_with_stream(
        &RpcRequest::new(
            "restore:local:uploadPack",
            json!({"restore_id": id, "manifest": manifest}),
        ),
        Some(RpcInputStream::from_bytes(bytes["chunks.pack"].clone())),
    ) {
        RpcReply::Json(response) => assert_rpc_ok(&response),
        _ => panic!("expected uploaded pack"),
    }
    let in_progress = files(dir.path());
    let error = target
        .prepare_local_restore(input(&bytes), MASTER_PASSWORD.to_string(), &|| false)
        .err()
        .expect("cannot replace another live restore");
    assert_rpc_error(&error, "BACKUP_ALREADY_IN_PROGRESS");
    assert_eq!(files(dir.path()), in_progress);
    drop(target);
    let mut reopened = RpcRouter::new(Storage::new(dir.path()).unwrap()).with_keystore(keystore);
    let prepared = reopened
        .prepare_local_restore(input(&bytes), MASTER_PASSWORD.to_string(), &|| false)
        .unwrap();
    assert_eq!(files(dir.path()), before);
    reopened.commit_local_restore(prepared, &|| false).unwrap();
    assert_rpc_ok(&unlock_vault(&mut reopened, "vault_password"));
    assert_eq!(
        get_item_names(&get_items(&list_dir(&mut reopened, "/"))),
        ["original.bin"]
    );
}

#[test]
fn typed_legacy_restore_uses_existing_material_without_accepting_empty_source_material() {
    enable_fast_kdf_for_tests();
    let root = TempDir::new().unwrap();
    let storage = Storage::new(root.path()).unwrap();
    let keystore = Arc::new(InMemoryKeystore::new());
    let mut source = RpcRouter::new(storage.clone())
        .with_master_key(MASTER_PASSWORD)
        .with_keystore(keystore.clone());
    assert_rpc_ok(&source.handle(&RpcRequest::new(
        "master:setup",
        json!({"master_password": MASTER_PASSWORD}),
    )));
    assert_rpc_ok(&unlock_vault(&mut source, "vault_password"));
    upload_test_file(&mut source, "legacy.bin", CONTENT.to_vec());
    let snapshot = source
        .prepare_local_backup(MASTER_PASSWORD.to_string(), &|| false)
        .unwrap();
    let mut bytes = typed_snapshot::read_artifacts(snapshot);
    let source_salt = bytes.remove("master.salt").unwrap();
    let source_verify = bytes.remove("master.verify").unwrap();
    assert_rpc_ok(&lock_vault(&mut source));
    drop(source);
    // Model data loss in this disposable installation, retaining its original administrator
    // material in place. No material is copied to another installation.
    for name in storage.list_chunks().unwrap() {
        storage.delete_chunk(&name).unwrap();
    }
    fs::remove_file(root.path().join("salt")).unwrap();
    let mut target = RpcRouter::new(storage).with_keystore(keystore);
    let before = files(root.path());
    for (salt, verify) in [
        (Some(Vec::new()), Some(source_verify.clone())),
        (Some(source_salt.clone()), Some(Vec::new())),
        (Some(Vec::new()), Some(Vec::new())),
        (Some(source_salt), None),
        (None, Some(source_verify)),
    ] {
        let mut corrupt = bytes.clone();
        if let Some(salt) = salt {
            corrupt.insert("master.salt".to_string(), salt);
        }
        if let Some(verify) = verify {
            corrupt.insert("master.verify".to_string(), verify);
        }
        let error = target
            .prepare_local_restore(input(&corrupt), MASTER_PASSWORD.to_string(), &|| false)
            .err()
            .expect("present invalid material must not trigger legacy fallback");
        assert_rpc_error(&error, "INVALID_BACKUP");
        assert_eq!(files(root.path()), before);
    }
    let (mut incompatible, incompatible_dir) = create_router_with_master();
    let incompatible_before = files(incompatible_dir.path());
    let error = incompatible
        .prepare_local_restore(input(&bytes), MASTER_PASSWORD.to_string(), &|| false)
        .err()
        .expect("legacy backup requires its original installation material");
    assert_rpc_error(&error, "INVALID_BACKUP");
    assert_eq!(files(incompatible_dir.path()), incompatible_before);
    let prepared = target
        .prepare_local_restore(input(&bytes), MASTER_PASSWORD.to_string(), &|| false)
        .expect("legacy backup must use surviving local master material");
    assert_eq!(files(root.path()), before);
    target.commit_local_restore(prepared, &|| false).unwrap();
    assert_rpc_ok(&unlock_vault(&mut target, "vault_password"));
    let items = get_items(&list_dir(&mut target, "/"));
    assert_eq!(get_item_names(&items), ["legacy.bin"]);
    let id = items[0]["node_id"].as_u64().unwrap();
    match target.handle_with_stream(
        &RpcRequest::new("catalog:download", json!({"node_id":id})),
        None,
    ) {
        RpcReply::Stream(mut stream) => {
            let mut restored = Vec::new();
            stream.reader.read_to_end(&mut restored).unwrap();
            assert_eq!(restored, CONTENT);
        }
        _ => panic!("expected restored legacy file"),
    }
}
