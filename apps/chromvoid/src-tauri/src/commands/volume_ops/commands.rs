use crate::app_state::AppState;
use crate::state_ext::lock_or_rpc_err;
use crate::types::*;
use crate::volume_manager;

use super::helpers::{volume_backends_from_fuse_status, volume_status_from_vm};
use super::mount::volume_mount_inner;
use super::unmount::volume_unmount_inner;

#[tauri::command]
pub(crate) fn volume_get_status(state: tauri::State<'_, AppState>) -> RpcResult<VolumeStatus> {
    let vm = lock_or_rpc_err!(state.volume_manager, "Volume manager");
    rpc_ok(volume_status_from_vm(&vm))
}

#[tauri::command]
pub(crate) fn volume_get_backends() -> RpcResult<Vec<BackendInfo>> {
    #[cfg(any(target_os = "linux", target_os = "macos"))]
    {
        return rpc_ok(volume_backends_from_fuse_status(
            volume_manager::detect_fuse_driver(),
        ));
    }

    #[cfg(not(any(target_os = "linux", target_os = "macos")))]
    {
        rpc_ok(vec![BackendInfo {
            id: "webdav".to_string(),
            available: true,
            label: "WebDAV".to_string(),
            install_url: None,
        }])
    }
}

#[tauri::command]
pub(crate) async fn volume_mount(
    app: tauri::AppHandle,
    state: tauri::State<'_, AppState>,
    backend: Option<String>,
) -> Result<RpcResult<VolumeStatus>, String> {
    Ok(
        match volume_mount_inner(
            app,
            state.adapter.clone(),
            state.volume_manager.clone(),
            backend,
        )
        .await
        {
            Ok(st) => rpc_ok(st),
            Err(e) => RpcResult::Error {
                ok: false,
                error: e,
                code: Some("VOLUME_MOUNT".to_string()),
            },
        },
    )
}

#[tauri::command]
pub(crate) async fn volume_unmount(
    app: tauri::AppHandle,
    state: tauri::State<'_, AppState>,
) -> Result<RpcResult<VolumeStatus>, String> {
    Ok(
        match volume_unmount_inner(app, state.adapter.clone(), state.volume_manager.clone()).await {
            Ok(st) => rpc_ok(st),
            Err(e) => RpcResult::Error {
                ok: false,
                error: e,
                code: Some("VOLUME_UNMOUNT".to_string()),
            },
        },
    )
}
