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
