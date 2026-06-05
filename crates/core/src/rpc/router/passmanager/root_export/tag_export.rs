use super::error::RootExportError;
use crate::rpc::router::passmanager::tags;
use crate::storage::Storage;
use crate::vault::VaultSession;
use serde_json::Value;

pub(super) fn collect_tags(
    session: &VaultSession,
    storage: &Storage,
    entries: &[Value],
) -> Result<Vec<String>, RootExportError> {
    let stored = tags::load_tag_catalog(session, storage).map_err(RootExportError::from_tag_load)?;
    let assigned = tags::extract_entry_tags(entries);
    Ok(tags::merge_tag_catalogs([stored, assigned]))
}
