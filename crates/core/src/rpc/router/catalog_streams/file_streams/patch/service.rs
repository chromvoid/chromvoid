use std::collections::BTreeSet;
use std::time::{SystemTime, UNIX_EPOCH};

use base64::{engine::general_purpose, Engine as _};
use serde_json::Value;

use crate::catalog::CatalogMediaInfo;
use crate::error::ErrorCode;
use crate::rpc::commands::{is_system_path_guarded, normalize_path};
use crate::rpc::stream::MAX_SINGLE_RPC_STREAM_BYTES;
use crate::rpc::types::{CatalogFileReplaceResponse, RpcResponse};
use crate::storage::Storage;
use crate::types::KEY_SIZE;
use crate::vault::VaultSession;

use super::super::super::super::blob_finalize::{
    finalize_blob_write, BlobFinalizationDelta, BlobFinalizationInput,
};
use super::super::super::super::state::RpcRouter;
use super::super::super::file_replace_tx::{
    cleanup_file_replace_marker, cleanup_staged_chunks, file_replace_temp_chunk_name,
    restore_chunks, write_file_replace_marker, FileReplaceChunkBackup, FileReplaceStagedChunk,
    FileReplaceTransaction, FILE_REPLACE_TX_VERSION,
};
use super::super::common::{current_timestamp_ms, next_source_revision};

#[derive(Debug, Clone)]
pub(super) struct PatchCommandError {
    message: String,
    code: Option<String>,
}

type PatchResult<T> = Result<T, PatchCommandError>;

impl PatchCommandError {
    fn new(message: impl Into<String>, code: Option<ErrorCode>) -> Self {
        Self {
            message: message.into(),
            code: code.map(String::from),
        }
    }

    fn empty_payload(field: &str) -> Self {
        Self::new(
            format!("{field} is required"),
            Some(ErrorCode::EmptyPayload),
        )
    }

    fn invalid_input(message: impl Into<String>) -> Self {
        Self::new(message, Some(ErrorCode::InvalidInput))
    }

    fn invalid_conflict_mode() -> Self {
        Self::new("Invalid conflict_mode", Some(ErrorCode::EmptyPayload))
    }

    fn vault_required() -> Self {
        Self::new("Vault not unlocked", Some(ErrorCode::VaultRequired))
    }

    fn node_not_found() -> Self {
        Self::new("Node not found", Some(ErrorCode::NodeNotFound))
    }

    fn access_denied() -> Self {
        Self::new("Access denied", Some(ErrorCode::AccessDenied))
    }

    fn not_file() -> Self {
        Self::new("Node is not a file", Some(ErrorCode::NotFile))
    }

    fn stale_source() -> Self {
        Self::new("Source revision is stale", Some(ErrorCode::StaleSource))
    }

    fn internal(message: impl Into<String>) -> Self {
        Self::new(message, Some(ErrorCode::InternalError))
    }

    fn from_blob_finalize_error(
        error: super::super::super::super::blob_finalize::BlobFinalizeError,
    ) -> Self {
        match error {
            super::super::super::super::blob_finalize::BlobFinalizeError::NodeNotFound => {
                Self::node_not_found()
            }
            super::super::super::super::blob_finalize::BlobFinalizeError::DerivativeIndex(
                error,
            ) => Self::internal(error),
        }
    }

    pub(super) fn into_rpc_response(self) -> RpcResponse {
        RpcResponse::error(self.message, self.code)
    }
}

struct PatchRange {
    offset: u64,
    bytes: Vec<u8>,
}

struct PatchRequest {
    node_id: u64,
    size: u64,
    mime_type: Option<String>,
    expected_source_revision: Option<u64>,
    overwrite: bool,
    patches: Vec<PatchRange>,
}

impl PatchRequest {
    fn parse(data: &Value) -> PatchResult<Self> {
        let node_id = required_u64(data, "node_id")?;
        let size = required_u64(data, "size")?;
        let mime_type = data
            .get("mime_type")
            .and_then(|value| value.as_str())
            .map(str::to_string);
        let expected_source_revision = data
            .get("expected_source_revision")
            .and_then(|value| value.as_u64());
        let overwrite = match data
            .get("conflict_mode")
            .and_then(|value| value.as_str())
            .unwrap_or("fail_if_stale")
        {
            "fail_if_stale" => false,
            "overwrite" => true,
            _ => return Err(PatchCommandError::invalid_conflict_mode()),
        };

        let patches = match data.get("patches") {
            Some(value) => {
                let values = value
                    .as_array()
                    .ok_or_else(|| PatchCommandError::invalid_input("patches must be an array"))?;
                let mut patches = Vec::with_capacity(values.len());
                for value in values {
                    patches.push(parse_patch_range(value)?);
                }
                patches
            }
            None => Vec::new(),
        };

        let mut total_patch_bytes = 0_u64;
        for patch in &patches {
            let len = patch.bytes.len() as u64;
            total_patch_bytes = total_patch_bytes
                .checked_add(len)
                .ok_or_else(|| PatchCommandError::invalid_input("Patch payload is too large"))?;
            let end = patch
                .offset
                .checked_add(len)
                .ok_or_else(|| PatchCommandError::invalid_input("Patch range overflows"))?;
            if end > size {
                return Err(PatchCommandError::invalid_input(
                    "Patch range exceeds declared file size",
                ));
            }
        }
        if total_patch_bytes > MAX_SINGLE_RPC_STREAM_BYTES {
            return Err(PatchCommandError::invalid_input(
                "Patch payload is too large",
            ));
        }

        Ok(Self {
            node_id,
            size,
            mime_type,
            expected_source_revision,
            overwrite,
            patches,
        })
    }
}

struct PatchTargetSnapshot {
    old_size: u64,
    old_mime_type: Option<String>,
    old_media_info: Option<CatalogMediaInfo>,
    old_media_inspected_revision: u64,
    old_modtime: u64,
    old_source_revision: u64,
    chunk_size: u32,
}

struct ChunkPatch {
    backups: Vec<(String, Option<Vec<u8>>)>,
    transaction: FileReplaceTransaction,
    modtime: u64,
    source_revision: u64,
}

pub(super) fn patch_file(
    router: &mut RpcRouter,
    data: &Value,
) -> PatchResult<CatalogFileReplaceResponse> {
    let session = router
        .session
        .as_mut()
        .ok_or_else(PatchCommandError::vault_required)?;
    let request = PatchRequest::parse(data)?;
    let target = validate_target(session, &request)?;

    if request.patches.is_empty() && request.size == target.old_size {
        let mime_type = request
            .mime_type
            .clone()
            .or_else(|| target.old_mime_type.clone())
            .unwrap_or_else(|| "application/octet-stream".to_string());
        return Ok(CatalogFileReplaceResponse {
            node_id: request.node_id,
            size: target.old_size,
            mime_type,
            modtime: target.old_modtime,
            source_revision: target.old_source_revision,
            media_info: target.old_media_info,
            media_inspected_revision: target.old_media_inspected_revision,
        });
    }

    session.invalidate_decrypted_chunk_cache_for_node(request.node_id);
    let chunk_size = target.chunk_size as u64;
    if chunk_size == 0 {
        return Err(PatchCommandError::internal("Invalid chunk size"));
    }

    let node_id32: u32 = request
        .node_id
        .try_into()
        .map_err(|_| PatchCommandError::internal("Invalid node_id"))?;
    let vault_key = *session.vault_key();

    let patch = patch_chunks(
        &router.storage,
        &vault_key,
        node_id32,
        &target,
        &request,
        chunk_size,
    )?;

    #[cfg(test)]
    if data
        .get("debug_crash_after_canonical_commit")
        .and_then(|value| value.as_bool())
        == Some(true)
    {
        return Err(PatchCommandError::internal(
            "debug crash after canonical commit",
        ));
    }

    let result_mime_type = request
        .mime_type
        .clone()
        .or_else(|| target.old_mime_type.clone())
        .unwrap_or_else(|| "application/octet-stream".to_string());

    if let Err(error) = finalize_blob_write(
        session,
        &router.storage,
        Some(router.derivative_index_state.as_ref()),
        BlobFinalizationInput {
            node_id: request.node_id,
            size: Some(request.size),
            mime_type: request.mime_type.clone(),
            modtime: Some(patch.modtime),
            source_revision: Some(patch.source_revision),
            delta: BlobFinalizationDelta::Replace {
                size: request.size,
                mime_type: result_mime_type.clone(),
            },
        },
    ) {
        restore_after_finalization_failure(
            session,
            &router.storage,
            &vault_key,
            request.node_id,
            &target,
            &patch,
        );
        return Err(PatchCommandError::from_blob_finalize_error(error));
    }

    let _ = session;
    if let Err(error) = router.save() {
        return Err(PatchCommandError::internal(format!(
            "Catalog save failed: {error}"
        )));
    }

    let _ = cleanup_file_replace_marker(&router.storage, &vault_key, &patch.transaction);

    Ok(CatalogFileReplaceResponse {
        node_id: request.node_id,
        size: request.size,
        mime_type: result_mime_type,
        modtime: patch.modtime,
        source_revision: patch.source_revision,
        media_info: None,
        media_inspected_revision: 0,
    })
}

fn validate_target(
    session: &VaultSession,
    request: &PatchRequest,
) -> PatchResult<PatchTargetSnapshot> {
    let path = match session.catalog().get_path(request.node_id) {
        Some(path) => normalize_path(&path),
        None => return Err(PatchCommandError::node_not_found()),
    };
    if is_system_path_guarded(&path) {
        return Err(PatchCommandError::access_denied());
    }

    let Some(node) = session.catalog().find_by_id(request.node_id) else {
        return Err(PatchCommandError::node_not_found());
    };
    if !node.is_file() {
        return Err(PatchCommandError::not_file());
    }
    if let Some(expected) = request.expected_source_revision {
        if !request.overwrite && node.source_revision() != expected {
            return Err(PatchCommandError::stale_source());
        }
    }

    Ok(PatchTargetSnapshot {
        old_size: node.size,
        old_mime_type: node.mime_type.clone(),
        old_media_info: node.media_info.clone(),
        old_media_inspected_revision: node.media_inspected_revision,
        old_modtime: node.modtime,
        old_source_revision: node.source_revision(),
        chunk_size: if node.chunk_size == 0 {
            crate::types::DEFAULT_CHUNK_SIZE
        } else {
            node.chunk_size
        },
    })
}

fn patch_chunks(
    storage: &Storage,
    vault_key: &[u8; KEY_SIZE],
    node_id32: u32,
    target: &PatchTargetSnapshot,
    request: &PatchRequest,
    chunk_size: u64,
) -> PatchResult<ChunkPatch> {
    let old_count = chunk_count(target.old_size, chunk_size)?;
    let new_count = chunk_count(request.size, chunk_size)?;
    let mut write_indices = BTreeSet::new();

    for patch in &request.patches {
        if patch.bytes.is_empty() {
            continue;
        }
        let first = patch.offset / chunk_size;
        let last = (patch.offset + patch.bytes.len() as u64 - 1) / chunk_size;
        for index in first..=last {
            write_indices.insert(
                u32::try_from(index)
                    .map_err(|_| PatchCommandError::internal("Invalid chunk index"))?,
            );
        }
    }

    if request.size != target.old_size && new_count > 0 {
        let first_changed = if request.size < target.old_size {
            request.size / chunk_size
        } else {
            target.old_size / chunk_size
        };
        for index in first_changed..new_count as u64 {
            write_indices.insert(
                u32::try_from(index)
                    .map_err(|_| PatchCommandError::internal("Invalid chunk index"))?,
            );
        }
    }

    let tail_delete_indices = (new_count..old_count).collect::<Vec<_>>();
    let mut backup_indices = write_indices.clone();
    backup_indices.extend(tail_delete_indices.iter().copied());

    let chunk_name = |part_index: u32| -> String {
        crate::crypto::blob_chunk_name(vault_key, node_id32, part_index)
    };

    let mut backups = Vec::with_capacity(backup_indices.len());
    for index in backup_indices {
        let name = chunk_name(index);
        let backup = match storage.chunk_exists(&name) {
            Ok(true) => Some(storage.read_chunk(&name).map_err(|error| {
                PatchCommandError::internal(format!("Storage read failed: {error}"))
            })?),
            Ok(false) => None,
            Err(error) => {
                return Err(PatchCommandError::internal(format!(
                    "Storage lookup failed: {error}"
                )));
            }
        };
        backups.push((name, backup));
    }

    let operation_id = SystemTime::now()
        .duration_since(UNIX_EPOCH)
        .map(|duration| duration.as_nanos())
        .unwrap_or(0);
    let mut transient_names = Vec::new();
    let mut transaction_backups = Vec::with_capacity(backups.len());
    for (index, (canonical_name, backup)) in backups.iter().enumerate() {
        let index: u32 = index
            .try_into()
            .map_err(|_| PatchCommandError::internal("Invalid chunk index"))?;
        let backup_name = match backup {
            Some(bytes) => {
                let backup_name = file_replace_temp_chunk_name(
                    vault_key,
                    node_id32,
                    operation_id,
                    "backup",
                    index,
                );
                if storage.write_chunk_atomic(&backup_name, bytes).is_err() {
                    cleanup_staged_chunks(storage, &transient_names);
                    return Err(PatchCommandError::internal("File patch failed"));
                }
                transient_names.push(backup_name.clone());
                Some(backup_name)
            }
            None => None,
        };
        transaction_backups.push(FileReplaceChunkBackup {
            canonical_name: canonical_name.clone(),
            backup_name,
        });
    }

    let mut staged_chunks = Vec::with_capacity(write_indices.len());
    for index in write_indices {
        let canonical_name = chunk_name(index);
        let plaintext = build_patched_chunk(
            storage,
            vault_key,
            node_id32,
            index,
            target.old_size,
            request.size,
            chunk_size,
            &request.patches,
        )?;
        let encrypted = crate::crypto::encrypt(&plaintext, vault_key, canonical_name.as_bytes())
            .map_err(|error| PatchCommandError::internal(format!("Encryption failed: {error}")))?;
        let stage_name =
            file_replace_temp_chunk_name(vault_key, node_id32, operation_id, "stage", index);
        if storage.write_chunk_atomic(&stage_name, &encrypted).is_err() {
            cleanup_staged_chunks(storage, &transient_names);
            return Err(PatchCommandError::internal("File patch failed"));
        }
        transient_names.push(stage_name.clone());
        staged_chunks.push(FileReplaceStagedChunk {
            canonical_name,
            stage_name,
        });
    }

    if storage.sync().is_err() {
        cleanup_staged_chunks(storage, &transient_names);
        return Err(PatchCommandError::internal("File patch failed"));
    }

    let modtime = current_timestamp_ms();
    let source_revision = next_source_revision(target.old_source_revision, modtime);
    let transaction = FileReplaceTransaction {
        version: FILE_REPLACE_TX_VERSION,
        node_id: node_id32 as u64,
        old_source_revision: target.old_source_revision,
        new_source_revision: source_revision,
        backups: transaction_backups,
        staged_chunks,
    };
    if write_file_replace_marker(storage, vault_key, &transaction).is_err() {
        cleanup_staged_chunks(storage, &transient_names);
        return Err(PatchCommandError::internal("File patch failed"));
    }

    for staged in &transaction.staged_chunks {
        let encrypted = storage
            .read_chunk(&staged.stage_name)
            .map_err(|_| restore_patch_failure(storage, vault_key, &backups, Some(&transaction)))?;
        if storage
            .write_chunk_atomic(&staged.canonical_name, &encrypted)
            .is_err()
        {
            return Err(restore_patch_failure(
                storage,
                vault_key,
                &backups,
                Some(&transaction),
            ));
        }
    }

    for index in tail_delete_indices {
        let name = chunk_name(index);
        if storage.delete_chunk(&name).is_err() {
            return Err(restore_patch_failure(
                storage,
                vault_key,
                &backups,
                Some(&transaction),
            ));
        }
    }

    if storage.sync().is_err() {
        return Err(restore_patch_failure(
            storage,
            vault_key,
            &backups,
            Some(&transaction),
        ));
    }

    Ok(ChunkPatch {
        backups,
        transaction,
        modtime,
        source_revision,
    })
}

fn build_patched_chunk(
    storage: &Storage,
    vault_key: &[u8; KEY_SIZE],
    node_id32: u32,
    index: u32,
    old_size: u64,
    new_size: u64,
    chunk_size: u64,
    patches: &[PatchRange],
) -> PatchResult<Vec<u8>> {
    let chunk_start = index as u64 * chunk_size;
    let new_len = chunk_len(new_size, index, chunk_size) as usize;
    let mut plaintext = if chunk_start < old_size {
        read_plain_chunk(storage, vault_key, node_id32, index, old_size, chunk_size)?
    } else {
        Vec::new()
    };
    plaintext.resize(new_len, 0);

    let chunk_end = chunk_start + new_len as u64;
    for patch in patches {
        let patch_len = patch.bytes.len() as u64;
        if patch_len == 0 {
            continue;
        }
        let patch_start = patch.offset;
        let patch_end = patch_start + patch_len;
        let copy_start = patch_start.max(chunk_start);
        let copy_end = patch_end.min(chunk_end);
        if copy_start >= copy_end {
            continue;
        }

        let src_start = (copy_start - patch_start) as usize;
        let src_end = (copy_end - patch_start) as usize;
        let dst_start = (copy_start - chunk_start) as usize;
        let dst_end = (copy_end - chunk_start) as usize;
        plaintext[dst_start..dst_end].copy_from_slice(&patch.bytes[src_start..src_end]);
    }

    Ok(plaintext)
}

fn read_plain_chunk(
    storage: &Storage,
    vault_key: &[u8; KEY_SIZE],
    node_id32: u32,
    index: u32,
    old_size: u64,
    chunk_size: u64,
) -> PatchResult<Vec<u8>> {
    let canonical_name = crate::crypto::blob_chunk_name(vault_key, node_id32, index);
    let encrypted = storage
        .read_chunk(&canonical_name)
        .map_err(|error| PatchCommandError::internal(format!("Storage read failed: {error}")))?;
    let mut plaintext = crate::crypto::decrypt(&encrypted, vault_key, canonical_name.as_bytes())
        .map_err(|error| PatchCommandError::internal(format!("Decryption failed: {error}")))?;
    plaintext.resize(chunk_len(old_size, index, chunk_size) as usize, 0);
    Ok(plaintext)
}

fn restore_after_finalization_failure(
    session: &mut VaultSession,
    storage: &Storage,
    vault_key: &[u8; KEY_SIZE],
    node_id: u64,
    target: &PatchTargetSnapshot,
    patch: &ChunkPatch,
) {
    let _ = restore_chunks(storage, &patch.backups);
    let _ = cleanup_file_replace_marker(storage, vault_key, &patch.transaction);
    if let Some(node) = session.catalog_mut().find_by_id_mut(node_id) {
        node.size = target.old_size;
        node.mime_type = target.old_mime_type.clone();
        node.media_info = target.old_media_info.clone();
        node.media_inspected_revision = target.old_media_inspected_revision;
        node.modtime = target.old_modtime;
        node.source_revision = target.old_source_revision;
    }
}

fn restore_patch_failure(
    storage: &Storage,
    vault_key: &[u8; KEY_SIZE],
    backups: &[(String, Option<Vec<u8>>)],
    transaction: Option<&FileReplaceTransaction>,
) -> PatchCommandError {
    if let Err(error) = restore_chunks(storage, backups) {
        return PatchCommandError::internal(format!(
            "File patch failed and restore failed: {error}"
        ));
    }
    if let Some(transaction) = transaction {
        let _ = cleanup_file_replace_marker(storage, vault_key, transaction);
    }
    PatchCommandError::internal("File patch failed")
}

fn parse_patch_range(value: &Value) -> PatchResult<PatchRange> {
    let offset = required_u64(value, "offset")?;
    let content = value
        .get("content_base64")
        .and_then(|value| value.as_str())
        .ok_or_else(|| PatchCommandError::empty_payload("content_base64"))?;
    let bytes = general_purpose::STANDARD
        .decode(content)
        .map_err(|_| PatchCommandError::invalid_input("Invalid base64 patch payload"))?;
    Ok(PatchRange { offset, bytes })
}

fn required_u64(data: &Value, field: &str) -> PatchResult<u64> {
    data.get(field)
        .and_then(|value| value.as_u64())
        .ok_or_else(|| PatchCommandError::empty_payload(field))
}

fn chunk_count(size: u64, chunk_size: u64) -> PatchResult<u32> {
    if size == 0 {
        return Ok(0);
    }
    let count = size
        .saturating_add(chunk_size.saturating_sub(1))
        .checked_div(chunk_size)
        .unwrap_or(0);
    u32::try_from(count).map_err(|_| PatchCommandError::internal("Invalid chunk count"))
}

fn chunk_len(size: u64, index: u32, chunk_size: u64) -> u64 {
    let start = index as u64 * chunk_size;
    if start >= size {
        return 0;
    }
    chunk_size.min(size - start)
}
