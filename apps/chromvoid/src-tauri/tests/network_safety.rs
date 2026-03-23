use chromvoid_lib::network::{
    detect_cleartext_dns_leak, detect_direct_egress_leak, EgressEvent, EgressProtocol,
    NetworkConnectionManager,
};

#[test]
fn kill_switch_stays_active_after_drop_until_safe_transport_restored() {
    let mut manager = NetworkConnectionManager::new();
    manager.set_safety_fail_closed(true);
    manager.begin_fallback_transition();
    manager.handle_transport_drop();

    assert!(manager.safety().kill_switch_active);
    assert!(manager.safety().egress_filter.block_direct_traffic);

    manager.mark_transport_restored();
    assert!(!manager.safety().kill_switch_active);
    assert!(!manager.safety().egress_filter.block_direct_traffic);
}

#[test]
fn dns_and_egress_regression_checks_detect_only_real_leaks() {
    let leaking = vec![
        EgressEvent {
            protocol: EgressProtocol::Udp,
            destination_port: 53,
            tunneled: false,
            destination_ip: "1.1.1.1".to_string(),
        },
        EgressEvent {
            protocol: EgressProtocol::Tcp,
            destination_port: 443,
            tunneled: false,
            destination_ip: "104.16.0.1".to_string(),
        },
    ];

    assert!(detect_cleartext_dns_leak(&leaking));
    assert!(detect_direct_egress_leak(&leaking));

    let safe = vec![
        EgressEvent {
            protocol: EgressProtocol::Udp,
            destination_port: 53,
            tunneled: true,
            destination_ip: "10.8.0.2".to_string(),
        },
        EgressEvent {
            protocol: EgressProtocol::Tcp,
            destination_port: 443,
            tunneled: true,
            destination_ip: "10.8.0.3".to_string(),
        },
    ];

    assert!(!detect_cleartext_dns_leak(&safe));
    assert!(!detect_direct_egress_leak(&safe));
}
