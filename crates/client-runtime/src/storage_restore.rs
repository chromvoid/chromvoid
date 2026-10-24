//! Reviewed restore with bounded worker-owned source ingestion and consuming confirmation.
use super::*;
pub use chromvoid_core::rpc::{
    LocalRestoreArtifact, LocalRestorePreview, MAX_RESTORE_APPEND_BYTES,
};
use chromvoid_core::rpc::{LocalRestoreInput, PreparedLocalRestore, RpcResponse};
use std::time::Instant;
use zeroize::Zeroizing;

#[derive(Debug, thiserror::Error, PartialEq, Eq)]
pub enum RestoreError {
    #[error(transparent)]
    Session(#[from] SessionError),
    #[error("Restore is not ready for this operation")]
    State,
    #[error("Restore input chunk exceeds limit")]
    TooLarge,
    #[error("Restore review has expired; select the backup again")]
    Expired,
}

enum RestoreStage {
    Receiving,
    Working(u64),
    Reviewed(LocalRestorePreview),
    Completed,
    Closed,
}

struct RestoreState {
    stage: RestoreStage,
    last_request: u64,
    last_activity: Instant,
}

// These values are created, used and dropped only on the serial worker.
#[derive(Default)]
enum RestoreSource {
    #[default]
    Empty,
    Receiving(LocalRestoreInput),
    Reviewed(PreparedLocalRestore),
}

pub(super) struct RestoreResource {
    inner: Arc<Inner>,
    dispatcher: CoreRpcDispatcher,
    generation: u64,
    state: Mutex<RestoreState>,
    // Only the serial worker reads or closes files. Authority never waits for disk I/O.
    source: Mutex<RestoreSource>,
    cleanup_queued: Mutex<bool>,
}

impl RestoreResource {
    pub(super) fn revoke(&self) {
        self.state
            .lock()
            .unwrap_or_else(std::sync::PoisonError::into_inner)
            .stage = RestoreStage::Closed;
    }

    fn check_expiry(&self) -> Result<(), RestoreError> {
        let mut state = self.state.lock().map_err(|_| SessionError::Unavailable)?;
        if state.last_activity.elapsed() > LocalRestoreInput::idle_timeout() {
            state.stage = RestoreStage::Closed;
            return Err(RestoreError::Expired);
        }
        Ok(())
    }

    fn schedule_cleanup(self: &Arc<Self>) -> Result<(), SessionError> {
        let mut queued = self
            .cleanup_queued
            .lock()
            .map_err(|_| SessionError::Unavailable)?;
        if *queued {
            return Ok(());
        }
        let resource = self.clone();
        let result = self.dispatcher.schedule_adapter_phase(
            CoreRpcPriority::PrivacyCritical,
            "restore:local:cancel",
            "storage_restore_cleanup",
            self.dispatcher.low_priority_cancellation_generation(),
            move || resource.cleanup(),
        );
        if result.is_err() {
            return Err(SessionError::Unavailable);
        }
        *queued = true;
        Ok(())
    }

    fn cleanup(&self) {
        *self
            .source
            .lock()
            .unwrap_or_else(std::sync::PoisonError::into_inner) = RestoreSource::Empty;
    }
}

pub struct RestoreHandle {
    resource: Arc<RestoreResource>,
}

impl RestoreHandle {
    /// Fence deferred file cleanup before the caller starts another restore attempt.
    pub async fn cancel_and_wait(&self) -> Result<(), RestoreError> {
        self.cancel()?;
        self.resource
            .dispatcher
            .run_adapter_phase(
                CoreRpcPriority::PrivacyCritical,
                "restore:local:cancel",
                "storage_restore_cleanup_wait",
                self.resource
                    .dispatcher
                    .low_priority_cancellation_generation(),
                || (),
            )
            .await
            .map_err(|_| SessionError::Unavailable)?;
        Ok(())
    }

    fn check(&self, authority: &Authority) -> Result<(), SessionError> {
        if !authority.accepts(self.resource.generation) {
            return Err(SessionError::Revoked);
        }
        Ok(())
    }

    pub fn preview(&self) -> Result<LocalRestorePreview, RestoreError> {
        let authority = self
            .resource
            .inner
            .authority
            .lock()
            .map_err(|_| SessionError::Unavailable)?;
        self.check(&authority)?;
        if let Err(error) = self.resource.check_expiry() {
            drop(authority);
            self.resource.schedule_cleanup()?;
            return Err(error);
        }
        let state = self
            .resource
            .state
            .lock()
            .map_err(|_| SessionError::Unavailable)?;
        match &state.stage {
            RestoreStage::Reviewed(preview) => Ok(preview.clone()),
            _ => Err(RestoreError::State),
        }
    }

    pub fn cancel(&self) -> Result<(), RestoreError> {
        let authority = self
            .resource
            .inner
            .authority
            .lock()
            .map_err(|_| SessionError::Unavailable)?;
        {
            let state = self
                .resource
                .state
                .lock()
                .map_err(|_| SessionError::Unavailable)?;
            if let RestoreStage::Working(id) = state.stage {
                if let Some(request) = authority.pending.get(&RequestKey::Native(id)) {
                    request.cancel.store(true, Ordering::Release);
                }
            }
        }
        self.resource.revoke();
        drop(authority);
        self.resource.schedule_cleanup()?;
        Ok(())
    }
}

impl Drop for RestoreHandle {
    fn drop(&mut self) {
        let _ = self.cancel();
    }
}

impl LocalSession {
    pub fn begin_storage_restore(&self, generation: u64) -> Result<RestoreHandle, RestoreError> {
        self.ensure_storage_mutation_allowed()?;
        let mut authority = self
            .inner
            .authority
            .lock()
            .map_err(|_| SessionError::Unavailable)?;
        if !authority.accepts(generation) {
            return Err(SessionError::Revoked.into());
        }
        authority
            .restores
            .retain(|resource| resource.strong_count() > 0);
        if !authority.restores.is_empty() {
            return Err(SessionError::Busy.into());
        }
        let resource = Arc::new(RestoreResource {
            inner: self.inner.clone(),
            dispatcher: self.dispatcher.clone(),
            generation,
            state: Mutex::new(RestoreState {
                stage: RestoreStage::Receiving,
                last_request: 0,
                last_activity: Instant::now(),
            }),
            source: Mutex::new(RestoreSource::Empty),
            cleanup_queued: Mutex::new(false),
        });
        authority.restores.push(Arc::downgrade(&resource));
        Ok(RestoreHandle { resource })
    }

    pub fn append_storage_restore(
        &self,
        request_id: u64,
        handle: &RestoreHandle,
        artifact: LocalRestoreArtifact,
        bytes: Vec<u8>,
    ) -> Result<AdmittedRequest, RestoreError> {
        let bytes = Zeroizing::new(bytes);
        if bytes.len() > MAX_RESTORE_APPEND_BYTES {
            return Err(RestoreError::TooLarge);
        }
        self.admit_restore_work(
            request_id,
            handle,
            RestoreOperation::Append(artifact, bytes),
        )
    }

    pub fn review_storage_restore(
        &self,
        request_id: u64,
        handle: &RestoreHandle,
        master_password: String,
    ) -> Result<AdmittedRequest, RestoreError> {
        self.admit_restore_work(
            request_id,
            handle,
            RestoreOperation::Review(Zeroizing::new(master_password)),
        )
    }

    /// Explicit confirmation consumes the reviewed source; an uncertain result is never replayed.
    pub fn commit_storage_restore(
        &self,
        request_id: u64,
        handle: &RestoreHandle,
    ) -> Result<AdmittedRequest, RestoreError> {
        self.admit_restore_work(request_id, handle, RestoreOperation::Commit)
    }

    fn admit_restore_work(
        &self,
        request_id: u64,
        handle: &RestoreHandle,
        operation: RestoreOperation,
    ) -> Result<AdmittedRequest, RestoreError> {
        self.ensure_storage_mutation_allowed()?;
        if !Arc::ptr_eq(&self.inner, &handle.resource.inner) {
            return Err(SessionError::RequestId.into());
        }
        let mut authority = self
            .inner
            .authority
            .lock()
            .map_err(|_| SessionError::Unavailable)?;
        handle.check(&authority)?;
        if let Err(error) = handle.resource.check_expiry() {
            drop(authority);
            handle.resource.schedule_cleanup()?;
            return Err(error);
        }
        let mut state = handle
            .resource
            .state
            .lock()
            .map_err(|_| SessionError::Unavailable)?;
        let command = match (&operation, &state.stage) {
            (RestoreOperation::Append(..), RestoreStage::Receiving) => "restore:local:uploadPack",
            (RestoreOperation::Review(_), RestoreStage::Receiving) => {
                "restore:local:validatePayload"
            }
            (RestoreOperation::Commit, RestoreStage::Reviewed(_)) => "restore:local:commit",
            _ => return Err(RestoreError::State),
        };
        let mut admitted = self.admit_locked(
            &mut authority,
            request_id,
            handle.resource.generation,
            OwnedRequest(RpcRequest::new(command, serde_json::Value::Null)),
        )?;
        state.stage = RestoreStage::Working(request_id);
        state.last_request = request_id;
        admitted.resource_work = Some(ResourceWork::Restore(RestoreWork {
            resource: handle.resource.clone(),
            request_id,
            cancel: admitted.cancel.clone(),
            operation,
            prepared: None,
        }));
        Ok(admitted)
    }
}

enum RestoreOperation {
    Append(LocalRestoreArtifact, Zeroizing<Vec<u8>>),
    Review(Zeroizing<String>),
    Commit,
}

pub(super) struct RestoreWork {
    resource: Arc<RestoreResource>,
    request_id: u64,
    cancel: Arc<AtomicBool>,
    operation: RestoreOperation,
    prepared: Option<RestoreStage>,
}

impl RestoreWork {
    pub(super) fn execute(&mut self, adapter: &mut LocalCoreAdapter) -> OwnedRpcResponse {
        OwnedRpcResponse(match self.run(adapter) {
            Ok((stage, value)) => {
                self.prepared = Some(stage);
                RpcResponse::success(value)
            }
            Err(error) => error,
        })
    }

    fn run(
        &mut self,
        adapter: &mut LocalCoreAdapter,
    ) -> Result<(RestoreStage, serde_json::Value), RpcResponse> {
        adapter.ensure_storage_mutation_allowed()?;
        if let Err(error) = self.resource.check_expiry() {
            let code = if error == RestoreError::Expired {
                "EXPIRED"
            } else {
                "INTERNAL_ERROR"
            };
            return Err(RpcResponse::error(error.to_string(), Some(code)));
        }
        let invalid =
            || RpcResponse::error("Restore source is unavailable", Some("INTERNAL_ERROR"));
        let mut source = self.resource.source.lock().map_err(|_| invalid())?;
        let cancel = || self.cancel.load(Ordering::Acquire);
        match &mut self.operation {
            RestoreOperation::Append(artifact, bytes) => {
                if matches!(*source, RestoreSource::Empty) {
                    *source = RestoreSource::Receiving(LocalRestoreInput::new()?);
                }
                let RestoreSource::Receiving(input) = &mut *source else {
                    return Err(invalid());
                };
                input.append(*artifact, bytes)?;
                Ok((RestoreStage::Receiving, serde_json::Value::Null))
            }
            RestoreOperation::Review(password) => {
                let RestoreSource::Receiving(input) = std::mem::take(&mut *source) else {
                    return Err(invalid());
                };
                let prepared = adapter.prepare_local_restore(
                    input,
                    std::mem::take(&mut **password),
                    &cancel,
                )?;
                let preview = prepared.preview().clone();
                *source = RestoreSource::Reviewed(prepared);
                Ok((RestoreStage::Reviewed(preview), serde_json::Value::Null))
            }
            RestoreOperation::Commit => {
                let RestoreSource::Reviewed(prepared) = std::mem::take(&mut *source) else {
                    return Err(invalid());
                };
                let result = adapter.commit_local_restore(prepared, &cancel)?;
                Ok((RestoreStage::Completed, result))
            }
        }
    }

    pub(super) fn publish(&mut self) -> Result<(), SessionError> {
        let mut state = self
            .resource
            .state
            .lock()
            .map_err(|_| SessionError::Unavailable)?;
        if !matches!(state.stage, RestoreStage::Working(id) if id == self.request_id) {
            return Err(SessionError::Canceled);
        }
        if let Some(prepared) = self.prepared.take() {
            state.stage = prepared;
            state.last_activity = Instant::now();
        }
        // On failure Drop closes the resource and schedules worker cleanup.
        Ok(())
    }
}

impl Drop for RestoreWork {
    fn drop(&mut self) {
        let mut state = self
            .resource
            .state
            .lock()
            .unwrap_or_else(std::sync::PoisonError::into_inner);
        if matches!(state.stage, RestoreStage::Working(id) if id == self.request_id) {
            state.stage = RestoreStage::Closed;
        }
        let closed = matches!(state.stage, RestoreStage::Closed);
        drop(state);
        if closed {
            let _ = self.resource.schedule_cleanup();
        }
    }
}

pub(super) fn cancel_resource_request(authority: &Authority, request_id: u64) {
    for resource in authority
        .restores
        .iter()
        .filter_map(|resource| resource.upgrade())
    {
        let mut state = resource
            .state
            .lock()
            .unwrap_or_else(std::sync::PoisonError::into_inner);
        if state.last_request == request_id {
            state.stage = RestoreStage::Closed;
        }
    }
}

pub(super) fn schedule_closed_resources(inner: &Arc<Inner>) -> Result<(), SessionError> {
    let resources: Vec<_> = inner
        .authority
        .lock()
        .map_err(|_| SessionError::Unavailable)?
        .restores
        .iter()
        .filter_map(|resource| resource.upgrade())
        .collect();
    for resource in resources {
        let closed = matches!(
            resource
                .state
                .lock()
                .map_err(|_| SessionError::Unavailable)?
                .stage,
            RestoreStage::Closed
        );
        if closed {
            resource.schedule_cleanup()?;
        }
    }
    Ok(())
}

pub(super) fn cleanup_resources(inner: &Arc<Inner>) {
    let resources: Vec<_> = inner
        .authority
        .lock()
        .unwrap_or_else(std::sync::PoisonError::into_inner)
        .restores
        .iter()
        .filter_map(|resource| resource.upgrade())
        .collect();
    for resource in resources {
        resource.cleanup();
    }
}

#[cfg(test)]
#[path = "storage_restore_tests.rs"]
mod tests;
