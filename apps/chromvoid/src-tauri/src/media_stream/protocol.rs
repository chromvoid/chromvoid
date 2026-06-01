use std::sync::{Arc, Mutex};

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
    read_local_media_range, LocalMediaRangeError, LocalMediaSourceManager, LocalMediaSourceSession,
    MAX_MEDIA_RANGE_BYTES,
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

fn handle_request_with_parts(
    app: &tauri::AppHandle,
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

fn serve_range_request(
    app: &tauri::AppHandle,
    manager: &LocalMediaSourceManager,
    adapter: &Arc<Mutex<Box<dyn CoreAdapter>>>,
    session: &LocalMediaSourceSession,
    request: &Request<Vec<u8>>,
) -> Response<Vec<u8>> {
    let range_header = request
        .headers()
        .get(tauri::http::header::RANGE)
        .and_then(|value| value.to_str().ok());

    let normalized = match normalize_range(range_header, session.size) {
        Ok(range) => range,
        Err(error) => {
            let (code, status) = match error {
                RangeError::Required => {
                    manager.release(&session.token);
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

    let bytes = match read_local_media_range(adapter, session, normalized.start, normalized.len()) {
        Ok(bytes) => bytes,
        Err(error) => {
            let (code, status) = map_local_media_range_error(error);
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

    manager.refresh(&session.token, session.generation);
    partial_content_response(session, normalized, bytes)
}

fn map_local_media_range_error(error: LocalMediaRangeError) -> (String, StatusCode) {
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
        LocalMediaRangeError::RangeReadFailed => (
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

fn normalize_range(header: Option<&str>, file_size: u64) -> Result<NormalizedRange, RangeError> {
    let Some(header) = header else {
        return Err(RangeError::Required);
    };
    if file_size == 0 {
        return Err(RangeError::Unsatisfiable);
    }

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
        let response_len = suffix.min(file_size).min(MAX_MEDIA_RANGE_BYTES);
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
    let end = requested_end.min(start.saturating_add(MAX_MEDIA_RANGE_BYTES - 1));
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

fn error_event(
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

fn emit_media_stream_error(app: &tauri::AppHandle, event: MediaStreamErrorEvent) {
    let _ = app.emit("media-stream:error", event);
}

fn emit_busy_error_if_stream(app: &tauri::AppHandle, request: &Request<Vec<u8>>) {
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

#[cfg(test)]
mod tests {
    use super::*;

    #[test]
    fn normalizes_start_end_ranges_with_cap() {
        assert_eq!(
            normalize_range(Some("bytes=1-3"), 10),
            Ok(NormalizedRange { start: 1, end: 3 })
        );
        assert_eq!(
            normalize_range(Some("bytes=0-9999999"), 10 * 1024 * 1024),
            Ok(NormalizedRange {
                start: 0,
                end: MAX_MEDIA_RANGE_BYTES - 1,
            })
        );
    }

    #[test]
    fn normalizes_open_ended_and_suffix_ranges_with_cap() {
        assert_eq!(
            normalize_range(Some("bytes=5-"), 10),
            Ok(NormalizedRange { start: 5, end: 9 })
        );
        assert_eq!(
            normalize_range(Some("bytes=-9999999"), 10 * 1024 * 1024),
            Ok(NormalizedRange {
                start: 10 * 1024 * 1024 - MAX_MEDIA_RANGE_BYTES,
                end: 10 * 1024 * 1024 - 1,
            })
        );
    }

    #[test]
    fn rejects_missing_invalid_multi_and_unsatisfiable_ranges() {
        assert_eq!(normalize_range(None, 10), Err(RangeError::Required));
        assert_eq!(
            normalize_range(Some("bytes=5-4"), 10),
            Err(RangeError::Invalid)
        );
        assert_eq!(
            normalize_range(Some("bytes=1-2,3-4"), 10),
            Err(RangeError::Invalid)
        );
        assert_eq!(
            normalize_range(Some("bytes=10-"), 10),
            Err(RangeError::Unsatisfiable)
        );
        assert_eq!(
            normalize_range(Some("bytes=-0"), 10),
            Err(RangeError::Unsatisfiable)
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
}
