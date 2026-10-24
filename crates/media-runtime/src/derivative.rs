//! Shared derivative request and output policy; no storage or platform adapter.
use crate::image_preview::{
    ImageDerivativeTier, JPEG_PREVIEW_MIME, PNG_PREVIEW_MIME, WEBP_PREVIEW_MIME,
};
use serde_json::Value;
pub type DerivativeError = (String, Option<String>);

#[derive(Clone, Copy, Debug)]
pub struct HostDerivativeEnsureRequest {
    pub node_id: u64,
    pub source_version: u64,
    pub tier: ImageDerivativeTier,
    pub version: u32,
    pub refresh_cache: bool,
}

impl HostDerivativeEnsureRequest {
    pub fn parse(data: &Value) -> Result<Self, DerivativeError> {
        let node_id = required_u64(data, "node_id")?;
        let source_version = required_u64(data, "source_version")?;
        let version = data
            .get("version")
            .and_then(Value::as_u64)
            .and_then(|value| u32::try_from(value).ok())
            .ok_or_else(|| required_field_error("version"))?;
        let tier = match data.get("tier").and_then(Value::as_str) {
            Some("preview") => ImageDerivativeTier::DisplayPreview,
            Some("thumbnail") => ImageDerivativeTier::Thumbnail,
            Some(_) => {
                return Err((
                    "tier must be preview or thumbnail".to_string(),
                    Some("EMPTY_PAYLOAD".to_string()),
                ))
            }
            None => return Err(required_field_error("tier")),
        };
        let refresh_cache = match data.get("refresh_cache") {
            Some(value) => value
                .as_bool()
                .ok_or_else(|| required_field_error("refresh_cache"))?,
            None => false,
        };
        Ok(Self {
            node_id,
            source_version,
            tier,
            version,
            refresh_cache,
        })
    }
}

fn required_u64(data: &Value, field: &str) -> Result<u64, DerivativeError> {
    data.get(field)
        .and_then(Value::as_u64)
        .ok_or_else(|| required_field_error(field))
}

fn required_field_error(field: &str) -> DerivativeError {
    (
        format!("{field} is required"),
        Some("EMPTY_PAYLOAD".to_string()),
    )
}

const DISPLAY_PREVIEW_MAX_OUTPUT_BYTES: u64 = 32 * 1024 * 1024;
const THUMBNAIL_MAX_OUTPUT_BYTES: u64 = 4 * 1024 * 1024;
pub fn derivative_output_limit(tier: ImageDerivativeTier) -> u64 {
    match tier {
        ImageDerivativeTier::DisplayPreview => DISPLAY_PREVIEW_MAX_OUTPUT_BYTES,
        ImageDerivativeTier::Thumbnail => THUMBNAIL_MAX_OUTPUT_BYTES,
    }
}

pub fn validate_derivative_output(
    size: u64,
    mime: &str,
    tier: ImageDerivativeTier,
) -> Result<(), DerivativeError> {
    if size == 0 {
        return Err((
            "Image derivative stream is empty".to_string(),
            Some("INTERNAL".to_string()),
        ));
    }
    if size > derivative_output_limit(tier) {
        return Err((
            "Image derivative exceeds the bounded output size".to_string(),
            Some("PAYLOAD_TOO_LARGE".to_string()),
        ));
    }
    let mime_type = mime
        .split(';')
        .next()
        .unwrap_or_default()
        .trim()
        .to_ascii_lowercase();
    if !matches!(
        mime_type.as_str(),
        JPEG_PREVIEW_MIME | PNG_PREVIEW_MIME | WEBP_PREVIEW_MIME
    ) {
        return Err((
            "Image derivative has an unsupported MIME type".to_string(),
            Some("UNSUPPORTED".to_string()),
        ));
    }
    Ok(())
}

pub fn derivative_output_name(
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
