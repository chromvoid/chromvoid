//! Gateway protocol — re-exports shared types from `chromvoid-protocol`
//! and provides app-level helpers that depend on `chromvoid-core` types.

pub use chromvoid_protocol::{
    error_codes, frame_continuation, validate_timestamp, AntiReplay, Frame, FrameType,
    FLAG_HAS_CONTINUATION,
};

use serde_json::Value;

use chromvoid_core::rpc::stream::RpcStreamMeta;
use chromvoid_core::rpc::types::{RpcRequest, RpcResponse, PROTOCOL_VERSION};

/// Construct an Error frame using the app's PROTOCOL_VERSION.
pub fn frame_from_error(message_id: u64, code: u16, message: &str) -> Frame {
    chromvoid_protocol::frame_from_error(message_id, code, message, PROTOCOL_VERSION)
}

/// Construct a Heartbeat frame using the app's PROTOCOL_VERSION.
pub fn frame_from_heartbeat(message_id: u64) -> Frame {
    chromvoid_protocol::frame_from_heartbeat(message_id, PROTOCOL_VERSION)
}

pub fn frame_from_rpc_request(message_id: u64, req: &RpcRequest) -> Frame {
    let payload = serde_json::to_vec(req).unwrap_or_else(|_| b"{}".to_vec());
    Frame {
        frame_type: FrameType::RpcRequest,
        message_id,
        flags: 0,
        payload,
    }
}

pub fn frame_from_rpc_response(message_id: u64, resp: &RpcResponse) -> Frame {
    let payload = serde_json::to_vec(resp).unwrap_or_else(|_| b"{}".to_vec());
    Frame {
        frame_type: FrameType::RpcResponse,
        message_id,
        flags: 0,
        payload,
    }
}

pub fn frame_from_event(message_id: u64, command: &str, data: Value) -> Frame {
    let req = RpcRequest {
        v: PROTOCOL_VERSION,
        command: command.to_string(),
        data,
    };
    frame_from_rpc_request(message_id, &req)
}

/// Construct the first response frame for a download stream. Contains
/// JSON-serialized `RpcStreamMeta` with the continuation flag set.
pub fn frame_stream_meta_response(message_id: u64, meta: &RpcStreamMeta) -> Frame {
    let payload = serde_json::to_vec(meta).unwrap_or_else(|_| b"{}".to_vec());
    Frame {
        frame_type: FrameType::RpcResponse,
        message_id,
        flags: FLAG_HAS_CONTINUATION,
        payload,
    }
}

#[cfg(test)]
#[path = "protocol_tests.rs"]
mod tests;
