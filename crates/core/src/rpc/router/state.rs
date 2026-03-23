//! RpcRouter state — struct definition, constructors, builders, and utility helpers

use crate::crypto::keystore::Keystore;
use crate::error::ErrorCode;
use crate::storage::Storage;
use crate::vault::VaultSession;
use std::collections::HashMap;
use std::sync::Arc;
use std::{fs, path::PathBuf};

use super::backup::BackupLocalSession;
use super::credential_types::CredentialProviderSession;
use super::restore::RestoreLocalSession;
use super::vault_export::VaultExportSession;
use crate::rpc::types::RpcResponse;

#[derive(Debug, Clone)]
pub(super) struct EraseTokenState {
    pub(super) token: String,
    pub(super) expires_at: std::time::SystemTime,
}

/// RPC Router state
pub struct RpcRouter {
    /// Storage backend
    pub(super) storage: Storage,
    /// Active vault session (if unlocked)
    pub(super) session: Option<VaultSession>,
    /// Master key for admin operations
    pub(super) master_key: Option<String>,

    /// Platform keystore for device-local secrets (portable pepper, etc.)
    pub(super) keystore: Option<Arc<dyn Keystore>>,

    pub(super) erase_token: Option<EraseTokenState>,

    pub(super) backup_local: Option<BackupLocalSession>,
    pub(super) backup_local_max_size: Option<u64>,
    pub(super) restore_local: Option<RestoreLocalSession>,

    pub(super) vault_export: Option<VaultExportSession>,

    /// Pending push events for the embedding layer (gateway/client).
    pub(super) events: Vec<serde_json::Value>,

    /// Minimal subscription flag for `catalog:subscribe`/`catalog:unsubscribe`.
    pub(super) catalog_subscribed: bool,

    pub(super) credential_provider_enabled: bool,
    pub(super) credential_provider_sessions: HashMap<String, CredentialProviderSession>,
    pub(super) credential_provider_allowlist: HashMap<String, std::time::SystemTime>,
    pub(super) credential_provider_last_used_at_ms: HashMap<String, u64>,
}

impl RpcRouter {
    /// Create a new router with the given storage
    pub fn new(storage: Storage) -> Self {
        Self {
            storage,
            session: None,
            master_key: None,
            keystore: None,
            erase_token: None,
            backup_local: None,
            backup_local_max_size: None,
            restore_local: None,
            vault_export: None,
            events: Vec::new(),
            catalog_subscribed: false,
            credential_provider_enabled: true,
            credential_provider_sessions: HashMap::new(),
            credential_provider_allowlist: HashMap::new(),
            credential_provider_last_used_at_ms: HashMap::new(),
        }
    }

    pub fn with_backup_local_max_size(mut self, max_size: u64) -> Self {
        self.backup_local_max_size = Some(max_size);
        self
    }

    pub fn take_events(&mut self) -> Vec<serde_json::Value> {
        let events = std::mem::take(&mut self.events);
        // ADR-028: filter out catalog:event for system shards before external delivery.
        events
            .into_iter()
            .filter(|evt| {
                let is_catalog_event =
                    evt.get("command").and_then(|v| v.as_str()) == Some("catalog:event");
                if !is_catalog_event {
                    return true;
                }
                let shard_id = evt
                    .get("data")
                    .and_then(|d| d.get("shard_id"))
                    .and_then(|v| v.as_str())
                    .unwrap_or("");
                !crate::catalog::is_system_shard_id(shard_id)
            })
            .collect()
    }

    pub fn with_keystore(mut self, keystore: Arc<dyn Keystore>) -> Self {
        self.keystore = Some(keystore);
        self
    }

    pub fn with_master_key(mut self, master_key: impl Into<String>) -> Self {
        self.master_key = Some(master_key.into());
        self
    }

    pub fn set_master_key(&mut self, master_key: Option<String>) {
        self.master_key = master_key;
    }

    /// Check if vault is unlocked
    pub fn is_unlocked(&self) -> bool {
        self.session.is_some()
    }

    /// Get the current session (if unlocked)
    pub fn session(&self) -> Option<&VaultSession> {
        self.session.as_ref()
    }

    /// Execute a handler that requires an active session (read-only)
    pub(super) fn with_session<F>(&self, f: F) -> RpcResponse
    where
        F: FnOnce(&VaultSession) -> RpcResponse,
    {
        match &self.session {
            Some(session) => f(session),
            None => RpcResponse::error("Vault not unlocked", Some(ErrorCode::VaultRequired)),
        }
    }

    /// Execute a handler that requires an active session (mutable)
    pub(super) fn with_session_mut<F>(&mut self, f: F) -> RpcResponse
    where
        F: FnOnce(&mut VaultSession) -> RpcResponse,
    {
        match &mut self.session {
            Some(session) => f(session),
            None => RpcResponse::error("Vault not unlocked", Some(ErrorCode::VaultRequired)),
        }
    }

    pub(super) fn master_files_paths(&self) -> (PathBuf, PathBuf) {
        let base = self.storage.base_path();
        (base.join("master.salt"), base.join("master.verify"))
    }

    pub(super) fn verify_master_password(&self, master_password: &str) -> Result<(), RpcResponse> {
        let (salt_path, verify_path) = self.master_files_paths();
        let salt_bytes = fs::read(&salt_path).map_err(|e| {
            RpcResponse::error(
                format!("Failed to read master.salt: {}", e),
                Some(ErrorCode::InternalError),
            )
        })?;
        let master_salt: [u8; 16] = salt_bytes.as_slice().try_into().map_err(|_| {
            RpcResponse::error("Invalid master.salt", Some(ErrorCode::InternalError))
        })?;

        let verify_bytes = fs::read(&verify_path).map_err(|e| {
            RpcResponse::error(
                format!("Failed to read master.verify: {}", e),
                Some(ErrorCode::InternalError),
            )
        })?;
        let expected_verify: [u8; 32] = verify_bytes.as_slice().try_into().map_err(|_| {
            RpcResponse::error("Invalid master.verify", Some(ErrorCode::InternalError))
        })?;

        self.verify_master_password_with_material(master_password, &master_salt, &expected_verify)
    }

    pub(super) fn verify_master_password_with_material(
        &self,
        master_password: &str,
        master_salt: &[u8; 16],
        expected_verify: &[u8; 32],
    ) -> Result<(), RpcResponse> {
        use crate::crypto::{derive_vault_key, hash};

        let master_key_derived = derive_vault_key(master_password, master_salt)
            .map_err(|e| RpcResponse::error(e.to_string(), Some(ErrorCode::InternalError)))?;
        let actual_verify = hash(&*master_key_derived);

        if &actual_verify != expected_verify {
            return Err(RpcResponse::error(
                "Invalid master password",
                Some(ErrorCode::InvalidMasterPassword),
            ));
        }

        Ok(())
    }

    pub(super) fn read_file_plain(
        &self,
        vault_key: &[u8; crate::types::KEY_SIZE],
        node_id: u64,
    ) -> std::result::Result<Vec<u8>, RpcResponse> {
        let mut out: Vec<u8> = Vec::new();
        for index in 0u32.. {
            let chunk_name = self.file_data_chunk_name(vault_key, node_id, index)?;
            let encrypted = match self.storage.read_chunk(&chunk_name) {
                Ok(d) => d,
                Err(_) => {
                    // No chunks yet (empty file) or end of chunk sequence.
                    break;
                }
            };

            let plaintext =
                match crate::crypto::decrypt(&encrypted, vault_key, chunk_name.as_bytes()) {
                    Ok(d) => d,
                    Err(e) => {
                        return Err(RpcResponse::error(
                            format!("Decryption failed: {}", e),
                            Some(ErrorCode::InternalError),
                        ))
                    }
                };
            out.extend_from_slice(&plaintext);
        }
        Ok(out)
    }

    fn file_data_chunk_name(
        &self,
        vault_key: &[u8; crate::types::KEY_SIZE],
        node_id: u64,
        part_index: u32,
    ) -> std::result::Result<String, RpcResponse> {
        let node_id32: u32 = node_id
            .try_into()
            .map_err(|_| RpcResponse::error("Invalid node_id", Some(ErrorCode::InternalError)))?;
        Ok(crate::crypto::blob_chunk_name(
            vault_key, node_id32, part_index,
        ))
    }

    /// Save current session (if any)
    pub fn save(&mut self) -> crate::error::Result<()> {
        if let Some(session) = &mut self.session {
            let persisted = session.save(&self.storage)?;
            if self.catalog_subscribed {
                for (shard_id, delta) in persisted {
                    let op_type = match &delta.op {
                        crate::catalog::DeltaOp::Create { .. } => "create",
                        crate::catalog::DeltaOp::Update { .. } => "update",
                        crate::catalog::DeltaOp::Delete => "delete",
                        crate::catalog::DeltaOp::Move { .. } => "move",
                    };

                    self.events.push(serde_json::json!({
                        "command": "catalog:event",
                        "data": {
                            "type": op_type,
                            "shard_id": shard_id,
                            "node_id": delta.node_id.unwrap_or(0),
                            "version": delta.seq,
                            "delta": delta,
                        }
                    }));
                }

                // Best-effort device state update for subscribers.
                let ts = std::time::SystemTime::now()
                    .duration_since(std::time::UNIX_EPOCH)
                    .map(|d| d.as_millis() as u64)
                    .unwrap_or(0);
                self.events.push(serde_json::json!({
                    "command": "update:state",
                    "data": {
                        "TS": ts,
                        "serial_num": "local",
                    }
                }));
            }
        }
        Ok(())
    }

    #[cfg(test)]
    pub fn session_mut(&mut self) -> Option<&mut VaultSession> {
        self.session.as_mut()
    }

    #[cfg(test)]
    pub fn storage(&self) -> &Storage {
        &self.storage
    }
}
