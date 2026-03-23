//! Catalog upload/download command handlers (base64 variants)

use serde_json::Value;

use base64::{engine::general_purpose, Engine as _};

use crate::error::ErrorCode;
use crate::vault::VaultSession;

use super::super::types::{DownloadResponse, PrepareUploadResponse, RpcResponse, UploadResponse};
use super::guards::{
    is_system_node, is_system_path_guarded, normalize_path, shard_id_from_path,
    shard_relative_path, system_shard_denied,
};

pub fn handle_catalog_prepare_upload(
    session: &mut VaultSession,
    data: &Value,
    storage: &crate::storage::Storage,
) -> RpcResponse {
    let name = match data.get("name").and_then(|v| v.as_str()) {
        Some(n) => n,
        None => return RpcResponse::error("name is required", Some(ErrorCode::EmptyPayload)),
    };

    let size = match data.get("size").and_then(|v| v.as_u64()) {
        Some(s) => s,
        None => return RpcResponse::error("size is required", Some(ErrorCode::EmptyPayload)),
    };

    let parent_path = data
        .get("parent_path")
        .and_then(|v| v.as_str())
        .unwrap_or("/");

    if is_system_path_guarded(parent_path) {
        return system_shard_denied();
    }

    let mime_type = data
        .get("mime_type")
        .and_then(|v| v.as_str())
        .map(|s| s.to_string());

    let chunk_size = data
        .get("chunk_size")
        .and_then(|v| v.as_u64())
        .and_then(|v| u32::try_from(v).ok());

    let existing_id = session
        .catalog()
        .find_by_path(&format!(
            "{}/{}",
            if parent_path == "/" { "" } else { parent_path },
            name
        ))
        .and_then(|n| if n.is_file() { Some(n.node_id) } else { None });
    if let Some(node_id) = existing_id {
        let mut size_changed = false;

        if let Some(node) = session.catalog_mut().find_by_id_mut(node_id) {
            if node.size != size {
                node.size = size;
                size_changed = true;
            }
            let now = std::time::SystemTime::now()
                .duration_since(std::time::UNIX_EPOCH)
                .map(|d| d.as_millis() as u64)
                .unwrap_or(0);
            if node.birthtime == 0 {
                node.birthtime = now;
            }
            node.modtime = now;

            if size_changed {
                let full_path = normalize_path(&format!(
                    "{}/{}",
                    if parent_path == "/" { "" } else { parent_path },
                    name
                ));

                if let Some(shard_id) = shard_id_from_path(&full_path) {
                    if let Some(rel_path) = shard_relative_path(&shard_id, &full_path) {
                        let mut fields = crate::catalog::PartialNode::default();
                        fields.size = Some(size);
                        fields.modtime = Some(now);
                        session.record_delta(
                            &shard_id,
                            crate::catalog::DeltaEntry::update(0, rel_path, fields)
                                .with_node_id(node_id),
                        );
                    }
                }
            }
        }

        if let Some(cs) = chunk_size {
            let _ = session.catalog_mut().set_chunk_size(node_id, cs);
        }

        let node = match session.catalog().find_by_id(node_id) {
            Some(n) => n,
            None => return RpcResponse::error("Node not found", Some(ErrorCode::NodeNotFound)),
        };
        let uploaded_bytes = match compute_uploaded_bytes(storage, session.vault_key(), node) {
            Ok(v) => v,
            Err(r) => return r,
        };
        return RpcResponse::success(PrepareUploadResponse {
            node_id,
            uploaded_bytes,
        });
    }

    match session
        .catalog_mut()
        .create_file(parent_path, name, size, mime_type)
    {
        Ok(node_id) => {
            let parent_norm = normalize_path(parent_path);
            if parent_norm != "/" {
                if let Some(shard_id) = shard_id_from_path(&parent_norm) {
                    if let Some(rel_parent) = shard_relative_path(&shard_id, &parent_norm) {
                        if let Some(node) = session.catalog().find_by_id(node_id).cloned() {
                            session.record_delta(
                                &shard_id,
                                crate::catalog::DeltaEntry::create(0, rel_parent, node),
                            );
                        }
                    }
                }
            }

            if let Some(cs) = chunk_size {
                let _ = session.catalog_mut().set_chunk_size(node_id, cs);
            }
            RpcResponse::success(PrepareUploadResponse {
                node_id,
                uploaded_bytes: 0,
            })
        }
        Err(e) => {
            let code = match &e {
                crate::error::Error::NameExists(_) => ErrorCode::NameExist,
                crate::error::Error::InvalidName(_) => ErrorCode::EmptyPayload,
                crate::error::Error::InvalidPath(_) => ErrorCode::NodeNotFound,
                crate::error::Error::NotADirectory(_) => ErrorCode::NotADir,
                _ => ErrorCode::InternalError,
            };
            RpcResponse::error(e.to_string(), Some(code))
        }
    }
}

fn compute_uploaded_bytes(
    storage: &crate::storage::Storage,
    vault_key: &[u8; crate::types::KEY_SIZE],
    node: &crate::catalog::CatalogNode,
) -> std::result::Result<u64, RpcResponse> {
    use crate::types::{NONCE_SIZE, TAG_SIZE};

    let node_id32: u32 = node
        .node_id
        .try_into()
        .map_err(|_| RpcResponse::error("Invalid node_id", Some(ErrorCode::InternalError)))?;

    let chunk_size = node.chunk_size as u64;
    let overhead = (NONCE_SIZE + TAG_SIZE) as u64;
    let expected_full_chunk_len = overhead + chunk_size;

    let mut total: u64 = 0;
    for index in 0u32.. {
        let chunk_name = crate::crypto::blob_chunk_name(vault_key, node_id32, index);
        let encrypted_len = match storage.chunk_len(&chunk_name) {
            Ok(len) => len,
            Err(_) => break,
        };

        if encrypted_len == expected_full_chunk_len {
            total = total.saturating_add(chunk_size as u64);
        } else {
            let encrypted = match storage.read_chunk(&chunk_name) {
                Ok(b) => b,
                Err(_) => break,
            };
            let plaintext =
                match crate::crypto::decrypt(&encrypted, vault_key, chunk_name.as_bytes()) {
                    Ok(p) => p,
                    Err(_) => break,
                };
            total = total.saturating_add(plaintext.len() as u64);
        }
    }
    Ok(total)
}

#[allow(dead_code)]
pub fn handle_catalog_upload(
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

    match general_purpose::STANDARD_NO_PAD.decode(content_base64) {
        Ok(content_vec) => {
            let vault_key = session.vault_key();
            let node_id32: u32 = match node_id.try_into() {
                Ok(v) => v,
                Err(_) => {
                    return RpcResponse::error("Invalid node_id", Some(ErrorCode::InternalError))
                }
            };
            let chunk_name = crate::crypto::blob_chunk_name(vault_key, node_id32, 0);
            let encrypted =
                match crate::crypto::encrypt(&content_vec, vault_key, chunk_name.as_bytes()) {
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
                    format!("Storage write failed: {}", e),
                    Some(ErrorCode::InternalError),
                );
            }

            let response = UploadResponse {
                node_id,
                size: content_vec.len() as u64,
            };

            RpcResponse::success(response)
        }
        Err(e) => RpcResponse::error(
            format!("Invalid base64 content: {}", e),
            Some(ErrorCode::InternalError),
        ),
    }
}

#[allow(dead_code)]
pub fn handle_catalog_download(
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
                format!("Failed to read chunk: {}", e),
                Some(ErrorCode::NodeNotFound),
            )
        }
    };

    match crate::crypto::decrypt(&encrypted, vault_key, chunk_name.as_bytes()) {
        Ok(content) => {
            let content_base64 = general_purpose::STANDARD_NO_PAD.encode(&content);
            let response = DownloadResponse {
                node_id,
                content: content_base64,
            };
            RpcResponse::success(response)
        }
        Err(e) => RpcResponse::error(
            format!("Decryption failed: {}", e),
            Some(ErrorCode::InternalError),
        ),
    }
}
