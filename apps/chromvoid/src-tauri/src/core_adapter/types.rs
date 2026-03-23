use chromvoid_core::rpc::types::{RpcRequest, RpcResponse};
use chromvoid_core::rpc::{RpcInputStream, RpcReply};
use chromvoid_protocol::TransportMetrics;
use serde::{Deserialize, Serialize};
use serde_json::Value;

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
    OrangePiUsb { device_id: String },
    MobileBle { device_id: String },
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

    fn is_unlocked(&self) -> bool;

    fn handle(&mut self, req: &RpcRequest) -> RpcResponse;

    fn handle_with_stream(&mut self, req: &RpcRequest, stream: Option<RpcInputStream>) -> RpcReply;

    fn save(&mut self) -> Result<(), String>;

    fn take_events(&mut self) -> Vec<Value>;

    fn set_master_key(&mut self, key: Option<String>);
}

#[cfg(test)]
#[path = "types_tests.rs"]
mod tests;
