//! Icon subsystem for PassManager: parsing, storage, and GC.

use super::super::super::commands::{
    handle_catalog_delete, handle_catalog_download, handle_catalog_prepare_upload,
    handle_catalog_upload, with_system_shard_guard_bypass,
};
use super::super::super::types::RpcResponse;
use super::path::{
    ensure_passmanager_root_exists, is_valid_catalog_name, normalize_path_for_pm, now_unix_ms,
};
use crate::crypto::sha256_hex;
use crate::error::ErrorCode;
use crate::vault::VaultSession;
use base64::{engine::general_purpose, Engine as _};
use serde::{Deserialize, Serialize};

pub(super) const PASSMANAGER_ICONS_ENABLED: bool = true;
pub(super) const ICON_MAX_UPLOAD_BYTES: usize = 1024 * 1024;
const ICON_NORMALIZED_MAX_BYTES: usize = 64 * 1024;
const ICON_MAX_DIMENSION: u32 = 128;

pub(super) const PASSMANAGER_ICONS_DIR: &str = "/.passmanager/.icons";
pub(super) const PASSMANAGER_ICONS_INDEX_PATH: &str = "/.passmanager/.icons/index.json";

#[derive(Debug, Clone, Serialize, Deserialize)]
pub(super) struct IconIndexRecord {
    pub(super) sha256: String,
    pub(super) mime_type: String,
    pub(super) ext: String,
    pub(super) width: u32,
    pub(super) height: u32,
    pub(super) bytes: u64,
    pub(super) created_at: u64,
    pub(super) updated_at: u64,
}

#[derive(Debug, Clone, Default, Serialize, Deserialize)]
pub(super) struct IconIndexFile {
    #[serde(default)]
    pub(super) icons: Vec<IconIndexRecord>,
}

pub(super) fn passmanager_icons_disabled_response() -> RpcResponse {
    RpcResponse::error(
        "passmanager icons feature is disabled",
        Some(ErrorCode::AccessDenied),
    )
}

pub(super) fn is_valid_icon_ref(icon_ref: &str) -> bool {
    if !icon_ref.starts_with("sha256:") {
        return false;
    }
    let digest = icon_ref.trim_start_matches("sha256:");
    digest.len() == 64
        && digest
            .chars()
            .all(|c| c.is_ascii_hexdigit() && !c.is_ascii_uppercase())
}

pub(super) fn parse_icon_ref_sha(icon_ref: &str) -> Option<&str> {
    if !is_valid_icon_ref(icon_ref) {
        return None;
    }
    Some(icon_ref.trim_start_matches("sha256:"))
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

pub(super) fn decode_base64_payload(content: &str) -> Result<Vec<u8>, RpcResponse> {
    general_purpose::STANDARD_NO_PAD
        .decode(content)
        .or_else(|_| general_purpose::STANDARD.decode(content))
        .map_err(|_| {
            RpcResponse::error(
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

fn validate_icon_dimensions(width: u32, height: u32) -> Result<(), RpcResponse> {
    if width == 0 || height == 0 {
        return Err(RpcResponse::error(
            "invalid_icon_payload: zero dimensions",
            Some(ErrorCode::EmptyPayload),
        ));
    }

    if width > ICON_MAX_DIMENSION || height > ICON_MAX_DIMENSION {
        return Err(RpcResponse::error(
            "invalid_icon_payload: dimensions exceed 128x128",
            Some(ErrorCode::EmptyPayload),
        ));
    }

    Ok(())
}

fn sanitize_svg_payload(bytes: &[u8]) -> Result<Vec<u8>, RpcResponse> {
    let text = std::str::from_utf8(bytes).map_err(|_| {
        RpcResponse::error(
            "invalid_icon_payload: svg must be utf-8",
            Some(ErrorCode::EmptyPayload),
        )
    })?;

    let trimmed = text.trim();
    let lower = trimmed.to_ascii_lowercase();

    if !lower.contains("<svg") {
        return Err(RpcResponse::error(
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
        return Err(RpcResponse::error(
            "invalid_icon_payload: unsafe svg content",
            Some(ErrorCode::AccessDenied),
        ));
    }

    Ok(trimmed.as_bytes().to_vec())
}

pub(super) fn read_file_bytes_by_path(
    session: &VaultSession,
    storage: &crate::storage::Storage,
    path: &str,
) -> Result<Option<Vec<u8>>, RpcResponse> {
    let Some(node) = session.catalog().find_by_path(path) else {
        return Ok(None);
    };
    if !node.is_file() {
        return Ok(None);
    }

    let downloaded = with_system_shard_guard_bypass(|| {
        handle_catalog_download(
            session,
            &serde_json::json!({"node_id": node.node_id}),
            storage,
        )
    });
    if !downloaded.is_ok() {
        return Err(downloaded);
    }

    let content = downloaded
        .result()
        .and_then(|result| result.get("content"))
        .and_then(|v| v.as_str())
        .ok_or_else(|| {
            RpcResponse::error("File content missing", Some(ErrorCode::InternalError))
        })?;

    let bytes = general_purpose::STANDARD_NO_PAD
        .decode(content)
        .map_err(|e| {
            RpcResponse::error(
                format!("Failed to decode file content: {e}"),
                Some(ErrorCode::InternalError),
            )
        })?;

    Ok(Some(bytes))
}

pub(super) fn write_file_bytes_at_path(
    session: &mut VaultSession,
    storage: &crate::storage::Storage,
    parent_path: &str,
    name: &str,
    bytes: &[u8],
    mime_type: &str,
) -> RpcResponse {
    let prepared = with_system_shard_guard_bypass(|| {
        handle_catalog_prepare_upload(
            session,
            &serde_json::json!({
                "parent_path": parent_path,
                "name": name,
                "size": bytes.len() as u64,
                "mime_type": mime_type,
            }),
            storage,
        )
    });
    if !prepared.is_ok() {
        return prepared;
    }

    let Some(node_id) = prepared
        .result()
        .and_then(|result| result.get("node_id"))
        .and_then(|v| v.as_u64())
    else {
        return RpcResponse::error("upload node_id missing", Some(ErrorCode::InternalError));
    };

    with_system_shard_guard_bypass(|| {
        handle_catalog_upload(
            session,
            &serde_json::json!({
                "node_id": node_id,
                "content": general_purpose::STANDARD_NO_PAD.encode(bytes),
            }),
            storage,
        )
    })
}

fn ensure_directory_exists(session: &mut VaultSession, path: &str) -> Result<(), RpcResponse> {
    use super::super::super::commands::handle_catalog_create_dir;

    let normalized = normalize_path_for_pm(path);
    if normalized == "/" {
        return Ok(());
    }

    let mut parent = "/".to_string();
    for segment in normalized.split('/').filter(|s| !s.is_empty()) {
        if !is_valid_catalog_name(segment) {
            return Err(RpcResponse::error(
                "Invalid path segment",
                Some(ErrorCode::InvalidPath),
            ));
        }

        let current = if parent == "/" {
            format!("/{segment}")
        } else {
            format!("{parent}/{segment}")
        };

        if session.catalog().find_by_path(&current).is_none() {
            let created = with_system_shard_guard_bypass(|| {
                handle_catalog_create_dir(
                    session,
                    &serde_json::json!({
                        "name": segment,
                        "parent_path": parent,
                    }),
                )
            });
            if !created.is_ok() {
                return Err(created);
            }
        }

        parent = current;
    }

    Ok(())
}

pub(super) fn ensure_icons_dir_exists(session: &mut VaultSession) -> Result<(), RpcResponse> {
    ensure_passmanager_root_exists(session)?;
    ensure_directory_exists(session, PASSMANAGER_ICONS_DIR)
}

pub(super) fn load_icon_index(
    session: &VaultSession,
    storage: &crate::storage::Storage,
) -> Result<IconIndexFile, RpcResponse> {
    let Some(bytes) = read_file_bytes_by_path(session, storage, PASSMANAGER_ICONS_INDEX_PATH)?
    else {
        return Ok(IconIndexFile::default());
    };

    let index = serde_json::from_slice::<IconIndexFile>(&bytes).map_err(|e| {
        RpcResponse::error(
            format!("Failed to parse icon index: {e}"),
            Some(ErrorCode::InternalError),
        )
    })?;
    Ok(index)
}

pub(super) fn save_icon_index(
    session: &mut VaultSession,
    storage: &crate::storage::Storage,
    index: &IconIndexFile,
) -> RpcResponse {
    let bytes = match serde_json::to_vec(index) {
        Ok(v) => v,
        Err(e) => {
            return RpcResponse::error(
                format!("Failed to serialize icon index: {e}"),
                Some(ErrorCode::InternalError),
            )
        }
    };

    write_file_bytes_at_path(
        session,
        storage,
        PASSMANAGER_ICONS_DIR,
        "index.json",
        &bytes,
        "application/json",
    )
}

pub(super) fn handle_put(
    s: &mut VaultSession,
    storage: &crate::storage::Storage,
    data: &serde_json::Value,
) -> RpcResponse {
    if !PASSMANAGER_ICONS_ENABLED {
        return passmanager_icons_disabled_response();
    }

    let Some(content_base64) = data.get("content_base64").and_then(|v| v.as_str()) else {
        return RpcResponse::error("content_base64 is required", Some(ErrorCode::EmptyPayload));
    };

    let mut payload = match decode_base64_payload(content_base64) {
        Ok(bytes) => bytes,
        Err(resp) => return resp,
    };
    if payload.is_empty() {
        return RpcResponse::error("invalid_icon_payload: empty", Some(ErrorCode::EmptyPayload));
    }
    if payload.len() > ICON_MAX_UPLOAD_BYTES {
        return RpcResponse::error("payload_too_large", Some(ErrorCode::EmptyPayload));
    }

    let requested_mime = data
        .get("mime_type")
        .and_then(|v| v.as_str())
        .map(str::trim)
        .filter(|v| !v.is_empty());
    let mime_type = match requested_mime {
        Some(m) => m,
        None => detect_icon_mime_type(&payload).unwrap_or(""),
    };
    if icon_ext_for_mime(mime_type).is_none() {
        return RpcResponse::error(
            "invalid_icon_payload: unsupported mime type",
            Some(ErrorCode::EmptyPayload),
        );
    }

    if mime_type == "image/svg+xml" {
        payload = match sanitize_svg_payload(&payload) {
            Ok(bytes) => bytes,
            Err(resp) => return resp,
        };
    }

    let Some((width, height)) = icon_dimensions_for_mime(mime_type, &payload) else {
        return RpcResponse::error(
            "invalid_icon_payload: unsupported dimensions",
            Some(ErrorCode::EmptyPayload),
        );
    };
    if let Err(resp) = validate_icon_dimensions(width, height) {
        return resp;
    }
    if payload.len() > ICON_NORMALIZED_MAX_BYTES {
        return RpcResponse::error("payload_too_large", Some(ErrorCode::EmptyPayload));
    }

    let Some(ext) = icon_ext_for_mime(mime_type) else {
        return RpcResponse::error(
            "invalid_icon_payload: unsupported mime type",
            Some(ErrorCode::EmptyPayload),
        );
    };

    let digest = sha256_hex(&payload);
    let icon_ref = format!("sha256:{digest}");
    let now = now_unix_ms();
    let payload_len = payload.len() as u64;

    if let Err(resp) = ensure_icons_dir_exists(s) {
        return resp;
    }

    let mut index = match load_icon_index(s, storage) {
        Ok(idx) => idx,
        Err(resp) => return resp,
    };

    if let Some(existing_idx) = index.icons.iter().position(|item| item.sha256 == digest) {
        let (resp_mime, resp_width, resp_height, resp_bytes) = {
            let existing = &mut index.icons[existing_idx];
            existing.updated_at = now;
            if existing.mime_type.is_empty() {
                existing.mime_type = mime_type.to_string();
            }
            if existing.ext.is_empty() {
                existing.ext = ext.to_string();
            }
            if existing.width == 0 {
                existing.width = width;
            }
            if existing.height == 0 {
                existing.height = height;
            }
            if existing.bytes == 0 {
                existing.bytes = payload_len;
            }
            (
                existing.mime_type.clone(),
                existing.width,
                existing.height,
                existing.bytes,
            )
        };

        let saved = save_icon_index(s, storage, &index);
        if !saved.is_ok() {
            return saved;
        }

        return RpcResponse::success(serde_json::json!({
            "icon_ref": icon_ref,
            "mime_type": resp_mime,
            "width": resp_width,
            "height": resp_height,
            "bytes": resp_bytes,
        }));
    }

    let filename = format!("{digest}.{ext}");
    let asset_path = format!("{PASSMANAGER_ICONS_DIR}/{filename}");
    if s.catalog().find_by_path(&asset_path).is_none() {
        let write_resp = write_file_bytes_at_path(
            s,
            storage,
            PASSMANAGER_ICONS_DIR,
            &filename,
            &payload,
            mime_type,
        );
        if !write_resp.is_ok() {
            return write_resp;
        }
    }

    index.icons.push(IconIndexRecord {
        sha256: digest,
        mime_type: mime_type.to_string(),
        ext: ext.to_string(),
        width,
        height,
        bytes: payload_len,
        created_at: now,
        updated_at: now,
    });

    let saved = save_icon_index(s, storage, &index);
    if !saved.is_ok() {
        return saved;
    }

    RpcResponse::success(serde_json::json!({
        "icon_ref": icon_ref,
        "mime_type": mime_type,
        "width": width,
        "height": height,
        "bytes": payload_len,
    }))
}

pub(super) fn handle_get(
    s: &VaultSession,
    storage: &crate::storage::Storage,
    data: &serde_json::Value,
) -> RpcResponse {
    if !PASSMANAGER_ICONS_ENABLED {
        return passmanager_icons_disabled_response();
    }

    let Some(icon_ref) = data
        .get("icon_ref")
        .and_then(|v| v.as_str())
        .map(str::trim)
        .filter(|v| !v.is_empty())
    else {
        return RpcResponse::error("icon_ref is required", Some(ErrorCode::EmptyPayload));
    };
    let Some(sha) = parse_icon_ref_sha(icon_ref) else {
        return RpcResponse::error("invalid icon_ref format", Some(ErrorCode::EmptyPayload));
    };

    let index = match load_icon_index(s, storage) {
        Ok(idx) => idx,
        Err(resp) => return resp,
    };

    let Some(record) = index.icons.iter().find(|item| item.sha256 == sha) else {
        return RpcResponse::error("icon_not_found", Some(ErrorCode::NodeNotFound));
    };

    let asset_path = format!("{PASSMANAGER_ICONS_DIR}/{}.{}", record.sha256, record.ext);

    let Some(bytes) = (match read_file_bytes_by_path(s, storage, &asset_path) {
        Ok(v) => v,
        Err(resp) => {
            return resp;
        }
    }) else {
        return RpcResponse::error("icon_not_found", Some(ErrorCode::NodeNotFound));
    };

    RpcResponse::success(serde_json::json!({
        "icon_ref": format!("sha256:{}", record.sha256),
        "mime_type": record.mime_type,
        "content_base64": general_purpose::STANDARD_NO_PAD.encode(bytes),
    }))
}

pub(super) fn handle_list(
    s: &VaultSession,
    storage: &crate::storage::Storage,
    _data: &serde_json::Value,
) -> RpcResponse {
    if !PASSMANAGER_ICONS_ENABLED {
        return passmanager_icons_disabled_response();
    }

    let mut icons = match load_icon_index(s, storage) {
        Ok(idx) => idx.icons,
        Err(resp) => return resp,
    };

    icons.sort_by(|a, b| {
        b.updated_at
            .cmp(&a.updated_at)
            .then_with(|| b.created_at.cmp(&a.created_at))
            .then_with(|| a.sha256.cmp(&b.sha256))
    });

    let result = icons
        .into_iter()
        .map(|item| {
            serde_json::json!({
                "icon_ref": format!("sha256:{}", item.sha256),
                "mime_type": item.mime_type,
                "width": item.width,
                "height": item.height,
                "bytes": item.bytes,
                "created_at": item.created_at,
                "updated_at": item.updated_at,
            })
        })
        .collect::<Vec<_>>();

    RpcResponse::success(serde_json::json!({"icons": result}))
}

pub(super) fn handle_gc(
    s: &mut VaultSession,
    storage: &crate::storage::Storage,
    _data: &serde_json::Value,
) -> RpcResponse {
    if !PASSMANAGER_ICONS_ENABLED {
        return passmanager_icons_disabled_response();
    }

    if let Err(resp) = ensure_passmanager_root_exists(s) {
        return resp;
    }

    let index = match load_icon_index(s, storage) {
        Ok(idx) => idx,
        Err(resp) => return resp,
    };
    if index.icons.is_empty() {
        return RpcResponse::success(serde_json::json!({"deleted": 0u64}));
    }

    let entry_refs = super::group::collect_reachable_entry_icon_refs(s, storage);
    let group_meta = match super::group::load_group_meta_map(s, storage) {
        Ok(map) => map,
        Err(resp) => return resp,
    };

    let mut reachable_sha = std::collections::HashSet::<String>::new();
    for icon_ref in entry_refs {
        if let Some(sha) = parse_icon_ref_sha(&icon_ref) {
            reachable_sha.insert(sha.to_string());
        }
    }
    for icon_ref in group_meta.values() {
        if let Some(sha) = parse_icon_ref_sha(icon_ref) {
            reachable_sha.insert(sha.to_string());
        }
    }

    let mut deleted = 0u64;
    let mut kept = Vec::<IconIndexRecord>::new();
    for record in index.icons {
        if reachable_sha.contains(&record.sha256) {
            kept.push(record);
            continue;
        }

        let asset_path = format!("{PASSMANAGER_ICONS_DIR}/{}.{}", record.sha256, record.ext);
        let node_id = s
            .catalog()
            .find_by_path(&asset_path)
            .map(|node| node.node_id);
        if let Some(node_id) = node_id {
            let deleted_resp = with_system_shard_guard_bypass(|| {
                handle_catalog_delete(s, &serde_json::json!({"node_id": node_id}), storage)
            });
            if !deleted_resp.is_ok() {
                return deleted_resp;
            }
        }
        deleted += 1;
    }

    let save_resp = save_icon_index(s, storage, &IconIndexFile { icons: kept });
    if !save_resp.is_ok() {
        return save_resp;
    }

    RpcResponse::success(serde_json::json!({"deleted": deleted}))
}
