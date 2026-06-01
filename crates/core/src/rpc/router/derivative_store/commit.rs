use crate::rpc::derivative_index;

use super::cleanup::{cleanup_chunks, cleanup_write_result};
use super::names::meta_chunk_name_for_cleanup;
use super::recovery::{abort_derivative_overwrite, finish_derivative_overwrite};
use super::types::{
    DerivativeCommitError, DerivativeStore, DerivativeStreamMetaRecord, DerivativeWriteResult,
    DerivativeWriteSnapshot,
};

impl DerivativeStore {
    pub(crate) fn commit_write(
        snapshot: &DerivativeWriteSnapshot,
        write_result: &DerivativeWriteResult,
    ) -> std::result::Result<(), DerivativeCommitError> {
        let meta_record = DerivativeStreamMetaRecord {
            name: snapshot.name.clone(),
            mime_type: snapshot.mime_type.clone(),
            size: snapshot.size,
            chunk_size: snapshot.chunk_size,
            file_extension: snapshot.file_extension.clone(),
        };
        let serialized_meta = serde_json::to_vec(&meta_record).map_err(|error| {
            if !abort_derivative_overwrite(snapshot) {
                cleanup_write_result(snapshot, write_result);
            }
            DerivativeCommitError {
                message: format!("Failed to serialize derivative metadata: {error}"),
            }
        })?;
        let meta_chunk_name = meta_chunk_name_for_cleanup(snapshot);
        let encrypted_meta = crate::crypto::encrypt(
            &serialized_meta,
            &snapshot.vault_key,
            meta_chunk_name.as_bytes(),
        )
        .map_err(|error| {
            if !abort_derivative_overwrite(snapshot) {
                cleanup_write_result(snapshot, write_result);
            }
            DerivativeCommitError {
                message: format!("Encryption failed: {error}"),
            }
        })?;

        let mut batch = snapshot
            .storage
            .begin_chunk_write_batch("catalog-derivative-meta");
        if let Err(error) = batch.write_chunk(meta_chunk_name.clone(), &encrypted_meta) {
            if !abort_derivative_overwrite(snapshot) {
                cleanup_write_result(snapshot, write_result);
            }
            return Err(DerivativeCommitError {
                message: format!("Storage write failed: {error}"),
            });
        }
        if let Err(error) = batch.commit() {
            let mut cleanup_names = write_result.chunk_names.clone();
            cleanup_names.extend(batch.written_names().iter().cloned());
            if !abort_derivative_overwrite(snapshot) {
                cleanup_chunks(&snapshot.storage, &cleanup_names);
            }
            batch.rollback_temps();
            return Err(DerivativeCommitError {
                message: format!("Storage write failed: {error}"),
            });
        }

        let previous_entry = derivative_index::get_derivative_entry(
            &snapshot.storage,
            &snapshot.vault_key,
            snapshot.node_id,
            snapshot.source_version,
            &snapshot.tier,
            snapshot.version,
        )
        .map_err(|error| {
            let mut cleanup_names = write_result.chunk_names.clone();
            cleanup_names.push(meta_chunk_name_for_cleanup(snapshot));
            if !abort_derivative_overwrite(snapshot) {
                cleanup_chunks(&snapshot.storage, &cleanup_names);
            }
            DerivativeCommitError {
                message: format!("Derivative index read failed: {error}"),
            }
        })?;

        if let Err(error) = derivative_index::save_derivative_entry(
            &snapshot.storage,
            &snapshot.vault_key,
            snapshot.node_id,
            snapshot.source_version,
            snapshot.tier.clone(),
            snapshot.version,
            meta_chunk_name,
            write_result.part_count,
            snapshot.size,
        ) {
            let mut cleanup_names = write_result.chunk_names.clone();
            cleanup_names.push(meta_chunk_name_for_cleanup(snapshot));
            if !abort_derivative_overwrite(snapshot) {
                cleanup_chunks(&snapshot.storage, &cleanup_names);
            }
            return Err(DerivativeCommitError {
                message: format!("Derivative index update failed: {error}"),
            });
        }

        Self::delete_stale_tail(snapshot, previous_entry.as_ref(), write_result.part_count);
        finish_derivative_overwrite(snapshot);
        Ok(())
    }
}
