use super::*;

#[test]
fn transport_type_display() {
    assert_eq!(TransportType::QuicMasque.to_string(), "QUIC MASQUE");
    assert_eq!(
        TransportType::WebRtcDataChannel.to_string(),
        "WebRTC DataChannel"
    );
    assert_eq!(TransportType::WssRelay.to_string(), "WSS Relay");
    assert_eq!(TransportType::TcpStealth.to_string(), "TCP Stealth");
}

#[test]
fn transport_type_serde_roundtrip() {
    let types = [
        TransportType::QuicMasque,
        TransportType::WebRtcDataChannel,
        TransportType::WssRelay,
        TransportType::TcpStealth,
    ];
    for tt in types {
        let json = serde_json::to_string(&tt).unwrap();
        let back: TransportType = serde_json::from_str(&json).unwrap();
        assert_eq!(tt, back);
    }
}

#[test]
fn transport_type_serializes_snake_case() {
    assert_eq!(
        serde_json::to_string(&TransportType::QuicMasque).unwrap(),
        "\"quic_masque\""
    );
    assert_eq!(
        serde_json::to_string(&TransportType::WebRtcDataChannel).unwrap(),
        "\"web_rtc_data_channel\""
    );
    assert_eq!(
        serde_json::to_string(&TransportType::WssRelay).unwrap(),
        "\"wss_relay\""
    );
    assert_eq!(
        serde_json::to_string(&TransportType::TcpStealth).unwrap(),
        "\"tcp_stealth\""
    );
}

#[test]
fn transport_error_display() {
    assert_eq!(TransportError::Closed.to_string(), "transport closed");
    assert_eq!(TransportError::Timeout.to_string(), "transport timeout");
    assert_eq!(
        TransportError::Io("connect refused".into()).to_string(),
        "transport I/O error: connect refused"
    );
}
