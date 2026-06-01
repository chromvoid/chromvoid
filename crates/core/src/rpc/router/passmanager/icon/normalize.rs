use crate::error::ErrorCode;
use base64::{engine::general_purpose, Engine as _};

use super::super::error::PassmanagerCommandError;
use super::types::{ICON_MAX_DIMENSION, ICON_MAX_UPLOAD_BYTES, ICON_NORMALIZED_MAX_BYTES};

pub(super) struct NormalizedIconPayload {
    pub(super) bytes: Vec<u8>,
    pub(super) mime_type: String,
    pub(super) ext: String,
    pub(super) width: u32,
    pub(super) height: u32,
}

pub(super) fn normalize_upload_payload(
    data: &serde_json::Value,
) -> Result<NormalizedIconPayload, PassmanagerCommandError> {
    let Some(content_base64) = data.get("content_base64").and_then(|v| v.as_str()) else {
        return Err(PassmanagerCommandError::new(
            "content_base64 is required",
            Some(ErrorCode::EmptyPayload),
        ));
    };

    let mut payload = decode_base64_payload(content_base64)?;
    if payload.is_empty() {
        return Err(PassmanagerCommandError::new(
            "invalid_icon_payload: empty",
            Some(ErrorCode::EmptyPayload),
        ));
    }
    if payload.len() > ICON_MAX_UPLOAD_BYTES {
        return Err(PassmanagerCommandError::new(
            "payload_too_large",
            Some(ErrorCode::EmptyPayload),
        ));
    }

    let requested_mime = data
        .get("mime_type")
        .and_then(|v| v.as_str())
        .map(str::trim)
        .filter(|v| !v.is_empty());
    let mime_type = match requested_mime {
        Some(mime_type) => mime_type,
        None => detect_icon_mime_type(&payload).unwrap_or(""),
    };
    let Some(ext) = icon_ext_for_mime(mime_type) else {
        return Err(PassmanagerCommandError::new(
            "invalid_icon_payload: unsupported mime type",
            Some(ErrorCode::EmptyPayload),
        ));
    };

    if mime_type == "image/svg+xml" {
        payload = sanitize_svg_payload(&payload)?;
    }

    let Some((width, height)) = icon_dimensions_for_mime(mime_type, &payload) else {
        return Err(PassmanagerCommandError::new(
            "invalid_icon_payload: unsupported dimensions",
            Some(ErrorCode::EmptyPayload),
        ));
    };
    validate_icon_dimensions(width, height)?;
    if payload.len() > ICON_NORMALIZED_MAX_BYTES {
        return Err(PassmanagerCommandError::new(
            "payload_too_large",
            Some(ErrorCode::EmptyPayload),
        ));
    }

    Ok(NormalizedIconPayload {
        bytes: payload,
        mime_type: mime_type.to_string(),
        ext: ext.to_string(),
        width,
        height,
    })
}

fn icon_ext_for_mime(mime_type: &str) -> Option<&'static str> {
    match mime_type {
        "image/png" => Some("png"),
        "image/webp" => Some("webp"),
        "image/svg+xml" => Some("svg"),
        "image/x-icon" => Some("ico"),
        _ => None,
    }
}

fn detect_icon_mime_type(bytes: &[u8]) -> Option<&'static str> {
    if bytes.starts_with(b"\x89PNG\r\n\x1a\n") {
        return Some("image/png");
    }
    if bytes.len() >= 12 && &bytes[0..4] == b"RIFF" && &bytes[8..12] == b"WEBP" {
        return Some("image/webp");
    }
    if bytes.len() >= 4
        && bytes[0] == 0x00
        && bytes[1] == 0x00
        && bytes[2] == 0x01
        && bytes[3] == 0x00
    {
        return Some("image/x-icon");
    }
    if let Ok(text) = std::str::from_utf8(bytes) {
        let trimmed = text.trim_start();
        if trimmed.starts_with("<svg") || trimmed.starts_with("<?xml") {
            return Some("image/svg+xml");
        }
    }
    None
}

fn decode_base64_payload(content: &str) -> Result<Vec<u8>, PassmanagerCommandError> {
    general_purpose::STANDARD_NO_PAD
        .decode(content)
        .or_else(|_| general_purpose::STANDARD.decode(content))
        .map_err(|_| {
            PassmanagerCommandError::new(
                "invalid_icon_payload: invalid base64",
                Some(ErrorCode::EmptyPayload),
            )
        })
}

fn parse_png_dimensions(bytes: &[u8]) -> Option<(u32, u32)> {
    if bytes.len() < 24 {
        return None;
    }
    if &bytes[0..8] != b"\x89PNG\r\n\x1a\n" {
        return None;
    }
    let width = u32::from_be_bytes([bytes[16], bytes[17], bytes[18], bytes[19]]);
    let height = u32::from_be_bytes([bytes[20], bytes[21], bytes[22], bytes[23]]);
    Some((width, height))
}

fn parse_webp_dimensions(bytes: &[u8]) -> Option<(u32, u32)> {
    if bytes.len() < 30 {
        return None;
    }
    if &bytes[0..4] != b"RIFF" || &bytes[8..12] != b"WEBP" {
        return None;
    }

    let chunk = &bytes[12..16];
    if chunk == b"VP8X" {
        let width = 1 + (bytes[24] as u32) + ((bytes[25] as u32) << 8) + ((bytes[26] as u32) << 16);
        let height =
            1 + (bytes[27] as u32) + ((bytes[28] as u32) << 8) + ((bytes[29] as u32) << 16);
        return Some((width, height));
    }

    if chunk == b"VP8L" && bytes.len() >= 25 {
        let b0 = bytes[21] as u32;
        let b1 = bytes[22] as u32;
        let b2 = bytes[23] as u32;
        let b3 = bytes[24] as u32;
        let width = 1 + (b0 | ((b1 & 0x3F) << 8));
        let height = 1 + (((b1 >> 6) | (b2 << 2) | ((b3 & 0x0F) << 10)) & 0x3FFF);
        return Some((width, height));
    }

    if chunk == b"VP8 " && bytes.len() >= 30 {
        if bytes[23] == 0x9D && bytes[24] == 0x01 && bytes[25] == 0x2A {
            let width = u16::from_le_bytes([bytes[26], bytes[27]]) as u32 & 0x3FFF;
            let height = u16::from_le_bytes([bytes[28], bytes[29]]) as u32 & 0x3FFF;
            return Some((width, height));
        }
    }

    None
}

fn parse_ico_dimensions(bytes: &[u8]) -> Option<(u32, u32)> {
    if bytes.len() < 22 {
        return None;
    }
    let count = u16::from_le_bytes([bytes[4], bytes[5]]);
    if count == 0 {
        return None;
    }
    let width = if bytes[6] == 0 { 256 } else { bytes[6] as u32 };
    let height = if bytes[7] == 0 { 256 } else { bytes[7] as u32 };
    Some((width, height))
}

fn parse_dimension_to_u32(raw: &str) -> Option<u32> {
    let trimmed = raw.trim();
    if trimmed.is_empty() {
        return None;
    }

    let num = trimmed.parse::<f64>().ok()?;
    if !num.is_finite() || num <= 0.0 {
        return None;
    }

    let rounded = num.round();
    if rounded <= 0.0 || rounded > u32::MAX as f64 {
        return None;
    }

    Some(rounded as u32)
}

fn parse_svg_dimensions(svg_text: &str) -> Option<(u32, u32)> {
    let width_re = regex::Regex::new(r#"(?i)\bwidth\s*=\s*[\"']\s*([0-9]+(?:\.[0-9]+)?)"#).ok()?;
    let height_re =
        regex::Regex::new(r#"(?i)\bheight\s*=\s*[\"']\s*([0-9]+(?:\.[0-9]+)?)"#).ok()?;
    let viewbox_re = regex::Regex::new(
        r#"(?i)\bviewBox\s*=\s*[\"']\s*[-0-9.]+\s+[-0-9.]+\s+([0-9]+(?:\.[0-9]+)?)\s+([0-9]+(?:\.[0-9]+)?)"#,
    )
    .ok()?;

    let width = width_re
        .captures(svg_text)
        .and_then(|c| c.get(1))
        .and_then(|m| parse_dimension_to_u32(m.as_str()));
    let height = height_re
        .captures(svg_text)
        .and_then(|c| c.get(1))
        .and_then(|m| parse_dimension_to_u32(m.as_str()));

    if let (Some(w), Some(h)) = (width, height) {
        return Some((w, h));
    }

    let caps = viewbox_re.captures(svg_text)?;
    let w = caps
        .get(1)
        .and_then(|m| parse_dimension_to_u32(m.as_str()))?;
    let h = caps
        .get(2)
        .and_then(|m| parse_dimension_to_u32(m.as_str()))?;
    Some((w, h))
}

fn icon_dimensions_for_mime(mime_type: &str, bytes: &[u8]) -> Option<(u32, u32)> {
    match mime_type {
        "image/png" => parse_png_dimensions(bytes),
        "image/webp" => parse_webp_dimensions(bytes),
        "image/x-icon" => parse_ico_dimensions(bytes),
        "image/svg+xml" => {
            let text = std::str::from_utf8(bytes).ok()?;
            parse_svg_dimensions(text)
        }
        _ => None,
    }
}

fn validate_icon_dimensions(width: u32, height: u32) -> Result<(), PassmanagerCommandError> {
    if width == 0 || height == 0 {
        return Err(PassmanagerCommandError::new(
            "invalid_icon_payload: zero dimensions",
            Some(ErrorCode::EmptyPayload),
        ));
    }

    if width > ICON_MAX_DIMENSION || height > ICON_MAX_DIMENSION {
        return Err(PassmanagerCommandError::new(
            "invalid_icon_payload: dimensions exceed 128x128",
            Some(ErrorCode::EmptyPayload),
        ));
    }

    Ok(())
}

fn sanitize_svg_payload(bytes: &[u8]) -> Result<Vec<u8>, PassmanagerCommandError> {
    let text = std::str::from_utf8(bytes).map_err(|_| {
        PassmanagerCommandError::new(
            "invalid_icon_payload: svg must be utf-8",
            Some(ErrorCode::EmptyPayload),
        )
    })?;

    let trimmed = text.trim();
    let lower = trimmed.to_ascii_lowercase();

    if !lower.contains("<svg") {
        return Err(PassmanagerCommandError::new(
            "invalid_icon_payload: svg root not found",
            Some(ErrorCode::EmptyPayload),
        ));
    }

    let forbidden = [
        "<script",
        "javascript:",
        "onload=",
        "onerror=",
        "<foreignobject",
    ];
    if forbidden.iter().any(|item| lower.contains(item)) {
        return Err(PassmanagerCommandError::new(
            "invalid_icon_payload: unsafe svg content",
            Some(ErrorCode::AccessDenied),
        ));
    }

    Ok(trimmed.as_bytes().to_vec())
}

pub(super) fn normalize_background_color_value(
    value: &serde_json::Value,
) -> Result<Option<String>, PassmanagerCommandError> {
    if value.is_null() {
        return Ok(None);
    }

    let Some(color) = value.as_str().map(str::trim).filter(|v| !v.is_empty()) else {
        return Err(PassmanagerCommandError::new(
            "invalid background_color",
            Some(ErrorCode::EmptyPayload),
        ));
    };

    if color.len() != 7 || !color.starts_with('#') {
        return Err(PassmanagerCommandError::new(
            "invalid background_color",
            Some(ErrorCode::EmptyPayload),
        ));
    }

    let hex = &color[1..];
    if !hex.chars().all(|c| c.is_ascii_hexdigit()) {
        return Err(PassmanagerCommandError::new(
            "invalid background_color",
            Some(ErrorCode::EmptyPayload),
        ));
    }

    Ok(Some(format!("#{}", hex.to_ascii_lowercase())))
}
