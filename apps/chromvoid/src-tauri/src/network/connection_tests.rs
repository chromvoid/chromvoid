use super::*;

#[test]
fn initial_state_is_disconnected() {
    let mgr = NetworkConnectionManager::new();
    assert_eq!(mgr.state(), ConnectionState::Disconnected);
    assert!(!mgr.is_connected());
    assert_eq!(mgr.transport_type(), None);
}

#[test]
fn state_transitions_produce_events() {
    let mut mgr = NetworkConnectionManager::new();
    mgr.transition(ConnectionState::Connecting);
    let events = mgr.take_events();
    assert_eq!(events.len(), 1);
    let evt = &events[0];
    assert_eq!(evt["type"], "network:state");
    assert_eq!(evt["new_state"], "connecting");
}

#[test]
fn disconnect_resets_state() {
    let mut mgr = NetworkConnectionManager::new();
    mgr.transition(ConnectionState::Ready);
    assert!(mgr.is_connected());

    mgr.disconnect();
    assert_eq!(mgr.state(), ConnectionState::Disconnected);
    assert!(!mgr.is_connected());
    assert_eq!(mgr.transport_type(), None);
    assert!(!mgr.safety().kill_switch_active);
}

#[test]
fn transport_drop_activates_kill_switch_fail_closed() {
    let mut mgr = NetworkConnectionManager::new();
    mgr.begin_fallback_transition();
    assert!(mgr.safety().kill_switch_active);

    mgr.handle_transport_drop();

    assert_eq!(mgr.state(), ConnectionState::Disconnected);
    assert!(mgr.safety().kill_switch_active);
    assert!(mgr.safety().egress_filter.block_direct_traffic);
}

#[test]
fn safe_transport_restore_disables_kill_switch() {
    let mut mgr = NetworkConnectionManager::new();
    mgr.handle_transport_drop();
    assert!(mgr.safety().kill_switch_active);

    mgr.mark_transport_restored();

    assert!(!mgr.safety().kill_switch_active);
    assert_eq!(
        mgr.safety().dns_routing,
        crate::network::safety::DnsRouting::SecureProxy
    );
}

#[test]
fn reconnect_backoff_doubles() {
    let mut mgr = NetworkConnectionManager::new();
    assert_eq!(mgr.reconnect_backoff(), Duration::from_secs(2));
    mgr.record_reconnect_attempt();
    assert_eq!(mgr.reconnect_backoff(), Duration::from_secs(4));
    mgr.record_reconnect_attempt();
    assert_eq!(mgr.reconnect_backoff(), Duration::from_secs(8));
}

#[test]
fn should_reconnect_limited_to_max_attempts() {
    let mut mgr = NetworkConnectionManager::new();
    assert!(mgr.should_reconnect());
    for _ in 0..MAX_RECONNECT_ATTEMPTS {
        assert!(mgr.should_reconnect());
        mgr.record_reconnect_attempt();
    }
    assert!(!mgr.should_reconnect());
}

#[test]
fn next_msg_id_monotonic() {
    let mut mgr = NetworkConnectionManager::new();
    let a = mgr.next_msg_id();
    let b = mgr.next_msg_id();
    let c = mgr.next_msg_id();
    assert!(b > a, "expected {} > {}", b, a);
    assert!(c > b, "expected {} > {}", c, b);
}

#[test]
fn metrics_default() {
    let mgr = NetworkConnectionManager::new();
    assert_eq!(mgr.metrics().connection_time_ms, 0);
    assert_eq!(mgr.metrics().attempt_count, 0);
}

#[test]
fn set_metrics_emits_transport_metrics_and_transitions() {
    let mut mgr = NetworkConnectionManager::new();
    let mut metrics = TransportMetrics::new();
    metrics.emit_event(
        TransportMetricEventKind::TransportAttempt,
        TransportType::QuicMasque,
        None,
        None,
        10,
    );
    metrics.emit_event(
        TransportMetricEventKind::FallbackTriggered,
        TransportType::QuicMasque,
        Some(TransportType::TcpStealth),
        Some("udp_unavailable".to_string()),
        900,
    );
    metrics.emit_event(
        TransportMetricEventKind::TransportSuccess,
        TransportType::TcpStealth,
        None,
        None,
        1600,
    );

    mgr.set_metrics(metrics);

    assert_eq!(
        mgr.transport_lifecycle_state(),
        TransportLifecycleState::Connected
    );

    let events = mgr.take_events();
    assert!(events
        .iter()
        .any(|event| event["type"] == "network:transport_metric"));
    assert!(events
        .iter()
        .any(|event| event["type"] == "network:transport_state"));
}
