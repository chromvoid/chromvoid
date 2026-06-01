use serde_json::Value;
use tauri::Manager;
use tracing::info;

use crate::app_state::AppState;
use crate::catalog_blocking_io::CatalogBlockingIoError;
use crate::core_adapter::{CoreMode, LocalCoreAdapter};
use crate::helpers::*;
use crate::state_ext::lock_or_tauri_rpc_err;
use crate::types::*;
use crate::vault_background_io::VaultBackgroundIoTaskError;

use chromvoid_core::rpc::types::{RpcRequest, RpcResponse};

#[tauri::command]
pub(crate) async fn get_current_mode(
    state: tauri::State<'_, AppState>,
) -> TauriRpcResult<CoreMode> {
    let adapter = state.adapter.clone();
    let vault_background_io_runtime = state.vault_background_io_runtime.clone();

    match vault_background_io_runtime
        .spawn_blocking(move || match adapter.lock() {
            Ok(adapter) => rpc_ok(adapter.mode()),
            Err(_) => rpc_err("Adapter mutex poisoned", Some("INTERNAL".to_string())),
        })
        .await
    {
        Ok(result) => Ok(result),
        Err(error) => Ok(vault_lifecycle_blocking_err(error, "Get current mode")),
    }
}

#[tauri::command]
pub(crate) async fn init_local_storage(
    app: tauri::AppHandle,
    state: tauri::State<'_, AppState>,
) -> TauriRpcResult<LocalStorageInfo> {
    info!("init_local_storage called - returning current storage root");
    let root = lock_or_tauri_rpc_err!(state.storage_root, "Storage root").clone();
    let root_str = root.to_string_lossy().to_string();
    info!("init_local_storage: storage_root = {}", root_str);

    let adapter = state.adapter.clone();
    let vault_background_io_runtime = state.vault_background_io_runtime.clone();
    match vault_background_io_runtime
        .spawn_blocking(move || {
            let adapter = adapter.lock().map_err(|_| {
                (
                    "Adapter mutex poisoned".to_string(),
                    Some("INTERNAL".to_string()),
                )
            })?;
            emit_basic_state(&app, &root, adapter.as_ref());
            Ok(())
        })
        .await
    {
        Ok(Ok(())) => {}
        Ok(Err((error, code))) => return Ok(rpc_err(error, code)),
        Err(error) => return Ok(vault_lifecycle_blocking_err(error, "Init local storage")),
    }

    info!(
        "init_local_storage: returning success with storage_root = {}",
        root_str
    );
    Ok(RpcResult::Success {
        ok: true,
        result: LocalStorageInfo {
            storage_root: root_str,
        },
    })
}

#[tauri::command]
pub(crate) async fn master_setup(
    app: tauri::AppHandle,
    state: tauri::State<'_, AppState>,
    master_password: String,
) -> TauriRpcResult<MasterSetupResult> {
    if master_password.trim().is_empty() {
        return Ok(RpcResult::Error {
            ok: false,
            error: "master_password is required".to_string(),
            code: Some("BAD_REQUEST".to_string()),
        });
    }

    let adapter = state.adapter.clone();
    let storage_root = state.storage_root.clone();
    let vault_background_io_runtime = state.vault_background_io_runtime.clone();

    match vault_background_io_runtime
        .spawn_blocking(move || {
            let mut adapter = match adapter.lock() {
                Ok(adapter) => adapter,
                Err(_) => return rpc_err("Adapter mutex poisoned", Some("INTERNAL".to_string())),
            };

            let req = RpcRequest::new(
                "master:setup".to_string(),
                serde_json::json!({ "master_password": master_password }),
            );
            let resp = adapter.handle(&req);

            emit_basic_state_from_locked_root(
                &app,
                &storage_root,
                adapter.as_ref(),
                "vault: master setup",
            );

            master_setup_reply(resp)
        })
        .await
    {
        Ok(result) => Ok(result),
        Err(error) => Ok(vault_lifecycle_blocking_err(error, "Master setup")),
    }
}

fn master_setup_reply(resp: RpcResponse) -> RpcResult<MasterSetupResult> {
    match resp {
        RpcResponse::Success { result, .. } => rpc_ok(parse_master_setup_success(&result)),
        RpcResponse::Error { error, code, .. } => RpcResult::Error {
            ok: false,
            error,
            code: code.map(|c| format!("{:?}", c)),
        },
    }
}

fn parse_master_setup_success(result: &Value) -> MasterSetupResult {
    let created = match result.get("created") {
        Some(value) => match value.as_bool() {
            Some(value) => value,
            None => {
                tracing::warn!("vault: master setup success response created field is not boolean");
                false
            }
        },
        None => {
            tracing::warn!("vault: master setup success response missing created field");
            false
        }
    };
    MasterSetupResult { created }
}

#[tauri::command]
pub(crate) async fn storage_set_root(
    app: tauri::AppHandle,
    state: tauri::State<'_, AppState>,
    storage_root: String,
) -> TauriRpcResult<LocalStorageInfo> {
    info!(
        "storage_set_root called with storage_root = '{}'",
        storage_root
    );
    let input = storage_root.trim();
    if input.is_empty() {
        tracing::error!("storage_set_root: storage_root is empty");
        return Ok(RpcResult::Error {
            ok: false,
            error: "storage_root is required".to_string(),
            code: Some("BAD_REQUEST".to_string()),
        });
    }

    let data_dir = match app.path().app_data_dir() {
        Ok(p) => {
            info!("storage_set_root: app_data_dir = {}", p.display());
            p
        }
        Err(e) => {
            tracing::error!("storage_set_root: failed to get app_data_dir: {:?}", e);
            return Ok(RpcResult::Error {
                ok: false,
                error: format!("app_data_dir: {e}"),
                code: Some("INTERNAL".to_string()),
            });
        }
    };

    let expanded = if input == "~" {
        std::env::var("HOME").unwrap_or_else(|_| input.to_string())
    } else if let Some(rest) = input.strip_prefix("~/") {
        match std::env::var("HOME") {
            Ok(home) => format!("{home}/{rest}"),
            Err(_) => input.to_string(),
        }
    } else {
        input.to_string()
    };

    let mut root = std::path::PathBuf::from(expanded);
    if !root.is_absolute() {
        info!("storage_set_root: relative path detected, joining with app_data_dir");
        root = data_dir.join(root);
    }
    info!("storage_set_root: resolved path = {}", root.display());

    let new_adapter = match prepare_storage_root_adapter(
        state.catalog_blocking_io_runtime.clone(),
        root.clone(),
        state.license_root.clone(),
    )
    .await
    {
        Ok(adapter) => adapter,
        Err((error, code)) => {
            return Ok(RpcResult::Error {
                ok: false,
                error,
                code,
            });
        }
    };

    let adapter = state.adapter.clone();
    let storage_root_state = state.storage_root.clone();
    let root_for_state = root.clone();
    let app_for_state = app.clone();
    match state
        .vault_background_io_runtime
        .spawn_blocking(move || {
            {
                let mut adapter = adapter.lock().map_err(|_| {
                    (
                        "Adapter mutex poisoned".to_string(),
                        Some("INTERNAL".to_string()),
                    )
                })?;
                *adapter = Box::new(new_adapter);
                info!("storage_set_root: adapter swapped successfully");
                emit_basic_state(&app_for_state, &root_for_state, adapter.as_ref());
            }
            {
                let mut storage_root = storage_root_state.lock().map_err(|_| {
                    (
                        "Storage root mutex poisoned".to_string(),
                        Some("INTERNAL".to_string()),
                    )
                })?;
                *storage_root = root_for_state.clone();
                info!(
                    "storage_set_root: storage_root updated to {}",
                    root_for_state.display()
                );
            }
            Ok(())
        })
        .await
    {
        Ok(Ok(())) => {}
        Ok(Err((error, code))) => return Ok(rpc_err(error, code)),
        Err(error) => {
            return Ok(vault_lifecycle_blocking_err(
                error,
                "Storage set root state update",
            ))
        }
    }

    save_storage_root_best_effort(
        state.catalog_blocking_io_runtime.clone(),
        data_dir.clone(),
        root.clone(),
    )
    .await;
    info!("storage_set_root: config save attempted, returning success");
    Ok(RpcResult::Success {
        ok: true,
        result: LocalStorageInfo {
            storage_root: root.to_string_lossy().to_string(),
        },
    })
}

async fn prepare_storage_root_adapter(
    catalog_blocking_io_runtime: std::sync::Arc<
        crate::catalog_blocking_io::CatalogBlockingIoRuntimeState,
    >,
    root: std::path::PathBuf,
    license_root: std::path::PathBuf,
) -> Result<LocalCoreAdapter, (String, Option<String>)> {
    match catalog_blocking_io_runtime
        .spawn_blocking(move || prepare_storage_root_adapter_blocking(root, license_root))
        .await
    {
        Ok(result) => result,
        Err(error) => Err(storage_root_blocking_err(error)),
    }
}

fn prepare_storage_root_adapter_blocking(
    root: std::path::PathBuf,
    license_root: std::path::PathBuf,
) -> Result<LocalCoreAdapter, (String, Option<String>)> {
    if let Err(e) = std::fs::create_dir_all(&root) {
        tracing::error!(
            "storage_set_root: failed to create directory '{}': {:?}",
            root.display(),
            e
        );
        return Err((
            format!("Failed to create storage directory: {e}"),
            Some("BAD_REQUEST".to_string()),
        ));
    }
    info!("storage_set_root: directory created successfully");

    match LocalCoreAdapter::new_with_license_store(
        root.clone(),
        license_root,
        crate::pro::current_build_policy(),
    ) {
        Ok(adapter) => {
            info!(
                "storage_set_root: LocalCoreAdapter created for path = {}",
                root.display()
            );
            Ok(adapter)
        }
        Err(e) => {
            tracing::error!(
                "storage_set_root: LocalCoreAdapter creation failed for path '{}': {:?}",
                root.display(),
                e
            );
            Err((
                format!("Storage init failed: {e}"),
                Some("INTERNAL".to_string()),
            ))
        }
    }
}

fn storage_root_blocking_err(error: CatalogBlockingIoError) -> (String, Option<String>) {
    error.into_rpc_error("Storage set root")
}

async fn save_storage_root_best_effort(
    catalog_blocking_io_runtime: std::sync::Arc<
        crate::catalog_blocking_io::CatalogBlockingIoRuntimeState,
    >,
    data_dir: std::path::PathBuf,
    root: std::path::PathBuf,
) {
    match catalog_blocking_io_runtime
        .spawn_blocking(move || save_storage_root(&data_dir, &root))
        .await
    {
        Ok(Ok(())) => {}
        Ok(Err(error)) => {
            tracing::warn!("storage_set_root: failed to save storage root config: {error}");
        }
        Err(error) => {
            let (error, _code) = error.into_rpc_error("Storage root config save");
            tracing::warn!("storage_set_root: failed to save storage root config: {error}");
        }
    }
}

#[tauri::command]
pub(crate) async fn erase_device(
    app: tauri::AppHandle,
    state: tauri::State<'_, AppState>,
    master_password: String,
    confirm: bool,
) -> TauriRpcResult<Value> {
    if master_password.trim().is_empty() {
        return Ok(rpc_err(
            "master_password is required",
            Some("BAD_REQUEST".to_string()),
        ));
    }
    if !confirm {
        return Ok(rpc_err(
            "Confirmation required",
            Some("BAD_REQUEST".to_string()),
        ));
    }

    let adapter = state.adapter.clone();
    let storage_root = state.storage_root.clone();
    let vault_background_io_runtime = state.vault_background_io_runtime.clone();

    match vault_background_io_runtime
        .spawn_blocking(move || {
            let mut adapter = match adapter.lock() {
                Ok(adapter) => adapter,
                Err(_) => return rpc_err("Adapter mutex poisoned", Some("INTERNAL".to_string())),
            };

            let res = adapter.handle(&RpcRequest::new(
                "admin:erase".to_string(),
                serde_json::json!({
                    "master_password": master_password,
                    "confirm": confirm
                }),
            ));

            erase_device_reply(&app, &storage_root, adapter.as_ref(), res)
        })
        .await
    {
        Ok(result) => Ok(result),
        Err(error) => Ok(vault_lifecycle_blocking_err(error, "Erase device")),
    }
}

fn erase_device_reply(
    app: &tauri::AppHandle,
    storage_root: &std::sync::Arc<std::sync::Mutex<std::path::PathBuf>>,
    adapter: &dyn crate::core_adapter::CoreAdapter,
    response: RpcResponse,
) -> RpcResult<Value> {
    match response {
        RpcResponse::Success { result, .. } => {
            emit_basic_state_from_locked_root(app, storage_root, adapter, "vault: erase device");
            rpc_ok(result)
        }
        RpcResponse::Error { error, code, .. } => RpcResult::Error {
            ok: false,
            error,
            code: code.map(|c| format!("{:?}", c)),
        },
    }
}

fn vault_lifecycle_blocking_err<T>(
    error: VaultBackgroundIoTaskError,
    task_label: &'static str,
) -> RpcResult<T> {
    let (error, code) = error.into_rpc_error(task_label);
    rpc_err(error, code)
}

#[tauri::command]
pub(crate) fn touch_activity(state: tauri::State<'_, AppState>) {
    touch_last_activity(&state.last_activity, "touch_activity");
}

#[tauri::command]
pub(crate) fn runtime_capabilities() -> RuntimeCapabilities {
    runtime_capabilities_for_current_target()
}

#[cfg(test)]
mod tests {
    use serde_json::json;

    use super::*;

    #[test]
    fn master_setup_success_parser_maps_created_flag() {
        let parsed = parse_master_setup_success(&json!({ "created": true }));

        assert!(parsed.created);
    }

    #[test]
    fn master_setup_success_parser_defaults_malformed_created_to_false() {
        let parsed = parse_master_setup_success(&json!({ "created": "yes" }));

        assert!(!parsed.created);
    }

    #[test]
    fn master_setup_success_parser_defaults_missing_created_to_false() {
        let parsed = parse_master_setup_success(&json!({}));

        assert!(!parsed.created);
    }

    #[test]
    fn master_setup_reply_preserves_legacy_error_code_format() {
        match master_setup_reply(RpcResponse::error("denied", Some("DENIED"))) {
            RpcResult::Error { error, code, .. } => {
                assert_eq!(error, "denied");
                assert_eq!(code.as_deref(), Some("\"DENIED\""));
            }
            RpcResult::Success { .. } => panic!("expected setup error"),
        }
    }

    #[test]
    fn vault_lifecycle_blocking_err_preserves_shutdown_code() {
        match vault_lifecycle_blocking_err::<MasterSetupResult>(
            VaultBackgroundIoTaskError::ShuttingDown,
            "Master setup",
        ) {
            RpcResult::Error { error, code, .. } => {
                assert_eq!(error, "Vault background IO is shutting down");
                assert_eq!(code.as_deref(), Some("SHUTTING_DOWN"));
            }
            RpcResult::Success { .. } => panic!("expected shutdown error"),
        }
    }
}
