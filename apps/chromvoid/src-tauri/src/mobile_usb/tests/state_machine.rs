use super::support::*;
use super::*;

#[test]
fn mobile_usb_state_machine_rejects_concurrent_operations() {
    let mut state = MobileUsbStateMachine::new();

    state
        .begin_operation(MobileUsbOperationKind::Scan)
        .expect("start scan");

    let error = state
        .begin_operation(MobileUsbOperationKind::Connect)
        .expect_err("busy operation should fail");

    assert_eq!(error.code, MobileUsbErrorCode::Busy);
    assert_eq!(
        state.status(Vec::new()).in_flight,
        Some(MobileUsbOperationKind::Scan)
    );
}

#[test]
fn mobile_usb_state_machine_disconnect_is_idempotent() {
    let mut state = MobileUsbStateMachine::new();

    state.disconnect();
    let first = state.status(Vec::new());
    state.disconnect();
    let second = state.status(Vec::new());

    assert_eq!(first, second);
    assert!(!second.fallback_allowed);
}

#[test]
fn mobile_usb_state_machine_disconnect_cancels_operation_without_freeing_slot_until_completion() {
    let mut state = MobileUsbStateMachine::new();
    let token = state
        .begin_operation(MobileUsbOperationKind::Connect)
        .expect("start connect");

    state.disconnect();
    let disconnected = state.status(Vec::new());

    assert_eq!(
        disconnected.session_state,
        MobileUsbSessionState::Disconnected
    );
    assert_eq!(disconnected.in_flight, None);
    assert!(!state.is_current_operation(token));
    let error = state
        .begin_operation(MobileUsbOperationKind::Connect)
        .expect_err("cancelled operation still owns the physical slot");
    assert_eq!(error.code, MobileUsbErrorCode::Busy);

    state.fail_operation(token, MobileUsbErrorCode::InvalidState);

    state
        .begin_operation(MobileUsbOperationKind::Connect)
        .expect("slot released after cancelled operation unwinds");
}

#[test]
fn mobile_usb_selected_transport_exists_only_after_session_established() {
    let mut state = MobileUsbStateMachine::new();

    assert_eq!(
        state.status(Vec::new()).available_transports,
        vec![TransportType::UsbMobile]
    );
    assert_eq!(state.status(Vec::new()).selected_transport, None);

    state
        .establish_session(
            MobileUsbOperationToken {
                kind: MobileUsbOperationKind::Connect,
                generation: 0,
            },
            "session-1".to_string(),
            host_view("host-1", MobileUsbPairingState::Paired),
            false,
        )
        .expect_err("session cannot establish without current connect token");

    let token = state
        .begin_operation(MobileUsbOperationKind::Connect)
        .expect("start connect");
    state
        .establish_session(
            token,
            "session-1".to_string(),
            host_view("host-1", MobileUsbPairingState::Paired),
            false,
        )
        .expect("establish session");

    assert_eq!(
        state.status(Vec::new()).selected_transport,
        Some(TransportType::UsbMobile)
    );
}

#[test]
fn mobile_usb_state_machine_reuses_only_stable_active_host() {
    let mut state = MobileUsbStateMachine::new();

    assert!(!state.can_reuse_active_host(&"host-1".to_string()));

    let token = state
        .begin_operation(MobileUsbOperationKind::Connect)
        .expect("start connect");
    state
        .establish_session(
            token,
            "session-1".to_string(),
            host_view("host-1", MobileUsbPairingState::Paired),
            false,
        )
        .expect("establish session");

    assert!(state.can_reuse_active_host(&"host-1".to_string()));
    assert!(!state.can_reuse_active_host(&"host-2".to_string()));

    let error = state
        .begin_operation(MobileUsbOperationKind::Scan)
        .expect_err("scan is rejected while a session is active");
    assert_eq!(error.code, MobileUsbErrorCode::InvalidState);

    assert!(state.can_reuse_active_host(&"host-1".to_string()));
}

#[test]
fn mobile_usb_state_machine_rejects_session_stopped_before_establish() {
    let mut state = MobileUsbStateMachine::new();
    state
        .begin_operation(MobileUsbOperationKind::Connect)
        .expect("start connect");
    let token = MobileUsbOperationToken {
        kind: MobileUsbOperationKind::Connect,
        generation: 1,
    };

    assert!(!state.remote_io_stopped(
        &"session-race".to_string(),
        RemoteIoStopReason::Error("decrypt: decrypt error".to_string()),
    ));

    let error = state
        .establish_session(
            token,
            "session-race".to_string(),
            host_view("host-1", MobileUsbPairingState::Paired),
            false,
        )
        .expect_err("stopped session must not become active");
    let status = state.status(Vec::new());

    assert_eq!(error.code, MobileUsbErrorCode::RecordLayerFailed);
    assert_eq!(status.session_state, MobileUsbSessionState::Error);
    assert_eq!(status.selected_transport, None);
    assert!(status.active_host.is_none());
    assert!(!state.can_reuse_active_host(&"host-1".to_string()));
}

#[test]
fn mobile_usb_status_never_allows_network_fallback() {
    let mut state = MobileUsbStateMachine::new();

    assert!(!state.status(Vec::new()).fallback_allowed);
    state.fail(MobileUsbErrorCode::CableDisconnected);
    assert!(!state.status(Vec::new()).fallback_allowed);
}

#[test]
fn mobile_usb_writer_locked_degrades_to_read_only_without_session_teardown() {
    // Writer lock is the one error class that must never route through
    // `fail()`/`remote_io_stopped()`: the session keeps its transport and the
    // write path degrades by sync layer rules.
    assert_eq!(
        MobileUsbErrorCode::WriterLocked.recovery_action(),
        MobileUsbRecoveryAction::ContinueReadOnly
    );

    let mut state = MobileUsbStateMachine::new();
    let token = state
        .begin_operation(MobileUsbOperationKind::Connect)
        .expect("start connect");
    state
        .establish_session(
            token,
            "session-current".to_string(),
            host_view("host-1", MobileUsbPairingState::Paired),
            false,
        )
        .expect("establish session");
    state
        .confirm_host_unlock(&"session-current".to_string())
        .expect("host unlock");
    let status = state.status(Vec::new());

    assert_eq!(
        status.session_state,
        MobileUsbSessionState::RemoteDashboardOpen
    );
    assert_eq!(status.selected_transport, Some(TransportType::UsbMobile));
    assert!(!status.fallback_allowed);
}

#[test]
fn mobile_usb_error_transition_matrix_is_deterministic() {
    let cases = [
        (
            MobileUsbErrorCode::UnsupportedPlatform,
            MobileUsbRecoveryAction::HideUsbEntry,
        ),
        (
            MobileUsbErrorCode::BridgeUnavailable,
            MobileUsbRecoveryAction::ManualRetry,
        ),
        (
            MobileUsbErrorCode::NoAccessory,
            MobileUsbRecoveryAction::RetryScan,
        ),
        (
            MobileUsbErrorCode::PermissionDenied,
            MobileUsbRecoveryAction::RetryPermission,
        ),
        (
            MobileUsbErrorCode::AmbiguousDiscovery,
            MobileUsbRecoveryAction::ListPaired,
        ),
        (
            MobileUsbErrorCode::NotPaired,
            MobileUsbRecoveryAction::PairHost,
        ),
        (
            MobileUsbErrorCode::PairingDuplicate,
            MobileUsbRecoveryAction::ConnectExisting,
        ),
        (
            MobileUsbErrorCode::StalePairing,
            MobileUsbRecoveryAction::RemoveAndRepair,
        ),
        (
            MobileUsbErrorCode::SecretStoreUnavailable,
            MobileUsbRecoveryAction::ManualRetry,
        ),
        (
            MobileUsbErrorCode::SecretRefInvalid,
            MobileUsbRecoveryAction::RemoveAndRepair,
        ),
        (
            MobileUsbErrorCode::PairCommitFailed,
            MobileUsbRecoveryAction::ManualRetry,
        ),
        (
            MobileUsbErrorCode::PairingStoreCorrupt,
            MobileUsbRecoveryAction::ManualRetry,
        ),
        (
            MobileUsbErrorCode::PairingApprovalRequired,
            MobileUsbRecoveryAction::KeepCurrentFlow,
        ),
        (
            MobileUsbErrorCode::PairingApprovalRejected,
            MobileUsbRecoveryAction::ManualRetry,
        ),
        (
            MobileUsbErrorCode::PairingApprovalExpired,
            MobileUsbRecoveryAction::ManualRetry,
        ),
        (
            MobileUsbErrorCode::RecordLayerFailed,
            MobileUsbRecoveryAction::ManualRetry,
        ),
        (
            MobileUsbErrorCode::CableDisconnected,
            MobileUsbRecoveryAction::DisconnectBeforeRetry,
        ),
    ];

    for (code, recovery_action) in cases {
        let mut state = MobileUsbStateMachine::new();
        state.fail(code);
        let status = state.status(Vec::new());

        assert_eq!(status.session_state, MobileUsbSessionState::Error, "{code}");
        assert_eq!(status.selected_transport, None, "{code}");
        assert!(!status.fallback_allowed, "{code}");
        assert_eq!(status.error_code, Some(code), "{code}");
        assert_eq!(code.recovery_action(), recovery_action, "{code}");
    }

    let mut state = MobileUsbStateMachine::new();
    let token = state
        .begin_operation(MobileUsbOperationKind::Connect)
        .expect("start connect");
    state
        .establish_session(
            token,
            "session-current".to_string(),
            host_view("host-1", MobileUsbPairingState::Paired),
            false,
        )
        .expect("establish session");
    let locked = state.status(Vec::new());
    assert_eq!(
        locked.session_state,
        MobileUsbSessionState::TransportReadyHostLocked
    );
    assert_eq!(locked.selected_transport, Some(TransportType::UsbMobile));
    assert!(!locked.fallback_allowed);
    assert_eq!(
        MobileUsbErrorCode::HostLocked.recovery_action(),
        MobileUsbRecoveryAction::WaitForHostUnlock
    );

    let error = state
        .confirm_host_unlock(&"stale-session".to_string())
        .expect_err("stale unlock must be rejected");
    let after_stale_unlock = state.status(Vec::new());
    assert_eq!(error.code, MobileUsbErrorCode::UnlockNotAuthenticated);
    assert_eq!(
        MobileUsbErrorCode::UnlockNotAuthenticated.recovery_action(),
        MobileUsbRecoveryAction::IgnoreStaleUnlock
    );
    assert_eq!(
        after_stale_unlock.session_state,
        MobileUsbSessionState::TransportReadyHostLocked
    );
    assert_eq!(
        after_stale_unlock.selected_transport,
        Some(TransportType::UsbMobile)
    );
    assert!(!after_stale_unlock.fallback_allowed);
}
