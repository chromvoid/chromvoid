//! Secret utilities and handler free functions for PassManager.

use super::super::super::commands::{
    handle_catalog_delete, handle_catalog_download, handle_catalog_prepare_upload,
    handle_catalog_upload, with_system_shard_guard_bypass,
};
use super::super::super::types::RpcResponse;
use super::entry::resolve_entry_node_id;
use super::path::{entry_id_from_data, is_passmanager_path};
use crate::error::ErrorCode;
use crate::vault::VaultSession;
use base64::{engine::general_purpose, Engine as _};

pub(super) fn parse_secret_type(data: &serde_json::Value) -> Option<&str> {
    data.get("secret_type")
        .and_then(|v| v.as_str())
        .or_else(|| data.get("type").and_then(|v| v.as_str()))
}

fn is_valid_ssh_key_id(id: &str) -> bool {
    !id.is_empty()
        && id.len() <= 64
        && id
            .bytes()
            .all(|b| b.is_ascii_alphanumeric() || b == b'-' || b == b'_')
}

pub(super) fn secret_filename(secret_type: &str) -> Option<String> {
    match secret_type {
        "password" => Some(".password".to_string()),
        "note" => Some(".note".to_string()),
        // Backward compat: old static types map to indexed "default"
        "ssh_private_key" => Some(".ssh_private_key.default".to_string()),
        "ssh_public_key" => Some(".ssh_public_key.default".to_string()),
        _ => {
            // Indexed format: ssh_private_key:<id> / ssh_public_key:<id>
            if let Some(id) = secret_type.strip_prefix("ssh_private_key:") {
                if is_valid_ssh_key_id(id) {
                    return Some(format!(".ssh_private_key.{id}"));
                }
            }
            if let Some(id) = secret_type.strip_prefix("ssh_public_key:") {
                if is_valid_ssh_key_id(id) {
                    return Some(format!(".ssh_public_key.{id}"));
                }
            }
            None
        }
    }
}

pub(super) fn handle_save(
    s: &mut VaultSession,
    storage: &crate::storage::Storage,
    data: &serde_json::Value,
) -> RpcResponse {
    let Some(entry_id) = entry_id_from_data(data) else {
        return RpcResponse::error("entry_id is required", Some(ErrorCode::EmptyPayload));
    };
    let Some(secret_type) = parse_secret_type(data) else {
        return RpcResponse::error("secret_type is required", Some(ErrorCode::EmptyPayload));
    };
    let Some(secret_name) = secret_filename(secret_type) else {
        return RpcResponse::error("Unsupported secret type", Some(ErrorCode::EmptyPayload));
    };
    let Some(value_raw) = data.get("value") else {
        return RpcResponse::error("value is required", Some(ErrorCode::EmptyPayload));
    };
    let Some(value) = value_raw.as_str() else {
        return RpcResponse::error(
            "value must be string; use passmanager:secret:delete for null",
            Some(ErrorCode::EmptyPayload),
        );
    };

    let Some(entry_node_id) = resolve_entry_node_id(s, storage, &entry_id) else {
        return RpcResponse::error("Entry not found", Some(ErrorCode::NodeNotFound));
    };
    let Some(entry_path) = s.catalog().get_path(entry_node_id) else {
        return RpcResponse::error("Entry not found", Some(ErrorCode::NodeNotFound));
    };
    if !is_passmanager_path(&entry_path) {
        return RpcResponse::error("Access denied", Some(ErrorCode::AccessDenied));
    }

    let payload = value.as_bytes();
    let prepared = with_system_shard_guard_bypass(|| {
        handle_catalog_prepare_upload(
            s,
            &serde_json::json!({
                "parent_path": entry_path,
                "name": secret_name,
                "size": payload.len() as u64,
                "mime_type": "text/plain",
            }),
            storage,
        )
    });
    if !prepared.is_ok() {
        return prepared;
    }
    let Some(secret_node_id) = prepared
        .result()
        .and_then(|result| result.get("node_id"))
        .and_then(|v| v.as_u64())
    else {
        return RpcResponse::error("Secret node_id missing", Some(ErrorCode::InternalError));
    };

    with_system_shard_guard_bypass(|| {
        handle_catalog_upload(
            s,
            &serde_json::json!({
                "node_id": secret_node_id,
                "content": general_purpose::STANDARD_NO_PAD.encode(payload),
            }),
            storage,
        )
    })
}

pub(super) fn handle_read(
    s: &VaultSession,
    storage: &crate::storage::Storage,
    data: &serde_json::Value,
) -> RpcResponse {
    let Some(entry_id) = entry_id_from_data(data) else {
        return RpcResponse::error("entry_id is required", Some(ErrorCode::EmptyPayload));
    };
    let Some(secret_type) = parse_secret_type(data) else {
        return RpcResponse::error("secret_type is required", Some(ErrorCode::EmptyPayload));
    };
    let Some(secret_name) = secret_filename(secret_type) else {
        return RpcResponse::error("Unsupported secret type", Some(ErrorCode::EmptyPayload));
    };

    let Some(entry_node_id) = resolve_entry_node_id(s, storage, &entry_id) else {
        return RpcResponse::error("Entry not found", Some(ErrorCode::NodeNotFound));
    };
    let Some(entry_node) = s.catalog().find_by_id(entry_node_id) else {
        return RpcResponse::error("Entry not found", Some(ErrorCode::NodeNotFound));
    };
    let Some(secret_node) = entry_node.find_child(&secret_name) else {
        return RpcResponse::error("Secret not found", Some(ErrorCode::NodeNotFound));
    };

    let downloaded = with_system_shard_guard_bypass(|| {
        handle_catalog_download(
            s,
            &serde_json::json!({"node_id": secret_node.node_id}),
            storage,
        )
    });
    if !downloaded.is_ok() {
        return downloaded;
    }

    let Some(content) = downloaded
        .result()
        .and_then(|result| result.get("content"))
        .and_then(|v| v.as_str())
    else {
        return RpcResponse::error("Secret content missing", Some(ErrorCode::InternalError));
    };

    let bytes = match general_purpose::STANDARD_NO_PAD.decode(content) {
        Ok(v) => v,
        Err(e) => {
            return RpcResponse::error(
                format!("Failed to decode secret: {e}"),
                Some(ErrorCode::InternalError),
            )
        }
    };
    let value = match String::from_utf8(bytes) {
        Ok(v) => v,
        Err(e) => {
            return RpcResponse::error(
                format!("Secret is not valid UTF-8: {e}"),
                Some(ErrorCode::InternalError),
            )
        }
    };

    RpcResponse::success(serde_json::json!({"value": value}))
}

pub(super) fn handle_delete(
    s: &mut VaultSession,
    storage: &crate::storage::Storage,
    data: &serde_json::Value,
) -> RpcResponse {
    let Some(entry_id) = entry_id_from_data(data) else {
        return RpcResponse::error("entry_id is required", Some(ErrorCode::EmptyPayload));
    };
    let Some(secret_type) = parse_secret_type(data) else {
        return RpcResponse::error("secret_type is required", Some(ErrorCode::EmptyPayload));
    };
    let Some(secret_name) = secret_filename(secret_type) else {
        return RpcResponse::error("Unsupported secret type", Some(ErrorCode::EmptyPayload));
    };

    let Some(entry_node_id) = resolve_entry_node_id(s, storage, &entry_id) else {
        return RpcResponse::error("Entry not found", Some(ErrorCode::NodeNotFound));
    };
    let Some(entry_node) = s.catalog().find_by_id(entry_node_id) else {
        return RpcResponse::error("Entry not found", Some(ErrorCode::NodeNotFound));
    };
    let Some(secret_node_id) = entry_node.find_child(&secret_name).map(|n| n.node_id) else {
        return RpcResponse::error("Secret not found", Some(ErrorCode::NodeNotFound));
    };

    with_system_shard_guard_bypass(|| {
        handle_catalog_delete(s, &serde_json::json!({"node_id": secret_node_id}), storage)
    })
}
