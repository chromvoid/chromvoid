//! Authenticated, immutable storage backup with worker-owned file reads and cleanup.
use super::*;
use chromvoid_core::rpc::{RpcOutputStream, RpcStreamMeta};
use std::io::Read;
use zeroize::Zeroizing;

pub const MAX_BACKUP_READ_BYTES: usize = 64 * 1024;

#[derive(Debug, thiserror::Error, PartialEq, Eq)]
pub enum BackupError {
    #[error(transparent)]
    Session(#[from] SessionError),
    #[error("Backup is not ready for this operation")]
    State,
    #[error("Unknown backup artifact")]
    Artifact,
}

enum BackupState {
    Idle,
    Preparing(u64),
    Ready {
        request_id: u64,
        artifacts: Vec<RpcStreamMeta>,
        chunk: Option<Zeroizing<Vec<u8>>>,
    },
    Closed,
}

struct BackupReader {
    stream: RpcOutputStream,
    remaining: u64,
}

pub(super) struct BackupResource {
    inner: Arc<Inner>,
    dispatcher: CoreRpcDispatcher,
    generation: u64,
    state: Mutex<BackupState>,
    // Only the serial worker reads or closes files. Authority never waits for disk I/O.
    readers: Mutex<Vec<BackupReader>>,
    cleanup_queued: Mutex<bool>,
}

impl BackupResource {
    pub(super) fn revoke(&self) {
        *self
            .state
            .lock()
            .unwrap_or_else(std::sync::PoisonError::into_inner) = BackupState::Closed;
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
            "backup:local:cancel",
            "storage_backup_cleanup",
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
        self.readers
            .lock()
            .unwrap_or_else(std::sync::PoisonError::into_inner)
            .clear();
    }
}

pub struct BackupHandle {
    resource: Arc<BackupResource>,
}

impl BackupHandle {
    /// Fence deferred file cleanup before the caller starts another backup attempt.
    pub async fn cancel_and_wait(&self) -> Result<(), BackupError> {
        self.cancel()?;
        self.resource
            .dispatcher
            .run_adapter_phase(
                CoreRpcPriority::PrivacyCritical,
                "backup:local:cancel",
                "storage_backup_cleanup_wait",
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

    pub fn artifacts(&self) -> Result<Vec<RpcStreamMeta>, BackupError> {
        let authority = self
            .resource
            .inner
            .authority
            .lock()
            .map_err(|_| SessionError::Unavailable)?;
        self.check(&authority)?;
        let state = self
            .resource
            .state
            .lock()
            .map_err(|_| SessionError::Unavailable)?;
        match &*state {
            BackupState::Ready { artifacts, .. } => Ok(artifacts.clone()),
            _ => Err(BackupError::State),
        }
    }

    pub fn take_chunk(&self) -> Result<Vec<u8>, BackupError> {
        let authority = self
            .resource
            .inner
            .authority
            .lock()
            .map_err(|_| SessionError::Unavailable)?;
        self.check(&authority)?;
        let mut state = self
            .resource
            .state
            .lock()
            .map_err(|_| SessionError::Unavailable)?;
        match &mut *state {
            BackupState::Ready { chunk, .. } => chunk
                .take()
                .map(|mut bytes| std::mem::take(&mut *bytes))
                .ok_or(BackupError::State),
            _ => Err(BackupError::State),
        }
    }

    pub fn cancel(&self) -> Result<(), BackupError> {
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
            if let BackupState::Preparing(id) = *state {
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

impl Drop for BackupHandle {
    fn drop(&mut self) {
        let _ = self.cancel();
    }
}

impl LocalSession {
    pub fn begin_storage_backup(&self, generation: u64) -> Result<BackupHandle, BackupError> {
        let mut authority = self
            .inner
            .authority
            .lock()
            .map_err(|_| SessionError::Unavailable)?;
        if !authority.accepts(generation) {
            return Err(SessionError::Revoked.into());
        }
        authority
            .backups
            .retain(|resource| resource.strong_count() > 0);
        if !authority.backups.is_empty() {
            return Err(SessionError::Busy.into());
        }
        let resource = Arc::new(BackupResource {
            inner: self.inner.clone(),
            dispatcher: self.dispatcher.clone(),
            generation,
            state: Mutex::new(BackupState::Idle),
            readers: Mutex::new(Vec::new()),
            cleanup_queued: Mutex::new(false),
        });
        authority.backups.push(Arc::downgrade(&resource));
        Ok(BackupHandle { resource })
    }

    pub fn prepare_storage_backup(
        &self,
        request_id: u64,
        handle: &BackupHandle,
        master_password: String,
    ) -> Result<AdmittedRequest, BackupError> {
        self.admit_backup_work(
            request_id,
            handle,
            BackupOperation::Prepare(Zeroizing::new(master_password)),
        )
    }

    /// Sequential bounded reads per artifact. A successful empty chunk means EOF.
    pub fn read_storage_backup(
        &self,
        request_id: u64,
        handle: &BackupHandle,
        artifact: usize,
    ) -> Result<AdmittedRequest, BackupError> {
        self.admit_backup_work(request_id, handle, BackupOperation::Read(artifact))
    }

    fn admit_backup_work(
        &self,
        request_id: u64,
        handle: &BackupHandle,
        operation: BackupOperation,
    ) -> Result<AdmittedRequest, BackupError> {
        if !Arc::ptr_eq(&self.inner, &handle.resource.inner) {
            return Err(SessionError::RequestId.into());
        }
        let mut authority = self
            .inner
            .authority
            .lock()
            .map_err(|_| SessionError::Unavailable)?;
        handle.check(&authority)?;
        let mut state = handle
            .resource
            .state
            .lock()
            .map_err(|_| SessionError::Unavailable)?;
        let artifacts = match (&operation, &*state) {
            (BackupOperation::Prepare(_), BackupState::Idle) => Vec::new(),
            (
                BackupOperation::Read(index),
                BackupState::Ready {
                    artifacts,
                    chunk: None,
                    ..
                },
            ) => {
                if *index >= artifacts.len() {
                    return Err(BackupError::Artifact);
                }
                artifacts.clone()
            }
            _ => return Err(BackupError::State),
        };
        let command = match &operation {
            BackupOperation::Prepare(_) => "backup:local:start",
            BackupOperation::Read(_) => "backup:local:downloadPack",
        };
        let mut admitted = self.admit_locked(
            &mut authority,
            request_id,
            handle.resource.generation,
            OwnedRequest(RpcRequest::new(command, serde_json::Value::Null)),
        )?;
        *state = BackupState::Preparing(request_id);
        admitted.resource_work = Some(ResourceWork::Backup(BackupWork {
            resource: handle.resource.clone(),
            request_id,
            cancel: admitted.cancel.clone(),
            operation,
            artifacts,
            prepared: None,
        }));
        Ok(admitted)
    }
}

enum BackupOperation {
    Prepare(Zeroizing<String>),
    Read(usize),
}

pub(super) struct BackupWork {
    resource: Arc<BackupResource>,
    request_id: u64,
    cancel: Arc<AtomicBool>,
    operation: BackupOperation,
    artifacts: Vec<RpcStreamMeta>,
    prepared: Option<BackupState>,
}

impl BackupWork {
    pub(super) fn execute(&mut self, adapter: &mut LocalCoreAdapter) -> OwnedRpcResponse {
        let result = self.run(adapter);
        OwnedRpcResponse(match result {
            Ok(chunk) => {
                self.prepared = Some(BackupState::Ready {
                    request_id: self.request_id,
                    artifacts: std::mem::take(&mut self.artifacts),
                    chunk,
                });
                chromvoid_core::rpc::types::RpcResponse::success(serde_json::Value::Null)
            }
            Err(error) => error,
        })
    }

    fn run(
        &mut self,
        adapter: &mut LocalCoreAdapter,
    ) -> Result<Option<Zeroizing<Vec<u8>>>, chromvoid_core::rpc::types::RpcResponse> {
        use chromvoid_core::rpc::types::RpcResponse;
        let internal =
            || RpcResponse::error("Could not read backup artifact", Some("INTERNAL_ERROR"));
        match &mut self.operation {
            BackupOperation::Prepare(password) => {
                let snapshot = adapter
                    .prepare_local_backup(std::mem::take(&mut **password), &|| {
                        self.cancel.load(Ordering::Acquire)
                    })?;
                let streams = snapshot.into_streams();
                self.artifacts = streams.iter().map(|stream| stream.meta.clone()).collect();
                *self.resource.readers.lock().map_err(|_| internal())? = streams
                    .into_iter()
                    .map(|stream| BackupReader {
                        remaining: stream.meta.size,
                        stream,
                    })
                    .collect();
                Ok(None)
            }
            BackupOperation::Read(index) => {
                let mut readers = self.resource.readers.lock().map_err(|_| internal())?;
                let reader = readers.get_mut(*index).ok_or_else(internal)?;
                let length = reader.remaining.min(MAX_BACKUP_READ_BYTES as u64) as usize;
                let mut bytes = Zeroizing::new(vec![0; length]);
                reader
                    .stream
                    .reader
                    .read_exact(&mut bytes)
                    .map_err(|_| internal())?;
                reader.remaining -= length as u64;
                Ok(Some(bytes))
            }
        }
    }

    pub(super) fn publish(&mut self) -> Result<(), SessionError> {
        let mut state = self
            .resource
            .state
            .lock()
            .map_err(|_| SessionError::Unavailable)?;
        if !matches!(*state, BackupState::Preparing(id) if id == self.request_id) {
            return Err(SessionError::Canceled);
        }
        if let Some(prepared) = self.prepared.take() {
            *state = prepared;
        }
        // On failure Drop closes the resource and schedules worker cleanup.
        Ok(())
    }
}

impl Drop for BackupWork {
    fn drop(&mut self) {
        let mut state = self
            .resource
            .state
            .lock()
            .unwrap_or_else(std::sync::PoisonError::into_inner);
        if matches!(*state, BackupState::Preparing(id) if id == self.request_id) {
            *state = BackupState::Closed;
        }
        let closed = matches!(*state, BackupState::Closed);
        drop(state);
        if closed {
            let _ = self.resource.schedule_cleanup();
        }
    }
}

pub(super) fn cancel_resource_request(authority: &Authority, request_id: u64) {
    for resource in authority
        .backups
        .iter()
        .filter_map(|resource| resource.upgrade())
    {
        let mut state = resource
            .state
            .lock()
            .unwrap_or_else(std::sync::PoisonError::into_inner);
        if matches!(*state, BackupState::Preparing(id) | BackupState::Ready { request_id: id, .. } if id == request_id)
        {
            *state = BackupState::Closed;
        }
    }
}

pub(super) fn schedule_closed_resources(inner: &Arc<Inner>) -> Result<(), SessionError> {
    let resources: Vec<_> = inner
        .authority
        .lock()
        .map_err(|_| SessionError::Unavailable)?
        .backups
        .iter()
        .filter_map(|resource| resource.upgrade())
        .collect();
    for resource in resources {
        let closed = matches!(
            *resource
                .state
                .lock()
                .map_err(|_| SessionError::Unavailable)?,
            BackupState::Closed
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
        .backups
        .iter()
        .filter_map(|resource| resource.upgrade())
        .collect();
    for resource in resources {
        resource.cleanup();
    }
}
