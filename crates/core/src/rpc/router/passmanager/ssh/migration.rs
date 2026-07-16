use std::collections::HashSet;

use sha2::{Digest, Sha256};

use crate::rpc::router::domain_uow::DomainUnitOfWork;
use crate::storage::Storage;
use crate::vault::VaultSession;

use super::super::entry;
use super::super::error::PassmanagerCommandError;
use super::super::file_store::read_file_bytes_by_path;
use super::service::parse_key_metadata;
use super::store;
use super::types::SshKeyMetadata;

pub(super) fn has_legacy_keys(session: &VaultSession, storage: &Storage) -> bool {
    legacy_entry_nodes(session, storage)
        .into_iter()
        .any(|(_, meta)| legacy_keys(&meta).is_some_and(|keys| !keys.is_empty()))
}

pub(in crate::rpc::router::passmanager) fn collect_export_keys(
    session: &VaultSession,
    storage: &Storage,
) -> Result<Vec<SshKeyMetadata>, PassmanagerCommandError> {
    let mut keys = store::load_keys(session, storage)?;
    append_legacy_metadata(&mut keys, legacy_entry_nodes(session, storage))?;
    Ok(keys)
}

pub(in crate::rpc::router::passmanager) fn normalize_imported_keys(
    root_keys: &[serde_json::Value],
    entries: &[serde_json::Value],
) -> Result<Vec<SshKeyMetadata>, PassmanagerCommandError> {
    let mut keys = Vec::with_capacity(root_keys.len());
    let mut used_ids = HashSet::with_capacity(root_keys.len());
    for value in root_keys {
        let key = parse_key_metadata(value, None, None)?;
        if !used_ids.insert(key.id.clone()) {
            return Err(PassmanagerCommandError::empty_payload(
                "sshKeys contains duplicate key id",
            ));
        }
        keys.push(key);
    }

    for entry in entries {
        let Some(object) = entry.as_object() else {
            continue;
        };
        let entry_id = object
            .get("id")
            .or_else(|| object.get("entry_id"))
            .and_then(serde_json::Value::as_str)
            .map(str::trim)
            .filter(|value| !value.is_empty())
            .unwrap_or("unknown-entry");
        let Some(legacy) = object.get("sshKeys").and_then(serde_json::Value::as_array) else {
            continue;
        };
        append_legacy_values(&mut keys, &mut used_ids, entry_id, legacy)?;
    }
    Ok(keys)
}

pub(super) fn stage_legacy_migration(
    session: &VaultSession,
    storage: &Storage,
    uow: &mut DomainUnitOfWork<'_>,
) -> Result<Vec<u64>, PassmanagerCommandError> {
    let mut keys = store::load_keys(session, storage)?;
    let mut used_ids = keys
        .iter()
        .map(|key| key.id.clone())
        .collect::<HashSet<_>>();
    let mut cleanup_node_ids = Vec::new();

    for (node_id, mut meta) in legacy_entry_nodes(session, storage) {
        let Some(legacy) = legacy_keys(&meta).cloned() else {
            continue;
        };
        if legacy.is_empty() {
            continue;
        }
        let entry_id = meta
            .get("id")
            .and_then(serde_json::Value::as_str)
            .map(str::trim)
            .filter(|value| !value.is_empty())
            .map(str::to_string)
            .unwrap_or_else(|| node_id.to_string());
        let entry_path = session
            .catalog()
            .get_path(node_id)
            .ok_or_else(|| PassmanagerCommandError::node_not_found("Entry not found"))?;

        for value in &legacy {
            let raw_id = value
                .get("id")
                .and_then(serde_json::Value::as_str)
                .map(str::trim)
                .filter(|value| !value.is_empty())
                .ok_or_else(|| PassmanagerCommandError::empty_payload("SSH key id is required"))?;
            let new_id = migrated_key_id(&entry_id, raw_id, &used_ids);
            let key = parse_key_metadata(value, Some(&entry_id), Some(new_id.clone()))?;
            if !used_ids.insert(new_id.clone()) {
                return Err(PassmanagerCommandError::empty_payload(
                    "deterministic SSH key migration id conflicts with existing metadata",
                ));
            }
            copy_legacy_secret(
                session,
                storage,
                uow,
                &entry_path,
                raw_id,
                &new_id,
                "ssh_private_key",
                &mut cleanup_node_ids,
            )?;
            copy_legacy_secret(
                session,
                storage,
                uow,
                &entry_path,
                raw_id,
                &new_id,
                "ssh_public_key",
                &mut cleanup_node_ids,
            )?;
            keys.push(key);
        }

        if let Some(object) = meta.as_object_mut() {
            remove_legacy_metadata(object);
            entry::sanitize_entry_meta_for_wire(object);
        }
        entry::stage_entry_meta_json(uow, node_id, &meta)?;
    }

    cleanup_node_ids.sort_unstable();
    cleanup_node_ids.dedup();
    store::stage_keys(uow, keys)?;
    Ok(cleanup_node_ids)
}

pub(in crate::rpc::router::passmanager) fn stage_cleanup_nodes(
    uow: &mut DomainUnitOfWork<'_>,
    node_ids: &[u64],
) -> Result<(), PassmanagerCommandError> {
    for node_id in node_ids {
        if uow.catalog().find_by_id(*node_id).is_none() {
            continue;
        }
        uow.stage_delete_node(*node_id).map_err(|error| {
            PassmanagerCommandError::from_domain_uow_error(
                error,
                "Failed to clean legacy SSH secret",
            )
        })?;
    }
    Ok(())
}

pub(in crate::rpc::router::passmanager) fn remove_legacy_metadata(
    object: &mut serde_json::Map<String, serde_json::Value>,
) {
    object.remove("sshKeys");
    object.remove("sshKeyType");
    object.remove("sshKeyFingerprint");
    object.remove("sshKeyComment");
    object.remove("ssh_key_type");
    object.remove("ssh_key_fingerprint");
    object.remove("ssh_key_comment");
}

fn append_legacy_metadata(
    keys: &mut Vec<SshKeyMetadata>,
    legacy_entries: Vec<(u64, serde_json::Value)>,
) -> Result<(), PassmanagerCommandError> {
    let mut used_ids = keys
        .iter()
        .map(|key| key.id.clone())
        .collect::<HashSet<_>>();
    for (node_id, meta) in legacy_entries {
        let Some(legacy) = legacy_keys(&meta) else {
            continue;
        };
        let entry_id = meta
            .get("id")
            .and_then(serde_json::Value::as_str)
            .map(str::trim)
            .filter(|value| !value.is_empty())
            .map(str::to_string)
            .unwrap_or_else(|| node_id.to_string());
        append_legacy_values(keys, &mut used_ids, &entry_id, legacy)?;
    }
    Ok(())
}

fn append_legacy_values(
    keys: &mut Vec<SshKeyMetadata>,
    used_ids: &mut HashSet<String>,
    entry_id: &str,
    legacy: &[serde_json::Value],
) -> Result<(), PassmanagerCommandError> {
    for value in legacy {
        let raw_id = value
            .get("id")
            .and_then(serde_json::Value::as_str)
            .map(str::trim)
            .filter(|value| !value.is_empty())
            .ok_or_else(|| PassmanagerCommandError::empty_payload("SSH key id is required"))?;
        let new_id = migrated_key_id(entry_id, raw_id, used_ids);
        let key = parse_key_metadata(value, Some(entry_id), Some(new_id.clone()))?;
        if !used_ids.insert(new_id) {
            return Err(PassmanagerCommandError::empty_payload(
                "deterministic SSH key migration id conflicts with existing metadata",
            ));
        }
        keys.push(key);
    }
    Ok(())
}

fn migrated_key_id(entry_id: &str, raw_id: &str, used_ids: &HashSet<String>) -> String {
    if store::is_valid_key_id(raw_id) && !used_ids.contains(raw_id) {
        return raw_id.to_string();
    }
    let digest = Sha256::digest(format!("{entry_id}:{raw_id}").as_bytes());
    format!("migrated-{}", hex_prefix(&digest, 16))
}

fn hex_prefix(bytes: &[u8], byte_count: usize) -> String {
    const HEX: &[u8; 16] = b"0123456789abcdef";
    let mut out = String::with_capacity(byte_count * 2);
    for byte in bytes.iter().take(byte_count) {
        out.push(HEX[(byte >> 4) as usize] as char);
        out.push(HEX[(byte & 0x0f) as usize] as char);
    }
    out
}

fn copy_legacy_secret(
    session: &VaultSession,
    storage: &Storage,
    uow: &mut DomainUnitOfWork<'_>,
    entry_path: &str,
    old_id: &str,
    new_id: &str,
    secret_type: &str,
    cleanup_node_ids: &mut Vec<u64>,
) -> Result<(), PassmanagerCommandError> {
    if old_id.is_empty() || old_id.contains('/') || old_id.contains('\0') {
        return Ok(());
    }
    let prefix = match secret_type {
        "ssh_private_key" => ".ssh_private_key.",
        "ssh_public_key" => ".ssh_public_key.",
        _ => return Ok(()),
    };
    let old_filename = format!("{prefix}{old_id}");
    let old_path = format!("{entry_path}/{old_filename}");
    let Some(bytes) = read_file_bytes_by_path(session, storage, &old_path)? else {
        return Ok(());
    };
    store::stage_secret(uow, new_id, secret_type, &bytes)?;
    if let Some(node_id) = session
        .catalog()
        .find_by_path(entry_path)
        .and_then(|entry| entry.find_child(&old_filename))
        .map(|node| node.node_id)
    {
        cleanup_node_ids.push(node_id);
    }
    Ok(())
}

fn legacy_entry_nodes(session: &VaultSession, storage: &Storage) -> Vec<(u64, serde_json::Value)> {
    let Some(root) = session.catalog().find_by_path("/.passmanager") else {
        return Vec::new();
    };
    let mut node_ids = Vec::new();
    entry::collect_entry_dir_ids_with_meta(root, &mut node_ids);
    node_ids
        .into_iter()
        .filter_map(|node_id| {
            entry::read_entry_meta_json(session, storage, node_id).map(|meta| (node_id, meta))
        })
        .collect()
}

fn legacy_keys(meta: &serde_json::Value) -> Option<&Vec<serde_json::Value>> {
    meta.get("sshKeys").and_then(serde_json::Value::as_array)
}
