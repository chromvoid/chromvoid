//! Vault export handlers

use std::fs;
use std::io::{Read, Seek, SeekFrom, Write};

use base64::{engine::general_purpose, Engine as _};
use tar::{Builder as TarBuilder, EntryType, Header as TarHeader, HeaderMode};
use tempfile::Builder as TempfileBuilder;

#[cfg(unix)]
use std::os::unix::fs::PermissionsExt;

use super::super::stream::{RpcOutputStream, RpcReply, RpcStreamMeta};
use super::super::types::RpcResponse;
use super::state::RpcRouter;
use crate::error::ErrorCode;

/// Active vault-export session holding a temporary tar file.
#[derive(Debug)]
pub(super) struct VaultExportSession {
    id: String,
    temp_path: tempfile::TempPath,
    file_size: u64,
    file_hash: String,
    file_count: u64,
    included_otp_secrets: bool,
    chunk_size: usize,
}

impl RpcRouter {
    pub(super) fn clear_vault_export(&mut self) {
        if let Some(session) = self.vault_export.take() {
            drop(session);
        }
    }

    pub(super) fn handle_vault_export_start(&mut self, data: &serde_json::Value) -> RpcResponse {
        if self.session.is_none() {
            return RpcResponse::error("Vault not unlocked", Some(ErrorCode::VaultNotUnlocked));
        }

        let _vault_id = match data.get("vault_id").and_then(|v| v.as_str()) {
            Some(v) => v,
            None => {
                return RpcResponse::error("vault_id is required", Some(ErrorCode::EmptyPayload))
            }
        };
        let include_otp_secrets = data
            .get("include_otp_secrets")
            .and_then(|v| v.as_bool())
            .unwrap_or(false);

        if include_otp_secrets && self.master_key.is_none() {
            return RpcResponse::error(
                "master_password required to export OTP secrets",
                Some(ErrorCode::VaultExportMasterPasswordRequired),
            );
        }

        self.clear_vault_export();

        let ts = std::time::SystemTime::now()
            .duration_since(std::time::UNIX_EPOCH)
            .map(|d| d.as_millis() as u64)
            .unwrap_or(0);
        let export_id = format!("export-{}", ts);

        const EXPORT_CHUNK_SIZE: usize = 64 * 1024;

        let session = self.session.as_ref().expect("checked above");
        let vault_key = session.vault_key();

        fn walk(node: &crate::catalog::CatalogNode, ids: &mut Vec<u64>) {
            for child in node.children() {
                ids.push(child.node_id);
                walk(child, ids);
            }
        }

        // Collect all nodes to export, stable-sorted by tar path.
        let mut ids: Vec<u64> = Vec::new();
        walk(session.catalog().root(), &mut ids);

        let mut entries: Vec<(String, u64)> = ids
            .into_iter()
            .filter_map(|id| session.catalog().get_path(id).map(|p| (p, id)))
            .filter(|(p, _)| !p.is_empty())
            .collect();
        entries.sort_by(|a, b| a.0.cmp(&b.0));

        let mut temp_file = match TempfileBuilder::new()
            .prefix("chromvoid-export-")
            .suffix(".tar")
            .tempfile()
        {
            Ok(f) => f,
            Err(e) => {
                return RpcResponse::error(
                    format!("Failed to create export temp file: {}", e),
                    Some(ErrorCode::InternalError),
                )
            }
        };

        #[cfg(unix)]
        if let Err(e) = fs::set_permissions(temp_file.path(), fs::Permissions::from_mode(0o600)) {
            return RpcResponse::error(
                format!("Failed to set export temp file permissions: {}", e),
                Some(ErrorCode::InternalError),
            );
        }

        let mut file_count: u64 = 0;

        {
            let mut tar = TarBuilder::new(temp_file.as_file_mut());
            tar.mode(HeaderMode::Deterministic);

            // Ensure directory entries exist first (helps some tar extractors).
            for (path, id) in &entries {
                let node = match session.catalog().find_by_id(*id) {
                    Some(n) => n,
                    None => continue,
                };
                if !node.is_dir() {
                    continue;
                }
                let tar_path = format!("{}/", path);

                let mut header = TarHeader::new_gnu();
                if let Err(e) = header.set_path(&tar_path) {
                    return RpcResponse::error(
                        format!("Invalid export path {}: {}", tar_path, e),
                        Some(ErrorCode::InternalError),
                    );
                }
                header.set_entry_type(EntryType::Directory);
                header.set_mode(0o755);
                header.set_uid(0);
                header.set_gid(0);
                header.set_mtime(0);
                header.set_size(0);
                header.set_cksum();

                if let Err(e) = tar.append(&header, std::io::empty()) {
                    return RpcResponse::error(
                        format!("Failed to append dir {}: {}", tar_path, e),
                        Some(ErrorCode::InternalError),
                    );
                }
            }

            for (path, id) in &entries {
                let node = match session.catalog().find_by_id(*id) {
                    Some(n) => n,
                    None => continue,
                };
                if node.is_dir() {
                    continue;
                }

                let bytes: Vec<u8> = if node.is_file() {
                    match self.read_file_plain(vault_key, *id) {
                        Ok(b) => b,
                        Err(r) => return r,
                    }
                } else if node.is_symlink() {
                    node.link_to.as_deref().unwrap_or("").as_bytes().to_vec()
                } else {
                    Vec::new()
                };

                let mut header = TarHeader::new_gnu();
                if let Err(e) = header.set_path(path) {
                    return RpcResponse::error(
                        format!("Invalid export path {}: {}", path, e),
                        Some(ErrorCode::InternalError),
                    );
                }
                header.set_entry_type(EntryType::Regular);
                header.set_mode(0o644);
                header.set_uid(0);
                header.set_gid(0);
                header.set_mtime(0);
                header.set_size(bytes.len() as u64);
                header.set_cksum();

                if let Err(e) = tar.append(&header, bytes.as_slice()) {
                    return RpcResponse::error(
                        format!("Failed to append file {}: {}", path, e),
                        Some(ErrorCode::InternalError),
                    );
                }

                file_count = file_count.saturating_add(1);
            }

            // Optional: include OTP secrets in a dedicated JSON file.
            if include_otp_secrets {
                let mut items: Vec<serde_json::Value> = Vec::new();
                for (path, id) in &entries {
                    let chunk_name = crate::crypto::otp_chunk_name(vault_key, *id);
                    if !self.storage.chunk_exists(&chunk_name).ok().unwrap_or(false) {
                        continue;
                    }
                    let encrypted = match self.storage.read_chunk(&chunk_name) {
                        Ok(b) => b,
                        Err(_) => continue,
                    };
                    let plain = match crate::crypto::decrypt(
                        &encrypted,
                        vault_key,
                        chunk_name.as_bytes(),
                    ) {
                        Ok(p) => p,
                        Err(_) => continue,
                    };
                    let secrets: crate::rpc::types::OtpSecrets =
                        match serde_json::from_slice(&plain) {
                            Ok(s) => s,
                            Err(_) => continue,
                        };
                    if secrets.secrets.is_empty() {
                        continue;
                    }
                    items.push(serde_json::json!({
                        "node_id": id,
                        "path": path,
                        "secrets": secrets.secrets,
                    }));
                }

                let otp_plain = match serde_json::to_vec(&items) {
                    Ok(b) => b,
                    Err(e) => {
                        return RpcResponse::error(
                            format!("Failed to serialize OTP secrets: {}", e),
                            Some(ErrorCode::InternalError),
                        )
                    }
                };
                let otp_path = "otp/secrets.json";
                let mut header = TarHeader::new_gnu();
                if let Err(e) = header.set_path(otp_path) {
                    return RpcResponse::error(
                        format!("Invalid export path {}: {}", otp_path, e),
                        Some(ErrorCode::InternalError),
                    );
                }
                header.set_entry_type(EntryType::Regular);
                header.set_mode(0o600);
                header.set_uid(0);
                header.set_gid(0);
                header.set_mtime(0);
                header.set_size(otp_plain.len() as u64);
                header.set_cksum();
                if let Err(e) = tar.append(&header, otp_plain.as_slice()) {
                    return RpcResponse::error(
                        format!("Failed to append OTP secrets: {}", e),
                        Some(ErrorCode::InternalError),
                    );
                }
                file_count = file_count.saturating_add(1);
            }

            if let Err(e) = tar.finish() {
                return RpcResponse::error(
                    format!("Failed to finish tar: {}", e),
                    Some(ErrorCode::InternalError),
                );
            }
        }
        if let Err(e) = temp_file.as_file_mut().flush() {
            return RpcResponse::error(
                format!("Failed to flush export file: {}", e),
                Some(ErrorCode::InternalError),
            );
        }

        let file_size = match temp_file.as_file().metadata() {
            Ok(meta) => meta.len(),
            Err(e) => {
                return RpcResponse::error(
                    format!("Failed to read export file metadata: {}", e),
                    Some(ErrorCode::InternalError),
                )
            }
        };

        let file_hash = match temp_file.reopen() {
            Ok(file) => match crate::crypto::sha256_hex_reader(file) {
                Ok(hash) => hash,
                Err(e) => {
                    return RpcResponse::error(
                        format!("Failed to hash export file: {}", e),
                        Some(ErrorCode::InternalError),
                    )
                }
            },
            Err(e) => {
                return RpcResponse::error(
                    format!("Failed to reopen export file: {}", e),
                    Some(ErrorCode::InternalError),
                )
            }
        };

        let temp_path = temp_file.into_temp_path();

        self.vault_export = Some(VaultExportSession {
            id: export_id.clone(),
            temp_path,
            file_size,
            file_hash: file_hash.clone(),
            file_count,
            included_otp_secrets: include_otp_secrets,
            chunk_size: EXPORT_CHUNK_SIZE,
        });

        RpcResponse::success(serde_json::json!({
            "export_id": export_id,
            "estimated_size": file_size,
            "file_count": file_count,
        }))
    }

    pub(super) fn handle_vault_export_download_chunk(
        &mut self,
        data: &serde_json::Value,
    ) -> RpcResponse {
        if self.session.is_none() {
            return RpcResponse::error("Vault not unlocked", Some(ErrorCode::VaultNotUnlocked));
        }

        let export_id = match data.get("export_id").and_then(|v| v.as_str()) {
            Some(v) => v,
            None => {
                return RpcResponse::error("export_id is required", Some(ErrorCode::EmptyPayload))
            }
        };
        let chunk_index = match data.get("chunk_index").and_then(|v| v.as_u64()) {
            Some(i) => i,
            None => {
                return RpcResponse::error("chunk_index is required", Some(ErrorCode::EmptyPayload))
            }
        };

        let session = match &self.vault_export {
            Some(s) if s.id == export_id => s,
            _ => return RpcResponse::error("export_id not found", Some(ErrorCode::NodeNotFound)),
        };

        let chunk_size = session.chunk_size;
        let total = session.file_size as usize;
        let chunk_count = if total == 0 {
            0
        } else {
            (total + chunk_size - 1) / chunk_size
        };
        if chunk_index as usize >= chunk_count {
            return RpcResponse::error("chunk_index out of range", Some(ErrorCode::NodeNotFound));
        }

        let start = (chunk_index as u64) * (chunk_size as u64);
        let end = std::cmp::min(start + chunk_size as u64, session.file_size);

        let path: &std::path::Path = session.temp_path.as_ref();
        let mut file = match fs::File::open(path) {
            Ok(f) => f,
            Err(e) => {
                self.clear_vault_export();
                return RpcResponse::error(
                    format!("Failed to open export file: {}", e),
                    Some(ErrorCode::InternalError),
                );
            }
        };
        if let Err(e) = file.seek(SeekFrom::Start(start)) {
            self.clear_vault_export();
            return RpcResponse::error(
                format!("Failed to seek export file: {}", e),
                Some(ErrorCode::InternalError),
            );
        }

        let mut slice = vec![0u8; (end - start) as usize];
        if let Err(e) = file.read_exact(&mut slice) {
            self.clear_vault_export();
            return RpcResponse::error(
                format!("Failed to read export file: {}", e),
                Some(ErrorCode::InternalError),
            );
        }

        RpcResponse::success(serde_json::json!({
            "chunk_index": chunk_index,
            "data": general_purpose::STANDARD.encode(&slice),
            "is_last": (chunk_index as usize) + 1 == chunk_count,
        }))
    }

    pub(super) fn handle_vault_export_download_stream(
        &mut self,
        data: &serde_json::Value,
    ) -> RpcReply {
        if self.session.is_none() {
            return RpcReply::Json(RpcResponse::error(
                "Vault not unlocked",
                Some(ErrorCode::VaultNotUnlocked),
            ));
        }

        let export_id = match data.get("export_id").and_then(|v| v.as_str()) {
            Some(v) => v,
            None => {
                return RpcReply::Json(RpcResponse::error(
                    "export_id is required",
                    Some(ErrorCode::EmptyPayload),
                ))
            }
        };

        let session = match &self.vault_export {
            Some(s) if s.id == export_id => s,
            _ => {
                return RpcReply::Json(RpcResponse::error(
                    "export_id not found",
                    Some(ErrorCode::NodeNotFound),
                ))
            }
        };

        let path: &std::path::Path = session.temp_path.as_ref();
        let file = match fs::File::open(path) {
            Ok(f) => f,
            Err(e) => {
                self.clear_vault_export();
                return RpcReply::Json(RpcResponse::error(
                    format!("Failed to open export file: {}", e),
                    Some(ErrorCode::InternalError),
                ));
            }
        };

        let chunk_size = match u32::try_from(session.chunk_size) {
            Ok(v) => v,
            Err(_) => {
                return RpcReply::Json(RpcResponse::error(
                    "Invalid chunk size",
                    Some(ErrorCode::InternalError),
                ))
            }
        };

        let meta = RpcStreamMeta {
            name: format!("{}.tar", export_id),
            mime_type: "application/x-tar".to_string(),
            size: session.file_size,
            chunk_size,
        };

        RpcReply::Stream(RpcOutputStream {
            meta,
            reader: Box::new(file),
        })
    }

    pub(super) fn handle_vault_export_finish(&mut self, data: &serde_json::Value) -> RpcResponse {
        if self.session.is_none() {
            return RpcResponse::error("Vault not unlocked", Some(ErrorCode::VaultNotUnlocked));
        }

        let export_id = match data.get("export_id").and_then(|v| v.as_str()) {
            Some(v) => v,
            None => {
                return RpcResponse::error("export_id is required", Some(ErrorCode::EmptyPayload))
            }
        };

        let session = match self.vault_export.take() {
            Some(s) if s.id == export_id => s,
            Some(s) => {
                self.vault_export = Some(s);
                return RpcResponse::error("export_id not found", Some(ErrorCode::NodeNotFound));
            }
            None => {
                return RpcResponse::error("export_id not found", Some(ErrorCode::NodeNotFound))
            }
        };
        RpcResponse::success(serde_json::json!({
            "export_id": export_id,
            "file_hash": session.file_hash,
            "file_count": session.file_count,
            "included_otp_secrets": session.included_otp_secrets,
        }))
    }
}
