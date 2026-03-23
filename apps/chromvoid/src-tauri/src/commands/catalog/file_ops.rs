#[cfg(desktop)]
use std::path::PathBuf;

use serde_json::Value;

use crate::types::*;

#[cfg(desktop)]
#[tauri::command]
pub(crate) fn file_stat(path: String) -> RpcResult<Value> {
    let pb = PathBuf::from(path);
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

#[tauri::command]
pub(crate) fn write_text_file(path: String, content: String) -> RpcResult<Value> {
    if let Err(e) = std::fs::write(&path, content.as_bytes()) {
        return rpc_err(format!("Failed to write file: {e}"), Some("IO".to_string()));
    }
    rpc_ok(serde_json::json!({ "path": path }))
}
