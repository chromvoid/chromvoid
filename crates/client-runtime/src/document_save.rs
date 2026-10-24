//! Bounded text-document saves through Core's existing revision-checked replacement.
use super::*;
use chromvoid_core::rpc::types::RpcResponse;
use chromvoid_core::rpc::{RpcInputStream, RpcReply};
use std::io::Cursor;
use zeroize::Zeroizing;

pub use chromvoid_core::markdown::MAX_DOCUMENT_BYTES;

#[derive(Debug, thiserror::Error, PartialEq, Eq)]
pub enum DocumentSaveError {
    #[error(transparent)]
    Session(#[from] SessionError),
    #[error("Document exceeds the editor byte limit")]
    Length,
}

pub(super) struct DocumentSaveState {
    pub(super) request_id: u64,
    pub(super) bytes: Option<Zeroizing<Vec<u8>>>,
}

impl LocalSession {
    /// One pending payload per session. Admission never writes catalog content.
    /// Cancel/lock clears unstarted bytes; a replacement already executing may commit.
    pub fn prepare_document_save(
        &self,
        request_id: u64,
        generation: u64,
        node_id: u64,
        expected_source_revision: u64,
        bytes: Vec<u8>,
    ) -> Result<AdmittedRequest, DocumentSaveError> {
        let bytes = Zeroizing::new(bytes);
        if bytes.len() > MAX_DOCUMENT_BYTES {
            return Err(DocumentSaveError::Length);
        }
        let mut authority = self
            .inner
            .authority
            .lock()
            .map_err(|_| SessionError::Unavailable)?;
        if !authority.accepts(generation) || authority.snapshot.phase != SessionPhase::Unlocked {
            return Err(SessionError::Revoked.into());
        }
        if authority.document_save.strong_count() != 0 {
            return Err(SessionError::Busy.into());
        }
        let request = OwnedRequest(RpcRequest::new(
            "catalog:file:replace",
            serde_json::json!({
                "node_id":node_id, "size":bytes.len(),
                "expected_source_revision":expected_source_revision,
                "conflict_mode":"fail_if_stale"
            }),
        ));
        let mut admitted = self.admit_locked(&mut authority, request_id, generation, request)?;
        let state = Arc::new(Mutex::new(DocumentSaveState {
            request_id,
            bytes: Some(bytes),
        }));
        authority.document_save = Arc::downgrade(&state);
        admitted.resource_work = Some(ResourceWork::DocumentSave(DocumentSaveWork {
            state,
            request: admitted.request.0.clone(),
        }));
        Ok(admitted)
    }
}

pub(super) struct DocumentSaveWork {
    state: Arc<Mutex<DocumentSaveState>>,
    request: RpcRequest,
}

impl DocumentSaveWork {
    pub(super) fn execute(&mut self, adapter: &mut LocalCoreAdapter) -> OwnedRpcResponse {
        let bytes = self
            .state
            .lock()
            .unwrap_or_else(std::sync::PoisonError::into_inner)
            .bytes
            .take();
        let Some(bytes) = bytes else {
            return OwnedRpcResponse(RpcResponse::error(
                "Document save was canceled",
                Some("REQUEST_CANCELED"),
            ));
        };
        match adapter.handle_with_stream(
            &self.request,
            Some(RpcInputStream::new(Box::new(Cursor::new(bytes)))),
        ) {
            RpcReply::Json(response) => OwnedRpcResponse(response),
            _ => OwnedRpcResponse(RpcResponse::error(
                "Missing document replacement metadata",
                Some("INTERNAL_ERROR"),
            )),
        }
    }
}
