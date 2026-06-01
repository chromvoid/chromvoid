use std::time::{SystemTime, UNIX_EPOCH};

use crate::storage::Storage;
use crate::types::KEY_SIZE;

use super::super::super::file_replace_tx::{
    cleanup_file_replace_marker, cleanup_staged_chunks, file_replace_temp_chunk_name,
    restore_chunks, write_file_replace_marker, FileReplaceChunkBackup, FileReplaceStagedChunk,
    FileReplaceTransaction, FILE_REPLACE_TX_VERSION,
};
use super::super::common::{current_timestamp_ms, next_source_revision};
use super::error::{ReplaceCommandError, ReplaceResult};

pub(super) struct ChunkReplacement {
    pub(super) backups: Vec<(String, Option<Vec<u8>>)>,
    pub(super) transaction: FileReplaceTransaction,
    pub(super) modtime: u64,
    pub(super) source_revision: u64,
}

pub(super) fn chunk_count(size: u64, chunk_size: u64) -> ReplaceResult<u32> {
    if size == 0 {
        return Ok(0);
    }
    let count = size
        .saturating_add(chunk_size.saturating_sub(1))
        .checked_div(chunk_size)
        .unwrap_or(0);
    u32::try_from(count).map_err(|_| ReplaceCommandError::internal("Invalid chunk count"))
}

pub(super) fn replace_chunks(
    storage: &Storage,
    vault_key: &[u8; KEY_SIZE],
    node_id32: u32,
    old_size: u64,
    new_size: u64,
    chunk_size: u64,
    content: &[u8],
    old_source_revision: u64,
) -> ReplaceResult<ChunkReplacement> {
    let chunk_name = |part_index: u32| -> String {
        crate::crypto::blob_chunk_name(vault_key, node_id32, part_index)
    };
    let old_count = chunk_count(old_size, chunk_size)?;
    let new_count = chunk_count(new_size, chunk_size)?;
    let max_count = old_count.max(new_count);

    let mut backups = Vec::with_capacity(max_count as usize);
    for index in 0..max_count {
        let name = chunk_name(index);
        let backup = match storage.chunk_exists(&name) {
            Ok(true) => match storage.read_chunk(&name) {
                Ok(bytes) => Some(bytes),
                Err(error) => {
                    return Err(ReplaceCommandError::internal(format!(
                        "Storage read failed: {error}"
                    )));
                }
            },
            Ok(false) => None,
            Err(error) => {
                return Err(ReplaceCommandError::internal(format!(
                    "Storage lookup failed: {error}"
                )));
            }
        };
        backups.push((name, backup));
    }

    let mut encrypted_chunks: Vec<(String, Vec<u8>)> = Vec::with_capacity(new_count as usize);
    for (index, plaintext) in content.chunks(chunk_size as usize).enumerate() {
        let index: u32 = index
            .try_into()
            .map_err(|_| ReplaceCommandError::internal("Invalid chunk index"))?;
        let name = chunk_name(index);
        let encrypted =
            crate::crypto::encrypt(plaintext, vault_key, name.as_bytes()).map_err(|error| {
                ReplaceCommandError::internal(format!("Encryption failed: {error}"))
            })?;
        encrypted_chunks.push((name, encrypted));
    }

    let operation_id = SystemTime::now()
        .duration_since(UNIX_EPOCH)
        .map(|duration| duration.as_nanos())
        .unwrap_or(0);
    let mut transient_names: Vec<String> =
        Vec::with_capacity(encrypted_chunks.len() + backups.len());
    let mut transaction_backups: Vec<FileReplaceChunkBackup> = Vec::with_capacity(backups.len());

    for (index, (canonical_name, backup)) in backups.iter().enumerate() {
        let index: u32 = index
            .try_into()
            .map_err(|_| ReplaceCommandError::internal("Invalid chunk index"))?;
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
                    return Err(restore_replace_failure(
                        storage,
                        vault_key,
                        &backups,
                        None,
                        &transient_names,
                    ));
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

    let mut staged_chunks: Vec<FileReplaceStagedChunk> = Vec::with_capacity(encrypted_chunks.len());

    for (index, (canonical_name, encrypted)) in encrypted_chunks.iter().enumerate() {
        let index: u32 = index
            .try_into()
            .map_err(|_| ReplaceCommandError::internal("Invalid chunk index"))?;
        let stage_name =
            file_replace_temp_chunk_name(vault_key, node_id32, operation_id, "stage", index);
        if storage.write_chunk_atomic(&stage_name, encrypted).is_err() {
            return Err(restore_replace_failure(
                storage,
                vault_key,
                &backups,
                None,
                &transient_names,
            ));
        }
        transient_names.push(stage_name.clone());
        staged_chunks.push(FileReplaceStagedChunk {
            canonical_name: canonical_name.clone(),
            stage_name,
        });
    }
    if storage.sync().is_err() {
        return Err(restore_replace_failure(
            storage,
            vault_key,
            &backups,
            None,
            &transient_names,
        ));
    }

    let modtime = current_timestamp_ms();
    let source_revision = next_source_revision(old_source_revision, modtime);
    let transaction = FileReplaceTransaction {
        version: FILE_REPLACE_TX_VERSION,
        node_id: node_id32 as u64,
        old_source_revision,
        new_source_revision: source_revision,
        backups: transaction_backups,
        staged_chunks,
    };
    if write_file_replace_marker(storage, vault_key, &transaction).is_err() {
        return Err(restore_replace_failure(
            storage,
            vault_key,
            &backups,
            Some(&transaction),
            &[],
        ));
    }

    for staged in &transaction.staged_chunks {
        let encrypted = match storage.read_chunk(&staged.stage_name) {
            Ok(encrypted) => encrypted,
            Err(_) => {
                return Err(restore_replace_failure(
                    storage,
                    vault_key,
                    &backups,
                    Some(&transaction),
                    &[],
                ));
            }
        };
        if storage
            .write_chunk_atomic(&staged.canonical_name, &encrypted)
            .is_err()
        {
            return Err(restore_replace_failure(
                storage,
                vault_key,
                &backups,
                Some(&transaction),
                &[],
            ));
        }
    }
    for index in new_count..max_count {
        let name = chunk_name(index);
        if storage.delete_chunk(&name).is_err() {
            return Err(restore_replace_failure(
                storage,
                vault_key,
                &backups,
                Some(&transaction),
                &[],
            ));
        }
    }
    if storage.sync().is_err() {
        return Err(restore_replace_failure(
            storage,
            vault_key,
            &backups,
            Some(&transaction),
            &[],
        ));
    }

    Ok(ChunkReplacement {
        backups,
        transaction,
        modtime,
        source_revision,
    })
}

fn restore_replace_failure(
    storage: &Storage,
    vault_key: &[u8; KEY_SIZE],
    backups: &[(String, Option<Vec<u8>>)],
    transaction: Option<&FileReplaceTransaction>,
    transient_names: &[String],
) -> ReplaceCommandError {
    if let Err(error) = restore_chunks(storage, backups) {
        return ReplaceCommandError::internal(format!(
            "File replace failed and restore failed: {error}"
        ));
    }
    if let Some(transaction) = transaction {
        let _ = cleanup_file_replace_marker(storage, vault_key, transaction);
    } else {
        cleanup_staged_chunks(storage, transient_names);
    }
    ReplaceCommandError::internal("File replace failed")
}
