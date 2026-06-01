//! Local backup pack materialization and read helpers.

use std::io::{Read, Seek, SeekFrom, Write};

use crate::rpc::stream::{RpcOutputStream, RpcStreamMeta};
use crate::storage::{Storage, StorageTempArtifact, StorageTempNamespace};

use super::super::backup_pack::{
    BackupChunkManifest, BackupChunkManifestEntry, BACKUP_PACK_FILE_NAME,
    BACKUP_PACK_STREAM_CHUNK_SIZE,
};
use super::error::{BackupCommandError, BackupResult};

pub(in crate::rpc::router::backup) struct BackupLocalPackService;

pub(in crate::rpc::router::backup) struct BackupLocalPackSnapshot {
    pub(in crate::rpc::router::backup) manifest: BackupChunkManifest,
    pub(in crate::rpc::router::backup) chunk_offsets: Vec<u64>,
    pub(in crate::rpc::router::backup) pack_file: StorageTempArtifact,
}

impl BackupLocalPackService {
    pub(in crate::rpc::router::backup) fn cleanup_stale_temp_files(storage: &Storage) {
        let _ = storage.cleanup_temp_namespace(StorageTempNamespace::BackupLocal);
        let _ = storage.cleanup_legacy_temp_files(StorageTempNamespace::BackupLocal);
    }

    pub(in crate::rpc::router::backup) fn build_manifest(
        storage: &Storage,
        max_size: Option<u64>,
    ) -> BackupResult<BackupChunkManifest> {
        let chunk_names = match storage.list_chunks() {
            Ok(mut chunks) => {
                chunks.sort();
                chunks
            }
            Err(error) => {
                return Err(BackupCommandError::internal(format!(
                    "Failed to list chunks: {error}"
                )))
            }
        };

        let mut chunks = Vec::with_capacity(chunk_names.len());
        let mut total_size = 0_u64;
        for name in &chunk_names {
            match storage.chunk_len(name) {
                Ok(len) => {
                    total_size = total_size.saturating_add(len);
                    chunks.push(BackupChunkManifestEntry {
                        name: name.clone(),
                        size: len,
                    });
                    if let Some(max) = max_size {
                        if total_size > max {
                            return Err(BackupCommandError::backup_too_large());
                        }
                    }
                }
                Err(error) => {
                    return Err(BackupCommandError::internal(format!(
                        "Failed to stat chunk {name}: {error}"
                    )))
                }
            }
        }

        Ok(BackupChunkManifest::new(chunks))
    }

    pub(in crate::rpc::router::backup) fn materialize_pack(
        storage: &Storage,
        manifest: BackupChunkManifest,
    ) -> BackupResult<BackupLocalPackSnapshot> {
        let mut temp_file = storage
            .create_temp_file(StorageTempNamespace::BackupLocal, "backup-local-", ".pack")
            .map_err(|error| {
                BackupCommandError::internal(format!("Failed to create backup snapshot: {error}"))
            })?;

        let mut offsets = Vec::with_capacity(manifest.chunks.len());
        let mut offset = 0_u64;
        for entry in &manifest.chunks {
            offsets.push(offset);
            let bytes = storage.read_chunk(&entry.name).map_err(|error| {
                BackupCommandError::internal(format!(
                    "Failed to read chunk {}: {}",
                    entry.name, error
                ))
            })?;
            if bytes.len() as u64 != entry.size {
                return Err(BackupCommandError::internal(format!(
                    "chunk size mismatch for {}",
                    entry.name
                )));
            }
            temp_file.as_file_mut().write_all(&bytes).map_err(|error| {
                BackupCommandError::internal(format!("Failed to write backup snapshot: {error}"))
            })?;
            offset = offset.saturating_add(entry.size);
        }
        temp_file.sync_file_and_parent().map_err(|error| {
            BackupCommandError::internal(format!("Failed to sync backup snapshot: {error}"))
        })?;

        Ok(BackupLocalPackSnapshot {
            manifest,
            chunk_offsets: offsets,
            pack_file: temp_file.into_artifact(),
        })
    }

    pub(in crate::rpc::router::backup) fn read_chunk_slice(
        pack_file: &StorageTempArtifact,
        offset: u64,
        size: u64,
    ) -> std::io::Result<Vec<u8>> {
        let mut file = pack_file.open().map_err(std::io::Error::other)?;
        file.seek(SeekFrom::Start(offset))?;
        let mut bytes = vec![0_u8; size as usize];
        file.read_exact(&mut bytes)?;
        Ok(bytes)
    }

    pub(in crate::rpc::router::backup) fn open_pack_stream(
        pack_file: &StorageTempArtifact,
        manifest: &BackupChunkManifest,
    ) -> BackupResult<RpcOutputStream> {
        let file = pack_file.open().map_err(|error| {
            BackupCommandError::internal(format!("Failed to read backup pack: {error}"))
        })?;

        Ok(RpcOutputStream {
            meta: RpcStreamMeta {
                name: BACKUP_PACK_FILE_NAME.to_string(),
                mime_type: "application/octet-stream".to_string(),
                size: manifest.total_size,
                chunk_size: BACKUP_PACK_STREAM_CHUNK_SIZE,
            },
            reader: Box::new(file),
        })
    }
}
