use super::*;
use relay::{build_extended_connect_headers, ParsedRelay};

#[test]
fn parse_relay_supports_ws_and_wss() {
    let ws = ParsedRelay::parse("ws://127.0.0.1:7777").unwrap();
    assert_eq!(ws.scheme, "http");
    assert_eq!(ws.server_name, "127.0.0.1");
    assert_eq!(ws.port, 7777);

    let wss = ParsedRelay::parse("wss://relay.example.com").unwrap();
    assert_eq!(wss.scheme, "https");
    assert_eq!(wss.server_name, "relay.example.com");
    assert_eq!(wss.port, 443);
}

#[test]
fn extended_connect_preface_contains_masque_headers() {
    let relay = ParsedRelay::parse("wss://relay.example.com").unwrap();
    let preface = build_extended_connect_headers(&relay, "room-abc");

    assert!(preface.contains(":method CONNECT"));
    assert!(preface.contains(":protocol connect-udp"));
    assert!(preface.contains("capsule-protocol: ?1"));
    assert!(preface.contains("/.well-known/masque/udp/room-abc/443/"));
}

#[test]
fn udp_unavailable_error_marker_is_detected() {
    assert!(is_udp_unavailable_error(
        "udp_unavailable:quic connect timeout"
    ));
    assert!(!is_udp_unavailable_error("quic handshake failed"));
}
