use std::sync::{Arc, Mutex};
use std::time::Instant;

use serde::Serialize;
use tauri::http::header::{
    ACCEPT_RANGES, CACHE_CONTROL, CONTENT_LENGTH, CONTENT_RANGE, CONTENT_TYPE,
};
use tauri::http::{HeaderValue, Method, Request, Response, StatusCode};
use tauri::{Emitter, Manager, UriSchemeResponder};

use super::protocol_runtime::MediaProtocolRuntimeError;
use crate::app_state::AppState;
use crate::core_adapter::CoreAdapter;
use crate::media_source::{
    media_range_cap_bytes, read_local_media_range, LocalMediaRangeError, LocalMediaSourceManager,
    LocalMediaSourceSession, MAX_MEDIA_RANGE_BYTES,
};

const ERR_MEDIA_STREAM_NOT_FOUND: &str = "ERR_MEDIA_STREAM_NOT_FOUND";
const ERR_MEDIA_STREAM_LOCKED: &str = "ERR_MEDIA_STREAM_LOCKED";
const ERR_MEDIA_STREAM_STALE: &str = "ERR_MEDIA_STREAM_STALE";
const ERR_MEDIA_RANGE_INVALID: &str = "ERR_MEDIA_RANGE_INVALID";
const ERR_MEDIA_RANGE_REQUIRED: &str = "ERR_MEDIA_RANGE_REQUIRED";
const ERR_MEDIA_RANGE_READ_FAILED: &str = "ERR_MEDIA_RANGE_READ_FAILED";
const ERR_MEDIA_SOURCE_LOAD_FAILED: &str = "ERR_MEDIA_SOURCE_LOAD_FAILED";
const ERR_MEDIA_STREAM_BUSY: &str = "ERR_MEDIA_STREAM_BUSY";

#[derive(Debug, Clone, Serialize)]
#[serde(rename_all = "camelCase")]
pub(crate) struct MediaStreamErrorEvent {
    pub(crate) stream_id: String,
    pub(crate) code: String,
    pub(crate) http_status: Option<u16>,
    pub(crate) node_id: Option<u64>,
    pub(crate) source_revision: Option<u64>,
}

#[derive(Debug, Clone, Copy, PartialEq, Eq)]
struct NormalizedRange {
    pub(crate) start: u64,
    pub(crate) end: u64,
}

impl NormalizedRange {
    fn len(self) -> u64 {
        self.end.saturating_sub(self.start).saturating_add(1)
    }
}

#[derive(Debug, Clone, Copy, PartialEq, Eq)]
enum RangeError {
    Invalid,
    Unsatisfiable,
    Required,
}

pub fn handle_protocol_request(
    app: tauri::AppHandle,
    request: Request<Vec<u8>>,
    responder: UriSchemeResponder,
) {
    let Some((manager, adapter, protocol_runtime)) = app.try_state::<AppState>().map(|state| {
        (
            state.media_streams.clone(),
            state.adapter.clone(),
            state.media_protocol_runtime.clone(),
        )
    }) else {
        responder.respond(service_unavailable_response());
        return;
    };

    let request_permit = match protocol_runtime.try_begin_request() {
        Ok(permit) => permit,
        Err(MediaProtocolRuntimeError::Busy) => {
            emit_busy_error_if_stream(&app, &request);
            responder.respond(service_unavailable_response());
            return;
        }
        Err(MediaProtocolRuntimeError::ShuttingDown) => {
            responder.respond(service_unavailable_response());
            return;
        }
    };

    protocol_runtime.spawn_blocking_request(request_permit, move || {
        let response = handle_request_with_parts(&app, &manager, &adapter, request);
        responder.respond(response);
    });
}

fn handle_request_with_parts<R: tauri::Runtime>(
    app: &tauri::AppHandle<R>,
    manager: &LocalMediaSourceManager,
    adapter: &Arc<Mutex<Box<dyn CoreAdapter>>>,
    request: Request<Vec<u8>>,
) -> Response<Vec<u8>> {
    let stream_id = stream_id_from_request(&request);
    let Some(stream_id) = stream_id else {
        return response(StatusCode::NOT_FOUND, Vec::new());
    };

    let Some(session) = manager.get(&stream_id) else {
        emit_media_stream_error(
            app,
            MediaStreamErrorEvent {
                stream_id,
                code: ERR_MEDIA_STREAM_NOT_FOUND.to_string(),
                http_status: Some(StatusCode::NOT_FOUND.as_u16()),
                node_id: None,
                source_revision: None,
            },
        );
        return response(StatusCode::NOT_FOUND, Vec::new());
    };

    match *request.method() {
        Method::HEAD => {
            manager.refresh(&session.token, session.generation);
            metadata_response(&session)
        }
        Method::GET => serve_range_request(app, manager, adapter, &session, &request),
        _ => response(StatusCode::METHOD_NOT_ALLOWED, Vec::new()),
    }
}

fn serve_range_request<R: tauri::Runtime>(
    app: &tauri::AppHandle<R>,
    manager: &LocalMediaSourceManager,
    adapter: &Arc<Mutex<Box<dyn CoreAdapter>>>,
    session: &LocalMediaSourceSession,
    request: &Request<Vec<u8>>,
) -> Response<Vec<u8>> {
    let range_header = request
        .headers()
        .get(tauri::http::header::RANGE)
        .and_then(|value| value.to_str().ok());

    let range_cap = media_range_cap_bytes(adapter);
    let normalized = match normalize_range(range_header, session.size, range_cap) {
        Ok(range) => range,
        Err(error) => {
            let (code, status) = match error {
                // A Range-less GET is a client contract violation, but it must
                // not destroy the session: keep returning the range-required
                // error so subsequent ranged requests still work.
                RangeError::Required => {
                    (ERR_MEDIA_RANGE_REQUIRED, StatusCode::RANGE_NOT_SATISFIABLE)
                }
                RangeError::Invalid | RangeError::Unsatisfiable => {
                    (ERR_MEDIA_RANGE_INVALID, StatusCode::RANGE_NOT_SATISFIABLE)
                }
            };
            emit_media_stream_error(app, error_event(session, code, status));
            return range_error_response(status, session.size);
        }
    };

    let Some(_lease) = manager.begin_request(&session.token, session.generation) else {
        emit_media_stream_error(
            app,
            error_event(session, ERR_MEDIA_STREAM_NOT_FOUND, StatusCode::NOT_FOUND),
        );
        return response(StatusCode::NOT_FOUND, Vec::new());
    };

    let read_lock = session.read_lock.lock();
    let Ok(_read_lock) = read_lock else {
        emit_media_stream_error(
            app,
            error_event(
                session,
                ERR_MEDIA_SOURCE_LOAD_FAILED,
                StatusCode::INTERNAL_SERVER_ERROR,
            ),
        );
        return response(StatusCode::INTERNAL_SERVER_ERROR, Vec::new());
    };

    if !manager.is_current(&session.token, session.generation) {
        emit_media_stream_error(
            app,
            error_event(session, ERR_MEDIA_STREAM_NOT_FOUND, StatusCode::NOT_FOUND),
        );
        return response(StatusCode::NOT_FOUND, Vec::new());
    }

    let read_started_at = Instant::now();
    let mut bytes = match read_local_media_range(
        adapter,
        session,
        normalized.start,
        normalized.len(),
    ) {
        Ok(bytes) => bytes,
        Err(error) => {
            let read_ms = read_started_at.elapsed().as_millis();
            let (code, status) = map_local_media_range_error(error);
            tracing::warn!(
                "media_stream: range delivery=custom-scheme stream_id={} node_id={} source_revision={} range_start={} range_len={} cache_hit=false prefetch_hit=false read_ms={} response_ms={} status={} reason=read_failed code={}",
                redacted_media_token(&session.token),
                redacted_node_id(session.node_id),
                session.source_revision,
                normalized.start,
                normalized.len(),
                read_ms,
                read_ms,
                status.as_u16(),
                code,
            );
            emit_media_stream_error(app, error_event(session, &code, status));
            return if status == StatusCode::RANGE_NOT_SATISFIABLE {
                range_error_response(status, session.size)
            } else {
                response(status, Vec::new())
            };
        }
    };

    if !manager.is_current(&session.token, session.generation) {
        emit_media_stream_error(
            app,
            error_event(session, ERR_MEDIA_STREAM_NOT_FOUND, StatusCode::NOT_FOUND),
        );
        return response(StatusCode::NOT_FOUND, Vec::new());
    }

    // Keep the 206 headers consistent with the body actually returned: on a
    // short read, recompute the Content-Range end from the served bytes.
    if let Ok(requested_len) = usize::try_from(normalized.len()) {
        if bytes.len() > requested_len {
            bytes.truncate(requested_len);
        }
    }
    if bytes.is_empty() {
        emit_media_stream_error(
            app,
            error_event(
                session,
                ERR_MEDIA_RANGE_READ_FAILED,
                StatusCode::INTERNAL_SERVER_ERROR,
            ),
        );
        return response(StatusCode::INTERNAL_SERVER_ERROR, Vec::new());
    }
    let served_range = NormalizedRange {
        start: normalized.start,
        end: normalized
            .end
            .min(normalized.start.saturating_add(bytes.len() as u64 - 1)),
    };

    manager.refresh(&session.token, session.generation);
    tracing::info!(
        "media_stream: range delivery=custom-scheme stream_id={} node_id={} source_revision={} range_start={} range_len={} response_bytes={} cache_hit=false prefetch_hit=false read_ms={} response_ms={} status={} reason=completed",
        redacted_media_token(&session.token),
        redacted_node_id(session.node_id),
        session.source_revision,
        served_range.start,
        served_range.len(),
        bytes.len(),
        read_started_at.elapsed().as_millis(),
        read_started_at.elapsed().as_millis(),
        StatusCode::PARTIAL_CONTENT.as_u16(),
    );
    partial_content_response(session, served_range, bytes)
}

pub(crate) fn map_local_media_range_error(error: LocalMediaRangeError) -> (String, StatusCode) {
    match error {
        LocalMediaRangeError::StreamStale => {
            (ERR_MEDIA_STREAM_STALE.to_string(), StatusCode::CONFLICT)
        }
        LocalMediaRangeError::RangeInvalid => (
            ERR_MEDIA_RANGE_INVALID.to_string(),
            StatusCode::RANGE_NOT_SATISFIABLE,
        ),
        LocalMediaRangeError::StreamLocked => {
            (ERR_MEDIA_STREAM_LOCKED.to_string(), StatusCode::FORBIDDEN)
        }
        LocalMediaRangeError::StreamNotFound => (
            ERR_MEDIA_STREAM_NOT_FOUND.to_string(),
            StatusCode::NOT_FOUND,
        ),
        LocalMediaRangeError::SourceLoadFailed => (
            ERR_MEDIA_SOURCE_LOAD_FAILED.to_string(),
            StatusCode::INTERNAL_SERVER_ERROR,
        ),
        LocalMediaRangeError::RangeReadFailed
        | LocalMediaRangeError::ProviderUnavailable
        | LocalMediaRangeError::Timeout
        | LocalMediaRangeError::Aborted
        | LocalMediaRangeError::SourceStarved => (
            ERR_MEDIA_RANGE_READ_FAILED.to_string(),
            StatusCode::INTERNAL_SERVER_ERROR,
        ),
    }
}

fn stream_id_from_request(request: &Request<Vec<u8>>) -> Option<String> {
    let id = request.uri().path().trim_start_matches('/').trim();
    if id.is_empty() || id.contains('/') {
        return None;
    }
    Some(id.to_string())
}

fn normalize_range(
    header: Option<&str>,
    file_size: u64,
    range_cap: u64,
) -> Result<NormalizedRange, RangeError> {
    let Some(header) = header else {
        return Err(RangeError::Required);
    };
    if file_size == 0 {
        return Err(RangeError::Unsatisfiable);
    }

    let range_cap = range_cap.max(1).min(MAX_MEDIA_RANGE_BYTES);
    let spec = header
        .trim()
        .strip_prefix("bytes=")
        .ok_or(RangeError::Invalid)?;
    if spec.contains(',') {
        return Err(RangeError::Invalid);
    }

    let (start_raw, end_raw) = spec.split_once('-').ok_or(RangeError::Invalid)?;
    if start_raw.is_empty() {
        let suffix = end_raw.parse::<u64>().map_err(|_| RangeError::Invalid)?;
        if suffix == 0 {
            return Err(RangeError::Unsatisfiable);
        }
        let response_len = suffix.min(file_size).min(range_cap);
        let start = file_size.saturating_sub(response_len);
        return Ok(NormalizedRange {
            start,
            end: file_size - 1,
        });
    }

    let start = start_raw.parse::<u64>().map_err(|_| RangeError::Invalid)?;
    if start >= file_size {
        return Err(RangeError::Unsatisfiable);
    }
    let requested_end = if end_raw.is_empty() {
        file_size - 1
    } else {
        let end = end_raw.parse::<u64>().map_err(|_| RangeError::Invalid)?;
        if end < start {
            return Err(RangeError::Invalid);
        }
        end.min(file_size - 1)
    };
    let end = requested_end.min(start.saturating_add(range_cap - 1));
    Ok(NormalizedRange { start, end })
}

fn metadata_response(session: &LocalMediaSourceSession) -> Response<Vec<u8>> {
    response_builder(StatusCode::OK)
        .header(CONTENT_TYPE, session.mime_type.as_str())
        .header(ACCEPT_RANGES, "bytes")
        .header(CONTENT_LENGTH, session.size.to_string())
        .body(Vec::new())
        .unwrap_or_else(|_| response(StatusCode::INTERNAL_SERVER_ERROR, Vec::new()))
}

fn partial_content_response(
    session: &LocalMediaSourceSession,
    range: NormalizedRange,
    bytes: Vec<u8>,
) -> Response<Vec<u8>> {
    response_builder(StatusCode::PARTIAL_CONTENT)
        .header(CONTENT_TYPE, session.mime_type.as_str())
        .header(ACCEPT_RANGES, "bytes")
        .header(
            CONTENT_RANGE,
            format!("bytes {}-{}/{}", range.start, range.end, session.size),
        )
        .header(CONTENT_LENGTH, bytes.len().to_string())
        .body(bytes)
        .unwrap_or_else(|_| response(StatusCode::INTERNAL_SERVER_ERROR, Vec::new()))
}

fn range_error_response(status: StatusCode, file_size: u64) -> Response<Vec<u8>> {
    response_builder(status)
        .header(CONTENT_RANGE, format!("bytes */{file_size}"))
        .body(Vec::new())
        .unwrap_or_else(|_| response(StatusCode::INTERNAL_SERVER_ERROR, Vec::new()))
}

fn response(status: StatusCode, body: Vec<u8>) -> Response<Vec<u8>> {
    response_builder(status)
        .header(CONTENT_LENGTH, body.len().to_string())
        .body(body)
        .unwrap_or_else(|_| Response::new(Vec::new()))
}

fn response_builder(status: StatusCode) -> tauri::http::response::Builder {
    let mut builder = Response::builder().status(status);
    if let Some(headers) = builder.headers_mut() {
        headers.insert(CACHE_CONTROL, HeaderValue::from_static("no-store"));
        headers.insert(
            tauri::http::header::HeaderName::from_static("x-content-type-options"),
            HeaderValue::from_static("nosniff"),
        );
    } else {
        tracing::warn!("media_stream: response builder headers unavailable");
    }
    builder
}

pub(crate) fn error_event(
    session: &LocalMediaSourceSession,
    code: &str,
    status: StatusCode,
) -> MediaStreamErrorEvent {
    MediaStreamErrorEvent {
        stream_id: session.token.clone(),
        code: code.to_string(),
        http_status: Some(status.as_u16()),
        node_id: Some(session.node_id),
        source_revision: Some(session.source_revision),
    }
}

pub(crate) fn emit_media_stream_error<R: tauri::Runtime>(
    app: &tauri::AppHandle<R>,
    event: MediaStreamErrorEvent,
) {
    let _ = app.emit("media-stream:error", event);
}

fn emit_busy_error_if_stream<R: tauri::Runtime>(
    app: &tauri::AppHandle<R>,
    request: &Request<Vec<u8>>,
) {
    let Some(stream_id) = stream_id_from_request(request) else {
        return;
    };
    emit_media_stream_error(app, busy_error_event(stream_id));
}

fn busy_error_event(stream_id: String) -> MediaStreamErrorEvent {
    MediaStreamErrorEvent {
        stream_id,
        code: ERR_MEDIA_STREAM_BUSY.to_string(),
        http_status: Some(StatusCode::SERVICE_UNAVAILABLE.as_u16()),
        node_id: None,
        source_revision: None,
    }
}

fn service_unavailable_response() -> Response<Vec<u8>> {
    response(StatusCode::SERVICE_UNAVAILABLE, Vec::new())
}

fn redacted_media_token(token: &str) -> String {
    let prefix = token.chars().take(8).collect::<String>();
    format!("redacted:{prefix}")
}

fn redacted_node_id(node_id: u64) -> String {
    format!("node:{}", node_id % 10_000)
}

#[cfg(test)]
mod tests {
    use super::*;
    use chromvoid_core::rpc::types::{RpcRequest, RpcResponse};
    use chromvoid_core::rpc::{RpcInputStream, RpcRangeOutputStream, RpcRangeStreamMeta, RpcReply};
    use serde_json::{json, Value};
    use std::io::Cursor;
    use std::sync::{mpsc as std_mpsc, Arc, Mutex};
    use std::time::Duration;

    use crate::core_adapter::{CoreAdapter, CoreMode, RemoteHost};
    use crate::media_source::LocalMediaKind;
    use crate::media_stream::commands::{prepare_media_stream_source, PrepareMediaStreamArgs};

    enum ProtocolReply {
        Range(Vec<u8>),
        Error(&'static str),
    }

    struct ProtocolTestAdapter {
        reply: ProtocolReply,
    }

    struct PreparedRemoteProtocolAdapter {
        source: Vec<u8>,
        name: String,
        mime_type: String,
        source_revision: u64,
        node_id: u64,
    }

    struct BlockingRangeAdapter {
        source: Vec<u8>,
        started_tx: Option<std_mpsc::Sender<()>>,
        unblock_rx: Mutex<std_mpsc::Receiver<()>>,
    }

    impl CoreAdapter for ProtocolTestAdapter {
        fn mode(&self) -> CoreMode {
            CoreMode::Local
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
            match &self.reply {
                ProtocolReply::Range(source) => {
                    let offset = req.data["offset"].as_u64().expect("offset") as usize;
                    let length = req.data["length"].as_u64().expect("length") as usize;
                    let end = offset.saturating_add(length).min(source.len());
                    let bytes = source[offset..end].to_vec();
                    RpcReply::RangeStream(RpcRangeOutputStream {
                        meta: RpcRangeStreamMeta {
                            name: "media.bin".to_string(),
                            mime_type: "application/octet-stream".to_string(),
                            file_size: source.len() as u64,
                            chunk_size: bytes.len() as u32,
                            range_offset: offset as u64,
                            range_length: bytes.len() as u64,
                            source_revision: 7,
                        },
                        reader: Box::new(Cursor::new(bytes)),
                    })
                }
                ProtocolReply::Error(code) => {
                    RpcReply::Json(RpcResponse::error("range failed", Some(*code)))
                }
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

    impl CoreAdapter for PreparedRemoteProtocolAdapter {
        fn mode(&self) -> CoreMode {
            CoreMode::Remote {
                host: RemoteHost::MobileUsb {
                    host_id: "scripted-android".to_string(),
                    label: Some("Scripted Android".to_string()),
                    platform: "android".to_string(),
                },
            }
        }

        fn is_unlocked(&self) -> bool {
            true
        }

        fn handle(&mut self, req: &RpcRequest) -> RpcResponse {
            match req.command.as_str() {
                "catalog:source:metadata" => RpcResponse::success(json!({
                    "node_id": self.node_id,
                    "node_type": 1,
                    "name": self.name.clone(),
                    "mime_type": self.mime_type.clone(),
                    "size": self.source.len() as u64,
                    "source_revision": self.source_revision,
                })),
                command => {
                    RpcResponse::error(format!("unexpected json command: {command}"), Some("TEST"))
                }
            }
        }

        fn handle_with_stream(
            &mut self,
            req: &RpcRequest,
            _stream: Option<RpcInputStream>,
        ) -> RpcReply {
            if req.command != "catalog:downloadRange" {
                return RpcReply::Json(RpcResponse::error(
                    format!("unexpected stream command: {}", req.command),
                    Some("TEST"),
                ));
            }

            assert_eq!(req.data["node_id"].as_u64(), Some(self.node_id));
            assert_eq!(
                req.data["expected_source_revision"].as_u64(),
                Some(self.source_revision)
            );
            let offset = req.data["offset"].as_u64().expect("offset") as usize;
            let length = req.data["length"].as_u64().expect("length") as usize;
            let end = offset.saturating_add(length).min(self.source.len());
            let bytes = self.source[offset..end].to_vec();

            RpcReply::RangeStream(RpcRangeOutputStream {
                meta: RpcRangeStreamMeta {
                    name: self.name.clone(),
                    mime_type: self.mime_type.clone(),
                    file_size: self.source.len() as u64,
                    chunk_size: bytes.len() as u32,
                    range_offset: offset as u64,
                    range_length: bytes.len() as u64,
                    source_revision: self.source_revision,
                },
                reader: Box::new(Cursor::new(bytes)),
            })
        }

        fn save(&mut self) -> Result<(), String> {
            Ok(())
        }

        fn take_events(&mut self) -> Vec<Value> {
            Vec::new()
        }

        fn set_master_key(&mut self, _key: Option<String>) {}
    }

    impl CoreAdapter for BlockingRangeAdapter {
        fn mode(&self) -> CoreMode {
            CoreMode::Local
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
            assert_eq!(req.command, "catalog:downloadRange");
            if let Some(started_tx) = self.started_tx.take() {
                let _ = started_tx.send(());
            }
            self.unblock_rx
                .lock()
                .expect("unblock receiver lock")
                .recv_timeout(Duration::from_secs(1))
                .expect("range read unblock");

            let offset = req.data["offset"].as_u64().expect("offset") as usize;
            let length = req.data["length"].as_u64().expect("length") as usize;
            let end = offset.saturating_add(length).min(self.source.len());
            let bytes = self.source[offset..end].to_vec();
            RpcReply::RangeStream(RpcRangeOutputStream {
                meta: RpcRangeStreamMeta {
                    name: "blocked.mp3".to_string(),
                    mime_type: "audio/mpeg".to_string(),
                    file_size: self.source.len() as u64,
                    chunk_size: bytes.len() as u32,
                    range_offset: offset as u64,
                    range_length: bytes.len() as u64,
                    source_revision: 7,
                },
                reader: Box::new(Cursor::new(bytes)),
            })
        }

        fn save(&mut self) -> Result<(), String> {
            Ok(())
        }

        fn take_events(&mut self) -> Vec<Value> {
            Vec::new()
        }

        fn set_master_key(&mut self, _key: Option<String>) {}
    }

    fn protocol_adapter(reply: ProtocolReply) -> Arc<Mutex<Box<dyn CoreAdapter>>> {
        Arc::new(Mutex::new(
            Box::new(ProtocolTestAdapter { reply }) as Box<dyn CoreAdapter>
        ))
    }

    fn protocol_request(method: Method, stream_id: &str, range: Option<&str>) -> Request<Vec<u8>> {
        let mut builder = Request::builder()
            .method(method)
            .uri(format!("http://media/{stream_id}"));
        if let Some(range) = range {
            builder = builder.header(tauri::http::header::RANGE, range);
        }
        builder.body(Vec::new()).expect("protocol request")
    }

    #[test]
    fn normalizes_start_end_ranges_with_cap() {
        assert_eq!(
            normalize_range(Some("bytes=1-3"), 10, MAX_MEDIA_RANGE_BYTES),
            Ok(NormalizedRange { start: 1, end: 3 })
        );
        assert_eq!(
            normalize_range(
                Some("bytes=0-9999999"),
                10 * 1024 * 1024,
                MAX_MEDIA_RANGE_BYTES,
            ),
            Ok(NormalizedRange {
                start: 0,
                end: MAX_MEDIA_RANGE_BYTES - 1,
            })
        );
    }

    #[test]
    fn normalizes_open_ended_and_suffix_ranges_with_cap() {
        assert_eq!(
            normalize_range(Some("bytes=5-"), 10, MAX_MEDIA_RANGE_BYTES),
            Ok(NormalizedRange { start: 5, end: 9 })
        );
        assert_eq!(
            normalize_range(
                Some("bytes=-9999999"),
                10 * 1024 * 1024,
                MAX_MEDIA_RANGE_BYTES,
            ),
            Ok(NormalizedRange {
                start: 10 * 1024 * 1024 - MAX_MEDIA_RANGE_BYTES,
                end: 10 * 1024 * 1024 - 1,
            })
        );
    }

    #[test]
    fn rejects_missing_invalid_multi_and_unsatisfiable_ranges() {
        assert_eq!(
            normalize_range(None, 10, MAX_MEDIA_RANGE_BYTES),
            Err(RangeError::Required)
        );
        assert_eq!(
            normalize_range(Some("bytes=5-4"), 10, MAX_MEDIA_RANGE_BYTES),
            Err(RangeError::Invalid)
        );
        assert_eq!(
            normalize_range(Some("bytes=1-2,3-4"), 10, MAX_MEDIA_RANGE_BYTES),
            Err(RangeError::Invalid)
        );
        assert_eq!(
            normalize_range(Some("bytes=10-"), 10, MAX_MEDIA_RANGE_BYTES),
            Err(RangeError::Unsatisfiable)
        );
        assert_eq!(
            normalize_range(Some("bytes=-0"), 10, MAX_MEDIA_RANGE_BYTES),
            Err(RangeError::Unsatisfiable)
        );
    }

    #[test]
    fn normalizes_ranges_with_transport_cap() {
        assert_eq!(
            normalize_range(
                Some("bytes=0-9999999"),
                10 * 1024 * 1024,
                crate::media_source::USB_MOBILE_MEDIA_RANGE_BYTES,
            ),
            Ok(NormalizedRange {
                start: 0,
                end: crate::media_source::USB_MOBILE_MEDIA_RANGE_BYTES - 1,
            })
        );
        assert_eq!(
            normalize_range(
                Some("bytes=-9999999"),
                10 * 1024 * 1024,
                crate::media_source::USB_MOBILE_MEDIA_RANGE_BYTES,
            ),
            Ok(NormalizedRange {
                start: 10 * 1024 * 1024 - crate::media_source::USB_MOBILE_MEDIA_RANGE_BYTES,
                end: 10 * 1024 * 1024 - 1,
            })
        );
    }

    #[test]
    fn builds_busy_event_without_source_metadata() {
        let event = busy_error_event("stream-1".to_string());

        assert_eq!(event.stream_id, "stream-1");
        assert_eq!(event.code, ERR_MEDIA_STREAM_BUSY);
        assert_eq!(
            event.http_status,
            Some(StatusCode::SERVICE_UNAVAILABLE.as_u16())
        );
        assert_eq!(event.node_id, None);
        assert_eq!(event.source_revision, None);
    }

    #[test]
    fn service_unavailable_response_is_503() {
        let response = service_unavailable_response();

        assert_eq!(response.status(), StatusCode::SERVICE_UNAVAILABLE);
        assert!(response.body().is_empty());
    }

    #[test]
    fn metadata_response_sets_audio_and_video_playback_headers() {
        let manager = LocalMediaSourceManager::new();
        let audio = manager
            .register(
                1,
                LocalMediaKind::Audio,
                "audio/mpeg".to_string(),
                12_345,
                7,
            )
            .expect("audio session");
        let video = manager
            .register(2, LocalMediaKind::Video, "video/mp4".to_string(), 67_890, 8)
            .expect("video session");

        let audio_response = metadata_response(&audio);
        assert_eq!(audio_response.status(), StatusCode::OK);
        assert_eq!(audio_response.headers()[CONTENT_TYPE], "audio/mpeg");
        assert_eq!(audio_response.headers()[ACCEPT_RANGES], "bytes");
        assert_eq!(audio_response.headers()[CONTENT_LENGTH], "12345");
        assert!(audio_response.body().is_empty());

        let video_response = metadata_response(&video);
        assert_eq!(video_response.status(), StatusCode::OK);
        assert_eq!(video_response.headers()[CONTENT_TYPE], "video/mp4");
        assert_eq!(video_response.headers()[ACCEPT_RANGES], "bytes");
        assert_eq!(video_response.headers()[CONTENT_LENGTH], "67890");
        assert!(video_response.body().is_empty());
    }

    #[test]
    fn partial_content_response_sets_range_headers_and_body() {
        let manager = LocalMediaSourceManager::new();
        let session = manager
            .register(3, LocalMediaKind::Video, "video/mp4".to_string(), 10_000, 9)
            .expect("video session");

        let response = partial_content_response(
            &session,
            NormalizedRange {
                start: 100,
                end: 109,
            },
            vec![1, 2, 3, 4, 5, 6, 7, 8, 9, 10],
        );

        assert_eq!(response.status(), StatusCode::PARTIAL_CONTENT);
        assert_eq!(response.headers()[CONTENT_TYPE], "video/mp4");
        assert_eq!(response.headers()[ACCEPT_RANGES], "bytes");
        assert_eq!(response.headers()[CONTENT_RANGE], "bytes 100-109/10000");
        assert_eq!(response.headers()[CONTENT_LENGTH], "10");
        assert_eq!(response.body(), &[1, 2, 3, 4, 5, 6, 7, 8, 9, 10]);
    }

    #[test]
    fn protocol_get_range_matrix_matches_browser_range_contract() {
        let app = tauri::test::mock_app();
        let app_handle = app.handle().clone();
        let manager = LocalMediaSourceManager::new();
        let source = (0..10_000)
            .map(|value| (value % 251) as u8)
            .collect::<Vec<_>>();
        let adapter = protocol_adapter(ProtocolReply::Range(source.clone()));
        let session = manager
            .register(
                4,
                LocalMediaKind::Video,
                "video/mp4".to_string(),
                source.len() as u64,
                9,
            )
            .expect("video session");

        for (range, expected_range, expected_body) in [
            ("bytes=0-99", "bytes 0-99/10000", source[0..100].to_vec()),
            (
                "bytes=100-",
                "bytes 100-9999/10000",
                source[100..10_000].to_vec(),
            ),
            (
                "bytes=-256",
                "bytes 9744-9999/10000",
                source[9744..10_000].to_vec(),
            ),
        ] {
            let response = handle_request_with_parts(
                &app_handle,
                &manager,
                &adapter,
                protocol_request(Method::GET, &session.token, Some(range)),
            );
            assert_eq!(response.status(), StatusCode::PARTIAL_CONTENT);
            assert_eq!(response.headers()[CONTENT_RANGE], expected_range);
            assert_eq!(
                response.headers()[CONTENT_LENGTH],
                expected_body.len().to_string()
            );
            assert_eq!(response.body(), &expected_body);
        }

        for range in ["bytes=200-100", "bytes=1-2,3-4", "bytes=10000-"] {
            let response = handle_request_with_parts(
                &app_handle,
                &manager,
                &adapter,
                protocol_request(Method::GET, &session.token, Some(range)),
            );
            assert_eq!(response.status(), StatusCode::RANGE_NOT_SATISFIABLE);
            assert_eq!(response.headers()[CONTENT_RANGE], "bytes */10000");
            assert!(response.body().is_empty());
        }
    }

    #[test]
    fn protocol_head_get_release_lifecycle() {
        let app = tauri::test::mock_app();
        let app_handle = app.handle().clone();
        let manager = LocalMediaSourceManager::new();
        let source = (0..4096)
            .map(|value| (value % 251) as u8)
            .collect::<Vec<_>>();
        let adapter = protocol_adapter(ProtocolReply::Range(source.clone()));
        let session = manager
            .register(
                10,
                LocalMediaKind::Audio,
                "audio/mpeg".to_string(),
                source.len() as u64,
                7,
            )
            .expect("media session");

        let head = handle_request_with_parts(
            &app_handle,
            &manager,
            &adapter,
            protocol_request(Method::HEAD, &session.token, None),
        );
        assert_eq!(head.status(), StatusCode::OK);
        assert_eq!(head.headers()[CONTENT_TYPE], "audio/mpeg");
        assert_eq!(head.headers()[ACCEPT_RANGES], "bytes");
        assert_eq!(head.headers()[CONTENT_LENGTH], source.len().to_string());

        let get = handle_request_with_parts(
            &app_handle,
            &manager,
            &adapter,
            protocol_request(Method::GET, &session.token, Some("bytes=100-355")),
        );
        assert_eq!(get.status(), StatusCode::PARTIAL_CONTENT);
        assert_eq!(
            get.headers()[CONTENT_RANGE],
            format!("bytes 100-355/{}", source.len())
        );
        assert_eq!(get.headers()[CONTENT_LENGTH], "256");
        assert_eq!(get.body(), &source[100..356]);

        manager.release(&session.token);
        let after_release = handle_request_with_parts(
            &app_handle,
            &manager,
            &adapter,
            protocol_request(Method::GET, &session.token, Some("bytes=0-15")),
        );
        assert_eq!(after_release.status(), StatusCode::NOT_FOUND);
        assert!(after_release.body().is_empty());
    }

    #[test]
    fn prepared_remote_media_stream_url_serves_head_and_range() {
        let app = tauri::test::mock_app();
        let app_handle = app.handle().clone();
        let manager = LocalMediaSourceManager::new();
        let source = (0..8192)
            .map(|value| ((value * 17 + 3) % 251) as u8)
            .collect::<Vec<_>>();
        let adapter = Arc::new(Mutex::new(Box::new(PreparedRemoteProtocolAdapter {
            source: source.clone(),
            name: "private-track.mp3".to_string(),
            mime_type: "audio/mpeg".to_string(),
            source_revision: 42,
            node_id: 77,
        }) as Box<dyn CoreAdapter>));

        let prepared = match prepare_media_stream_source(
            &adapter,
            &manager,
            PrepareMediaStreamArgs {
                node_id: 77,
                file_name: "ignored-user-file-name.mp3".to_string(),
                mime_type: None,
                last_modified: None,
            },
            None,
        ) {
            crate::types::RpcResult::Success { result, .. } => result,
            crate::types::RpcResult::Error { error, .. } => {
                panic!("unexpected prepare error: {error}")
            }
        };

        assert_eq!(prepared.kind, "media-stream");
        assert_eq!(prepared.name, "private-track.mp3");
        assert_eq!(prepared.mime_type, "audio/mpeg");
        assert_eq!(prepared.size, source.len() as u64);
        assert_eq!(prepared.source_revision, 42);
        assert_eq!(
            prepared.url,
            format!("chromvoid-media://localhost/{}", prepared.stream_id)
        );
        assert!(!prepared.url.contains("private-track"));
        assert!(!prepared.url.contains("ignored-user-file-name"));

        let head = handle_request_with_parts(
            &app_handle,
            &manager,
            &adapter,
            protocol_request(Method::HEAD, &prepared.stream_id, None),
        );
        assert_eq!(head.status(), StatusCode::OK);
        assert_eq!(head.headers()[CONTENT_TYPE], "audio/mpeg");
        assert_eq!(head.headers()[ACCEPT_RANGES], "bytes");
        assert_eq!(head.headers()[CONTENT_LENGTH], source.len().to_string());
        assert!(head.body().is_empty());

        let get = handle_request_with_parts(
            &app_handle,
            &manager,
            &adapter,
            protocol_request(Method::GET, &prepared.stream_id, Some("bytes=256-767")),
        );
        assert_eq!(get.status(), StatusCode::PARTIAL_CONTENT);
        assert_eq!(
            get.headers()[CONTENT_RANGE],
            format!("bytes 256-767/{}", source.len())
        );
        assert_eq!(get.headers()[CONTENT_LENGTH], "512");
        assert_eq!(get.body(), &source[256..768]);
    }

    #[test]
    fn release_during_active_range_returns_not_found_without_serving_stale_bytes() {
        let app = tauri::test::mock_app();
        let app_handle = app.handle().clone();
        let manager = Arc::new(LocalMediaSourceManager::new());
        let source = (0..4096)
            .map(|value| (value % 251) as u8)
            .collect::<Vec<_>>();
        let session = manager
            .register(
                12,
                LocalMediaKind::Audio,
                "audio/mpeg".to_string(),
                source.len() as u64,
                7,
            )
            .expect("media session");
        let (started_tx, started_rx) = std_mpsc::channel();
        let (unblock_tx, unblock_rx) = std_mpsc::channel();
        let adapter = Arc::new(Mutex::new(Box::new(BlockingRangeAdapter {
            source,
            started_tx: Some(started_tx),
            unblock_rx: Mutex::new(unblock_rx),
        }) as Box<dyn CoreAdapter>));

        let worker_manager = manager.clone();
        let worker_adapter = adapter.clone();
        let worker_app_handle = app_handle.clone();
        let stream_id = session.token.clone();
        let worker = std::thread::spawn(move || {
            handle_request_with_parts(
                &worker_app_handle,
                &worker_manager,
                &worker_adapter,
                protocol_request(Method::GET, &stream_id, Some("bytes=0-1023")),
            )
        });

        started_rx
            .recv_timeout(Duration::from_secs(1))
            .expect("range read started");
        assert!(manager.release(&session.token));
        unblock_tx.send(()).expect("unblock range read");

        let response = worker.join().expect("range worker");
        assert_eq!(response.status(), StatusCode::NOT_FOUND);
        assert!(response.body().is_empty());
        assert!(manager.get(&session.token).is_none());
    }

    #[test]
    fn range_less_get_keeps_session_alive_for_later_ranged_requests() {
        let app = tauri::test::mock_app();
        let app_handle = app.handle().clone();
        let manager = LocalMediaSourceManager::new();
        let source = (0..4096)
            .map(|value| (value % 251) as u8)
            .collect::<Vec<_>>();
        let adapter = protocol_adapter(ProtocolReply::Range(source.clone()));
        let session = manager
            .register(
                13,
                LocalMediaKind::Audio,
                "audio/mpeg".to_string(),
                source.len() as u64,
                7,
            )
            .expect("media session");

        let no_range = handle_request_with_parts(
            &app_handle,
            &manager,
            &adapter,
            protocol_request(Method::GET, &session.token, None),
        );
        assert_eq!(no_range.status(), StatusCode::RANGE_NOT_SATISFIABLE);
        assert!(
            manager.get(&session.token).is_some(),
            "a Range-less GET must not release the session"
        );

        let ranged = handle_request_with_parts(
            &app_handle,
            &manager,
            &adapter,
            protocol_request(Method::GET, &session.token, Some("bytes=0-15")),
        );
        assert_eq!(ranged.status(), StatusCode::PARTIAL_CONTENT);
        assert_eq!(ranged.body(), &source[0..16]);
    }

    #[test]
    fn short_read_adjusts_content_range_to_served_bytes() {
        let app = tauri::test::mock_app();
        let app_handle = app.handle().clone();
        let manager = LocalMediaSourceManager::new();
        let source = (0..1000)
            .map(|value| (value % 251) as u8)
            .collect::<Vec<_>>();
        let adapter = protocol_adapter(ProtocolReply::Range(source.clone()));
        let session = manager
            .register(14, LocalMediaKind::Video, "video/mp4".to_string(), 4096, 7)
            .expect("media session");

        let response = handle_request_with_parts(
            &app_handle,
            &manager,
            &adapter,
            protocol_request(Method::GET, &session.token, Some("bytes=0-2047")),
        );

        assert_eq!(response.status(), StatusCode::PARTIAL_CONTENT);
        assert_eq!(response.headers()[CONTENT_RANGE], "bytes 0-999/4096");
        assert_eq!(response.headers()[CONTENT_LENGTH], "1000");
        assert_eq!(response.body(), &source);
    }

    #[test]
    fn empty_read_maps_to_internal_error_instead_of_mismatched_206() {
        let app = tauri::test::mock_app();
        let app_handle = app.handle().clone();
        let manager = LocalMediaSourceManager::new();
        let adapter = protocol_adapter(ProtocolReply::Range(Vec::new()));
        let session = manager
            .register(15, LocalMediaKind::Video, "video/mp4".to_string(), 4096, 7)
            .expect("media session");

        let response = handle_request_with_parts(
            &app_handle,
            &manager,
            &adapter,
            protocol_request(Method::GET, &session.token, Some("bytes=0-1023")),
        );

        assert_eq!(response.status(), StatusCode::INTERNAL_SERVER_ERROR);
        assert!(response.body().is_empty());
    }

    #[test]
    fn protocol_stale_source_revision_maps_to_conflict_response() {
        let app = tauri::test::mock_app();
        let app_handle = app.handle().clone();
        let manager = LocalMediaSourceManager::new();
        let adapter = protocol_adapter(ProtocolReply::Error("ERR_MEDIA_STREAM_STALE"));
        let session = manager
            .register(11, LocalMediaKind::Video, "video/mp4".to_string(), 4096, 7)
            .expect("media session");

        let response = handle_request_with_parts(
            &app_handle,
            &manager,
            &adapter,
            protocol_request(Method::GET, &session.token, Some("bytes=0-1023")),
        );

        assert_eq!(response.status(), StatusCode::CONFLICT);
        assert!(response.body().is_empty());
    }
}
