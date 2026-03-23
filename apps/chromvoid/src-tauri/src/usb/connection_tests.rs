use super::*;

#[test]
fn initial_state_is_disconnected() {
    let mgr = UsbConnectionManager::new();
    assert_eq!(mgr.state(), ConnectionState::Disconnected);
    assert!(!mgr.is_connected());
}

#[test]
fn state_transitions_produce_events() {
    let mut mgr = UsbConnectionManager::new();
    mgr.transition(ConnectionState::Connecting);
    let events = mgr.take_events();
    assert_eq!(events.len(), 1);
    let evt = &events[0];
    assert_eq!(evt["type"], "connection:state");
    assert_eq!(evt["new_state"], "connecting");
}

#[test]
fn disconnect_resets_state() {
    let mut mgr = UsbConnectionManager::new();
    mgr.transition(ConnectionState::Ready);
    assert!(mgr.is_connected());

    mgr.disconnect();
    assert_eq!(mgr.state(), ConnectionState::Disconnected);
    assert!(!mgr.is_connected());
}

#[test]
fn reconnect_backoff_doubles() {
    let mut mgr = UsbConnectionManager::new();
    assert_eq!(mgr.reconnect_backoff(), Duration::from_secs(2));
    mgr.record_reconnect_attempt();
    assert_eq!(mgr.reconnect_backoff(), Duration::from_secs(4));
    mgr.record_reconnect_attempt();
    assert_eq!(mgr.reconnect_backoff(), Duration::from_secs(8));
}

#[test]
fn should_reconnect_limited_to_max_attempts() {
    let mut mgr = UsbConnectionManager::new();
    assert!(mgr.should_reconnect());
    for _ in 0..MAX_RECONNECT_ATTEMPTS {
        assert!(mgr.should_reconnect());
        mgr.record_reconnect_attempt();
    }
    assert!(!mgr.should_reconnect());
}

#[test]
fn next_msg_id_monotonic() {
    let mut mgr = UsbConnectionManager::new();
    let a = mgr.next_msg_id();
    let b = mgr.next_msg_id();
    let c = mgr.next_msg_id();
    assert!(b > a, "expected {} > {}", b, a);
    assert!(c > b, "expected {} > {}", c, b);
}
