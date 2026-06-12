use std::collections::HashMap;
use std::io::Read;
use std::sync::{Arc, Mutex};

use chromvoid_core::error::ErrorCode;
use chromvoid_core::rpc::types::{RpcRequest, RpcResponse};
use chromvoid_core::rpc::{
    RpcInputStream, RpcOutputStream, RpcRangeOutputStream, RpcRangeStreamMeta, RpcReply,
    RpcStreamMeta,
};

use image::codecs::jpeg::JpegEncoder;
use image::{GenericImageView, ImageBuffer, Rgb, Rgba};

use crate::commands::catalog::image_import_provenance::{
    load_image_import_provenance, persist_image_import_provenance, CatalogImageImportProvenance,
};
use crate::types::*;

use super::derivatives::{
    build_core_backed_image_derivative_stream,
    build_core_backed_image_derivative_stream_cancellable, build_image_derivative_stream,
};
use super::gallery::{build_gallery_save_payload, save_gallery_payload, GallerySavePayload};
use super::preview::{
    handle_prepared_preview_request_with_parts, opaque_preview_staged_file_name,
    prepare_catalog_preview_file_in_root, prepare_catalog_preview_file_in_root_with_runtime,
    purge_catalog_preview_cache_in_root, purge_catalog_staging_cache_roots,
    release_catalog_preview_file_in_root, PreparedPreviewRuntimeState, PREVIEW_STAGING_DIR,
};
use super::staging::{
    prune_staged_external_files, stage_catalog_download_for_external_action_in_root,
    write_stream_to_file_atomically, write_stream_to_staged_file,
    EXTERNAL_ACTION_STAGING_MAX_AGE_SECS, OPEN_EXTERNAL_STAGING_DIR, SHARE_FILES_STAGING_DIR,
};
const PREVIEW_SOURCE_HEIC: &[u8] = include_bytes!("../../../../tests/fixtures/preview-source.heic");

struct StoredDerivative {
    meta: RpcStreamMeta,
    bytes: Vec<u8>,
}

#[derive(Default)]
struct ScriptedDerivativeState {
    derivatives: HashMap<String, StoredDerivative>,
    download_calls: usize,
    range_calls: usize,
    derivative_read_calls: usize,
    derivative_write_calls: usize,
    save_calls: usize,
    source_revision: u64,
    source_revision_initialized: bool,
    download_fails: bool,
    download_delay_ms: u64,
}

struct ScriptedDerivativeAdapter {
    source: StreamOut,
    state: Arc<Mutex<ScriptedDerivativeState>>,
}

impl ScriptedDerivativeAdapter {
    fn derivative_key(data: &serde_json::Value) -> String {
        format!(
            "{}:{}:{}:{}",
            data.get("node_id")
                .and_then(|value| value.as_u64())
                .unwrap_or(0),
            data.get("source_version")
                .and_then(|value| value.as_u64())
                .unwrap_or(0),
            data.get("tier")
                .and_then(|value| value.as_str())
                .unwrap_or_default(),
            data.get("version")
                .and_then(|value| value.as_u64())
                .unwrap_or(0),
        )
    }
}

impl crate::CoreAdapter for ScriptedDerivativeAdapter {
    fn mode(&self) -> crate::core_adapter::CoreMode {
        crate::core_adapter::CoreMode::Local
    }

    fn is_unlocked(&self) -> bool {
        true
    }

    fn handle(&mut self, req: &RpcRequest) -> RpcResponse {
        match req.command.as_str() {
            "catalog:source:metadata" => {
                let state = self.state.lock().expect("state lock");
                RpcResponse::success(serde_json::json!({
                    "node_id": req.data.get("node_id").and_then(|value| value.as_u64()).unwrap_or(0),
                    "node_type": 1,
                    "name": self.source.meta.name.clone(),
                    "mime_type": self.source.meta.mime_type.clone(),
                    "size": self.source.meta.size,
                    "source_revision": state.source_revision.max(1),
                    "source_revision_initialized": state.source_revision_initialized,
                }))
            }
            _ => RpcResponse::success(serde_json::Value::Null),
        }
    }

    fn handle_with_stream(&mut self, req: &RpcRequest, stream: Option<RpcInputStream>) -> RpcReply {
        match req.command.as_str() {
            "catalog:download" => {
                let (download_fails, download_delay_ms) = {
                    let mut state = self.state.lock().expect("state lock");
                    state.download_calls += 1;
                    (state.download_fails, state.download_delay_ms)
                };
                if download_fails {
                    return RpcReply::Json(RpcResponse::error(
                        "download failed",
                        Some(ErrorCode::InternalError),
                    ));
                }
                if download_delay_ms > 0 {
                    std::thread::sleep(std::time::Duration::from_millis(download_delay_ms));
                }
                RpcReply::Stream(RpcOutputStream {
                    meta: RpcStreamMeta {
                        name: self.source.meta.name.clone(),
                        mime_type: self.source.meta.mime_type.clone(),
                        size: self.source.meta.size,
                        chunk_size: self.source.meta.chunk_size,
                    },
                    reader: Box::new(std::io::Cursor::new(self.source.bytes.clone())),
                })
            }
            "catalog:downloadRange" => {
                let offset = req
                    .data
                    .get("offset")
                    .and_then(|value| value.as_u64())
                    .unwrap_or(0);
                let length = req
                    .data
                    .get("length")
                    .and_then(|value| value.as_u64())
                    .unwrap_or(0);
                let expected_source_revision = req
                    .data
                    .get("expected_source_revision")
                    .and_then(|value| value.as_u64())
                    .unwrap_or(0);
                let mut state = self.state.lock().expect("state lock");
                state.range_calls += 1;
                if expected_source_revision != state.source_revision.max(1) {
                    return RpcReply::Json(RpcResponse::error(
                        "stale source revision",
                        Some(ErrorCode::MediaStreamStale),
                    ));
                }
                let end = offset.saturating_add(length);
                if offset > self.source.bytes.len() as u64 || end > self.source.bytes.len() as u64 {
                    return RpcReply::Json(RpcResponse::error(
                        "range invalid",
                        Some(ErrorCode::MediaRangeInvalid),
                    ));
                }
                let range = self.source.bytes[offset as usize..end as usize].to_vec();
                RpcReply::RangeStream(RpcRangeOutputStream {
                    meta: RpcRangeStreamMeta {
                        name: self.source.meta.name.clone(),
                        mime_type: self.source.meta.mime_type.clone(),
                        file_size: self.source.meta.size,
                        chunk_size: self.source.meta.chunk_size,
                        range_offset: offset,
                        range_length: length,
                        source_revision: state.source_revision.max(1),
                    },
                    reader: Box::new(std::io::Cursor::new(range)),
                })
            }
            "catalog:derivative:read" => {
                let key = Self::derivative_key(&req.data);
                let mut state = self.state.lock().expect("state lock");
                state.derivative_read_calls += 1;
                if let Some(stored) = state.derivatives.get(&key) {
                    RpcReply::Stream(RpcOutputStream {
                        meta: RpcStreamMeta {
                            name: stored.meta.name.clone(),
                            mime_type: stored.meta.mime_type.clone(),
                            size: stored.meta.size,
                            chunk_size: stored.meta.chunk_size,
                        },
                        reader: Box::new(std::io::Cursor::new(stored.bytes.clone())),
                    })
                } else {
                    RpcReply::Json(RpcResponse::error(
                        "Derivative not found",
                        Some(ErrorCode::NodeNotFound),
                    ))
                }
            }
            "catalog:derivative:write" => {
                let key = Self::derivative_key(&req.data);
                let mut bytes = Vec::new();
                let mut reader = stream
                    .expect("derivative write should include stream")
                    .into_reader();
                reader.read_to_end(&mut bytes).expect("read write stream");

                let mut state = self.state.lock().expect("state lock");
                state.derivative_write_calls += 1;
                state.derivatives.insert(
                    key,
                    StoredDerivative {
                        meta: RpcStreamMeta {
                            name: req
                                .data
                                .get("name")
                                .and_then(|value| value.as_str())
                                .unwrap_or_default()
                                .to_string(),
                            mime_type: req
                                .data
                                .get("mime_type")
                                .and_then(|value| value.as_str())
                                .unwrap_or_default()
                                .to_string(),
                            size: req
                                .data
                                .get("size")
                                .and_then(|value| value.as_u64())
                                .unwrap_or(0),
                            chunk_size: req
                                .data
                                .get("chunk_size")
                                .and_then(|value| value.as_u64())
                                .and_then(|value| u32::try_from(value).ok())
                                .unwrap_or(64 * 1024),
                        },
                        bytes,
                    },
                );
                RpcReply::Json(RpcResponse::success(serde_json::Value::Null))
            }
            other => panic!("unexpected command: {other}"),
        }
    }

    fn save(&mut self) -> Result<(), String> {
        self.state.lock().expect("state lock").save_calls += 1;
        Ok(())
    }

    fn take_events(&mut self) -> Vec<serde_json::Value> {
        Vec::new()
    }

    fn set_master_key(&mut self, _key: Option<String>) {}
}

fn scripted_adapter(
    source: StreamOut,
) -> (
    Arc<Mutex<Box<dyn crate::CoreAdapter>>>,
    Arc<Mutex<ScriptedDerivativeState>>,
) {
    let state = Arc::new(Mutex::new(ScriptedDerivativeState::default()));
    state.lock().expect("state lock").source_revision = 1;
    let adapter: Box<dyn crate::CoreAdapter> = Box::new(ScriptedDerivativeAdapter {
        source,
        state: state.clone(),
    });
    (Arc::new(Mutex::new(adapter)), state)
}

#[test]
fn source_metadata_loader_saves_only_when_revision_initialized() {
    let source = stream_out("photo.png", "image/png", build_png_source(12, 7));
    let (adapter, state) = scripted_adapter(source);

    crate::commands::catalog::source_metadata::load_catalog_source_metadata(&adapter, 41)
        .expect("metadata without initialized revision should load");
    assert_eq!(state.lock().expect("state lock").save_calls, 0);

    state
        .lock()
        .expect("state lock")
        .source_revision_initialized = true;
    crate::commands::catalog::source_metadata::load_catalog_source_metadata(&adapter, 41)
        .expect("metadata with initialized revision should load");
    assert_eq!(state.lock().expect("state lock").save_calls, 1);
}

#[test]
fn media_source_metadata_loader_saves_only_when_revision_initialized() {
    let source = stream_out("photo.png", "image/png", build_png_source(12, 7));
    let (adapter, state) = scripted_adapter(source);

    crate::media_source::load_catalog_source_metadata(&adapter, 41)
        .expect("metadata without initialized revision should load");
    assert_eq!(state.lock().expect("state lock").save_calls, 0);

    state
        .lock()
        .expect("state lock")
        .source_revision_initialized = true;
    crate::media_source::load_catalog_source_metadata(&adapter, 41)
        .expect("metadata with initialized revision should load");
    assert_eq!(state.lock().expect("state lock").save_calls, 1);
}

fn test_image_import_provenance(source_revision: u64) -> CatalogImageImportProvenance {
    CatalogImageImportProvenance {
        source_revision,
        platform: "android".to_string(),
        image_candidate: true,
        permission_status: "granted".to_string(),
        require_original_status: "attempted_used".to_string(),
        original_stream_used: true,
        regular_stream_fallback: false,
        uri_scheme: Some("content".to_string()),
        uri_authority: Some("media".to_string()),
        captured_at_ms: Some(1_714_000_000_000),
    }
}

#[test]
fn image_import_provenance_persists_and_reads_source_revision_scoped_payload() {
    let source = stream_out("photo.jpg", "image/jpeg", build_jpeg_source(12, 7));
    let (adapter, state) = scripted_adapter(source);
    let provenance = test_image_import_provenance(1);

    persist_image_import_provenance(&adapter, 51, 1, &provenance)
        .expect("provenance should persist");
    let loaded = load_image_import_provenance(&adapter, 51, 1)
        .expect("provenance read should succeed")
        .expect("provenance should exist");

    assert_eq!(loaded, provenance);
    let state = state.lock().expect("state lock");
    assert_eq!(state.derivative_write_calls, 1);
    assert_eq!(state.derivative_read_calls, 1);
    assert!(state
        .derivatives
        .keys()
        .any(|key| key == "51:1:image-import-provenance:1"));
}

#[test]
fn image_import_provenance_misses_and_rejects_stale_payload() {
    let source = stream_out("photo.jpg", "image/jpeg", build_jpeg_source(12, 7));
    let (adapter, state) = scripted_adapter(source);

    let missing = load_image_import_provenance(&adapter, 52, 1)
        .expect("missing provenance read should not fail");
    assert_eq!(missing, None);

    let stale_bytes =
        serde_json::to_vec(&test_image_import_provenance(1)).expect("stale provenance json");
    state.lock().expect("state lock").derivatives.insert(
        "52:2:image-import-provenance:1".to_string(),
        StoredDerivative {
            meta: RpcStreamMeta {
                name: "image-import-provenance.json".to_string(),
                mime_type: "application/vnd.chromvoid.image-import-provenance+json".to_string(),
                size: stale_bytes.len() as u64,
                chunk_size: 64 * 1024,
            },
            bytes: stale_bytes,
        },
    );

    let stale = load_image_import_provenance(&adapter, 52, 2)
        .expect("stale provenance read should not fail");
    assert_eq!(stale, None);
}

fn stream_out(name: &str, mime_type: &str, bytes: Vec<u8>) -> StreamOut {
    StreamOut {
        meta: RpcStreamMeta {
            name: name.to_string(),
            mime_type: mime_type.to_string(),
            size: bytes.len() as u64,
            chunk_size: 64 * 1024,
        },
        bytes,
    }
}

#[test]
fn preview_image_args_accept_legacy_last_modified_payload() {
    let args: PreviewImageArgs = serde_json::from_value(serde_json::json!({
        "nodeId": 41,
        "fileName": "photo.jpg",
        "mimeType": "image/jpeg",
        "lastModified": 1234_u64,
    }))
    .expect("legacy preview image payload should deserialize");

    assert_eq!(args.node_id, 41);
    assert_eq!(args.file_name, "photo.jpg");
    assert_eq!(args.mime_type.as_deref(), Some("image/jpeg"));
    assert!(!args.refresh_derivative_cache);
}

#[test]
fn prepare_preview_file_args_accept_legacy_last_modified_payload() {
    let args: PreparePreviewFileArgs = serde_json::from_value(serde_json::json!({
        "nodeId": 41,
        "fileName": "photo.jpg",
        "mimeType": "image/jpeg",
        "lastModified": 1234_u64,
        "variant": "preview-image",
        "previewId": "preview-1",
    }))
    .expect("legacy prepared preview payload should deserialize");

    assert_eq!(args.node_id, 41);
    assert_eq!(args.file_name, "photo.jpg");
    assert_eq!(args.mime_type.as_deref(), Some("image/jpeg"));
    assert_eq!(args.variant, PreviewFileVariant::PreviewImage);
    assert_eq!(args.preview_id, "preview-1");
    assert!(!args.refresh_derivative_cache);
}

fn build_jpeg_source(width: u32, height: u32) -> Vec<u8> {
    let image = ImageBuffer::from_pixel(width, height, Rgb([32u8, 96u8, 180u8]));
    let mut bytes = Vec::new();
    let mut encoder = JpegEncoder::new_with_quality(&mut bytes, 90);
    encoder
        .encode_image(&image)
        .expect("test jpeg source should encode");
    bytes
}

fn build_jpeg_source_with_xmp_gps(width: u32, height: u32) -> Vec<u8> {
    let mut bytes = build_jpeg_source(width, height);
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
    bytes
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

fn build_png_source(width: u32, height: u32) -> Vec<u8> {
    let image = ImageBuffer::from_pixel(width, height, Rgba([32u8, 96u8, 180u8, 127u8]));
    let mut bytes = Vec::new();
    image::DynamicImage::ImageRgba8(image)
        .write_to(
            &mut std::io::Cursor::new(&mut bytes),
            image::ImageFormat::Png,
        )
        .expect("test png source should encode");
    bytes
}

fn append_mpeg_probe_frames(bytes: &mut Vec<u8>) {
    const MPEG_FRAME_HEADER: [u8; 4] = [0xFF, 0xFB, 0x90, 0x64];
    const MPEG_FRAME_LEN: usize = 417;

    for _ in 0..2 {
        bytes.extend(MPEG_FRAME_HEADER);
        bytes.resize(bytes.len() + MPEG_FRAME_LEN - MPEG_FRAME_HEADER.len(), 0);
    }
}

fn build_mp3_source_with_picture(
    image_bytes: Vec<u8>,
    mime_type: lofty::picture::MimeType,
    picture_type: lofty::picture::PictureType,
) -> Vec<u8> {
    use lofty::config::WriteOptions;
    use lofty::picture::Picture;
    use lofty::tag::{Tag, TagExt, TagType};

    let mut tag = Tag::new(TagType::Id3v2);
    tag.push_picture(
        Picture::unchecked(image_bytes)
            .pic_type(picture_type)
            .mime_type(mime_type)
            .build(),
    );
    let mut bytes = Vec::new();
    tag.dump_to(&mut bytes, WriteOptions::default())
        .expect("test ID3v2 tag should encode");
    append_mpeg_probe_frames(&mut bytes);
    bytes
}

fn build_mp3_source_without_picture() -> Vec<u8> {
    use lofty::config::WriteOptions;
    use lofty::tag::{Accessor, Tag, TagExt, TagType};

    let mut tag = Tag::new(TagType::Id3v2);
    tag.set_title("No artwork".to_string());
    let mut bytes = Vec::new();
    tag.dump_to(&mut bytes, WriteOptions::default())
        .expect("test ID3v2 tag should encode");
    append_mpeg_probe_frames(&mut bytes);
    bytes
}

fn build_flac_source_with_picture(image_bytes: Vec<u8>) -> Vec<u8> {
    use lofty::picture::{MimeType, Picture, PictureInformation, PictureType};

    let picture = Picture::unchecked(image_bytes)
        .pic_type(PictureType::CoverFront)
        .mime_type(MimeType::Png)
        .build();
    let information = PictureInformation::from_picture(&picture).unwrap_or_default();
    let picture_block = picture.as_flac_bytes(information, false);
    let mut bytes = b"fLaC".to_vec();
    bytes.push(0);
    bytes.extend([0, 0, 34]);
    bytes.extend([0; 34]);
    bytes.push(0x80 | 6);
    bytes.extend([
        ((picture_block.len() >> 16) & 0xFF) as u8,
        ((picture_block.len() >> 8) & 0xFF) as u8,
        (picture_block.len() & 0xFF) as u8,
    ]);
    bytes.extend(picture_block);
    bytes
}

#[test]
fn build_image_derivative_stream_returns_jpeg_preview_with_capped_edge() {
    let preview = build_image_derivative_stream(
        stream_out("photo.jpg", "image/jpeg", build_jpeg_source(4000, 2500)),
        "photo.jpg",
        Some("image/jpeg"),
        crate::image_preview::ImageDerivativeTier::DisplayPreview,
    )
    .expect("preview conversion should succeed");

    assert_eq!(
        preview.meta.mime_type,
        crate::image_preview::JPEG_PREVIEW_MIME
    );
    assert_eq!(preview.meta.name, "photo.jpg");
    assert_eq!(preview.meta.size, preview.bytes.len() as u64);
    assert_eq!(
        image::guess_format(&preview.bytes).expect("preview format should be detected"),
        image::ImageFormat::Jpeg
    );

    let decoded = image::load_from_memory(&preview.bytes).expect("jpeg preview should decode");
    let (width, height) = decoded.dimensions();
    assert_eq!(width.max(height), crate::image_preview::MAX_PREVIEW_EDGE);
    assert_eq!(width * 2500, height * 4000);
}

#[test]
fn build_image_derivative_stream_returns_png_preview_for_alpha_images() {
    let preview = build_image_derivative_stream(
        stream_out("badge.png", "image/png", build_png_source(1200, 800)),
        "badge.png",
        Some("image/png"),
        crate::image_preview::ImageDerivativeTier::DisplayPreview,
    )
    .expect("alpha preview conversion should succeed");

    assert_eq!(
        preview.meta.mime_type,
        crate::image_preview::PNG_PREVIEW_MIME
    );
    assert_eq!(preview.meta.name, "badge.png");
    assert_eq!(
        image::guess_format(&preview.bytes).expect("preview format should be detected"),
        image::ImageFormat::Png
    );

    let decoded = image::load_from_memory(&preview.bytes).expect("png preview should decode");
    assert!(decoded.color().has_alpha());
    let (width, height) = decoded.dimensions();
    assert_eq!(width.max(height), 1200);
}

#[test]
fn build_image_derivative_stream_returns_webp_thumbnail_for_alpha_images() {
    let preview = build_image_derivative_stream(
        stream_out("badge.png", "image/png", build_png_source(1200, 800)),
        "badge.png",
        Some("image/png"),
        crate::image_preview::ImageDerivativeTier::Thumbnail,
    )
    .expect("thumbnail conversion should succeed");

    assert_eq!(
        preview.meta.mime_type,
        crate::image_preview::WEBP_PREVIEW_MIME
    );
    assert_eq!(preview.meta.name, "badge.webp");
    assert_eq!(
        image::guess_format(&preview.bytes).expect("thumbnail format should be detected"),
        image::ImageFormat::WebP
    );

    let decoded = image::load_from_memory(&preview.bytes).expect("webp thumbnail should decode");
    assert!(decoded.color().has_alpha());
    let (width, height) = decoded.dimensions();
    assert_eq!(width.max(height), crate::image_preview::THUMBNAIL_MAX_EDGE);
    let ratio = width as f64 / height as f64;
    assert!((ratio - (1200.0 / 800.0)).abs() < 0.02);
}

#[test]
fn build_image_derivative_stream_reports_corrupt_heif_input() {
    let error = build_image_derivative_stream(
        stream_out("broken.heic", "image/heic", b"nope".to_vec()),
        "broken.heic",
        Some("image/heic"),
        crate::image_preview::ImageDerivativeTier::DisplayPreview,
    )
    .expect_err("corrupt heic should fail");

    assert_eq!(error.1.as_deref(), Some("PREVIEW_DECODE"));
}

#[test]
fn core_backed_derivative_hit_skips_regeneration() {
    let source = stream_out("photo.jpg", "image/jpeg", build_jpeg_source(4000, 2500));
    let (adapter, state) = scripted_adapter(source);
    let image_preview_runtime = crate::image_preview::ImagePreviewRuntimeState::new();
    let prebuilt = stream_out(
        "photo.jpg",
        crate::image_preview::JPEG_PREVIEW_MIME,
        b"cached".to_vec(),
    );

    state.lock().expect("state lock").derivatives.insert(
        format!(
            "21:1:preview:{}",
            crate::image_preview::DERIVATIVE_STORAGE_VERSION
        ),
        StoredDerivative {
            meta: RpcStreamMeta {
                name: prebuilt.meta.name.clone(),
                mime_type: prebuilt.meta.mime_type.clone(),
                size: prebuilt.meta.size,
                chunk_size: prebuilt.meta.chunk_size,
            },
            bytes: prebuilt.bytes.clone(),
        },
    );

    let result = build_core_backed_image_derivative_stream(
        &adapter,
        &image_preview_runtime,
        21,
        "photo.jpg",
        Some("image/jpeg"),
        crate::image_preview::ImageDerivativeTier::DisplayPreview,
    )
    .expect("stored derivative should load");

    let state = state.lock().expect("state lock");
    assert_eq!(state.download_calls, 0);
    assert_eq!(state.derivative_write_calls, 0);
    assert_eq!(result.bytes, b"cached");
}

#[test]
fn core_backed_derivative_miss_persists_and_invalidates_by_source_version() {
    let source = stream_out("photo.jpg", "image/jpeg", build_jpeg_source(4000, 2500));
    let (adapter, state) = scripted_adapter(source);
    let image_preview_runtime = crate::image_preview::ImagePreviewRuntimeState::new();

    let first = build_core_backed_image_derivative_stream(
        &adapter,
        &image_preview_runtime,
        31,
        "photo.jpg",
        Some("image/jpeg"),
        crate::image_preview::ImageDerivativeTier::DisplayPreview,
    )
    .expect("first derivative should be generated");
    let second = build_core_backed_image_derivative_stream(
        &adapter,
        &image_preview_runtime,
        31,
        "photo.jpg",
        Some("image/jpeg"),
        crate::image_preview::ImageDerivativeTier::DisplayPreview,
    )
    .expect("second derivative should reuse stored derivative");
    state.lock().expect("state lock").source_revision = 2;
    let third = build_core_backed_image_derivative_stream(
        &adapter,
        &image_preview_runtime,
        31,
        "photo.jpg",
        Some("image/jpeg"),
        crate::image_preview::ImageDerivativeTier::DisplayPreview,
    )
    .expect("changed source version should regenerate derivative");

    let state = state.lock().expect("state lock");
    assert_eq!(state.download_calls, 2);
    assert_eq!(state.derivative_write_calls, 2);
    assert_eq!(state.derivatives.len(), 2);
    assert_eq!(first.bytes, second.bytes);
    assert_eq!(first.meta.mime_type, second.meta.mime_type);
    assert_eq!(
        third.meta.mime_type,
        crate::image_preview::JPEG_PREVIEW_MIME
    );
    assert_eq!(third.meta.name, "photo.jpg");
}

#[test]
fn core_backed_derivative_refresh_bypasses_stored_derivative() {
    let source = stream_out("photo.jpg", "image/jpeg", build_jpeg_source(4000, 2500));
    let (adapter, state) = scripted_adapter(source);
    let image_preview_runtime = crate::image_preview::ImagePreviewRuntimeState::new();

    build_core_backed_image_derivative_stream(
        &adapter,
        &image_preview_runtime,
        32,
        "photo.jpg",
        Some("image/jpeg"),
        crate::image_preview::ImageDerivativeTier::Thumbnail,
    )
    .expect("first thumbnail derivative should be generated");

    let refreshed = build_core_backed_image_derivative_stream_cancellable(
        &adapter,
        &image_preview_runtime,
        32,
        "photo.jpg",
        Some("image/jpeg"),
        crate::image_preview::ImageDerivativeTier::Thumbnail,
        Arc::new(std::sync::atomic::AtomicU64::new(0)),
        true,
    )
    .expect("refresh should rebuild thumbnail derivative");

    let state = state.lock().expect("state lock");
    assert_eq!(state.download_calls, 2);
    assert_eq!(state.derivative_write_calls, 2);
    assert_eq!(state.derivative_read_calls, 2);
    assert_eq!(
        refreshed.meta.mime_type,
        crate::image_preview::WEBP_PREVIEW_MIME
    );
}

#[test]
fn core_backed_mp3_artwork_derivative_uses_range_and_persists() {
    let artwork = build_jpeg_source(900, 600);
    let source = stream_out(
        "song.mp3",
        "audio/mpeg",
        build_mp3_source_with_picture(
            artwork,
            lofty::picture::MimeType::Jpeg,
            lofty::picture::PictureType::CoverFront,
        ),
    );
    let (adapter, state) = scripted_adapter(source);
    let image_preview_runtime = crate::image_preview::ImagePreviewRuntimeState::new();

    let preview = build_core_backed_image_derivative_stream(
        &adapter,
        &image_preview_runtime,
        51,
        "song.mp3",
        Some("audio/mpeg"),
        crate::image_preview::ImageDerivativeTier::DisplayPreview,
    )
    .expect("embedded MP3 artwork should produce a preview derivative");

    assert_eq!(
        preview.meta.mime_type,
        crate::image_preview::JPEG_PREVIEW_MIME
    );
    assert_eq!(preview.meta.name, "song.jpg");
    let decoded = image::load_from_memory(&preview.bytes).expect("preview should decode");
    assert_eq!(decoded.dimensions(), (900, 600));
    let state = state.lock().expect("state lock");
    assert_eq!(state.download_calls, 0);
    assert!(state.range_calls > 0);
    assert_eq!(state.derivative_write_calls, 1);
}

#[test]
fn core_backed_flac_artwork_derivative_uses_existing_image_conversion() {
    let artwork = build_png_source(640, 480);
    let source = stream_out(
        "album.flac",
        "audio/flac",
        build_flac_source_with_picture(artwork),
    );
    let (adapter, state) = scripted_adapter(source);
    let image_preview_runtime = crate::image_preview::ImagePreviewRuntimeState::new();

    let preview = build_core_backed_image_derivative_stream(
        &adapter,
        &image_preview_runtime,
        52,
        "album.flac",
        Some("audio/flac"),
        crate::image_preview::ImageDerivativeTier::Thumbnail,
    )
    .expect("embedded FLAC artwork should produce a thumbnail derivative");

    assert_eq!(
        preview.meta.mime_type,
        crate::image_preview::WEBP_PREVIEW_MIME
    );
    assert_eq!(preview.meta.name, "album.webp");
    let decoded = image::load_from_memory(&preview.bytes).expect("thumbnail should decode");
    assert_eq!(
        decoded.dimensions().0.max(decoded.dimensions().1),
        crate::image_preview::THUMBNAIL_MAX_EDGE
    );
    let state = state.lock().expect("state lock");
    assert_eq!(state.download_calls, 0);
    assert!(state.range_calls > 0);
    assert_eq!(state.derivative_write_calls, 1);
}

#[test]
fn core_backed_audio_without_artwork_returns_unsupported_without_cache_write() {
    let source = stream_out("song.mp3", "audio/mpeg", build_mp3_source_without_picture());
    let (adapter, state) = scripted_adapter(source);
    let image_preview_runtime = crate::image_preview::ImagePreviewRuntimeState::new();

    let error = build_core_backed_image_derivative_stream(
        &adapter,
        &image_preview_runtime,
        53,
        "song.mp3",
        Some("audio/mpeg"),
        crate::image_preview::ImageDerivativeTier::DisplayPreview,
    )
    .expect_err("audio without artwork should be unavailable");

    assert_eq!(error.1.as_deref(), Some("UNSUPPORTED"));
    let state = state.lock().expect("state lock");
    assert_eq!(state.download_calls, 0);
    assert!(state.range_calls > 0);
    assert_eq!(state.derivative_write_calls, 0);
    assert!(state.derivatives.is_empty());
}

#[test]
fn core_backed_audio_corrupt_artwork_returns_preview_decode_without_cache_write() {
    let source = stream_out(
        "broken.mp3",
        "audio/mpeg",
        build_mp3_source_with_picture(
            b"not an image".to_vec(),
            lofty::picture::MimeType::Jpeg,
            lofty::picture::PictureType::CoverFront,
        ),
    );
    let (adapter, state) = scripted_adapter(source);
    let image_preview_runtime = crate::image_preview::ImagePreviewRuntimeState::new();

    let error = build_core_backed_image_derivative_stream(
        &adapter,
        &image_preview_runtime,
        54,
        "broken.mp3",
        Some("audio/mpeg"),
        crate::image_preview::ImageDerivativeTier::DisplayPreview,
    )
    .expect_err("corrupt artwork should fail image conversion");

    assert_eq!(error.1.as_deref(), Some("PREVIEW_DECODE"));
    let state = state.lock().expect("state lock");
    assert_eq!(state.download_calls, 0);
    assert!(state.range_calls > 0);
    assert_eq!(state.derivative_write_calls, 0);
    assert!(state.derivatives.is_empty());
}

#[test]
fn core_backed_large_audio_artwork_probe_avoids_full_download() {
    let artwork = build_jpeg_source(320, 320);
    let mut audio = build_mp3_source_with_picture(
        artwork,
        lofty::picture::MimeType::Jpeg,
        lofty::picture::PictureType::CoverFront,
    );
    audio.resize(
        (crate::audio_artwork::ARTWORK_METADATA_RANGE_BUDGET_BYTES as usize) + 1024,
        0,
    );
    let source = stream_out("large.mp3", "audio/mpeg", audio);
    let (adapter, state) = scripted_adapter(source);
    let image_preview_runtime = crate::image_preview::ImagePreviewRuntimeState::new();

    let preview = build_core_backed_image_derivative_stream(
        &adapter,
        &image_preview_runtime,
        55,
        "large.mp3",
        Some("audio/mpeg"),
        crate::image_preview::ImageDerivativeTier::Thumbnail,
    )
    .expect("large audio with front-loaded artwork should use bounded range reads");

    assert_eq!(
        preview.meta.mime_type,
        crate::image_preview::WEBP_PREVIEW_MIME
    );
    let state = state.lock().expect("state lock");
    assert_eq!(state.download_calls, 0);
    assert!(state.range_calls > 0);
    assert_eq!(state.derivative_write_calls, 1);
}

#[test]
fn image_metadata_miss_persists_and_second_call_uses_cache() {
    let source = stream_out("photo.png", "image/png", build_png_source(12, 7));
    let (adapter, state) = scripted_adapter(source);

    let first = super::image_metadata::load_catalog_image_metadata(
        &adapter,
        PreviewImageArgs {
            node_id: 41,
            file_name: "photo.png".to_string(),
            mime_type: Some("image/png".to_string()),
            refresh_derivative_cache: false,
        },
    )
    .expect("first metadata request should parse");
    let second = super::image_metadata::load_catalog_image_metadata(
        &adapter,
        PreviewImageArgs {
            node_id: 41,
            file_name: "photo.png".to_string(),
            mime_type: Some("image/png".to_string()),
            refresh_derivative_cache: false,
        },
    )
    .expect("second metadata request should use cache");

    assert_eq!(first.width, Some(12));
    assert_eq!(first.height, Some(7));
    assert_eq!(second, first);
    let state = state.lock().expect("state lock");
    assert_eq!(state.download_calls, 1);
    assert_eq!(state.derivative_write_calls, 1);
    assert!(state
        .derivatives
        .keys()
        .any(|key| key == "41:1:metadata:10"));
}

#[test]
fn image_metadata_preserves_gps_on_cache_miss_and_hit() {
    let source = stream_out(
        "photo.jpg",
        "image/jpeg",
        build_jpeg_source_with_xmp_gps(12, 7),
    );
    let (adapter, state) = scripted_adapter(source);

    let first = super::image_metadata::load_catalog_image_metadata(
        &adapter,
        PreviewImageArgs {
            node_id: 53,
            file_name: "photo.jpg".to_string(),
            mime_type: Some("image/jpeg".to_string()),
            refresh_derivative_cache: false,
        },
    )
    .expect("first known-GPS metadata request should parse");
    let second = super::image_metadata::load_catalog_image_metadata(
        &adapter,
        PreviewImageArgs {
            node_id: 53,
            file_name: "photo.jpg".to_string(),
            mime_type: Some("image/jpeg".to_string()),
            refresh_derivative_cache: false,
        },
    )
    .expect("second known-GPS metadata request should use cache");

    let gps = first.gps.as_ref().expect("first request should expose GPS");
    assert!((gps.latitude - 55.75833333333333).abs() < 0.000001);
    assert!((gps.longitude - 37.617222222222225).abs() < 0.000001);
    assert!((gps.altitude_meters.expect("altitude should parse") - 156.4).abs() < 0.000001);
    assert_eq!(second.gps, first.gps);
    assert_eq!(
        second
            .gps_diagnostic
            .as_ref()
            .map(|diagnostic| diagnostic.status.as_str()),
        Some("available"),
    );
    let state = state.lock().expect("state lock");
    assert_eq!(state.download_calls, 1);
    assert_eq!(state.derivative_write_calls, 1);
    assert!(state
        .derivatives
        .keys()
        .any(|key| key == "53:1:metadata:10"));
}

#[test]
fn image_metadata_cache_invalidates_by_source_revision() {
    let source = stream_out("photo.png", "image/png", build_png_source(12, 7));
    let (adapter, state) = scripted_adapter(source);

    let first = super::image_metadata::load_catalog_image_metadata(
        &adapter,
        PreviewImageArgs {
            node_id: 42,
            file_name: "photo.png".to_string(),
            mime_type: Some("image/png".to_string()),
            refresh_derivative_cache: false,
        },
    )
    .expect("first metadata request should parse");
    state.lock().expect("state lock").source_revision = 2;
    let second = super::image_metadata::load_catalog_image_metadata(
        &adapter,
        PreviewImageArgs {
            node_id: 42,
            file_name: "photo.png".to_string(),
            mime_type: Some("image/png".to_string()),
            refresh_derivative_cache: false,
        },
    )
    .expect("second source revision should parse again");

    assert_eq!(first.width, second.width);
    assert_ne!(first.source_revision, second.source_revision);
    let state = state.lock().expect("state lock");
    assert_eq!(state.download_calls, 2);
    assert_eq!(state.derivative_write_calls, 2);
    assert!(state
        .derivatives
        .keys()
        .any(|key| key == "42:1:metadata:10"));
    assert!(state
        .derivatives
        .keys()
        .any(|key| key == "42:2:metadata:10"));
}

#[test]
fn image_metadata_caches_empty_corrupt_image_metadata() {
    let source = stream_out("broken.jpg", "image/jpeg", b"not an image".to_vec());
    let (adapter, state) = scripted_adapter(source);

    let first = super::image_metadata::load_catalog_image_metadata(
        &adapter,
        PreviewImageArgs {
            node_id: 43,
            file_name: "broken.jpg".to_string(),
            mime_type: Some("image/jpeg".to_string()),
            refresh_derivative_cache: false,
        },
    )
    .expect("corrupt image metadata request should not fail");
    let second = super::image_metadata::load_catalog_image_metadata(
        &adapter,
        PreviewImageArgs {
            node_id: 43,
            file_name: "broken.jpg".to_string(),
            mime_type: Some("image/jpeg".to_string()),
            refresh_derivative_cache: false,
        },
    )
    .expect("corrupt image metadata retry should not fail");

    assert_eq!(first.width, None);
    assert_eq!(second.width, None);
    let state = state.lock().expect("state lock");
    assert_eq!(state.download_calls, 1);
    assert_eq!(state.derivative_write_calls, 1);
    assert!(state
        .derivatives
        .keys()
        .any(|key| key == "43:1:metadata:10"));
}

#[test]
fn image_metadata_invalid_cache_payload_falls_back_to_source_parse() {
    let source = stream_out("photo.png", "image/png", build_png_source(18, 9));
    let (adapter, state) = scripted_adapter(source);
    state.lock().expect("state lock").derivatives.insert(
        "44:1:metadata:1".to_string(),
        StoredDerivative {
            meta: RpcStreamMeta {
                name: "image-metadata.json".to_string(),
                mime_type: "application/vnd.chromvoid.image-metadata+json".to_string(),
                size: 1,
                chunk_size: 64 * 1024,
            },
            bytes: b"{".to_vec(),
        },
    );

    let metadata = super::image_metadata::load_catalog_image_metadata(
        &adapter,
        PreviewImageArgs {
            node_id: 44,
            file_name: "photo.png".to_string(),
            mime_type: Some("image/png".to_string()),
            refresh_derivative_cache: false,
        },
    )
    .expect("invalid metadata cache should not fail command");

    assert_eq!(metadata.width, Some(18));
    assert_eq!(metadata.height, Some(9));
    let state = state.lock().expect("state lock");
    assert_eq!(state.download_calls, 1);
    assert_eq!(state.derivative_write_calls, 1);
    assert!(state
        .derivatives
        .keys()
        .any(|key| key == "44:1:metadata:10"));
}

#[test]
fn image_metadata_ignores_legacy_v1_ready_cache_after_version_bump() {
    let source = stream_out("photo.png", "image/png", build_png_source(18, 9));
    let (adapter, state) = scripted_adapter(source);
    let cached = super::image_metadata::CatalogImageMetadata {
        width: Some(21),
        height: Some(11),
        source_revision: Some(1),
        ..super::image_metadata::CatalogImageMetadata::default()
    };
    let cached_bytes = serde_json::to_vec(&cached).expect("legacy metadata cache json");
    state.lock().expect("state lock").derivatives.insert(
        "45:1:metadata:1".to_string(),
        StoredDerivative {
            meta: RpcStreamMeta {
                name: "image-metadata.json".to_string(),
                mime_type: "application/vnd.chromvoid.image-metadata+json".to_string(),
                size: cached_bytes.len() as u64,
                chunk_size: 64 * 1024,
            },
            bytes: cached_bytes,
        },
    );

    let metadata = super::image_metadata::load_catalog_image_metadata(
        &adapter,
        PreviewImageArgs {
            node_id: 45,
            file_name: "photo.png".to_string(),
            mime_type: Some("image/png".to_string()),
            refresh_derivative_cache: false,
        },
    )
    .expect("metadata should reparse instead of using stale legacy cache");

    assert_eq!(metadata.width, Some(18));
    assert_eq!(metadata.height, Some(9));
    let state = state.lock().expect("state lock");
    assert_eq!(state.download_calls, 1);
    assert_eq!(state.derivative_write_calls, 1);
    assert!(state
        .derivatives
        .keys()
        .any(|key| key == "45:1:metadata:10"));
}

#[test]
fn image_metadata_transient_download_failure_does_not_write_empty_cache() {
    let source = stream_out("photo.png", "image/png", build_png_source(18, 9));
    let (adapter, state) = scripted_adapter(source);
    state.lock().expect("state lock").download_fails = true;

    let error = super::image_metadata::load_catalog_image_metadata(
        &adapter,
        PreviewImageArgs {
            node_id: 46,
            file_name: "photo.png".to_string(),
            mime_type: Some("image/png".to_string()),
            refresh_derivative_cache: false,
        },
    )
    .expect_err("transient download failure should fail metadata request");

    assert_eq!(error.1.as_deref(), Some("INTERNAL_ERROR"));
    let state = state.lock().expect("state lock");
    assert_eq!(state.download_calls, 1);
    assert_eq!(state.derivative_write_calls, 0);
    assert!(!state
        .derivatives
        .keys()
        .any(|key| key == "46:1:metadata:10"));
}

#[test]
fn image_metadata_includes_import_provenance_on_cache_miss_and_hit() {
    let source = stream_out("photo.png", "image/png", build_png_source(18, 9));
    let (adapter, state) = scripted_adapter(source);
    let provenance = test_image_import_provenance(1);
    persist_image_import_provenance(&adapter, 47, 1, &provenance)
        .expect("provenance should persist");

    let first = super::image_metadata::load_catalog_image_metadata(
        &adapter,
        PreviewImageArgs {
            node_id: 47,
            file_name: "photo.png".to_string(),
            mime_type: Some("image/png".to_string()),
            refresh_derivative_cache: false,
        },
    )
    .expect("first metadata request should parse");
    let second = super::image_metadata::load_catalog_image_metadata(
        &adapter,
        PreviewImageArgs {
            node_id: 47,
            file_name: "photo.png".to_string(),
            mime_type: Some("image/png".to_string()),
            refresh_derivative_cache: false,
        },
    )
    .expect("second metadata request should use cache");

    assert_eq!(first.import_provenance.as_ref(), Some(&provenance));
    assert_eq!(second.import_provenance.as_ref(), Some(&provenance));
    assert_eq!(
        first
            .gps_diagnostic
            .as_ref()
            .and_then(|diagnostic| diagnostic.import_provenance_status.as_deref()),
        Some("preserved"),
    );
    assert_eq!(second.gps_diagnostic, first.gps_diagnostic);
    let state = state.lock().expect("state lock");
    assert_eq!(state.download_calls, 1);
}

#[test]
fn image_metadata_missing_import_provenance_is_accepted() {
    let source = stream_out("photo.png", "image/png", build_png_source(18, 9));
    let (adapter, _state) = scripted_adapter(source);

    let metadata = super::image_metadata::load_catalog_image_metadata(
        &adapter,
        PreviewImageArgs {
            node_id: 48,
            file_name: "photo.png".to_string(),
            mime_type: Some("image/png".to_string()),
            refresh_derivative_cache: false,
        },
    )
    .expect("metadata without provenance should not fail");

    assert_eq!(metadata.import_provenance, None);
    assert!(metadata.gps_diagnostic.is_some());
}

#[test]
fn image_metadata_ignores_version_9_cache_after_bump_to_10() {
    let source = stream_out("photo.png", "image/png", build_png_source(24, 12));
    let (adapter, state) = scripted_adapter(source);
    let cached = super::image_metadata::CatalogImageMetadata {
        width: Some(21),
        height: Some(11),
        source_revision: Some(1),
        ..super::image_metadata::CatalogImageMetadata::default()
    };
    let cached_bytes = serde_json::to_vec(&serde_json::json!({
        "sourceRevision": 1,
        "outcome": "ready",
        "metadata": cached,
    }))
    .expect("version 9 cache json");
    state.lock().expect("state lock").derivatives.insert(
        "49:1:metadata:9".to_string(),
        StoredDerivative {
            meta: RpcStreamMeta {
                name: "image-metadata.json".to_string(),
                mime_type: "application/vnd.chromvoid.image-metadata+json".to_string(),
                size: cached_bytes.len() as u64,
                chunk_size: 64 * 1024,
            },
            bytes: cached_bytes,
        },
    );

    let metadata = super::image_metadata::load_catalog_image_metadata(
        &adapter,
        PreviewImageArgs {
            node_id: 49,
            file_name: "photo.png".to_string(),
            mime_type: Some("image/png".to_string()),
            refresh_derivative_cache: false,
        },
    )
    .expect("metadata should reparse after version bump");

    assert_eq!(metadata.width, Some(24));
    assert_eq!(metadata.height, Some(12));
    let state = state.lock().expect("state lock");
    assert_eq!(state.download_calls, 1);
    assert!(state
        .derivatives
        .keys()
        .any(|key| key == "49:1:metadata:10"));
}

#[test]
fn image_metadata_too_large_source_reports_diagnostic() {
    let bytes = vec![0u8; crate::image_preview::DERIVATIVE_MAX_INPUT_BYTES + 1];
    let source = stream_out("huge.jpg", "image/jpeg", bytes);
    let (adapter, state) = scripted_adapter(source);

    let metadata = super::image_metadata::load_catalog_image_metadata(
        &adapter,
        PreviewImageArgs {
            node_id: 50,
            file_name: "huge.jpg".to_string(),
            mime_type: Some("image/jpeg".to_string()),
            refresh_derivative_cache: false,
        },
    )
    .expect("too-large metadata request should not fail");

    assert_eq!(metadata.gps, None);
    assert_eq!(
        metadata
            .gps_diagnostic
            .as_ref()
            .map(|diagnostic| diagnostic.status.as_str()),
        Some("source_too_large"),
    );
    let state = state.lock().expect("state lock");
    assert_eq!(state.download_calls, 1);
    assert_eq!(state.derivative_write_calls, 0);
}

#[test]
fn build_gallery_save_payload_keeps_raw_heif_bytes() {
    let source = stream_out("scan.heic", "image/heic", PREVIEW_SOURCE_HEIC.to_vec());

    let payload = build_gallery_save_payload(source, "scan.heic", Some("image/heic"));

    assert_eq!(payload.name, "scan.heic");
    assert_eq!(payload.mime_type.as_deref(), Some("image/heic"));
    assert_eq!(payload.bytes, PREVIEW_SOURCE_HEIC);
}

#[cfg(not(target_os = "android"))]
#[test]
fn save_gallery_payload_reports_unsupported_off_android() {
    let error = save_gallery_payload(GallerySavePayload {
        name: "scan.heic".to_string(),
        mime_type: Some("image/heic".to_string()),
        bytes: PREVIEW_SOURCE_HEIC.to_vec(),
    })
    .expect_err("save-to-gallery should be unsupported off android");

    assert_eq!(error.1.as_deref(), Some("UNSUPPORTED"));
}

#[test]
fn prune_staged_open_external_files_removes_only_stale_staged_files() {
    let temp_dir = tempfile::tempdir().expect("tempdir should be created");
    let staged_dir = temp_dir.path().join("chromvoid-open");
    std::fs::create_dir_all(&staged_dir).expect("staged dir should be created");

    let stale = staged_dir.join("10_old.jpg");
    let fresh = staged_dir.join("95_fresh.jpg");
    let invalid = staged_dir.join("not-a-staged-name.jpg");

    std::fs::write(&stale, b"stale").expect("stale file should be written");
    std::fs::write(&fresh, b"fresh").expect("fresh file should be written");
    std::fs::write(&invalid, b"invalid").expect("invalid file should be written");

    prune_staged_external_files(&staged_dir, 100, 24);

    assert!(!stale.exists());
    assert!(fresh.exists());
    assert!(invalid.exists());
}

#[test]
fn external_staging_uses_opaque_file_names() {
    let temp_dir = tempfile::tempdir().expect("tempdir should be created");
    let staging_root = temp_dir.path().join(OPEN_EXTERNAL_STAGING_DIR);
    let source = stream_out(
        "secret report.pdf",
        "application/pdf",
        b"pdf bytes".to_vec(),
    );
    let (adapter, state) = scripted_adapter(source);

    let staged = stage_catalog_download_for_external_action_in_root(
        &staging_root,
        &adapter,
        7,
        None,
        EXTERNAL_ACTION_STAGING_MAX_AGE_SECS,
        |_bytes_written, _total_bytes| {},
    )
    .expect("external action should stage");

    let file_name = staged
        .path
        .file_name()
        .and_then(|value| value.to_str())
        .expect("staged path should have utf-8 file name");
    assert!(!file_name.contains("secret"));
    assert!(!file_name.contains("report"));
    assert!(file_name.ends_with(".pdf"));
    assert_eq!(
        std::fs::read(&staged.path).expect("staged file should be readable"),
        b"pdf bytes"
    );

    let state = state.lock().expect("state lock");
    assert_eq!(state.download_calls, 1);
}

#[test]
fn external_staging_uses_preferred_markdown_mime_extension_for_share() {
    let temp_dir = tempfile::tempdir().expect("tempdir should be created");
    let staging_root = temp_dir.path().join(SHARE_FILES_STAGING_DIR);
    let source = stream_out(
        "opaque-source.bin",
        "application/octet-stream",
        b"# note".to_vec(),
    );
    let (adapter, state) = scripted_adapter(source);

    let staged = stage_catalog_download_for_external_action_in_root(
        &staging_root,
        &adapter,
        7,
        Some("text/markdown"),
        EXTERNAL_ACTION_STAGING_MAX_AGE_SECS,
        |_bytes_written, _total_bytes| {},
    )
    .expect("share action should stage");

    let file_name = staged
        .path
        .file_name()
        .and_then(|value| value.to_str())
        .expect("staged path should have utf-8 file name");
    assert!(!file_name.contains("opaque"));
    assert!(!file_name.contains("source"));
    assert!(file_name.ends_with(".md"));
    assert_eq!(staged.mime_type, "application/octet-stream");
    assert_eq!(
        std::fs::read(&staged.path).expect("staged file should be readable"),
        b"# note"
    );

    let state = state.lock().expect("state lock");
    assert_eq!(state.download_calls, 1);
}

#[test]
fn preview_file_raw_prepare_registers_metadata_without_staging_bytes() {
    let temp_dir = tempfile::tempdir().expect("tempdir should be created");
    let preview_root = temp_dir.path().join(PREVIEW_STAGING_DIR);
    let source = stream_out("song.mp3", "audio/mpeg", b"audio bytes".to_vec());
    let (adapter, state) = scripted_adapter(source);

    let result = prepare_catalog_preview_file_in_root(
        &preview_root,
        &adapter,
        PreparePreviewFileArgs {
            node_id: 7,
            file_name: "song.mp3".to_string(),
            mime_type: Some("audio/mpeg".to_string()),
            variant: PreviewFileVariant::Raw,
            preview_id: "preview-1".to_string(),
            refresh_derivative_cache: false,
        },
    )
    .expect("raw preview should stage");

    assert_eq!(result.preview_id, "preview-1");
    assert_eq!(result.name, "song.mp3");
    assert_eq!(result.mime_type, "audio/mpeg");
    assert_eq!(result.size, b"audio bytes".len() as u64);
    assert_eq!(result.variant, "raw");
    assert!(result.path.starts_with("prepared-preview:preview-1:"));
    assert!(!std::path::Path::new(&result.path).exists());

    let state = state.lock().expect("state lock");
    assert_eq!(state.download_calls, 0);
    assert_eq!(state.derivative_write_calls, 0);
}

#[test]
fn preview_file_derivative_prepare_warms_storage_and_reuses_runtime_entry() {
    let temp_dir = tempfile::tempdir().expect("tempdir should be created");
    let preview_root = temp_dir.path().join(PREVIEW_STAGING_DIR);
    let source = stream_out("photo.jpg", "image/jpeg", build_jpeg_source(1200, 800));
    let (adapter, state) = scripted_adapter(source);
    let image_preview_runtime = crate::image_preview::ImagePreviewRuntimeState::new();
    let prepared_preview_runtime = PreparedPreviewRuntimeState::new();

    let first = prepare_catalog_preview_file_in_root_with_runtime(
        &preview_root,
        &adapter,
        &image_preview_runtime,
        &prepared_preview_runtime,
        PreparePreviewFileArgs {
            node_id: 9,
            file_name: "photo.jpg".to_string(),
            mime_type: Some("image/jpeg".to_string()),
            variant: PreviewFileVariant::PreviewImage,
            preview_id: "preview-a".to_string(),
            refresh_derivative_cache: false,
        },
        None,
    )
    .expect("preview derivative should stage");

    let second = prepare_catalog_preview_file_in_root_with_runtime(
        &preview_root,
        &adapter,
        &image_preview_runtime,
        &prepared_preview_runtime,
        PreparePreviewFileArgs {
            node_id: 9,
            file_name: "photo.jpg".to_string(),
            mime_type: Some("image/jpeg".to_string()),
            variant: PreviewFileVariant::PreviewImage,
            preview_id: "preview-b".to_string(),
            refresh_derivative_cache: false,
        },
        None,
    )
    .expect("cached preview derivative should stage");

    assert_eq!(first.mime_type, crate::image_preview::JPEG_PREVIEW_MIME);
    assert_eq!(first.name, "photo.jpg");
    assert_eq!(first.size, second.size);
    assert_eq!(first.path, second.path);
    assert!(first.path.starts_with("prepared-preview:preview-a:"));
    assert!(!std::path::Path::new(&first.path).exists());
    assert!(prepared_preview_runtime
        .entry_for_preview_id("preview-a")
        .expect("runtime lookup should succeed")
        .is_some());
    assert!(prepared_preview_runtime
        .entry_for_preview_id("preview-b")
        .expect("runtime lookup should succeed")
        .is_some());

    let state = state.lock().expect("state lock");
    assert_eq!(state.download_calls, 1);
    assert_eq!(state.derivative_write_calls, 1);
}

#[test]
fn preview_file_audio_artwork_derivative_prepare_uses_artwork_not_raw_audio() {
    let temp_dir = tempfile::tempdir().expect("tempdir should be created");
    let preview_root = temp_dir.path().join(PREVIEW_STAGING_DIR);
    let source = stream_out(
        "song.mp3",
        "audio/mpeg",
        build_mp3_source_with_picture(
            build_jpeg_source(640, 640),
            lofty::picture::MimeType::Jpeg,
            lofty::picture::PictureType::CoverFront,
        ),
    );
    let (adapter, state) = scripted_adapter(source);
    let image_preview_runtime = crate::image_preview::ImagePreviewRuntimeState::new();
    let prepared_preview_runtime = PreparedPreviewRuntimeState::new();

    let result = prepare_catalog_preview_file_in_root_with_runtime(
        &preview_root,
        &adapter,
        &image_preview_runtime,
        &prepared_preview_runtime,
        PreparePreviewFileArgs {
            node_id: 19,
            file_name: "song.mp3".to_string(),
            mime_type: Some("audio/mpeg".to_string()),
            variant: PreviewFileVariant::PreviewImage,
            preview_id: "preview-audio-artwork".to_string(),
            refresh_derivative_cache: false,
        },
        None,
    )
    .expect("audio artwork preview derivative should stage");

    assert_eq!(result.mime_type, crate::image_preview::JPEG_PREVIEW_MIME);
    assert_eq!(result.name, "song.jpg");
    assert!(result.size > 0);
    assert_eq!(result.variant, "preview-image");
    assert!(result
        .path
        .starts_with("prepared-preview:preview-audio-artwork:"));
    assert!(!std::path::Path::new(&result.path).exists());

    let state = state.lock().expect("state lock");
    assert_eq!(state.download_calls, 0);
    assert!(state.range_calls > 0);
    assert_eq!(state.derivative_write_calls, 1);
}

#[test]
fn preview_file_session_cache_reuses_runtime_derivative_until_last_release() {
    let temp_dir = tempfile::tempdir().expect("tempdir should be created");
    let preview_root = temp_dir.path().join(PREVIEW_STAGING_DIR);
    let source = stream_out("photo.jpg", "image/jpeg", build_jpeg_source(1200, 800));
    let (adapter, state) = scripted_adapter(source);
    let image_preview_runtime = crate::image_preview::ImagePreviewRuntimeState::new();
    let prepared_preview_runtime = PreparedPreviewRuntimeState::new();

    let first = prepare_catalog_preview_file_in_root_with_runtime(
        &preview_root,
        &adapter,
        &image_preview_runtime,
        &prepared_preview_runtime,
        PreparePreviewFileArgs {
            node_id: 9,
            file_name: "photo.jpg".to_string(),
            mime_type: Some("image/jpeg".to_string()),
            variant: PreviewFileVariant::PreviewImage,
            preview_id: "preview-a".to_string(),
            refresh_derivative_cache: false,
        },
        None,
    )
    .expect("first preview derivative should stage");
    let second = prepare_catalog_preview_file_in_root_with_runtime(
        &preview_root,
        &adapter,
        &image_preview_runtime,
        &prepared_preview_runtime,
        PreparePreviewFileArgs {
            node_id: 9,
            file_name: "photo.jpg".to_string(),
            mime_type: Some("image/jpeg".to_string()),
            variant: PreviewFileVariant::PreviewImage,
            preview_id: "preview-b".to_string(),
            refresh_derivative_cache: false,
        },
        None,
    )
    .expect("second preview derivative should reuse staged source");

    assert_eq!(first.preview_id, "preview-a");
    assert_eq!(second.preview_id, "preview-b");
    assert_eq!(first.path, second.path);

    release_catalog_preview_file_in_root(
        &preview_root,
        Some(&prepared_preview_runtime),
        ReleasePreviewFileArgs {
            preview_id: "preview-a".to_string(),
            path: first.path.clone(),
        },
    )
    .expect("first handle release should keep shared runtime entry");
    assert!(prepared_preview_runtime
        .entry_for_preview_id("preview-b")
        .expect("runtime lookup should succeed")
        .is_some());

    release_catalog_preview_file_in_root(
        &preview_root,
        Some(&prepared_preview_runtime),
        ReleasePreviewFileArgs {
            preview_id: "preview-b".to_string(),
            path: second.path.clone(),
        },
    )
    .expect("last handle release should remove shared runtime entry");
    assert!(prepared_preview_runtime
        .entry_for_preview_id("preview-b")
        .expect("runtime lookup should succeed")
        .is_none());

    let state = state.lock().expect("state lock");
    assert_eq!(state.download_calls, 1);
    assert_eq!(state.derivative_write_calls, 1);
}

#[test]
fn preview_file_concurrent_same_key_requests_share_one_build() {
    let temp_dir = tempfile::tempdir().expect("tempdir should be created");
    let preview_root = temp_dir.path().join(PREVIEW_STAGING_DIR);
    let source = stream_out("photo.jpg", "image/jpeg", build_jpeg_source(1200, 800));
    let (adapter, state) = scripted_adapter(source);
    state.lock().expect("state lock").download_delay_ms = 80;
    let image_preview_runtime = Arc::new(crate::image_preview::ImagePreviewRuntimeState::new());
    let prepared_preview_runtime = Arc::new(PreparedPreviewRuntimeState::new());

    let barrier = Arc::new(std::sync::Barrier::new(3));
    let first_adapter = adapter.clone();
    let first_root = preview_root.clone();
    let first_barrier = barrier.clone();
    let first_image_runtime = image_preview_runtime.clone();
    let first_prepared_runtime = prepared_preview_runtime.clone();
    let first = std::thread::spawn(move || {
        first_barrier.wait();
        prepare_catalog_preview_file_in_root_with_runtime(
            &first_root,
            &first_adapter,
            &first_image_runtime,
            &first_prepared_runtime,
            PreparePreviewFileArgs {
                node_id: 19,
                file_name: "photo.jpg".to_string(),
                mime_type: Some("image/jpeg".to_string()),
                variant: PreviewFileVariant::PreviewImage,
                preview_id: "preview-a".to_string(),
                refresh_derivative_cache: false,
            },
            None,
        )
        .expect("first preview derivative should stage")
    });

    let second_adapter = adapter.clone();
    let second_root = preview_root.clone();
    let second_barrier = barrier.clone();
    let second_image_runtime = image_preview_runtime.clone();
    let second_prepared_runtime = prepared_preview_runtime.clone();
    let second = std::thread::spawn(move || {
        second_barrier.wait();
        prepare_catalog_preview_file_in_root_with_runtime(
            &second_root,
            &second_adapter,
            &second_image_runtime,
            &second_prepared_runtime,
            PreparePreviewFileArgs {
                node_id: 19,
                file_name: "photo.jpg".to_string(),
                mime_type: Some("image/jpeg".to_string()),
                variant: PreviewFileVariant::PreviewImage,
                preview_id: "preview-b".to_string(),
                refresh_derivative_cache: false,
            },
            None,
        )
        .expect("second preview derivative should reuse staged source")
    });

    barrier.wait();
    let first = first.join().expect("first thread should finish");
    let second = second.join().expect("second thread should finish");

    assert_eq!(first.path, second.path);
    assert_ne!(first.preview_id, second.preview_id);

    release_catalog_preview_file_in_root(
        &preview_root,
        Some(prepared_preview_runtime.as_ref()),
        ReleasePreviewFileArgs {
            preview_id: first.preview_id.clone(),
            path: first.path.clone(),
        },
    )
    .expect("first concurrent handle release should keep shared runtime entry");

    release_catalog_preview_file_in_root(
        &preview_root,
        Some(prepared_preview_runtime.as_ref()),
        ReleasePreviewFileArgs {
            preview_id: second.preview_id.clone(),
            path: second.path.clone(),
        },
    )
    .expect("last concurrent handle release should remove shared runtime entry");
    assert!(prepared_preview_runtime
        .entry_for_preview_id(&second.preview_id)
        .expect("runtime lookup should succeed")
        .is_none());

    let state = state.lock().expect("state lock");
    assert_eq!(state.download_calls, 1);
    assert_eq!(state.derivative_write_calls, 1);
    assert_eq!(state.derivative_read_calls, 2);
}

#[test]
fn preview_file_session_cache_uses_source_revision_in_reuse_key() {
    let temp_dir = tempfile::tempdir().expect("tempdir should be created");
    let preview_root = temp_dir.path().join(PREVIEW_STAGING_DIR);
    let source = stream_out("photo.jpg", "image/jpeg", build_jpeg_source(1200, 800));
    let (adapter, state) = scripted_adapter(source);
    let image_preview_runtime = crate::image_preview::ImagePreviewRuntimeState::new();
    let prepared_preview_runtime = PreparedPreviewRuntimeState::new();

    let first = prepare_catalog_preview_file_in_root_with_runtime(
        &preview_root,
        &adapter,
        &image_preview_runtime,
        &prepared_preview_runtime,
        PreparePreviewFileArgs {
            node_id: 9,
            file_name: "photo.jpg".to_string(),
            mime_type: Some("image/jpeg".to_string()),
            variant: PreviewFileVariant::PreviewImage,
            preview_id: "preview-a".to_string(),
            refresh_derivative_cache: false,
        },
        None,
    )
    .expect("first revision should stage");

    state.lock().expect("state lock").source_revision = 2;

    let second = prepare_catalog_preview_file_in_root_with_runtime(
        &preview_root,
        &adapter,
        &image_preview_runtime,
        &prepared_preview_runtime,
        PreparePreviewFileArgs {
            node_id: 9,
            file_name: "photo.jpg".to_string(),
            mime_type: Some("image/jpeg".to_string()),
            variant: PreviewFileVariant::PreviewImage,
            preview_id: "preview-b".to_string(),
            refresh_derivative_cache: false,
        },
        None,
    )
    .expect("second revision should stage separately");

    assert_ne!(first.path, second.path);
    assert!(!std::path::Path::new(&first.path).exists());
    assert!(!std::path::Path::new(&second.path).exists());

    let state = state.lock().expect("state lock");
    assert_eq!(state.download_calls, 2);
    assert_eq!(state.derivative_write_calls, 2);
}

#[test]
fn prepared_preview_protocol_serves_raw_range_from_core() {
    let temp_dir = tempfile::tempdir().expect("tempdir should be created");
    let preview_root = temp_dir.path().join(PREVIEW_STAGING_DIR);
    let source = stream_out("song.mp3", "audio/mpeg", b"audio bytes".to_vec());
    let (adapter, state) = scripted_adapter(source);
    let image_preview_runtime = crate::image_preview::ImagePreviewRuntimeState::new();
    let prepared_preview_runtime = PreparedPreviewRuntimeState::new();

    let prepared = prepare_catalog_preview_file_in_root_with_runtime(
        &preview_root,
        &adapter,
        &image_preview_runtime,
        &prepared_preview_runtime,
        PreparePreviewFileArgs {
            node_id: 7,
            file_name: "song.mp3".to_string(),
            mime_type: Some("audio/mpeg".to_string()),
            variant: PreviewFileVariant::Raw,
            preview_id: "preview-raw".to_string(),
            refresh_derivative_cache: false,
        },
        None,
    )
    .expect("raw preview should prepare");

    let request = tauri::http::Request::builder()
        .method(tauri::http::Method::GET)
        .uri("chromvoid-preview://localhost/preview-raw")
        .header(tauri::http::header::RANGE, "bytes=0-4")
        .body(Vec::new())
        .expect("request should build");
    let response =
        handle_prepared_preview_request_with_parts(&adapter, &prepared_preview_runtime, request);

    assert_eq!(response.status(), tauri::http::StatusCode::PARTIAL_CONTENT);
    assert_eq!(response.body().as_slice(), b"audio");
    assert!(prepared.path.starts_with("prepared-preview:"));
    let state = state.lock().expect("state lock");
    assert_eq!(state.download_calls, 0);
    assert_eq!(state.range_calls, 1);
}

#[test]
fn prepared_preview_protocol_serves_raw_head_and_full_get_from_core() {
    let temp_dir = tempfile::tempdir().expect("tempdir should be created");
    let preview_root = temp_dir.path().join(PREVIEW_STAGING_DIR);
    let source = stream_out("note.txt", "text/plain", b"hello preview".to_vec());
    let (adapter, state) = scripted_adapter(source);
    let image_preview_runtime = crate::image_preview::ImagePreviewRuntimeState::new();
    let prepared_preview_runtime = PreparedPreviewRuntimeState::new();

    let prepared = prepare_catalog_preview_file_in_root_with_runtime(
        &preview_root,
        &adapter,
        &image_preview_runtime,
        &prepared_preview_runtime,
        PreparePreviewFileArgs {
            node_id: 7,
            file_name: "note.txt".to_string(),
            mime_type: Some("text/plain".to_string()),
            variant: PreviewFileVariant::Raw,
            preview_id: "preview-full".to_string(),
            refresh_derivative_cache: false,
        },
        None,
    )
    .expect("raw preview should prepare");

    let head_request = tauri::http::Request::builder()
        .method(tauri::http::Method::HEAD)
        .uri("chromvoid-preview://localhost/preview-full")
        .body(Vec::new())
        .expect("request should build");
    let head_response = handle_prepared_preview_request_with_parts(
        &adapter,
        &prepared_preview_runtime,
        head_request,
    );

    assert_eq!(head_response.status(), tauri::http::StatusCode::OK);
    assert_eq!(head_response.body().len(), 0);
    assert_eq!(
        head_response
            .headers()
            .get(tauri::http::header::CONTENT_TYPE)
            .and_then(|value| value.to_str().ok()),
        Some("text/plain")
    );
    let expected_size = prepared.size.to_string();
    assert_eq!(
        head_response
            .headers()
            .get(tauri::http::header::CONTENT_LENGTH)
            .and_then(|value| value.to_str().ok()),
        Some(expected_size.as_str())
    );

    let get_request = tauri::http::Request::builder()
        .method(tauri::http::Method::GET)
        .uri("chromvoid-preview://localhost/preview-full")
        .body(Vec::new())
        .expect("request should build");
    let get_response = handle_prepared_preview_request_with_parts(
        &adapter,
        &prepared_preview_runtime,
        get_request,
    );

    assert_eq!(get_response.status(), tauri::http::StatusCode::OK);
    assert_eq!(get_response.body().as_slice(), b"hello preview");
    let state = state.lock().expect("state lock");
    assert_eq!(state.download_calls, 1);
    assert_eq!(state.range_calls, 0);
}

#[test]
fn prepared_preview_protocol_rejects_invalid_range_without_core_read() {
    let temp_dir = tempfile::tempdir().expect("tempdir should be created");
    let preview_root = temp_dir.path().join(PREVIEW_STAGING_DIR);
    let source = stream_out("note.txt", "text/plain", b"hello preview".to_vec());
    let (adapter, state) = scripted_adapter(source);
    let image_preview_runtime = crate::image_preview::ImagePreviewRuntimeState::new();
    let prepared_preview_runtime = PreparedPreviewRuntimeState::new();

    prepare_catalog_preview_file_in_root_with_runtime(
        &preview_root,
        &adapter,
        &image_preview_runtime,
        &prepared_preview_runtime,
        PreparePreviewFileArgs {
            node_id: 7,
            file_name: "note.txt".to_string(),
            mime_type: Some("text/plain".to_string()),
            variant: PreviewFileVariant::Raw,
            preview_id: "preview-invalid-range".to_string(),
            refresh_derivative_cache: false,
        },
        None,
    )
    .expect("raw preview should prepare");

    let request = tauri::http::Request::builder()
        .method(tauri::http::Method::GET)
        .uri("chromvoid-preview://localhost/preview-invalid-range")
        .header(tauri::http::header::RANGE, "bytes=99-100")
        .body(Vec::new())
        .expect("request should build");
    let response =
        handle_prepared_preview_request_with_parts(&adapter, &prepared_preview_runtime, request);

    assert_eq!(
        response.status(),
        tauri::http::StatusCode::RANGE_NOT_SATISFIABLE
    );
    let state = state.lock().expect("state lock");
    assert_eq!(state.download_calls, 0);
    assert_eq!(state.range_calls, 0);
}

#[test]
fn prepared_preview_protocol_serves_derivative_from_core_storage() {
    let temp_dir = tempfile::tempdir().expect("tempdir should be created");
    let preview_root = temp_dir.path().join(PREVIEW_STAGING_DIR);
    let source = stream_out("photo.jpg", "image/jpeg", build_jpeg_source(1200, 800));
    let (adapter, _state) = scripted_adapter(source);
    let image_preview_runtime = crate::image_preview::ImagePreviewRuntimeState::new();
    let prepared_preview_runtime = PreparedPreviewRuntimeState::new();

    let prepared = prepare_catalog_preview_file_in_root_with_runtime(
        &preview_root,
        &adapter,
        &image_preview_runtime,
        &prepared_preview_runtime,
        PreparePreviewFileArgs {
            node_id: 9,
            file_name: "photo.jpg".to_string(),
            mime_type: Some("image/jpeg".to_string()),
            variant: PreviewFileVariant::ThumbnailImage,
            preview_id: "preview-derivative".to_string(),
            refresh_derivative_cache: false,
        },
        None,
    )
    .expect("derivative preview should prepare");

    let request = tauri::http::Request::builder()
        .method(tauri::http::Method::HEAD)
        .uri("chromvoid-preview://localhost/preview-derivative")
        .body(Vec::new())
        .expect("request should build");
    let response =
        handle_prepared_preview_request_with_parts(&adapter, &prepared_preview_runtime, request);

    assert_eq!(response.status(), tauri::http::StatusCode::OK);
    assert_eq!(
        response
            .headers()
            .get(tauri::http::header::CONTENT_TYPE)
            .and_then(|value| value.to_str().ok()),
        Some(crate::image_preview::WEBP_PREVIEW_MIME)
    );
    assert_eq!(response.body().len(), 0);
    let expected_size = prepared.size.to_string();
    assert_eq!(
        response
            .headers()
            .get(tauri::http::header::CONTENT_LENGTH)
            .and_then(|value| value.to_str().ok()),
        Some(expected_size.as_str())
    );
}

#[test]
fn prepared_preview_protocol_returns_404_for_missing_preview_id() {
    let source = stream_out("note.txt", "text/plain", b"note".to_vec());
    let (adapter, _state) = scripted_adapter(source);
    let prepared_preview_runtime = PreparedPreviewRuntimeState::new();
    let request = tauri::http::Request::builder()
        .method(tauri::http::Method::GET)
        .uri("chromvoid-preview://localhost/missing")
        .body(Vec::new())
        .expect("request should build");
    let response =
        handle_prepared_preview_request_with_parts(&adapter, &prepared_preview_runtime, request);

    assert_eq!(response.status(), tauri::http::StatusCode::NOT_FOUND);
}

#[test]
fn preview_file_prune_removes_stale_preview_files() {
    let temp_dir = tempfile::tempdir().expect("tempdir should be created");
    let preview_root = temp_dir.path().join(PREVIEW_STAGING_DIR);
    std::fs::create_dir_all(&preview_root).expect("preview dir should be created");

    let stale = preview_root.join("10_preview-a_old.jpg");
    let fresh = preview_root.join("100_preview-b_fresh.jpg");
    let invalid = preview_root.join("not-a-staged-name.jpg");

    std::fs::write(&stale, b"stale").expect("stale file should be written");
    std::fs::write(&fresh, b"fresh").expect("fresh file should be written");
    std::fs::write(&invalid, b"invalid").expect("invalid file should be written");

    prune_staged_external_files(&preview_root, 100, 60);

    assert!(!stale.exists());
    assert!(fresh.exists());
    assert!(invalid.exists());
}

#[test]
fn preview_cache_purge_handles_missing_directory() {
    let temp_dir = tempfile::tempdir().expect("tempdir should be created");
    let preview_root = temp_dir.path().join(PREVIEW_STAGING_DIR);

    let result =
        purge_catalog_preview_cache_in_root(&preview_root).expect("missing dir purge succeeds");

    assert_eq!(result, PurgePreviewCacheResult::default());
}

#[test]
fn preview_cache_purge_removes_nested_files_and_is_idempotent() {
    let temp_dir = tempfile::tempdir().expect("tempdir should be created");
    let preview_root = temp_dir.path().join(PREVIEW_STAGING_DIR);
    let nested = preview_root.join("nested");
    std::fs::create_dir_all(&nested).expect("nested dir should be created");
    std::fs::write(preview_root.join("root.webp"), b"root").expect("root file written");
    std::fs::write(nested.join("child.webp"), b"child").expect("child file written");

    let result = purge_catalog_preview_cache_in_root(&preview_root).expect("purge succeeds");

    assert_eq!(result.files_removed, 2);
    assert_eq!(result.directories_removed, 1);
    assert_eq!(result.bytes_removed, 9);
    assert_eq!(result.skipped_entries, 0);
    assert!(preview_root.exists());
    assert!(std::fs::read_dir(&preview_root)
        .expect("preview root should be readable")
        .next()
        .is_none());

    let repeated =
        purge_catalog_preview_cache_in_root(&preview_root).expect("repeated purge succeeds");
    assert_eq!(repeated, PurgePreviewCacheResult::default());
}

#[test]
fn staging_cache_purge_includes_preview_open_and_share_roots() {
    let temp_dir = tempfile::tempdir().expect("tempdir should be created");
    let preview_root = temp_dir.path().join(PREVIEW_STAGING_DIR);
    let open_root = temp_dir.path().join(OPEN_EXTERNAL_STAGING_DIR);
    let share_root = temp_dir.path().join(SHARE_FILES_STAGING_DIR);
    for root in [&preview_root, &open_root, &share_root] {
        std::fs::create_dir_all(root).expect("staging root should be created");
        std::fs::write(root.join("100_stage.bin"), b"staged")
            .expect("staged file should be written");
    }

    let result = purge_catalog_staging_cache_roots(&[
        preview_root.clone(),
        open_root.clone(),
        share_root.clone(),
    ])
    .expect("staging purge should succeed");

    assert_eq!(result.files_removed, 3);
    assert!(std::fs::read_dir(&preview_root)
        .expect("preview root readable")
        .next()
        .is_none());
    assert!(std::fs::read_dir(&open_root)
        .expect("open root readable")
        .next()
        .is_none());
    assert!(std::fs::read_dir(&share_root)
        .expect("share root readable")
        .next()
        .is_none());
}

#[cfg(unix)]
#[test]
fn preview_cache_purge_removes_symlink_without_touching_target() {
    use std::os::unix::fs::symlink;

    let temp_dir = tempfile::tempdir().expect("tempdir should be created");
    let preview_root = temp_dir.path().join(PREVIEW_STAGING_DIR);
    std::fs::create_dir_all(&preview_root).expect("preview dir should be created");
    let outside = temp_dir.path().join("outside.webp");
    let link = preview_root.join("linked.webp");
    std::fs::write(&outside, b"outside").expect("outside file written");
    symlink(&outside, &link).expect("symlink should be created");

    let result = purge_catalog_preview_cache_in_root(&preview_root).expect("purge succeeds");

    assert_eq!(result.files_removed, 1);
    assert!(outside.exists());
    assert!(!link.exists());
}

#[cfg(unix)]
#[test]
fn preview_cache_purge_removes_root_symlink_without_touching_target() {
    use std::os::unix::fs::symlink;

    let temp_dir = tempfile::tempdir().expect("tempdir should be created");
    let preview_root = temp_dir.path().join(PREVIEW_STAGING_DIR);
    let outside_dir = temp_dir.path().join("outside");
    std::fs::create_dir_all(&outside_dir).expect("outside dir should be created");
    let outside_file = outside_dir.join("outside.webp");
    std::fs::write(&outside_file, b"outside").expect("outside file written");
    symlink(&outside_dir, &preview_root).expect("root symlink should be created");

    let result = purge_catalog_preview_cache_in_root(&preview_root).expect("purge succeeds");

    assert_eq!(result.files_removed, 1);
    assert!(outside_file.exists());
    assert!(!preview_root.exists());
}

#[test]
fn preview_file_release_rejects_path_outside_preview_root() {
    let temp_dir = tempfile::tempdir().expect("tempdir should be created");
    let preview_root = temp_dir.path().join(PREVIEW_STAGING_DIR);
    std::fs::create_dir_all(&preview_root).expect("preview dir should be created");
    let outside = temp_dir.path().join("100_preview-a_file.jpg");
    std::fs::write(&outside, b"outside").expect("outside file should be written");

    let error = release_catalog_preview_file_in_root(
        &preview_root,
        None,
        ReleasePreviewFileArgs {
            preview_id: "preview-a".to_string(),
            path: outside.to_string_lossy().to_string(),
        },
    )
    .expect_err("outside path should be rejected");

    assert_eq!(error.1.as_deref(), Some("INVALID"));
    assert!(outside.exists());
}

#[test]
fn preview_file_release_rejects_mismatched_preview_id() {
    let temp_dir = tempfile::tempdir().expect("tempdir should be created");
    let preview_root = temp_dir.path().join(PREVIEW_STAGING_DIR);
    std::fs::create_dir_all(&preview_root).expect("preview dir should be created");
    let target = preview_root.join(opaque_preview_staged_file_name(
        100,
        "preview-a",
        "image/jpeg",
    ));
    std::fs::write(&target, b"preview").expect("preview file should be written");

    let error = release_catalog_preview_file_in_root(
        &preview_root,
        None,
        ReleasePreviewFileArgs {
            preview_id: "preview-b".to_string(),
            path: target.to_string_lossy().to_string(),
        },
    )
    .expect_err("mismatched preview id should be rejected");

    assert_eq!(error.1.as_deref(), Some("INVALID"));
    assert!(target.exists());
}

#[test]
fn preview_file_release_treats_missing_file_as_success() {
    let temp_dir = tempfile::tempdir().expect("tempdir should be created");
    let preview_root = temp_dir.path().join(PREVIEW_STAGING_DIR);
    std::fs::create_dir_all(&preview_root).expect("preview dir should be created");
    let target = preview_root.join(opaque_preview_staged_file_name(
        100,
        "preview-a",
        "image/jpeg",
    ));

    release_catalog_preview_file_in_root(
        &preview_root,
        None,
        ReleasePreviewFileArgs {
            preview_id: "preview-a".to_string(),
            path: target.to_string_lossy().to_string(),
        },
    )
    .expect("missing preview file should be treated as released");
}

#[test]
fn preview_file_incomplete_write_removes_partial_file() {
    let temp_dir = tempfile::tempdir().expect("tempdir should be created");
    let target = temp_dir.path().join("100_preview-a_file.bin");
    let mut reader = std::io::Cursor::new(b"short".to_vec());

    let error = write_stream_to_staged_file(&mut reader, &target, 100, |_, _| {})
        .expect_err("short stream should fail");

    assert_eq!(error.1.as_deref(), Some("IO"));
    assert!(!target.exists());
}

#[test]
fn stream_atomic_write_preserves_existing_target_on_incomplete_stream() {
    let temp_dir = tempfile::tempdir().expect("tempdir should be created");
    let target = temp_dir.path().join("download.bin");
    std::fs::write(&target, b"existing").expect("existing target should be written");
    let mut reader = std::io::Cursor::new(b"short".to_vec());

    let error = write_stream_to_file_atomically(
        &mut reader,
        &target,
        100,
        |bytes_written, total_bytes| {
            (
                format!("Download incomplete: wrote {bytes_written} of {total_bytes} bytes"),
                Some("INCOMPLETE".to_string()),
            )
        },
        |_, _| {},
    )
    .expect_err("short stream should fail");

    assert_eq!(error.1.as_deref(), Some("INCOMPLETE"));
    assert_eq!(
        std::fs::read(&target).expect("existing target should remain readable"),
        b"existing"
    );
}
