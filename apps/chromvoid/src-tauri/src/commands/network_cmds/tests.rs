use super::*;

#[test]
fn normalize_ios_peer_presence_requires_unexpired_ready_presence() {
    let now_ms: u64 = 1_700_000_000_000;
    let expired_ready = network::HostPresence {
        peer_id: "peer-1".to_string(),
        relay_url: "wss://relay.test".to_string(),
        room_id: "room-1".to_string(),
        expires_at_ms: now_ms.saturating_sub(1),
        status: "ready".to_string(),
    };
    let future_ready = network::HostPresence {
        expires_at_ms: now_ms + 10_000,
        ..expired_ready.clone()
    };
    let future_waking = network::HostPresence {
        status: "waking".to_string(),
        ..future_ready.clone()
    };

    assert_eq!(
        helpers::normalize_ios_peer_presence(Some(&expired_ready), now_ms),
        ("offline".to_string(), None)
    );
    assert_eq!(
        helpers::normalize_ios_peer_presence(Some(&future_ready), now_ms),
        ("ready".to_string(), Some(future_ready.expires_at_ms))
    );
    assert_eq!(
        helpers::normalize_ios_peer_presence(Some(&future_waking), now_ms),
        ("waking".to_string(), Some(future_waking.expires_at_ms))
    );
    assert_eq!(
        helpers::normalize_ios_peer_presence(None, now_ms),
        ("offline".to_string(), None)
    );
}
