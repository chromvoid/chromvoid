use std::time::Duration;

use super::protocol::frame_from_error;

#[macro_use]
mod macros;
mod handler;

#[cfg(test)]
mod tests;

const MAX_WS_MESSAGE_SIZE: usize = 16 * 1024 * 1024 + 256;

/// SECURITY: Idle timeout for established connections.
const IDLE_TIMEOUT: Duration = Duration::from_secs(300);

/// SECURITY: Maximum requests per minute per connection.
const MAX_REQUESTS_PER_MINUTE: usize = 120;

/// SPEC-002 s4.3: Heartbeat interval.
const HEARTBEAT_INTERVAL: Duration = Duration::from_secs(30);

/// Default session max duration (used when config value is 0 or invalid).
const DEFAULT_SESSION_MAX_DURATION: Duration = Duration::from_secs(3600);

/// Maximum binary chunk size for streaming (1 MB per frame).
const STREAM_CHUNK_SIZE: usize = 1024 * 1024;

fn encoded_error_frame(message_id: u64, code: u16, message: &str) -> Vec<u8> {
    frame_from_error(message_id, code, message).encode()
}

/// Commands that use chunked upload (extension -> core).
fn is_upload_stream_command(command: &str) -> bool {
    matches!(command, "catalog:upload" | "catalog:secret:write")
}

/// Commands that use chunked download (core -> extension).
fn is_download_stream_command(command: &str) -> bool {
    matches!(
        command,
        "catalog:download" | "catalog:secret:read" | "vault:export:download"
    )
}

/// SPEC-002 s6: Connection lifecycle phases.
#[derive(Debug, Clone, Copy, PartialEq, Eq)]
enum ConnectionPhase {
    Established,
    Closing,
}

pub(super) use handler::handle_extension_session;
