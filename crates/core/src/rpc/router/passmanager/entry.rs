//! Entry I/O helpers and handler free functions for PassManager.

use super::super::super::commands::{
    handle_catalog_create_dir, handle_catalog_delete, handle_catalog_download, handle_catalog_move,
    handle_catalog_prepare_upload, handle_catalog_rename, handle_catalog_upload,
    with_system_shard_guard_bypass,
};
use super::super::super::types::RpcResponse;
use super::path::{
    ensure_passmanager_root_exists, entry_id_from_data, group_path_from_entry_path,
    is_passmanager_path, map_entry_group_path_to_passmanager_path, node_in_passmanager,
};
use crate::error::ErrorCode;
use crate::vault::VaultSession;
use base64::{engine::general_purpose, Engine as _};

pub(super) fn collect_entry_dir_ids_with_meta(
    node: &crate::catalog::CatalogNode,
    out: &mut Vec<u64>,
) {
    for child in node.children() {
        if !child.is_dir() {
            continue;
        }
        if child
            .find_child("meta.json")
            .filter(|n| n.is_file())
            .is_some()
        {
            out.push(child.node_id);
        }
        collect_entry_dir_ids_with_meta(child, out);
    }
}

pub(super) fn read_entry_meta_json(
    session: &VaultSession,
    storage: &crate::storage::Storage,
    entry_node_id: u64,
) -> Option<serde_json::Value> {
    let entry_node = session.catalog().find_by_id(entry_node_id)?;
    let meta_node = entry_node.find_child("meta.json")?;
    if !meta_node.is_file() {
        return None;
    }

    let downloaded = with_system_shard_guard_bypass(|| {
        handle_catalog_download(
            session,
            &serde_json::json!({"node_id": meta_node.node_id}),
            storage,
        )
    });
    let content = downloaded
        .result()
        .and_then(|result| result.get("content"))
        .and_then(|v| v.as_str())?;
    let bytes = general_purpose::STANDARD_NO_PAD.decode(content).ok()?;
    serde_json::from_slice(&bytes).ok()
}

pub(super) fn write_entry_meta_json(
    session: &mut VaultSession,
    storage: &crate::storage::Storage,
    entry_node_id: u64,
    meta: &serde_json::Value,
) -> RpcResponse {
    let entry_path = match session.catalog().get_path(entry_node_id) {
        Some(path) if is_passmanager_path(&path) => path,
        _ => return RpcResponse::error("Access denied", Some(ErrorCode::AccessDenied)),
    };

    let encoded = match serde_json::to_vec(meta) {
        Ok(v) => v,
        Err(e) => {
            return RpcResponse::error(
                format!("Failed to encode entry metadata: {e}"),
                Some(ErrorCode::InternalError),
            )
        }
    };

    let prepared = with_system_shard_guard_bypass(|| {
        handle_catalog_prepare_upload(
            session,
            &serde_json::json!({
                "parent_path": entry_path,
                "name": "meta.json",
                "size": encoded.len() as u64,
                "mime_type": "application/json",
            }),
            storage,
        )
    });
    if !prepared.is_ok() {
        return prepared;
    }

    let Some(meta_node_id) = prepared
        .result()
        .and_then(|result| result.get("node_id"))
        .and_then(|v| v.as_u64())
    else {
        return RpcResponse::error("meta.json node_id missing", Some(ErrorCode::InternalError));
    };

    with_system_shard_guard_bypass(|| {
        handle_catalog_upload(
            session,
            &serde_json::json!({
                "node_id": meta_node_id,
                "content": general_purpose::STANDARD_NO_PAD.encode(&encoded),
            }),
            storage,
        )
    })
}

pub(super) fn resolve_entry_node_id(
    session: &VaultSession,
    storage: &crate::storage::Storage,
    entry_id: &str,
) -> Option<u64> {
    if let Ok(node_id) = entry_id.parse::<u64>() {
        if node_in_passmanager(session, node_id) {
            return Some(node_id);
        }
    }

    let pm_root = session.catalog().find_by_path("/.passmanager")?;
    let mut node_ids = Vec::<u64>::new();
    collect_entry_dir_ids_with_meta(pm_root, &mut node_ids);

    for node_id in node_ids {
        let Some(meta) = read_entry_meta_json(session, storage, node_id) else {
            continue;
        };
        let meta_id = meta
            .get("id")
            .and_then(|v| v.as_str())
            .or_else(|| meta.get("entry_id").and_then(|v| v.as_str()));
        if meta_id == Some(entry_id) {
            return Some(node_id);
        }
    }

    None
}

pub(super) fn handle_save(
    s: &mut VaultSession,
    storage: &crate::storage::Storage,
    data: &serde_json::Value,
) -> RpcResponse {
    if let Err(resp) = ensure_passmanager_root_exists(s) {
        return resp;
    }

    let title = match data.get("title").and_then(|v| v.as_str()) {
        Some(v) if !v.trim().is_empty() => v.trim(),
        _ => return RpcResponse::error("title is required", Some(ErrorCode::EmptyPayload)),
    };

    let requested_entry_id = entry_id_from_data(data);
    let existing_node_id = requested_entry_id
        .as_deref()
        .and_then(|id| resolve_entry_node_id(s, storage, id));

    let group_path_opt = data
        .get("group_path")
        .and_then(|v| v.as_str())
        .or_else(|| data.get("groupPath").and_then(|v| v.as_str()));
    let Some(parent_path) = map_entry_group_path_to_passmanager_path(group_path_opt) else {
        return RpcResponse::error("Access denied", Some(ErrorCode::AccessDenied));
    };

    let node_id = if let Some(node_id) = existing_node_id {
        node_id
    } else {
        let created = with_system_shard_guard_bypass(|| {
            handle_catalog_create_dir(
                s,
                &serde_json::json!({
                    "name": title,
                    "parent_path": parent_path,
                }),
            )
        });
        if !created.is_ok() {
            return created;
        }
        match created
            .result()
            .and_then(|result| result.get("node_id"))
            .and_then(|v| v.as_u64())
        {
            Some(v) => v,
            None => {
                return RpcResponse::error("Failed to create entry", Some(ErrorCode::InternalError))
            }
        }
    };

    let out_entry_id = requested_entry_id.unwrap_or_else(|| node_id.to_string());

    let mut meta = read_entry_meta_json(s, storage, node_id)
        .unwrap_or_else(|| serde_json::Value::Object(serde_json::Map::new()));
    let Some(meta_obj) = meta.as_object_mut() else {
        return RpcResponse::error(
            "meta.json must be an object",
            Some(ErrorCode::InternalError),
        );
    };

    meta_obj.insert(
        "id".to_string(),
        serde_json::Value::String(out_entry_id.clone()),
    );
    meta_obj.insert(
        "title".to_string(),
        serde_json::Value::String(title.to_string()),
    );
    if let Some(urls) = data.get("urls") {
        meta_obj.insert("urls".to_string(), urls.clone());
    }
    if let Some(username) = data.get("username") {
        meta_obj.insert("username".to_string(), username.clone());
    }
    if let Some(otps) = data.get("otps") {
        meta_obj.insert("otps".to_string(), otps.clone());
    }
    if let Some(import_source) = data
        .get("import_source")
        .or_else(|| data.get("importSource"))
    {
        meta_obj.insert("import_source".to_string(), import_source.clone());
    }
    if let Some(group_path) = data
        .get("groupPath")
        .and_then(|v| v.as_str())
        .or_else(|| data.get("group_path").and_then(|v| v.as_str()))
    {
        meta_obj.insert(
            "groupPath".to_string(),
            serde_json::Value::String(group_path.to_string()),
        );
    }
    if let Some(icon_ref) = data
        .get("iconRef")
        .and_then(|v| v.as_str())
        .or_else(|| data.get("icon_ref").and_then(|v| v.as_str()))
    {
        meta_obj.insert(
            "iconRef".to_string(),
            serde_json::Value::String(icon_ref.to_string()),
        );
    }
    if let Some(ssh_keys) = data.get("sshKeys").and_then(|v| v.as_array()) {
        meta_obj.insert(
            "sshKeys".to_string(),
            serde_json::Value::Array(ssh_keys.clone()),
        );
        // Remove old scalar fields when new format is used
        meta_obj.remove("sshKeyType");
        meta_obj.remove("sshKeyFingerprint");
        meta_obj.remove("sshKeyComment");
    } else {
        // Backward compat: accept old scalar fields
        if let Some(v) = data
            .get("sshKeyType")
            .and_then(|v| v.as_str())
            .or_else(|| data.get("ssh_key_type").and_then(|v| v.as_str()))
        {
            meta_obj.insert(
                "sshKeyType".to_string(),
                serde_json::Value::String(v.to_string()),
            );
        }
        if let Some(v) = data
            .get("sshKeyFingerprint")
            .and_then(|v| v.as_str())
            .or_else(|| data.get("ssh_key_fingerprint").and_then(|v| v.as_str()))
        {
            meta_obj.insert(
                "sshKeyFingerprint".to_string(),
                serde_json::Value::String(v.to_string()),
            );
        }
        if let Some(v) = data
            .get("sshKeyComment")
            .and_then(|v| v.as_str())
            .or_else(|| data.get("ssh_key_comment").and_then(|v| v.as_str()))
        {
            meta_obj.insert(
                "sshKeyComment".to_string(),
                serde_json::Value::String(v.to_string()),
            );
        }
    }

    let write_resp = write_entry_meta_json(s, storage, node_id, &meta);
    if !write_resp.is_ok() {
        return write_resp;
    }

    RpcResponse::success(serde_json::json!({"entry_id": out_entry_id}))
}

pub(super) fn handle_read(
    s: &VaultSession,
    storage: &crate::storage::Storage,
    data: &serde_json::Value,
) -> RpcResponse {
    let Some(entry_id) = entry_id_from_data(data) else {
        return RpcResponse::error("entry_id is required", Some(ErrorCode::EmptyPayload));
    };
    let Some(node_id) = resolve_entry_node_id(s, storage, &entry_id) else {
        return RpcResponse::error("Entry not found", Some(ErrorCode::NodeNotFound));
    };

    let Some(mut meta) = read_entry_meta_json(s, storage, node_id) else {
        return RpcResponse::error("Entry metadata not found", Some(ErrorCode::NodeNotFound));
    };
    let Some(meta_obj) = meta.as_object_mut() else {
        return RpcResponse::error(
            "meta.json must be an object",
            Some(ErrorCode::InternalError),
        );
    };
    if !meta_obj.contains_key("id") {
        meta_obj.insert("id".to_string(), serde_json::Value::String(entry_id));
    }

    // Backward compat: synthesize sshKeys array from old scalar fields
    if !meta_obj.contains_key("sshKeys") {
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

    RpcResponse::success(serde_json::json!({
        "entry": meta
    }))
}

pub(super) fn handle_delete(
    s: &mut VaultSession,
    storage: &crate::storage::Storage,
    data: &serde_json::Value,
) -> RpcResponse {
    let Some(entry_id) = entry_id_from_data(data) else {
        return RpcResponse::error("entry_id is required", Some(ErrorCode::EmptyPayload));
    };
    let Some(node_id) = resolve_entry_node_id(s, storage, &entry_id) else {
        return RpcResponse::error("Entry not found", Some(ErrorCode::NodeNotFound));
    };
    with_system_shard_guard_bypass(|| {
        handle_catalog_delete(s, &serde_json::json!({"node_id": node_id}), storage)
    })
}

pub(super) fn handle_move(
    s: &mut VaultSession,
    storage: &crate::storage::Storage,
    data: &serde_json::Value,
) -> RpcResponse {
    let Some(entry_id) = entry_id_from_data(data) else {
        return RpcResponse::error("entry_id is required", Some(ErrorCode::EmptyPayload));
    };
    let Some(node_id) = resolve_entry_node_id(s, storage, &entry_id) else {
        return RpcResponse::error("Entry not found", Some(ErrorCode::NodeNotFound));
    };
    let target_group_path = data.get("target_group_path").and_then(|v| v.as_str());
    let Some(new_parent_path) = map_entry_group_path_to_passmanager_path(target_group_path) else {
        return RpcResponse::error("Access denied", Some(ErrorCode::AccessDenied));
    };
    with_system_shard_guard_bypass(|| {
        handle_catalog_move(
            s,
            &serde_json::json!({
                "node_id": node_id,
                "new_parent_path": new_parent_path,
            }),
        )
    })
}

pub(super) fn handle_rename(
    s: &mut VaultSession,
    storage: &crate::storage::Storage,
    data: &serde_json::Value,
) -> RpcResponse {
    let Some(entry_id) = entry_id_from_data(data) else {
        return RpcResponse::error("entry_id is required", Some(ErrorCode::EmptyPayload));
    };
    let Some(node_id) = resolve_entry_node_id(s, storage, &entry_id) else {
        return RpcResponse::error("Entry not found", Some(ErrorCode::NodeNotFound));
    };
    let new_name = match data.get("new_title").and_then(|v| v.as_str()) {
        Some(v) if !v.trim().is_empty() => v.trim(),
        _ => return RpcResponse::error("new_title is required", Some(ErrorCode::EmptyPayload)),
    };
    let renamed = with_system_shard_guard_bypass(|| {
        handle_catalog_rename(
            s,
            &serde_json::json!({
                "node_id": node_id,
                "new_name": new_name,
            }),
        )
    });
    if !renamed.is_ok() {
        return renamed;
    }

    let mut meta = read_entry_meta_json(s, storage, node_id)
        .unwrap_or_else(|| serde_json::Value::Object(serde_json::Map::new()));
    let Some(meta_obj) = meta.as_object_mut() else {
        return RpcResponse::error(
            "meta.json must be an object",
            Some(ErrorCode::InternalError),
        );
    };
    meta_obj.insert(
        "title".to_string(),
        serde_json::Value::String(new_name.to_string()),
    );
    if !meta_obj.contains_key("id") {
        meta_obj.insert("id".to_string(), serde_json::Value::String(entry_id));
    }

    let write_resp = write_entry_meta_json(s, storage, node_id, &meta);
    if !write_resp.is_ok() {
        return write_resp;
    }

    RpcResponse::success(serde_json::Value::Null)
}

pub(super) fn handle_list(
    s: &VaultSession,
    storage: &crate::storage::Storage,
    _data: &serde_json::Value,
) -> RpcResponse {
    let mut out_entries = Vec::<serde_json::Value>::new();
    let mut folders = std::collections::BTreeSet::<String>::new();

    let Some(pm_root) = s.catalog().find_by_path("/.passmanager") else {
        return RpcResponse::success(serde_json::json!({
            "entries": out_entries,
            "folders": Vec::<String>::new(),
        }));
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
            if !meta_obj.contains_key("groupPath") {
                meta_obj.insert(
                    "groupPath".to_string(),
                    serde_json::Value::String(group_path),
                );
            }
        }

        out_entries.push(meta);
    }

    RpcResponse::success(serde_json::json!({
        "entries": out_entries,
        "folders": folders.into_iter().collect::<Vec<String>>(),
    }))
}
