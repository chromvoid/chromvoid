use crate::storage::Storage;

use super::recovery::abort_derivative_overwrite;
use super::types::{DerivativeWriteResult, DerivativeWriteSnapshot, DerivativeWriteTxPayload};

pub fn cleanup_catalog_derivative_write_result(
    snapshot: &DerivativeWriteSnapshot,
    write_result: &DerivativeWriteResult,
) {
    if !abort_derivative_overwrite(snapshot) {
        cleanup_write_result(snapshot, write_result);
    }
}

pub(super) fn cleanup_write_result(
    snapshot: &DerivativeWriteSnapshot,
    write_result: &DerivativeWriteResult,
) {
    cleanup_chunks(&snapshot.storage, &write_result.chunk_names);
}

pub(super) fn cleanup_chunks(storage: &Storage, chunk_names: &[String]) {
    for chunk_name in chunk_names {
        let _ = storage.delete_chunk(chunk_name);
    }
}

pub(super) fn cleanup_backup_chunks(storage: &Storage, payload: &DerivativeWriteTxPayload) {
    for backup in &payload.backup_chunks {
        let _ = storage.delete_chunk(&backup.backup_name);
    }
}

pub(super) fn cleanup_stale_tail_chunks(storage: &Storage, payload: &DerivativeWriteTxPayload) {
    for name in &payload.stale_tail_names {
        let _ = storage.delete_chunk(name);
    }
}

pub(super) fn cleanup_new_chunks(storage: &Storage, payload: &DerivativeWriteTxPayload) {
    cleanup_chunks(storage, &payload.new_chunk_names);
    let _ = storage.delete_chunk(&payload.new_meta_chunk_name);
}
