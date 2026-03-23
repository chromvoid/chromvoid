use super::*;

#[test]
fn connection_state_default_is_disconnected() {
    assert_eq!(ConnectionState::default(), ConnectionState::Disconnected);
}

#[test]
fn connection_state_serializes_snake_case() {
    let cases = vec![
        (ConnectionState::Disconnected, "\"disconnected\""),
        (ConnectionState::Connecting, "\"connecting\""),
        (ConnectionState::Syncing, "\"syncing\""),
        (ConnectionState::Ready, "\"ready\""),
        (ConnectionState::Locked, "\"locked\""),
        (ConnectionState::Error, "\"error\""),
    ];
    for (variant, expected) in cases {
        let json = serde_json::to_string(&variant).unwrap();
        assert_eq!(json, expected, "serialization failed for {:?}", variant);
    }
}

#[test]
fn connection_state_deserializes_from_snake_case() {
    let cases = vec![
        ("\"disconnected\"", ConnectionState::Disconnected),
        ("\"connecting\"", ConnectionState::Connecting),
        ("\"syncing\"", ConnectionState::Syncing),
        ("\"ready\"", ConnectionState::Ready),
        ("\"locked\"", ConnectionState::Locked),
        ("\"error\"", ConnectionState::Error),
    ];
    for (json, expected) in cases {
        let parsed: ConnectionState = serde_json::from_str(json).unwrap();
        assert_eq!(parsed, expected, "deserialization failed for {}", json);
    }
}

#[test]
fn connection_state_round_trip() {
    let states = vec![
        ConnectionState::Disconnected,
        ConnectionState::Connecting,
        ConnectionState::Syncing,
        ConnectionState::Ready,
        ConnectionState::Locked,
        ConnectionState::Error,
    ];
    for state in states {
        let json = serde_json::to_string(&state).unwrap();
        let back: ConnectionState = serde_json::from_str(&json).unwrap();
        assert_eq!(state, back, "round-trip failed for {:?}", state);
    }
}

#[test]
fn connection_state_is_copy() {
    let state = ConnectionState::Ready;
    let copied = state;
    assert_eq!(state, copied);
}
