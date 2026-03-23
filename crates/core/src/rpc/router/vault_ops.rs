//! Vault lifecycle operations — unlock, lock, master setup, erase, sync init

use base64::{engine::general_purpose, Engine as _};
use std::fs;

use crate::error::ErrorCode;
use crate::rpc::commands::is_system_shard_id_guarded;
use crate::rpc::types::RpcResponse;
use crate::vault::Vault;

use super::state::{EraseTokenState, RpcRouter};

impl RpcRouter {
    /// Handle vault:unlock command
    pub(super) fn handle_vault_unlock(&mut self, data: &serde_json::Value) -> RpcResponse {
        if self.session.is_some() {
            return RpcResponse::error("Already unlocked", Some(ErrorCode::VaultAlreadyUnlocked));
        }

        let password = match data.get("password").and_then(|v| v.as_str()) {
            Some(p) => p,
            None => {
                return RpcResponse::error("password is required", Some(ErrorCode::EmptyPayload))
            }
        };

        let keystore = self.keystore.as_ref().map(|k| k.as_ref());
        match Vault::unlock_with_keystore(&self.storage, password, keystore) {
            Ok(session) => {
                self.session = Some(session);
                self.credential_provider_sessions.clear();
                self.credential_provider_allowlist.clear();
                self.credential_provider_last_used_at_ms.clear();
                RpcResponse::success(serde_json::Value::Null)
            }
            Err(e) => {
                let code = match &e {
                    crate::error::Error::KeystoreUnavailable(_) => {
                        Some(ErrorCode::KeystoreUnavailable)
                    }
                    crate::error::Error::StoragePepperRequired => {
                        Some(ErrorCode::StoragePepperRequired)
                    }
                    crate::error::Error::StoragePepperInvalid(_) => {
                        Some(ErrorCode::StoragePepperInvalid)
                    }
                    crate::error::Error::UnsupportedStorageVersion(_) => {
                        Some(ErrorCode::StorageVersionNotSupported)
                    }
                    _ => Some(ErrorCode::InternalError),
                };
                RpcResponse::error(e.to_string(), code)
            }
        }
    }

    /// Handle vault:lock command
    pub(super) fn handle_vault_lock(&mut self) -> RpcResponse {
        // ADR-004: vault:lock is idempotent.
        if let Some(session) = self.session.take() {
            // Save and lock
            if let Err(e) = session.lock(Some(&self.storage)) {
                return RpcResponse::error(e.to_string(), Some(ErrorCode::InternalError));
            }

            // Push event (ADR-004 attachments): emitted when push pipeline is enabled.
            if self.catalog_subscribed {
                self.events.push(serde_json::json!({
                    "command": "vault:locked",
                    "data": {"reason": "manual"}
                }));
            }
        }
        self.credential_provider_sessions.clear();
        self.credential_provider_allowlist.clear();
        self.credential_provider_last_used_at_ms.clear();
        self.clear_vault_export();
        RpcResponse::success(serde_json::Value::Null)
    }

    pub(super) fn handle_master_setup(&mut self, data: &serde_json::Value) -> RpcResponse {
        use crate::crypto::{derive_vault_key, hash};

        let master_password = match data.get("master_password").and_then(|v| v.as_str()) {
            Some(p) => p,
            None => {
                return RpcResponse::error(
                    "master_password is required",
                    Some(ErrorCode::EmptyPayload),
                )
            }
        };

        let (_salt_path, verify_path) = self.master_files_paths();

        // If already initialized, verify the password and return.
        if verify_path.exists() {
            if let Err(r) = self.verify_master_password(master_password) {
                return r;
            }
            return RpcResponse::success(serde_json::json!({
                "created": false,
            }));
        }

        let master_salt = match self.storage.get_or_create_master_salt() {
            Ok(s) => s,
            Err(e) => {
                return RpcResponse::error(
                    format!("Failed to create master.salt: {}", e),
                    Some(ErrorCode::InternalError),
                )
            }
        };

        let master_key_derived = match derive_vault_key(master_password, &master_salt) {
            Ok(k) => k,
            Err(e) => {
                return RpcResponse::error(
                    format!("Failed to derive master key: {}", e),
                    Some(ErrorCode::InternalError),
                )
            }
        };
        let verify_hash = hash(&*master_key_derived);

        if let Err(e) = fs::write(&verify_path, verify_hash) {
            return RpcResponse::error(
                format!("Failed to write master.verify: {}", e),
                Some(ErrorCode::InternalError),
            );
        }

        RpcResponse::success(serde_json::json!({
            "created": true,
        }))
    }

    pub(super) fn handle_erase_confirm(&mut self, _data: &serde_json::Value) -> RpcResponse {
        let mut buf = [0u8; 16];
        if let Err(e) = getrandom::getrandom(&mut buf) {
            return RpcResponse::error(
                format!("Failed to generate erase token: {}", e),
                Some(ErrorCode::InternalError),
            );
        }

        let token = general_purpose::URL_SAFE_NO_PAD.encode(buf);

        let expires_at = std::time::SystemTime::now()
            .checked_add(std::time::Duration::from_secs(5 * 60))
            .unwrap_or_else(std::time::SystemTime::now);

        self.erase_token = Some(EraseTokenState {
            token: token.clone(),
            expires_at,
        });

        let storage_paths = vec![self.storage.base_path().to_string_lossy().to_string()];

        RpcResponse::success(serde_json::json!({
            "erase_token": token,
            "devices": [],
            "storage_paths": storage_paths,
        }))
    }

    pub(super) fn handle_erase_execute(&mut self, data: &serde_json::Value) -> RpcResponse {
        let started = std::time::Instant::now();
        let erase_token = match data.get("erase_token").and_then(|v| v.as_str()) {
            Some(t) => t,
            None => {
                return RpcResponse::error("erase_token is required", Some(ErrorCode::EmptyPayload))
            }
        };
        let master_password = match data.get("master_password").and_then(|v| v.as_str()) {
            Some(p) => p,
            None => {
                return RpcResponse::error(
                    "master_password is required",
                    Some(ErrorCode::EmptyPayload),
                )
            }
        };

        let state = match self.erase_token.clone() {
            Some(s) => s,
            None => {
                return RpcResponse::error(
                    "Erase token expired",
                    Some(ErrorCode::EraseTokenExpired),
                )
            }
        };

        let now = std::time::SystemTime::now();
        if erase_token != state.token || now > state.expires_at {
            return RpcResponse::error("Erase token expired", Some(ErrorCode::EraseTokenExpired));
        }

        if let Err(r) = self.verify_master_password(master_password) {
            return r;
        }

        self.session = None;
        self.backup_local = None;
        self.restore_local = None;
        self.clear_vault_export();
        self.erase_token = None;
        self.catalog_subscribed = false;
        self.events.clear();
        self.master_key = None;
        self.credential_provider_sessions.clear();
        self.credential_provider_allowlist.clear();
        self.credential_provider_last_used_at_ms.clear();

        // Best-effort stats (ADR-004 attachments).
        let (erased_chunks, erased_bytes) = match self.storage.list_chunks() {
            Ok(chunks) => {
                let mut bytes: u64 = 0;
                for name in &chunks {
                    if let Ok(b) = self.storage.read_chunk(name) {
                        bytes = bytes.saturating_add(b.len() as u64);
                    }
                }
                (chunks.len() as u64, bytes)
            }
            Err(_) => (0, 0),
        };

        if let Err(e) = self.storage.erase_all() {
            return RpcResponse::error(
                format!("Failed to erase storage: {}", e),
                Some(ErrorCode::InternalError),
            );
        }

        // ADR-012: erase must remove master artifacts.
        let (salt_path, verify_path) = self.master_files_paths();
        let _ = fs::remove_file(salt_path);
        let _ = fs::remove_file(verify_path);

        // ADR-012: erase must remove portable pepper (best-effort).
        if let Some(keystore) = self.keystore.as_ref() {
            let _ = crate::crypto::StoragePepper::delete(keystore.as_ref());
        }

        let time_elapsed_ms = started.elapsed().as_millis() as u64;
        RpcResponse::success(serde_json::json!({
            "erased_bytes": erased_bytes,
            "erased_chunks": erased_chunks,
            "time_elapsed_ms": time_elapsed_ms,
        }))
    }

    pub(super) fn handle_admin_erase_v2(&mut self, data: &serde_json::Value) -> RpcResponse {
        let master_password = match data.get("master_password").and_then(|v| v.as_str()) {
            Some(p) => p,
            None => {
                return RpcResponse::error(
                    "master_password is required",
                    Some(ErrorCode::EmptyPayload),
                )
            }
        };
        let confirm = data
            .get("confirm")
            .and_then(|v| v.as_bool())
            .unwrap_or(false);
        if !confirm {
            return RpcResponse::error("Confirmation required", Some(ErrorCode::EraseNoConfirm));
        }

        if let Err(r) = self.verify_master_password(master_password) {
            return r;
        }

        self.session = None;

        if let Err(e) = self.storage.erase_all() {
            return RpcResponse::error(
                format!("Failed to erase storage: {}", e),
                Some(ErrorCode::InternalError),
            );
        }

        // ADR-012: erase must remove master artifacts.
        let (salt_path, verify_path) = self.master_files_paths();
        let _ = fs::remove_file(salt_path);
        let _ = fs::remove_file(verify_path);

        // ADR-012: erase must remove portable pepper (best-effort).
        if let Some(keystore) = self.keystore.as_ref() {
            let _ = crate::crypto::StoragePepper::delete(keystore.as_ref());
        }

        RpcResponse::success(serde_json::Value::Null)
    }

    pub(super) fn handle_catalog_sync_init_v2(&mut self) -> RpcResponse {
        if self.session.is_none() {
            return RpcResponse::error("Vault not unlocked", Some(ErrorCode::VaultRequired));
        }

        fn strategy_str(s: crate::catalog::LoadStrategy) -> &'static str {
            match s {
                crate::catalog::LoadStrategy::Eager => "eager",
                crate::catalog::LoadStrategy::Lazy => "lazy",
                crate::catalog::LoadStrategy::Paginated => "prefetch",
            }
        }

        let session = self.session.as_ref().unwrap();
        let vault_key = session.vault_key();

        let mut root_version = session.catalog().version();
        let mut shard_rows: Vec<serde_json::Value> = Vec::new();
        let mut eager_data = serde_json::Map::new();

        let root_name = crate::crypto::root_index_chunk_name(vault_key, 0);
        if let Ok(true) = self.storage.chunk_exists(&root_name) {
            if let Ok(enc) = self.storage.read_chunk(&root_name) {
                if let Ok(plain) = crate::crypto::decrypt(&enc, vault_key, root_name.as_bytes()) {
                    if let Ok(index) = serde_json::from_slice::<crate::catalog::RootIndex>(&plain) {
                        root_version = index.root_version;

                        // Deterministic ordering: .passmanager first, then lexicographic.
                        let mut metas: Vec<&crate::catalog::ShardMeta> =
                            index.shards.values().collect();
                        metas.sort_by(|a, b| {
                            let a_pm = a.shard_id == ".passmanager";
                            let b_pm = b.shard_id == ".passmanager";
                            match (a_pm, b_pm) {
                                (true, false) => std::cmp::Ordering::Less,
                                (false, true) => std::cmp::Ordering::Greater,
                                _ => a.shard_id.cmp(&b.shard_id),
                            }
                        });

                        for meta in metas {
                            shard_rows.push(serde_json::json!({
                                "shard_id": meta.shard_id,
                                "version": meta.version,
                                "size": meta.size,
                                "node_count": meta.node_count,
                                "strategy": strategy_str(meta.strategy),
                                "loaded": meta.strategy == crate::catalog::LoadStrategy::Eager,
                                "has_deltas": meta.has_deltas,
                            }));

                            if meta.strategy == crate::catalog::LoadStrategy::Eager {
                                let snap_name =
                                    crate::crypto::shard_chunk_name(vault_key, &meta.shard_id, 0);
                                let mut entry =
                                    serde_json::json!({"version": meta.version, "root": {}});
                                if let Ok(enc) = self.storage.read_chunk(&snap_name) {
                                    if let Ok(plain) = crate::crypto::decrypt(
                                        &enc,
                                        vault_key,
                                        snap_name.as_bytes(),
                                    ) {
                                        if let Ok(shard) =
                                            serde_json::from_slice::<crate::catalog::Shard>(&plain)
                                        {
                                            entry = serde_json::json!({
                                                "version": shard.version,
                                                "root": serde_json::to_value(&shard.root).unwrap_or(serde_json::Value::Null),
                                            });
                                        }
                                    }
                                }
                                eager_data.insert(meta.shard_id.clone(), entry);
                            }
                        }
                    }
                }
            }
        }

        // ADR-028: strip system shards from external sync:init response.
        shard_rows.retain(|v| {
            let sid = v.get("shard_id").and_then(|s| s.as_str()).unwrap_or("");
            !is_system_shard_id_guarded(sid)
        });
        eager_data.retain(|sid, _| !is_system_shard_id_guarded(sid));

        RpcResponse::success(serde_json::json!({
            "root_version": root_version,
            "format": "sharded",
            "shards": serde_json::Value::Array(shard_rows),
            "eager_data": serde_json::Value::Object(eager_data),
        }))
    }
}
