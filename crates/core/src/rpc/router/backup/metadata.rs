//! Local backup metadata builder.

use base64::{engine::general_purpose, Engine as _};

use crate::crypto::StoragePepper;

use super::super::backup_pack::BackupChunkManifest;
use super::super::state::RpcRouter;
use super::error::{BackupCommandError, BackupResult};
use super::models::BackupLocalMetadata;

impl RpcRouter {
    pub(in crate::rpc::router::backup) fn build_backup_local_metadata(
        &self,
        manifest: &BackupChunkManifest,
        created_at: u64,
    ) -> BackupResult<BackupLocalMetadata> {
        let backup_key = self.derive_backup_key_v2()?;
        let vault_salt = self.storage.get_or_create_salt().map_err(|error| {
            BackupCommandError::internal(format!("Failed to read vault salt: {}", error))
        })?;
        let storage_format_v = self.storage.format_version().map_err(|error| {
            BackupCommandError::internal(format!(
                "Failed to read storage format version: {}",
                error
            ))
        })?;
        if storage_format_v < 2 {
            return Err(BackupCommandError::storage_version_not_supported(
                "Storage format v1 is not supported",
            ));
        }

        let keystore = self
            .keystore
            .as_ref()
            .ok_or_else(|| BackupCommandError::keystore_unavailable("Keystore not available"))?;
        let storage_pepper = StoragePepper::get_or_create(keystore.as_ref()).map_err(|error| {
            BackupCommandError::keystore_unavailable(format!(
                "Failed to load storage pepper: {}",
                error
            ))
        })?;
        let pepper_wrapped =
            StoragePepper::wrap_for_backup(storage_pepper, &backup_key).map_err(|error| {
                BackupCommandError::internal(format!("Pepper wrap failed: {}", error))
            })?;
        let meta_plain = serde_json::json!({
            "v": 2,
            "storage_format_v": storage_format_v,
            "vault_salt": general_purpose::STANDARD.encode(vault_salt),
            "backup_type": "local",
            "created_at": created_at,
            "chunk_count": manifest.chunk_count,
            "total_size": manifest.total_size,
            "storage_pepper_wrapped": general_purpose::STANDARD.encode(pepper_wrapped),
        });
        let meta_plain_bytes = serde_json::to_vec(&meta_plain).map_err(|error| {
            BackupCommandError::internal(format!("Failed to serialize metadata: {}", error))
        })?;
        let meta_enc = crate::crypto::encrypt(&meta_plain_bytes, &backup_key, b"metadata.enc:v2")
            .map_err(|error| {
            BackupCommandError::internal(format!("Failed to encrypt metadata: {}", error))
        })?;
        let master_salt = self.read_master_salt()?.to_vec();
        let master_verify = self.read_master_verify()?.to_vec();

        Ok(BackupLocalMetadata {
            metadata: general_purpose::STANDARD.encode(meta_enc),
            master_salt: general_purpose::STANDARD.encode(master_salt),
            master_verify: general_purpose::STANDARD.encode(master_verify),
        })
    }
}
