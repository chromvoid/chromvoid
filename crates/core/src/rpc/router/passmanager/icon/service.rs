use base64::{engine::general_purpose, Engine as _};

use super::normalize::NormalizedIconPayload;
use super::parse_icon_ref_sha;
use super::request::{IconGetRequest, IconPutRequest, IconSetMetaRequest};
use super::store::{ensure_icons_dir_exists_uow, load_icon_index, stage_save_icon_index};
use super::types::{
    IconGetResult, IconIndexRecord, IconListItem, IconListResult, IconPutResult,
    PASSMANAGER_ICONS_DIR,
};
use crate::crypto::sha256_hex;
use crate::rpc::router::domain_uow::DomainUnitOfWork;
use crate::rpc::router::passmanager::error::PassmanagerCommandError;
use crate::rpc::router::passmanager::file_store::{
    read_file_bytes_by_path, stage_file_bytes_at_path,
};
use crate::rpc::router::passmanager::path::now_unix_ms;
use crate::storage::Storage;
use crate::vault::VaultSession;

pub(super) fn put_icon(
    session: &VaultSession,
    storage: &Storage,
    uow: &mut DomainUnitOfWork<'_>,
    request: IconPutRequest,
    normalized: NormalizedIconPayload,
) -> Result<IconPutResult, PassmanagerCommandError> {
    let digest = sha256_hex(&normalized.bytes);
    let icon_ref = format!("sha256:{digest}");
    let now = now_unix_ms();
    let payload_len = normalized.bytes.len() as u64;
    let background_color = request.background_color;

    ensure_icons_dir_exists_uow(uow)?;

    let mut index = load_icon_index(session, storage)?;

    if let Some(existing_idx) = index.icons.iter().position(|item| item.sha256 == digest) {
        let (mime_type, width, height, bytes, result_background_color) = {
            let existing = &mut index.icons[existing_idx];
            existing.updated_at = now;
            if existing.mime_type.is_empty() {
                existing.mime_type = normalized.mime_type.clone();
            }
            if existing.ext.is_empty() {
                existing.ext = normalized.ext.clone();
            }
            if existing.width == 0 {
                existing.width = normalized.width;
            }
            if existing.height == 0 {
                existing.height = normalized.height;
            }
            if existing.bytes == 0 {
                existing.bytes = payload_len;
            }
            if let Some(background_color) = background_color.clone() {
                existing.background_color = Some(background_color);
            }
            (
                existing.mime_type.clone(),
                existing.width,
                existing.height,
                existing.bytes,
                existing.background_color.clone(),
            )
        };

        stage_save_icon_index(uow, &index)?;

        return Ok(IconPutResult {
            icon_ref,
            mime_type,
            width,
            height,
            bytes,
            background_color: result_background_color,
        });
    }

    let filename = format!("{}.{}", digest, normalized.ext);
    let asset_path = format!("{PASSMANAGER_ICONS_DIR}/{filename}");
    if uow.catalog().find_by_path(&asset_path).is_none() {
        stage_file_bytes_at_path(
            uow,
            PASSMANAGER_ICONS_DIR,
            &filename,
            &normalized.bytes,
            &normalized.mime_type,
        )?;
    }

    index.icons.push(IconIndexRecord {
        sha256: digest,
        mime_type: normalized.mime_type.clone(),
        ext: normalized.ext.clone(),
        width: normalized.width,
        height: normalized.height,
        bytes: payload_len,
        background_color: background_color.clone(),
        created_at: now,
        updated_at: now,
    });

    stage_save_icon_index(uow, &index)?;

    Ok(IconPutResult {
        icon_ref,
        mime_type: normalized.mime_type,
        width: normalized.width,
        height: normalized.height,
        bytes: payload_len,
        background_color,
    })
}

pub(super) fn get_icon(
    session: &VaultSession,
    storage: &Storage,
    request: IconGetRequest,
) -> Result<IconGetResult, PassmanagerCommandError> {
    let Some(sha) = parse_icon_ref_sha(&request.icon_ref) else {
        return Err(PassmanagerCommandError::empty_payload(
            "invalid icon_ref format",
        ));
    };

    let index = load_icon_index(session, storage)?;

    let Some(record) = index.icons.iter().find(|item| item.sha256 == sha) else {
        return Err(PassmanagerCommandError::node_not_found("icon_not_found"));
    };

    let asset_path = format!("{PASSMANAGER_ICONS_DIR}/{}.{}", record.sha256, record.ext);
    let Some(bytes) = read_file_bytes_by_path(session, storage, &asset_path)? else {
        return Err(PassmanagerCommandError::node_not_found("icon_not_found"));
    };

    Ok(IconGetResult {
        icon_ref: format!("sha256:{}", record.sha256),
        mime_type: record.mime_type.clone(),
        background_color: record.background_color.clone(),
        content_base64: general_purpose::STANDARD_NO_PAD.encode(bytes),
    })
}

pub(super) fn list_icons(
    session: &VaultSession,
    storage: &Storage,
) -> Result<IconListResult, PassmanagerCommandError> {
    let mut icons = load_icon_index(session, storage)?.icons;

    icons.sort_by(|a, b| {
        b.updated_at
            .cmp(&a.updated_at)
            .then_with(|| b.created_at.cmp(&a.created_at))
            .then_with(|| a.sha256.cmp(&b.sha256))
    });

    let icons = icons
        .into_iter()
        .map(|item| IconListItem {
            icon_ref: format!("sha256:{}", item.sha256),
            mime_type: item.mime_type,
            width: item.width,
            height: item.height,
            bytes: item.bytes,
            background_color: item.background_color,
            created_at: item.created_at,
            updated_at: item.updated_at,
        })
        .collect();

    Ok(IconListResult { icons })
}

pub(super) fn set_icon_meta(
    session: &VaultSession,
    storage: &Storage,
    uow: &mut DomainUnitOfWork<'_>,
    request: IconSetMetaRequest,
) -> Result<(), PassmanagerCommandError> {
    let Some(sha) = parse_icon_ref_sha(&request.icon_ref) else {
        return Err(PassmanagerCommandError::empty_payload(
            "invalid icon_ref format",
        ));
    };

    let mut index = load_icon_index(session, storage)?;

    let Some(record) = index.icons.iter_mut().find(|item| item.sha256 == sha) else {
        return Err(PassmanagerCommandError::node_not_found("icon_not_found"));
    };
    record.background_color = request.background_color;

    stage_save_icon_index(uow, &index)
}
