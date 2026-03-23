use super::*;

#[cfg(desktop)]
#[tauri::command]
pub(crate) async fn network_pair_start(relay_url: String) -> Result<serde_json::Value, String> {
    let info = network::pairing::start_pairing_with_signaling(&relay_url).await?;
    serde_json::to_value(info).map_err(|_| "serialize pairing info failed".to_string())
}

#[cfg(desktop)]
#[tauri::command]
pub(crate) fn network_pair_confirm(
    state: tauri::State<'_, AppState>,
    session_id: String,
    pin: String,
    peer_id: String,
    label: String,
    relay_url: String,
    peer_pubkey_hex: String,
) -> Result<serde_json::Value, String> {
    let pubkey = hex::decode(&peer_pubkey_hex).map_err(|e| format!("invalid pubkey hex: {e}"))?;
    let store_path = helpers::legacy_paired_peers_path(&state);
    let mut store = network::PairedPeerStore::load(&store_path);
    network::pairing::confirm_pairing(
        &session_id,
        &pin,
        &peer_id,
        &label,
        &relay_url,
        pubkey,
        &mut store,
    )
}

#[cfg(desktop)]
#[tauri::command]
pub(crate) fn network_pair_cancel(session_id: String) -> serde_json::Value {
    network::pairing::cancel_pairing(&session_id);
    serde_json::json!({"cancelled": true})
}

#[tauri::command]
pub(crate) async fn mobile_acceptor_start(
    state: tauri::State<'_, AppState>,
    relay_url: String,
    room_id: String,
) -> Result<serde_json::Value, String> {
    let storage_root = {
        let sr = state.storage_root.lock().unwrap();
        sr.clone()
    };
    let status =
        network::mobile_acceptor::start_listening(&relay_url, &room_id, &storage_root).await?;

    // Start Android foreground service to keep the connection alive in background.
    #[cfg(target_os = "android")]
    {
        use crate::mobile::android::start_connection_service;
        start_connection_service("Desktop");
    }

    serde_json::to_value(status).map_err(|_| "serialize acceptor status failed".to_string())
}

#[tauri::command]
pub(crate) fn mobile_acceptor_stop() -> serde_json::Value {
    // Stop Android foreground service before stopping the acceptor.
    #[cfg(target_os = "android")]
    {
        use crate::mobile::android::stop_connection_service;
        stop_connection_service();
    }

    let status = network::mobile_acceptor::stop_listening();
    serde_json::to_value(status).unwrap_or_else(|_| serde_json::json!({"state": "idle"}))
}

#[tauri::command]
pub(crate) fn mobile_acceptor_status() -> serde_json::Value {
    let status = network::mobile_acceptor::get_status();
    serde_json::to_value(status).unwrap_or_else(|_| serde_json::json!({"state": "idle"}))
}
