use chromvoid_core::rpc::types::{RpcRequest, RpcResponse};
use chromvoid_core::rpc::{RpcInputStream, RpcReply};
use chromvoid_protocol::TransportMetrics;
use serde_json::Value;
use tokio::sync::mpsc;
use zeroize::Zeroize;

use crate::core_adapter::DeferredReply;
use crate::core_adapter::{
    ConnectionState, CoreAdapter, CoreMode, RemoteHost, RemoteJsonClientHandle, RemoteRpcPriority,
};
use crate::remote_data_plane::RemotePeerFeatures;

use super::io_sender::IoSender;

pub struct RemoteCoreAdapter {
    host: RemoteHost,
    sender: IoSender,
    unlocked: bool,
    features: RemotePeerFeatures,
    transport_metrics: Option<TransportMetrics>,
    transport_session_generation: Option<u64>,
    mobile_usb_session_approved: bool,
}

impl RemoteCoreAdapter {
    /// Create a RemoteCoreAdapter backed by a remote data-plane task.
    pub fn from_remote_sender(
        host: RemoteHost,
        req_tx: mpsc::Sender<crate::remote_data_plane::RemoteIoRequest>,
    ) -> Self {
        Self::from_remote_sender_with_metrics(host, req_tx, None)
    }

    pub fn from_remote_sender_with_metrics(
        host: RemoteHost,
        req_tx: mpsc::Sender<crate::remote_data_plane::RemoteIoRequest>,
        transport_metrics: Option<TransportMetrics>,
    ) -> Self {
        Self::from_remote_sender_with_metrics_and_generation(host, req_tx, transport_metrics, None)
    }

    pub fn from_remote_sender_with_metrics_and_generation(
        host: RemoteHost,
        req_tx: mpsc::Sender<crate::remote_data_plane::RemoteIoRequest>,
        transport_metrics: Option<TransportMetrics>,
        transport_session_generation: Option<u64>,
    ) -> Self {
        Self::from_remote_sender_with_metrics_generation_and_features(
            host,
            req_tx,
            transport_metrics,
            transport_session_generation,
            RemotePeerFeatures::new(),
        )
    }

    pub fn from_remote_sender_with_metrics_generation_and_features(
        host: RemoteHost,
        req_tx: mpsc::Sender<crate::remote_data_plane::RemoteIoRequest>,
        transport_metrics: Option<TransportMetrics>,
        transport_session_generation: Option<u64>,
        features: RemotePeerFeatures,
    ) -> Self {
        let mobile_usb_session_approved = !matches!(&host, RemoteHost::MobileUsb { .. });
        Self {
            host,
            sender: IoSender::new(req_tx),
            unlocked: false,
            features,
            transport_metrics,
            transport_session_generation,
            mobile_usb_session_approved,
        }
    }

    #[allow(dead_code)]
    /// Replace the I/O sender after a remote transport reconnection.
    /// The old sender is dropped, which signals the previous data-plane task to stop.
    pub fn replace_remote_sender(
        &mut self,
        req_tx: mpsc::Sender<crate::remote_data_plane::RemoteIoRequest>,
    ) {
        self.sender = IoSender::new(req_tx);
        self.clear_features();
    }

    #[allow(dead_code)]
    /// Check if the underlying transport channel is still open.
    pub fn is_transport_active(&self) -> bool {
        !self.sender.is_closed()
    }

    pub fn transport_metrics(&self) -> Option<&TransportMetrics> {
        self.transport_metrics.as_ref()
    }

    pub(crate) fn apply_startup_state(&mut self, features: Vec<String>, unlocked: bool) {
        self.remote_client_handle().replace_features(features);
        self.unlocked = unlocked;
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

    fn apply_json_state_transition(&mut self, req: &RpcRequest, resp: &RpcResponse) {
        match req.command.as_str() {
            "vault:unlock" => {
                self.unlocked = resp.is_ok();
                if self.unlocked {
                    self.probe_capabilities();
                }
            }
            "vault:lock" if resp.is_ok() => {
                self.unlocked = false;
            }
            "vault:status" => {
                if let Some(is_unlocked) = resp
                    .result()
                    .and_then(|result| result.get("is_unlocked"))
                    .and_then(|value| value.as_bool())
                {
                    self.unlocked = is_unlocked;
                }
            }
            _ => {}
        }
    }
}

pub(crate) fn parse_capability_features(response: &RpcResponse) -> Vec<String> {
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

/// Commands whose replies mutate adapter-local state via
/// `apply_json_state_transition`; they must stay on the synchronous path so
/// the transition is applied while the adapter is still borrowed mutably.
fn is_state_transition_command(command: &str) -> bool {
    matches!(command, "vault:unlock" | "vault:lock" | "vault:status")
}

fn priority_for_request(req: &RpcRequest) -> RemoteRpcPriority {
    match req.command.as_str() {
        "vault:lock" | "catalog:media:inspect:cancel" => RemoteRpcPriority::High,
        "catalog:downloadRange" => RemoteRpcPriority::Media,
        "catalog:media:inspect" => RemoteRpcPriority::Low,
        "catalog:derivative:ensure"
            if req.data.get("tier").and_then(Value::as_str) == Some("thumbnail") =>
        {
            RemoteRpcPriority::Low
        }
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

    fn transport_session_generation(&self) -> Option<u64> {
        self.transport_session_generation
    }

    fn mobile_usb_session_requires_approval(&self) -> bool {
        matches!(&self.host, RemoteHost::MobileUsb { .. }) && !self.mobile_usb_session_approved
    }

    fn mark_mobile_usb_session_approved(&mut self) {
        if matches!(&self.host, RemoteHost::MobileUsb { .. }) {
            self.mobile_usb_session_approved = true;
        }
    }

    fn transport_metrics(&self) -> Option<TransportMetrics> {
        self.transport_metrics.clone()
    }

    fn remote_json_client(&self) -> Option<RemoteJsonClientHandle> {
        Some(self.remote_client_handle())
    }

    fn is_unlocked(&self) -> bool {
        self.unlocked
    }

    fn mark_remote_locked(&mut self) {
        self.unlocked = false;
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
                    self.apply_json_state_transition(req, &resp);
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
                if let RpcReply::Json(ref resp) = reply {
                    self.apply_json_state_transition(req, resp);
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

    fn begin_with_stream(
        &mut self,
        req: &RpcRequest,
        stream: Option<RpcInputStream>,
    ) -> DeferredReply {
        if is_state_transition_command(&req.command) {
            return DeferredReply::Immediate(self.handle_with_stream(req, stream));
        }

        if self.sender.is_closed() {
            return DeferredReply::Immediate(RpcReply::Json(RpcResponse::Error {
                ok: false,
                error: "Not connected to remote device".to_string(),
                code: Some("DISCONNECTED".to_string()),
            }));
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
            return DeferredReply::Immediate(RpcReply::Json(RpcResponse::Error {
                ok: false,
                error: "Remote I/O task closed".to_string(),
                code: Some("DISCONNECTED".to_string()),
            }));
        }

        DeferredReply::Pending(reply_rx)
    }

    fn save(&mut self) -> Result<(), String> {
        Ok(()) // Remote mode: storage managed by Core Host
    }

    fn take_events(&mut self) -> Vec<Value> {
        Vec::new()
    }

    fn set_master_key(&mut self, mut key: Option<String>) {
        if let Some(key) = key.as_mut() {
            key.zeroize();
        }
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

#[cfg(test)]
mod priority_tests {
    use super::priority_for_request;
    use crate::core_adapter::RemoteRpcPriority;
    use chromvoid_core::rpc::types::RpcRequest;
    use serde_json::json;

    #[test]
    fn derivative_ensure_priority_follows_requested_tier() {
        let preview = RpcRequest::new("catalog:derivative:ensure", json!({ "tier": "preview" }));
        let thumbnail =
            RpcRequest::new("catalog:derivative:ensure", json!({ "tier": "thumbnail" }));

        assert_eq!(priority_for_request(&preview), RemoteRpcPriority::Normal);
        assert_eq!(priority_for_request(&thumbnail), RemoteRpcPriority::Low);
    }

    #[test]
    fn derivative_ensure_priority_defaults_safely_to_normal() {
        for data in [
            json!({}),
            json!({ "tier": "unknown" }),
            json!({ "tier": 1 }),
        ] {
            let request = RpcRequest::new("catalog:derivative:ensure", data);
            assert_eq!(priority_for_request(&request), RemoteRpcPriority::Normal);
        }
    }
}
