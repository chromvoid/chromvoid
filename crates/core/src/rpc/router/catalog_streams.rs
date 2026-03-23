//! Catalog streaming operations — upload, download, secret read/write via streams

use std::io::Read;

use crate::error::ErrorCode;
use crate::rpc::commands::is_system_path_guarded;
use crate::rpc::stream::{RpcInputStream, RpcOutputStream, RpcReply, RpcStreamMeta};
use crate::rpc::types::RpcResponse;

use super::blob_reader::CatalogBlobReader;
use super::state::RpcRouter;

impl RpcRouter {
    pub(super) fn handle_catalog_upload_stream(
        &mut self,
        data: &serde_json::Value,
        stream: Option<RpcInputStream>,
    ) -> RpcReply {
        let session = match self.session.as_mut() {
            Some(s) => s,
            None => {
                return RpcReply::Json(RpcResponse::error(
                    "Vault not unlocked",
                    Some(ErrorCode::VaultRequired),
                ))
            }
        };

        let node_id = match data.get("node_id").and_then(|v| v.as_u64()) {
            Some(id) => id,
            None => {
                return RpcReply::Json(RpcResponse::error(
                    "node_id is required",
                    Some(ErrorCode::EmptyPayload),
                ))
            }
        };
        let size = match data.get("size").and_then(|v| v.as_u64()) {
            Some(s) => s,
            None => {
                return RpcReply::Json(RpcResponse::error(
                    "size is required",
                    Some(ErrorCode::EmptyPayload),
                ))
            }
        };
        let offset = data.get("offset").and_then(|v| v.as_u64()).unwrap_or(0);

        if let Some(path) = session.catalog().get_path(node_id) {
            if is_system_path_guarded(&path) {
                return RpcReply::Json(RpcResponse::error(
                    "Access denied",
                    Some(ErrorCode::AccessDenied),
                ));
            }
        }

        let node = match session.catalog().find_by_id(node_id) {
            Some(n) => n,
            None => {
                return RpcReply::Json(RpcResponse::error(
                    "Node not found",
                    Some(ErrorCode::NodeNotFound),
                ))
            }
        };
        if !node.is_file() {
            return RpcReply::Json(RpcResponse::error(
                "Node is not a file",
                Some(ErrorCode::InternalError),
            ));
        }

        let stream = match stream {
            Some(s) => s,
            None => {
                return RpcReply::Json(RpcResponse::error(
                    "No incoming stream",
                    Some(ErrorCode::NoStream),
                ))
            }
        };

        let mut reader = stream.into_reader();
        let mut content = Vec::new();
        if let Err(e) = reader.read_to_end(&mut content) {
            return RpcReply::Json(RpcResponse::error(
                format!("Failed to read stream: {}", e),
                Some(ErrorCode::InternalError),
            ));
        }

        if content.len() as u64 != size {
            return RpcReply::Json(RpcResponse::error(
                "Size mismatch",
                Some(ErrorCode::InternalError),
            ));
        }

        let declared_size = node.size;
        if offset.saturating_add(content.len() as u64) > declared_size {
            return RpcReply::Json(RpcResponse::error(
                "Size exceeds declared file size",
                Some(ErrorCode::InvalidOffset),
            ));
        }

        let chunk_size_u32 = if node.chunk_size == 0 {
            crate::types::DEFAULT_CHUNK_SIZE
        } else {
            node.chunk_size
        };
        let chunk_size = chunk_size_u32 as u64;
        if chunk_size == 0 {
            return RpcReply::Json(RpcResponse::error(
                "Invalid chunk size",
                Some(ErrorCode::InternalError),
            ));
        }

        let vault_key = session.vault_key();
        let node_id32: u32 = match node_id.try_into() {
            Ok(v) => v,
            Err(_) => {
                return RpcReply::Json(RpcResponse::error(
                    "Invalid node_id",
                    Some(ErrorCode::InternalError),
                ))
            }
        };

        let chunk_name = |part_index: u32| -> String {
            crate::crypto::blob_chunk_name(vault_key, node_id32, part_index)
        };

        // If we start from offset=0, we overwrite the whole file content.
        // Clean existing chunks to avoid leftover data when rewriting a shorter file.
        if offset == 0 {
            for index in 0u32.. {
                let name = chunk_name(index);
                match self.storage.chunk_exists(&name) {
                    Ok(true) => {
                        let _ = self.storage.delete_chunk(&name);
                    }
                    _ => break,
                }
            }
        }

        // Write only affected chunks instead of rewriting the entire file each time.
        let mut pos: usize = 0;
        let mut wrote_any = false;
        while pos < content.len() {
            let abs = offset.saturating_add(pos as u64);
            let chunk_index_u64 = abs / chunk_size;
            let in_chunk = (abs % chunk_size) as usize;

            let expected_len_u64 =
                declared_size.saturating_sub(chunk_index_u64.saturating_mul(chunk_size));
            if expected_len_u64 == 0 {
                break;
            }
            let expected_len = std::cmp::min(chunk_size, expected_len_u64) as usize;
            if in_chunk >= expected_len {
                return RpcReply::Json(RpcResponse::error(
                    "Invalid offset",
                    Some(ErrorCode::InvalidOffset),
                ));
            }

            let write_len = std::cmp::min(expected_len - in_chunk, content.len() - pos);
            let chunk_index: u32 = match u32::try_from(chunk_index_u64) {
                Ok(v) => v,
                Err(_) => {
                    return RpcReply::Json(RpcResponse::error(
                        "Invalid chunk index",
                        Some(ErrorCode::InternalError),
                    ))
                }
            };

            let name = chunk_name(chunk_index);

            let plaintext: std::borrow::Cow<'_, [u8]> = if in_chunk == 0
                && write_len == expected_len
            {
                std::borrow::Cow::Borrowed(&content[pos..pos + write_len])
            } else {
                let mut buf = vec![0u8; expected_len];
                match self.storage.read_chunk(&name) {
                    Ok(encrypted) => {
                        match crate::crypto::decrypt(&encrypted, vault_key, name.as_bytes()) {
                            Ok(existing) => {
                                let copy_len = std::cmp::min(existing.len(), expected_len);
                                buf[..copy_len].copy_from_slice(&existing[..copy_len]);
                            }
                            Err(e) => {
                                return RpcReply::Json(RpcResponse::error(
                                    format!("Decryption failed: {}", e),
                                    Some(ErrorCode::InternalError),
                                ))
                            }
                        }
                    }
                    Err(_) => {}
                }

                buf[in_chunk..in_chunk + write_len].copy_from_slice(&content[pos..pos + write_len]);
                std::borrow::Cow::Owned(buf)
            };

            let encrypted =
                match crate::crypto::encrypt(plaintext.as_ref(), vault_key, name.as_bytes()) {
                    Ok(data) => data,
                    Err(e) => {
                        return RpcReply::Json(RpcResponse::error(
                            format!("Encryption failed: {}", e),
                            Some(ErrorCode::InternalError),
                        ))
                    }
                };
            if let Err(e) = self.storage.write_chunk_no_sync(&name, &encrypted) {
                return RpcReply::Json(RpcResponse::error(
                    format!("Storage write failed: {}", e),
                    Some(ErrorCode::InternalError),
                ));
            }
            wrote_any = true;

            pos += write_len;
        }

        if wrote_any {
            if let Err(e) = self.storage.sync() {
                return RpcReply::Json(RpcResponse::error(
                    format!("Storage sync failed: {}", e),
                    Some(ErrorCode::InternalError),
                ));
            }
        }

        let end = offset.saturating_add(content.len() as u64);
        if end >= declared_size {
            if let Some(node) = session.catalog_mut().find_by_id_mut(node_id) {
                node.touch();
            }
        }

        RpcReply::Json(RpcResponse::success(serde_json::Value::Null))
    }

    pub(super) fn handle_catalog_download_stream(&mut self, data: &serde_json::Value) -> RpcReply {
        let session = match &self.session {
            Some(s) => s,
            None => {
                return RpcReply::Json(RpcResponse::error(
                    "Vault not unlocked",
                    Some(ErrorCode::VaultRequired),
                ))
            }
        };

        let node_id = match data.get("node_id").and_then(|v| v.as_u64()) {
            Some(id) => id,
            None => {
                return RpcReply::Json(RpcResponse::error(
                    "node_id is required",
                    Some(ErrorCode::EmptyPayload),
                ))
            }
        };

        if let Some(path) = session.catalog().get_path(node_id) {
            if is_system_path_guarded(&path) {
                return RpcReply::Json(RpcResponse::error(
                    "Access denied",
                    Some(ErrorCode::AccessDenied),
                ));
            }
        }

        let node = match session.catalog().find_by_id(node_id) {
            Some(n) => n,
            None => {
                return RpcReply::Json(RpcResponse::error(
                    "Node not found",
                    Some(ErrorCode::NodeNotFound),
                ))
            }
        };
        if !node.is_file() {
            return RpcReply::Json(RpcResponse::error(
                "Node is not a file",
                Some(ErrorCode::InternalError),
            ));
        }

        let node_id32: u32 = match node_id.try_into() {
            Ok(v) => v,
            Err(_) => {
                return RpcReply::Json(RpcResponse::error(
                    "Invalid node_id",
                    Some(ErrorCode::InternalError),
                ))
            }
        };

        let meta = RpcStreamMeta {
            name: node.name.clone(),
            mime_type: node
                .mime_type
                .clone()
                .unwrap_or_else(|| "application/octet-stream".to_string()),
            size: node.size,
            chunk_size: node.chunk_size,
        };

        RpcReply::Stream(RpcOutputStream {
            meta,
            reader: Box::new(CatalogBlobReader::new(
                self.storage.clone(),
                session.vault_key(),
                node_id32,
            )),
        })
    }

    pub(super) fn handle_catalog_secret_write_stream(
        &mut self,
        data: &serde_json::Value,
        stream: Option<RpcInputStream>,
    ) -> RpcReply {
        // For now, secrets use the same chunk layout as regular file data.
        self.handle_catalog_upload_stream(data, stream)
    }

    pub(super) fn handle_catalog_secret_read_stream(
        &mut self,
        data: &serde_json::Value,
    ) -> RpcReply {
        // For now, secrets use the same chunk layout as regular file data.
        self.handle_catalog_download_stream(data)
    }
}
