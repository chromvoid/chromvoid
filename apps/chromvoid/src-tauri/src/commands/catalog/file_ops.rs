use std::path::PathBuf;

use serde_json::Value;

use crate::app_state::AppState;
use crate::catalog_blocking_io::CatalogBlockingIoError;
#[cfg(desktop)]
use crate::host_path_capability::HostPathPurpose;
use crate::types::*;

#[cfg(desktop)]
#[tauri::command]
pub(crate) async fn file_stat(
    state: tauri::State<'_, AppState>,
    path_token: String,
) -> TauriRpcResult<Value> {
    let path = match state
        .host_path_capabilities
        .consume(&path_token, HostPathPurpose::Upload)
    {
        Ok(path) => path,
        Err(error) => return Ok(rpc_err(error, Some("INVALID_PATH_TOKEN".to_string()))),
    };
    let catalog_blocking_io_runtime = state.catalog_blocking_io_runtime.clone();
    match catalog_blocking_io_runtime
        .spawn_blocking(move || file_stat_blocking(path))
        .await
    {
        Ok(result) => Ok(result),
        Err(error) => Ok(catalog_file_ops_blocking_err(error, "File stat")),
    }
}

#[cfg(desktop)]
#[tauri::command]
pub(crate) async fn write_text_file(
    state: tauri::State<'_, AppState>,
    path_token: String,
    content: String,
) -> TauriRpcResult<Value> {
    let path = match state
        .host_path_capabilities
        .consume(&path_token, HostPathPurpose::WriteText)
    {
        Ok(path) => path,
        Err(error) => return Ok(rpc_err(error, Some("INVALID_PATH_TOKEN".to_string()))),
    };
    let catalog_blocking_io_runtime = state.catalog_blocking_io_runtime.clone();
    match catalog_blocking_io_runtime
        .spawn_blocking(move || write_text_file_blocking(path, content))
        .await
    {
        Ok(result) => Ok(result),
        Err(error) => Ok(catalog_file_ops_blocking_err(error, "Write text file")),
    }
}

#[cfg(not(desktop))]
#[tauri::command]
pub(crate) async fn write_text_file(
    _state: tauri::State<'_, AppState>,
    _path_token: String,
    _content: String,
) -> TauriRpcResult<Value> {
    Ok(rpc_err(
        "Host text-file save is not available on this platform",
        Some("UNSUPPORTED".to_string()),
    ))
}

#[cfg(desktop)]
fn file_stat_blocking(path: PathBuf) -> RpcResult<Value> {
    let pb = path;
    let name = pb
        .file_name()
        .and_then(|s| s.to_str())
        .unwrap_or("file")
        .to_string();

    let meta = match std::fs::metadata(&pb) {
        Ok(m) => m,
        Err(e) => return rpc_err(format!("Failed to stat file: {e}"), Some("IO".to_string())),
    };
    if !meta.is_file() {
        return rpc_err("Path is not a file", Some("INVALID_PATH".to_string()));
    }

    rpc_ok(serde_json::json!({
        "name": name,
        "size": meta.len(),
    }))
}

fn write_text_file_blocking(path: PathBuf, content: String) -> RpcResult<Value> {
    if let Err(e) = crate::helpers::storage::write_bytes_atomic(&path, content.as_bytes()) {
        return rpc_err(format!("Failed to write file: {e}"), Some("IO".to_string()));
    }

    rpc_ok(serde_json::json!({}))
}

fn catalog_file_ops_blocking_err(
    error: CatalogBlockingIoError,
    task_label: &'static str,
) -> RpcResult<Value> {
    let (error, code) = error.into_rpc_error(task_label);
    rpc_err(error, code)
}

#[cfg(test)]
mod tests {
    use super::*;

    #[test]
    fn write_text_file_blocking_creates_and_replaces_file_atomically() {
        let temp_dir = tempfile::tempdir().expect("tempdir should be created");
        let target = temp_dir.path().join("note.txt");
        let path = target.clone();

        let first = write_text_file_blocking(path.clone(), "first".to_string());
        assert!(matches!(first, RpcResult::Success { .. }));
        assert_eq!(
            std::fs::read_to_string(&target).expect("read first"),
            "first"
        );

        let second = write_text_file_blocking(path.clone(), "second".to_string());
        match second {
            RpcResult::Success { result, .. } => {
                assert_eq!(result, serde_json::json!({}));
            }
            RpcResult::Error { error, .. } => panic!("unexpected write error: {error}"),
        }
        assert_eq!(
            std::fs::read_to_string(&target).expect("read replacement"),
            "second"
        );
    }
}
