use serde_json::Value;
use tauri::Manager;
use tracing::info;

use crate::app_state::AppState;
use crate::core_adapter::{CoreMode, LocalCoreAdapter};
use crate::helpers::*;
use crate::state_ext::lock_or_rpc_err;
use crate::types::*;

use chromvoid_core::rpc::types::{RpcRequest, RpcResponse};

#[tauri::command]
pub(crate) fn get_current_mode(state: tauri::State<'_, AppState>) -> RpcResult<CoreMode> {
    let adapter = lock_or_rpc_err!(state.adapter, "Adapter");
    rpc_ok(adapter.mode())
}

#[tauri::command]
pub(crate) fn init_local_storage(
    app: tauri::AppHandle,
    state: tauri::State<'_, AppState>,
) -> RpcResult<LocalStorageInfo> {
    info!("init_local_storage called - returning current storage root");
    let root = lock_or_rpc_err!(state.storage_root, "Storage root").clone();
    let root_str = root.to_string_lossy().to_string();
    info!("init_local_storage: storage_root = {}", root_str);

    let adapter = lock_or_rpc_err!(state.adapter, "Adapter");
    emit_basic_state(&app, &root, adapter.as_ref());

    info!(
        "init_local_storage: returning success with storage_root = {}",
        root_str
    );
    RpcResult::Success {
        ok: true,
        result: LocalStorageInfo {
            storage_root: root_str,
        },
    }
}

#[tauri::command]
pub(crate) fn master_setup(
    app: tauri::AppHandle,
    state: tauri::State<'_, AppState>,
    master_password: String,
) -> RpcResult<MasterSetupResult> {
    if master_password.trim().is_empty() {
        return RpcResult::Error {
            ok: false,
            error: "master_password is required".to_string(),
            code: Some("BAD_REQUEST".to_string()),
        };
    }

    let mut adapter = lock_or_rpc_err!(state.adapter, "Adapter");

    let req = RpcRequest::new(
        "master:setup".to_string(),
        serde_json::json!({ "master_password": master_password }),
    );
    let resp = adapter.handle(&req);

    let storage_root = state
        .storage_root
        .lock()
        .map(|p| p.clone())
        .unwrap_or_default();
    emit_basic_state(&app, &storage_root, adapter.as_ref());

    match resp {
        RpcResponse::Success { result, .. } => {
            let created = result
                .get("created")
                .and_then(|v| v.as_bool())
                .unwrap_or(false);
            rpc_ok(MasterSetupResult { created })
        }
        RpcResponse::Error { error, code, .. } => RpcResult::Error {
            ok: false,
            error,
            code: code.map(|c| format!("{:?}", c)),
        },
    }
}

#[tauri::command]
pub(crate) fn storage_set_root(
    app: tauri::AppHandle,
    state: tauri::State<'_, AppState>,
    storage_root: String,
) -> RpcResult<LocalStorageInfo> {
    info!(
        "storage_set_root called with storage_root = '{}'",
        storage_root
    );
    let input = storage_root.trim();
    if input.is_empty() {
        tracing::error!("storage_set_root: storage_root is empty");
        return RpcResult::Error {
            ok: false,
            error: "storage_root is required".to_string(),
            code: Some("BAD_REQUEST".to_string()),
        };
    }

    let data_dir = match app.path().app_data_dir() {
        Ok(p) => {
            info!("storage_set_root: app_data_dir = {}", p.display());
            p
        }
        Err(e) => {
            tracing::error!("storage_set_root: failed to get app_data_dir: {:?}", e);
            return RpcResult::Error {
                ok: false,
                error: format!("app_data_dir: {e}"),
                code: Some("INTERNAL".to_string()),
            };
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

    if let Err(e) = std::fs::create_dir_all(&root) {
        tracing::error!(
            "storage_set_root: failed to create directory '{}': {:?}",
            root.display(),
            e
        );
        return RpcResult::Error {
            ok: false,
            error: format!("Failed to create storage directory: {e}"),
            code: Some("BAD_REQUEST".to_string()),
        };
    }
    info!("storage_set_root: directory created successfully");

    let new_adapter = match LocalCoreAdapter::new(root.clone()) {
        Ok(a) => {
            info!(
                "storage_set_root: LocalCoreAdapter created for path = {}",
                root.display()
            );
            a
        }
        Err(e) => {
            tracing::error!(
                "storage_set_root: LocalCoreAdapter creation failed for path '{}': {:?}",
                root.display(),
                e
            );
            return RpcResult::Error {
                ok: false,
                error: format!("Storage init failed: {e}"),
                code: Some("INTERNAL".to_string()),
            };
        }
    };

    {
        let mut adapter = lock_or_rpc_err!(state.adapter, "Adapter");
        *adapter = Box::new(new_adapter);
        info!("storage_set_root: adapter swapped successfully");
        emit_basic_state(&app, &root, adapter.as_ref());
    }
    {
        let mut p = lock_or_rpc_err!(state.storage_root, "Storage root");
        *p = root.clone();
        info!(
            "storage_set_root: storage_root updated to {}",
            root.display()
        );
    }

    save_storage_root(&data_dir, &root);
    info!("storage_set_root: config saved, returning success");
    RpcResult::Success {
        ok: true,
        result: LocalStorageInfo {
            storage_root: root.to_string_lossy().to_string(),
        },
    }
}

#[tauri::command]
pub(crate) fn erase_device(
    app: tauri::AppHandle,
    state: tauri::State<'_, AppState>,
    master_password: String,
    confirm: bool,
) -> RpcResult<Value> {
    if master_password.trim().is_empty() {
        return rpc_err(
            "master_password is required",
            Some("BAD_REQUEST".to_string()),
        );
    }
    if !confirm {
        return rpc_err("Confirmation required", Some("BAD_REQUEST".to_string()));
    }

    let mut adapter = lock_or_rpc_err!(state.adapter, "Adapter");

    let res = adapter.handle(&RpcRequest::new(
        "admin:erase".to_string(),
        serde_json::json!({
            "master_password": master_password,
            "confirm": confirm
        }),
    ));

    match res {
        RpcResponse::Success { result, .. } => {
            let storage_root = state
                .storage_root
                .lock()
                .map(|p| p.clone())
                .unwrap_or_default();
            emit_basic_state(&app, &storage_root, adapter.as_ref());
            rpc_ok(result)
        }
        RpcResponse::Error { error, code, .. } => RpcResult::Error {
            ok: false,
            error,
            code: code.map(|c| format!("{:?}", c)),
        },
    }
}

#[tauri::command]
pub(crate) fn touch_activity(state: tauri::State<'_, AppState>) {
    if let Ok(mut last) = state.last_activity.lock() {
        *last = std::time::Instant::now();
    }
}

#[tauri::command]
pub(crate) fn runtime_capabilities() -> RuntimeCapabilities {
    runtime_capabilities_for_current_target()
}
