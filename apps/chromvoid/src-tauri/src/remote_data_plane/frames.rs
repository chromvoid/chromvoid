//! Remote frame construction and transport helpers.

use chromvoid_core::rpc::types::{
    RpcRequest, CORE_FEATURE_REMOTE_STREAM_CONTROL_V1, PROTOCOL_VERSION,
};
use chromvoid_protocol::{Frame, FrameType};

pub use chromvoid_network_runtime::remote_io::{recv_decrypted_frame, send_encrypted_frame};
pub(crate) use chromvoid_network_runtime::remote_io::{
    recv_decrypted_frame_typed, send_encrypted_frame_typed,
};

/// Construct an RPC request frame from a core RpcRequest.
pub(super) fn frame_from_rpc_request(message_id: u64, req: &RpcRequest) -> Frame {
    let payload = crate::rpc_transport_protocol::json_payload_or_empty_object(
        req,
        "remote_data_plane: rpc request frame",
    );
    Frame {
        frame_type: FrameType::RpcRequest,
        message_id,
        flags: 0,
        payload,
    }
}

pub(super) fn frame_from_rpc_request_with_transport_features(
    message_id: u64,
    req: &RpcRequest,
    include_stream_control: bool,
) -> Frame {
    if !include_stream_control {
        return frame_from_rpc_request(message_id, req);
    }

    let request = req
        .clone()
        .with_transport_features(vec![CORE_FEATURE_REMOTE_STREAM_CONTROL_V1.to_string()]);
    frame_from_rpc_request(message_id, &request)
}

/// Construct a heartbeat frame using the app's protocol version.
pub(super) fn frame_from_heartbeat(message_id: u64) -> Frame {
    chromvoid_protocol::frame_from_heartbeat(message_id, PROTOCOL_VERSION)
}
