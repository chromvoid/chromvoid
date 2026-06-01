use crate::app_state::AppState;
use crate::core_adapter::CoreAdapter;

use super::super::helpers::transport_type_label;
use super::super::models::ModeInfo;

/// Returns current mode, connection state, and active transport type.
#[tauri::command]
pub(crate) async fn mode_get(state: tauri::State<'_, AppState>) -> Result<ModeInfo, String> {
    mode_info_from_state(&state, "Mode get").await
}

/// Returns detailed switching status for UI progress indication.
#[tauri::command]
pub(crate) async fn mode_status(state: tauri::State<'_, AppState>) -> Result<ModeInfo, String> {
    mode_info_from_state(&state, "Mode status").await
}

async fn mode_info_from_state(
    state: &tauri::State<'_, AppState>,
    context: &'static str,
) -> Result<ModeInfo, String> {
    let adapter = state.adapter.clone();
    let vault_background_io_runtime = state.vault_background_io_runtime.clone();

    match vault_background_io_runtime
        .spawn_blocking(move || {
            let adapter = adapter
                .lock()
                .map_err(|_| "Adapter mutex poisoned".to_string())?;
            Ok(mode_info_from_adapter(adapter.as_ref()))
        })
        .await
    {
        Ok(result) => result,
        Err(error) => {
            let (error, _code) = error.into_rpc_error(context);
            Err(error)
        }
    }
}

fn mode_info_from_adapter(adapter: &dyn CoreAdapter) -> ModeInfo {
    let mode = adapter.mode();
    let connection_state = adapter.connection_state();
    let transport_type = adapter
        .transport_metrics()
        .map(|m| transport_type_label(&m));
    let remote_core_features = adapter.remote_core_features();

    ModeInfo {
        mode,
        connection_state,
        transport_type,
        remote_core_features,
    }
}
