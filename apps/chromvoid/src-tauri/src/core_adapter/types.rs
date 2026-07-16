use chromvoid_core::rpc::types::{RpcRequest, RpcResponse};
use chromvoid_core::rpc::{
    CatalogDerivativeWriteRequest, CatalogDerivativeWriteResult, CatalogDerivativeWriteSnapshot,
    CatalogMediaInspectSnapshot, WalletBalanceExecution, WalletBalanceSnapshot,
    WalletHistoryExecution, WalletHistorySnapshot,
};
use chromvoid_core::rpc::{RpcInputStream, RpcReply};
use chromvoid_core::vault::{VaultRekeyProgress, VaultRekeyRequest};
use chromvoid_protocol::TransportMetrics;
use serde::{Deserialize, Serialize};
use serde_json::Value;
#[cfg(desktop)]
use tokio::sync::mpsc;
use tokio::sync::oneshot;

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
    TauriRemoteWss {
        peer_id: String,
    },
    MobileUsb {
        host_id: String,
        label: Option<String>,
        platform: String,
    },
}

impl CoreMode {
    pub(crate) fn is_remote(&self) -> bool {
        matches!(self, CoreMode::Remote { .. })
    }
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
    Media,
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
    features: crate::remote_data_plane::RemotePeerFeatures,
}

#[cfg(desktop)]
impl RemoteJsonClientHandle {
    pub(crate) fn new(
        sender: RemoteJsonSender,
        features: crate::remote_data_plane::RemotePeerFeatures,
    ) -> Self {
        Self { sender, features }
    }

    pub(crate) fn is_closed(&self) -> bool {
        self.sender.tx().is_closed()
    }

    pub(crate) fn features(&self) -> Vec<String> {
        self.features.snapshot()
    }

    pub(crate) fn has_feature(&self, feature: &str) -> bool {
        self.features.contains(feature)
    }

    pub(crate) fn replace_features(&self, next: Vec<String>) {
        self.features.replace(next);
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

/// Result of [`CoreAdapter::begin_with_stream`]: either the reply is already
/// available (local/synchronous adapters do the work inline) or the request
/// has been enqueued to a remote I/O task and the reply is still in flight.
///
/// `Pending` lets callers release the app-wide adapter mutex before blocking
/// on the reply, so a slow remote round trip (e.g. a media range read) does
/// not serialize every other RPC behind it.
pub enum DeferredReply {
    /// The adapter produced the reply inline; semantics identical to
    /// `handle_with_stream`.
    Immediate(RpcReply),
    /// The request was handed to the remote I/O task in order; the reply
    /// arrives on this channel and can be awaited without the adapter lock.
    Pending(oneshot::Receiver<RpcReply>),
}

impl DeferredReply {
    /// Block until the reply is available. Callers should drop the adapter
    /// lock before calling this so other RPCs can proceed while the reply is
    /// in flight.
    pub fn wait(self) -> RpcReply {
        match self {
            DeferredReply::Immediate(reply) => reply,
            DeferredReply::Pending(receiver) => match receiver.blocking_recv() {
                Ok(reply) => reply,
                Err(_) => RpcReply::Json(RpcResponse::Error {
                    ok: false,
                    error: "Remote reply channel closed".to_string(),
                    code: Some("DISCONNECTED".to_string()),
                }),
            },
        }
    }
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

    fn transport_session_generation(&self) -> Option<u64> {
        None
    }

    fn mobile_usb_session_requires_approval(&self) -> bool {
        false
    }

    fn mark_mobile_usb_session_approved(&mut self) {}

    #[cfg(desktop)]
    fn remote_json_client(&self) -> Option<RemoteJsonClientHandle> {
        None
    }

    fn is_unlocked(&self) -> bool;

    fn mark_remote_locked(&mut self) {}

    fn handle(&mut self, req: &RpcRequest) -> RpcResponse;

    /// Local-only secret resolution boundary used immediately before the
    /// desktop process supervisor spawns an approved preset. Remote adapters
    /// intentionally return `None`; there is no serialized RPC equivalent.
    #[cfg(desktop)]
    fn resolve_env_runtime_for_spawn(
        &mut self,
        _request: chromvoid_core::env_runtime::PrivateSpawnResolutionRequestV1,
    ) -> Option<
        chromvoid_core::env_runtime::EnvRuntimeResult<
            chromvoid_core::env_runtime::ResolvedEnvLeaseV1,
        >,
    > {
        None
    }

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

    fn snapshot_wallet_balance(
        &mut self,
        _data: &Value,
    ) -> Option<Result<Option<WalletBalanceSnapshot>, RpcResponse>> {
        None
    }

    fn commit_wallet_balance(&mut self, _execution: WalletBalanceExecution) -> Option<RpcResponse> {
        None
    }

    fn snapshot_wallet_history(
        &mut self,
        _data: &Value,
    ) -> Option<Result<WalletHistorySnapshot, RpcResponse>> {
        None
    }

    fn commit_wallet_history(&mut self, _execution: WalletHistoryExecution) -> Option<RpcResponse> {
        None
    }

    fn handle_with_stream(&mut self, req: &RpcRequest, stream: Option<RpcInputStream>) -> RpcReply;

    /// Two-phase variant of `handle_with_stream`: enqueue the request while
    /// the caller holds the adapter lock, then wait for the reply after
    /// releasing it via [`DeferredReply::wait`].
    ///
    /// The default implementation performs the work inline and returns
    /// `DeferredReply::Immediate`, so synchronous adapters keep their exact
    /// `handle_with_stream` semantics. Remote adapters may return
    /// `DeferredReply::Pending` once the request has been handed to the I/O
    /// task; request ordering is fixed at enqueue time (i.e. by the order in
    /// which callers acquire the adapter lock).
    fn begin_with_stream(
        &mut self,
        req: &RpcRequest,
        stream: Option<RpcInputStream>,
    ) -> DeferredReply {
        DeferredReply::Immediate(self.handle_with_stream(req, stream))
    }

    fn save(&mut self) -> Result<(), String>;

    fn take_events(&mut self) -> Vec<Value>;

    fn set_master_key(&mut self, key: Option<String>);
}

#[cfg(test)]
#[path = "types_tests.rs"]
mod tests;
