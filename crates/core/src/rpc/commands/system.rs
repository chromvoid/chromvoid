//! System command handlers (ping, pong, vault:status)

use serde_json::Value;

use crate::vault::VaultSession;

use super::super::types::{RpcResponse, VaultStatusResponse};

/// Handle ping command
pub fn handle_ping(_data: &Value) -> RpcResponse {
    RpcResponse::success(serde_json::json!({"pong": true}))
}

/// Handle pong command
pub fn handle_pong(_data: &Value) -> RpcResponse {
    RpcResponse::success(Value::Null)
}

/// Handle vault:status command
pub fn handle_vault_status(session: Option<&VaultSession>) -> RpcResponse {
    let response = VaultStatusResponse {
        is_unlocked: session.is_some(),
        session_started_at: session.map(|s| s.unlocked_at().elapsed().as_secs()),
    };
    RpcResponse::success(response)
}
