//! Integration tests for gateway protocol frame helpers.
//!
//! These tests exercise `chromvoid_protocol` types from the Tauri app's
//! perspective, complementing the unit tests inside the protocol crate.

use chromvoid_protocol::{error_codes, validate_timestamp, AntiReplay, Frame, FrameType};

#[test]
fn frame_roundtrip_all_types() {
    for ft in [
        FrameType::RpcRequest,
        FrameType::RpcResponse,
        FrameType::Heartbeat,
        FrameType::Error,
    ] {
        let frame = Frame {
            frame_type: ft,
            message_id: 99,
            flags: 0,
            payload: b"test-payload".to_vec(),
        };
        let encoded = frame.encode();
        let decoded = Frame::decode(&encoded).unwrap();
        assert_eq!(decoded.frame_type, ft);
        assert_eq!(decoded.message_id, 99);
        assert_eq!(decoded.payload, b"test-payload");
    }
}

#[test]
fn anti_replay_monotonic() {
    let mut ar = AntiReplay::new();
    assert!(ar.check(1).is_ok());
    assert!(ar.check(2).is_ok());
    assert!(ar.check(1).is_err(), "replay must be rejected");
    assert!(ar.check(2).is_err(), "duplicate must be rejected");
    assert!(ar.check(3).is_ok());
}

#[test]
fn anti_replay_rejects_regression() {
    let mut ar = AntiReplay::new();
    assert!(ar.check(100).is_ok());
    assert!(ar.check(200).is_ok());
    assert!(ar.check(150).is_err(), "out-of-order regression rejected");
}

#[test]
fn anti_replay_stream_continuation() {
    let mut ar = AntiReplay::new();
    assert!(ar.check(10).is_ok());
    assert!(ar.check(20).is_ok());

    // During a stream, repeated message_id is allowed.
    ar.set_active_stream(20);
    assert!(ar.check(20).is_ok());
    assert!(ar.check(20).is_ok());

    // But a different lower id is still rejected.
    assert!(ar.check(15).is_err());

    // After clearing, the stream id is rejected again.
    ar.clear_active_stream();
    assert!(ar.check(20).is_err());
    assert!(ar.check(30).is_ok());
}

#[test]
fn timestamp_validation_accepts_current() {
    let now_secs = std::time::SystemTime::now()
        .duration_since(std::time::UNIX_EPOCH)
        .unwrap()
        .as_secs();
    assert!(validate_timestamp(now_secs).is_ok());
}

#[test]
fn timestamp_validation_rejects_far_future() {
    let now_secs = std::time::SystemTime::now()
        .duration_since(std::time::UNIX_EPOCH)
        .unwrap()
        .as_secs();
    // +600s is well beyond the ±300s window.
    assert!(validate_timestamp(now_secs + 600).is_err());
}

#[test]
fn timestamp_validation_rejects_old() {
    let now_secs = std::time::SystemTime::now()
        .duration_since(std::time::UNIX_EPOCH)
        .unwrap()
        .as_secs();
    assert!(validate_timestamp(now_secs - 600).is_err());
}

#[test]
fn error_codes_nonzero() {
    // Error codes should never be 0 (0 could be confused with success).
    assert_ne!(error_codes::INVALID_FORMAT, 0);
    assert_ne!(error_codes::UNSUPPORTED_TYPE, 0);
    assert_ne!(error_codes::AUTH_FAILED, 0);
    assert_ne!(error_codes::REPLAY_DETECTED, 0);
    assert_ne!(error_codes::RATE_LIMIT_EXCEEDED, 0);
    assert_ne!(error_codes::CAPABILITY_DENIED, 0);
}

#[test]
fn error_codes_distinct() {
    let codes = [
        error_codes::INVALID_FORMAT,
        error_codes::UNSUPPORTED_TYPE,
        error_codes::AUTH_FAILED,
        error_codes::REPLAY_DETECTED,
        error_codes::RATE_LIMIT_EXCEEDED,
        error_codes::CAPABILITY_DENIED,
    ];
    for (i, a) in codes.iter().enumerate() {
        for b in &codes[i + 1..] {
            assert_ne!(a, b, "error codes must be unique");
        }
    }
}
