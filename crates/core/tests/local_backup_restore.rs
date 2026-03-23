//! ADR-012 Local Backup/Restore (target contract)

mod test_helpers;

use base64::{engine::general_purpose, Engine as _};
use chromvoid_core::crypto::keystore::InMemoryKeystore;
use chromvoid_core::crypto::{decrypt, derive_vault_key, hash};
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
    create_router_with_master_and_backup_limit(None)
}

fn create_router_with_master_and_backup_limit(
    backup_max_size: Option<u64>,
) -> (RpcRouter, TempDir) {
    enable_fast_kdf_for_tests();

    let temp_dir = TempDir::new().expect("failed to create temp dir");
    let storage = Storage::new(temp_dir.path()).expect("failed to create storage");
    // Backup/restore flows require master_password to be available on the server side.
    // In production this is provided by the embedding app (e.g. remote daemon).
    let keystore = Arc::new(InMemoryKeystore::new());
    let mut router = RpcRouter::new(storage)
        .with_master_key(MASTER_PASSWORD)
        .with_keystore(keystore);

    if let Some(max) = backup_max_size {
        router = router.with_backup_local_max_size(max);
    }

    let setup = router.handle(&RpcRequest::new(
        "master:setup",
        serde_json::json!({"master_password": MASTER_PASSWORD}),
    ));
    assert_rpc_ok(&setup);

    (router, temp_dir)
}

fn derive_backup_key_v2(base_path: &std::path::Path, master_password: &str) -> [u8; 32] {
    // ADR-012 Appendix A: backup_key = BLAKE3(master_key_derived || "local-backup-v2")[:32]
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
fn test_backup_local_start_download_metadata_finish_contract() {
    let (mut router, temp_dir) = create_router_with_master();
    unlock_vault(&mut router, "vault_password");

    // Start
    let start = router.handle(&RpcRequest::new(
        "backup:local:start",
        serde_json::json!({}),
    ));
    assert_rpc_ok(&start);

    let start_result = start.result().unwrap();
    let backup_id = start_result
        .get("backup_id")
        .expect("backup_id")
        .as_str()
        .expect("backup_id string")
        .to_string();
    let chunk_count = start_result
        .get("chunk_count")
        .expect("chunk_count")
        .as_u64()
        .expect("chunk_count u64");

    assert!(
        start_result.get("estimated_size").is_some(),
        "ADR-012: backup:local:start must return estimated_size"
    );

    // Download chunks
    for i in 0..chunk_count {
        let chunk = router.handle(&RpcRequest::new(
            "backup:local:downloadChunk",
            serde_json::json!({"backup_id": backup_id.clone(), "chunk_index": i}),
        ));
        assert_rpc_ok(&chunk);

        let r = chunk.result().unwrap();
        let name = r
            .get("chunk_name")
            .expect("chunk_name")
            .as_str()
            .expect("chunk_name string");
        assert_eq!(name.len(), 64);
        assert!(name.chars().all(|c| c.is_ascii_hexdigit()));

        let chunk_index = r
            .get("chunk_index")
            .expect("chunk_index")
            .as_u64()
            .expect("chunk_index u64");
        assert_eq!(chunk_index, i);

        let data_b64 = r.get("data").expect("data").as_str().expect("data string");
        let decoded = general_purpose::STANDARD
            .decode(data_b64)
            .expect("data must be base64");
        assert!(!decoded.is_empty() || chunk_count == 0);

        let is_last = r
            .get("is_last")
            .expect("is_last")
            .as_bool()
            .expect("is_last bool");
        assert_eq!(is_last, i + 1 == chunk_count);
    }

    // Metadata
    let meta = router.handle(&RpcRequest::new(
        "backup:local:getMetadata",
        serde_json::json!({"backup_id": backup_id.clone()}),
    ));
    assert_rpc_ok(&meta);

    let meta_b64 = meta
        .result()
        .unwrap()
        .get("metadata")
        .expect("metadata")
        .as_str()
        .expect("metadata base64");
    let meta_bytes = general_purpose::STANDARD
        .decode(meta_b64)
        .expect("metadata must be base64");
    assert!(
        meta_bytes.len() >= 28,
        "metadata.enc must be nonce||ciphertext||tag"
    );

    // ADR-012 Appendix A: decrypt metadata.enc with backup_key + AAD
    let backup_key = derive_backup_key_v2(temp_dir.path(), MASTER_PASSWORD);
    let metadata_plain = decrypt(&meta_bytes, &backup_key, b"metadata.enc:v2")
        .expect("metadata.enc must decrypt with AAD=metadata.enc:v2");
    let meta_json: serde_json::Value =
        serde_json::from_slice(&metadata_plain).expect("metadata plaintext must be JSON");

    assert_eq!(
        meta_json.get("v").and_then(|v| v.as_u64()),
        Some(2),
        "ADR-012: metadata v=2"
    );
    assert_eq!(
        meta_json.get("backup_type").and_then(|v| v.as_str()),
        Some("local"),
        "ADR-012: backup_type=local"
    );

    let vault_salt_b64 = meta_json
        .get("vault_salt")
        .expect("vault_salt")
        .as_str()
        .expect("vault_salt base64");
    let vault_salt = general_purpose::STANDARD
        .decode(vault_salt_b64)
        .expect("vault_salt must be base64 (RFC 4648, padded)");
    assert_eq!(vault_salt.len(), 16, "vault_salt must be 16 bytes");

    assert_eq!(
        meta_json.get("chunk_count").and_then(|v| v.as_u64()),
        Some(chunk_count),
        "ADR-012: metadata chunk_count must match start response"
    );
    assert!(meta_json
        .get("created_at")
        .and_then(|v| v.as_u64())
        .is_some());
    assert!(meta_json
        .get("total_size")
        .and_then(|v| v.as_u64())
        .is_some());

    // ADR-012 Appendix A.2: unwrap storage pepper
    let pepper_wrapped_b64 = meta_json
        .get("storage_pepper_wrapped")
        .expect("storage_pepper_wrapped")
        .as_str()
        .expect("storage_pepper_wrapped base64");
    let pepper_wrapped = general_purpose::STANDARD
        .decode(pepper_wrapped_b64)
        .expect("storage_pepper_wrapped must be base64 (RFC 4648, padded)");
    assert_eq!(
        pepper_wrapped.len(),
        12 + 32 + 16,
        "storage_pepper_wrapped must be nonce(12)||ciphertext(32)||tag(16)"
    );

    let pepper_plain = decrypt(&pepper_wrapped, &backup_key, b"storage_pepper:v1")
        .expect("storage_pepper_wrapped must decrypt with AAD=storage_pepper:v1");
    assert_eq!(pepper_plain.len(), 32, "storage_pepper must be 32 bytes");

    // Finish
    let finish = router.handle(&RpcRequest::new(
        "backup:local:finish",
        serde_json::json!({"backup_id": backup_id}),
    ));
    assert_rpc_ok(&finish);
    let finish_result = finish.result().unwrap();
    assert!(finish_result.get("backup_id").is_some());
    assert!(finish_result.get("created_at").is_some());
}

#[test]
fn test_backup_local_start_rejects_backup_too_large() {
    let (mut router, _temp_dir) = create_router_with_master_and_backup_limit(Some(1));
    unlock_vault(&mut router, "vault_password");

    // Ensure there is at least one persisted chunk so size > 1 byte.
    assert_rpc_ok(&create_dir(&mut router, "seed"));
    router.save().expect("save");

    let start = router.handle(&RpcRequest::new(
        "backup:local:start",
        serde_json::json!({}),
    ));
    assert_rpc_error(&start, "BACKUP_TOO_LARGE");
}

#[test]
fn test_backup_local_start_rejects_concurrent_start() {
    let (mut router, _temp_dir) = create_router_with_master();
    unlock_vault(&mut router, "vault_password");

    let start1 = router.handle(&RpcRequest::new(
        "backup:local:start",
        serde_json::json!({}),
    ));
    assert_rpc_ok(&start1);

    let start2 = router.handle(&RpcRequest::new(
        "backup:local:start",
        serde_json::json!({}),
    ));
    assert_rpc_error(&start2, "BACKUP_ALREADY_IN_PROGRESS");
}

#[test]
fn test_restore_local_validate_contract() {
    let (mut router, _temp_dir) = create_router_with_master();

    let backup_dir = TempDir::new().expect("backup dir");
    let response = router.handle(&RpcRequest::new(
        "restore:local:validate",
        serde_json::json!({"backup_path": backup_dir.path().to_string_lossy()}),
    ));

    // ADR-012: validate should be a typed response (not a panic / unknown command).
    assert!(response.is_ok());
    let result = response.result().unwrap();
    assert!(result.get("valid").is_some());
    assert!(result.get("version").is_some());
    assert!(result.get("chunk_count").is_some());
    assert!(result.get("warnings").is_some());
}

#[test]
fn test_restore_local_validate_accepts_well_formed_backup_folder() {
    let (mut router, _temp_dir) = create_router_with_master();
    unlock_vault(&mut router, "vault_password");

    // Ensure there is at least one persisted chunk.
    assert_rpc_ok(&create_dir(&mut router, "seed"));
    router.save().expect("save");

    let start = router.handle(&RpcRequest::new(
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

    let backup_dir = TempDir::new().expect("backup dir");
    let chunks_root = backup_dir.path().join("chunks");
    fs::create_dir_all(&chunks_root).expect("mkdir chunks");

    for i in 0..chunk_count {
        let chunk = router.handle(&RpcRequest::new(
            "backup:local:downloadChunk",
            serde_json::json!({"backup_id": backup_id.clone(), "chunk_index": i}),
        ));
        assert_rpc_ok(&chunk);
        let r = chunk.result().unwrap();
        let chunk_name = r
            .get("chunk_name")
            .and_then(|v| v.as_str())
            .expect("chunk_name");
        let data_b64 = r.get("data").and_then(|v| v.as_str()).expect("data");
        let bytes = general_purpose::STANDARD
            .decode(data_b64)
            .expect("chunk data must be base64");

        let subdir = chunks_root.join(&chunk_name[0..1]).join(&chunk_name[1..3]);
        fs::create_dir_all(&subdir).expect("mkdir chunk subdir");
        fs::write(subdir.join(chunk_name), bytes).expect("write chunk");
    }

    let meta = router.handle(&RpcRequest::new(
        "backup:local:getMetadata",
        serde_json::json!({"backup_id": backup_id.clone()}),
    ));
    assert_rpc_ok(&meta);
    let meta_b64 = meta
        .result()
        .unwrap()
        .get("metadata")
        .and_then(|v| v.as_str())
        .expect("metadata")
        .to_string();
    let meta_bytes = general_purpose::STANDARD
        .decode(meta_b64)
        .expect("metadata must be base64");
    fs::write(backup_dir.path().join("metadata.enc"), meta_bytes).expect("write metadata.enc");

    let finish = router.handle(&RpcRequest::new(
        "backup:local:finish",
        serde_json::json!({"backup_id": backup_id}),
    ));
    assert_rpc_ok(&finish);

    let validate = router.handle(&RpcRequest::new(
        "restore:local:validate",
        serde_json::json!({"backup_path": backup_dir.path().to_string_lossy()}),
    ));
    assert_rpc_ok(&validate);
    let result = validate.result().unwrap();
    assert_eq!(result.get("valid").and_then(|v| v.as_bool()), Some(true));
    assert_eq!(result.get("version").and_then(|v| v.as_u64()), Some(2));
    assert_eq!(
        result.get("chunk_count").and_then(|v| v.as_u64()),
        Some(chunk_count)
    );
    let warnings = result
        .get("warnings")
        .and_then(|v| v.as_array())
        .expect("warnings must be array");
    assert!(
        warnings.is_empty(),
        "expected no warnings for a well-formed backup"
    );
}

#[test]
fn test_restore_local_start_upload_commit_contract() {
    let (mut router, temp_dir) = create_router_with_master();

    let backup_dir = TempDir::new().expect("backup dir");

    // Start
    let start = router.handle(&RpcRequest::new(
        "restore:local:start",
        serde_json::json!({"backup_path": backup_dir.path().to_string_lossy()}),
    ));
    assert_rpc_ok(&start);
    let start_result = start.result().unwrap();

    let restore_id = start_result
        .get("restore_id")
        .expect("restore_id")
        .as_str()
        .expect("restore_id string")
        .to_string();
    assert!(
        start_result
            .get("expected_chunks")
            .and_then(|v| v.as_u64())
            .is_some(),
        "ADR-012: restore:local:start must return expected_chunks"
    );

    // Upload (ADR-012/ADR-004 attachments): base64-encoded chunk bytes in JSON payload.
    let chunk0 = b"chunk-bytes-0".to_vec();
    let upload0 = router.handle(&RpcRequest::new(
        "restore:local:uploadChunk",
        serde_json::json!({
            "restore_id": restore_id,
            "chunk_index": 0,
            "chunk_name": "0123456789abcdef0123456789abcdef0123456789abcdef0123456789abcdef",
            "data": general_purpose::STANDARD.encode(chunk0),
            "is_last": true
        }),
    ));
    assert_rpc_ok(&upload0);
    let upload0_result = upload0.result().unwrap();
    assert!(
        upload0_result
            .get("received_chunks")
            .and_then(|v| v.as_u64())
            .is_some(),
        "restore:local:uploadChunk must return received_chunks"
    );
    assert!(
        upload0_result
            .get("total_chunks")
            .and_then(|v| v.as_u64())
            .is_some(),
        "restore:local:uploadChunk must return total_chunks"
    );

    // Commit
    // Provide a minimal valid metadata.enc (v2) so commit can validate and restore pepper/salt.
    let backup_key = derive_backup_key_v2(temp_dir.path(), MASTER_PASSWORD);
    let vault_salt = [1u8; 16];
    let pepper = [7u8; 32];
    let pepper_wrapped =
        chromvoid_core::crypto::StoragePepper::wrap_for_backup(pepper, &backup_key)
            .expect("wrap storage pepper");
    let meta_plain = serde_json::json!({
        "v": 2,
        "backup_type": "local",
        "created_at": 0,
        "chunk_count": 1,
        "total_size": 0,
        "vault_salt": general_purpose::STANDARD.encode(vault_salt),
        "storage_pepper_wrapped": general_purpose::STANDARD.encode(pepper_wrapped),
        "storage_format_v": 2,
    });
    let meta_plain_bytes = serde_json::to_vec(&meta_plain).expect("serialize metadata");
    let meta_enc =
        chromvoid_core::crypto::encrypt(&meta_plain_bytes, &backup_key, b"metadata.enc:v2")
            .expect("encrypt metadata");
    let meta_b64 = general_purpose::STANDARD.encode(meta_enc);

    let commit = router.handle(&RpcRequest::new(
        "restore:local:commit",
        serde_json::json!({
            "restore_id": restore_id,
            "metadata": meta_b64
        }),
    ));
    assert_rpc_ok(&commit);
    let r = commit.result().unwrap();
    assert!(r.get("restored_chunks").is_some());
    assert!(r.get("warnings").is_some());
}

#[test]
fn test_restore_local_upload_chunk_requires_base64_data() {
    let (mut router, _temp_dir) = create_router_with_master();

    let backup_dir = TempDir::new().expect("backup dir");
    let start = router.handle(&RpcRequest::new(
        "restore:local:start",
        serde_json::json!({"backup_path": backup_dir.path().to_string_lossy()}),
    ));
    assert_rpc_ok(&start);
    let restore_id = start
        .result()
        .unwrap()
        .get("restore_id")
        .and_then(|v| v.as_str())
        .expect("restore_id")
        .to_string();

    // Missing data must be rejected (typed error).
    let missing_data = router.handle(&RpcRequest::new(
        "restore:local:uploadChunk",
        serde_json::json!({
            "restore_id": restore_id,
            "chunk_index": 0,
            "chunk_name": "0123456789abcdef0123456789abcdef0123456789abcdef0123456789abcdef",
            "is_last": true
        }),
    ));
    assert!(
        !missing_data.is_ok(),
        "expected restore:local:uploadChunk to reject missing data"
    );
    assert!(
        missing_data.code().is_some(),
        "expected typed error code for missing data"
    );

    // Invalid base64 must be rejected (typed error).
    let invalid_b64 = router.handle(&RpcRequest::new(
        "restore:local:uploadChunk",
        serde_json::json!({
            "restore_id": restore_id,
            "chunk_index": 0,
            "chunk_name": "0123456789abcdef0123456789abcdef0123456789abcdef0123456789abcdef",
            "data": "!!!not-base64!!!",
            "is_last": true
        }),
    ));
    assert!(
        !invalid_b64.is_ok(),
        "expected restore:local:uploadChunk to reject invalid base64"
    );
    assert!(
        invalid_b64.code().is_some(),
        "expected typed error code for invalid base64"
    );
}

#[test]
fn test_restore_local_rejects_wrong_restore_id() {
    let (mut router, temp_dir) = create_router_with_master();

    // uploadChunk with unknown restore_id
    let upload = router.handle(&RpcRequest::new(
        "restore:local:uploadChunk",
        serde_json::json!({
            "restore_id": "restore-does-not-exist",
            "chunk_index": 0,
            "chunk_name": "0123456789abcdef0123456789abcdef0123456789abcdef0123456789abcdef",
            "data": general_purpose::STANDARD.encode(b"chunk0"),
            "is_last": true
        }),
    ));
    assert_rpc_error(&upload, "NODE_NOT_FOUND");

    // commit with unknown restore_id
    let backup_key = derive_backup_key_v2(temp_dir.path(), MASTER_PASSWORD);
    let vault_salt = [1u8; 16];
    let pepper = [7u8; 32];
    let pepper_wrapped =
        chromvoid_core::crypto::StoragePepper::wrap_for_backup(pepper, &backup_key)
            .expect("wrap storage pepper");
    let meta_plain = serde_json::json!({
        "v": 2,
        "backup_type": "local",
        "created_at": 0,
        "chunk_count": 0,
        "total_size": 0,
        "vault_salt": general_purpose::STANDARD.encode(vault_salt),
        "storage_pepper_wrapped": general_purpose::STANDARD.encode(pepper_wrapped),
        "storage_format_v": 2,
    });
    let meta_plain_bytes = serde_json::to_vec(&meta_plain).expect("serialize metadata");
    let meta_enc =
        chromvoid_core::crypto::encrypt(&meta_plain_bytes, &backup_key, b"metadata.enc:v2")
            .expect("encrypt metadata");
    let meta_b64 = general_purpose::STANDARD.encode(meta_enc);

    let commit = router.handle(&RpcRequest::new(
        "restore:local:commit",
        serde_json::json!({"restore_id": "restore-does-not-exist", "metadata": meta_b64}),
    ));
    assert_rpc_error(&commit, "NODE_NOT_FOUND");
}

#[test]
fn test_restore_local_validate_missing_metadata_or_chunks_is_invalid() {
    let (mut router, _temp_dir) = create_router_with_master();

    let backup_dir = TempDir::new().expect("backup dir");

    // No metadata.enc and no chunks/.
    let response = router.handle(&RpcRequest::new(
        "restore:local:validate",
        serde_json::json!({"backup_path": backup_dir.path().to_string_lossy()}),
    ));

    // ADR-012: either typed error OR {valid:false}.
    if response.is_ok() {
        let result = response.result().unwrap();
        assert_eq!(
            result.get("valid").and_then(|v| v.as_bool()),
            Some(false),
            "restore:local:validate should mark incomplete backup as invalid"
        );
    } else {
        assert!(
            response.code().is_some(),
            "restore:local:validate must be typed when it errors"
        );
    }
}

#[test]
fn test_backup_local_download_chunk_rejects_invalid_backup_id() {
    let (mut router, _temp_dir) = create_router_with_master();
    unlock_vault(&mut router, "vault_password");

    // Create at least one real chunk in storage so that downloadChunk(0) can succeed.
    let data = b"seed chunk for local backup".to_vec();
    let prep = router.handle(&RpcRequest::new(
        "catalog:prepareUpload",
        serde_json::json!({
            "name": "seed.bin",
            "size": data.len() as u64,
            "mime_type": "application/octet-stream",
        }),
    ));
    assert_rpc_ok(&prep);
    let node_id = get_node_id(&prep);
    let upload_req = RpcRequest::new(
        "catalog:upload",
        serde_json::json!({"node_id": node_id, "size": data.len(), "offset": 0}),
    );
    match router.handle_with_stream(&upload_req, Some(RpcInputStream::from_bytes(data))) {
        RpcReply::Json(r) => assert_rpc_ok(&r),
        RpcReply::Stream(_) => panic!("catalog:upload must return JSON response"),
    }

    // Start a real backup to establish a baseline.
    let start = router.handle(&RpcRequest::new(
        "backup:local:start",
        serde_json::json!({}),
    ));
    assert_rpc_ok(&start);
    let good_backup_id = start
        .result()
        .unwrap()
        .get("backup_id")
        .and_then(|v| v.as_str())
        .expect("backup_id")
        .to_string();

    // Sanity: valid id must work for chunk_index 0.
    let ok_chunk = router.handle(&RpcRequest::new(
        "backup:local:downloadChunk",
        serde_json::json!({"backup_id": good_backup_id, "chunk_index": 0}),
    ));
    assert_rpc_ok(&ok_chunk);

    // Contract: invalid backup_id must be rejected with typed error.
    let bad = router.handle(&RpcRequest::new(
        "backup:local:downloadChunk",
        serde_json::json!({"backup_id": "backup-does-not-exist", "chunk_index": 0}),
    ));
    assert!(!bad.is_ok(), "invalid backup_id should be rejected");
    assert!(
        bad.code().is_some(),
        "invalid backup_id should be a typed error"
    );
}

#[test]
fn test_backup_local_download_chunk_out_of_range_is_typed_error() {
    let (mut router, _temp_dir) = create_router_with_master();
    unlock_vault(&mut router, "vault_password");

    // Create at least one chunk.
    let data = b"seed chunk for range test".to_vec();
    let prep = router.handle(&RpcRequest::new(
        "catalog:prepareUpload",
        serde_json::json!({
            "name": "seed2.bin",
            "size": data.len() as u64,
            "mime_type": "application/octet-stream",
        }),
    ));
    assert_rpc_ok(&prep);
    let node_id = get_node_id(&prep);
    let upload_req = RpcRequest::new(
        "catalog:upload",
        serde_json::json!({"node_id": node_id, "size": data.len(), "offset": 0}),
    );
    match router.handle_with_stream(&upload_req, Some(RpcInputStream::from_bytes(data))) {
        RpcReply::Json(r) => assert_rpc_ok(&r),
        RpcReply::Stream(_) => panic!("catalog:upload must return JSON response"),
    }

    let start = router.handle(&RpcRequest::new(
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

    // Ask for an absurdly large chunk index to force out-of-range.
    let response = router.handle(&RpcRequest::new(
        "backup:local:downloadChunk",
        serde_json::json!({"backup_id": backup_id, "chunk_index": 999999u64}),
    ));
    assert!(!response.is_ok());
    assert!(response.code().is_some());
}

#[test]
fn test_restore_local_commit_rejects_invalid_metadata_base64() {
    let (mut router, _temp_dir) = create_router_with_master();

    let backup_dir = TempDir::new().expect("backup dir");
    let start = router.handle(&RpcRequest::new(
        "restore:local:start",
        serde_json::json!({"backup_path": backup_dir.path().to_string_lossy()}),
    ));
    assert_rpc_ok(&start);
    let restore_id = start
        .result()
        .unwrap()
        .get("restore_id")
        .and_then(|v| v.as_str())
        .expect("restore_id")
        .to_string();

    let commit = router.handle(&RpcRequest::new(
        "restore:local:commit",
        serde_json::json!({
            "restore_id": restore_id,
            "metadata": "!!!not-base64!!!"
        }),
    ));

    assert!(
        !commit.is_ok(),
        "restore:local:commit must reject invalid base64 metadata"
    );
    assert!(
        commit.code().is_some(),
        "restore:local:commit must be typed"
    );
}

#[test]
fn test_restore_local_commit_rejects_missing_chunks() {
    let (mut router, temp_dir) = create_router_with_master();

    let backup_dir = TempDir::new().expect("backup dir");
    let start = router.handle(&RpcRequest::new(
        "restore:local:start",
        serde_json::json!({"backup_path": backup_dir.path().to_string_lossy()}),
    ));
    assert_rpc_ok(&start);
    let restore_id = start
        .result()
        .unwrap()
        .get("restore_id")
        .and_then(|v| v.as_str())
        .expect("restore_id")
        .to_string();

    // Upload only one chunk but claim chunk_count=2 in metadata.
    let chunk0 = b"chunk-bytes-0".to_vec();
    let upload0 = router.handle(&RpcRequest::new(
        "restore:local:uploadChunk",
        serde_json::json!({
            "restore_id": restore_id.as_str(),
            "chunk_index": 0,
            "chunk_name": "0123456789abcdef0123456789abcdef0123456789abcdef0123456789abcdef",
            "data": general_purpose::STANDARD.encode(chunk0),
            "is_last": true
        }),
    ));
    assert_rpc_ok(&upload0);

    let backup_key = derive_backup_key_v2(temp_dir.path(), MASTER_PASSWORD);
    let vault_salt = [1u8; 16];
    let pepper = [7u8; 32];
    let pepper_wrapped =
        chromvoid_core::crypto::StoragePepper::wrap_for_backup(pepper, &backup_key)
            .expect("wrap storage pepper");
    let meta_plain = serde_json::json!({
        "v": 2,
        "backup_type": "local",
        "created_at": 0,
        "chunk_count": 2,
        "total_size": 0,
        "vault_salt": general_purpose::STANDARD.encode(vault_salt),
        "storage_pepper_wrapped": general_purpose::STANDARD.encode(pepper_wrapped),
        "storage_format_v": 2,
    });
    let meta_plain_bytes = serde_json::to_vec(&meta_plain).expect("serialize metadata");
    let meta_enc =
        chromvoid_core::crypto::encrypt(&meta_plain_bytes, &backup_key, b"metadata.enc:v2")
            .expect("encrypt metadata");
    let meta_b64 = general_purpose::STANDARD.encode(meta_enc);

    let commit = router.handle(&RpcRequest::new(
        "restore:local:commit",
        serde_json::json!({"restore_id": restore_id, "metadata": meta_b64}),
    ));
    assert_rpc_error(&commit, "RESTORE_INVALID_FORMAT");
}

#[test]
fn test_restore_local_commit_rejects_invalid_metadata_aad() {
    let (mut router, temp_dir) = create_router_with_master();

    let backup_dir = TempDir::new().expect("backup dir");
    let start = router.handle(&RpcRequest::new(
        "restore:local:start",
        serde_json::json!({"backup_path": backup_dir.path().to_string_lossy()}),
    ));
    assert_rpc_ok(&start);
    let restore_id = start
        .result()
        .unwrap()
        .get("restore_id")
        .and_then(|v| v.as_str())
        .expect("restore_id")
        .to_string();

    let chunk0 = b"chunk-bytes-0".to_vec();
    let upload0 = router.handle(&RpcRequest::new(
        "restore:local:uploadChunk",
        serde_json::json!({
            "restore_id": restore_id.as_str(),
            "chunk_index": 0,
            "chunk_name": "0123456789abcdef0123456789abcdef0123456789abcdef0123456789abcdef",
            "data": general_purpose::STANDARD.encode(chunk0),
            "is_last": true
        }),
    ));
    assert_rpc_ok(&upload0);

    let backup_key = derive_backup_key_v2(temp_dir.path(), MASTER_PASSWORD);
    let vault_salt = [1u8; 16];
    let pepper = [7u8; 32];
    let pepper_wrapped =
        chromvoid_core::crypto::StoragePepper::wrap_for_backup(pepper, &backup_key)
            .expect("wrap storage pepper");
    let meta_plain = serde_json::json!({
        "v": 2,
        "backup_type": "local",
        "created_at": 0,
        "chunk_count": 1,
        "total_size": 0,
        "vault_salt": general_purpose::STANDARD.encode(vault_salt),
        "storage_pepper_wrapped": general_purpose::STANDARD.encode(pepper_wrapped),
        "storage_format_v": 2,
    });
    let meta_plain_bytes = serde_json::to_vec(&meta_plain).expect("serialize metadata");

    // Encrypt with the wrong AAD.
    let meta_enc =
        chromvoid_core::crypto::encrypt(&meta_plain_bytes, &backup_key, b"metadata.enc:v1")
            .expect("encrypt metadata");
    let meta_b64 = general_purpose::STANDARD.encode(meta_enc);

    let commit = router.handle(&RpcRequest::new(
        "restore:local:commit",
        serde_json::json!({"restore_id": restore_id, "metadata": meta_b64}),
    ));
    assert_rpc_error(&commit, "RESTORE_INVALID_FORMAT");
}

#[test]
fn test_restore_local_commit_rejects_unsupported_version() {
    let (mut router, temp_dir) = create_router_with_master();

    let backup_dir = TempDir::new().expect("backup dir");
    let start = router.handle(&RpcRequest::new(
        "restore:local:start",
        serde_json::json!({"backup_path": backup_dir.path().to_string_lossy()}),
    ));
    assert_rpc_ok(&start);
    let restore_id = start
        .result()
        .unwrap()
        .get("restore_id")
        .and_then(|v| v.as_str())
        .expect("restore_id")
        .to_string();

    let chunk0 = b"chunk-bytes-0".to_vec();
    let upload0 = router.handle(&RpcRequest::new(
        "restore:local:uploadChunk",
        serde_json::json!({
            "restore_id": restore_id.as_str(),
            "chunk_index": 0,
            "chunk_name": "0123456789abcdef0123456789abcdef0123456789abcdef0123456789abcdef",
            "data": general_purpose::STANDARD.encode(chunk0),
            "is_last": true
        }),
    ));
    assert_rpc_ok(&upload0);

    let backup_key = derive_backup_key_v2(temp_dir.path(), MASTER_PASSWORD);
    let vault_salt = [1u8; 16];
    let pepper = [7u8; 32];
    let pepper_wrapped =
        chromvoid_core::crypto::StoragePepper::wrap_for_backup(pepper, &backup_key)
            .expect("wrap storage pepper");
    let meta_plain = serde_json::json!({
        "v": 1,
        "backup_type": "local",
        "created_at": 0,
        "chunk_count": 1,
        "total_size": 0,
        "vault_salt": general_purpose::STANDARD.encode(vault_salt),
        "storage_pepper_wrapped": general_purpose::STANDARD.encode(pepper_wrapped),
        "storage_format_v": 2,
    });
    let meta_plain_bytes = serde_json::to_vec(&meta_plain).expect("serialize metadata");
    let meta_enc =
        chromvoid_core::crypto::encrypt(&meta_plain_bytes, &backup_key, b"metadata.enc:v2")
            .expect("encrypt metadata");
    let meta_b64 = general_purpose::STANDARD.encode(meta_enc);

    let commit = router.handle(&RpcRequest::new(
        "restore:local:commit",
        serde_json::json!({"restore_id": restore_id, "metadata": meta_b64}),
    ));
    assert_rpc_error(&commit, "RESTORE_VERSION_NOT_SUPPORTED");
}

#[test]
fn test_restore_local_commit_rejects_wrong_master_password() {
    let temp_dir = TempDir::new().expect("temp dir");
    let storage = Storage::new(temp_dir.path()).expect("storage");
    let keystore = Arc::new(InMemoryKeystore::new());
    let mut router = RpcRouter::new(storage)
        .with_master_key("wrong master password")
        .with_keystore(keystore);

    let setup = router.handle(&RpcRequest::new(
        "master:setup",
        serde_json::json!({"master_password": MASTER_PASSWORD}),
    ));
    assert_rpc_ok(&setup);

    let backup_dir = TempDir::new().expect("backup dir");
    let start = router.handle(&RpcRequest::new(
        "restore:local:start",
        serde_json::json!({"backup_path": backup_dir.path().to_string_lossy()}),
    ));
    assert_rpc_ok(&start);
    let restore_id = start
        .result()
        .unwrap()
        .get("restore_id")
        .and_then(|v| v.as_str())
        .expect("restore_id")
        .to_string();

    let chunk0 = b"chunk-bytes-0".to_vec();
    let upload0 = router.handle(&RpcRequest::new(
        "restore:local:uploadChunk",
        serde_json::json!({
            "restore_id": restore_id.as_str(),
            "chunk_index": 0,
            "chunk_name": "0123456789abcdef0123456789abcdef0123456789abcdef0123456789abcdef",
            "data": general_purpose::STANDARD.encode(chunk0),
            "is_last": true
        }),
    ));
    assert_rpc_ok(&upload0);

    // Encrypt metadata with the correct backup key (derived from MASTER_PASSWORD).
    let backup_key = derive_backup_key_v2(temp_dir.path(), MASTER_PASSWORD);
    let vault_salt = [1u8; 16];
    let pepper = [7u8; 32];
    let pepper_wrapped =
        chromvoid_core::crypto::StoragePepper::wrap_for_backup(pepper, &backup_key)
            .expect("wrap storage pepper");
    let meta_plain = serde_json::json!({
        "v": 2,
        "backup_type": "local",
        "created_at": 0,
        "chunk_count": 1,
        "total_size": 0,
        "vault_salt": general_purpose::STANDARD.encode(vault_salt),
        "storage_pepper_wrapped": general_purpose::STANDARD.encode(pepper_wrapped),
        "storage_format_v": 2,
    });
    let meta_plain_bytes = serde_json::to_vec(&meta_plain).expect("serialize metadata");
    let meta_enc =
        chromvoid_core::crypto::encrypt(&meta_plain_bytes, &backup_key, b"metadata.enc:v2")
            .expect("encrypt metadata");
    let meta_b64 = general_purpose::STANDARD.encode(meta_enc);

    let commit = router.handle(&RpcRequest::new(
        "restore:local:commit",
        serde_json::json!({"restore_id": restore_id, "metadata": meta_b64}),
    ));
    assert_rpc_error(&commit, "INVALID_MASTER_PASSWORD");
}

#[test]
fn test_restore_local_upload_chunk_roundtrip_progress_counts() {
    let (mut router, _temp_dir) = create_router_with_master();

    let backup_dir = TempDir::new().expect("backup dir");
    let start = router.handle(&RpcRequest::new(
        "restore:local:start",
        serde_json::json!({"backup_path": backup_dir.path().to_string_lossy()}),
    ));
    assert_rpc_ok(&start);
    let restore_id = start
        .result()
        .unwrap()
        .get("restore_id")
        .and_then(|v| v.as_str())
        .expect("restore_id")
        .to_string();

    // Upload two chunks and expect received_chunks to progress.
    let chunk0 = b"chunk0".to_vec();
    let chunk1 = b"chunk1".to_vec();

    let upload0 = router.handle(&RpcRequest::new(
        "restore:local:uploadChunk",
        serde_json::json!({
            "restore_id": restore_id,
            "chunk_index": 0,
            "chunk_name": "0123456789abcdef0123456789abcdef0123456789abcdef0123456789abcdef",
            "data": general_purpose::STANDARD.encode(chunk0),
            "is_last": false
        }),
    ));
    assert_rpc_ok(&upload0);

    let upload1 = router.handle(&RpcRequest::new(
        "restore:local:uploadChunk",
        serde_json::json!({
            "restore_id": restore_id,
            "chunk_index": 1,
            "chunk_name": "abcdef0123456789abcdef0123456789abcdef0123456789abcdef0123456789",
            "data": general_purpose::STANDARD.encode(chunk1),
            "is_last": true
        }),
    ));
    assert_rpc_ok(&upload1);

    let r1 = upload1.result().unwrap();
    assert_eq!(r1.get("received_chunks").and_then(|v| v.as_u64()), Some(2));
    assert_eq!(r1.get("total_chunks").and_then(|v| v.as_u64()), Some(2));
}

#[test]
fn test_backup_local_finish_rejects_unknown_backup_id() {
    let (mut router, _temp_dir) = create_router_with_master();

    let response = router.handle(&RpcRequest::new(
        "backup:local:finish",
        serde_json::json!({"backup_id": "backup-does-not-exist"}),
    ));
    assert!(!response.is_ok(), "unknown backup_id should be rejected");
    assert!(
        response.code().is_some(),
        "unknown backup_id should be a typed error"
    );
}

#[test]
fn test_backup_local_cancel_releases_session() {
    let (mut router, _temp_dir) = create_router_with_master();
    unlock_vault(&mut router, "vault_password");

    let start = router.handle(&RpcRequest::new(
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

    let cancel = router.handle(&RpcRequest::new(
        "backup:local:cancel",
        serde_json::json!({"backup_id": backup_id}),
    ));
    assert_rpc_ok(&cancel);
    let cancel_result = cancel.result().unwrap();
    assert_eq!(
        cancel_result.get("cancelled").and_then(|v| v.as_bool()),
        Some(true)
    );

    let restart = router.handle(&RpcRequest::new(
        "backup:local:start",
        serde_json::json!({}),
    ));
    assert_rpc_ok(&restart);
}

#[test]
fn test_restore_local_cancel_rolls_back_uploaded_chunks() {
    let (mut router, temp_dir) = create_router_with_master();

    let backup_dir = TempDir::new().expect("backup dir");
    let start = router.handle(&RpcRequest::new(
        "restore:local:start",
        serde_json::json!({"backup_path": backup_dir.path().to_string_lossy()}),
    ));
    assert_rpc_ok(&start);
    let restore_id = start
        .result()
        .unwrap()
        .get("restore_id")
        .and_then(|v| v.as_str())
        .expect("restore_id")
        .to_string();

    let chunk_name = "0123456789abcdef0123456789abcdef0123456789abcdef0123456789abcdef";
    let upload = router.handle(&RpcRequest::new(
        "restore:local:uploadChunk",
        serde_json::json!({
            "restore_id": restore_id.clone(),
            "chunk_index": 0,
            "chunk_name": chunk_name,
            "data": general_purpose::STANDARD.encode(b"chunk-data"),
            "is_last": true
        }),
    ));
    assert_rpc_ok(&upload);

    let storage = Storage::new(temp_dir.path()).expect("storage");
    assert_eq!(
        storage
            .chunk_exists(chunk_name)
            .expect("chunk_exists before cancel"),
        true
    );

    let cancel = router.handle(&RpcRequest::new(
        "restore:local:cancel",
        serde_json::json!({"restore_id": restore_id.clone()}),
    ));
    assert_rpc_ok(&cancel);
    let cancel_result = cancel.result().unwrap();
    assert_eq!(
        cancel_result.get("cancelled").and_then(|v| v.as_bool()),
        Some(true)
    );
    assert_eq!(
        cancel_result.get("deleted_chunks").and_then(|v| v.as_u64()),
        Some(1)
    );

    assert_eq!(
        storage
            .chunk_exists(chunk_name)
            .expect("chunk_exists after cancel"),
        false
    );

    let commit = router.handle(&RpcRequest::new(
        "restore:local:commit",
        serde_json::json!({
            "restore_id": restore_id,
            "metadata": general_purpose::STANDARD.encode("invalid"),
        }),
    ));
    assert_rpc_error(&commit, "NODE_NOT_FOUND");
}
