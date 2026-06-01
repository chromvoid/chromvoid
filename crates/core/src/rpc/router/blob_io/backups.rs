use crate::storage::Storage;
use crate::types::KEY_SIZE;

use super::common::{operation_id, BlobEraseTransaction, BlobWriteTransaction};
use super::error::BlobIoError;
use super::markers::blob_erase_backup_chunk_name;
#[cfg(test)]
use super::markers::blob_write_backup_chunk_name;

#[cfg(test)]
pub(super) fn backup_existing_chunk(
    storage: &Storage,
    vault_key: &[u8; KEY_SIZE],
    node_id: u32,
    chunk_name: &str,
) -> Result<Option<String>, BlobIoError> {
    if !storage
        .chunk_exists(chunk_name)
        .map_err(|error| BlobIoError::Storage(format!("Storage read failed: {error}")))?
    {
        return Ok(None);
    }

    let old_encrypted = storage
        .read_chunk(chunk_name)
        .map_err(|error| BlobIoError::Storage(format!("Storage read failed: {error}")))?;
    let backup_name = blob_write_backup_chunk_name(vault_key, node_id, operation_id());
    let mut batch = storage.begin_chunk_write_batch("single-blob-backup");
    if let Err(error) = batch.write_chunk(backup_name.clone(), &old_encrypted) {
        batch.rollback_temps();
        return Err(BlobIoError::Storage(format!(
            "Storage backup write failed: {error}"
        )));
    }
    if let Err(error) = batch.commit() {
        let committed = batch.written_names().to_vec();
        batch.rollback_temps();
        for name in committed {
            let _ = storage.delete_chunk(&name);
        }
        return Err(BlobIoError::Storage(format!(
            "Storage backup sync failed: {error}"
        )));
    }
    Ok(Some(backup_name))
}

pub(super) fn collect_blob_chunk_names(
    storage: &Storage,
    vault_key: &[u8; KEY_SIZE],
    node_id: u32,
) -> Result<Vec<String>, BlobIoError> {
    let mut names = Vec::new();
    for index in 0u32.. {
        let name = crate::crypto::blob_chunk_name(vault_key, node_id, index);
        if !storage
            .chunk_exists(&name)
            .map_err(|error| BlobIoError::Storage(format!("Storage read failed: {error}")))?
        {
            break;
        }
        names.push(name);
    }
    Ok(names)
}

pub(super) fn backup_blob_chunks(
    storage: &Storage,
    vault_key: &[u8; KEY_SIZE],
    node_id: u32,
    names: &[String],
) -> Result<Vec<(String, String)>, BlobIoError> {
    let operation = operation_id();
    let mut backups = Vec::new();
    let mut batch = storage.begin_chunk_write_batch("single-blob-erase-backup");
    for (index, name) in names.iter().enumerate() {
        let encrypted = storage
            .read_chunk(name)
            .map_err(|error| BlobIoError::Storage(format!("Storage read failed: {error}")))?;
        let backup_name = blob_erase_backup_chunk_name(vault_key, node_id, operation, index as u32);
        if let Err(error) = batch.write_chunk(backup_name.clone(), &encrypted) {
            batch.rollback_temps();
            return Err(BlobIoError::Storage(format!(
                "Storage backup write failed: {error}"
            )));
        }
        backups.push((name.clone(), backup_name));
    }
    if let Err(error) = batch.commit() {
        let committed = batch.written_names().to_vec();
        batch.rollback_temps();
        for name in committed {
            let _ = storage.delete_chunk(&name);
        }
        return Err(BlobIoError::Storage(format!(
            "Storage backup sync failed: {error}"
        )));
    }
    Ok(backups)
}

pub(super) fn restore_blob_chunk_backups(
    storage: &Storage,
    backups: &[(String, String)],
) -> crate::error::Result<()> {
    for (original, backup) in backups {
        let encrypted = storage.read_chunk(backup)?;
        storage.write_chunk_atomic(original, &encrypted)?;
    }
    storage.sync()
}

pub(super) fn cleanup_blob_chunk_backups(
    storage: &Storage,
    backups: &[(String, String)],
) -> crate::error::Result<()> {
    for (_, backup) in backups {
        let _ = storage.delete_chunk(backup);
    }
    storage.sync()
}

pub(super) fn cleanup_blob_write_backup(storage: &Storage, transaction: &BlobWriteTransaction) {
    if let Some(backup_name) = &transaction.backup_name {
        let _ = storage.delete_chunk(backup_name);
    }
}

pub(super) fn cleanup_blob_erase_backups(storage: &Storage, transaction: &BlobEraseTransaction) {
    for backup in &transaction.backups {
        let _ = storage.delete_chunk(&backup.backup_name);
    }
}
