use tauri::Manager;

use crate::app_state::AppState;
use crate::catalog_blocking_io::CatalogBlockingIoError;
use crate::session_settings;
use crate::state_ext::{lock_or_rpc_err, lock_or_tauri_rpc_err};
use crate::types::*;

#[tauri::command]
pub(crate) fn get_session_settings(
    state: tauri::State<'_, AppState>,
) -> RpcResult<session_settings::SessionSettings> {
    let settings = lock_or_rpc_err!(state.session_settings, "Session settings").clone();
    rpc_ok(settings)
}

#[tauri::command]
pub(crate) async fn set_session_settings(
    app: tauri::AppHandle,
    state: tauri::State<'_, AppState>,
    settings: session_settings::SessionSettings,
) -> TauriRpcResult<session_settings::SessionSettings> {
    let data_dir = match app.path().app_data_dir() {
        Ok(p) => p,
        Err(e) => {
            return Ok(RpcResult::Error {
                ok: false,
                error: format!("app_data_dir: {e}"),
                code: Some("INTERNAL".to_string()),
            })
        }
    };
    let settings_path = data_dir.join("session_settings.json");

    {
        let mut current = lock_or_tauri_rpc_err!(state.session_settings, "Session settings");
        *current = settings.clone();
    }

    save_session_settings_best_effort(
        state.catalog_blocking_io_runtime.clone(),
        settings.clone(),
        settings_path,
    )
    .await;

    let unlocked = sync_ios_idle_timer_after_session_settings(
        app.clone(),
        state.adapter.clone(),
        state.vault_background_io_runtime.clone(),
    )
    .await;
    crate::commands::vault::sync_android_vault_quick_lock_with_unlocked(
        &app,
        &state,
        unlocked.unwrap_or(false),
    );

    Ok(rpc_ok(settings))
}

async fn sync_ios_idle_timer_after_session_settings(
    app: tauri::AppHandle,
    adapter: std::sync::Arc<std::sync::Mutex<Box<dyn crate::core_adapter::CoreAdapter>>>,
    vault_background_io_runtime: std::sync::Arc<
        crate::vault_background_io::VaultBackgroundIoRuntimeState,
    >,
) -> Option<bool> {
    match vault_background_io_runtime
        .spawn_blocking(move || {
            let adapter = adapter
                .lock()
                .map_err(|_| "Adapter mutex poisoned".to_string())?;
            crate::ios_keep_awake::sync_ios_idle_timer(&app, adapter.as_ref());
            Ok::<bool, String>(adapter.is_unlocked())
        })
        .await
    {
        Ok(Ok(unlocked)) => return Some(unlocked),
        Ok(Err(error)) => tracing::warn!("set_session_settings: {error}"),
        Err(error) => {
            let (error, _code) = error.into_rpc_error("Session settings idle timer sync");
            tracing::warn!("set_session_settings: failed to sync iOS idle timer: {error}");
        }
    };
    None
}

async fn save_session_settings_best_effort(
    catalog_blocking_io_runtime: std::sync::Arc<
        crate::catalog_blocking_io::CatalogBlockingIoRuntimeState,
    >,
    settings: session_settings::SessionSettings,
    path: std::path::PathBuf,
) {
    match catalog_blocking_io_runtime
        .spawn_blocking(move || settings.save(&path))
        .await
    {
        Ok(()) => {}
        Err(error) => {
            let (error, _code) = session_settings_blocking_err(error);
            tracing::warn!("set_session_settings: failed to save session settings: {error}");
        }
    }
}

fn session_settings_blocking_err(error: CatalogBlockingIoError) -> (String, Option<String>) {
    error.into_rpc_error("Session settings save")
}

#[cfg(test)]
mod tests {
    use super::*;

    #[test]
    fn session_settings_blocking_err_maps_shutdown() {
        let (error, code) = session_settings_blocking_err(CatalogBlockingIoError::ShuttingDown);

        assert_eq!(error, "Catalog background IO is shutting down");
        assert_eq!(code.as_deref(), Some("SHUTTING_DOWN"));
    }
}
