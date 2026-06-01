//! `admin:backup` v2 + streaming handlers.

use crate::rpc::stream::{RpcOutputStream, RpcReply, RpcStreamMeta};
use crate::rpc::types::RpcResponse;

use super::super::state::RpcRouter;
use super::error::{BackupCommandError, BackupResult};
use super::request::required_str;

struct AdminBackupRequest<'a> {
    master_password: &'a str,
}

fn parse_admin_backup_request(data: &serde_json::Value) -> BackupResult<AdminBackupRequest<'_>> {
    Ok(AdminBackupRequest {
        master_password: required_str(data, "master_password")?,
    })
}

impl RpcRouter {
    pub(in crate::rpc::router) fn handle_admin_backup_v2(
        &mut self,
        data: &serde_json::Value,
    ) -> RpcResponse {
        match self.admin_backup_v2(data) {
            Ok(result) => RpcResponse::success(result),
            Err(error) => error.into_rpc_response(),
        }
    }

    fn admin_backup_v2(&mut self, data: &serde_json::Value) -> BackupResult<serde_json::Value> {
        let request = parse_admin_backup_request(data)?;
        self.verify_master_password(request.master_password)?;

        Err(BackupCommandError::stream_required())
    }

    pub(in crate::rpc::router) fn handle_admin_backup_stream(
        &mut self,
        data: &serde_json::Value,
    ) -> RpcReply {
        match self.admin_backup_stream(data) {
            Ok(stream) => RpcReply::Stream(stream),
            Err(error) => RpcReply::Json(error.into_rpc_response()),
        }
    }

    fn admin_backup_stream(&mut self, data: &serde_json::Value) -> BackupResult<RpcOutputStream> {
        let request = parse_admin_backup_request(data)?;

        // ADR-004/ADR-012: admin:backup must verify master_password.
        self.verify_master_password(request.master_password)?;

        // Derive backup_key for wrapping portable pepper.
        let backup_key = self.derive_backup_key_v2_for_password(request.master_password)?;

        let chunks = self.storage.list_chunks().map_err(|error| {
            BackupCommandError::internal(format!("Failed to list chunks: {}", error))
        })?;

        let mut backup_data: Vec<(String, Vec<u8>)> = Vec::new();
        if let Ok(salt) = self.storage.get_or_create_salt() {
            backup_data.push(("__salt__".to_string(), salt.to_vec()));
        }

        // ADR-017/ADR-006: include master artifacts so a restore can validate master_password and
        // keep admin operations functional after restore.
        let master_salt = self.read_master_salt()?.to_vec();
        let master_verify = self.read_master_verify()?.to_vec();

        backup_data.push(("__master_salt__".to_string(), master_salt));
        backup_data.push(("__master_verify__".to_string(), master_verify));

        // Include portable pepper (SPEC-100 / ADR-012).
        let keystore = match self.keystore.as_ref() {
            Some(k) => k.as_ref(),
            None => {
                return Err(BackupCommandError::keystore_unavailable(
                    "Keystore not available",
                ))
            }
        };
        let pepper = match crate::crypto::StoragePepper::get_or_create(keystore) {
            Ok(p) => p,
            Err(e) => {
                return Err(BackupCommandError::keystore_unavailable(format!(
                    "Failed to load storage pepper: {}",
                    e
                )))
            }
        };
        let pepper_wrapped =
            match crate::crypto::StoragePepper::wrap_for_backup(pepper, &backup_key) {
                Ok(b) => b,
                Err(e) => {
                    return Err(BackupCommandError::internal(format!(
                        "Pepper wrap failed: {}",
                        e
                    )))
                }
            };
        backup_data.push(("__storage_pepper_wrapped__".to_string(), pepper_wrapped));

        for chunk_name in chunks {
            match self.storage.read_chunk(&chunk_name) {
                Ok(data) => backup_data.push((chunk_name, data)),
                Err(e) => {
                    return Err(BackupCommandError::internal(format!(
                        "Failed to read chunk: {}",
                        e
                    )))
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
                return Err(BackupCommandError::internal(format!(
                    "Failed to serialize backup: {}",
                    e
                )))
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

        Ok(RpcOutputStream {
            meta,
            reader: Box::new(std::io::Cursor::new(backup_bytes)),
        })
    }
}
