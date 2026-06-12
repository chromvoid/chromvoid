//! Type definitions for the remote data-plane task.

use chromvoid_core::rpc::types::RpcRequest;
use chromvoid_core::rpc::RpcInputStream;
use chromvoid_core::rpc::RpcReply;
use chromvoid_protocol::{Frame, NoiseTransport, RemoteTransport, TransportType};
use tokio::sync::oneshot;

use crate::core_adapter::{RemoteCancelGroup, RemoteRpcPriority};

/// Request sent from the adapter to the remote data-plane task.
pub struct RemoteIoRequest {
    pub request: RpcRequest,
    pub stream: Option<RpcInputStream>,
    pub reply_tx: oneshot::Sender<RpcReply>,
    pub priority: RemoteRpcPriority,
    pub cancel_group: Option<RemoteCancelGroup>,
}

/// Event sent from the remote data-plane task to the UI/adapter.
#[derive(Debug, Clone)]
pub enum RemoteIoEvent {
    Frame(Frame),
    StateChanged { old: String, new_state: String },
    Disconnected { reason: String },
    Metrics { transport_type: TransportType },
}

/// Configuration for the remote data-plane task.
pub struct RemoteIoTaskConfig {
    pub transport: Box<dyn RemoteTransport>,
    pub noise_transport: NoiseTransport,
}
