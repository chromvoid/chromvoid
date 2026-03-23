//! SPEC-002 s4.1: Frame encoding/decoding for the ChromVoid protocol.
//!
//! Binary frame format (14-byte header, big-endian):
//! ```text
//! Byte 0:       Frame type (0x01-0x04)
//! Bytes 1-8:    Message ID (u64)
//! Byte 9:       Flags (bit 0 = continuation)
//! Bytes 10-13:  Payload length (u32)
//! Bytes 14+:    Payload
//! ```

use std::time::{SystemTime, UNIX_EPOCH};

/// SPEC-002 s4.1: Continuation flag (bit 0). When set, more frames follow
/// with the same message_id. The last frame in a sequence has this bit cleared.
pub const FLAG_HAS_CONTINUATION: u8 = 0x01;

/// Frame header size in bytes.
pub const HEADER_SIZE: usize = 14;

/// Maximum payload size (16 MiB).
pub const MAX_PAYLOAD_SIZE: usize = 16 * 1024 * 1024;

/// SPEC-002 s4.4: Structured error codes for Error frames (Type 0x04).
pub mod error_codes {
    pub const INVALID_FORMAT: u16 = 1001;
    pub const UNSUPPORTED_TYPE: u16 = 1002;
    pub const AUTH_FAILED: u16 = 1003;
    pub const REPLAY_DETECTED: u16 = 1004;
    pub const RATE_LIMIT_EXCEEDED: u16 = 1005;
    pub const CAPABILITY_DENIED: u16 = 1006;
}

#[derive(Debug, Clone, Copy, PartialEq, Eq)]
pub enum FrameType {
    RpcRequest = 0x01,
    RpcResponse = 0x02,
    Heartbeat = 0x03,
    Error = 0x04,
}

impl FrameType {
    /// Parse a byte into a FrameType.
    pub fn from_byte(b: u8) -> Option<Self> {
        match b {
            0x01 => Some(Self::RpcRequest),
            0x02 => Some(Self::RpcResponse),
            0x03 => Some(Self::Heartbeat),
            0x04 => Some(Self::Error),
            _ => None,
        }
    }
}

#[derive(Debug, Clone)]
pub struct Frame {
    pub frame_type: FrameType,
    pub message_id: u64,
    pub flags: u8,
    pub payload: Vec<u8>,
}

impl Frame {
    /// Returns `true` if the continuation flag (bit 0) is set.
    pub fn has_continuation(&self) -> bool {
        self.flags & FLAG_HAS_CONTINUATION != 0
    }

    /// Encode this frame into a binary buffer.
    pub fn encode(&self) -> Vec<u8> {
        let mut out = Vec::with_capacity(HEADER_SIZE + self.payload.len());
        out.push(self.frame_type as u8);
        out.extend_from_slice(&self.message_id.to_be_bytes());
        out.push(self.flags);
        let len: u32 = self.payload.len().try_into().unwrap_or(u32::MAX);
        out.extend_from_slice(&len.to_be_bytes());
        out.extend_from_slice(&self.payload);
        out
    }

    /// Decode a binary buffer into a Frame.
    pub fn decode(bytes: &[u8]) -> Result<Self, &'static str> {
        if bytes.len() < HEADER_SIZE {
            return Err("frame too short");
        }
        let frame_type = FrameType::from_byte(bytes[0]).ok_or("unsupported frame type")?;

        let mut mid = [0u8; 8];
        mid.copy_from_slice(&bytes[1..9]);
        let message_id = u64::from_be_bytes(mid);

        let flags = bytes[9];
        // SPEC-002: bits 2-7 are reserved and must be 0.
        if (flags & 0b1111_1100) != 0 {
            return Err("unsupported flags");
        }

        let mut lenb = [0u8; 4];
        lenb.copy_from_slice(&bytes[10..14]);
        let payload_len = u32::from_be_bytes(lenb) as usize;
        if payload_len > MAX_PAYLOAD_SIZE {
            return Err("payload too large");
        }
        if bytes.len() != HEADER_SIZE + payload_len {
            return Err("payload length mismatch");
        }

        Ok(Self {
            frame_type,
            message_id,
            flags,
            payload: bytes[HEADER_SIZE..].to_vec(),
        })
    }
}

/// Construct an Error frame (Type 0x04).
/// Payload is PD-safe JSON: no vault details exposed.
pub fn frame_from_error(message_id: u64, code: u16, message: &str, protocol_version: u8) -> Frame {
    let payload = serde_json::json!({
        "v": protocol_version,
        "error_code": code,
        "error_message": message,
    });
    Frame {
        frame_type: FrameType::Error,
        message_id,
        flags: 0,
        payload: serde_json::to_vec(&payload).unwrap_or_else(|_| b"{}".to_vec()),
    }
}

/// Construct a Heartbeat frame (Type 0x03).
pub fn frame_from_heartbeat(message_id: u64, protocol_version: u8) -> Frame {
    let now_secs = SystemTime::now()
        .duration_since(UNIX_EPOCH)
        .map(|d| d.as_secs())
        .unwrap_or(0);
    let payload = serde_json::json!({
        "v": protocol_version,
        "timestamp": now_secs,
        "status": "alive",
    });
    Frame {
        frame_type: FrameType::Heartbeat,
        message_id,
        flags: 0,
        payload: serde_json::to_vec(&payload).unwrap_or_else(|_| b"{}".to_vec()),
    }
}

/// Construct a continuation frame for streaming. `has_more` controls the
/// continuation flag: `true` means more chunks follow, `false` signals the
/// final chunk.
pub fn frame_continuation(
    frame_type: FrameType,
    message_id: u64,
    payload: Vec<u8>,
    has_more: bool,
) -> Frame {
    Frame {
        frame_type,
        message_id,
        flags: if has_more { FLAG_HAS_CONTINUATION } else { 0 },
        payload,
    }
}

/// SPEC-002 s5.2: Validate timestamp is within +/- 300 seconds of current time.
pub fn validate_timestamp(timestamp_secs: u64) -> Result<(), &'static str> {
    let now = SystemTime::now()
        .duration_since(UNIX_EPOCH)
        .map(|d| d.as_secs())
        .unwrap_or(0);
    let diff = if timestamp_secs > now {
        timestamp_secs - now
    } else {
        now - timestamp_secs
    };
    if diff > 300 {
        return Err("timestamp out of range");
    }
    Ok(())
}

#[cfg(test)]
#[path = "frame_tests.rs"]
mod tests;
