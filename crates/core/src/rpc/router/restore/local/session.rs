//! `restore:local:start` and `restore:local:uploadPack` handlers.

use std::collections::HashSet;
use std::io::Read;

use crate::rpc::stream::read_exact_limited;
use crate::rpc::{RpcInputStream, RpcReply, RpcResponse, RpcRouter};

use super::super::super::backup_pack::BackupChunkManifest;
use super::super::super::session_lifecycle::{now_ms, ExpiringSessionMeta};
use super::super::error::{RestoreCommandError, RestoreResult};
use super::super::request::{required_str, required_value};
use super::super::tx::{
    write_restore_transaction, RestoreStorageArtifact, RestoreTransactionKind,
    RestoreTransactionPayload,
};
use super::super::RestoreLocalSession;
use super::cancel::rollback_restore_local;

/// Reject a restore unless storage holds no chunks and no salt, mirroring
/// `admin:restore`. This is the gate that prevents an unauthenticated caller
/// from writing chunks into — and thereby corrupting — an existing vault.
fn require_blank_storage_for_restore(router: &RpcRouter) -> RestoreResult<()> {
    let existing_chunks = router.storage.list_chunks().map_err(|error| {
        RestoreCommandError::internal(format!("Failed to check storage state: {error}"))
    })?;
    if !existing_chunks.is_empty() || router.storage.salt_exists() {
        return Err(RestoreCommandError::storage_not_blank());
    }
    Ok(())
}

pub(in crate::rpc::router::restore) fn handle_restore_local_start(
    router: &mut RpcRouter,
    data: &serde_json::Value,
) -> RpcResponse {
    match restore_local_start(router, data) {
        Ok(result) => RpcResponse::success(result),
        Err(error) => error.into_rpc_response(),
    }
}

fn restore_local_start(
    router: &mut RpcRouter,
    data: &serde_json::Value,
) -> RestoreResult<serde_json::Value> {
    let _backup_path = required_str(data, "backup_path")?;

    router
        .recover_before_restore_entry()
        .map_err(RestoreCommandError::from)?;

    // Restore writes attacker-controllable chunks straight into storage. Like
    // admin:restore, it must only run against blank storage so it can never
    // overwrite or corrupt an existing vault (H5). Recovery above first clears
    // any half-finished prior restore.
    require_blank_storage_for_restore(router)?;

    router.expire_restore_local_if_idle();
    if router.restore_local_is_active() {
        return Err(RestoreCommandError::backup_already_in_progress(
            "Restore already in progress",
        ));
    }

    let timestamp_ms = now_ms();

    let restore_id = format!("restore-{}", timestamp_ms);
    let marker = RestoreTransactionPayload::new(
        RestoreTransactionKind::Local,
        restore_id.clone(),
        Vec::<String>::new(),
        Vec::<RestoreStorageArtifact>::new(),
    );
    if let Err(error) = write_restore_transaction(
        &router.storage,
        crate::durable_tx::DurableTxPhase::Staging,
        &marker,
    ) {
        return Err(RestoreCommandError::failed_to_create_restore_transaction(
            error,
        ));
    }

    router.start_restore_local_session(RestoreLocalSession {
        id: restore_id.clone(),
        meta: ExpiringSessionMeta::new(timestamp_ms),
        received: HashSet::new(),
        chunk_names: HashSet::new(),
        total_chunks: None,
    });

    Ok(serde_json::json!({
        "restore_id": restore_id,
        "expected_chunks": 0,
    }))
}

pub(in crate::rpc::router::restore) fn handle_restore_local_upload_pack(
    router: &mut RpcRouter,
    data: &serde_json::Value,
    stream: Option<RpcInputStream>,
) -> RpcReply {
    match restore_local_upload_pack(router, data, stream) {
        Ok(result) => RpcReply::Json(RpcResponse::success(result)),
        Err(error) => RpcReply::Json(error.into_rpc_response()),
    }
}

fn restore_local_upload_pack(
    router: &mut RpcRouter,
    data: &serde_json::Value,
    stream: Option<RpcInputStream>,
) -> RestoreResult<serde_json::Value> {
    let restore_id = required_str(data, "restore_id")?;
    let manifest_value = required_value(data, "manifest")?;
    let manifest: BackupChunkManifest = serde_json::from_value(manifest_value.clone())
        .map_err(|_| RestoreCommandError::restore_invalid_format("Invalid chunks.manifest.json"))?;
    if let Err(error) = manifest.validate() {
        return Err(RestoreCommandError::restore_invalid_format(error));
    }

    router.expire_restore_local_if_idle();
    router
        .restore_local_session(restore_id)
        .map_err(RestoreCommandError::from)?;

    // Defense in depth: re-verify storage is still blank before writing any
    // attacker-supplied chunk, so a concurrently-created vault cannot be
    // clobbered between start and upload (H5).
    require_blank_storage_for_restore(router)?;

    let stream = match stream {
        Some(stream) => stream,
        None => return Err(RestoreCommandError::no_stream()),
    };

    let upload_started_at = std::time::Instant::now();
    let mut reader = stream.into_reader();
    let mut chunk_batch = router
        .storage
        .begin_chunk_write_batch("restore-local-upload-pack");

    for (index, chunk) in manifest.chunks.iter().enumerate() {
        let buffer = match read_exact_limited(
            &mut *reader,
            chunk.size,
            super::super::super::backup_pack::MAX_MANIFEST_CHUNK_BYTES,
        ) {
            Ok(buffer) => buffer,
            Err(error) => {
                chunk_batch.rollback_temps();
                return Err(RestoreCommandError::restore_invalid_format(format!(
                    "chunks.pack is truncated or oversized at chunk {index}: {error}"
                )));
            }
        };

        if let Err(error) = chunk_batch.write_chunk(chunk.name.clone(), &buffer) {
            chunk_batch.rollback_temps();
            return Err(RestoreCommandError::internal(format!(
                "Failed to write chunk: {error}"
            )));
        }
    }

    let mut extra = [0_u8; 1];
    match reader.read(&mut extra) {
        Ok(0) => {}
        Ok(_) => {
            chunk_batch.rollback_temps();
            return Err(RestoreCommandError::restore_invalid_format(
                "chunks.pack contains extra bytes",
            ));
        }
        Err(error) => {
            chunk_batch.rollback_temps();
            return Err(RestoreCommandError::internal(format!(
                "Failed to read chunks.pack: {error}"
            )));
        }
    }

    let batch_outcome = match chunk_batch.commit() {
        Ok(outcome) => outcome,
        Err(error) => {
            let committed = chunk_batch.written_names().iter().cloned().collect();
            rollback_restore_local(router, &committed);
            chunk_batch.rollback_temps();
            return Err(RestoreCommandError::internal(format!(
                "Failed to sync restored chunks: {error}"
            )));
        }
    };
    let written_names = batch_outcome
        .written_names
        .into_iter()
        .collect::<HashSet<_>>();

    if written_names.len() != manifest.chunks.len() {
        rollback_restore_local(router, &written_names);
        return Err(RestoreCommandError::internal(
            "chunks.pack commit wrote an unexpected number of chunks",
        ));
    }

    let marker_chunks = match router.restore_local_session_mut(restore_id) {
        Ok(session) => {
            session.received = (0..manifest.chunk_count).collect();
            session.chunk_names = written_names;
            session.total_chunks = Some(manifest.chunk_count);
            session.chunk_names.iter().cloned().collect::<Vec<_>>()
        }
        Err(error) => {
            rollback_restore_local(router, &written_names);
            return Err(RestoreCommandError::from(error));
        }
    };
    let marker = RestoreTransactionPayload::new(
        RestoreTransactionKind::Local,
        restore_id.to_string(),
        marker_chunks.iter().cloned(),
        Vec::<RestoreStorageArtifact>::new(),
    );
    if let Err(error) = write_restore_transaction(
        &router.storage,
        crate::durable_tx::DurableTxPhase::Staging,
        &marker,
    ) {
        let chunk_names = marker_chunks.into_iter().collect::<HashSet<_>>();
        rollback_restore_local(router, &chunk_names);
        return Err(RestoreCommandError::failed_to_update_restore_transaction(
            error,
        ));
    }
    router.touch_restore_local(restore_id);

    tracing::info!(
        restore_id = %restore_id,
        elapsed_ms = upload_started_at.elapsed().as_millis() as u64,
        pack_bytes = manifest.total_size,
        chunk_count = manifest.chunk_count,
        "restore_local_upload_pack_complete"
    );

    Ok(serde_json::json!({
        "received_chunks": manifest.chunk_count,
        "total_chunks": manifest.chunk_count,
    }))
}
