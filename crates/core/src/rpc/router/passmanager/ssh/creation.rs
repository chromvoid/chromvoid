use crate::crypto::ssh::{generate_ssh_key_material, import_ssh_key_material, SshKeyMaterial};
use crate::rpc::router::domain_uow::DomainUnitOfWork;
use crate::rpc::types::{
    PassmanagerSshImportRequest, PassmanagerSshKeyCreateResponse, PassmanagerSshKeygenRequest,
};
use crate::storage::Storage;
use crate::vault::VaultSession;
use serde::Deserialize;

use super::super::{entry::resolve_entry_node_id, error::PassmanagerCommandError as Error};
use super::{store, types::SshKeyMetadata};

pub(super) fn generate(
    session: &VaultSession,
    storage: &Storage,
    uow: &mut DomainUnitOfWork<'_>,
    data: &serde_json::Value,
) -> Result<PassmanagerSshKeyCreateResponse, Error> {
    let request: PassmanagerSshKeygenRequest = serde_json::from_value(data.clone())
        .map_err(|_| Error::empty_payload("Invalid SSH generation settings"))?;
    if !matches!(request.key_type.as_str(), "ed25519" | "rsa" | "ecdsa") {
        return Err(Error::empty_payload(
            "SSH key type must be ed25519, rsa, or ecdsa",
        ));
    }
    let name = text(request.name, 256)?;
    let comment = text(request.comment, 1024)?.unwrap_or_default();
    let source_entry_id = text(request.source_entry_id, 256)?;
    validate_source(session, storage, source_entry_id.as_deref())?;
    let material =
        generate_ssh_key_material(&request.key_type, &comment).map_err(Error::internal)?;
    store_material(session, storage, uow, material, name, source_entry_id)
}

pub(super) fn import(
    session: &VaultSession,
    storage: &Storage,
    uow: &mut DomainUnitOfWork<'_>,
    data: &serde_json::Value,
) -> Result<PassmanagerSshKeyCreateResponse, Error> {
    let mut request = PassmanagerSshImportRequest::deserialize(data)
        .map_err(|_| Error::empty_payload("Invalid SSH import settings"))?;
    let name = text(request.name.take(), 256)?;
    let source_entry_id = text(request.source_entry_id.take(), 256)?;
    validate_source(session, storage, source_entry_id.as_deref())?;
    let material = import_ssh_key_material(&request.private_key, request.passphrase.as_deref())
        .map_err(Error::empty_payload)?;
    // Imported comments are retained exactly; only unsafe or oversized metadata is rejected.
    if material.comment.len() > 1024 || material.comment.chars().any(char::is_control) {
        return Err(Error::empty_payload(
            "SSH comment is too long or contains control characters",
        ));
    }
    store_material(session, storage, uow, material, name, source_entry_id)
}

pub(super) fn validate_source(
    session: &VaultSession,
    storage: &Storage,
    id: Option<&str>,
) -> Result<(), Error> {
    if id.is_some_and(|id| resolve_entry_node_id(session, storage, id).is_none()) {
        return Err(Error::node_not_found("Source credential not found"));
    }
    Ok(())
}

fn store_material(
    session: &VaultSession,
    storage: &Storage,
    uow: &mut DomainUnitOfWork<'_>,
    material: SshKeyMaterial,
    name: Option<String>,
    source_entry_id: Option<String>,
) -> Result<PassmanagerSshKeyCreateResponse, Error> {
    let mut keys = store::load_keys(session, storage)?;
    // A fresh 128-bit ID preserves duplicate-import semantics without overwriting prior keys.
    // A collision is an explicit failure and never overwrites an existing key or orphan secret.
    let mut bytes = [0_u8; 16];
    getrandom::getrandom(&mut bytes)
        .map_err(|_| Error::internal("SSH generation is unavailable"))?;
    let key_id: String = bytes.iter().map(|byte| format!("{byte:02x}")).collect();
    if keys.iter().any(|key| key.id == key_id)
        || ["ssh_private_key", "ssh_public_key"]
            .iter()
            .any(|secret_type| {
                session
                    .catalog()
                    .find_by_path(&format!("{}/.{secret_type}.{key_id}", store::SSH_ROOT_PATH))
                    .is_some()
            })
    {
        return Err(Error::internal("SSH key identifier collision; try again"));
    }
    let now = super::super::path::now_unix_ms();
    keys.push(SshKeyMetadata {
        id: key_id.clone(),
        key_type: material.key_type.clone(),
        fingerprint: material.fingerprint.clone(),
        name,
        comment: (!material.comment.is_empty()).then_some(material.comment),
        source_entry_id,
        created_ts: Some(now),
        updated_ts: Some(now),
    });
    store::stage_secret(
        uow,
        &key_id,
        "ssh_private_key",
        material.private_key_pem.as_bytes(),
    )?;
    store::stage_secret(
        uow,
        &key_id,
        "ssh_public_key",
        material.public_key_openssh.as_bytes(),
    )?;
    store::stage_keys(uow, keys)?;
    Ok(PassmanagerSshKeyCreateResponse {
        key_id,
        public_key_openssh: material.public_key_openssh,
        fingerprint: material.fingerprint,
        key_type: material.key_type,
    })
}

pub(super) fn text(value: Option<String>, limit: usize) -> Result<Option<String>, Error> {
    let Some(value) = value else { return Ok(None) };
    if value.len() > limit || value.chars().any(char::is_control) {
        return Err(Error::empty_payload(
            "SSH metadata is too long or contains control characters",
        ));
    }
    let value = value.trim();
    Ok((!value.is_empty()).then(|| value.to_string()))
}
