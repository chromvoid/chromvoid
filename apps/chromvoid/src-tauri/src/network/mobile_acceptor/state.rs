use std::sync::atomic::{AtomicU64, Ordering};
use std::sync::Mutex;

use super::super::connection::NetworkConnectionManager;
use super::{AcceptorState, AcceptorStatus, ConnectedPeer};

/// Per-peer connection tracking: NetworkConnectionManager for state + shutdown handle.
pub(super) struct PeerConnection {
    pub(super) conn_mgr: NetworkConnectionManager,
    pub(super) generation: u64,
    pub(super) shutdown_tx: Option<tokio::sync::oneshot::Sender<()>>,
    pub(super) task_handle: Option<tokio::task::JoinHandle<()>>,
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
    acceptor_generation: AtomicU64,
}

impl MobileAcceptorRuntimeState {
    pub fn new() -> Self {
        Self {
            inner: Mutex::new(None),
            acceptor_generation: AtomicU64::new(0),
        }
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
    ) -> Result<bool, String> {
        self.with_acceptor_if_current(generation, |a| {
            a.connected_peers.push(peer.clone());
            a.peer_connections.push((peer.peer_id, connection));
            a.state = AcceptorState::Connected;
        })
        .map(|result| result.is_some())
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

impl Default for MobileAcceptorRuntimeState {
    fn default() -> Self {
        Self::new()
    }
}
