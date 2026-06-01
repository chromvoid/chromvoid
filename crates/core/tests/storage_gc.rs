mod test_helpers;

use std::sync::Arc;

use chromvoid_core::crypto::keystore::InMemoryKeystore;
use chromvoid_core::crypto::{blob_chunk_name, chunk_name_u64, encrypt, sha256_hex};
use chromvoid_core::rpc::types::{RpcRequest, RpcResponse};
use chromvoid_core::rpc::{RpcInputStream, RpcReply, RpcRouter};
use chromvoid_core::storage::Storage;
use chromvoid_core::vault::Vault;
use test_helpers::{
    assert_rpc_ok, create_test_router, create_test_router_with_keystore, unlock_vault,
};

const ORPHAN_CHUNK_A: &str = "abcabcabcabcabcabcabcabcabcabcabcabcabcabcabcabcabcabcabcabcabca";
const ORPHAN_CHUNK_B: &str = "defdefdefdefdefdefdefdefdefdefdefdefdefdefdefdefdefdefdefdefdefd";
const STORAGE_GC_MANIFEST_CONTEXT: &[u8] = b"admin-storage-gc-delete-manifest:v1";

fn upload_file(router: &mut RpcRouter, name: &str, bytes: &[u8]) -> u64 {
    let reply = router.handle_with_stream(
        &RpcRequest::new(
            "catalog:upload",
            serde_json::json!({
                "parent_path": "/",
                "name": name,
                "total_size": bytes.len(),
                "size": bytes.len(),
                "offset": 0,
                "mime_type": "application/octet-stream",
            }),
        ),
        Some(RpcInputStream::from_bytes(bytes.to_vec())),
    );
    let response = match reply {
        RpcReply::Json(response) => response,
        RpcReply::Stream(_) | RpcReply::RangeStream(_) => panic!("upload must return JSON"),
    };
    assert_rpc_ok(&response);
    response
        .result()
        .and_then(|result| result.get("node_id"))
        .and_then(|value| value.as_u64())
        .expect("upload node_id")
}

fn scan_gc(router: &mut RpcRouter) -> serde_json::Value {
    let scan = router.handle(&RpcRequest::new(
        "admin:storage:gc:scan",
        serde_json::json!({}),
    ));
    assert_rpc_ok(&scan);
    scan.result().expect("scan result").clone()
}

fn assert_rpc_error(response: &RpcResponse, code: &str, message: &str) {
    assert!(!response.is_ok());
    assert_eq!(response.code(), Some(code));
    assert_eq!(response.error_message(), Some(message));
}

fn manifest_name(vault_key: &[u8; chromvoid_core::KEY_SIZE]) -> String {
    chunk_name_u64(vault_key, STORAGE_GC_MANIFEST_CONTEXT, 0)
}

fn candidate_value(storage: &Storage, name: &str) -> serde_json::Value {
    let data = storage.read_chunk(name).expect("read candidate chunk");
    serde_json::json!({
        "name": name,
        "bytes": data.len() as u64,
        "sha256": sha256_hex(&data),
    })
}

fn write_gc_manifest(
    storage: &Storage,
    vault_key: &[u8; chromvoid_core::KEY_SIZE],
    gc_id: &str,
    candidates: Vec<serde_json::Value>,
) {
    let name = manifest_name(vault_key);
    let manifest = serde_json::json!({
        "version": 1,
        "gc_id": gc_id,
        "candidates": candidates,
    });
    let plain = serde_json::to_vec(&manifest).expect("serialize GC manifest");
    let encrypted = encrypt(&plain, vault_key, name.as_bytes()).expect("encrypt GC manifest");
    storage
        .write_chunk_atomic(&name, &encrypted)
        .expect("write GC manifest");
    storage.sync().expect("sync GC manifest");
}

fn vault_key_for(
    storage: &Storage,
    keystore: &Arc<InMemoryKeystore>,
) -> [u8; chromvoid_core::KEY_SIZE] {
    let session =
        Vault::unlock_with_keystore(storage, "pw", Some(keystore.as_ref())).expect("unlock vault");
    *session.vault_key()
}

#[test]
fn storage_gc_public_error_contracts() {
    let (mut router, _temp_dir) = create_test_router();

    let locked_scan = router.handle(&RpcRequest::new(
        "admin:storage:gc:scan",
        serde_json::json!({}),
    ));
    assert_rpc_error(&locked_scan, "VAULT_REQUIRED", "Vault not unlocked");

    let locked_false_confirm = router.handle(&RpcRequest::new(
        "admin:storage:gc:delete",
        serde_json::json!({
            "gc_id": "missing",
            "confirm_delete": false,
        }),
    ));
    assert_rpc_error(
        &locked_false_confirm,
        "ACCESS_DENIED",
        "confirm_delete must be true",
    );

    let locked_delete = router.handle(&RpcRequest::new(
        "admin:storage:gc:delete",
        serde_json::json!({
            "gc_id": "missing",
            "confirm_delete": true,
        }),
    ));
    assert_rpc_error(&locked_delete, "VAULT_REQUIRED", "Vault not unlocked");

    assert_rpc_ok(&unlock_vault(&mut router, "pw"));

    let missing_gc_id = router.handle(&RpcRequest::new(
        "admin:storage:gc:delete",
        serde_json::json!({ "confirm_delete": true }),
    ));
    assert_rpc_error(&missing_gc_id, "EMPTY_PAYLOAD", "gc_id is required");

    let missing_confirm_delete = router.handle(&RpcRequest::new(
        "admin:storage:gc:delete",
        serde_json::json!({ "gc_id": "missing" }),
    ));
    assert_rpc_error(
        &missing_confirm_delete,
        "EMPTY_PAYLOAD",
        "confirm_delete is required",
    );

    let false_confirm = router.handle(&RpcRequest::new(
        "admin:storage:gc:delete",
        serde_json::json!({
            "gc_id": "missing",
            "confirm_delete": false,
        }),
    ));
    assert_rpc_error(
        &false_confirm,
        "ACCESS_DENIED",
        "confirm_delete must be true",
    );

    let missing_scan = router.handle(&RpcRequest::new(
        "admin:storage:gc:delete",
        serde_json::json!({
            "gc_id": "missing",
            "confirm_delete": true,
        }),
    ));
    assert_rpc_error(&missing_scan, "NODE_NOT_FOUND", "GC scan not found");
}

#[test]
fn storage_gc_scan_and_delete_removes_verified_orphan_only() {
    let (mut router, temp_dir) = create_test_router();
    assert_rpc_ok(&unlock_vault(&mut router, "pw"));
    upload_file(&mut router, "live.bin", b"live bytes");

    let storage = Storage::new(temp_dir.path()).expect("storage");
    storage
        .write_chunk_atomic(ORPHAN_CHUNK_A, b"orphan bytes")
        .expect("write orphan");
    let before_delete_chunk_count = storage.list_chunks().expect("list chunks").len();

    let scan_result = scan_gc(&mut router);
    let candidates = scan_result
        .get("candidates")
        .and_then(|value| value.as_array())
        .expect("candidates");
    assert!(candidates.iter().any(|candidate| candidate
        .get("name")
        .and_then(|value| value.as_str())
        == Some(ORPHAN_CHUNK_A)));
    assert!(!candidates
        .iter()
        .any(
            |candidate| candidate.get("name").and_then(|value| value.as_str()) == Some("live.bin")
        ));

    let gc_id = scan_result
        .get("gc_id")
        .and_then(|value| value.as_str())
        .expect("gc_id");
    let deleted = router.handle(&RpcRequest::new(
        "admin:storage:gc:delete",
        serde_json::json!({
            "gc_id": gc_id,
            "confirm_delete": true,
        }),
    ));
    assert_rpc_ok(&deleted);
    let deleted_chunks = deleted
        .result()
        .and_then(|result| result.get("deleted_chunks"))
        .and_then(|value| value.as_array())
        .expect("deleted chunks");
    assert!(deleted_chunks
        .iter()
        .any(|value| value.as_str() == Some(ORPHAN_CHUNK_A)));
    assert!(!storage.chunk_exists(ORPHAN_CHUNK_A).expect("exists"));
    assert_eq!(
        storage.list_chunks().expect("list chunks").len() + 1,
        before_delete_chunk_count,
        "delete manifest must be removed after successful GC delete"
    );
}

#[test]
fn storage_gc_delete_skips_candidate_changed_after_scan() {
    let (mut router, temp_dir) = create_test_router();
    assert_rpc_ok(&unlock_vault(&mut router, "pw"));

    let storage = Storage::new(temp_dir.path()).expect("storage");
    storage
        .write_chunk_atomic(ORPHAN_CHUNK_B, b"old orphan")
        .expect("write orphan");
    let scan_result = scan_gc(&mut router);
    let gc_id = scan_result
        .get("gc_id")
        .and_then(|value| value.as_str())
        .expect("gc_id")
        .to_string();

    storage
        .write_chunk_atomic(ORPHAN_CHUNK_B, b"changed orphan")
        .expect("rewrite orphan");

    let deleted = router.handle(&RpcRequest::new(
        "admin:storage:gc:delete",
        serde_json::json!({
            "gc_id": gc_id,
            "confirm_delete": true,
        }),
    ));
    assert_rpc_ok(&deleted);
    let skipped_chunks = deleted
        .result()
        .and_then(|result| result.get("skipped_chunks"))
        .and_then(|value| value.as_array())
        .expect("skipped chunks");
    assert!(skipped_chunks
        .iter()
        .any(|value| value.as_str() == Some(ORPHAN_CHUNK_B)));
    assert!(storage.chunk_exists(ORPHAN_CHUNK_B).expect("exists"));
}

#[test]
fn storage_gc_expired_scan_cannot_delete() {
    let (router, temp_dir) = create_test_router();
    let mut router = router.with_storage_gc_scan_idle_ttl_ms(0);
    assert_rpc_ok(&unlock_vault(&mut router, "pw"));

    let storage = Storage::new(temp_dir.path()).expect("storage");
    storage
        .write_chunk_atomic(ORPHAN_CHUNK_A, b"old orphan")
        .expect("write orphan");
    let scan_result = scan_gc(&mut router);
    let gc_id = scan_result
        .get("gc_id")
        .and_then(|value| value.as_str())
        .expect("gc_id")
        .to_string();

    std::thread::sleep(std::time::Duration::from_millis(2));
    let deleted = router.handle(&RpcRequest::new(
        "admin:storage:gc:delete",
        serde_json::json!({
            "gc_id": gc_id,
            "confirm_delete": true,
        }),
    ));
    assert_rpc_error(&deleted, "NODE_NOT_FOUND", "GC scan not found");
    assert!(storage.chunk_exists(ORPHAN_CHUNK_A).expect("exists"));
}

#[test]
fn storage_gc_leftover_manifest_recovers_on_unlock() {
    let (mut router, temp_dir, keystore) = create_test_router_with_keystore();
    assert_rpc_ok(&unlock_vault(&mut router, "pw"));

    let storage = Storage::new(temp_dir.path()).expect("storage");
    storage
        .write_chunk_atomic(ORPHAN_CHUNK_A, b"orphan bytes")
        .expect("write orphan");
    let vault_key = vault_key_for(&storage, &keystore);
    write_gc_manifest(
        &storage,
        &vault_key,
        "storage-gc-recover",
        vec![candidate_value(&storage, ORPHAN_CHUNK_A)],
    );
    let marker = manifest_name(&vault_key);
    assert!(storage.chunk_exists(&marker).expect("manifest exists"));

    let storage = Storage::new(temp_dir.path()).expect("reopen storage");
    let mut reopened = RpcRouter::new(storage).with_keystore(keystore);
    assert_rpc_ok(&unlock_vault(&mut reopened, "pw"));

    let storage = Storage::new(temp_dir.path()).expect("storage");
    assert!(!storage.chunk_exists(ORPHAN_CHUNK_A).expect("orphan gone"));
    assert!(!storage.chunk_exists(&marker).expect("manifest gone"));
}

#[test]
fn storage_gc_recovery_skips_changed_candidate_before_scan() {
    let (mut router, temp_dir, keystore) = create_test_router_with_keystore();
    assert_rpc_ok(&unlock_vault(&mut router, "pw"));

    let storage = Storage::new(temp_dir.path()).expect("storage");
    storage
        .write_chunk_atomic(ORPHAN_CHUNK_B, b"old orphan")
        .expect("write orphan");
    let vault_key = vault_key_for(&storage, &keystore);
    write_gc_manifest(
        &storage,
        &vault_key,
        "storage-gc-changed",
        vec![candidate_value(&storage, ORPHAN_CHUNK_B)],
    );
    storage
        .write_chunk_atomic(ORPHAN_CHUNK_B, b"changed orphan")
        .expect("rewrite orphan");

    let scan_result = scan_gc(&mut router);
    let candidates = scan_result
        .get("candidates")
        .and_then(|value| value.as_array())
        .expect("candidates");
    assert!(storage
        .chunk_exists(ORPHAN_CHUNK_B)
        .expect("orphan remains"));
    assert!(candidates.iter().any(|candidate| candidate
        .get("name")
        .and_then(|value| value.as_str())
        == Some(ORPHAN_CHUNK_B)));
    assert!(!storage
        .chunk_exists(&manifest_name(&vault_key))
        .expect("manifest removed"));
}

#[test]
fn storage_gc_recovery_skips_live_candidate_before_scan() {
    let (mut router, temp_dir, keystore) = create_test_router_with_keystore();
    assert_rpc_ok(&unlock_vault(&mut router, "pw"));
    let node_id = upload_file(&mut router, "live.bin", b"live bytes");

    let storage = Storage::new(temp_dir.path()).expect("storage");
    let vault_key = vault_key_for(&storage, &keystore);
    let live_chunk = blob_chunk_name(
        &vault_key,
        u32::try_from(node_id).expect("node id fits u32"),
        0,
    );
    assert!(storage
        .chunk_exists(&live_chunk)
        .expect("live chunk exists"));
    write_gc_manifest(
        &storage,
        &vault_key,
        "storage-gc-live",
        vec![candidate_value(&storage, &live_chunk)],
    );

    let scan_result = scan_gc(&mut router);
    let candidates = scan_result
        .get("candidates")
        .and_then(|value| value.as_array())
        .expect("candidates");
    assert!(storage
        .chunk_exists(&live_chunk)
        .expect("live chunk remains"));
    assert!(!candidates.iter().any(|candidate| candidate
        .get("name")
        .and_then(|value| value.as_str())
        == Some(live_chunk.as_str())));
    assert!(!storage
        .chunk_exists(&manifest_name(&vault_key))
        .expect("manifest removed"));
}

#[test]
fn storage_gc_corrupt_manifest_cleans_without_deleting_orphan() {
    let (mut router, temp_dir, keystore) = create_test_router_with_keystore();
    assert_rpc_ok(&unlock_vault(&mut router, "pw"));

    let storage = Storage::new(temp_dir.path()).expect("storage");
    storage
        .write_chunk_atomic(ORPHAN_CHUNK_A, b"orphan bytes")
        .expect("write orphan");
    let vault_key = vault_key_for(&storage, &keystore);
    let marker = manifest_name(&vault_key);
    storage
        .write_chunk_atomic(&marker, b"not an encrypted manifest")
        .expect("write corrupt manifest");

    let scan_result = scan_gc(&mut router);
    let candidates = scan_result
        .get("candidates")
        .and_then(|value| value.as_array())
        .expect("candidates");
    assert!(storage
        .chunk_exists(ORPHAN_CHUNK_A)
        .expect("orphan remains"));
    assert!(candidates.iter().any(|candidate| candidate
        .get("name")
        .and_then(|value| value.as_str())
        == Some(ORPHAN_CHUNK_A)));
    assert!(!storage.chunk_exists(&marker).expect("manifest removed"));
}
