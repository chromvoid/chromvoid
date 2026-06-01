use super::*;
use crate::catalog_blocking_io::{CatalogBlockingIoError, CatalogBlockingIoRuntimeState};
use crate::core_adapter::CoreAdapter;
use crate::vault_background_io::VaultBackgroundIoRuntimeState;
use std::path::PathBuf;
use std::sync::{Arc, Mutex};

#[tauri::command]
pub(crate) async fn network_connection_state(
    state: tauri::State<'_, AppState>,
) -> Result<String, String> {
    run_network_adapter_snapshot_task(
        state.vault_background_io_runtime.clone(),
        state.adapter.clone(),
        "Network connection state",
        |adapter| {
            let cs = adapter.connection_state();
            match serde_json::to_string(&cs) {
                Ok(state) => Ok(state),
                Err(error) => {
                    tracing::warn!("network: failed to serialize connection state: {error}");
                    Ok("\"disconnected\"".to_string())
                }
            }
        },
    )
    .await
}

#[tauri::command]
pub(crate) async fn network_list_paired_peers(
    state: tauri::State<'_, AppState>,
) -> Result<Vec<serde_json::Value>, String> {
    let legacy_path = helpers::legacy_paired_peers_path(&state)?;
    let ios_path = helpers::ios_paired_peers_path(&state)?;
    let (legacy_peers, ios_peers) = run_paired_peer_store_task(
        state.catalog_blocking_io_runtime.clone(),
        legacy_path,
        ios_path,
        "Network paired peer list",
        move |legacy_path, ios_path| {
            let legacy = network::PairedPeerStore::load(&legacy_path);
            let ios = network::PairedIosPeerStore::load(&ios_path);
            Ok((
                legacy.list().into_iter().cloned().collect::<Vec<_>>(),
                ios.list().into_iter().cloned().collect::<Vec<_>>(),
            ))
        },
    )
    .await?;
    let current_time_ms = helpers::now_ms();

    let mut peers: Vec<serde_json::Value> = Vec::new();
    for peer in legacy_peers {
        let fetched_presence = if peer.platform == "android" {
            network::fetch_host_presence(&peer.relay_url, &peer.peer_id)
                .await
                .ok()
        } else {
            None
        };
        let (status, presence_expires_at_ms) =
            helpers::normalize_ios_peer_presence(fetched_presence.as_ref(), current_time_ms);

        peers.push(serde_json::json!({
            "peer_id": peer.peer_id,
            "label": peer.label,
            "relay_url": peer.relay_url,
            "last_seen": peer.last_seen,
            "paired_at": peer.paired_at,
            "platform": peer.platform,
            "status": if peer.platform == "android" { serde_json::Value::String(status) } else { serde_json::Value::Null },
            "presence_expires_at_ms": if peer.platform == "android" {
                presence_expires_at_ms.map(serde_json::Value::from).unwrap_or(serde_json::Value::Null)
            } else {
                serde_json::Value::Null
            },
        }));
    }

    for peer in ios_peers {
        let fetched_presence = network::fetch_host_presence(&peer.relay_url, &peer.peer_id)
            .await
            .ok();
        let (status, presence_expires_at_ms) =
            helpers::normalize_ios_peer_presence(fetched_presence.as_ref(), current_time_ms);

        peers.push(serde_json::json!({
            "peer_id": peer.peer_id,
            "label": peer.peer_label,
            "relay_url": peer.relay_url,
            "last_seen": peer.last_seen,
            "paired_at": peer.paired_at,
            "platform": peer.platform,
            "status": status,
            "presence_expires_at_ms": presence_expires_at_ms,
        }));
    }
    Ok(peers)
}

#[tauri::command]
pub(crate) async fn network_remove_paired_peer(
    state: tauri::State<'_, AppState>,
    peer_id: String,
) -> Result<(), String> {
    let legacy_path = helpers::legacy_paired_peers_path(&state)?;
    let ios_path = helpers::ios_paired_peers_path(&state)?;
    run_paired_peer_store_task(
        state.catalog_blocking_io_runtime.clone(),
        legacy_path,
        ios_path,
        "Network paired peer remove",
        move |legacy_path, ios_path| {
            let mut legacy = network::PairedPeerStore::load(&legacy_path);
            let mut ios = network::PairedIosPeerStore::load(&ios_path);
            let removed_legacy = legacy.remove(&peer_id).is_some();
            let removed_ios = ios.remove(&peer_id).is_some();
            if removed_legacy {
                legacy.save()?;
            }
            if removed_ios {
                ios.save()?;
            }
            Ok(())
        },
    )
    .await
}

#[tauri::command]
pub(crate) async fn network_transport_metrics(
    state: tauri::State<'_, AppState>,
) -> Result<serde_json::Value, String> {
    run_network_adapter_snapshot_task(
        state.vault_background_io_runtime.clone(),
        state.adapter.clone(),
        "Network transport metrics",
        |adapter| {
            let metrics = adapter.transport_metrics().unwrap_or_default();
            match serde_json::to_value(metrics) {
                Ok(metrics) => Ok(metrics),
                Err(error) => {
                    tracing::warn!("network: failed to serialize transport metrics: {error}");
                    Ok(serde_json::json!({
                        "transport_type": null,
                        "connection_time_ms": 0,
                        "failure_reason": null,
                        "attempt_count": 0,
                        "quic_attempted": false,
                        "quic_udp_blocked": false,
                        "webrtc_attempted": false,
                        "wss_attempted": false,
                        "tcp_stealth_attempted": false,
                        "ice_candidates_gathered": 0,
                        "events": [],
                        "fallback_transition_times_ms": [],
                        "fallback_transition_p95_ms": null
                    }))
                }
            }
        },
    )
    .await
}

#[tauri::command]
pub(crate) fn network_generate_room_id() -> String {
    use rand::Rng;
    let mut rng = rand::thread_rng();
    let bytes: Vec<u8> = (0..32).map(|_| rng.gen()).collect();
    bytes.iter().map(|b| format!("{:02x}", b)).collect()
}

async fn run_paired_peer_store_task<T, F>(
    catalog_blocking_io_runtime: Arc<CatalogBlockingIoRuntimeState>,
    legacy_path: PathBuf,
    ios_path: PathBuf,
    task_label: &'static str,
    task: F,
) -> Result<T, String>
where
    T: Send + 'static,
    F: FnOnce(PathBuf, PathBuf) -> Result<T, String> + Send + 'static,
{
    match catalog_blocking_io_runtime
        .spawn_blocking(move || task(legacy_path, ios_path))
        .await
    {
        Ok(result) => result,
        Err(error) => Err(paired_peer_store_blocking_err(error, task_label)),
    }
}

async fn run_network_adapter_snapshot_task<T, F>(
    vault_background_io_runtime: Arc<VaultBackgroundIoRuntimeState>,
    adapter: Arc<Mutex<Box<dyn CoreAdapter>>>,
    task_label: &'static str,
    task: F,
) -> Result<T, String>
where
    T: Send + 'static,
    F: FnOnce(&dyn CoreAdapter) -> Result<T, String> + Send + 'static,
{
    match vault_background_io_runtime
        .spawn_blocking(move || {
            let adapter = adapter
                .lock()
                .map_err(|_| "Adapter mutex poisoned".to_string())?;
            task(adapter.as_ref())
        })
        .await
    {
        Ok(result) => result,
        Err(error) => {
            let (error, _code) = error.into_rpc_error(task_label);
            Err(error)
        }
    }
}

fn paired_peer_store_blocking_err(
    error: CatalogBlockingIoError,
    task_label: &'static str,
) -> String {
    let (error, _code) = error.into_rpc_error(task_label);
    error
}

#[cfg(test)]
mod tests {
    use super::*;

    #[test]
    fn paired_peer_store_blocking_err_maps_shutdown() {
        assert_eq!(
            paired_peer_store_blocking_err(
                CatalogBlockingIoError::ShuttingDown,
                "Network paired peer remove",
            ),
            "Catalog background IO is shutting down"
        );
    }
}
