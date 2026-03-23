//! Legacy admin command handlers (erase, backup, restore)

use serde_json::Value;

use base64::{engine::general_purpose, Engine as _};

use crate::error::ErrorCode;

use super::super::types::{BackupResponse, RpcResponse};

#[allow(dead_code)]
pub fn handle_admin_erase(
    data: &Value,
    storage: &crate::storage::Storage,
    master_key: &str,
) -> RpcResponse {
    let provided_key = match data.get("master_key").and_then(|v| v.as_str()) {
        Some(k) => k,
        None => return RpcResponse::error("master_key is required", Some(ErrorCode::EmptyPayload)),
    };

    let confirm = data
        .get("confirm")
        .and_then(|v| v.as_bool())
        .unwrap_or(false);
    if !confirm {
        return RpcResponse::error("Confirmation required", Some(ErrorCode::EraseNoConfirm));
    }

    if provided_key != master_key {
        return RpcResponse::error("Invalid master key", Some(ErrorCode::InvalidMasterKey));
    }

    match storage.erase_all() {
        Ok(()) => RpcResponse::success(Value::Null),
        Err(e) => RpcResponse::error(
            format!("Failed to erase storage: {}", e),
            Some(ErrorCode::InternalError),
        ),
    }
}

#[allow(dead_code)]
pub fn handle_admin_backup(
    data: &Value,
    storage: &crate::storage::Storage,
    master_key: &str,
) -> RpcResponse {
    let provided_key = match data.get("master_key").and_then(|v| v.as_str()) {
        Some(k) => k,
        None => return RpcResponse::error("master_key is required", Some(ErrorCode::EmptyPayload)),
    };

    if provided_key != master_key {
        return RpcResponse::error("Invalid master key", Some(ErrorCode::InvalidMasterKey));
    }

    let chunks = match storage.list_chunks() {
        Ok(c) => c,
        Err(e) => {
            return RpcResponse::error(
                format!("Failed to list chunks: {}", e),
                Some(ErrorCode::InternalError),
            )
        }
    };

    let mut backup_data: Vec<(String, Vec<u8>)> = Vec::new();

    if let Ok(salt) = storage.get_or_create_salt() {
        backup_data.push(("__salt__".to_string(), salt.to_vec()));
    }

    for chunk_name in chunks {
        match storage.read_chunk(&chunk_name) {
            Ok(data) => backup_data.push((chunk_name, data)),
            Err(e) => {
                return RpcResponse::error(
                    format!("Failed to read chunk: {}", e),
                    Some(ErrorCode::InternalError),
                )
            }
        }
    }

    let backup_json = match serde_json::to_vec(&backup_data) {
        Ok(j) => j,
        Err(e) => {
            return RpcResponse::error(
                format!("Failed to serialize backup: {}", e),
                Some(ErrorCode::InternalError),
            )
        }
    };

    let timestamp = std::time::SystemTime::now()
        .duration_since(std::time::UNIX_EPOCH)
        .map(|d| d.as_secs())
        .unwrap_or(0);

    let response = BackupResponse {
        name: format!("chromvoid-backup-{}.backup", timestamp),
        content: general_purpose::STANDARD_NO_PAD.encode(&backup_json),
        size: backup_json.len() as u64,
    };

    RpcResponse::success(response)
}

#[allow(dead_code)]
pub fn handle_admin_restore(
    data: &Value,
    storage: &crate::storage::Storage,
    master_key: &str,
) -> RpcResponse {
    let provided_key = match data.get("master_key").and_then(|v| v.as_str()) {
        Some(k) => k,
        None => return RpcResponse::error("master_key is required", Some(ErrorCode::EmptyPayload)),
    };

    if provided_key != master_key {
        return RpcResponse::error("Invalid master key", Some(ErrorCode::InvalidMasterKey));
    }

    let content_base64 = match data.get("content").and_then(|v| v.as_str()) {
        Some(c) => c,
        None => return RpcResponse::error("content is required", Some(ErrorCode::EmptyPayload)),
    };

    let existing_chunks = match storage.list_chunks() {
        Ok(c) => c,
        Err(e) => {
            return RpcResponse::error(
                format!("Failed to check storage state: {}", e),
                Some(ErrorCode::InternalError),
            )
        }
    };

    if !existing_chunks.is_empty() {
        return RpcResponse::error(
            "Storage must be blank for restore. Use admin:erase first.",
            Some(ErrorCode::InternalError),
        );
    }

    let backup_json = match general_purpose::STANDARD_NO_PAD.decode(content_base64) {
        Ok(data) => data,
        Err(e) => {
            return RpcResponse::error(
                format!("Invalid backup content: {}", e),
                Some(ErrorCode::InternalError),
            )
        }
    };

    let backup_data: Vec<(String, Vec<u8>)> = match serde_json::from_slice(&backup_json) {
        Ok(data) => data,
        Err(e) => {
            return RpcResponse::error(
                format!("Invalid backup format: {}", e),
                Some(ErrorCode::InternalError),
            )
        }
    };

    for (name, data) in backup_data {
        if name == "__salt__" {
            let salt_path = storage.base_path().join("salt");
            if let Err(e) = std::fs::write(&salt_path, &data) {
                return RpcResponse::error(
                    format!("Failed to restore salt: {}", e),
                    Some(ErrorCode::InternalError),
                );
            }
        } else if let Err(e) = storage.write_chunk(&name, &data) {
            return RpcResponse::error(
                format!("Failed to restore chunk {}: {}", name, e),
                Some(ErrorCode::InternalError),
            );
        }
    }

    RpcResponse::success(Value::Null)
}
