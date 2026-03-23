mod test_helpers;

use chromvoid_core::rpc::types::RpcRequest;
use chromvoid_core::rpc::RpcRouter;
use chromvoid_core::rpc::{RpcInputStream, RpcReply};
use std::io::Read;
use test_helpers::*;

fn prepare_upload(
    router: &mut RpcRouter,
    name: &str,
    size: u64,
    parent_path: Option<&str>,
) -> chromvoid_core::rpc::types::RpcResponse {
    let mut data = serde_json::json!({
        "name": name,
        "size": size,
    });
    if let Some(path) = parent_path {
        data["parent_path"] = serde_json::json!(path);
    }
    router.handle(&RpcRequest::new("catalog:prepareUpload", data))
}

fn secret_write_start(
    router: &mut RpcRouter,
    node_id: u64,
    size: u64,
) -> chromvoid_core::rpc::types::RpcResponse {
    // ADR-004: catalog:secret:write is STREAM (JSON part: node_id, size)
    router.handle(&RpcRequest::new(
        "catalog:secret:write",
        serde_json::json!({
            "node_id": node_id,
            "size": size,
        }),
    ))
}

fn secret_read_start(
    router: &mut RpcRouter,
    node_id: u64,
) -> chromvoid_core::rpc::types::RpcResponse {
    // ADR-004: catalog:secret:read is STREAM (response is binary stream)
    router.handle(&RpcRequest::new(
        "catalog:secret:read",
        serde_json::json!({"node_id": node_id}),
    ))
}

fn secret_erase(router: &mut RpcRouter, node_id: u64) -> chromvoid_core::rpc::types::RpcResponse {
    router.handle(&RpcRequest::new(
        "catalog:secret:erase",
        serde_json::json!({"node_id": node_id}),
    ))
}

// ============================================================================
// catalog:secret:write tests (ADR-004: STREAM)
// ============================================================================

#[test]
fn test_secret_write_requires_stream() {
    let (mut router, _temp_dir) = create_test_router();
    unlock_vault(&mut router, "test");

    let response = prepare_upload(&mut router, "password.txt", 100, None);
    let node_id = get_node_id(&response);

    let response = secret_write_start(&mut router, node_id, 100);
    assert_rpc_error(&response, "NO_STREAM");
}

#[test]
fn test_secret_write_missing_node_id() {
    let (mut router, _temp_dir) = create_test_router();
    unlock_vault(&mut router, "test");

    let response = router.handle(&RpcRequest::new(
        "catalog:secret:write",
        serde_json::json!({"size": 1}),
    ));
    assert_rpc_error(&response, "EMPTY_PAYLOAD");
}

#[test]
fn test_secret_write_missing_size() {
    let (mut router, _temp_dir) = create_test_router();
    unlock_vault(&mut router, "test");

    let response = prepare_upload(&mut router, "file.txt", 100, None);
    let node_id = get_node_id(&response);

    let response = router.handle(&RpcRequest::new(
        "catalog:secret:write",
        serde_json::json!({"node_id": node_id}),
    ));
    assert_rpc_error(&response, "EMPTY_PAYLOAD");
}

#[test]
fn test_secret_write_requires_vault() {
    let (mut router, _temp_dir) = create_test_router();

    let response = secret_write_start(&mut router, 1, 1);
    assert_rpc_error(&response, "VAULT_REQUIRED");
}

// ============================================================================
// catalog:secret:read tests (ADR-004: STREAM)
// ============================================================================

#[test]
fn test_secret_read_requires_stream() {
    let (mut router, _temp_dir) = create_test_router();
    unlock_vault(&mut router, "test");

    let response = prepare_upload(&mut router, "creds.json", 100, None);
    let node_id = get_node_id(&response);

    let response = secret_read_start(&mut router, node_id);
    assert_rpc_error(&response, "STREAM_REQUIRED");
}

#[test]
fn test_secret_read_requires_vault() {
    let (mut router, _temp_dir) = create_test_router();

    let response = secret_read_start(&mut router, 1);
    assert_rpc_error(&response, "VAULT_REQUIRED");
}

// ============================================================================
// catalog:secret:write/catalog:secret:read happy path (ADR-004: STREAM)
// ============================================================================

#[test]
fn test_secret_write_read_roundtrip_with_stream() {
    let (mut router, _temp_dir) = create_test_router();
    unlock_vault(&mut router, "test");

    let secret_bytes = b"super secret bytes".to_vec();

    let response = prepare_upload(&mut router, "secret.bin", secret_bytes.len() as u64, None);
    assert_rpc_ok(&response);
    let node_id = get_node_id(&response);

    let write_request = RpcRequest::new(
        "catalog:secret:write",
        serde_json::json!({
            "node_id": node_id,
            "size": secret_bytes.len(),
        }),
    );
    let write_reply = router.handle_with_stream(
        &write_request,
        Some(RpcInputStream::from_bytes(secret_bytes.clone())),
    );
    match write_reply {
        RpcReply::Json(r) => assert_rpc_ok(&r),
        RpcReply::Stream(_) => panic!("catalog:secret:write must return JSON response"),
    }

    let read_request = RpcRequest::new(
        "catalog:secret:read",
        serde_json::json!({
            "node_id": node_id,
        }),
    );
    let read_reply = router.handle_with_stream(&read_request, None);
    match read_reply {
        RpcReply::Stream(mut out) => {
            assert_eq!(out.meta.name, "secret.bin");
            assert_eq!(out.meta.size, secret_bytes.len() as u64);
            assert!(out.meta.chunk_size > 0);

            let mut downloaded = Vec::new();
            out.reader
                .read_to_end(&mut downloaded)
                .expect("read stream");
            assert_eq!(downloaded, secret_bytes);
        }
        RpcReply::Json(r) => panic!("expected stream reply, got JSON: {r:?}"),
    }
}

#[test]
fn test_secret_erase_existing() {
    let (mut router, _temp_dir) = create_test_router();
    unlock_vault(&mut router, "test");

    let response = prepare_upload(&mut router, "to_erase.txt", 100, None);
    let node_id = get_node_id(&response);

    let erase_response = secret_erase(&mut router, node_id);
    assert_rpc_ok(&erase_response);
}

#[test]
fn test_secret_erase_nonexistent() {
    let (mut router, _temp_dir) = create_test_router();
    unlock_vault(&mut router, "test");

    let response = secret_erase(&mut router, 99999);
    assert_rpc_error(&response, "NODE_NOT_FOUND");
}

#[test]
fn test_secret_erase_preserves_node_metadata() {
    let (mut router, _temp_dir) = create_test_router();
    unlock_vault(&mut router, "test");

    let response = prepare_upload(&mut router, "persistent.txt", 100, None);
    let node_id = get_node_id(&response);
    secret_erase(&mut router, node_id);

    let items = get_items(&list_dir(&mut router, "/"));
    let file = find_item_by_name(&items, "persistent.txt");
    assert!(file.is_some());
    assert_eq!(
        file.unwrap().get("node_id").unwrap().as_u64().unwrap(),
        node_id
    );
}
