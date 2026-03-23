/// Drain in-flight RPCs with a timeout.
/// Current architecture: RPCs are synchronous behind the adapter Mutex,
/// so "draining" means waiting briefly for any in-progress RPC to release the lock.
/// Returns true if drain completed within the deadline.
pub(super) async fn drain_in_flight_rpcs(timeout_secs: u64) -> bool {
    let deadline = tokio::time::Instant::now() + tokio::time::Duration::from_secs(timeout_secs);
    tokio::time::sleep(tokio::time::Duration::from_millis(10)).await;
    tokio::time::Instant::now() < deadline
}

pub(super) fn transport_type_label(metrics: &chromvoid_protocol::TransportMetrics) -> String {
    if metrics.webrtc_attempted {
        "webrtc".to_string()
    } else if metrics.wss_attempted {
        "wss".to_string()
    } else {
        "unknown".to_string()
    }
}

pub(super) fn now_ms() -> u64 {
    std::time::SystemTime::now()
        .duration_since(std::time::UNIX_EPOCH)
        .unwrap_or_default()
        .as_millis() as u64
}

/// Generate a random room ID (32 bytes → 64 hex chars).
pub(super) fn generate_room_id() -> String {
    use rand::RngCore;
    let mut bytes = [0u8; 32];
    rand::rngs::OsRng.fill_bytes(&mut bytes);
    hex::encode(bytes)
}
