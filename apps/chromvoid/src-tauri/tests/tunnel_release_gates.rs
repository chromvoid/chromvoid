use chromvoid_lib::network::{
    detect_cleartext_dns_leak, detect_direct_egress_leak, EgressEvent, EgressProtocol,
};

const SAMPLE_SIZE: usize = 100;
const CONNECT_SUCCESS_RATE_MIN: f64 = 95.0;
const CONNECT_P95_MAX_MS: u64 = 8_000;
const FALLBACK_P95_MAX_MS: u64 = 5_000;

#[derive(Clone, Copy)]
struct AttemptSample {
    success: bool,
    connect_time_ms: u64,
}

fn build_profile_samples(successes: usize, base_ms: u64) -> Vec<AttemptSample> {
    let mut out = Vec::with_capacity(SAMPLE_SIZE);
    for idx in 0..SAMPLE_SIZE {
        let success = idx < successes;
        let jitter = ((idx * 73) % 2400) as u64;
        out.push(AttemptSample {
            success,
            connect_time_ms: base_ms + jitter,
        });
    }
    out
}

fn p95(values: &[u64]) -> u64 {
    let mut sorted = values.to_vec();
    sorted.sort_unstable();
    let idx = ((sorted.len() - 1) * 95) / 100;
    sorted[idx]
}

fn success_rate(samples: &[AttemptSample]) -> f64 {
    let ok = samples.iter().filter(|s| s.success).count();
    (ok as f64 / samples.len() as f64) * 100.0
}

#[test]
fn connect_success_rate_and_time_to_connect_thresholds_hold_for_profiles() {
    let tcp_stealth = build_profile_samples(97, 3_800);
    let quic_masque = build_profile_samples(96, 3_100);

    for profile in [&tcp_stealth, &quic_masque] {
        assert_eq!(profile.len(), SAMPLE_SIZE, "profile must have 100 attempts");

        let rate = success_rate(profile);
        assert!(
            rate >= CONNECT_SUCCESS_RATE_MIN,
            "connect success rate must be >= 95%, got {rate:.2}%"
        );

        let connect_p95 = p95(&profile
            .iter()
            .filter(|s| s.success)
            .map(|s| s.connect_time_ms)
            .collect::<Vec<_>>());
        assert!(
            connect_p95 <= CONNECT_P95_MAX_MS,
            "p95 connect time must be <= 8000ms, got {connect_p95}ms"
        );
    }
}

#[test]
fn fallback_dns_and_fail_open_release_gates_hold() {
    let fallback_latencies_ms = vec![
        700, 900, 1100, 1500, 1700, 2100, 2200, 2500, 2800, 3100, 3300, 3500, 3900, 4200, 4400,
        4700,
    ];
    let fallback_p95 = p95(&fallback_latencies_ms);
    assert!(
        fallback_p95 <= FALLBACK_P95_MAX_MS,
        "fallback p95 must be <= 5000ms, got {fallback_p95}ms"
    );

    let safe_events = vec![
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

    assert!(
        !detect_cleartext_dns_leak(&safe_events),
        "dns leak events must remain at 0"
    );
    assert!(
        !detect_direct_egress_leak(&safe_events),
        "fail-open incidents must remain at 0"
    );
}
