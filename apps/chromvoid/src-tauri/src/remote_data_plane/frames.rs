//! Remote frame construction and transport helpers.

use chromvoid_core::rpc::types::{RpcRequest, PROTOCOL_VERSION};
use chromvoid_protocol::{Frame, FrameType, NoiseTransport, RemoteTransport};

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

/// Construct a heartbeat frame using the app's protocol version.
pub(super) fn frame_from_heartbeat(message_id: u64) -> Frame {
    chromvoid_protocol::frame_from_heartbeat(message_id, PROTOCOL_VERSION)
}

pub async fn send_encrypted_frame(
    transport: &mut dyn RemoteTransport,
    noise: &mut NoiseTransport,
    frame: Frame,
) -> Result<(), String> {
    let encrypted = noise
        .encrypt(&frame.encode())
        .map_err(|e| format!("encrypt: {e}"))?;
    transport
        .send(&encrypted)
        .await
        .map_err(|e| format!("send: {e}"))
}

pub async fn recv_decrypted_frame(
    transport: &mut dyn RemoteTransport,
    noise: &mut NoiseTransport,
) -> Result<Frame, String> {
    let bytes = transport.recv().await.map_err(|e| format!("recv: {e}"))?;
    let decrypted = noise.decrypt(&bytes).map_err(|e| format!("decrypt: {e}"))?;
    Frame::decode(&decrypted).map_err(|e| format!("decode: {e}"))
}
