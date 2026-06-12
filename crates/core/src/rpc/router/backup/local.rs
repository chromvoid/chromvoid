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

    /// Local backup exposes the entire encrypted store plus the master
    /// salt/verifier (offline-bruteforce material). It must only be reachable by
    /// an authenticated caller, i.e. after the vault is unlocked.
    fn require_unlocked_for_backup(&self) -> BackupResult<()> {
        if self.is_unlocked() {
            Ok(())
        } else {
            Err(BackupCommandError::vault_required())
        }
    }

    fn backup_local_start(&mut self) -> BackupResult<serde_json::Value> {
        self.require_unlocked_for_backup()?;
        self.expire_backup_local_if_idle();
        if self.backup_local_is_active() {
            return Err(BackupCommandError::backup_already_in_progress());
        }
        BackupLocalPackService::cleanup_stale_temp_files(&self.storage);

        let manifest =
            BackupLocalPackService::build_manifest(&self.storage, self.backup_local_max_size())?;

        let created_at_ms = now_ms();
        let backup_id = format!("backup-{}", created_at_ms);
        let snapshot = BackupLocalPackService::materialize_pack(&self.storage, manifest)?;
        let manifest = snapshot.manifest;

        self.start_backup_local_session(BackupLocalSession {
            id: backup_id.clone(),
            manifest: manifest.clone(),
            chunk_offsets: snapshot.chunk_offsets,
            pack_file: snapshot.pack_file,
            metadata: None,
            meta: ExpiringSessionMeta::new(created_at_ms),
        });

        Ok(serde_json::json!({
            "backup_id": backup_id,
            "estimated_size": manifest.total_size,
            "chunk_count": manifest.chunk_count,
        }))
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
        self.require_unlocked_for_backup()?;
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
        self.require_unlocked_for_backup()?;
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
        self.require_unlocked_for_backup()?;
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
        self.require_unlocked_for_backup()?;
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
