use super::*;

#[tauri::command]
pub(crate) fn network_connection_state(state: tauri::State<'_, AppState>) -> String {
    let adapter = state.adapter.lock().unwrap();
    let cs = adapter.connection_state();
    serde_json::to_string(&cs).unwrap_or_else(|_| "\"disconnected\"".to_string())
}

#[tauri::command]
pub(crate) async fn network_list_paired_peers(
    state: tauri::State<'_, AppState>,
) -> Result<Vec<serde_json::Value>, String> {
    let legacy = network::PairedPeerStore::load(&helpers::legacy_paired_peers_path(&state));
    let ios = network::PairedIosPeerStore::load(&helpers::ios_paired_peers_path(&state));
    let current_time_ms = helpers::now_ms();

    let mut peers: Vec<serde_json::Value> = legacy
        .list()
        .into_iter()
        .map(|p| {
            serde_json::json!({
                "peer_id": p.peer_id,
                "label": p.label,
                "relay_url": p.relay_url,
                "last_seen": p.last_seen,
                "paired_at": p.paired_at,
                "platform": "network",
                "status": serde_json::Value::Null,
                "presence_expires_at_ms": serde_json::Value::Null,
            })
        })
        .collect();

    for peer in ios.list().into_iter().cloned() {
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
pub(crate) fn network_remove_paired_peer(
    state: tauri::State<'_, AppState>,
    peer_id: String,
) -> Result<(), String> {
    let mut legacy = network::PairedPeerStore::load(&helpers::legacy_paired_peers_path(&state));
    let mut ios = network::PairedIosPeerStore::load(&helpers::ios_paired_peers_path(&state));
    let removed_legacy = legacy.remove(&peer_id).is_some();
    let removed_ios = ios.remove(&peer_id).is_some();
    if removed_legacy {
        legacy.save()?;
    }
    if removed_ios {
        ios.save()?;
    }
    Ok(())
}

#[tauri::command]
pub(crate) fn network_transport_metrics(state: tauri::State<'_, AppState>) -> serde_json::Value {
    let adapter = state.adapter.lock().unwrap();
    let metrics = adapter.transport_metrics().unwrap_or_default();
    serde_json::to_value(metrics).unwrap_or_else(|_| {
        serde_json::json!({
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
        })
    })
}

#[tauri::command]
pub(crate) fn network_generate_room_id() -> String {
    use rand::Rng;
    let mut rng = rand::thread_rng();
    let bytes: Vec<u8> = (0..32).map(|_| rng.gen()).collect();
    bytes.iter().map(|b| format!("{:02x}", b)).collect()
}
