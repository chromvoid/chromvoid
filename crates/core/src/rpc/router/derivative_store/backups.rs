use crate::durable_tx::DurableTxStore;
use crate::error::{Error, Result};
use crate::rpc::derivative_index::{self, DerivativeIndexEntry};

use super::cleanup::cleanup_chunks;
use super::names::{
    backup_chunk_name, derivative_tx_id, entry_chunk_names, meta_chunk_name_for_cleanup,
    old_entry_tail_names,
};
use super::transaction::DerivativeWriteTxParticipant;
use super::types::{
    DerivativeBackupChunk, DerivativeStore, DerivativeWriteSnapshot, DerivativeWriteTxPayload,
};

impl DerivativeStore {
    pub(super) fn stage_overwrite_transaction(
        snapshot: &DerivativeWriteSnapshot,
        new_chunk_names: &[String],
        next_part_count: u32,
    ) -> Result<()> {
        let Some(old_entry) = derivative_index::get_derivative_entry(
            &snapshot.storage,
            &snapshot.vault_key,
            snapshot.node_id,
            snapshot.source_version,
            &snapshot.tier,
            snapshot.version,
        )?
        else {
            return Ok(());
        };

        let old_names = entry_chunk_names(&snapshot.vault_key, &old_entry);
        let tx_id = derivative_tx_id(snapshot);
        let mut backup_batch = snapshot
            .storage
            .begin_chunk_write_batch("catalog-derivative-overwrite-backup");
        let mut backup_chunks = Vec::with_capacity(old_names.len());
        for (index, original_name) in old_names.iter().enumerate() {
            let bytes = match snapshot.storage.read_chunk(original_name) {
                Ok(bytes) => bytes,
                Err(Error::ChunkNotFound(_)) => {
                    let _ = derivative_index::remove_derivative_entry(
                        &snapshot.storage,
                        &snapshot.vault_key,
                        old_entry.node_id,
                        old_entry.source_revision,
                        &old_entry.tier,
                        old_entry.storage_version,
                    );
                    backup_batch.rollback_temps();
                    return Ok(());
                }
                Err(error) => return Err(error),
            };
            let backup_name = backup_chunk_name(snapshot, &tx_id, index as u64);
            backup_batch.write_chunk(backup_name.clone(), &bytes)?;
            backup_chunks.push(DerivativeBackupChunk {
                original_name: original_name.clone(),
                backup_name,
            });
        }
        let backup_outcome = match backup_batch.commit() {
            Ok(outcome) => outcome,
            Err(error) => {
                cleanup_chunks(&snapshot.storage, backup_batch.written_names());
                backup_batch.rollback_temps();
                return Err(error);
            }
        };

        let stale_tail_names =
            old_entry_tail_names(&snapshot.vault_key, &old_entry, next_part_count);
        let payload = DerivativeWriteTxPayload {
            node_id: snapshot.node_id,
            source_revision: snapshot.source_version,
            tier: snapshot.tier.clone(),
            version: snapshot.version,
            old_entry: Some(old_entry),
            backup_chunks,
            new_chunk_names: new_chunk_names.to_vec(),
            new_meta_chunk_name: meta_chunk_name_for_cleanup(snapshot),
            stale_tail_names,
        };
        let store = DurableTxStore::new(
            &snapshot.storage,
            &snapshot.vault_key,
            DerivativeWriteTxParticipant,
        );
        if let Err(error) = store.write_staging(tx_id.clone(), &payload) {
            cleanup_chunks(&snapshot.storage, &backup_outcome.written_names);
            return Err(error);
        }
        if let Err(error) = store.write_committing(tx_id, &payload) {
            return Err(error);
        }
        Ok(())
    }

    pub(super) fn delete_stale_tail(
        snapshot: &DerivativeWriteSnapshot,
        existing_entry: Option<&DerivativeIndexEntry>,
        next_part_count: u32,
    ) {
        let Some(entry) = existing_entry else { return };
        for name in old_entry_tail_names(&snapshot.vault_key, entry, next_part_count) {
            let _ = snapshot.storage.delete_chunk(&name);
        }
    }
}
