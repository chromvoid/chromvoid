use std::collections::HashSet;

use super::parse_icon_ref_sha;
use super::store::{load_icon_index, stage_save_icon_index};
use super::types::{IconGcResult, IconIndexFile, IconIndexRecord, PASSMANAGER_ICONS_DIR};
use crate::rpc::router::domain_uow::DomainUnitOfWork;
use crate::rpc::router::passmanager::error::PassmanagerCommandError;
use crate::rpc::router::passmanager::group;
use crate::storage::Storage;
use crate::vault::VaultSession;

pub(super) fn collect_garbage(
    session: &VaultSession,
    storage: &Storage,
    uow: &mut DomainUnitOfWork<'_>,
) -> Result<IconGcResult, PassmanagerCommandError> {
    uow.ensure_dir("/.passmanager").map_err(|error| {
        PassmanagerCommandError::from_domain_uow_error(error, "Failed to ensure PassManager root")
    })?;

    let index = load_icon_index(session, storage)?;
    if index.icons.is_empty() {
        return Ok(IconGcResult { deleted: 0 });
    }

    let entry_refs = group::collect_reachable_entry_icon_refs(session, storage);
    let group_meta = group::load_group_meta_map_typed(session, storage)?;

    let mut reachable_sha = HashSet::<String>::new();
    for icon_ref in entry_refs {
        if let Some(sha) = parse_icon_ref_sha(&icon_ref) {
            reachable_sha.insert(sha.to_string());
        }
    }
    for meta in group_meta.values() {
        let Some(icon_ref) = meta.icon_ref.as_deref() else {
            continue;
        };
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
        let node_id = session
            .catalog()
            .find_by_path(&asset_path)
            .map(|node| node.node_id);
        if let Some(node_id) = node_id {
            uow.stage_delete_node(node_id).map_err(|error| {
                PassmanagerCommandError::from_domain_uow_error(error, "Failed to delete icon")
            })?;
        }
        deleted += 1;
    }

    stage_save_icon_index(uow, &IconIndexFile { icons: kept })?;

    Ok(IconGcResult { deleted })
}
