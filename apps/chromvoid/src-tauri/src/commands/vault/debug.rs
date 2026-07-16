use std::fs::OpenOptions;
use std::io::Write;
use std::path::{Path, PathBuf};

use serde_json::Value;
use tauri::Manager;

use crate::app_state::AppState;
use crate::catalog_blocking_io::CatalogBlockingIoError;
use crate::types::*;

pub(crate) const UNLOCK_DEBUG_LOG_FILE_NAME: &str = "unlock-debug.log";

#[tauri::command]
pub(crate) async fn unlock_debug_log(
    app: tauri::AppHandle,
    message: String,
    reset: Option<bool>,
) -> TauriRpcResult<Value> {
    if message.contains("\"marker\":\"TAURI_IPC_FAILURE\"") {
        tracing::error!("[tauri-ipc][frontend] {message}");
    } else {
        tracing::info!("[android-unlock-debug] {message}");
    }

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

    if let Some(state) = app.try_state::<AppState>() {
        let catalog_blocking_io_runtime = state.catalog_blocking_io_runtime.clone();
        return match catalog_blocking_io_runtime
            .spawn_blocking(move || unlock_debug_log_blocking(logs_dir, message, reset))
            .await
        {
            Ok(result) => Ok(result),
            Err(error) => Ok(unlock_debug_log_blocking_err(error)),
        };
    }

    tracing::warn!("unlock_debug_log: AppState unavailable; using fallback blocking runtime");
    match tauri::async_runtime::spawn_blocking(move || {
        unlock_debug_log_blocking(logs_dir, message, reset)
    })
    .await
    {
        Ok(result) => Ok(result),
        Err(error) => Ok(rpc_err(
            format!("unlock_debug_log: blocking task: {error}"),
            Some("INTERNAL".to_string()),
        )),
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

    let path = unlock_debug_log_path(&logs_dir);

    if reset.unwrap_or(false) {
        if let Err(error) = reset_unlock_debug_log(&logs_dir) {
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

pub(crate) fn reset_unlock_debug_log(logs_dir: &Path) -> Result<(), String> {
    crate::helpers::storage::write_bytes_atomic(&unlock_debug_log_path(logs_dir), b"")
}

fn unlock_debug_log_path(logs_dir: &Path) -> PathBuf {
    logs_dir.join(UNLOCK_DEBUG_LOG_FILE_NAME)
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
