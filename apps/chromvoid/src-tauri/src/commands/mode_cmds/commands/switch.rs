use tauri::Emitter;
use tracing::{info, warn};

use crate::app_state::AppState;
use crate::core_adapter::{
    CoreAdapter, CoreMode, LocalCoreAdapter, ModeTransition, RemoteCoreAdapter, RemoteHost,
};
use chromvoid_core::rpc::types::RpcRequest;

use super::super::helpers::{drain_in_flight_rpcs, generate_room_id, now_ms};
use super::super::ios_connect::connect_paired_ios_peer;
use super::super::models::ModeSwitchResult;
use super::super::noise_handshake::handshake_ik_over_transport;

/// Duration to wait for in-flight RPCs to drain before fail-fast (5 seconds).
const DRAIN_TIMEOUT_SECS: u64 = 5;

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

        match target_lower.as_str() {
            "local" => {
                // Clear sync state before switching to Local
                crate::commands::sync_cmds::reset_sync_state();
                let _ = app.emit("sync:status", serde_json::json!({ "phase": "cleared" }));
                info!("mode_switch: sync state cleared for Local mode");

                let local_adapter =
                    LocalCoreAdapter::new(storage_root.clone()).map_err(|e| e.to_string())?;
                {
                    let mut adapter = state
                        .adapter
                        .lock()
                        .map_err(|_| "Adapter mutex poisoned".to_string())?;
                    *adapter = Box::new(local_adapter) as Box<dyn CoreAdapter>;
                    info!("mode_switch: swapped to LocalCoreAdapter");
                    crate::helpers::emit_basic_state(&app, &storage_root, adapter.as_ref());
                }
            }
            "remote" => {
                let peer_id = peer_id
                    .ok_or("peer_id is required when switching to Remote mode".to_string())?;

                let _ = app.emit(
                    "connection:status",
                    serde_json::json!({ "phase": "resolving_peer", "peer_id": &peer_id }),
                );

                let ios_peer = {
                    let store_path = storage_root.join("paired_ios_peers.json");
                    let store = crate::network::PairedIosPeerStore::load(&store_path);
                    store.get(&peer_id).cloned()
                };

                let noise_transport = if let Some(peer) = ios_peer {
                    let _ = app.emit(
                        "connection:status",
                        serde_json::json!({ "phase": "resolving_ios_presence", "peer_id": &peer_id }),
                    );
                    connect_paired_ios_peer(&app, &storage_root, &peer).await?
                } else {
                    let peer = {
                        let store_path = storage_root.join("paired_network_peers.json");
                        let store = crate::network::PairedPeerStore::load(&store_path);
                        store
                            .get(&peer_id)
                            .cloned()
                            .ok_or_else(|| format!("Peer '{}' is not paired", peer_id))?
                    };

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
                };

                let _ = app.emit(
                    "connection:status",
                    serde_json::json!({ "phase": "starting_io_task" }),
                );

                // Spawn network I/O task
                let (req_tx, mut evt_rx) =
                    crate::network::spawn_network_io_task(crate::network::IoTaskConfig {
                        transport: noise_transport.0,
                        noise_transport: noise_transport.1,
                    });
                let push_event_app = app.clone();
                tauri::async_runtime::spawn(async move {
                    while let Some(event) = evt_rx.recv().await {
                        match event {
                            crate::network::IoEvent::Frame(frame) => {
                                if frame.frame_type
                                    != crate::gateway::protocol::FrameType::RpcRequest
                                {
                                    continue;
                                }

                                match serde_json::from_slice::<RpcRequest>(&frame.payload) {
                                    Ok(request) => {
                                        crate::helpers::emit_core_event(
                                            &push_event_app,
                                            &request.command,
                                            request.data,
                                        );
                                    }
                                    Err(error) => {
                                        warn!(
                                            "mode_switch: failed to decode remote push event: {}",
                                            error
                                        );
                                    }
                                }
                            }
                            crate::network::IoEvent::Disconnected { reason } => {
                                warn!(
                                    "mode_switch: network I/O task disconnected after switch: {}",
                                    reason
                                );
                            }
                            _ => {}
                        }
                    }
                });

                // Touch last_seen
                {
                    let legacy_path = storage_root.join("paired_network_peers.json");
                    let mut legacy = crate::network::PairedPeerStore::load(&legacy_path);
                    if legacy.get(&peer_id).is_some() {
                        legacy.touch(&peer_id);
                        let _ = legacy.save();
                    }
                    let ios_path = storage_root.join("paired_ios_peers.json");
                    let mut ios = crate::network::PairedIosPeerStore::load(&ios_path);
                    if ios.get(&peer_id).is_some() {
                        ios.touch(&peer_id);
                        let _ = ios.save();
                    }
                }

                let host = RemoteHost::TauriRemoteWss {
                    peer_id: peer_id.clone(),
                };
                let remote = RemoteCoreAdapter::from_network(host, req_tx);

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

                let _ = app.emit(
                    "connection:status",
                    serde_json::json!({ "phase": "connected", "peer_id": &peer_id }),
                );

                // Bootstrap sync state for Remote mode
                crate::commands::sync_cmds::bootstrap_sync(0, now_ms);
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

    let current_mode = {
        let adapter = state
            .adapter
            .lock()
            .map_err(|_| "Adapter mutex poisoned".to_string())?;
        adapter.mode()
    };

    // Step 6: Emit mode change event
    let result = ModeSwitchResult {
        previous_mode,
        current_mode: current_mode.clone(),
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
    let strategy =
        crate::commands::sync_cmds::trigger_reconnect_sync(host_version, host_timestamp_ms);

    let _ = app.emit(
        "sync:status",
        serde_json::json!({
            "phase": "reconnect_completed",
            "strategy": serde_json::to_value(&strategy).unwrap_or_default(),
            "subscribed": true,
        }),
    );

    info!(
        "handle_sync_reconnect: strategy={:?}, host_version={}",
        strategy, host_version
    );

    Ok(strategy)
}
