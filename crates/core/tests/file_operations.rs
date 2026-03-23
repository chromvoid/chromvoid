//! Integration tests for file operations (prepareUpload, upload, download)

mod test_helpers;

use chromvoid_core::crypto::keystore::InMemoryKeystore;
use chromvoid_core::rpc::types::RpcRequest;
use chromvoid_core::rpc::RpcRouter;
use chromvoid_core::rpc::{RpcInputStream, RpcReply};
use chromvoid_core::storage::Storage;
use std::io::Read;
use std::sync::Arc;
use tempfile::TempDir;
use test_helpers::*;

fn prepare_upload(
    router: &mut RpcRouter,
    name: &str,
    size: u64,
    parent_path: Option<&str>,
    mime_type: Option<&str>,
) -> chromvoid_core::rpc::types::RpcResponse {
    let mut data = serde_json::json!({
        "name": name,
        "size": size,
    });
    if let Some(path) = parent_path {
        data["parent_path"] = serde_json::json!(path);
    }
    if let Some(mime) = mime_type {
        data["mime_type"] = serde_json::json!(mime);
    }
    router.handle(&RpcRequest::new("catalog:prepareUpload", data))
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

// ============================================================================
// catalog:prepareUpload tests
// ============================================================================

#[test]
fn test_prepare_upload_creates_file_placeholder() {
    let (mut router, _temp_dir) = create_test_router();
    unlock_vault(&mut router, "test");

    let response = prepare_upload(&mut router, "document.pdf", 1024, None, None);
    assert_rpc_ok(&response);

    let node_id = get_node_id(&response);
    assert!(node_id > 0);

    let items = get_items(&list_dir(&mut router, "/"));
    let file = find_item_by_name(&items, "document.pdf");
    assert!(file.is_some());
    assert!(!file.unwrap().get("is_dir").unwrap().as_bool().unwrap());
}

#[test]
fn test_prepare_upload_returns_node_id_and_uploaded_bytes() {
    let (mut router, _temp_dir) = create_test_router();
    unlock_vault(&mut router, "test");

    let response = prepare_upload(&mut router, "file.txt", 2048, None, None);
    assert_rpc_ok(&response);

    let node_id = get_node_id(&response);
    let uploaded_bytes = get_uploaded_bytes(&response);

    assert!(node_id > 0);
    assert_eq!(uploaded_bytes, 0);
}

#[test]
fn test_prepare_upload_with_mime_type() {
    let (mut router, _temp_dir) = create_test_router();
    unlock_vault(&mut router, "test");

    let response = prepare_upload(&mut router, "image.png", 5000, None, Some("image/png"));
    assert_rpc_ok(&response);

    let items = get_items(&list_dir(&mut router, "/"));
    let file = find_item_by_name(&items, "image.png").unwrap();
    assert_eq!(
        file.get("mime_type").and_then(|v| v.as_str()),
        Some("image/png")
    );
}

#[test]
fn test_prepare_upload_in_nested_directory() {
    let (mut router, _temp_dir) = create_test_router();
    unlock_vault(&mut router, "test");

    create_dir(&mut router, "documents");
    create_dir_at(&mut router, "/documents", "reports");

    let response = prepare_upload(
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
fn test_prepare_upload_duplicate_name_returns_existing() {
    let (mut router, _temp_dir) = create_test_router();
    unlock_vault(&mut router, "test");

    let response1 = prepare_upload(&mut router, "file.txt", 100, None, None);
    assert_rpc_ok(&response1);
    let node_id1 = get_node_id(&response1);

    let response2 = prepare_upload(&mut router, "file.txt", 100, None, None);
    assert_rpc_ok(&response2);
    let node_id2 = get_node_id(&response2);

    assert_eq!(
        node_id1, node_id2,
        "should return same node_id for existing file"
    );
}

#[test]
fn test_prepare_upload_requires_vault() {
    let (mut router, _temp_dir) = create_test_router();

    let response = prepare_upload(&mut router, "file.txt", 100, None, None);
    assert_rpc_error(&response, "VAULT_REQUIRED");
}

#[test]
fn test_prepare_upload_invalid_parent_path() {
    let (mut router, _temp_dir) = create_test_router();
    unlock_vault(&mut router, "test");

    let response = prepare_upload(&mut router, "file.txt", 100, Some("/nonexistent"), None);
    assert_rpc_error(&response, "NODE_NOT_FOUND");
}

#[test]
fn test_prepare_upload_missing_name() {
    let (mut router, _temp_dir) = create_test_router();
    unlock_vault(&mut router, "test");

    let response = router.handle(&RpcRequest::new(
        "catalog:prepareUpload",
        serde_json::json!({"size": 100}),
    ));
    assert_rpc_error(&response, "EMPTY_PAYLOAD");
}

#[test]
fn test_prepare_upload_missing_size() {
    let (mut router, _temp_dir) = create_test_router();
    unlock_vault(&mut router, "test");

    let response = router.handle(&RpcRequest::new(
        "catalog:prepareUpload",
        serde_json::json!({"name": "file.txt"}),
    ));
    assert_rpc_error(&response, "EMPTY_PAYLOAD");
}

#[test]
fn test_prepare_upload_to_file_fails() {
    let (mut router, _temp_dir) = create_test_router();
    unlock_vault(&mut router, "test");

    prepare_upload(&mut router, "parent.txt", 100, None, None);

    let response = prepare_upload(&mut router, "child.txt", 50, Some("/parent.txt"), None);
    assert_rpc_error(&response, "NOT_A_DIR");
}

#[test]
fn test_prepare_upload_zero_size() {
    let (mut router, _temp_dir) = create_test_router();
    unlock_vault(&mut router, "test");

    let response = prepare_upload(&mut router, "empty.txt", 0, None, None);
    assert_rpc_ok(&response);

    let items = get_items(&list_dir(&mut router, "/"));
    let file = find_item_by_name(&items, "empty.txt").unwrap();
    assert_eq!(file.get("size").and_then(|v| v.as_u64()), Some(0));
}

#[test]
fn test_prepare_upload_large_size() {
    let (mut router, _temp_dir) = create_test_router();
    unlock_vault(&mut router, "test");

    let large_size = 10 * 1024 * 1024 * 1024u64; // 10 GB
    let response = prepare_upload(&mut router, "large.bin", large_size, None, None);
    assert_rpc_ok(&response);

    let items = get_items(&list_dir(&mut router, "/"));
    let file = find_item_by_name(&items, "large.bin").unwrap();
    assert_eq!(file.get("size").and_then(|v| v.as_u64()), Some(large_size));
}

#[test]
fn test_prepare_upload_persistence() {
    let temp_dir = TempDir::new().expect("temp dir");
    let storage_path = temp_dir.path();
    let keystore = Arc::new(InMemoryKeystore::new());

    let node_id;
    {
        let storage = Storage::new(storage_path).expect("storage");
        let mut router = RpcRouter::new(storage).with_keystore(keystore.clone());
        unlock_vault(&mut router, "test");

        let response = prepare_upload(&mut router, "persistent.dat", 500, None, None);
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
fn test_prepare_upload_updates_existing_root_file_size_persists_after_restart() {
    let temp_dir = TempDir::new().expect("temp dir");
    let storage_path = temp_dir.path();
    let keystore = Arc::new(InMemoryKeystore::new());

    let node_id;
    {
        let storage = Storage::new(storage_path).expect("storage");
        let mut router = RpcRouter::new(storage).with_keystore(keystore.clone());
        unlock_vault(&mut router, "test");

        // Create a root-level placeholder (common when an upload is interrupted).
        let response = prepare_upload(&mut router, "root.bin", 0, None, None);
        assert_rpc_ok(&response);
        node_id = get_node_id(&response);

        // Re-run prepareUpload with a non-zero declared size; metadata must persist.
        let refreshed = prepare_upload(&mut router, "root.bin", 1234, None, None);
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

    let response = prepare_upload(&mut router, "test.txt", 13, None, None);
    let node_id = get_node_id(&response);

    let upload_response = upload_start(&mut router, node_id, 13, Some(0));
    assert_rpc_error(&upload_response, "NO_STREAM");
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
}

#[test]
fn test_upload_missing_size() {
    let (mut router, _temp_dir) = create_test_router();
    unlock_vault(&mut router, "test");

    let response = prepare_upload(&mut router, "file.txt", 100, None, None);
    let node_id = get_node_id(&response);

    let response = router.handle(&RpcRequest::new(
        "catalog:upload",
        serde_json::json!({"node_id": node_id}),
    ));
    assert_rpc_error(&response, "EMPTY_PAYLOAD");
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

    let response = prepare_upload(&mut router, "document.pdf", 1024, None, None);
    let node_id = get_node_id(&response);

    let response = download_start(&mut router, node_id);
    assert_rpc_error(&response, "STREAM_REQUIRED");
}

#[test]
fn test_download_missing_node_id() {
    let (mut router, _temp_dir) = create_test_router();
    unlock_vault(&mut router, "test");

    let response = router.handle(&RpcRequest::new("catalog:download", serde_json::json!({})));
    assert_rpc_error(&response, "EMPTY_PAYLOAD");
}

#[test]
fn test_download_requires_vault() {
    let (mut router, _temp_dir) = create_test_router();

    let response = download_start(&mut router, 1);
    assert_rpc_error(&response, "VAULT_REQUIRED");
}

// ============================================================================
// catalog:upload/catalog:download happy path (ADR-004: STREAM)
// ============================================================================

#[test]
fn test_upload_download_roundtrip_with_stream() {
    let (mut router, _temp_dir) = create_test_router();
    unlock_vault(&mut router, "test");

    let data = b"hello from stream".to_vec();

    let response = prepare_upload(
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
        RpcReply::Stream(_) => panic!("catalog:upload must return JSON response"),
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
    }
}

#[test]
fn test_prepare_upload_chunk_size_affects_download_meta() {
    let (mut router, _temp_dir) = create_test_router();
    unlock_vault(&mut router, "test");

    let data = b"hello".to_vec();
    let chunk_size: u32 = 8;

    let response = router.handle(&RpcRequest::new(
        "catalog:prepareUpload",
        serde_json::json!({
            "name": "hello.txt",
            "size": data.len() as u64,
            "chunk_size": chunk_size,
            "mime_type": "text/plain",
        }),
    ));
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
        RpcReply::Stream(_) => panic!("catalog:upload must return JSON response"),
    }

    let download_request = RpcRequest::new(
        "catalog:download",
        serde_json::json!({
            "node_id": node_id,
        }),
    );
    let download_reply = router.handle_with_stream(&download_request, None);
    match download_reply {
        RpcReply::Stream(out) => {
            // ADR-004: prepareUpload chunk_size must be reflected in download meta.
            assert_eq!(out.meta.chunk_size, chunk_size);
        }
        RpcReply::Json(r) => panic!("expected stream reply, got JSON: {r:?}"),
    }
}

#[test]
fn test_prepare_upload_returns_uploaded_bytes_after_upload() {
    let (mut router, _temp_dir) = create_test_router();
    unlock_vault(&mut router, "test");

    let data = b"hello from stream".to_vec();
    let response = prepare_upload(
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
        RpcReply::Stream(_) => panic!("catalog:upload must return JSON response"),
    }

    // ADR-004 resumable upload: prepareUpload should report already-uploaded bytes.
    let resume = prepare_upload(
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
    let response = prepare_upload(&mut router, "offset.txt", data.len() as u64, None, None);
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
        RpcReply::Json(r) => assert_rpc_error(&r, "INVALID_OFFSET"),
        RpcReply::Stream(_) => panic!("catalog:upload must return JSON response"),
    }
}

#[test]
fn test_upload_resume_with_offset_appends_data() {
    let (mut router, _temp_dir) = create_test_router();
    unlock_vault(&mut router, "test");

    let full = b"0123456789".to_vec();
    let first = full[..4].to_vec();
    let rest = full[4..].to_vec();

    let response = prepare_upload(&mut router, "resume.bin", full.len() as u64, None, None);
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
        RpcReply::Stream(_) => panic!("catalog:upload must return JSON response"),
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
        RpcReply::Stream(_) => panic!("catalog:upload must return JSON response"),
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
    }
}
