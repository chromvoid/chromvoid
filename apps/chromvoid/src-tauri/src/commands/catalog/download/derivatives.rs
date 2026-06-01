use std::io::{Read, Seek, SeekFrom};
use std::sync::atomic::{AtomicBool, AtomicU64, Ordering};
use std::sync::{Arc, Mutex};
use std::time::Instant;

use chromvoid_core::rpc::types::{RpcRequest, RpcResponse};
use chromvoid_core::rpc::{
    cleanup_catalog_derivative_write_result, write_catalog_derivative_snapshot,
    CatalogDerivativeWriteRequest, RpcInputStream, RpcReply, RpcStreamMeta,
};

use super::rpc::{
    load_catalog_download_bytes, load_catalog_download_range_bytes, stream_out_from_reply,
};
use super::CatalogDownloadError;
use crate::commands::catalog::source_metadata::{
    load_catalog_source_metadata, CatalogSourceMetadata,
};
use crate::types::*;

const AUDIO_ARTWORK_RANGE_LIMIT_MESSAGE: &str = "audio artwork metadata range budget exceeded";

pub(super) fn derivative_output_name(
    stream_name: &str,
    display_name_hint: &str,
    extension: &str,
) -> String {
    let source = if stream_name.trim().is_empty() {
        display_name_hint.trim()
    } else {
        stream_name.trim()
    };

    match source.rsplit_once('.') {
        Some((stem, _)) if !stem.is_empty() => format!("{stem}.{extension}"),
        _ if source.is_empty() => format!("preview.{extension}"),
        _ => format!("{source}.{extension}"),
    }
}

pub(super) fn build_image_derivative_stream(
    source: StreamOut,
    display_name_hint: &str,
    requested_mime_type: Option<&str>,
    tier: crate::image_preview::ImageDerivativeTier,
) -> Result<StreamOut, CatalogDownloadError> {
    let preview = crate::image_preview::convert_image_derivative(
        &source.bytes,
        display_name_hint,
        requested_mime_type,
        tier,
    )
    .map_err(|error| (error, Some("PREVIEW_DECODE".to_string())))?;

    Ok(StreamOut {
        meta: RpcStreamMeta {
            name: derivative_output_name(
                &source.meta.name,
                display_name_hint,
                preview.file_extension,
            ),
            mime_type: preview.mime_type.to_string(),
            size: preview.bytes.len() as u64,
            chunk_size: source.meta.chunk_size.max(1),
        },
        bytes: preview.bytes,
    })
}

pub(super) fn is_display_derivative_candidate(file_name: &str, mime_type: Option<&str>) -> bool {
    crate::image_preview::is_image_derivative_candidate(file_name, mime_type)
        || crate::audio_artwork::is_audio_artwork_candidate(file_name, mime_type)
}

pub(super) fn load_stored_image_derivative_stream(
    adapter: &Arc<Mutex<Box<dyn crate::CoreAdapter>>>,
    node_id: u64,
    source_revision: u64,
    tier: crate::image_preview::ImageDerivativeTier,
) -> Result<Option<StreamOut>, CatalogDownloadError> {
    let read_started = Instant::now();
    let reply = {
        let mut adapter = adapter.lock().map_err(|_| {
            (
                "Adapter mutex poisoned".to_string(),
                Some("INTERNAL".to_string()),
            )
        })?;
        let req = RpcRequest::new(
            "catalog:derivative:read".to_string(),
            serde_json::json!({
                "node_id": node_id,
                "source_version": source_revision,
                "tier": tier.label(),
                "version": crate::image_preview::DERIVATIVE_STORAGE_VERSION,
            }),
        );
        adapter.handle_with_stream(&req, None)
    };
    tracing::info!(
        "perf:image_derivative event=derivative_read_handle derivative-read:handle_ms={} tier={} source_revision={} storage_version={} node_id={}",
        read_started.elapsed().as_millis(),
        tier.label(),
        source_revision,
        crate::image_preview::DERIVATIVE_STORAGE_VERSION,
        node_id,
    );

    match stream_out_from_reply(reply) {
        Ok(stream) => Ok(Some(stream)),
        Err((_error, code)) if code.as_deref() == Some("NODE_NOT_FOUND") => Ok(None),
        Err(error) => Err(error),
    }
}

pub(super) fn persist_image_derivative_stream(
    adapter: &Arc<Mutex<Box<dyn crate::CoreAdapter>>>,
    node_id: u64,
    source_revision: u64,
    tier: crate::image_preview::ImageDerivativeTier,
    derivative: &StreamOut,
    cancellation_epoch: Option<&Arc<AtomicU64>>,
) -> Result<(), CatalogDownloadError> {
    if let Some(result) = persist_local_derivative_stream(
        adapter,
        node_id,
        source_revision,
        tier.label(),
        crate::image_preview::DERIVATIVE_STORAGE_VERSION,
        derivative,
        cancellation_epoch,
    ) {
        return result;
    }

    let write_started = Instant::now();
    let reply = {
        let mut adapter = adapter.lock().map_err(|_| {
            (
                "Adapter mutex poisoned".to_string(),
                Some("INTERNAL".to_string()),
            )
        })?;
        let req = RpcRequest::new(
            "catalog:derivative:write".to_string(),
            serde_json::json!({
                "node_id": node_id,
                "source_version": source_revision,
                "tier": tier.label(),
                "version": crate::image_preview::DERIVATIVE_STORAGE_VERSION,
                "size": derivative.bytes.len() as u64,
                "name": derivative.meta.name,
                "mime_type": derivative.meta.mime_type,
                "file_extension": derivative
                    .meta
                    .name
                    .rsplit_once('.')
                    .map(|(_, extension)| extension.to_ascii_lowercase())
                    .unwrap_or_else(|| "bin".to_string()),
                "chunk_size": derivative.meta.chunk_size.max(1),
            }),
        );
        let reply = adapter.handle_with_stream(
            &req,
            Some(RpcInputStream::from_bytes(derivative.bytes.clone())),
        );
        let _ = adapter.save();
        reply
    };
    tracing::info!(
        "perf:image_derivative event=derivative_write derivative-write:handle_ms={} tier={} source_revision={} storage_version={} output_bytes={} node_id={}",
        write_started.elapsed().as_millis(),
        tier.label(),
        source_revision,
        crate::image_preview::DERIVATIVE_STORAGE_VERSION,
        derivative.bytes.len(),
        node_id,
    );

    match reply {
        RpcReply::Json(RpcResponse::Success { .. }) => Ok(()),
        RpcReply::Json(RpcResponse::Error { error, code, .. }) => Err((error, code)),
        RpcReply::Stream(_) | RpcReply::RangeStream(_) => Err((
            "Unexpected stream reply".to_string(),
            Some("INTERNAL".to_string()),
        )),
    }
}

pub(super) fn persist_local_or_adapter_derivative_stream(
    adapter: &Arc<Mutex<Box<dyn crate::CoreAdapter>>>,
    node_id: u64,
    source_revision: u64,
    tier: &str,
    version: u32,
    derivative: &StreamOut,
    cancellation_epoch: Option<&Arc<AtomicU64>>,
) -> Result<(), CatalogDownloadError> {
    if let Some(result) = persist_local_derivative_stream(
        adapter,
        node_id,
        source_revision,
        tier,
        version,
        derivative,
        cancellation_epoch,
    ) {
        return result;
    }

    persist_adapter_derivative_stream(adapter, node_id, source_revision, tier, version, derivative)
}

fn persist_adapter_derivative_stream(
    adapter: &Arc<Mutex<Box<dyn crate::CoreAdapter>>>,
    node_id: u64,
    source_revision: u64,
    tier: &str,
    version: u32,
    derivative: &StreamOut,
) -> Result<(), CatalogDownloadError> {
    let reply = {
        let mut adapter = adapter.lock().map_err(|_| {
            (
                "Adapter mutex poisoned".to_string(),
                Some("INTERNAL".to_string()),
            )
        })?;
        let req = RpcRequest::new(
            "catalog:derivative:write".to_string(),
            serde_json::json!({
                "node_id": node_id,
                "source_version": source_revision,
                "tier": tier,
                "version": version,
                "size": derivative.bytes.len() as u64,
                "name": derivative.meta.name,
                "mime_type": derivative.meta.mime_type,
                "file_extension": derivative
                    .meta
                    .name
                    .rsplit_once('.')
                    .map(|(_, extension)| extension.to_ascii_lowercase())
                    .unwrap_or_else(|| "bin".to_string()),
                "chunk_size": derivative.meta.chunk_size.max(1),
            }),
        );
        let reply = adapter.handle_with_stream(
            &req,
            Some(RpcInputStream::from_bytes(derivative.bytes.clone())),
        );
        let _ = adapter.save();
        reply
    };

    match reply {
        RpcReply::Json(RpcResponse::Success { .. }) => Ok(()),
        RpcReply::Json(RpcResponse::Error { error, code, .. }) => Err((error, code)),
        RpcReply::Stream(_) | RpcReply::RangeStream(_) => Err((
            "Unexpected stream reply".to_string(),
            Some("INTERNAL".to_string()),
        )),
    }
}

fn persist_local_derivative_stream(
    adapter: &Arc<Mutex<Box<dyn crate::CoreAdapter>>>,
    node_id: u64,
    source_revision: u64,
    tier: &str,
    version: u32,
    derivative: &StreamOut,
    cancellation_epoch: Option<&Arc<AtomicU64>>,
) -> Option<Result<(), CatalogDownloadError>> {
    let epoch = cancellation_epoch.map(|epoch| epoch.load(Ordering::SeqCst));
    let is_cancelled = || {
        cancellation_epoch
            .zip(epoch)
            .map(|(epoch, started)| epoch.load(Ordering::SeqCst) != started)
            .unwrap_or(false)
    };
    let file_extension = derivative
        .meta
        .name
        .rsplit_once('.')
        .map(|(_, extension)| extension.to_ascii_lowercase())
        .unwrap_or_else(|| "bin".to_string());
    let request = CatalogDerivativeWriteRequest {
        node_id,
        source_version: source_revision,
        tier: tier.to_string(),
        version,
        size: derivative.bytes.len() as u64,
        name: derivative.meta.name.clone(),
        mime_type: derivative.meta.mime_type.clone(),
        file_extension,
        chunk_size: derivative.meta.chunk_size.max(1),
    };
    let snapshot = {
        let mut adapter = match adapter.lock() {
            Ok(adapter) => adapter,
            Err(_) => {
                return Some(Err((
                    "Adapter mutex poisoned".to_string(),
                    Some("INTERNAL".to_string()),
                )))
            }
        };
        match adapter.snapshot_catalog_derivative_write(request)? {
            Ok(snapshot) => snapshot,
            Err(RpcResponse::Error { error, code, .. }) => return Some(Err((error, code))),
            Err(RpcResponse::Success { .. }) => {
                return Some(Err((
                    "Unexpected derivative snapshot success payload".to_string(),
                    Some("INTERNAL".to_string()),
                )))
            }
        }
    };

    if is_cancelled() {
        tracing::info!(
            "perf:image_derivative event=derivative_write_cancelled derivative-write:cancelled_epoch=true tier={} source_revision={} storage_version={} node_id={}",
            tier,
            source_revision,
            version,
            node_id,
        );
        return Some(Err((
            "Derivative write cancelled".to_string(),
            Some("CANCELLED".to_string()),
        )));
    }

    let write_started = Instant::now();
    let write_result =
        match write_catalog_derivative_snapshot(&snapshot, &derivative.bytes, is_cancelled) {
            Ok(write_result) => write_result,
            Err(error) => {
                let code = if error.cancelled {
                    "CANCELLED"
                } else {
                    "INTERNAL"
                };
                return Some(Err((error.message, Some(code.to_string()))));
            }
        };
    tracing::info!(
        "perf:image_derivative event=derivative_write_chunks derivative-write:write_ms={} tier={} source_revision={} storage_version={} output_bytes={} chunks={} node_id={}",
        write_started.elapsed().as_millis(),
        tier,
        source_revision,
        version,
        derivative.bytes.len(),
        write_result.part_count,
        node_id,
    );

    if is_cancelled() {
        cleanup_catalog_derivative_write_result(&snapshot, &write_result);
        return Some(Err((
            "Derivative write cancelled".to_string(),
            Some("CANCELLED".to_string()),
        )));
    }

    let commit_response = {
        let mut adapter = match adapter.lock() {
            Ok(adapter) => adapter,
            Err(_) => {
                cleanup_catalog_derivative_write_result(&snapshot, &write_result);
                return Some(Err((
                    "Adapter mutex poisoned".to_string(),
                    Some("INTERNAL".to_string()),
                )));
            }
        };
        adapter.commit_catalog_derivative_write(&snapshot, &write_result)?
    };

    match commit_response {
        RpcResponse::Success { result, .. } => {
            if derivative_commit_is_stale(&result) {
                return Some(Err((
                    "Derivative write skipped for stale source revision".to_string(),
                    Some("CANCELLED".to_string()),
                )));
            }
            Some(Ok(()))
        }
        RpcResponse::Error { error, code, .. } => Some(Err((error, code))),
    }
}

fn derivative_commit_is_stale(result: &serde_json::Value) -> bool {
    match result.get("stale") {
        Some(value) => match value.as_bool() {
            Some(value) => value,
            None => {
                tracing::warn!(
                    "perf:image_derivative event=derivative_write_commit_malformed field=stale"
                );
                false
            }
        },
        None => {
            tracing::warn!(
                "perf:image_derivative event=derivative_write_commit_malformed missing=stale"
            );
            false
        }
    }
}

#[cfg(test)]
pub(super) fn build_core_backed_image_derivative_stream(
    adapter: &Arc<Mutex<Box<dyn crate::CoreAdapter>>>,
    image_preview_runtime: &crate::image_preview::ImagePreviewRuntimeState,
    node_id: u64,
    display_name_hint: &str,
    requested_mime_type: Option<&str>,
    tier: crate::image_preview::ImageDerivativeTier,
) -> Result<StreamOut, CatalogDownloadError> {
    let source_metadata = load_catalog_source_metadata(adapter, node_id)?;
    let (stream, _) = build_core_backed_image_derivative_stream_with_metadata_and_cancellation(
        adapter,
        image_preview_runtime,
        node_id,
        display_name_hint,
        requested_mime_type,
        tier,
        source_metadata,
        None,
        false,
    )?;
    Ok(stream)
}

pub(super) fn build_core_backed_image_derivative_stream_cancellable(
    adapter: &Arc<Mutex<Box<dyn crate::CoreAdapter>>>,
    image_preview_runtime: &crate::image_preview::ImagePreviewRuntimeState,
    node_id: u64,
    display_name_hint: &str,
    requested_mime_type: Option<&str>,
    tier: crate::image_preview::ImageDerivativeTier,
    cancellation_epoch: Arc<AtomicU64>,
    refresh_cache: bool,
) -> Result<StreamOut, CatalogDownloadError> {
    let source_metadata = load_catalog_source_metadata(adapter, node_id)?;
    let (stream, _) = build_core_backed_image_derivative_stream_with_metadata_and_cancellation(
        adapter,
        image_preview_runtime,
        node_id,
        display_name_hint,
        requested_mime_type,
        tier,
        source_metadata,
        Some(&cancellation_epoch),
        refresh_cache,
    )?;
    Ok(stream)
}

pub(super) fn build_core_backed_image_derivative_stream_with_metadata_and_cancellation(
    adapter: &Arc<Mutex<Box<dyn crate::CoreAdapter>>>,
    image_preview_runtime: &crate::image_preview::ImagePreviewRuntimeState,
    node_id: u64,
    display_name_hint: &str,
    requested_mime_type: Option<&str>,
    tier: crate::image_preview::ImageDerivativeTier,
    source_metadata: CatalogSourceMetadata,
    cancellation_epoch: Option<&Arc<AtomicU64>>,
    refresh_cache: bool,
) -> Result<(StreamOut, u64), CatalogDownloadError> {
    let source_revision = source_metadata.source_revision;
    let source_name = if display_name_hint.trim().is_empty() {
        source_metadata.name.as_str()
    } else {
        display_name_hint
    };
    let source_mime_type = requested_mime_type.or(source_metadata.mime_type.as_deref());

    if !refresh_cache {
        if let Some(derivative) =
            load_stored_image_derivative_stream(adapter, node_id, source_revision, tier)?
        {
            tracing::info!(
                "perf:image_derivative event=cache_hit cache_hit=true tier={} source_revision={} storage_version={} output_bytes={} output_mime_type={} node_id={}",
                tier.label(),
                source_revision,
                crate::image_preview::DERIVATIVE_STORAGE_VERSION,
                derivative.bytes.len(),
                derivative.meta.mime_type,
                node_id,
            );
            return Ok((derivative, source_revision));
        }
    }

    let cache_key = crate::image_preview::derivative_storage_key(node_id, source_revision, tier);
    let cache_lock = image_preview_runtime
        .derivative_lock(&cache_key)
        .map_err(|error| (error, Some("INTERNAL".to_string())))?;
    let _guard = cache_lock.lock().map_err(|_| {
        (
            "Derivative cache lock poisoned".to_string(),
            Some("INTERNAL".to_string()),
        )
    })?;

    if !refresh_cache {
        if let Some(cached) =
            load_stored_image_derivative_stream(adapter, node_id, source_revision, tier)?
        {
            tracing::info!(
                "perf:image_derivative event=cache_hit cache_hit=true tier={} source_revision={} storage_version={} output_bytes={} output_mime_type={} node_id={}",
                tier.label(),
                source_revision,
                crate::image_preview::DERIVATIVE_STORAGE_VERSION,
                cached.bytes.len(),
                cached.meta.mime_type,
                node_id,
            );
            return Ok((cached, source_revision));
        }
    }

    let derivative = if crate::image_preview::is_image_derivative_candidate(
        source_name,
        source_mime_type,
    ) {
        let source_started = Instant::now();
        let source = load_catalog_download_bytes(adapter, node_id)?;
        tracing::info!(
            "perf:image_derivative event=source_read cache_hit=false source_read_ms={} tier={} source_revision={} storage_version={} input_bytes={} source_mime_type={} node_id={}",
            source_started.elapsed().as_millis(),
            tier.label(),
            source_revision,
            crate::image_preview::DERIVATIVE_STORAGE_VERSION,
            source.bytes.len(),
            source.meta.mime_type,
            node_id,
        );
        let build_started = Instant::now();
        let derivative =
            build_image_derivative_stream(source, source_name, source_mime_type, tier)?;
        tracing::info!(
            "perf:image_derivative event=build derivative:build_ms={} tier={} source_revision={} storage_version={} output_bytes={} node_id={}",
            build_started.elapsed().as_millis(),
            tier.label(),
            source_revision,
            crate::image_preview::DERIVATIVE_STORAGE_VERSION,
            derivative.bytes.len(),
            node_id,
        );
        derivative
    } else if crate::audio_artwork::is_audio_artwork_candidate(source_name, source_mime_type) {
        build_audio_artwork_derivative_stream(
            adapter,
            node_id,
            source_name,
            source_mime_type,
            tier,
            &source_metadata,
        )?
    } else {
        return Err((
            "Preview conversion is only available for image files or embedded audio artwork"
                .to_string(),
            Some("UNSUPPORTED".to_string()),
        ));
    };
    persist_image_derivative_stream(
        adapter,
        node_id,
        source_revision,
        tier,
        &derivative,
        cancellation_epoch,
    )?;

    tracing::info!(
        "image_derivative cache_hit=false tier={} source_revision={} storage_version={} output_bytes={} output_mime_type={} node_id={}",
        tier.label(),
        source_revision,
        crate::image_preview::DERIVATIVE_STORAGE_VERSION,
        derivative.bytes.len(),
        derivative.meta.mime_type,
        node_id,
    );

    Ok((derivative, source_revision))
}

fn build_audio_artwork_derivative_stream(
    adapter: &Arc<Mutex<Box<dyn crate::CoreAdapter>>>,
    node_id: u64,
    source_name: &str,
    source_mime_type: Option<&str>,
    tier: crate::image_preview::ImageDerivativeTier,
    source_metadata: &CatalogSourceMetadata,
) -> Result<StreamOut, CatalogDownloadError> {
    if source_metadata.size == 0 {
        return Err((
            "Embedded audio artwork is unavailable".to_string(),
            Some("UNSUPPORTED".to_string()),
        ));
    }

    let budget_exceeded = Arc::new(AtomicBool::new(false));
    let reader = CatalogDerivativeRangeReader {
        adapter: adapter.clone(),
        node_id,
        source_revision: source_metadata.source_revision,
        file_size: source_metadata.size,
        position: 0,
        bytes_fetched: 0,
        budget_exceeded: budget_exceeded.clone(),
    };

    let source_started = Instant::now();
    let artwork = match crate::audio_artwork::extract_embedded_artwork(
        reader,
        source_name,
        source_mime_type,
    ) {
        Ok(Some(artwork)) => artwork,
        Ok(None) => {
            return Err((
                "Embedded audio artwork is unavailable".to_string(),
                Some("UNSUPPORTED".to_string()),
            ));
        }
        Err(error) if budget_exceeded.load(Ordering::Relaxed) => {
            tracing::info!(
                "audio_artwork_derivative range_budget_exceeded tier={} source_revision={} storage_version={} max_bytes={} node_id={} error={}",
                tier.label(),
                source_metadata.source_revision,
                crate::image_preview::DERIVATIVE_STORAGE_VERSION,
                crate::audio_artwork::ARTWORK_METADATA_RANGE_BUDGET_BYTES,
                node_id,
                error,
            );
            return Err((
                "Embedded audio artwork is unavailable within the metadata probe budget"
                    .to_string(),
                Some("DERIVATIVE_UNAVAILABLE".to_string()),
            ));
        }
        Err(error) => {
            tracing::info!(
                "audio_artwork_derivative metadata_unavailable tier={} source_revision={} storage_version={} node_id={} error={}",
                tier.label(),
                source_metadata.source_revision,
                crate::image_preview::DERIVATIVE_STORAGE_VERSION,
                node_id,
                error,
            );
            return Err((
                "Embedded audio artwork is unavailable".to_string(),
                Some("UNSUPPORTED".to_string()),
            ));
        }
    };

    tracing::info!(
        "audio_artwork_derivative source_read_ms={} tier={} source_revision={} storage_version={} artwork_bytes={} artwork_mime_type={} source_mime_type={} node_id={}",
        source_started.elapsed().as_millis(),
        tier.label(),
        source_metadata.source_revision,
        crate::image_preview::DERIVATIVE_STORAGE_VERSION,
        artwork.bytes.len(),
        artwork.mime_type,
        source_mime_type.unwrap_or(""),
        node_id,
    );

    let build_started = Instant::now();
    let preview = crate::image_preview::convert_image_derivative(
        &artwork.bytes,
        source_name,
        Some(artwork.mime_type),
        tier,
    )
    .map_err(|error| (error, Some("PREVIEW_DECODE".to_string())))?;
    tracing::info!(
        "perf:image_derivative event=build derivative:build_ms={} tier={} source_revision={} storage_version={} output_bytes={} node_id={}",
        build_started.elapsed().as_millis(),
        tier.label(),
        source_metadata.source_revision,
        crate::image_preview::DERIVATIVE_STORAGE_VERSION,
        preview.bytes.len(),
        node_id,
    );

    Ok(StreamOut {
        meta: RpcStreamMeta {
            name: derivative_output_name(source_name, source_name, preview.file_extension),
            mime_type: preview.mime_type.to_string(),
            size: preview.bytes.len() as u64,
            chunk_size: crate::audio_artwork::ARTWORK_METADATA_RANGE_CHUNK_BYTES as u32,
        },
        bytes: preview.bytes,
    })
}

struct CatalogDerivativeRangeReader {
    adapter: Arc<Mutex<Box<dyn crate::CoreAdapter>>>,
    node_id: u64,
    source_revision: u64,
    file_size: u64,
    position: u64,
    bytes_fetched: u64,
    budget_exceeded: Arc<AtomicBool>,
}

impl Read for CatalogDerivativeRangeReader {
    fn read(&mut self, buf: &mut [u8]) -> std::io::Result<usize> {
        if buf.is_empty() || self.position >= self.file_size {
            return Ok(0);
        }

        let remaining_budget = crate::audio_artwork::ARTWORK_METADATA_RANGE_BUDGET_BYTES
            .saturating_sub(self.bytes_fetched);
        if remaining_budget == 0 {
            self.budget_exceeded.store(true, Ordering::Relaxed);
            return Err(std::io::Error::new(
                std::io::ErrorKind::Other,
                AUDIO_ARTWORK_RANGE_LIMIT_MESSAGE,
            ));
        }

        let length = (buf.len() as u64)
            .min(crate::audio_artwork::ARTWORK_METADATA_RANGE_CHUNK_BYTES)
            .min(self.file_size.saturating_sub(self.position))
            .min(remaining_budget);
        if length == 0 {
            return Ok(0);
        }

        let bytes = load_catalog_download_range_bytes(
            &self.adapter,
            self.node_id,
            self.position,
            length,
            self.source_revision,
        )
        .map_err(|(error, code)| {
            std::io::Error::new(
                std::io::ErrorKind::Other,
                format!("catalog download range failed code={code:?}: {error}"),
            )
        })?;
        let copied = bytes.len().min(buf.len());
        buf[..copied].copy_from_slice(&bytes[..copied]);
        self.position = self.position.saturating_add(copied as u64);
        self.bytes_fetched = self.bytes_fetched.saturating_add(copied as u64);

        Ok(copied)
    }
}

impl Seek for CatalogDerivativeRangeReader {
    fn seek(&mut self, pos: SeekFrom) -> std::io::Result<u64> {
        let next = match pos {
            SeekFrom::Start(offset) => i128::from(offset),
            SeekFrom::End(offset) => i128::from(self.file_size) + i128::from(offset),
            SeekFrom::Current(offset) => i128::from(self.position) + i128::from(offset),
        };

        if next < 0 || next > i128::from(u64::MAX) {
            return Err(std::io::Error::new(
                std::io::ErrorKind::InvalidInput,
                "invalid audio artwork metadata seek",
            ));
        }

        self.position = next as u64;
        Ok(self.position)
    }
}

#[cfg(test)]
mod tests {
    use serde_json::json;

    use super::*;

    #[test]
    fn derivative_commit_stale_parser_reads_boolean() {
        assert!(derivative_commit_is_stale(&json!({ "stale": true })));
        assert!(!derivative_commit_is_stale(&json!({ "stale": false })));
    }

    #[test]
    fn derivative_commit_stale_parser_defaults_malformed_to_false() {
        assert!(!derivative_commit_is_stale(&json!({ "stale": "no" })));
        assert!(!derivative_commit_is_stale(&json!({})));
    }
}
