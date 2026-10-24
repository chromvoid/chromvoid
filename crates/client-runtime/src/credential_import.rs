//! Bounded, revocable credential import input using the session's existing Core worker.
use super::*;
pub use chromvoid_core::credential_import::CredentialImportMode as ImportMode;
use chromvoid_core::credential_import::PreparedCredentialImport;
use chromvoid_core::rpc::types::RpcResponse;
use zeroize::Zeroizing;

pub const MAX_IMPORT_BYTES: usize = 16 * 1024 * 1024;
pub const MAX_IMPORT_CHUNK_BYTES: usize = 64 * 1024;

#[derive(Debug, thiserror::Error, PartialEq, Eq)]
pub enum ImportError {
    #[error(transparent)]
    Session(#[from] SessionError),
    #[error("Import exceeds the transfer limit")]
    TooLarge,
    #[error("Import byte count does not match its declared size")]
    Length,
    #[error("Import is not ready for this operation")]
    State,
}

pub(super) enum ImportState {
    Receiving {
        bytes: Zeroizing<Vec<u8>>,
        expected: usize,
        mode: ImportMode,
    },
    Reviewing(u64),
    Ready {
        review_id: u64,
        prepared: PreparedCredentialImport,
    },
    Committing(u64),
    Closed,
}

/// Holds no caller-supplied filesystem path. Dropping it releases any unused input.
pub struct ImportHandle {
    inner: Arc<Inner>,
    generation: u64,
    state: Arc<Mutex<ImportState>>,
}

impl ImportHandle {
    fn check(&self, authority: &Authority) -> Result<(), SessionError> {
        if !authority.accepts(self.generation) || authority.snapshot.phase != SessionPhase::Unlocked
        {
            return Err(SessionError::Revoked);
        }
        Ok(())
    }

    pub fn append(&self, chunk: &[u8]) -> Result<u64, ImportError> {
        let authority = self
            .inner
            .authority
            .lock()
            .map_err(|_| SessionError::Unavailable)?;
        self.check(&authority)?;
        let mut state = self.state.lock().map_err(|_| SessionError::Unavailable)?;
        let ImportState::Receiving {
            bytes, expected, ..
        } = &mut *state
        else {
            return Err(ImportError::State);
        };
        if chunk.len() > MAX_IMPORT_CHUNK_BYTES {
            *state = ImportState::Closed;
            return Err(ImportError::TooLarge);
        }
        if chunk.len() > expected.saturating_sub(bytes.len()) {
            *state = ImportState::Closed;
            return Err(ImportError::Length);
        }
        bytes.extend_from_slice(chunk);
        Ok(bytes.len() as u64)
    }

    pub fn cancel(&self) -> Result<(), ImportError> {
        let authority = self
            .inner
            .authority
            .lock()
            .map_err(|_| SessionError::Unavailable)?;
        let mut state = self.state.lock().map_err(|_| SessionError::Unavailable)?;
        if let ImportState::Reviewing(id) | ImportState::Committing(id) = &*state {
            if let Some(request) = authority.pending.get(&super::RequestKey::Native(*id)) {
                request.cancel.store(true, Ordering::Release);
            }
        }
        *state = ImportState::Closed;
        Ok(())
    }
}

impl LocalSession {
    pub fn begin_root_import(
        &self,
        generation: u64,
        byte_count: u64,
        mode: ImportMode,
    ) -> Result<ImportHandle, ImportError> {
        let mut authority = self
            .inner
            .authority
            .lock()
            .map_err(|_| SessionError::Unavailable)?;
        if !authority.accepts(generation) || authority.snapshot.phase != SessionPhase::Unlocked {
            return Err(SessionError::Revoked.into());
        }
        let expected = usize::try_from(byte_count).map_err(|_| ImportError::TooLarge)?;
        if expected > MAX_IMPORT_BYTES {
            return Err(ImportError::TooLarge);
        }
        if expected == 0 {
            return Err(ImportError::Length);
        }
        // Keep the slot while a canceled worker still owns its input, bounding queued memory.
        authority
            .imports
            .retain(|resource| resource.strong_count() > 0);
        authority
            .exports
            .retain(|resource| resource.strong_count() > 0);
        if !authority.imports.is_empty() || !authority.exports.is_empty() {
            return Err(SessionError::Busy.into());
        }
        let state = Arc::new(Mutex::new(ImportState::Receiving {
            bytes: Zeroizing::new(Vec::with_capacity(expected)),
            expected,
            mode,
        }));
        authority.imports.push(Arc::downgrade(&state));
        Ok(ImportHandle {
            inner: self.inner.clone(),
            generation,
            state,
        })
    }

    pub fn review_root_import(
        &self,
        request_id: u64,
        handle: &ImportHandle,
    ) -> Result<AdmittedRequest, ImportError> {
        self.review_root_import_with_password(request_id, handle, None)
    }

    /// The source password belongs only to this review, never to a persisted RPC request.
    pub fn review_root_import_with_password(
        &self,
        request_id: u64,
        handle: &ImportHandle,
        source_password: Option<Zeroizing<String>>,
    ) -> Result<AdmittedRequest, ImportError> {
        if !Arc::ptr_eq(&self.inner, &handle.inner) {
            return Err(SessionError::RequestId.into());
        }
        let mut authority = self
            .inner
            .authority
            .lock()
            .map_err(|_| SessionError::Unavailable)?;
        handle.check(&authority)?;
        let mut state = handle.state.lock().map_err(|_| SessionError::Unavailable)?;
        match &*state {
            ImportState::Receiving {
                bytes, expected, ..
            } if bytes.len() == *expected => {}
            ImportState::Receiving { .. } => return Err(ImportError::Length),
            _ => return Err(ImportError::State),
        }
        let mut admitted = self.admit_locked(
            &mut authority,
            request_id,
            handle.generation,
            OwnedRequest(RpcRequest::new(
                "passmanager:root:import:preview",
                serde_json::Value::Null,
            )),
        )?;
        let ImportState::Receiving { bytes, mode, .. } =
            std::mem::replace(&mut *state, ImportState::Reviewing(request_id))
        else {
            unreachable!()
        };
        admitted.resource_work = Some(ResourceWork::Import(ImportReviewWork {
            bytes,
            source_password,
            mode,
            state: handle.state.clone(),
            prepared: None,
        }));
        Ok(admitted)
    }

    /// A separate explicit action. The reviewed payload is consumed once, never reloaded from a path.
    pub fn commit_root_import(
        &self,
        request_id: u64,
        handle: &ImportHandle,
    ) -> Result<AdmittedRequest, ImportError> {
        if !Arc::ptr_eq(&self.inner, &handle.inner) {
            return Err(SessionError::RequestId.into());
        }
        let mut authority = self
            .inner
            .authority
            .lock()
            .map_err(|_| SessionError::Unavailable)?;
        handle.check(&authority)?;
        let mut state = handle.state.lock().map_err(|_| SessionError::Unavailable)?;
        if !matches!(*state, ImportState::Ready { .. }) {
            return Err(ImportError::State);
        }
        let mut admitted = self.admit_locked(
            &mut authority,
            request_id,
            handle.generation,
            OwnedRequest(RpcRequest::new(
                "passmanager:root:import",
                serde_json::Value::Null,
            )),
        )?;
        let ImportState::Ready { prepared, .. } =
            std::mem::replace(&mut *state, ImportState::Committing(request_id))
        else {
            unreachable!()
        };
        admitted.request = OwnedRequest(prepared.into_commit_request());
        admitted.import_lease = Some(handle.state.clone());
        Ok(admitted)
    }
}

pub(super) struct ImportReviewWork {
    bytes: Zeroizing<Vec<u8>>,
    source_password: Option<Zeroizing<String>>,
    mode: ImportMode,
    state: Arc<Mutex<ImportState>>,
    prepared: Option<PreparedCredentialImport>,
}

impl ImportReviewWork {
    pub(super) fn execute(&mut self, adapter: &mut LocalCoreAdapter) -> OwnedRpcResponse {
        let prepared = adapter.prepare_credential_import(
            &self.bytes,
            self.mode,
            self.source_password
                .as_ref()
                .map(|password| password.as_str()),
        );
        self.bytes = Zeroizing::new(Vec::new());
        self.source_password = None;
        match prepared {
            Ok(prepared) => {
                let response = OwnedRpcResponse(RpcResponse::success(prepared.preview()));
                self.prepared = Some(prepared);
                response
            }
            Err(response) => OwnedRpcResponse(response),
        }
    }

    /// Called only while the session authority mutex is held, after worker cancellation/revocation checks.
    pub(super) fn publish(&mut self) -> Result<(), SessionError> {
        let mut state = self.state.lock().map_err(|_| SessionError::Unavailable)?;
        let ImportState::Reviewing(review_id) = *state else {
            return Err(SessionError::Canceled);
        };
        *state = match self.prepared.take() {
            Some(prepared) => ImportState::Ready {
                review_id,
                prepared,
            },
            None => ImportState::Closed,
        };
        Ok(())
    }
}

impl Drop for ImportHandle {
    fn drop(&mut self) {
        let _ = self.cancel();
    }
}

pub(super) fn cancel_resource_request(
    authority: &Authority,
    request_id: u64,
) -> Result<(), SessionError> {
    for resource in authority
        .imports
        .iter()
        .filter_map(|resource| resource.upgrade())
    {
        let mut state = resource.lock().map_err(|_| SessionError::Unavailable)?;
        let id = match &*state {
            ImportState::Reviewing(id) | ImportState::Committing(id) => Some(*id),
            ImportState::Ready { review_id, .. } => Some(*review_id),
            _ => None,
        };
        if id == Some(request_id) {
            *state = ImportState::Closed;
        }
    }
    Ok(())
}
