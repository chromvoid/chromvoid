use super::*;
#[cfg(desktop)]
use crate::catalog_blocking_io::CatalogBlockingIoError;
use crate::state_ext::lock_or_string_err;

#[cfg(target_os = "ios")]
fn ios_status_to_mobile(
    status: network::ios_pairing::IosHostStatus,
    connected_peers: Vec<network::mobile_acceptor::ConnectedPeer>,
) -> network::mobile_host::MobileHostStatus {
    network::mobile_host::MobileHostStatus {
        phase: match status.phase {
            network::ios_pairing::IosHostPhase::Idle => network::mobile_host::MobileHostPhase::Idle,
            network::ios_pairing::IosHostPhase::Pairing => {
                network::mobile_host::MobileHostPhase::Pairing
            }
            network::ios_pairing::IosHostPhase::Ready => {
                network::mobile_host::MobileHostPhase::Ready
            }
            network::ios_pairing::IosHostPhase::Error => {
                network::mobile_host::MobileHostPhase::Error
            }
        },
        platform: "ios".to_string(),
        relay_url: status.relay_url,
        device_id: status.device_id,
        device_label: status.device_label,
        pairing_pin: status.pairing_pin,
        pairing_offer: status
            .pairing_offer
            .map(|offer| network::mobile_host::MobilePairingOffer {
                session_id: offer.session_id,
                relay_base_url: offer.relay_base_url,
                device_label: offer.device_label,
                expires_at_ms: offer.expires_at_ms,
                platform: Some("ios".to_string()),
            }),
        expires_at_ms: status.expires_at_ms,
        presence: status.presence,
        paired_peer_id: status.paired_peer_id,
        connected_peers,
        error: status.error,
    }
}

#[tauri::command]
pub(crate) async fn mobile_host_start(
    state: tauri::State<'_, AppState>,
    relay_url: String,
    device_label: Option<String>,
) -> Result<serde_json::Value, String> {
    #[cfg(target_os = "ios")]
    {
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
        let connected_peers =
            network::mobile_acceptor::get_status(&state.mobile_acceptor_runtime)?.connected_peers;
        return serde_json::to_value(ios_status_to_mobile(status, connected_peers))
            .map_err(|_| "serialize mobile host status failed".to_string());
    }

    #[cfg(target_os = "android")]
    {
        let storage_root = {
            let sr = lock_or_string_err!(state.storage_root, "Storage root");
            sr.clone()
        };
        let fallback = device_label.unwrap_or_else(|| "ChromVoid Android".to_string());
        let status = network::mobile_host::start_android_host_mode(
            state.android_host_runtime.clone(),
            state.mobile_acceptor_runtime.clone(),
            Some(state.adapter.clone()),
            &relay_url,
            &storage_root,
            &fallback,
        )
        .await?;
        return serde_json::to_value(status)
            .map_err(|_| "serialize mobile host status failed".to_string());
    }

    #[cfg(not(any(target_os = "ios", target_os = "android")))]
    let _ = (state, relay_url, device_label);

    #[cfg(not(any(target_os = "ios", target_os = "android")))]
    Err("mobile host mode is not available on this platform".to_string())
}

#[tauri::command]
pub(crate) async fn mobile_host_stop(
    state: tauri::State<'_, AppState>,
) -> Result<serde_json::Value, String> {
    #[cfg(target_os = "ios")]
    {
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
        let connected_peers =
            network::mobile_acceptor::get_status(&state.mobile_acceptor_runtime)?.connected_peers;
        return serde_json::to_value(ios_status_to_mobile(status, connected_peers))
            .map_err(|_| "serialize mobile host status failed".to_string());
    }

    #[cfg(target_os = "android")]
    {
        let storage_root = {
            let sr = lock_or_string_err!(state.storage_root, "Storage root");
            sr.clone()
        };
        let status = network::mobile_host::stop_android_host_mode(
            state.android_host_runtime.clone(),
            state.mobile_acceptor_runtime.clone(),
            &storage_root,
        )
        .await?;
        return serde_json::to_value(status)
            .map_err(|_| "serialize mobile host status failed".to_string());
    }

    #[cfg(not(any(target_os = "ios", target_os = "android")))]
    let _ = state;

    #[cfg(not(any(target_os = "ios", target_os = "android")))]
    Err("mobile host mode is not available on this platform".to_string())
}

#[tauri::command]
pub(crate) fn mobile_host_status(state: tauri::State<'_, AppState>) -> serde_json::Value {
    #[cfg(target_os = "ios")]
    {
        let ios_status = match state.ios_host_runtime.host_status() {
            Ok(status) => status,
            Err(error) => {
                tracing::warn!("network: iOS mobile host status unavailable: {error}");
                network::ios_pairing::IosHostStatus::default()
            }
        };
        let connected_peers =
            match network::mobile_acceptor::get_status(&state.mobile_acceptor_runtime) {
                Ok(status) => status.connected_peers,
                Err(error) => {
                    tracing::warn!("network: mobile acceptor status unavailable: {error}");
                    Vec::new()
                }
            };
        return match serde_json::to_value(ios_status_to_mobile(ios_status, connected_peers)) {
            Ok(status) => status,
            Err(error) => {
                tracing::warn!("network: failed to serialize iOS mobile host status: {error}");
                serde_json::json!({"phase": "Idle", "platform": "ios"})
            }
        };
    }

    #[cfg(target_os = "android")]
    {
        let status = match network::mobile_host::android_host_status(
            &state.android_host_runtime,
            &state.mobile_acceptor_runtime,
        ) {
            Ok(status) => status,
            Err(error) => {
                tracing::warn!("network: Android mobile host status unavailable: {error}");
                network::mobile_host::MobileHostStatus {
                    phase: network::mobile_host::MobileHostPhase::Idle,
                    platform: "android".to_string(),
                    relay_url: None,
                    device_id: None,
                    device_label: None,
                    pairing_pin: None,
                    pairing_offer: None,
                    expires_at_ms: None,
                    presence: None,
                    paired_peer_id: None,
                    connected_peers: Vec::new(),
                    error: None,
                }
            }
        };
        return match serde_json::to_value(status) {
            Ok(status) => status,
            Err(error) => {
                tracing::warn!("network: failed to serialize Android mobile host status: {error}");
                serde_json::json!({"phase": "Idle", "platform": "android"})
            }
        };
    }

    #[cfg(not(any(target_os = "ios", target_os = "android")))]
    {
        let _ = state;
        serde_json::json!({"phase": "Idle"})
    }
}

#[tauri::command]
pub(crate) async fn mobile_host_publish_presence(
    state: tauri::State<'_, AppState>,
    relay_url: String,
) -> Result<serde_json::Value, String> {
    #[cfg(target_os = "ios")]
    {
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
        let connected_peers =
            network::mobile_acceptor::get_status(&state.mobile_acceptor_runtime)?.connected_peers;
        return serde_json::to_value(ios_status_to_mobile(status, connected_peers))
            .map_err(|_| "serialize mobile host status failed".to_string());
    }

    #[cfg(target_os = "android")]
    {
        let storage_root = {
            let sr = lock_or_string_err!(state.storage_root, "Storage root");
            sr.clone()
        };
        let status = network::mobile_host::publish_android_presence(
            state.android_host_runtime.clone(),
            state.mobile_acceptor_runtime.clone(),
            &relay_url,
            &storage_root,
        )
        .await?;
        return serde_json::to_value(status)
            .map_err(|_| "serialize mobile host status failed".to_string());
    }

    #[cfg(not(any(target_os = "ios", target_os = "android")))]
    let _ = (state, relay_url);

    #[cfg(not(any(target_os = "ios", target_os = "android")))]
    Err("mobile host mode is not available on this platform".to_string())
}

#[cfg(desktop)]
#[tauri::command]
pub(crate) async fn desktop_pair_mobile_host(
    state: tauri::State<'_, AppState>,
    offer: network::mobile_host::MobilePairingOffer,
    pin: String,
    device_label: Option<String>,
) -> Result<serde_json::Value, String> {
    let storage_root = {
        let sr = lock_or_string_err!(state.storage_root, "Storage root");
        sr.clone()
    };
    let fallback = device_label.unwrap_or_else(|| "ChromVoid Desktop".to_string());

    let platform = offer
        .platform
        .as_deref()
        .map(str::trim)
        .filter(|value| !value.is_empty())
        .unwrap_or("ios");

    if platform == "android" {
        let (peer, paired) = network::mobile_host::desktop_pair_android_host_peer(
            &offer,
            &pin,
            &storage_root,
            &fallback,
        )
        .await?;
        match state
            .catalog_blocking_io_runtime
            .spawn_blocking({
                let storage_root = storage_root.clone();
                move || {
                    network::mobile_host::persist_desktop_paired_android_host(&storage_root, peer)
                }
            })
            .await
        {
            Ok(result) => result?,
            Err(error) => return Err(mobile_host_pair_store_blocking_err(error)),
        }
        return serde_json::to_value(paired)
            .map_err(|_| "serialize paired mobile host failed".to_string());
    }

    let ios_offer = network::PairingOffer {
        session_id: offer.session_id,
        relay_base_url: offer.relay_base_url,
        device_label: offer.device_label,
        expires_at_ms: offer.expires_at_ms,
    };
    let peer =
        network::ios_pairing::desktop_pair(&ios_offer, &pin, &storage_root, &fallback).await?;
    serde_json::to_value(peer).map_err(|_| "serialize paired mobile host failed".to_string())
}

#[cfg(desktop)]
fn mobile_host_pair_store_blocking_err(error: CatalogBlockingIoError) -> String {
    let (error, _code) = error.into_rpc_error("Desktop mobile host pair");
    error
}

#[cfg(all(test, desktop))]
mod tests {
    use super::*;

    #[test]
    fn mobile_host_pair_store_blocking_err_maps_shutdown() {
        assert_eq!(
            mobile_host_pair_store_blocking_err(CatalogBlockingIoError::ShuttingDown),
            "Catalog background IO is shutting down"
        );
    }
}
