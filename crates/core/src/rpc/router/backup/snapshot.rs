//! Typed, immutable backup artifacts for in-process streaming clients.
use std::io::Cursor;

use crate::rpc::stream::{RpcOutputStream, RpcStreamMeta};
use crate::rpc::types::RpcResponse;

use super::super::backup_pack::{BACKUP_PACK_FILE_NAME, BACKUP_PACK_STREAM_CHUNK_SIZE};
use super::super::state::RpcRouter;
use super::error::{BackupCommandError, BackupResult};

/// The same five artifacts consumed by `restore:local:*`; no alternate backup format.
/// Readers own backup bytes and backing-file lifetime, never a master password.
pub struct LocalBackupSnapshot {
    streams: Vec<RpcOutputStream>,
}

impl LocalBackupSnapshot {
    pub fn into_streams(self) -> Vec<RpcOutputStream> {
        self.streams
    }
}

impl RpcRouter {
    /// Authenticates a single preparation, including while the vault is locked.
    /// Previously installed administrative context is restored on every exit path.
    pub fn prepare_local_backup(
        &mut self,
        master_password: String,
        cancel_requested: &dyn Fn() -> bool,
    ) -> Result<LocalBackupSnapshot, RpcResponse> {
        self.with_transient_master(master_password, |router| {
            router
                .prepare_local_backup_snapshot(cancel_requested)
                .map_err(BackupCommandError::into_rpc_response)
        })
    }

    fn prepare_local_backup_snapshot(
        &mut self,
        cancel_requested: &dyn Fn() -> bool,
    ) -> BackupResult<LocalBackupSnapshot> {
        let snapshot = self.prepare_backup_local_session(cancel_requested)?;
        let material =
            self.build_backup_local_material(&snapshot.manifest, snapshot.meta.created_at_ms)?;
        let manifest = serde_json::to_vec(&snapshot.manifest).map_err(|error| {
            BackupCommandError::internal(format!("Failed to serialize backup manifest: {error}"))
        })?;
        if cancel_requested() {
            return Err(BackupCommandError::cancelled());
        }
        let file = snapshot.pack_file.into_reader().map_err(|error| {
            BackupCommandError::internal(format!("Failed to open backup snapshot: {error}"))
        })?;
        Ok(LocalBackupSnapshot {
            streams: vec![
                bytes_stream(
                    "metadata.enc",
                    "application/octet-stream",
                    material.metadata,
                ),
                bytes_stream(
                    "master.salt",
                    "application/octet-stream",
                    material.master_salt,
                ),
                bytes_stream(
                    "master.verify",
                    "application/octet-stream",
                    material.master_verify,
                ),
                bytes_stream("chunks.manifest.json", "application/json", manifest),
                RpcOutputStream {
                    meta: RpcStreamMeta {
                        name: BACKUP_PACK_FILE_NAME.to_string(),
                        mime_type: "application/octet-stream".to_string(),
                        size: snapshot.manifest.total_size,
                        chunk_size: BACKUP_PACK_STREAM_CHUNK_SIZE,
                    },
                    reader: Box::new(file),
                },
            ],
        })
    }
}

fn bytes_stream(name: &str, mime_type: &str, bytes: Vec<u8>) -> RpcOutputStream {
    RpcOutputStream {
        meta: RpcStreamMeta {
            name: name.to_string(),
            mime_type: mime_type.to_string(),
            size: bytes.len() as u64,
            chunk_size: BACKUP_PACK_STREAM_CHUNK_SIZE,
        },
        reader: Box::new(Cursor::new(bytes)),
    }
}
