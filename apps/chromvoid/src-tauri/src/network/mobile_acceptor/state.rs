use std::collections::HashMap;
use std::sync::{Arc, Mutex};

#[cfg(test)]
use super::super::connection::NetworkConnectionManager;
use super::now_ms;
#[cfg(test)]
use super::{AcceptorState, ConnectedPeer};
use crate::mobile_usb::{
    MobileUsbErrorCode, MobileUsbHostApprovalDecision, MobileUsbHostPairingApprovalView,
    MobileUsbHostSessionApprovalView,
};
#[cfg(test)]
pub(super) use chromvoid_network_runtime::acceptor::AcceptorInner;
pub(crate) use chromvoid_network_runtime::acceptor::PeerRevocationResult;
use chromvoid_network_runtime::acceptor::{AcceptorRuntimeState, DirectTransportSessionScope};
pub(super) use chromvoid_network_runtime::acceptor::{PeerConnection, PeerRegistrationResult};

pub struct MobileAcceptorRuntimeState {
    runtime: Arc<AcceptorRuntimeState>,
    derivative_ensure_services:
        Mutex<Option<Arc<crate::commands::catalog::HostDerivativeEnsureServices>>>,
    usb_pairing_approvals: Mutex<HashMap<String, PendingUsbPairingApproval>>,
    usb_session_approvals: Mutex<HashMap<String, PendingUsbSessionApproval>>,
}

struct PendingUsbPairingApproval {
    view: MobileUsbHostPairingApprovalView,
    approved: bool,
    rejected: bool,
    notify: Arc<tokio::sync::Notify>,
}

struct PendingUsbSessionApproval {
    view: MobileUsbHostSessionApprovalView,
    decision: Option<UsbSessionApprovalDecision>,
    deadline: tokio::time::Instant,
    notify: Arc<tokio::sync::Notify>,
}

#[derive(Debug, Clone, Copy, PartialEq, Eq)]
pub(in crate::network::mobile_acceptor) enum UsbPairingApprovalDecision {
    Approved,
    Rejected,
    Expired,
    Missing,
}

#[derive(Debug, Clone, Copy, PartialEq, Eq)]
pub(in crate::network::mobile_acceptor) enum UsbSessionApprovalDecision {
    Approved,
    Rejected,
    Expired,
    Missing,
}

#[derive(Debug, Clone, Copy)]
pub(crate) enum MobileUsbApprovalKind {
    Pairing,
    Session,
}

impl MobileUsbApprovalKind {
    pub(crate) fn from_native(value: &str) -> Result<Self, String> {
        match value {
            "pairing" => Ok(Self::Pairing),
            "session" => Ok(Self::Session),
            _ => Err(format!(
                "{}: unknown mobile USB approval kind",
                MobileUsbErrorCode::InvalidState.as_str(),
            )),
        }
    }
}

impl MobileAcceptorRuntimeState {
    pub fn new() -> Self {
        Self {
            runtime: Arc::new(AcceptorRuntimeState::new()),
            derivative_ensure_services: Mutex::new(None),
            usb_pairing_approvals: Mutex::new(HashMap::new()),
            usb_session_approvals: Mutex::new(HashMap::new()),
        }
    }

    pub(crate) fn configure_derivative_ensure_services(
        &self,
        services: Arc<crate::commands::catalog::HostDerivativeEnsureServices>,
    ) -> Result<(), String> {
        let mut configured = self
            .derivative_ensure_services
            .lock()
            .map_err(|_| "Derivative ensure services mutex poisoned".to_string())?;
        if configured.is_some() {
            return Err("Derivative ensure services already configured".to_string());
        }
        *configured = Some(services);
        Ok(())
    }

    pub(in crate::network::mobile_acceptor) fn derivative_ensure_services(
        &self,
    ) -> Result<Option<Arc<crate::commands::catalog::HostDerivativeEnsureServices>>, String> {
        self.derivative_ensure_services
            .lock()
            .map(|services| services.clone())
            .map_err(|_| "Derivative ensure services mutex poisoned".to_string())
    }

    pub(crate) fn direct_transport_session_scope(&self) -> DirectTransportSessionScope {
        self.runtime.direct_transport_session_scope()
    }

    pub(in crate::network::mobile_acceptor) fn register_usb_pairing_approval(
        &self,
        view: MobileUsbHostPairingApprovalView,
    ) -> Result<(), String> {
        let mut approvals = self
            .usb_pairing_approvals
            .lock()
            .map_err(|_| "USB pairing approval mutex poisoned".to_string())?;
        approvals.insert(
            view.attempt_id.clone(),
            PendingUsbPairingApproval {
                view,
                approved: false,
                rejected: false,
                notify: Arc::new(tokio::sync::Notify::new()),
            },
        );
        Ok(())
    }

    pub fn pending_usb_pairing_approval(
        &self,
    ) -> Result<Option<MobileUsbHostPairingApprovalView>, String> {
        self.expire_usb_pairing_approvals()?;
        let approvals = self
            .usb_pairing_approvals
            .lock()
            .map_err(|_| "USB pairing approval mutex poisoned".to_string())?;
        Ok(approvals
            .values()
            .next()
            .map(|pending| pending.view.clone()))
    }

    pub fn approve_usb_pairing(&self, attempt_id: &str) -> Result<(), String> {
        self.set_usb_pairing_approval_decision(attempt_id, true)
    }

    pub fn reject_usb_pairing(&self, attempt_id: &str) -> Result<(), String> {
        self.set_usb_pairing_approval_decision(attempt_id, false)
    }

    pub(crate) fn resolve_usb_approval(
        &self,
        kind: MobileUsbApprovalKind,
        attempt_id: &str,
        approved: bool,
    ) -> Result<(), String> {
        if attempt_id.trim().is_empty() {
            return Err(format!(
                "{}: attempt_id is required",
                MobileUsbErrorCode::InvalidState.as_str(),
            ));
        }
        match (kind, approved) {
            (MobileUsbApprovalKind::Pairing, true) => self.approve_usb_pairing(attempt_id),
            (MobileUsbApprovalKind::Pairing, false) => self.reject_usb_pairing(attempt_id),
            (MobileUsbApprovalKind::Session, true) => self.approve_usb_session(attempt_id),
            (MobileUsbApprovalKind::Session, false) => self.reject_usb_session(attempt_id),
        }
    }

    pub(in crate::network::mobile_acceptor) async fn wait_usb_pairing_approval(
        &self,
        attempt_id: &str,
    ) -> Result<UsbPairingApprovalDecision, String> {
        loop {
            let (decision, notify, expires_at_ms) = {
                let approvals = self
                    .usb_pairing_approvals
                    .lock()
                    .map_err(|_| "USB pairing approval mutex poisoned".to_string())?;
                let Some(pending) = approvals.get(attempt_id) else {
                    return Ok(UsbPairingApprovalDecision::Missing);
                };
                let decision = if pending.approved {
                    Some(UsbPairingApprovalDecision::Approved)
                } else if pending.rejected {
                    Some(UsbPairingApprovalDecision::Rejected)
                } else if pending.view.expires_at_ms <= now_ms() {
                    Some(UsbPairingApprovalDecision::Expired)
                } else {
                    None
                };
                (decision, pending.notify.clone(), pending.view.expires_at_ms)
            };
            if let Some(decision) = decision {
                return Ok(decision);
            }
            let remaining_ms = expires_at_ms.saturating_sub(now_ms());
            tokio::select! {
                _ = notify.notified() => {}
                _ = tokio::time::sleep(std::time::Duration::from_millis(remaining_ms.max(1))) => {}
            }
        }
    }

    pub(in crate::network::mobile_acceptor) fn finish_usb_pairing_approval(
        &self,
        attempt_id: &str,
    ) -> Result<(), String> {
        let mut approvals = self
            .usb_pairing_approvals
            .lock()
            .map_err(|_| "USB pairing approval mutex poisoned".to_string())?;
        approvals.remove(attempt_id);
        Ok(())
    }

    fn set_usb_pairing_approval_decision(
        &self,
        attempt_id: &str,
        approved: bool,
    ) -> Result<(), String> {
        self.expire_usb_pairing_approvals()?;
        let notify = {
            let mut approvals = self
                .usb_pairing_approvals
                .lock()
                .map_err(|_| "USB pairing approval mutex poisoned".to_string())?;
            let pending = approvals
                .get_mut(attempt_id)
                .ok_or_else(|| "USB pairing approval attempt not found".to_string())?;
            pending.approved = approved;
            pending.rejected = !approved;
            pending.view.decision = if approved {
                MobileUsbHostApprovalDecision::Approved
            } else {
                MobileUsbHostApprovalDecision::Rejected
            };
            pending.notify.clone()
        };
        notify.notify_waiters();
        Ok(())
    }

    fn expire_usb_pairing_approvals(&self) -> Result<(), String> {
        let now = now_ms();
        let mut approvals = self
            .usb_pairing_approvals
            .lock()
            .map_err(|_| "USB pairing approval mutex poisoned".to_string())?;
        approvals.retain(|_, pending| pending.view.expires_at_ms > now);
        Ok(())
    }

    pub(in crate::network::mobile_acceptor) fn register_usb_session_approval(
        &self,
        view: MobileUsbHostSessionApprovalView,
    ) -> Result<(), String> {
        let remaining_ms = view
            .expires_at_ms
            .saturating_sub(now_ms())
            .min(crate::mobile_usb::MOBILE_USB_SESSION_APPROVAL_TIMEOUT.as_millis() as u64);
        let deadline = tokio::time::Instant::now() + std::time::Duration::from_millis(remaining_ms);
        let mut approvals = self
            .usb_session_approvals
            .lock()
            .map_err(|_| "USB session approval mutex poisoned".to_string())?;
        approvals.insert(
            view.attempt_id.clone(),
            PendingUsbSessionApproval {
                view,
                decision: None,
                deadline,
                notify: Arc::new(tokio::sync::Notify::new()),
            },
        );
        Ok(())
    }

    pub fn pending_usb_session_approval(
        &self,
    ) -> Result<Option<MobileUsbHostSessionApprovalView>, String> {
        let approvals = self
            .usb_session_approvals
            .lock()
            .map_err(|_| "USB session approval mutex poisoned".to_string())?;
        Ok(approvals
            .values()
            .find(|pending| pending.deadline > tokio::time::Instant::now())
            .map(|pending| pending.view.clone()))
    }

    pub fn approve_usb_session(&self, attempt_id: &str) -> Result<(), String> {
        self.set_usb_session_approval_decision(attempt_id, true)
    }

    pub fn reject_usb_session(&self, attempt_id: &str) -> Result<(), String> {
        self.set_usb_session_approval_decision(attempt_id, false)
    }

    pub(in crate::network::mobile_acceptor) async fn wait_usb_session_approval(
        &self,
        attempt_id: &str,
    ) -> Result<UsbSessionApprovalDecision, String> {
        loop {
            let (decision, notify, deadline) = {
                let approvals = self
                    .usb_session_approvals
                    .lock()
                    .map_err(|_| "USB session approval mutex poisoned".to_string())?;
                let Some(pending) = approvals.get(attempt_id) else {
                    return Ok(UsbSessionApprovalDecision::Missing);
                };
                let decision = if let Some(decision) = pending.decision {
                    Some(decision)
                } else if pending.deadline <= tokio::time::Instant::now() {
                    Some(UsbSessionApprovalDecision::Expired)
                } else {
                    None
                };
                (decision, pending.notify.clone(), pending.deadline)
            };
            if let Some(decision) = decision {
                return Ok(decision);
            }
            tokio::select! {
                _ = notify.notified() => {}
                _ = tokio::time::sleep_until(deadline) => {}
            }
        }
    }

    pub(in crate::network::mobile_acceptor) fn finish_usb_session_approval(
        &self,
        attempt_id: &str,
    ) -> Result<(), String> {
        let mut approvals = self
            .usb_session_approvals
            .lock()
            .map_err(|_| "USB session approval mutex poisoned".to_string())?;
        approvals.remove(attempt_id);
        Ok(())
    }

    fn set_usb_session_approval_decision(
        &self,
        attempt_id: &str,
        approved: bool,
    ) -> Result<(), String> {
        let notify = {
            let mut approvals = self
                .usb_session_approvals
                .lock()
                .map_err(|_| "USB session approval mutex poisoned".to_string())?;
            let Some(pending) = approvals.get_mut(attempt_id) else {
                tracing::info!(
                    attempt_id = %crate::mobile_usb::observability::redacted_identifier(Some(attempt_id)),
                    "mobile_acceptor: ignored resolved USB session approval attempt"
                );
                return Ok(());
            };
            if pending.decision.is_some() || pending.deadline <= tokio::time::Instant::now() {
                pending.notify.notify_waiters();
                tracing::info!(
                    attempt_id = %crate::mobile_usb::observability::redacted_identifier(Some(attempt_id)),
                    "mobile_acceptor: ignored terminal USB session approval decision"
                );
                return Ok(());
            }
            pending.decision = Some(if approved {
                UsbSessionApprovalDecision::Approved
            } else {
                UsbSessionApprovalDecision::Rejected
            });
            pending.view.decision = if approved {
                MobileUsbHostApprovalDecision::Approved
            } else {
                MobileUsbHostApprovalDecision::Rejected
            };
            pending.notify.clone()
        };
        notify.notify_waiters();
        Ok(())
    }

    pub(crate) fn revoke_peer_access(&self, peer_id: &str) -> Result<PeerRevocationResult, String> {
        self.runtime.revoke_peer_access(peer_id, || {
            let approval_notifies = {
                let mut approvals = self
                    .usb_session_approvals
                    .lock()
                    .map_err(|_| "USB session approval mutex poisoned".to_string())?;
                let matching_attempts = approvals
                    .iter()
                    .filter(|(_, pending)| pending.view.peer_id == peer_id)
                    .map(|(attempt_id, pending)| (attempt_id.clone(), pending.notify.clone()))
                    .collect::<Vec<_>>();
                for (attempt_id, _) in &matching_attempts {
                    approvals.remove(attempt_id);
                }
                matching_attempts
                    .into_iter()
                    .map(|(_, notify)| notify)
                    .collect::<Vec<_>>()
            };
            for notify in approval_notifies {
                notify.notify_waiters();
            }

            Ok(())
        })
    }
}

impl std::ops::Deref for MobileAcceptorRuntimeState {
    type Target = AcceptorRuntimeState;

    fn deref(&self) -> &Self::Target {
        &self.runtime
    }
}

#[cfg(test)]
mod tests {
    use super::*;

    fn pairing_view() -> MobileUsbHostPairingApprovalView {
        MobileUsbHostPairingApprovalView {
            attempt_id: "pair-attempt-1".to_string(),
            approval_pin: "123456".to_string(),
            peer_label: "MacBook".to_string(),
            peer_fingerprint: "abcd1234".to_string(),
            attempts_left: 5,
            decision: MobileUsbHostApprovalDecision::Pending,
            expires_at_ms: u64::MAX,
        }
    }

    fn session_view() -> MobileUsbHostSessionApprovalView {
        MobileUsbHostSessionApprovalView {
            attempt_id: "session-attempt-1".to_string(),
            peer_id: "desktop-peer-1".to_string(),
            peer_label: "MacBook".to_string(),
            transport_type: "usb_mobile".to_string(),
            decision: MobileUsbHostApprovalDecision::Pending,
            expires_at_ms: u64::MAX,
        }
    }

    fn connected_peer(peer_id: &str) -> ConnectedPeer {
        ConnectedPeer {
            peer_id: peer_id.to_string(),
            label: "MacBook".to_string(),
            connected_at_ms: 1,
            transport_type: "usb_mobile".to_string(),
        }
    }

    fn peer_connection(
        generation: u64,
        shutdown_tx: tokio::sync::oneshot::Sender<()>,
    ) -> PeerConnection {
        PeerConnection {
            conn_mgr: NetworkConnectionManager::new(),
            generation,
            shutdown_tx: Some(shutdown_tx),
            task_handle: None,
        }
    }

    #[test]
    fn usb_pairing_pending_view_reports_recorded_decision() {
        let state = MobileAcceptorRuntimeState::new();
        state
            .register_usb_pairing_approval(pairing_view())
            .expect("register pairing approval");

        let pending = state
            .pending_usb_pairing_approval()
            .expect("read pending pairing approval")
            .expect("pending pairing approval");
        assert_eq!(pending.decision, MobileUsbHostApprovalDecision::Pending);

        state
            .approve_usb_pairing("pair-attempt-1")
            .expect("approve pairing approval");
        let approved = state
            .pending_usb_pairing_approval()
            .expect("read approved pairing approval")
            .expect("approved pairing approval remains visible");
        assert_eq!(approved.decision, MobileUsbHostApprovalDecision::Approved);

        state
            .reject_usb_pairing("pair-attempt-1")
            .expect("reject pairing approval");
        let rejected = state
            .pending_usb_pairing_approval()
            .expect("read rejected pairing approval")
            .expect("rejected pairing approval remains recorded");
        assert_eq!(rejected.decision, MobileUsbHostApprovalDecision::Rejected);
    }

    #[test]
    fn revoke_still_disconnects_when_usb_approval_cleanup_fails() {
        let state = MobileAcceptorRuntimeState::new();
        let generation = state
            .begin_direct_transport_session("test-session".to_string())
            .expect("begin session");
        let (shutdown_tx, mut shutdown_rx) = tokio::sync::oneshot::channel();
        state
            .add_peer_if_current(
                generation,
                connected_peer("desktop-peer-1"),
                peer_connection(generation, shutdown_tx),
            )
            .expect("register peer");
        let _ = std::panic::catch_unwind(std::panic::AssertUnwindSafe(|| {
            let _guard = state.usb_session_approvals.lock().unwrap();
            panic!("poison platform approval storage");
        }));

        assert_eq!(
            state.revoke_peer_access("desktop-peer-1").unwrap_err(),
            "USB session approval mutex poisoned"
        );
        assert_eq!(shutdown_rx.try_recv(), Ok(()));
    }

    #[test]
    fn revoke_disconnects_registered_peer_and_clears_pending_session_approval() {
        let state = MobileAcceptorRuntimeState::new();
        let generation = state
            .begin_direct_transport_session("test-session".to_string())
            .expect("begin listener");
        let (shutdown_tx, mut shutdown_rx) = tokio::sync::oneshot::channel();
        assert_eq!(
            state
                .add_peer_if_current(
                    generation,
                    connected_peer("desktop-peer-1"),
                    peer_connection(generation, shutdown_tx),
                )
                .expect("register peer"),
            PeerRegistrationResult::Added
        );
        state
            .register_usb_session_approval(session_view())
            .expect("register approval");

        assert_eq!(
            state
                .revoke_peer_access("desktop-peer-1")
                .expect("revoke peer"),
            PeerRevocationResult::DisconnectSignalled
        );
        assert_eq!(shutdown_rx.try_recv(), Ok(()));
        assert!(state
            .pending_usb_session_approval()
            .expect("pending approval")
            .is_none());
        let status = state.with_acceptor(|inner| inner.status()).expect("status");
        assert!(status.connected_peers.is_empty());
        assert_eq!(status.state, AcceptorState::Idle);
    }

    #[test]
    fn revoke_preserves_other_connected_peers_and_listener_state() {
        let state = MobileAcceptorRuntimeState::new();
        let generation = state
            .begin_direct_transport_session("test-session".to_string())
            .expect("begin listener");
        let (revoked_tx, mut revoked_rx) = tokio::sync::oneshot::channel();
        let (kept_tx, mut kept_rx) = tokio::sync::oneshot::channel();
        for (peer_id, shutdown_tx) in [("desktop-peer-1", revoked_tx), ("desktop-peer-2", kept_tx)]
        {
            assert_eq!(
                state
                    .add_peer_if_current(
                        generation,
                        connected_peer(peer_id),
                        peer_connection(generation, shutdown_tx),
                    )
                    .expect("register peer"),
                PeerRegistrationResult::Added
            );
        }

        assert_eq!(
            state
                .revoke_peer_access("desktop-peer-1")
                .expect("revoke peer"),
            PeerRevocationResult::DisconnectSignalled
        );
        assert_eq!(revoked_rx.try_recv(), Ok(()));
        assert_eq!(
            kept_rx.try_recv(),
            Err(tokio::sync::oneshot::error::TryRecvError::Empty)
        );
        let status = state.with_acceptor(|inner| inner.status()).expect("status");
        assert_eq!(status.state, AcceptorState::Connected);
        assert_eq!(status.connected_peers.len(), 1);
        assert_eq!(status.connected_peers[0].peer_id, "desktop-peer-2");
    }

    #[test]
    fn revoke_guard_rejects_late_registration_and_allows_durable_repair() {
        let state = MobileAcceptorRuntimeState::new();
        let generation = state
            .begin_direct_transport_session("test-session".to_string())
            .expect("begin listener");
        assert_eq!(
            state
                .revoke_peer_access("desktop-peer-1")
                .expect("revoke peer"),
            PeerRevocationResult::NotConnected
        );

        let (rejected_tx, _rejected_rx) = tokio::sync::oneshot::channel();
        assert_eq!(
            state
                .add_peer_if_current(
                    generation,
                    connected_peer("desktop-peer-1"),
                    peer_connection(generation, rejected_tx),
                )
                .expect("late registration"),
            PeerRegistrationResult::Revoked
        );

        state
            .clear_peer_revocation("desktop-peer-1")
            .expect("clear guard after durable pairing");
        let (accepted_tx, _accepted_rx) = tokio::sync::oneshot::channel();
        assert_eq!(
            state
                .add_peer_if_current(
                    generation,
                    connected_peer("desktop-peer-1"),
                    peer_connection(generation, accepted_tx),
                )
                .expect("registration after re-pair"),
            PeerRegistrationResult::Added
        );
    }

    #[test]
    fn usb_session_pending_view_records_first_terminal_decision() {
        let state = MobileAcceptorRuntimeState::new();
        state
            .register_usb_session_approval(session_view())
            .expect("register session approval");

        let pending = state
            .pending_usb_session_approval()
            .expect("read pending session approval")
            .expect("pending session approval");
        assert_eq!(pending.decision, MobileUsbHostApprovalDecision::Pending);

        state
            .approve_usb_session("session-attempt-1")
            .expect("approve session approval");
        let approved = state
            .pending_usb_session_approval()
            .expect("read approved session approval")
            .expect("approved session approval remains recorded");
        assert_eq!(approved.decision, MobileUsbHostApprovalDecision::Approved);

        state
            .reject_usb_session("session-attempt-1")
            .expect("reject session approval");
        let still_approved = state
            .pending_usb_session_approval()
            .expect("read terminal session approval")
            .expect("first terminal session approval remains recorded");
        assert_eq!(
            still_approved.decision,
            MobileUsbHostApprovalDecision::Approved
        );

        let rejected_state = MobileAcceptorRuntimeState::new();
        rejected_state
            .register_usb_session_approval(session_view())
            .expect("register rejected session approval");
        rejected_state
            .reject_usb_session("session-attempt-1")
            .expect("reject pending session approval");
        let rejected = rejected_state
            .pending_usb_session_approval()
            .expect("read rejected session approval")
            .expect("rejected session approval remains recorded");
        assert_eq!(rejected.decision, MobileUsbHostApprovalDecision::Rejected);
    }

    #[test]
    fn usb_approval_resolver_uses_the_approval_runtime_as_its_source_of_truth() {
        let state = MobileAcceptorRuntimeState::new();
        state
            .register_usb_session_approval(session_view())
            .expect("register session approval");

        state
            .resolve_usb_approval(MobileUsbApprovalKind::Session, "session-attempt-1", true)
            .expect("approve exact session approval");
        let approved = state
            .pending_usb_session_approval()
            .expect("read approved session approval")
            .expect("approved session approval remains recorded");

        assert_eq!(approved.decision, MobileUsbHostApprovalDecision::Approved);
        assert!(state
            .resolve_usb_approval(MobileUsbApprovalKind::Session, " ", false)
            .expect_err("blank attempt id should be rejected")
            .starts_with("ERR_USB_MOBILE_INVALID_STATE"));
        assert!(MobileUsbApprovalKind::from_native("unexpected")
            .expect_err("unknown notification kind should be rejected")
            .starts_with("ERR_USB_MOBILE_INVALID_STATE"));
    }

    #[tokio::test]
    async fn expired_session_approval_is_hidden_and_late_resolution_is_idempotent() {
        let state = MobileAcceptorRuntimeState::new();
        let mut view = session_view();
        view.expires_at_ms = now_ms().saturating_sub(1);
        state
            .register_usb_session_approval(view)
            .expect("register expired session approval");

        assert!(state
            .pending_usb_session_approval()
            .expect("read expired session approval")
            .is_none());
        state
            .approve_usb_session("session-attempt-1")
            .expect("late approval is an idempotent no-op");
        assert_eq!(
            state
                .wait_usb_session_approval("session-attempt-1")
                .await
                .expect("wait expired session approval"),
            UsbSessionApprovalDecision::Expired
        );

        state
            .finish_usb_session_approval("session-attempt-1")
            .expect("finish expired approval");
        state
            .reject_usb_session("session-attempt-1")
            .expect("resolution after cleanup remains idempotent");
    }
}

impl Default for MobileAcceptorRuntimeState {
    fn default() -> Self {
        Self::new()
    }
}
