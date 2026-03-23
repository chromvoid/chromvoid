//! Catalog secret command handlers (write, read, erase)

use serde_json::Value;

use base64::{engine::general_purpose, Engine as _};

use crate::error::ErrorCode;
use crate::vault::VaultSession;

use super::super::types::{RpcResponse, SecretReadResponse};
use super::guards::{is_system_node, system_shard_denied};

#[allow(dead_code)]
pub fn handle_catalog_secret_write(
    session: &mut VaultSession,
    data: &Value,
    storage: &crate::storage::Storage,
) -> RpcResponse {
    let node_id = match data.get("node_id").and_then(|v| v.as_u64()) {
        Some(id) => id,
        None => return RpcResponse::error("node_id is required", Some(ErrorCode::EmptyPayload)),
    };

    if is_system_node(session, node_id) {
        return system_shard_denied();
    }

    let content_base64 = match data.get("content").and_then(|v| v.as_str()) {
        Some(c) => c,
        None => return RpcResponse::error("content is required", Some(ErrorCode::EmptyPayload)),
    };

    let node = match session.catalog().find_by_id(node_id) {
        Some(n) => n,
        None => return RpcResponse::error("Node not found", Some(ErrorCode::NodeNotFound)),
    };

    if !node.is_file() {
        return RpcResponse::error("Node is not a file", Some(ErrorCode::InternalError));
    }

    let content = match general_purpose::STANDARD_NO_PAD.decode(content_base64) {
        Ok(c) => c,
        Err(e) => {
            return RpcResponse::error(
                format!("Invalid base64 content: {}", e),
                Some(ErrorCode::InternalError),
            )
        }
    };

    let vault_key = session.vault_key();
    let node_id32: u32 = match node_id.try_into() {
        Ok(v) => v,
        Err(_) => return RpcResponse::error("Invalid node_id", Some(ErrorCode::InternalError)),
    };
    let chunk_name = crate::crypto::blob_chunk_name(vault_key, node_id32, 0);

    let encrypted = match crate::crypto::encrypt(&content, vault_key, chunk_name.as_bytes()) {
        Ok(data) => data,
        Err(e) => {
            return RpcResponse::error(
                format!("Encryption failed: {}", e),
                Some(ErrorCode::InternalError),
            )
        }
    };

    if let Err(e) = storage.write_chunk(&chunk_name, &encrypted) {
        return RpcResponse::error(
            format!("Failed to write secret: {}", e),
            Some(ErrorCode::InternalError),
        );
    }

    RpcResponse::success(Value::Null)
}

#[allow(dead_code)]
pub fn handle_catalog_secret_read(
    session: &VaultSession,
    data: &Value,
    storage: &crate::storage::Storage,
) -> RpcResponse {
    let node_id = match data.get("node_id").and_then(|v| v.as_u64()) {
        Some(id) => id,
        None => return RpcResponse::error("node_id is required", Some(ErrorCode::EmptyPayload)),
    };

    if is_system_node(session, node_id) {
        return system_shard_denied();
    }

    let node = match session.catalog().find_by_id(node_id) {
        Some(n) => n,
        None => return RpcResponse::error("Node not found", Some(ErrorCode::NodeNotFound)),
    };

    if !node.is_file() {
        return RpcResponse::error("Node is not a file", Some(ErrorCode::InternalError));
    }

    let vault_key = session.vault_key();
    let node_id32: u32 = match node_id.try_into() {
        Ok(v) => v,
        Err(_) => return RpcResponse::error("Invalid node_id", Some(ErrorCode::InternalError)),
    };
    let chunk_name = crate::crypto::blob_chunk_name(vault_key, node_id32, 0);

    let encrypted = match storage.read_chunk(&chunk_name) {
        Ok(data) => data,
        Err(e) => {
            return RpcResponse::error(
                format!("Failed to read secret: {}", e),
                Some(ErrorCode::NodeNotFound),
            )
        }
    };

    match crate::crypto::decrypt(&encrypted, vault_key, chunk_name.as_bytes()) {
        Ok(content) => {
            let content_base64 = general_purpose::STANDARD_NO_PAD.encode(&content);
            RpcResponse::success(SecretReadResponse {
                node_id,
                content: content_base64,
            })
        }
        Err(e) => RpcResponse::error(
            format!("Decryption failed: {}", e),
            Some(ErrorCode::InternalError),
        ),
    }
}

pub fn handle_catalog_secret_erase(
    session: &VaultSession,
    data: &Value,
    storage: &crate::storage::Storage,
) -> RpcResponse {
    let node_id = match data.get("node_id").and_then(|v| v.as_u64()) {
        Some(id) => id,
        None => return RpcResponse::error("node_id is required", Some(ErrorCode::EmptyPayload)),
    };

    if is_system_node(session, node_id) {
        return system_shard_denied();
    }

    let node = match session.catalog().find_by_id(node_id) {
        Some(n) => n,
        None => return RpcResponse::error("Node not found", Some(ErrorCode::NodeNotFound)),
    };

    if !node.is_file() {
        return RpcResponse::error("Node is not a file", Some(ErrorCode::InternalError));
    }

    let vault_key = session.vault_key();
    let node_id32: u32 = match u32::try_from(node_id) {
        Ok(v) => v,
        Err(_) => return RpcResponse::error("Invalid node_id", Some(ErrorCode::InternalError)),
    };

    for index in 0u32.. {
        let chunk_name = crate::crypto::blob_chunk_name(vault_key, node_id32, index);

        if !storage.chunk_exists(&chunk_name).unwrap_or(false) {
            break;
        }

        // Best-effort overwrite (not guaranteed on modern filesystems).
        let zeros = vec![0u8; 64];
        let encrypted = match crate::crypto::encrypt(&zeros, vault_key, chunk_name.as_bytes()) {
            Ok(data) => data,
            Err(e) => {
                return RpcResponse::error(
                    format!("Encryption failed: {}", e),
                    Some(ErrorCode::InternalError),
                )
            }
        };
        if let Err(e) = storage.write_chunk(&chunk_name, &encrypted) {
            return RpcResponse::error(
                format!("Failed to erase secret: {}", e),
                Some(ErrorCode::InternalError),
            );
        }

        if let Err(e) = storage.delete_chunk(&chunk_name) {
            return RpcResponse::error(
                format!("Failed to delete chunk: {}", e),
                Some(ErrorCode::InternalError),
            );
        }
    }

    RpcResponse::success(Value::Null)
}
