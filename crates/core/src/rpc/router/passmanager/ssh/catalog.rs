//! Bounded native metadata reads and optimistic edits; secret material stays in exchange/store.
use serde::{Deserialize, Serialize};
use serde_json::Value;

use super::super::{
    entry::{load_entry_meta_required, resolve_entry_node_id},
    error::PassmanagerCommandError as Error,
    path::group_path_from_entry_path,
};
use super::{creation, store, types::SshKeyMetadata};
use crate::{
    error::ErrorCode,
    rpc::{
        router::domain_uow::DomainUnitOfWork,
        types::{
            PassmanagerSshEditRequest, PassmanagerSshPageRequest, PassmanagerSshPageResponse,
            SshKeySummary,
        },
    },
    storage::Storage,
    vault::VaultSession,
};

fn revision(value: &impl Serialize) -> Result<String, Error> {
    let mut hash = blake3::Hasher::new();
    hash.update(b"ssh-catalog-v1");
    serde_json::to_writer(&mut hash, value).map_err(|_| Error::internal("Invalid SSH metadata"))?;
    Ok(hash.finalize().to_hex().to_string())
}

fn summary(
    key: SshKeyMetadata,
    session: &VaultSession,
    storage: &Storage,
) -> Result<SshKeySummary, Error> {
    let mut row = SshKeySummary {
        revision: revision(&key)?,
        key,
        source_title: None,
        source_path: None,
    };
    if let Some(node) = row
        .key
        .source_entry_id
        .as_deref()
        .and_then(|id| resolve_entry_node_id(session, storage, id))
    {
        let meta = load_entry_meta_required(session, storage, node)?;
        let title = meta
            .get("title")
            .and_then(Value::as_str)
            .unwrap_or("")
            .to_string();
        let path = session
            .catalog()
            .get_path(node)
            .ok_or_else(|| Error::node_not_found("Source credential not found"))?;
        let group = group_path_from_entry_path(&path);
        row.source_path = Some(format!("{}/{}", group.trim_end_matches('/'), title));
        row.source_title = Some(title);
    }
    Ok(row)
}

fn conflict() -> Error {
    Error::new(
        "SSH keys changed. Reload before continuing",
        Some(ErrorCode::SyncConflict),
    )
}

pub(super) fn page(
    session: &VaultSession,
    storage: &Storage,
    data: &Value,
) -> Result<PassmanagerSshPageResponse, Error> {
    let request = PassmanagerSshPageRequest::deserialize(data)
        .map_err(|_| Error::empty_payload("Invalid SSH page request"))?;
    if !(1..=100).contains(&request.limit)
        || request.query.len() > 256
        || request
            .key_type
            .as_deref()
            .is_some_and(|kind| !["ed25519", "rsa", "ecdsa"].contains(&kind))
        || (request.offset > 0 && request.revision.is_none())
        || request
            .revision
            .as_ref()
            .is_some_and(|value| value.len() != 64)
    {
        return Err(Error::empty_payload("Invalid SSH page options"));
    }
    let source = creation::text(request.source_entry_id, 256)?;
    let query = request.query.trim().to_lowercase();
    let mut keys = store::load_keys(session, storage)?;
    keys.sort_by_key(|key| {
        (
            std::cmp::Reverse(key.updated_ts.or(key.created_ts).unwrap_or(0)),
            key.id.clone(),
        )
    });
    let mut keys = keys
        .into_iter()
        .map(|key| summary(key, session, storage))
        .collect::<Result<Vec<_>, _>>()?;
    let revision = revision(&(&keys, &source, &query, &request.key_type))?;
    if request
        .revision
        .as_ref()
        .is_some_and(|expected| *expected != revision)
    {
        return Err(conflict());
    }
    keys.retain(|row| {
        let key = &row.key;
        request
            .key_type
            .as_ref()
            .is_none_or(|kind| *kind == key.key_type)
            && source
                .as_ref()
                .is_none_or(|id| key.source_entry_id.as_ref() == Some(id))
            && (query.is_empty()
                || [
                    Some(key.id.as_str()),
                    key.name.as_deref(),
                    key.comment.as_deref(),
                    Some(key.fingerprint.as_str()),
                    Some(key.key_type.as_str()),
                    row.source_title.as_deref(),
                    row.source_path.as_deref(),
                ]
                .iter()
                .flatten()
                .any(|value| value.to_lowercase().contains(&query)))
    });
    let total_count =
        u32::try_from(keys.len()).map_err(|_| Error::internal("Too many SSH keys"))?;
    let keys = keys
        .into_iter()
        .skip(request.offset as usize)
        .take(request.limit as usize)
        .collect::<Vec<_>>();
    let end = request.offset.saturating_add(keys.len() as u32);
    Ok(PassmanagerSshPageResponse {
        keys,
        revision,
        total_count,
        next_offset: (end < total_count).then_some(end),
    })
}

pub(super) fn edit(
    session: &VaultSession,
    storage: &Storage,
    uow: &mut DomainUnitOfWork<'_>,
    data: &Value,
) -> Result<SshKeySummary, Error> {
    let request = PassmanagerSshEditRequest::deserialize(data)
        .map_err(|_| Error::empty_payload("Invalid SSH edit request"))?;
    if !store::is_valid_key_id(&request.key_id) || request.revision.len() != 64 {
        return Err(Error::empty_payload("Invalid SSH edit settings"));
    }
    let name = creation::text(request.name, 256)?;
    let source = creation::text(request.source_entry_id, 256)?;
    creation::validate_source(session, storage, source.as_deref())?;
    let mut keys = store::load_keys(session, storage)?;
    let key = keys
        .iter_mut()
        .find(|key| key.id == request.key_id)
        .ok_or_else(|| Error::node_not_found("SSH key not found"))?;
    if revision(key)? != request.revision {
        return Err(conflict());
    }
    key.name = name;
    key.source_entry_id = source;
    key.updated_ts = Some(super::super::path::now_unix_ms());
    let result = summary(key.clone(), session, storage)?;
    store::stage_keys(uow, keys)?;
    Ok(result)
}
