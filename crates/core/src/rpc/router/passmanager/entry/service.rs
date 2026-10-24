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
    timestamp_from_map, EntryCreateRequest, EntryIdRequest, EntryMoveRequest, EntryRenameRequest,
    EntrySaveRequest,
};
use super::resolver::resolve_entry_node_id;
use super::sanitize::{
    sanitize_entry_meta_for_wire, set_wire_group_path, sync_entry_group_path_meta_uow,
};
use super::types::{EntryListResult, EntryReadResult, EntrySaveResult};

struct StagedEntry {
    result: EntrySaveResult,
    node_id: u64,
}

pub(super) fn create_entry(
    s: &VaultSession,
    storage: &crate::storage::Storage,
    uow: &mut DomainUnitOfWork<'_>,
    mut request: EntryCreateRequest,
) -> Result<EntrySaveResult, PassmanagerCommandError> {
    if request.entry.entry_type == "payment_card" {
        let card_pan = request
            .secrets
            .iter()
            .find(|secret| secret.secret_type == "card_pan")
            .map(|secret| secret.value.as_str())
            .ok_or_else(|| {
                PassmanagerCommandError::empty_payload(
                    "secrets.card_pan is required for entry_type=payment_card",
                )
            })?;
        let last4 = &card_pan[card_pan.len() - 4..];
        let payment_card = request.entry.payment_card.as_mut().ok_or_else(|| {
            PassmanagerCommandError::empty_payload("payment_card metadata is required")
        })?;
        let payment_card = payment_card.as_object_mut().ok_or_else(|| {
            PassmanagerCommandError::empty_payload("payment_card must be an object")
        })?;
        payment_card.insert(
            "last4".to_string(),
            serde_json::Value::String(last4.to_string()),
        );
        super::card_brand::apply_brand(payment_card, card_pan);
        // A card saved without a name is named by its network and last four digits.
        if request.entry.title.is_empty() {
            let parent =
                map_entry_group_path_to_passmanager_path(request.entry.group_path.as_deref())
                    .unwrap_or_else(|| "/.passmanager".to_string());
            let title = super::card_brand::default_card_title(uow, &parent, payment_card, None)
                .ok_or_else(|| PassmanagerCommandError::empty_payload("title is required"))?;
            request.entry.title = title;
        }
    }

    // Entry IDs created by the product are UUIDs. Avoid the legacy resolver
    // here: it decrypts every entry metadata file and would make point-create
    // O(total vault size). Updates and deletes still resolve legacy IDs.
    let staged = stage_entry(s, storage, uow, request.entry, None)?;
    let entry_path = uow
        .catalog()
        .get_path(staged.node_id)
        .ok_or_else(|| PassmanagerCommandError::node_not_found("Entry not found"))?;

    for secret in request.secrets {
        let secret_name = super::super::secret::secret_filename(secret.secret_type)
            .ok_or_else(|| PassmanagerCommandError::empty_payload("Unsupported secret type"))?;
        super::super::secret::stage_secret_value(uow, &entry_path, &secret_name, &secret.value)?;
    }

    Ok(staged.result)
}

pub(super) fn save_entry(
    s: &VaultSession,
    storage: &crate::storage::Storage,
    uow: &mut DomainUnitOfWork<'_>,
    request: EntrySaveRequest,
) -> Result<EntrySaveResult, PassmanagerCommandError> {
    let existing_node_id = request
        .requested_entry_id
        .as_deref()
        .and_then(|id| resolve_entry_node_id(s, storage, id));
    stage_entry(s, storage, uow, request, existing_node_id).map(|staged| staged.result)
}

fn stage_entry(
    s: &VaultSession,
    storage: &crate::storage::Storage,
    uow: &mut DomainUnitOfWork<'_>,
    mut request: EntrySaveRequest,
    existing_node_id: Option<u64>,
) -> Result<StagedEntry, PassmanagerCommandError> {
    if let Some(keys) = &request.tag_keys {
        request.tags = Some(super::super::tags::resolve_selected_keys(s, storage, keys)?);
    }
    uow.ensure_dir("/.passmanager").map_err(|error| {
        PassmanagerCommandError::from_domain_uow_error(error, "Failed to ensure PassManager root")
    })?;

    let requested_entry_id = request.requested_entry_id.clone();
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
    uow.ensure_dir(&target_parent_path).map_err(|error| {
        PassmanagerCommandError::from_domain_uow_error(
            error,
            "Failed to ensure PassManager entry group",
        )
    })?;

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
    super::super::ssh::remove_legacy_metadata(meta_obj);

    sanitize_entry_meta_for_wire(meta_obj);
    stage_entry_meta_json(uow, node_id, &meta)?;

    Ok(StagedEntry {
        result: EntrySaveResult::new(out_entry_id),
        node_id,
    })
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
