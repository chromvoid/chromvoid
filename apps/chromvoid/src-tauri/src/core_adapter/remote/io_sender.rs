use chromvoid_core::rpc::types::RpcRequest;
use chromvoid_core::rpc::{RpcInputStream, RpcReply};
use tokio::sync::{mpsc, oneshot};

use crate::core_adapter::types::{RemoteCancelGroup, RemoteJsonSender, RemoteRpcPriority};

/// Abstraction over USB and network I/O request senders.
/// Both sender types carry identical IoRequest structs but are separate Rust types.
#[derive(Clone)]
pub(super) enum IoSender {
    Usb(mpsc::Sender<crate::usb::io_task::IoRequest>),
    Network(mpsc::Sender<crate::network::io_task::IoRequest>),
}

impl IoSender {
    pub(super) fn is_closed(&self) -> bool {
        match self {
            Self::Usb(tx) => tx.is_closed(),
            Self::Network(tx) => tx.is_closed(),
        }
    }

    pub(super) fn blocking_send(
        &self,
        request: RpcRequest,
        stream: Option<RpcInputStream>,
        reply_tx: oneshot::Sender<RpcReply>,
        priority: RemoteRpcPriority,
        cancel_group: Option<RemoteCancelGroup>,
    ) -> Result<(), ()> {
        match self {
            Self::Usb(tx) => tx
                .blocking_send(crate::usb::io_task::IoRequest {
                    request,
                    stream,
                    reply_tx,
                    priority,
                    cancel_group,
                })
                .map_err(|_| ()),
            Self::Network(tx) => tx
                .blocking_send(crate::network::io_task::IoRequest {
                    request,
                    stream,
                    reply_tx,
                    priority,
                    cancel_group,
                })
                .map_err(|_| ()),
        }
    }

    pub(super) fn json_sender(&self) -> RemoteJsonSender {
        match self {
            Self::Usb(tx) => RemoteJsonSender::Usb(tx.clone()),
            Self::Network(tx) => RemoteJsonSender::Network(tx.clone()),
        }
    }
}
