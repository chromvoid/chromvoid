use serde::Serialize;
use tauri::Manager;

use crate::app_state::AppState;
use crate::task_lifecycle::EventTaskName;
use crate::types::*;

#[derive(Debug, Serialize)]
#[serde(rename_all = "camelCase")]
pub(crate) struct AndroidQuickLockTileStatus {
    supported: bool,
    request_supported: bool,
    enabled: bool,
}

#[derive(Debug, Serialize)]
#[serde(rename_all = "camelCase")]
pub(crate) struct AndroidQuickLockTileRequestResult {
    requested: bool,
    supported: bool,
    enabled: bool,
    status: &'static str,
}

const TILE_REQUEST_REQUESTED: i32 = 0;
const TILE_REQUEST_UNSUPPORTED: i32 = 1;
const TILE_REQUEST_UNAVAILABLE: i32 = 2;
const TILE_REQUEST_ERROR: i32 = 3;

#[tauri::command]
pub(crate) fn android_quick_lock_tile_status(
    state: tauri::State<'_, AppState>,
) -> RpcResult<AndroidQuickLockTileStatus> {
    let api_level = crate::mobile::android::current_device_api_level();
    let enabled = match state.session_settings.lock() {
        Ok(settings) => settings.android_quick_lock_tile_enabled,
        Err(_) => {
            return rpc_err(
                "Session settings mutex poisoned",
                Some("INTERNAL".to_string()),
            );
        }
    };

    rpc_ok(AndroidQuickLockTileStatus {
        supported: api_level.is_some_and(|api| api >= 24),
        request_supported: api_level.is_some_and(|api| api >= 33),
        enabled,
    })
}

#[tauri::command]
pub(crate) fn android_request_quick_lock_tile(
    state: tauri::State<'_, AppState>,
) -> RpcResult<AndroidQuickLockTileRequestResult> {
    let enabled = match state.session_settings.lock() {
        Ok(settings) => settings.android_quick_lock_tile_enabled,
        Err(_) => {
            return rpc_err(
                "Session settings mutex poisoned",
                Some("INTERNAL".to_string()),
            );
        }
    };
    if !enabled {
        return rpc_ok(AndroidQuickLockTileRequestResult {
            requested: false,
            supported: true,
            enabled,
            status: "disabled",
        });
    }

    let status_code = crate::mobile::android::request_quick_lock_tile();
    let result = match status_code {
        TILE_REQUEST_REQUESTED => AndroidQuickLockTileRequestResult {
            requested: true,
            supported: true,
            enabled,
            status: "requested",
        },
        TILE_REQUEST_UNSUPPORTED => AndroidQuickLockTileRequestResult {
            requested: false,
            supported: false,
            enabled,
            status: "unsupported",
        },
        TILE_REQUEST_UNAVAILABLE => AndroidQuickLockTileRequestResult {
            requested: false,
            supported: true,
            enabled,
            status: "unavailable",
        },
        TILE_REQUEST_ERROR | _ => AndroidQuickLockTileRequestResult {
            requested: false,
            supported: true,
            enabled,
            status: "error",
        },
    };

    rpc_ok(result)
}

pub(crate) fn sync_android_vault_quick_lock_with_unlocked(
    app: &tauri::AppHandle,
    state: &tauri::State<'_, AppState>,
    unlocked: bool,
) {
    let _ = app;

    #[cfg(target_os = "android")]
    {
        let (notification_enabled, quick_tile_enabled) = match state.session_settings.lock() {
            Ok(settings) => (
                settings.android_vault_status_notification_enabled,
                settings.android_quick_lock_tile_enabled,
            ),
            Err(_) => {
                tracing::warn!("android_quick_lock: session settings mutex poisoned");
                return;
            }
        };

        if !crate::mobile::android::sync_vault_quick_lock(
            unlocked,
            notification_enabled,
            quick_tile_enabled,
        ) {
            tracing::warn!("android_quick_lock: native sync failed");
        }
    }

    #[cfg(not(target_os = "android"))]
    {
        let _ = app;
        let _ = state;
        let _ = unlocked;
    }
}

#[cfg_attr(not(target_os = "android"), allow(dead_code))]
pub(crate) fn spawn_lock_vault_from_android_quick_action(app: tauri::AppHandle, source: String) {
    let Some(task_lifecycle) = app
        .try_state::<AppState>()
        .map(|state| state.task_lifecycle.clone())
    else {
        tracing::warn!("android_quick_lock: ignored action before AppState registration");
        return;
    };

    if let Err(error) = task_lifecycle.spawn_event_async(
        EventTaskName::AndroidQuickLock,
        move |mut shutdown_rx| async move {
            tokio::select! {
                _ = shutdown_rx.changed() => {}
                _ = tokio::task::yield_now() => {
                    lock_vault_from_android_quick_action(app, source).await;
                }
            }
        },
    ) {
        tracing::warn!("android_quick_lock: failed to schedule quick lock action: {error}");
    }
}

#[cfg_attr(not(target_os = "android"), allow(dead_code))]
async fn lock_vault_from_android_quick_action(app: tauri::AppHandle, source: String) {
    let reason = android_quick_lock_reason(&source).to_string();

    let vault_background_io_runtime = {
        let Some(state) = app.try_state::<AppState>() else {
            tracing::warn!("android_quick_lock: ignored action before AppState registration");
            return;
        };
        state.vault_background_io_runtime.cancel_low_priority();
        state.vault_background_io_runtime.clone()
    };
    let app_bg = app.clone();

    let result = vault_background_io_runtime
        .spawn_blocking(move || {
            let Some(state) = app_bg.try_state::<AppState>() else {
                return Err("Android quick lock AppState unavailable".to_string());
            };
            crate::commands::vault::lock_vault_with_reason(&app_bg, &state, &reason)
        })
        .await;

    match result {
        Ok(Ok(())) => {}
        Ok(Err(error)) => tracing::warn!("android_quick_lock: lock failed: {error}"),
        Err(error) => {
            let (error, _) = error.into_rpc_error("Android quick lock");
            tracing::warn!("android_quick_lock: lock join failed: {error}");
        }
    }
}

fn android_quick_lock_reason(source: &str) -> &'static str {
    match source {
        "quick_settings_tile" => "android_quick_settings_tile",
        "vault_status_notification" => "android_vault_status_notification",
        _ => "android_quick_lock",
    }
}

#[cfg(test)]
mod tests {
    use super::android_quick_lock_reason;

    #[test]
    fn quick_lock_reason_mapping_is_unchanged() {
        assert_eq!(
            android_quick_lock_reason("quick_settings_tile"),
            "android_quick_settings_tile"
        );
        assert_eq!(
            android_quick_lock_reason("vault_status_notification"),
            "android_vault_status_notification"
        );
        assert_eq!(android_quick_lock_reason("other"), "android_quick_lock");
    }
}
