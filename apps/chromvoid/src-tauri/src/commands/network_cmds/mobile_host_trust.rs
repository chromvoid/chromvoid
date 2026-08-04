use super::*;
use crate::catalog_blocking_io::{CatalogBlockingIoError, CatalogBlockingIoRuntimeState};
use crate::network::mobile_acceptor::PeerRevocationResult;
use crate::network::PairedPeerStore;
use serde::Serialize;
use std::path::{Path, PathBuf};
use std::sync::Arc;

#[derive(Debug, Clone, Copy, PartialEq, Eq, Serialize)]
#[serde(rename_all = "snake_case")]
pub(crate) enum MobileHostPairingTransport {
    UsbMobile,
    Network,
}

#[derive(Debug, Clone, PartialEq, Eq, Serialize)]
pub(crate) struct MobileHostPairedComputerView {
    pub peer_id: String,
    pub label: String,
    pub platform: String,
    pub pairing_transport: MobileHostPairingTransport,
    pub paired_at_ms: u64,
    pub last_seen_ms: u64,
}

#[derive(Debug, Clone, Copy, PartialEq, Eq, Serialize)]
#[serde(rename_all = "snake_case")]
pub(crate) enum MobileHostSessionAction {
    NotConnected,
    DisconnectSignalled,
    DisconnectFailed,
}

#[derive(Debug, Clone, PartialEq, Eq, Serialize)]
pub(crate) struct MobileHostRevokeResult {
    pub peer_id: String,
    pub pairing_removed: bool,
    pub session_action: MobileHostSessionAction,
}

#[tauri::command]
pub(crate) async fn mobile_host_list_paired_computers(
    state: tauri::State<'_, AppState>,
) -> Result<Vec<MobileHostPairedComputerView>, String> {
    let store_path = helpers::legacy_paired_peers_path(&state)?;
    run_host_trust_store_task(
        state.catalog_blocking_io_runtime.clone(),
        store_path,
        "Mobile host paired computer list",
        list_paired_computers,
    )
    .await
}

#[tauri::command]
pub(crate) async fn mobile_host_revoke_paired_computer(
    state: tauri::State<'_, AppState>,
    peer_id: String,
) -> Result<MobileHostRevokeResult, String> {
    validate_peer_id(&peer_id)?;
    let store_path = helpers::legacy_paired_peers_path(&state)?;
    let peer_id_for_store = peer_id.clone();
    let pairing_removed = run_host_trust_store_task(
        state.catalog_blocking_io_runtime.clone(),
        store_path,
        "Mobile host paired computer revoke",
        move |path| remove_paired_computer(&path, &peer_id_for_store),
    )
    .await?;

    let session_action = match state.mobile_acceptor_runtime.revoke_peer_access(&peer_id)? {
        PeerRevocationResult::NotConnected => MobileHostSessionAction::NotConnected,
        PeerRevocationResult::DisconnectSignalled => MobileHostSessionAction::DisconnectSignalled,
        PeerRevocationResult::DisconnectFailed => MobileHostSessionAction::DisconnectFailed,
    };
    Ok(MobileHostRevokeResult {
        peer_id,
        pairing_removed,
        session_action,
    })
}

fn list_paired_computers(path: &Path) -> Result<Vec<MobileHostPairedComputerView>, String> {
    let store = PairedPeerStore::load(path);
    ensure_store_loaded(&store, "paired peer store is unavailable")?;
    let mut computers = store
        .list()
        .into_iter()
        .map(|peer| MobileHostPairedComputerView {
            peer_id: peer.peer_id.clone(),
            label: peer.label.clone(),
            platform: peer.platform.clone(),
            pairing_transport: if peer.relay_url.starts_with("usb://") {
                MobileHostPairingTransport::UsbMobile
            } else {
                MobileHostPairingTransport::Network
            },
            paired_at_ms: timestamp_ms(peer.paired_at),
            last_seen_ms: timestamp_ms(peer.last_seen),
        })
        .collect::<Vec<_>>();
    computers.sort_by(|left, right| left.peer_id.cmp(&right.peer_id));
    Ok(computers)
}

fn remove_paired_computer(path: &Path, peer_id: &str) -> Result<bool, String> {
    let mut store = PairedPeerStore::load(path);
    ensure_store_loaded(
        &store,
        "paired peer store is unavailable; refusing to mutate trust store",
    )?;
    let removed = store.remove(peer_id).is_some();
    if removed {
        store.save()?;
    }
    Ok(removed)
}

fn ensure_store_loaded(store: &PairedPeerStore, context: &str) -> Result<(), String> {
    match store.load_error() {
        Some(error) => Err(format!("{context}: {error}")),
        None => Ok(()),
    }
}

fn validate_peer_id(peer_id: &str) -> Result<(), String> {
    if peer_id.trim().is_empty()
        || peer_id.trim() != peer_id
        || peer_id.len() > 256
        || peer_id.chars().any(char::is_control)
    {
        return Err("peerId is invalid".to_string());
    }
    Ok(())
}

fn timestamp_ms(value: u64) -> u64 {
    if value < 1_000_000_000_000 {
        value.saturating_mul(1_000)
    } else {
        value
    }
}

async fn run_host_trust_store_task<T, F>(
    runtime: Arc<CatalogBlockingIoRuntimeState>,
    path: PathBuf,
    task_label: &'static str,
    task: F,
) -> Result<T, String>
where
    T: Send + 'static,
    F: FnOnce(&Path) -> Result<T, String> + Send + 'static,
{
    match runtime.spawn_blocking(move || task(&path)).await {
        Ok(result) => result,
        Err(error) => Err(host_trust_store_blocking_err(error, task_label)),
    }
}

fn host_trust_store_blocking_err(
    error: CatalogBlockingIoError,
    task_label: &'static str,
) -> String {
    let (error, _code) = error.into_rpc_error(task_label);
    error
}

#[cfg(test)]
mod tests {
    use super::*;
    use crate::network::PairedPeer;

    fn peer(peer_id: &str, relay_url: &str, timestamp: u64) -> PairedPeer {
        PairedPeer {
            peer_id: peer_id.to_string(),
            label: format!("Computer {peer_id}"),
            relay_url: relay_url.to_string(),
            peer_pubkey: peer_id.as_bytes().to_vec(),
            client_pubkey: vec![1, 2, 3],
            client_privkey_hex: "private-secret".to_string(),
            last_seen: timestamp,
            paired_at: timestamp.saturating_sub(10),
            platform: "macos".to_string(),
        }
    }

    #[test]
    fn list_is_sanitized_and_normalizes_transport_and_timestamps() {
        let directory = tempfile::tempdir().expect("tempdir");
        let path = directory.path().join("paired_network_peers.json");
        let mut store = PairedPeerStore::load(&path);
        store
            .upsert(peer("network-peer", "https://relay.example", 1_700_000_000))
            .expect("upsert network peer");
        store
            .upsert(peer("usb-peer", "usb://android-aoa", 1_700_000_100))
            .expect("upsert USB peer");
        store.save().expect("save peers");

        let views = list_paired_computers(&path).expect("list paired computers");

        assert_eq!(views.len(), 2);
        assert_eq!(views[0].peer_id, "network-peer");
        assert_eq!(
            views[0].pairing_transport,
            MobileHostPairingTransport::Network
        );
        assert_eq!(views[0].last_seen_ms, 1_700_000_000_000);
        assert_eq!(
            views[1].pairing_transport,
            MobileHostPairingTransport::UsbMobile
        );
        let serialized = serde_json::to_value(&views).expect("serialize views");
        let text = serialized.to_string();
        assert!(!text.contains("private-secret"));
        assert!(!text.contains("relay.example"));
        assert!(!text.contains("peer_pubkey"));
    }

    #[test]
    fn remove_is_idempotent_and_preserves_other_peers() {
        let directory = tempfile::tempdir().expect("tempdir");
        let path = directory.path().join("paired_network_peers.json");
        let mut store = PairedPeerStore::load(&path);
        store
            .upsert(peer("keep", "https://relay.example", 1_700_000_000))
            .expect("upsert keep peer");
        store
            .upsert(peer("remove", "usb://android-aoa", 1_700_000_100))
            .expect("upsert remove peer");
        store.save().expect("save peers");

        assert!(remove_paired_computer(&path, "remove").expect("remove peer"));
        assert!(!remove_paired_computer(&path, "remove").expect("repeat remove"));
        let loaded = PairedPeerStore::load(&path);
        assert!(loaded.get("remove").is_none());
        assert!(loaded.get("keep").is_some());
    }

    #[test]
    fn corrupt_store_fails_closed() {
        let directory = tempfile::tempdir().expect("tempdir");
        let path = directory.path().join("paired_network_peers.json");
        std::fs::write(&path, b"not-json").expect("write corrupt store");

        assert!(list_paired_computers(&path).is_err());
        assert!(remove_paired_computer(&path, "peer").is_err());
        assert_eq!(
            std::fs::read(&path).expect("read corrupt store"),
            b"not-json"
        );
    }

    #[test]
    fn peer_id_validation_rejects_empty_control_and_oversized_values() {
        assert!(validate_peer_id("").is_err());
        assert!(validate_peer_id("   ").is_err());
        assert!(validate_peer_id(" peer-1").is_err());
        assert!(validate_peer_id("bad\npeer").is_err());
        assert!(validate_peer_id(&"x".repeat(257)).is_err());
        assert!(validate_peer_id("peer-1").is_ok());
    }
}
