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
fn frame_encode_decode_all_types() {
    for (ft, byte) in [
        (FrameType::RpcRequest, 0x01),
        (FrameType::RpcResponse, 0x02),
        (FrameType::Heartbeat, 0x03),
        (FrameType::Error, 0x04),
    ] {
        let frame = Frame {
            frame_type: ft,
            message_id: 100,
            flags: 0,
            payload: vec![],
        };
        let encoded = frame.encode();
        assert_eq!(encoded[0], byte);
        let decoded = Frame::decode(&encoded).unwrap();
        assert_eq!(decoded.frame_type, ft);
    }
}

#[test]
fn frame_decode_too_short() {
    assert_eq!(Frame::decode(&[0u8; 13]).unwrap_err(), "frame too short");
}

#[test]
fn frame_decode_reserved_flags() {
    let frame = Frame {
        frame_type: FrameType::RpcRequest,
        message_id: 1,
        flags: 0,
        payload: vec![],
    };
    let mut encoded = frame.encode();
    encoded[9] = 0b0000_0100;
    assert_eq!(Frame::decode(&encoded).unwrap_err(), "unsupported flags");
}

#[test]
fn frame_decode_payload_length_mismatch() {
    let frame = Frame {
        frame_type: FrameType::RpcRequest,
        message_id: 1,
        flags: 0,
        payload: b"data".to_vec(),
    };
    let mut encoded = frame.encode();
    encoded.truncate(16);
    assert_eq!(
        Frame::decode(&encoded).unwrap_err(),
        "payload length mismatch"
    );
}

#[test]
fn frame_decode_unknown_type() {
    let mut encoded = vec![0xFFu8];
    encoded.extend_from_slice(&1u64.to_be_bytes());
    encoded.push(0);
    encoded.extend_from_slice(&0u32.to_be_bytes());
    assert_eq!(
        Frame::decode(&encoded).unwrap_err(),
        "unsupported frame type"
    );
}

#[test]
fn error_frame_construction() {
    let frame = frame_from_error(99, error_codes::INVALID_FORMAT, "bad frame", 1);
    assert_eq!(frame.frame_type, FrameType::Error);
    assert_eq!(frame.message_id, 99);
    assert_eq!(frame.flags, 0);

    let payload: serde_json::Value = serde_json::from_slice(&frame.payload).unwrap();
    assert_eq!(payload["v"], 1);
    assert_eq!(payload["error_code"], 1001);
    assert_eq!(payload["error_message"], "bad frame");

    let encoded = frame.encode();
    let decoded = Frame::decode(&encoded).unwrap();
    assert_eq!(decoded.frame_type, FrameType::Error);
    assert_eq!(decoded.message_id, 99);
}

#[test]
fn heartbeat_frame_construction() {
    let frame = frame_from_heartbeat(55, 1);
    assert_eq!(frame.frame_type, FrameType::Heartbeat);
    assert_eq!(frame.message_id, 55);
    assert_eq!(frame.flags, 0);

    let payload: serde_json::Value = serde_json::from_slice(&frame.payload).unwrap();
    assert_eq!(payload["v"], 1);
    assert_eq!(payload["status"], "alive");
    assert!(payload["timestamp"].as_u64().unwrap() > 0);

    let encoded = frame.encode();
    let decoded = Frame::decode(&encoded).unwrap();
    assert_eq!(decoded.frame_type, FrameType::Heartbeat);
    assert_eq!(decoded.message_id, 55);
}

#[test]
fn frame_continuation_flag_roundtrip() {
    let frame = frame_continuation(FrameType::RpcRequest, 77, b"chunk1".to_vec(), true);
    assert!(frame.has_continuation());
    assert_eq!(frame.flags, FLAG_HAS_CONTINUATION);
    assert_eq!(frame.message_id, 77);
    assert_eq!(frame.payload, b"chunk1");

    let encoded = frame.encode();
    let decoded = Frame::decode(&encoded).unwrap();
    assert!(decoded.has_continuation());
    assert_eq!(decoded.frame_type, FrameType::RpcRequest);
    assert_eq!(decoded.message_id, 77);
}

#[test]
fn frame_last_chunk_no_continuation() {
    let frame = frame_continuation(FrameType::RpcResponse, 88, b"final".to_vec(), false);
    assert!(!frame.has_continuation());
    assert_eq!(frame.flags, 0);

    let encoded = frame.encode();
    let decoded = Frame::decode(&encoded).unwrap();
    assert!(!decoded.has_continuation());
    assert_eq!(decoded.frame_type, FrameType::RpcResponse);
}

#[test]
fn validate_timestamp_ok() {
    let now = SystemTime::now()
        .duration_since(UNIX_EPOCH)
        .unwrap()
        .as_secs();
    assert!(validate_timestamp(now).is_ok());
    assert!(validate_timestamp(now + 100).is_ok());
    assert!(validate_timestamp(now - 100).is_ok());
    assert!(validate_timestamp(now + 300).is_ok());
    assert!(validate_timestamp(now - 300).is_ok());
}

#[test]
fn validate_timestamp_future_rejected() {
    let now = SystemTime::now()
        .duration_since(UNIX_EPOCH)
        .unwrap()
        .as_secs();
    assert_eq!(
        validate_timestamp(now + 301).unwrap_err(),
        "timestamp out of range"
    );
}

#[test]
fn validate_timestamp_expired_rejected() {
    let now = SystemTime::now()
        .duration_since(UNIX_EPOCH)
        .unwrap()
        .as_secs();
    assert_eq!(
        validate_timestamp(now - 301).unwrap_err(),
        "timestamp out of range"
    );
}
