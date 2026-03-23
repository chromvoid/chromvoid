//! Type definitions for the network I/O task.

use chromvoid_core::rpc::types::RpcRequest;
use chromvoid_core::rpc::RpcInputStream;
use chromvoid_core::rpc::RpcReply;
use chromvoid_protocol::{Frame, NoiseTransport, RemoteTransport, TransportType};
use tokio::sync::oneshot;

/// Request sent from the adapter to the I/O task.
pub struct IoRequest {
    pub request: RpcRequest,
    pub stream: Option<RpcInputStream>,
    pub reply_tx: oneshot::Sender<RpcReply>,
}

/// Event sent from the I/O task to the UI/adapter.
#[derive(Debug, Clone)]
pub enum IoEvent {
    Frame(Frame),
    StateChanged { old: String, new_state: String },
    Disconnected { reason: String },
    Metrics { transport_type: TransportType },
}

/// Configuration for the network I/O task.
pub struct IoTaskConfig {
    pub transport: Box<dyn RemoteTransport>,
    pub noise_transport: NoiseTransport,
}
