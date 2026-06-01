use std::sync::{Arc, Mutex};

use chromvoid_core::rpc::types::{RpcRequest, RpcResponse};
use chromvoid_core::rpc::{RpcInputStream, RpcReply};
use serde_json::Value;
use tokio::sync::mpsc;

use crate::core_adapter::types::{
    ConnectionState, CoreAdapter, CoreMode, RemoteHost, RemoteJsonClientHandle, RemoteRpcPriority,
};

use super::io_sender::IoSender;

pub struct RemoteCoreAdapter {
    host: RemoteHost,
    sender: IoSender,
    unlocked: bool,
    features: Arc<Mutex<Vec<String>>>,
}

impl RemoteCoreAdapter {
    /// Create a RemoteCoreAdapter backed by a USB I/O task.
    pub fn new_usb(host: RemoteHost, req_tx: mpsc::Sender<crate::usb::io_task::IoRequest>) -> Self {
        Self {
            host,
            sender: IoSender::Usb(req_tx),
            unlocked: false,
            features: Arc::new(Mutex::new(Vec::new())),
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
            features: Arc::new(Mutex::new(Vec::new())),
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
        self.clear_features();
    }

    #[allow(dead_code)]
    /// Check if the underlying transport channel is still open.
    pub fn is_transport_active(&self) -> bool {
        !self.sender.is_closed()
    }

    pub fn probe_capabilities(&mut self) {
        let response = self.send_json_with_priority(
            &RpcRequest::new("core:capabilities", serde_json::json!({})),
            RemoteRpcPriority::Normal,
        );
        let features = parse_capability_features(&response);
        self.remote_client_handle()
            .replace_features(features.clone());
        tracing::info!(
            "remote_core: capabilities probed feature_count={} features={:?}",
            features.len(),
            features
        );
    }

    fn clear_features(&self) {
        self.remote_client_handle().replace_features(Vec::new());
    }

    fn remote_client_handle(&self) -> RemoteJsonClientHandle {
        RemoteJsonClientHandle::new(self.sender.json_sender(), self.features.clone())
    }

    fn send_json_with_priority(
        &self,
        req: &RpcRequest,
        priority: RemoteRpcPriority,
    ) -> RpcResponse {
        self.remote_client_handle()
            .send_json_blocking(req.clone(), priority, None)
    }
}

fn parse_capability_features(response: &RpcResponse) -> Vec<String> {
    let Some(result) = response.result() else {
        return Vec::new();
    };
    let Some(features) = result.get("features") else {
        tracing::warn!("remote_core: capabilities response missing features field");
        return Vec::new();
    };
    let Some(features) = features.as_array() else {
        tracing::warn!("remote_core: capabilities response features field is not an array");
        return Vec::new();
    };

    let mut parsed = Vec::with_capacity(features.len());
    let mut skipped = 0usize;
    for feature in features {
        if let Some(feature) = feature.as_str() {
            parsed.push(feature.to_owned());
        } else {
            skipped += 1;
        }
    }
    if skipped > 0 {
        tracing::warn!(
            skipped,
            "remote_core: capabilities response skipped non-string features"
        );
    }
    parsed
}

fn priority_for_request(req: &RpcRequest) -> RemoteRpcPriority {
    match req.command.as_str() {
        "vault:lock" | "catalog:media:inspect:cancel" => RemoteRpcPriority::High,
        "catalog:media:inspect" => RemoteRpcPriority::Low,
        _ => RemoteRpcPriority::Normal,
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

    fn remote_core_features(&self) -> Vec<String> {
        self.remote_client_handle().features()
    }

    fn remote_json_client(&self) -> Option<RemoteJsonClientHandle> {
        Some(self.remote_client_handle())
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
            .blocking_send(req.clone(), None, reply_tx, priority_for_request(req), None)
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
                        if self.unlocked {
                            self.probe_capabilities();
                        }
                    }
                    if req.command == "vault:lock" {
                        self.unlocked = false;
                    }
                    resp
                }
                RpcReply::Stream(_) | RpcReply::RangeStream(_) => RpcResponse::Error {
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
            .blocking_send(
                req.clone(),
                stream,
                reply_tx,
                priority_for_request(req),
                None,
            )
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
                        if self.unlocked {
                            self.probe_capabilities();
                        }
                    }
                }
                if req.command == "vault:lock" {
                    self.unlocked = false;
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

#[cfg(test)]
mod capability_parse_tests {
    use super::parse_capability_features;
    use chromvoid_core::rpc::types::RpcResponse;
    use serde_json::json;

    #[test]
    fn parse_capability_features_keeps_legacy_error_empty() {
        let response = RpcResponse::Error {
            ok: false,
            error: "unknown command: core:capabilities".to_string(),
            code: Some("UNKNOWN_COMMAND".to_string()),
        };

        assert!(parse_capability_features(&response).is_empty());
    }

    #[test]
    fn parse_capability_features_skips_malformed_entries() {
        let response = RpcResponse::success(json!({
            "features": ["remote-media", 42, null, "passkey"]
        }));

        assert_eq!(
            parse_capability_features(&response),
            vec!["remote-media".to_string(), "passkey".to_string()]
        );
    }

    #[test]
    fn parse_capability_features_defaults_malformed_features_to_empty() {
        let response = RpcResponse::success(json!({ "features": "remote-media" }));

        assert!(parse_capability_features(&response).is_empty());
    }
}
