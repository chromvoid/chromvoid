//! Integration tests for file operations (upload creation, upload, download)

mod test_helpers;

use chromvoid_core::crypto::keystore::InMemoryKeystore;
use chromvoid_core::rpc::types::{RpcRequest, RpcResponse};
use chromvoid_core::rpc::RpcRouter;
use chromvoid_core::rpc::{RpcInputStream, RpcReply};
use chromvoid_core::storage::Storage;
use std::io::Read;
use std::sync::Arc;
use tempfile::TempDir;
use test_helpers::*;

fn upload_create(
    router: &mut RpcRouter,
    name: &str,
    size: u64,
    parent_path: Option<&str>,
    mime_type: Option<&str>,
) -> chromvoid_core::rpc::types::RpcResponse {
    let mut data = serde_json::json!({
        "parent_path": parent_path.unwrap_or("/"),
        "name": name,
        "total_size": size,
        "size": size,
        "offset": 0,
    });
    if let Some(mime) = mime_type {
        data["mime_type"] = serde_json::json!(mime);
    }
    let reply = router.handle_with_stream(
        &RpcRequest::new("catalog:upload", data),
        Some(RpcInputStream::from_bytes(vec![0; size as usize])),
    );
    match reply {
        RpcReply::Json(response) => response,
        RpcReply::Stream(_) | RpcReply::RangeStream(_) => {
            panic!("catalog:upload must return JSON response")
        }
    }
}

fn get_uploaded_bytes(response: &chromvoid_core::rpc::types::RpcResponse) -> u64 {
    response
        .result()
        .expect("response should have result")
        .get("uploaded_bytes")
        .expect("result should have uploaded_bytes")
        .as_u64()
        .expect("uploaded_bytes should be u64")
}

fn upload_start(
    router: &mut RpcRouter,
    node_id: u64,
    size: u64,
    offset: Option<u64>,
) -> chromvoid_core::rpc::types::RpcResponse {
    // ADR-004: catalog:upload is STREAM (JSON part: node_id, size, offset?)
    let mut data = serde_json::json!({
        "node_id": node_id,
        "size": size,
    });
    if let Some(o) = offset {
        data["offset"] = serde_json::json!(o);
    }
    router.handle(&RpcRequest::new("catalog:upload", data))
}

fn download_start(router: &mut RpcRouter, node_id: u64) -> chromvoid_core::rpc::types::RpcResponse {
    // ADR-004: catalog:download is STREAM (response is binary stream)
    router.handle(&RpcRequest::new(
        "catalog:download",
        serde_json::json!({"node_id": node_id}),
    ))
}

fn assert_rpc_error_message(response: &RpcResponse, expected_code: &str, expected_message: &str) {
    assert_rpc_error(response, expected_code);
    assert_eq!(response.error_message(), Some(expected_message));
}

fn expect_download_stream_error_message(
    router: &mut RpcRouter,
    data: serde_json::Value,
    expected_code: &str,
    expected_message: &str,
) {
    let reply = router.handle_with_stream(&RpcRequest::new("catalog:download", data), None);
    match reply {
        RpcReply::Json(response) => {
            assert_rpc_error_message(&response, expected_code, expected_message);
        }
        RpcReply::Stream(_) | RpcReply::RangeStream(_) => {
            panic!("expected {expected_code} error")
        }
    }
}

// ============================================================================
// catalog:upload creation tests
// ============================================================================

#[test]
fn test_upload_create_creates_file_placeholder() {
    let (mut router, _temp_dir) = create_test_router();
    unlock_vault(&mut router, "test");

    let response = upload_create(&mut router, "document.pdf", 1024, None, None);
    assert_rpc_ok(&response);

    let node_id = get_node_id(&response);
    assert!(node_id > 0);

    let items = get_items(&list_dir(&mut router, "/"));
    let file = find_item_by_name(&items, "document.pdf");
    assert!(file.is_some());
    assert!(!file.unwrap().get("is_dir").unwrap().as_bool().unwrap());
}

#[test]
fn test_upload_create_returns_node_id_and_uploaded_bytes() {
    let (mut router, _temp_dir) = create_test_router();
    unlock_vault(&mut router, "test");

    let response = upload_create(&mut router, "file.txt", 2048, None, None);
    assert_rpc_ok(&response);

    let node_id = get_node_id(&response);
    let uploaded_bytes = get_uploaded_bytes(&response);

    assert!(node_id > 0);
    assert_eq!(uploaded_bytes, 2048);
}

#[test]
fn test_upload_create_with_mime_type() {
    let (mut router, _temp_dir) = create_test_router();
    unlock_vault(&mut router, "test");

    let response = upload_create(&mut router, "image.png", 5000, None, Some("image/png"));
    assert_rpc_ok(&response);

    let items = get_items(&list_dir(&mut router, "/"));
    let file = find_item_by_name(&items, "image.png").unwrap();
    assert_eq!(
        file.get("mime_type").and_then(|v| v.as_str()),
        Some("image/png")
    );
}

#[test]
fn test_upload_create_in_nested_directory() {
    let (mut router, _temp_dir) = create_test_router();
    unlock_vault(&mut router, "test");

    create_dir(&mut router, "documents");
    create_dir_at(&mut router, "/documents", "reports");

    let response = upload_create(
        &mut router,
        "report.pdf",
        1000,
        Some("/documents/reports"),
        Some("application/pdf"),
    );
    assert_rpc_ok(&response);

    let items = get_items(&list_dir(&mut router, "/documents/reports"));
    assert!(find_item_by_name(&items, "report.pdf").is_some());
}

#[test]
fn test_upload_create_duplicate_name_returns_existing() {
    let (mut router, _temp_dir) = create_test_router();
    unlock_vault(&mut router, "test");

    let response1 = upload_create(&mut router, "file.txt", 100, None, None);
    assert_rpc_ok(&response1);
    let node_id1 = get_node_id(&response1);

    let response2 = upload_create(&mut router, "file.txt", 100, None, None);
    assert_rpc_ok(&response2);
    let node_id2 = get_node_id(&response2);

    assert_eq!(
        node_id1, node_id2,
        "should return same node_id for existing file"
    );
}

#[test]
fn test_upload_create_requires_vault() {
    let (mut router, _temp_dir) = create_test_router();

    let response = upload_create(&mut router, "file.txt", 100, None, None);
    assert_rpc_error(&response, "VAULT_REQUIRED");
}

#[test]
fn test_upload_create_invalid_parent_path() {
    let (mut router, _temp_dir) = create_test_router();
    unlock_vault(&mut router, "test");

    let response = upload_create(&mut router, "file.txt", 100, Some("/nonexistent"), None);
    assert_rpc_error(&response, "NODE_NOT_FOUND");
}

#[test]
fn test_upload_create_missing_name() {
    let (mut router, _temp_dir) = create_test_router();
    unlock_vault(&mut router, "test");

    let response = router.handle(&RpcRequest::new(
        "catalog:upload",
        serde_json::json!({"size": 100}),
    ));
    assert_rpc_error(&response, "EMPTY_PAYLOAD");
}

#[test]
fn test_upload_create_missing_size() {
    let (mut router, _temp_dir) = create_test_router();
    unlock_vault(&mut router, "test");

    let response = router.handle(&RpcRequest::new(
        "catalog:upload",
        serde_json::json!({"name": "file.txt"}),
    ));
    assert_rpc_error(&response, "EMPTY_PAYLOAD");
}

#[test]
fn test_upload_create_to_file_fails() {
    let (mut router, _temp_dir) = create_test_router();
    unlock_vault(&mut router, "test");

    upload_create(&mut router, "parent.txt", 100, None, None);

    let response = upload_create(&mut router, "child.txt", 50, Some("/parent.txt"), None);
    assert_rpc_error(&response, "NOT_A_DIR");
}

#[test]
fn test_upload_create_zero_size() {
    let (mut router, _temp_dir) = create_test_router();
    unlock_vault(&mut router, "test");

    let response = upload_create(&mut router, "empty.txt", 0, None, None);
    assert_rpc_ok(&response);

    let items = get_items(&list_dir(&mut router, "/"));
    let file = find_item_by_name(&items, "empty.txt").unwrap();
    assert_eq!(file.get("size").and_then(|v| v.as_u64()), Some(0));
}

#[test]
fn test_partial_large_upload_does_not_create_catalog_placeholder() {
    let (mut router, _temp_dir) = create_test_router();
    unlock_vault(&mut router, "test");

    let large_size = 10 * 1024 * 1024 * 1024u64; // 10 GB
    let first = b"first chunk".to_vec();
    let reply = router.handle_with_stream(
        &RpcRequest::new(
            "catalog:upload",
            serde_json::json!({
                "parent_path": "/",
                "name": "large.bin",
                "total_size": large_size,
                "size": first.len() as u64,
                "offset": 0,
            }),
        ),
        Some(RpcInputStream::from_bytes(first)),
    );
    match reply {
        RpcReply::Json(response) => assert_rpc_ok(&response),
        RpcReply::Stream(_) | RpcReply::RangeStream(_) => {
            panic!("catalog:upload must return JSON response")
        }
    }

    let items = get_items(&list_dir(&mut router, "/"));
    assert!(find_item_by_name(&items, "large.bin").is_none());
}

#[test]
fn test_partial_upload_save_and_reopen_does_not_persist_placeholder() {
    let temp_dir = TempDir::new().expect("temp dir");
    let storage_path = temp_dir.path();
    let keystore = Arc::new(InMemoryKeystore::new());

    {
        let storage = Storage::new(storage_path).expect("storage");
        let mut router = RpcRouter::new(storage).with_keystore(keystore.clone());
        unlock_vault(&mut router, "test");

        let reply = router.handle_with_stream(
            &RpcRequest::new(
                "catalog:upload",
                serde_json::json!({
                    "parent_path": "/",
                    "name": "pending.bin",
                    "total_size": 10,
                    "size": 4,
                    "offset": 0,
                }),
            ),
            Some(RpcInputStream::from_bytes(b"pend".to_vec())),
        );
        match reply {
            RpcReply::Json(response) => assert_rpc_ok(&response),
            RpcReply::Stream(_) | RpcReply::RangeStream(_) => {
                panic!("catalog:upload must return JSON response")
            }
        }
        router.save().expect("unrelated save");
    }

    {
        let storage = Storage::new(storage_path).expect("storage");
        let mut router = RpcRouter::new(storage).with_keystore(keystore);
        unlock_vault(&mut router, "test");
        let items = get_items(&list_dir(&mut router, "/"));
        assert!(find_item_by_name(&items, "pending.bin").is_none());
    }
}

#[test]
fn test_unknown_size_upload_treats_null_total_size_as_pending_until_finish() {
    let (mut router, _temp_dir) = create_test_router();
    unlock_vault(&mut router, "test");

    let data = b"unknown-size".to_vec();
    let first = router.handle_with_stream(
        &RpcRequest::new(
            "catalog:upload",
            serde_json::json!({
                "parent_path": "/",
                "name": "unknown.bin",
                "total_size": serde_json::Value::Null,
                "size": data.len() as u64,
                "offset": 0,
            }),
        ),
        Some(RpcInputStream::from_bytes(data.clone())),
    );
    let node_id = match first {
        RpcReply::Json(response) => {
            assert_rpc_ok(&response);
            get_node_id(&response)
        }
        RpcReply::Stream(_) | RpcReply::RangeStream(_) => {
            panic!("catalog:upload must return JSON response")
        }
    };

    let items = get_items(&list_dir(&mut router, "/"));
    assert!(find_item_by_name(&items, "unknown.bin").is_none());

    let finish = router.handle_with_stream(
        &RpcRequest::new(
            "catalog:upload",
            serde_json::json!({
                "node_id": node_id,
                "size": 0,
                "offset": data.len() as u64,
                "finish": true,
            }),
        ),
        Some(RpcInputStream::from_bytes(Vec::new())),
    );
    match finish {
        RpcReply::Json(response) => assert_rpc_ok(&response),
        RpcReply::Stream(_) | RpcReply::RangeStream(_) => {
            panic!("catalog:upload must return JSON response")
        }
    }

    let download_reply = router.handle_with_stream(
        &RpcRequest::new(
            "catalog:download",
            serde_json::json!({ "node_id": node_id }),
        ),
        None,
    );
    match download_reply {
        RpcReply::Stream(mut out) => {
            let mut downloaded = Vec::new();
            out.reader
                .read_to_end(&mut downloaded)
                .expect("read stream");
            assert_eq!(downloaded, data);
        }
        RpcReply::Json(response) => panic!("expected stream reply, got JSON: {response:?}"),
        RpcReply::RangeStream(_) => panic!("expected full file stream reply"),
    }
}

#[test]
fn test_upload_create_persistence() {
    let temp_dir = TempDir::new().expect("temp dir");
    let storage_path = temp_dir.path();
    let keystore = Arc::new(InMemoryKeystore::new());

    let node_id;
    {
        let storage = Storage::new(storage_path).expect("storage");
        let mut router = RpcRouter::new(storage).with_keystore(keystore.clone());
        unlock_vault(&mut router, "test");

        let response = upload_create(&mut router, "persistent.dat", 500, None, None);
        node_id = get_node_id(&response);

        lock_vault(&mut router);
    }

    {
        let storage = Storage::new(storage_path).expect("storage");
        let mut router = RpcRouter::new(storage).with_keystore(keystore.clone());
        unlock_vault(&mut router, "test");

        let items = get_items(&list_dir(&mut router, "/"));
        let file = find_item_by_name(&items, "persistent.dat").unwrap();
        assert_eq!(file.get("node_id").and_then(|v| v.as_u64()), Some(node_id));
    }
}

#[test]
fn test_upload_create_updates_existing_root_file_size_persists_after_restart() {
    let temp_dir = TempDir::new().expect("temp dir");
    let storage_path = temp_dir.path();
    let keystore = Arc::new(InMemoryKeystore::new());

    let node_id;
    {
        let storage = Storage::new(storage_path).expect("storage");
        let mut router = RpcRouter::new(storage).with_keystore(keystore.clone());
        unlock_vault(&mut router, "test");

        // Create a root-level placeholder (common when an upload is interrupted).
        let response = upload_create(&mut router, "root.bin", 0, None, None);
        assert_rpc_ok(&response);
        node_id = get_node_id(&response);

        // Re-run upload creation with a non-zero declared size; metadata must persist.
        let refreshed = upload_create(&mut router, "root.bin", 1234, None, None);
        assert_rpc_ok(&refreshed);
        assert_eq!(get_node_id(&refreshed), node_id);

        let items = get_items(&list_dir(&mut router, "/"));
        let file = find_item_by_name(&items, "root.bin").unwrap();
        assert_eq!(file.get("size").and_then(|v| v.as_u64()), Some(1234));

        lock_vault(&mut router);
    }

    {
        let storage = Storage::new(storage_path).expect("storage");
        let mut router = RpcRouter::new(storage).with_keystore(keystore.clone());
        unlock_vault(&mut router, "test");

        // Regression: root-level files are shards; size updates must not reset to 0 after unlock.
        let items = get_items(&list_dir(&mut router, "/"));
        let file = find_item_by_name(&items, "root.bin").unwrap();
        assert_eq!(file.get("node_id").and_then(|v| v.as_u64()), Some(node_id));
        assert_eq!(file.get("size").and_then(|v| v.as_u64()), Some(1234));
    }
}

// ============================================================================
// catalog:upload tests (ADR-004: STREAM)
// ============================================================================

#[test]
fn test_upload_requires_stream() {
    let (mut router, _temp_dir) = create_test_router();
    unlock_vault(&mut router, "test");

    let response = upload_create(&mut router, "test.txt", 13, None, None);
    let node_id = get_node_id(&response);

    let upload_response = upload_start(&mut router, node_id, 13, Some(0));
    assert_rpc_error(&upload_response, "NO_STREAM");
    assert_eq!(upload_response.error_message(), Some("No incoming stream"));
}

#[test]
fn test_upload_missing_node_id() {
    let (mut router, _temp_dir) = create_test_router();
    unlock_vault(&mut router, "test");

    let response = router.handle(&RpcRequest::new(
        "catalog:upload",
        serde_json::json!({"size": 1}),
    ));
    assert_rpc_error(&response, "EMPTY_PAYLOAD");
    assert_eq!(response.error_message(), Some("name is required"));
}

#[test]
fn test_upload_missing_size() {
    let (mut router, _temp_dir) = create_test_router();
    unlock_vault(&mut router, "test");

    let response = upload_create(&mut router, "file.txt", 100, None, None);
    let node_id = get_node_id(&response);

    let response = router.handle(&RpcRequest::new(
        "catalog:upload",
        serde_json::json!({"node_id": node_id}),
    ));
    assert_rpc_error(&response, "EMPTY_PAYLOAD");
    assert_eq!(response.error_message(), Some("size is required"));
}

#[test]
fn test_upload_requires_vault() {
    let (mut router, _temp_dir) = create_test_router();

    let response = upload_start(&mut router, 1, 1, Some(0));
    assert_rpc_error(&response, "VAULT_REQUIRED");
}

// ============================================================================
// catalog:download tests (ADR-004: STREAM)
// ============================================================================

#[test]
fn test_download_requires_stream() {
    let (mut router, _temp_dir) = create_test_router();
    unlock_vault(&mut router, "test");

    let response = upload_create(&mut router, "document.pdf", 1024, None, None);
    let node_id = get_node_id(&response);

    let response = download_start(&mut router, node_id);
    assert_rpc_error(&response, "STREAM_REQUIRED");
}

#[test]
fn test_download_missing_node_id() {
    let (mut router, _temp_dir) = create_test_router();
    unlock_vault(&mut router, "test");

    let response = router.handle(&RpcRequest::new("catalog:download", serde_json::json!({})));
    assert_rpc_error_message(&response, "EMPTY_PAYLOAD", "node_id is required");
}

#[test]
fn test_download_requires_vault() {
    let (mut router, _temp_dir) = create_test_router();

    let response = download_start(&mut router, 1);
    assert_rpc_error_message(&response, "VAULT_REQUIRED", "Vault not unlocked");
}

#[test]
fn test_download_stream_error_contracts() {
    let (mut locked_router, _locked_temp_dir) = create_test_router();
    expect_download_stream_error_message(
        &mut locked_router,
        serde_json::json!({"node_id": 1}),
        "VAULT_REQUIRED",
        "Vault not unlocked",
    );

    let (mut router, _temp_dir) = create_test_router();
    unlock_vault(&mut router, "test");
    expect_download_stream_error_message(
        &mut router,
        serde_json::json!({}),
        "EMPTY_PAYLOAD",
        "node_id is required",
    );
    expect_download_stream_error_message(
        &mut router,
        serde_json::json!({"node_id": 999_999_u64}),
        "NODE_NOT_FOUND",
        "Node not found",
    );

    let dir = create_dir(&mut router, "downloads");
    let dir_id = get_node_id(&dir);
    expect_download_stream_error_message(
        &mut router,
        serde_json::json!({"node_id": dir_id}),
        "INTERNAL_ERROR",
        "Node is not a file",
    );
}

// ============================================================================
// catalog:upload/catalog:download happy path (ADR-004: STREAM)
// ============================================================================

#[test]
fn test_upload_download_roundtrip_with_stream() {
    let (mut router, _temp_dir) = create_test_router();
    unlock_vault(&mut router, "test");

    let data = b"hello from stream".to_vec();

    let response = upload_create(
        &mut router,
        "hello.txt",
        data.len() as u64,
        None,
        Some("text/plain"),
    );
    assert_rpc_ok(&response);
    let node_id = get_node_id(&response);

    let upload_request = RpcRequest::new(
        "catalog:upload",
        serde_json::json!({
            "node_id": node_id,
            "size": data.len(),
            "offset": 0,
        }),
    );

    let upload_reply = router.handle_with_stream(
        &upload_request,
        Some(RpcInputStream::from_bytes(data.clone())),
    );
    match upload_reply {
        RpcReply::Json(r) => assert_rpc_ok(&r),
        RpcReply::Stream(_) | RpcReply::RangeStream(_) => {
            panic!("catalog:upload must return JSON response")
        }
    }

    let download_request = RpcRequest::new(
        "catalog:download",
        serde_json::json!({
            "node_id": node_id,
        }),
    );

    let download_reply = router.handle_with_stream(&download_request, None);
    match download_reply {
        RpcReply::Stream(mut out) => {
            assert_eq!(out.meta.name, "hello.txt");
            assert_eq!(out.meta.mime_type, "text/plain");
            assert_eq!(out.meta.size, data.len() as u64);
            assert!(out.meta.chunk_size > 0);

            let mut downloaded = Vec::new();
            out.reader
                .read_to_end(&mut downloaded)
                .expect("read stream");
            assert_eq!(downloaded, data);
        }
        RpcReply::Json(r) => panic!("expected stream reply, got JSON: {r:?}"),
        RpcReply::RangeStream(_) => panic!("expected full file stream reply"),
    }
}

#[test]
fn test_upload_create_chunk_size_affects_download_meta() {
    let (mut router, _temp_dir) = create_test_router();
    unlock_vault(&mut router, "test");

    let data = b"hello".to_vec();
    let chunk_size: u32 = 8;

    let upload_request = RpcRequest::new(
        "catalog:upload",
        serde_json::json!({
            "parent_path": "/",
            "name": "hello.txt",
            "total_size": data.len() as u64,
            "size": data.len(),
            "offset": 0,
            "chunk_size": chunk_size,
            "mime_type": "text/plain",
        }),
    );
    let upload_reply = router.handle_with_stream(
        &upload_request,
        Some(RpcInputStream::from_bytes(data.clone())),
    );
    let node_id = match upload_reply {
        RpcReply::Json(r) => {
            assert_rpc_ok(&r);
            get_node_id(&r)
        }
        RpcReply::Stream(_) | RpcReply::RangeStream(_) => {
            panic!("catalog:upload must return JSON response")
        }
    };

    let download_request = RpcRequest::new(
        "catalog:download",
        serde_json::json!({
            "node_id": node_id,
        }),
    );
    let download_reply = router.handle_with_stream(&download_request, None);
    match download_reply {
        RpcReply::Stream(out) => {
            // ADR-004: upload creation chunk_size must be reflected in download meta.
            assert_eq!(out.meta.chunk_size, chunk_size);
        }
        RpcReply::Json(r) => panic!("expected stream reply, got JSON: {r:?}"),
        RpcReply::RangeStream(_) => panic!("expected full file stream reply"),
    }
}

#[test]
fn test_upload_create_returns_uploaded_bytes_after_upload() {
    let (mut router, _temp_dir) = create_test_router();
    unlock_vault(&mut router, "test");

    let data = b"hello from stream".to_vec();
    let response = upload_create(
        &mut router,
        "resume.txt",
        data.len() as u64,
        None,
        Some("text/plain"),
    );
    assert_rpc_ok(&response);
    let node_id = get_node_id(&response);

    let upload_request = RpcRequest::new(
        "catalog:upload",
        serde_json::json!({
            "node_id": node_id,
            "size": data.len(),
            "offset": 0,
        }),
    );
    let upload_reply = router.handle_with_stream(
        &upload_request,
        Some(RpcInputStream::from_bytes(data.clone())),
    );
    match upload_reply {
        RpcReply::Json(r) => assert_rpc_ok(&r),
        RpcReply::Stream(_) | RpcReply::RangeStream(_) => {
            panic!("catalog:upload must return JSON response")
        }
    }

    // ADR-004 resumable upload: upload creation should report already-uploaded bytes.
    let resume = upload_create(
        &mut router,
        "resume.txt",
        data.len() as u64,
        None,
        Some("text/plain"),
    );
    assert_rpc_ok(&resume);
    assert_eq!(get_node_id(&resume), node_id);
    assert_eq!(get_uploaded_bytes(&resume), data.len() as u64);
}

#[test]
fn test_upload_invalid_offset_is_rejected_with_typed_error() {
    let (mut router, _temp_dir) = create_test_router();
    unlock_vault(&mut router, "test");

    let data = b"hello".to_vec();
    let response = upload_create(&mut router, "offset.txt", data.len() as u64, None, None);
    assert_rpc_ok(&response);
    let node_id = get_node_id(&response);

    let upload_request = RpcRequest::new(
        "catalog:upload",
        serde_json::json!({
            "node_id": node_id,
            "size": data.len(),
            "offset": 1,
        }),
    );
    let reply = router.handle_with_stream(&upload_request, Some(RpcInputStream::from_bytes(data)));
    match reply {
        RpcReply::Json(r) => {
            assert_rpc_error(&r, "INVALID_OFFSET");
            assert_eq!(r.error_message(), Some("Invalid offset"));
        }
        RpcReply::Stream(_) | RpcReply::RangeStream(_) => {
            panic!("catalog:upload must return JSON response")
        }
    }
}

#[test]
fn test_upload_size_mismatch_is_rejected_with_typed_error() {
    let (mut router, _temp_dir) = create_test_router();
    unlock_vault(&mut router, "test");

    let data = b"hello".to_vec();
    let response = upload_create(&mut router, "mismatch.txt", data.len() as u64, None, None);
    assert_rpc_ok(&response);
    let node_id = get_node_id(&response);

    let upload_request = RpcRequest::new(
        "catalog:upload",
        serde_json::json!({
            "node_id": node_id,
            "size": data.len() as u64 + 1,
            "offset": 0,
        }),
    );
    let reply = router.handle_with_stream(&upload_request, Some(RpcInputStream::from_bytes(data)));
    match reply {
        RpcReply::Json(r) => {
            assert_rpc_error(&r, "INTERNAL_ERROR");
            assert_eq!(r.error_message(), Some("Size mismatch"));
        }
        RpcReply::Stream(_) | RpcReply::RangeStream(_) => {
            panic!("catalog:upload must return JSON response")
        }
    }
}

#[test]
fn test_upload_declared_size_overflow_is_rejected_with_typed_error() {
    let (mut router, _temp_dir) = create_test_router();
    unlock_vault(&mut router, "test");

    let data = b"overflow".to_vec();
    let upload_request = RpcRequest::new(
        "catalog:upload",
        serde_json::json!({
            "parent_path": "/",
            "name": "overflow.txt",
            "total_size": data.len() as u64 - 1,
            "size": data.len(),
            "offset": 0,
        }),
    );
    let reply = router.handle_with_stream(&upload_request, Some(RpcInputStream::from_bytes(data)));
    match reply {
        RpcReply::Json(r) => {
            assert_rpc_error(&r, "INVALID_OFFSET");
            assert_eq!(r.error_message(), Some("Size exceeds declared file size"));
        }
        RpcReply::Stream(_) | RpcReply::RangeStream(_) => {
            panic!("catalog:upload must return JSON response")
        }
    }
}

#[test]
fn test_upload_resume_with_offset_appends_data() {
    let (mut router, _temp_dir) = create_test_router();
    unlock_vault(&mut router, "test");

    let full = b"0123456789".to_vec();
    let first = full[..4].to_vec();
    let rest = full[4..].to_vec();

    let response = upload_create(&mut router, "resume.bin", full.len() as u64, None, None);
    assert_rpc_ok(&response);
    let node_id = get_node_id(&response);

    // First part
    let upload1 = RpcRequest::new(
        "catalog:upload",
        serde_json::json!({
            "node_id": node_id,
            "size": first.len(),
            "offset": 0,
        }),
    );
    match router.handle_with_stream(&upload1, Some(RpcInputStream::from_bytes(first))) {
        RpcReply::Json(r) => assert_rpc_ok(&r),
        RpcReply::Stream(_) | RpcReply::RangeStream(_) => {
            panic!("catalog:upload must return JSON response")
        }
    }

    // Resume
    let upload2 = RpcRequest::new(
        "catalog:upload",
        serde_json::json!({
            "node_id": node_id,
            "size": rest.len(),
            "offset": 4,
        }),
    );
    match router.handle_with_stream(&upload2, Some(RpcInputStream::from_bytes(rest))) {
        RpcReply::Json(r) => assert_rpc_ok(&r),
        RpcReply::Stream(_) | RpcReply::RangeStream(_) => {
            panic!("catalog:upload must return JSON response")
        }
    }

    let download_request = RpcRequest::new(
        "catalog:download",
        serde_json::json!({
            "node_id": node_id,
        }),
    );
    match router.handle_with_stream(&download_request, None) {
        RpcReply::Stream(mut out) => {
            let mut downloaded = Vec::new();
            out.reader
                .read_to_end(&mut downloaded)
                .expect("read stream");
            assert_eq!(downloaded, full);
        }
        RpcReply::Json(r) => panic!("expected stream reply, got JSON: {r:?}"),
        RpcReply::RangeStream(_) => panic!("expected full file stream reply"),
    }
}
