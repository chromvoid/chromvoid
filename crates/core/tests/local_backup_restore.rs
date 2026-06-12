//! ADR-012 Local Backup/Restore (target contract)

mod test_helpers;

use base64::{engine::general_purpose, Engine as _};
use chromvoid_core::crypto::keystore::InMemoryKeystore;
use chromvoid_core::crypto::{decrypt, derive_vault_key, hash};
use chromvoid_core::rpc::types::{RpcRequest, RpcResponse};
use chromvoid_core::rpc::RpcRouter;
use chromvoid_core::rpc::{RpcInputStream, RpcReply};
use chromvoid_core::storage::Storage;
use std::fs;
use std::io::{Cursor, Read};
use std::sync::Arc;
use std::time::Duration;
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

fn restore_validate_warnings(response: &RpcResponse) -> Vec<String> {
    response
        .result()
        .expect("validate response result")
        .get("warnings")
        .and_then(|value| value.as_array())
        .expect("warnings array")
        .iter()
        .map(|value| value.as_str().expect("warning string").to_string())
        .collect()
}

fn assert_rpc_error_message(response: &RpcResponse, expected_code: &str, expected_message: &str) {
    assert_rpc_error(response, expected_code);
    assert_eq!(response.error_message(), Some(expected_message));
}

fn upload_test_file(router: &mut RpcRouter, name: &str, data: Vec<u8>) {
    let upload_req = RpcRequest::new(
        "catalog:upload",
        serde_json::json!({
            "parent_path": "/",
            "name": name,
            "total_size": data.len() as u64,
            "size": data.len(),
            "offset": 0,
            "mime_type": "application/octet-stream",
        }),
    );
    match router.handle_with_stream(&upload_req, Some(RpcInputStream::from_bytes(data))) {
        RpcReply::Json(response) => assert_rpc_ok(&response),
        RpcReply::Stream(_) | RpcReply::RangeStream(_) => {
            panic!("catalog:upload must return JSON response")
        }
    }
}

fn start_backup(router: &mut RpcRouter) -> (String, u64, u64) {
    let start = router.handle(&RpcRequest::new(
        "backup:local:start",
        serde_json::json!({}),
    ));
    assert_rpc_ok(&start);
    let result = start.result().unwrap();
    let backup_id = result
        .get("backup_id")
        .and_then(|value| value.as_str())
        .expect("backup_id")
        .to_string();
    let estimated_size = result
        .get("estimated_size")
        .and_then(|value| value.as_u64())
        .expect("estimated_size");
    let chunk_count = result
        .get("chunk_count")
        .and_then(|value| value.as_u64())
        .expect("chunk_count");
    (backup_id, estimated_size, chunk_count)
}

fn get_chunk_manifest(router: &mut RpcRouter, backup_id: &str) -> serde_json::Value {
    let manifest = router.handle(&RpcRequest::new(
        "backup:local:getChunkManifest",
        serde_json::json!({"backup_id": backup_id}),
    ));
    assert_rpc_ok(&manifest);
    manifest
        .result()
        .unwrap()
        .get("manifest")
        .expect("manifest")
        .clone()
}

fn manifest_entries(manifest: &serde_json::Value) -> Vec<(String, u64)> {
    manifest
        .get("chunks")
        .and_then(|value| value.as_array())
        .expect("manifest chunks")
        .iter()
        .map(|entry| {
            let name = entry
                .get("name")
                .and_then(|value| value.as_str())
                .expect("chunk name")
                .to_string();
            let size = entry
                .get("size")
                .and_then(|value| value.as_u64())
                .expect("chunk size");
            (name, size)
        })
        .collect()
}

fn download_backup_pack(router: &mut RpcRouter, backup_id: &str) -> Vec<u8> {
    let request = RpcRequest::new(
        "backup:local:downloadPack",
        serde_json::json!({"backup_id": backup_id}),
    );
    let mut reader = match router.handle_with_stream(&request, None) {
        RpcReply::Stream(stream) => stream.reader,
        RpcReply::Json(response) => panic!("downloadPack returned JSON: {response:?}"),
        RpcReply::RangeStream(_) => panic!("downloadPack must not return range stream"),
    };
    let mut bytes = Vec::new();
    reader.read_to_end(&mut bytes).expect("read chunks.pack");
    bytes
}

fn start_restore(router: &mut RpcRouter) -> String {
    let backup_dir = TempDir::new().expect("backup dir");
    let start = router.handle(&RpcRequest::new(
        "restore:local:start",
        serde_json::json!({"backup_path": backup_dir.path().to_string_lossy()}),
    ));
    assert_rpc_ok(&start);
    start
        .result()
        .unwrap()
        .get("restore_id")
        .and_then(|value| value.as_str())
        .expect("restore_id")
        .to_string()
}

fn upload_backup_pack(
    router: &mut RpcRouter,
    restore_id: &str,
    manifest: serde_json::Value,
    pack: Vec<u8>,
) -> chromvoid_core::rpc::types::RpcResponse {
    let request = RpcRequest::new(
        "restore:local:uploadPack",
        serde_json::json!({
            "restore_id": restore_id,
            "manifest": manifest,
        }),
    );
    match router.handle_with_stream(
        &request,
        Some(RpcInputStream::new(Box::new(Cursor::new(pack)))),
    ) {
        RpcReply::Json(response) => response,
        RpcReply::Stream(_) | RpcReply::RangeStream(_) => {
            panic!("restore:local:uploadPack must return JSON response")
        }
    }
}

fn upload_synthetic_restore_pack(
    router: &mut RpcRouter,
    restore_id: &str,
    chunks: &[(&str, &[u8])],
) -> chromvoid_core::rpc::types::RpcResponse {
    let mut pack = Vec::new();
    let manifest_chunks: Vec<_> = chunks
        .iter()
        .map(|(name, bytes)| {
            pack.extend_from_slice(bytes);
            serde_json::json!({
                "name": name,
                "size": bytes.len() as u64,
            })
        })
        .collect();
    let total_size = chunks
        .iter()
        .fold(0_u64, |total, (_name, bytes)| total + bytes.len() as u64);
    upload_backup_pack(
        router,
        restore_id,
        serde_json::json!({
            "v": 2,
            "chunk_count": chunks.len() as u64,
            "total_size": total_size,
            "chunks": manifest_chunks,
        }),
        pack,
    )
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

    // Download v2 pack manifest and the single chunks.pack stream.
    let manifest = get_chunk_manifest(&mut router, &backup_id);
    assert_eq!(manifest.get("v").and_then(|v| v.as_u64()), Some(2));
    assert_eq!(
        manifest.get("chunk_count").and_then(|v| v.as_u64()),
        Some(chunk_count)
    );
    let manifest_entries = manifest_entries(&manifest);
    let manifest_total_size = manifest_entries
        .iter()
        .fold(0_u64, |total, (_, size)| total.saturating_add(*size));
    assert_eq!(
        manifest.get("total_size").and_then(|v| v.as_u64()),
        Some(manifest_total_size)
    );
    for (name, _) in &manifest_entries {
        assert_eq!(name.len(), 64);
        assert!(name.chars().all(|c| c.is_ascii_hexdigit()));
    }

    let pack = download_backup_pack(&mut router, &backup_id);
    assert_eq!(pack.len() as u64, manifest_total_size);

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
        serde_json::json!({"backup_id": backup_id.clone()}),
    ));
    assert_rpc_ok(&finish);
    let finish_result = finish.result().unwrap();
    assert!(finish_result.get("backup_id").is_some());
    assert!(finish_result.get("created_at").is_some());

    let after_finish = router.handle(&RpcRequest::new(
        "backup:local:getMetadata",
        serde_json::json!({"backup_id": backup_id}),
    ));
    assert_rpc_error(&after_finish, "NODE_NOT_FOUND");
}

#[test]
fn test_backup_local_pack_manifest_matches_storage_chunks() {
    let (mut router, temp_dir) = create_router_with_master();
    unlock_vault(&mut router, "vault_password");
    upload_test_file(&mut router, "alpha.bin", b"alpha pack data".to_vec());
    upload_test_file(&mut router, "beta.bin", vec![42_u8; 8192]);

    let (backup_id, estimated_size, chunk_count) = start_backup(&mut router);
    let manifest = get_chunk_manifest(&mut router, &backup_id);
    let entries = manifest_entries(&manifest);

    assert_eq!(entries.len() as u64, chunk_count);
    assert_eq!(
        manifest.get("total_size").and_then(|value| value.as_u64()),
        Some(estimated_size)
    );

    let storage = Storage::new(temp_dir.path()).expect("storage");
    let mut storage_names = storage.list_chunks().expect("list chunks");
    storage_names.sort();
    let manifest_names = entries
        .iter()
        .map(|(name, _)| name.clone())
        .collect::<Vec<_>>();
    assert_eq!(manifest_names, storage_names);

    let mut expected_pack = Vec::new();
    for (name, size) in &entries {
        let bytes = storage.read_chunk(name).expect("read chunk");
        assert_eq!(bytes.len() as u64, *size);
        expected_pack.extend_from_slice(&bytes);
    }

    let pack = download_backup_pack(&mut router, &backup_id);
    assert_eq!(pack, expected_pack);
}

#[test]
fn test_backup_local_snapshot_is_immutable_after_start() {
    let (mut router, temp_dir) = create_router_with_master();
    unlock_vault(&mut router, "vault_password");
    upload_test_file(&mut router, "before.bin", b"before snapshot".to_vec());

    let (backup_id, estimated_size, _chunk_count) = start_backup(&mut router);
    let manifest_at_start = get_chunk_manifest(&mut router, &backup_id);
    let entries_at_start = manifest_entries(&manifest_at_start);
    let storage = Storage::new(temp_dir.path()).expect("storage");
    let mut expected_pack = Vec::new();
    for (name, size) in &entries_at_start {
        let bytes = storage.read_chunk(name).expect("read start chunk");
        assert_eq!(bytes.len() as u64, *size);
        expected_pack.extend_from_slice(&bytes);
    }

    upload_test_file(
        &mut router,
        "after.bin",
        b"after snapshot mutation".to_vec(),
    );

    let manifest_after_mutation = get_chunk_manifest(&mut router, &backup_id);
    assert_eq!(manifest_after_mutation, manifest_at_start);
    assert_eq!(download_backup_pack(&mut router, &backup_id), expected_pack);

    let first_chunk = router.handle(&RpcRequest::new(
        "backup:local:downloadChunk",
        serde_json::json!({"backup_id": backup_id, "chunk_index": 0}),
    ));
    assert_rpc_ok(&first_chunk);
    let first_chunk_b64 = first_chunk
        .result()
        .unwrap()
        .get("data")
        .and_then(|value| value.as_str())
        .expect("chunk data");
    let first_chunk_bytes = general_purpose::STANDARD
        .decode(first_chunk_b64)
        .expect("chunk data base64");
    assert_eq!(
        first_chunk_bytes.len() as u64,
        entries_at_start[0].1,
        "downloadChunk should use start-time chunk size"
    );
    assert_eq!(
        first_chunk_bytes,
        expected_pack[..entries_at_start[0].1 as usize]
    );
    assert_eq!(expected_pack.len() as u64, estimated_size);
}

#[test]
fn test_restore_local_upload_pack_restores_exact_chunks() {
    let (mut source_router, source_dir) = create_router_with_master();
    unlock_vault(&mut source_router, "vault_password");
    upload_test_file(&mut source_router, "seed.bin", vec![7_u8; 16 * 1024]);

    let (backup_id, _estimated_size, chunk_count) = start_backup(&mut source_router);
    let manifest = get_chunk_manifest(&mut source_router, &backup_id);
    let pack = download_backup_pack(&mut source_router, &backup_id);

    let (mut target_router, target_dir) = create_router_with_master();
    let restore_id = start_restore(&mut target_router);
    let upload = upload_backup_pack(&mut target_router, &restore_id, manifest.clone(), pack);
    assert_rpc_ok(&upload);
    let upload_result = upload.result().unwrap();
    assert_eq!(
        upload_result
            .get("received_chunks")
            .and_then(|value| value.as_u64()),
        Some(chunk_count)
    );

    let source_storage = Storage::new(source_dir.path()).expect("source storage");
    let target_storage = Storage::new(target_dir.path()).expect("target storage");
    for (name, _size) in manifest_entries(&manifest) {
        let expected = source_storage.read_chunk(&name).expect("read source chunk");
        let restored = target_storage.read_chunk(&name).expect("read target chunk");
        assert_eq!(restored, expected);
    }
}

#[test]
fn test_restore_local_upload_pack_rejects_invalid_pack_inputs() {
    let (mut source_router, _source_dir) = create_router_with_master();
    unlock_vault(&mut source_router, "vault_password");
    upload_test_file(
        &mut source_router,
        "seed.bin",
        b"pack validation seed".to_vec(),
    );
    let (backup_id, _estimated_size, _chunk_count) = start_backup(&mut source_router);
    let manifest = get_chunk_manifest(&mut source_router, &backup_id);
    let pack = download_backup_pack(&mut source_router, &backup_id);

    let attempt =
        |manifest: serde_json::Value, pack: Vec<u8>| -> chromvoid_core::rpc::types::RpcResponse {
            let (mut target_router, _target_dir) = create_router_with_master();
            let restore_id = start_restore(&mut target_router);
            upload_backup_pack(&mut target_router, &restore_id, manifest, pack)
        };

    let mut invalid_name_manifest = manifest.clone();
    invalid_name_manifest["chunks"][0]["name"] = serde_json::Value::String("not-a-chunk".into());
    assert_rpc_error(
        &attempt(invalid_name_manifest, pack.clone()),
        "RESTORE_INVALID_FORMAT",
    );

    let mut duplicate_name_manifest = manifest.clone();
    let first_name = duplicate_name_manifest["chunks"][0]["name"].clone();
    duplicate_name_manifest["chunks"]
        .as_array_mut()
        .expect("chunks array")
        .push(serde_json::json!({"name": first_name, "size": 0}));
    duplicate_name_manifest["chunk_count"] = serde_json::json!(duplicate_name_manifest["chunks"]
        .as_array()
        .expect("chunks array")
        .len() as u64);
    assert_rpc_error(
        &attempt(duplicate_name_manifest, pack.clone()),
        "RESTORE_INVALID_FORMAT",
    );

    let mut total_mismatch_manifest = manifest.clone();
    total_mismatch_manifest["total_size"] = serde_json::json!(total_mismatch_manifest
        ["total_size"]
        .as_u64()
        .expect("total_size")
        .saturating_add(1));
    assert_rpc_error(
        &attempt(total_mismatch_manifest, pack.clone()),
        "RESTORE_INVALID_FORMAT",
    );

    let mut truncated = pack.clone();
    truncated.pop();
    assert_rpc_error(
        &attempt(manifest.clone(), truncated),
        "RESTORE_INVALID_FORMAT",
    );

    let mut extra = pack.clone();
    extra.push(0);
    assert_rpc_error(&attempt(manifest, extra), "RESTORE_INVALID_FORMAT");
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
    assert_rpc_error_message(&start, "BACKUP_TOO_LARGE", "Backup too large");
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
    assert_rpc_error_message(
        &start2,
        "BACKUP_ALREADY_IN_PROGRESS",
        "Backup already in progress",
    );
}

#[test]
fn test_backup_local_start_cleans_storage_and_legacy_temp_packs() {
    let (mut router, temp_dir) = create_router_with_master();
    unlock_vault(&mut router, "vault_password");

    let storage_temp_dir = temp_dir.path().join(".storage-tmp").join("backup-local");
    std::fs::create_dir_all(&storage_temp_dir).expect("storage temp dir");
    let namespaced_stale = storage_temp_dir.join("backup-local-stale.pack");
    std::fs::write(&namespaced_stale, b"stale").expect("write namespaced stale");
    let legacy_stale = temp_dir.path().join(".backup-local-stale.pack");
    std::fs::write(&legacy_stale, b"legacy").expect("write legacy stale");

    let start = router.handle(&RpcRequest::new(
        "backup:local:start",
        serde_json::json!({}),
    ));

    assert_rpc_ok(&start);
    assert!(!namespaced_stale.exists());
    assert!(!legacy_stale.exists());
}

#[test]
fn test_backup_local_expired_session_allows_new_start() {
    let (router, _temp_dir) = create_router_with_master();
    let mut router = router.with_backup_local_idle_ttl_ms(1);
    unlock_vault(&mut router, "vault_password");

    let start1 = router.handle(&RpcRequest::new(
        "backup:local:start",
        serde_json::json!({}),
    ));
    assert_rpc_ok(&start1);

    std::thread::sleep(Duration::from_millis(3));

    let start2 = router.handle(&RpcRequest::new(
        "backup:local:start",
        serde_json::json!({}),
    ));
    assert_rpc_ok(&start2);
}

#[test]
fn test_backup_local_download_after_expiry_rejects_and_clears_session() {
    let (router, _temp_dir) = create_router_with_master();
    let mut router = router.with_backup_local_idle_ttl_ms(1);
    unlock_vault(&mut router, "vault_password");
    upload_test_file(&mut router, "backup-expiry-seed.bin", b"seed".to_vec());

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

    std::thread::sleep(Duration::from_millis(3));

    let expired = router.handle(&RpcRequest::new(
        "backup:local:downloadChunk",
        serde_json::json!({"backup_id": backup_id, "chunk_index": 0}),
    ));
    assert_rpc_error_message(&expired, "NODE_NOT_FOUND", "backup_id not found");

    let restart = router.handle(&RpcRequest::new(
        "backup:local:start",
        serde_json::json!({}),
    ));
    assert_rpc_ok(&restart);
}

#[test]
fn test_restore_local_expired_session_rolls_back_and_allows_new_start() {
    let (router, temp_dir) = create_router_with_master();
    let mut router = router.with_long_running_session_idle_ttl_ms(1);
    let start = router.handle(&RpcRequest::new(
        "restore:local:start",
        serde_json::json!({"backup_path": "/tmp/backup"}),
    ));
    assert_rpc_ok(&start);
    let restore_id = start
        .result()
        .unwrap()
        .get("restore_id")
        .and_then(|value| value.as_str())
        .expect("restore_id")
        .to_string();
    let chunk_name = "abcdef0123456789abcdef0123456789abcdef0123456789abcdef0123456789";
    let upload =
        upload_synthetic_restore_pack(&mut router, &restore_id, &[(chunk_name, b"restored")]);
    assert_rpc_ok(&upload);
    let storage = Storage::new(temp_dir.path()).expect("storage");
    assert!(storage.chunk_exists(chunk_name).expect("chunk exists"));

    std::thread::sleep(Duration::from_millis(2));
    let next_start = router.handle(&RpcRequest::new(
        "restore:local:start",
        serde_json::json!({"backup_path": "/tmp/backup-2"}),
    ));
    assert_rpc_ok(&next_start);
    assert!(!storage
        .chunk_exists(chunk_name)
        .expect("chunk removed after restore expiry"));
}

#[test]
fn test_restore_local_commit_after_expiry_rejects_and_rolls_back() {
    let (router, temp_dir) = create_router_with_master();
    let mut router = router.with_long_running_session_idle_ttl_ms(1);
    let start = router.handle(&RpcRequest::new(
        "restore:local:start",
        serde_json::json!({"backup_path": "/tmp/backup"}),
    ));
    assert_rpc_ok(&start);
    let restore_id = start
        .result()
        .unwrap()
        .get("restore_id")
        .and_then(|value| value.as_str())
        .expect("restore_id")
        .to_string();
    let chunk_name = "bbcdef0123456789abcdef0123456789abcdef0123456789abcdef0123456789";
    let upload =
        upload_synthetic_restore_pack(&mut router, &restore_id, &[(chunk_name, b"restored")]);
    assert_rpc_ok(&upload);

    std::thread::sleep(Duration::from_millis(2));
    let commit = router.handle(&RpcRequest::new(
        "restore:local:commit",
        serde_json::json!({
            "restore_id": restore_id,
            "metadata": "not-base64",
        }),
    ));
    assert_rpc_error_message(&commit, "NODE_NOT_FOUND", "restore_id not found");
    let storage = Storage::new(temp_dir.path()).expect("storage");
    assert!(!storage
        .chunk_exists(chunk_name)
        .expect("chunk removed after restore expiry"));
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
fn test_restore_local_validate_directory_warning_contracts() {
    let (mut router, _temp_dir) = create_router_with_master();

    let backup_dir = TempDir::new().expect("backup dir");
    let not_a_dir = backup_dir.path().join("missing");
    let response = router.handle(&RpcRequest::new(
        "restore:local:validate",
        serde_json::json!({"backup_path": not_a_dir.to_string_lossy()}),
    ));
    assert_rpc_ok(&response);
    let result = response.result().unwrap();
    assert_eq!(result.get("valid").and_then(|v| v.as_bool()), Some(false));
    assert_eq!(
        restore_validate_warnings(&response),
        vec!["backup_path is not a directory".to_string()]
    );

    let response = router.handle(&RpcRequest::new(
        "restore:local:validate",
        serde_json::json!({"backup_path": backup_dir.path().to_string_lossy()}),
    ));
    assert_rpc_ok(&response);
    let warnings = restore_validate_warnings(&response);
    assert!(warnings.contains(&"metadata.enc not found".to_string()));
    assert!(warnings.contains(&"chunks.manifest.json not found".to_string()));
    assert!(warnings.contains(&"chunks.pack not found".to_string()));
}

#[test]
fn test_restore_local_validate_manifest_and_pack_warning_contracts() {
    let (mut router, _temp_dir) = create_router_with_master();

    let invalid_manifest_dir = TempDir::new().expect("invalid manifest dir");
    fs::write(
        invalid_manifest_dir.path().join("chunks.manifest.json"),
        b"{not-json",
    )
    .expect("write invalid manifest");
    let response = router.handle(&RpcRequest::new(
        "restore:local:validate",
        serde_json::json!({"backup_path": invalid_manifest_dir.path().to_string_lossy()}),
    ));
    assert_rpc_ok(&response);
    assert!(restore_validate_warnings(&response)
        .iter()
        .any(|warning| warning.starts_with("chunks.manifest.json is invalid:")));

    let pack_dir = TempDir::new().expect("pack dir");
    fs::write(
        pack_dir.path().join("chunks.manifest.json"),
        serde_json::json!({
            "v": 2,
            "chunk_count": 0,
            "total_size": 0,
            "chunks": [],
        })
        .to_string(),
    )
    .expect("write manifest");
    fs::create_dir(pack_dir.path().join("chunks.pack")).expect("create pack dir");
    let response = router.handle(&RpcRequest::new(
        "restore:local:validate",
        serde_json::json!({"backup_path": pack_dir.path().to_string_lossy()}),
    ));
    assert_rpc_ok(&response);
    assert!(restore_validate_warnings(&response).contains(&"chunks.pack is not a file".to_string()));

    let size_mismatch_dir = TempDir::new().expect("size mismatch dir");
    fs::write(
        size_mismatch_dir.path().join("chunks.manifest.json"),
        serde_json::json!({
            "v": 2,
            "chunk_count": 1,
            "total_size": 5,
            "chunks": [{
                "name": "abcdefabcdefabcdefabcdefabcdefabcdefabcdefabcdefabcdefabcdefabcd",
                "size": 5,
            }],
        })
        .to_string(),
    )
    .expect("write manifest");
    fs::write(size_mismatch_dir.path().join("chunks.pack"), b"x").expect("write pack");
    let response = router.handle(&RpcRequest::new(
        "restore:local:validate",
        serde_json::json!({"backup_path": size_mismatch_dir.path().to_string_lossy()}),
    ));
    assert_rpc_ok(&response);
    assert!(restore_validate_warnings(&response)
        .contains(&"chunks.pack size mismatch: manifest=5, found=1".to_string()));
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
    let manifest = get_chunk_manifest(&mut router, &backup_id);
    let pack = download_backup_pack(&mut router, &backup_id);
    fs::write(
        backup_dir.path().join("chunks.manifest.json"),
        serde_json::to_vec(&manifest).expect("serialize manifest"),
    )
    .expect("write chunks.manifest.json");
    fs::write(backup_dir.path().join("chunks.pack"), pack).expect("write chunks.pack");

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

    // Upload (ADR-012/ADR-004 attachments): manifest + chunks.pack stream.
    let chunk0 = b"chunk-bytes-0".to_vec();
    let upload0 = upload_synthetic_restore_pack(
        &mut router,
        &restore_id,
        &[(
            "0123456789abcdef0123456789abcdef0123456789abcdef0123456789abcdef",
            chunk0.as_slice(),
        )],
    );
    assert_rpc_ok(&upload0);
    let upload0_result = upload0.result().unwrap();
    assert!(
        upload0_result
            .get("received_chunks")
            .and_then(|v| v.as_u64())
            .is_some(),
        "restore:local:uploadPack must return received_chunks"
    );
    assert!(
        upload0_result
            .get("total_chunks")
            .and_then(|v| v.as_u64())
            .is_some(),
        "restore:local:uploadPack must return total_chunks"
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
fn test_restore_local_start_reports_restore_recovery_failure() {
    enable_fast_kdf_for_tests();
    let temp_dir = TempDir::new().expect("temp dir");
    let storage = Storage::new(temp_dir.path()).expect("storage");
    let mut router = RpcRouter::new(storage).with_master_key(MASTER_PASSWORD);
    let restore_record = serde_json::json!({
        "version": 1,
        "kind": "restore",
        "tx_id": "restore-recovery-failure",
        "phase": "committing",
        "payload": {
            "version": 1,
            "kind": "local",
            "restore_id": "restore-recovery-failure",
            "expected_chunks": [
                "0123456789abcdef0123456789abcdef0123456789abcdef0123456789abcdef"
            ],
            "written_artifacts": [],
            "pepper_committed": true,
        },
    });
    fs::write(
        temp_dir.path().join("restore.transaction.json"),
        serde_json::to_vec(&restore_record).expect("serialize restore record"),
    )
    .expect("write restore transaction");

    let response = router.handle(&RpcRequest::new(
        "restore:local:start",
        serde_json::json!({"backup_path": temp_dir.path().to_string_lossy()}),
    ));
    assert_rpc_error(&response, "INTERNAL_ERROR");
    assert!(response
        .error_message()
        .unwrap_or_default()
        .starts_with("Failed to recover restore transaction:"));
}

#[test]
fn test_restore_local_upload_chunk_is_removed() {
    let (mut router, _temp_dir) = create_router_with_master();

    let response = router.handle(&RpcRequest::new(
        "restore:local:uploadChunk",
        serde_json::json!({}),
    ));
    assert_rpc_error(&response, "UNKNOWN_COMMAND");
}

#[test]
fn test_restore_local_rejects_wrong_restore_id() {
    let (mut router, temp_dir) = create_router_with_master();

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
    assert_rpc_error_message(&commit, "NODE_NOT_FOUND", "restore_id not found");
}

#[test]
fn test_restore_local_validate_missing_metadata_or_chunks_is_invalid() {
    let (mut router, _temp_dir) = create_router_with_master();

    let backup_dir = TempDir::new().expect("backup dir");

    // No metadata.enc, chunks.manifest.json, or chunks.pack.
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
    let upload_req = RpcRequest::new(
        "catalog:upload",
        serde_json::json!({
            "parent_path": "/",
            "name": "seed.bin",
            "total_size": data.len() as u64,
            "size": data.len(),
            "offset": 0,
            "mime_type": "application/octet-stream",
        }),
    );
    match router.handle_with_stream(&upload_req, Some(RpcInputStream::from_bytes(data))) {
        RpcReply::Json(r) => assert_rpc_ok(&r),
        RpcReply::Stream(_) | RpcReply::RangeStream(_) => {
            panic!("catalog:upload must return JSON response")
        }
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
    assert_rpc_error_message(&bad, "NODE_NOT_FOUND", "backup_id not found");
}

#[test]
fn test_backup_local_download_chunk_out_of_range_is_typed_error() {
    let (mut router, _temp_dir) = create_router_with_master();
    unlock_vault(&mut router, "vault_password");

    // Create at least one chunk.
    let data = b"seed chunk for range test".to_vec();
    let upload_req = RpcRequest::new(
        "catalog:upload",
        serde_json::json!({
            "parent_path": "/",
            "name": "seed2.bin",
            "total_size": data.len() as u64,
            "size": data.len(),
            "offset": 0,
            "mime_type": "application/octet-stream",
        }),
    );
    match router.handle_with_stream(&upload_req, Some(RpcInputStream::from_bytes(data))) {
        RpcReply::Json(r) => assert_rpc_ok(&r),
        RpcReply::Stream(_) | RpcReply::RangeStream(_) => {
            panic!("catalog:upload must return JSON response")
        }
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
    assert_rpc_error_message(&response, "NODE_NOT_FOUND", "chunk_index out of range");
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

    assert_rpc_error_message(&commit, "RESTORE_INVALID_FORMAT", "Invalid base64");
}

#[test]
fn test_restore_local_start_rejects_concurrent_restore() {
    let (mut router, _temp_dir) = create_router_with_master();

    let first = router.handle(&RpcRequest::new(
        "restore:local:start",
        serde_json::json!({"backup_path": "/tmp/backup"}),
    ));
    assert_rpc_ok(&first);

    let second = router.handle(&RpcRequest::new(
        "restore:local:start",
        serde_json::json!({"backup_path": "/tmp/backup-2"}),
    ));
    assert_rpc_error_message(
        &second,
        "BACKUP_ALREADY_IN_PROGRESS",
        "Restore already in progress",
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
    let upload0 = upload_synthetic_restore_pack(
        &mut router,
        &restore_id,
        &[(
            "0123456789abcdef0123456789abcdef0123456789abcdef0123456789abcdef",
            chunk0.as_slice(),
        )],
    );
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
    assert_rpc_error_message(&commit, "RESTORE_INVALID_FORMAT", "Missing chunks");
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
    let upload0 = upload_synthetic_restore_pack(
        &mut router,
        &restore_id,
        &[(
            "0123456789abcdef0123456789abcdef0123456789abcdef0123456789abcdef",
            chunk0.as_slice(),
        )],
    );
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
    let upload0 = upload_synthetic_restore_pack(
        &mut router,
        &restore_id,
        &[(
            "0123456789abcdef0123456789abcdef0123456789abcdef0123456789abcdef",
            chunk0.as_slice(),
        )],
    );
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
    assert_rpc_error_message(
        &commit,
        "RESTORE_VERSION_NOT_SUPPORTED",
        "Restore version not supported",
    );
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
    let upload0 = upload_synthetic_restore_pack(
        &mut router,
        &restore_id,
        &[(
            "0123456789abcdef0123456789abcdef0123456789abcdef0123456789abcdef",
            chunk0.as_slice(),
        )],
    );
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
    assert_eq!(commit.error_message(), Some("Invalid master password"));
}

#[test]
fn test_restore_local_upload_pack_roundtrip_progress_counts() {
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

    // Upload two chunks and expect received_chunks to match the manifest.
    let chunk0 = b"chunk0".to_vec();
    let chunk1 = b"chunk1".to_vec();

    let upload1 = upload_synthetic_restore_pack(
        &mut router,
        &restore_id,
        &[
            (
                "0123456789abcdef0123456789abcdef0123456789abcdef0123456789abcdef",
                chunk0.as_slice(),
            ),
            (
                "abcdef0123456789abcdef0123456789abcdef0123456789abcdef0123456789",
                chunk1.as_slice(),
            ),
        ],
    );
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
    assert_rpc_error_message(&response, "NODE_NOT_FOUND", "backup_id not found");
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

    let metadata = router.handle(&RpcRequest::new(
        "backup:local:getMetadata",
        serde_json::json!({"backup_id": backup_id.clone()}),
    ));
    assert_rpc_ok(&metadata);

    let cancel = router.handle(&RpcRequest::new(
        "backup:local:cancel",
        serde_json::json!({"backup_id": backup_id.clone()}),
    ));
    assert_rpc_ok(&cancel);
    let cancel_result = cancel.result().unwrap();
    assert_eq!(
        cancel_result.get("cancelled").and_then(|v| v.as_bool()),
        Some(true)
    );

    let after_cancel = router.handle(&RpcRequest::new(
        "backup:local:getMetadata",
        serde_json::json!({"backup_id": backup_id}),
    ));
    assert_rpc_error_message(&after_cancel, "NODE_NOT_FOUND", "backup_id not found");

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
    let upload =
        upload_synthetic_restore_pack(&mut router, &restore_id, &[(chunk_name, b"chunk-data")]);
    assert_rpc_ok(&upload);

    let storage = Storage::new(temp_dir.path()).expect("storage");
    assert_eq!(
        storage
            .chunk_exists(chunk_name)
            .expect("chunk_exists before cancel"),
        true
    );

    let wrong_cancel = router.handle(&RpcRequest::new(
        "restore:local:cancel",
        serde_json::json!({"restore_id": "restore-wrong"}),
    ));
    assert_rpc_error_message(&wrong_cancel, "NODE_NOT_FOUND", "restore_id not found");
    assert_eq!(
        storage
            .chunk_exists(chunk_name)
            .expect("chunk still exists after wrong cancel"),
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
    assert_rpc_error_message(&commit, "NODE_NOT_FOUND", "restore_id not found");
}

#[test]
fn test_backup_local_start_requires_unlocked_vault() {
    // No unlock: backup must refuse rather than exposing the encrypted store
    // and master salt/verifier to an unauthenticated caller.
    let (mut router, _dir) = create_router_with_master();
    let start = router.handle(&RpcRequest::new(
        "backup:local:start",
        serde_json::json!({}),
    ));
    assert_rpc_error(&start, "VAULT_REQUIRED");
}

#[test]
fn test_restore_local_upload_pack_rejects_oversized_chunk_size() {
    let (mut source_router, _source_dir) = create_router_with_master();
    unlock_vault(&mut source_router, "vault_password");
    upload_test_file(&mut source_router, "seed.bin", b"oversize seed".to_vec());
    let (backup_id, _estimated_size, _chunk_count) = start_backup(&mut source_router);
    let manifest = get_chunk_manifest(&mut source_router, &backup_id);
    let pack = download_backup_pack(&mut source_router, &backup_id);

    // Declare an absurd per-chunk size; validate() must reject before any
    // buffer allocation (DoS guard).
    let mut oversized = manifest.clone();
    let huge = 1024_u64 * 1024 * 1024 * 1024; // 1 TiB, well over the 512 MiB cap
    oversized["chunks"][0]["size"] = serde_json::json!(huge);
    let original: u64 = manifest["chunks"][0]["size"].as_u64().unwrap();
    oversized["total_size"] = serde_json::json!(manifest["total_size"]
        .as_u64()
        .unwrap()
        .saturating_sub(original)
        .saturating_add(huge));

    let (mut target_router, _target_dir) = create_router_with_master();
    let restore_id = start_restore(&mut target_router);
    let response = upload_backup_pack(&mut target_router, &restore_id, oversized, pack);
    assert_rpc_error(&response, "RESTORE_INVALID_FORMAT");
}
