//! Shared restore material publishing helpers.

use crate::rpc::RpcRouter;

use super::error::{RestoreCommandError, RestoreResult};
use super::tx::{write_restore_transaction, RestoreStorageArtifact, RestoreTransactionPayload};

pub(super) struct RestoreChunkWrite {
    pub(super) name: String,
    pub(super) bytes: Vec<u8>,
}

pub(super) struct RestoreArtifactWrite {
    pub(super) artifact: RestoreStorageArtifact,
    pub(super) bytes: Vec<u8>,
    pub(super) error_label: &'static str,
}

pub(super) fn apply_restore_materials(
    router: &mut RpcRouter,
    restore_tx: &mut RestoreTransactionPayload,
    chunks: Vec<RestoreChunkWrite>,
    artifacts: Vec<RestoreArtifactWrite>,
    storage_pepper: [u8; 32],
    batch_hint: &str,
) -> RestoreResult<u64> {
    let written_chunk_names = write_restore_chunks(router, chunks, batch_hint)?;
    let written_artifacts = write_restore_artifacts(router, artifacts, &written_chunk_names)?;

    if let Err(error) = store_restore_pepper(router, storage_pepper) {
        rollback_written_restore_materials(router, &written_chunk_names, &written_artifacts);
        return Err(error);
    }

    if let Err(error) = mark_restore_pepper_committed(router, restore_tx) {
        rollback_written_restore_materials(router, &written_chunk_names, &written_artifacts);
        if let Some(keystore) = router.keystore.as_ref() {
            let _ = crate::crypto::StoragePepper::delete(keystore.as_ref());
        }
        return Err(error);
    }

    Ok(written_chunk_names.len() as u64)
}

fn write_restore_chunks(
    router: &RpcRouter,
    chunks: Vec<RestoreChunkWrite>,
    batch_hint: &str,
) -> RestoreResult<Vec<String>> {
    if chunks.is_empty() {
        return Ok(Vec::new());
    }

    let mut chunk_batch = router.storage.begin_chunk_write_batch(batch_hint);
    for chunk in chunks {
        if let Err(error) = chunk_batch.write_chunk(chunk.name.clone(), &chunk.bytes) {
            chunk_batch.rollback_temps();
            return Err(RestoreCommandError::internal(format!(
                "Failed to write chunk {}: {}",
                chunk.name, error
            )));
        }
    }

    match chunk_batch.commit() {
        Ok(outcome) => Ok(outcome.written_names),
        Err(error) => {
            let committed = chunk_batch.written_names().to_vec();
            chunk_batch.rollback_temps();
            for name in &committed {
                let _ = router.storage.delete_chunk(name);
            }
            Err(RestoreCommandError::internal(format!(
                "Failed to sync restored chunks: {error}"
            )))
        }
    }
}

fn write_restore_artifacts(
    router: &RpcRouter,
    artifacts: Vec<RestoreArtifactWrite>,
    written_chunk_names: &[String],
) -> RestoreResult<Vec<RestoreStorageArtifact>> {
    let mut written_artifacts = Vec::new();
    for artifact in artifacts {
        if let Err(error) = router
            .storage
            .write_artifact_durable(artifact.artifact.storage_artifact(), &artifact.bytes)
        {
            if error.committed {
                written_artifacts.push(artifact.artifact);
            }
            rollback_written_restore_materials(router, written_chunk_names, &written_artifacts);
            return Err(RestoreCommandError::internal(format!(
                "Failed to restore {}: {}",
                artifact.error_label, error.error
            )));
        }
        written_artifacts.push(artifact.artifact);
    }
    Ok(written_artifacts)
}

fn store_restore_pepper(router: &RpcRouter, storage_pepper: [u8; 32]) -> RestoreResult<()> {
    let keystore = match router.keystore.as_ref() {
        Some(keystore) => keystore.as_ref(),
        None => {
            return Err(RestoreCommandError::keystore_unavailable(
                "Keystore not available",
            ));
        }
    };
    crate::crypto::StoragePepper::store(keystore, storage_pepper).map_err(|error| {
        RestoreCommandError::keystore_unavailable(format!("Failed to store pepper: {}", error))
    })
}

fn mark_restore_pepper_committed(
    router: &RpcRouter,
    restore_tx: &mut RestoreTransactionPayload,
) -> RestoreResult<()> {
    restore_tx.mark_pepper_committed();
    write_restore_transaction(
        &router.storage,
        crate::durable_tx::DurableTxPhase::Committing,
        restore_tx,
    )
    .map_err(RestoreCommandError::failed_to_update_restore_transaction)
}

fn rollback_written_restore_materials(
    router: &RpcRouter,
    chunk_names: &[String],
    artifacts: &[RestoreStorageArtifact],
) {
    for name in chunk_names {
        let _ = router.storage.delete_chunk(name);
    }
    for artifact in artifacts {
        let _ = router.storage.remove_artifact(artifact.storage_artifact());
    }
}
