//! Bounded browsing and atomic subtree rename over the existing group/catalog owner.
use super::super::{entry, error::PassmanagerCommandError as Error, path};
use super::{meta_store, service};
use crate::{
    rpc::{
        router::domain_uow::DomainUnitOfWork,
        types::{
            PassmanagerGroupPageRequest, PassmanagerGroupPageResponse,
            PassmanagerGroupRenameRequest,
        },
    },
    storage::Storage,
    vault::VaultSession,
};

pub(in crate::rpc::router::passmanager) fn existing_group_path(
    session: &VaultSession,
    raw: &str,
) -> Result<String, Error> {
    let normalized = meta_store::normalize_group_meta_path(raw)
        .ok_or_else(|| Error::invalid_path("Invalid group path"))?;
    if normalized == "/" {
        return Ok(normalized);
    }
    if !service::list_group_paths(session).contains(&normalized) {
        return Err(Error::node_not_found("Group is unavailable"));
    }
    Ok(normalized)
}

pub(in crate::rpc::router::passmanager) fn read_page(
    session: &VaultSession,
    data: &serde_json::Value,
) -> Result<PassmanagerGroupPageResponse, Error> {
    let request: PassmanagerGroupPageRequest = serde_json::from_value(data.clone())
        .map_err(|_| Error::empty_payload("Invalid group page"))?;
    if !(1..=100).contains(&request.limit) {
        return Err(Error::empty_payload("Invalid group page limit"));
    }
    let parent = existing_group_path(session, &request.parent)?;
    let children: Vec<_> = service::list_group_summaries(session)
        .into_iter()
        .filter(|group| {
            let owner = group
                .path
                .rsplit_once('/')
                .map(|(p, _)| if p.is_empty() { "/" } else { p });
            owner == Some(parent.as_str())
        })
        .collect();
    let mut result = PassmanagerGroupPageResponse {
        parent,
        groups: Vec::new(),
        next_offset: None,
    };
    let mut bytes = serde_json::to_vec(&result)
        .map_err(|_| Error::internal("Group page encoding failed"))?
        .len()
        + 32;
    if bytes >= 512 * 1024 {
        return Err(Error::internal("Group exceeds page capacity"));
    }
    for (index, group) in children.iter().enumerate().skip(request.offset as usize) {
        let size = serde_json::to_vec(group)
            .map_err(|_| Error::internal("Group encoding failed"))?
            .len()
            + 1;
        if bytes + size > 512 * 1024 || result.groups.len() == request.limit as usize {
            if result.groups.is_empty() {
                return Err(Error::internal("Group exceeds page capacity"));
            }
            result.next_offset = Some(
                u32::try_from(index)
                    .map_err(|_| Error::internal("Group catalog exceeds page capacity"))?,
            );
            break;
        }
        bytes += size;
        result.groups.push(group.clone());
    }
    Ok(result)
}

pub(in crate::rpc::router::passmanager) fn rename(
    session: &VaultSession,
    storage: &Storage,
    uow: &mut DomainUnitOfWork<'_>,
    data: &serde_json::Value,
) -> Result<(), Error> {
    let request: PassmanagerGroupRenameRequest = serde_json::from_value(data.clone())
        .map_err(|_| Error::empty_payload("Invalid group rename"))?;
    let old = existing_group_path(session, &request.path)?;
    let name = request.name.trim();
    if old == "/" {
        return Err(Error::access_denied("Cannot rename root"));
    }
    if !path::is_valid_catalog_name(name) || name.starts_with('.') || name.contains('\\') {
        return Err(Error::invalid_path("Invalid group name"));
    }
    let (parent, previous_name) = old
        .rsplit_once('/')
        .ok_or_else(|| Error::invalid_path("Invalid group path"))?;
    if name == previous_name {
        return Ok(());
    }
    let target = format!("{parent}/{name}");
    let catalog_path = path::map_entry_group_path_to_passmanager_path(Some(&old))
        .ok_or_else(|| Error::invalid_path("Invalid group path"))?;
    let node = session
        .catalog()
        .find_by_path(&catalog_path)
        .ok_or_else(|| Error::node_not_found("Group is unavailable"))?;
    let mut entries = Vec::new();
    entry::collect_entry_dir_ids_with_meta(node, &mut entries);
    let mut meta = meta_store::load_group_meta_map_typed(session, storage)?;
    uow.stage_rename_node(node.node_id, name)
        .map_err(|e| Error::from_domain_uow_error(e, "Group rename failed"))?;
    // Catalog IDs and secret nodes remain unchanged. Synchronize the existing metadata aliases.
    for id in entries {
        entry::sync_entry_group_path_meta_uow(session, storage, uow, id)?;
    }
    let prefix = format!("{old}/");
    let updates: Vec<_> = meta
        .keys()
        .filter(|key| *key == &old || key.starts_with(&prefix))
        .cloned()
        .collect();
    for key in updates {
        if let Some(value) = meta.remove(&key) {
            meta.insert(format!("{target}{}", &key[old.len()..]), value);
        }
    }
    meta_store::stage_group_meta_map(uow, &meta)
}
