//! `backup:local:*` session handlers.

use base64::{engine::general_purpose, Engine as _};

use crate::rpc::stream::{RpcOutputStream, RpcReply};
use crate::rpc::types::RpcResponse;

use super::super::session_lifecycle::{now_ms, ExpiringSessionMeta};
use super::super::state::RpcRouter;
use super::error::{BackupCommandError, BackupResult};
use super::models::BackupLocalSession;
use super::pack_service::BackupLocalPackService;
use super::request::{required_str, required_u64};
use crate::rpc::request_parse::optional_str;

impl RpcRouter {
    pub(in crate::rpc::router) fn handle_backup_local_start(
        &mut self,
        _data: &serde_json::Value,
    ) -> RpcResponse {
        match self.backup_local_start() {
            Ok(result) => RpcResponse::success(result),
            Err(error) => error.into_rpc_response(),
        }
    }

    /// Local backup exposes the entire encrypted store plus master-password
    /// verification material. It is authorized by a transient master password,
    /// not by an unlocked vault session.
    fn require_master_password_for_backup(&self) -> BackupResult<()> {
        if self.master_key.is_none() {
            return Err(BackupCommandError::master_password_required());
        }
        self.derive_backup_key_v2()?;
        Ok(())
    }

    fn backup_local_start(&mut self) -> BackupResult<serde_json::Value> {
        let session = self.prepare_backup_local_session(&|| false)?;
        let result = serde_json::json!({
            "backup_id": session.id,
            "estimated_size": session.manifest.total_size,
            "chunk_count": session.manifest.chunk_count,
        });
        self.start_backup_local_session(session);
        Ok(result)
    }

    pub(super) fn prepare_backup_local_session(
        &mut self,
        cancel_requested: &dyn Fn() -> bool,
    ) -> BackupResult<BackupLocalSession> {
        if cancel_requested() {
            return Err(BackupCommandError::cancelled());
        }
        self.require_master_password_for_backup()?;
        self.expire_backup_local_if_idle();
        if self.backup_local_is_active() {
            return Err(BackupCommandError::backup_already_in_progress());
        }
        self.save().map_err(|error| {
            BackupCommandError::internal(format!("Failed to save before backup: {error}"))
        })?;
        BackupLocalPackService::cleanup_stale_temp_files(&self.storage);

        let manifest = BackupLocalPackService::build_manifest(
            &self.storage,
            self.backup_local_max_size(),
            cancel_requested,
        )?;

        let created_at_ms = now_ms();
        let snapshot =
            BackupLocalPackService::materialize_pack(&self.storage, manifest, cancel_requested)?;
        let manifest = snapshot.manifest;

        Ok(BackupLocalSession {
            id: format!("backup-{}", created_at_ms),
            manifest,
            chunk_offsets: snapshot.chunk_offsets,
            pack_file: snapshot.pack_file,
            metadata: None,
            meta: ExpiringSessionMeta::new(created_at_ms),
        })
    }

    pub(in crate::rpc::router) fn handle_backup_local_download_chunk(
        &mut self,
        data: &serde_json::Value,
    ) -> RpcResponse {
        match self.backup_local_download_chunk(data) {
            Ok(result) => RpcResponse::success(result),
            Err(error) => error.into_rpc_response(),
        }
    }

    fn backup_local_download_chunk(
        &mut self,
        data: &serde_json::Value,
    ) -> BackupResult<serde_json::Value> {
        self.require_master_password_for_backup()?;
        let backup_id = required_str(data, "backup_id")?;
        let chunk_index = required_u64(data, "chunk_index")?;

        self.expire_backup_local_if_idle();
        let (name, bytes, chunk_count) = {
            let session = self
                .backup_local_session(backup_id)
                .map_err(BackupCommandError::from)?;
            let chunks = &session.manifest.chunks;
            let chunk_count = chunks.len() as u64;
            if chunk_index >= chunk_count {
                return Err(BackupCommandError::node_not_found(
                    "chunk_index out of range",
                ));
            }
            let index = chunk_index as usize;
            let entry = &chunks[index];
            let bytes = match BackupLocalPackService::read_chunk_slice(
                &session.pack_file,
                session.chunk_offsets[index],
                entry.size,
            ) {
                Ok(bytes) => bytes,
                Err(error) => {
                    return Err(BackupCommandError::internal(format!(
                        "Failed to read chunk {}: {}",
                        entry.name, error
                    )))
                }
            };
            (entry.name.clone(), bytes, chunk_count)
        };
        self.touch_backup_local(backup_id);
        let data_b64 = general_purpose::STANDARD.encode(&bytes);

        Ok(serde_json::json!({
            "chunk_index": chunk_index,
            "chunk_name": name,
            "data": data_b64,
            "is_last": chunk_index + 1 == chunk_count,
        }))
    }

    pub(in crate::rpc::router) fn handle_backup_local_get_chunk_manifest(
        &mut self,
        data: &serde_json::Value,
    ) -> RpcResponse {
        match self.backup_local_get_chunk_manifest(data) {
            Ok(result) => RpcResponse::success(result),
            Err(error) => error.into_rpc_response(),
        }
    }

    fn backup_local_get_chunk_manifest(
        &mut self,
        data: &serde_json::Value,
    ) -> BackupResult<serde_json::Value> {
        self.require_master_password_for_backup()?;
        let backup_id = required_str(data, "backup_id")?;

        self.expire_backup_local_if_idle();
        let manifest = self
            .backup_local_session(backup_id)
            .map_err(BackupCommandError::from)?
            .manifest
            .clone();
        self.touch_backup_local(backup_id);

        match serde_json::to_value(&manifest) {
            Ok(manifest) => Ok(serde_json::json!({ "manifest": manifest })),
            Err(error) => Err(BackupCommandError::internal(format!(
                "Failed to serialize chunk manifest: {error}"
            ))),
        }
    }

    pub(in crate::rpc::router) fn handle_backup_local_download_pack(
        &mut self,
        data: &serde_json::Value,
    ) -> RpcReply {
        match self.backup_local_download_pack(data) {
            Ok(stream) => RpcReply::Stream(stream),
            Err(error) => RpcReply::Json(error.into_rpc_response()),
        }
    }

    fn backup_local_download_pack(
        &mut self,
        data: &serde_json::Value,
    ) -> BackupResult<RpcOutputStream> {
        self.require_master_password_for_backup()?;
        let backup_id = required_str(data, "backup_id")?;

        self.expire_backup_local_if_idle();
        let (manifest, stream) = {
            let session = self
                .backup_local_session(backup_id)
                .map_err(BackupCommandError::from)?;
            let manifest = session.manifest.clone();
            let stream =
                BackupLocalPackService::open_pack_stream(&session.pack_file, &session.manifest)?;
            (manifest, stream)
        };
        self.touch_backup_local(backup_id);
        tracing::info!(
            backup_id = %backup_id,
            pack_bytes = manifest.total_size,
            chunk_count = manifest.chunk_count,
            "backup_local_download_pack_stream_opened"
        );

        Ok(stream)
    }

    pub(in crate::rpc::router) fn handle_backup_local_get_metadata(
        &mut self,
        data: &serde_json::Value,
    ) -> RpcResponse {
        match self.backup_local_get_metadata(data) {
            Ok(result) => RpcResponse::success(result),
            Err(error) => error.into_rpc_response(),
        }
    }

    fn backup_local_get_metadata(
        &mut self,
        data: &serde_json::Value,
    ) -> BackupResult<serde_json::Value> {
        self.require_master_password_for_backup()?;
        let backup_id = required_str(data, "backup_id")?;

        self.expire_backup_local_if_idle();
        let session = self
            .backup_local_session(backup_id)
            .map_err(BackupCommandError::from)?;
        let (manifest, created_at, cached_metadata) = (
            session.manifest.clone(),
            session.meta.created_at_ms,
            session.metadata.clone(),
        );
        let metadata = match cached_metadata {
            Some(metadata) => metadata,
            None => match self.build_backup_local_metadata(&manifest, created_at) {
                Ok(metadata) => {
                    self.cache_backup_local_metadata(backup_id, metadata.clone())
                        .map_err(BackupCommandError::from)?;
                    metadata
                }
                Err(error) => return Err(error),
            },
        };
        self.touch_backup_local(backup_id);

        Ok(serde_json::json!({
            "metadata": metadata.metadata,
            "master_salt": metadata.master_salt,
            "master_verify": metadata.master_verify,
        }))
    }

    pub(in crate::rpc::router) fn handle_backup_local_finish(
        &mut self,
        data: &serde_json::Value,
    ) -> RpcResponse {
        match self.backup_local_finish(data) {
            Ok(result) => RpcResponse::success(result),
            Err(error) => error.into_rpc_response(),
        }
    }

    fn backup_local_finish(&mut self, data: &serde_json::Value) -> BackupResult<serde_json::Value> {
        let backup_id = required_str(data, "backup_id")?;

        self.expire_backup_local_if_idle();
        self.finish_backup_local_session(backup_id)
            .map_err(BackupCommandError::from)?;

        let created_at = std::time::SystemTime::now()
            .duration_since(std::time::UNIX_EPOCH)
            .map(|d| d.as_millis() as u64)
            .unwrap_or(0);

        Ok(serde_json::json!({
            "backup_id": backup_id,
            "created_at": created_at,
        }))
    }

    pub(in crate::rpc::router) fn handle_backup_local_cancel(
        &mut self,
        data: &serde_json::Value,
    ) -> RpcResponse {
        match self.backup_local_cancel(data) {
            Ok(result) => RpcResponse::success(result),
            Err(error) => error.into_rpc_response(),
        }
    }

    fn backup_local_cancel(&mut self, data: &serde_json::Value) -> BackupResult<serde_json::Value> {
        let requested = optional_str(data, "backup_id");

        self.expire_backup_local_if_idle();
        let active_id = self
            .cancel_backup_local_session(requested.as_deref())
            .map_err(BackupCommandError::from)?;
        Ok(serde_json::json!({
            "backup_id": active_id,
            "cancelled": true,
        }))
    }
}

#[cfg(test)]
mod tests {
    use std::collections::BTreeMap;
    use std::path::{Path, PathBuf};
    use std::sync::atomic::{AtomicUsize, Ordering};
    use std::sync::Arc;

    use serde_json::json;
    use tempfile::TempDir;

    use crate::crypto::keystore::{InMemoryKeystore, Keystore, KeystoreError, STORAGE_PEPPER_LEN};
    use crate::rpc::router::backup_pack::BackupChunkManifest;
    use crate::rpc::types::{RpcRequest, RpcResponse};
    use crate::rpc::{RpcReply, RpcRouter};
    use crate::storage::Storage;

    fn router_with_master_password(master_password: &str) -> (TempDir, RpcRouter) {
        let temp_dir = TempDir::new().expect("temp dir");
        let storage = Storage::new(temp_dir.path()).expect("storage");
        let router = RpcRouter::new(storage).with_keystore(Arc::new(InMemoryKeystore::new()));
        router
            .ensure_master_setup(master_password)
            .expect("master setup");
        (temp_dir, router.with_master_key(master_password))
    }

    #[derive(Debug, Default)]
    struct MissingPepperKeystore {
        store_calls: AtomicUsize,
    }

    impl Keystore for MissingPepperKeystore {
        fn load_storage_pepper(&self) -> Result<Option<[u8; STORAGE_PEPPER_LEN]>, KeystoreError> {
            Ok(None)
        }

        fn store_storage_pepper(
            &self,
            _pepper: [u8; STORAGE_PEPPER_LEN],
        ) -> Result<(), KeystoreError> {
            self.store_calls.fetch_add(1, Ordering::SeqCst);
            Ok(())
        }

        fn delete_storage_pepper(&self) -> Result<(), KeystoreError> {
            Ok(())
        }
    }

    fn snapshot_files(root: &Path) -> BTreeMap<PathBuf, Vec<u8>> {
        fn visit(root: &Path, directory: &Path, files: &mut BTreeMap<PathBuf, Vec<u8>>) {
            for entry in std::fs::read_dir(directory).expect("read storage directory") {
                let entry = entry.expect("storage directory entry");
                let path = entry.path();
                if path.is_dir() {
                    visit(root, &path, files);
                } else if path.is_file() {
                    files.insert(
                        path.strip_prefix(root)
                            .expect("relative storage path")
                            .to_path_buf(),
                        std::fs::read(path).expect("read storage file"),
                    );
                }
            }
        }

        let mut files = BTreeMap::new();
        visit(root, root, &mut files);
        files
    }

    #[test]
    fn local_backup_start_accepts_master_password_without_unlocked_vault() {
        let (_temp_dir, mut router) = router_with_master_password("secret");
        assert!(!router.is_unlocked());

        let response = router.handle(&RpcRequest::new("backup:local:start", json!({})));

        match response {
            RpcResponse::Success { result, .. } => {
                let backup_id = result
                    .get("backup_id")
                    .and_then(|value| value.as_str())
                    .expect("backup_id");
                assert!(backup_id.starts_with("backup-"));
            }
            RpcResponse::Error { error, .. } => panic!("unexpected backup error: {error}"),
        }
    }

    #[test]
    fn local_backup_start_requires_transient_master_password_not_unlocked_vault() {
        let (_temp_dir, mut router) = router_with_master_password("secret");
        router.set_master_key(None);

        let response = router.handle(&RpcRequest::new("backup:local:start", json!({})));

        match response {
            RpcResponse::Error { error, code, .. } => {
                assert_eq!(error, "Master password required");
                assert_eq!(code.as_deref(), Some("EMPTY_PAYLOAD"));
            }
            RpcResponse::Success { .. } => panic!("backup unexpectedly started"),
        }
    }

    #[test]
    fn local_backup_start_rejects_wrong_master_password_before_session_start() {
        let (_temp_dir, mut router) = router_with_master_password("secret");
        router.set_master_key(Some("wrong".to_string()));

        let response = router.handle(&RpcRequest::new("backup:local:start", json!({})));

        match response {
            RpcResponse::Error { error, code, .. } => {
                assert_eq!(error, "Invalid master password");
                assert_eq!(code.as_deref(), Some("INVALID_MASTER_PASSWORD"));
                assert!(!router.backup_local_is_active());
            }
            RpcResponse::Success { .. } => panic!("backup unexpectedly started"),
        }
    }

    #[test]
    fn local_backup_metadata_does_not_create_missing_storage_pepper() {
        let temp_dir = TempDir::new().expect("temp dir");
        let storage = Storage::new(temp_dir.path()).expect("storage");
        let keystore = Arc::new(MissingPepperKeystore::default());
        let router = RpcRouter::new(storage).with_keystore(keystore.clone());
        router.ensure_master_setup("secret").expect("master setup");
        let router = router.with_master_key("secret");
        assert!(!router.storage.salt_exists());
        let before = snapshot_files(temp_dir.path());

        let error = router
            .build_backup_local_metadata(&BackupChunkManifest::new(Vec::new()), 1)
            .expect_err("missing pepper must fail backup metadata");
        let (_, code) = error.into_parts();

        assert_eq!(code.as_deref(), Some("STORAGE_PEPPER_REQUIRED"));
        assert_eq!(keystore.store_calls.load(Ordering::SeqCst), 0);
        assert!(!router.storage.salt_exists());
        assert_eq!(snapshot_files(temp_dir.path()), before);
    }

    #[test]
    fn admin_backup_does_not_create_missing_storage_pepper() {
        let temp_dir = TempDir::new().expect("temp dir");
        let storage = Storage::new(temp_dir.path()).expect("storage");
        let keystore = Arc::new(MissingPepperKeystore::default());
        let mut router = RpcRouter::new(storage).with_keystore(keystore.clone());
        router.ensure_master_setup("secret").expect("master setup");
        assert!(!router.storage.salt_exists());
        let before = snapshot_files(temp_dir.path());

        let reply = router.handle_admin_backup_stream(&json!({"master_password": "secret"}));

        match reply {
            RpcReply::Json(RpcResponse::Error { code, .. }) => {
                assert_eq!(code.as_deref(), Some("STORAGE_PEPPER_REQUIRED"));
            }
            RpcReply::Json(RpcResponse::Success { .. }) | RpcReply::Stream(_) => {
                panic!("missing pepper must fail admin backup")
            }
            RpcReply::RangeStream(_) => panic!("admin backup must not return a range stream"),
        }
        assert_eq!(keystore.store_calls.load(Ordering::SeqCst), 0);
        assert!(!router.storage.salt_exists());
        assert_eq!(snapshot_files(temp_dir.path()), before);
    }
}
