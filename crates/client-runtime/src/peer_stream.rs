//! Core output streams bound to one admitted peer request and the app lifecycle.
use super::*;
use chromvoid_core::rpc::stream::{
    RpcOutputStream, RpcRangeOutputStream, RpcRangeStreamMeta, RpcReply, RpcStreamMeta,
};
use chromvoid_core::rpc::types::RpcResponse;
use std::io::{self, Read};
use zeroize::Zeroizing;

/// Preserves Core's response shapes; binary readers enforce revocation on every read.
pub enum PeerStreamReply {
    Json(OwnedRpcResponse),
    Stream(RpcOutputStream),
    RangeStream(RpcRangeOutputStream),
}

enum StreamMetadata {
    Full(RpcStreamMeta),
    Range(RpcRangeStreamMeta),
}

#[derive(Default)]
pub(super) struct PeerStreamState {
    metadata: Option<StreamMetadata>,
    reader: Option<Box<dyn Read + Send>>,
}

impl PeerStreamState {
    pub(super) fn from_output(output: RpcOutputStream) -> Self {
        Self {
            metadata: Some(StreamMetadata::Full(output.meta)),
            reader: Some(output.reader),
        }
    }
}

pub struct AdmittedPeerDownload {
    admitted: AdmittedRequest,
    state: Arc<Mutex<PeerStreamState>>,
}

impl AdmittedPeerDownload {
    pub fn publication(&self) -> Result<peer_publication::PeerPublication, SessionError> {
        self.admitted.peer_publication()
    }
}

impl peer_session::PeerSession {
    /// Admit a stream-capable read in receive order, before spawning its execution.
    /// Core routes/validates the command and preserves ordinary JSON error responses.
    pub fn admit_download(
        &self,
        request_id: u64,
        request: RpcRequest,
    ) -> Result<AdmittedPeerDownload, SessionError> {
        let mut admitted = self.admit(request_id, request)?;
        let state = Arc::new(Mutex::new(PeerStreamState::default()));
        {
            let mut authority = admitted
                .pending
                .inner
                .authority
                .lock()
                .map_err(|_| SessionError::Unavailable)?;
            if !authority.accepts(admitted.generation) {
                return Err(SessionError::Revoked);
            }
            if admitted.cancel.load(Ordering::Acquire) {
                return Err(SessionError::Canceled);
            }
            authority
                .pending
                .get_mut(&admitted.pending.id)
                .ok_or(SessionError::Revoked)?
                .stream = Some(state.clone());
        }
        if !matches!(
            admitted.request.0.command.as_str(),
            "catalog:media:inspect" | "catalog:derivative:ensure"
        ) {
            admitted.resource_work.get_or_insert_with(|| {
                ResourceWork::PeerStream(PeerStreamWork {
                    state: state.clone(),
                    prepared: None,
                })
            });
        }
        Ok(AdmittedPeerDownload { admitted, state })
    }
}

impl LocalSession {
    pub fn execute_admitted_download(
        &self,
        download: AdmittedPeerDownload,
    ) -> impl std::future::Future<Output = Result<PeerStreamReply, SessionError>> + Send + use<>
    {
        let AdmittedPeerDownload { admitted, state } = download;
        let pending = admitted.pending.clone();
        let generation = admitted.generation;
        let cancel = admitted.cancel.clone();
        let execution = self.execute_admitted(admitted);
        async move {
            let response = execution.await?;
            let metadata = {
                let authority = pending
                    .inner
                    .authority
                    .lock()
                    .map_err(|_| SessionError::Unavailable)?;
                if !authority.accepts(generation) {
                    return Err(SessionError::Revoked);
                }
                if cancel.load(Ordering::Acquire) {
                    return Err(SessionError::Canceled);
                }
                state
                    .lock()
                    .map_err(|_| SessionError::Unavailable)?
                    .metadata
                    .take()
            };
            let Some(metadata) = metadata else {
                return Ok(PeerStreamReply::Json(response));
            };
            let reader = Box::new(PeerReader {
                pending,
                state,
                generation,
                cancel,
                eof: false,
            });
            Ok(match metadata {
                StreamMetadata::Full(meta) => {
                    PeerStreamReply::Stream(RpcOutputStream { meta, reader })
                }
                StreamMetadata::Range(meta) => {
                    PeerStreamReply::RangeStream(RpcRangeOutputStream { meta, reader })
                }
            })
        }
    }
}

pub(super) struct PeerStreamWork {
    state: Arc<Mutex<PeerStreamState>>,
    prepared: Option<PeerStreamState>,
}

impl PeerStreamWork {
    pub(super) fn execute(
        &mut self,
        adapter: &mut LocalCoreAdapter,
        request: &RpcRequest,
    ) -> OwnedRpcResponse {
        let (metadata, reader, response) = match adapter.handle_with_stream(request, None) {
            RpcReply::Json(response) => return OwnedRpcResponse(response),
            RpcReply::Stream(stream) => {
                let response = RpcResponse::success(&stream.meta);
                (StreamMetadata::Full(stream.meta), stream.reader, response)
            }
            RpcReply::RangeStream(stream) => {
                let response = RpcResponse::success(&stream.meta);
                (StreamMetadata::Range(stream.meta), stream.reader, response)
            }
        };
        self.prepared = Some(PeerStreamState {
            metadata: Some(metadata),
            reader: Some(reader),
        });
        OwnedRpcResponse(response)
    }

    pub(super) fn publish(&mut self) -> Result<(), SessionError> {
        *self.state.lock().map_err(|_| SessionError::Unavailable)? =
            self.prepared.take().unwrap_or_default();
        Ok(())
    }
}

struct PeerReader {
    // Retain the pending budget and peer cleanup lease until the host drops this reader.
    pending: Arc<PendingRequest>,
    state: Arc<Mutex<PeerStreamState>>,
    generation: u64,
    cancel: Arc<AtomicBool>,
    eof: bool,
}

impl PeerReader {
    fn check(&self, authority: &Authority) -> io::Result<()> {
        if !authority.accepts(self.generation)
            || authority.snapshot.phase != SessionPhase::Unlocked
            || self.cancel.load(Ordering::Acquire)
        {
            return Err(io::Error::new(
                io::ErrorKind::PermissionDenied,
                "Peer stream authority was revoked",
            ));
        }
        Ok(())
    }
}

impl Read for PeerReader {
    fn read(&mut self, output: &mut [u8]) -> io::Result<usize> {
        let mut reader = {
            let authority = self
                .pending
                .inner
                .authority
                .lock()
                .map_err(|_| io::Error::other("Session authority unavailable"))?;
            self.check(&authority)?;
            if output.is_empty() || self.eof {
                return Ok(0);
            }
            self.state
                .lock()
                .map_err(|_| io::Error::other("Peer stream unavailable"))?
                .reader
                .take()
                .ok_or_else(|| io::Error::new(io::ErrorKind::BrokenPipe, "Peer stream closed"))?
        };
        // No authority/resource lock is held during I/O. Revocation can discard idle state
        // immediately; a late read never restores its reader or exposes its scratch bytes.
        let mut bytes = Zeroizing::new(vec![0; output.len().min(file_reader::MAX_FILE_READ_BYTES)]);
        let result = reader.read(&mut bytes);
        let authority = self
            .pending
            .inner
            .authority
            .lock()
            .map_err(|_| io::Error::other("Session authority unavailable"))?;
        self.check(&authority)?;
        let count = result?;
        if count == 0 {
            self.eof = true;
        } else {
            self.state
                .lock()
                .map_err(|_| io::Error::other("Peer stream unavailable"))?
                .reader = Some(reader);
            output[..count].copy_from_slice(&bytes[..count]);
        }
        Ok(count)
    }
}

#[cfg(test)]
#[path = "peer_stream_tests.rs"]
mod tests;

/// Bound on one derivative body handed to the native host; larger outputs stay in Core.
pub const MAX_DERIVATIVE_BYTES: usize = 8 * 1024 * 1024;

#[derive(Debug)]
pub enum DerivativeReadError {
    Session(SessionError),
    /// Core answered with an ordinary JSON error (not found, unsupported, stale).
    Response(OwnedRpcResponse),
    TooLarge,
    Incomplete,
}

impl From<SessionError> for DerivativeReadError {
    fn from(error: SessionError) -> Self {
        Self::Session(error)
    }
}

impl LocalSession {
    /// Local derivative access for the native host: `ensure` converts and stores when missing,
    /// otherwise the encrypted derivative is only read. Same admission as a peer download,
    /// without a peer lease; the body is drained on the Core worker by `execute_derivative`.
    pub fn admit_derivative(
        &self,
        request_id: u64,
        generation: u64,
        node_id: u64,
        source_version: u64,
        tier: &str,
        ensure: bool,
    ) -> Result<AdmittedPeerDownload, SessionError> {
        if !matches!(tier, "preview" | "thumbnail") {
            return Err(SessionError::RequestId);
        }
        let version = chromvoid_media_runtime::image_preview::DERIVATIVE_STORAGE_VERSION;
        let request = if ensure {
            RpcRequest::new(
                "catalog:derivative:ensure",
                serde_json::json!({
                    "node_id": node_id, "source_version": source_version, "tier": tier,
                    "version": version, "refresh_cache": false
                }),
            )
        } else {
            RpcRequest::new(
                "catalog:derivative:read",
                serde_json::json!({
                    "node_id": node_id, "source_version": source_version, "tier": tier,
                    "version": version
                }),
            )
        };
        let state = Arc::new(Mutex::new(PeerStreamState::default()));
        let mut authority = self
            .inner
            .authority
            .lock()
            .map_err(|_| SessionError::Unavailable)?;
        if authority.snapshot.phase != SessionPhase::Unlocked {
            return Err(SessionError::Revoked);
        }
        let mut admitted = self.admit_locked(
            &mut authority,
            request_id,
            generation,
            OwnedRequest(request),
        )?;
        authority
            .pending
            .get_mut(&admitted.pending.id)
            .ok_or(SessionError::Revoked)?
            .stream = Some(state.clone());
        if !ensure {
            admitted.resource_work = Some(ResourceWork::PeerStream(PeerStreamWork {
                state: state.clone(),
                prepared: None,
            }));
        }
        Ok(AdmittedPeerDownload { admitted, state })
    }

    /// Executes the admitted derivative request, then reads its whole bounded body on the Core
    /// worker under the same revocation checks as a peer stream. Returns Core's stream metadata
    /// as the success response together with the plaintext derivative bytes.
    pub fn execute_derivative(
        &self,
        download: AdmittedPeerDownload,
    ) -> impl std::future::Future<
        Output = Result<(OwnedRpcResponse, Zeroizing<Vec<u8>>), DerivativeReadError>,
    > + Send
    + use<> {
        let dispatcher = self.dispatcher.clone();
        let execution = self.execute_admitted_download(download);
        async move {
            let stream = match execution.await? {
                PeerStreamReply::Stream(stream) => stream,
                PeerStreamReply::Json(response) => {
                    return Err(DerivativeReadError::Response(response));
                }
                PeerStreamReply::RangeStream(_) => {
                    return Err(DerivativeReadError::Session(SessionError::Unavailable));
                }
            };
            let size = usize::try_from(stream.meta.size)
                .ok()
                .filter(|size| *size <= MAX_DERIVATIVE_BYTES)
                .ok_or(DerivativeReadError::TooLarge)?;
            let response = OwnedRpcResponse(RpcResponse::success(&stream.meta));
            let mut reader = stream.reader;
            let cancellation = dispatcher.low_priority_cancellation_generation();
            let drained = dispatcher
                .run_adapter_phase(
                    CoreRpcPriority::LowPriority,
                    "catalog:derivative:drain",
                    "drain",
                    cancellation,
                    move || -> Result<Zeroizing<Vec<u8>>, DerivativeReadError> {
                        let mut bytes = Zeroizing::new(vec![0u8; size]);
                        reader
                            .read_exact(&mut bytes)
                            .map_err(|_| DerivativeReadError::Session(SessionError::Revoked))?;
                        let mut probe = [0u8; 1];
                        match reader.read(&mut probe) {
                            Ok(0) => Ok(bytes),
                            Ok(_) => Err(DerivativeReadError::Incomplete),
                            Err(_) => Err(DerivativeReadError::Session(SessionError::Revoked)),
                        }
                    },
                )
                .await
                .map_err(|error| match error {
                    crate::dispatch::job::CoreRpcDispatchError::Cancelled => {
                        DerivativeReadError::Session(SessionError::Canceled)
                    }
                    _ => DerivativeReadError::Session(SessionError::Unavailable),
                })?;
            Ok((response, drained.value?))
        }
    }
}
