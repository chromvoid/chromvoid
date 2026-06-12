use chromvoid_core::rpc::types::RpcRequest;
use chromvoid_core::rpc::{RpcInputStream, RpcReply};
use tokio::sync::{mpsc, oneshot};

use crate::core_adapter::types::{RemoteCancelGroup, RemoteJsonSender, RemoteRpcPriority};

/// Abstraction over remote I/O request senders.
#[derive(Clone)]
pub(super) struct IoSender(mpsc::Sender<crate::remote_data_plane::RemoteIoRequest>);

impl IoSender {
    pub(super) fn new(tx: mpsc::Sender<crate::remote_data_plane::RemoteIoRequest>) -> Self {
        Self(tx)
    }

    pub(super) fn is_closed(&self) -> bool {
        self.0.is_closed()
    }

    pub(super) fn blocking_send(
        &self,
        request: RpcRequest,
        stream: Option<RpcInputStream>,
        reply_tx: oneshot::Sender<RpcReply>,
        priority: RemoteRpcPriority,
        cancel_group: Option<RemoteCancelGroup>,
    ) -> Result<(), ()> {
        self.0
            .blocking_send(crate::remote_data_plane::RemoteIoRequest {
                request,
                stream,
                reply_tx,
                priority,
                cancel_group,
            })
            .map_err(|_| ())
    }

    pub(super) fn json_sender(&self) -> RemoteJsonSender {
        RemoteJsonSender::new(self.0.clone())
    }
}
