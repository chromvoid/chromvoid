//! ADR-012 vault:export:* (target contract)

mod test_helpers;

use base64::{engine::general_purpose, Engine as _};
use chromvoid_core::rpc::types::RpcRequest;
use test_helpers::*;

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
