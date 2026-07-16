use super::super::tags;
use super::catalog_staging::{
    clear_passmanager_root_in_catalog, ensure_dir_path, ensure_passmanager_root_in_catalog,
};
use super::entry_staging::stage_entry;
use super::error::RootImportError;
use super::group_meta_staging::stage_imported_group_meta;
use super::types::{RootImportPayload, RootImportPlan};
use crate::storage::Storage;
use crate::vault::VaultSession;

pub(super) fn build_root_import_plan(
    session: &VaultSession,
    storage: &Storage,
    payload: RootImportPayload<'_>,
) -> Result<RootImportPlan, RootImportError> {
    let vault_key = *session.vault_key();
    let mut catalog = session.catalog().clone();
    ensure_passmanager_root_in_catalog(&mut catalog)?;

    if payload.should_clear_existing {
        clear_passmanager_root_in_catalog(&mut catalog)?;
    }

    for folder in payload.folders {
        let folder_path = folder
            .as_str()
            .ok_or_else(|| RootImportError::empty_payload("folders must be string[]"))?;
        let pm_path =
            super::super::path::map_entry_group_path_to_passmanager_path(Some(folder_path))
                .ok_or_else(|| RootImportError::access_denied("Access denied"))?;
        ensure_dir_path(&mut catalog, &pm_path)?;
    }

    let mut chunks = Vec::new();
    for entry in payload.entries {
        let entry_obj = super::parser::entry_object(entry)?;
        stage_entry(
            session,
            storage,
            &mut catalog,
            &vault_key,
            entry_obj,
            &mut chunks,
        )?;
    }

    let imported_ssh_keys =
        super::super::ssh::normalize_imported_keys(payload.ssh_keys, payload.entries)
            .map_err(RootImportError::from_passmanager_command_error)?;
    let mut ssh_keys = if payload.should_clear_existing {
        Vec::new()
    } else {
        super::super::ssh::collect_export_keys(session, storage)
            .map_err(RootImportError::from_passmanager_command_error)?
    };
    for imported in imported_ssh_keys.iter().cloned() {
        if let Some(existing) = ssh_keys.iter_mut().find(|key| key.id == imported.id) {
            *existing = imported;
        } else {
            ssh_keys.push(imported);
        }
    }
    ensure_dir_path(&mut catalog, super::super::ssh::SSH_ROOT_PATH)?;
    let legacy_ssh_cleanup_node_ids = super::ssh_staging::stage_imported_legacy_ssh_secrets(
        session,
        storage,
        &mut catalog,
        &vault_key,
        payload.entries,
        &imported_ssh_keys,
        &mut chunks,
    )?;
    let ssh_metadata = super::super::ssh::metadata_document_bytes(ssh_keys)
        .map_err(RootImportError::from_passmanager_command_error)?;
    super::catalog_staging::stage_file_bytes(
        &mut catalog,
        &vault_key,
        super::super::ssh::SSH_ROOT_PATH,
        super::super::ssh::SSH_METADATA_FILENAME,
        &ssh_metadata,
        "application/json",
        &mut chunks,
    )?;

    stage_imported_group_meta(
        &mut catalog,
        &vault_key,
        &payload.imported_group_meta,
        &mut chunks,
    )?;

    let imported_entry_tags = tags::extract_entry_tags(payload.entries);
    let mut tag_catalogs = vec![payload.imported_tags, imported_entry_tags];
    let effective_meta = if payload.should_clear_existing {
        payload.imported_tag_meta
    } else {
        let existing = tags::load_tag_catalog_data(session, storage)
            .map_err(RootImportError::from_passmanager_command_error)?;
        tag_catalogs.push(existing.tags);
        let mut meta = existing.meta;
        meta.extend(payload.imported_tag_meta);
        meta
    };
    let effective_tags = tags::merge_tag_catalogs(tag_catalogs);
    let effective_meta = tags::prune_tag_catalog_meta(&effective_meta, &effective_tags);
    let tag_meta_bytes = tags::serialize_tag_catalog_file(&effective_tags, &effective_meta)
        .map_err(RootImportError::from_passmanager_command_error)?;
    super::catalog_staging::stage_file_bytes(
        &mut catalog,
        &vault_key,
        "/.passmanager",
        ".tags-meta.json",
        &tag_meta_bytes,
        "application/json",
        &mut chunks,
    )?;

    Ok(RootImportPlan {
        catalog,
        chunks,
        legacy_ssh_cleanup_node_ids,
    })
}
