mod artifact;
mod create;
mod restore;

use artifact::*;
pub(crate) use create::*;
pub(crate) use restore::*;

use std::sync::Arc;
use std::sync::Mutex;

use serde_json::Value;
use tauri::Emitter;

use crate::app_state::AppState;
use crate::core_adapter::CoreAdapter;
use crate::helpers::*;
use crate::state_ext::lock_or_rpc_err;
use crate::types::*;

use chromvoid_core::rpc::types::{RpcRequest, RpcResponse};

use std::sync::atomic::{AtomicBool, Ordering};

fn backup_cancel_session(adapter: &mut dyn CoreAdapter, backup_id: &str) {
    let cancel_res = adapter.handle(&RpcRequest::new(
        "backup:local:cancel".to_string(),
        serde_json::json!({ "backup_id": backup_id }),
    ));

    if matches!(cancel_res, RpcResponse::Error { .. }) {
        let _ = adapter.handle(&RpcRequest::new(
            "backup:local:finish".to_string(),
            serde_json::json!({ "backup_id": backup_id }),
        ));
    }
}

fn restore_cancel_session(adapter: &mut dyn CoreAdapter, restore_id: &str) {
    let _ = adapter.handle(&RpcRequest::new(
        "restore:local:cancel".to_string(),
        serde_json::json!({ "restore_id": restore_id }),
    ));
}
