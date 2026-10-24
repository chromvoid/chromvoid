//! Bounded positioned reads through Core, with no retained key-bearing stream.
use super::*;
use chromvoid_core::NodeType;
use chromvoid_core::error::ErrorCode;
use chromvoid_core::rpc::stream::RpcReply;
use chromvoid_core::rpc::types::{RpcResponse, SourceMetadataResponse};
use std::io::Read;
use zeroize::Zeroizing;

/// 512 KiB per request keeps whole-file previews to a few main-actor round trips.
pub const MAX_FILE_READ_BYTES: usize = 512 * 1024;
/// At most 4 MiB of ready binary output per session.
pub const MAX_FILE_READERS: usize = 8;

#[derive(Debug, thiserror::Error, PartialEq, Eq)]
pub enum FileReadError {
    #[error(transparent)]
    Session(#[from] SessionError),
    #[error("File reader is not ready for this operation")]
    State,
    #[error("File read length must be between 1 and 524288 bytes")]
    Length,
}

pub(super) enum FileReadState {
    Idle(Option<SourceMetadataResponse>),
    Preparing(u64),
    Ready {
        request_id: u64,
        metadata: SourceMetadataResponse,
        bytes: Zeroizing<Vec<u8>>,
    },
    Closed,
}

/// Pins the first successful read's revision; later source changes require reopening.
pub struct FileReaderHandle {
    inner: Arc<Inner>,
    generation: u64,
    node_id: u64,
    state: Arc<Mutex<FileReadState>>,
}

impl FileReaderHandle {
    fn check(&self, authority: &Authority) -> Result<(), SessionError> {
        if !authority.accepts(self.generation) || authority.snapshot.phase != SessionPhase::Unlocked
        {
            return Err(SessionError::Revoked);
        }
        Ok(())
    }

    /// Consumes exactly one prepared chunk. An empty chunk is verified EOF.
    pub fn take_chunk(&self) -> Result<Vec<u8>, FileReadError> {
        let authority = self
            .inner
            .authority
            .lock()
            .map_err(|_| SessionError::Unavailable)?;
        self.check(&authority)?;
        let mut state = self.state.lock().map_err(|_| SessionError::Unavailable)?;
        match std::mem::replace(&mut *state, FileReadState::Closed) {
            FileReadState::Ready {
                metadata,
                mut bytes,
                ..
            } => {
                *state = FileReadState::Idle(Some(metadata));
                Ok(std::mem::take(&mut *bytes))
            }
            previous => {
                *state = previous;
                Err(FileReadError::State)
            }
        }
    }

    pub fn cancel(&self) -> Result<(), FileReadError> {
        let authority = self
            .inner
            .authority
            .lock()
            .map_err(|_| SessionError::Unavailable)?;
        let mut state = self.state.lock().map_err(|_| SessionError::Unavailable)?;
        if let FileReadState::Preparing(id) = *state {
            if let Some(request) = authority.pending.get(&super::RequestKey::Native(id)) {
                request.cancel.store(true, Ordering::Release);
            }
        }
        *state = FileReadState::Closed;
        Ok(())
    }
}

impl Drop for FileReaderHandle {
    fn drop(&mut self) {
        let _ = self.cancel();
    }
}

impl LocalSession {
    pub fn begin_file_reader(
        &self,
        generation: u64,
        node_id: u64,
    ) -> Result<FileReaderHandle, FileReadError> {
        let mut authority = self
            .inner
            .authority
            .lock()
            .map_err(|_| SessionError::Unavailable)?;
        if !authority.accepts(generation) || authority.snapshot.phase != SessionPhase::Unlocked {
            return Err(SessionError::Revoked.into());
        }
        authority
            .file_readers
            .retain(|resource| resource.strong_count() > 0);
        if authority.file_readers.len() >= MAX_FILE_READERS {
            return Err(SessionError::Busy.into());
        }
        let state = Arc::new(Mutex::new(FileReadState::Idle(None)));
        authority.file_readers.push(Arc::downgrade(&state));
        Ok(FileReaderHandle {
            inner: self.inner.clone(),
            generation,
            node_id,
            state,
        })
    }

    /// Metadata is returned by execute_admitted; bytes are drained from the handle.
    /// Length is clamped at EOF. At most one request/chunk may belong to a reader.
    pub fn prepare_file_read(
        &self,
        request_id: u64,
        handle: &FileReaderHandle,
        offset: u64,
        length: usize,
    ) -> Result<AdmittedRequest, FileReadError> {
        if !Arc::ptr_eq(&self.inner, &handle.inner) {
            return Err(SessionError::RequestId.into());
        }
        if length == 0 || length > MAX_FILE_READ_BYTES {
            return Err(FileReadError::Length);
        }
        let mut authority = self
            .inner
            .authority
            .lock()
            .map_err(|_| SessionError::Unavailable)?;
        handle.check(&authority)?;
        let mut state = handle.state.lock().map_err(|_| SessionError::Unavailable)?;
        let FileReadState::Idle(metadata) = &*state else {
            return Err(FileReadError::State);
        };
        let metadata = metadata.clone();
        let mut admitted = self.admit_locked(
            &mut authority,
            request_id,
            handle.generation,
            OwnedRequest(RpcRequest::new(
                "catalog:downloadRange",
                serde_json::json!({
                    "node_id": handle.node_id, "offset": offset, "length": length
                }),
            )),
        )?;
        *state = FileReadState::Preparing(request_id);
        admitted.resource_work = Some(ResourceWork::FileRead(FileReadWork {
            state: handle.state.clone(),
            node_id: handle.node_id,
            offset,
            length,
            metadata,
            prepared: None,
        }));
        Ok(admitted)
    }
}

pub(super) struct FileReadWork {
    state: Arc<Mutex<FileReadState>>,
    node_id: u64,
    offset: u64,
    length: usize,
    metadata: Option<SourceMetadataResponse>,
    prepared: Option<(SourceMetadataResponse, Zeroizing<Vec<u8>>)>,
}

impl FileReadWork {
    pub(super) fn execute(&mut self, adapter: &mut LocalCoreAdapter) -> OwnedRpcResponse {
        let response = match self.read(adapter) {
            Ok((metadata, bytes)) => {
                let response = RpcResponse::success(&metadata);
                self.prepared = Some((metadata, bytes));
                response
            }
            Err(response) => response,
        };
        OwnedRpcResponse(response)
    }

    fn read(
        &self,
        adapter: &mut LocalCoreAdapter,
    ) -> Result<(SourceMetadataResponse, Zeroizing<Vec<u8>>), RpcResponse> {
        let response = OwnedRpcResponse(adapter.handle(&RpcRequest::new(
            "catalog:source:metadata",
            serde_json::json!({"node_id": self.node_id}),
        )));
        if !response.is_ok() {
            return Err(response.0.clone());
        }
        let metadata: SourceMetadataResponse = response
            .result()
            .and_then(|value| serde_json::from_value(value.clone()).ok())
            .ok_or_else(|| {
                RpcResponse::error("Missing source metadata", Some(ErrorCode::InternalError))
            })?;
        if metadata.node_type != NodeType::File {
            return Err(RpcResponse::error(
                "Node is not a file",
                Some(ErrorCode::InternalError),
            ));
        }
        if self.metadata.as_ref().is_some_and(|previous| {
            previous.source_revision != metadata.source_revision || previous.size != metadata.size
        }) {
            return Err(RpcResponse::error(
                "Source revision is stale",
                Some(ErrorCode::MediaStreamStale),
            ));
        }
        if self.offset > metadata.size {
            return Err(RpcResponse::error(
                "Range is not satisfiable",
                Some(ErrorCode::MediaRangeInvalid),
            ));
        }
        let length = (self.length as u64).min(metadata.size - self.offset);
        let mut bytes = Zeroizing::new(vec![0; length as usize]);
        if length > 0 {
            let reply = adapter.handle_with_stream(
                &RpcRequest::new(
                    "catalog:downloadRange",
                    serde_json::json!({
                        "node_id": self.node_id, "offset": self.offset, "length": length,
                        "expected_source_revision": metadata.source_revision
                    }),
                ),
                None,
            );
            let mut stream = match reply {
                RpcReply::RangeStream(stream) => stream,
                RpcReply::Json(response) if !response.is_ok() => return Err(response),
                _ => {
                    return Err(RpcResponse::error(
                        "Missing file range",
                        Some(ErrorCode::InternalError),
                    ));
                }
            };
            if stream.meta.source_revision != metadata.source_revision
                || stream.meta.file_size != metadata.size
                || stream.meta.range_offset != self.offset
                || stream.meta.range_length != length
            {
                return Err(RpcResponse::error(
                    "File range metadata mismatch",
                    Some(ErrorCode::InternalError),
                ));
            }
            stream.reader.read_exact(&mut bytes).map_err(|_| {
                RpcResponse::error("Could not read file range", Some(ErrorCode::InternalError))
            })?;
        }
        Ok((metadata, bytes))
    }

    /// Called only under current session authority, after cancellation checks.
    pub(super) fn publish(&mut self) -> Result<(), SessionError> {
        let mut state = self.state.lock().map_err(|_| SessionError::Unavailable)?;
        let FileReadState::Preparing(request_id) = *state else {
            return Err(SessionError::Canceled);
        };
        *state = match self.prepared.take() {
            Some((metadata, bytes)) => FileReadState::Ready {
                request_id,
                metadata,
                bytes,
            },
            None => FileReadState::Closed,
        };
        Ok(())
    }
}

pub(super) fn cancel_resource_request(
    authority: &Authority,
    request_id: u64,
) -> Result<(), SessionError> {
    for resource in authority
        .file_readers
        .iter()
        .filter_map(|resource| resource.upgrade())
    {
        let mut state = resource.lock().map_err(|_| SessionError::Unavailable)?;
        let id = match &*state {
            FileReadState::Preparing(id) | FileReadState::Ready { request_id: id, .. } => Some(*id),
            _ => None,
        };
        if id == Some(request_id) {
            *state = FileReadState::Closed;
        }
    }
    Ok(())
}
