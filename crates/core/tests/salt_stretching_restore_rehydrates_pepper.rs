//! SPEC-100 / ADR-010 / ADR-012: restore must rehydrate portable pepper.
//!
//! Contract-level test: create a v2 local backup (metadata.enc includes storage_pepper_wrapped),
//! then restore into a fresh storage and verify the vault unlocks and data is present.
//!
//! This is expected to fail until restore:local:uploadChunk + restore:local:commit are implemented.

mod test_helpers;

use base64::{engine::general_purpose, Engine as _};
use chromvoid_core::crypto::keystore::InMemoryKeystore;
use chromvoid_core::crypto::{decrypt, derive_vault_key, encrypt, hash};
use chromvoid_core::rpc::types::RpcRequest;
use chromvoid_core::rpc::RpcRouter;
use chromvoid_core::rpc::{RpcInputStream, RpcReply};
use chromvoid_core::storage::Storage;
use std::fs;
use std::sync::Arc;
use tempfile::TempDir;
use test_helpers::*;

const MASTER_PASSWORD: &str = "correct horse battery staple";

fn create_router_with_master() -> (RpcRouter, TempDir) {
    enable_fast_kdf_for_tests();

    let temp_dir = TempDir::new().expect("temp dir");
    let storage = Storage::new(temp_dir.path()).expect("storage");
    let keystore = Arc::new(InMemoryKeystore::new());
    let mut router = RpcRouter::new(storage)
        .with_master_key(MASTER_PASSWORD)
        .with_keystore(keystore);

    let setup = router.handle(&RpcRequest::new(
        "master:setup",
        serde_json::json!({"master_password": MASTER_PASSWORD}),
    ));
    assert_rpc_ok(&setup);

    (router, temp_dir)
}

fn derive_backup_key_v2(base_path: &std::path::Path, master_password: &str) -> [u8; 32] {
    let master_salt_bytes = fs::read(base_path.join("master.salt")).expect("read master.salt");
    let master_salt: [u8; 16] = master_salt_bytes
        .as_slice()
        .try_into()
        .expect("master.salt 16 bytes");
    let master_key_derived =
        derive_vault_key(master_password, &master_salt).expect("derive master key");

    let mut buf = Vec::with_capacity(master_key_derived.len() + "local-backup-v2".len());
    buf.extend_from_slice(&*master_key_derived);
    buf.extend_from_slice(b"local-backup-v2");
    hash(&buf)
}

#[test]
fn test_restore_local_rehydrates_pepper_and_allows_unlock() {
    // Source storage
    let (mut router1, d1) = create_router_with_master();
    unlock_vault(&mut router1, "vault_password");

    // Create some content so the backup has non-empty chunks.
    assert_rpc_ok(&create_dir(&mut router1, "seed"));
    router1.save().expect("save");
    let data = b"hello portable pepper".to_vec();
    let prep = router1.handle(&RpcRequest::new(
        "catalog:prepareUpload",
        serde_json::json!({
            "name": "pepper.txt",
            "size": data.len() as u64,
            "mime_type": "text/plain",
        }),
    ));
    assert_rpc_ok(&prep);
    let node_id = get_node_id(&prep);
    let upload_req = RpcRequest::new(
        "catalog:upload",
        serde_json::json!({"node_id": node_id, "size": data.len(), "offset": 0}),
    );
    match router1.handle_with_stream(&upload_req, Some(RpcInputStream::from_bytes(data))) {
        RpcReply::Json(r) => assert_rpc_ok(&r),
        RpcReply::Stream(_) => panic!("catalog:upload must return JSON response"),
    }

    // Create local backup and collect chunks + metadata.
    let start = router1.handle(&RpcRequest::new(
        "backup:local:start",
        serde_json::json!({}),
    ));
    assert_rpc_ok(&start);
    let start_result = start.result().unwrap();
    let backup_id = start_result
        .get("backup_id")
        .and_then(|v| v.as_str())
        .expect("backup_id")
        .to_string();
    let chunk_count = start_result
        .get("chunk_count")
        .and_then(|v| v.as_u64())
        .expect("chunk_count");
    assert!(
        chunk_count > 0,
        "expected at least one storage chunk in backup"
    );

    let mut chunks: Vec<(String, String)> = Vec::new();
    for i in 0..chunk_count {
        let c = router1.handle(&RpcRequest::new(
            "backup:local:downloadChunk",
            serde_json::json!({"backup_id": backup_id.as_str(), "chunk_index": i}),
        ));
        assert_rpc_ok(&c);
        let r = c.result().unwrap();
        let chunk_name = r
            .get("chunk_name")
            .and_then(|v| v.as_str())
            .expect("chunk_name")
            .to_string();
        let data_b64 = r
            .get("data")
            .and_then(|v| v.as_str())
            .expect("data")
            .to_string();
        chunks.push((chunk_name, data_b64));
    }

    let meta = router1.handle(&RpcRequest::new(
        "backup:local:getMetadata",
        serde_json::json!({"backup_id": backup_id.as_str()}),
    ));
    assert_rpc_ok(&meta);
    let meta_result = meta.result().unwrap();
    let meta_b64 = meta_result
        .get("metadata")
        .and_then(|v| v.as_str())
        .expect("metadata")
        .to_string();
    let master_salt_b64 = meta_result
        .get("master_salt")
        .and_then(|v| v.as_str())
        .expect("master_salt")
        .to_string();
    let master_verify_b64 = meta_result
        .get("master_verify")
        .and_then(|v| v.as_str())
        .expect("master_verify")
        .to_string();

    // Verify metadata.enc contains storage_pepper_wrapped (v2 format).
    let backup_key = derive_backup_key_v2(d1.path(), MASTER_PASSWORD);
    let meta_enc = general_purpose::STANDARD
        .decode(&meta_b64)
        .expect("metadata must be base64");
    let meta_plain =
        decrypt(&meta_enc, &backup_key, b"metadata.enc:v2").expect("metadata.enc must decrypt");
    let meta_json: serde_json::Value =
        serde_json::from_slice(&meta_plain).expect("metadata plaintext JSON");
    assert!(
        meta_json.get("storage_pepper_wrapped").is_some(),
        "metadata must include storage_pepper_wrapped"
    );

    // Target storage
    let (mut router2, _d2) = create_router_with_master();
    // Restore flow should rehydrate pepper from metadata.enc and allow unlock with the vault password.

    let backup_dir = TempDir::new().expect("backup dir");
    let rstart = router2.handle(&RpcRequest::new(
        "restore:local:start",
        serde_json::json!({"backup_path": backup_dir.path().to_string_lossy()}),
    ));
    assert_rpc_ok(&rstart);
    let restore_id = rstart
        .result()
        .unwrap()
        .get("restore_id")
        .and_then(|v| v.as_str())
        .expect("restore_id")
        .to_string();

    for (i, (chunk_name, data_b64)) in chunks.iter().enumerate() {
        let upload = router2.handle(&RpcRequest::new(
            "restore:local:uploadChunk",
            serde_json::json!({
                "restore_id": restore_id.as_str(),
                "chunk_index": i as u64,
                "chunk_name": chunk_name,
                "data": data_b64,
                "is_last": i + 1 == chunks.len(),
            }),
        ));
        assert_rpc_ok(&upload);
    }

    let commit = router2.handle(&RpcRequest::new(
        "restore:local:commit",
        serde_json::json!({
            "restore_id": restore_id.as_str(),
            "metadata": meta_b64,
            "master_salt": master_salt_b64,
            "master_verify": master_verify_b64,
        }),
    ));
    assert_rpc_ok(&commit);

    // Unlock and verify content is present.
    unlock_vault(&mut router2, "vault_password");
    let items = get_items(&list_dir(&mut router2, "/"));
    let names = get_item_names(&items);
    assert!(names.contains(&"seed".to_string()));
}

#[test]
fn test_restore_local_commit_rejects_metadata_missing_storage_pepper() {
    let (mut router1, d1) = create_router_with_master();
    unlock_vault(&mut router1, "vault_password");

    // Ensure backup has non-empty chunks.
    assert_rpc_ok(&create_dir(&mut router1, "seed"));

    let start = router1.handle(&RpcRequest::new(
        "backup:local:start",
        serde_json::json!({}),
    ));
    assert_rpc_ok(&start);
    let backup_id = start
        .result()
        .unwrap()
        .get("backup_id")
        .and_then(|v| v.as_str())
        .expect("backup_id")
        .to_string();

    let meta = router1.handle(&RpcRequest::new(
        "backup:local:getMetadata",
        serde_json::json!({"backup_id": backup_id.as_str()}),
    ));
    assert_rpc_ok(&meta);
    let meta_result = meta.result().unwrap();
    let meta_b64 = meta_result
        .get("metadata")
        .and_then(|v| v.as_str())
        .expect("metadata")
        .to_string();
    let master_salt_b64 = meta_result
        .get("master_salt")
        .and_then(|v| v.as_str())
        .expect("master_salt")
        .to_string();
    let master_verify_b64 = meta_result
        .get("master_verify")
        .and_then(|v| v.as_str())
        .expect("master_verify")
        .to_string();

    let backup_key = derive_backup_key_v2(d1.path(), MASTER_PASSWORD);
    let meta_enc = general_purpose::STANDARD
        .decode(&meta_b64)
        .expect("metadata must be base64");
    let meta_plain =
        decrypt(&meta_enc, &backup_key, b"metadata.enc:v2").expect("metadata.enc must decrypt");
    let mut meta_json: serde_json::Value =
        serde_json::from_slice(&meta_plain).expect("metadata plaintext JSON");

    // Remove storage_pepper_wrapped to simulate a non-portable / incompatible metadata.
    if let Some(obj) = meta_json.as_object_mut() {
        obj.remove("storage_pepper_wrapped");
        // Ensure commit reaches the pepper check (otherwise it fails earlier on missing chunks).
        obj.insert("chunk_count".to_string(), serde_json::json!(0));
    }

    let re_plain = serde_json::to_vec(&meta_json).expect("serialize metadata JSON");
    let re_enc = encrypt(&re_plain, &backup_key, b"metadata.enc:v2").expect("re-encrypt metadata");
    let re_b64 = general_purpose::STANDARD.encode(re_enc);

    let (mut router2, _d2) = create_router_with_master();
    let backup_dir = TempDir::new().expect("backup dir");
    let rstart = router2.handle(&RpcRequest::new(
        "restore:local:start",
        serde_json::json!({"backup_path": backup_dir.path().to_string_lossy()}),
    ));
    assert_rpc_ok(&rstart);
    let restore_id = rstart
        .result()
        .unwrap()
        .get("restore_id")
        .and_then(|v| v.as_str())
        .expect("restore_id")
        .to_string();

    let commit = router2.handle(&RpcRequest::new(
        "restore:local:commit",
        serde_json::json!({
            "restore_id": restore_id.as_str(),
            "metadata": re_b64,
            "master_salt": master_salt_b64,
            "master_verify": master_verify_b64,
        }),
    ));

    assert!(
        !commit.is_ok(),
        "restore:local:commit must reject metadata missing storage_pepper_wrapped (v2)"
    );
    assert!(
        commit.code().is_some(),
        "restore:local:commit must be typed"
    );
}
