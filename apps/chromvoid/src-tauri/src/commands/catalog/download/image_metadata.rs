use std::io::Cursor;
use std::sync::atomic::AtomicU64;
use std::sync::{Arc, Mutex};
use std::time::Instant;

use chromvoid_core::rpc::types::RpcRequest;
use chromvoid_core::rpc::RpcStreamMeta;
use exif::{Exif, Field, Tag, Value};
use image::{ImageDecoder, ImageReader};
use quick_xml::events::Event;
use quick_xml::Reader as XmlReader;
use serde::{Deserialize, Serialize};

use super::rpc::{load_catalog_download_bytes, stream_out_from_reply};
use super::CatalogDownloadError;
use crate::commands::catalog::image_import_provenance::{
    load_image_import_provenance, CatalogImageImportProvenance,
};
use crate::commands::catalog::source_metadata::load_catalog_source_metadata;
use crate::types::{PreviewImageArgs, StreamOut};

const IMAGE_METADATA_CACHE_TIER: &str = "metadata";
const IMAGE_METADATA_CACHE_VERSION: u32 = 10;
const IMAGE_METADATA_CACHE_MIME: &str = "application/vnd.chromvoid.image-metadata+json";
const IMAGE_METADATA_CACHE_CHUNK_SIZE: u32 = 64 * 1024;

#[derive(Debug, Clone, Deserialize, Serialize, Default, PartialEq)]
#[serde(rename_all = "camelCase")]
pub(crate) struct CatalogImageMetadata {
    #[serde(skip_serializing_if = "Option::is_none")]
    pub(crate) width: Option<u32>,
    #[serde(skip_serializing_if = "Option::is_none")]
    pub(crate) height: Option<u32>,
    #[serde(skip_serializing_if = "Option::is_none")]
    pub(crate) date_taken: Option<String>,
    #[serde(skip_serializing_if = "Option::is_none")]
    pub(crate) camera_make: Option<String>,
    #[serde(skip_serializing_if = "Option::is_none")]
    pub(crate) camera_model: Option<String>,
    #[serde(skip_serializing_if = "Option::is_none")]
    pub(crate) lens_model: Option<String>,
    #[serde(skip_serializing_if = "Option::is_none")]
    pub(crate) exposure_time: Option<String>,
    #[serde(skip_serializing_if = "Option::is_none")]
    pub(crate) aperture: Option<String>,
    #[serde(skip_serializing_if = "Option::is_none")]
    pub(crate) iso: Option<u32>,
    #[serde(skip_serializing_if = "Option::is_none")]
    pub(crate) focal_length: Option<String>,
    #[serde(skip_serializing_if = "Option::is_none")]
    pub(crate) orientation: Option<String>,
    #[serde(skip_serializing_if = "Option::is_none")]
    pub(crate) gps: Option<CatalogImageGpsMetadata>,
    #[serde(skip_serializing_if = "Option::is_none")]
    pub(crate) source_revision: Option<u64>,
    #[serde(skip_serializing_if = "Option::is_none")]
    pub(crate) import_provenance: Option<CatalogImageImportProvenance>,
    #[serde(skip_serializing_if = "Option::is_none")]
    pub(crate) gps_diagnostic: Option<CatalogImageGpsDiagnostic>,
}

#[derive(Debug, Clone, Deserialize, Serialize, PartialEq)]
#[serde(rename_all = "camelCase")]
pub(crate) struct CatalogImageGpsMetadata {
    pub(crate) latitude: f64,
    pub(crate) longitude: f64,
    #[serde(skip_serializing_if = "Option::is_none")]
    pub(crate) altitude_meters: Option<f64>,
}

#[derive(Debug, Clone, Deserialize, Serialize, PartialEq)]
#[serde(rename_all = "camelCase")]
pub(crate) struct CatalogImageGpsDiagnostic {
    pub(crate) status: String,
    #[serde(skip_serializing_if = "Option::is_none")]
    pub(crate) rust_exif_status: Option<String>,
    #[serde(skip_serializing_if = "Option::is_none")]
    pub(crate) xmp_status: Option<String>,
    #[serde(skip_serializing_if = "Option::is_none")]
    pub(crate) android_status: Option<String>,
    #[serde(skip_serializing_if = "Option::is_none")]
    pub(crate) import_provenance_status: Option<String>,
}

#[derive(Debug, Clone, Default)]
struct CatalogImageGpsDiagnosticParts {
    rust_exif_status: Option<String>,
    xmp_status: Option<String>,
    android_status: Option<String>,
}

#[derive(Debug, Clone, Copy, Deserialize, Serialize, PartialEq, Eq)]
#[serde(rename_all = "snake_case")]
enum ImageMetadataCacheOutcome {
    Ready,
    Empty,
}

#[derive(Debug, Clone, Deserialize, Serialize, PartialEq)]
#[serde(rename_all = "camelCase")]
struct ImageMetadataCachePayloadV2 {
    source_revision: u64,
    outcome: ImageMetadataCacheOutcome,
    metadata: CatalogImageMetadata,
}

enum ImageMetadataCacheLookup {
    Hit(CatalogImageMetadata),
    Miss,
    ReadFailed,
}

#[cfg(test)]
pub(super) fn load_catalog_image_metadata(
    adapter: &Arc<Mutex<Box<dyn crate::CoreAdapter>>>,
    args: PreviewImageArgs,
) -> Result<CatalogImageMetadata, CatalogDownloadError> {
    load_catalog_image_metadata_with_cancellation(adapter, args, None)
}

pub(super) fn load_catalog_image_metadata_cancellable(
    adapter: &Arc<Mutex<Box<dyn crate::CoreAdapter>>>,
    args: PreviewImageArgs,
    cancellation_epoch: Arc<AtomicU64>,
) -> Result<CatalogImageMetadata, CatalogDownloadError> {
    load_catalog_image_metadata_with_cancellation(adapter, args, Some(&cancellation_epoch))
}

fn load_catalog_image_metadata_with_cancellation(
    adapter: &Arc<Mutex<Box<dyn crate::CoreAdapter>>>,
    args: PreviewImageArgs,
    cancellation_epoch: Option<&Arc<AtomicU64>>,
) -> Result<CatalogImageMetadata, CatalogDownloadError> {
    let source_metadata = load_catalog_source_metadata(adapter, args.node_id)?;
    let file_name = if args.file_name.trim().is_empty() {
        source_metadata.name.as_str()
    } else {
        args.file_name.as_str()
    };
    let mime_type = args
        .mime_type
        .as_deref()
        .or(source_metadata.mime_type.as_deref());
    let mut metadata = CatalogImageMetadata {
        source_revision: Some(source_metadata.source_revision),
        ..CatalogImageMetadata::default()
    };
    metadata.import_provenance = load_image_import_provenance_best_effort(
        adapter,
        args.node_id,
        source_metadata.source_revision,
    );

    if !crate::image_preview::is_image_derivative_candidate(file_name, mime_type) {
        metadata.gps_diagnostic = Some(build_gps_diagnostic(
            "not_image",
            CatalogImageGpsDiagnosticParts::default(),
            metadata.import_provenance.as_ref(),
        ));
        tracing::info!(
            "image_metadata skipped_non_image node_id={} source_revision={} source_mime_type={}",
            args.node_id,
            source_metadata.source_revision,
            mime_type.unwrap_or("")
        );
        return Ok(metadata);
    }

    let cache_read_started = Instant::now();
    let cache_lookup =
        load_stored_image_metadata(adapter, args.node_id, source_metadata.source_revision)?;
    tracing::info!(
        "perf:image_metadata event=cache_read image-metadata:cache_read_ms={} node_id={} source_revision={} storage_version={}",
        cache_read_started.elapsed().as_millis(),
        args.node_id,
        source_metadata.source_revision,
        IMAGE_METADATA_CACHE_VERSION,
    );
    let cache_write_allowed = !matches!(cache_lookup, ImageMetadataCacheLookup::ReadFailed);
    match cache_lookup {
        ImageMetadataCacheLookup::Hit(mut cached) => {
            overlay_image_import_provenance(
                adapter,
                args.node_id,
                source_metadata.source_revision,
                &mut cached,
            );
            tracing::info!(
                "perf:image_metadata event=cache_hit cache_hit=true node_id={} source_revision={} storage_version={} width={} height={} gps={}",
                args.node_id,
                source_metadata.source_revision,
                IMAGE_METADATA_CACHE_VERSION,
                cached.width.is_some(),
                cached.height.is_some(),
                cached.gps.is_some(),
            );
            return Ok(cached);
        }
        ImageMetadataCacheLookup::Miss | ImageMetadataCacheLookup::ReadFailed => {}
    }

    let source_read_started = Instant::now();
    let source = load_catalog_download_bytes(adapter, args.node_id)?;
    tracing::info!(
        "perf:image_metadata event=source_read image-metadata:source_read_ms={} node_id={} source_revision={} input_bytes={} source_mime_type={}",
        source_read_started.elapsed().as_millis(),
        args.node_id,
        source_metadata.source_revision,
        source.bytes.len(),
        mime_type.unwrap_or(""),
    );
    if source.bytes.len() > crate::image_preview::DERIVATIVE_MAX_INPUT_BYTES {
        metadata.gps_diagnostic = Some(build_gps_diagnostic(
            "source_too_large",
            CatalogImageGpsDiagnosticParts::default(),
            metadata.import_provenance.as_ref(),
        ));
        tracing::info!(
            "image_metadata skipped_too_large node_id={} source_revision={} input_bytes={} max_bytes={}",
            args.node_id,
            source_metadata.source_revision,
            source.bytes.len(),
            crate::image_preview::DERIVATIVE_MAX_INPUT_BYTES
        );
        return Ok(metadata);
    }

    let parse_started = Instant::now();
    let mut gps_diagnostic = CatalogImageGpsDiagnosticParts::default();
    apply_image_dimensions(&source.bytes, &mut metadata);
    let rust_xmp_diagnostic = apply_exif_metadata(
        &source.bytes,
        &mut metadata,
        Some(ImageMetadataTraceContext {
            node_id: args.node_id,
            source_revision: source_metadata.source_revision,
        }),
    );
    gps_diagnostic.rust_exif_status = rust_xmp_diagnostic.rust_exif_status;
    gps_diagnostic.xmp_status = rust_xmp_diagnostic.xmp_status;
    #[cfg(target_os = "android")]
    {
        gps_diagnostic.android_status = apply_android_image_metadata(
            &source.bytes,
            &mut metadata,
            args.node_id,
            source_metadata.source_revision,
        );
    }
    let parse_ms = parse_started.elapsed().as_millis();
    metadata.gps_diagnostic = Some(build_gps_diagnostic(
        gps_diagnostic_status(&metadata, &gps_diagnostic),
        gps_diagnostic,
        metadata.import_provenance.as_ref(),
    ));

    let outcome = if has_cacheable_image_metadata(&metadata) {
        ImageMetadataCacheOutcome::Ready
    } else {
        ImageMetadataCacheOutcome::Empty
    };
    if cache_write_allowed {
        let cache_write_started = Instant::now();
        if let Err((error, code)) = persist_image_metadata_cache(
            adapter,
            args.node_id,
            source_metadata.source_revision,
            outcome,
            &metadata,
            cancellation_epoch,
        ) {
            tracing::warn!(
                "image_metadata cache_write_failed node_id={} source_revision={} code={:?} error={}",
                args.node_id,
                source_metadata.source_revision,
                code,
                error
            );
        } else {
            tracing::info!(
                "perf:image_metadata event=cache_write image-metadata:cache_write_ms={} node_id={} source_revision={} storage_version={} outcome={:?}",
                cache_write_started.elapsed().as_millis(),
                args.node_id,
                source_metadata.source_revision,
                IMAGE_METADATA_CACHE_VERSION,
                outcome,
            );
        }
    }

    tracing::info!(
        "perf:image_metadata event=parse cache_hit=false image-metadata:parse_ms={} node_id={} source_revision={} input_bytes={} source_mime_type={} outcome={:?} width={} height={} date_taken={} camera={} lens={} gps={}",
        parse_ms,
        args.node_id,
        source_metadata.source_revision,
        source.bytes.len(),
        mime_type.unwrap_or(""),
        outcome,
        metadata.width.is_some(),
        metadata.height.is_some(),
        metadata.date_taken.is_some(),
        metadata.camera_make.is_some() || metadata.camera_model.is_some(),
        metadata.lens_model.is_some(),
        metadata.gps.is_some()
    );
    Ok(metadata)
}

fn load_stored_image_metadata(
    adapter: &Arc<Mutex<Box<dyn crate::CoreAdapter>>>,
    node_id: u64,
    source_revision: u64,
) -> Result<ImageMetadataCacheLookup, CatalogDownloadError> {
    match load_stored_image_metadata_version(
        adapter,
        node_id,
        source_revision,
        IMAGE_METADATA_CACHE_VERSION,
    )? {
        ImageMetadataVersionLookup::Hit(stream) => {
            return Ok(read_image_metadata_cache_payload_v2(
                stream.bytes,
                node_id,
                source_revision,
            ));
        }
        ImageMetadataVersionLookup::Miss => {}
        ImageMetadataVersionLookup::ReadFailed => return Ok(ImageMetadataCacheLookup::ReadFailed),
    }

    Ok(ImageMetadataCacheLookup::Miss)
}

enum ImageMetadataVersionLookup {
    Hit(StreamOut),
    Miss,
    ReadFailed,
}

fn load_stored_image_metadata_version(
    adapter: &Arc<Mutex<Box<dyn crate::CoreAdapter>>>,
    node_id: u64,
    source_revision: u64,
    version: u32,
) -> Result<ImageMetadataVersionLookup, CatalogDownloadError> {
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
                "tier": IMAGE_METADATA_CACHE_TIER,
                "version": version,
            }),
        );
        adapter.handle_with_stream(&req, None)
    };

    match stream_out_from_reply(reply) {
        Ok(stream) => Ok(ImageMetadataVersionLookup::Hit(stream)),
        Err((_, code)) if code.as_deref() == Some("NODE_NOT_FOUND") => {
            Ok(ImageMetadataVersionLookup::Miss)
        }
        Err((error, code)) => {
            tracing::warn!(
                "image_metadata cache_read_failed node_id={} source_revision={} storage_version={} code={:?} error={}",
                node_id,
                source_revision,
                version,
                code,
                error
            );
            Ok(ImageMetadataVersionLookup::ReadFailed)
        }
    }
}

fn read_image_metadata_cache_payload_v2(
    bytes: Vec<u8>,
    node_id: u64,
    source_revision: u64,
) -> ImageMetadataCacheLookup {
    let mut payload = match serde_json::from_slice::<ImageMetadataCachePayloadV2>(&bytes) {
        Ok(payload) => payload,
        Err(error) => {
            tracing::warn!(
                "image_metadata cache_invalid_json node_id={} source_revision={} storage_version={} error={}",
                node_id,
                source_revision,
                IMAGE_METADATA_CACHE_VERSION,
                error
            );
            return ImageMetadataCacheLookup::Miss;
        }
    };
    if payload.source_revision != source_revision {
        tracing::warn!(
            "image_metadata cache_stale_payload node_id={} expected_source_revision={} payload_source_revision={} storage_version={}",
            node_id,
            source_revision,
            payload.source_revision,
            IMAGE_METADATA_CACHE_VERSION,
        );
        return ImageMetadataCacheLookup::Miss;
    }
    if payload.metadata.source_revision.is_none() {
        payload.metadata.source_revision = Some(source_revision);
    }
    if payload.metadata.source_revision != Some(source_revision) {
        tracing::warn!(
            "image_metadata cache_stale_metadata node_id={} expected_source_revision={} payload_source_revision={:?} storage_version={}",
            node_id,
            source_revision,
            payload.metadata.source_revision,
            IMAGE_METADATA_CACHE_VERSION,
        );
        return ImageMetadataCacheLookup::Miss;
    }
    match payload.outcome {
        ImageMetadataCacheOutcome::Ready if has_cacheable_image_metadata(&payload.metadata) => {
            ImageMetadataCacheLookup::Hit(payload.metadata)
        }
        ImageMetadataCacheOutcome::Empty if !has_cacheable_image_metadata(&payload.metadata) => {
            ImageMetadataCacheLookup::Hit(payload.metadata)
        }
        outcome => {
            tracing::warn!(
                "image_metadata cache_outcome_mismatch node_id={} source_revision={} storage_version={} outcome={:?}",
                node_id,
                source_revision,
                IMAGE_METADATA_CACHE_VERSION,
                outcome,
            );
            ImageMetadataCacheLookup::Miss
        }
    }
}

fn persist_image_metadata_cache(
    adapter: &Arc<Mutex<Box<dyn crate::CoreAdapter>>>,
    node_id: u64,
    source_revision: u64,
    outcome: ImageMetadataCacheOutcome,
    metadata: &CatalogImageMetadata,
    cancellation_epoch: Option<&Arc<AtomicU64>>,
) -> Result<(), CatalogDownloadError> {
    let payload = ImageMetadataCachePayloadV2 {
        source_revision,
        outcome,
        metadata: metadata.clone(),
    };
    let bytes = serde_json::to_vec(&payload).map_err(|error| {
        (
            format!("Failed to serialize image metadata cache: {error}"),
            Some("INTERNAL".to_string()),
        )
    })?;
    let stream = StreamOut {
        meta: RpcStreamMeta {
            name: "image-metadata.json".to_string(),
            mime_type: IMAGE_METADATA_CACHE_MIME.to_string(),
            size: bytes.len() as u64,
            chunk_size: IMAGE_METADATA_CACHE_CHUNK_SIZE,
        },
        bytes,
    };
    super::derivatives::persist_local_or_adapter_derivative_stream(
        adapter,
        node_id,
        source_revision,
        IMAGE_METADATA_CACHE_TIER,
        IMAGE_METADATA_CACHE_VERSION,
        &stream,
        cancellation_epoch,
    )
}

fn load_image_import_provenance_best_effort(
    adapter: &Arc<Mutex<Box<dyn crate::CoreAdapter>>>,
    node_id: u64,
    source_revision: u64,
) -> Option<CatalogImageImportProvenance> {
    match load_image_import_provenance(adapter, node_id, source_revision) {
        Ok(provenance) => provenance,
        Err((error, code)) => {
            tracing::warn!(
                "image_metadata import_provenance_read_failed node_id={} source_revision={} code={:?} error={}",
                node_id,
                source_revision,
                code,
                error
            );
            None
        }
    }
}

fn overlay_image_import_provenance(
    adapter: &Arc<Mutex<Box<dyn crate::CoreAdapter>>>,
    node_id: u64,
    source_revision: u64,
    metadata: &mut CatalogImageMetadata,
) {
    if metadata.import_provenance.is_some() {
        return;
    }
    metadata.import_provenance =
        load_image_import_provenance_best_effort(adapter, node_id, source_revision);
    let Some(diagnostic) = metadata.gps_diagnostic.as_mut() else {
        return;
    };
    if diagnostic.import_provenance_status.is_none() {
        diagnostic.import_provenance_status = metadata
            .import_provenance
            .as_ref()
            .map(classify_import_provenance_status)
            .map(str::to_string);
    }
}

fn build_gps_diagnostic(
    status: &str,
    parts: CatalogImageGpsDiagnosticParts,
    import_provenance: Option<&CatalogImageImportProvenance>,
) -> CatalogImageGpsDiagnostic {
    CatalogImageGpsDiagnostic {
        status: status.to_string(),
        rust_exif_status: parts.rust_exif_status,
        xmp_status: parts.xmp_status,
        android_status: parts.android_status,
        import_provenance_status: import_provenance
            .map(classify_import_provenance_status)
            .map(str::to_string),
    }
}

fn gps_diagnostic_status(
    metadata: &CatalogImageMetadata,
    parts: &CatalogImageGpsDiagnosticParts,
) -> &'static str {
    if metadata.gps.is_some() {
        return "available";
    }
    if [
        parts.rust_exif_status.as_deref(),
        parts.xmp_status.as_deref(),
        parts.android_status.as_deref(),
    ]
    .into_iter()
    .flatten()
    .any(is_invalid_gps_status)
    {
        return "invalid";
    }
    if metadata.width.is_none()
        && metadata.height.is_none()
        && parts.rust_exif_status.as_deref() == Some("read_failed")
        && parts
            .xmp_status
            .as_deref()
            .is_none_or(|status| status == "no_packet")
        && parts.android_status.is_none()
    {
        return "extractor_failed";
    }
    "not_found"
}

fn is_invalid_gps_status(status: &str) -> bool {
    matches!(
        status,
        "zero_denominator"
            | "too_few_values"
            | "unsupported_kind"
            | "not_parsed"
            | "non_finite"
            | "out_of_range"
            | "zero_zero"
    )
}

fn classify_import_provenance_status(provenance: &CatalogImageImportProvenance) -> &'static str {
    if !provenance.image_candidate {
        return "not_applicable";
    }
    if provenance.permission_status == "not_required" || provenance.original_stream_used {
        return "preserved";
    }
    if provenance.permission_status == "denied"
        || provenance.regular_stream_fallback
        || (provenance.require_original_status.starts_with("attempted_")
            && provenance.require_original_status != "attempted_used")
    {
        return "at_risk";
    }
    "unknown"
}

fn has_cacheable_image_metadata(metadata: &CatalogImageMetadata) -> bool {
    metadata.width.is_some()
        || metadata.height.is_some()
        || metadata.date_taken.is_some()
        || metadata.camera_make.is_some()
        || metadata.camera_model.is_some()
        || metadata.lens_model.is_some()
        || metadata.exposure_time.is_some()
        || metadata.aperture.is_some()
        || metadata.iso.is_some()
        || metadata.focal_length.is_some()
        || metadata.orientation.is_some()
        || metadata.gps.is_some()
}

#[cfg(test)]
fn extract_image_metadata_for_tests(bytes: &[u8]) -> CatalogImageMetadata {
    let mut metadata = CatalogImageMetadata::default();
    apply_image_dimensions(bytes, &mut metadata);
    let diagnostic = apply_exif_metadata(bytes, &mut metadata, None);
    metadata.gps_diagnostic = Some(build_gps_diagnostic(
        gps_diagnostic_status(&metadata, &diagnostic),
        diagnostic,
        metadata.import_provenance.as_ref(),
    ));
    metadata
}

#[derive(Debug, Clone, Copy)]
struct ImageMetadataTraceContext {
    node_id: u64,
    source_revision: u64,
}

fn apply_image_dimensions(bytes: &[u8], metadata: &mut CatalogImageMetadata) {
    let reader = match ImageReader::new(Cursor::new(bytes)).with_guessed_format() {
        Ok(reader) => reader,
        Err(_) => return,
    };
    let decoder = match reader.into_decoder() {
        Ok(decoder) => decoder,
        Err(_) => return,
    };
    let (width, height) = decoder.dimensions();
    metadata.width.get_or_insert(width);
    metadata.height.get_or_insert(height);
}

fn apply_exif_metadata(
    bytes: &[u8],
    metadata: &mut CatalogImageMetadata,
    trace: Option<ImageMetadataTraceContext>,
) -> CatalogImageGpsDiagnosticParts {
    let mut cursor = Cursor::new(bytes);
    let exif = match exif::Reader::new().read_from_container(&mut cursor) {
        Ok(exif) => exif,
        Err(error) => {
            if let Some(trace) = trace {
                tracing::info!(
                    "image_metadata rust_exif_probe node_id={} source_revision={} status=read_failed error={}",
                    trace.node_id,
                    trace.source_revision,
                    error,
                );
            }
            return CatalogImageGpsDiagnosticParts {
                rust_exif_status: Some("read_failed".to_string()),
                xmp_status: Some(apply_xmp_metadata(bytes, metadata, trace)),
                android_status: None,
            };
        }
    };

    metadata.width = metadata
        .width
        .or_else(|| field_u32(&exif, Tag::PixelXDimension))
        .or_else(|| field_u32(&exif, Tag::ImageWidth));
    metadata.height = metadata
        .height
        .or_else(|| field_u32(&exif, Tag::PixelYDimension))
        .or_else(|| field_u32(&exif, Tag::ImageLength));
    if metadata.date_taken.is_none() {
        metadata.date_taken = field_ascii(&exif, Tag::DateTimeOriginal)
            .as_deref()
            .and_then(normalize_exif_datetime);
    }
    metadata.camera_make = metadata
        .camera_make
        .take()
        .or_else(|| field_ascii(&exif, Tag::Make));
    metadata.camera_model = metadata
        .camera_model
        .take()
        .or_else(|| field_ascii(&exif, Tag::Model));
    metadata.lens_model = metadata
        .lens_model
        .take()
        .or_else(|| field_ascii(&exif, Tag::LensModel));
    metadata.exposure_time = metadata
        .exposure_time
        .take()
        .or_else(|| field_display(&exif, Tag::ExposureTime));
    metadata.aperture = metadata
        .aperture
        .take()
        .or_else(|| field_display(&exif, Tag::FNumber));
    metadata.iso = metadata.iso.or_else(|| {
        field_u32(&exif, Tag::PhotographicSensitivity).or_else(|| field_u32(&exif, Tag::ISOSpeed))
    });
    metadata.focal_length = metadata
        .focal_length
        .take()
        .or_else(|| field_display(&exif, Tag::FocalLength));
    metadata.orientation = metadata
        .orientation
        .take()
        .or_else(|| orientation_label(field_u32(&exif, Tag::Orientation)));
    let rust_gps = gps_metadata(&exif);
    let rust_exif_status = rust_exif_gps_status(&exif, rust_gps.is_some()).to_string();
    if let Some(trace) = trace {
        log_rust_exif_probe(&exif, trace, rust_gps.is_some());
    }
    metadata.gps = metadata.gps.take().or(rust_gps);
    CatalogImageGpsDiagnosticParts {
        rust_exif_status: Some(rust_exif_status),
        xmp_status: Some(apply_xmp_metadata(bytes, metadata, trace)),
        android_status: None,
    }
}

#[cfg(target_os = "android")]
fn apply_android_image_metadata(
    bytes: &[u8],
    metadata: &mut CatalogImageMetadata,
    node_id: u64,
    source_revision: u64,
) -> Option<String> {
    let payload = match crate::mobile::android::extract_image_metadata_json(bytes) {
        Ok(Some(payload)) => payload,
        Ok(None) => return None,
        Err(error) => {
            tracing::warn!("image_metadata android_native_failed error={error}");
            return Some("extractor_failed".to_string());
        }
    };

    let payload_value = match serde_json::from_str::<serde_json::Value>(&payload) {
        Ok(payload_value) => payload_value,
        Err(error) => {
            tracing::warn!("image_metadata android_native_invalid_json error={error}");
            return Some("extractor_failed".to_string());
        }
    };
    let android_status = android_gps_probe_status(&payload_value);
    tracing::info!(
        "image_metadata android_native_payload node_id={} source_revision={} fields={} width={} height={} date_taken={} camera={} lens={} gps={} gps_status={}",
        node_id,
        source_revision,
        json_object_len(&payload_value),
        json_has_field(&payload_value, "width"),
        json_has_field(&payload_value, "height"),
        json_has_field(&payload_value, "dateTaken"),
        json_has_field(&payload_value, "cameraMake") || json_has_field(&payload_value, "cameraModel"),
        json_has_field(&payload_value, "lensModel"),
        json_has_field(&payload_value, "gps"),
        android_status.as_deref().unwrap_or("not_found"),
    );

    match serde_json::from_value::<CatalogImageMetadata>(payload_value) {
        Ok(android_metadata) => merge_missing_metadata(metadata, android_metadata),
        Err(error) => tracing::warn!("image_metadata android_native_invalid_json error={error}"),
    }
    android_status
}

fn log_rust_exif_probe(exif: &Exif, trace: ImageMetadataTraceContext, gps: bool) {
    let status = rust_exif_gps_status(exif, gps);
    let latitude = gps_coordinate_parse(exif, Tag::GPSLatitude, Tag::GPSLatitudeRef);
    let longitude = gps_coordinate_parse(exif, Tag::GPSLongitude, Tag::GPSLongitudeRef);
    let gps_usefulness = match (latitude.value(), longitude.value()) {
        (Some(latitude), Some(longitude)) => {
            gps_coordinate_usefulness(latitude, longitude).status()
        }
        _ => "not_parsed",
    };
    tracing::info!(
        "image_metadata rust_exif_probe node_id={} source_revision={} status={} fields={} width_tag={} height_tag={} date_taken_tag={} camera_tag={} gps_lat_tag={} gps_lat_kind={} gps_lat_count={} gps_lat_ref={} gps_lat_status={} gps_lon_tag={} gps_lon_kind={} gps_lon_count={} gps_lon_ref={} gps_lon_status={} gps_usefulness={} gps_alt_tag={} gps={}",
        trace.node_id,
        trace.source_revision,
        status,
        exif.fields().count(),
        first_field(exif, Tag::PixelXDimension).is_some() || first_field(exif, Tag::ImageWidth).is_some(),
        first_field(exif, Tag::PixelYDimension).is_some() || first_field(exif, Tag::ImageLength).is_some(),
        first_field(exif, Tag::DateTimeOriginal).is_some(),
        first_field(exif, Tag::Make).is_some() || first_field(exif, Tag::Model).is_some(),
        first_field(exif, Tag::GPSLatitude).is_some(),
        field_value_kind(exif, Tag::GPSLatitude),
        field_value_count(exif, Tag::GPSLatitude),
        first_field(exif, Tag::GPSLatitudeRef).is_some(),
        latitude.status(),
        first_field(exif, Tag::GPSLongitude).is_some(),
        field_value_kind(exif, Tag::GPSLongitude),
        field_value_count(exif, Tag::GPSLongitude),
        first_field(exif, Tag::GPSLongitudeRef).is_some(),
        longitude.status(),
        gps_usefulness,
        first_field(exif, Tag::GPSAltitude).is_some(),
        gps,
    );
}

fn rust_exif_gps_status(exif: &Exif, gps: bool) -> &'static str {
    if gps {
        return "ok";
    }
    let latitude = gps_coordinate_parse(exif, Tag::GPSLatitude, Tag::GPSLatitudeRef);
    let longitude = gps_coordinate_parse(exif, Tag::GPSLongitude, Tag::GPSLongitudeRef);
    match (latitude.value(), longitude.value()) {
        (Some(latitude), Some(longitude)) => {
            gps_coordinate_usefulness(latitude, longitude).status()
        }
        _ if first_field(exif, Tag::GPSLatitude).is_none()
            && first_field(exif, Tag::GPSLongitude).is_none() =>
        {
            "not_found"
        }
        _ if matches!(
            latitude,
            GpsCoordinateParse::ZeroDenominator
                | GpsCoordinateParse::TooFewValues
                | GpsCoordinateParse::UnsupportedKind
        ) =>
        {
            latitude.status()
        }
        _ if matches!(
            longitude,
            GpsCoordinateParse::ZeroDenominator
                | GpsCoordinateParse::TooFewValues
                | GpsCoordinateParse::UnsupportedKind
        ) =>
        {
            longitude.status()
        }
        _ => "not_parsed",
    }
}

fn field_value_kind(exif: &Exif, tag: Tag) -> &'static str {
    let Some(field) = first_field(exif, tag) else {
        return "none";
    };
    match &field.value {
        Value::Byte(_) => "byte",
        Value::Ascii(_) => "ascii",
        Value::Short(_) => "short",
        Value::Long(_) => "long",
        Value::Rational(_) => "rational",
        Value::SByte(_) => "sbyte",
        Value::Undefined(_, _) => "undefined",
        Value::SShort(_) => "sshort",
        Value::SLong(_) => "slong",
        Value::SRational(_) => "srational",
        Value::Float(_) => "float",
        Value::Double(_) => "double",
        _ => "other",
    }
}

fn field_value_count(exif: &Exif, tag: Tag) -> usize {
    let Some(field) = first_field(exif, tag) else {
        return 0;
    };
    match &field.value {
        Value::Byte(values) => values.len(),
        Value::Ascii(values) => values.len(),
        Value::Short(values) => values.len(),
        Value::Long(values) => values.len(),
        Value::Rational(values) => values.len(),
        Value::SByte(values) => values.len(),
        Value::Undefined(values, _) => values.len(),
        Value::SShort(values) => values.len(),
        Value::SLong(values) => values.len(),
        Value::SRational(values) => values.len(),
        Value::Float(values) => values.len(),
        Value::Double(values) => values.len(),
        _ => 0,
    }
}

fn apply_xmp_metadata(
    bytes: &[u8],
    metadata: &mut CatalogImageMetadata,
    trace: Option<ImageMetadataTraceContext>,
) -> String {
    let probe = xmp_gps_probe(bytes);
    let status = probe.status().to_string();
    if let Some(trace) = trace {
        tracing::info!(
            "image_metadata xmp_gps_probe node_id={} source_revision={} packet={} gps_lat_tag={} gps_lon_tag={} gps_status={}",
            trace.node_id,
            trace.source_revision,
            probe.packet_found,
            probe.latitude.is_some(),
            probe.longitude.is_some(),
            status,
        );
    }
    metadata.gps = metadata.gps.take().or_else(|| probe.into_metadata());
    status
}

#[derive(Debug, Clone, Default)]
struct XmpGpsProbe {
    packet_found: bool,
    latitude: Option<String>,
    longitude: Option<String>,
    altitude: Option<String>,
    altitude_ref: Option<String>,
}

impl XmpGpsProbe {
    fn status(&self) -> &'static str {
        match self.coordinates() {
            Some((latitude, longitude)) => gps_coordinate_usefulness(latitude, longitude).status(),
            None if self.latitude.is_some() || self.longitude.is_some() => "not_parsed",
            None if self.packet_found => "missing",
            None => "no_packet",
        }
    }

    fn into_metadata(self) -> Option<CatalogImageGpsMetadata> {
        let (latitude, longitude) = self.coordinates()?;
        if !is_useful_gps_coordinate(latitude, longitude) {
            return None;
        }
        Some(CatalogImageGpsMetadata {
            latitude,
            longitude,
            altitude_meters: self.altitude_meters(),
        })
    }

    fn coordinates(&self) -> Option<(f64, f64)> {
        let latitude = xmp_gps_coordinate(self.latitude.as_deref()?)?;
        let longitude = xmp_gps_coordinate(self.longitude.as_deref()?)?;
        Some((latitude, longitude))
    }

    fn altitude_meters(&self) -> Option<f64> {
        let mut altitude = xmp_decimal_or_fraction(self.altitude.as_deref()?)?;
        if matches!(self.altitude_ref.as_deref().map(str::trim), Some("1")) {
            altitude = -altitude;
        }
        Some(altitude)
    }
}

#[derive(Debug, Clone, Copy)]
enum XmpGpsField {
    Latitude,
    Longitude,
    Altitude,
    AltitudeRef,
}

fn xmp_gps_probe(bytes: &[u8]) -> XmpGpsProbe {
    let Some(packet) = xmp_packet(bytes) else {
        return XmpGpsProbe::default();
    };

    let mut probe = XmpGpsProbe {
        packet_found: true,
        ..XmpGpsProbe::default()
    };
    let mut reader = XmlReader::from_reader(Cursor::new(packet));
    reader.config_mut().trim_text(true);
    let mut buffer = Vec::new();
    let mut active_field = None;

    loop {
        match reader.read_event_into(&mut buffer) {
            Ok(Event::Start(element)) => {
                active_field = xmp_gps_field(element.name().as_ref());
                read_xmp_gps_attributes(&reader, &element, &mut probe);
            }
            Ok(Event::Empty(element)) => {
                read_xmp_gps_attributes(&reader, &element, &mut probe);
            }
            Ok(Event::Text(text)) => {
                if let Some(field) = active_field {
                    if let Ok(value) = text.decode() {
                        set_xmp_gps_field(&mut probe, field, value.trim());
                    }
                }
            }
            Ok(Event::End(_)) => {
                active_field = None;
            }
            Ok(Event::Eof) => break,
            Err(_) => break,
            _ => {}
        }
        buffer.clear();
    }

    probe
}

fn read_xmp_gps_attributes(
    reader: &XmlReader<Cursor<&[u8]>>,
    element: &quick_xml::events::BytesStart<'_>,
    probe: &mut XmpGpsProbe,
) {
    for attribute in element.attributes().flatten() {
        let Some(field) = xmp_gps_field(attribute.key.as_ref()) else {
            continue;
        };
        if let Ok(value) = attribute.decode_and_unescape_value(reader.decoder()) {
            set_xmp_gps_field(probe, field, value.trim());
        }
    }
}

fn set_xmp_gps_field(probe: &mut XmpGpsProbe, field: XmpGpsField, value: &str) {
    let value = value.trim();
    if value.is_empty() {
        return;
    }
    match field {
        XmpGpsField::Latitude => probe.latitude.get_or_insert_with(|| value.to_string()),
        XmpGpsField::Longitude => probe.longitude.get_or_insert_with(|| value.to_string()),
        XmpGpsField::Altitude => probe.altitude.get_or_insert_with(|| value.to_string()),
        XmpGpsField::AltitudeRef => probe.altitude_ref.get_or_insert_with(|| value.to_string()),
    };
}

fn xmp_gps_field(name: &[u8]) -> Option<XmpGpsField> {
    if xml_name_matches(name, "GPSLatitude") {
        return Some(XmpGpsField::Latitude);
    }
    if xml_name_matches(name, "GPSLongitude") {
        return Some(XmpGpsField::Longitude);
    }
    if xml_name_matches(name, "GPSAltitude") {
        return Some(XmpGpsField::Altitude);
    }
    if xml_name_matches(name, "GPSAltitudeRef") {
        return Some(XmpGpsField::AltitudeRef);
    }
    None
}

fn xml_name_matches(name: &[u8], suffix: &str) -> bool {
    let suffix = suffix.as_bytes();
    if name == suffix {
        return true;
    }
    name.len() > suffix.len()
        && name.ends_with(suffix)
        && name[name.len() - suffix.len() - 1] == b':'
}

fn xmp_packet(bytes: &[u8]) -> Option<&[u8]> {
    let start = find_bytes(bytes, b"<x:xmpmeta")
        .or_else(|| find_bytes(bytes, b"<xmpmeta"))
        .or_else(|| find_bytes(bytes, b"<rdf:RDF"))?;
    let end_marker = if bytes[start..].starts_with(b"<rdf:RDF") {
        b"</rdf:RDF>".as_slice()
    } else if bytes[start..].starts_with(b"<xmpmeta") {
        b"</xmpmeta>".as_slice()
    } else {
        b"</x:xmpmeta>".as_slice()
    };
    let relative_end = find_bytes(&bytes[start..], end_marker)?;
    let end = start + relative_end + end_marker.len();
    Some(&bytes[start..end])
}

fn find_bytes(haystack: &[u8], needle: &[u8]) -> Option<usize> {
    haystack
        .windows(needle.len())
        .position(|window| window == needle)
}

fn xmp_gps_coordinate(value: &str) -> Option<f64> {
    let text = value.trim();
    if text.is_empty() {
        return None;
    }

    let (coordinate, reference) = match text.as_bytes().last().copied() {
        Some(reference @ (b'N' | b'n' | b'S' | b's' | b'E' | b'e' | b'W' | b'w')) => (
            &text[..text.len() - 1],
            Some(reference.to_ascii_uppercase()),
        ),
        _ => (text, None),
    };
    let coordinate = coordinate.trim();
    let mut value = if coordinate.contains(',') {
        let parts = coordinate.split(',').map(str::trim).collect::<Vec<_>>();
        let degrees = xmp_decimal_or_fraction(parts.first().copied()?)?;
        let minutes = parts
            .get(1)
            .and_then(|value| xmp_decimal_or_fraction(value))
            .unwrap_or(0.0);
        let seconds = parts
            .get(2)
            .and_then(|value| xmp_decimal_or_fraction(value))
            .unwrap_or(0.0);
        degrees + minutes / 60.0 + seconds / 3600.0
    } else {
        xmp_decimal_or_fraction(coordinate)?
    };

    if matches!(reference, Some(b'S' | b'W')) {
        value = -value;
    }
    Some(value)
}

fn xmp_decimal_or_fraction(value: &str) -> Option<f64> {
    let value = value.trim();
    if value.is_empty() {
        return None;
    }
    let Some((numerator, denominator)) = value.split_once('/') else {
        return value.parse::<f64>().ok();
    };
    let numerator = numerator.trim().parse::<f64>().ok()?;
    let denominator = denominator.trim().parse::<f64>().ok()?;
    if denominator == 0.0 {
        return None;
    }
    Some(numerator / denominator)
}

#[cfg(target_os = "android")]
fn json_object_len(value: &serde_json::Value) -> usize {
    value.as_object().map_or(0, |object| object.len())
}

#[cfg(target_os = "android")]
fn json_has_field(value: &serde_json::Value, key: &str) -> bool {
    value.get(key).is_some_and(|value| !value.is_null())
}

#[cfg(target_os = "android")]
fn android_gps_probe_status(value: &serde_json::Value) -> Option<String> {
    value
        .get("gpsProbe")
        .and_then(|probe| probe.get("selectedStatus"))
        .and_then(|status| status.as_str())
        .map(str::to_string)
}

#[cfg(any(target_os = "android", test))]
fn merge_missing_metadata(target: &mut CatalogImageMetadata, source: CatalogImageMetadata) {
    target.width = target.width.or(source.width);
    target.height = target.height.or(source.height);
    target.date_taken = target.date_taken.take().or(source.date_taken);
    target.camera_make = target.camera_make.take().or(source.camera_make);
    target.camera_model = target.camera_model.take().or(source.camera_model);
    target.lens_model = target.lens_model.take().or(source.lens_model);
    target.exposure_time = target.exposure_time.take().or(source.exposure_time);
    target.aperture = target.aperture.take().or(source.aperture);
    target.iso = target.iso.or(source.iso);
    target.focal_length = target.focal_length.take().or(source.focal_length);
    target.orientation = target.orientation.take().or(source.orientation);
    target.gps = target.gps.take().or(source.gps);
}

fn first_field(exif: &Exif, tag: Tag) -> Option<&Field> {
    exif.fields().find(|field| field.tag == tag)
}

fn field_ascii(exif: &Exif, tag: Tag) -> Option<String> {
    let field = first_field(exif, tag)?;
    let Value::Ascii(values) = &field.value else {
        return None;
    };

    values.iter().find_map(|value| {
        let text = String::from_utf8_lossy(value)
            .trim_matches(char::from(0))
            .trim()
            .to_string();
        if text.is_empty() {
            None
        } else {
            Some(text)
        }
    })
}

fn field_u32(exif: &Exif, tag: Tag) -> Option<u32> {
    first_field(exif, tag).and_then(|field| field.value.get_uint(0))
}

fn field_display(exif: &Exif, tag: Tag) -> Option<String> {
    let field = first_field(exif, tag)?;
    let value = field.display_value().with_unit(exif).to_string();
    if value.trim().is_empty() {
        None
    } else {
        Some(value)
    }
}

fn normalize_exif_datetime(value: &str) -> Option<String> {
    let value = value.trim();
    if value.len() < 19 {
        return if value.is_empty() {
            None
        } else {
            Some(value.to_string())
        };
    }

    let bytes = value.as_bytes();
    if bytes.get(4) == Some(&b':') && bytes.get(7) == Some(&b':') {
        return Some(format!(
            "{}-{}-{}T{}",
            &value[0..4],
            &value[5..7],
            &value[8..10],
            &value[11..19]
        ));
    }

    Some(value.to_string())
}

fn orientation_label(value: Option<u32>) -> Option<String> {
    value.map(|orientation| match orientation {
        1 => "Normal".to_string(),
        2 => "Mirrored horizontally".to_string(),
        3 => "Rotated 180".to_string(),
        4 => "Mirrored vertically".to_string(),
        5 => "Mirrored horizontally, rotated 270".to_string(),
        6 => "Rotated 90".to_string(),
        7 => "Mirrored horizontally, rotated 90".to_string(),
        8 => "Rotated 270".to_string(),
        other => other.to_string(),
    })
}

fn gps_metadata(exif: &Exif) -> Option<CatalogImageGpsMetadata> {
    let latitude = gps_coordinate(exif, Tag::GPSLatitude, Tag::GPSLatitudeRef)?;
    let longitude = gps_coordinate(exif, Tag::GPSLongitude, Tag::GPSLongitudeRef)?;
    if !is_useful_gps_coordinate(latitude, longitude) {
        return None;
    }

    Some(CatalogImageGpsMetadata {
        latitude,
        longitude,
        altitude_meters: gps_altitude(exif),
    })
}

fn gps_coordinate(exif: &Exif, value_tag: Tag, reference_tag: Tag) -> Option<f64> {
    gps_coordinate_parse(exif, value_tag, reference_tag).value()
}

#[derive(Debug, Clone, Copy)]
enum GpsCoordinateParse {
    Parsed(f64),
    Missing,
    UnsupportedKind,
    TooFewValues,
    ZeroDenominator,
}

impl GpsCoordinateParse {
    fn value(self) -> Option<f64> {
        match self {
            Self::Parsed(value) => Some(value),
            Self::Missing | Self::UnsupportedKind | Self::TooFewValues | Self::ZeroDenominator => {
                None
            }
        }
    }

    fn status(self) -> &'static str {
        match self {
            Self::Parsed(_) => "parsed",
            Self::Missing => "missing",
            Self::UnsupportedKind => "unsupported_kind",
            Self::TooFewValues => "too_few_values",
            Self::ZeroDenominator => "zero_denominator",
        }
    }
}

fn gps_coordinate_parse(exif: &Exif, value_tag: Tag, reference_tag: Tag) -> GpsCoordinateParse {
    let Some(field) = first_field(exif, value_tag) else {
        return GpsCoordinateParse::Missing;
    };
    let coordinate = match &field.value {
        Value::Rational(values) => gps_coordinate_from_rationals(values),
        Value::SRational(values) => gps_coordinate_from_signed_rationals(values),
        _ => return GpsCoordinateParse::UnsupportedKind,
    };
    let GpsCoordinateParse::Parsed(mut coordinate) = coordinate else {
        return coordinate;
    };

    let reference = field_ascii(exif, reference_tag).unwrap_or_default();
    if reference.eq_ignore_ascii_case("S") || reference.eq_ignore_ascii_case("W") {
        coordinate = -coordinate;
    }
    GpsCoordinateParse::Parsed(coordinate)
}

fn gps_coordinate_from_rationals(values: &[exif::Rational]) -> GpsCoordinateParse {
    if values.len() < 3 {
        return GpsCoordinateParse::TooFewValues;
    }

    let Some(degrees) = rational_to_f64(values[0]) else {
        return GpsCoordinateParse::ZeroDenominator;
    };
    let Some(minutes) = rational_to_f64(values[1]) else {
        return GpsCoordinateParse::ZeroDenominator;
    };
    let Some(seconds) = rational_to_f64(values[2]) else {
        return GpsCoordinateParse::ZeroDenominator;
    };
    GpsCoordinateParse::Parsed(degrees + minutes / 60.0 + seconds / 3600.0)
}

fn gps_coordinate_from_signed_rationals(values: &[exif::SRational]) -> GpsCoordinateParse {
    if values.len() < 3 {
        return GpsCoordinateParse::TooFewValues;
    }

    let Some(degrees) = signed_rational_to_f64(values[0]) else {
        return GpsCoordinateParse::ZeroDenominator;
    };
    let Some(minutes) = signed_rational_to_f64(values[1]) else {
        return GpsCoordinateParse::ZeroDenominator;
    };
    let Some(seconds) = signed_rational_to_f64(values[2]) else {
        return GpsCoordinateParse::ZeroDenominator;
    };
    GpsCoordinateParse::Parsed(degrees + minutes / 60.0 + seconds / 3600.0)
}

fn gps_altitude(exif: &Exif) -> Option<f64> {
    let field = first_field(exif, Tag::GPSAltitude)?;
    let mut altitude = match &field.value {
        Value::Rational(values) => rational_to_f64(*values.first()?)?,
        Value::SRational(values) => signed_rational_to_f64(*values.first()?)?,
        _ => return None,
    };
    if matches!(field_u32(exif, Tag::GPSAltitudeRef), Some(1)) {
        altitude = -altitude;
    }
    Some(altitude)
}

fn rational_to_f64(value: exif::Rational) -> Option<f64> {
    if value.denom == 0 {
        return None;
    }

    Some(value.num as f64 / value.denom as f64)
}

fn signed_rational_to_f64(value: exif::SRational) -> Option<f64> {
    if value.denom == 0 {
        return None;
    }

    Some(value.num as f64 / value.denom as f64)
}

fn is_useful_gps_coordinate(latitude: f64, longitude: f64) -> bool {
    matches!(
        gps_coordinate_usefulness(latitude, longitude),
        GpsCoordinateUsefulness::Useful
    )
}

#[derive(Debug, Clone, Copy, PartialEq, Eq)]
enum GpsCoordinateUsefulness {
    Useful,
    NonFinite,
    OutOfRange,
    ZeroZero,
}

impl GpsCoordinateUsefulness {
    fn status(self) -> &'static str {
        match self {
            Self::Useful => "ok",
            Self::NonFinite => "non_finite",
            Self::OutOfRange => "out_of_range",
            Self::ZeroZero => "zero_zero",
        }
    }
}

fn gps_coordinate_usefulness(latitude: f64, longitude: f64) -> GpsCoordinateUsefulness {
    if !latitude.is_finite() || !longitude.is_finite() {
        return GpsCoordinateUsefulness::NonFinite;
    }
    if !(-90.0..=90.0).contains(&latitude) || !(-180.0..=180.0).contains(&longitude) {
        return GpsCoordinateUsefulness::OutOfRange;
    }
    if latitude == 0.0 && longitude == 0.0 {
        return GpsCoordinateUsefulness::ZeroZero;
    }
    GpsCoordinateUsefulness::Useful
}

#[cfg(test)]
mod tests {
    use super::*;

    const TIFF_IFD0_OFFSET: u32 = 8;

    struct TestIfdEntry {
        tag: u16,
        field_type: u16,
        count: u32,
        value: Vec<u8>,
    }

    fn ascii_entry(tag: u16, value: &str) -> TestIfdEntry {
        let mut bytes = value.as_bytes().to_vec();
        bytes.push(0);
        TestIfdEntry {
            tag,
            field_type: 2,
            count: bytes.len() as u32,
            value: bytes,
        }
    }

    fn short_entry(tag: u16, value: u16) -> TestIfdEntry {
        let mut bytes = value.to_be_bytes().to_vec();
        bytes.extend_from_slice(&[0, 0]);
        TestIfdEntry {
            tag,
            field_type: 3,
            count: 1,
            value: bytes,
        }
    }

    fn byte_entry(tag: u16, value: u8) -> TestIfdEntry {
        TestIfdEntry {
            tag,
            field_type: 1,
            count: 1,
            value: vec![value, 0, 0, 0],
        }
    }

    fn long_entry(tag: u16, value: u32) -> TestIfdEntry {
        TestIfdEntry {
            tag,
            field_type: 4,
            count: 1,
            value: value.to_be_bytes().to_vec(),
        }
    }

    fn rational_entry(tag: u16, values: &[(u32, u32)]) -> TestIfdEntry {
        let mut bytes = Vec::new();
        for (num, denom) in values {
            bytes.extend_from_slice(&num.to_be_bytes());
            bytes.extend_from_slice(&denom.to_be_bytes());
        }

        TestIfdEntry {
            tag,
            field_type: 5,
            count: values.len() as u32,
            value: bytes,
        }
    }

    fn srational_entry(tag: u16, values: &[(i32, i32)]) -> TestIfdEntry {
        let mut bytes = Vec::new();
        for (num, denom) in values {
            bytes.extend_from_slice(&num.to_be_bytes());
            bytes.extend_from_slice(&denom.to_be_bytes());
        }

        TestIfdEntry {
            tag,
            field_type: 10,
            count: values.len() as u32,
            value: bytes,
        }
    }

    fn inline_ascii_ref_entry(tag: u16, value: u8) -> TestIfdEntry {
        TestIfdEntry {
            tag,
            field_type: 2,
            count: 2,
            value: vec![value, 0, 0, 0],
        }
    }

    fn ifd_size(entry_count: usize) -> u32 {
        2 + entry_count as u32 * 12 + 4
    }

    fn write_ifd(
        tiff: &mut Vec<u8>,
        data: &mut Vec<u8>,
        data_offset: &mut u32,
        entries: &[TestIfdEntry],
    ) {
        tiff.extend_from_slice(&(entries.len() as u16).to_be_bytes());
        for entry in entries {
            tiff.extend_from_slice(&entry.tag.to_be_bytes());
            tiff.extend_from_slice(&entry.field_type.to_be_bytes());
            tiff.extend_from_slice(&entry.count.to_be_bytes());

            if entry.value.len() <= 4 {
                let mut inline = [0u8; 4];
                inline[..entry.value.len()].copy_from_slice(&entry.value);
                tiff.extend_from_slice(&inline);
            } else {
                tiff.extend_from_slice(&data_offset.to_be_bytes());
                data.extend_from_slice(&entry.value);
                *data_offset += entry.value.len() as u32;
            }
        }
        tiff.extend_from_slice(&0u32.to_be_bytes());
    }

    fn build_exif_jpeg() -> Vec<u8> {
        build_exif_jpeg_with_gps(&[(55, 1), (45, 1), (30, 1)], &[(37, 1), (37, 1), (2, 1)])
    }

    fn insert_xmp_app1_segment(jpeg: &mut Vec<u8>, xmp: &str) {
        let mut payload = b"http://ns.adobe.com/xap/1.0/\0".to_vec();
        payload.extend_from_slice(xmp.as_bytes());

        let app1_len = u16::try_from(payload.len() + 2).expect("test xmp length fits u16");
        let mut segment = vec![0xff, 0xe1];
        segment.extend_from_slice(&app1_len.to_be_bytes());
        segment.extend_from_slice(&payload);
        jpeg.splice(2..2, segment);
    }

    fn build_exif_jpeg_with_gps(latitude: &[(u32, u32)], longitude: &[(u32, u32)]) -> Vec<u8> {
        build_exif_jpeg_with_gps_entries(
            rational_entry(0x0002, latitude),
            rational_entry(0x0004, longitude),
        )
    }

    fn build_exif_jpeg_with_signed_gps(
        latitude: &[(i32, i32)],
        longitude: &[(i32, i32)],
    ) -> Vec<u8> {
        build_exif_jpeg_with_gps_entries(
            srational_entry(0x0002, latitude),
            srational_entry(0x0004, longitude),
        )
    }

    fn build_exif_jpeg_with_gps_entries(
        latitude_entry: TestIfdEntry,
        longitude_entry: TestIfdEntry,
    ) -> Vec<u8> {
        let mut jpeg = Vec::new();
        let image = image::RgbImage::from_fn(32, 18, |_x, _y| image::Rgb([120, 80, 40]));
        image
            .write_to(&mut Cursor::new(&mut jpeg), image::ImageFormat::Jpeg)
            .expect("jpeg should encode");

        let ifd0_entries = 5;
        let exif_entries = 8;
        let gps_entries = 6;
        let exif_ifd_offset = TIFF_IFD0_OFFSET + ifd_size(ifd0_entries);
        let gps_ifd_offset = exif_ifd_offset + ifd_size(exif_entries);
        let mut data_offset = gps_ifd_offset + ifd_size(gps_entries);
        let mut tiff = Vec::new();
        let mut data = Vec::new();

        tiff.extend_from_slice(b"MM");
        tiff.extend_from_slice(&42u16.to_be_bytes());
        tiff.extend_from_slice(&TIFF_IFD0_OFFSET.to_be_bytes());

        write_ifd(
            &mut tiff,
            &mut data,
            &mut data_offset,
            &[
                ascii_entry(0x010f, "Canon"),
                ascii_entry(0x0110, "EOS R6"),
                short_entry(0x0112, 6),
                long_entry(0x8769, exif_ifd_offset),
                long_entry(0x8825, gps_ifd_offset),
            ],
        );
        write_ifd(
            &mut tiff,
            &mut data,
            &mut data_offset,
            &[
                ascii_entry(0x9003, "2026:04:21 09:42:33"),
                ascii_entry(0xa434, "RF 24-70mm"),
                rational_entry(0x829a, &[(1, 125)]),
                rational_entry(0x829d, &[(28, 10)]),
                short_entry(0x8827, 400),
                rational_entry(0x920a, &[(50, 1)]),
                long_entry(0xa002, 4000),
                long_entry(0xa003, 3000),
            ],
        );
        write_ifd(
            &mut tiff,
            &mut data,
            &mut data_offset,
            &[
                inline_ascii_ref_entry(0x0001, b'N'),
                latitude_entry,
                inline_ascii_ref_entry(0x0003, b'E'),
                longitude_entry,
                byte_entry(0x0005, 0),
                rational_entry(0x0006, &[(1564, 10)]),
            ],
        );

        let mut exif_payload = Vec::new();
        exif_payload.extend_from_slice(b"Exif\0\0");
        exif_payload.extend_from_slice(&tiff);
        exif_payload.extend_from_slice(&data);

        let app1_len = u16::try_from(exif_payload.len() + 2).expect("test exif length fits u16");
        let mut segment = vec![0xff, 0xe1];
        segment.extend_from_slice(&app1_len.to_be_bytes());
        segment.extend_from_slice(&exif_payload);
        jpeg.splice(2..2, segment);
        jpeg
    }

    #[test]
    fn corrupt_image_returns_empty_metadata() {
        let metadata = extract_image_metadata_for_tests(b"not an image");

        assert_eq!(metadata.width, None);
        assert_eq!(metadata.height, None);
        assert_eq!(metadata.gps, None);
        assert_eq!(
            metadata
                .gps_diagnostic
                .as_ref()
                .map(|diagnostic| diagnostic.status.as_str()),
            Some("extractor_failed"),
        );
    }

    #[test]
    fn jpeg_without_exif_still_reports_dimensions() {
        let mut bytes = Vec::new();
        let image = image::RgbImage::from_fn(32, 18, |_x, _y| image::Rgb([42, 20, 10]));
        image
            .write_to(&mut Cursor::new(&mut bytes), image::ImageFormat::Jpeg)
            .expect("jpeg should encode");

        let metadata = extract_image_metadata_for_tests(&bytes);

        assert_eq!(metadata.width, Some(32));
        assert_eq!(metadata.height, Some(18));
        assert_eq!(metadata.camera_make, None);
    }

    #[test]
    fn jpeg_exif_reports_camera_date_orientation_and_gps() {
        let metadata = extract_image_metadata_for_tests(&build_exif_jpeg());

        assert_eq!(metadata.camera_make.as_deref(), Some("Canon"));
        assert_eq!(metadata.camera_model.as_deref(), Some("EOS R6"));
        assert_eq!(metadata.lens_model.as_deref(), Some("RF 24-70mm"));
        assert_eq!(metadata.date_taken.as_deref(), Some("2026-04-21T09:42:33"));
        assert_eq!(metadata.orientation.as_deref(), Some("Rotated 90"));
        assert_eq!(metadata.iso, Some(400));
        assert_eq!(metadata.width, Some(32));
        assert_eq!(metadata.height, Some(18));

        let gps = metadata.gps.expect("gps metadata should parse");
        assert!((gps.latitude - 55.75833333333333).abs() < 0.000001);
        assert!((gps.longitude - 37.617222222222225).abs() < 0.000001);
        assert!((gps.altitude_meters.expect("altitude should parse") - 156.4).abs() < 0.000001);
        assert_eq!(
            metadata
                .gps_diagnostic
                .as_ref()
                .map(|diagnostic| diagnostic.status.as_str()),
            Some("available"),
        );
    }

    #[test]
    fn jpeg_exif_ignores_zero_zero_gps() {
        let bytes = build_exif_jpeg_with_gps(&[(0, 1), (0, 1), (0, 1)], &[(0, 1), (0, 1), (0, 1)]);
        let metadata = extract_image_metadata_for_tests(&bytes);

        assert_eq!(metadata.gps, None);
        assert_eq!(
            metadata
                .gps_diagnostic
                .as_ref()
                .map(|diagnostic| diagnostic.status.as_str()),
            Some("invalid"),
        );
    }

    #[test]
    fn jpeg_exif_reports_signed_rational_gps() {
        let bytes = build_exif_jpeg_with_signed_gps(
            &[(55, 1), (45, 1), (30, 1)],
            &[(37, 1), (37, 1), (2, 1)],
        );
        let metadata = extract_image_metadata_for_tests(&bytes);

        let gps = metadata.gps.expect("signed rational gps should parse");
        assert!((gps.latitude - 55.75833333333333).abs() < 0.000001);
        assert!((gps.longitude - 37.617222222222225).abs() < 0.000001);
    }

    #[test]
    fn jpeg_xmp_reports_gps_when_exif_gps_is_invalid() {
        let mut bytes =
            build_exif_jpeg_with_gps(&[(0, 0), (0, 0), (0, 0)], &[(0, 0), (0, 0), (0, 0)]);
        insert_xmp_app1_segment(
            &mut bytes,
            r#"<x:xmpmeta xmlns:x="adobe:ns:meta/">
  <rdf:RDF xmlns:rdf="http://www.w3.org/1999/02/22-rdf-syntax-ns#">
    <rdf:Description
      xmlns:exif="http://ns.adobe.com/exif/1.0/"
      exif:GPSLatitude="55,45,30N"
      exif:GPSLongitude="37,37,2E"
      exif:GPSAltitude="1564/10"
      exif:GPSAltitudeRef="0" />
  </rdf:RDF>
</x:xmpmeta>"#,
        );
        let metadata = extract_image_metadata_for_tests(&bytes);

        let gps = metadata.gps.expect("xmp gps should parse");
        assert!((gps.latitude - 55.75833333333333).abs() < 0.000001);
        assert!((gps.longitude - 37.617222222222225).abs() < 0.000001);
        assert!((gps.altitude_meters.expect("altitude should parse") - 156.4).abs() < 0.000001);
        assert_eq!(
            metadata
                .gps_diagnostic
                .as_ref()
                .and_then(|diagnostic| diagnostic.xmp_status.as_deref()),
            Some("ok"),
        );
    }

    #[test]
    fn merge_missing_metadata_preserves_existing_values() {
        let mut target = CatalogImageMetadata {
            width: Some(32),
            source_revision: Some(7),
            ..CatalogImageMetadata::default()
        };
        let source = CatalogImageMetadata {
            width: Some(64),
            height: Some(48),
            camera_make: Some("Android".to_string()),
            source_revision: Some(9),
            ..CatalogImageMetadata::default()
        };

        merge_missing_metadata(&mut target, source);

        assert_eq!(target.width, Some(32));
        assert_eq!(target.height, Some(48));
        assert_eq!(target.camera_make.as_deref(), Some("Android"));
        assert_eq!(target.source_revision, Some(7));
    }
}
