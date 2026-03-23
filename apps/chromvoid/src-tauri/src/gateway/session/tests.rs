use super::*;
use crate::gateway::protocol::{error_codes, Frame, FrameType};

#[test]
fn upload_stream_commands() {
    assert!(is_upload_stream_command("catalog:upload"));
    assert!(is_upload_stream_command("catalog:secret:write"));
    assert!(!is_upload_stream_command("catalog:list"));
    assert!(!is_upload_stream_command("vault:unlock"));
}

#[test]
fn download_stream_commands() {
    assert!(is_download_stream_command("catalog:download"));
    assert!(is_download_stream_command("catalog:secret:read"));
    assert!(is_download_stream_command("vault:export:download"));
    assert!(!is_download_stream_command("catalog:list"));
}

#[test]
fn security_constants_reasonable() {
    assert!(MAX_REQUESTS_PER_MINUTE <= 300, "Rate limit too high");
    assert!(IDLE_TIMEOUT.as_secs() <= 600, "Idle timeout too long");
    assert!(HEARTBEAT_INTERVAL.as_secs() >= 10, "Heartbeat too frequent");
    assert!(STREAM_CHUNK_SIZE <= 2 * 1024 * 1024, "Chunk size too large");
}

#[test]
fn encoded_error_frame_preserves_request_message_id() {
    let encoded = encoded_error_frame(4242, error_codes::INVALID_FORMAT, "bad request");
    let decoded = Frame::decode(&encoded).expect("error frame should decode");
    assert_eq!(decoded.message_id, 4242);
    assert_eq!(decoded.frame_type, FrameType::Error);
}
