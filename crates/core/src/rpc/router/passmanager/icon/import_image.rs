//! Archive image decoding stays in Core; the ordinary icon validator remains authoritative.
use super::super::error::PassmanagerCommandError;
use base64::{engine::general_purpose, Engine as _};
use image::{ImageFormat, ImageReader};
use serde_json::{json, Value};
use std::io::Cursor;

pub(in crate::rpc::router::passmanager) fn normalize_import_image(
    bytes: &[u8],
) -> Result<Value, PassmanagerCommandError> {
    let invalid = || PassmanagerCommandError::empty_payload("Unsupported imported icon");
    if bytes.is_empty() || bytes.len() > 1024 * 1024 {
        return Err(invalid());
    }
    let is_svg = std::str::from_utf8(bytes).is_ok_and(|text| {
        text.trim_start().starts_with("<svg") || text.trim_start().starts_with("<?xml")
    });
    let (content, mime) = if is_svg {
        (bytes.to_vec(), "image/svg+xml")
    } else {
        let mut reader = ImageReader::new(Cursor::new(bytes))
            .with_guessed_format()
            .map_err(|_| invalid())?;
        let format = reader.format().ok_or_else(invalid)?;
        let mut limits = image::Limits::default();
        limits.max_image_width = Some(2048);
        limits.max_image_height = Some(2048);
        limits.max_alloc = Some(32 * 1024 * 1024);
        reader.limits(limits);
        let decoded = reader.decode().map_err(|_| invalid())?;
        if decoded.width() <= 128
            && decoded.height() <= 128
            && bytes.len() <= 64 * 1024
            && matches!(
                format,
                ImageFormat::Png | ImageFormat::WebP | ImageFormat::Ico
            )
        {
            (bytes.to_vec(), format.to_mime_type())
        } else {
            let mut output = Cursor::new(Vec::new());
            let thumbnail = image::DynamicImage::ImageRgba8(
                decoded
                    .thumbnail(decoded.width().min(128), decoded.height().min(128))
                    .to_rgba8(),
            );
            drop(decoded);
            thumbnail
                .write_to(&mut output, ImageFormat::Png)
                .map_err(|_| invalid())?;
            if output.get_ref().len() > 64 * 1024 {
                output = Cursor::new(Vec::new());
                thumbnail
                    .thumbnail(112, 112)
                    .write_to(&mut output, ImageFormat::Png)
                    .map_err(|_| invalid())?;
            }
            (output.into_inner(), "image/png")
        }
    };
    let mut asset =
        json!({"content_base64":general_purpose::STANDARD_NO_PAD.encode(content),"mime_type":mime});
    let normalized = super::normalize::normalize_upload_payload(&asset)?;
    asset["content_base64"] = json!(general_purpose::STANDARD_NO_PAD.encode(&normalized.bytes));
    asset["icon_ref"] = json!(format!(
        "sha256:{}",
        crate::crypto::sha256_hex(&normalized.bytes)
    ));
    Ok(asset)
}
