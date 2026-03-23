use super::*;

#[test]
fn metrics_default() {
    let m = TransportMetrics::default();
    assert_eq!(m.transport_type, None);
    assert_eq!(m.connection_time_ms, 0);
    assert_eq!(m.failure_reason, None);
    assert_eq!(m.attempt_count, 0);
    assert!(!m.quic_attempted);
    assert!(!m.quic_udp_blocked);
    assert!(!m.webrtc_attempted);
    assert!(!m.wss_attempted);
    assert!(!m.tcp_stealth_attempted);
    assert_eq!(m.ice_candidates_gathered, 0);
    assert!(m.events.is_empty());
    assert!(m.fallback_transition_times_ms.is_empty());
    assert_eq!(m.fallback_transition_p95_ms, None);
}

#[test]
fn metrics_serde_roundtrip() {
    let m = TransportMetrics {
        transport_type: Some(TransportType::WebRtcDataChannel),
        connection_time_ms: 1500,
        failure_reason: None,
        attempt_count: 1,
        quic_attempted: true,
        quic_udp_blocked: false,
        webrtc_attempted: true,
        wss_attempted: false,
        tcp_stealth_attempted: true,
        ice_candidates_gathered: 4,
        events: vec![TransportMetricEvent {
            kind: TransportMetricEventKind::TransportAttempt,
            transport: TransportType::QuicMasque,
            next_transport: None,
            reason: None,
            elapsed_ms: 3,
        }],
        fallback_transition_times_ms: vec![1200],
        fallback_transition_p95_ms: Some(1200),
    };
    let json = serde_json::to_string(&m).unwrap();
    let back: TransportMetrics = serde_json::from_str(&json).unwrap();
    assert_eq!(back.transport_type, Some(TransportType::WebRtcDataChannel));
    assert_eq!(back.connection_time_ms, 1500);
    assert_eq!(back.attempt_count, 1);
    assert!(back.quic_attempted);
    assert!(!back.quic_udp_blocked);
    assert!(back.webrtc_attempted);
    assert!(!back.wss_attempted);
    assert!(back.tcp_stealth_attempted);
    assert_eq!(back.ice_candidates_gathered, 4);
    assert_eq!(back.events.len(), 1);
    assert_eq!(back.fallback_transition_times_ms, vec![1200]);
    assert_eq!(back.fallback_transition_p95_ms, Some(1200));
}

#[test]
fn metrics_with_failure() {
    let m = TransportMetrics {
        transport_type: None,
        connection_time_ms: 10000,
        failure_reason: Some("ICE failed".to_string()),
        attempt_count: 2,
        quic_attempted: true,
        quic_udp_blocked: true,
        webrtc_attempted: true,
        wss_attempted: true,
        tcp_stealth_attempted: true,
        ice_candidates_gathered: 0,
        events: vec![TransportMetricEvent {
            kind: TransportMetricEventKind::TransportFail,
            transport: TransportType::QuicMasque,
            next_transport: Some(TransportType::TcpStealth),
            reason: Some("udp_unavailable".to_string()),
            elapsed_ms: 800,
        }],
        fallback_transition_times_ms: vec![1500, 1100, 900],
        fallback_transition_p95_ms: Some(1100),
    };
    let json = serde_json::to_string(&m).unwrap();
    let back: TransportMetrics = serde_json::from_str(&json).unwrap();
    assert_eq!(back.failure_reason, Some("ICE failed".to_string()));
    assert_eq!(back.events.len(), 1);
    assert_eq!(back.fallback_transition_p95_ms, Some(1100));
}

#[test]
fn fallback_transition_p95_is_computed() {
    let mut m = TransportMetrics::new();
    m.record_fallback_transition(1200);
    m.record_fallback_transition(1800);
    m.record_fallback_transition(2600);
    m.record_fallback_transition(4900);

    assert_eq!(m.fallback_transition_p95_ms, Some(2600));
    assert!(m.fallback_transition_p95_ms.unwrap() <= 5000);
}
