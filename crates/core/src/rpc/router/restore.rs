//! Restore RPC handlers — admin:restore and restore:local:* commands

use std::collections::HashSet;
use std::fs;
use std::io::Read;

use base64::{engine::general_purpose, Engine as _};

use crate::error::ErrorCode;
use crate::rpc::stream::{RpcInputStream, RpcReply};
use crate::rpc::types::RpcResponse;

use super::state::RpcRouter;

/// Active local-restore session state.
#[derive(Debug, Clone)]
pub(super) struct RestoreLocalSession {
    pub(super) id: String,
    pub(super) received: HashSet<u64>,
    pub(super) chunk_names: HashSet<String>,
    pub(super) total_chunks: Option<u64>,
}

impl RpcRouter {
    // ------------------------------------------------------------------
    // admin:restore (v2 / stream)
    // ------------------------------------------------------------------

    pub(super) fn handle_admin_restore_v2(&mut self, data: &serde_json::Value) -> RpcResponse {
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

        self.session = None;

        RpcResponse::error("No incoming stream", Some(ErrorCode::NoStream))
    }

    pub(super) fn handle_admin_restore_stream(
        &mut self,
        data: &serde_json::Value,
        stream: Option<RpcInputStream>,
    ) -> RpcReply {
        let master_password = match data.get("master_password").and_then(|v| v.as_str()) {
            Some(p) => p,
            None => {
                return RpcReply::Json(RpcResponse::error(
                    "master_password is required",
                    Some(ErrorCode::EmptyPayload),
                ))
            }
        };

        let stream = match stream {
            Some(s) => s,
            None => {
                return RpcReply::Json(RpcResponse::error(
                    "No incoming stream",
                    Some(ErrorCode::NoStream),
                ))
            }
        };

        self.session = None;

        // ADR-004: restore requires blank storage.
        let existing_chunks = match self.storage.list_chunks() {
            Ok(c) => c,
            Err(e) => {
                return RpcReply::Json(RpcResponse::error(
                    format!("Failed to check storage state: {}", e),
                    Some(ErrorCode::InternalError),
                ))
            }
        };
        if !existing_chunks.is_empty() || self.storage.salt_exists() {
            return RpcReply::Json(RpcResponse::error(
                "Storage must be blank for restore. Use admin:erase first.",
                Some(ErrorCode::StorageNotBlank),
            ));
        }

        let mut reader = stream.into_reader();
        let mut backup_bytes = Vec::new();
        if let Err(e) = reader.read_to_end(&mut backup_bytes) {
            return RpcReply::Json(RpcResponse::error(
                format!("Failed to read backup stream: {}", e),
                Some(ErrorCode::InternalError),
            ));
        }

        let backup_data: Vec<(String, Vec<u8>)> = match serde_json::from_slice(&backup_bytes) {
            Ok(d) => d,
            Err(e) => {
                return RpcReply::Json(RpcResponse::error(
                    format!("Invalid backup format: {}", e),
                    Some(ErrorCode::InvalidBackup),
                ))
            }
        };

        // Validate checksum (if present).
        let mut expected_checksum: Option<Vec<u8>> = None;
        let mut backup_master_salt: Option<[u8; 16]> = None;
        let mut backup_master_verify: Option<[u8; 32]> = None;
        let mut backup_pepper_wrapped: Option<Vec<u8>> = None;
        let mut checksum_material = Vec::new();
        for (name, bytes) in &backup_data {
            if name == "__checksum__" {
                expected_checksum = Some(bytes.clone());
                continue;
            }

            if name == "__master_salt__" {
                if let Ok(salt) = bytes.as_slice().try_into() {
                    backup_master_salt = Some(salt);
                }
            }
            if name == "__master_verify__" {
                if let Ok(v) = bytes.as_slice().try_into() {
                    backup_master_verify = Some(v);
                }
            }
            if name == "__storage_pepper_wrapped__" {
                backup_pepper_wrapped = Some(bytes.clone());
            }
            checksum_material.extend_from_slice(name.as_bytes());
            checksum_material.extend_from_slice(&[0u8]);
            checksum_material.extend_from_slice(&(bytes.len() as u64).to_le_bytes());
            checksum_material.extend_from_slice(bytes);
        }
        if let Some(expected) = expected_checksum {
            let actual = crate::crypto::hash(&checksum_material);
            if expected != actual.to_vec() {
                return RpcReply::Json(RpcResponse::error(
                    "Checksum mismatch",
                    Some(ErrorCode::ChecksumMismatch),
                ));
            }
        }

        // ADR-017/ADR-006: validate master_password against the backup's master artifacts.
        let backup_master_salt = match backup_master_salt {
            Some(s) => s,
            None => {
                return RpcReply::Json(RpcResponse::error(
                    "Invalid backup format: missing master.salt",
                    Some(ErrorCode::InvalidBackup),
                ))
            }
        };
        let backup_master_verify = match backup_master_verify {
            Some(v) => v,
            None => {
                return RpcReply::Json(RpcResponse::error(
                    "Invalid backup format: missing master.verify",
                    Some(ErrorCode::InvalidBackup),
                ))
            }
        };

        if let Err(r) = self.verify_master_password_with_material(
            master_password,
            &backup_master_salt,
            &backup_master_verify,
        ) {
            return RpcReply::Json(r);
        }

        // Restore portable pepper into keystore so the vault can be unlocked after restore.
        let pepper_wrapped = match backup_pepper_wrapped {
            Some(b) => b,
            None => {
                return RpcReply::Json(RpcResponse::error(
                    "Invalid backup format: missing storage_pepper_wrapped",
                    Some(ErrorCode::InvalidBackup),
                ))
            }
        };
        let keystore = match self.keystore.as_ref() {
            Some(k) => k.as_ref(),
            None => {
                return RpcReply::Json(RpcResponse::error(
                    "Keystore not available",
                    Some(ErrorCode::KeystoreUnavailable),
                ))
            }
        };
        use crate::crypto::{derive_vault_key, hash};
        let master_key_derived = match derive_vault_key(master_password, &backup_master_salt) {
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
        let storage_pepper =
            match crate::crypto::StoragePepper::unwrap_from_backup(&pepper_wrapped, &backup_key) {
                Ok(p) => p,
                Err(_) => {
                    return RpcReply::Json(RpcResponse::error(
                        "Invalid backup format: storage_pepper_wrapped",
                        Some(ErrorCode::StoragePepperInvalid),
                    ))
                }
            };
        if let Err(e) = crate::crypto::StoragePepper::store(keystore, storage_pepper) {
            return RpcReply::Json(RpcResponse::error(
                format!("Failed to store pepper: {}", e),
                Some(ErrorCode::KeystoreUnavailable),
            ));
        }

        let mut nodes_restored: u64 = 0;
        for (name, data) in backup_data {
            if name == "__salt__" {
                let salt_path = self.storage.base_path().join("salt");
                if let Err(e) = fs::write(&salt_path, &data) {
                    return RpcReply::Json(RpcResponse::error(
                        format!("Failed to restore salt: {}", e),
                        Some(ErrorCode::InternalError),
                    ));
                }
            } else if name == "__master_salt__" {
                let salt_path = self.storage.base_path().join("master.salt");
                if let Err(e) = fs::write(&salt_path, &data) {
                    return RpcReply::Json(RpcResponse::error(
                        format!("Failed to restore master.salt: {}", e),
                        Some(ErrorCode::InternalError),
                    ));
                }
            } else if name == "__master_verify__" {
                let verify_path = self.storage.base_path().join("master.verify");
                if let Err(e) = fs::write(&verify_path, &data) {
                    return RpcReply::Json(RpcResponse::error(
                        format!("Failed to restore master.verify: {}", e),
                        Some(ErrorCode::InternalError),
                    ));
                }
            } else if name == "__checksum__" {
                // Not stored.
            } else if name == "__storage_pepper_wrapped__" {
                // Stored in keystore.
            } else if let Err(e) = self.storage.write_chunk(&name, &data) {
                return RpcReply::Json(RpcResponse::error(
                    format!("Failed to restore chunk {}: {}", name, e),
                    Some(ErrorCode::InternalError),
                ));
            } else {
                nodes_restored = nodes_restored.saturating_add(1);
            }
        }

        RpcReply::Json(RpcResponse::success(serde_json::json!({
            "nodes_restored": nodes_restored,
        })))
    }

    // ------------------------------------------------------------------
    // restore:local:*
    // ------------------------------------------------------------------

    pub(super) fn handle_restore_local_validate(
        &mut self,
        data: &serde_json::Value,
    ) -> RpcResponse {
        fn is_hex(s: &str) -> bool {
            s.chars().all(|c| c.is_ascii_hexdigit())
        }

        fn is_chunk_name(s: &str) -> bool {
            s.len() == 64 && is_hex(s)
        }

        let backup_path = match data.get("backup_path").and_then(|v| v.as_str()) {
            Some(p) => p,
            None => {
                return RpcResponse::error("backup_path is required", Some(ErrorCode::EmptyPayload))
            }
        };

        let mut warnings: Vec<String> = Vec::new();
        let mut valid = true;

        let backup_dir = std::path::PathBuf::from(backup_path);
        if !backup_dir.is_dir() {
            warnings.push("backup_path is not a directory".to_string());
            return RpcResponse::success(serde_json::json!({
                "valid": false,
                "version": 2,
                "chunk_count": 0,
                "warnings": warnings,
            }));
        }

        let meta_path = backup_dir.join("metadata.enc");
        if !meta_path.is_file() {
            valid = false;
            warnings.push("metadata.enc not found".to_string());
        }

        let chunks_path = backup_dir.join("chunks");
        if !chunks_path.is_dir() {
            valid = false;
            warnings.push("chunks/ directory not found".to_string());
        }

        let mut found_chunks: u64 = 0;
        if chunks_path.is_dir() {
            let mut seen: HashSet<String> = HashSet::new();
            let first_level = match fs::read_dir(&chunks_path) {
                Ok(r) => r,
                Err(e) => {
                    valid = false;
                    warnings.push(format!("failed to read chunks/: {}", e));
                    return RpcResponse::success(serde_json::json!({
                        "valid": valid,
                        "version": 2,
                        "chunk_count": 0,
                        "warnings": warnings,
                    }));
                }
            };

            for a in first_level.flatten() {
                let name_a = a.file_name();
                let name_a = name_a.to_string_lossy();
                let ft_a = match a.file_type() {
                    Ok(t) => t,
                    Err(_) => continue,
                };
                if !ft_a.is_dir() {
                    continue;
                }
                if name_a.len() != 1 || !is_hex(&name_a) {
                    continue;
                }

                let second_level = match fs::read_dir(a.path()) {
                    Ok(r) => r,
                    Err(_) => {
                        valid = false;
                        warnings.push(format!(
                            "failed to read chunks subdir: {}",
                            a.path().display()
                        ));
                        continue;
                    }
                };

                for b in second_level.flatten() {
                    let name_b = b.file_name();
                    let name_b = name_b.to_string_lossy();
                    let ft_b = match b.file_type() {
                        Ok(t) => t,
                        Err(_) => continue,
                    };
                    if !ft_b.is_dir() {
                        continue;
                    }
                    if name_b.len() != 2 || !is_hex(&name_b) {
                        continue;
                    }

                    let files = match fs::read_dir(b.path()) {
                        Ok(r) => r,
                        Err(_) => {
                            valid = false;
                            warnings.push(format!(
                                "failed to read chunks subdir: {}",
                                b.path().display()
                            ));
                            continue;
                        }
                    };

                    for f in files.flatten() {
                        let ft_f = match f.file_type() {
                            Ok(t) => t,
                            Err(_) => continue,
                        };
                        if !ft_f.is_file() {
                            continue;
                        }
                        let file_name = f.file_name();
                        let file_name = file_name.to_string_lossy();
                        if !is_chunk_name(&file_name) {
                            continue;
                        }

                        let expected_a = &file_name[0..1];
                        let expected_b = &file_name[1..3];
                        if expected_a != &*name_a || expected_b != &*name_b {
                            valid = false;
                            warnings.push(format!(
                                "chunk {} is in unexpected path (expected {}/{}/{})",
                                file_name, expected_a, expected_b, file_name
                            ));
                        }

                        if !seen.insert(file_name.to_string()) {
                            valid = false;
                            warnings.push(format!("duplicate chunk name: {}", file_name));
                            continue;
                        }

                        found_chunks = found_chunks.saturating_add(1);
                    }
                }
            }
        }

        let mut meta_version = None;
        let mut meta_chunk_count = None;

        if meta_path.is_file() {
            let meta_bytes = match fs::read(&meta_path) {
                Ok(b) => b,
                Err(e) => {
                    valid = false;
                    warnings.push(format!("failed to read metadata.enc: {}", e));
                    Vec::new()
                }
            };

            if meta_bytes.len() < 28 {
                valid = false;
                warnings.push("metadata.enc is too short".to_string());
            } else if self.master_key.is_none() {
                valid = false;
                warnings
                    .push("master_password not loaded; cannot decrypt metadata.enc".to_string());
            } else {
                let backup_key = match self.derive_backup_key_v2() {
                    Ok(k) => k,
                    Err(_) => {
                        valid = false;
                        warnings.push("failed to derive backup_key".to_string());
                        return RpcResponse::success(serde_json::json!({
                            "valid": valid,
                            "version": 2,
                            "chunk_count": found_chunks,
                            "warnings": warnings,
                        }));
                    }
                };

                match crate::crypto::decrypt(&meta_bytes, &backup_key, b"metadata.enc:v2") {
                    Ok(plain) => match serde_json::from_slice::<serde_json::Value>(&plain) {
                        Ok(meta) => {
                            meta_version = meta.get("v").and_then(|v| v.as_u64());
                            meta_chunk_count = meta.get("chunk_count").and_then(|v| v.as_u64());

                            if meta.get("backup_type").and_then(|v| v.as_str()) != Some("local") {
                                valid = false;
                                warnings.push("metadata backup_type is not 'local'".to_string());
                            }

                            if let Some(v) = meta_version {
                                if v != 2 {
                                    valid = false;
                                    warnings.push(format!("unsupported metadata version: {}", v));
                                }
                            } else {
                                valid = false;
                                warnings.push("metadata missing 'v'".to_string());
                            }

                            if let Some(vault_salt_b64) =
                                meta.get("vault_salt").and_then(|v| v.as_str())
                            {
                                match general_purpose::STANDARD.decode(vault_salt_b64) {
                                    Ok(bytes) if bytes.len() == 16 => {}
                                    _ => {
                                        valid = false;
                                        warnings.push("metadata vault_salt is invalid".to_string());
                                    }
                                }
                            } else {
                                valid = false;
                                warnings.push("metadata missing vault_salt".to_string());
                            }

                            if let Some(pepper_b64) =
                                meta.get("storage_pepper_wrapped").and_then(|v| v.as_str())
                            {
                                match general_purpose::STANDARD.decode(pepper_b64) {
                                    Ok(bytes) if bytes.len() == 12 + 32 + 16 => {}
                                    _ => {
                                        valid = false;
                                        warnings.push(
                                            "metadata storage_pepper_wrapped is invalid"
                                                .to_string(),
                                        );
                                    }
                                }
                            } else {
                                valid = false;
                                warnings
                                    .push("metadata missing storage_pepper_wrapped".to_string());
                            }
                        }
                        Err(_) => {
                            valid = false;
                            warnings.push("metadata.enc plaintext is not valid JSON".to_string());
                        }
                    },
                    Err(_) => {
                        valid = false;
                        warnings.push("failed to decrypt metadata.enc".to_string());
                    }
                }
            }
        }

        if let Some(expected) = meta_chunk_count {
            if expected != found_chunks {
                valid = false;
                warnings.push(format!(
                    "chunk_count mismatch: metadata={}, found={}",
                    expected, found_chunks
                ));
            }
        }

        RpcResponse::success(serde_json::json!({
            "valid": valid,
            "version": meta_version.unwrap_or(2),
            "chunk_count": found_chunks,
            "warnings": warnings,
        }))
    }

    pub(super) fn handle_restore_local_start(&mut self, data: &serde_json::Value) -> RpcResponse {
        let _backup_path = match data.get("backup_path").and_then(|v| v.as_str()) {
            Some(p) => p,
            None => {
                return RpcResponse::error("backup_path is required", Some(ErrorCode::EmptyPayload))
            }
        };

        let ts = std::time::SystemTime::now()
            .duration_since(std::time::UNIX_EPOCH)
            .map(|d| d.as_millis() as u64)
            .unwrap_or(0);

        let restore_id = format!("restore-{}", ts);
        self.restore_local = Some(RestoreLocalSession {
            id: restore_id.clone(),
            received: HashSet::new(),
            chunk_names: HashSet::new(),
            total_chunks: None,
        });

        RpcResponse::success(serde_json::json!({
            "restore_id": restore_id,
            "expected_chunks": 0,
        }))
    }

    pub(super) fn handle_restore_local_upload_chunk(
        &mut self,
        data: &serde_json::Value,
    ) -> RpcResponse {
        let restore_id = match data.get("restore_id").and_then(|v| v.as_str()) {
            Some(id) => id,
            None => {
                return RpcResponse::error("restore_id is required", Some(ErrorCode::EmptyPayload))
            }
        };
        let _chunk_index = match data.get("chunk_index").and_then(|v| v.as_u64()) {
            Some(i) => i,
            None => {
                return RpcResponse::error("chunk_index is required", Some(ErrorCode::EmptyPayload))
            }
        };
        let _chunk_name = match data.get("chunk_name").and_then(|v| v.as_str()) {
            Some(n) => n,
            None => {
                return RpcResponse::error("chunk_name is required", Some(ErrorCode::EmptyPayload))
            }
        };
        let chunk_index = data
            .get("chunk_index")
            .and_then(|v| v.as_u64())
            .unwrap_or(0);
        let chunk_name = data
            .get("chunk_name")
            .and_then(|v| v.as_str())
            .unwrap_or("");
        let is_last = data
            .get("is_last")
            .and_then(|v| v.as_bool())
            .unwrap_or(false);

        let session = match &mut self.restore_local {
            Some(s) if s.id == restore_id => s,
            _ => return RpcResponse::error("restore_id not found", Some(ErrorCode::NodeNotFound)),
        };

        let data_b64 = match data.get("data").and_then(|v| v.as_str()) {
            Some(d) => d,
            None => return RpcResponse::error("data is required", Some(ErrorCode::EmptyPayload)),
        };
        let decoded = match general_purpose::STANDARD.decode(data_b64) {
            Ok(b) => b,
            Err(_) => {
                return RpcResponse::error("Invalid base64", Some(ErrorCode::RestoreInvalidFormat))
            }
        };

        if let Err(e) = self.storage.write_chunk(chunk_name, &decoded) {
            return RpcResponse::error(
                format!("Failed to write chunk: {}", e),
                Some(ErrorCode::InternalError),
            );
        }

        session.received.insert(chunk_index);
        session.chunk_names.insert(chunk_name.to_string());
        if is_last {
            session.total_chunks = Some(chunk_index + 1);
        }

        let received_chunks = session.received.len() as u64;
        let total_chunks = session.total_chunks.unwrap_or(received_chunks);
        RpcResponse::success(serde_json::json!({
            "received_chunks": received_chunks,
            "total_chunks": total_chunks,
        }))
    }

    pub(super) fn handle_restore_local_cancel(&mut self, data: &serde_json::Value) -> RpcResponse {
        let requested = data.get("restore_id").and_then(|v| v.as_str());

        let (active_id, chunk_names) = match &self.restore_local {
            Some(s) => (s.id.clone(), s.chunk_names.clone()),
            None => {
                return RpcResponse::error("restore_id not found", Some(ErrorCode::NodeNotFound))
            }
        };

        if let Some(id) = requested {
            if id != active_id {
                return RpcResponse::error("restore_id not found", Some(ErrorCode::NodeNotFound));
            }
        }

        let deleted_chunks = chunk_names.len() as u64;
        self.rollback_restore_local(&chunk_names);

        RpcResponse::success(serde_json::json!({
            "restore_id": active_id,
            "cancelled": true,
            "deleted_chunks": deleted_chunks,
        }))
    }

    pub(super) fn rollback_restore_local(&mut self, chunk_names: &HashSet<String>) {
        // Best-effort transactional rollback for local restore.
        // Goal: return storage to a BLANK state if restore:local:commit fails.
        for name in chunk_names {
            let _ = self.storage.delete_chunk(name);
        }

        let base = self.storage.base_path();
        let _ = fs::remove_file(base.join("salt"));
        let _ = fs::remove_file(base.join("format.version"));
        let _ = fs::remove_file(base.join("master.salt"));
        let _ = fs::remove_file(base.join("master.verify"));

        // Best-effort cleanup of portable pepper.
        if let Some(keystore) = self.keystore.as_ref() {
            let _ = crate::crypto::StoragePepper::delete(keystore.as_ref());
        }

        self.restore_local = None;
    }

    pub(super) fn handle_restore_local_commit(&mut self, data: &serde_json::Value) -> RpcResponse {
        let restore_id = match data.get("restore_id").and_then(|v| v.as_str()) {
            Some(id) => id,
            None => {
                return RpcResponse::error("restore_id is required", Some(ErrorCode::EmptyPayload))
            }
        };
        let metadata_b64 = match data.get("metadata").and_then(|v| v.as_str()) {
            Some(m) => m,
            None => {
                return RpcResponse::error("metadata is required", Some(ErrorCode::EmptyPayload))
            }
        };

        let (restored_chunks, total_chunks, chunk_names) = match &self.restore_local {
            Some(s) if s.id == restore_id => (
                s.received.len() as u64,
                s.total_chunks,
                s.chunk_names.clone(),
            ),
            _ => return RpcResponse::error("restore_id not found", Some(ErrorCode::NodeNotFound)),
        };

        let rollback = |router: &mut RpcRouter, resp: RpcResponse| -> RpcResponse {
            router.rollback_restore_local(&chunk_names);
            resp
        };

        let metadata_enc = match general_purpose::STANDARD.decode(metadata_b64) {
            Ok(b) => b,
            Err(_) => {
                return rollback(
                    self,
                    RpcResponse::error("Invalid base64", Some(ErrorCode::RestoreInvalidFormat)),
                )
            }
        };

        let mut portable_master: Option<([u8; 16], [u8; 32])> = None;

        // Prefer master material from the backup payload (portable restore).
        let backup_key = match data.get("master_salt").and_then(|v| v.as_str()) {
            Some(master_salt_b64) => {
                let master_verify_b64 = match data.get("master_verify").and_then(|v| v.as_str()) {
                    Some(v) => v,
                    None => {
                        return rollback(
                            self,
                            RpcResponse::error(
                                "Invalid metadata",
                                Some(ErrorCode::RestoreInvalidFormat),
                            ),
                        )
                    }
                };

                let master_salt_bytes = match general_purpose::STANDARD.decode(master_salt_b64) {
                    Ok(b) => b,
                    Err(_) => {
                        return rollback(
                            self,
                            RpcResponse::error(
                                "Invalid metadata",
                                Some(ErrorCode::RestoreInvalidFormat),
                            ),
                        )
                    }
                };
                let master_salt: [u8; 16] = match master_salt_bytes.as_slice().try_into() {
                    Ok(s) => s,
                    Err(_) => {
                        return rollback(
                            self,
                            RpcResponse::error(
                                "Invalid metadata",
                                Some(ErrorCode::RestoreInvalidFormat),
                            ),
                        )
                    }
                };

                let master_verify_bytes = match general_purpose::STANDARD.decode(master_verify_b64)
                {
                    Ok(b) => b,
                    Err(_) => {
                        return rollback(
                            self,
                            RpcResponse::error(
                                "Invalid metadata",
                                Some(ErrorCode::RestoreInvalidFormat),
                            ),
                        )
                    }
                };
                let master_verify: [u8; 32] = match master_verify_bytes.as_slice().try_into() {
                    Ok(v) => v,
                    Err(_) => {
                        return rollback(
                            self,
                            RpcResponse::error(
                                "Invalid metadata",
                                Some(ErrorCode::RestoreInvalidFormat),
                            ),
                        )
                    }
                };

                let master_password = match &self.master_key {
                    Some(p) => p.as_str(),
                    None => {
                        return rollback(
                            self,
                            RpcResponse::error(
                                "Master password not loaded",
                                Some(ErrorCode::InternalError),
                            ),
                        )
                    }
                };

                if let Err(r) = self.verify_master_password_with_material(
                    master_password,
                    &master_salt,
                    &master_verify,
                ) {
                    return rollback(self, r);
                }

                use crate::crypto::{derive_vault_key, hash};

                let master_key_derived = match derive_vault_key(master_password, &master_salt) {
                    Ok(k) => k,
                    Err(e) => {
                        return rollback(
                            self,
                            RpcResponse::error(
                                format!("Failed to derive master key: {}", e),
                                Some(ErrorCode::InternalError),
                            ),
                        )
                    }
                };

                // ADR-012: backup_key = BLAKE3(master_key_derived || "local-backup-v2")[:32]
                let mut buf =
                    Vec::with_capacity(master_key_derived.len() + "local-backup-v2".len());
                buf.extend_from_slice(&*master_key_derived);
                buf.extend_from_slice(b"local-backup-v2");
                let backup_key = hash(&buf);

                portable_master = Some((master_salt, master_verify));
                backup_key
            }
            None => match self.derive_backup_key_v2() {
                Ok(k) => k,
                Err(r) => return rollback(self, r),
            },
        };

        let metadata_plain =
            match crate::crypto::decrypt(&metadata_enc, &backup_key, b"metadata.enc:v2") {
                Ok(p) => p,
                Err(_) => {
                    return rollback(
                        self,
                        RpcResponse::error(
                            "Invalid metadata",
                            Some(ErrorCode::RestoreInvalidFormat),
                        ),
                    )
                }
            };

        let meta_json: serde_json::Value = match serde_json::from_slice(&metadata_plain) {
            Ok(v) => v,
            Err(_) => {
                return rollback(
                    self,
                    RpcResponse::error("Invalid metadata", Some(ErrorCode::RestoreInvalidFormat)),
                )
            }
        };

        let version = match meta_json.get("v").and_then(|v| v.as_u64()) {
            Some(v) => v,
            None => {
                return rollback(
                    self,
                    RpcResponse::error("Invalid metadata", Some(ErrorCode::RestoreInvalidFormat)),
                )
            }
        };
        if version != 2 {
            return rollback(
                self,
                RpcResponse::error(
                    "Restore version not supported",
                    Some(ErrorCode::RestoreVersionNotSupported),
                ),
            );
        }

        if meta_json.get("backup_type").and_then(|v| v.as_str()) != Some("local") {
            return rollback(
                self,
                RpcResponse::error("Invalid metadata", Some(ErrorCode::RestoreInvalidFormat)),
            );
        }

        let expected_chunks = match meta_json.get("chunk_count").and_then(|v| v.as_u64()) {
            Some(c) => c,
            None => {
                return rollback(
                    self,
                    RpcResponse::error("Invalid metadata", Some(ErrorCode::RestoreInvalidFormat)),
                )
            }
        };

        if let Some(total) = total_chunks {
            if total != expected_chunks {
                return rollback(
                    self,
                    RpcResponse::error("Missing chunks", Some(ErrorCode::RestoreInvalidFormat)),
                );
            }
        }
        if restored_chunks != expected_chunks {
            return rollback(
                self,
                RpcResponse::error("Missing chunks", Some(ErrorCode::RestoreInvalidFormat)),
            );
        }

        let vault_salt_b64 = match meta_json.get("vault_salt").and_then(|v| v.as_str()) {
            Some(s) => s,
            None => {
                return rollback(
                    self,
                    RpcResponse::error("Invalid metadata", Some(ErrorCode::RestoreInvalidFormat)),
                )
            }
        };
        let vault_salt = match general_purpose::STANDARD.decode(vault_salt_b64) {
            Ok(b) => b,
            Err(_) => {
                return rollback(
                    self,
                    RpcResponse::error("Invalid metadata", Some(ErrorCode::RestoreInvalidFormat)),
                )
            }
        };
        if vault_salt.len() != 16 {
            return rollback(
                self,
                RpcResponse::error("Invalid metadata", Some(ErrorCode::RestoreInvalidFormat)),
            );
        }

        let pepper_wrapped_b64 = match meta_json
            .get("storage_pepper_wrapped")
            .and_then(|v| v.as_str())
        {
            Some(s) => s,
            None => {
                return rollback(
                    self,
                    RpcResponse::error(
                        "metadata missing storage_pepper_wrapped",
                        Some(ErrorCode::RestoreInvalidFormat),
                    ),
                )
            }
        };
        let pepper_wrapped = match general_purpose::STANDARD.decode(pepper_wrapped_b64) {
            Ok(b) => b,
            Err(_) => {
                return rollback(
                    self,
                    RpcResponse::error("Invalid metadata", Some(ErrorCode::RestoreInvalidFormat)),
                )
            }
        };

        let storage_format_v = meta_json
            .get("storage_format_v")
            .and_then(|v| v.as_u64())
            .unwrap_or(1);
        if storage_format_v < 2 {
            return rollback(
                self,
                RpcResponse::error(
                    "Backup storage format v1 is not supported",
                    Some(ErrorCode::RestoreVersionNotSupported),
                ),
            );
        }

        let keystore = match self.keystore.as_ref() {
            Some(k) => k.as_ref(),
            None => {
                return rollback(
                    self,
                    RpcResponse::error(
                        "Keystore not available",
                        Some(ErrorCode::KeystoreUnavailable),
                    ),
                )
            }
        };

        let storage_pepper =
            match crate::crypto::StoragePepper::unwrap_from_backup(&pepper_wrapped, &backup_key) {
                Ok(p) => p,
                Err(_) => {
                    return rollback(
                        self,
                        RpcResponse::error(
                            "Invalid metadata",
                            Some(ErrorCode::StoragePepperInvalid),
                        ),
                    )
                }
            };

        // Apply changes (transactional). On any failure, rollback restore staging.
        if let Some((master_salt, master_verify)) = portable_master {
            let base = self.storage.base_path();
            if let Err(e) = fs::write(base.join("master.salt"), &master_salt) {
                return rollback(
                    self,
                    RpcResponse::error(
                        format!("Failed to write master.salt: {}", e),
                        Some(ErrorCode::InternalError),
                    ),
                );
            }
            if let Err(e) = fs::write(base.join("master.verify"), &master_verify) {
                return rollback(
                    self,
                    RpcResponse::error(
                        format!("Failed to write master.verify: {}", e),
                        Some(ErrorCode::InternalError),
                    ),
                );
            }
        }

        if let Err(e) = crate::crypto::StoragePepper::store(keystore, storage_pepper) {
            return rollback(
                self,
                RpcResponse::error(
                    format!("Failed to store pepper: {}", e),
                    Some(ErrorCode::KeystoreUnavailable),
                ),
            );
        }

        // Restore salt so vault password derives the same key.
        let salt_path = self.storage.base_path().join("salt");
        if let Err(e) = fs::write(&salt_path, &vault_salt) {
            return rollback(
                self,
                RpcResponse::error(
                    format!("Failed to restore salt: {}", e),
                    Some(ErrorCode::InternalError),
                ),
            );
        }

        // Restore preserves the original storage format version.
        let format_path = self.storage.base_path().join("format.version");
        let now_ms = std::time::SystemTime::now()
            .duration_since(std::time::UNIX_EPOCH)
            .map(|d| d.as_millis() as u64)
            .unwrap_or(0);
        let mut format_json: serde_json::Value = match fs::read(&format_path)
            .ok()
            .and_then(|b| serde_json::from_slice(&b).ok())
        {
            Some(v) => v,
            None => serde_json::json!({
                "v": storage_format_v,
                "format": "sharded",
                "chunk_size": crate::types::DEFAULT_CHUNK_SIZE,
                "created_at": now_ms,
                "migration_applied": serde_json::Value::Null,
            }),
        };
        if let Some(obj) = format_json.as_object_mut() {
            obj.insert("v".to_string(), serde_json::json!(storage_format_v));
            if storage_format_v >= 2 {
                obj.insert("kdf".to_string(), serde_json::json!(2));
                obj.insert("pepper".to_string(), serde_json::json!(true));
            } else {
                obj.remove("kdf");
                obj.remove("pepper");
            }
            obj.entry("created_at".to_string())
                .or_insert_with(|| serde_json::json!(now_ms));
        }
        let bytes = match serde_json::to_vec(&format_json) {
            Ok(b) => b,
            Err(e) => {
                return rollback(
                    self,
                    RpcResponse::error(
                        format!("Failed to write format.version: {}", e),
                        Some(ErrorCode::InternalError),
                    ),
                )
            }
        };
        if let Err(e) = fs::write(&format_path, &bytes) {
            return rollback(
                self,
                RpcResponse::error(
                    format!("Failed to write format.version: {}", e),
                    Some(ErrorCode::InternalError),
                ),
            );
        }

        self.restore_local = None;
        RpcResponse::success(serde_json::json!({
            "restored_chunks": restored_chunks,
            "warnings": [],
        }))
    }
}
