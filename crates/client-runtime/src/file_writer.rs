//! One revocable upload transaction, finalized explicitly on the existing Core worker.
use super::upload_resource::{UploadResource, WritePhase};
use super::*;
use chromvoid_core::DEFAULT_CHUNK_SIZE;
use chromvoid_core::rpc::types::{RpcResponse, UploadResponse};
use chromvoid_core::rpc::{RpcInputStream, RpcReply};
use std::io::Cursor;
use zeroize::Zeroizing;

// One writer/one admitted part bounds memory and gives lifecycle work a turn
// between MiB writes, without syncing hundreds of tiny parts per imported file.
pub const MAX_FILE_WRITE_BYTES: usize = 1024 * 1024;

pub struct FileWriteTarget {
    pub parent_path: String,
    pub name: String,
    pub mime_type: Option<String>,
    pub byte_count: u64,
}

#[derive(Debug, thiserror::Error, PartialEq, Eq)]
pub enum FileWriteError {
    #[error(transparent)]
    Session(#[from] SessionError),
    #[error("File writer is not ready for this operation")]
    State,
    #[error("File data does not match the declared size or bounded chunk length")]
    Length,
}

pub struct FileWriterHandle {
    resource: Arc<UploadResource>,
    target: Arc<FileWriteTarget>,
}

impl FileWriterHandle {
    /// Waits for the existing worker's cleanup before releasing this handle and
    /// starting the next file. Dropping the future does not cancel cleanup.
    pub async fn cancel_and_wait(&self) -> Result<(), FileWriteError> {
        self.cancel()?;
        self.resource
            .dispatcher
            .run_adapter_phase(
                CoreRpcPriority::PrivacyCritical,
                "catalog:upload:abort",
                "file_writer_cleanup_wait",
                self.resource
                    .dispatcher
                    .low_priority_cancellation_generation(),
                || (),
            )
            .await
            .map_err(|_| SessionError::Unavailable)?;
        let authority = self
            .resource
            .inner
            .authority
            .lock()
            .map_err(|_| SessionError::Unavailable)?;
        if authority.snapshot.phase == SessionPhase::Failed {
            return Err(SessionError::Unavailable.into());
        }
        if !authority.accepts(self.resource.generation)
            || authority.snapshot.phase != SessionPhase::Unlocked
        {
            return Err(SessionError::Revoked.into());
        }
        Ok(())
    }

    /// Revokes immediately. Encrypted staging cleanup is serialized after in-flight work.
    /// A finish already executing Core may commit; cancellation never undoes that commit.
    pub fn cancel(&self) -> Result<(), FileWriteError> {
        let authority = self
            .resource
            .inner
            .authority
            .lock()
            .map_err(|_| SessionError::Unavailable)?;
        {
            let mut state = self
                .resource
                .state
                .lock()
                .map_err(|_| SessionError::Unavailable)?;
            if let Some(request) = state.request_id.and_then(|id| authority.pending.get(&id)) {
                request.cancel.store(true, Ordering::Release);
            }
            if state.phase != WritePhase::Committed {
                state.phase = WritePhase::Closed;
            }
        }
        drop(authority);
        self.resource.schedule_cleanup()?;
        Ok(())
    }
}

impl Drop for FileWriterHandle {
    fn drop(&mut self) {
        let _ = self.cancel();
    }
}

impl LocalSession {
    pub fn begin_file_writer(
        &self,
        generation: u64,
        target: FileWriteTarget,
    ) -> Result<FileWriterHandle, FileWriteError> {
        let mut authority = self
            .inner
            .authority
            .lock()
            .map_err(|_| SessionError::Unavailable)?;
        let resource = UploadResource::reserve(self, &mut authority, generation)?;
        Ok(FileWriterHandle {
            resource,
            target: Arc::new(target),
        })
    }

    pub fn prepare_file_append(
        &self,
        request_id: u64,
        handle: &FileWriterHandle,
        bytes: Vec<u8>,
    ) -> Result<AdmittedRequest, FileWriteError> {
        self.prepare_file_write(request_id, handle, Zeroizing::new(bytes), false)
    }

    pub fn prepare_file_finish(
        &self,
        request_id: u64,
        handle: &FileWriterHandle,
    ) -> Result<AdmittedRequest, FileWriteError> {
        self.prepare_file_write(request_id, handle, Zeroizing::new(Vec::new()), true)
    }

    fn prepare_file_write(
        &self,
        request_id: u64,
        handle: &FileWriterHandle,
        bytes: Zeroizing<Vec<u8>>,
        finish: bool,
    ) -> Result<AdmittedRequest, FileWriteError> {
        let resource = &handle.resource;
        if !Arc::ptr_eq(&self.inner, &resource.inner) {
            return Err(SessionError::RequestId.into());
        }
        let mut authority = self
            .inner
            .authority
            .lock()
            .map_err(|_| SessionError::Unavailable)?;
        if !authority.accepts(resource.generation)
            || authority.snapshot.phase != SessionPhase::Unlocked
        {
            return Err(SessionError::Revoked.into());
        }
        let mut state = resource
            .state
            .lock()
            .map_err(|_| SessionError::Unavailable)?;
        if state.phase != WritePhase::Ready {
            return Err(FileWriteError::State);
        }
        if bytes.len() > MAX_FILE_WRITE_BYTES
            || (!finish && bytes.is_empty())
            || (bytes.len() as u64) > handle.target.byte_count.saturating_sub(state.uploaded)
            || (finish && state.uploaded != handle.target.byte_count)
        {
            return Err(FileWriteError::Length);
        }
        let mut admitted = self.admit_locked(
            &mut authority,
            request_id,
            resource.generation,
            OwnedRequest(RpcRequest::new("catalog:upload", serde_json::Value::Null)),
        )?;
        state.phase = WritePhase::Preparing;
        state.request_id = Some(RequestKey::Native(request_id));
        admitted.resource_work = Some(ResourceWork::FileWrite(FileWriteWork {
            resource: resource.clone(),
            target: handle.target.clone(),
            request_id,
            node_id: state.node_id,
            offset: state.uploaded,
            bytes,
            finish,
            succeeded: false,
        }));
        Ok(admitted)
    }
}

pub(super) struct FileWriteWork {
    resource: Arc<UploadResource>,
    target: Arc<FileWriteTarget>,
    request_id: u64,
    node_id: Option<u64>,
    offset: u64,
    bytes: Zeroizing<Vec<u8>>,
    finish: bool,
    succeeded: bool,
}

impl FileWriteWork {
    pub(super) fn execute(&mut self, adapter: &mut LocalCoreAdapter) -> OwnedRpcResponse {
        let size = self.bytes.len() as u64;
        let target = &self.target;
        // A file of up to a MiB is one chunk. A small one still takes a chunk of the default
        // size, never its own few bytes: a note written short and saved long again later keeps
        // the chunk size it was created with.
        let request = OwnedRequest(RpcRequest::new(
            "catalog:upload",
            serde_json::json!({
                "node_id":self.node_id, "parent_path":target.parent_path, "name":target.name,
                "mime_type":target.mime_type, "size":size, "offset":self.offset,
                "chunk_size":target.byte_count.clamp(DEFAULT_CHUNK_SIZE as u64, MAX_FILE_WRITE_BYTES as u64),
                "create_only":true, "finish":self.finish
            }),
        ));
        let bytes = std::mem::replace(&mut self.bytes, Zeroizing::new(Vec::new()));
        let response = match adapter.handle_with_stream(
            &request.0,
            Some(RpcInputStream::new(Box::new(Cursor::new(bytes)))),
        ) {
            RpcReply::Json(response) => OwnedRpcResponse(response),
            _ => {
                return OwnedRpcResponse(RpcResponse::error(
                    "Missing file upload metadata",
                    Some("INTERNAL_ERROR"),
                ));
            }
        };
        if !response.is_ok() {
            return response;
        }
        let Some(upload) = response
            .result()
            .and_then(|value| serde_json::from_value::<UploadResponse>(value.clone()).ok())
        else {
            return OwnedRpcResponse(RpcResponse::error(
                "Invalid file upload metadata",
                Some("INTERNAL_ERROR"),
            ));
        };
        let mut state = self
            .resource
            .state
            .lock()
            .unwrap_or_else(std::sync::PoisonError::into_inner);
        // Preserve cleanup ownership even when lifecycle revocation raced the Core call.
        state.node_id = Some(upload.node_id);
        state.uploaded = upload.uploaded_bytes;
        if upload.completed {
            state.phase = WritePhase::Committed;
        }
        self.succeeded = upload.created
            && upload.uploaded_bytes == self.offset + size
            && upload.completed == self.finish
            && self.node_id.is_none_or(|id| id == upload.node_id);
        if !self.succeeded {
            return OwnedRpcResponse(RpcResponse::error(
                "File upload metadata mismatch",
                Some("INTERNAL_ERROR"),
            ));
        }
        response
    }

    pub(super) fn publish(&mut self) -> Result<(), SessionError> {
        let mut state = self
            .resource
            .state
            .lock()
            .map_err(|_| SessionError::Unavailable)?;
        if state.phase == WritePhase::Closed {
            return Err(SessionError::Canceled);
        }
        if !self.succeeded {
            state.phase = WritePhase::Closed;
        } else if state.phase != WritePhase::Committed {
            state.phase = WritePhase::Ready;
        }
        Ok(())
    }
}

impl Drop for FileWriteWork {
    fn drop(&mut self) {
        {
            let mut state = self
                .resource
                .state
                .lock()
                .unwrap_or_else(std::sync::PoisonError::into_inner);
            if state.phase == WritePhase::Preparing
                && state.request_id == Some(RequestKey::Native(self.request_id))
            {
                state.phase = WritePhase::Closed;
            }
        }
        let _ = self.resource.schedule_cleanup();
    }
}
