use crate::types::*;

use super::GallerySaveError;

pub(super) struct GallerySavePayload {
    pub(super) name: String,
    pub(super) mime_type: Option<String>,
    pub(super) bytes: Vec<u8>,
}

pub(super) struct StagedCatalogFile {
    pub(super) path: std::path::PathBuf,
    pub(super) mime_type: String,
}

fn resolve_gallery_save_name(stream_name: &str, display_name_hint: &str) -> String {
    let requested = display_name_hint.trim();
    if !requested.is_empty() {
        return requested.to_string();
    }

    let stream = stream_name.trim();
    if !stream.is_empty() {
        return stream.to_string();
    }

    "image".to_string()
}

fn resolve_gallery_save_mime_type(
    stream_mime_type: &str,
    requested_mime_type: Option<&str>,
) -> Option<String> {
    let requested = requested_mime_type
        .map(str::trim)
        .filter(|value| !value.is_empty());
    if let Some(value) = requested {
        return Some(value.to_string());
    }

    let stream = stream_mime_type.trim();
    if stream.is_empty() {
        None
    } else {
        Some(stream.to_string())
    }
}

pub(super) fn build_gallery_save_payload(
    source: StreamOut,
    display_name_hint: &str,
    requested_mime_type: Option<&str>,
) -> GallerySavePayload {
    GallerySavePayload {
        name: resolve_gallery_save_name(&source.meta.name, display_name_hint),
        mime_type: resolve_gallery_save_mime_type(&source.meta.mime_type, requested_mime_type),
        bytes: source.bytes,
    }
}

pub(super) fn save_gallery_payload(
    payload: GallerySavePayload,
) -> Result<SaveImageToGalleryResult, GallerySaveError> {
    if !crate::mobile::gallery_save_supported() {
        return Err((
            "Saving images to gallery is not supported on this platform".to_string(),
            Some("UNSUPPORTED".to_string()),
        ));
    }

    let uri = crate::mobile::save_image_to_gallery(
        &payload.bytes,
        &payload.name,
        payload.mime_type.as_deref(),
    )
    .map_err(|error| (error, Some("SAVE_FAILED".to_string())))?;

    Ok(SaveImageToGalleryResult {
        name: payload.name,
        uri,
    })
}
