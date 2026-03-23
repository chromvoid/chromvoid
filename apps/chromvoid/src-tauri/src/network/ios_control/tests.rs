use super::*;

#[test]
fn converts_wss_urls_to_https_control_plane() {
    assert_eq!(
        http_base_from_relay_url("wss://relay.chromvoid.com").unwrap(),
        "https://relay.chromvoid.com"
    );
    assert_eq!(
        http_base_from_relay_url("ws://localhost:8443").unwrap(),
        "http://localhost:8443"
    );
}

#[test]
fn rejects_invalid_scheme() {
    let err = http_base_from_relay_url("ftp://relay.chromvoid.com").unwrap_err();
    assert!(err.contains("unsupported relay scheme"));
}

#[test]
fn wake_request_shape_deserializes() {
    let wake = serde_json::from_value::<WakeRequest>(serde_json::json!({
        "peer_id": "ios-peer",
        "requested_at_ms": 123,
        "status": "waking",
    }))
    .unwrap();
    assert_eq!(wake.peer_id, "ios-peer");
    assert_eq!(wake.requested_at_ms, 123);
    assert_eq!(wake.status, "waking");
}
