use serde::Deserialize;
use serde_json::Value;
use tauri_plugin_dialog::DialogExt;

use crate::app_state::AppState;
use crate::host_path_capability::{HostPathPurpose, HostPathTokenGrant};
use crate::types::*;

#[derive(Debug, Deserialize)]
#[serde(rename_all = "camelCase")]
pub(crate) struct HostPathSaveTargetArgs {
    default_path: Option<String>,
    filters: Option<Vec<HostPathDialogFilter>>,
}

#[derive(Debug, Deserialize)]
pub(crate) struct HostPathDialogFilter {
    name: String,
    extensions: Vec<String>,
}

#[cfg(desktop)]
#[tauri::command]
pub(crate) async fn host_path_pick_upload_files(
    app: tauri::AppHandle,
    state: tauri::State<'_, AppState>,
) -> TauriRpcResult<Value> {
    let catalog_blocking_io_runtime = state.catalog_blocking_io_runtime.clone();
    let registry = state.host_path_capabilities.clone();
    let out = catalog_blocking_io_runtime
        .spawn_blocking(move || -> Result<Vec<HostPathTokenGrant>, String> {
            let Some(paths) = app.dialog().file().blocking_pick_files() else {
                return Ok(Vec::new());
            };

            paths
                .into_iter()
                .map(|path| {
                    let path = path
                        .into_path()
                        .map_err(|error| format!("Selected file is not a local path: {error}"))?;
                    registry.issue_existing_file(path, HostPathPurpose::Upload)
                })
                .collect()
        })
        .await;

    Ok(match out {
        Ok(Ok(grants)) => rpc_ok(serde_json::json!({ "files": grants })),
        Ok(Err(error)) => rpc_err(error, Some("INVALID_PATH".to_string())),
        Err(error) => {
            let (error, code) = error.into_rpc_error("Host path upload picker");
            rpc_err(error, code)
        }
    })
}

#[cfg(desktop)]
#[tauri::command]
pub(crate) async fn host_path_pick_download_target(
    app: tauri::AppHandle,
    state: tauri::State<'_, AppState>,
    args: HostPathSaveTargetArgs,
) -> TauriRpcResult<Value> {
    pick_save_target(
        app,
        state,
        args,
        HostPathPurpose::Download,
        "Host path download picker",
    )
    .await
}

#[cfg(desktop)]
#[tauri::command]
pub(crate) async fn host_path_pick_text_file_target(
    app: tauri::AppHandle,
    state: tauri::State<'_, AppState>,
    args: HostPathSaveTargetArgs,
) -> TauriRpcResult<Value> {
    pick_save_target(
        app,
        state,
        args,
        HostPathPurpose::WriteText,
        "Host path text picker",
    )
    .await
}

#[cfg(desktop)]
async fn pick_save_target(
    app: tauri::AppHandle,
    state: tauri::State<'_, AppState>,
    args: HostPathSaveTargetArgs,
    purpose: HostPathPurpose,
    task_label: &'static str,
) -> TauriRpcResult<Value> {
    let catalog_blocking_io_runtime = state.catalog_blocking_io_runtime.clone();
    let registry = state.host_path_capabilities.clone();
    let out = catalog_blocking_io_runtime
        .spawn_blocking(move || -> Result<Option<HostPathTokenGrant>, String> {
            let mut dialog = app.dialog().file();
            if let Some(default_path) = args.default_path.filter(|value| !value.trim().is_empty()) {
                dialog = dialog.set_file_name(default_path);
            }
            if let Some(filters) = args.filters {
                for filter in filters {
                    let extensions: Vec<&str> =
                        filter.extensions.iter().map(String::as_str).collect();
                    dialog = dialog.add_filter(filter.name, &extensions);
                }
            }

            let Some(path) = dialog.blocking_save_file() else {
                return Ok(None);
            };
            let path = path
                .into_path()
                .map_err(|error| format!("Selected target is not a local path: {error}"))?;
            registry.issue_save_target(path, purpose).map(Some)
        })
        .await;

    Ok(match out {
        Ok(Ok(grant)) => rpc_ok(serde_json::json!({ "target": grant })),
        Ok(Err(error)) => rpc_err(error, Some("INVALID_PATH".to_string())),
        Err(error) => {
            let (error, code) = error.into_rpc_error(task_label);
            rpc_err(error, code)
        }
    })
}
