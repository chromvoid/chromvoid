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

#[cfg(desktop)]
#[test]
fn remote_media_cancel_try_send_requires_split_feature() {
    let (tx, mut rx) = tokio::sync::mpsc::channel(1);
    let client = RemoteJsonClientHandle::new(
        RemoteJsonSender::new(tx),
        std::sync::Arc::new(std::sync::Mutex::new(vec![])),
    );

    assert!(!client.try_send_cancel_media_inspection(7));
    assert!(rx.try_recv().is_err());
}

#[cfg(desktop)]
#[test]
fn remote_media_cancel_try_send_enqueues_high_priority_request() {
    let (tx, mut rx) = tokio::sync::mpsc::channel(1);
    let client = RemoteJsonClientHandle::new(
        RemoteJsonSender::new(tx),
        std::sync::Arc::new(std::sync::Mutex::new(vec![
            chromvoid_core::rpc::types::CORE_FEATURE_REMOTE_MEDIA_INSPECTION_SPLIT_V1.to_string(),
        ])),
    );

    assert!(client.try_send_cancel_media_inspection(42));
    let request = rx.try_recv().expect("cancel request should be queued");

    assert_eq!(request.request.command, "catalog:media:inspect:cancel");
    assert_eq!(
        request
            .request
            .data
            .get("epoch")
            .and_then(|value| value.as_u64()),
        Some(42)
    );
    assert_eq!(request.priority, RemoteRpcPriority::High);
    assert!(request.cancel_group.is_none());
}
