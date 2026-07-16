use std::convert::Infallible;
use std::net::SocketAddr;
use std::sync::atomic::{AtomicUsize, Ordering};
use std::sync::{Arc, Mutex};
use std::time::{Duration, Instant};

use bytes::Bytes;
use futures_util::stream;
use http_body_util::{combinators::BoxBody, BodyExt as _, Full, StreamBody};
use hyper::body::{Frame, Incoming};
use hyper::header::{ACCEPT_RANGES, CACHE_CONTROL, CONTENT_LENGTH, CONTENT_RANGE, CONTENT_TYPE};
use hyper::server::conn::http1;
use hyper::service::service_fn;
use hyper::{Method, Request, Response, StatusCode};
use hyper_util::rt::TokioIo;
use tauri::Manager;
use tokio::net::TcpListener;
use tokio::sync::{mpsc, watch};
use tokio::task::JoinSet;
use tracing::{debug, info, warn};

use super::protocol::{
    emit_media_stream_error, error_event, map_local_media_range_error, MediaStreamErrorEvent,
};
use crate::app_state::AppState;
use crate::media_source::{
    media_range_cap_bytes, read_local_media_range_with_intent, stream_media_source_range_chunks,
    LocalMediaKind, LocalMediaRangeError, LocalMediaReadIntent, LocalMediaSourceManager,
    LocalMediaSourceSession,
};
use crate::task_lifecycle::{ManagedTaskName, TaskLifecycleRuntime, TaskShutdownReason};

const MEDIA_HTTP_CHUNK_BYTES: u64 = 64 * 1024;
const MEDIA_HTTP_BODY_FRAME_CAPACITY: usize = 4;
const MEDIA_HTTP_MAX_CONCURRENT_STREAM_READERS: usize = 16;
const ERR_MEDIA_STREAM_NOT_FOUND: &str = "ERR_MEDIA_STREAM_NOT_FOUND";
const ERR_MEDIA_RANGE_INVALID: &str = "ERR_MEDIA_RANGE_INVALID";
const ERR_MEDIA_STREAM_BUSY: &str = "ERR_MEDIA_STREAM_BUSY";

static MEDIA_HTTP_ACTIVE_STREAM_READERS: AtomicUsize = AtomicUsize::new(0);

/// Bounds the number of blocking reader threads spawned for HTTP GETs.
struct MediaHttpReaderPermit;

impl MediaHttpReaderPermit {
    fn try_acquire() -> Option<Self> {
        MEDIA_HTTP_ACTIVE_STREAM_READERS
            .fetch_update(Ordering::SeqCst, Ordering::SeqCst, |current| {
                (current < MEDIA_HTTP_MAX_CONCURRENT_STREAM_READERS).then_some(current + 1)
            })
            .ok()
            .map(|_| Self)
    }
}

impl Drop for MediaHttpReaderPermit {
    fn drop(&mut self) {
        MEDIA_HTTP_ACTIVE_STREAM_READERS.fetch_sub(1, Ordering::SeqCst);
    }
}

#[derive(Debug, Default)]
pub(crate) struct MediaHttpStreamRuntimeState {
    addr: Mutex<Option<SocketAddr>>,
}

impl MediaHttpStreamRuntimeState {
    pub(crate) fn new() -> Self {
        Self::default()
    }

    pub(crate) fn set_addr(&self, addr: SocketAddr) {
        match self.addr.lock() {
            Ok(mut slot) => *slot = Some(addr),
            Err(_) => warn!("media_http: runtime addr mutex poisoned during set_addr"),
        }
    }

    pub(crate) fn clear_addr(&self) {
        match self.addr.lock() {
            Ok(mut slot) => *slot = None,
            Err(_) => warn!("media_http: runtime addr mutex poisoned during clear_addr"),
        }
    }

    pub(crate) fn base_url(&self) -> Option<String> {
        self.addr
            .lock()
            .ok()
            .and_then(|slot| *slot)
            .map(|addr| format!("http://{}:{}", addr.ip(), addr.port()))
    }
}

pub(crate) fn spawn_media_http_stream_server(
    app: tauri::AppHandle,
    task_lifecycle: Arc<TaskLifecycleRuntime>,
) -> Result<(), String> {
    task_lifecycle.spawn_unique_async(ManagedTaskName::MediaHttpServer, move |shutdown_rx| {
        run_media_http_stream_server(app, shutdown_rx)
    })
}

async fn run_media_http_stream_server(
    app: tauri::AppHandle,
    mut shutdown_rx: watch::Receiver<Option<TaskShutdownReason>>,
) {
    let listener = match TcpListener::bind(("127.0.0.1", 0)).await {
        Ok(listener) => listener,
        Err(error) => {
            warn!("media_http: failed to bind loopback listener: {error}");
            return;
        }
    };
    let addr = match listener.local_addr() {
        Ok(addr) if addr.ip().is_loopback() => addr,
        Ok(addr) => {
            warn!("media_http: refusing non-loopback listener addr {addr}");
            return;
        }
        Err(error) => {
            warn!("media_http: failed to read listener addr: {error}");
            return;
        }
    };

    if let Some(state) = app.try_state::<AppState>() {
        state.media_http_stream_runtime.set_addr(addr);
    }
    info!("media_http: listening on {addr}");

    let mut connections = JoinSet::new();
    loop {
        tokio::select! {
            _ = shutdown_rx.changed() => {
                info!("media_http: shutdown requested");
                break;
            }
            accept = listener.accept() => {
                let (stream, peer) = match accept {
                    Ok(value) => value,
                    Err(error) => {
                        warn!("media_http: accept failed: {error}");
                        continue;
                    }
                };
                if !peer.ip().is_loopback() {
                    warn!("media_http: rejected non-loopback peer {}", peer.ip());
                    continue;
                }
                let app_handle = app.clone();
                let io = TokioIo::new(stream);
                connections.spawn(async move {
                    let svc = service_fn(move |request| {
                        let app_handle = app_handle.clone();
                        async move { Ok::<_, Infallible>(handle_media_http_request(app_handle, request)) }
                    });
                    if let Err(error) = http1::Builder::new().serve_connection(io, svc).await {
                        debug!("media_http: connection failed: {error}");
                    }
                });
            }
            join_result = connections.join_next(), if !connections.is_empty() => {
                if let Some(Err(error)) = join_result {
                    debug!("media_http: connection task failed: {error}");
                }
            }
        }
    }

    if let Some(state) = app.try_state::<AppState>() {
        state.media_http_stream_runtime.clear_addr();
    }
    connections.shutdown().await;
}

fn handle_media_http_request(
    app: tauri::AppHandle,
    request: Request<Incoming>,
) -> Response<BoxBody<Bytes, Infallible>> {
    match *request.method() {
        Method::HEAD | Method::GET => {}
        _ => return empty_response(StatusCode::METHOD_NOT_ALLOWED),
    }

    let Some(stream_id) = stream_id_from_uri(request.uri().path()) else {
        return empty_response(StatusCode::NOT_FOUND);
    };
    let Some((adapter, manager)) = app
        .try_state::<AppState>()
        .map(|state| (state.adapter.clone(), state.media_streams.clone()))
    else {
        return empty_response(StatusCode::SERVICE_UNAVAILABLE);
    };
    let Some(session) = manager.get(&stream_id) else {
        warn!(
            "media_http: unknown or expired stream stream_id={}",
            redacted_stream_id(&stream_id)
        );
        emit_media_stream_error(
            &app,
            MediaStreamErrorEvent {
                stream_id,
                code: ERR_MEDIA_STREAM_NOT_FOUND.to_string(),
                http_status: Some(StatusCode::NOT_FOUND.as_u16()),
                node_id: None,
                source_revision: None,
            },
        );
        return media_error_response(StatusCode::NOT_FOUND, ERR_MEDIA_STREAM_NOT_FOUND);
    };
    // Activity extends the idle TTL so playback does not hard-expire mid-session.
    manager.refresh(&session.token, session.generation);

    let range_header = request
        .headers()
        .get(hyper::header::RANGE)
        .and_then(|value| value.to_str().ok());
    let range = match normalize_range(range_header, session.size, media_range_cap_bytes(&adapter)) {
        Ok(range) => range,
        Err(()) => return range_not_satisfiable_response(session.size),
    };

    let status = response_status_for_range(range_header, range, session.size);
    if request.method() == Method::HEAD {
        return head_response(&session, range, status);
    }

    stream_response(app, adapter, manager, session, range, status)
}

fn stream_id_from_uri(path: &str) -> Option<String> {
    let id = path.strip_prefix("/media/")?.trim();
    if id.is_empty() || id.contains('/') {
        return None;
    }
    Some(id.to_string())
}

#[derive(Clone, Copy, Debug, PartialEq, Eq)]
struct HttpRange {
    start: u64,
    end: u64,
}

impl HttpRange {
    fn len(self) -> u64 {
        self.end.saturating_sub(self.start).saturating_add(1)
    }

    fn is_full(self, file_size: u64) -> bool {
        self.start == 0 && self.len() == file_size
    }
}

fn normalize_range(
    header: Option<&str>,
    file_size: u64,
    max_response_bytes: u64,
) -> Result<HttpRange, ()> {
    if file_size == 0 || max_response_bytes == 0 {
        return Err(());
    }
    let max_end_for = |start: u64| {
        start
            .saturating_add(max_response_bytes)
            .saturating_sub(1)
            .min(file_size - 1)
    };
    // RFC 9110: a request without a Range header gets the full representation
    // with a 200 response. The body is still streamed progressively in
    // cap-sized chunks; only ranged responses are capped per response.
    let Some(header) = header else {
        return Ok(HttpRange {
            start: 0,
            end: file_size - 1,
        });
    };
    let spec = header.trim().strip_prefix("bytes=").ok_or(())?.trim();
    let (start_raw, end_raw) = spec.split_once('-').ok_or(())?;
    if start_raw.is_empty() {
        let suffix = end_raw.trim().parse::<u64>().map_err(|_| ())?;
        if suffix == 0 {
            return Err(());
        }
        let len = suffix.min(file_size).min(max_response_bytes);
        return Ok(HttpRange {
            start: file_size - len,
            end: file_size - 1,
        });
    }
    let start = start_raw.trim().parse::<u64>().map_err(|_| ())?;
    if start >= file_size {
        return Err(());
    }
    let end = if end_raw.trim().is_empty() {
        max_end_for(start)
    } else {
        end_raw
            .trim()
            .parse::<u64>()
            .map_err(|_| ())?
            .min(file_size - 1)
            .min(max_end_for(start))
    };
    if end < start {
        return Err(());
    }
    Ok(HttpRange { start, end })
}

fn response_status_for_range(
    range_header: Option<&str>,
    range: HttpRange,
    file_size: u64,
) -> StatusCode {
    if range_header.is_some() || !range.is_full(file_size) {
        StatusCode::PARTIAL_CONTENT
    } else {
        StatusCode::OK
    }
}

fn stream_response(
    app: tauri::AppHandle,
    adapter: Arc<Mutex<Box<dyn crate::core_adapter::CoreAdapter>>>,
    manager: Arc<LocalMediaSourceManager>,
    session: LocalMediaSourceSession,
    range: HttpRange,
    status: StatusCode,
) -> Response<BoxBody<Bytes, Infallible>> {
    let content_length = range.len();
    let Some(reader_permit) = MediaHttpReaderPermit::try_acquire() else {
        warn!(
            "media_http: reader thread limit reached stream_id={}",
            redacted_stream_id(&session.token)
        );
        emit_media_stream_error(
            &app,
            error_event(
                &session,
                ERR_MEDIA_STREAM_BUSY,
                StatusCode::SERVICE_UNAVAILABLE,
            ),
        );
        return media_error_response(StatusCode::SERVICE_UNAVAILABLE, ERR_MEDIA_STREAM_BUSY);
    };
    let (tx, rx) = mpsc::channel::<Result<Frame<Bytes>, Infallible>>(
        media_http_body_frame_capacity(session.kind),
    );
    let session_for_reader = session.clone();
    std::thread::spawn(move || {
        let _reader_permit = reader_permit;
        let started_at = Instant::now();
        let mut offset = range.start;
        let mut response_bytes = 0usize;
        let mut terminal_reason = "completed";
        // R18: read_ms measures time spent fetching from the source, while
        // response_ms measures the full request lifetime including delivery.
        let mut read_elapsed = Duration::ZERO;
        let mut send_elapsed = Duration::ZERO;
        let body_chunk_bytes =
            media_http_body_chunk_bytes(session_for_reader.kind, media_range_cap_bytes(&adapter));
        let Some(_lease) =
            manager.begin_request(&session_for_reader.token, session_for_reader.generation)
        else {
            terminal_reason = "stale";
            emit_media_stream_error(
                &app,
                error_event(
                    &session_for_reader,
                    ERR_MEDIA_STREAM_NOT_FOUND,
                    StatusCode::NOT_FOUND,
                ),
            );
            info!(
                "media_http: range delivery=loopback-http stream_id={} node_id={} source_revision={} range_start={} range_len={} response_bytes={} cache_hit=false prefetch_hit=false read_ms={} response_ms={} status={} reason={}",
                redacted_stream_id(&session_for_reader.token),
                redacted_node_id(session_for_reader.node_id),
                session_for_reader.source_revision,
                range.start,
                range.len(),
                response_bytes,
                0,
                started_at.elapsed().as_millis(),
                status.as_u16(),
                terminal_reason,
            );
            return;
        };
        while offset <= range.end {
            if session_for_reader.is_cancelled() {
                terminal_reason = "cancelled";
                break;
            }
            // Successful activity keeps extending the idle TTL (R1).
            manager.refresh(&session_for_reader.token, session_for_reader.generation);
            let remaining = range.end - offset + 1;
            let read_len = remaining.min(body_chunk_bytes);
            if session_for_reader.kind == LocalMediaKind::Video {
                let mut client_closed = false;
                let call_started = Instant::now();
                let stream_result = stream_media_source_range_chunks(
                    &adapter,
                    &session_for_reader,
                    offset,
                    read_len,
                    |chunk| {
                        offset = offset.saturating_add(chunk.len() as u64);
                        response_bytes = response_bytes.saturating_add(chunk.len());
                        let send_started = Instant::now();
                        let sent = tx.blocking_send(Ok(Frame::data(chunk)));
                        send_elapsed += send_started.elapsed();
                        if sent.is_err() {
                            client_closed = true;
                            return Err(LocalMediaRangeError::RangeReadFailed);
                        }
                        Ok(())
                    },
                );
                read_elapsed += call_started.elapsed();
                match stream_result {
                    Ok(0) => {
                        terminal_reason = "eof";
                        break;
                    }
                    Ok(_) => {}
                    Err(error) => {
                        if client_closed {
                            terminal_reason = "client_closed";
                            break;
                        }
                        if error == LocalMediaRangeError::Aborted {
                            terminal_reason = "cancelled";
                            break;
                        }
                        let (code, http_status) = map_local_media_range_error(error);
                        terminal_reason = "read_failed";
                        emit_media_stream_error(
                            &app,
                            error_event(&session_for_reader, &code, http_status),
                        );
                        warn!(
                            "media_http: range read failed stream_id={} node_id={} source_revision={} range_start={} range_len={} error={:?} code={} status={}",
                            redacted_stream_id(&session_for_reader.token),
                            redacted_node_id(session_for_reader.node_id),
                            session_for_reader.source_revision,
                            offset,
                            read_len,
                            error,
                            code,
                            http_status.as_u16(),
                        );
                        break;
                    }
                }
            } else {
                // Hold the session read lock only around the source fetch, not
                // across the client-backpressured send (R10).
                let read_started = Instant::now();
                let read_result = {
                    let read_lock = if uses_session_read_lock_for_http(session_for_reader.kind) {
                        match session_for_reader.read_lock.lock() {
                            Ok(lock) => Some(lock),
                            Err(_) => {
                                terminal_reason = "read_lock_failed";
                                emit_media_stream_error(
                                    &app,
                                    error_event(
                                        &session_for_reader,
                                        "ERR_MEDIA_SOURCE_LOAD_FAILED",
                                        StatusCode::INTERNAL_SERVER_ERROR,
                                    ),
                                );
                                break;
                            }
                        }
                    } else {
                        None
                    };
                    let _read_lock = read_lock;
                    read_local_media_range_with_intent(
                        &adapter,
                        &session_for_reader,
                        offset,
                        read_len,
                        LocalMediaReadIntent::HttpStreaming,
                    )
                };
                read_elapsed += read_started.elapsed();
                match read_result {
                    Ok(bytes) if bytes.is_empty() => {
                        terminal_reason = "eof";
                        break;
                    }
                    Ok(bytes) => {
                        offset = offset.saturating_add(bytes.len() as u64);
                        response_bytes = response_bytes.saturating_add(bytes.len());
                        let send_started = Instant::now();
                        let sent = tx.blocking_send(Ok(Frame::data(Bytes::from(bytes))));
                        send_elapsed += send_started.elapsed();
                        if sent.is_err() {
                            terminal_reason = "client_closed";
                            break;
                        }
                    }
                    Err(error) => {
                        if error == LocalMediaRangeError::Aborted {
                            terminal_reason = "cancelled";
                            break;
                        }
                        let (code, http_status) = map_local_media_range_error(error);
                        terminal_reason = "read_failed";
                        emit_media_stream_error(
                            &app,
                            error_event(&session_for_reader, &code, http_status),
                        );
                        warn!(
                            "media_http: range read failed stream_id={} node_id={} source_revision={} range_start={} range_len={} error={:?} code={} status={}",
                            redacted_stream_id(&session_for_reader.token),
                            redacted_node_id(session_for_reader.node_id),
                            session_for_reader.source_revision,
                            offset,
                            read_len,
                            error,
                            code,
                            http_status.as_u16(),
                        );
                        break;
                    }
                }
            }
        }
        if terminal_reason == "completed" {
            manager.refresh(&session_for_reader.token, session_for_reader.generation);
        }
        info!(
            "media_http: range delivery=loopback-http stream_id={} node_id={} source_revision={} range_start={} range_len={} response_bytes={} cache_hit=false prefetch_hit=false read_ms={} response_ms={} status={} reason={}",
            redacted_stream_id(&session_for_reader.token),
            redacted_node_id(session_for_reader.node_id),
            session_for_reader.source_revision,
            range.start,
            range.len(),
            response_bytes,
            read_elapsed.saturating_sub(send_elapsed).as_millis(),
            started_at.elapsed().as_millis(),
            status.as_u16(),
            terminal_reason,
        );
    });

    let body_stream = stream::unfold(rx, |mut rx| async move {
        rx.recv().await.map(|item| (item, rx))
    });
    let body = StreamBody::new(body_stream).boxed();
    let mut builder = response_builder(status)
        .header(CONTENT_TYPE, session.mime_type.as_str())
        .header(ACCEPT_RANGES, "bytes")
        .header(CONTENT_LENGTH, content_length.to_string());
    if status == StatusCode::PARTIAL_CONTENT {
        builder = builder.header(
            CONTENT_RANGE,
            format!("bytes {}-{}/{}", range.start, range.end, session.size),
        );
    }
    builder
        .body(body)
        .unwrap_or_else(|_| empty_response(StatusCode::INTERNAL_SERVER_ERROR))
}

fn media_http_body_chunk_bytes(kind: LocalMediaKind, range_cap_bytes: u64) -> u64 {
    if range_cap_bytes == 0 {
        return 0;
    }
    if kind == LocalMediaKind::Video {
        return range_cap_bytes;
    }
    MEDIA_HTTP_CHUNK_BYTES.min(range_cap_bytes)
}

fn media_http_body_frame_capacity(_kind: LocalMediaKind) -> usize {
    MEDIA_HTTP_BODY_FRAME_CAPACITY
}

#[cfg(test)]
fn media_http_max_outstanding_body_bytes(kind: LocalMediaKind, range_cap_bytes: u64) -> u64 {
    media_http_body_chunk_bytes(kind, range_cap_bytes)
        .saturating_mul(media_http_body_frame_capacity(kind) as u64)
}

fn uses_session_read_lock_for_http(kind: LocalMediaKind) -> bool {
    kind != LocalMediaKind::Video
}

fn head_response(
    session: &LocalMediaSourceSession,
    range: HttpRange,
    status: StatusCode,
) -> Response<BoxBody<Bytes, Infallible>> {
    let mut builder = response_builder(status)
        .header(CONTENT_TYPE, session.mime_type.as_str())
        .header(ACCEPT_RANGES, "bytes")
        .header(CONTENT_LENGTH, range.len().to_string());
    if status == StatusCode::PARTIAL_CONTENT {
        builder = builder.header(
            CONTENT_RANGE,
            format!("bytes {}-{}/{}", range.start, range.end, session.size),
        );
    }
    builder
        .body(empty_body())
        .unwrap_or_else(|_| empty_response(StatusCode::INTERNAL_SERVER_ERROR))
}

fn range_not_satisfiable_response(file_size: u64) -> Response<BoxBody<Bytes, Infallible>> {
    response_builder(StatusCode::RANGE_NOT_SATISFIABLE)
        .header(CONTENT_RANGE, format!("bytes */{file_size}"))
        .header("x-chromvoid-media-error", ERR_MEDIA_RANGE_INVALID)
        .body(empty_body())
        .unwrap_or_else(|_| empty_response(StatusCode::RANGE_NOT_SATISFIABLE))
}

fn media_error_response(
    status: StatusCode,
    code: &'static str,
) -> Response<BoxBody<Bytes, Infallible>> {
    response_builder(status)
        .header("x-chromvoid-media-error", code)
        .body(empty_body())
        .unwrap_or_else(|_| empty_response(status))
}

fn empty_response(status: StatusCode) -> Response<BoxBody<Bytes, Infallible>> {
    response_builder(status)
        .header(CONTENT_LENGTH, "0")
        .body(empty_body())
        .unwrap_or_else(|_| Response::new(empty_body()))
}

fn response_builder(status: StatusCode) -> hyper::http::response::Builder {
    Response::builder()
        .status(status)
        .header(CACHE_CONTROL, "no-store")
        .header("x-content-type-options", "nosniff")
}

fn empty_body() -> BoxBody<Bytes, Infallible> {
    Full::new(Bytes::new()).boxed()
}

fn redacted_stream_id(stream_id: &str) -> String {
    let prefix = stream_id.chars().take(8).collect::<String>();
    format!("redacted:{prefix}")
}

fn redacted_node_id(node_id: u64) -> String {
    format!("node:{}", node_id % 10_000)
}

#[cfg(test)]
mod tests {
    use super::*;

    #[test]
    fn parses_range_and_suffix_range() {
        assert_eq!(
            normalize_range(Some("bytes=10-19"), 100, 100).unwrap(),
            HttpRange { start: 10, end: 19 }
        );
        assert_eq!(
            normalize_range(Some("bytes=-10"), 100, 100).unwrap(),
            HttpRange { start: 90, end: 99 }
        );
        assert_eq!(
            normalize_range(None, 100, 100).unwrap(),
            HttpRange { start: 0, end: 99 }
        );
    }

    #[test]
    fn caps_only_ranged_requests_to_response_limit() {
        // No Range header: full representation (delivered progressively).
        assert_eq!(
            normalize_range(None, 1024, 256).unwrap(),
            HttpRange {
                start: 0,
                end: 1023
            }
        );
        assert_eq!(
            normalize_range(Some("bytes=128-"), 1024, 256).unwrap(),
            HttpRange {
                start: 128,
                end: 383
            }
        );
        assert_eq!(
            normalize_range(Some("bytes=128-900"), 1024, 256).unwrap(),
            HttpRange {
                start: 128,
                end: 383
            }
        );
    }

    #[test]
    fn rejects_invalid_or_unsatisfiable_range() {
        assert!(normalize_range(Some("items=0-1"), 100, 100).is_err());
        assert!(normalize_range(Some("bytes=100-120"), 100, 100).is_err());
        assert!(normalize_range(Some("bytes=20-10"), 100, 100).is_err());
        assert!(normalize_range(Some("bytes=-0"), 100, 100).is_err());
    }

    #[test]
    fn accepts_only_media_route_tokens() {
        assert_eq!(
            stream_id_from_uri("/media/abc-123").as_deref(),
            Some("abc-123")
        );
        assert!(stream_id_from_uri("/media/abc/123").is_none());
        assert!(stream_id_from_uri("/other/abc").is_none());
    }

    #[test]
    fn full_response_does_not_emit_content_range_for_200_ok() {
        let manager = crate::media_source::LocalMediaSourceManager::new();
        let session = manager
            .register(
                42,
                crate::media_source::LocalMediaKind::Video,
                "video/mp4".to_string(),
                1024,
                7,
            )
            .expect("register media source");
        let response = head_response(
            &session,
            HttpRange {
                start: 0,
                end: 1023,
            },
            StatusCode::OK,
        );

        assert_eq!(response.status(), StatusCode::OK);
        assert!(response.headers().get(CONTENT_RANGE).is_none());
        assert_eq!(
            response
                .headers()
                .get(CONTENT_LENGTH)
                .and_then(|value| value.to_str().ok()),
            Some("1024"),
        );
    }

    #[test]
    fn no_range_request_yields_full_ok_response_even_with_small_cap() {
        let full = normalize_range(None, 1024, 256).unwrap();
        assert_eq!(
            full,
            HttpRange {
                start: 0,
                end: 1023
            }
        );
        assert_eq!(response_status_for_range(None, full, 1024), StatusCode::OK);

        let small = normalize_range(None, 128, 256).unwrap();
        assert_eq!(response_status_for_range(None, small, 128), StatusCode::OK);

        let ranged = normalize_range(Some("bytes=0-"), 1024, 256).unwrap();
        assert_eq!(
            response_status_for_range(Some("bytes=0-"), ranged, 1024),
            StatusCode::PARTIAL_CONTENT
        );
    }

    #[test]
    fn head_without_range_reports_full_content_length() {
        let manager = crate::media_source::LocalMediaSourceManager::new();
        let session = manager
            .register(
                43,
                crate::media_source::LocalMediaKind::Video,
                "video/mp4".to_string(),
                10 * 1024 * 1024,
                7,
            )
            .expect("register media source");
        let range = normalize_range(None, session.size, 256 * 1024).unwrap();
        let status = response_status_for_range(None, range, session.size);
        let response = head_response(&session, range, status);

        assert_eq!(response.status(), StatusCode::OK);
        assert!(response.headers().get(CONTENT_RANGE).is_none());
        assert_eq!(
            response
                .headers()
                .get(CONTENT_LENGTH)
                .and_then(|value| value.to_str().ok()),
            Some("10485760"),
        );
    }

    #[test]
    fn reader_permit_bounds_concurrent_reader_threads() {
        let mut permits = Vec::new();
        for _ in 0..MEDIA_HTTP_MAX_CONCURRENT_STREAM_READERS {
            permits.push(MediaHttpReaderPermit::try_acquire().expect("permit within limit"));
        }
        assert!(MediaHttpReaderPermit::try_acquire().is_none());
        permits.pop();
        assert!(MediaHttpReaderPermit::try_acquire().is_some());
        drop(permits);
    }

    #[test]
    fn video_http_body_chunks_use_active_range_cap() {
        assert_eq!(
            media_http_body_chunk_bytes(LocalMediaKind::Video, 256 * 1024),
            256 * 1024
        );
        assert_eq!(
            media_http_body_chunk_bytes(LocalMediaKind::Video, 2 * 1024 * 1024),
            2 * 1024 * 1024
        );
    }

    #[test]
    fn video_http_body_backpressure_bounds_outstanding_bytes() {
        assert_eq!(
            media_http_body_frame_capacity(LocalMediaKind::Video),
            MEDIA_HTTP_BODY_FRAME_CAPACITY
        );
        assert_eq!(
            media_http_max_outstanding_body_bytes(LocalMediaKind::Video, 256 * 1024),
            4 * 256 * 1024
        );
    }

    #[test]
    fn audio_http_body_chunks_stay_bounded() {
        assert_eq!(
            media_http_body_chunk_bytes(LocalMediaKind::Audio, 256 * 1024),
            MEDIA_HTTP_CHUNK_BYTES
        );
    }

    #[test]
    fn response_builder_does_not_add_wildcard_cors() {
        let response = empty_response(StatusCode::OK);

        assert!(response
            .headers()
            .get(hyper::header::ACCESS_CONTROL_ALLOW_ORIGIN)
            .is_none());
    }

    #[test]
    fn loopback_http_uses_shared_media_stream_error_mapping() {
        let (code, status) = map_local_media_range_error(LocalMediaRangeError::StreamStale);
        assert_eq!(code, "ERR_MEDIA_STREAM_STALE");
        assert_eq!(status, StatusCode::CONFLICT);

        let (code, status) = map_local_media_range_error(LocalMediaRangeError::SourceStarved);
        assert_eq!(code, "ERR_MEDIA_RANGE_READ_FAILED");
        assert_eq!(status, StatusCode::INTERNAL_SERVER_ERROR);
    }

    #[test]
    fn video_http_path_does_not_use_session_read_lock() {
        assert!(!uses_session_read_lock_for_http(LocalMediaKind::Video));
        assert!(uses_session_read_lock_for_http(LocalMediaKind::Audio));
    }
}
