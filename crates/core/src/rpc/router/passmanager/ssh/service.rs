use crate::rpc::router::domain_uow::DomainUnitOfWork;
use crate::storage::Storage;
use crate::vault::VaultSession;
use serde_json::Value;

use super::super::error::PassmanagerCommandError;
use super::store;
use super::types::SshKeyMetadata;

pub(super) fn update_key(
    session: &VaultSession,
    storage: &Storage,
    uow: &mut DomainUnitOfWork<'_>,
    data: &Value,
) -> Result<(), PassmanagerCommandError> {
    let key_value = data.get("key").unwrap_or(data);
    let mut next = parse_key_metadata(key_value, None, None)?;
    let mut keys = store::load_keys(session, storage)?;
    let now = super::super::path::now_unix_ms();

    if let Some(existing) = keys.iter_mut().find(|key| key.id == next.id) {
        next.created_ts = next.created_ts.or(existing.created_ts);
        next.updated_ts = Some(next.updated_ts.unwrap_or(now));
        *existing = next;
    } else {
        next.created_ts = Some(next.created_ts.unwrap_or(now));
        next.updated_ts = Some(next.updated_ts.unwrap_or(now));
        keys.push(next);
    }

    store::stage_keys(uow, keys)
}

pub(super) fn delete_key(
    session: &VaultSession,
    storage: &Storage,
    uow: &mut DomainUnitOfWork<'_>,
    data: &Value,
) -> Result<(), PassmanagerCommandError> {
    let key_id = parse_key_id(data)?;
    let mut keys = store::load_keys(session, storage)?;
    let previous_len = keys.len();
    keys.retain(|key| key.id != key_id);
    if keys.len() == previous_len {
        return Err(PassmanagerCommandError::node_not_found("SSH key not found"));
    }

    store::stage_keys(uow, keys)?;
    store::stage_delete_secret_if_exists(uow, &key_id, "ssh_private_key")?;
    store::stage_delete_secret_if_exists(uow, &key_id, "ssh_public_key")
}

pub(super) fn read_secret(
    session: &VaultSession,
    storage: &Storage,
    data: &Value,
) -> Result<String, PassmanagerCommandError> {
    let key_id = parse_key_id(data)?;
    let secret_type = parse_secret_type(data)?;
    store::read_secret(session, storage, &key_id, secret_type)
}

pub(super) fn save_secret(
    uow: &mut DomainUnitOfWork<'_>,
    data: &Value,
) -> Result<(), PassmanagerCommandError> {
    let key_id = parse_key_id(data)?;
    let secret_type = parse_secret_type(data)?;
    let value = data
        .get("value")
        .and_then(Value::as_str)
        .ok_or_else(|| PassmanagerCommandError::empty_payload("value is required"))?;
    store::stage_secret(uow, &key_id, secret_type, value.as_bytes())
}

pub(super) fn delete_secret(
    uow: &mut DomainUnitOfWork<'_>,
    data: &Value,
) -> Result<(), PassmanagerCommandError> {
    let key_id = parse_key_id(data)?;
    let secret_type = parse_secret_type(data)?;
    store::stage_delete_secret_if_exists(uow, &key_id, secret_type)
}

pub(in crate::rpc::router::passmanager) fn parse_key_metadata(
    value: &Value,
    source_entry_id: Option<&str>,
    remapped_id: Option<String>,
) -> Result<SshKeyMetadata, PassmanagerCommandError> {
    let object = value
        .as_object()
        .ok_or_else(|| PassmanagerCommandError::empty_payload("SSH key must be an object"))?;
    let raw_id = object
        .get("id")
        .or_else(|| object.get("key_id"))
        .and_then(Value::as_str)
        .map(str::trim)
        .filter(|id| !id.is_empty())
        .ok_or_else(|| PassmanagerCommandError::empty_payload("SSH key id is required"))?;
    let id = remapped_id.unwrap_or_else(|| raw_id.to_string());
    if !store::is_valid_key_id(&id) {
        return Err(PassmanagerCommandError::empty_payload(
            "SSH key id is invalid",
        ));
    }

    let key_type = object
        .get("type")
        .or_else(|| object.get("key_type"))
        .and_then(Value::as_str)
        .map(str::trim)
        .filter(|value| matches!(*value, "ed25519" | "rsa" | "ecdsa"))
        .ok_or_else(|| {
            PassmanagerCommandError::empty_payload("SSH key type must be ed25519, rsa, or ecdsa")
        })?
        .to_string();
    let fingerprint = object
        .get("fingerprint")
        .and_then(Value::as_str)
        .map(str::trim)
        .filter(|value| !value.is_empty())
        .ok_or_else(|| PassmanagerCommandError::empty_payload("SSH fingerprint is required"))?
        .to_string();

    Ok(SshKeyMetadata {
        id,
        key_type,
        fingerprint,
        name: optional_trimmed(object.get("name")),
        comment: optional_trimmed(object.get("comment")),
        source_entry_id: optional_trimmed(
            object
                .get("sourceEntryId")
                .or_else(|| object.get("source_entry_id")),
        )
        .or_else(|| source_entry_id.map(str::to_string)),
        created_ts: positive_timestamp(
            object.get("createdTs").or_else(|| object.get("created_ts")),
        ),
        updated_ts: positive_timestamp(
            object.get("updatedTs").or_else(|| object.get("updated_ts")),
        ),
    })
}

fn parse_key_id(data: &Value) -> Result<String, PassmanagerCommandError> {
    let key_id = data
        .get("key_id")
        .or_else(|| data.get("keyId"))
        .or_else(|| data.get("id"))
        .and_then(Value::as_str)
        .map(str::trim)
        .filter(|value| !value.is_empty())
        .ok_or_else(|| PassmanagerCommandError::empty_payload("key_id is required"))?;
    if !store::is_valid_key_id(key_id) {
        return Err(PassmanagerCommandError::empty_payload("key_id is invalid"));
    }
    Ok(key_id.to_string())
}

fn parse_secret_type(data: &Value) -> Result<&str, PassmanagerCommandError> {
    match data
        .get("secret_type")
        .or_else(|| data.get("secretType"))
        .and_then(Value::as_str)
    {
        Some(value @ ("ssh_public_key" | "ssh_private_key")) => Ok(value),
        _ => Err(PassmanagerCommandError::empty_payload(
            "secret_type must be ssh_public_key or ssh_private_key",
        )),
    }
}

fn optional_trimmed(value: Option<&Value>) -> Option<String> {
    value
        .and_then(Value::as_str)
        .map(str::trim)
        .filter(|value| !value.is_empty())
        .map(str::to_string)
}

fn positive_timestamp(value: Option<&Value>) -> Option<u64> {
    value.and_then(|value| {
        value
            .as_u64()
            .or_else(|| value.as_i64().and_then(|value| u64::try_from(value).ok()))
            .filter(|value| *value > 0)
    })
}
