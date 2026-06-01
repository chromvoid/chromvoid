use std::collections::BTreeMap;

use super::super::error::PassmanagerCommandError;
use super::super::file_store::{read_file_bytes_by_path, stage_file_bytes_at_path};
use super::super::icon::is_valid_icon_ref;
use super::super::path::{
    map_entry_group_path_to_passmanager_path, validate_passmanager_group_path,
};
use super::types::{
    GroupMetaFile, GroupMetaLoadError, GroupMetaRecord, GroupMetaValue, PASSMANAGER_GROUP_META_PATH,
};
use crate::error::ErrorCode;
use crate::rpc::router::domain_uow::DomainUnitOfWork;
use crate::vault::VaultSession;

pub(in crate::rpc::router::passmanager) fn normalize_group_meta_path(path: &str) -> Option<String> {
    let pm_path = map_entry_group_path_to_passmanager_path(Some(path))?;
    if !validate_passmanager_group_path(&pm_path) {
        return None;
    }

    if pm_path == "/.passmanager" {
        return Some("/".to_string());
    }

    let rel = pm_path.trim_start_matches("/.passmanager/");
    if rel.is_empty() {
        Some("/".to_string())
    } else {
        Some(format!("/{rel}"))
    }
}

pub(in crate::rpc::router::passmanager) fn normalize_group_meta_description(
    value: &str,
) -> Option<String> {
    let normalized = value.trim();
    if normalized.is_empty() {
        None
    } else {
        Some(normalized.to_string())
    }
}

pub(in crate::rpc::router::passmanager) fn load_group_meta_map_typed(
    session: &VaultSession,
    storage: &crate::storage::Storage,
) -> Result<BTreeMap<String, GroupMetaValue>, GroupMetaLoadError> {
    let Some(bytes) = read_file_bytes_by_path(session, storage, PASSMANAGER_GROUP_META_PATH)?
    else {
        return Ok(BTreeMap::new());
    };

    let parsed = serde_json::from_slice::<GroupMetaFile>(&bytes).map_err(|e| {
        PassmanagerCommandError::internal(format!("Failed to parse group meta index: {e}"))
    })?;

    let mut map = BTreeMap::new();
    for item in parsed.groups {
        let Some(path) = normalize_group_meta_path(&item.path) else {
            continue;
        };
        let GroupMetaValue {
            icon_ref,
            description,
        } = item.meta;
        let icon_ref = icon_ref.filter(|icon_ref| is_valid_icon_ref(icon_ref));
        let description = description
            .as_deref()
            .and_then(normalize_group_meta_description);
        if icon_ref.is_some() || description.is_some() {
            map.insert(
                path,
                GroupMetaValue {
                    icon_ref,
                    description,
                },
            );
        }
    }

    Ok(map)
}

pub(in crate::rpc::router::passmanager) fn stage_group_meta_map(
    uow: &mut DomainUnitOfWork<'_>,
    map: &BTreeMap<String, GroupMetaValue>,
) -> Result<(), PassmanagerCommandError> {
    let payload = GroupMetaFile {
        groups: map
            .iter()
            .filter(|(_, meta)| meta.icon_ref.is_some() || meta.description.is_some())
            .map(|(path, meta)| GroupMetaRecord {
                path: path.clone(),
                meta: meta.clone(),
            })
            .collect(),
    };

    let bytes = serde_json::to_vec(&payload).map_err(|e| {
        PassmanagerCommandError::new(
            format!("Failed to serialize group meta index: {e}"),
            Some(ErrorCode::InternalError),
        )
    })?;

    stage_file_bytes_at_path(
        uow,
        "/.passmanager",
        ".groups-meta.json",
        &bytes,
        "application/json",
    )
}
