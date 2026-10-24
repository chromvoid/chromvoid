//! Generation-bound admission for an already authorized host peer.
//! This Rust capability is not pairing authorization and is never exported to Swift.
use super::*;
use chromvoid_core::rpc::types::RpcResponse;
use std::sync::Weak;

pub(super) struct PeerAuthority {
    pub(super) last_request: u64,
    pub(super) closed: bool,
    pub(super) catalog_subscribed: bool,
    pub(super) catalog_events: VecDeque<serde_json::Value>,
}

pub(super) struct PeerLease {
    pub(super) id: u64,
    pub(super) generation: u64,
    pub(super) inner: Arc<Inner>,
    dispatcher: CoreRpcDispatcher,
    import_id: Mutex<Option<String>>,
    pub(super) closed: watch::Sender<bool>,
    pub(super) upload: Mutex<Option<super::peer_upload::PeerUploadTransaction>>,
}

/// One authorized connection, with its own request sequence and cancellation namespace.
/// The host must close it on disconnect/revoke. Lock/background invalidate its generation;
/// a later connection requires a new capability after host authorization.
/// Holding this object cannot keep the application's LocalSession alive.
pub struct PeerSession {
    pub(super) session: Weak<LocalSession>,
    lease: Mutex<Option<Arc<PeerLease>>>,
}

impl LocalSession {
    /// Called by Rust host orchestration only after authenticating and admitting the peer.
    /// Core authority is still checked here and again when the queued operation starts.
    pub fn open_peer_session(
        self: &Arc<Self>,
        generation: u64,
    ) -> Result<PeerSession, SessionError> {
        let mut authority = self
            .inner
            .authority
            .lock()
            .map_err(|_| SessionError::Unavailable)?;
        if !authority.accepts(generation) {
            return Err(SessionError::Revoked);
        }
        if authority.peer_sessions.len() >= MAX_PENDING {
            return Err(SessionError::Busy);
        }
        let id = authority
            .next_peer_session
            .checked_add(1)
            .ok_or(SessionError::Unavailable)?;
        authority.next_peer_session = id;
        authority.peer_sessions.insert(
            id,
            PeerAuthority {
                last_request: 0,
                closed: false,
                catalog_subscribed: false,
                catalog_events: VecDeque::new(),
            },
        );
        Ok(PeerSession {
            session: Arc::downgrade(self),
            lease: Mutex::new(Some(Arc::new(PeerLease {
                id,
                generation,
                inner: self.inner.clone(),
                dispatcher: self.dispatcher.clone(),
                import_id: Mutex::new(None),
                closed: watch::channel(false).0,
                upload: Mutex::new(None),
            }))),
        })
    }
}

impl PeerSession {
    pub(super) fn lease(&self) -> Result<Arc<PeerLease>, SessionError> {
        self.lease
            .lock()
            .map_err(|_| SessionError::Unavailable)?
            .clone()
            .ok_or(SessionError::Revoked)
    }

    /// Wait without holding Core or keeping the application's LocalSession alive.
    pub(super) async fn next_catalog_event(&self) -> Result<serde_json::Value, SessionError> {
        let peer = self.lease()?;
        let mut changed = peer.inner.changed.subscribe();
        loop {
            {
                let mut authority = peer
                    .inner
                    .authority
                    .lock()
                    .map_err(|_| SessionError::Unavailable)?;
                // The outer serve-loop revocation owns shutdown and USB farewells.
                if authority.accepts(peer.generation) {
                    if let Some(event) = authority
                        .peer_sessions
                        .get_mut(&peer.id)
                        .filter(|state| !state.closed)
                        .and_then(|state| state.catalog_events.pop_front())
                    {
                        return Ok(event);
                    }
                }
            }
            changed
                .changed()
                .await
                .map_err(|_| SessionError::Unavailable)?;
        }
    }

    /// The connection loop can wait while idle without keeping LocalSession alive.
    pub(super) fn revoked(&self) -> impl std::future::Future<Output = ()> + Send + use<> {
        let lease = self.lease();
        async move {
            let Ok(peer) = lease else {
                return;
            };
            let mut changed = peer.inner.changed.subscribe();
            let mut closed = peer.closed.subscribe();
            loop {
                let valid = peer.inner.authority.lock().is_ok_and(|authority| {
                    authority.accepts(peer.generation)
                        && authority
                            .peer_sessions
                            .get(&peer.id)
                            .is_some_and(|state| !state.closed)
                });
                if !valid || *closed.borrow() {
                    return;
                }
                tokio::select! {
                    _ = changed.changed() => {},
                    _ = closed.changed() => return,
                }
            }
        }
    }

    pub fn admit(
        &self,
        request_id: u64,
        request: RpcRequest,
    ) -> Result<AdmittedRequest, SessionError> {
        let request = OwnedRequest(request);
        let session = self.session.upgrade().ok_or(SessionError::Revoked)?;
        let peer = self.lease()?;
        let mut authority = session
            .inner
            .authority
            .lock()
            .map_err(|_| SessionError::Unavailable)?;
        // Keep one lease outside the authority guard: a failed concurrent admission
        // must not run the final lease destructor while this mutex is still held.
        let abort = request.0.command == "catalog:upload:abort";
        let mut admitted = session.admit_with_peer_locked(
            &mut authority,
            request_id,
            peer.generation,
            request,
            Some(peer.clone()),
        )?;
        if abort {
            admitted.resource_work = Some(ResourceWork::PeerUploadAbort(Arc::downgrade(&peer)));
        }
        Ok(admitted)
    }

    pub async fn execute(
        &self,
        request_id: u64,
        request: RpcRequest,
    ) -> Result<OwnedRpcResponse, SessionError> {
        let admitted = self.admit(request_id, request)?;
        let execution = {
            let session = self.session.upgrade().ok_or(SessionError::Revoked)?;
            session.execute_admitted(admitted)
        };
        execution.await
    }

    pub fn cancel(&self, request_id: u64) -> Result<(), SessionError> {
        let session = self.session.upgrade().ok_or(SessionError::Revoked)?;
        let peer = self.lease()?;
        session.cancel_request(RequestKey::Peer {
            scope: peer.id,
            request: request_id,
        })?;
        peer.cancel_upload_request(request_id)
    }

    /// Explicit peer lock uses the shared lifecycle, not ordinary RPC admission.
    pub fn lock(&self) -> Result<SessionSnapshot, SessionError> {
        let session = self.session.upgrade().ok_or(SessionError::Revoked)?;
        let peer = self.lease()?;
        {
            let authority = session
                .inner
                .authority
                .lock()
                .map_err(|_| SessionError::Unavailable)?;
            if !authority.accepts(peer.generation)
                || authority
                    .peer_sessions
                    .get(&peer.id)
                    .is_none_or(|state| state.closed)
            {
                return Err(SessionError::Revoked);
            }
        }
        session.revoke(true, false, Some(peer.generation))
    }

    /// Stop admission now. The final pending request retains resource cleanup until its
    /// worker completes, even if its future or this connection has already disappeared.
    pub fn close(&self) -> Result<(), SessionError> {
        let Some(peer) = self
            .lease
            .lock()
            .map_err(|_| SessionError::Unavailable)?
            .take()
        else {
            return Ok(());
        };
        let activation = {
            let mut authority = peer
                .inner
                .authority
                .lock()
                .map_err(|_| SessionError::Unavailable)?;
            if let Some(state) = authority.peer_sessions.get_mut(&peer.id) {
                state.closed = true;
                state.catalog_events.clear();
            }
            peer.closed.send_replace(true);
            let mut activation = false;
            for (key, request) in &authority.pending {
                if matches!(key, RequestKey::Peer { scope, .. } if *scope == peer.id) {
                    request.revoke();
                    activation |= request.activation;
                }
            }
            activation
        };
        peer.abort_upload()?;
        if activation {
            if let Some(session) = self.session.upgrade() {
                session.revoke(true, false, Some(peer.generation))?;
            }
        }
        Ok(())
    }
}

impl Drop for PeerSession {
    fn drop(&mut self) {
        let _ = self.close();
    }
}

impl PeerLease {
    pub(super) fn track_import(&self, request: &RpcRequest, response: &RpcResponse) {
        if !response.is_ok() {
            return;
        }
        let mut import_id = self
            .import_id
            .lock()
            .unwrap_or_else(std::sync::PoisonError::into_inner);
        if request.command == "passmanager:import:start" {
            if let Some(id) = response
                .result()
                .and_then(|value| value.get("import_id"))
                .and_then(|value| value.as_str())
            {
                *import_id = Some(id.to_owned());
            }
        } else if matches!(
            request.command.as_str(),
            "passmanager:import:commit" | "passmanager:import:cancel"
        ) {
            if let Some(id) = request
                .data
                .get("import_id")
                .and_then(|value| value.as_str())
            {
                if import_id.as_deref() == Some(id) {
                    *import_id = None;
                }
            }
        }
    }
}

impl Drop for PeerLease {
    fn drop(&mut self) {
        let _ = self.abort_upload();
        self.inner
            .authority
            .lock()
            .unwrap_or_else(std::sync::PoisonError::into_inner)
            .peer_sessions
            .remove(&self.id);
        // Core admits one active import. A successful replacement start means the
        // previous token has already expired or been consumed in the shared owner.
        let Some(id) = self
            .import_id
            .get_mut()
            .unwrap_or_else(std::sync::PoisonError::into_inner)
            .take()
        else {
            return;
        };
        let inner = self.inner.clone();
        let queued = self.dispatcher.schedule_adapter_phase(
            CoreRpcPriority::PrivacyCritical,
            "passmanager:import:cancel",
            "peer_import_cleanup",
            self.dispatcher.low_priority_cancellation_generation(),
            move || {
                if let Ok(mut adapter) = inner.adapter.lock() {
                    adapter.handle(&RpcRequest::new(
                        "passmanager:import:cancel",
                        serde_json::json!({"import_id": id}),
                    ));
                }
            },
        );
        if queued.is_err() {
            tracing::warn!("peer import cleanup could not enter the Core dispatcher");
        }
    }
}
