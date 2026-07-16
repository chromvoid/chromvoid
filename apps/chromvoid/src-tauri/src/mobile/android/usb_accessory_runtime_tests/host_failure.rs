use super::support::*;
use super::*;

#[tokio::test]
async fn host_starter_can_return_explicit_stop_reason() {
    let starter = host_starter_with_reason(|_start| async {
        Ok(AndroidMobileUsbHostStopReason::TransportClosed)
    });
    let (_client, host) = tokio::io::duplex(4096);
    let start = AndroidMobileUsbHostStart {
        session_id: "session-reason".to_string(),
        identity: parse_identity(IDENTITY_JSON).expect("identity"),
        transport: Box::new(MobileUsbRemoteTransport::new(
            host,
            MobileUsbBridgeKind::AndroidAoa,
        )),
        shutdown: oneshot::channel().1,
    };

    let reason = run_host_start(starter, start, "session-reason").await;

    assert_eq!(reason, AndroidMobileUsbHostStopReason::TransportClosed);
}

#[tokio::test]
async fn host_starter_unknown_peer_error_is_pairing_complete() {
    let starter = host_starter_with_reason(|_start| async {
        Err(AndroidMobileUsbHostFailure::PairingComplete)
    });
    let (_client, host) = tokio::io::duplex(4096);
    let start = AndroidMobileUsbHostStart {
        session_id: "session-pairing".to_string(),
        identity: parse_identity(IDENTITY_JSON).expect("identity"),
        transport: Box::new(MobileUsbRemoteTransport::new(
            host,
            MobileUsbBridgeKind::AndroidAoa,
        )),
        shutdown: oneshot::channel().1,
    };

    let reason = run_host_start(starter, start, "session-pairing").await;

    assert_eq!(reason, AndroidMobileUsbHostStopReason::PairingComplete);
}

#[tokio::test]
async fn host_starter_transport_closed_error_is_recoverable() {
    let starter = host_starter_with_reason(|_start| async {
        Err(AndroidMobileUsbHostFailure::TransportClosed)
    });
    let (_client, host) = tokio::io::duplex(4096);
    let start = AndroidMobileUsbHostStart {
        session_id: "session-closed".to_string(),
        identity: parse_identity(IDENTITY_JSON).expect("identity"),
        transport: Box::new(MobileUsbRemoteTransport::new(
            host,
            MobileUsbBridgeKind::AndroidAoa,
        )),
        shutdown: oneshot::channel().1,
    };

    let reason = run_host_start(starter, start, "session-closed").await;

    assert_eq!(reason, AndroidMobileUsbHostStopReason::TransportClosed);
}

#[tokio::test]
async fn host_starter_timeout_error_is_recoverable() {
    let starter = host_starter_with_reason(|_start| async {
        Err(AndroidMobileUsbHostFailure::TransportClosed)
    });
    let (_client, host) = tokio::io::duplex(4096);
    let start = AndroidMobileUsbHostStart {
        session_id: "session-timeout".to_string(),
        identity: parse_identity(IDENTITY_JSON).expect("identity"),
        transport: Box::new(MobileUsbRemoteTransport::new(
            host,
            MobileUsbBridgeKind::AndroidAoa,
        )),
        shutdown: oneshot::channel().1,
    };

    let reason = run_host_start(starter, start, "session-timeout").await;

    assert_eq!(reason, AndroidMobileUsbHostStopReason::TransportClosed);
}

#[tokio::test]
async fn host_starter_stream_read_timeout_is_not_recoverable_transport_close() {
    // Stream timeout arrives as a terminal stop reason from the direct-transport
    // contract (SPEC-006 FR-022), not as a starter failure.
    let starter = host_starter_with_reason(|_start| async {
        Ok(AndroidMobileUsbHostStopReason::StreamTimeout)
    });
    let (_client, host) = tokio::io::duplex(4096);
    let start = AndroidMobileUsbHostStart {
        session_id: "session-stream-timeout".to_string(),
        identity: parse_identity(IDENTITY_JSON).expect("identity"),
        transport: Box::new(MobileUsbRemoteTransport::new(
            host,
            MobileUsbBridgeKind::AndroidAoa,
        )),
        shutdown: oneshot::channel().1,
    };

    let reason = run_host_start(starter, start, "session-stream-timeout").await;

    assert_eq!(reason, AndroidMobileUsbHostStopReason::StreamTimeout);
}

#[test]
fn android_host_failure_maps_typed_direct_accept_failures() {
    assert_eq!(
        AndroidMobileUsbHostFailure::from_direct_accept_failure(
            crate::network::mobile_acceptor::DirectTransportAcceptFailure::from_transport_error(
                "noise msg1 recv",
                chromvoid_protocol::TransportError::Closed,
            ),
        ),
        AndroidMobileUsbHostFailure::TransportClosed
    );
    assert_eq!(
        AndroidMobileUsbHostFailure::from_direct_accept_failure(
            crate::network::mobile_acceptor::DirectTransportAcceptFailure::from_transport_error(
                "noise msg1 recv",
                chromvoid_protocol::TransportError::Timeout,
            ),
        ),
        AndroidMobileUsbHostFailure::TransportClosed
    );
    assert_eq!(
        AndroidMobileUsbHostFailure::from_direct_accept_failure(
            crate::network::mobile_acceptor::DirectTransportAcceptFailure::PairingComplete {
                peer_pubkey_hex: "abcd1234".to_string(),
            },
        ),
        AndroidMobileUsbHostFailure::PairingComplete
    );
    assert_eq!(
        AndroidMobileUsbHostFailure::from_direct_accept_failure(
            crate::network::mobile_acceptor::DirectTransportAcceptFailure::DataPlaneError {
                message: "paired store failed".to_string(),
            },
        ),
        AndroidMobileUsbHostFailure::DataPlaneError("paired store failed".to_string())
    );
    assert_eq!(
        AndroidMobileUsbHostFailure::from_direct_accept_failure(
            crate::network::mobile_acceptor::DirectTransportAcceptFailure::ProtocolError {
                message: "IK msg1 read failed".to_string(),
            },
        ),
        AndroidMobileUsbHostFailure::Error("IK msg1 read failed".to_string())
    );
}

#[test]
fn local_stop_reasons_map_to_semantic_direct_transport_reasons() {
    assert_eq!(
        AndroidMobileUsbHostStopReason::VaultLocked.as_local_direct_transport_stop_reason(),
        crate::network::mobile_acceptor::DirectTransportStopReason::VaultLocked,
    );
    assert_eq!(
        AndroidMobileUsbHostStopReason::AccessoryDetached.as_local_direct_transport_stop_reason(),
        crate::network::mobile_acceptor::DirectTransportStopReason::AccessoryDetached,
    );
    assert_eq!(
        AndroidMobileUsbHostStopReason::ExplicitDisconnect.as_local_direct_transport_stop_reason(),
        crate::network::mobile_acceptor::DirectTransportStopReason::ExplicitDisconnect,
    );
    assert_eq!(
        AndroidMobileUsbHostStopReason::SessionReplaced.as_local_direct_transport_stop_reason(),
        crate::network::mobile_acceptor::DirectTransportStopReason::SessionReplaced,
    );
    assert_eq!(
        AndroidMobileUsbHostStopReason::LocalError.as_local_direct_transport_stop_reason(),
        crate::network::mobile_acceptor::DirectTransportStopReason::LocalError,
    );
}
