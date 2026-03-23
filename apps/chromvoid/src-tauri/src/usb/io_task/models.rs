use chromvoid_core::rpc::types::RpcRequest;
use chromvoid_core::rpc::{RpcInputStream, RpcReply};
use serde_json::Value;
use tokio::sync::oneshot;
use tokio_serial::SerialStream;

use crate::usb::noise_session::NoiseTransport;

/// Request sent from RemoteCoreAdapter to the I/O task.
pub struct IoRequest {
    pub request: RpcRequest,
    pub stream: Option<RpcInputStream>,
    pub reply_tx: oneshot::Sender<RpcReply>,
}

/// Event sent from the I/O task to the UI.
#[derive(Debug, Clone)]
pub enum IoEvent {
    StateChange { old: String, new: String },
    PushEvent(Value),
    Disconnected { reason: String },
}

/// Configuration for the USB I/O task.
pub struct IoTaskConfig {
    pub stream: SerialStream,
    pub noise_transport: NoiseTransport,
}
