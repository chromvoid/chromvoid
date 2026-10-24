use super::*;
#[cfg(any(desktop, target_os = "ios"))]
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

    #[cfg(not(target_os = "ios"))]
    let _ = (state, relay_url, device_label);

    #[cfg(not(target_os = "ios"))]
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

    #[cfg(not(target_os = "ios"))]
    let _ = state;

    #[cfg(not(target_os = "ios"))]
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

    #[cfg(not(target_os = "ios"))]
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

    #[cfg(not(target_os = "ios"))]
    let _ = (state, relay_url);

    #[cfg(not(target_os = "ios"))]
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

    // Both Air clients, iPhone and Android, host through the native protocol; the invitation's
    // platform only names the phone, and the phone's own hello is what the desktop keeps.
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
