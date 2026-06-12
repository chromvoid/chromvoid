use chromvoid_core::rpc::types::{RpcRequest, RpcResponse};
use chromvoid_core::rpc::{
    CatalogDerivativeWriteRequest, CatalogDerivativeWriteResult, CatalogDerivativeWriteSnapshot,
    CatalogMediaInspectSnapshot,
};
use chromvoid_core::rpc::{RpcInputStream, RpcReply};
use chromvoid_core::vault::{VaultRekeyProgress, VaultRekeyRequest};
use chromvoid_protocol::TransportMetrics;
use serde::{Deserialize, Serialize};
use serde_json::Value;
#[cfg(desktop)]
use std::sync::{Arc, Mutex};
#[cfg(desktop)]
use tokio::sync::{mpsc, oneshot};

#[derive(Debug, Clone, Serialize, Deserialize, PartialEq, Eq)]
#[serde(rename_all = "snake_case")]
pub enum CoreMode {
    Local,
    Remote { host: RemoteHost },
    Switching,
}

#[derive(Debug, Clone, Serialize, Deserialize, PartialEq, Eq)]
#[serde(rename_all = "snake_case", tag = "type")]
pub enum RemoteHost {
    TauriRemoteWss { peer_id: String },
}

/// ADR-004 section 2.3: Connection state machine for Remote mode.
/// disconnected → connecting → syncing → ready/locked
#[derive(Debug, Clone, Copy, PartialEq, Eq, Serialize, Deserialize)]
#[serde(rename_all = "snake_case")]
pub enum ConnectionState {
    Disconnected,
    Connecting,
    Syncing,
    Ready,
    Locked,
    Error,
}

#[derive(Debug, Clone, Copy, PartialEq, Eq)]
pub enum RemoteRpcPriority {
    High,
    Normal,
    Low,
}

#[derive(Debug, Clone, Copy, PartialEq, Eq)]
pub enum RemoteCancelGroup {
    MediaInspection { epoch: u64 },
}

#[cfg(desktop)]
#[derive(Clone)]
pub(crate) struct RemoteJsonSender(mpsc::Sender<crate::remote_data_plane::RemoteIoRequest>);

#[cfg(desktop)]
impl RemoteJsonSender {
    pub(crate) fn new(tx: mpsc::Sender<crate::remote_data_plane::RemoteIoRequest>) -> Self {
        Self(tx)
    }

    fn tx(&self) -> &mpsc::Sender<crate::remote_data_plane::RemoteIoRequest> {
        &self.0
    }
}

#[cfg(desktop)]
#[derive(Clone)]
pub struct RemoteJsonClientHandle {
    sender: RemoteJsonSender,
    features: Arc<Mutex<Vec<String>>>,
}

#[cfg(desktop)]
impl RemoteJsonClientHandle {
    pub(crate) fn new(sender: RemoteJsonSender, features: Arc<Mutex<Vec<String>>>) -> Self {
        Self { sender, features }
    }

    pub(crate) fn is_closed(&self) -> bool {
        self.sender.tx().is_closed()
    }

    pub(crate) fn features(&self) -> Vec<String> {
        match self.features.lock() {
            Ok(features) => features.clone(),
            Err(_) => {
                tracing::warn!("remote_json_client: features mutex poisoned");
                Vec::new()
            }
        }
    }

    pub(crate) fn has_feature(&self, feature: &str) -> bool {
        self.features()
            .iter()
            .any(|candidate| candidate.as_str() == feature)
    }

    pub(crate) fn replace_features(&self, next: Vec<String>) {
        match self.features.lock() {
            Ok(mut features) => *features = next,
            Err(_) => tracing::warn!("remote_json_client: features mutex poisoned"),
        }
    }

    pub(crate) fn send_json_blocking(
        &self,
        request: RpcRequest,
        priority: RemoteRpcPriority,
        cancel_group: Option<RemoteCancelGroup>,
    ) -> RpcResponse {
        if self.is_closed() {
            return RpcResponse::Error {
                ok: false,
                error: "Not connected to remote device".to_string(),
                code: Some("DISCONNECTED".to_string()),
            };
        }

        let (reply_tx, reply_rx) = oneshot::channel();
        let send_result = self
            .sender
            .tx()
            .blocking_send(crate::remote_data_plane::RemoteIoRequest {
                request,
                stream: None,
                reply_tx,
                priority,
                cancel_group,
            })
            .map_err(|_| ());

        if send_result.is_err() {
            return RpcResponse::Error {
                ok: false,
                error: "Remote I/O task closed".to_string(),
                code: Some("DISCONNECTED".to_string()),
            };
        }

        match reply_rx.blocking_recv() {
            Ok(RpcReply::Json(resp)) => resp,
            Ok(RpcReply::Stream(_) | RpcReply::RangeStream(_)) => RpcResponse::Error {
                ok: false,
                error: "Unexpected streaming response in JSON-only RPC".to_string(),
                code: Some("STREAM_UNEXPECTED".to_string()),
            },
            Err(_) => RpcResponse::Error {
                ok: false,
                error: "Remote reply channel closed".to_string(),
                code: Some("DISCONNECTED".to_string()),
            },
        }
    }

    pub(crate) fn try_send_cancel_media_inspection(&self, epoch: u64) -> bool {
        if !self
            .has_feature(chromvoid_core::rpc::types::CORE_FEATURE_REMOTE_MEDIA_INSPECTION_SPLIT_V1)
        {
            return false;
        }

        let request = RpcRequest::new(
            "catalog:media:inspect:cancel",
            serde_json::json!({ "epoch": epoch }),
        );

        let (reply_tx, _reply_rx) = oneshot::channel();
        self.sender
            .tx()
            .try_send(crate::remote_data_plane::RemoteIoRequest {
                request,
                stream: None,
                reply_tx,
                priority: RemoteRpcPriority::High,
                cancel_group: None,
            })
            .is_ok()
    }
}

impl Default for ConnectionState {
    fn default() -> Self {
        Self::Disconnected
    }
}

/// Tracks an in-progress mode transition for UI status reporting.
#[cfg(any(desktop, test))]
#[derive(Debug, Clone, Serialize)]
pub struct ModeTransition {
    pub from: CoreMode,
    pub to_mode: String,
    pub started_at_ms: u64,
    pub drain_deadline_ms: u64,
}

pub trait CoreAdapter: Send + Sync {
    fn mode(&self) -> CoreMode;

    fn connection_state(&self) -> ConnectionState {
        // Local mode does not have a remote transport connection.
        ConnectionState::Disconnected
    }

    fn transport_metrics(&self) -> Option<TransportMetrics> {
        None
    }

    fn remote_core_features(&self) -> Vec<String> {
        Vec::new()
    }

    #[cfg(desktop)]
    fn remote_json_client(&self) -> Option<RemoteJsonClientHandle> {
        None
    }

    fn is_unlocked(&self) -> bool;

    fn handle(&mut self, req: &RpcRequest) -> RpcResponse;

    fn rekey_vault(
        &mut self,
        _request: VaultRekeyRequest,
        _cancel_requested: &(dyn Fn() -> bool + Send + Sync),
        _progress: &mut dyn FnMut(VaultRekeyProgress),
    ) -> Option<RpcResponse> {
        None
    }

    fn snapshot_catalog_media_inspect(
        &mut self,
        _node_id: u64,
    ) -> Option<Result<CatalogMediaInspectSnapshot, RpcResponse>> {
        None
    }

    fn commit_catalog_media_inspect(
        &mut self,
        _snapshot: &CatalogMediaInspectSnapshot,
        _media_info: Option<chromvoid_core::catalog::CatalogMediaInfo>,
        _media_inspected_revision: u64,
    ) -> Option<RpcResponse> {
        None
    }

    fn snapshot_catalog_derivative_write(
        &mut self,
        _request: CatalogDerivativeWriteRequest,
    ) -> Option<Result<CatalogDerivativeWriteSnapshot, RpcResponse>> {
        None
    }

    fn commit_catalog_derivative_write(
        &mut self,
        _snapshot: &CatalogDerivativeWriteSnapshot,
        _write_result: &CatalogDerivativeWriteResult,
    ) -> Option<RpcResponse> {
        None
    }

    fn handle_with_stream(&mut self, req: &RpcRequest, stream: Option<RpcInputStream>) -> RpcReply;

    fn save(&mut self) -> Result<(), String>;

    fn take_events(&mut self) -> Vec<Value>;

    fn set_master_key(&mut self, key: Option<String>);
}

#[cfg(test)]
#[path = "types_tests.rs"]
mod tests;
