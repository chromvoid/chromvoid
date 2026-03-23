//! Frame construction helpers.

use chromvoid_core::rpc::types::{RpcRequest, PROTOCOL_VERSION};
use chromvoid_protocol::{Frame, FrameType};

/// Construct an RPC request frame from a core RpcRequest.
pub(super) fn frame_from_rpc_request(message_id: u64, req: &RpcRequest) -> Frame {
    let payload = serde_json::to_vec(req).unwrap_or_else(|_| b"{}".to_vec());
    Frame {
        frame_type: FrameType::RpcRequest,
        message_id,
        flags: 0,
        payload,
    }
}

/// Construct a heartbeat frame using the app's protocol version.
pub(super) fn frame_from_heartbeat(message_id: u64) -> Frame {
    chromvoid_protocol::frame_from_heartbeat(message_id, PROTOCOL_VERSION)
}
