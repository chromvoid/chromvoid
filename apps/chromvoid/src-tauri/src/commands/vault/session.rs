use tauri::Manager;

use crate::app_state::AppState;
use crate::session_settings;
use crate::state_ext::lock_or_rpc_err;
use crate::types::*;

#[tauri::command]
pub(crate) fn get_session_settings(
    state: tauri::State<'_, AppState>,
) -> RpcResult<session_settings::SessionSettings> {
    let settings = lock_or_rpc_err!(state.session_settings, "Session settings").clone();
    rpc_ok(settings)
}

#[tauri::command]
pub(crate) fn set_session_settings(
    app: tauri::AppHandle,
    state: tauri::State<'_, AppState>,
    settings: session_settings::SessionSettings,
) -> RpcResult<session_settings::SessionSettings> {
    let data_dir = match app.path().app_data_dir() {
        Ok(p) => p,
        Err(e) => {
            return RpcResult::Error {
                ok: false,
                error: format!("app_data_dir: {e}"),
                code: Some("INTERNAL".to_string()),
            }
        }
    };

    let mut current = lock_or_rpc_err!(state.session_settings, "Session settings");

    *current = settings.clone();
    current.save(&data_dir.join("session_settings.json"));
    drop(current);

    if let Ok(adapter) = state.adapter.lock() {
        crate::ios_keep_awake::sync_ios_idle_timer(&app, adapter.as_ref());
    }

    rpc_ok(settings)
}
