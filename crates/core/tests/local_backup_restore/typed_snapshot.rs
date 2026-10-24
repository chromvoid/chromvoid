use super::*;
use chromvoid_core::rpc::LocalBackupSnapshot;
use std::collections::BTreeMap;

pub(super) fn read_artifacts(snapshot: LocalBackupSnapshot) -> BTreeMap<String, Vec<u8>> {
    let mut artifacts = BTreeMap::new();
    for mut stream in snapshot.into_streams() {
        let mut bytes = Vec::new();
        stream
            .reader
            .read_to_end(&mut bytes)
            .expect("read artifact");
        assert_eq!(bytes.len() as u64, stream.meta.size);
        assert!(artifacts.insert(stream.meta.name, bytes).is_none());
    }
    assert_eq!(
        artifacts.keys().map(String::as_str).collect::<Vec<_>>(),
        [
            "chunks.manifest.json",
            "chunks.pack",
            "master.salt",
            "master.verify",
            "metadata.enc"
        ]
    );
    artifacts
}

#[test]
fn typed_snapshot_restores_original_content_after_mutation_and_source_close() {
    let (mut source, _source_dir) = create_router_with_master();
    assert_rpc_ok(&unlock_vault(&mut source, "vault_password"));
    let original = b"original binary content\0\xff".to_vec();
    upload_test_file(&mut source, "original.bin", original.clone());
    assert_rpc_ok(&create_dir(&mut source, "saved-by-backup"));
    source.set_master_key(None);
    let snapshot = source
        .prepare_local_backup(MASTER_PASSWORD.to_string(), &|| false)
        .unwrap_or_else(|error| panic!("prepare: {error:?}"));

    upload_test_file(&mut source, "later.bin", b"not in first snapshot".to_vec());
    // A second preparation cleans stale packs. It must not invalidate the first reader.
    let later = source
        .prepare_local_backup(MASTER_PASSWORD.to_string(), &|| false)
        .unwrap_or_else(|error| panic!("prepare second: {error:?}"));
    drop(later);
    assert_rpc_ok(&lock_vault(&mut source));
    drop(source);
    let mut artifacts = read_artifacts(snapshot);

    let (mut target, _target_dir) = create_router_with_master();
    let backup_dir = TempDir::new().expect("backup dir");
    for (name, bytes) in &artifacts {
        fs::write(backup_dir.path().join(name), bytes).expect("write backup artifact");
    }
    let manifest: serde_json::Value =
        serde_json::from_slice(&artifacts["chunks.manifest.json"]).unwrap();
    // The portable restore route validates source master material, as the shipped client does.
    // Legacy directory-only validation derives against the target's own salt.
    let validate = target.handle(&RpcRequest::new(
        "restore:local:validatePayload",
        serde_json::json!({
            "metadata": general_purpose::STANDARD.encode(&artifacts["metadata.enc"]),
            "master_salt": general_purpose::STANDARD.encode(&artifacts["master.salt"]),
            "master_verify": general_purpose::STANDARD.encode(&artifacts["master.verify"]),
            "manifest": manifest,
        }),
    ));
    assert_rpc_ok(&validate);
    assert_eq!(validate.result().unwrap()["valid"], true);

    let start = target.handle(&RpcRequest::new(
        "restore:local:start",
        serde_json::json!({
            "backup_path": backup_dir.path().to_string_lossy()
        }),
    ));
    assert_rpc_ok(&start);
    let restore_id = start.result().unwrap()["restore_id"].as_str().unwrap();
    match target.handle_with_stream(
        &RpcRequest::new(
            "restore:local:uploadPack",
            serde_json::json!({"restore_id": restore_id, "manifest": manifest}),
        ),
        Some(RpcInputStream::from_bytes(
            artifacts.remove("chunks.pack").unwrap(),
        )),
    ) {
        RpcReply::Json(response) => assert_rpc_ok(&response),
        _ => panic!("restore upload must return JSON"),
    }
    let commit = target.handle(&RpcRequest::new(
        "restore:local:commit",
        serde_json::json!({
            "restore_id": restore_id,
            "metadata": general_purpose::STANDARD.encode(&artifacts["metadata.enc"]),
            "master_salt": general_purpose::STANDARD.encode(&artifacts["master.salt"]),
            "master_verify": general_purpose::STANDARD.encode(&artifacts["master.verify"]),
        }),
    ));
    assert_rpc_ok(&commit);
    assert_rpc_ok(&unlock_vault(&mut target, "vault_password"));
    let items = get_items(&list_dir(&mut target, "/"));
    let mut names = get_item_names(&items);
    names.sort();
    assert_eq!(names, ["original.bin", "saved-by-backup"]);
    let node_id = items
        .iter()
        .find(|item| item["name"] == "original.bin")
        .unwrap()["node_id"]
        .as_u64()
        .unwrap();
    match target.handle_with_stream(
        &RpcRequest::new("catalog:download", serde_json::json!({"node_id": node_id})),
        None,
    ) {
        RpcReply::Stream(mut stream) => {
            let mut bytes = Vec::new();
            stream.reader.read_to_end(&mut bytes).unwrap();
            assert_eq!(bytes, original);
        }
        _ => panic!("expected restored file stream"),
    }
}

#[test]
fn typed_snapshot_requires_each_password_and_restores_prior_administrative_context() {
    let (mut router, _dir) = create_router_with_master();
    assert_rpc_ok(&unlock_vault(&mut router, "vault_password"));
    assert_rpc_ok(&lock_vault(&mut router));
    let denied = router
        .prepare_local_backup("wrong password".to_string(), &|| false)
        .err()
        .expect("denied");
    assert_rpc_error(&denied, "INVALID_MASTER_PASSWORD");
    // Failed transient authorization must not replace the caller's existing context.
    let (id, _, _) = start_backup(&mut router);
    assert_rpc_ok(&router.handle(&RpcRequest::new(
        "backup:local:finish",
        serde_json::json!({"backup_id": id}),
    )));
    router.set_master_key(None);
    read_artifacts(
        router
            .prepare_local_backup(MASTER_PASSWORD.to_string(), &|| false)
            .unwrap_or_else(|error| panic!("prepare locked: {error:?}")),
    );
    let without_password = router.handle(&RpcRequest::new(
        "backup:local:start",
        serde_json::json!({}),
    ));
    assert_rpc_error(&without_password, "EMPTY_PAYLOAD");
}

#[test]
fn cancellation_during_pack_creation_removes_partial_artifacts_and_allows_retry() {
    let (mut router, dir) = create_router_with_master();
    assert_rpc_ok(&unlock_vault(&mut router, "vault_password"));
    upload_test_file(&mut router, "payload.bin", vec![41; 128 * 1024]);
    router.set_master_key(None);
    let temp_dir = dir.path().join(".storage-tmp/backup-local");
    // Cancel when materialization has actually created its temporary pack.
    let cancel = || temp_dir.exists() && fs::read_dir(&temp_dir).unwrap().next().is_some();
    let error = router
        .prepare_local_backup(MASTER_PASSWORD.to_string(), &cancel)
        .err()
        .expect("canceled");
    assert_rpc_error(&error, "CANCELLED");
    assert_eq!(fs::read_dir(&temp_dir).unwrap().count(), 0);
    assert_rpc_error(
        &router.handle(&RpcRequest::new(
            "backup:local:start",
            serde_json::json!({}),
        )),
        "EMPTY_PAYLOAD",
    );
    read_artifacts(
        router
            .prepare_local_backup(MASTER_PASSWORD.to_string(), &|| false)
            .unwrap_or_else(|error| panic!("retry: {error:?}")),
    );
}
