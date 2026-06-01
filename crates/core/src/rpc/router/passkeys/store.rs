use crate::passkeys::{PasskeyCredentialSource, PASSKEY_SCHEMA_V1};
use crate::storage::Storage;
use crate::vault::VaultSession;

use super::super::domain_read::{read_blob_by_node, DomainReadScope};
use super::super::domain_uow::DomainUnitOfWork;
use super::error::PasskeysCommandError;
use super::request::validate_credential_id;

const PASSKEYS_ROOT: &str = "/.passkeys";

pub(super) fn list_passkey_sources(
    session: &VaultSession,
    storage: &Storage,
) -> Result<Vec<PasskeyCredentialSource>, PasskeysCommandError> {
    let Some(root) = session.catalog().find_by_path(PASSKEYS_ROOT) else {
        return Ok(Vec::new());
    };
    let mut out = Vec::new();
    for child in root.children() {
        if !child.is_file() {
            continue;
        }
        let Some(source) = read_source(session, storage, child.node_id) else {
            continue;
        };
        if source.schema == PASSKEY_SCHEMA_V1 {
            out.push(source);
        }
    }
    Ok(out)
}

pub(super) fn save_passkey_source(
    uow: &mut DomainUnitOfWork<'_>,
    source: &PasskeyCredentialSource,
) -> Result<(), PasskeysCommandError> {
    ensure_passkeys_root_exists(uow)?;
    validate_credential_id(&source.credential_id_b64url)?;
    let name = source_filename(&source.credential_id_b64url);
    let bytes = serde_json::to_vec(source).map_err(|error| {
        PasskeysCommandError::internal(format!("Passkey source serialization failed: {error}"))
    })?;
    uow.stage_blob_write(PASSKEYS_ROOT, &name, &bytes, "application/json")
        .map(|_| ())
        .map_err(PasskeysCommandError::from)
}

pub(super) fn delete_passkey_source(
    uow: &mut DomainUnitOfWork<'_>,
    credential_id: &str,
) -> Result<bool, PasskeysCommandError> {
    let path = format!("{PASSKEYS_ROOT}/{}", source_filename(credential_id));
    let Some(node_id) = uow.catalog().find_by_path(&path).map(|node| node.node_id) else {
        return Ok(false);
    };
    uow.stage_delete_node(node_id)
        .map_err(PasskeysCommandError::from)?;
    Ok(true)
}

fn ensure_passkeys_root_exists(uow: &mut DomainUnitOfWork<'_>) -> Result<(), PasskeysCommandError> {
    uow.ensure_dir(PASSKEYS_ROOT)
        .map_err(PasskeysCommandError::from)
}

fn read_source(
    session: &VaultSession,
    storage: &Storage,
    node_id: u64,
) -> Option<PasskeyCredentialSource> {
    let bytes = read_blob_by_node(session, storage, DomainReadScope::Passkeys, node_id).ok()?;
    serde_json::from_slice(&bytes).ok()
}

fn source_filename(credential_id: &str) -> String {
    format!("{credential_id}.json")
}
