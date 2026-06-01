use super::cleanup::cleanup_chunks;
use super::names::derivative_chunk_name;
use super::recovery::abort_derivative_overwrite;
use super::types::{
    DerivativeStore, DerivativeWriteError, DerivativeWriteResult, DerivativeWriteSnapshot,
};

impl DerivativeStore {
    pub(crate) fn write_chunks<F>(
        snapshot: &DerivativeWriteSnapshot,
        content: &[u8],
        is_cancelled: F,
    ) -> std::result::Result<DerivativeWriteResult, DerivativeWriteError>
    where
        F: Fn() -> bool,
    {
        if content.len() as u64 != snapshot.size {
            return Err(derivative_write_error("Size mismatch", false));
        }

        let mut batch = snapshot
            .storage
            .begin_chunk_write_batch("catalog-derivative-write");
        let mut chunk_names = Vec::new();
        let mut pos = 0usize;
        let mut part_index = 0u32;
        while pos < content.len() {
            if is_cancelled() {
                batch.rollback_temps();
                return Err(derivative_write_error("Derivative write cancelled", true));
            }
            let end = std::cmp::min(pos + snapshot.chunk_size as usize, content.len());
            let chunk_name = derivative_chunk_name(snapshot, part_index);
            let encrypted = crate::crypto::encrypt(
                &content[pos..end],
                &snapshot.vault_key,
                chunk_name.as_bytes(),
            )
            .map_err(|error| {
                derivative_write_error(format!("Encryption failed: {error}"), false)
            })?;
            if let Err(error) = batch.write_chunk(chunk_name.clone(), &encrypted) {
                batch.rollback_temps();
                return Err(derivative_write_error(
                    format!("Storage write failed: {error}"),
                    false,
                ));
            }
            chunk_names.push(chunk_name);
            pos = end;
            part_index = part_index.saturating_add(1);
        }

        if is_cancelled() {
            batch.rollback_temps();
            return Err(derivative_write_error("Derivative write cancelled", true));
        }

        if let Err(error) = Self::stage_overwrite_transaction(snapshot, &chunk_names, part_index) {
            batch.rollback_temps();
            return Err(derivative_write_error(
                format!("Derivative backup failed: {error}"),
                false,
            ));
        }

        let outcome = match batch.commit() {
            Ok(outcome) => outcome,
            Err(error) => {
                if !abort_derivative_overwrite(snapshot) {
                    cleanup_chunks(&snapshot.storage, batch.written_names());
                }
                batch.rollback_temps();
                return Err(derivative_write_error(
                    format!("Storage write failed: {error}"),
                    false,
                ));
            }
        };

        if is_cancelled() {
            if !abort_derivative_overwrite(snapshot) {
                cleanup_chunks(&snapshot.storage, &outcome.written_names);
            }
            return Err(derivative_write_error("Derivative write cancelled", true));
        }

        Ok(DerivativeWriteResult {
            part_count: part_index,
            chunk_names: outcome.written_names,
        })
    }
}

fn derivative_write_error(message: impl Into<String>, cancelled: bool) -> DerivativeWriteError {
    DerivativeWriteError {
        message: message.into(),
        cancelled,
    }
}
