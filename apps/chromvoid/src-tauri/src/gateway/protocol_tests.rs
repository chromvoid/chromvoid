use super::*;

#[test]
fn frame_encode_decode_roundtrip() {
    let frame = Frame {
        frame_type: FrameType::RpcRequest,
        message_id: 42,
        flags: 0,
        payload: b"hello".to_vec(),
    };
    let encoded = frame.encode();
    let decoded = Frame::decode(&encoded).unwrap();
    assert_eq!(decoded.frame_type, FrameType::RpcRequest);
    assert_eq!(decoded.message_id, 42);
    assert_eq!(decoded.flags, 0);
    assert_eq!(decoded.payload, b"hello");
}

#[test]
fn error_frame_construction() {
    let frame = frame_from_error(99, error_codes::INVALID_FORMAT, "bad frame");
    assert_eq!(frame.frame_type, FrameType::Error);
    assert_eq!(frame.message_id, 99);
    let payload: serde_json::Value = serde_json::from_slice(&frame.payload).unwrap();
    assert_eq!(payload["v"], 1);
    assert_eq!(payload["error_code"], 1001);
    assert_eq!(payload["error_message"], "bad frame");
}

#[test]
fn heartbeat_frame_construction() {
    let frame = frame_from_heartbeat(55);
    assert_eq!(frame.frame_type, FrameType::Heartbeat);
    assert_eq!(frame.message_id, 55);
    let payload: serde_json::Value = serde_json::from_slice(&frame.payload).unwrap();
    assert_eq!(payload["v"], 1);
    assert_eq!(payload["status"], "alive");
}

#[test]
fn rpc_response_preserves_access_denied_code() {
    let resp = RpcResponse::error("system shard access denied", Some("ACCESS_DENIED"));
    let frame = frame_from_rpc_response(77, &resp);
    assert_eq!(frame.frame_type, FrameType::RpcResponse);
    assert_eq!(frame.message_id, 77);

    let payload: serde_json::Value = serde_json::from_slice(&frame.payload).unwrap();
    assert_eq!(payload["ok"], false);
    assert_eq!(payload["code"], "ACCESS_DENIED");
    assert_eq!(payload["error"], "system shard access denied");
}

#[test]
fn json_payload_fallback_preserves_empty_object_payload() {
    struct FailingSerialize;

    impl serde::Serialize for FailingSerialize {
        fn serialize<S>(&self, _serializer: S) -> Result<S::Ok, S::Error>
        where
            S: serde::Serializer,
        {
            Err(serde::ser::Error::custom("intentional failure"))
        }
    }

    let payload = json_payload_or_empty_object(&FailingSerialize, "test frame payload");

    assert_eq!(payload, b"{}".to_vec());
}

#[test]
fn upload_stream_metadata_requires_numeric_size() {
    let response = parse_upload_stream_metadata(&serde_json::json!({ "offset": 12 }))
        .expect_err("missing size should fail");

    assert_eq!(response.code(), Some("BAD_REQUEST"));
    assert_eq!(
        response.error_message(),
        Some("upload stream request missing numeric size")
    );

    let response = parse_upload_stream_metadata(&serde_json::json!({ "size": "12" }))
        .expect_err("string size should fail");
    assert_eq!(response.code(), Some("BAD_REQUEST"));
}

#[test]
fn upload_stream_metadata_preserves_optional_offset_default() {
    let metadata = parse_upload_stream_metadata(&serde_json::json!({ "size": 64 }))
        .expect("size-only metadata");
    assert_eq!(metadata.size, 64);
    assert_eq!(metadata.offset, 0);

    let metadata = parse_upload_stream_metadata(&serde_json::json!({
        "size": 64,
        "offset": 32
    }))
    .expect("metadata with offset");
    assert_eq!(metadata.size, 64);
    assert_eq!(metadata.offset, 32);
}

#[test]
fn upload_stream_metadata_rejects_offset_beyond_size() {
    let response = parse_upload_stream_metadata(&serde_json::json!({
        "size": 64,
        "offset": 65
    }))
    .expect_err("offset beyond stream size should fail");

    assert_eq!(response.code(), Some("BAD_REQUEST"));
    assert_eq!(
        response.error_message(),
        Some("upload stream offset exceeds size")
    );
}

#[test]
fn upload_stream_chunk_data_preserves_metadata_and_sets_chunk_fields() {
    let chunk_data = upload_stream_chunk_data(
        &serde_json::json!({
            "node_id": 7,
            "parent_path": "/docs",
            "name": "note.md",
            "total_size": 128,
            "size": 128,
            "offset": 0,
            "finish": true
        }),
        64,
        32,
        128,
        true,
    )
    .expect("chunk data");

    assert_eq!(chunk_data["node_id"], serde_json::json!(7));
    assert_eq!(chunk_data["parent_path"], serde_json::json!("/docs"));
    assert_eq!(chunk_data["name"], serde_json::json!("note.md"));
    assert_eq!(chunk_data["total_size"], serde_json::json!(128));
    assert_eq!(chunk_data["finish"], serde_json::json!(true));
    assert_eq!(chunk_data["offset"], serde_json::json!(64));
    assert_eq!(chunk_data["size"], serde_json::json!(32));
}

#[test]
fn upload_stream_chunk_data_rejects_chunks_beyond_declared_size() {
    let response = upload_stream_chunk_data(
        &serde_json::json!({
            "node_id": 7,
            "size": 128,
            "offset": 0
        }),
        120,
        16,
        128,
        true,
    )
    .expect_err("chunk beyond declared size should fail");

    assert_eq!(response.code(), Some("BAD_REQUEST"));
    assert_eq!(
        response.error_message(),
        Some("upload stream chunk exceeds declared size")
    );
}

#[test]
fn upload_stream_chunk_data_rejects_offset_overflow() {
    let response = upload_stream_chunk_data(
        &serde_json::json!({
            "node_id": 7,
            "size": u64::MAX,
            "offset": 0
        }),
        u64::MAX,
        1,
        u64::MAX,
        true,
    )
    .expect_err("chunk offset overflow should fail");

    assert_eq!(response.code(), Some("BAD_REQUEST"));
    assert_eq!(
        response.error_message(),
        Some("upload stream chunk offset overflow")
    );
}

#[test]
fn upload_stream_chunk_data_rejects_non_object_metadata() {
    let response = upload_stream_chunk_data(&serde_json::json!(null), 0, 1, 1, true)
        .expect_err("non-object metadata should fail");

    assert_eq!(response.code(), Some("BAD_REQUEST"));
    assert_eq!(
        response.error_message(),
        Some("upload request data must be an object")
    );
}

#[test]
fn upload_stream_chunk_data_defers_finish_until_final_chunk() {
    let chunk_data = upload_stream_chunk_data(
        &serde_json::json!({
            "node_id": 7,
            "size": 128,
            "offset": 0,
            "finish": true
        }),
        0,
        64,
        128,
        false,
    )
    .expect("non-final chunk data");

    assert_eq!(chunk_data["size"], serde_json::json!(64));
    assert_eq!(chunk_data["total_size"], serde_json::json!(128));
    assert!(chunk_data.get("finish").is_none());

    let final_chunk_data = upload_stream_chunk_data(
        &serde_json::json!({
            "node_id": 7,
            "size": 128,
            "offset": 0,
            "finish": true
        }),
        64,
        64,
        128,
        true,
    )
    .expect("final chunk data");

    assert_eq!(final_chunk_data["size"], serde_json::json!(64));
    assert_eq!(final_chunk_data["total_size"], serde_json::json!(128));
    assert_eq!(final_chunk_data["finish"], serde_json::json!(true));
}
