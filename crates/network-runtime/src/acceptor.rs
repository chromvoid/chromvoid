//! Listener and peer lifecycle shared by Rust host implementations.
//! Platform approvals and Core RPC services stay with the caller. Callers explicitly
//! cancel on stop; dropping this owner retains the existing JoinHandle drop semantics.
pub mod handshake;

use crate::connection::NetworkConnectionManager;
use serde::{Deserialize, Serialize};
use std::collections::HashSet;
use std::sync::atomic::{AtomicU64, Ordering};
use std::sync::{Arc, Mutex};

/// Acceptor lifecycle state.
#[derive(Debug, Clone, Copy, PartialEq, Eq, Serialize, Deserialize)]
#[serde(rename_all = "snake_case")]
pub enum AcceptorState {
    /// Not listening — default after creation or explicit stop.
    Idle,
    /// Signaling room joined, waiting for Desktop to connect.
    Listening,
    /// Noise handshake in progress with an incoming peer.
    Handshaking,
    /// At least one Desktop peer connected and io_task running.
    Connected,
    /// Connection lost unexpectedly (eligible for restart).
    Disconnected,
}

/// Information about a connected Desktop peer.
#[derive(Debug, Clone, Serialize, Deserialize)]
pub struct ConnectedPeer {
    pub peer_id: String,
    pub label: String,
    pub connected_at_ms: u64,
    pub transport_type: String,
}

/// Snapshot of the acceptor's current status returned to callers.
#[derive(Debug, Clone, Serialize)]
pub struct AcceptorStatus {
    pub state: AcceptorState,
    pub connected_peers: Vec<ConnectedPeer>,
    pub relay_url: Option<String>,
    pub room_id: Option<String>,
}

/// Per-peer connection tracking: NetworkConnectionManager for state + shutdown handle.
pub struct PeerConnection {
    pub conn_mgr: NetworkConnectionManager,
    pub generation: u64,
    pub shutdown_tx: Option<tokio::sync::oneshot::Sender<()>>,
    pub task_handle: Option<tokio::task::JoinHandle<()>>,
}

#[derive(Debug, Clone, Copy, PartialEq, Eq)]
pub enum PeerRegistrationResult {
    Added,
    StaleGeneration,
    Revoked,
}

#[derive(Debug, Clone, Copy, PartialEq, Eq)]
pub enum PeerRevocationResult {
    NotConnected,
    DisconnectSignalled,
    DisconnectFailed,
}

/// Rust host orchestration state. Access is serialized by `with_acceptor` and
/// `with_acceptor_if_current`; peer admission/revocation must use runtime methods.
/// This is not a foreign-language API or a source of Core/vault authority.
pub struct AcceptorInner {
    pub state: AcceptorState,
    pub relay_url: Option<String>,
    pub room_id: Option<String>,
    pub connected_peers: Vec<ConnectedPeer>,
    pub shutdown_tx: Option<tokio::sync::oneshot::Sender<()>>,
    pub listener_task: Option<tokio::task::JoinHandle<()>>,
    pub peer_connections: Vec<(String, PeerConnection)>,
}

impl AcceptorInner {
    pub fn new() -> Self {
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

    pub fn status(&self) -> AcceptorStatus {
        AcceptorStatus {
            state: self.state,
            connected_peers: self.connected_peers.clone(),
            relay_url: self.relay_url.clone(),
            room_id: self.room_id.clone(),
        }
    }
}

/// Single owner of acceptor generations, tasks and peer revocation guards.
pub struct AcceptorRuntimeState {
    inner: Mutex<Option<AcceptorInner>>,
    revoked_peer_ids: Mutex<HashSet<String>>,
    acceptor_generation: AtomicU64,
    direct_transport_sessions: AtomicU64,
    vault_unlock_tx: tokio::sync::watch::Sender<u64>,
}

/// RAII marker for an in-flight direct transport (USB) session. While at least
/// one scope is alive, listener restarts must not preempt the session.
pub struct DirectTransportSessionScope {
    runtime: Arc<AcceptorRuntimeState>,
}

impl Drop for DirectTransportSessionScope {
    fn drop(&mut self) {
        self.runtime
            .direct_transport_sessions
            .fetch_sub(1, Ordering::AcqRel);
    }
}

impl AcceptorRuntimeState {
    pub fn new() -> Self {
        let (vault_unlock_tx, _) = tokio::sync::watch::channel(0);
        Self {
            inner: Mutex::new(None),
            revoked_peer_ids: Mutex::new(HashSet::new()),
            acceptor_generation: AtomicU64::new(0),
            direct_transport_sessions: AtomicU64::new(0),
            vault_unlock_tx,
        }
    }

    pub fn notify_vault_unlocked(&self) {
        self.vault_unlock_tx.send_modify(|generation| {
            *generation = generation.wrapping_add(1);
        });
    }

    pub fn subscribe_vault_unlocks(&self) -> tokio::sync::watch::Receiver<u64> {
        self.vault_unlock_tx.subscribe()
    }

    pub fn direct_transport_session_scope(self: &Arc<Self>) -> DirectTransportSessionScope {
        self.direct_transport_sessions
            .fetch_add(1, Ordering::AcqRel);
        DirectTransportSessionScope {
            runtime: Arc::clone(self),
        }
    }

    pub fn has_active_direct_transport_session(&self) -> bool {
        self.direct_transport_sessions.load(Ordering::Acquire) > 0
    }

    pub fn with_acceptor<F, R>(&self, f: F) -> Result<R, String>
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

    pub fn begin_listener_session(
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

    pub fn begin_direct_transport_session(&self, label: String) -> Result<u64, String> {
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

    pub fn store_listener_task(
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

    pub fn cancel_all_tasks(&self) -> Result<AcceptorStatus, String> {
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

    pub fn is_generation_current(&self, generation: u64) -> bool {
        self.acceptor_generation.load(Ordering::Acquire) == generation
    }

    pub fn clear_listener_task_if_current(&self, generation: u64) -> Result<(), String> {
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

    pub fn with_acceptor_if_current<F, R>(&self, generation: u64, f: F) -> Result<Option<R>, String>
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

    pub fn add_peer_if_current(
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

    pub fn clear_peer_revocation(&self, peer_id: &str) -> Result<(), String> {
        self.revoked_peer_ids
            .lock()
            .map_err(|_| "Revoked peer guard mutex poisoned".to_string())?
            .remove(peer_id);
        Ok(())
    }

    pub fn is_peer_revoked(&self, peer_id: &str) -> Result<bool, String> {
        self.revoked_peer_ids
            .lock()
            .map(|revoked| revoked.contains(peer_id))
            .map_err(|_| "Revoked peer guard mutex poisoned".to_string())
    }

    /// Deny late registration, remove the active peer, invalidate platform approvals,
    /// then disconnect. Cleanup errors are reported only after disconnect is attempted.
    /// The callback runs without the runtime locks held and must not reauthorize peers.
    pub fn revoke_peer_access(
        &self,
        peer_id: &str,
        invalidate_platform_approvals: impl FnOnce() -> Result<(), String>,
    ) -> Result<PeerRevocationResult, String> {
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

        // Platform approvals must be invalidated before signalling the connection. Their
        // failure must not detach the task we just removed from the runtime's ownership.
        let approval_result = invalidate_platform_approvals();
        let disconnect_result = Self::disconnect_revoked_peer(connected, connection);
        approval_result?;
        Ok(disconnect_result)
    }

    fn disconnect_revoked_peer(
        connected: bool,
        connection: Option<PeerConnection>,
    ) -> PeerRevocationResult {
        let Some(mut connection) = connection else {
            return if connected {
                PeerRevocationResult::DisconnectFailed
            } else {
                PeerRevocationResult::NotConnected
            };
        };
        connection.conn_mgr.disconnect();
        let signalled = connection
            .shutdown_tx
            .take()
            .is_some_and(|shutdown| shutdown.send(()).is_ok());
        if signalled {
            PeerRevocationResult::DisconnectSignalled
        } else {
            if let Some(handle) = connection.task_handle.take() {
                handle.abort();
            }
            PeerRevocationResult::DisconnectFailed
        }
    }

    pub fn store_peer_task_if_current(
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

    pub fn remove_peer_if_current(&self, generation: u64, peer_id: &str) -> Result<bool, String> {
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

impl Default for AcceptorRuntimeState {
    fn default() -> Self {
        Self::new()
    }
}
