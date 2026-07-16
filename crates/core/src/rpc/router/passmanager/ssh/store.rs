use std::collections::HashSet;

use crate::rpc::router::domain_uow::DomainUnitOfWork;
use crate::storage::Storage;
use crate::vault::VaultSession;

use super::super::error::PassmanagerCommandError;
use super::super::file_store::{read_file_bytes_by_path, stage_file_bytes_at_path};
use super::types::{SshKeyMetadata, SshKeysDocument};

pub(in crate::rpc::router::passmanager) const SSH_ROOT_PATH: &str = "/.passmanager/.ssh";
pub(in crate::rpc::router::passmanager) const SSH_METADATA_FILENAME: &str = ".keys-meta.json";

pub(in crate::rpc::router::passmanager) fn is_valid_key_id(id: &str) -> bool {
    !id.is_empty()
        && id.len() <= 64
        && id
            .bytes()
            .all(|byte| byte.is_ascii_alphanumeric() || byte == b'-' || byte == b'_')
}

pub(in crate::rpc::router::passmanager) fn load_keys(
    session: &VaultSession,
    storage: &Storage,
) -> Result<Vec<SshKeyMetadata>, PassmanagerCommandError> {
    let path = format!("{SSH_ROOT_PATH}/{SSH_METADATA_FILENAME}");
    let Some(bytes) = read_file_bytes_by_path(session, storage, &path)? else {
        return Ok(Vec::new());
    };
    let document: SshKeysDocument = serde_json::from_slice(&bytes).map_err(|error| {
        PassmanagerCommandError::internal(format!("Failed to decode SSH metadata: {error}"))
    })?;
    validate_unique_keys(&document.ssh_keys)?;
    Ok(document.ssh_keys)
}

pub(in crate::rpc::router::passmanager) fn metadata_document_bytes(
    keys: Vec<SshKeyMetadata>,
) -> Result<Vec<u8>, PassmanagerCommandError> {
    validate_unique_keys(&keys)?;
    serde_json::to_vec(&SshKeysDocument::new(keys)).map_err(|error| {
        PassmanagerCommandError::internal(format!("Failed to encode SSH metadata: {error}"))
    })
}

pub(super) fn stage_keys(
    uow: &mut DomainUnitOfWork<'_>,
    keys: Vec<SshKeyMetadata>,
) -> Result<(), PassmanagerCommandError> {
    let bytes = metadata_document_bytes(keys)?;
    uow.ensure_dir(SSH_ROOT_PATH).map_err(|error| {
        PassmanagerCommandError::from_domain_uow_error(error, "Failed to ensure SSH namespace")
    })?;
    stage_file_bytes_at_path(
        uow,
        SSH_ROOT_PATH,
        SSH_METADATA_FILENAME,
        &bytes,
        "application/json",
    )
}

pub(super) fn read_secret(
    session: &VaultSession,
    storage: &Storage,
    key_id: &str,
    secret_type: &str,
) -> Result<String, PassmanagerCommandError> {
    let filename = secret_filename(key_id, secret_type)?;
    let path = format!("{SSH_ROOT_PATH}/{filename}");
    let bytes = read_file_bytes_by_path(session, storage, &path)?
        .ok_or_else(|| PassmanagerCommandError::node_not_found("SSH secret not found"))?;
    String::from_utf8(bytes)
        .map_err(|_| PassmanagerCommandError::internal("SSH secret is not valid UTF-8"))
}

pub(super) fn stage_secret(
    uow: &mut DomainUnitOfWork<'_>,
    key_id: &str,
    secret_type: &str,
    value: &[u8],
) -> Result<(), PassmanagerCommandError> {
    let filename = secret_filename(key_id, secret_type)?;
    uow.ensure_dir(SSH_ROOT_PATH).map_err(|error| {
        PassmanagerCommandError::from_domain_uow_error(error, "Failed to ensure SSH namespace")
    })?;
    stage_file_bytes_at_path(uow, SSH_ROOT_PATH, &filename, value, "text/plain")
}

pub(super) fn stage_delete_secret_if_exists(
    uow: &mut DomainUnitOfWork<'_>,
    key_id: &str,
    secret_type: &str,
) -> Result<(), PassmanagerCommandError> {
    let filename = secret_filename(key_id, secret_type)?;
    let Some(node_id) = uow
        .catalog()
        .find_by_path(SSH_ROOT_PATH)
        .and_then(|root| root.find_child(&filename))
        .map(|node| node.node_id)
    else {
        return Ok(());
    };
    uow.stage_delete_node(node_id).map_err(|error| {
        PassmanagerCommandError::from_domain_uow_error(error, "Failed to delete SSH secret")
    })
}

pub(super) fn secret_filename(
    key_id: &str,
    secret_type: &str,
) -> Result<String, PassmanagerCommandError> {
    if !is_valid_key_id(key_id) {
        return Err(PassmanagerCommandError::empty_payload("key_id is invalid"));
    }
    match secret_type {
        "ssh_private_key" => Ok(format!(".ssh_private_key.{key_id}")),
        "ssh_public_key" => Ok(format!(".ssh_public_key.{key_id}")),
        _ => Err(PassmanagerCommandError::empty_payload(
            "secret_type must be ssh_public_key or ssh_private_key",
        )),
    }
}

fn validate_unique_keys(keys: &[SshKeyMetadata]) -> Result<(), PassmanagerCommandError> {
    let mut ids = HashSet::with_capacity(keys.len());
    for key in keys {
        if !is_valid_key_id(&key.id) {
            return Err(PassmanagerCommandError::empty_payload(
                "SSH metadata contains invalid key id",
            ));
        }
        if !ids.insert(key.id.as_str()) {
            return Err(PassmanagerCommandError::empty_payload(
                "SSH metadata contains duplicate key id",
            ));
        }
    }
    Ok(())
}
