use super::error::RootExportError;
use crate::rpc::router::passmanager::tags;
use crate::storage::Storage;
use crate::vault::VaultSession;
use serde_json::Value;

pub(super) struct ExportedTagCatalog {
    pub(super) tags: Vec<String>,
    pub(super) tag_meta: tags::TagCatalogMeta,
}

pub(super) fn collect_tag_catalog(
    session: &VaultSession,
    storage: &Storage,
    entries: &[Value],
) -> Result<ExportedTagCatalog, RootExportError> {
    let stored =
        tags::load_tag_catalog_data(session, storage).map_err(RootExportError::from_tag_load)?;
    let assigned = tags::extract_entry_tags(entries);
    let tags = tags::merge_tag_catalogs([stored.tags, assigned]);
    let tag_meta = tags::prune_tag_catalog_meta(&stored.meta, &tags);
    Ok(ExportedTagCatalog { tags, tag_meta })
}
