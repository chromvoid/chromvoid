use super::super::group;
use super::error::RootExportError;
use super::types::ExportedFolderMeta;
use crate::storage::Storage;
use crate::vault::VaultSession;

pub(super) fn collect_folders(session: &VaultSession) -> Vec<String> {
    let mut folders = group::list_group_paths(session)
        .into_iter()
        .filter(|path| !path.is_empty())
        .filter(|path| path != "/")
        .collect::<Vec<_>>();
    folders.sort();
    folders.dedup();
    folders
}

pub(super) fn collect_folder_metadata(
    session: &VaultSession,
    storage: &Storage,
) -> Result<Vec<ExportedFolderMeta>, RootExportError> {
    let map = group::load_group_meta_map_typed(session, storage)
        .map_err(RootExportError::from_group_meta_load)?;
    let mut folders_meta = map
        .into_iter()
        .filter_map(|(path, meta)| {
            let icon_ref = meta.icon_ref;
            let description = meta
                .description
                .as_deref()
                .map(str::trim)
                .filter(|value| !value.is_empty())
                .map(str::to_string);
            if icon_ref.is_none() && description.is_none() {
                return None;
            }

            Some(ExportedFolderMeta::new(path, icon_ref, description))
        })
        .collect::<Vec<_>>();
    folders_meta.sort_by(|a, b| a.path().cmp(b.path()));
    Ok(folders_meta)
}
