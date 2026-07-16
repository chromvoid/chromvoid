use std::path::PathBuf;

use tracing::warn;

use crate::network::paired_peers::PairedPeerStore;
use crate::network::{LocalDeviceIdentity, LocalDeviceIdentityStore};

pub(super) async fn load_paired_peer_store_blocking(
    store_path: PathBuf,
) -> Result<PairedPeerStore, String> {
    tauri::async_runtime::spawn_blocking(move || PairedPeerStore::load(&store_path))
        .await
        .map_err(|error| format!("mobile acceptor peer store load task failed: {error}"))
}

pub(super) async fn load_or_create_local_identity_blocking(
    storage_root: PathBuf,
) -> Result<LocalDeviceIdentity, String> {
    tauri::async_runtime::spawn_blocking(move || {
        let mut store =
            LocalDeviceIdentityStore::load(&storage_root.join("network_local_identity.json"));
        store.get_or_create("ChromVoid Host")
    })
    .await
    .map_err(|error| format!("mobile acceptor identity load task failed: {error}"))?
}

pub(super) async fn touch_paired_peer_store_blocking(
    store_path: PathBuf,
    peer_id: String,
) -> Result<(), String> {
    tauri::async_runtime::spawn_blocking(move || {
        let mut loaded = PairedPeerStore::load(&store_path);
        loaded.touch(&peer_id);
        loaded.save()
    })
    .await
    .map_err(|error| format!("mobile acceptor peer store touch task failed: {error}"))?
}

pub(super) fn spawn_touch_paired_peer_store(store_path: PathBuf, peer_id: String) {
    tauri::async_runtime::spawn(async move {
        if let Err(error) = touch_paired_peer_store_blocking(store_path, peer_id).await {
            warn!("mobile_acceptor: failed to update paired peer last_seen: {error}");
        }
    });
}
