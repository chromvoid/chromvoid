use super::*;
use chromvoid_core::crypto::keystore::InMemoryKeystore;
use chromvoid_core::rpc::types::RpcRequest;
use chromvoid_core::rpc::{RpcInputStream, RpcReply, RpcRouter};
use chromvoid_core::storage::Storage;
use serde_json::json;
use std::sync::Arc;
use tempfile::TempDir;

fn router(root: &TempDir) -> RpcRouter {
    let mut router = RpcRouter::new(Storage::new(root.path()).unwrap())
        .with_keystore(Arc::new(InMemoryKeystore::new()));
    assert!(router
        .handle(&RpcRequest::new(
            "vault:unlock",
            json!({"password":"synthetic upload"})
        ))
        .is_ok());
    router
}

fn apply(router: &mut RpcRouter, data: Value, bytes: &[u8]) -> RpcResponse {
    let request = RpcRequest::new("catalog:upload", data);
    let RpcReply::Json(response) =
        router.handle_with_stream(&request, Some(RpcInputStream::from_bytes(bytes.to_vec())))
    else {
        panic!("upload must return JSON")
    };
    assert!(response.is_ok(), "request={:?}; {response:?}", request.data);
    response
}

fn bytes(router: &mut RpcRouter, node: u64) -> Vec<u8> {
    let RpcReply::Stream(mut stream) = router.handle_with_stream(
        &RpcRequest::new("catalog:download", json!({"node_id":node})),
        None,
    ) else {
        panic!("expected committed file")
    };
    let mut bytes = Vec::new();
    stream.reader.read_to_end(&mut bytes).unwrap();
    bytes
}

#[test]
fn multi_request_uploads_preserve_absolute_offsets_for_create_and_overwrite() {
    for overwrite in [false, true] {
        let root = TempDir::new().unwrap();
        let mut router = router(&root);
        let original = b"original bytes remain until final commit";
        let mut node = if overwrite {
            let response = apply(
                &mut router,
                json!({
                    "parent_path":"/","name":"shared.bin","size":original.len(),
                    "total_size":original.len(),"offset":0,"finish":true
                }),
                original,
            );
            Some(response.result().unwrap()["node_id"].as_u64().unwrap())
        } else {
            None
        };
        let expected = b"abcdefghij";
        let mut offset = 0;
        // Same contract as catalog_upload_request_data: size is this RPC's bytes, not EOF.
        for size in [3, 3, 4] {
            let end = offset + size;
            let mut data = json!({
                "node_id":node,"parent_path":"/","name":"shared.bin",
                "offset":offset,"size":size,"total_size":expected.len(),
                "finish":end == expected.len()
            });
            let metadata = parse_upload_stream_metadata(&data).unwrap();
            let mut frame_offset = metadata.offset;
            let mut last_response = None;
            // The sender emits non-final data frames, then a final empty EOF frame.
            for chunk in [
                &expected[offset..offset + 1],
                &expected[offset + 1..end],
                &[],
            ] {
                let part = upload_stream_chunk_data(
                    &data,
                    frame_offset,
                    chunk.len() as u64,
                    metadata.end_offset,
                    chunk.is_empty(),
                )
                .unwrap();
                let response = if chunk.is_empty() {
                    last_response
                        .take()
                        .expect("data frames supply the final acknowledgement")
                } else {
                    let response = apply(&mut router, part, chunk);
                    apply_upload_stream_response(&mut data, response)
                };
                assert!(response.is_ok(), "{response:?}");
                if chunk.is_empty() {
                    node = Some(response.result().unwrap()["node_id"].as_u64().unwrap());
                    assert_eq!(response.result().unwrap()["uploaded"], end);
                    assert_eq!(response.result().unwrap()["uploaded_bytes"], end);
                    assert_eq!(
                        response.result().unwrap()["completed"],
                        end == expected.len()
                    );
                }
                frame_offset += chunk.len() as u64;
                last_response = Some(response);
            }
            if overwrite && end < expected.len() {
                assert_eq!(bytes(&mut router, node.unwrap()), original);
            }
            offset = end;
        }
        assert_eq!(bytes(&mut router, node.unwrap()), expected);
    }
}

#[test]
fn a_final_frame_cannot_acknowledge_a_short_payload() {
    let data = json!({"offset":0,"size":5,"finish":true});
    let error = upload_stream_chunk_data(&data, 2, 0, 5, true).unwrap_err();
    assert_eq!(error.code(), Some("BAD_REQUEST"));
}

#[test]
fn empty_requests_and_large_absolute_offsets_keep_payload_length_semantics() {
    for (offset, size, expected_end) in [(0, 0, 0), (0, 12, 12), (100, 2, 102), (100, 0, 100)] {
        let data = json!({"offset":offset,"size":size,"finish":true});
        let meta = parse_upload_stream_metadata(&data).unwrap();
        assert_eq!(meta.offset, offset);
        assert_eq!(meta.end_offset, expected_end);
        let final_data =
            upload_stream_chunk_data(&data, expected_end, 0, meta.end_offset, true).unwrap();
        assert_eq!(final_data["total_size"], expected_end);
    }
    let error = parse_upload_stream_metadata(&json!({"offset":u64::MAX,"size":1})).unwrap_err();
    assert_eq!(error.code(), Some("BAD_REQUEST"));
}

#[test]
fn truncated_upload_cannot_replace_the_committed_file() {
    let root = TempDir::new().unwrap();
    let mut router = router(&root);
    let original = b"committed";
    let initial = apply(
        &mut router,
        json!({"parent_path":"/","name":"keep.bin",
        "size":original.len(),"finish":true}),
        original,
    );
    let node = initial.result().unwrap()["node_id"].as_u64().unwrap();
    let mut data = json!({"node_id":node,"size":5,"total_size":5,"finish":true});
    let part = upload_stream_chunk_data(&data, 0, 2, 5, false).unwrap();
    let reply = apply(&mut router, part, b"ab");
    assert!(apply_upload_stream_response(&mut data, reply).is_ok());
    assert!(upload_stream_chunk_data(&data, 2, 0, 5, true).is_err());
    assert_eq!(bytes(&mut router, node), original);
    assert!(router
        .handle(&RpcRequest::new(
            "catalog:upload:abort",
            json!({"node_id":node})
        ))
        .is_ok());
    assert_eq!(bytes(&mut router, node), original);
}

#[test]
fn failed_or_invalid_core_replies_do_not_change_the_upload_target() {
    let mut data = json!({"parent_path":"/","name":"file.bin"});
    let original = data.clone();
    let error = RpcResponse::error("Core failure", Some("INTERNAL_ERROR"));
    let response = apply_upload_stream_response(&mut data, error);
    assert_eq!(response.code(), Some("INTERNAL_ERROR"));
    assert_eq!(data, original);
    let response =
        apply_upload_stream_response(&mut data, RpcResponse::success(json!({"node_id":4})));
    assert_eq!(response.code(), Some("STREAM_UNEXPECTED"));
    assert_eq!(data, original);
}
