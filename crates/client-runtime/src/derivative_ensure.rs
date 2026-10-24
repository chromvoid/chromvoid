//! Native host derivatives use one admission, split Core phases and shared codecs.
use super::*;
use chromvoid_core::rpc::types::{RpcResponse, SourceMetadataResponse};
use chromvoid_core::rpc::{
    CatalogDerivativeWriteRequest, CatalogDerivativeWriteResult, CatalogDerivativeWriteSnapshot,
    CatalogSourceReader, RpcOutputStream, RpcReply, RpcStreamMeta,
    cleanup_catalog_derivative_write_result, write_catalog_derivative_snapshot,
};
use chromvoid_media_runtime::{audio_artwork::*, derivative::*, image_preview::*};
use std::io::{self, Read, Seek, SeekFrom};
use tokio::sync::{OwnedMutexGuard, OwnedSemaphorePermit, Semaphore};
use zeroize::{Zeroize, Zeroizing};

type Result<T> = std::result::Result<T, RpcResponse>;

pub(super) struct DerivativeRuntime {
    slots: Arc<Semaphore>,
    keys: Mutex<BTreeMap<String, std::sync::Weak<tokio::sync::Mutex<()>>>>,
}
impl Default for DerivativeRuntime {
    fn default() -> Self {
        Self {
            slots: Arc::new(Semaphore::new(8)),
            keys: Mutex::new(BTreeMap::new()),
        }
    }
}
struct JobLease {
    _slot: OwnedSemaphorePermit,
    _key: OwnedMutexGuard<()>,
}
struct WriteSnapshot(CatalogDerivativeWriteSnapshot);
impl Drop for WriteSnapshot {
    fn drop(&mut self) {
        self.0.vault_key.zeroize();
    }
}
struct Written {
    snapshot: WriteSnapshot,
    result: Option<CatalogDerivativeWriteResult>,
    // Keep serialization until rollback completes, even if the awaiting future is dropped.
    _job: Arc<JobLease>,
}
impl Drop for Written {
    fn drop(&mut self) {
        if let Some(result) = self.result.take() {
            cleanup_catalog_derivative_write_result(&self.snapshot.0, &result);
        }
    }
}
struct Generated {
    bytes: Zeroizing<Vec<u8>>,
    meta: RpcStreamMeta,
    extension: String,
}
#[derive(Default)]
pub(super) struct DerivativeState {
    source: Option<CatalogSourceReader>,
    cached: Option<RpcOutputStream>,
    generated: Option<Generated>,
    snapshot: Option<WriteSnapshot>,
}

#[derive(Clone)]
struct Cancellation {
    request: Arc<AtomicBool>,
    dispatcher: CoreRpcDispatcher,
    epoch: u64,
}
impl Cancellation {
    fn canceled(&self) -> bool {
        if self.dispatcher.low_priority_cancellation_generation() != self.epoch {
            self.request.store(true, Ordering::Release);
        }
        self.request.load(Ordering::Acquire)
    }
    fn check(&self) -> Result<()> {
        if self.canceled() {
            Err(error("Image derivative generation cancelled", "CANCELLED"))
        } else {
            Ok(())
        }
    }
}
fn error(message: impl Into<String>, code: &str) -> RpcResponse {
    RpcResponse::error(message, Some(code))
}
fn policy_error((message, code): DerivativeError) -> RpcResponse {
    RpcResponse::error(message, code)
}
fn source_metadata(
    adapter: &mut LocalCoreAdapter,
    request: HostDerivativeEnsureRequest,
) -> Result<SourceMetadataResponse> {
    let response = adapter.handle(&RpcRequest::new(
        "catalog:source:metadata",
        serde_json::json!({"node_id":request.node_id}),
    ));
    let metadata: SourceMetadataResponse = match response {
        RpcResponse::Success { result, .. } => serde_json::from_value(result)
            .map_err(|_| error("Source metadata unavailable", "INTERNAL"))?,
        response => return Err(response),
    };
    if metadata.source_revision != request.source_version {
        return Err(error("stale source revision", "ERR_MEDIA_STREAM_STALE"));
    }
    Ok(metadata)
}
fn read_cached(
    adapter: &mut LocalCoreAdapter,
    request: HostDerivativeEnsureRequest,
) -> Result<Option<RpcOutputStream>> {
    match adapter.handle_with_stream(
        &RpcRequest::new(
            "catalog:derivative:read",
            serde_json::json!({
                "node_id": request.node_id, "source_version": request.source_version,
                "tier": request.tier.label(), "version":request.version,
            }),
        ),
        None,
    ) {
        RpcReply::Stream(stream) => {
            validate_derivative_output(stream.meta.size, &stream.meta.mime_type, request.tier)
                .map_err(policy_error)?;
            let reader = Box::new(DerivativeReader {
                reader: stream.reader,
                remaining: stream.meta.size,
            });
            Ok(Some(RpcOutputStream {
                meta: stream.meta,
                reader,
            }))
        }
        RpcReply::Json(response) if response.code() == Some("NODE_NOT_FOUND") => Ok(None),
        RpcReply::Json(response) if !response.is_ok() => Err(response),
        _ => Err(error("Unexpected derivative reply", "INTERNAL")),
    }
}

/// Validate the stored byte count as it crosses the revocable peer reader. The peer
/// reader uses private scratch bytes, so an invalid final chunk is never published.
struct DerivativeReader {
    reader: Box<dyn Read + Send>,
    remaining: u64,
}
impl Read for DerivativeReader {
    fn read(&mut self, output: &mut [u8]) -> io::Result<usize> {
        if output.is_empty() {
            return Ok(0);
        }
        if self.remaining == 0 {
            return Ok(0);
        }
        let length = (output.len() as u64).min(self.remaining) as usize;
        let count = self.reader.read(&mut output[..length])?;
        if count == 0 {
            return Err(io::Error::new(
                io::ErrorKind::UnexpectedEof,
                "Derivative stream is shorter than its metadata",
            ));
        }
        self.remaining -= count as u64;
        if self.remaining == 0 {
            let mut extra = [0];
            let extra_count = self.reader.read(&mut extra)?;
            extra.zeroize();
            if extra_count != 0 {
                return Err(io::Error::new(
                    io::ErrorKind::InvalidData,
                    "Derivative stream exceeds its metadata",
                ));
            }
        }
        Ok(count)
    }
}

pub(super) struct DerivativeWork {
    state: Arc<Mutex<DerivativeState>>,
    request: HostDerivativeEnsureRequest,
    cancellation: Cancellation,
    phase: Phase,
    prepared: Option<DerivativeState>,
    stream: Arc<Mutex<PeerStreamState>>,
    output: Option<RpcOutputStream>,
}
enum Phase {
    Prepare,
    Snapshot,
    Finish(Option<Written>),
}
impl DerivativeWork {
    pub(super) fn execute(&mut self, adapter: &mut LocalCoreAdapter) -> OwnedRpcResponse {
        OwnedRpcResponse(self.run(adapter).unwrap_or_else(|error| error))
    }
    fn run(&mut self, adapter: &mut LocalCoreAdapter) -> Result<RpcResponse> {
        self.cancellation.check()?;
        match &mut self.phase {
            Phase::Prepare => {
                let metadata = source_metadata(adapter, self.request)?;
                let image =
                    is_image_derivative_candidate(&metadata.name, metadata.mime_type.as_deref());
                if !image
                    && !is_audio_artwork_candidate(&metadata.name, metadata.mime_type.as_deref())
                {
                    return Err(error(
                        "Preview conversion is only available for image files or embedded audio artwork",
                        "UNSUPPORTED",
                    ));
                }
                let cached = if self.request.refresh_cache {
                    None
                } else {
                    read_cached(adapter, self.request)?
                };
                let source = if cached.is_some() {
                    None
                } else {
                    if image && metadata.size > DERIVATIVE_MAX_INPUT_BYTES as u64 {
                        return Err(error(
                            format!(
                                "Image preview payload exceeds derivative input limit: bytes={} max={}",
                                metadata.size, DERIVATIVE_MAX_INPUT_BYTES
                            ),
                            "PREVIEW_DECODE",
                        ));
                    }
                    if metadata.size == 0 {
                        return Err(if image {
                            error("Image preview payload is empty", "PREVIEW_DECODE")
                        } else {
                            error("Embedded audio artwork is unavailable", "UNSUPPORTED")
                        });
                    }
                    Some(adapter.open_catalog_source_reader(
                        self.request.node_id,
                        self.request.source_version,
                    )?)
                };
                self.prepared = Some(DerivativeState {
                    source,
                    cached,
                    ..Default::default()
                });
            }
            Phase::Snapshot => {
                let mut state = self
                    .state
                    .lock()
                    .map_err(|_| error("Derivative unavailable", "INTERNAL"))?;
                let generated = state
                    .generated
                    .as_ref()
                    .ok_or_else(|| error("Derivative unavailable", "INTERNAL"))?;
                let snapshot = adapter
                    .snapshot_catalog_derivative_write(CatalogDerivativeWriteRequest {
                        node_id: self.request.node_id,
                        source_version: self.request.source_version,
                        tier: self.request.tier.label().into(),
                        version: self.request.version,
                        name: generated.meta.name.clone(),
                        mime_type: generated.meta.mime_type.clone(),
                        size: generated.bytes.len() as u64,
                        chunk_size: generated.meta.chunk_size,
                        file_extension: generated.extension.clone(),
                    })
                    .ok_or_else(|| error("Derivative snapshot unavailable", "INTERNAL"))??;
                // Publish only after the dispatcher rechecks authority.
                self.prepared = Some(DerivativeState {
                    generated: state.generated.take(),
                    snapshot: Some(WriteSnapshot(snapshot)),
                    ..Default::default()
                });
            }
            Phase::Finish(written) => {
                source_metadata(adapter, self.request)?;
                if let Some(written) = written.as_mut() {
                    self.cancellation.check()?;
                    let response = adapter
                        .commit_catalog_derivative_write(
                            &written.snapshot.0,
                            written
                                .result
                                .as_ref()
                                .ok_or_else(|| error("Derivative write unavailable", "INTERNAL"))?,
                        )
                        .ok_or_else(|| error("Derivative commit unavailable", "INTERNAL"))?;
                    // Core owns cleanup after any commit attempt, including its stale/error paths.
                    written.result = None;
                    if !response.is_ok() {
                        return Err(response);
                    }
                    if response
                        .result()
                        .and_then(|value| value.get("stale"))
                        .and_then(|value| value.as_bool())
                        != Some(false)
                    {
                        return Err(error("stale source revision", "ERR_MEDIA_STREAM_STALE"));
                    }
                }
                self.cancellation.check()?;
                let cached = self
                    .state
                    .lock()
                    .map_err(|_| error("Derivative unavailable", "INTERNAL"))?
                    .cached
                    .take();
                let output = match cached {
                    Some(cached) => cached,
                    None => read_cached(adapter, self.request)?
                        .ok_or_else(|| error("Derivative cache unavailable", "INTERNAL"))?,
                };
                let response = RpcResponse::success(&output.meta);
                self.output = Some(output);
                return Ok(response);
            }
        }
        Ok(RpcResponse::success(serde_json::Value::Null))
    }
    pub(super) fn publish(&mut self) -> std::result::Result<(), SessionError> {
        if let Some(prepared) = self.prepared.take() {
            *self.state.lock().map_err(|_| SessionError::Unavailable)? = prepared;
        }
        if let Some(output) = self.output.take() {
            let stream = &self.stream;
            *stream.lock().map_err(|_| SessionError::Unavailable)? =
                PeerStreamState::from_output(output);
        }
        Ok(())
    }
}
fn check<'a>(
    inner: &'a Inner,
    admitted: &AdmittedRequest,
) -> std::result::Result<std::sync::MutexGuard<'a, Authority>, SessionError> {
    let authority = inner
        .authority
        .lock()
        .map_err(|_| SessionError::Unavailable)?;
    if !authority.accepts(admitted.generation) {
        return Err(SessionError::Revoked);
    }
    if admitted.cancel.load(Ordering::Acquire) {
        return Err(SessionError::Canceled);
    }
    Ok(authority)
}

pub(super) async fn execute(
    inner: Arc<Inner>,
    dispatcher: CoreRpcDispatcher,
    admitted: AdmittedRequest,
) -> std::result::Result<OwnedRpcResponse, SessionError> {
    if !Arc::ptr_eq(&inner, &admitted.pending.inner) {
        return Err(SessionError::RequestId);
    }
    let mut cancel_on_drop = CancelOnDrop {
        inner: &inner,
        dispatcher: &dispatcher,
        id: admitted.pending.id,
        completed: false,
    };
    let request = match HostDerivativeEnsureRequest::parse(&admitted.request.0.data) {
        Ok(request) => request,
        Err(err) => {
            cancel_on_drop.completed = true;
            return Ok(OwnedRpcResponse(policy_error(err)));
        }
    };
    if request.version != DERIVATIVE_STORAGE_VERSION {
        cancel_on_drop.completed = true;
        return Ok(OwnedRpcResponse(error(
            format!(
                "Derivative storage version {} is unsupported by host version {}",
                request.version, DERIVATIVE_STORAGE_VERSION
            ),
            "UNSUPPORTED",
        )));
    }
    let cancellation = Cancellation {
        request: admitted.cancel.clone(),
        dispatcher: dispatcher.clone(),
        epoch: dispatcher.low_priority_cancellation_generation(),
    };
    let state = Arc::new(Mutex::new(DerivativeState::default()));
    let (stream, mut revoked) = {
        let mut authority = check(&inner, &admitted)?;
        let control = authority
            .pending
            .get_mut(&admitted.pending.id)
            .ok_or(SessionError::Revoked)?;
        let stream = control.stream.clone().ok_or(SessionError::Unavailable)?;
        control.derivative = Some(state.clone());
        let revoked = control
            .publication_revoked
            .get_or_insert_with(|| watch::channel(false).0)
            .subscribe();
        (stream, revoked)
    };
    let slot = inner
        .derivatives
        .slots
        .clone()
        .try_acquire_owned()
        .map_err(|_| SessionError::Busy)?;
    let key = {
        let mut keys = inner
            .derivatives
            .keys
            .lock()
            .map_err(|_| SessionError::Unavailable)?;
        keys.retain(|_, key| key.strong_count() > 0);
        let key = keys
            .entry(derivative_storage_key(
                request.node_id,
                request.source_version,
                request.tier,
            ))
            .or_default();
        match key.upgrade() {
            Some(key) => key,
            None => {
                let lock = Arc::new(tokio::sync::Mutex::new(()));
                *key = Arc::downgrade(&lock);
                lock
            }
        }
    };
    let guard = tokio::select! {
        guard=key.lock_owned() => guard,
        _=revoked.changed() => return Err(SessionError::Canceled),
    };
    let job = Arc::new(JobLease {
        _slot: slot,
        _key: guard,
    });
    let phase = |phase| {
        let work = DerivativeWork {
            state: state.clone(),
            request,
            cancellation: cancellation.clone(),
            phase,
            prepared: None,
            stream: stream.clone(),
            output: None,
        };
        LocalSession::execute_admitted_phase(
            inner.clone(),
            dispatcher.clone(),
            AdmittedRequest {
                generation: admitted.generation,
                request: OwnedRequest(admitted.request.0.clone()),
                cancel: admitted.cancel.clone(),
                pending: admitted.pending.clone(),
                resource_work: Some(ResourceWork::Derivative(work)),
                import_lease: None,
            },
        )
    };
    let response = phase(Phase::Prepare).await?;
    if !response.is_ok() {
        cancel_on_drop.completed = true;
        return Ok(response);
    }
    let cached = {
        let _authority = check(&inner, &admitted)?;
        state
            .lock()
            .map_err(|_| SessionError::Unavailable)?
            .cached
            .is_some()
    };
    let written = if cached {
        None
    } else {
        let source = {
            let _authority = check(&inner, &admitted)?;
            state
                .lock()
                .map_err(|_| SessionError::Unavailable)?
                .source
                .take()
                .ok_or(SessionError::Unavailable)?
        };
        let worker_cancel = cancellation.clone();
        let worker_job = job.clone();
        let generated = tokio::task::spawn_blocking(move || {
            let _job = worker_job;
            generate(source, request.tier, &worker_cancel)
        })
        .await
        .map_err(|_| SessionError::Unavailable)?;
        let generated = match generated {
            Ok(value) => value,
            Err(response) => {
                cancel_on_drop.completed = true;
                return Ok(OwnedRpcResponse(response));
            }
        };
        {
            let _authority = check(&inner, &admitted)?;
            state
                .lock()
                .map_err(|_| SessionError::Unavailable)?
                .generated = Some(generated);
        }
        let response = phase(Phase::Snapshot).await?;
        if !response.is_ok() {
            cancel_on_drop.completed = true;
            return Ok(response);
        }
        let (snapshot, generated) = {
            let _authority = check(&inner, &admitted)?;
            let mut state = state.lock().map_err(|_| SessionError::Unavailable)?;
            (
                state.snapshot.take().ok_or(SessionError::Unavailable)?,
                state.generated.take().ok_or(SessionError::Unavailable)?,
            )
        };
        let worker_cancel = cancellation.clone();
        let worker_job = job.clone();
        let written = tokio::task::spawn_blocking(move || {
            worker_cancel.check()?;
            let result = write_catalog_derivative_snapshot(&snapshot.0, &generated.bytes, || {
                worker_cancel.canceled()
            })
            .map_err(|err| {
                error(
                    err.message,
                    if err.cancelled {
                        "CANCELLED"
                    } else {
                        "INTERNAL"
                    },
                )
            })?;
            Ok::<_, RpcResponse>(Written {
                snapshot,
                result: Some(result),
                _job: worker_job,
            })
        })
        .await
        .map_err(|_| SessionError::Unavailable)?;
        Some(match written {
            Ok(value) => value,
            Err(response) => {
                cancel_on_drop.completed = true;
                return Ok(OwnedRpcResponse(response));
            }
        })
    };
    let response = phase(Phase::Finish(written)).await?;
    cancel_on_drop.completed = true;
    Ok(response)
}

struct DecoderReader {
    source: CatalogSourceReader,
    cancellation: Cancellation,
    fetched: u64,
    budget: u64,
    exceeded: Arc<AtomicBool>,
}
impl Read for DecoderReader {
    fn read(&mut self, output: &mut [u8]) -> io::Result<usize> {
        if self.cancellation.canceled() {
            return Err(io::Error::new(
                io::ErrorKind::PermissionDenied,
                "Derivative canceled",
            ));
        }
        if output.is_empty() || self.source.stream_position()? >= self.source.meta.file_size {
            return Ok(0);
        }
        let remaining = self.budget.saturating_sub(self.fetched);
        if remaining == 0 {
            self.exceeded.store(true, Ordering::Relaxed);
            return Err(io::Error::other("metadata range budget exceeded"));
        }
        let length = (output.len() as u64)
            .min(ARTWORK_METADATA_RANGE_CHUNK_BYTES)
            .min(remaining) as usize;
        let count = self.source.read(&mut output[..length])?;
        self.fetched += count as u64;
        if self.cancellation.canceled() {
            output[..count].zeroize();
            return Err(io::Error::new(
                io::ErrorKind::PermissionDenied,
                "Derivative canceled",
            ));
        }
        Ok(count)
    }
}
impl Seek for DecoderReader {
    fn seek(&mut self, position: SeekFrom) -> io::Result<u64> {
        self.source.seek(position)
    }
}
fn generate(
    source: CatalogSourceReader,
    tier: ImageDerivativeTier,
    cancellation: &Cancellation,
) -> Result<Generated> {
    cancellation.check()?;
    let name = source.meta.name.clone();
    let mime = source.meta.mime_type.clone();
    let size = source.meta.file_size;
    let image = is_image_derivative_candidate(&name, Some(&mime));
    let chunk_size = if image {
        source.meta.chunk_size.max(1)
    } else {
        ARTWORK_METADATA_RANGE_CHUNK_BYTES as u32
    };
    let exceeded = Arc::new(AtomicBool::new(false));
    let mut reader = DecoderReader {
        source,
        cancellation: cancellation.clone(),
        fetched: 0,
        budget: if image {
            DERIVATIVE_MAX_INPUT_BYTES as u64
        } else {
            ARTWORK_METADATA_RANGE_BUDGET_BYTES
        },
        exceeded: exceeded.clone(),
    };
    let (bytes, mime) = if image {
        let mut bytes = Zeroizing::new(Vec::new());
        reader
            .read_to_end(&mut bytes)
            .map_err(|err| error(format!("Source read failed: {err}"), "PREVIEW_DECODE"))?;
        if bytes.len() as u64 != size {
            return Err(error("Source read size mismatch", "INTERNAL"));
        }
        (bytes, mime)
    } else {
        let artwork = extract_embedded_artwork(reader, &name, Some(&mime));
        cancellation.check()?;
        let artwork = match artwork {
            Ok(Some(artwork)) => artwork,
            Err(_) if exceeded.load(Ordering::Relaxed) => {
                return Err(error(
                    "Embedded audio artwork is unavailable within the metadata probe budget",
                    "DERIVATIVE_UNAVAILABLE",
                ));
            }
            _ => {
                return Err(error(
                    "Embedded audio artwork is unavailable",
                    "UNSUPPORTED",
                ));
            }
        };
        (Zeroizing::new(artwork.bytes), artwork.mime_type.to_string())
    };
    cancellation.check()?;
    let output = convert_image_derivative(&bytes, &name, Some(&mime), tier)
        .map_err(|err| error(err, "PREVIEW_DECODE"))?;
    let generated = Generated {
        meta: RpcStreamMeta {
            name: derivative_output_name(&name, "", output.file_extension),
            mime_type: output.mime_type.into(),
            size: output.bytes.len() as u64,
            chunk_size,
        },
        bytes: Zeroizing::new(output.bytes),
        extension: output.file_extension.into(),
    };
    cancellation.check()?;
    validate_derivative_output(generated.meta.size, &generated.meta.mime_type, tier)
        .map_err(policy_error)?;
    Ok(generated)
}

#[cfg(test)]
#[path = "derivative_ensure_tests.rs"]
mod tests;
