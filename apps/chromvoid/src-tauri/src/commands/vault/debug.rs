use std::fs::OpenOptions;
use std::io::Write;
use std::path::PathBuf;

use serde_json::Value;
use tauri::Manager;

use crate::app_state::AppState;
use crate::catalog_blocking_io::CatalogBlockingIoError;
use crate::types::*;

#[tauri::command]
pub(crate) async fn unlock_debug_log(
    app: tauri::AppHandle,
    state: tauri::State<'_, AppState>,
    message: String,
    reset: Option<bool>,
) -> TauriRpcResult<Value> {
    tracing::info!("[android-unlock-debug] {message}");

    let data_dir = match app.path().app_data_dir() {
        Ok(path) => path,
        Err(error) => {
            return Ok(rpc_err(
                format!("unlock_debug_log: app_data_dir: {error}"),
                Some("INTERNAL".to_string()),
            ))
        }
    };

    let logs_dir = data_dir.join("logs");
    let catalog_blocking_io_runtime = state.catalog_blocking_io_runtime.clone();
    match catalog_blocking_io_runtime
        .spawn_blocking(move || unlock_debug_log_blocking(logs_dir, message, reset))
        .await
    {
        Ok(result) => Ok(result),
        Err(error) => Ok(unlock_debug_log_blocking_err(error)),
    }
}

fn unlock_debug_log_blocking(
    logs_dir: PathBuf,
    message: String,
    reset: Option<bool>,
) -> RpcResult<Value> {
    if let Err(error) = std::fs::create_dir_all(&logs_dir) {
        return rpc_err(
            format!("unlock_debug_log: create logs dir: {error}"),
            Some("IO".to_string()),
        );
    }

    let path = logs_dir.join("unlock-debug.log");

    if reset.unwrap_or(false) {
        if let Err(error) = crate::helpers::storage::write_bytes_atomic(&path, b"") {
            return rpc_err(
                format!("unlock_debug_log: reset file: {error}"),
                Some("IO".to_string()),
            );
        }
    }

    let mut file = match OpenOptions::new().create(true).append(true).open(&path) {
        Ok(file) => file,
        Err(error) => {
            return rpc_err(
                format!("unlock_debug_log: open file: {error}"),
                Some("IO".to_string()),
            )
        }
    };

    if let Err(error) = writeln!(file, "{message}") {
        return rpc_err(
            format!("unlock_debug_log: append file: {error}"),
            Some("IO".to_string()),
        );
    }

    rpc_ok(serde_json::json!({
        "path": path,
    }))
}

fn unlock_debug_log_blocking_err(error: CatalogBlockingIoError) -> RpcResult<Value> {
    let (error, code) = error.into_rpc_error("Unlock debug log");
    rpc_err(error, code)
}

#[cfg(test)]
mod tests {
    use super::*;

    #[test]
    fn unlock_debug_log_reset_replaces_previous_log_contents() {
        let temp_dir = tempfile::tempdir().expect("tempdir should be created");
        let logs_dir = temp_dir.path().join("logs");

        assert!(matches!(
            unlock_debug_log_blocking(logs_dir.clone(), "old".to_string(), Some(false)),
            RpcResult::Success { .. }
        ));
        assert!(matches!(
            unlock_debug_log_blocking(logs_dir.clone(), "new".to_string(), Some(true)),
            RpcResult::Success { .. }
        ));

        let path = logs_dir.join("unlock-debug.log");
        assert_eq!(
            std::fs::read_to_string(&path).expect("debug log should be readable"),
            "new\n"
        );
    }
}
