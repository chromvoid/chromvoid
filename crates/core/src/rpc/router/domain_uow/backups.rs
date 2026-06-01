use std::collections::HashSet;

use crate::storage::Storage;
use crate::types::KEY_SIZE;

use super::errors::{internal_error, storage_error};
use super::types::{operation_id, DomainChunkBackup, DomainUnitOfWorkPayload, StagedBlobWrite};
use super::DomainUowResult;

pub(super) fn backup_existing_chunks(
    storage: &Storage,
    vault_key: &[u8; KEY_SIZE],
    writes: &[StagedBlobWrite],
) -> DomainUowResult<Vec<DomainChunkBackup>> {
    let mut seen = HashSet::new();
    let mut backups = Vec::new();
    let mut batch = storage.begin_chunk_write_batch("domain-uow-backup");
    let operation = operation_id();
    for (index, write) in writes.iter().enumerate() {
        if !seen.insert(write.canonical_name.clone()) {
            continue;
        }
        let backup_name = if storage
            .chunk_exists(&write.canonical_name)
            .map_err(storage_error)?
        {
            let bytes = storage
                .read_chunk(&write.canonical_name)
                .map_err(storage_error)?;
            let name = domain_backup_chunk_name(vault_key, operation, index as u32);
            if let Err(error) = batch.write_chunk(name.clone(), &bytes) {
                batch.rollback_temps();
                return Err(internal_error(format!(
                    "Domain backup stage failed: {error}"
                )));
            }
            Some(name)
        } else {
            None
        };
        backups.push(DomainChunkBackup {
            canonical_name: write.canonical_name.clone(),
            backup_name,
        });
    }
    if let Err(error) = batch.commit() {
        let committed = batch.written_names().to_vec();
        batch.rollback_temps();
        for name in committed {
            let _ = storage.delete_chunk(&name);
        }
        return Err(internal_error(format!(
            "Domain backup commit failed: {error}"
        )));
    }
    Ok(backups)
}

pub(super) fn rollback_domain_chunks(
    storage: &Storage,
    payload: &DomainUnitOfWorkPayload,
) -> crate::error::Result<()> {
    for backup in &payload.backups {
        if let Some(backup_name) = &backup.backup_name {
            let bytes = storage.read_chunk(backup_name)?;
            storage.write_chunk_atomic(&backup.canonical_name, &bytes)?;
        } else {
            let _ = storage.delete_chunk(&backup.canonical_name);
        }
    }
    storage.sync()
}

pub(super) fn cleanup_domain_backups(storage: &Storage, payload: &DomainUnitOfWorkPayload) {
    for backup in &payload.backups {
        if let Some(backup_name) = &backup.backup_name {
            let _ = storage.delete_chunk(backup_name);
        }
    }
}

fn domain_backup_chunk_name(vault_key: &[u8; KEY_SIZE], operation_id: u128, index: u32) -> String {
    let context = format!("domain-uow-backup:{operation_id}:{index}");
    crate::crypto::chunk_name_u64(vault_key, context.as_bytes(), 0)
}
