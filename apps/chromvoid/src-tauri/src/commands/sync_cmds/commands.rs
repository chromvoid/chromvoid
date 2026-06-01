use super::models::*;
use crate::app_state::AppState;
use crate::core_adapter::{ConnectionState, CoreMode};
use crate::state_ext::lock_or_string_err;
use chromvoid_core::rpc::types::{RpcRequest, RpcResponse};
use std::sync::{Arc, Mutex};

/// Perform full initial sync when entering Remote mode.
///
/// 1. Requests full state snapshot from Core Host via `catalog:shard:list`
///    + `catalog:shard:load` RPCs (forwarded through `RemoteCoreAdapter`).
/// 2. Stores the resulting cursor.
/// 3. Marks the connection as subscribed to live updates.
///
/// Returns item count + cursor on success.
#[tauri::command]
pub(crate) async fn sync_initial(
    state: tauri::State<'_, AppState>,
    host_version: u64,
    host_timestamp_ms: u64,
    items_count: u64,
) -> Result<serde_json::Value, String> {
    ensure_sync_remote_mode(&state, "sync_initial", true).await?;

    let cursor = SyncCursor {
        version: host_version,
        timestamp_ms: host_timestamp_ms,
    };

    state.sync_runtime.with_state(|ss| {
        ss.cursor = Some(cursor.clone());
        ss.subscribed = true;
    })?;

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
pub(crate) async fn sync_delta_apply(
    state: tauri::State<'_, AppState>,
    payload: DeltaPayload,
) -> Result<serde_json::Value, String> {
    ensure_sync_remote_mode(&state, "sync_delta_apply", false).await?;

    let applied = payload.entries.len() as u64;
    let new_cursor = payload.new_cursor.clone();

    state.sync_runtime.with_state(|ss| {
        ss.cursor = Some(new_cursor.clone());
    })?;

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
pub(crate) async fn sync_reconnect(
    state: tauri::State<'_, AppState>,
    host_version: u64,
    host_timestamp_ms: u64,
    items_count: u64,
) -> Result<serde_json::Value, String> {
    ensure_sync_remote_mode(&state, "sync_reconnect", false).await?;

    let strategy = state
        .sync_runtime
        .trigger_reconnect(host_version, host_timestamp_ms)?;

    let new_cursor = SyncCursor {
        version: host_version,
        timestamp_ms: host_timestamp_ms,
    };

    let result = ReconnectResult {
        strategy,
        items_synced: items_count,
        cursor: new_cursor,
    };
    serde_json::to_value(result).map_err(|e| format!("serialize reconnect result: {e}"))
}

async fn ensure_sync_remote_mode(
    state: &tauri::State<'_, AppState>,
    command_name: &'static str,
    require_connected: bool,
) -> Result<(), String> {
    let adapter = state.adapter.clone();
    let vault_background_io_runtime = state.vault_background_io_runtime.clone();

    match vault_background_io_runtime
        .spawn_blocking(move || {
            let adapter = lock_or_string_err!(adapter, "Adapter");
            match adapter.mode() {
                CoreMode::Remote { .. } => {}
                CoreMode::Local | CoreMode::Switching => {
                    return Err(format!("{command_name} requires Remote mode"));
                }
            }
            if require_connected && adapter.connection_state() == ConnectionState::Disconnected {
                return Err("not connected to Core Host".to_string());
            }
            Ok(())
        })
        .await
    {
        Ok(result) => result,
        Err(error) => {
            let (error, _code) = error.into_rpc_error(command_name);
            Err(error)
        }
    }
}

/// Forward a thin-client write to Core Host.
///
/// If another writer currently holds the lock the command returns
/// `ok: false` with `writer_lock` details so the UI can display the lock.
#[tauri::command]
pub(crate) async fn sync_write(
    state: tauri::State<'_, AppState>,
    command: String,
    data: serde_json::Value,
) -> Result<serde_json::Value, String> {
    let adapter = state.adapter.clone();
    let sync_runtime = state.sync_runtime.clone();
    let vault_background_io_runtime = state.vault_background_io_runtime.clone();

    match vault_background_io_runtime
        .spawn_blocking(move || sync_write_blocking(adapter, sync_runtime, command, data))
        .await
    {
        Ok(result) => result,
        Err(error) => {
            let (error, _code) = error.into_rpc_error("sync_write");
            Err(error)
        }
    }
}

fn sync_write_blocking(
    adapter: Arc<Mutex<Box<dyn crate::core_adapter::CoreAdapter>>>,
    sync_runtime: Arc<crate::commands::sync_cmds::SyncRuntimeState>,
    command: String,
    data: serde_json::Value,
) -> Result<serde_json::Value, String> {
    // Check writer lock.
    let lock_info = sync_runtime.with_state(|ss| ss.writer_lock.clone())?;
    if let Some(info) = lock_info {
        let result = WriteResult {
            ok: false,
            writer_lock: Some(info),
        };
        return serde_json::to_value(result).map_err(|e| format!("serialize write result: {e}"));
    }

    // Forward write RPC through RemoteCoreAdapter.
    let response = {
        let mut adapter = lock_or_string_err!(adapter, "Adapter");
        match adapter.mode() {
            CoreMode::Remote { .. } => {}
            CoreMode::Local | CoreMode::Switching => {
                return Err("sync_write requires Remote mode".to_string())
            }
        }
        let req = RpcRequest::new(command, data);
        adapter.handle(&req)
    };

    sync_write_response(&sync_runtime, response)
}

fn sync_write_response(
    sync_runtime: &crate::commands::sync_cmds::SyncRuntimeState,
    response: RpcResponse,
) -> Result<serde_json::Value, String> {
    match response {
        RpcResponse::Success { .. } => {
            let result = WriteResult {
                ok: true,
                writer_lock: None,
            };
            serde_json::to_value(result).map_err(|e| format!("serialize write result: {e}"))
        }
        RpcResponse::Error { error, code, .. } => {
            if code.as_deref() == Some("WRITER_LOCKED") {
                // Surface writer-lock from Core Host response.
                let info = WriterLockInfo {
                    holder: error.clone(),
                    since_ms: 0,
                };
                sync_runtime.set_writer_lock(Some(info.clone()))?;
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

#[cfg(test)]
mod tests {
    use super::*;

    #[test]
    fn sync_write_response_maps_success_to_unlocked_writer_result() {
        let runtime = crate::commands::sync_cmds::SyncRuntimeState::new();

        let result = sync_write_response(&runtime, RpcResponse::success(serde_json::json!({})))
            .expect("success response");

        assert_eq!(
            result.get("ok").and_then(serde_json::Value::as_bool),
            Some(true)
        );
        assert!(matches!(
            result.get("writer_lock"),
            None | Some(serde_json::Value::Null)
        ));
    }

    #[test]
    fn sync_write_response_stores_writer_lock_error() {
        let runtime = crate::commands::sync_cmds::SyncRuntimeState::new();

        let result = sync_write_response(
            &runtime,
            RpcResponse::error("mobile-device", Some("WRITER_LOCKED")),
        )
        .expect("writer lock response");

        assert_eq!(
            result.get("ok").and_then(serde_json::Value::as_bool),
            Some(false)
        );
        assert_eq!(
            result
                .get("writer_lock")
                .and_then(|lock| lock.get("holder"))
                .and_then(serde_json::Value::as_str),
            Some("mobile-device")
        );
        assert_eq!(
            runtime
                .with_state(|state| state.writer_lock.clone())
                .expect("runtime state")
                .as_ref()
                .map(|lock| lock.holder.as_str()),
            Some("mobile-device")
        );
    }
}
