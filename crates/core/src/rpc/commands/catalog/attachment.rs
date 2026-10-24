//! Shared destination preparation. File bytes still use the ordinary create-only upload.
use base64::{engine::general_purpose::URL_SAFE_NO_PAD, Engine};
use percent_encoding::{utf8_percent_encode, NON_ALPHANUMERIC};
use serde_json::Value;

use super::crud::create_catalog_dir;
use crate::error::ErrorCode;
use crate::rpc::commands::{is_system_path_guarded, normalize_path, system_shard_denied};
use crate::rpc::types::{CatalogAttachmentRequest, CatalogAttachmentResponse, RpcResponse};
use crate::vault::VaultSession;

pub fn handle_catalog_attachment_prepare(session: &mut VaultSession, data: &Value) -> RpcResponse {
    let request: CatalogAttachmentRequest = match serde_json::from_value(data.clone()) {
        Ok(request) => request,
        Err(_) => return invalid(),
    };
    let folder = request.folder_path.trim();
    if !folder.starts_with('/')
        || folder.contains('\\')
        || folder.chars().any(char::is_control)
        || folder.split('/').any(|part| part == "." || part == "..")
    {
        return invalid();
    }
    let folder = normalize_path(folder);
    if folder == "/" {
        return invalid();
    }
    if is_system_path_guarded(&folder) {
        return system_shard_denied();
    }
    // Admission is based on source metadata, not a claim that arbitrary image bytes decode.
    let mime = request.mime_type.trim().to_ascii_lowercase();
    if !mime.starts_with("image/") || mime.len() <= 6 || mime.chars().any(char::is_whitespace) {
        return invalid();
    }
    let source_name = request.file_name.rsplit(['/', '\\']).next().unwrap_or("");
    let (stem, suffix) = source_name.rsplit_once('.').unwrap_or((source_name, ""));
    let extension = if !suffix.is_empty()
        && suffix.len() <= 10
        && suffix.chars().all(|c| c.is_ascii_alphanumeric())
    {
        suffix.to_ascii_lowercase()
    } else {
        match mime.as_str() {
            "image/jpeg" => "jpg",
            "image/png" => "png",
            "image/gif" => "gif",
            "image/webp" => "webp",
            "image/avif" => "avif",
            "image/heic" => "heic",
            "image/heif" => "heif",
            "image/tiff" => "tiff",
            "image/bmp" => "bmp",
            "image/svg+xml" => "svg",
            _ => return invalid(),
        }
        .into()
    };
    let stem: String = stem
        .chars()
        .take(80)
        .map(|c| {
            if c.is_alphanumeric() || c == '_' || c == '-' {
                c
            } else {
                '-'
            }
        })
        .collect();
    let stem = stem.trim_matches('-');
    let stem = if stem.is_empty() { "image" } else { stem };
    let mut random = [0_u8; 16];
    if getrandom::getrandom(&mut random).is_err() {
        return RpcResponse::error(
            "Attachment name could not be prepared",
            Some(ErrorCode::InternalError),
        );
    }
    let name = format!("{stem}-{}.{}", URL_SAFE_NO_PAD.encode(random), extension);
    let path = format!("{folder}/{name}");
    // Encode separators used by Markdown/URL syntax, including literal percent signs.
    // Retain slashes so the existing renderer classifies a vault-absolute image target.
    const PATH: &percent_encoding::AsciiSet = &NON_ALPHANUMERIC
        .remove(b'/')
        .remove(b'-')
        .remove(b'_')
        .remove(b'.')
        .remove(b'~');
    let markdown = format!(
        "![{}](<{}>)",
        stem.replace('_', "\\_"),
        utf8_percent_encode(&path, PATH)
    );

    // A failed later directory creation must not leave earlier catalog edits in memory.
    // The router's normal mutation wrapper handles persistence failure rollback.
    let snapshot = session.snapshot_persistence_state();
    let mut parent = String::from("/");
    for segment in folder.split('/').filter(|segment| !segment.is_empty()) {
        let current = format!("{}/{segment}", parent.trim_end_matches('/'));
        if let Some(existing) = session.catalog().find_by_path(&current) {
            if !existing.is_dir() {
                let (catalog, dirty, deltas) = snapshot;
                session.restore_persistence_state(catalog, dirty, deltas);
                return RpcResponse::error(
                    "Attachment folder contains a file",
                    Some(ErrorCode::NotADir),
                );
            }
        } else {
            let response = create_catalog_dir(session, &parent, segment);
            if !response.is_ok() {
                let (catalog, dirty, deltas) = snapshot;
                session.restore_persistence_state(catalog, dirty, deltas);
                return response;
            }
        }
        parent = current;
    }
    RpcResponse::success(CatalogAttachmentResponse {
        parent_path: folder,
        name,
        mime_type: mime,
        path,
        markdown,
    })
}

fn invalid() -> RpcResponse {
    RpcResponse::error(
        "Choose an image and an absolute attachment folder",
        Some(ErrorCode::EmptyPayload),
    )
}
