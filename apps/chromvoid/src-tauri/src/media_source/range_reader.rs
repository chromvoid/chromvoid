use std::sync::{Arc, Mutex};

use bytes::Bytes;
use chromvoid_protocol::TransportType;

use crate::core_adapter::{CoreAdapter, CoreMode};

use super::scheduler::{
    MediaByteChunk, MediaRangeClass, MediaReadError, MediaReadIntent, MediaReadOutcome,
    MediaReadProvider, MediaReadRequest,
};
#[cfg(test)]
use super::session::USB_MOBILE_MEDIA_INITIAL_READ_AHEAD_BYTES;
use super::session::{
    LocalMediaKind, LocalMediaPrefetchPlan, LocalMediaReadAheadPolicy, LocalMediaSourceSession,
    MAX_MEDIA_RANGE_BYTES, USB_MOBILE_MEDIA_RANGE_BYTES,
};
use super::CoreMediaReadProvider;

pub(crate) type LocalMediaRangeError = MediaReadError;
pub(crate) type LocalMediaReadIntent = MediaReadIntent;

#[derive(Clone, Copy, Debug, Eq, PartialEq)]
pub(crate) enum LocalMediaRuntimePlatform {
    Desktop,
    Mobile,
}

pub(crate) fn media_range_cap_bytes(adapter: &Arc<Mutex<Box<dyn CoreAdapter>>>) -> u64 {
    if media_transport_type(adapter)
        .is_some_and(|transport_type| transport_type == TransportType::UsbMobile)
    {
        return USB_MOBILE_MEDIA_RANGE_BYTES;
    }

    MAX_MEDIA_RANGE_BYTES
}

fn media_transport_type(adapter: &Arc<Mutex<Box<dyn CoreAdapter>>>) -> Option<TransportType> {
    adapter
        .lock()
        .ok()
        .and_then(|adapter| adapter.transport_metrics())
        .and_then(|metrics| metrics.transport_type)
}

/// Snapshot of everything the read path needs from the adapter, gathered under
/// a single short-lived lock per request instead of re-locking the adapter
/// mutex for every policy/cap/pressure query.
#[derive(Clone, Copy, Debug)]
struct MediaAdapterReadContext {
    range_cap: u64,
    policy: Option<LocalMediaReadAheadPolicy>,
    prefetch_pressure: bool,
}

fn media_adapter_read_context(
    adapter: &Arc<Mutex<Box<dyn CoreAdapter>>>,
    session: &LocalMediaSourceSession,
) -> MediaAdapterReadContext {
    let (mode, metrics) = adapter
        .lock()
        .ok()
        .map(|adapter| (Some(adapter.mode()), adapter.transport_metrics()))
        .unwrap_or((None, None));
    let transport_type = metrics.as_ref().and_then(|metrics| metrics.transport_type);
    let range_cap = if transport_type == Some(TransportType::UsbMobile) {
        USB_MOBILE_MEDIA_RANGE_BYTES
    } else {
        MAX_MEDIA_RANGE_BYTES
    };
    let policy = read_ahead_policy_for_context(
        mode,
        transport_type,
        current_runtime_platform(),
        session.kind,
    );
    let prefetch_pressure = metrics.is_some_and(|metrics| {
        metrics
            .fallback_transition_p95_ms
            .is_some_and(|p95_ms| p95_ms >= 250)
            || metrics.attempt_count > 1
    });
    MediaAdapterReadContext {
        range_cap,
        policy,
        prefetch_pressure,
    }
}

pub(crate) fn read_ahead_policy_for_context(
    mode: Option<CoreMode>,
    transport_type: Option<TransportType>,
    platform: LocalMediaRuntimePlatform,
    kind: LocalMediaKind,
) -> Option<LocalMediaReadAheadPolicy> {
    if transport_type.is_some_and(|transport_type| transport_type == TransportType::UsbMobile) {
        return Some(LocalMediaReadAheadPolicy::usb_mobile(kind));
    }

    if mode.is_some_and(|mode| mode == CoreMode::Local) && kind == LocalMediaKind::Video {
        return match platform {
            LocalMediaRuntimePlatform::Desktop => {
                Some(LocalMediaReadAheadPolicy::desktop_local_video())
            }
            LocalMediaRuntimePlatform::Mobile => {
                Some(LocalMediaReadAheadPolicy::mobile_local_video())
            }
        };
    }

    None
}

fn current_runtime_platform() -> LocalMediaRuntimePlatform {
    if cfg!(mobile) {
        LocalMediaRuntimePlatform::Mobile
    } else {
        LocalMediaRuntimePlatform::Desktop
    }
}

pub(crate) fn read_local_media_range(
    adapter: &Arc<Mutex<Box<dyn CoreAdapter>>>,
    session: &LocalMediaSourceSession,
    offset: u64,
    length: u64,
) -> Result<Vec<u8>, LocalMediaRangeError> {
    read_local_media_range_with_intent(
        adapter,
        session,
        offset,
        length,
        LocalMediaReadIntent::Foreground,
    )
}

pub(crate) fn read_local_media_range_with_intent(
    adapter: &Arc<Mutex<Box<dyn CoreAdapter>>>,
    session: &LocalMediaSourceSession,
    offset: u64,
    length: u64,
    intent: LocalMediaReadIntent,
) -> Result<Vec<u8>, LocalMediaRangeError> {
    if session.is_cancelled() {
        return Err(LocalMediaRangeError::StreamNotFound);
    }
    let context = media_adapter_read_context(adapter, session);
    let capped_length = length.min(context.range_cap);
    let range_class = media_read_range_class(session, offset, capped_length, intent);
    let policy = context.policy;
    if let Some(policy) = policy {
        session.prepare_classified_read_ahead_request(offset, capped_length, policy, range_class);
        if let Some(bytes) = session.cached_read_ahead_range(offset, capped_length) {
            schedule_read_ahead_prefetch(
                adapter,
                session,
                policy,
                capped_length,
                context.prefetch_pressure,
            );
            return Ok(bytes);
        }
    }

    let fetch_length = if let Some(policy) = policy {
        if !policy.use_foreground_read_ahead(capped_length) {
            capped_length
        } else {
            session.read_ahead_fetch_length(offset, capped_length, policy)
        }
    } else {
        capped_length
    };
    if session.is_cancelled() || fetch_length == 0 {
        return Err(LocalMediaRangeError::StreamNotFound);
    }
    let request = media_read_request(session, offset, capped_length, intent, range_class);
    let reservation = session
        .scheduler()
        .begin_read_window(&request, offset, fetch_length);
    if let Some(result) = reservation.wait_for_joined() {
        let bytes = result?;
        if let Some(policy) = policy {
            schedule_read_ahead_prefetch(
                adapter,
                session,
                policy,
                capped_length,
                context.prefetch_pressure,
            );
        }
        return Ok(bytes);
    }

    // Guard so a panicking owner completes the in-flight entry instead of
    // leaving joiners waiting forever.
    let _completion_guard = session.scheduler().completion_guard(&reservation);
    let result = fetch_remote_media_range(
        adapter,
        session,
        offset,
        fetch_length,
        intent,
        range_class,
        |chunk| {
            if session.is_cancelled() {
                return Err(LocalMediaRangeError::StreamNotFound);
            }
            session
                .scheduler()
                .publish_read_chunk(&reservation, chunk)?;
            if session.is_cancelled() {
                return Err(LocalMediaRangeError::StreamNotFound);
            }
            Ok(())
        },
    );
    session.scheduler().complete_read(
        &reservation,
        result
            .as_ref()
            .map(|bytes| bytes.len() as u64)
            .map_err(|error| *error),
    );
    let bytes = result?;
    let _outcome = MediaReadOutcome {
        served_bytes: bytes.len() as u64,
        cache_hit: false,
        dedupe_hit: reservation.dedupe_hit(),
    };
    if session.is_cancelled() {
        return Err(LocalMediaRangeError::StreamNotFound);
    }
    if let Some(policy) = policy {
        let requested_len =
            usize::try_from(capped_length).map_err(|_| LocalMediaRangeError::RangeInvalid)?;
        if bytes.len() >= requested_len {
            // Copy the response prefix once and move the full window into the
            // read-ahead cache instead of cloning the whole buffer.
            let response = bytes[..requested_len].to_vec();
            session.store_read_ahead_range(offset, bytes, policy);
            schedule_read_ahead_prefetch(
                adapter,
                session,
                policy,
                capped_length,
                context.prefetch_pressure,
            );
            return Ok(response);
        }
    }
    Ok(bytes)
}

// Slice-based wrapper kept for the mobile native playback callers; desktop
// HTTP streaming uses the zero-copy `Bytes` variant below.
#[cfg_attr(desktop, allow(dead_code))]
pub(crate) fn stream_media_source_range<F>(
    adapter: &Arc<Mutex<Box<dyn CoreAdapter>>>,
    session: &LocalMediaSourceSession,
    offset: u64,
    length: u64,
    mut on_chunk: F,
) -> Result<u64, LocalMediaRangeError>
where
    F: FnMut(&[u8]) -> Result<(), LocalMediaRangeError>,
{
    stream_media_source_range_chunks(adapter, session, offset, length, |chunk| on_chunk(&chunk))
}

/// Streams a capped media response while fetching a full read-ahead window.
///
/// The response delivered to `on_chunk` stays bounded by the transport range
/// cap, but the underlying source read uses the scheduler's grown read-ahead
/// window: bytes beyond the response are stored in the (policy-bounded)
/// read-ahead cache, and a single background prefetch of the next window is
/// scheduled, mirroring the custom-scheme read path.
pub(crate) fn stream_media_source_range_chunks<F>(
    adapter: &Arc<Mutex<Box<dyn CoreAdapter>>>,
    session: &LocalMediaSourceSession,
    offset: u64,
    length: u64,
    mut on_chunk: F,
) -> Result<u64, LocalMediaRangeError>
where
    F: FnMut(Bytes) -> Result<(), LocalMediaRangeError>,
{
    if session.is_cancelled() {
        return Err(LocalMediaRangeError::StreamNotFound);
    }
    let context = media_adapter_read_context(adapter, session);
    let capped_length = length.min(context.range_cap);
    let range_class = media_read_range_class(
        session,
        offset,
        capped_length,
        LocalMediaReadIntent::HttpStreaming,
    );
    let policy = context.policy;
    if let Some(policy) = policy {
        session.prepare_classified_read_ahead_request(offset, capped_length, policy, range_class);
        if let Some(bytes) = session.cached_read_ahead_range(offset, capped_length) {
            schedule_read_ahead_prefetch(
                adapter,
                session,
                policy,
                capped_length,
                context.prefetch_pressure,
            );
            let len = bytes.len() as u64;
            on_chunk(Bytes::from(bytes))?;
            return Ok(len);
        }
    }

    if session.is_cancelled() || capped_length == 0 {
        return Err(LocalMediaRangeError::StreamNotFound);
    }

    let fetch_length = if let Some(policy) = policy {
        session.read_ahead_fetch_length(offset, capped_length, policy)
    } else {
        capped_length
    };
    if fetch_length == 0 {
        return Err(LocalMediaRangeError::StreamNotFound);
    }

    let request = media_read_request(
        session,
        offset,
        capped_length,
        LocalMediaReadIntent::HttpStreaming,
        range_class,
    );
    let reservation = session
        .scheduler()
        .begin_read_window(&request, offset, fetch_length);
    if let Some(result) = reservation.stream_joined(&mut on_chunk) {
        if result.is_ok() {
            if let Some(policy) = policy {
                schedule_read_ahead_prefetch(
                    adapter,
                    session,
                    policy,
                    capped_length,
                    context.prefetch_pressure,
                );
            }
        }
        return result;
    }

    let deliver_end = offset
        .checked_add(capped_length)
        .ok_or(LocalMediaRangeError::RangeInvalid)?;
    let mut delivered = 0_u64;
    let mut window = if policy.is_some() {
        Vec::with_capacity(usize::try_from(fetch_length).unwrap_or(0))
    } else {
        Vec::new()
    };
    // Guard so a panicking owner completes the in-flight entry instead of
    // leaving joiners waiting forever.
    let _completion_guard = session.scheduler().completion_guard(&reservation);
    let result = fetch_remote_media_range_to_sink(
        adapter,
        session,
        offset,
        fetch_length,
        LocalMediaReadIntent::HttpStreaming,
        range_class,
        |chunk| {
            if session.is_cancelled() {
                return Err(LocalMediaRangeError::StreamNotFound);
            }
            session
                .scheduler()
                .publish_read_chunk(&reservation, chunk.clone())?;
            if session.is_cancelled() {
                return Err(LocalMediaRangeError::StreamNotFound);
            }
            if chunk.offset < deliver_end {
                let deliver_len = usize::try_from(
                    deliver_end
                        .saturating_sub(chunk.offset)
                        .min(chunk.bytes.len() as u64),
                )
                .map_err(|_| LocalMediaRangeError::RangeInvalid)?;
                if deliver_len > 0 {
                    on_chunk(chunk.bytes.slice(0..deliver_len))?;
                    delivered = delivered.saturating_add(deliver_len as u64);
                }
            }
            if session.is_cancelled() {
                return Err(LocalMediaRangeError::StreamNotFound);
            }
            if policy.is_some() {
                window.extend_from_slice(&chunk.bytes);
            }
            Ok(())
        },
    );
    session.scheduler().complete_read(
        &reservation,
        result.as_ref().copied().map_err(|error| *error),
    );
    result?;
    if session.is_cancelled() {
        return Err(LocalMediaRangeError::StreamNotFound);
    }
    if let Some(policy) = policy {
        if !window.is_empty() {
            session.store_read_ahead_range(offset, window, policy);
        }
        schedule_read_ahead_prefetch(
            adapter,
            session,
            policy,
            capped_length,
            context.prefetch_pressure,
        );
    }
    Ok(delivered)
}

fn media_read_request(
    session: &LocalMediaSourceSession,
    offset: u64,
    length: u64,
    intent: LocalMediaReadIntent,
    range_class: MediaRangeClass,
) -> MediaReadRequest {
    MediaReadRequest {
        token: session.token.clone(),
        node_id: session.node_id,
        generation: session.generation,
        source_revision: session.source_revision,
        offset,
        length,
        intent,
        range_class,
    }
}

fn media_read_range_class(
    session: &LocalMediaSourceSession,
    offset: u64,
    length: u64,
    intent: LocalMediaReadIntent,
) -> MediaRangeClass {
    session
        .scheduler()
        .classify_range(intent, offset, length, session.size)
}

fn fetch_remote_media_range(
    adapter: &Arc<Mutex<Box<dyn CoreAdapter>>>,
    session: &LocalMediaSourceSession,
    offset: u64,
    length: u64,
    intent: LocalMediaReadIntent,
    range_class: MediaRangeClass,
    mut on_chunk: impl FnMut(MediaByteChunk) -> Result<(), LocalMediaRangeError>,
) -> Result<Vec<u8>, LocalMediaRangeError> {
    let mut bytes =
        Vec::with_capacity(usize::try_from(length.min(MAX_MEDIA_RANGE_BYTES)).unwrap_or(0));
    fetch_remote_media_range_to_sink(
        adapter,
        session,
        offset,
        length,
        intent,
        range_class,
        |chunk| {
            on_chunk(chunk.clone())?;
            bytes.extend_from_slice(&chunk.bytes);
            Ok(())
        },
    )?;
    Ok(bytes)
}

fn fetch_remote_media_range_to_sink<F>(
    adapter: &Arc<Mutex<Box<dyn CoreAdapter>>>,
    session: &LocalMediaSourceSession,
    offset: u64,
    length: u64,
    intent: LocalMediaReadIntent,
    range_class: MediaRangeClass,
    on_chunk: F,
) -> Result<u64, LocalMediaRangeError>
where
    F: FnMut(MediaByteChunk) -> Result<(), LocalMediaRangeError>,
{
    let request = media_read_request(session, offset, length, intent, range_class);
    let provider = CoreMediaReadProvider::new(adapter.clone(), session.clone());
    let _provider_identity = provider.identity();
    provider.read_range(&request, on_chunk)
}

fn schedule_read_ahead_prefetch(
    adapter: &Arc<Mutex<Box<dyn CoreAdapter>>>,
    session: &LocalMediaSourceSession,
    policy: LocalMediaReadAheadPolicy,
    requested_length: u64,
    prefetch_pressure: bool,
) {
    if !policy.background_prefetch {
        return;
    }
    if session.is_cancelled() {
        return;
    }
    session.set_read_ahead_prefetch_pressure(prefetch_pressure);
    let Some(plan) = session.begin_next_prefetch(policy, requested_length) else {
        return;
    };
    let adapter = adapter.clone();
    let session = session.clone();
    spawn_read_ahead_prefetch(adapter, session, policy, plan);
}

#[cfg(not(test))]
fn spawn_read_ahead_prefetch(
    adapter: Arc<Mutex<Box<dyn CoreAdapter>>>,
    session: LocalMediaSourceSession,
    policy: LocalMediaReadAheadPolicy,
    plan: LocalMediaPrefetchPlan,
) {
    std::thread::spawn(move || run_read_ahead_prefetch(adapter, session, policy, plan));
}

#[cfg(test)]
fn spawn_read_ahead_prefetch(
    adapter: Arc<Mutex<Box<dyn CoreAdapter>>>,
    session: LocalMediaSourceSession,
    policy: LocalMediaReadAheadPolicy,
    plan: LocalMediaPrefetchPlan,
) {
    run_read_ahead_prefetch(adapter, session, policy, plan);
}

fn run_read_ahead_prefetch(
    adapter: Arc<Mutex<Box<dyn CoreAdapter>>>,
    session: LocalMediaSourceSession,
    policy: LocalMediaReadAheadPolicy,
    plan: LocalMediaPrefetchPlan,
) {
    if session.is_cancelled() || plan.is_cancelled() {
        session.complete_prefetch(plan.offset, plan.length, Vec::new(), policy);
        return;
    }
    let range_class = media_read_range_class(
        &session,
        plan.offset,
        plan.length,
        LocalMediaReadIntent::Prefetch,
    );
    // Register the prefetch with the scheduler so foreground reads for the
    // same window can join it instead of issuing a duplicate fetch.
    let request = media_read_request(
        &session,
        plan.offset,
        plan.length,
        LocalMediaReadIntent::Prefetch,
        range_class,
    );
    let reservation = session
        .scheduler()
        .begin_read_window(&request, plan.offset, plan.length);
    if let Some(result) = reservation.wait_for_joined() {
        let bytes = result.unwrap_or_default();
        session.complete_prefetch(plan.offset, plan.length, bytes, policy);
        return;
    }
    let _completion_guard = session.scheduler().completion_guard(&reservation);
    let result = fetch_remote_media_range(
        &adapter,
        &session,
        plan.offset,
        plan.length,
        LocalMediaReadIntent::Prefetch,
        range_class,
        |chunk| {
            // Drop the reader early when the prefetch was doomed by a seek or
            // a covering foreground read; the transport-level cancel plumbing
            // fires on reader drop.
            if plan.is_cancelled() || session.is_cancelled() {
                return Err(LocalMediaRangeError::Aborted);
            }
            session.scheduler().publish_read_chunk(&reservation, chunk)
        },
    );
    session.scheduler().complete_read(
        &reservation,
        result
            .as_ref()
            .map(|bytes| bytes.len() as u64)
            .map_err(|error| *error),
    );
    let bytes = result.unwrap_or_default();
    session.complete_prefetch(plan.offset, plan.length, bytes, policy);
}

#[cfg(test)]
mod tests {
    use std::io::{Cursor, Read};
    use std::sync::{Arc, Mutex};

    use chromvoid_core::rpc::types::{RpcRequest, RpcResponse};
    use chromvoid_core::rpc::{RpcInputStream, RpcRangeOutputStream, RpcRangeStreamMeta, RpcReply};
    use chromvoid_protocol::{TransportMetrics, TransportType};
    use serde_json::Value;

    use crate::core_adapter::{ConnectionState, CoreMode};

    use super::*;
    use crate::media_source::{LocalMediaKind, LocalMediaSourceManager};

    struct TestAdapter {
        reply: TestReply,
        last_request: Arc<Mutex<Option<RpcRequest>>>,
        request_count: Arc<Mutex<usize>>,
        transport_metrics: Option<TransportMetrics>,
    }

    enum TestReply {
        Range(Vec<u8>),
        Source(Vec<u8>),
        Chunked(Vec<Vec<u8>>),
        CancelAfterFirstRead(Vec<u8>, LocalMediaSourceSession),
        Truncated { bytes: Vec<u8>, claimed_length: u64 },
        Error(&'static str),
    }

    struct ChunkedReader {
        chunks: Vec<Vec<u8>>,
        index: usize,
    }

    impl Read for ChunkedReader {
        fn read(&mut self, buf: &mut [u8]) -> std::io::Result<usize> {
            let Some(chunk) = self.chunks.get(self.index) else {
                return Ok(0);
            };
            let len = chunk.len().min(buf.len());
            buf[..len].copy_from_slice(&chunk[..len]);
            self.index += 1;
            Ok(len)
        }
    }

    struct CancelAfterFirstRead {
        cursor: Cursor<Vec<u8>>,
        session: LocalMediaSourceSession,
        cancelled: bool,
    }

    impl Read for CancelAfterFirstRead {
        fn read(&mut self, buf: &mut [u8]) -> std::io::Result<usize> {
            let read = self.cursor.read(buf)?;
            if read > 0 && !self.cancelled {
                self.cancelled = true;
                self.session.cancel();
            }
            Ok(read)
        }
    }

    impl CoreAdapter for TestAdapter {
        fn mode(&self) -> CoreMode {
            CoreMode::Local
        }

        fn connection_state(&self) -> ConnectionState {
            ConnectionState::Disconnected
        }

        fn transport_metrics(&self) -> Option<TransportMetrics> {
            self.transport_metrics.clone()
        }

        fn is_unlocked(&self) -> bool {
            true
        }

        fn handle(&mut self, _req: &RpcRequest) -> RpcResponse {
            RpcResponse::error("unexpected json call", Some("TEST"))
        }

        fn handle_with_stream(
            &mut self,
            req: &RpcRequest,
            _stream: Option<RpcInputStream>,
        ) -> RpcReply {
            *self.request_count.lock().expect("request count lock") += 1;
            *self.last_request.lock().expect("last request lock") = Some(req.clone());
            match &self.reply {
                TestReply::Range(bytes) => RpcReply::RangeStream(RpcRangeOutputStream {
                    meta: RpcRangeStreamMeta {
                        name: "movie.mp4".to_string(),
                        mime_type: "video/mp4".to_string(),
                        file_size: bytes.len() as u64,
                        chunk_size: bytes.len() as u32,
                        range_offset: 0,
                        range_length: bytes.len() as u64,
                        source_revision: 7,
                    },
                    reader: Box::new(Cursor::new(bytes.clone())),
                }),
                TestReply::Source(source) => {
                    let offset = req.data["offset"].as_u64().expect("offset");
                    let length = req.data["length"].as_u64().expect("length");
                    let start = usize::try_from(offset).expect("offset fits usize");
                    let end = usize::try_from(offset.saturating_add(length))
                        .expect("end fits usize")
                        .min(source.len());
                    let bytes = source[start..end].to_vec();
                    RpcReply::RangeStream(RpcRangeOutputStream {
                        meta: RpcRangeStreamMeta {
                            name: "movie.mp4".to_string(),
                            mime_type: "video/mp4".to_string(),
                            file_size: source.len() as u64,
                            chunk_size: bytes.len() as u32,
                            range_offset: offset,
                            range_length: bytes.len() as u64,
                            source_revision: 7,
                        },
                        reader: Box::new(Cursor::new(bytes)),
                    })
                }
                TestReply::Chunked(chunks) => {
                    let total = chunks.iter().map(Vec::len).sum::<usize>() as u64;
                    RpcReply::RangeStream(RpcRangeOutputStream {
                        meta: RpcRangeStreamMeta {
                            name: "movie.mp4".to_string(),
                            mime_type: "video/mp4".to_string(),
                            file_size: total,
                            chunk_size: chunks.first().map(Vec::len).unwrap_or_default() as u32,
                            range_offset: 0,
                            range_length: total,
                            source_revision: 7,
                        },
                        reader: Box::new(ChunkedReader {
                            chunks: chunks.clone(),
                            index: 0,
                        }),
                    })
                }
                TestReply::CancelAfterFirstRead(bytes, session) => {
                    RpcReply::RangeStream(RpcRangeOutputStream {
                        meta: RpcRangeStreamMeta {
                            name: "movie.mp4".to_string(),
                            mime_type: "video/mp4".to_string(),
                            file_size: bytes.len() as u64,
                            chunk_size: bytes.len() as u32,
                            range_offset: 0,
                            range_length: bytes.len() as u64,
                            source_revision: 7,
                        },
                        reader: Box::new(CancelAfterFirstRead {
                            cursor: Cursor::new(bytes.clone()),
                            session: session.clone(),
                            cancelled: false,
                        }),
                    })
                }
                TestReply::Truncated {
                    bytes,
                    claimed_length,
                } => RpcReply::RangeStream(RpcRangeOutputStream {
                    meta: RpcRangeStreamMeta {
                        name: "movie.mp4".to_string(),
                        mime_type: "video/mp4".to_string(),
                        file_size: *claimed_length,
                        chunk_size: bytes.len() as u32,
                        range_offset: 0,
                        range_length: *claimed_length,
                        source_revision: 7,
                    },
                    reader: Box::new(Cursor::new(bytes.clone())),
                }),
                TestReply::Error(code) => RpcReply::Json(RpcResponse::error("failed", Some(*code))),
            }
        }

        fn save(&mut self) -> Result<(), String> {
            Ok(())
        }

        fn take_events(&mut self) -> Vec<Value> {
            Vec::new()
        }

        fn set_master_key(&mut self, _key: Option<String>) {}
    }

    fn adapter(
        reply: TestReply,
    ) -> (
        Arc<Mutex<Box<dyn CoreAdapter>>>,
        Arc<Mutex<Option<RpcRequest>>>,
        Arc<Mutex<usize>>,
    ) {
        let last_request = Arc::new(Mutex::new(None));
        let request_count = Arc::new(Mutex::new(0));
        (
            Arc::new(Mutex::new(Box::new(TestAdapter {
                reply,
                last_request: last_request.clone(),
                request_count: request_count.clone(),
                transport_metrics: None,
            }) as Box<dyn CoreAdapter>)),
            last_request,
            request_count,
        )
    }

    fn adapter_with_metrics(
        reply: TestReply,
        transport_metrics: Option<TransportMetrics>,
    ) -> (
        Arc<Mutex<Box<dyn CoreAdapter>>>,
        Arc<Mutex<Option<RpcRequest>>>,
        Arc<Mutex<usize>>,
    ) {
        let last_request = Arc::new(Mutex::new(None));
        let request_count = Arc::new(Mutex::new(0));
        (
            Arc::new(Mutex::new(Box::new(TestAdapter {
                reply,
                last_request: last_request.clone(),
                request_count: request_count.clone(),
                transport_metrics,
            }) as Box<dyn CoreAdapter>)),
            last_request,
            request_count,
        )
    }

    fn session() -> LocalMediaSourceSession {
        session_with_size(10 * 1024 * 1024)
    }

    fn session_with_size(size: u64) -> LocalMediaSourceSession {
        session_with_kind_and_size(LocalMediaKind::Video, size)
    }

    fn session_with_kind_and_size(kind: LocalMediaKind, size: u64) -> LocalMediaSourceSession {
        LocalMediaSourceManager::new()
            .register(9, kind, "video/mp4".to_string(), size, 7)
            .expect("register media source")
    }

    #[test]
    fn caps_requested_range_length() {
        let (adapter, last_request, _) = adapter(TestReply::Range(vec![1, 2, 3]));
        let session = session();

        let bytes =
            read_local_media_range(&adapter, &session, 5, MAX_MEDIA_RANGE_BYTES + 1).unwrap();

        assert_eq!(bytes, vec![1, 2, 3]);
        let request = last_request
            .lock()
            .expect("last request lock")
            .clone()
            .expect("request");
        assert_eq!(request.command, "catalog:downloadRange");
        assert_eq!(request.data["node_id"], 9);
        assert_eq!(request.data["offset"], 5);
        assert_eq!(request.data["length"], MAX_MEDIA_RANGE_BYTES);
        assert_eq!(request.data["expected_source_revision"], 7);
    }

    #[test]
    fn caps_usb_mobile_range_length_to_transport_limit() {
        let (adapter, last_request, _) = adapter_with_metrics(
            TestReply::Range(vec![1, 2, 3]),
            Some(TransportMetrics {
                transport_type: Some(TransportType::UsbMobile),
                ..TransportMetrics::default()
            }),
        );
        let session = session();

        let bytes =
            read_local_media_range(&adapter, &session, 5, MAX_MEDIA_RANGE_BYTES + 1).unwrap();

        assert_eq!(bytes, vec![1, 2, 3]);
        let request = last_request
            .lock()
            .expect("last request lock")
            .clone()
            .expect("request");
        assert_eq!(request.data["length"], USB_MOBILE_MEDIA_RANGE_BYTES);
    }

    #[test]
    fn usb_mobile_audio_full_cap_request_does_not_start_background_prefetch() {
        let source = vec![7_u8; (USB_MOBILE_MEDIA_RANGE_BYTES * 2) as usize];
        let (adapter, _, request_count) = adapter_with_metrics(
            TestReply::Source(source),
            Some(TransportMetrics {
                transport_type: Some(TransportType::UsbMobile),
                ..TransportMetrics::default()
            }),
        );
        let session =
            session_with_kind_and_size(LocalMediaKind::Audio, USB_MOBILE_MEDIA_RANGE_BYTES * 2);

        let bytes = read_local_media_range(&adapter, &session, 0, USB_MOBILE_MEDIA_RANGE_BYTES)
            .expect("read local media range");

        assert_eq!(bytes.len(), USB_MOBILE_MEDIA_RANGE_BYTES as usize);
        assert_eq!(*request_count.lock().expect("request count lock"), 1);
    }

    #[test]
    fn usb_mobile_video_full_cap_request_prefetches_next_range() {
        let source = vec![7_u8; (USB_MOBILE_MEDIA_RANGE_BYTES * 2) as usize];
        let (adapter, _, request_count) = adapter_with_metrics(
            TestReply::Source(source),
            Some(TransportMetrics {
                transport_type: Some(TransportType::UsbMobile),
                ..TransportMetrics::default()
            }),
        );
        let session = session_with_size(USB_MOBILE_MEDIA_RANGE_BYTES * 2);

        let first = read_local_media_range(&adapter, &session, 0, USB_MOBILE_MEDIA_RANGE_BYTES)
            .expect("read first media range");
        let second = read_local_media_range(
            &adapter,
            &session,
            USB_MOBILE_MEDIA_RANGE_BYTES,
            USB_MOBILE_MEDIA_RANGE_BYTES,
        )
        .expect("read prefetched media range");

        assert_eq!(first.len(), USB_MOBILE_MEDIA_RANGE_BYTES as usize);
        assert_eq!(second.len(), USB_MOBILE_MEDIA_RANGE_BYTES as usize);
        assert_eq!(*request_count.lock().expect("request count lock"), 2);
    }

    #[test]
    fn transport_pressure_blocks_background_prefetch_without_blocking_foreground_read() {
        let source = vec![7_u8; (USB_MOBILE_MEDIA_RANGE_BYTES * 2) as usize];
        let (adapter, _, request_count) = adapter_with_metrics(
            TestReply::Source(source),
            Some(TransportMetrics {
                transport_type: Some(TransportType::UsbMobile),
                attempt_count: 2,
                fallback_transition_p95_ms: Some(500),
                ..TransportMetrics::default()
            }),
        );
        let session = session_with_size(USB_MOBILE_MEDIA_RANGE_BYTES * 2);

        let bytes = read_local_media_range(&adapter, &session, 0, USB_MOBILE_MEDIA_RANGE_BYTES)
            .expect("foreground range should still read");

        assert_eq!(bytes.len(), USB_MOBILE_MEDIA_RANGE_BYTES as usize);
        assert_eq!(
            *request_count.lock().expect("request count lock"),
            1,
            "pressure should prevent the synchronous test prefetch from issuing a second RPC"
        );
    }

    #[test]
    fn cancelled_session_does_not_start_remote_range_read() {
        let (adapter, _, request_count) = adapter(TestReply::Range(vec![1, 2, 3]));
        let session = session();
        session.cancel();

        let error = read_local_media_range(&adapter, &session, 0, 16).unwrap_err();

        assert_eq!(error, LocalMediaRangeError::StreamNotFound);
        assert_eq!(*request_count.lock().expect("request count lock"), 0);
    }

    #[test]
    fn reads_ahead_for_sequential_usb_mobile_ranges() {
        let range_bytes = (0..USB_MOBILE_MEDIA_RANGE_BYTES)
            .map(|value| (value % 251) as u8)
            .collect::<Vec<_>>();
        let (adapter, last_request, request_count) = adapter_with_metrics(
            TestReply::Range(range_bytes),
            Some(TransportMetrics {
                transport_type: Some(TransportType::UsbMobile),
                ..TransportMetrics::default()
            }),
        );
        let session = session();

        let first = read_local_media_range(&adapter, &session, 0, 16).unwrap();
        let second = read_local_media_range(&adapter, &session, 16, 16).unwrap();

        assert_eq!(first, (0..16).map(|value| value as u8).collect::<Vec<_>>());
        assert_eq!(
            second,
            (16..32).map(|value| value as u8).collect::<Vec<_>>()
        );
        assert_eq!(*request_count.lock().expect("request count lock"), 1);
        let request = last_request
            .lock()
            .expect("last request lock")
            .clone()
            .expect("request");
        assert_eq!(request.data["offset"], 0);
        assert_eq!(
            request.data["length"],
            USB_MOBILE_MEDIA_INITIAL_READ_AHEAD_BYTES
        );
    }

    #[test]
    fn tiny_side_range_does_not_reset_usb_mobile_video_read_ahead() {
        const VIDEO_SIZE: usize = 2 * 1024 * 1024;
        const SIDE_RANGE_BYTES: u64 = 14 * 1024;

        let source = (0..VIDEO_SIZE)
            .map(|value| (value % 251) as u8)
            .collect::<Vec<_>>();
        let (adapter, _, request_count) = adapter_with_metrics(
            TestReply::Source(source.clone()),
            Some(TransportMetrics {
                transport_type: Some(TransportType::UsbMobile),
                ..TransportMetrics::default()
            }),
        );
        let session = session_with_size(VIDEO_SIZE as u64);

        let first = read_local_media_range(&adapter, &session, 0, USB_MOBILE_MEDIA_RANGE_BYTES)
            .expect("read first foreground range");
        let tail_offset = VIDEO_SIZE as u64 - SIDE_RANGE_BYTES;
        let tail = read_local_media_range(&adapter, &session, tail_offset, SIDE_RANGE_BYTES)
            .expect("read tiny side range");
        let forward = read_local_media_range(
            &adapter,
            &session,
            USB_MOBILE_MEDIA_RANGE_BYTES,
            USB_MOBILE_MEDIA_RANGE_BYTES,
        )
        .expect("read forward range from preserved prefetch");

        assert_eq!(first, source[..USB_MOBILE_MEDIA_RANGE_BYTES as usize]);
        assert_eq!(
            tail,
            source[tail_offset as usize..tail_offset as usize + SIDE_RANGE_BYTES as usize]
        );
        assert_eq!(
            forward,
            source[USB_MOBILE_MEDIA_RANGE_BYTES as usize
                ..(USB_MOBILE_MEDIA_RANGE_BYTES * 2) as usize]
        );
        assert_eq!(*request_count.lock().expect("request count lock"), 4);
    }

    #[test]
    fn cancelled_session_stops_reader_between_chunks() {
        let session = session();
        let (adapter, _, request_count) = adapter(TestReply::CancelAfterFirstRead(
            vec![1_u8; (USB_MOBILE_MEDIA_RANGE_BYTES * 2) as usize],
            session.clone(),
        ));

        let error = read_local_media_range(&adapter, &session, 0, USB_MOBILE_MEDIA_RANGE_BYTES)
            .expect_err("cancelled reader should stop current read");

        assert_eq!(error, LocalMediaRangeError::StreamNotFound);
        assert_eq!(*request_count.lock().expect("request count lock"), 1);
        assert!(session.is_cancelled());
    }

    #[test]
    fn bounds_remote_rpc_count_for_small_sequential_usb_mobile_ranges() {
        const VIDEO_SIZE: usize = 8 * 1024 * 1024;
        const WEBVIEW_RANGE_BYTES: usize = 32 * 1024;

        let source = (0..VIDEO_SIZE)
            .map(|value| (value % 251) as u8)
            .collect::<Vec<_>>();
        let (adapter, _, request_count) = adapter_with_metrics(
            TestReply::Source(source.clone()),
            Some(TransportMetrics {
                transport_type: Some(TransportType::UsbMobile),
                ..TransportMetrics::default()
            }),
        );
        let session = session_with_size(VIDEO_SIZE as u64);

        let mut offset = 0;
        while offset < VIDEO_SIZE {
            let len = WEBVIEW_RANGE_BYTES.min(VIDEO_SIZE - offset);
            let bytes = read_local_media_range(&adapter, &session, offset as u64, len as u64)
                .expect("read local media range");
            assert_eq!(bytes, source[offset..offset + len]);
            offset += len;
        }

        let actual_remote_reads = *request_count.lock().expect("request count lock");
        assert!(
            actual_remote_reads <= 20,
            "adaptive read-ahead should avoid per-browser-range remote RPCs: {actual_remote_reads}"
        );
    }

    #[test]
    fn random_seek_resets_usb_mobile_read_ahead_window() {
        let source = vec![3_u8; 5 * 1024 * 1024];
        let (adapter, last_request, _) = adapter_with_metrics(
            TestReply::Source(source),
            Some(TransportMetrics {
                transport_type: Some(TransportType::UsbMobile),
                ..TransportMetrics::default()
            }),
        );
        let session = session_with_size(5 * 1024 * 1024);

        let _ = read_local_media_range(&adapter, &session, 0, 16).unwrap();
        let _ = read_local_media_range(&adapter, &session, 2 * 1024 * 1024, 16).unwrap();

        let request = last_request
            .lock()
            .expect("last request lock")
            .clone()
            .expect("request");
        assert_eq!(request.data["offset"], 2 * 1024 * 1024);
        assert_eq!(
            request.data["length"],
            USB_MOBILE_MEDIA_INITIAL_READ_AHEAD_BYTES
        );
    }

    #[test]
    fn truncated_range_stream_is_reported_as_read_failure() {
        let (adapter, _, _) = adapter(TestReply::Truncated {
            bytes: vec![1, 2, 3],
            claimed_length: 8,
        });
        let session = session();

        let error = read_local_media_range(&adapter, &session, 0, 8).unwrap_err();

        assert_eq!(error, LocalMediaRangeError::RangeReadFailed);
    }

    #[test]
    fn http_streaming_uses_read_ahead_window_and_prefetch_over_usb() {
        const SOURCE_SIZE: usize = 2 * 1024 * 1024;

        let source = (0..SOURCE_SIZE)
            .map(|value| (value % 251) as u8)
            .collect::<Vec<_>>();
        let (adapter, _, request_count) = adapter_with_metrics(
            TestReply::Source(source.clone()),
            Some(TransportMetrics {
                transport_type: Some(TransportType::UsbMobile),
                ..TransportMetrics::default()
            }),
        );
        let session = session_with_size(SOURCE_SIZE as u64);

        let mut delivered = Vec::new();
        let mut offset = 0_u64;
        while offset < SOURCE_SIZE as u64 {
            let len = USB_MOBILE_MEDIA_RANGE_BYTES.min(SOURCE_SIZE as u64 - offset);
            let served = stream_media_source_range(&adapter, &session, offset, len, |chunk| {
                delivered.extend_from_slice(chunk);
                Ok(())
            })
            .expect("stream media range");
            assert_eq!(served, len, "each response stays bounded by the range cap");
            offset += served;
        }

        assert_eq!(delivered, source);
        let actual_remote_reads = *request_count.lock().expect("request count lock");
        assert!(
            actual_remote_reads <= 2,
            "window growth + prefetch should collapse serial cap-sized RPCs: {actual_remote_reads}"
        );
    }

    #[test]
    fn maps_stale_revision_errors() {
        let (adapter, _, _) = adapter(TestReply::Error("ERR_MEDIA_STREAM_STALE"));
        let session = session();

        let error = read_local_media_range(&adapter, &session, 0, 1).unwrap_err();

        assert_eq!(error, LocalMediaRangeError::StreamStale);
    }

    #[test]
    fn streams_http_video_range_without_vec_materialization_boundary() {
        let chunks = vec![vec![1_u8, 2, 3], vec![4_u8, 5], vec![6_u8]];
        let (adapter, last_request, request_count) = adapter(TestReply::Chunked(chunks.clone()));
        let session = session_with_size(6);
        let mut delivered = Vec::new();
        let mut chunk_lengths = Vec::new();

        let total = stream_media_source_range(&adapter, &session, 0, 6, |chunk| {
            chunk_lengths.push(chunk.len());
            delivered.extend_from_slice(chunk);
            Ok(())
        })
        .expect("stream local media range");

        assert_eq!(total, 6);
        assert_eq!(delivered, chunks.concat());
        assert_eq!(chunk_lengths, vec![3, 2, 1]);
        assert_eq!(*request_count.lock().expect("request count lock"), 1);
        let request = last_request
            .lock()
            .expect("last request lock")
            .clone()
            .expect("request");
        assert_eq!(request.data["length"], 6);
    }

    #[test]
    fn selects_mobile_local_video_read_ahead_policy_for_android_catalog_provider() {
        let policy = read_ahead_policy_for_context(
            Some(CoreMode::Local),
            None,
            LocalMediaRuntimePlatform::Mobile,
            LocalMediaKind::Video,
        )
        .expect("mobile local video policy");

        assert_eq!(policy.initial_window_bytes, 2 * 1024 * 1024);
        assert_eq!(policy.max_window_bytes, 16 * 1024 * 1024);
        assert!(policy.background_prefetch);
    }

    #[test]
    fn keeps_audio_without_local_video_read_ahead_policy() {
        let policy = read_ahead_policy_for_context(
            Some(CoreMode::Local),
            None,
            LocalMediaRuntimePlatform::Mobile,
            LocalMediaKind::Audio,
        );

        assert!(policy.is_none());
    }
}
