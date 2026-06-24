//! Remote frame construction and transport helpers.

use chromvoid_core::rpc::types::{RpcRequest, PROTOCOL_VERSION};
use chromvoid_protocol::{Frame, FrameType, NoiseTransport, RemoteTransport, TransportType};

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
    let transport_type = transport.transport_type();
    let frame_type = frame.frame_type;
    let message_id = frame.message_id;
    let flags = frame.flags;
    let payload_len = frame.payload.len();
    let encrypted = noise
        .encrypt(&frame.encode())
        .map_err(|e| format!("encrypt: {e}"))?;
    log_usb_frame(
        "send",
        transport_type,
        frame_type,
        message_id,
        flags,
        payload_len,
        encrypted.len(),
    );
    transport
        .send(&encrypted)
        .await
        .map_err(|e| format!("send: {e}"))
}

pub async fn recv_decrypted_frame(
    transport: &mut dyn RemoteTransport,
    noise: &mut NoiseTransport,
) -> Result<Frame, String> {
    let transport_type = transport.transport_type();
    let bytes = transport.recv().await.map_err(|e| format!("recv: {e}"))?;
    let encrypted_len = bytes.len();
    let decrypted = match noise.decrypt(&bytes) {
        Ok(decrypted) => decrypted,
        Err(error) => {
            if matches!(transport_type, TransportType::UsbMobile) {
                tracing::warn!(
                    transport_type = ?transport_type,
                    encrypted_len,
                    error = %error,
                    "remote_frame: usb decrypt failed"
                );
            }
            return Err(format!("decrypt: {error}"));
        }
    };
    let frame = Frame::decode(&decrypted).map_err(|e| format!("decode: {e}"))?;
    log_usb_frame(
        "recv",
        transport_type,
        frame.frame_type,
        frame.message_id,
        frame.flags,
        frame.payload.len(),
        encrypted_len,
    );
    Ok(frame)
}

fn log_usb_frame(
    direction: &'static str,
    transport_type: TransportType,
    frame_type: FrameType,
    message_id: u64,
    flags: u8,
    payload_len: usize,
    encrypted_len: usize,
) {
    if matches!(transport_type, TransportType::UsbMobile) {
        tracing::info!(
            direction,
            transport_type = ?transport_type,
            frame_type = ?frame_type,
            message_id,
            flags,
            payload_len,
            encrypted_len,
            "remote_frame: usb encrypted frame"
        );
    }
}
