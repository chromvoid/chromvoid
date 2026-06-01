use tauri::{Emitter, Manager};
use tracing::{info, warn};

use std::path::PathBuf;
use std::sync::Arc;

use crate::app_state::AppState;
use crate::catalog_blocking_io::{CatalogBlockingIoError, CatalogBlockingIoRuntimeState};
use crate::core_adapter::{
    CoreAdapter, CoreMode, LocalCoreAdapter, ModeTransition, RemoteCoreAdapter, RemoteHost,
};
use crate::remote_io_runtime::RemoteIoStopReason;
use chromvoid_core::rpc::types::RpcRequest;

use super::super::helpers::{drain_in_flight_rpcs, generate_room_id, now_ms};
use super::super::ios_connect::connect_paired_ios_peer;
use super::super::models::ModeSwitchResult;
use super::super::noise_handshake::handshake_ik_over_transport;

/// Duration to wait for in-flight RPCs to drain before fail-fast (5 seconds).
const DRAIN_TIMEOUT_SECS: u64 = 5;

enum RemoteModePeer {
    Ios(crate::network::PairedIosPeer),
    Legacy(crate::network::PairedPeer),
}

async fn load_remote_mode_peer(
    catalog_blocking_io_runtime: Arc<CatalogBlockingIoRuntimeState>,
    storage_root: PathBuf,
    peer_id: String,
) -> Result<RemoteModePeer, String> {
    match catalog_blocking_io_runtime
        .spawn_blocking(move || {
            let ios_path = storage_root.join("paired_ios_peers.json");
            let ios = crate::network::PairedIosPeerStore::load(&ios_path);
            if let Some(peer) = ios.get(&peer_id).cloned() {
                return Ok(RemoteModePeer::Ios(peer));
            }

            let legacy_path = storage_root.join("paired_network_peers.json");
            let legacy = crate::network::PairedPeerStore::load(&legacy_path);
            legacy
                .get(&peer_id)
                .cloned()
                .map(RemoteModePeer::Legacy)
                .ok_or_else(|| format!("Peer '{}' is not paired", peer_id))
        })
        .await
    {
        Ok(result) => result,
        Err(error) => Err(mode_switch_peer_store_blocking_err(
            error,
            "Mode switch paired peer lookup",
        )),
    }
}

async fn touch_remote_mode_peer_best_effort(
    catalog_blocking_io_runtime: Arc<CatalogBlockingIoRuntimeState>,
    storage_root: PathBuf,
    peer_id: String,
) -> Result<(), String> {
    match catalog_blocking_io_runtime
        .spawn_blocking(move || {
            let mut first_error: Option<String> = None;

            let legacy_path = storage_root.join("paired_network_peers.json");
            let mut loaded_legacy = crate::network::PairedPeerStore::load(&legacy_path);
            if loaded_legacy.get(&peer_id).is_some() {
                loaded_legacy.touch(&peer_id);
                if let Err(error) = loaded_legacy.save() {
                    first_error.get_or_insert(error);
                }
            }

            let ios_path = storage_root.join("paired_ios_peers.json");
            let mut loaded_ios = crate::network::PairedIosPeerStore::load(&ios_path);
            if loaded_ios.get(&peer_id).is_some() {
                loaded_ios.touch(&peer_id);
                if let Err(error) = loaded_ios.save() {
                    first_error.get_or_insert(error);
                }
            }

            match first_error {
                Some(error) => Err(error),
                None => Ok(()),
            }
        })
        .await
    {
        Ok(result) => result,
        Err(error) => Err(mode_switch_peer_store_blocking_err(
            error,
            "Mode switch paired peer touch",
        )),
    }
}

fn mode_switch_peer_store_blocking_err(
    error: CatalogBlockingIoError,
    task_label: &'static str,
) -> String {
    let (error, _code) = error.into_rpc_error(task_label);
    error
}

/// Switches between Local and Remote mode with full state machine:
/// 1. Auto-lock vault if unlocked
/// 2. Transition to Switching state
/// 3. Drain in-flight RPCs (5s timeout, then fail-fast)
/// 4. Swap CoreAdapter
/// 5. Emit mode change event
///
/// When switching to Remote, `peer_id` must identify a paired peer from `PairedPeerStore`.
/// The command runs the fallback transport chain, completes a Noise IK handshake,
/// spawns a network I/O task, and swaps the adapter.
#[tauri::command]
pub(crate) async fn mode_switch(
    app: tauri::AppHandle,
    state: tauri::State<'_, AppState>,
    target: String,
    peer_id: Option<String>,
) -> Result<ModeSwitchResult, String> {
    let target_lower = target.to_lowercase();
    if target_lower != "local" && target_lower != "remote" {
        return Err(format!(
            "Invalid target mode '{}': must be 'local' or 'remote'",
            target
        ));
    }

    // Capture pre-switch state and perform preconditions under lock
    let (previous_mode, _was_unlocked, auto_locked) = {
        let mut adapter = state
            .adapter
            .lock()
            .map_err(|_| "Adapter mutex poisoned".to_string())?;

        let previous_mode = adapter.mode();

        // Validate: don't switch to same mode
        match (&previous_mode, target_lower.as_str()) {
            (CoreMode::Local, "local") => {
                return Err("Already in Local mode".to_string());
            }
            (CoreMode::Remote { .. }, "remote") => {
                return Err("Already in Remote mode".to_string());
            }
            (CoreMode::Switching, _) => {
                return Err("Mode switch already in progress".to_string());
            }
            _ => {}
        }

        // Step 1: Auto-lock vault if unlocked
        let was_unlocked = adapter.is_unlocked();
        let auto_locked = if was_unlocked {
            info!("mode_switch: auto-locking vault before switch");
            let lock_req = RpcRequest::new("vault:lock".to_string(), serde_json::Value::Null);
            let _ = adapter.handle(&lock_req);
            let _ = adapter.save();
            true
        } else {
            false
        };

        (previous_mode, was_unlocked, auto_locked)
    };

    // Step 2: Store transition metadata and emit switching state
    let now_ms = now_ms();
    let drain_deadline_ms = now_ms + DRAIN_TIMEOUT_SECS * 1000;

    let transition = ModeTransition {
        from: previous_mode.clone(),
        to_mode: target_lower.clone(),
        started_at_ms: now_ms,
        drain_deadline_ms,
    };

    // Emit switching state event
    let _ = app.emit("mode:switching", &transition);
    info!(
        "mode_switch: transitioning from {:?} to {}",
        previous_mode, target_lower
    );

    // Step 3: Drain in-flight RPCs with timeout
    // In practice, RPCs are dispatched synchronously through the adapter mutex.
    // When we hold the lock (below), no new RPCs can start. Existing RPCs that
    // held the lock have already completed by the time we re-acquire it.
    // The drain timeout is a safety net for future async RPC pipelines.
    let drain_completed = drain_in_flight_rpcs(DRAIN_TIMEOUT_SECS).await;
    if !drain_completed {
        warn!("mode_switch: drain timeout exceeded, proceeding with fail-fast");
    }

    // Step 4: Swap adapter
    {
        let storage_root = state
            .storage_root
            .lock()
            .map_err(|_| "Storage root mutex poisoned".to_string())?
            .clone();
        let license_root = state.license_root.clone();

        match target_lower.as_str() {
            "local" => {
                // Clear sync state before switching to Local
                state.sync_runtime.reset()?;
                let _ = app.emit("sync:status", serde_json::json!({ "phase": "cleared" }));
                info!("mode_switch: sync state cleared for Local mode");

                let local_adapter = LocalCoreAdapter::new_with_license_store(
                    storage_root.clone(),
                    license_root,
                    crate::pro::current_build_policy(),
                )
                .map_err(|e| e.to_string())?;
                {
                    let mut adapter = state
                        .adapter
                        .lock()
                        .map_err(|_| "Adapter mutex poisoned".to_string())?;
                    *adapter = Box::new(local_adapter) as Box<dyn CoreAdapter>;
                    info!("mode_switch: swapped to LocalCoreAdapter");
                    crate::helpers::emit_basic_state(&app, &storage_root, adapter.as_ref());
                }
                if let Err(error) = state
                    .remote_io_runtime
                    .stop_active(RemoteIoStopReason::ModeSwitchLocal)
                {
                    warn!("mode_switch: remote IO stop failed after local switch: {error}");
                }
            }
            "remote" => {
                let peer_id = peer_id
                    .ok_or("peer_id is required when switching to Remote mode".to_string())?;

                let _ = app.emit(
                    "connection:status",
                    serde_json::json!({ "phase": "resolving_peer", "peer_id": &peer_id }),
                );

                let remote_peer = load_remote_mode_peer(
                    state.catalog_blocking_io_runtime.clone(),
                    storage_root.clone(),
                    peer_id.clone(),
                )
                .await?;

                let noise_transport = match remote_peer {
                    RemoteModePeer::Ios(peer) => {
                        let _ = app.emit(
                            "connection:status",
                            serde_json::json!({ "phase": "resolving_ios_presence", "peer_id": &peer_id }),
                        );
                        connect_paired_ios_peer(
                            &app,
                            state.catalog_blocking_io_runtime.clone(),
                            &storage_root,
                            &peer,
                        )
                        .await?
                    }
                    RemoteModePeer::Legacy(peer) => {
                        let relay_url = peer.relay_url.clone();
                        if relay_url.is_empty() {
                            return Err("Paired peer has no relay URL".to_string());
                        }

                        let _ = app.emit(
                            "connection:status",
                            serde_json::json!({ "phase": "connecting_transport", "relay_url": &relay_url }),
                        );

                        // Run fallback transport chain
                        let room_id = generate_room_id();
                        let ice_servers = crate::network::fallback::default_ice_servers();
                        let fallback_result = crate::network::connect_with_fallback(
                            &relay_url,
                            &room_id,
                            true, // desktop is initiator
                            ice_servers,
                        )
                        .await
                        .map_err(|e| format!("Transport connection failed: {}", e))?;

                        let _ = app.emit(
                            "connection:status",
                            serde_json::json!({ "phase": "noise_handshake" }),
                        );

                        let client_privkey = hex::decode(&peer.client_privkey_hex)
                            .map_err(|e| format!("Bad privkey hex: {}", e))?;
                        handshake_ik_over_transport(
                            fallback_result.transport,
                            &client_privkey,
                            &peer.peer_pubkey,
                        )
                        .await?
                    }
                };

                let _ = app.emit(
                    "connection:status",
                    serde_json::json!({ "phase": "starting_io_task" }),
                );

                let req_tx = state.remote_io_runtime.start_network_session(
                    app.clone(),
                    crate::network::IoTaskConfig {
                        transport: noise_transport.0,
                        noise_transport: noise_transport.1,
                    },
                )?;

                let host = RemoteHost::TauriRemoteWss {
                    peer_id: peer_id.clone(),
                };

                let remote_start_result = async {
                    let mut remote = RemoteCoreAdapter::from_network(host, req_tx);
                    remote.probe_capabilities();
                    let caps = crate::types::runtime_capabilities_for_current_target();
                    crate::pro::guard_pro_feature_for_adapter(
                        &mut remote,
                        chromvoid_core::license::PRO_FEATURE_REMOTE,
                        &caps,
                    )
                    .map_err(|error| match error {
                        crate::types::RpcResult::Error { error, code, .. } => {
                            format!(
                                "{}: {}",
                                code.unwrap_or_else(|| "PRO_REQUIRED".to_string()),
                                error
                            )
                        }
                        crate::types::RpcResult::Success { .. } => {
                            "Pro license required".to_string()
                        }
                    })?;

                    // Touch last_seen after entitlement is accepted, before swapping adapter.
                    if let Err(error) = touch_remote_mode_peer_best_effort(
                        state.catalog_blocking_io_runtime.clone(),
                        storage_root.clone(),
                        peer_id.clone(),
                    )
                    .await
                    {
                        warn!("mode_switch: failed to update paired peer last_seen: {error}");
                    }

                    {
                        let mut adapter = state
                            .adapter
                            .lock()
                            .map_err(|_| "Adapter mutex poisoned".to_string())?;
                        *adapter = Box::new(remote) as Box<dyn CoreAdapter>;
                        info!(
                            "mode_switch: swapped to RemoteCoreAdapter (network) for peer {}",
                            peer_id
                        );
                        crate::helpers::emit_basic_state(&app, &storage_root, adapter.as_ref());
                    }

                    Ok(())
                }
                .await;

                if let Err(error) = remote_start_result {
                    if let Err(stop_error) = state
                        .remote_io_runtime
                        .stop_active(RemoteIoStopReason::StartFailed)
                    {
                        warn!(
                            "mode_switch: remote IO cleanup failed after start error: {stop_error}"
                        );
                    }
                    return Err(error);
                }

                let _ = app.emit(
                    "connection:status",
                    serde_json::json!({ "phase": "connected", "peer_id": &peer_id }),
                );

                // Bootstrap sync state for Remote mode
                state.sync_runtime.bootstrap(0, now_ms)?;
                let _ = app.emit(
                    "sync:status",
                    serde_json::json!({
                        "phase": "bootstrap_started",
                        "subscribed": true,
                    }),
                );
                info!("mode_switch: sync bootstrap initiated for Remote mode");
            }
            _ => unreachable!(),
        }
    }

    let (current_mode, remote_core_features) = {
        let adapter = state
            .adapter
            .lock()
            .map_err(|_| "Adapter mutex poisoned".to_string())?;
        (adapter.mode(), adapter.remote_core_features())
    };

    // Step 6: Emit mode change event
    let result = ModeSwitchResult {
        previous_mode,
        current_mode: current_mode.clone(),
        remote_core_features,
        auto_locked,
        drain_completed,
    };

    let _ = app.emit("mode:changed", &result);
    info!("mode_switch: completed, now in {:?}", current_mode);

    Ok(result)
}

/// Handle transport reconnection in Remote mode.
/// Compares local sync cursor against the Core Host's current version,
/// chooses delta vs full resync, updates cursor, and re-subscribes.
///
/// Called externally when a new transport is established after a disconnect
/// while the app is still in Remote mode.
#[allow(dead_code)]
pub(crate) fn handle_sync_reconnect(
    app: &tauri::AppHandle,
    host_version: u64,
    host_timestamp_ms: u64,
) -> Result<crate::commands::sync_cmds::ReconnectStrategy, String> {
    let state = app.state::<AppState>();
    let strategy = state
        .sync_runtime
        .trigger_reconnect(host_version, host_timestamp_ms)?;

    let _ = app.emit(
        "sync:status",
        serde_json::json!({
            "phase": "reconnect_completed",
            "strategy": reconnect_strategy_json(&strategy),
            "subscribed": true,
        }),
    );

    info!(
        "handle_sync_reconnect: strategy={:?}, host_version={}",
        strategy, host_version
    );

    Ok(strategy)
}

fn reconnect_strategy_json(
    strategy: &crate::commands::sync_cmds::ReconnectStrategy,
) -> serde_json::Value {
    match serde_json::to_value(strategy) {
        Ok(value) => value,
        Err(error) => {
            warn!("handle_sync_reconnect: failed to serialize reconnect strategy: {error}");
            serde_json::Value::Null
        }
    }
}

#[cfg(test)]
mod tests {
    use super::*;

    #[test]
    fn mode_switch_peer_store_blocking_err_maps_shutdown() {
        assert_eq!(
            mode_switch_peer_store_blocking_err(
                CatalogBlockingIoError::ShuttingDown,
                "Mode switch paired peer lookup",
            ),
            "Catalog background IO is shutting down"
        );
    }
}
