use super::*;
#[cfg(desktop)]
use tracing::{info, warn};

#[tauri::command]
pub(crate) fn get_local_device_identity(
    state: tauri::State<'_, AppState>,
    label: Option<String>,
) -> Result<serde_json::Value, String> {
    let mut store = network::LocalDeviceIdentityStore::load(&helpers::local_identity_path(&state));
    let fallback = label.unwrap_or_else(|| {
        if cfg!(desktop) {
            "ChromVoid Desktop".to_string()
        } else if cfg!(target_os = "ios") {
            "ChromVoid iPhone".to_string()
        } else {
            "ChromVoid Device".to_string()
        }
    });
    let identity = store.get_or_create(&fallback)?;
    serde_json::to_value(identity).map_err(|_| "serialize local identity failed".to_string())
}

#[tauri::command]
pub(crate) async fn start_ios_host_mode(
    state: tauri::State<'_, AppState>,
    relay_url: String,
    device_label: Option<String>,
) -> Result<serde_json::Value, String> {
    let storage_root = {
        let sr = state.storage_root.lock().unwrap();
        sr.clone()
    };
    let fallback = device_label.unwrap_or_else(|| "ChromVoid iPhone".to_string());
    let status =
        network::ios_pairing::start_host_mode(&relay_url, &storage_root, &fallback).await?;
    serde_json::to_value(status).map_err(|_| "serialize ios host status failed".to_string())
}

#[tauri::command]
pub(crate) async fn stop_ios_host_mode(
    state: tauri::State<'_, AppState>,
) -> Result<serde_json::Value, String> {
    let storage_root = {
        let sr = state.storage_root.lock().unwrap();
        sr.clone()
    };
    let status = network::ios_pairing::stop_host_mode(&storage_root).await?;
    serde_json::to_value(status).map_err(|_| "serialize ios host status failed".to_string())
}

#[tauri::command]
pub(crate) fn ios_host_status() -> serde_json::Value {
    serde_json::to_value(network::ios_pairing::host_status())
        .unwrap_or_else(|_| serde_json::json!({"phase": "Idle"}))
}

#[tauri::command]
pub(crate) async fn publish_ios_presence(
    state: tauri::State<'_, AppState>,
    relay_url: String,
) -> Result<serde_json::Value, String> {
    let storage_root = {
        let sr = state.storage_root.lock().unwrap();
        sr.clone()
    };
    let status = network::ios_pairing::publish_presence(&relay_url, &storage_root).await?;
    serde_json::to_value(status).map_err(|_| "serialize ios host status failed".to_string())
}

#[tauri::command]
pub(crate) async fn handle_ios_wake(
    state: tauri::State<'_, AppState>,
    relay_url: String,
) -> Result<serde_json::Value, String> {
    let storage_root = {
        let sr = state.storage_root.lock().unwrap();
        sr.clone()
    };
    let status = network::ios_pairing::handle_wake(&relay_url, &storage_root).await?;
    serde_json::to_value(status).map_err(|_| "serialize ios host status failed".to_string())
}

#[cfg(desktop)]
#[tauri::command]
pub(crate) async fn desktop_pair_ios(
    state: tauri::State<'_, AppState>,
    offer: network::PairingOffer,
    pin: String,
    device_label: Option<String>,
) -> Result<serde_json::Value, String> {
    info!(
        "network_cmds: desktop_pair_ios:start session_id={} relay_base_url={} offer_device_label={} pin_len={} device_label={}",
        offer.session_id,
        offer.relay_base_url,
        offer.device_label,
        pin.len(),
        device_label.as_deref().unwrap_or("ChromVoid Desktop")
    );
    let storage_root = {
        let sr = state.storage_root.lock().unwrap();
        sr.clone()
    };
    let fallback = device_label.unwrap_or_else(|| "ChromVoid Desktop".to_string());
    let peer =
        match network::ios_pairing::desktop_pair(&offer, &pin, &storage_root, &fallback).await {
            Ok(peer) => {
                info!(
                    "network_cmds: desktop_pair_ios:success session_id={} peer_id={}",
                    offer.session_id, peer.peer_id
                );
                peer
            }
            Err(error) => {
                warn!(
                    "network_cmds: desktop_pair_ios:failed session_id={} error={}",
                    offer.session_id, error
                );
                return Err(error);
            }
        };
    serde_json::to_value(peer).map_err(|_| "serialize paired ios peer failed".to_string())
}

#[cfg(desktop)]
#[tauri::command]
pub(crate) async fn desktop_connect_ios(
    app: tauri::AppHandle,
    state: tauri::State<'_, AppState>,
    peer_id: String,
) -> Result<serde_json::Value, String> {
    info!(
        "network_cmds: desktop_connect_ios:start peer_id={}",
        peer_id
    );
    let result = match crate::commands::mode_cmds::mode_switch(
        app,
        state,
        "remote".to_string(),
        Some(peer_id.clone()),
    )
    .await
    {
        Ok(result) => {
            info!(
                "network_cmds: desktop_connect_ios:success peer_id={}",
                peer_id
            );
            result
        }
        Err(error) => {
            warn!(
                "network_cmds: desktop_connect_ios:failed peer_id={} error={}",
                peer_id, error
            );
            return Err(error);
        }
    };
    serde_json::to_value(result).map_err(|_| "serialize mode switch result failed".to_string())
}
