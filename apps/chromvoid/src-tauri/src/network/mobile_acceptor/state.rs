use std::collections::{HashMap, HashSet};
use std::sync::atomic::{AtomicU64, Ordering};
use std::sync::{Arc, Mutex};

use super::super::connection::NetworkConnectionManager;
use super::{now_ms, AcceptorState, AcceptorStatus, ConnectedPeer};
use crate::mobile_usb::{
    MobileUsbErrorCode, MobileUsbHostApprovalDecision, MobileUsbHostPairingApprovalView,
    MobileUsbHostSessionApprovalView,
};

/// Per-peer connection tracking: NetworkConnectionManager for state + shutdown handle.
pub(super) struct PeerConnection {
    pub(super) conn_mgr: NetworkConnectionManager,
    pub(super) generation: u64,
    pub(super) shutdown_tx: Option<tokio::sync::oneshot::Sender<()>>,
    pub(super) task_handle: Option<tokio::task::JoinHandle<()>>,
}

#[derive(Debug, Clone, Copy, PartialEq, Eq)]
pub(crate) enum PeerRegistrationResult {
    Added,
    StaleGeneration,
    Revoked,
}

#[derive(Debug, Clone, Copy, PartialEq, Eq)]
pub(crate) enum PeerRevocationResult {
    NotConnected,
    DisconnectSignalled,
    DisconnectFailed,
}

pub(super) struct AcceptorInner {
    pub(super) state: AcceptorState,
    pub(super) relay_url: Option<String>,
    pub(super) room_id: Option<String>,
    pub(super) connected_peers: Vec<ConnectedPeer>,
    pub(super) shutdown_tx: Option<tokio::sync::oneshot::Sender<()>>,
    pub(super) listener_task: Option<tokio::task::JoinHandle<()>>,
    pub(super) peer_connections: Vec<(String, PeerConnection)>,
}

impl AcceptorInner {
    pub(super) fn new() -> Self {
        Self {
            state: AcceptorState::Idle,
            relay_url: None,
            room_id: None,
            connected_peers: Vec::new(),
            shutdown_tx: None,
            listener_task: None,
            peer_connections: Vec::new(),
        }
    }

    pub(super) fn status(&self) -> AcceptorStatus {
        AcceptorStatus {
            state: self.state,
            connected_peers: self.connected_peers.clone(),
            relay_url: self.relay_url.clone(),
            room_id: self.room_id.clone(),
        }
    }
}

pub struct MobileAcceptorRuntimeState {
    inner: Mutex<Option<AcceptorInner>>,
    revoked_peer_ids: Mutex<HashSet<String>>,
    derivative_ensure_services:
        Mutex<Option<Arc<crate::commands::catalog::HostDerivativeEnsureServices>>>,
    acceptor_generation: AtomicU64,
    direct_transport_sessions: AtomicU64,
    vault_unlock_tx: tokio::sync::watch::Sender<u64>,
    usb_pairing_approvals: Mutex<HashMap<String, PendingUsbPairingApproval>>,
    usb_session_approvals: Mutex<HashMap<String, PendingUsbSessionApproval>>,
}

/// RAII marker for an in-flight direct transport (USB) session. While at least
/// one scope is alive, listener restarts must not preempt the session.
pub(crate) struct DirectTransportSessionScope {
    runtime: Arc<MobileAcceptorRuntimeState>,
}

impl Drop for DirectTransportSessionScope {
    fn drop(&mut self) {
        self.runtime
            .direct_transport_sessions
            .fetch_sub(1, Ordering::AcqRel);
    }
}

struct PendingUsbPairingApproval {
    view: MobileUsbHostPairingApprovalView,
    approved: bool,
    rejected: bool,
    notify: Arc<tokio::sync::Notify>,
}

struct PendingUsbSessionApproval {
    view: MobileUsbHostSessionApprovalView,
    approved: bool,
    rejected: bool,
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
        let (vault_unlock_tx, _) = tokio::sync::watch::channel(0);
        Self {
            inner: Mutex::new(None),
            revoked_peer_ids: Mutex::new(HashSet::new()),
            derivative_ensure_services: Mutex::new(None),
            acceptor_generation: AtomicU64::new(0),
            direct_transport_sessions: AtomicU64::new(0),
            vault_unlock_tx,
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

    pub(crate) fn notify_vault_unlocked(&self) {
        self.vault_unlock_tx.send_modify(|generation| {
            *generation = generation.wrapping_add(1);
        });
    }

    pub(in crate::network::mobile_acceptor) fn subscribe_vault_unlocks(
        &self,
    ) -> tokio::sync::watch::Receiver<u64> {
        self.vault_unlock_tx.subscribe()
    }

    pub(crate) fn direct_transport_session_scope(self: &Arc<Self>) -> DirectTransportSessionScope {
        self.direct_transport_sessions
            .fetch_add(1, Ordering::AcqRel);
        DirectTransportSessionScope {
            runtime: Arc::clone(self),
        }
    }

    pub(crate) fn has_active_direct_transport_session(&self) -> bool {
        self.direct_transport_sessions.load(Ordering::Acquire) > 0
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
        let mut approvals = self
            .usb_session_approvals
            .lock()
            .map_err(|_| "USB session approval mutex poisoned".to_string())?;
        approvals.insert(
            view.attempt_id.clone(),
            PendingUsbSessionApproval {
                view,
                approved: false,
                rejected: false,
                notify: Arc::new(tokio::sync::Notify::new()),
            },
        );
        Ok(())
    }

    pub fn pending_usb_session_approval(
        &self,
    ) -> Result<Option<MobileUsbHostSessionApprovalView>, String> {
        self.expire_usb_session_approvals()?;
        let approvals = self
            .usb_session_approvals
            .lock()
            .map_err(|_| "USB session approval mutex poisoned".to_string())?;
        Ok(approvals
            .values()
            .next()
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
            let (decision, notify, expires_at_ms) = {
                let approvals = self
                    .usb_session_approvals
                    .lock()
                    .map_err(|_| "USB session approval mutex poisoned".to_string())?;
                let Some(pending) = approvals.get(attempt_id) else {
                    return Ok(UsbSessionApprovalDecision::Missing);
                };
                let decision = if pending.approved {
                    Some(UsbSessionApprovalDecision::Approved)
                } else if pending.rejected {
                    Some(UsbSessionApprovalDecision::Rejected)
                } else if pending.view.expires_at_ms <= now_ms() {
                    Some(UsbSessionApprovalDecision::Expired)
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
        self.expire_usb_session_approvals()?;
        let notify = {
            let mut approvals = self
                .usb_session_approvals
                .lock()
                .map_err(|_| "USB session approval mutex poisoned".to_string())?;
            let pending = approvals
                .get_mut(attempt_id)
                .ok_or_else(|| "USB session approval attempt not found".to_string())?;
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

    fn expire_usb_session_approvals(&self) -> Result<(), String> {
        let now = now_ms();
        let mut approvals = self
            .usb_session_approvals
            .lock()
            .map_err(|_| "USB session approval mutex poisoned".to_string())?;
        approvals.retain(|_, pending| pending.view.expires_at_ms > now);
        Ok(())
    }

    pub(in crate::network::mobile_acceptor) fn with_acceptor<F, R>(&self, f: F) -> Result<R, String>
    where
        F: FnOnce(&mut AcceptorInner) -> R,
    {
        let mut guard = self
            .inner
            .lock()
            .map_err(|_| "Mobile acceptor mutex poisoned".to_string())?;
        let inner = guard.get_or_insert_with(AcceptorInner::new);
        Ok(f(inner))
    }

    #[cfg(test)]
    pub(in crate::network::mobile_acceptor) fn begin_listener_task(&self) -> Result<u64, String> {
        let mut guard = self
            .inner
            .lock()
            .map_err(|_| "Mobile acceptor mutex poisoned".to_string())?;
        let generation = self.acceptor_generation.fetch_add(1, Ordering::AcqRel) + 1;
        let inner = guard.get_or_insert_with(AcceptorInner::new);
        if let Some(handle) = inner.listener_task.take() {
            handle.abort();
        }
        Ok(generation)
    }

    pub(in crate::network::mobile_acceptor) fn begin_listener_session(
        &self,
        relay_url: String,
        room_id: String,
        shutdown_tx: tokio::sync::oneshot::Sender<()>,
    ) -> Result<(u64, AcceptorStatus), String> {
        if self.has_active_direct_transport_session() {
            return Err("direct transport session active".to_string());
        }
        let mut guard = self
            .inner
            .lock()
            .map_err(|_| "Mobile acceptor mutex poisoned".to_string())?;
        let inner = guard.get_or_insert_with(AcceptorInner::new);
        if matches!(
            inner.state,
            AcceptorState::Listening | AcceptorState::Handshaking | AcceptorState::Connected
        ) {
            return Err(format!("acceptor already in {:?} state", inner.state));
        }

        let generation = self.acceptor_generation.fetch_add(1, Ordering::AcqRel) + 1;
        if let Some(tx) = inner.shutdown_tx.take() {
            let _ = tx.send(());
        }
        if let Some(handle) = inner.listener_task.take() {
            handle.abort();
        }
        for (_id, pc) in inner.peer_connections.iter_mut() {
            pc.conn_mgr.disconnect();
            if let Some(tx) = pc.shutdown_tx.take() {
                let _ = tx.send(());
            }
            if let Some(handle) = pc.task_handle.take() {
                handle.abort();
            }
        }
        inner.state = AcceptorState::Listening;
        inner.relay_url = Some(relay_url);
        inner.room_id = Some(room_id);
        inner.connected_peers.clear();
        inner.peer_connections.clear();
        inner.shutdown_tx = Some(shutdown_tx);
        Ok((generation, inner.status()))
    }

    #[cfg_attr(not(target_os = "android"), allow(dead_code))]
    pub(in crate::network::mobile_acceptor) fn begin_direct_transport_session(
        &self,
        label: String,
    ) -> Result<u64, String> {
        let mut guard = self
            .inner
            .lock()
            .map_err(|_| "Mobile acceptor mutex poisoned".to_string())?;
        let inner = guard.get_or_insert_with(AcceptorInner::new);
        if inner.state == AcceptorState::Connected || !inner.connected_peers.is_empty() {
            return Err(format!("acceptor already in {:?} state", inner.state));
        }
        let generation = self.acceptor_generation.fetch_add(1, Ordering::AcqRel) + 1;
        if let Some(tx) = inner.shutdown_tx.take() {
            let _ = tx.send(());
        }
        if let Some(handle) = inner.listener_task.take() {
            handle.abort();
        }
        inner.state = AcceptorState::Listening;
        inner.relay_url = None;
        inner.room_id = Some(label);
        inner.connected_peers.clear();
        inner.peer_connections.clear();
        Ok(generation)
    }

    pub(in crate::network::mobile_acceptor) fn store_listener_task(
        &self,
        generation: u64,
        handle: tokio::task::JoinHandle<()>,
    ) -> Result<(), String> {
        let mut guard = match self.inner.lock() {
            Ok(guard) => guard,
            Err(_) => {
                handle.abort();
                return Err("Mobile acceptor mutex poisoned".to_string());
            }
        };
        let inner = guard.get_or_insert_with(AcceptorInner::new);
        if self.is_generation_current(generation) {
            inner.listener_task = Some(handle);
        } else {
            handle.abort();
        }
        Ok(())
    }

    pub(in crate::network::mobile_acceptor) fn cancel_all_tasks(
        &self,
    ) -> Result<AcceptorStatus, String> {
        let mut guard = self
            .inner
            .lock()
            .map_err(|_| "Mobile acceptor mutex poisoned".to_string())?;
        self.acceptor_generation.fetch_add(1, Ordering::AcqRel);
        let inner = guard.get_or_insert_with(AcceptorInner::new);

        if let Some(tx) = inner.shutdown_tx.take() {
            let _ = tx.send(());
        }
        if let Some(handle) = inner.listener_task.take() {
            handle.abort();
        }

        for (_id, pc) in inner.peer_connections.iter_mut() {
            pc.conn_mgr.disconnect();
            if let Some(tx) = pc.shutdown_tx.take() {
                let _ = tx.send(());
            }
            if let Some(handle) = pc.task_handle.take() {
                handle.abort();
            }
        }

        inner.state = AcceptorState::Idle;
        inner.relay_url = None;
        inner.room_id = None;
        inner.connected_peers.clear();
        inner.peer_connections.clear();
        Ok(inner.status())
    }

    pub(in crate::network::mobile_acceptor) fn is_generation_current(
        &self,
        generation: u64,
    ) -> bool {
        self.acceptor_generation.load(Ordering::Acquire) == generation
    }

    pub(in crate::network::mobile_acceptor) fn clear_listener_task_if_current(
        &self,
        generation: u64,
    ) -> Result<(), String> {
        let mut guard = self
            .inner
            .lock()
            .map_err(|_| "Mobile acceptor mutex poisoned".to_string())?;
        let inner = guard.get_or_insert_with(AcceptorInner::new);
        if self.is_generation_current(generation) {
            inner.listener_task = None;
        }
        Ok(())
    }

    pub(in crate::network::mobile_acceptor) fn with_acceptor_if_current<F, R>(
        &self,
        generation: u64,
        f: F,
    ) -> Result<Option<R>, String>
    where
        F: FnOnce(&mut AcceptorInner) -> R,
    {
        let mut guard = self
            .inner
            .lock()
            .map_err(|_| "Mobile acceptor mutex poisoned".to_string())?;
        if !self.is_generation_current(generation) {
            return Ok(None);
        }
        let inner = guard.get_or_insert_with(AcceptorInner::new);
        Ok(Some(f(inner)))
    }

    pub(in crate::network::mobile_acceptor) fn add_peer_if_current(
        &self,
        generation: u64,
        peer: ConnectedPeer,
        connection: PeerConnection,
    ) -> Result<PeerRegistrationResult, String> {
        // Registration and revoke always acquire these locks in this order. A handshake that
        // loaded trust before durable revoke therefore cannot register after the guard is set.
        let revoked = self
            .revoked_peer_ids
            .lock()
            .map_err(|_| "Revoked peer guard mutex poisoned".to_string())?;
        if revoked.contains(&peer.peer_id) {
            return Ok(PeerRegistrationResult::Revoked);
        }
        let mut guard = self
            .inner
            .lock()
            .map_err(|_| "Mobile acceptor mutex poisoned".to_string())?;
        if !self.is_generation_current(generation) {
            return Ok(PeerRegistrationResult::StaleGeneration);
        }
        let inner = guard.get_or_insert_with(AcceptorInner::new);
        inner.connected_peers.push(peer.clone());
        inner.peer_connections.push((peer.peer_id, connection));
        inner.state = AcceptorState::Connected;
        Ok(PeerRegistrationResult::Added)
    }

    pub(crate) fn clear_peer_revocation(&self, peer_id: &str) -> Result<(), String> {
        self.revoked_peer_ids
            .lock()
            .map_err(|_| "Revoked peer guard mutex poisoned".to_string())?
            .remove(peer_id);
        Ok(())
    }

    pub(crate) fn revoke_peer_access(&self, peer_id: &str) -> Result<PeerRevocationResult, String> {
        // Keep the guard held until the active-peer record is removed. This is the inverse edge
        // of add_peer_if_current and deliberately uses the same lock order.
        let mut revoked = self
            .revoked_peer_ids
            .lock()
            .map_err(|_| "Revoked peer guard mutex poisoned".to_string())?;
        revoked.insert(peer_id.to_string());
        let mut guard = self
            .inner
            .lock()
            .map_err(|_| "Mobile acceptor mutex poisoned".to_string())?;
        let inner = guard.get_or_insert_with(AcceptorInner::new);
        let connected = inner
            .connected_peers
            .iter()
            .any(|peer| peer.peer_id == peer_id);
        inner.connected_peers.retain(|peer| peer.peer_id != peer_id);
        let connection = inner
            .peer_connections
            .iter()
            .position(|(id, _)| id == peer_id)
            .map(|index| inner.peer_connections.remove(index).1);
        if inner.connected_peers.is_empty()
            && (inner.state == AcceptorState::Connected
                || inner.state == AcceptorState::Handshaking)
        {
            inner.state = if inner.relay_url.is_some() {
                AcceptorState::Listening
            } else {
                AcceptorState::Idle
            };
        }
        drop(guard);
        drop(revoked);

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

        let Some(mut connection) = connection else {
            return Ok(if connected {
                PeerRevocationResult::DisconnectFailed
            } else {
                PeerRevocationResult::NotConnected
            });
        };
        connection.conn_mgr.disconnect();
        let signalled = connection
            .shutdown_tx
            .take()
            .is_some_and(|shutdown| shutdown.send(()).is_ok());
        if signalled {
            Ok(PeerRevocationResult::DisconnectSignalled)
        } else {
            if let Some(handle) = connection.task_handle.take() {
                handle.abort();
            }
            Ok(PeerRevocationResult::DisconnectFailed)
        }
    }

    pub(in crate::network::mobile_acceptor) fn store_peer_task_if_current(
        &self,
        generation: u64,
        peer_id: &str,
        handle: tokio::task::JoinHandle<()>,
    ) -> Result<bool, String> {
        let mut guard = match self.inner.lock() {
            Ok(guard) => guard,
            Err(_) => {
                handle.abort();
                return Err("Mobile acceptor mutex poisoned".to_string());
            }
        };
        if !self.is_generation_current(generation) {
            handle.abort();
            return Ok(false);
        }
        let Some(inner) = guard.as_mut() else {
            handle.abort();
            return Ok(false);
        };
        let Some((_, peer_connection)) = inner
            .peer_connections
            .iter_mut()
            .find(|(id, pc)| id == peer_id && pc.generation == generation)
        else {
            handle.abort();
            return Ok(false);
        };
        peer_connection.task_handle = Some(handle);
        Ok(true)
    }

    pub(in crate::network::mobile_acceptor) fn remove_peer_if_current(
        &self,
        generation: u64,
        peer_id: &str,
    ) -> Result<bool, String> {
        self.with_acceptor_if_current(generation, |a| {
            a.connected_peers.retain(|p| p.peer_id != peer_id);
            a.peer_connections.retain(|(id, _)| id != peer_id);
            if a.connected_peers.is_empty()
                && (a.state == AcceptorState::Connected || a.state == AcceptorState::Handshaking)
            {
                a.state = if a.relay_url.is_some() {
                    AcceptorState::Listening
                } else {
                    AcceptorState::Idle
                };
            }
        })
        .map(|result| result.is_some())
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
    fn revoke_disconnects_registered_peer_and_clears_pending_session_approval() {
        let state = MobileAcceptorRuntimeState::new();
        let generation = state.begin_listener_task().expect("begin listener");
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
        let generation = state.begin_listener_task().expect("begin listener");
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
        let generation = state.begin_listener_task().expect("begin listener");
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
    fn usb_session_pending_view_reports_recorded_decision() {
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
        let rejected = state
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
}

impl Default for MobileAcceptorRuntimeState {
    fn default() -> Self {
        Self::new()
    }
}
