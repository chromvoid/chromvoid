//! Frame construction helpers.

use chromvoid_core::rpc::types::{RpcRequest, PROTOCOL_VERSION};
use chromvoid_protocol::{Frame, FrameType};

/// Construct an RPC request frame from a core RpcRequest.
pub(super) fn frame_from_rpc_request(message_id: u64, req: &RpcRequest) -> Frame {
    let payload = crate::rpc_transport_protocol::json_payload_or_empty_object(
        req,
        "network_io: rpc request frame",
    );
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
