use super::*;
use crate::crypto::keystore::InMemoryKeystore;
use crate::rpc::types::RpcRequest;
use crate::rpc::{RpcInputStream, RpcRangeStreamMeta, RpcReply, RpcResponse, RpcStreamMeta};
use crate::storage::Storage;
use std::io::Read;
use std::sync::Arc;
use tempfile::TempDir;

pub(super) fn create_test_router() -> (RpcRouter, TempDir) {
    let temp_dir = TempDir::new().expect("failed to create temp dir");
    let storage = Storage::new(temp_dir.path()).expect("failed to create storage");
    let router = RpcRouter::new(storage).with_keystore(Arc::new(InMemoryKeystore::new()));
    (router, temp_dir)
}

pub(super) fn unlock_test_router(router: &mut RpcRouter) {
    let response = router.handle(&RpcRequest::new(
        "vault:unlock",
        serde_json::json!({"password": "test"}),
    ));
    assert!(response.is_ok());
}

pub(super) fn prepare_test_image(router: &mut RpcRouter, name: &str, size: u64) -> u64 {
    let upload = router.handle_with_stream(
        &RpcRequest::new(
            "catalog:upload",
            serde_json::json!({
                "parent_path": "/",
                "name": name,
                    "total_size": size,
                "size": size,
                    "offset": 0,
                "mime_type": "image/jpeg",
            }),
        ),
        Some(RpcInputStream::from_bytes(vec![0; size as usize])),
    );

    let RpcReply::Json(response) = upload else {
        panic!("catalog:upload must return JSON response");
    };
    response
        .result()
        .unwrap()
        .get("node_id")
        .and_then(|value| value.as_u64())
        .expect("upload node id")
}

pub(super) fn prepare_test_file_with_chunk_size(
    router: &mut RpcRouter,
    name: &str,
    bytes: &[u8],
    chunk_size: u32,
) -> (u64, u64) {
    let upload = router.handle_with_stream(
        &RpcRequest::new(
            "catalog:upload",
            serde_json::json!({
                "parent_path": "/",
                "name": name,
                    "total_size": bytes.len(),
                "size": bytes.len(),
                    "offset": 0,
                "mime_type": "video/mp4",
                "chunk_size": chunk_size,
            }),
        ),
        Some(RpcInputStream::from_bytes(bytes.to_vec())),
    );
    let RpcReply::Json(response) = upload else {
        panic!("catalog:upload must return JSON response");
    };
    let node_id = response
        .result()
        .unwrap_or_else(|| panic!("expected upload success, got JSON {response:?}"))
        .get("node_id")
        .and_then(|value| value.as_u64())
        .expect("upload node id");

    let metadata = router.handle(&RpcRequest::new(
        "catalog:source:metadata",
        serde_json::json!({"node_id": node_id}),
    ));
    let source_revision = metadata
        .result()
        .unwrap()
        .get("source_revision")
        .and_then(|value| value.as_u64())
        .expect("source revision");
    (node_id, source_revision)
}

pub(super) fn read_catalog_download_range(
    router: &mut RpcRouter,
    node_id: u64,
    offset: u64,
    length: u64,
    source_revision: u64,
) -> (RpcRangeStreamMeta, Vec<u8>) {
    let reply = router.handle_with_stream(
        &RpcRequest::new(
            "catalog:downloadRange",
            serde_json::json!({
                "node_id": node_id,
                "offset": offset,
                "length": length,
                "expected_source_revision": source_revision,
            }),
        ),
        None,
    );
    match reply {
        RpcReply::RangeStream(out) => {
            let meta = out.meta;
            let mut reader = out.reader;
            let mut bytes = Vec::new();
            reader.read_to_end(&mut bytes).expect("read range stream");
            (meta, bytes)
        }
        RpcReply::Json(response) => panic!("expected range stream, got JSON {response:?}"),
        RpcReply::Stream(_) => panic!("expected range stream"),
    }
}

pub(super) fn read_catalog_download(
    router: &mut RpcRouter,
    node_id: u64,
) -> (RpcStreamMeta, Vec<u8>) {
    let reply = router.handle_with_stream(
        &RpcRequest::new("catalog:download", serde_json::json!({"node_id": node_id})),
        None,
    );
    match reply {
        RpcReply::Stream(out) => {
            let meta = out.meta;
            let mut reader = out.reader;
            let mut bytes = Vec::new();
            reader
                .read_to_end(&mut bytes)
                .expect("read download stream");
            (meta, bytes)
        }
        RpcReply::Json(response) => panic!("expected download stream, got JSON {response:?}"),
        RpcReply::RangeStream(_) => panic!("expected download stream"),
    }
}

pub(super) fn expect_catalog_download_error_message(
    router: &mut RpcRouter,
    data: serde_json::Value,
    expected_code: &str,
    expected_message: &str,
) {
    let reply = router.handle_with_stream(&RpcRequest::new("catalog:download", data), None);

    match reply {
        RpcReply::Json(RpcResponse::Error { code, error, .. }) => {
            assert_eq!(code.as_deref(), Some(expected_code));
            assert_eq!(error, expected_message);
        }
        RpcReply::Json(RpcResponse::Success { .. })
        | RpcReply::Stream(_)
        | RpcReply::RangeStream(_) => panic!("expected {expected_code} error"),
    }
}

pub(super) fn replace_test_file(
    router: &mut RpcRouter,
    node_id: u64,
    bytes: &[u8],
    expected_source_revision: Option<u64>,
    conflict_mode: Option<&str>,
) -> serde_json::Value {
    replace_test_file_with_mime(
        router,
        node_id,
        bytes,
        "text/markdown",
        expected_source_revision,
        conflict_mode,
    )
}

pub(super) fn replace_test_file_with_mime(
    router: &mut RpcRouter,
    node_id: u64,
    bytes: &[u8],
    mime_type: &str,
    expected_source_revision: Option<u64>,
    conflict_mode: Option<&str>,
) -> serde_json::Value {
    let reply = router.handle_with_stream(
        &RpcRequest::new(
            "catalog:file:replace",
            serde_json::json!({
                "node_id": node_id,
                "size": bytes.len(),
                "mime_type": mime_type,
                "expected_source_revision": expected_source_revision,
                "conflict_mode": conflict_mode,
            }),
        ),
        Some(RpcInputStream::from_bytes(bytes.to_vec())),
    );
    match reply {
        RpcReply::Json(RpcResponse::Success { result, .. }) => result,
        RpcReply::Json(response) => panic!("expected replace success, got JSON {response:?}"),
        RpcReply::Stream(_) | RpcReply::RangeStream(_) => panic!("expected JSON replace response"),
    }
}

pub(super) fn catalog_source_metadata(router: &mut RpcRouter, node_id: u64) -> serde_json::Value {
    router
        .handle(&RpcRequest::new(
            "catalog:source:metadata",
            serde_json::json!({"node_id": node_id}),
        ))
        .result()
        .expect("source metadata result")
        .clone()
}

pub(super) fn media_info_kind(value: &serde_json::Value) -> Option<&str> {
    value
        .get("media_info")
        .and_then(|value| value.get("k"))
        .and_then(|value| value.as_str())
}

pub(super) fn media_inspected_revision(value: &serde_json::Value) -> Option<u64> {
    value
        .get("media_inspected_revision")
        .and_then(|value| value.as_u64())
}

pub(super) fn minimal_mp4(handlers: &[&str]) -> Vec<u8> {
    let mut bytes = mp4_ftyp_box();
    bytes.extend(mp4_moov_box(handlers));
    bytes
}

pub(super) fn mp4_ftyp_box() -> Vec<u8> {
    let mut payload = Vec::new();
    payload.extend(*b"isom");
    payload.extend(0u32.to_be_bytes());
    payload.extend(*b"isom");
    payload.extend(*b"mp42");
    mp4_box(*b"ftyp", &payload)
}

pub(super) fn mp4_moov_box(handlers: &[&str]) -> Vec<u8> {
    let payload = handlers
        .iter()
        .flat_map(|handler| mp4_trak_box(handler).into_iter())
        .collect::<Vec<_>>();
    mp4_box(*b"moov", &payload)
}

pub(super) fn mp4_trak_box(handler: &str) -> Vec<u8> {
    mp4_box(*b"trak", &mp4_box(*b"mdia", &mp4_hdlr_box(handler)))
}

pub(super) fn mp4_hdlr_box(handler: &str) -> Vec<u8> {
    let mut payload = Vec::new();
    payload.extend(0u32.to_be_bytes());
    payload.extend(0u32.to_be_bytes());
    payload.extend(handler.as_bytes());
    payload.extend([0; 12]);
    mp4_box(*b"hdlr", &payload)
}

pub(super) fn mp4_box(kind: [u8; 4], payload: &[u8]) -> Vec<u8> {
    let mut bytes = Vec::new();
    bytes.extend(((payload.len() + 8) as u32).to_be_bytes());
    bytes.extend(kind);
    bytes.extend(payload);
    bytes
}

pub(super) fn expect_catalog_file_replace_error_message(
    router: &mut RpcRouter,
    data: serde_json::Value,
    stream: Option<RpcInputStream>,
    expected_code: &str,
    expected_message: &str,
) {
    let reply = router.handle_with_stream(&RpcRequest::new("catalog:file:replace", data), stream);
    match reply {
        RpcReply::Json(RpcResponse::Error { code, error, .. }) => {
            assert_eq!(code.as_deref(), Some(expected_code));
            assert_eq!(error, expected_message);
        }
        RpcReply::Json(RpcResponse::Success { .. })
        | RpcReply::Stream(_)
        | RpcReply::RangeStream(_) => panic!("expected {expected_code} error"),
    }
}

pub(super) fn read_catalog_download_range_error_kind(
    router: &mut RpcRouter,
    node_id: u64,
    offset: u64,
    length: u64,
    source_revision: u64,
) -> std::io::ErrorKind {
    let reply = router.handle_with_stream(
        &RpcRequest::new(
            "catalog:downloadRange",
            serde_json::json!({
                "node_id": node_id,
                "offset": offset,
                "length": length,
                "expected_source_revision": source_revision,
            }),
        ),
        None,
    );
    match reply {
        RpcReply::RangeStream(out) => {
            let mut reader = out.reader;
            let mut bytes = Vec::new();
            reader
                .read_to_end(&mut bytes)
                .expect_err("range stream read should fail")
                .kind()
        }
        RpcReply::Json(response) => panic!("expected range stream, got JSON {response:?}"),
        RpcReply::Stream(_) => panic!("expected range stream"),
    }
}

pub(super) fn expect_catalog_download_range_error(
    router: &mut RpcRouter,
    data: serde_json::Value,
    expected_code: &str,
) {
    let reply = router.handle_with_stream(&RpcRequest::new("catalog:downloadRange", data), None);

    match reply {
        RpcReply::Json(RpcResponse::Error { code, .. }) => {
            assert_eq!(code.as_deref(), Some(expected_code));
        }
        RpcReply::Json(RpcResponse::Success { .. })
        | RpcReply::Stream(_)
        | RpcReply::RangeStream(_) => panic!("expected {expected_code} error"),
    }
}

pub(super) fn expect_catalog_download_range_error_message(
    router: &mut RpcRouter,
    data: serde_json::Value,
    expected_code: &str,
    expected_message: &str,
) {
    let reply = router.handle_with_stream(&RpcRequest::new("catalog:downloadRange", data), None);

    match reply {
        RpcReply::Json(RpcResponse::Error { code, error, .. }) => {
            assert_eq!(code.as_deref(), Some(expected_code));
            assert_eq!(error, expected_message);
        }
        RpcReply::Json(RpcResponse::Success { .. })
        | RpcReply::Stream(_)
        | RpcReply::RangeStream(_) => panic!("expected {expected_code} error"),
    }
}

pub(super) fn catalog_blob_chunk_name(
    router: &RpcRouter,
    node_id: u64,
    chunk_index: u32,
) -> String {
    let vault_key = *router.session.as_ref().unwrap().vault_key();
    crate::crypto::blob_chunk_name(&vault_key, node_id as u32, chunk_index)
}

pub(super) fn write_test_derivative(
    router: &mut RpcRouter,
    node_id: u64,
    source_revision: u64,
    bytes: &[u8],
) {
    let write = router.handle_with_stream(
        &RpcRequest::new(
            "catalog:derivative:write",
            serde_json::json!({
                "node_id": node_id,
                "source_version": source_revision,
                "tier": "preview",
                "version": 1,
                "size": bytes.len(),
                "name": "photo.jpg",
                "mime_type": "image/jpeg",
                "file_extension": "jpg",
                "chunk_size": 2,
            }),
        ),
        Some(RpcInputStream::from_bytes(bytes.to_vec())),
    );
    assert!(matches!(write, RpcReply::Json(RpcResponse::Success { .. })));
}

pub(super) fn read_test_derivative(
    router: &mut RpcRouter,
    node_id: u64,
    source_revision: u64,
) -> Option<Vec<u8>> {
    let read = router.handle_with_stream(
        &RpcRequest::new(
            "catalog:derivative:read",
            serde_json::json!({
                "node_id": node_id,
                "source_version": source_revision,
                "tier": "preview",
                "version": 1,
            }),
        ),
        None,
    );

    match read {
        RpcReply::Stream(out) => {
            let mut reader = out.reader;
            let mut bytes = Vec::new();
            reader.read_to_end(&mut bytes).expect("read derivative");
            Some(bytes)
        }
        RpcReply::Json(RpcResponse::Error { .. }) => None,
        RpcReply::Json(RpcResponse::Success { .. }) => panic!("expected derivative stream"),
        RpcReply::RangeStream(_) => panic!("expected derivative stream"),
    }
}
