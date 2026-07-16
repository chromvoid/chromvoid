use super::entry_export;
use super::error::RootExportError;
use super::group_export;
use super::tag_export;
use super::types::RootExportDocument;
use crate::storage::Storage;
use crate::vault::VaultSession;

pub(super) fn build_root_export(
    session: &VaultSession,
    storage: &Storage,
    now_ms: u64,
) -> Result<RootExportDocument, RootExportError> {
    let entries = entry_export::collect_exported_entries(session, storage);
    let folders = group_export::collect_folders(session);
    let folders_meta = group_export::collect_folder_metadata(session, storage)?;
    let tag_catalog = tag_export::collect_tag_catalog(session, storage, &entries)?;
    let ssh_keys = super::super::ssh::collect_export_keys(session, storage)
        .map_err(RootExportError::from_passmanager_command_error)?;

    Ok(RootExportDocument::new(
        now_ms,
        folders,
        folders_meta,
        tag_catalog.tags,
        tag_catalog.tag_meta,
        entries,
        ssh_keys,
    ))
}
