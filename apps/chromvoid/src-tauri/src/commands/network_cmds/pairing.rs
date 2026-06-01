use super::*;
#[cfg(any(desktop, test))]
use crate::catalog_blocking_io::{CatalogBlockingIoError, CatalogBlockingIoRuntimeState};
use crate::state_ext::lock_or_string_err;
#[cfg(desktop)]
use std::path::PathBuf;
#[cfg(desktop)]
use std::sync::Arc;

#[cfg(desktop)]
#[tauri::command]
pub(crate) async fn network_pair_start(
    state: tauri::State<'_, AppState>,
    relay_url: String,
) -> Result<serde_json::Value, String> {
    let runtime = state.network_pairing_runtime.clone();
    let info = runtime.start_pairing_with_signaling(&relay_url).await?;
    serde_json::to_value(info).map_err(|_| "serialize pairing info failed".to_string())
}

#[cfg(desktop)]
#[tauri::command]
pub(crate) async fn network_pair_confirm(
    state: tauri::State<'_, AppState>,
    session_id: String,
    pin: String,
    peer_id: String,
    label: String,
    relay_url: String,
    peer_pubkey_hex: String,
) -> Result<serde_json::Value, String> {
    let pubkey = hex::decode(&peer_pubkey_hex).map_err(|e| format!("invalid pubkey hex: {e}"))?;
    let store_path = helpers::legacy_paired_peers_path(&state)?;
    let runtime = state.network_pairing_runtime.clone();
    run_pairing_store_task(
        state.catalog_blocking_io_runtime.clone(),
        store_path,
        "Network pair confirm",
        move |store_path| {
            let mut store = network::PairedPeerStore::load(&store_path);
            runtime.confirm_pairing(
                &session_id,
                &pin,
                &peer_id,
                &label,
                &relay_url,
                pubkey,
                &mut store,
            )
        },
    )
    .await
}

#[cfg(desktop)]
#[tauri::command]
pub(crate) fn network_pair_cancel(
    state: tauri::State<'_, AppState>,
    session_id: String,
) -> Result<serde_json::Value, String> {
    state.network_pairing_runtime.cancel_pairing(&session_id)?;
    Ok(serde_json::json!({"cancelled": true}))
}

#[tauri::command]
pub(crate) async fn mobile_acceptor_start(
    state: tauri::State<'_, AppState>,
    relay_url: String,
    room_id: String,
) -> Result<serde_json::Value, String> {
    let storage_root = {
        let sr = lock_or_string_err!(state.storage_root, "Storage root");
        sr.clone()
    };
    let status = network::mobile_acceptor::start_listening(
        state.mobile_acceptor_runtime.clone(),
        Some(state.adapter.clone()),
        &relay_url,
        &room_id,
        &storage_root,
    )
    .await?;

    // Start Android foreground service to keep the connection alive in background.
    #[cfg(target_os = "android")]
    {
        use crate::mobile::android::start_connection_service;
        start_connection_service("Desktop");
    }

    serde_json::to_value(status).map_err(|_| "serialize acceptor status failed".to_string())
}

#[tauri::command]
pub(crate) fn mobile_acceptor_stop(
    state: tauri::State<'_, AppState>,
) -> Result<serde_json::Value, String> {
    // Stop Android foreground service before stopping the acceptor.
    #[cfg(target_os = "android")]
    {
        use crate::mobile::android::stop_connection_service;
        stop_connection_service();
    }

    let status = network::mobile_acceptor::stop_listening(&state.mobile_acceptor_runtime)?;
    serde_json::to_value(status).map_err(|_| "serialize acceptor status failed".to_string())
}

#[tauri::command]
pub(crate) fn mobile_acceptor_status(
    state: tauri::State<'_, AppState>,
) -> Result<serde_json::Value, String> {
    let status = network::mobile_acceptor::get_status(&state.mobile_acceptor_runtime)?;
    serde_json::to_value(status).map_err(|_| "serialize acceptor status failed".to_string())
}

#[cfg(desktop)]
async fn run_pairing_store_task<T, F>(
    catalog_blocking_io_runtime: Arc<CatalogBlockingIoRuntimeState>,
    store_path: PathBuf,
    task_label: &'static str,
    task: F,
) -> Result<T, String>
where
    T: Send + 'static,
    F: FnOnce(PathBuf) -> Result<T, String> + Send + 'static,
{
    match catalog_blocking_io_runtime
        .spawn_blocking(move || task(store_path))
        .await
    {
        Ok(result) => result,
        Err(error) => Err(pairing_store_blocking_err(error, task_label)),
    }
}

#[cfg(any(desktop, test))]
fn pairing_store_blocking_err(error: CatalogBlockingIoError, task_label: &'static str) -> String {
    let (error, _code) = error.into_rpc_error(task_label);
    error
}

#[cfg(test)]
mod tests {
    use super::*;

    #[test]
    fn pairing_store_blocking_err_maps_shutdown() {
        assert_eq!(
            pairing_store_blocking_err(
                CatalogBlockingIoError::ShuttingDown,
                "Network pair confirm"
            ),
            "Catalog background IO is shutting down"
        );
    }
}
