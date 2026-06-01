use crate::vault::VaultSession;

use super::super::super::domain_uow::DomainUnitOfWork;
use super::super::error::PassmanagerCommandError;
use super::super::file_store::{read_file_bytes_by_path, stage_file_bytes_at_path};
use super::super::path::is_passmanager_path;
use super::policy::secret_filename;

pub(in crate::rpc::router::passmanager) fn read_secret_value(
    s: &VaultSession,
    storage: &crate::storage::Storage,
    entry_node_id: u64,
    secret_type: &str,
) -> Option<String> {
    let secret_name = secret_filename(secret_type)?;
    let entry_path = s.catalog().get_path(entry_node_id)?;
    if !is_passmanager_path(&entry_path) {
        return None;
    }
    let secret_path = format!("{entry_path}/{secret_name}");
    let bytes = read_file_bytes_by_path(s, storage, &secret_path)
        .ok()
        .flatten()?;
    String::from_utf8(bytes).ok()
}

pub(super) fn stage_secret_value(
    uow: &mut DomainUnitOfWork<'_>,
    entry_path: &str,
    secret_name: &str,
    value: &str,
) -> Result<(), PassmanagerCommandError> {
    stage_file_bytes_at_path(uow, entry_path, secret_name, value.as_bytes(), "text/plain")
}

pub(super) fn stage_delete_secret(
    s: &VaultSession,
    uow: &mut DomainUnitOfWork<'_>,
    entry_node_id: u64,
    secret_name: &str,
) -> Result<(), PassmanagerCommandError> {
    let Some(entry_node) = s.catalog().find_by_id(entry_node_id) else {
        return Err(PassmanagerCommandError::node_not_found("Entry not found"));
    };
    let Some(secret_node_id) = entry_node.find_child(secret_name).map(|n| n.node_id) else {
        return Err(PassmanagerCommandError::node_not_found("Secret not found"));
    };
    uow.stage_delete_node(secret_node_id).map_err(|error| {
        PassmanagerCommandError::from_domain_uow_error(error, "Failed to delete secret")
    })
}
