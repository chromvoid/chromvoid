use crate::durable_tx::DurableTxStore;
use crate::error::Result;
use crate::rpc::derivative_index;
use crate::storage::Storage;
use crate::types::KEY_SIZE;

use super::cleanup::{
    cleanup_backup_chunks, cleanup_chunks, cleanup_new_chunks, cleanup_stale_tail_chunks,
};
use super::transaction::DerivativeWriteTxParticipant;
use super::types::{DerivativeStore, DerivativeWriteSnapshot, DerivativeWriteTxPayload};

impl DerivativeStore {
    pub(crate) fn recover_pending_overwrite(
        storage: &Storage,
        vault_key: &[u8; KEY_SIZE],
    ) -> Result<()> {
        DurableTxStore::new(storage, vault_key, DerivativeWriteTxParticipant).recover_participant()
    }
}

pub(super) fn abort_derivative_overwrite(snapshot: &DerivativeWriteSnapshot) -> bool {
    let store = DurableTxStore::new(
        &snapshot.storage,
        &snapshot.vault_key,
        DerivativeWriteTxParticipant,
    );
    let Ok(Some(record)) = store.read_participant_record() else {
        return false;
    };
    if recover_old_derivative(&snapshot.storage, &snapshot.vault_key, &record.payload).is_ok() {
        let _ = store.delete();
    }
    true
}

pub(super) fn finish_derivative_overwrite(snapshot: &DerivativeWriteSnapshot) {
    let store = DurableTxStore::new(
        &snapshot.storage,
        &snapshot.vault_key,
        DerivativeWriteTxParticipant,
    );
    let Ok(Some(record)) = store.read_participant_record() else {
        return;
    };
    cleanup_backup_chunks(&snapshot.storage, &record.payload);
    cleanup_stale_tail_chunks(&snapshot.storage, &record.payload);
    let _ = store.delete();
}

pub(super) fn recover_derivative_overwrite(
    storage: &Storage,
    vault_key: &[u8; KEY_SIZE],
    payload: &DerivativeWriteTxPayload,
) -> Result<()> {
    if derivative_entry_is_valid(storage, vault_key, payload)? {
        cleanup_backup_chunks(storage, payload);
        cleanup_stale_tail_chunks(storage, payload);
        return Ok(());
    }

    recover_old_derivative(storage, vault_key, payload)
}

fn recover_old_derivative(
    storage: &Storage,
    vault_key: &[u8; KEY_SIZE],
    payload: &DerivativeWriteTxPayload,
) -> Result<()> {
    let Some(old_entry) = payload.old_entry.clone() else {
        cleanup_new_chunks(storage, payload);
        cleanup_backup_chunks(storage, payload);
        let _ = derivative_index::remove_derivative_entry(
            storage,
            vault_key,
            payload.node_id,
            payload.source_revision,
            &payload.tier,
            payload.version,
        );
        return Ok(());
    };

    cleanup_new_chunks(storage, payload);
    let mut restore_batch = storage.begin_chunk_write_batch("catalog-derivative-overwrite-restore");
    for backup in &payload.backup_chunks {
        let bytes = match storage.read_chunk(&backup.backup_name) {
            Ok(bytes) => bytes,
            Err(_) => {
                cleanup_new_chunks(storage, payload);
                cleanup_backup_chunks(storage, payload);
                let _ = derivative_index::remove_derivative_entry(
                    storage,
                    vault_key,
                    payload.node_id,
                    payload.source_revision,
                    &payload.tier,
                    payload.version,
                );
                return Ok(());
            }
        };
        restore_batch.write_chunk(backup.original_name.clone(), &bytes)?;
    }
    if let Err(error) = restore_batch.commit() {
        cleanup_chunks(storage, restore_batch.written_names());
        restore_batch.rollback_temps();
        return Err(error);
    }

    cleanup_backup_chunks(storage, payload);
    derivative_index::put_derivative_entry(storage, vault_key, old_entry)?;
    Ok(())
}

fn derivative_entry_is_valid(
    storage: &Storage,
    vault_key: &[u8; KEY_SIZE],
    payload: &DerivativeWriteTxPayload,
) -> Result<bool> {
    Ok(DerivativeStore::read_validated(
        storage,
        vault_key,
        payload.node_id,
        payload.source_revision,
        &payload.tier,
        payload.version,
    )?
    .is_some())
}
