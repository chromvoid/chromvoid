use base64::{engine::general_purpose, Engine as _};

use super::normalize::NormalizedIconPayload;
use super::parse_icon_ref_sha;
use super::request::{IconGetManyRequest, IconGetRequest, IconPutRequest, IconSetMetaRequest};
use super::store::{ensure_icons_dir_exists_uow, load_icon_index, stage_save_icon_index};
use super::types::{
    IconGetManyResult, IconGetResult, IconListItem, IconListResult, IconPutResult,
    PASSMANAGER_ICONS_DIR,
};
use crate::rpc::router::domain_uow::DomainUnitOfWork;
use crate::rpc::router::passmanager::error::PassmanagerCommandError;
use crate::rpc::router::passmanager::file_store::{
    read_file_bytes_by_path, stage_file_bytes_at_path,
};
use crate::storage::Storage;
use crate::vault::VaultSession;

pub(super) fn put_icon(
    session: &VaultSession,
    storage: &Storage,
    uow: &mut DomainUnitOfWork<'_>,
    request: IconPutRequest,
    normalized: NormalizedIconPayload,
) -> Result<IconPutResult, PassmanagerCommandError> {
    ensure_icons_dir_exists_uow(uow)?;
    let mut index = load_icon_index(session, storage)?;
    let (record, inserted) =
        super::index::upsert(&mut index, &normalized, request.background_color);
    if inserted {
        let filename = format!("{}.{}", record.sha256, record.ext);
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
    }
    stage_save_icon_index(uow, &index)?;
    Ok(IconPutResult {
        icon_ref: format!("sha256:{}", record.sha256),
        mime_type: record.mime_type,
        width: record.width,
        height: record.height,
        bytes: record.bytes,
        background_color: record.background_color,
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

pub(super) fn get_icons(
    session: &VaultSession,
    storage: &Storage,
    request: IconGetManyRequest,
) -> Result<IconGetManyResult, PassmanagerCommandError> {
    let index = load_icon_index(session, storage)?;
    let mut icons = Vec::with_capacity(request.icon_refs.len());
    let mut missing_icon_refs = Vec::new();

    for icon_ref in request.icon_refs {
        let sha =
            parse_icon_ref_sha(&icon_ref).expect("icon refs are validated during request parsing");
        let Some(record) = index.icons.iter().find(|item| item.sha256 == sha) else {
            missing_icon_refs.push(icon_ref);
            continue;
        };

        let asset_path = format!("{PASSMANAGER_ICONS_DIR}/{}.{}", record.sha256, record.ext);
        let Some(bytes) = read_file_bytes_by_path(session, storage, &asset_path)? else {
            missing_icon_refs.push(icon_ref);
            continue;
        };

        icons.push(IconGetResult {
            icon_ref,
            mime_type: record.mime_type.clone(),
            background_color: record.background_color.clone(),
            content_base64: general_purpose::STANDARD_NO_PAD.encode(bytes),
        });
    }

    Ok(IconGetManyResult {
        icons,
        missing_icon_refs,
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
