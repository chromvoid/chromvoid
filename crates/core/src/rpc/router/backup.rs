//! Backup RPC handlers — admin:backup and backup:local:* commands

use std::fs;

use base64::{engine::general_purpose, Engine as _};

use crate::error::ErrorCode;
use crate::rpc::stream::{RpcOutputStream, RpcReply, RpcStreamMeta};
use crate::rpc::types::RpcResponse;

use super::state::RpcRouter;

/// Active local-backup session state.
#[derive(Debug, Clone)]
pub(super) struct BackupLocalSession {
    pub(super) id: String,
    pub(super) chunk_names: Vec<String>,
    #[allow(dead_code)]
    pub(super) estimated_size: u64,
    #[allow(dead_code)]
    pub(super) created_at: u64,
}

impl RpcRouter {
    // ------------------------------------------------------------------
    // derive_backup_key_v2
    // ------------------------------------------------------------------

    pub(super) fn derive_backup_key_v2(&self) -> Result<[u8; 32], RpcResponse> {
        use crate::crypto::{derive_vault_key, hash};

        let master_password = match &self.master_key {
            Some(p) => p.as_str(),
            None => {
                return Err(RpcResponse::error(
                    "Master password not loaded",
                    Some(ErrorCode::InternalError),
                ))
            }
        };

        // Ensure the cached master_password matches on-disk verification.
        self.verify_master_password(master_password)?;

        let (salt_path, _verify_path) = self.master_files_paths();
        let salt_bytes = fs::read(&salt_path).map_err(|e| {
            RpcResponse::error(
                format!("Failed to read master.salt: {}", e),
                Some(ErrorCode::InternalError),
            )
        })?;
        let master_salt: [u8; 16] = salt_bytes.as_slice().try_into().map_err(|_| {
            RpcResponse::error("Invalid master.salt", Some(ErrorCode::InternalError))
        })?;

        let master_key_derived = derive_vault_key(master_password, &master_salt)
            .map_err(|e| RpcResponse::error(e.to_string(), Some(ErrorCode::InternalError)))?;

        // ADR-012: backup_key = BLAKE3(master_key_derived || "local-backup-v2")[:32]
        let mut buf = Vec::with_capacity(master_key_derived.len() + "local-backup-v2".len());
        buf.extend_from_slice(&*master_key_derived);
        buf.extend_from_slice(b"local-backup-v2");
        Ok(hash(&buf))
    }

    // ------------------------------------------------------------------
    // admin:backup (v2 / stream)
    // ------------------------------------------------------------------

    pub(super) fn handle_admin_backup_v2(&mut self, data: &serde_json::Value) -> RpcResponse {
        let master_password = match data.get("master_password").and_then(|v| v.as_str()) {
            Some(p) => p,
            None => {
                return RpcResponse::error(
                    "master_password is required",
                    Some(ErrorCode::EmptyPayload),
                )
            }
        };

        if let Err(r) = self.verify_master_password(master_password) {
            return r;
        }

        RpcResponse::error("Streaming required", Some(ErrorCode::StreamRequired))
    }

    pub(super) fn handle_admin_backup_stream(&mut self, data: &serde_json::Value) -> RpcReply {
        let master_password = match data.get("master_password").and_then(|v| v.as_str()) {
            Some(p) => p,
            None => {
                return RpcReply::Json(RpcResponse::error(
                    "master_password is required",
                    Some(ErrorCode::EmptyPayload),
                ))
            }
        };

        // ADR-004/ADR-012: admin:backup must verify master_password.
        if let Err(r) = self.verify_master_password(master_password) {
            return RpcReply::Json(r);
        }

        // Derive backup_key for wrapping portable pepper.
        use crate::crypto::{derive_vault_key, hash};
        let (master_salt_path, _master_verify_path) = self.master_files_paths();
        let salt_bytes = match fs::read(&master_salt_path) {
            Ok(b) => b,
            Err(e) => {
                return RpcReply::Json(RpcResponse::error(
                    format!("Failed to read master.salt: {}", e),
                    Some(ErrorCode::InternalError),
                ))
            }
        };
        let master_salt: [u8; 16] = match salt_bytes.as_slice().try_into() {
            Ok(s) => s,
            Err(_) => {
                return RpcReply::Json(RpcResponse::error(
                    "Invalid master.salt",
                    Some(ErrorCode::InternalError),
                ))
            }
        };
        let master_key_derived = match derive_vault_key(master_password, &master_salt) {
            Ok(k) => k,
            Err(e) => {
                return RpcReply::Json(RpcResponse::error(
                    format!("Failed to derive master key: {}", e),
                    Some(ErrorCode::InternalError),
                ))
            }
        };
        let mut buf = Vec::with_capacity(master_key_derived.len() + "local-backup-v2".len());
        buf.extend_from_slice(&*master_key_derived);
        buf.extend_from_slice(b"local-backup-v2");
        let backup_key = hash(&buf);

        let chunks = match self.storage.list_chunks() {
            Ok(c) => c,
            Err(e) => {
                return RpcReply::Json(RpcResponse::error(
                    format!("Failed to list chunks: {}", e),
                    Some(ErrorCode::InternalError),
                ))
            }
        };

        let mut backup_data: Vec<(String, Vec<u8>)> = Vec::new();
        if let Ok(salt) = self.storage.get_or_create_salt() {
            backup_data.push(("__salt__".to_string(), salt.to_vec()));
        }

        // ADR-017/ADR-006: include master artifacts so a restore can validate master_password and
        // keep admin operations functional after restore.
        let (master_salt_path, master_verify_path) = self.master_files_paths();
        let master_salt = match fs::read(&master_salt_path) {
            Ok(b) => b,
            Err(e) => {
                return RpcReply::Json(RpcResponse::error(
                    format!("Failed to read master.salt: {}", e),
                    Some(ErrorCode::InternalError),
                ))
            }
        };
        if master_salt.len() != 16 {
            return RpcReply::Json(RpcResponse::error(
                "Invalid master.salt",
                Some(ErrorCode::InternalError),
            ));
        }

        let master_verify = match fs::read(&master_verify_path) {
            Ok(b) => b,
            Err(e) => {
                return RpcReply::Json(RpcResponse::error(
                    format!("Failed to read master.verify: {}", e),
                    Some(ErrorCode::InternalError),
                ))
            }
        };
        if master_verify.len() != 32 {
            return RpcReply::Json(RpcResponse::error(
                "Invalid master.verify",
                Some(ErrorCode::InternalError),
            ));
        }

        backup_data.push(("__master_salt__".to_string(), master_salt));
        backup_data.push(("__master_verify__".to_string(), master_verify));

        // Include portable pepper (SPEC-100 / ADR-012).
        let keystore = match self.keystore.as_ref() {
            Some(k) => k.as_ref(),
            None => {
                return RpcReply::Json(RpcResponse::error(
                    "Keystore not available",
                    Some(ErrorCode::KeystoreUnavailable),
                ))
            }
        };
        let pepper = match crate::crypto::StoragePepper::get_or_create(keystore) {
            Ok(p) => p,
            Err(e) => {
                return RpcReply::Json(RpcResponse::error(
                    format!("Failed to load storage pepper: {}", e),
                    Some(ErrorCode::KeystoreUnavailable),
                ))
            }
        };
        let pepper_wrapped =
            match crate::crypto::StoragePepper::wrap_for_backup(pepper, &backup_key) {
                Ok(b) => b,
                Err(e) => {
                    return RpcReply::Json(RpcResponse::error(
                        format!("Pepper wrap failed: {}", e),
                        Some(ErrorCode::InternalError),
                    ))
                }
            };
        backup_data.push(("__storage_pepper_wrapped__".to_string(), pepper_wrapped));

        for chunk_name in chunks {
            match self.storage.read_chunk(&chunk_name) {
                Ok(data) => backup_data.push((chunk_name, data)),
                Err(e) => {
                    return RpcReply::Json(RpcResponse::error(
                        format!("Failed to read chunk: {}", e),
                        Some(ErrorCode::InternalError),
                    ))
                }
            }
        }

        // ADR-004: integrity protection for restore.
        // Encode checksum as a special entry to keep the backup JSON-compatible with existing tests.
        let mut checksum_material = Vec::new();
        for (name, bytes) in &backup_data {
            checksum_material.extend_from_slice(name.as_bytes());
            checksum_material.extend_from_slice(&[0u8]);
            checksum_material.extend_from_slice(&(bytes.len() as u64).to_le_bytes());
            checksum_material.extend_from_slice(bytes);
        }
        let checksum = crate::crypto::hash(&checksum_material);
        backup_data.push(("__checksum__".to_string(), checksum.to_vec()));

        let backup_bytes = match serde_json::to_vec(&backup_data) {
            Ok(j) => j,
            Err(e) => {
                return RpcReply::Json(RpcResponse::error(
                    format!("Failed to serialize backup: {}", e),
                    Some(ErrorCode::InternalError),
                ))
            }
        };

        let timestamp = std::time::SystemTime::now()
            .duration_since(std::time::UNIX_EPOCH)
            .map(|d| d.as_secs())
            .unwrap_or(0);
        let name = format!("chromvoid-backup-{}.chromvoid", timestamp);

        let meta = RpcStreamMeta {
            name,
            mime_type: "application/x-chromvoid-backup".to_string(),
            size: backup_bytes.len() as u64,
            chunk_size: crate::types::DEFAULT_CHUNK_SIZE,
        };

        RpcReply::Stream(RpcOutputStream {
            meta,
            reader: Box::new(std::io::Cursor::new(backup_bytes)),
        })
    }

    // ------------------------------------------------------------------
    // backup:local:*
    // ------------------------------------------------------------------

    pub(super) fn handle_backup_local_start(&mut self, _data: &serde_json::Value) -> RpcResponse {
        if self.backup_local.is_some() {
            return RpcResponse::error(
                "Backup already in progress",
                Some(ErrorCode::BackupAlreadyInProgress),
            );
        }

        let chunk_names = match self.storage.list_chunks() {
            Ok(mut c) => {
                c.sort();
                c
            }
            Err(e) => {
                return RpcResponse::error(
                    format!("Failed to list chunks: {}", e),
                    Some(ErrorCode::InternalError),
                )
            }
        };

        let mut total_size: u64 = 0;
        for name in &chunk_names {
            match self.storage.chunk_len(name) {
                Ok(len) => {
                    total_size = total_size.saturating_add(len);
                    if let Some(max) = self.backup_local_max_size {
                        if total_size > max {
                            return RpcResponse::error(
                                "Backup too large",
                                Some(ErrorCode::BackupTooLarge),
                            );
                        }
                    }
                }
                Err(e) => {
                    return RpcResponse::error(
                        format!("Failed to stat chunk {}: {}", name, e),
                        Some(ErrorCode::InternalError),
                    )
                }
            }
        }

        let created_at = std::time::SystemTime::now()
            .duration_since(std::time::UNIX_EPOCH)
            .map(|d| d.as_millis() as u64)
            .unwrap_or(0);
        let backup_id = format!("backup-{}", created_at);

        self.backup_local = Some(BackupLocalSession {
            id: backup_id.clone(),
            chunk_names: chunk_names.clone(),
            estimated_size: total_size,
            created_at,
        });

        RpcResponse::success(serde_json::json!({
            "backup_id": backup_id,
            "estimated_size": total_size,
            "chunk_count": chunk_names.len() as u64,
        }))
    }

    pub(super) fn handle_backup_local_download_chunk(
        &mut self,
        data: &serde_json::Value,
    ) -> RpcResponse {
        let backup_id = match data.get("backup_id").and_then(|v| v.as_str()) {
            Some(id) => id,
            None => {
                return RpcResponse::error("backup_id is required", Some(ErrorCode::EmptyPayload))
            }
        };
        let chunk_index = match data.get("chunk_index").and_then(|v| v.as_u64()) {
            Some(i) => i,
            None => {
                return RpcResponse::error("chunk_index is required", Some(ErrorCode::EmptyPayload))
            }
        };

        let session = match &self.backup_local {
            Some(s) if s.id == backup_id => s,
            _ => return RpcResponse::error("backup_id not found", Some(ErrorCode::NodeNotFound)),
        };

        let chunk_names = &session.chunk_names;

        let chunk_count = chunk_names.len() as u64;
        if chunk_index >= chunk_count {
            return RpcResponse::error("chunk_index out of range", Some(ErrorCode::NodeNotFound));
        }

        let name = &chunk_names[chunk_index as usize];
        let bytes = match self.storage.read_chunk(name) {
            Ok(b) => b,
            Err(e) => {
                return RpcResponse::error(
                    format!("Failed to read chunk {}: {}", name, e),
                    Some(ErrorCode::InternalError),
                )
            }
        };
        let data_b64 = general_purpose::STANDARD.encode(&bytes);

        RpcResponse::success(serde_json::json!({
            "chunk_index": chunk_index,
            "chunk_name": name,
            "data": data_b64,
            "is_last": chunk_index + 1 == chunk_count,
        }))
    }

    pub(super) fn handle_backup_local_get_metadata(
        &mut self,
        data: &serde_json::Value,
    ) -> RpcResponse {
        let backup_id = match data.get("backup_id").and_then(|v| v.as_str()) {
            Some(id) => id,
            None => {
                return RpcResponse::error("backup_id is required", Some(ErrorCode::EmptyPayload))
            }
        };

        match &self.backup_local {
            Some(s) if s.id == backup_id => {}
            _ => return RpcResponse::error("backup_id not found", Some(ErrorCode::NodeNotFound)),
        }

        let backup_key = match self.derive_backup_key_v2() {
            Ok(k) => k,
            Err(r) => return r,
        };

        let vault_salt = match self.storage.get_or_create_salt() {
            Ok(s) => s,
            Err(e) => {
                return RpcResponse::error(
                    format!("Failed to read vault salt: {}", e),
                    Some(ErrorCode::InternalError),
                )
            }
        };

        let storage_format_v = match self.storage.format_version() {
            Ok(v) => v,
            Err(e) => {
                return RpcResponse::error(
                    format!("Failed to read storage format version: {}", e),
                    Some(ErrorCode::InternalError),
                )
            }
        };
        if storage_format_v < 2 {
            return RpcResponse::error(
                "Storage format v1 is not supported",
                Some(ErrorCode::StorageVersionNotSupported),
            );
        }

        let chunk_names = match self.storage.list_chunks() {
            Ok(mut c) => {
                c.sort();
                c
            }
            Err(e) => {
                return RpcResponse::error(
                    format!("Failed to list chunks: {}", e),
                    Some(ErrorCode::InternalError),
                )
            }
        };

        let mut total_size: u64 = 0;
        for name in &chunk_names {
            if let Ok(bytes) = self.storage.read_chunk(name) {
                total_size = total_size.saturating_add(bytes.len() as u64);
            }
        }

        let created_at = std::time::SystemTime::now()
            .duration_since(std::time::UNIX_EPOCH)
            .map(|d| d.as_millis() as u64)
            .unwrap_or(0);

        let keystore = match self.keystore.as_ref() {
            Some(k) => k.as_ref(),
            None => {
                return RpcResponse::error(
                    "Keystore not available",
                    Some(ErrorCode::KeystoreUnavailable),
                )
            }
        };

        let storage_pepper = match crate::crypto::StoragePepper::get_or_create(keystore) {
            Ok(p) => p,
            Err(e) => {
                return RpcResponse::error(
                    format!("Failed to load storage pepper: {}", e),
                    Some(ErrorCode::KeystoreUnavailable),
                )
            }
        };

        let pepper_wrapped =
            match crate::crypto::StoragePepper::wrap_for_backup(storage_pepper, &backup_key) {
                Ok(b) => b,
                Err(e) => {
                    return RpcResponse::error(
                        format!("Pepper wrap failed: {}", e),
                        Some(ErrorCode::InternalError),
                    )
                }
            };

        let meta_plain = serde_json::json!({
            "v": 2,
            "storage_format_v": storage_format_v,
            "vault_salt": general_purpose::STANDARD.encode(vault_salt),
            "backup_type": "local",
            "created_at": created_at,
            "chunk_count": chunk_names.len() as u64,
            "total_size": total_size,
            "storage_pepper_wrapped": general_purpose::STANDARD.encode(pepper_wrapped),
        });
        let meta_plain_bytes = match serde_json::to_vec(&meta_plain) {
            Ok(b) => b,
            Err(e) => {
                return RpcResponse::error(
                    format!("Failed to serialize metadata: {}", e),
                    Some(ErrorCode::InternalError),
                )
            }
        };

        let meta_enc =
            match crate::crypto::encrypt(&meta_plain_bytes, &backup_key, b"metadata.enc:v2") {
                Ok(b) => b,
                Err(e) => {
                    return RpcResponse::error(
                        format!("Failed to encrypt metadata: {}", e),
                        Some(ErrorCode::InternalError),
                    )
                }
            };

        // Include master artifacts for portability (ADR-017 / ADR-006).
        let (master_salt_path, master_verify_path) = self.master_files_paths();
        let master_salt = match fs::read(&master_salt_path) {
            Ok(b) => b,
            Err(e) => {
                return RpcResponse::error(
                    format!("Failed to read master.salt: {}", e),
                    Some(ErrorCode::InternalError),
                )
            }
        };
        if master_salt.len() != 16 {
            return RpcResponse::error("Invalid master.salt", Some(ErrorCode::InternalError));
        }
        let master_verify = match fs::read(&master_verify_path) {
            Ok(b) => b,
            Err(e) => {
                return RpcResponse::error(
                    format!("Failed to read master.verify: {}", e),
                    Some(ErrorCode::InternalError),
                )
            }
        };
        if master_verify.len() != 32 {
            return RpcResponse::error("Invalid master.verify", Some(ErrorCode::InternalError));
        }

        RpcResponse::success(serde_json::json!({
            "metadata": general_purpose::STANDARD.encode(meta_enc),
            "master_salt": general_purpose::STANDARD.encode(master_salt),
            "master_verify": general_purpose::STANDARD.encode(master_verify),
        }))
    }

    pub(super) fn handle_backup_local_finish(&mut self, data: &serde_json::Value) -> RpcResponse {
        let backup_id = match data.get("backup_id").and_then(|v| v.as_str()) {
            Some(id) => id,
            None => {
                return RpcResponse::error("backup_id is required", Some(ErrorCode::EmptyPayload))
            }
        };

        match &self.backup_local {
            Some(s) if s.id == backup_id => {}
            _ => return RpcResponse::error("backup_id not found", Some(ErrorCode::NodeNotFound)),
        }

        let created_at = std::time::SystemTime::now()
            .duration_since(std::time::UNIX_EPOCH)
            .map(|d| d.as_millis() as u64)
            .unwrap_or(0);

        self.backup_local = None;
        RpcResponse::success(serde_json::json!({
            "backup_id": backup_id,
            "created_at": created_at,
        }))
    }

    pub(super) fn handle_backup_local_cancel(&mut self, data: &serde_json::Value) -> RpcResponse {
        let requested = data.get("backup_id").and_then(|v| v.as_str());

        let active_id = match &self.backup_local {
            Some(s) => s.id.clone(),
            None => {
                return RpcResponse::error("backup_id not found", Some(ErrorCode::NodeNotFound))
            }
        };

        if let Some(id) = requested {
            if id != active_id {
                return RpcResponse::error("backup_id not found", Some(ErrorCode::NodeNotFound));
            }
        }

        self.backup_local = None;
        RpcResponse::success(serde_json::json!({
            "backup_id": active_id,
            "cancelled": true,
        }))
    }
}
