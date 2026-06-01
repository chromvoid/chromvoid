//! ADR-012 vault:export:* (target contract)

mod test_helpers;

use base64::{engine::general_purpose, Engine as _};
use chromvoid_core::rpc::types::{RpcRequest, RpcResponse};
use chromvoid_core::rpc::RpcReply;
use std::io::Read;
use std::time::Duration;
use test_helpers::*;

fn start_export(router: &mut chromvoid_core::rpc::RpcRouter, include_otp_secrets: bool) -> String {
    let start = router.handle(&RpcRequest::new(
        "vault:export:start",
        serde_json::json!({
            "vault_id": "default",
            "include_otp_secrets": include_otp_secrets,
        }),
    ));
    assert_rpc_ok(&start);
    start
        .result()
        .unwrap()
        .get("export_id")
        .and_then(|value| value.as_str())
        .expect("export_id")
        .to_string()
}

fn download_export_stream(router: &mut chromvoid_core::rpc::RpcRouter, export_id: &str) -> Vec<u8> {
    match router.handle_with_stream(
        &RpcRequest::new(
            "vault:export:download",
            serde_json::json!({"export_id": export_id}),
        ),
        None,
    ) {
        RpcReply::Stream(mut stream) => {
            let mut bytes = Vec::new();
            stream
                .reader
                .read_to_end(&mut bytes)
                .expect("read export stream");
            bytes
        }
        RpcReply::Json(response) => panic!("expected export stream, got JSON: {:?}", response),
        RpcReply::RangeStream(_) => panic!("expected export stream, got range stream"),
    }
}

fn bytes_contain(haystack: &[u8], needle: &[u8]) -> bool {
    haystack
        .windows(needle.len())
        .any(|window| window == needle)
}

fn assert_rpc_error_message(response: &RpcResponse, expected_code: &str, expected_message: &str) {
    assert_rpc_error(response, expected_code);
    assert_eq!(response.error_message(), Some(expected_message));
}

fn assert_rpc_error_message_prefix(
    response: &RpcResponse,
    expected_code: &str,
    expected_prefix: &str,
) {
    assert_rpc_error(response, expected_code);
    let message = response.error_message().expect("error message");
    assert!(
        message.starts_with(expected_prefix),
        "expected message prefix {expected_prefix:?}, got {message:?}"
    );
}

#[test]
fn test_vault_export_contract() {
    let (mut router, _temp_dir) = create_test_router();
    unlock_vault(&mut router, "vault_password");

    // In target architecture vault:export allows data recovery from an unlocked vault.
    let start = router.handle(&RpcRequest::new(
        "vault:export:start",
        serde_json::json!({"vault_id": "default", "include_otp_secrets": false}),
    ));
    assert_rpc_ok(&start);

    let start_result = start.result().unwrap();
    assert!(start_result.get("estimated_size").is_some());
    assert!(start_result.get("file_count").is_some());

    let estimated_size = start_result
        .get("estimated_size")
        .and_then(|v| v.as_u64())
        .expect("estimated_size");
    let start_file_count = start_result
        .get("file_count")
        .and_then(|v| v.as_u64())
        .expect("file_count");

    let export_id = start
        .result()
        .unwrap()
        .get("export_id")
        .expect("export_id")
        .as_str()
        .expect("export_id string")
        .to_string();

    let mut downloaded: Vec<u8> = Vec::new();
    for i in 0u64.. {
        let chunk = router.handle(&RpcRequest::new(
            "vault:export:downloadChunk",
            serde_json::json!({"export_id": export_id.clone(), "chunk_index": i}),
        ));
        assert_rpc_ok(&chunk);
        let r = chunk.result().unwrap();
        assert_eq!(r.get("chunk_index").and_then(|v| v.as_u64()), Some(i));
        let data_b64 = r.get("data").and_then(|v| v.as_str()).expect("data");
        let bytes = general_purpose::STANDARD
            .decode(data_b64)
            .expect("base64 decode");
        downloaded.extend_from_slice(&bytes);

        let is_last = r.get("is_last").and_then(|v| v.as_bool()).expect("is_last");
        if is_last {
            break;
        }
    }

    assert!(
        downloaded.len() >= 1024,
        "tar archive should include end-of-archive blocks"
    );
    assert_eq!(downloaded.len() as u64, estimated_size);

    let finish = router.handle(&RpcRequest::new(
        "vault:export:finish",
        serde_json::json!({"export_id": export_id}),
    ));
    assert_rpc_ok(&finish);
    let fr = finish.result().unwrap();
    assert!(fr.get("file_hash").is_some());
    assert!(fr.get("file_count").is_some());
    assert!(fr.get("included_otp_secrets").is_some());

    let file_hash = fr
        .get("file_hash")
        .and_then(|v| v.as_str())
        .expect("file_hash");
    assert_eq!(file_hash.len(), 64);
    assert_ne!(file_hash, "0".repeat(64));

    let expected_hash = chromvoid_core::crypto::sha256_hex(&downloaded);
    assert_eq!(file_hash, expected_hash);

    let finish_file_count = fr
        .get("file_count")
        .and_then(|v| v.as_u64())
        .expect("file_count");
    assert_eq!(finish_file_count, start_file_count);
}

#[test]
fn test_vault_export_locked_requires_unlock() {
    let (mut router, _temp_dir) = create_test_router();

    let response = router.handle(&RpcRequest::new(
        "vault:export:start",
        serde_json::json!({"vault_id": "default", "include_otp_secrets": false}),
    ));
    assert_rpc_error(&response, "VAULT_NOT_UNLOCKED");
}

#[test]
fn test_vault_export_otp_secrets_requires_master_password() {
    let (mut router, _temp_dir) = create_test_router();
    unlock_vault(&mut router, "vault_password");

    let response = router.handle(&RpcRequest::new(
        "vault:export:start",
        serde_json::json!({"vault_id": "default", "include_otp_secrets": true}),
    ));

    assert_rpc_error(&response, "VAULT_EXPORT_MASTER_PASSWORD_REQUIRED");
}

#[test]
fn test_vault_export_required_field_messages_remain_stable() {
    let (mut router, _temp_dir) = create_test_router();
    unlock_vault(&mut router, "vault_password");

    let missing_vault_id = router.handle(&RpcRequest::new(
        "vault:export:start",
        serde_json::json!({"include_otp_secrets": false}),
    ));
    assert_rpc_error_message(&missing_vault_id, "EMPTY_PAYLOAD", "vault_id is required");

    let missing_chunk_export_id = router.handle(&RpcRequest::new(
        "vault:export:downloadChunk",
        serde_json::json!({"chunk_index": 0}),
    ));
    assert_rpc_error_message(
        &missing_chunk_export_id,
        "EMPTY_PAYLOAD",
        "export_id is required",
    );

    let missing_chunk_index = router.handle(&RpcRequest::new(
        "vault:export:downloadChunk",
        serde_json::json!({"export_id": "export-missing"}),
    ));
    assert_rpc_error_message(
        &missing_chunk_index,
        "EMPTY_PAYLOAD",
        "chunk_index is required",
    );

    let missing_finish_export_id = router.handle(&RpcRequest::new(
        "vault:export:finish",
        serde_json::json!({}),
    ));
    assert_rpc_error_message(
        &missing_finish_export_id,
        "EMPTY_PAYLOAD",
        "export_id is required",
    );
}

#[test]
fn test_vault_export_chunk_out_of_range_preserves_active_session() {
    let (mut router, _temp_dir) = create_test_router();
    unlock_vault(&mut router, "vault_password");

    let export_id = start_export(&mut router, false);
    let out_of_range = router.handle(&RpcRequest::new(
        "vault:export:downloadChunk",
        serde_json::json!({"export_id": export_id, "chunk_index": 999_999}),
    ));
    assert_rpc_error_message(&out_of_range, "NODE_NOT_FOUND", "chunk_index out of range");

    let finish = router.handle(&RpcRequest::new(
        "vault:export:finish",
        serde_json::json!({"export_id": export_id}),
    ));
    assert_rpc_ok(&finish);
}

#[test]
fn test_vault_export_expired_session_allows_new_start_and_rejects_finish() {
    let (router, _temp_dir) = create_test_router();
    let mut router = router.with_long_running_session_idle_ttl_ms(1);
    unlock_vault(&mut router, "vault_password");

    let start = router.handle(&RpcRequest::new(
        "vault:export:start",
        serde_json::json!({"vault_id": "default", "include_otp_secrets": false}),
    ));
    assert_rpc_ok(&start);
    let export_id = start
        .result()
        .unwrap()
        .get("export_id")
        .and_then(|value| value.as_str())
        .expect("export_id")
        .to_string();

    std::thread::sleep(Duration::from_millis(2));
    let finish = router.handle(&RpcRequest::new(
        "vault:export:finish",
        serde_json::json!({"export_id": export_id}),
    ));
    assert_rpc_error_message(&finish, "NODE_NOT_FOUND", "export_id not found");

    let restart = router.handle(&RpcRequest::new(
        "vault:export:start",
        serde_json::json!({"vault_id": "default", "include_otp_secrets": false}),
    ));
    assert_rpc_ok(&restart);
}

#[test]
fn test_vault_export_finish_wrong_id_preserves_active_session() {
    let (mut router, _temp_dir) = create_test_router();
    unlock_vault(&mut router, "vault_password");

    let export_id = start_export(&mut router, false);

    let wrong_finish = router.handle(&RpcRequest::new(
        "vault:export:finish",
        serde_json::json!({"export_id": "export-wrong"}),
    ));
    assert_rpc_error_message(&wrong_finish, "NODE_NOT_FOUND", "export_id not found");

    let finish = router.handle(&RpcRequest::new(
        "vault:export:finish",
        serde_json::json!({"export_id": export_id}),
    ));
    assert_rpc_ok(&finish);
}

#[test]
fn test_vault_export_stream_wrong_id_returns_json_and_preserves_active_session() {
    let (mut router, _temp_dir) = create_test_router();
    unlock_vault(&mut router, "vault_password");

    let export_id = start_export(&mut router, false);
    let wrong_download = router.handle_with_stream(
        &RpcRequest::new(
            "vault:export:download",
            serde_json::json!({"export_id": "export-wrong"}),
        ),
        None,
    );
    match wrong_download {
        RpcReply::Json(response) => {
            assert_rpc_error_message(&response, "NODE_NOT_FOUND", "export_id not found")
        }
        RpcReply::Stream(_) => panic!("expected JSON error, got stream"),
        RpcReply::RangeStream(_) => panic!("expected JSON error, got range stream"),
    }

    let finish = router.handle(&RpcRequest::new(
        "vault:export:finish",
        serde_json::json!({"export_id": export_id}),
    ));
    assert_rpc_ok(&finish);
}

#[test]
fn test_vault_export_stream_uses_start_time_snapshot() {
    let (mut router, _temp_dir) = create_test_router();
    unlock_vault(&mut router, "vault_password");

    let after_bytes = b"phase28-vault-export-after-snapshot".to_vec();

    let export_id = start_export(&mut router, false);
    upload_file(&mut router, None, "after.txt", after_bytes.clone(), None);

    let export_bytes = download_export_stream(&mut router, &export_id);
    assert!(!bytes_contain(&export_bytes, &after_bytes));
}

#[test]
fn test_vault_export_otp_success_preserves_finish_metadata() {
    let (router, _temp_dir) = create_test_router();
    let mut router = router.with_master_key("master_password");
    unlock_vault(&mut router, "vault_password");

    let export_id = start_export(&mut router, true);
    let finish = router.handle(&RpcRequest::new(
        "vault:export:finish",
        serde_json::json!({"export_id": export_id}),
    ));
    assert_rpc_ok(&finish);
    assert_eq!(
        finish
            .result()
            .unwrap()
            .get("included_otp_secrets")
            .and_then(|value| value.as_bool()),
        Some(true)
    );
}

#[test]
fn test_vault_export_start_cleans_stale_storage_temp_files() {
    let (mut router, temp_dir) = create_test_router();
    unlock_vault(&mut router, "vault_password");

    let storage_temp_dir = temp_dir.path().join(".storage-tmp").join("vault-export");
    std::fs::create_dir_all(&storage_temp_dir).expect("storage export temp dir");
    let namespaced_stale = storage_temp_dir.join("chromvoid-export-stale.tar");
    std::fs::write(&namespaced_stale, b"stale").expect("namespaced stale temp file");

    let export_temp_dir = temp_dir.path().join(".vault-export-tmp");
    std::fs::create_dir_all(&export_temp_dir).expect("export temp dir");
    let legacy_stale = export_temp_dir.join("chromvoid-export-stale.tar");
    std::fs::write(&legacy_stale, b"stale").expect("legacy stale temp file");

    let start = router.handle(&RpcRequest::new(
        "vault:export:start",
        serde_json::json!({"vault_id": "default", "include_otp_secrets": false}),
    ));
    assert_rpc_ok(&start);
    assert!(
        !namespaced_stale.exists(),
        "namespaced export temp file should be removed"
    );
    assert!(
        !legacy_stale.exists(),
        "legacy export temp file should be removed"
    );
}

#[test]
fn test_vault_export_broken_temp_artifact_clears_session_and_allows_restart() {
    let (mut router, temp_dir) = create_test_router();
    unlock_vault(&mut router, "vault_password");

    let export_id = start_export(&mut router, false);
    let storage_temp_dir = temp_dir.path().join(".storage-tmp").join("vault-export");
    let mut removed = 0;
    for entry in std::fs::read_dir(&storage_temp_dir).expect("storage export temp dir") {
        let path = entry.expect("storage temp entry").path();
        let file_name = path.file_name().and_then(|value| value.to_str());
        if matches!(file_name, Some(name) if name.starts_with("chromvoid-export-") && name.ends_with(".tar"))
        {
            std::fs::remove_file(&path).expect("remove export temp artifact");
            removed += 1;
        }
    }
    assert!(removed > 0, "expected an active export temp artifact");

    let broken_chunk = router.handle(&RpcRequest::new(
        "vault:export:downloadChunk",
        serde_json::json!({"export_id": export_id, "chunk_index": 0}),
    ));
    assert_rpc_error_message_prefix(
        &broken_chunk,
        "INTERNAL_ERROR",
        "Failed to open export file:",
    );

    let finish = router.handle(&RpcRequest::new(
        "vault:export:finish",
        serde_json::json!({"export_id": export_id}),
    ));
    assert_rpc_error(&finish, "NODE_NOT_FOUND");

    let restart = router.handle(&RpcRequest::new(
        "vault:export:start",
        serde_json::json!({"vault_id": "default", "include_otp_secrets": false}),
    ));
    assert_rpc_ok(&restart);
}
