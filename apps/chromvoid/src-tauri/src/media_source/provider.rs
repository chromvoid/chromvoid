use std::io::Read;
use std::sync::{Arc, Mutex};
use std::time::Instant;

use bytes::Bytes;

use chromvoid_core::rpc::types::{RpcRequest, RpcResponse};
use chromvoid_core::rpc::RpcReply;
use chromvoid_protocol::TransportType;

use crate::core_adapter::{CoreAdapter, CoreMode};

use super::range_reader::LocalMediaRuntimePlatform;
use super::scheduler::{
    media_read_contract_schema, MediaByteChunk, MediaReadError, MediaReadProvider,
    MediaReadProviderIdentity, MediaReadRequest,
};
use super::session::LocalMediaSourceSession;

pub(crate) struct CoreMediaReadProvider {
    adapter: Arc<Mutex<Box<dyn CoreAdapter>>>,
    session: LocalMediaSourceSession,
}

impl CoreMediaReadProvider {
    pub(crate) fn new(
        adapter: Arc<Mutex<Box<dyn CoreAdapter>>>,
        session: LocalMediaSourceSession,
    ) -> Self {
        Self { adapter, session }
    }

    fn ensure_current(&self, request: &MediaReadRequest) -> Result<(), MediaReadError> {
        if self.session.is_cancelled() {
            return Err(MediaReadError::StreamNotFound);
        }
        if request.token != self.session.token
            || request.node_id != self.session.node_id
            || request.generation != self.session.generation
            || request.source_revision != self.session.source_revision
        {
            return Err(MediaReadError::StreamStale);
        }
        Ok(())
    }

    fn platform() -> LocalMediaRuntimePlatform {
        if cfg!(mobile) {
            LocalMediaRuntimePlatform::Mobile
        } else {
            LocalMediaRuntimePlatform::Desktop
        }
    }
}

impl MediaReadProvider for CoreMediaReadProvider {
    fn identity(&self) -> MediaReadProviderIdentity {
        self.adapter
            .lock()
            .ok()
            .map(|adapter| {
                if adapter
                    .transport_metrics()
                    .and_then(|metrics| metrics.transport_type)
                    .is_some_and(|transport_type| transport_type == TransportType::UsbMobile)
                {
                    return MediaReadProviderIdentity::RemoteUsb;
                }
                if adapter.mode() == CoreMode::Local {
                    return match Self::platform() {
                        LocalMediaRuntimePlatform::Desktop => {
                            MediaReadProviderIdentity::LocalCatalog
                        }
                        LocalMediaRuntimePlatform::Mobile => {
                            MediaReadProviderIdentity::MobileLocalCatalog
                        }
                    };
                }
                MediaReadProviderIdentity::RemoteNetwork
            })
            .unwrap_or(MediaReadProviderIdentity::RemoteNetwork)
    }

    fn read_range<F>(&self, request: &MediaReadRequest, on_chunk: F) -> Result<u64, MediaReadError>
    where
        F: FnMut(MediaByteChunk) -> Result<(), MediaReadError>,
    {
        self.ensure_current(request)?;
        let provider_identity = self.identity();
        let started_at = Instant::now();
        tracing::info!(
            target: "media.telemetry",
            event = "media.read.request",
            provider = ?provider_identity,
            intent = ?request.intent,
            range_class = ?request.range_class,
            offset = request.offset,
            length = request.length,
            generation = request.generation,
            source_revision = request.source_revision,
        );
        let (known_intents, known_errors) = media_read_contract_schema();
        tracing::trace!(
            "media_source: provider read identity={:?} intent={:?} range_class={:?} offset={} length={} known_intents={} known_errors={}",
            provider_identity,
            request.intent,
            request.range_class,
            request.offset,
            request.length,
            known_intents.len(),
            known_errors.len()
        );
        // Enqueue the request while holding the adapter lock (this fixes the
        // request order), then release the lock before waiting for the reply
        // so a slow remote round trip does not serialize unrelated RPCs
        // behind this media read.
        let deferred = {
            let mut adapter = self
                .adapter
                .lock()
                .map_err(|_| MediaReadError::SourceLoadFailed)?;
            let rpc_request = RpcRequest::new(
                "catalog:downloadRange".to_string(),
                serde_json::json!({
                    "node_id": request.node_id,
                    "offset": request.offset,
                    "length": request.length,
                    "expected_source_revision": request.source_revision,
                }),
            );
            adapter.begin_with_stream(&rpc_request, None)
        };
        let reply = deferred.wait();

        let result = match reply {
            RpcReply::RangeStream(out) => {
                let expected_length = out.meta.range_length;
                read_range_stream_to_chunks(
                    out.reader,
                    &self.session,
                    request,
                    expected_length,
                    on_chunk,
                )
            }
            RpcReply::Json(RpcResponse::Error { code, .. }) => {
                Err(map_core_error_code(code.as_deref()))
            }
            RpcReply::Json(RpcResponse::Success { .. }) | RpcReply::Stream(_) => {
                Err(MediaReadError::SourceLoadFailed)
            }
        };
        match &result {
            Ok(served_bytes) => tracing::info!(
                target: "media.telemetry",
                event = "media.read.complete",
                provider = ?provider_identity,
                intent = ?request.intent,
                range_class = ?request.range_class,
                offset = request.offset,
                length = request.length,
                served_bytes = *served_bytes,
                elapsed_ms = started_at.elapsed().as_millis() as u64,
                generation = request.generation,
                source_revision = request.source_revision,
            ),
            Err(error) => tracing::warn!(
                target: "media.telemetry",
                event = "media.read.error",
                provider = ?provider_identity,
                intent = ?request.intent,
                range_class = ?request.range_class,
                offset = request.offset,
                length = request.length,
                error = ?error,
                elapsed_ms = started_at.elapsed().as_millis() as u64,
                generation = request.generation,
                source_revision = request.source_revision,
            ),
        }
        result
    }
}

fn read_range_stream_to_chunks<F>(
    mut reader: Box<dyn Read + Send>,
    session: &LocalMediaSourceSession,
    request: &MediaReadRequest,
    expected_length: u64,
    mut on_chunk: F,
) -> Result<u64, MediaReadError>
where
    F: FnMut(MediaByteChunk) -> Result<(), MediaReadError>,
{
    let mut total = 0_u64;
    let mut chunk_offset = request.offset;
    let mut pending: Option<(u64, Bytes)> = None;
    let mut buffer = [0_u8; 64 * 1024];
    let mut first_byte_emitted = false;

    loop {
        if session.is_cancelled() {
            return Err(MediaReadError::StreamNotFound);
        }
        let read = reader
            .read(&mut buffer)
            .map_err(|_| MediaReadError::RangeReadFailed)?;
        if read == 0 {
            break;
        }
        if session.is_cancelled() {
            return Err(MediaReadError::StreamNotFound);
        }

        if let Some((offset, bytes)) =
            pending.replace((chunk_offset, Bytes::copy_from_slice(&buffer[..read])))
        {
            emit_read_chunk_telemetry(
                request,
                offset,
                bytes.len() as u64,
                false,
                &mut first_byte_emitted,
            );
            on_chunk(MediaByteChunk {
                offset,
                bytes,
                range_class: request.range_class,
                is_final: false,
            })?;
        }
        chunk_offset = chunk_offset.saturating_add(read as u64);
        total = total.saturating_add(read as u64);
    }

    if let Some((offset, bytes)) = pending {
        emit_read_chunk_telemetry(
            request,
            offset,
            bytes.len() as u64,
            true,
            &mut first_byte_emitted,
        );
        on_chunk(MediaByteChunk {
            offset,
            bytes,
            range_class: request.range_class,
            is_final: true,
        })?;
    }
    if session.is_cancelled() {
        return Err(MediaReadError::StreamNotFound);
    }
    if total != expected_length {
        // A transport disconnect mid-stream can surface as a clean EOF; never
        // report truncated data as a successful range read.
        tracing::warn!(
            target: "media.telemetry",
            event = "media.read.truncated",
            intent = ?request.intent,
            range_class = ?request.range_class,
            offset = request.offset,
            length = request.length,
            expected_bytes = expected_length,
            received_bytes = total,
            generation = request.generation,
            source_revision = request.source_revision,
        );
        return Err(MediaReadError::RangeReadFailed);
    }
    Ok(total)
}

fn emit_read_chunk_telemetry(
    request: &MediaReadRequest,
    offset: u64,
    length: u64,
    is_final: bool,
    first_byte_emitted: &mut bool,
) {
    if !*first_byte_emitted {
        *first_byte_emitted = true;
        tracing::info!(
            target: "media.telemetry",
            event = "media.read.first_byte",
            intent = ?request.intent,
            range_class = ?request.range_class,
            offset,
            length,
            generation = request.generation,
            source_revision = request.source_revision,
        );
    }
    tracing::trace!(
        target: "media.telemetry",
        event = "media.read.chunk",
        intent = ?request.intent,
        range_class = ?request.range_class,
        offset,
        length,
        is_final,
        generation = request.generation,
        source_revision = request.source_revision,
    );
}

fn map_core_error_code(code: Option<&str>) -> MediaReadError {
    match code {
        Some("ERR_MEDIA_STREAM_STALE") => MediaReadError::StreamStale,
        Some("ERR_MEDIA_RANGE_INVALID") => MediaReadError::RangeInvalid,
        Some("VAULT_REQUIRED") | Some("VAULT_NOT_UNLOCKED") | Some("ACCESS_DENIED") => {
            MediaReadError::StreamLocked
        }
        Some("NODE_NOT_FOUND") => MediaReadError::StreamNotFound,
        Some("ERR_MEDIA_PROVIDER_UNAVAILABLE") => MediaReadError::ProviderUnavailable,
        Some("ERR_MEDIA_PROVIDER_TIMEOUT") | Some("TIMEOUT") => MediaReadError::Timeout,
        Some("ERR_MEDIA_SOURCE_STARVED") => MediaReadError::SourceStarved,
        _ => MediaReadError::RangeReadFailed,
    }
}

#[cfg(all(test, desktop))]
mod tests {
    use std::io::Cursor;
    use std::time::{Duration, Instant};

    use chromvoid_core::rpc::{RpcRangeOutputStream, RpcRangeStreamMeta};
    use tokio::sync::mpsc;

    use super::*;
    use crate::core_adapter::{RemoteCoreAdapter, RemoteHost};
    use crate::media_source::scheduler::{MediaRangeClass, MediaReadIntent};
    use crate::media_source::{LocalMediaKind, LocalMediaSourceManager};

    fn range_stream_reply(bytes: Vec<u8>, source_revision: u64) -> RpcReply {
        RpcReply::RangeStream(RpcRangeOutputStream {
            meta: RpcRangeStreamMeta {
                name: "movie.mp4".to_string(),
                mime_type: "video/mp4".to_string(),
                file_size: bytes.len() as u64,
                chunk_size: bytes.len() as u32,
                range_offset: 0,
                range_length: bytes.len() as u64,
                source_revision,
            },
            reader: Box::new(Cursor::new(bytes)),
        })
    }

    /// Regression test for the media-streaming audit fix R5: `read_range`
    /// must not hold the app-wide adapter mutex while waiting for the remote
    /// reply, so other RPCs can lock the adapter and proceed in the meantime.
    #[test]
    fn read_range_releases_adapter_lock_while_waiting_for_remote_reply() {
        let (tx, mut rx) = mpsc::channel::<crate::remote_data_plane::RemoteIoRequest>(4);
        let host = RemoteHost::TauriRemoteWss {
            peer_id: "test-peer".to_string(),
        };
        let adapter: Arc<Mutex<Box<dyn CoreAdapter>>> = Arc::new(Mutex::new(Box::new(
            RemoteCoreAdapter::from_remote_sender(host, tx),
        )));
        let session = LocalMediaSourceManager::new()
            .register(9, LocalMediaKind::Video, "video/mp4".to_string(), 3, 7)
            .expect("register media source");
        let request = MediaReadRequest {
            token: session.token.clone(),
            node_id: session.node_id,
            generation: session.generation,
            source_revision: session.source_revision,
            offset: 0,
            length: 3,
            intent: MediaReadIntent::Foreground,
            range_class: MediaRangeClass::Unknown,
        };

        let provider = CoreMediaReadProvider::new(adapter.clone(), session);
        let reader = std::thread::spawn(move || {
            let mut bytes = Vec::new();
            let served = provider.read_range(&request, |chunk| {
                bytes.extend_from_slice(&chunk.bytes);
                Ok(())
            })?;
            Ok::<_, MediaReadError>((served, bytes))
        });

        // The media request reached the io task; its reply is withheld so the
        // media read is now blocked waiting for it.
        let media_request = rx.blocking_recv().expect("media io request");
        assert_eq!(media_request.request.command, "catalog:downloadRange");

        // Responder for the concurrent RPC issued below; it replies to that
        // RPC first and only afterwards releases the media reply.
        let responder = std::thread::spawn(move || {
            let second = rx.blocking_recv().expect("second io request");
            assert_eq!(second.request.command, "catalog:list");
            let _ = second
                .reply_tx
                .send(RpcReply::Json(RpcResponse::success(serde_json::json!({}))));

            let _ = media_request
                .reply_tx
                .send(range_stream_reply(vec![1, 2, 3], 7));
        });

        // The adapter mutex must be acquirable while the media read waits.
        let deadline = Instant::now() + Duration::from_secs(10);
        let second_response = loop {
            if let Ok(mut guard) = adapter.try_lock() {
                break guard.handle(&RpcRequest::new("catalog:list", serde_json::json!({})));
            }
            assert!(
                Instant::now() < deadline,
                "adapter mutex stayed locked while media read waited for its reply"
            );
            std::thread::sleep(Duration::from_millis(5));
        };
        assert!(second_response.is_ok());

        responder.join().expect("responder join");
        let (served, bytes) = reader
            .join()
            .expect("reader join")
            .expect("media read result");
        assert_eq!(served, 3);
        assert_eq!(bytes, vec![1, 2, 3]);
    }
}
