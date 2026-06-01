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

    stage_imported_group_meta(
        &mut catalog,
        &vault_key,
        &payload.imported_group_meta,
        &mut chunks,
    )?;

    Ok(RootImportPlan { catalog, chunks })
}
