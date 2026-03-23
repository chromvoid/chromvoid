use crate::app_state::AppState;
#[cfg(any(desktop, test))]
use crate::network;

#[cfg(any(desktop, test))]
pub(crate) fn legacy_paired_peers_path(state: &tauri::State<'_, AppState>) -> std::path::PathBuf {
    let storage_root = state.storage_root.lock().unwrap();
    storage_root.join("paired_network_peers.json")
}

#[cfg(any(desktop, test))]
pub(crate) fn ios_paired_peers_path(state: &tauri::State<'_, AppState>) -> std::path::PathBuf {
    let storage_root = state.storage_root.lock().unwrap();
    storage_root.join("paired_ios_peers.json")
}

pub(crate) fn local_identity_path(state: &tauri::State<'_, AppState>) -> std::path::PathBuf {
    let storage_root = state.storage_root.lock().unwrap();
    storage_root.join("network_local_identity.json")
}

#[cfg(any(desktop, test))]
pub(crate) fn now_ms() -> u64 {
    std::time::SystemTime::now()
        .duration_since(std::time::UNIX_EPOCH)
        .unwrap_or_default()
        .as_millis() as u64
}

#[cfg(any(desktop, test))]
pub(crate) fn normalize_ios_peer_presence(
    presence: Option<&network::HostPresence>,
    now_ms: u64,
) -> (String, Option<u64>) {
    let Some(presence) = presence else {
        return ("offline".to_string(), None);
    };

    if presence.expires_at_ms <= now_ms {
        return ("offline".to_string(), None);
    }

    let status = if presence.status == "ready" {
        "ready".to_string()
    } else {
        presence.status.clone()
    };

    (status, Some(presence.expires_at_ms))
}
