//! Incoming wire requests share native writer admission and the existing Core dispatcher.
use super::upload_resource::{UploadResource, WritePhase};
use super::*;
use chromvoid_core::rpc::types::RpcResponse;
use chromvoid_core::rpc::{RpcInputStream, RpcReply};
use chromvoid_network_runtime::rpc_transport_protocol::{
    MAX_FULL_UPLOAD_STREAM_BYTES, append_full_upload_stream_chunk, apply_upload_stream_response,
    parse_upload_stream_metadata, upload_stream_chunk_data,
};
use std::io::Cursor;
use zeroize::Zeroizing;

#[derive(Debug, thiserror::Error)]
pub enum PeerUploadError {
    #[error(transparent)]
    Session(#[from] SessionError),
    #[error("Upload request rejected")]
    Rejected(OwnedRpcResponse),
}

fn rejected(response: RpcResponse) -> PeerUploadError {
    PeerUploadError::Rejected(OwnedRpcResponse(response))
}

pub(super) struct PeerUploadTransaction {
    command: String,
    resource: Arc<UploadResource>,
}

pub(super) struct PeerUploadState {
    resource: Arc<UploadResource>,
    bytes: Zeroizing<Vec<u8>>,
}

impl PeerUploadState {
    pub(super) fn revoke(&mut self) {
        // Drop the zeroizing owner while its full initialized length is intact.
        self.bytes = Zeroizing::new(Vec::new());
        self.resource.revoke();
    }
}

/// One RPC admission, retained across continuation frames. Drop after its final response.
/// A successfully ended RPC leaves an incomplete Core transaction with its peer owner.
pub struct AdmittedPeerUpload {
    admitted: AdmittedRequest,
    state: Arc<Mutex<PeerUploadState>>,
    end_offset: u64,
    offset: u64,
    full: bool,
    finished: bool,
    response: Option<OwnedRpcResponse>,
}

impl AdmittedPeerUpload {
    pub fn publication(&self) -> Result<peer_publication::PeerPublication, SessionError> {
        self.admitted.peer_publication()
    }
}

impl PeerLease {
    pub(super) fn cancel_upload_request(&self, request: u64) -> Result<(), SessionError> {
        let transaction = {
            let mut current = self.upload.lock().map_err(|_| SessionError::Unavailable)?;
            let matches = current.as_ref().is_some_and(|current| {
                current
                    .resource
                    .state
                    .lock()
                    .unwrap_or_else(std::sync::PoisonError::into_inner)
                    .request_id
                    == Some(RequestKey::Peer {
                        scope: self.id,
                        request,
                    })
            });
            if matches { current.take() } else { None }
        };
        if let Some(transaction) = transaction {
            transaction.resource.revoke();
            transaction.resource.schedule_cleanup()?;
        }
        Ok(())
    }

    pub(super) fn abort_upload(&self) -> Result<(), SessionError> {
        let transaction = self
            .upload
            .lock()
            .map_err(|_| SessionError::Unavailable)?
            .take();
        if let Some(transaction) = transaction {
            transaction.resource.revoke();
            transaction.resource.schedule_cleanup()?;
        }
        Ok(())
    }
}

impl peer_session::PeerSession {
    pub fn admit_upload(
        &self,
        request_id: u64,
        request: RpcRequest,
    ) -> Result<AdmittedPeerUpload, PeerUploadError> {
        let mut request = OwnedRequest(request);
        let full = match request.0.command.as_str() {
            "catalog:upload" | "catalog:secret:write" => false,
            "catalog:file:replace" | "catalog:derivative:write" => true,
            _ => {
                return Err(rejected(RpcResponse::error(
                    "Not an upload command",
                    Some("BAD_REQUEST"),
                )));
            }
        };
        let (offset, end_offset) = if full {
            (0, 0)
        } else {
            let meta = parse_upload_stream_metadata(&request.0.data).map_err(rejected)?;
            // Secret writes default to finishing this RPC. Set this before splitting frames,
            // so Core cannot infer a different total from the first continuation alone.
            if request.0.command == "catalog:secret:write"
                && request.0.data.get("total_size").is_none()
            {
                request.0.data["total_size"] = meta.end_offset.into();
                if request.0.data.get("finish").is_none() {
                    request.0.data["finish"] = true.into();
                }
            }
            (meta.offset, meta.end_offset)
        };
        let session = self.session.upgrade().ok_or(SessionError::Revoked)?;
        let peer = self.lease()?;
        let mut authority = session
            .inner
            .authority
            .lock()
            .map_err(|_| SessionError::Unavailable)?;
        if !authority.accepts(peer.generation) || authority.snapshot.phase != SessionPhase::Unlocked
        {
            return Err(SessionError::Revoked.into());
        }
        let mut transaction = peer.upload.lock().map_err(|_| SessionError::Unavailable)?;
        if transaction.as_ref().is_some_and(|current| {
            current
                .resource
                .state
                .lock()
                .unwrap_or_else(std::sync::PoisonError::into_inner)
                .phase
                == WritePhase::Closed
        }) {
            *transaction = None;
        }
        let resource = if let Some(current) = transaction.as_ref() {
            let state = current
                .resource
                .state
                .lock()
                .map_err(|_| SessionError::Unavailable)?;
            if state.phase != WritePhase::Ready
                || state
                    .request_id
                    .is_some_and(|key| authority.pending.contains_key(&key))
            {
                return Err(SessionError::Busy.into());
            }
            if current.command != request.0.command
                || request
                    .0
                    .data
                    .get("node_id")
                    .and_then(serde_json::Value::as_u64)
                    != state.node_id
            {
                return Err(rejected(RpcResponse::error(
                    "Upload belongs to another transaction",
                    Some("BAD_REQUEST"),
                )));
            }
            current.resource.clone()
        } else {
            UploadResource::reserve(&session, &mut authority, peer.generation)?
        };
        let admitted = session.admit_with_peer_locked(
            &mut authority,
            request_id,
            peer.generation,
            request,
            Some(peer.clone()),
        )?;
        resource
            .state
            .lock()
            .unwrap_or_else(std::sync::PoisonError::into_inner)
            .request_id = Some(admitted.pending.id);
        let state = Arc::new(Mutex::new(PeerUploadState {
            resource: resource.clone(),
            bytes: Zeroizing::new(Vec::new()),
        }));
        authority
            .pending
            .get_mut(&admitted.pending.id)
            .expect("request admitted while authority is held")
            .upload = Some(state.clone());
        *transaction = Some(PeerUploadTransaction {
            command: admitted.request.0.command.clone(),
            resource,
        });
        Ok(AdmittedPeerUpload {
            admitted,
            state,
            end_offset,
            offset,
            full,
            finished: false,
            response: None,
        })
    }
}

impl AdmittedPeerUpload {
    fn prepare_frame(
        &mut self,
        session: &LocalSession,
        bytes: Zeroizing<Vec<u8>>,
        final_frame: bool,
    ) -> Result<Option<AdmittedRequest>, PeerUploadError> {
        if bytes.len() > MAX_FULL_UPLOAD_STREAM_BYTES {
            return Err(rejected(RpcResponse::error(
                "Upload frame exceeds transport limit",
                Some("PAYLOAD_TOO_LARGE"),
            )));
        }
        if self.finished {
            return Err(SessionError::Canceled.into());
        }
        if !Arc::ptr_eq(&session.inner, &self.admitted.pending.inner) {
            return Err(SessionError::RequestId.into());
        }
        let authority = session
            .inner
            .authority
            .lock()
            .map_err(|_| SessionError::Unavailable)?;
        if !authority.accepts(self.admitted.generation) {
            return Err(SessionError::Revoked.into());
        }
        if self.admitted.cancel.load(Ordering::Acquire) {
            return Err(SessionError::Canceled.into());
        }
        let mut state = self.state.lock().map_err(|_| SessionError::Unavailable)?;
        let phase = state
            .resource
            .state
            .lock()
            .map_err(|_| SessionError::Unavailable)?
            .phase;
        let cached_eof = !self.full && final_frame && bytes.is_empty() && self.response.is_some();
        if phase != WritePhase::Ready && !(phase == WritePhase::Committed && cached_eof) {
            return Err(SessionError::Canceled.into());
        }
        let request = if self.full {
            append_full_upload_stream_chunk(&mut state.bytes, &bytes).map_err(rejected)?;
            if !final_frame {
                return Ok(None);
            }
            self.admitted.request.0.clone()
        } else {
            let data = upload_stream_chunk_data(
                &self.admitted.request.0.data,
                self.offset,
                bytes.len() as u64,
                self.end_offset,
                final_frame,
            )
            .map_err(rejected)?;
            state.bytes = bytes;
            let mut request = self.admitted.request.0.clone();
            request.data = data;
            request
        };
        let cached = if !self.full && final_frame && state.bytes.is_empty() {
            self.response.take()
        } else {
            None
        };
        let mut resource = state
            .resource
            .state
            .lock()
            .map_err(|_| SessionError::Unavailable)?;
        if resource.phase != WritePhase::Ready
            && !(resource.phase == WritePhase::Committed && cached.is_some())
        {
            return Err(SessionError::Canceled.into());
        }
        if cached.is_none() {
            resource.phase = WritePhase::Preparing;
        }
        Ok(Some(AdmittedRequest {
            generation: self.admitted.generation,
            request: OwnedRequest(request),
            cancel: self.admitted.cancel.clone(),
            pending: self.admitted.pending.clone(),
            import_lease: None,
            resource_work: Some(ResourceWork::PeerUpload(PeerUploadWork {
                state: self.state.clone(),
                cached,
                full: self.full,
                succeeded: false,
                key: self.admitted.pending.id,
                peer: Arc::downgrade(
                    self.admitted
                        .pending
                        .peer_lease
                        .as_ref()
                        .expect("peer admission"),
                ),
            })),
        }))
    }
}

impl LocalSession {
    /// No application-owner reference crosses the await. Each frame runs on the same
    /// dispatcher and retains the original pending admission, save and revoke checks.
    pub fn execute_upload_frame<'a>(
        &self,
        upload: &'a mut AdmittedPeerUpload,
        bytes: Vec<u8>,
        final_frame: bool,
    ) -> impl std::future::Future<Output = Result<Option<OwnedRpcResponse>, PeerUploadError>>
    + Send
    + use<'a> {
        let size = bytes.len() as u64;
        let prepared = upload
            .prepare_frame(self, Zeroizing::new(bytes), final_frame)
            .map(|work| work.map(|work| self.execute_admitted(work)));
        let cancellation = UploadFrameCancellation {
            upload,
            completed: false,
        };
        async move {
            let mut cancellation = cancellation;
            let upload = &mut *cancellation.upload;
            let result = async {
                let Some(execution) = prepared? else {
                    return Ok(None);
                };
                let response = execution.await?;
                upload.offset += size;
                if !upload.full && response.is_ok() {
                    upload.admitted.request.0.data["node_id"] =
                        response.result().unwrap()["node_id"].clone();
                }
                if final_frame || !response.is_ok() {
                    upload.finished = true;
                    if let Some(peer) = &upload.admitted.pending.peer_lease {
                        let mut transaction =
                            peer.upload.lock().map_err(|_| SessionError::Unavailable)?;
                        let state = upload.state.lock().map_err(|_| SessionError::Unavailable)?;
                        let phase = state
                            .resource
                            .state
                            .lock()
                            .map_err(|_| SessionError::Unavailable)?
                            .phase;
                        if matches!(phase, WritePhase::Committed | WritePhase::Closed) {
                            if transaction.as_ref().is_some_and(|current| {
                                Arc::ptr_eq(&current.resource, &state.resource)
                            }) {
                                *transaction = None;
                            }
                        }
                    }
                    Ok(Some(response))
                } else {
                    upload.response = Some(response);
                    Ok(None)
                }
            }
            .await;
            cancellation.completed = result.is_ok();
            result
        }
    }
}

struct UploadFrameCancellation<'a> {
    upload: &'a mut AdmittedPeerUpload,
    completed: bool,
}
impl Drop for UploadFrameCancellation<'_> {
    fn drop(&mut self) {
        if !self.completed {
            self.upload.abort();
        }
    }
}

impl AdmittedPeerUpload {
    fn abort(&mut self) {
        self.finished = true;
        {
            let authority = self
                .admitted
                .pending
                .inner
                .authority
                .lock()
                .unwrap_or_else(std::sync::PoisonError::into_inner);
            if let Some(request) = authority.pending.get(&self.admitted.pending.id) {
                request.revoke();
            }
        }
        let mut state = self
            .state
            .lock()
            .unwrap_or_else(std::sync::PoisonError::into_inner);
        state.revoke();
        let _ = state.resource.schedule_cleanup();
        drop(state);
        if let Some(peer) = &self.admitted.pending.peer_lease {
            let _ = peer.abort_upload();
        }
    }
}
impl Drop for AdmittedPeerUpload {
    fn drop(&mut self) {
        if !self.finished {
            self.abort();
        }
    }
}

pub(super) struct PeerUploadWork {
    state: Arc<Mutex<PeerUploadState>>,
    cached: Option<OwnedRpcResponse>,
    full: bool,
    succeeded: bool,
    key: RequestKey,
    peer: std::sync::Weak<PeerLease>,
}
impl PeerUploadWork {
    pub(super) fn execute(
        &mut self,
        adapter: &mut LocalCoreAdapter,
        request: &RpcRequest,
    ) -> OwnedRpcResponse {
        if let Some(response) = self.cached.take() {
            self.succeeded = true;
            return response;
        }
        let (bytes, resource) = {
            let mut state = self
                .state
                .lock()
                .unwrap_or_else(std::sync::PoisonError::into_inner);
            if state
                .resource
                .state
                .lock()
                .unwrap_or_else(std::sync::PoisonError::into_inner)
                .phase
                == WritePhase::Closed
            {
                return OwnedRpcResponse(RpcResponse::error("Upload canceled", Some("CANCELED")));
            }
            (
                std::mem::replace(&mut state.bytes, Zeroizing::new(Vec::new())),
                state.resource.clone(),
            )
        };
        let response = match adapter.handle_with_stream(
            request,
            Some(RpcInputStream::new(Box::new(Cursor::new(bytes)))),
        ) {
            RpcReply::Json(response) => response,
            _ => RpcResponse::error(
                "Unexpected upload stream response",
                Some("STREAM_UNEXPECTED"),
            ),
        };
        if !response.is_ok() {
            return OwnedRpcResponse(response);
        }
        let response = if self.full {
            response
        } else {
            apply_upload_stream_response(&mut request.data.clone(), response)
        };
        let mut state = resource
            .state
            .lock()
            .unwrap_or_else(std::sync::PoisonError::into_inner);
        if let Some(result) = response.result() {
            if self.full {
                state.phase = WritePhase::Committed;
                self.succeeded = true;
            } else if let Some(completed) =
                result.get("completed").and_then(serde_json::Value::as_bool)
            {
                state.node_id = result["node_id"].as_u64();
                state.uploaded = result["uploaded_bytes"].as_u64().unwrap();
                if completed {
                    state.phase = WritePhase::Committed;
                }
                self.succeeded = true;
            } else {
                return OwnedRpcResponse(RpcResponse::error(
                    "Missing upload completion metadata",
                    Some("STREAM_UNEXPECTED"),
                ));
            }
        }
        OwnedRpcResponse(response)
    }
    pub(super) fn publish(&mut self) -> Result<(), SessionError> {
        let state = self.state.lock().map_err(|_| SessionError::Unavailable)?;
        let mut resource = state
            .resource
            .state
            .lock()
            .map_err(|_| SessionError::Unavailable)?;
        if resource.phase == WritePhase::Closed {
            return Err(SessionError::Canceled);
        }
        if !self.succeeded {
            resource.phase = WritePhase::Closed;
        } else if resource.phase != WritePhase::Committed {
            resource.phase = WritePhase::Ready;
        }
        Ok(())
    }
}
impl Drop for PeerUploadWork {
    fn drop(&mut self) {
        let state = self
            .state
            .lock()
            .unwrap_or_else(std::sync::PoisonError::into_inner);
        {
            let mut resource = state
                .resource
                .state
                .lock()
                .unwrap_or_else(std::sync::PoisonError::into_inner);
            if resource.phase == WritePhase::Preparing && resource.request_id == Some(self.key) {
                resource.phase = WritePhase::Closed;
            }
        }
        let _ = state.resource.schedule_cleanup();
        let resource = state.resource.clone();
        drop(state);
        if let Some(peer) = self.peer.upgrade() {
            let mut transaction = peer
                .upload
                .lock()
                .unwrap_or_else(std::sync::PoisonError::into_inner);
            let closed = resource
                .state
                .lock()
                .unwrap_or_else(std::sync::PoisonError::into_inner)
                .phase
                == WritePhase::Closed;
            if closed
                && transaction
                    .as_ref()
                    .is_some_and(|current| Arc::ptr_eq(&current.resource, &resource))
            {
                *transaction = None;
            }
        }
    }
}

#[cfg(test)]
#[path = "peer_upload_tests.rs"]
mod tests;

/// Abort is scoped even when a remote caller supplies no node ID. An idle peer
/// cannot use Core's global abort operation to cancel the native writer.
pub(super) fn execute_abort(
    peer: &std::sync::Weak<PeerLease>,
    adapter: &mut LocalCoreAdapter,
    request: &RpcRequest,
) -> OwnedRpcResponse {
    if !adapter.is_unlocked() {
        return OwnedRpcResponse(adapter.handle(request));
    }
    let Some(peer) = peer.upgrade() else {
        return OwnedRpcResponse(RpcResponse::error("Peer closed", Some("CANCELED")));
    };
    let mut transaction = peer
        .upload
        .lock()
        .unwrap_or_else(std::sync::PoisonError::into_inner);
    let Some(current) = transaction.as_ref() else {
        return OwnedRpcResponse(RpcResponse::success(serde_json::json!({"aborted":false})));
    };
    let response = adapter.handle(request);
    if response.is_ok() {
        {
            let mut state = current
                .resource
                .state
                .lock()
                .unwrap_or_else(std::sync::PoisonError::into_inner);
            if state.phase != WritePhase::Committed {
                state.phase = WritePhase::Closed;
            }
            state.cleanup_queued = true; // This Core call already completed cleanup.
        }
        let inner = current.resource.inner.clone();
        let key = current
            .resource
            .state
            .lock()
            .unwrap_or_else(std::sync::PoisonError::into_inner)
            .request_id;
        *transaction = None;
        drop(transaction);
        let authority = inner
            .authority
            .lock()
            .unwrap_or_else(std::sync::PoisonError::into_inner);
        if let Some(control) = key.and_then(|key| authority.pending.get(&key)) {
            control.revoke();
        }
    }
    OwnedRpcResponse(response)
}
