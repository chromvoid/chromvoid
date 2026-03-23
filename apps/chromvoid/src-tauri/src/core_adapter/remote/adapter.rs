use chromvoid_core::rpc::types::{RpcRequest, RpcResponse};
use chromvoid_core::rpc::{RpcInputStream, RpcReply};
use serde_json::Value;
use tokio::sync::mpsc;

use crate::core_adapter::types::{ConnectionState, CoreAdapter, CoreMode, RemoteHost};

use super::io_sender::IoSender;

pub struct RemoteCoreAdapter {
    host: RemoteHost,
    sender: IoSender,
    unlocked: bool,
}

impl RemoteCoreAdapter {
    /// Create a RemoteCoreAdapter backed by a USB I/O task.
    pub fn new_usb(host: RemoteHost, req_tx: mpsc::Sender<crate::usb::io_task::IoRequest>) -> Self {
        Self {
            host,
            sender: IoSender::Usb(req_tx),
            unlocked: false,
        }
    }

    /// Create a RemoteCoreAdapter backed by a network I/O task.
    pub fn from_network(
        host: RemoteHost,
        req_tx: mpsc::Sender<crate::network::io_task::IoRequest>,
    ) -> Self {
        Self {
            host,
            sender: IoSender::Network(req_tx),
            unlocked: false,
        }
    }

    #[allow(dead_code)]
    /// Replace the I/O sender after a network reconnection.
    /// The old sender is dropped, which signals the previous io_task to stop.
    pub fn replace_network_sender(
        &mut self,
        req_tx: mpsc::Sender<crate::network::io_task::IoRequest>,
    ) {
        self.sender = IoSender::Network(req_tx);
    }

    #[allow(dead_code)]
    /// Check if the underlying transport channel is still open.
    pub fn is_transport_active(&self) -> bool {
        !self.sender.is_closed()
    }
}

impl CoreAdapter for RemoteCoreAdapter {
    fn mode(&self) -> CoreMode {
        CoreMode::Remote {
            host: self.host.clone(),
        }
    }

    fn connection_state(&self) -> ConnectionState {
        if self.sender.is_closed() {
            ConnectionState::Disconnected
        } else {
            ConnectionState::Ready
        }
    }

    fn is_unlocked(&self) -> bool {
        self.unlocked
    }

    fn handle(&mut self, req: &RpcRequest) -> RpcResponse {
        if self.sender.is_closed() {
            return RpcResponse::Error {
                ok: false,
                error: "Not connected to remote device".to_string(),
                code: Some("DISCONNECTED".to_string()),
            };
        }

        let (reply_tx, reply_rx) = tokio::sync::oneshot::channel();

        if self
            .sender
            .blocking_send(req.clone(), None, reply_tx)
            .is_err()
        {
            return RpcResponse::Error {
                ok: false,
                error: "Remote I/O task closed".to_string(),
                code: Some("DISCONNECTED".to_string()),
            };
        }

        match reply_rx.blocking_recv() {
            Ok(reply) => match reply {
                RpcReply::Json(resp) => {
                    if req.command == "vault:unlock" {
                        self.unlocked = matches!(resp, RpcResponse::Success { .. });
                    }
                    resp
                }
                RpcReply::Stream(_) => RpcResponse::Error {
                    ok: false,
                    error: "Unexpected streaming response in JSON-only RPC".to_string(),
                    code: Some("STREAM_UNEXPECTED".to_string()),
                },
            },
            Err(_) => RpcResponse::Error {
                ok: false,
                error: "Remote reply channel closed".to_string(),
                code: Some("DISCONNECTED".to_string()),
            },
        }
    }

    fn handle_with_stream(&mut self, req: &RpcRequest, stream: Option<RpcInputStream>) -> RpcReply {
        if self.sender.is_closed() {
            return RpcReply::Json(RpcResponse::Error {
                ok: false,
                error: "Not connected to remote device".to_string(),
                code: Some("DISCONNECTED".to_string()),
            });
        }

        let (reply_tx, reply_rx) = tokio::sync::oneshot::channel();

        if self
            .sender
            .blocking_send(req.clone(), stream, reply_tx)
            .is_err()
        {
            return RpcReply::Json(RpcResponse::Error {
                ok: false,
                error: "Remote I/O task closed".to_string(),
                code: Some("DISCONNECTED".to_string()),
            });
        }

        match reply_rx.blocking_recv() {
            Ok(reply) => {
                if req.command == "vault:unlock" {
                    if let RpcReply::Json(ref resp) = reply {
                        self.unlocked = matches!(resp, RpcResponse::Success { .. });
                    }
                }
                reply
            }
            Err(_) => RpcReply::Json(RpcResponse::Error {
                ok: false,
                error: "Remote reply channel closed".to_string(),
                code: Some("DISCONNECTED".to_string()),
            }),
        }
    }

    fn save(&mut self) -> Result<(), String> {
        Ok(()) // Remote mode: storage managed by Core Host
    }

    fn take_events(&mut self) -> Vec<Value> {
        Vec::new()
    }

    fn set_master_key(&mut self, _key: Option<String>) {
        // Remote mode: master key is managed by the remote host
    }
}
