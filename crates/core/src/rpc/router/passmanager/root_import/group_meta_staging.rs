use super::catalog_staging::stage_file_bytes;
use super::error::RootImportError;
use super::types::PlannedChunk;
use crate::types::KEY_SIZE;
use std::collections::BTreeMap;

pub(super) fn stage_imported_group_meta(
    catalog: &mut crate::catalog::CatalogManager,
    vault_key: &[u8; KEY_SIZE],
    imported_group_meta: &BTreeMap<String, super::super::group::GroupMetaValue>,
    chunks: &mut Vec<PlannedChunk>,
) -> Result<(), RootImportError> {
    if imported_group_meta.is_empty() {
        return Ok(());
    }

    let group_meta = super::super::group::GroupMetaFile {
        groups: imported_group_meta
            .iter()
            .map(|(path, meta)| super::super::group::GroupMetaRecord {
                path: path.clone(),
                meta: meta.clone(),
            })
            .collect(),
    };
    let bytes = serde_json::to_vec(&group_meta).map_err(|error| {
        RootImportError::internal(format!("Failed to serialize group meta index: {error}"))
    })?;
    stage_file_bytes(
        catalog,
        vault_key,
        "/.passmanager",
        ".groups-meta.json",
        &bytes,
        "application/json",
        chunks,
    )
    .map(|_| ())
}
