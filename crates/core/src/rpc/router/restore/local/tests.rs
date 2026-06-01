use std::collections::HashSet;
use std::fs;
use std::sync::Arc;

use base64::{engine::general_purpose, Engine as _};
use serde_json::json;
use tempfile::TempDir;

use crate::crypto::keystore::InMemoryKeystore;
use crate::crypto::{derive_vault_key, encrypt, hash, StoragePepper};
use crate::rpc::{RpcResponse, RpcRouter};
use crate::storage::Storage;

use super::super::RestoreLocalSession;
use super::cancel::rollback_restore_local;

const CHUNK_A: &str = "aaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaa";
const CHUNK_B: &str = "bbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbb";

fn router_with_master_password(master_password: &str) -> (TempDir, RpcRouter) {
    let temp_dir = TempDir::new().expect("temp dir");
    let storage = Storage::new(temp_dir.path()).expect("storage");
    let keystore = Arc::new(InMemoryKeystore::new());
    let router = RpcRouter::new(storage)
        .with_keystore(keystore)
        .with_master_key(master_password);
    (temp_dir, router)
}

fn portable_metadata_payload(master_password: &str, chunk_count: u64) -> serde_json::Value {
    let master_salt = [3u8; 16];
    let master_key = derive_vault_key(master_password, &master_salt).expect("derive master key");
    let master_verify = hash(&*master_key);
    let mut backup_key_material = Vec::with_capacity(master_key.len() + "local-backup-v2".len());
    backup_key_material.extend_from_slice(&*master_key);
    backup_key_material.extend_from_slice(b"local-backup-v2");
    let backup_key = hash(&backup_key_material);
    let storage_pepper_wrapped =
        StoragePepper::wrap_for_backup([9u8; 32], &backup_key).expect("wrap pepper");
    let metadata_plain = serde_json::to_vec(&json!({
        "v": 2,
        "storage_format_v": 2,
        "vault_salt": general_purpose::STANDARD.encode([1u8; 16]),
        "backup_type": "local",
        "created_at": 1,
        "chunk_count": chunk_count,
        "total_size": 0,
        "storage_pepper_wrapped": general_purpose::STANDARD.encode(storage_pepper_wrapped),
    }))
    .expect("metadata json");
    let metadata_enc =
        encrypt(&metadata_plain, &backup_key, b"metadata.enc:v2").expect("encrypt metadata");

    json!({
        "metadata": general_purpose::STANDARD.encode(metadata_enc),
        "master_salt": general_purpose::STANDARD.encode(master_salt),
        "master_verify": general_purpose::STANDARD.encode(master_verify),
    })
}

fn validate_payload(router: &mut RpcRouter, payload: serde_json::Value) -> serde_json::Value {
    match super::validate::handle_restore_local_validate_payload(router, &payload) {
        RpcResponse::Success { result, .. } => result,
        response => panic!("expected success response, got {response:?}"),
    }
}

fn warnings(result: &serde_json::Value) -> Vec<String> {
    result
        .get("warnings")
        .and_then(|value| value.as_array())
        .expect("warnings")
        .iter()
        .map(|value| value.as_str().expect("warning").to_string())
        .collect()
}

#[test]
fn rollback_restore_local_removes_files_chunks_and_pepper() {
    let temp_dir = TempDir::new().expect("temp dir");
    let storage = Storage::new(temp_dir.path()).expect("storage");
    let keystore = Arc::new(InMemoryKeystore::new());
    let mut router = RpcRouter::new(storage).with_keystore(keystore.clone());

    let chunk_name = "0123456789abcdef0123456789abcdef0123456789abcdef0123456789abcdef".to_string();
    router
        .storage
        .write_chunk(&chunk_name, b"chunk-data")
        .expect("write chunk");
    fs::write(temp_dir.path().join("salt"), b"salt").expect("salt");
    fs::write(temp_dir.path().join("format.version"), b"{}").expect("format.version");
    fs::write(temp_dir.path().join("master.salt"), b"0123456789abcdef").expect("master.salt");
    fs::write(temp_dir.path().join("master.verify"), [7u8; 32]).expect("master.verify");
    crate::crypto::StoragePepper::store(keystore.as_ref(), [9u8; 32]).expect("store pepper");

    router.start_restore_local_session(RestoreLocalSession {
        id: "restore-1".to_string(),
        meta: crate::rpc::router::session_lifecycle::ExpiringSessionMeta::new(1),
        received: HashSet::from([0]),
        chunk_names: HashSet::from([chunk_name.clone()]),
        total_chunks: Some(1),
    });

    rollback_restore_local(&mut router, &HashSet::from([chunk_name.clone()]));

    assert_eq!(
        router
            .storage
            .chunk_exists(&chunk_name)
            .expect("chunk exists after rollback"),
        false
    );
    assert!(!temp_dir.path().join("salt").exists());
    assert!(!temp_dir.path().join("format.version").exists());
    assert!(!temp_dir.path().join("master.salt").exists());
    assert!(!temp_dir.path().join("master.verify").exists());
    assert_eq!(
        crate::crypto::StoragePepper::load(keystore.as_ref()).expect("load pepper"),
        None
    );
    assert!(!router.restore_local_is_active());
}

#[test]
fn validate_payload_requires_metadata() {
    let (_temp_dir, mut router) = router_with_master_password("secret");

    match super::validate::handle_restore_local_validate_payload(
        &mut router,
        &json!({"chunk_names": []}),
    ) {
        RpcResponse::Error { error, .. } => assert_eq!(error, "metadata is required"),
        response => panic!("expected error response, got {response:?}"),
    }
}

#[test]
fn validate_payload_invalid_metadata_base64_returns_report() {
    let (_temp_dir, mut router) = router_with_master_password("secret");

    let result = validate_payload(
        &mut router,
        json!({
            "metadata": "not-base64!!!",
            "chunk_names": [],
        }),
    );

    assert_eq!(result["valid"], false);
    assert_eq!(result["version"], 2);
    assert_eq!(result["chunk_count"], 0);
    assert_eq!(
        warnings(&result),
        vec!["metadata is not valid base64".to_string()]
    );
}

#[test]
fn validate_payload_rejects_bad_chunk_names_and_duplicates() {
    let (_temp_dir, mut router) = router_with_master_password("secret");
    let mut payload = portable_metadata_payload("secret", 2);
    payload["chunk_names"] = json!(["bad-name", CHUNK_A, CHUNK_A]);

    let result = validate_payload(&mut router, payload);
    let warnings = warnings(&result);

    assert_eq!(result["valid"], false);
    assert!(warnings
        .iter()
        .any(|warning| warning == "invalid chunk name: bad-name"));
    assert!(warnings
        .iter()
        .any(|warning| warning == &format!("duplicate chunk name: {CHUNK_A}")));
}

#[test]
fn validate_payload_rejects_wrong_password() {
    let (_temp_dir, mut router) = router_with_master_password("wrong-password");
    let mut payload = portable_metadata_payload("secret", 1);
    payload["chunk_names"] = json!([CHUNK_A]);

    let result = validate_payload(&mut router, payload);
    let warnings = warnings(&result);

    assert_eq!(result["valid"], false);
    assert!(warnings
        .iter()
        .any(|warning| warning == "failed to verify backup master material"));
}

#[test]
fn validate_master_material_rejects_wrong_password_before_chunk_scan() {
    let (_temp_dir, mut router) = router_with_master_password("wrong-password");
    let payload = portable_metadata_payload("secret", 1);

    let result =
        match super::validate::handle_restore_local_validate_master_material(&mut router, &payload)
        {
            RpcResponse::Success { result, .. } => result,
            response => panic!("expected success response, got {response:?}"),
        };
    let warnings = warnings(&result);

    assert_eq!(result["valid"], false);
    assert!(warnings
        .iter()
        .any(|warning| warning == "failed to verify backup master material"));
}

#[test]
fn validate_master_material_accepts_matching_password_without_chunks() {
    let (_temp_dir, mut router) = router_with_master_password("secret");
    let payload = portable_metadata_payload("secret", 1);

    let result =
        match super::validate::handle_restore_local_validate_master_material(&mut router, &payload)
        {
            RpcResponse::Success { result, .. } => result,
            response => panic!("expected success response, got {response:?}"),
        };

    assert_eq!(result["valid"], true);
    assert_eq!(warnings(&result), Vec::<String>::new());
}

#[test]
fn validate_payload_rejects_chunk_count_mismatch() {
    let (_temp_dir, mut router) = router_with_master_password("secret");
    let mut payload = portable_metadata_payload("secret", 2);
    payload["chunk_names"] = json!([CHUNK_A]);

    let result = validate_payload(&mut router, payload);
    let warnings = warnings(&result);

    assert_eq!(result["valid"], false);
    assert_eq!(result["chunk_count"], 1);
    assert!(warnings
        .iter()
        .any(|warning| warning == "chunk_count mismatch: metadata=2, found=1"));
}

#[test]
fn validate_payload_accepts_portable_backup_material() {
    let (_temp_dir, mut router) = router_with_master_password("secret");
    let mut payload = portable_metadata_payload("secret", 2);
    payload["chunk_names"] = json!([CHUNK_A, CHUNK_B]);

    let result = validate_payload(&mut router, payload);

    assert_eq!(result["valid"], true);
    assert_eq!(result["chunk_count"], 2);
    assert!(warnings(&result).is_empty());
}
