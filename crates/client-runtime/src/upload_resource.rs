//! Exclusive upload admission and deferred Core cleanup shared by local and peer writers.
use super::*;

#[derive(Clone, Copy, PartialEq, Eq)]
pub(super) enum WritePhase {
    Ready,
    Preparing,
    Committed,
    Closed,
}

pub(super) struct WriteState {
    pub(super) phase: WritePhase,
    pub(super) request_id: Option<RequestKey>,
    pub(super) node_id: Option<u64>,
    pub(super) uploaded: u64,
    pub(super) cleanup_queued: bool,
}

pub(super) struct UploadResource {
    pub(super) inner: Arc<Inner>,
    pub(super) dispatcher: CoreRpcDispatcher,
    pub(super) generation: u64,
    pub(super) state: Mutex<WriteState>,
}

impl UploadResource {
    /// Reserve the one Core upload transaction before any caller can stage bytes.
    pub(super) fn reserve(
        session: &LocalSession,
        authority: &mut Authority,
        generation: u64,
    ) -> Result<Arc<Self>, SessionError> {
        if !authority.accepts(generation) || authority.snapshot.phase != SessionPhase::Unlocked {
            return Err(SessionError::Revoked);
        }
        authority.file_writers.retain(|resource| {
            resource
                .upgrade()
                .is_some_and(|resource| resource.generation == generation)
        });
        if !authority.file_writers.is_empty() {
            return Err(SessionError::Busy);
        }
        let resource = Arc::new(Self {
            inner: session.inner.clone(),
            dispatcher: session.dispatcher.clone(),
            generation,
            state: Mutex::new(WriteState {
                phase: WritePhase::Ready,
                request_id: None,
                node_id: None,
                uploaded: 0,
                cleanup_queued: false,
            }),
        });
        authority.file_writers.push(Arc::downgrade(&resource));
        Ok(resource)
    }

    pub(super) fn revoke(&self) {
        let mut state = self
            .state
            .lock()
            .unwrap_or_else(std::sync::PoisonError::into_inner);
        if state.phase != WritePhase::Committed {
            state.phase = WritePhase::Closed;
        }
    }

    pub(super) fn schedule_cleanup(self: &Arc<Self>) -> Result<(), SessionError> {
        let mut state = self.state.lock().map_err(|_| SessionError::Unavailable)?;
        if state.phase != WritePhase::Closed || state.cleanup_queued {
            return Ok(());
        }
        // Publish the queued flag atomically with enqueueing, so a concurrent
        // cancel_and_wait cannot place its fence ahead of the cleanup job.
        let resource = self.clone();
        self.dispatcher
            .schedule_adapter_phase(
                CoreRpcPriority::PrivacyCritical,
                "catalog:upload:abort",
                "file_writer_cleanup",
                self.dispatcher.low_priority_cancellation_generation(),
                move || {
                    let current = resource
                        .inner
                        .authority
                        .lock()
                        .map(|authority| {
                            authority.accepts(resource.generation)
                                && authority.snapshot.phase == SessionPhase::Unlocked
                        })
                        .unwrap_or(false);
                    // A generation change schedules session cleanup before allowing another unlock.
                    if !current {
                        return;
                    }
                    let cleaned = resource
                        .inner
                        .adapter
                        .lock()
                        .map(|mut adapter| {
                            if resource.cleanup(&mut adapter) {
                                true
                            } else {
                                adapter.handle(&RpcRequest::new(
                                    "vault:lock",
                                    serde_json::Value::Null,
                                ));
                                false
                            }
                        })
                        .unwrap_or(false);
                    if !cleaned {
                        if let Ok(mut authority) = resource.inner.authority.lock() {
                            authority.revoke();
                            authority.snapshot.phase = SessionPhase::Failed;
                            authority.emit(SessionEventKind::Lifecycle, &resource.inner.changed);
                        }
                    }
                },
            )
            .map_err(|_| SessionError::Unavailable)?;
        state.cleanup_queued = true;
        Ok(())
    }

    /// Called on the Core worker, never while holding Authority or the resource mutex.
    fn cleanup(&self, adapter: &mut LocalCoreAdapter) -> bool {
        let node_id = {
            let state = self
                .state
                .lock()
                .unwrap_or_else(std::sync::PoisonError::into_inner);
            if state.phase != WritePhase::Closed {
                return true;
            }
            state.node_id
        };
        // LocalSession owns its private adapter and admits only one writer. Before the
        // first response a failed marker write may not have returned its reserved node ID.
        let response = adapter.handle(&RpcRequest::new(
            "catalog:upload:abort",
            serde_json::json!({"node_id":node_id}),
        ));
        response.is_ok()
    }
}

pub(super) fn cancel_resource_request(authority: &Authority, request_id: RequestKey) {
    for resource in authority
        .file_writers
        .iter()
        .filter_map(|resource| resource.upgrade())
    {
        let mut state = resource
            .state
            .lock()
            .unwrap_or_else(std::sync::PoisonError::into_inner);
        if state.request_id == Some(request_id) && state.phase != WritePhase::Committed {
            state.phase = WritePhase::Closed;
        }
    }
}

pub(super) fn schedule_closed_resources(inner: &Arc<Inner>) -> Result<(), SessionError> {
    let resources: Vec<_> = inner
        .authority
        .lock()
        .map_err(|_| SessionError::Unavailable)?
        .file_writers
        .iter()
        .filter_map(|resource| resource.upgrade())
        .collect();
    for resource in resources {
        resource.schedule_cleanup()?;
    }
    Ok(())
}

pub(super) fn cleanup_resources(inner: &Arc<Inner>, adapter: &mut LocalCoreAdapter) -> bool {
    let resources: Vec<_> = inner
        .authority
        .lock()
        .unwrap_or_else(std::sync::PoisonError::into_inner)
        .file_writers
        .iter()
        .filter_map(|resource| resource.upgrade())
        .collect();
    resources.iter().all(|resource| resource.cleanup(adapter))
}
