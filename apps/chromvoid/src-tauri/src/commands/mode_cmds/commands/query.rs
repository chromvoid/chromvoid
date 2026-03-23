use crate::app_state::AppState;

use super::super::helpers::transport_type_label;
use super::super::models::ModeInfo;

/// Returns current mode, connection state, and active transport type.
#[tauri::command]
pub(crate) fn mode_get(state: tauri::State<'_, AppState>) -> Result<ModeInfo, String> {
    let adapter = state
        .adapter
        .lock()
        .map_err(|_| "Adapter mutex poisoned".to_string())?;

    let mode = adapter.mode();
    let connection_state = adapter.connection_state();
    let transport_type = adapter
        .transport_metrics()
        .map(|m| transport_type_label(&m));

    Ok(ModeInfo {
        mode,
        connection_state,
        transport_type,
    })
}

/// Returns detailed switching status for UI progress indication.
#[tauri::command]
pub(crate) fn mode_status(state: tauri::State<'_, AppState>) -> Result<ModeInfo, String> {
    let adapter = state
        .adapter
        .lock()
        .map_err(|_| "Adapter mutex poisoned".to_string())?;

    let mode = adapter.mode();
    let connection_state = adapter.connection_state();
    let transport_type = adapter
        .transport_metrics()
        .map(|m| transport_type_label(&m));

    Ok(ModeInfo {
        mode,
        connection_state,
        transport_type,
    })
}
