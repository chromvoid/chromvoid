use super::super::domain_read::{read_blob_by_node, DomainReadScope};
use super::super::domain_uow::DomainUnitOfWork;
use super::error::PassmanagerCommandError;
use crate::vault::VaultSession;

pub(super) fn read_file_bytes_by_path(
    session: &VaultSession,
    storage: &crate::storage::Storage,
    path: &str,
) -> Result<Option<Vec<u8>>, PassmanagerCommandError> {
    let Some(node) = session.catalog().find_by_path(path) else {
        return Ok(None);
    };
    if !node.is_file() {
        return Ok(None);
    }

    let bytes = read_blob_by_node(session, storage, DomainReadScope::Passmanager, node.node_id)
        .map_err(|error| {
            PassmanagerCommandError::from_domain_read_error(
                error,
                "Failed to read PassManager file",
            )
        })?;

    Ok(Some(bytes))
}

pub(super) fn stage_file_bytes_at_path(
    uow: &mut DomainUnitOfWork<'_>,
    parent_path: &str,
    name: &str,
    bytes: &[u8],
    mime_type: &str,
) -> Result<(), PassmanagerCommandError> {
    uow.stage_blob_write(parent_path, name, bytes, mime_type)
        .map(|_| ())
        .map_err(|error| {
            PassmanagerCommandError::from_domain_uow_error(
                error,
                "Failed to stage PassManager file",
            )
        })
}
