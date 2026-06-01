use std::collections::HashSet;
use std::time::{Duration, Instant};

use crate::storage::Storage;
use crate::types::KEY_SIZE;

use super::super::super::super::state::RpcRouter;
use super::super::common::current_timestamp_ms;
use super::context::UploadVaultContext;
use super::error::{UploadCommandError, UploadResult};
use super::perf::{duration_ms, UploadPerfTotals};
use super::tx::{UploadChunkBackup, UploadSessionTransaction, UploadTempChunk};

const UPLOAD_PERF_SLOW_PART: Duration = Duration::from_millis(50);

pub(super) fn write_upload_content(
    router: &mut RpcRouter,
    context: &UploadVaultContext,
    transaction: &mut UploadSessionTransaction,
    content: &[u8],
    offset: u64,
    perf: &mut UploadPerfTotals,
) -> UploadResult<()> {
    let vault_key = *context.vault_key();
    let node_id32: u32 = transaction
        .node_id
        .try_into()
        .map_err(|_| UploadCommandError::internal("Invalid node_id"))?;
    let chunk_size = transaction.chunk_size as u64;
    if chunk_size == 0 {
        return Err(UploadCommandError::internal("Invalid chunk size"));
    }

    let mut pos = 0usize;
    let mut chunk_batch = router
        .storage
        .begin_chunk_write_batch("catalog-upload-session");
    while pos < content.len() {
        let part_started = Instant::now();
        let abs = offset.saturating_add(pos as u64);
        let chunk_index_u64 = abs / chunk_size;
        let in_chunk = (abs % chunk_size) as usize;
        let chunk_index: u32 = chunk_index_u64
            .try_into()
            .map_err(|_| UploadCommandError::internal("Invalid chunk index"))?;
        let expected_len = expected_chunk_len(transaction, chunk_index_u64)?;
        if in_chunk >= expected_len {
            return Err(UploadCommandError::invalid_offset("Invalid offset"));
        }
        let write_len = std::cmp::min(expected_len - in_chunk, content.len() - pos);
        let canonical_name = crate::crypto::blob_chunk_name(&vault_key, node_id32, chunk_index);
        let temp_name = upload_temp_chunk_name(&vault_key, transaction.node_id, chunk_index);
        let is_partial = in_chunk != 0 || write_len != expected_len;

        let mut part_existing_read_elapsed = Duration::default();
        let mut part_decrypt_elapsed = Duration::default();
        let mut part_merge_copy_elapsed = Duration::default();
        let plaintext: std::borrow::Cow<'_, [u8]> = if !is_partial {
            std::borrow::Cow::Borrowed(&content[pos..pos + write_len])
        } else {
            let mut buffer = vec![0u8; expected_len];
            if in_chunk != 0
                || transaction
                    .temp_chunks
                    .iter()
                    .any(|chunk| chunk.index == chunk_index)
            {
                let existing_read_started = Instant::now();
                let existing_chunk = router.storage.read_chunk(&temp_name);
                part_existing_read_elapsed = existing_read_started.elapsed();
                match existing_chunk {
                    Ok(encrypted) => {
                        let decrypt_started = Instant::now();
                        let decrypted = crate::crypto::decrypt(
                            &encrypted,
                            &vault_key,
                            canonical_name.as_bytes(),
                        );
                        part_decrypt_elapsed = decrypt_started.elapsed();
                        match decrypted {
                            Ok(existing) => {
                                let copy_len = std::cmp::min(existing.len(), expected_len);
                                let copy_started = Instant::now();
                                buffer[..copy_len].copy_from_slice(&existing[..copy_len]);
                                part_merge_copy_elapsed += copy_started.elapsed();
                            }
                            Err(error) => {
                                return Err(UploadCommandError::internal(format!(
                                    "Decryption failed: {error}"
                                )));
                            }
                        }
                    }
                    Err(_) if in_chunk == 0 => {}
                    Err(_) => {
                        return Err(UploadCommandError::invalid_offset("Invalid offset"));
                    }
                }
            }
            let overlay_started = Instant::now();
            buffer[in_chunk..in_chunk + write_len].copy_from_slice(&content[pos..pos + write_len]);
            part_merge_copy_elapsed += overlay_started.elapsed();
            std::borrow::Cow::Owned(buffer)
        };

        let encrypt_started = Instant::now();
        let encrypted =
            crate::crypto::encrypt(plaintext.as_ref(), &vault_key, canonical_name.as_bytes())
                .map_err(|error| {
                    UploadCommandError::internal(format!("Encryption failed: {error}"))
                })?;
        let part_encrypt_elapsed = encrypt_started.elapsed();
        let write_started = Instant::now();
        if let Err(error) = chunk_batch.write_chunk(temp_name.clone(), &encrypted) {
            chunk_batch.rollback_temps();
            return Err(UploadCommandError::internal(format!(
                "Storage write failed: {error}"
            )));
        }
        let part_write_elapsed = write_started.elapsed();
        upsert_temp_chunk(
            transaction,
            UploadTempChunk {
                index: chunk_index,
                temp_name,
                canonical_name,
                plain_len: expected_len as u64,
            },
        );

        let part_elapsed = part_started.elapsed();
        perf.parts += 1;
        if is_partial {
            perf.partial_parts += 1;
        }
        perf.bytes_written += write_len as u64;
        perf.existing_read_elapsed += part_existing_read_elapsed;
        perf.decrypt_elapsed += part_decrypt_elapsed;
        perf.merge_copy_elapsed += part_merge_copy_elapsed;
        perf.encrypt_elapsed += part_encrypt_elapsed;
        perf.write_elapsed += part_write_elapsed;
        perf.slowest_part_elapsed = perf.slowest_part_elapsed.max(part_elapsed);
        perf.slowest_encrypt_elapsed = perf.slowest_encrypt_elapsed.max(part_encrypt_elapsed);
        perf.slowest_write_elapsed = perf.slowest_write_elapsed.max(part_write_elapsed);

        if part_elapsed >= UPLOAD_PERF_SLOW_PART || is_partial {
            tracing::info!(
                "catalog_upload_perf: part node_id={} offset={} request_size={} chunk_index={} in_chunk={} write_len={} expected_len={} partial={} part_ms={:.2} existing_read_ms={:.2} decrypt_ms={:.2} merge_copy_ms={:.2} encrypt_ms={:.2} write_ms={:.2}",
                transaction.node_id,
                offset,
                content.len(),
                chunk_index,
                in_chunk,
                write_len,
                expected_len,
                is_partial,
                duration_ms(part_elapsed),
                duration_ms(part_existing_read_elapsed),
                duration_ms(part_decrypt_elapsed),
                duration_ms(part_merge_copy_elapsed),
                duration_ms(part_encrypt_elapsed),
                duration_ms(part_write_elapsed),
            );
        }
        pos += write_len;
    }

    let sync_started = Instant::now();
    if let Err(error) = chunk_batch.commit() {
        chunk_batch.rollback_temps();
        return Err(UploadCommandError::internal(format!(
            "Storage sync failed: {error}"
        )));
    }
    perf.sync_elapsed = sync_started.elapsed();
    Ok(())
}

pub(super) fn write_canonical_upload_chunks(
    storage: &Storage,
    vault_key: &[u8; KEY_SIZE],
    transaction: &UploadSessionTransaction,
    total_size: u64,
) -> UploadResult<()> {
    let expected_count = chunk_count(total_size, transaction.chunk_size as u64)?;
    let mut chunks = transaction.temp_chunks.clone();
    chunks.sort_by_key(|chunk| chunk.index);
    if chunks.len() != expected_count as usize {
        return Err(UploadCommandError::invalid_offset("Incomplete upload"));
    }
    let mut batch = storage.begin_chunk_write_batch("catalog-upload-commit");
    for chunk in chunks {
        let expected_len = std::cmp::min(
            transaction.chunk_size as u64,
            total_size.saturating_sub(chunk.index as u64 * transaction.chunk_size as u64),
        ) as usize;
        let encrypted = storage.read_chunk(&chunk.temp_name).map_err(|error| {
            UploadCommandError::internal(format!("Storage read failed: {error}"))
        })?;
        let mut plaintext =
            crate::crypto::decrypt(&encrypted, vault_key, chunk.canonical_name.as_bytes())
                .map_err(|error| {
                    UploadCommandError::internal(format!("Decryption failed: {error}"))
                })?;
        plaintext.truncate(expected_len);
        if plaintext.len() != expected_len {
            return Err(UploadCommandError::invalid_offset("Incomplete upload"));
        }
        let canonical =
            crate::crypto::encrypt(&plaintext, vault_key, chunk.canonical_name.as_bytes())
                .map_err(|error| {
                    UploadCommandError::internal(format!("Encryption failed: {error}"))
                })?;
        if let Err(error) = batch.write_chunk(chunk.canonical_name, &canonical) {
            batch.rollback_temps();
            return Err(UploadCommandError::internal(format!(
                "Storage write failed: {error}"
            )));
        }
    }
    if let Err(error) = batch.commit() {
        let committed = batch.written_names().to_vec();
        batch.rollback_temps();
        for name in committed {
            let _ = storage.delete_chunk(&name);
        }
        return Err(UploadCommandError::internal(format!(
            "Storage sync failed: {error}"
        )));
    }
    Ok(())
}

pub(super) fn backup_existing_chunks(
    storage: &Storage,
    vault_key: &[u8; KEY_SIZE],
    node_id: u32,
    old_count: u32,
) -> UploadResult<Vec<UploadChunkBackup>> {
    if old_count == 0 {
        return Ok(Vec::new());
    }
    let operation = current_timestamp_ms();
    let mut backups = Vec::with_capacity(old_count as usize);
    let mut batch = storage.begin_chunk_write_batch("catalog-upload-backup");
    for index in 0..old_count {
        let canonical_name = crate::crypto::blob_chunk_name(vault_key, node_id, index);
        if !storage.chunk_exists(&canonical_name).unwrap_or(false) {
            continue;
        }
        let encrypted = storage.read_chunk(&canonical_name).map_err(|error| {
            UploadCommandError::internal(format!("Storage read failed: {error}"))
        })?;
        let backup_name = upload_backup_chunk_name(vault_key, node_id as u64, operation, index);
        if let Err(error) = batch.write_chunk(backup_name.clone(), &encrypted) {
            batch.rollback_temps();
            return Err(UploadCommandError::internal(format!(
                "Storage backup write failed: {error}"
            )));
        }
        backups.push(UploadChunkBackup {
            canonical_name,
            backup_name,
        });
    }
    if let Err(error) = batch.commit() {
        let committed = batch.written_names().to_vec();
        batch.rollback_temps();
        for name in committed {
            let _ = storage.delete_chunk(&name);
        }
        return Err(UploadCommandError::internal(format!(
            "Storage backup sync failed: {error}"
        )));
    }
    Ok(backups)
}

pub(super) fn stale_tail_chunk_names(
    vault_key: &[u8; KEY_SIZE],
    node_id: u32,
    old_count: u32,
    new_count: u32,
) -> Vec<String> {
    (new_count..old_count)
        .map(|index| crate::crypto::blob_chunk_name(vault_key, node_id, index))
        .collect()
}

pub(super) fn restore_upload_payload(
    storage: &Storage,
    transaction: &UploadSessionTransaction,
) -> crate::error::Result<()> {
    let backup_names: HashSet<&str> = transaction
        .backups
        .iter()
        .map(|backup| backup.canonical_name.as_str())
        .collect();
    for backup in &transaction.backups {
        let encrypted = storage.read_chunk(&backup.backup_name)?;
        storage.write_chunk_atomic(&backup.canonical_name, &encrypted)?;
    }
    for chunk in &transaction.temp_chunks {
        if !backup_names.contains(chunk.canonical_name.as_str()) {
            let _ = storage.delete_chunk(&chunk.canonical_name);
        }
    }
    storage.sync()
}

pub(super) fn cleanup_upload_temp_and_backups(
    storage: &Storage,
    transaction: &UploadSessionTransaction,
    delete_stale_tail: bool,
) -> crate::error::Result<()> {
    for chunk in &transaction.temp_chunks {
        let _ = storage.delete_chunk(&chunk.temp_name);
    }
    for backup in &transaction.backups {
        let _ = storage.delete_chunk(&backup.backup_name);
    }
    if delete_stale_tail {
        for name in &transaction.stale_tail_names {
            let _ = storage.delete_chunk(name);
        }
    }
    storage.sync()
}

pub(super) fn chunk_count(size: u64, chunk_size: u64) -> UploadResult<u32> {
    if chunk_size == 0 {
        return Err(UploadCommandError::internal("Invalid chunk size"));
    }
    let count = if size == 0 {
        0
    } else {
        size.saturating_add(chunk_size - 1) / chunk_size
    };
    u32::try_from(count).map_err(|_| UploadCommandError::internal("Invalid chunk count"))
}

fn expected_chunk_len(
    transaction: &UploadSessionTransaction,
    chunk_index: u64,
) -> UploadResult<usize> {
    let chunk_size = transaction.chunk_size as u64;
    let len = match transaction.total_size {
        Some(total_size) => {
            let start = chunk_index.saturating_mul(chunk_size);
            let remaining = total_size.saturating_sub(start);
            std::cmp::min(chunk_size, remaining)
        }
        None => chunk_size,
    };
    usize::try_from(len).map_err(|_| UploadCommandError::internal("Invalid chunk size"))
}

fn upsert_temp_chunk(transaction: &mut UploadSessionTransaction, chunk: UploadTempChunk) {
    if let Some(existing) = transaction
        .temp_chunks
        .iter_mut()
        .find(|existing| existing.index == chunk.index)
    {
        *existing = chunk;
    } else {
        transaction.temp_chunks.push(chunk);
        transaction.temp_chunks.sort_by_key(|chunk| chunk.index);
    }
}

fn upload_temp_chunk_name(vault_key: &[u8; KEY_SIZE], node_id: u64, index: u32) -> String {
    let context = format!("catalog-upload-temp:{node_id}:{index}");
    crate::crypto::chunk_name_u64(vault_key, context.as_bytes(), 0)
}

fn upload_backup_chunk_name(
    vault_key: &[u8; KEY_SIZE],
    node_id: u64,
    operation: u64,
    index: u32,
) -> String {
    let context = format!("catalog-upload-backup:{node_id}:{operation}:{index}");
    crate::crypto::chunk_name_u64(vault_key, context.as_bytes(), 0)
}
