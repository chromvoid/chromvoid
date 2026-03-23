use super::*;

#[test]
fn offer_serde_roundtrip() {
    let msg = SignalingMessage::Offer {
        sdp: "v=0\r\no=- ...".to_string(),
        id: "offer-123".to_string(),
    };
    let json = serde_json::to_string(&msg).unwrap();
    let back: SignalingMessage = serde_json::from_str(&json).unwrap();
    assert_eq!(msg, back);
}

#[test]
fn answer_serde_roundtrip() {
    let msg = SignalingMessage::Answer {
        sdp: "v=0\r\no=- answer...".to_string(),
        in_response_to: "offer-123".to_string(),
    };
    let json = serde_json::to_string(&msg).unwrap();
    let back: SignalingMessage = serde_json::from_str(&json).unwrap();
    assert_eq!(msg, back);
}

#[test]
fn candidate_serde_roundtrip() {
    let msg = SignalingMessage::Candidate {
        candidate: "candidate:0 1 UDP 2122252543 192.168.1.2 50000 typ host".to_string(),
        sdp_mid: Some("0".to_string()),
        sdp_m_line_index: Some(0),
    };
    let json = serde_json::to_string(&msg).unwrap();
    let back: SignalingMessage = serde_json::from_str(&json).unwrap();
    assert_eq!(msg, back);
}

#[test]
fn candidate_optional_fields() {
    let msg = SignalingMessage::Candidate {
        candidate: "candidate:0 1 UDP 2122252543 10.0.0.1 50000 typ host".to_string(),
        sdp_mid: None,
        sdp_m_line_index: None,
    };
    let json = serde_json::to_string(&msg).unwrap();
    assert!(json.contains("\"sdp_mid\":null"));
    let back: SignalingMessage = serde_json::from_str(&json).unwrap();
    assert_eq!(msg, back);
}

#[test]
fn error_serde_roundtrip() {
    let msg = SignalingMessage::Error {
        code: 4001,
        message: "room full".to_string(),
    };
    let json = serde_json::to_string(&msg).unwrap();
    let back: SignalingMessage = serde_json::from_str(&json).unwrap();
    assert_eq!(msg, back);
}

#[test]
fn all_variants_tagged() {
    let offer = serde_json::to_string(&SignalingMessage::Offer {
        sdp: "s".into(),
        id: "i".into(),
    })
    .unwrap();
    assert!(offer.contains("\"type\":\"offer\""));

    let answer = serde_json::to_string(&SignalingMessage::Answer {
        sdp: "s".into(),
        in_response_to: "i".into(),
    })
    .unwrap();
    assert!(answer.contains("\"type\":\"answer\""));

    let candidate = serde_json::to_string(&SignalingMessage::Candidate {
        candidate: "c".into(),
        sdp_mid: None,
        sdp_m_line_index: None,
    })
    .unwrap();
    assert!(candidate.contains("\"type\":\"candidate\""));

    let error = serde_json::to_string(&SignalingMessage::Error {
        code: 1,
        message: "e".into(),
    })
    .unwrap();
    assert!(error.contains("\"type\":\"error\""));
}

#[test]
fn timeout_constants() {
    assert_eq!(CONNECTION_TIMEOUT, Duration::from_secs(10));
    assert_eq!(OFFER_TIMEOUT, Duration::from_secs(30));
    assert_eq!(ICE_GATHERING_TIMEOUT, Duration::from_secs(5));
    assert_eq!(P2P_TIMEOUT, Duration::from_secs(15));
}
