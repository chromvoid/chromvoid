use crate::vault::VaultSession;

use super::super::super::domain_uow::DomainUnitOfWork;
use super::super::error::PassmanagerCommandError;
use super::super::path::{
    group_path_from_entry_path, is_passmanager_path, map_entry_group_path_to_passmanager_path,
    now_unix_ms,
};
use super::io::{
    collect_entry_dir_ids_with_meta, entry_meta_object_mut, load_entry_meta_required,
    read_entry_meta_json, stage_entry_meta_json,
};
use super::request::{
    timestamp_from_map, EntryIdRequest, EntryMoveRequest, EntryRenameRequest, EntrySaveRequest,
};
use super::resolver::resolve_entry_node_id;
use super::sanitize::{
    sanitize_entry_meta_for_wire, set_wire_group_path, sync_entry_group_path_meta_uow,
};
use super::types::{EntryListResult, EntryReadResult, EntrySaveResult};

pub(super) fn save_entry(
    s: &VaultSession,
    storage: &crate::storage::Storage,
    uow: &mut DomainUnitOfWork<'_>,
    request: EntrySaveRequest,
) -> Result<EntrySaveResult, PassmanagerCommandError> {
    uow.ensure_dir("/.passmanager").map_err(|error| {
        PassmanagerCommandError::from_domain_uow_error(error, "Failed to ensure PassManager root")
    })?;

    let requested_entry_id = request.requested_entry_id.clone();
    let existing_node_id = requested_entry_id
        .as_deref()
        .and_then(|id| resolve_entry_node_id(s, storage, id));

    let group_path_opt = request.group_path.as_deref();
    let target_parent_path = if let Some(node_id) = existing_node_id {
        if request.has_group_path {
            map_entry_group_path_to_passmanager_path(group_path_opt)
                .ok_or_else(|| PassmanagerCommandError::access_denied("Access denied"))?
        } else {
            uow.catalog()
                .get_path(node_id)
                .and_then(|path| path.rsplit_once('/').map(|(parent, _)| parent.to_string()))
                .unwrap_or_else(|| "/.passmanager".to_string())
        }
    } else {
        map_entry_group_path_to_passmanager_path(group_path_opt)
            .ok_or_else(|| PassmanagerCommandError::access_denied("Access denied"))?
    };
    if !is_passmanager_path(&target_parent_path) {
        return Err(PassmanagerCommandError::access_denied("Access denied"));
    }

    let node_id = if let Some(node_id) = existing_node_id {
        let current_parent_path = uow
            .catalog()
            .get_path(node_id)
            .and_then(|path| path.rsplit_once('/').map(|(parent, _)| parent.to_string()))
            .unwrap_or_else(|| "/.passmanager".to_string());
        if current_parent_path != target_parent_path {
            uow.stage_move_node(node_id, &target_parent_path)
                .map_err(|error| {
                    PassmanagerCommandError::from_domain_uow_error(error, "Failed to move entry")
                })?;
        }
        node_id
    } else {
        uow.stage_create_dir(&target_parent_path, &request.title)
            .map_err(|error| {
                PassmanagerCommandError::from_domain_uow_error(error, "Failed to create entry")
            })?
    };

    let out_entry_id = requested_entry_id.unwrap_or_else(|| node_id.to_string());

    let mut meta = read_entry_meta_json(s, storage, node_id)
        .unwrap_or_else(|| serde_json::Value::Object(serde_json::Map::new()));
    let meta_obj = entry_meta_object_mut(&mut meta)?;
    let now = now_unix_ms();
    let created_ts = request
        .created_ts
        .or_else(|| timestamp_from_map(meta_obj, "createdTs", "created_ts"))
        .unwrap_or(now);
    let updated_ts = request.updated_ts.unwrap_or(now);

    meta_obj.insert(
        "id".to_string(),
        serde_json::Value::String(out_entry_id.clone()),
    );
    meta_obj.remove("created_ts");
    meta_obj.remove("updated_ts");
    meta_obj.insert(
        "createdTs".to_string(),
        serde_json::Value::Number(serde_json::Number::from(created_ts)),
    );
    meta_obj.insert(
        "updatedTs".to_string(),
        serde_json::Value::Number(serde_json::Number::from(updated_ts)),
    );
    meta_obj.insert(
        "title".to_string(),
        serde_json::Value::String(request.title.clone()),
    );
    meta_obj.insert(
        "entry_type".to_string(),
        serde_json::Value::String(request.entry_type.clone()),
    );
    if request.entry_type == "payment_card" {
        meta_obj.remove("urls");
        meta_obj.remove("username");
        meta_obj.remove("otps");
        meta_obj.remove("sshKeys");
        meta_obj.remove("sshKeyType");
        meta_obj.remove("sshKeyFingerprint");
        meta_obj.remove("sshKeyComment");
        if let Some(payment_card) = request.payment_card {
            meta_obj.insert("payment_card".to_string(), payment_card);
        }
    } else {
        meta_obj.remove("payment_card");
        if let Some(urls) = request.urls {
            meta_obj.insert("urls".to_string(), urls);
        }
        if let Some(username) = request.username {
            meta_obj.insert("username".to_string(), username);
        }
        if let Some(otps) = request.otps {
            meta_obj.insert("otps".to_string(), otps);
        }
    }
    if let Some(import_source) = request.import_source {
        meta_obj.insert("import_source".to_string(), import_source);
    }
    if let Some(tags) = request.tags {
        if tags.is_empty() {
            meta_obj.remove("tags");
        } else {
            meta_obj.insert(
                "tags".to_string(),
                serde_json::Value::Array(tags.into_iter().map(serde_json::Value::String).collect()),
            );
        }
    }
    let current_group_path = uow
        .catalog()
        .get_path(node_id)
        .map(|path| group_path_from_entry_path(&path))
        .unwrap_or_else(|| "/".to_string());
    set_wire_group_path(meta_obj, &current_group_path);
    if let Some(icon_ref) = request.icon_ref {
        meta_obj.insert("icon_ref".to_string(), serde_json::Value::String(icon_ref));
    }
    if request.entry_type == "login" {
        if let Some(ssh_keys) = request.ssh_keys {
            meta_obj.insert("sshKeys".to_string(), serde_json::Value::Array(ssh_keys));
            meta_obj.remove("sshKeyType");
            meta_obj.remove("sshKeyFingerprint");
            meta_obj.remove("sshKeyComment");
        } else {
            if let Some(v) = request.ssh_key_type {
                meta_obj.insert("sshKeyType".to_string(), serde_json::Value::String(v));
            }
            if let Some(v) = request.ssh_key_fingerprint {
                meta_obj.insert(
                    "sshKeyFingerprint".to_string(),
                    serde_json::Value::String(v),
                );
            }
            if let Some(v) = request.ssh_key_comment {
                meta_obj.insert("sshKeyComment".to_string(), serde_json::Value::String(v));
            }
        }
    }

    sanitize_entry_meta_for_wire(meta_obj);
    stage_entry_meta_json(uow, node_id, &meta)?;

    Ok(EntrySaveResult::new(out_entry_id))
}

pub(super) fn read_entry(
    s: &VaultSession,
    storage: &crate::storage::Storage,
    request: EntryIdRequest,
) -> Result<EntryReadResult, PassmanagerCommandError> {
    let Some(node_id) = resolve_entry_node_id(s, storage, &request.entry_id) else {
        return Err(PassmanagerCommandError::node_not_found("Entry not found"));
    };

    let mut meta = load_entry_meta_required(s, storage, node_id)?;
    let meta_obj = entry_meta_object_mut(&mut meta)?;
    if !meta_obj.contains_key("id") {
        meta_obj.insert(
            "id".to_string(),
            serde_json::Value::String(request.entry_id),
        );
    }
    let current_group_path = s
        .catalog()
        .get_path(node_id)
        .map(|path| group_path_from_entry_path(&path))
        .unwrap_or_else(|| "/".to_string());
    set_wire_group_path(meta_obj, &current_group_path);
    let entry_type = meta_obj
        .get("entry_type")
        .or_else(|| meta_obj.get("entryType"))
        .and_then(|v| v.as_str())
        .unwrap_or("login")
        .to_string();

    if entry_type == "login" && !meta_obj.contains_key("sshKeys") {
        let ssh_type = meta_obj
            .get("sshKeyType")
            .and_then(|v| v.as_str())
            .map(|s| s.to_string());
        let ssh_fp = meta_obj
            .get("sshKeyFingerprint")
            .and_then(|v| v.as_str())
            .map(|s| s.to_string());
        if let (Some(t), Some(f)) = (ssh_type, ssh_fp) {
            let comment = meta_obj
                .get("sshKeyComment")
                .and_then(|v| v.as_str())
                .unwrap_or("")
                .to_string();
            let mut key_obj = serde_json::Map::new();
            key_obj.insert(
                "id".to_string(),
                serde_json::Value::String("default".to_string()),
            );
            key_obj.insert("type".to_string(), serde_json::Value::String(t));
            key_obj.insert("fingerprint".to_string(), serde_json::Value::String(f));
            if !comment.is_empty() {
                key_obj.insert("comment".to_string(), serde_json::Value::String(comment));
            }
            meta_obj.insert(
                "sshKeys".to_string(),
                serde_json::Value::Array(vec![serde_json::Value::Object(key_obj)]),
            );
        }
    }
    sanitize_entry_meta_for_wire(meta_obj);

    Ok(EntryReadResult::new(meta))
}

pub(super) fn delete_entry(
    s: &VaultSession,
    storage: &crate::storage::Storage,
    uow: &mut DomainUnitOfWork<'_>,
    request: EntryIdRequest,
) -> Result<(), PassmanagerCommandError> {
    let Some(node_id) = resolve_entry_node_id(s, storage, &request.entry_id) else {
        return Err(PassmanagerCommandError::node_not_found("Entry not found"));
    };
    uow.stage_delete_node(node_id).map_err(|error| {
        PassmanagerCommandError::from_domain_uow_error(error, "Failed to delete entry")
    })
}

pub(super) fn move_entry(
    s: &VaultSession,
    storage: &crate::storage::Storage,
    uow: &mut DomainUnitOfWork<'_>,
    request: EntryMoveRequest,
) -> Result<(), PassmanagerCommandError> {
    let Some(node_id) = resolve_entry_node_id(s, storage, &request.entry_id) else {
        return Err(PassmanagerCommandError::node_not_found("Entry not found"));
    };
    let new_parent_path =
        map_entry_group_path_to_passmanager_path(request.target_group_path.as_deref())
            .ok_or_else(|| PassmanagerCommandError::access_denied("Access denied"))?;
    uow.stage_move_node(node_id, &new_parent_path)
        .map_err(|error| {
            PassmanagerCommandError::from_domain_uow_error(error, "Failed to move entry")
        })?;

    sync_entry_group_path_meta_uow(s, storage, uow, node_id)
}

pub(super) fn rename_entry(
    s: &VaultSession,
    storage: &crate::storage::Storage,
    uow: &mut DomainUnitOfWork<'_>,
    request: EntryRenameRequest,
) -> Result<(), PassmanagerCommandError> {
    let Some(node_id) = resolve_entry_node_id(s, storage, &request.entry_id) else {
        return Err(PassmanagerCommandError::node_not_found("Entry not found"));
    };
    uow.stage_rename_node(node_id, &request.new_name)
        .map_err(|error| {
            PassmanagerCommandError::from_domain_uow_error(error, "Failed to rename entry")
        })?;

    let mut meta = read_entry_meta_json(s, storage, node_id)
        .unwrap_or_else(|| serde_json::Value::Object(serde_json::Map::new()));
    let meta_obj = entry_meta_object_mut(&mut meta)?;
    meta_obj.insert(
        "title".to_string(),
        serde_json::Value::String(request.new_name),
    );
    if !meta_obj.contains_key("id") {
        meta_obj.insert(
            "id".to_string(),
            serde_json::Value::String(request.entry_id),
        );
    }
    let now = now_unix_ms();
    let created_ts = timestamp_from_map(meta_obj, "createdTs", "created_ts").unwrap_or(now);
    meta_obj.remove("created_ts");
    meta_obj.remove("updated_ts");
    meta_obj.insert(
        "createdTs".to_string(),
        serde_json::Value::Number(serde_json::Number::from(created_ts)),
    );
    meta_obj.insert(
        "updatedTs".to_string(),
        serde_json::Value::Number(serde_json::Number::from(now)),
    );

    stage_entry_meta_json(uow, node_id, &meta)
}

pub(super) fn list_entries(
    s: &VaultSession,
    storage: &crate::storage::Storage,
) -> Result<EntryListResult, PassmanagerCommandError> {
    let mut out_entries = Vec::<serde_json::Value>::new();
    let mut folders = std::collections::BTreeSet::<String>::new();

    let Some(pm_root) = s.catalog().find_by_path("/.passmanager") else {
        return Ok(EntryListResult::new(out_entries, Vec::<String>::new()));
    };

    let mut node_ids = Vec::<u64>::new();
    collect_entry_dir_ids_with_meta(pm_root, &mut node_ids);

    for node_id in node_ids {
        let Some(mut meta) = read_entry_meta_json(s, storage, node_id) else {
            continue;
        };
        let path = s
            .catalog()
            .get_path(node_id)
            .unwrap_or_else(|| "/.passmanager".to_string());
        let group_path = group_path_from_entry_path(&path);
        folders.insert(group_path.clone());

        if let Some(meta_obj) = meta.as_object_mut() {
            if !meta_obj.contains_key("id") {
                meta_obj.insert(
                    "id".to_string(),
                    serde_json::Value::String(node_id.to_string()),
                );
            }
            set_wire_group_path(meta_obj, &group_path);
            sanitize_entry_meta_for_wire(meta_obj);
        }

        out_entries.push(meta);
    }

    Ok(EntryListResult::new(
        out_entries,
        folders.into_iter().collect::<Vec<String>>(),
    ))
}
