//! Revocable credential JSON output, serialized on the existing Core worker.
use super::*;
use chromvoid_core::rpc::types::RpcResponse;
use std::io::{self, Write};
use zeroize::Zeroizing;

pub const MAX_EXPORT_BYTES: usize = 16 * 1024 * 1024;
pub const MAX_EXPORT_CHUNK_BYTES: usize = 64 * 1024;

#[derive(Debug, thiserror::Error, PartialEq, Eq)]
pub enum ExportError {
    #[error(transparent)]
    Session(#[from] SessionError),
    #[error("Export is not ready for this operation")]
    State,
}

pub(super) enum ExportState {
    Idle,
    Preparing(u64),
    Ready {
        request_id: u64,
        bytes: Zeroizing<Vec<u8>>,
        offset: usize,
    },
    Exhausted,
    Closed,
}

/// One immutable snapshot; no filesystem path or persisted export cache.
pub struct ExportHandle {
    inner: Arc<Inner>,
    generation: u64,
    state: Arc<Mutex<ExportState>>,
}

impl ExportHandle {
    fn check(&self, authority: &Authority) -> Result<(), SessionError> {
        if !authority.accepts(self.generation) || authority.snapshot.phase != SessionPhase::Unlocked
        {
            return Err(SessionError::Revoked);
        }
        Ok(())
    }

    pub fn byte_count(&self) -> Result<u64, ExportError> {
        let authority = self
            .inner
            .authority
            .lock()
            .map_err(|_| SessionError::Unavailable)?;
        self.check(&authority)?;
        let state = self.state.lock().map_err(|_| SessionError::Unavailable)?;
        match &*state {
            ExportState::Ready { bytes, .. } => Ok(bytes.len() as u64),
            _ => Err(ExportError::State),
        }
    }

    /// Drains a bounded chunk. EOF remains empty; the last read clears the retained snapshot.
    pub fn read_chunk(&self) -> Result<Vec<u8>, ExportError> {
        let authority = self
            .inner
            .authority
            .lock()
            .map_err(|_| SessionError::Unavailable)?;
        self.check(&authority)?;
        let mut state = self.state.lock().map_err(|_| SessionError::Unavailable)?;
        if matches!(*state, ExportState::Exhausted) {
            return Ok(Vec::new());
        }
        let ExportState::Ready { bytes, offset, .. } = &mut *state else {
            return Err(ExportError::State);
        };
        let end = (*offset + MAX_EXPORT_CHUNK_BYTES).min(bytes.len());
        let chunk = bytes[*offset..end].to_vec();
        *offset = end;
        if end == bytes.len() {
            *state = ExportState::Exhausted;
        }
        Ok(chunk)
    }

    pub fn cancel(&self) -> Result<(), ExportError> {
        let authority = self
            .inner
            .authority
            .lock()
            .map_err(|_| SessionError::Unavailable)?;
        let mut state = self.state.lock().map_err(|_| SessionError::Unavailable)?;
        if let ExportState::Preparing(id) = *state {
            if let Some(request) = authority.pending.get(&super::RequestKey::Native(id)) {
                request.cancel.store(true, Ordering::Release);
            }
        }
        *state = ExportState::Closed;
        Ok(())
    }
}

impl Drop for ExportHandle {
    fn drop(&mut self) {
        let _ = self.cancel();
    }
}

impl LocalSession {
    pub fn begin_root_export(&self, generation: u64) -> Result<ExportHandle, ExportError> {
        let mut authority = self
            .inner
            .authority
            .lock()
            .map_err(|_| SessionError::Unavailable)?;
        if !authority.accepts(generation) || authority.snapshot.phase != SessionPhase::Unlocked {
            return Err(SessionError::Revoked.into());
        }
        authority
            .imports
            .retain(|resource| resource.strong_count() > 0);
        authority
            .exports
            .retain(|resource| resource.strong_count() > 0);
        if !authority.imports.is_empty() || !authority.exports.is_empty() {
            return Err(SessionError::Busy.into());
        }
        let state = Arc::new(Mutex::new(ExportState::Idle));
        authority.exports.push(Arc::downgrade(&state));
        Ok(ExportHandle {
            inner: self.inner.clone(),
            generation,
            state,
        })
    }

    pub fn prepare_root_export(
        &self,
        request_id: u64,
        handle: &ExportHandle,
    ) -> Result<AdmittedRequest, ExportError> {
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
        if !matches!(*state, ExportState::Idle) {
            return Err(ExportError::State);
        }
        let mut admitted = self.admit_locked(
            &mut authority,
            request_id,
            handle.generation,
            OwnedRequest(RpcRequest::new(
                "passmanager:root:export",
                serde_json::Value::Null,
            )),
        )?;
        *state = ExportState::Preparing(request_id);
        admitted.resource_work = Some(ResourceWork::Export(ExportWork {
            state: handle.state.clone(),
            prepared: None,
        }));
        Ok(admitted)
    }
}

pub(super) struct ExportWork {
    state: Arc<Mutex<ExportState>>,
    prepared: Option<Zeroizing<Vec<u8>>>,
}

impl ExportWork {
    pub(super) fn execute(&mut self, adapter: &mut LocalCoreAdapter) -> OwnedRpcResponse {
        let response = OwnedRpcResponse(adapter.handle(&RpcRequest::new(
            "passmanager:root:export",
            serde_json::Value::Null,
        )));
        if !response.is_ok() {
            return response;
        }
        let Some(root) = response.result().and_then(|result| result.get("root")) else {
            return OwnedRpcResponse(RpcResponse::error(
                "Missing credential export",
                Some("INTERNAL_ERROR"),
            ));
        };
        let mut output = BoundedOutput::new(MAX_EXPORT_BYTES);
        if serde_json::to_writer(&mut output, root).is_err() {
            return OwnedRpcResponse(RpcResponse::error(
                "Credential export exceeds the transfer limit",
                Some("CREDENTIAL_EXPORT_TOO_LARGE"),
            ));
        }
        self.prepared = Some(output.bytes);
        OwnedRpcResponse(RpcResponse::success(serde_json::Value::Null))
    }

    /// Runs under session authority after the worker's cancellation and revocation checks.
    pub(super) fn publish(&mut self) -> Result<(), SessionError> {
        let mut state = self.state.lock().map_err(|_| SessionError::Unavailable)?;
        let ExportState::Preparing(request_id) = *state else {
            return Err(SessionError::Canceled);
        };
        *state = match self.prepared.take() {
            Some(bytes) => ExportState::Ready {
                request_id,
                bytes,
                offset: 0,
            },
            None => ExportState::Closed,
        };
        Ok(())
    }
}

struct BoundedOutput {
    bytes: Zeroizing<Vec<u8>>,
    limit: usize,
}
impl BoundedOutput {
    fn new(limit: usize) -> Self {
        Self {
            bytes: Zeroizing::new(Vec::with_capacity(limit)),
            limit,
        }
    }
}
impl Write for BoundedOutput {
    fn write(&mut self, bytes: &[u8]) -> io::Result<usize> {
        if bytes.len() > self.limit.saturating_sub(self.bytes.len()) {
            return Err(io::Error::other(
                "Credential export exceeds the transfer limit",
            ));
        }
        self.bytes.extend_from_slice(bytes);
        Ok(bytes.len())
    }
    fn flush(&mut self) -> io::Result<()> {
        Ok(())
    }
}

pub(super) fn cancel_resource_request(
    authority: &Authority,
    request_id: u64,
) -> Result<(), SessionError> {
    for resource in authority
        .exports
        .iter()
        .filter_map(|resource| resource.upgrade())
    {
        let mut state = resource.lock().map_err(|_| SessionError::Unavailable)?;
        let id = match &*state {
            ExportState::Preparing(id) | ExportState::Ready { request_id: id, .. } => Some(*id),
            _ => None,
        };
        if id == Some(request_id) {
            *state = ExportState::Closed;
        }
    }
    Ok(())
}
