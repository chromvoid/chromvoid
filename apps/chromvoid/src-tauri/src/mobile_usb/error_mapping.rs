#[cfg(desktop)]
use super::types::RemoteIoStopReason as MobileUsbRemoteIoStopReason;
use super::types::{MobileUsbError, MobileUsbErrorCode};
#[cfg(desktop)]
use super::types::{MobileUsbSessionEvent, SessionId};
use crate::remote_data_plane::{RemoteHandshakeError, RemoteHandshakeFailureKind};

pub(crate) fn mobile_usb_xx_handshake_error(error: &RemoteHandshakeError) -> MobileUsbError {
    let code = if error.kind() == RemoteHandshakeFailureKind::TransportClosed {
        MobileUsbErrorCode::CableDisconnected
    } else {
        MobileUsbErrorCode::HandshakeFailed
    };
    MobileUsbError::new(code, format!("mobile USB XX handshake failed: {error}"))
}

pub(crate) fn mobile_usb_pairing_confirmation_error(error: String) -> MobileUsbError {
    MobileUsbError::new(
        MobileUsbErrorCode::PairCommitFailed,
        format!("mobile USB pairing confirmation failed: {error}"),
    )
}

pub(crate) fn mobile_usb_ik_handshake_error(error: RemoteHandshakeError) -> MobileUsbError {
    let code = if is_ik_send_closed_error(&error) {
        MobileUsbErrorCode::CableDisconnected
    } else if is_ik_first_write_transport_error(&error) {
        MobileUsbErrorCode::HandshakeFailed
    } else if error.kind() == RemoteHandshakeFailureKind::RecordLayerInvalidLength {
        // A framing desync is not cryptographic evidence of a stale pairing
        // (FR-025); advising remove-and-repair for it would be destructive.
        MobileUsbErrorCode::RecordLayerFailed
    } else {
        MobileUsbErrorCode::StalePairing
    };
    MobileUsbError::new(code, format!("mobile USB IK handshake failed: {error}"))
        .with_handshake_failure(error)
}

pub(crate) fn is_retryable_xx_first_write_error(error: &RemoteHandshakeError) -> bool {
    is_first_write_transport_error(error, "xx msg1 send")
}

pub(crate) fn is_retryable_xx_msg2_stale_stream_error(error: &RemoteHandshakeError) -> bool {
    error.stage() == "xx msg2 read"
        && error.kind() == RemoteHandshakeFailureKind::NoiseInputOrDecrypt
}

pub(crate) fn is_retryable_ik_handshake_error(error: &MobileUsbError) -> bool {
    (error.code == MobileUsbErrorCode::HandshakeFailed
        && (error.handshake_failure_stage.is_none()
            || matches_handshake_failure(error, "ik msg1 send", first_write_transport_kinds)))
        || (error.code == MobileUsbErrorCode::RecordLayerFailed
            && matches_handshake_failure(error, "ik msg2 recv", record_layer_invalid_length_kind))
        || (error.code == MobileUsbErrorCode::StalePairing
            && matches_handshake_failure(error, "ik msg2 read", noise_input_or_decrypt_kind))
}

#[cfg(all(test, desktop))]
mod tests {
    use super::*;

    #[test]
    fn typed_remote_runtime_transport_closed_maps_to_cable_disconnected() {
        let session_id = "session-1".to_string();
        let event = crate::remote_io_runtime::RemoteIoRuntimeEvent::Disconnected {
            reason: "transport closed".to_string(),
            failure: crate::remote_data_plane::RemoteIoFailure::TransportClosed,
        };

        assert_eq!(
            mobile_usb_session_event_from_remote_runtime_event(&session_id, event),
            MobileUsbSessionEvent::CableDisconnected { session_id },
        );
    }

    #[test]
    fn authenticated_host_lock_maps_to_terminal_host_lock_event() {
        let session_id = "session-1".to_string();

        assert_eq!(
            mobile_usb_session_event_from_remote_runtime_event(
                &session_id,
                crate::remote_io_runtime::RemoteIoRuntimeEvent::HostLocked,
            ),
            MobileUsbSessionEvent::HostLocked { session_id },
        );
    }

    #[test]
    fn authenticated_session_approval_expiry_maps_to_terminal_event() {
        let session_id = "session-1".to_string();

        assert_eq!(
            mobile_usb_session_event_from_remote_runtime_event(
                &session_id,
                crate::remote_io_runtime::RemoteIoRuntimeEvent::SessionApprovalExpired,
            ),
            MobileUsbSessionEvent::SessionApprovalExpired { session_id },
        );
    }

    #[test]
    fn typed_remote_runtime_stream_timeout_maps_to_liveness_stop() {
        let session_id = "session-1".to_string();
        let event = crate::remote_io_runtime::RemoteIoRuntimeEvent::Disconnected {
            reason: "stream_read_timeout command=catalog:downloadRange".to_string(),
            failure: crate::remote_data_plane::RemoteIoFailure::StreamTimeout {
                command: Some("catalog:downloadRange".to_string()),
                message_id: Some(11),
                timeout_ms: Some(500),
            },
        };

        assert_eq!(
            mobile_usb_session_event_from_remote_runtime_event(&session_id, event),
            MobileUsbSessionEvent::RemoteIoStopped {
                session_id,
                reason: MobileUsbRemoteIoStopReason::Liveness(
                    "stream_read_timeout command=catalog:downloadRange".to_string(),
                ),
            },
        );
    }

    #[test]
    fn typed_remote_runtime_record_desync_maps_to_protocol_stop() {
        let session_id = "session-1".to_string();
        let event = crate::remote_io_runtime::RemoteIoRuntimeEvent::Disconnected {
            reason: "record layer invalid length".to_string(),
            failure: crate::remote_data_plane::RemoteIoFailure::RecordLayerInvalidLength {
                message: "record layer invalid length".to_string(),
            },
        };

        assert_eq!(
            mobile_usb_session_event_from_remote_runtime_event(&session_id, event),
            MobileUsbSessionEvent::RemoteIoStopped {
                session_id,
                reason: MobileUsbRemoteIoStopReason::Protocol(
                    "record layer invalid length".to_string(),
                ),
            },
        );
    }

    #[test]
    fn ik_record_desync_is_record_layer_failure_not_stale_pairing() {
        let error = RemoteHandshakeError::for_test(
            "ik msg2 recv",
            RemoteHandshakeFailureKind::RecordLayerInvalidLength,
            "ik msg2 recv: invalid record length",
        );

        let mapped = mobile_usb_ik_handshake_error(error);
        assert_eq!(mapped.code, MobileUsbErrorCode::RecordLayerFailed);
        assert!(is_retryable_ik_handshake_error(&mapped));
    }

    #[test]
    fn xx_handshake_transport_closed_maps_to_cable_disconnected() {
        let error = RemoteHandshakeError::for_test(
            "xx msg1 send",
            RemoteHandshakeFailureKind::TransportClosed,
            "xx msg1 send: transport closed",
        );

        assert_eq!(
            mobile_usb_xx_handshake_error(&error).code,
            MobileUsbErrorCode::CableDisconnected,
        );
    }

    #[test]
    fn early_msg2_input_or_decrypt_errors_are_retryable_before_data_plane() {
        let xx_input = RemoteHandshakeError::for_test(
            "xx msg2 read",
            RemoteHandshakeFailureKind::NoiseInputOrDecrypt,
            "xx msg2 read: input error",
        );
        let ik_decrypt = RemoteHandshakeError::for_test(
            "ik msg2 read",
            RemoteHandshakeFailureKind::NoiseInputOrDecrypt,
            "ik msg2 read: decrypt error",
        );
        let ik_input = RemoteHandshakeError::for_test(
            "ik msg2 read",
            RemoteHandshakeFailureKind::NoiseInputOrDecrypt,
            "ik msg2 read: input error",
        );
        let data_plane_decrypt = RemoteHandshakeError::for_test(
            "data plane recv decrypted frame",
            RemoteHandshakeFailureKind::NoiseInputOrDecrypt,
            "data plane recv decrypted frame: decrypt error",
        );

        assert!(is_retryable_xx_msg2_stale_stream_error(&xx_input));
        assert!(is_retryable_ik_handshake_error(
            &MobileUsbError::new(
                MobileUsbErrorCode::StalePairing,
                "mobile USB IK handshake failed: ik msg2 read: decrypt error",
            )
            .with_handshake_failure(ik_decrypt)
        ));
        assert!(is_retryable_ik_handshake_error(
            &MobileUsbError::new(
                MobileUsbErrorCode::StalePairing,
                "mobile USB IK handshake failed: ik msg2 read: input error",
            )
            .with_handshake_failure(ik_input)
        ));
        assert!(!is_retryable_xx_msg2_stale_stream_error(
            &data_plane_decrypt
        ));
        assert!(!is_retryable_ik_handshake_error(
            &MobileUsbError::new(
                MobileUsbErrorCode::StalePairing,
                "mobile USB IK data plane failed: decrypt error",
            )
            .with_handshake_failure(data_plane_decrypt)
        ));
    }
}

fn is_ik_send_closed_error(error: &RemoteHandshakeError) -> bool {
    error.stage() == "ik msg1 send" && error.kind() == RemoteHandshakeFailureKind::TransportClosed
}

fn is_ik_first_write_transport_error(error: &RemoteHandshakeError) -> bool {
    is_first_write_transport_error(error, "ik msg1 send")
}

fn is_first_write_transport_error(error: &RemoteHandshakeError, stage: &'static str) -> bool {
    error.stage() == stage && first_write_transport_kinds(error.kind())
}

fn matches_handshake_failure(
    error: &MobileUsbError,
    stage: &'static str,
    kind_matches: fn(RemoteHandshakeFailureKind) -> bool,
) -> bool {
    error.handshake_failure_stage == Some(stage)
        && error.handshake_failure_kind.is_some_and(kind_matches)
}

fn first_write_transport_kinds(kind: RemoteHandshakeFailureKind) -> bool {
    matches!(
        kind,
        RemoteHandshakeFailureKind::TransportTimeout | RemoteHandshakeFailureKind::TransportIo
    )
}

fn record_layer_invalid_length_kind(kind: RemoteHandshakeFailureKind) -> bool {
    kind == RemoteHandshakeFailureKind::RecordLayerInvalidLength
}

fn noise_input_or_decrypt_kind(kind: RemoteHandshakeFailureKind) -> bool {
    kind == RemoteHandshakeFailureKind::NoiseInputOrDecrypt
}

#[cfg(desktop)]
pub(crate) fn mobile_usb_session_event_from_remote_runtime_event(
    session_id: &SessionId,
    event: crate::remote_io_runtime::RemoteIoRuntimeEvent,
) -> MobileUsbSessionEvent {
    match event {
        crate::remote_io_runtime::RemoteIoRuntimeEvent::HostUnlockConfirmed => {
            MobileUsbSessionEvent::HostUnlockConfirmed {
                session_id: session_id.clone(),
            }
        }
        crate::remote_io_runtime::RemoteIoRuntimeEvent::HostLocked => {
            MobileUsbSessionEvent::HostLocked {
                session_id: session_id.clone(),
            }
        }
        crate::remote_io_runtime::RemoteIoRuntimeEvent::SessionApprovalExpired => {
            MobileUsbSessionEvent::SessionApprovalExpired {
                session_id: session_id.clone(),
            }
        }
        crate::remote_io_runtime::RemoteIoRuntimeEvent::Disconnected { failure, .. }
            if failure.is_transport_closed() =>
        {
            MobileUsbSessionEvent::CableDisconnected {
                session_id: session_id.clone(),
            }
        }
        crate::remote_io_runtime::RemoteIoRuntimeEvent::Disconnected { reason, failure } => {
            // Preserve the typed failure class so downstream state handling can
            // surface the spec 5.4 code for what actually happened instead of
            // guessing from a reason string.
            let reason = match &failure {
                crate::remote_data_plane::RemoteIoFailure::TransportTimeout
                | crate::remote_data_plane::RemoteIoFailure::StreamTimeout { .. } => {
                    MobileUsbRemoteIoStopReason::Liveness(reason)
                }
                crate::remote_data_plane::RemoteIoFailure::RecordLayerInvalidLength { .. }
                | crate::remote_data_plane::RemoteIoFailure::DecryptFailure { .. }
                | crate::remote_data_plane::RemoteIoFailure::ProtocolError { .. } => {
                    MobileUsbRemoteIoStopReason::Protocol(reason)
                }
                _ => MobileUsbRemoteIoStopReason::Error(reason),
            };
            MobileUsbSessionEvent::RemoteIoStopped {
                session_id: session_id.clone(),
                reason,
            }
        }
    }
}
