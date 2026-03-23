use super::*;

#[test]
fn fallback_chain_is_deterministic() {
    let no_cache_chain = attempt_chain_for_context(&None, &NetworkContext::default());
    assert_eq!(
        no_cache_chain,
        vec![
            TransportType::WebRtcDataChannel,
            TransportType::WssRelay,
            TransportType::QuicMasque,
            TransportType::TcpStealth,
        ]
    );
}

#[test]
fn cached_transport_reorders_first_attempt() {
    let dir = tempfile::tempdir().expect("tempdir");
    let cache_path = dir.path().join("network_transport_cache.json");
    let context = NetworkContext {
        ssid: Some("office-wifi".to_string()),
        cellular_carrier: None,
    };

    {
        let mut cache = LastKnownGoodTransportCache::load(&cache_path);
        cache.set(&context, TransportType::TcpStealth);
        cache.save().expect("save cache");
    }

    let loaded = LastKnownGoodTransportCache::load(&cache_path);
    assert_eq!(loaded.get(&context), Some(TransportType::TcpStealth));

    let chain = attempt_chain_for_context(&Some(loaded), &context);
    assert_eq!(
        chain,
        vec![
            TransportType::TcpStealth,
            TransportType::WebRtcDataChannel,
            TransportType::WssRelay,
            TransportType::QuicMasque,
        ]
    );
}

#[test]
fn p95_fallback_transition_stays_under_budget_in_harness() {
    let mut metrics = TransportMetrics::new();
    metrics.record_fallback_transition(900);
    metrics.record_fallback_transition(1200);
    metrics.record_fallback_transition(1800);
    metrics.record_fallback_transition(2300);
    metrics.record_fallback_transition(4100);

    assert_eq!(metrics.fallback_transition_p95_ms, Some(2300));
    assert!(metrics.fallback_transition_p95_ms.unwrap() <= 5000);
}

#[test]
fn network_context_key_normalizes_empty_values() {
    let context = NetworkContext {
        ssid: Some(" ".to_string()),
        cellular_carrier: Some("carrier-x".to_string()),
    };

    assert_eq!(context.key(), "ssid=none|carrier=carrier-x");
}

#[test]
fn udp_unavailable_error_sets_fast_fallback_path() {
    let mut metrics = TransportMetrics::new();
    metrics.quic_attempted = true;
    let err = "udp_unavailable:quic connect timeout";

    if is_udp_unavailable_error(err) {
        metrics.quic_udp_blocked = true;
    }

    assert!(metrics.quic_attempted);
    assert!(metrics.quic_udp_blocked);
}

#[test]
fn cached_webrtc_reorders_first_attempt() {
    let dir = tempfile::tempdir().expect("tempdir");
    let cache_path = dir.path().join("network_transport_cache.json");
    let context = NetworkContext {
        ssid: Some("home-wifi".to_string()),
        cellular_carrier: None,
    };

    {
        let mut cache = LastKnownGoodTransportCache::load(&cache_path);
        cache.set(&context, TransportType::WebRtcDataChannel);
        cache.save().expect("save cache");
    }

    let loaded = LastKnownGoodTransportCache::load(&cache_path);
    assert_eq!(loaded.get(&context), Some(TransportType::WebRtcDataChannel));

    let chain = attempt_chain_for_context(&Some(loaded), &context);
    // WebRtcDataChannel is already first, so order stays the same
    assert_eq!(
        chain,
        vec![
            TransportType::WebRtcDataChannel,
            TransportType::WssRelay,
            TransportType::QuicMasque,
            TransportType::TcpStealth,
        ]
    );
}

#[test]
fn cached_wss_relay_reorders_first_attempt() {
    let dir = tempfile::tempdir().expect("tempdir");
    let cache_path = dir.path().join("network_transport_cache.json");
    let context = NetworkContext {
        ssid: Some("cafe-wifi".to_string()),
        cellular_carrier: None,
    };

    {
        let mut cache = LastKnownGoodTransportCache::load(&cache_path);
        cache.set(&context, TransportType::WssRelay);
        cache.save().expect("save cache");
    }

    let loaded = LastKnownGoodTransportCache::load(&cache_path);
    assert_eq!(loaded.get(&context), Some(TransportType::WssRelay));

    let chain = attempt_chain_for_context(&Some(loaded), &context);
    assert_eq!(
        chain,
        vec![
            TransportType::WssRelay,
            TransportType::WebRtcDataChannel,
            TransportType::QuicMasque,
            TransportType::TcpStealth,
        ]
    );
}

#[test]
fn cached_quic_masque_reorders_first_attempt() {
    let dir = tempfile::tempdir().expect("tempdir");
    let cache_path = dir.path().join("network_transport_cache.json");
    let context = NetworkContext {
        ssid: Some("corp-wifi".to_string()),
        cellular_carrier: None,
    };

    {
        let mut cache = LastKnownGoodTransportCache::load(&cache_path);
        cache.set(&context, TransportType::QuicMasque);
        cache.save().expect("save cache");
    }

    let loaded = LastKnownGoodTransportCache::load(&cache_path);
    assert_eq!(loaded.get(&context), Some(TransportType::QuicMasque));

    let chain = attempt_chain_for_context(&Some(loaded), &context);
    assert_eq!(
        chain,
        vec![
            TransportType::QuicMasque,
            TransportType::WebRtcDataChannel,
            TransportType::WssRelay,
            TransportType::TcpStealth,
        ]
    );
}
