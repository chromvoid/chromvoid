use super::*;
use crate::catalog_blocking_io::{CatalogBlockingIoError, CatalogBlockingIoRuntimeState};
use crate::state_ext::lock_or_string_err;
use std::path::PathBuf;
use std::sync::Arc;
#[cfg(desktop)]
use tracing::{info, warn};

#[tauri::command]
pub(crate) async fn get_local_device_identity(
    state: tauri::State<'_, AppState>,
    label: Option<String>,
) -> Result<serde_json::Value, String> {
    let fallback = label.unwrap_or_else(|| {
        if cfg!(desktop) {
            "ChromVoid Desktop".to_string()
        } else if cfg!(target_os = "ios") {
            "ChromVoid iPhone".to_string()
        } else {
            "ChromVoid Device".to_string()
        }
    });
    let identity = get_or_create_local_device_identity_blocking(
        state.catalog_blocking_io_runtime.clone(),
        helpers::local_identity_path(&state)?,
        fallback,
    )
    .await?;
    serde_json::to_value(identity).map_err(|_| "serialize local identity failed".to_string())
}

async fn get_or_create_local_device_identity_blocking(
    catalog_blocking_io_runtime: Arc<CatalogBlockingIoRuntimeState>,
    identity_path: PathBuf,
    fallback: String,
) -> Result<network::LocalDeviceIdentity, String> {
    match catalog_blocking_io_runtime
        .spawn_blocking(move || {
            let mut store = network::LocalDeviceIdentityStore::load(&identity_path);
            store.get_or_create(&fallback)
        })
        .await
    {
        Ok(result) => result,
        Err(error) => Err(local_identity_blocking_err(error, "Local device identity")),
    }
}

fn local_identity_blocking_err(error: CatalogBlockingIoError, task_label: &'static str) -> String {
    let (error, _code) = error.into_rpc_error(task_label);
    error
}

#[tauri::command]
pub(crate) async fn start_ios_host_mode(
    state: tauri::State<'_, AppState>,
    relay_url: String,
    device_label: Option<String>,
) -> Result<serde_json::Value, String> {
    let storage_root = {
        let sr = lock_or_string_err!(state.storage_root, "Storage root");
        sr.clone()
    };
    let fallback = device_label.unwrap_or_else(|| "ChromVoid iPhone".to_string());
    let status = network::ios_pairing::start_host_mode(
        state.ios_host_runtime.clone(),
        state.mobile_acceptor_runtime.clone(),
        Some(state.adapter.clone()),
        &relay_url,
        &storage_root,
        &fallback,
    )
    .await?;
    serde_json::to_value(status).map_err(|_| "serialize ios host status failed".to_string())
}

#[tauri::command]
pub(crate) async fn stop_ios_host_mode(
    state: tauri::State<'_, AppState>,
) -> Result<serde_json::Value, String> {
    let storage_root = {
        let sr = lock_or_string_err!(state.storage_root, "Storage root");
        sr.clone()
    };
    let status = network::ios_pairing::stop_host_mode(
        state.ios_host_runtime.clone(),
        state.mobile_acceptor_runtime.clone(),
        &storage_root,
    )
    .await?;
    serde_json::to_value(status).map_err(|_| "serialize ios host status failed".to_string())
}

#[tauri::command]
pub(crate) fn ios_host_status(state: tauri::State<'_, AppState>) -> serde_json::Value {
    let status = match state.ios_host_runtime.host_status() {
        Ok(status) => status,
        Err(error) => {
            tracing::warn!("network: iOS host status unavailable: {error}");
            network::ios_pairing::IosHostStatus::default()
        }
    };
    match serde_json::to_value(status) {
        Ok(value) => value,
        Err(error) => {
            tracing::warn!("network: failed to serialize iOS host status: {error}");
            serde_json::json!({"phase": "Idle"})
        }
    }
}

#[tauri::command]
pub(crate) async fn publish_ios_presence(
    state: tauri::State<'_, AppState>,
    relay_url: String,
) -> Result<serde_json::Value, String> {
    let storage_root = {
        let sr = lock_or_string_err!(state.storage_root, "Storage root");
        sr.clone()
    };
    let status = network::ios_pairing::publish_presence(
        state.ios_host_runtime.clone(),
        state.mobile_acceptor_runtime.clone(),
        &relay_url,
        &storage_root,
    )
    .await?;
    serde_json::to_value(status).map_err(|_| "serialize ios host status failed".to_string())
}

#[tauri::command]
pub(crate) async fn handle_ios_wake(
    state: tauri::State<'_, AppState>,
    relay_url: String,
) -> Result<serde_json::Value, String> {
    let storage_root = {
        let sr = lock_or_string_err!(state.storage_root, "Storage root");
        sr.clone()
    };
    let status = network::ios_pairing::handle_wake(
        state.ios_host_runtime.clone(),
        state.mobile_acceptor_runtime.clone(),
        Some(state.adapter.clone()),
        &relay_url,
        &storage_root,
    )
    .await?;
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
        let sr = lock_or_string_err!(state.storage_root, "Storage root");
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

#[cfg(test)]
mod tests {
    use super::*;

    #[test]
    fn local_identity_blocking_err_maps_shutdown() {
        assert_eq!(
            local_identity_blocking_err(
                CatalogBlockingIoError::ShuttingDown,
                "Local device identity",
            ),
            "Catalog background IO is shutting down"
        );
    }
}
