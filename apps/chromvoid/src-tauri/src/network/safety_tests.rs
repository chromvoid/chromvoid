use super::*;

#[test]
fn default_status_uses_secure_dns_proxy_when_connected() {
    let status = SafetyStatus::new(true);
    assert_eq!(status.dns_routing, DnsRouting::SecureProxy);
    assert!(!status.egress_filter.block_direct_traffic);
}

#[test]
fn transport_drop_activates_fail_closed_filter_until_restored() {
    let mut status = SafetyStatus::new(true);
    status.on_transport_drop();

    assert!(status.kill_switch_active);
    assert_eq!(status.dns_routing, DnsRouting::Blocked);
    assert!(status.egress_filter.block_direct_traffic);

    status.on_safe_transport_restored();
    assert!(!status.kill_switch_active);
    assert_eq!(status.dns_routing, DnsRouting::SecureProxy);
    assert!(!status.egress_filter.block_direct_traffic);
}

#[test]
fn fallback_transition_blocks_direct_egress() {
    let mut status = SafetyStatus::new(true);
    status.begin_fallback_transition();

    assert!(status.fallback_in_progress);
    assert!(status.kill_switch_active);
    assert_eq!(status.dns_routing, DnsRouting::Blocked);
    assert!(status.egress_filter.block_direct_traffic);
}

#[test]
fn cleartext_dns_regression_detection_flags_udp_53_non_tunneled() {
    let events = vec![
        EgressEvent {
            protocol: EgressProtocol::Udp,
            destination_port: 53,
            tunneled: false,
            destination_ip: "8.8.8.8".to_string(),
        },
        EgressEvent {
            protocol: EgressProtocol::Tcp,
            destination_port: 443,
            tunneled: true,
            destination_ip: "10.0.0.2".to_string(),
        },
    ];
    assert!(detect_cleartext_dns_leak(&events));
}

#[test]
fn direct_egress_regression_detection_ignores_tunneled_and_loopback() {
    let safe_events = vec![
        EgressEvent {
            protocol: EgressProtocol::Udp,
            destination_port: 53,
            tunneled: true,
            destination_ip: "10.8.0.1".to_string(),
        },
        EgressEvent {
            protocol: EgressProtocol::Tcp,
            destination_port: 3000,
            tunneled: false,
            destination_ip: "127.0.0.1".to_string(),
        },
    ];
    assert!(!detect_cleartext_dns_leak(&safe_events));
    assert!(!detect_direct_egress_leak(&safe_events));
}
