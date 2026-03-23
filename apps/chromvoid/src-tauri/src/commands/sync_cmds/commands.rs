use super::models::*;
use super::state::*;
use crate::app_state::AppState;
use crate::core_adapter::{ConnectionState, CoreMode};

/// Perform full initial sync when entering Remote mode.
///
/// 1. Requests full state snapshot from Core Host via `catalog:shard:list`
///    + `catalog:shard:load` RPCs (forwarded through `RemoteCoreAdapter`).
/// 2. Stores the resulting cursor.
/// 3. Marks the connection as subscribed to live updates.
///
/// Returns item count + cursor on success.
#[tauri::command]
pub(crate) fn sync_initial(
    state: tauri::State<'_, AppState>,
    host_version: u64,
    host_timestamp_ms: u64,
    items_count: u64,
) -> Result<serde_json::Value, String> {
    // Verify we are in Remote mode.
    {
        let adapter = state.adapter.lock().unwrap();
        match adapter.mode() {
            CoreMode::Remote { .. } => {}
            CoreMode::Local | CoreMode::Switching => {
                return Err("sync_initial requires Remote mode".to_string())
            }
        }
        if adapter.connection_state() == ConnectionState::Disconnected {
            return Err("not connected to Core Host".to_string());
        }
    }

    let cursor = SyncCursor {
        version: host_version,
        timestamp_ms: host_timestamp_ms,
    };

    with_sync_state(|ss| {
        ss.cursor = Some(cursor.clone());
        ss.subscribed = true;
    });

    let result = SyncInitialResult {
        items_synced: items_count,
        cursor,
    };
    serde_json::to_value(result).map_err(|e| format!("serialize sync_initial result: {e}"))
}

/// Apply an incremental delta batch from Core Host.
///
/// Single-writer semantics: Core Host always wins — the delta is applied
/// unconditionally and the sync cursor advances.
#[tauri::command]
pub(crate) fn sync_delta_apply(
    state: tauri::State<'_, AppState>,
    payload: DeltaPayload,
) -> Result<serde_json::Value, String> {
    {
        let adapter = state.adapter.lock().unwrap();
        match adapter.mode() {
            CoreMode::Remote { .. } => {}
            CoreMode::Local | CoreMode::Switching => {
                return Err("sync_delta_apply requires Remote mode".to_string())
            }
        }
    }

    let applied = payload.entries.len() as u64;
    let new_cursor = payload.new_cursor.clone();

    with_sync_state(|ss| {
        ss.cursor = Some(new_cursor.clone());
    });

    let result = DeltaApplyResult {
        applied,
        cursor: new_cursor,
    };
    serde_json::to_value(result).map_err(|e| format!("serialize delta_apply result: {e}"))
}

/// Handle reconnection after a temporary disconnect.
///
/// Compares `local_version` (our last cursor) against `host_version`
/// (the Core Host's current head).  If the gap is within
/// `DELTA_GAP_THRESHOLD` → delta; otherwise → full resync.
#[tauri::command]
pub(crate) fn sync_reconnect(
    state: tauri::State<'_, AppState>,
    host_version: u64,
    host_timestamp_ms: u64,
    items_count: u64,
) -> Result<serde_json::Value, String> {
    {
        let adapter = state.adapter.lock().unwrap();
        match adapter.mode() {
            CoreMode::Remote { .. } => {}
            CoreMode::Local | CoreMode::Switching => {
                return Err("sync_reconnect requires Remote mode".to_string())
            }
        }
    }

    let local_version = with_sync_state(|ss| ss.cursor.as_ref().map(|c| c.version).unwrap_or(0));

    let strategy = choose_reconnect_strategy(local_version, host_version);

    let new_cursor = SyncCursor {
        version: host_version,
        timestamp_ms: host_timestamp_ms,
    };

    with_sync_state(|ss| {
        ss.cursor = Some(new_cursor.clone());
        ss.subscribed = true;
    });

    let result = ReconnectResult {
        strategy,
        items_synced: items_count,
        cursor: new_cursor,
    };
    serde_json::to_value(result).map_err(|e| format!("serialize reconnect result: {e}"))
}

/// Forward a thin-client write to Core Host.
///
/// If another writer currently holds the lock the command returns
/// `ok: false` with `writer_lock` details so the UI can display the lock.
#[tauri::command]
pub(crate) fn sync_write(
    state: tauri::State<'_, AppState>,
    command: String,
    data: serde_json::Value,
) -> Result<serde_json::Value, String> {
    // Check writer lock.
    let lock_info = with_sync_state(|ss| ss.writer_lock.clone());
    if let Some(info) = lock_info {
        let result = WriteResult {
            ok: false,
            writer_lock: Some(info),
        };
        return serde_json::to_value(result).map_err(|e| format!("serialize write result: {e}"));
    }

    // Forward write RPC through RemoteCoreAdapter.
    let response = {
        let mut adapter = state.adapter.lock().unwrap();
        match adapter.mode() {
            CoreMode::Remote { .. } => {}
            CoreMode::Local | CoreMode::Switching => {
                return Err("sync_write requires Remote mode".to_string())
            }
        }
        let req = chromvoid_core::rpc::types::RpcRequest::new(command, data);
        adapter.handle(&req)
    };

    match response {
        chromvoid_core::rpc::types::RpcResponse::Success { .. } => {
            let result = WriteResult {
                ok: true,
                writer_lock: None,
            };
            serde_json::to_value(result).map_err(|e| format!("serialize write result: {e}"))
        }
        chromvoid_core::rpc::types::RpcResponse::Error { error, code, .. } => {
            if code.as_deref() == Some("WRITER_LOCKED") {
                // Surface writer-lock from Core Host response.
                let info = WriterLockInfo {
                    holder: error.clone(),
                    since_ms: 0,
                };
                with_sync_state(|ss| {
                    ss.writer_lock = Some(info.clone());
                });
                let result = WriteResult {
                    ok: false,
                    writer_lock: Some(info),
                };
                serde_json::to_value(result).map_err(|e| format!("serialize write result: {e}"))
            } else {
                Err(error)
            }
        }
    }
}
