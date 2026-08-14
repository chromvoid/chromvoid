use std::sync::{Arc, Mutex};
use std::time::Instant;

use async_trait::async_trait;
use chromvoid_protocol::{RemoteTransport, TransportMetrics, TransportType};

use super::bridge::MobileUsbBridge;
use super::connect_attempt::{connect_handshake_retry_policy, pair_handshake_retry_policy};
use super::error_mapping::{
    is_retryable_ik_handshake_error, is_retryable_xx_first_write_error,
    is_retryable_xx_msg2_stale_stream_error, mobile_usb_ik_handshake_error,
    mobile_usb_pairing_confirmation_error, mobile_usb_xx_handshake_error,
};
#[cfg(test)]
use super::observability::MobileUsbMetricsSnapshot;
use super::observability::{
    bridge_kind_name, log_operation_finish, log_operation_start, log_state_transition,
    log_timeline_event, mobile_usb_operation_name, new_timeline_trace_id, redacted_identifier,
    MobileUsbObservability, MobileUsbTimelineEvent, TransportSessionContext,
    MOBILE_USB_TRANSPORT_FAMILY,
};
use super::pairing_coordinator::{
    desktop_usb_pairing_label, new_host_id, noise_static_keypair, now_secs,
};
use super::pairing_protocol::{
    hex_encode as mobile_usb_hex_encode, recv_pairing_hello as recv_mobile_usb_pairing_hello,
    send_pairing_hello as send_mobile_usb_pairing_hello, MobileUsbPairingHello,
};
use super::pairing_protocol::{
    pairing_approval_proof_hex, recv_pairing_approval_ack, recv_pairing_approval_challenge,
    send_pairing_approval_proof, MobileUsbPairingApprovalAction, MobileUsbPairingApprovalChallenge,
    MobileUsbPairingApprovalProof, USB_PAIRING_CANCEL_V1,
};
use super::pairing_store::{
    classify_scan_result, commit_pairing_with_secret, MobileUsbPairingStore,
};
use super::record_transport::MobileUsbRemoteTransport;
use super::secret_store::MobileUsbSecretStore;
use super::types::RemoteIoStopReason as MobileUsbRemoteIoStopReason;
use super::types::{
    HostId, MobileUsbDetectCandidate, MobileUsbDetectedDevice, MobileUsbDetectedPairedMatch,
    MobileUsbDetectedPairingState, MobileUsbError, MobileUsbErrorCode, MobileUsbHostView,
    MobileUsbOperationKind, MobileUsbOperationToken, MobileUsbPairConfirmRequest,
    MobileUsbPairRequest, MobileUsbPairedHostRecord, MobileUsbPairingApprovalView,
    MobileUsbPairingState, MobileUsbScanClassification, MobileUsbScannedHost,
    MobileUsbSessionEvent, MobileUsbSessionState, MobileUsbStateMachine, MobileUsbStatus,
    SessionId,
};

mod connect;
mod operation_lifecycle;
mod pairing;
mod status;

use status::active_host_id_from_status_result;

#[derive(Debug, Clone, PartialEq, Eq)]
pub struct MobileUsbSessionHandle {
    pub session_id: SessionId,
    pub host_unlocked: bool,
    pub transport_session_generation: u64,
}

pub struct MobileUsbStartSessionRequest {
    pub host: MobileUsbPairedHostRecord,
    pub config: crate::remote_data_plane::RemoteIoTaskConfig,
    pub metrics: TransportMetrics,
    pub timeline_trace_id: String,
}

#[async_trait]
pub trait MobileUsbSessionStarter: Send + Sync {
    async fn start_session(
        &self,
        request: MobileUsbStartSessionRequest,
    ) -> Result<MobileUsbSessionHandle, MobileUsbError>;

    async fn disconnect_user(&self) -> Result<(), MobileUsbError> {
        self.disconnect_terminal()
    }

    fn disconnect_terminal(&self) -> Result<(), MobileUsbError> {
        Ok(())
    }
}

pub struct MobileUsbController {
    bridge: Arc<dyn MobileUsbBridge>,
    store: Arc<dyn MobileUsbPairingStore>,
    secrets: Arc<dyn MobileUsbSecretStore>,
    session_starter: Arc<dyn MobileUsbSessionStarter>,
    state: Mutex<MobileUsbStateMachine>,
    pending_pairing: Mutex<Option<PendingMobileUsbPairingSession>>,
    observability: MobileUsbObservability,
}

struct PendingMobileUsbPairingSession {
    attempt_id: String,
    host_id: HostId,
    request: MobileUsbPairRequest,
    client_private_key: Vec<u8>,
    client_public_key: Vec<u8>,
    peer_pubkey: Vec<u8>,
    supports_graceful_cancel: bool,
    challenge: MobileUsbPairingApprovalChallenge,
    transport: Box<dyn RemoteTransport>,
    noise_transport: chromvoid_protocol::NoiseTransport,
    timeline_trace_id: String,
    transport_context: TransportSessionContext,
}

impl MobileUsbController {
    pub fn new(
        bridge: Arc<dyn MobileUsbBridge>,
        store: Arc<dyn MobileUsbPairingStore>,
        secrets: Arc<dyn MobileUsbSecretStore>,
        session_starter: Arc<dyn MobileUsbSessionStarter>,
    ) -> Self {
        Self {
            bridge,
            store,
            secrets,
            session_starter,
            state: Mutex::new(MobileUsbStateMachine::new()),
            pending_pairing: Mutex::new(None),
            observability: MobileUsbObservability::default(),
        }
    }

    pub async fn scan(&self) -> Result<Vec<MobileUsbScannedHost>, MobileUsbError> {
        let (token, started_at) = self.begin(MobileUsbOperationKind::Scan)?;
        let result = self.scan_inner().await;
        self.complete_or_fail(token, started_at, &result, None, None, None);
        result
    }

    /// Passive inventory preview. Read-only: takes no in-flight operation slot
    /// and drives no state-machine transition, so it can run on page mount and
    /// hotplug events without conflicting with scan/pair/connect.
    pub async fn detect(&self) -> Result<Vec<MobileUsbDetectedDevice>, MobileUsbError> {
        self.detect_inner().await
    }

    pub async fn pair(
        &self,
        request: MobileUsbPairRequest,
    ) -> Result<MobileUsbStatus, MobileUsbError> {
        let bridge_kind = Some(request.bridge_kind);
        let (token, started_at) = self.begin(MobileUsbOperationKind::Pair)?;
        let result = self.pair_inner(request, token).await;
        let host_id = active_host_id_from_status_result(&result);
        if result.is_err() {
            self.complete_or_fail(
                token,
                started_at,
                &result,
                host_id.as_ref(),
                None,
                bridge_kind,
            );
        } else {
            self.record_operation_result(
                mobile_usb_operation_name(token.kind),
                started_at,
                &result,
                host_id.as_ref(),
                None,
                bridge_kind,
            );
        }
        result
    }

    pub async fn confirm_pairing(
        &self,
        request: MobileUsbPairConfirmRequest,
    ) -> Result<MobileUsbStatus, MobileUsbError> {
        let (token, started_at) = self.begin(MobileUsbOperationKind::PairConfirm)?;
        let result = self.confirm_pairing_inner(request, token).await;
        let host_id = active_host_id_from_status_result(&result);
        self.complete_or_fail(token, started_at, &result, host_id.as_ref(), None, None);
        result
    }

    pub async fn connect(&self, host_id: HostId) -> Result<MobileUsbStatus, MobileUsbError> {
        let host_id_for_observability = host_id.clone();
        if self.with_state(|state| state.can_reuse_active_host(&host_id))? {
            let started_at = Instant::now();
            log_operation_start("connect", Some(&host_id), None, None);
            tracing::info!(
                transport_family = MOBILE_USB_TRANSPORT_FAMILY,
                selected_transport = "usb_mobile",
                fallback_allowed = false,
                host_id = %redacted_identifier(Some(&host_id)),
                "mobile_usb connect reused active session"
            );
            let result = self.status_inner();
            self.record_operation_result(
                "connect",
                started_at,
                &result,
                Some(&host_id),
                None,
                None,
            );
            return result;
        }

        let (token, started_at) = self.begin(MobileUsbOperationKind::Connect)?;
        let result = self.connect_inner(host_id, token).await;
        self.complete_or_fail(
            token,
            started_at,
            &result,
            Some(&host_id_for_observability),
            None,
            None,
        );
        result
    }

    pub async fn disconnect_user(&self) -> Result<MobileUsbStatus, MobileUsbError> {
        let started_at = Instant::now();
        let pending_pairing = self.take_pending_pairing();
        let result = self.prepare_disconnect_state();
        if let Some(pending) = pending_pairing {
            self.cancel_pending_pairing(pending).await;
        }
        if let Ok((state_from, state_to, had_active_session)) = result {
            if had_active_session {
                if let Err(error) = self.session_starter.disconnect_user().await {
                    tracing::warn!(
                        error = %error.message,
                        "mobile_usb disconnect failed to stop active remote data plane"
                    );
                }
            }
            self.record_state_transition(state_from, state_to, None, None, None);
        }
        let result = result.map(|_| ()).and_then(|_| self.status_inner());
        self.record_operation_result("disconnect", started_at, &result, None, None, None);
        result
    }

    pub fn disconnect_terminal(&self) -> Result<MobileUsbStatus, MobileUsbError> {
        let started_at = Instant::now();
        self.take_pending_pairing();
        let result = self.prepare_disconnect_state();
        if let Ok((state_from, state_to, had_active_session)) = result {
            if had_active_session {
                if let Err(error) = self.session_starter.disconnect_terminal() {
                    tracing::warn!(
                        error = %error.message,
                        "mobile_usb terminal disconnect failed to stop active remote data plane"
                    );
                }
            }
            self.record_state_transition(state_from, state_to, None, None, None);
        }
        let result = result.map(|_| ()).and_then(|_| self.status_inner());
        self.record_operation_result("disconnect_terminal", started_at, &result, None, None, None);
        result
    }

    fn prepare_disconnect_state(
        &self,
    ) -> Result<(MobileUsbSessionState, MobileUsbSessionState, bool), MobileUsbError> {
        self.with_state(|state| {
            let state_from = state.session_state();
            let had_active_session = state.active_session_id().is_some();
            state.disconnect();
            (state_from, state.session_state(), had_active_session)
        })
    }

    fn take_pending_pairing(&self) -> Option<PendingMobileUsbPairingSession> {
        let discarded = match self.pending_pairing.lock() {
            Ok(mut pending) => pending.take(),
            Err(poisoned) => poisoned.into_inner().take(),
        };
        if let Some(pending) = discarded.as_ref() {
            tracing::info!(
                transport_family = MOBILE_USB_TRANSPORT_FAMILY,
                attempt_id = %redacted_identifier(Some(&pending.attempt_id)),
                "mobile_usb disconnect discarded pending pairing approval"
            );
        }
        discarded
    }

    async fn cancel_pending_pairing(&self, mut pending: PendingMobileUsbPairingSession) {
        if !pending.supports_graceful_cancel {
            tracing::info!(
                transport_family = MOBILE_USB_TRANSPORT_FAMILY,
                attempt_id = %redacted_identifier(Some(&pending.attempt_id)),
                "mobile_usb pairing peer does not support graceful cancel; using local teardown"
            );
            return;
        }

        const PAIRING_CANCEL_TIMEOUT: std::time::Duration = std::time::Duration::from_secs(1);
        let result = match tokio::time::timeout(PAIRING_CANCEL_TIMEOUT, async {
            send_pairing_approval_proof(
                pending.transport.as_mut(),
                &mut pending.noise_transport,
                &MobileUsbPairingApprovalProof {
                    attempt_id: pending.attempt_id.clone(),
                    proof_hex: String::new(),
                    action: MobileUsbPairingApprovalAction::Cancel,
                },
            )
            .await?;
            let ack =
                recv_pairing_approval_ack(pending.transport.as_mut(), &mut pending.noise_transport)
                    .await?;
            if ack.attempt_id != pending.attempt_id
                || ack.accepted
                || ack.error.as_deref() != Some("pairing_cancelled")
            {
                return Err(
                    "mobile USB pairing cancel returned an invalid acknowledgement".to_string(),
                );
            }
            Ok::<(), String>(())
        })
        .await
        {
            Ok(result) => result,
            Err(_) => Err(format!(
                "mobile USB pairing cancel timed out after {}ms",
                PAIRING_CANCEL_TIMEOUT.as_millis()
            )),
        };

        match result {
            Ok(()) => tracing::info!(
                transport_family = MOBILE_USB_TRANSPORT_FAMILY,
                attempt_id = %redacted_identifier(Some(&pending.attempt_id)),
                "mobile_usb pairing cancel acknowledged"
            ),
            Err(error) => tracing::warn!(
                transport_family = MOBILE_USB_TRANSPORT_FAMILY,
                attempt_id = %redacted_identifier(Some(&pending.attempt_id)),
                error,
                "mobile_usb pairing cancel fell back to local teardown"
            ),
        }
    }

    pub fn handle_session_event(
        &self,
        event: MobileUsbSessionEvent,
    ) -> Result<MobileUsbStatus, MobileUsbError> {
        let started_at = Instant::now();
        let (operation, session_id, result, stop_active_session) = match event {
            MobileUsbSessionEvent::HostUnlockConfirmed { session_id } => {
                let result = self.with_state(|state| {
                    let state_from = state.session_state();
                    let result = state.confirm_host_unlock(&session_id);
                    (state_from, state.session_state(), result)
                });
                ("host_unlock_confirmed", session_id, result, false)
            }
            MobileUsbSessionEvent::HostLocked { session_id } => {
                let result = self.with_state(|state| {
                    let state_from = state.session_state();
                    let matched = state
                        .remote_io_stopped(&session_id, MobileUsbRemoteIoStopReason::Disconnected);
                    (state_from, state.session_state(), Ok(()), matched)
                });
                let (result, stop_active_session) = match result {
                    Ok((state_from, state_to, result, matched)) => {
                        (Ok((state_from, state_to, result)), matched)
                    }
                    Err(error) => (Err(error), false),
                };
                ("host_locked", session_id, result, stop_active_session)
            }
            MobileUsbSessionEvent::SessionApprovalExpired { session_id } => {
                let result = self.with_state(|state| {
                    let state_from = state.session_state();
                    let matched = state.expire_session_approval(&session_id);
                    let result = if matched {
                        Ok(())
                    } else {
                        Err(MobileUsbError::new(
                            MobileUsbErrorCode::UnlockNotAuthenticated,
                            "session approval expiry does not match the active pending session",
                        ))
                    };
                    (state_from, state.session_state(), result, matched)
                });
                let (result, stop_active_session) = match result {
                    Ok((state_from, state_to, result, matched)) => {
                        (Ok((state_from, state_to, result)), matched)
                    }
                    Err(error) => (Err(error), false),
                };
                (
                    "session_approval_expired",
                    session_id,
                    result,
                    stop_active_session,
                )
            }
            MobileUsbSessionEvent::RemoteIoStopped { session_id, reason } => {
                let result = self.with_state(|state| {
                    let state_from = state.session_state();
                    state.remote_io_stopped(&session_id, reason);
                    (state_from, state.session_state(), Ok(()))
                });
                ("remote_io_stopped", session_id, result, false)
            }
            MobileUsbSessionEvent::CableDisconnected { session_id } => {
                let result = self.with_state(|state| {
                    let state_from = state.session_state();
                    state.remote_io_stopped(&session_id, MobileUsbRemoteIoStopReason::Disconnected);
                    (state_from, state.session_state(), Ok(()))
                });
                ("cable_disconnected", session_id, result, false)
            }
        };

        if stop_active_session {
            if let Err(error) = self.session_starter.disconnect_terminal() {
                tracing::warn!(
                    error = %error.message,
                    "mobile_usb host lock failed to stop active remote data plane"
                );
            }
        }

        let result = match result {
            Ok((state_from, state_to, Ok(()))) => {
                self.record_state_transition(state_from, state_to, None, None, Some(&session_id));
                self.status_inner()
            }
            Ok((state_from, state_to, Err(error))) => {
                self.record_state_transition(
                    state_from,
                    state_to,
                    Some(error.code),
                    None,
                    Some(&session_id),
                );
                Err(error)
            }
            Err(error) => Err(error),
        };
        self.record_operation_result(
            operation,
            started_at,
            &result,
            None,
            Some(&session_id),
            None,
        );
        result
    }

    pub fn status(&self) -> Result<MobileUsbStatus, MobileUsbError> {
        let started_at = Instant::now();
        let result = self.status_inner();
        self.record_operation_result("status", started_at, &result, None, None, None);
        result
    }

    pub fn list_paired(&self) -> Result<Vec<MobileUsbHostView>, MobileUsbError> {
        let started_at = Instant::now();
        let result = self.list_paired_inner();
        self.record_operation_result("list_paired", started_at, &result, None, None, None);
        result
    }

    pub fn remove_paired(&self, host_id: HostId) -> Result<Vec<MobileUsbHostView>, MobileUsbError> {
        let started_at = Instant::now();
        log_operation_start("remove_paired", Some(&host_id), None, None);
        let result = self.remove_paired_inner(&host_id);
        self.record_operation_result(
            "remove_paired",
            started_at,
            &result,
            Some(&host_id),
            None,
            None,
        );
        result
    }
}
