use std::io;
use std::time::Instant;

mod catalog_update;
mod context;
mod error;
mod perf;
mod request;
mod target;
mod tx;
mod writer;

use crate::durable_tx::DurableTxPhase;
use crate::rpc::stream::{
    read_stream_exact_limited, RpcInputStream, RpcReply, MAX_SINGLE_RPC_STREAM_BYTES,
};
use crate::rpc::types::{RpcResponse, UploadResponse};

use super::super::super::state::RpcRouter;
use super::common::{current_timestamp_ms, next_source_revision};
use catalog_update::apply_upload_catalog_update;
use context::{require_session, UploadVaultContext};
use error::{UploadCommandError, UploadResult};
use perf::{log_upload_perf, UploadPerfTotals};
use request::UploadRequest;
use target::{
    begin_existing_upload_transaction, begin_new_upload_transaction, resolve_upload_target,
    UploadTarget,
};
pub(in crate::rpc::router) use tx::recover_pending_upload_session;
use tx::{
    abort_pending_upload_session, cleanup_upload_marker, write_upload_marker,
    UploadSessionTransaction,
};

pub(in crate::rpc::router) fn handle_abort_upload(router: &mut RpcRouter) -> RpcResponse {
    match abort_pending_upload_session(router) {
        Ok(aborted) => RpcResponse::success(serde_json::json!({ "aborted": aborted })),
        Err(error) => error.into_rpc_response(),
    }
}
use writer::{
    backup_existing_chunks, chunk_count, restore_upload_payload, stale_tail_chunk_names,
    write_canonical_upload_chunks, write_upload_content,
};

pub(in crate::rpc::router::catalog_streams) fn handle_upload(
    router: &mut RpcRouter,
    data: &serde_json::Value,
    stream: Option<RpcInputStream>,
) -> RpcReply {
    match handle_upload_result(router, data, stream) {
        Ok(response) => RpcReply::Json(RpcResponse::success(response)),
        Err(error) => RpcReply::Json(error.into_rpc_response()),
    }
}

fn handle_upload_result(
    router: &mut RpcRouter,
    data: &serde_json::Value,
    stream: Option<RpcInputStream>,
) -> UploadResult<UploadResponse> {
    let handler_started = Instant::now();
    let context = UploadVaultContext::require(router)?;

    let request = UploadRequest::parse(data)?;

    let target = resolve_upload_target(router, &context, &request)?;

    let stream = match stream {
        Some(stream) => stream,
        None => return Err(UploadCommandError::no_stream()),
    };

    let read_started = Instant::now();
    let content = read_stream_exact_limited(stream, request.size, MAX_SINGLE_RPC_STREAM_BYTES)
        .map_err(|error| match error.kind() {
            io::ErrorKind::UnexpectedEof | io::ErrorKind::InvalidData => {
                UploadCommandError::internal("Size mismatch")
            }
            _ => UploadCommandError::internal(format!("Failed to read stream: {error}")),
        })?;
    let stream_read_elapsed = read_started.elapsed();
    let mut transaction = match target {
        UploadTarget::Pending(transaction) => transaction,
        UploadTarget::Existing {
            node_id,
            total_size,
            mime_type,
        } => begin_existing_upload_transaction(router, &context, node_id, total_size, mime_type)?,
        UploadTarget::New {
            node_id,
            parent_path,
            name,
            total_size,
            mime_type,
            chunk_size,
        } => begin_new_upload_transaction(
            router,
            &context,
            node_id,
            parent_path,
            name,
            total_size,
            mime_type,
            chunk_size,
        )?,
    };

    let result = (|| -> UploadResult<UploadResponse> {
        if request.offset != transaction.uploaded_bytes {
            return Err(UploadCommandError::invalid_offset("Invalid offset"));
        }
        if request.finish && transaction.total_size.is_none() {
            transaction.total_size = Some(request.offset.saturating_add(request.size));
        }
        if let Some(total_size) = transaction.total_size {
            if request.offset.saturating_add(request.size) > total_size {
                return Err(UploadCommandError::invalid_offset(
                    "Size exceeds declared file size",
                ));
            }
        }

        let mut perf = UploadPerfTotals::default();
        if !content.is_empty() {
            write_upload_content(
                router,
                &context,
                &mut transaction,
                &content,
                request.offset,
                &mut perf,
            )?;
        }
        transaction.uploaded_bytes = request.offset.saturating_add(request.size);
        if request.finish && transaction.total_size.is_none() {
            transaction.total_size = Some(transaction.uploaded_bytes);
        }

        write_upload_marker(router, &context, &transaction, DurableTxPhase::Staging)?;

        let is_final = transaction
            .total_size
            .map(|total_size| transaction.uploaded_bytes >= total_size)
            .unwrap_or(false);
        if is_final {
            let final_update_started = Instant::now();
            let node_id = transaction.node_id;
            let uploaded_bytes = transaction.uploaded_bytes;
            commit_upload_transaction(router, &context, transaction.clone())?;
            perf.final_update_elapsed = final_update_started.elapsed();
            log_upload_perf(
                handler_started.elapsed(),
                stream_read_elapsed,
                &perf,
                node_id,
                request.offset,
                request.size,
                uploaded_bytes,
                true,
                None,
            );
            return Ok(UploadResponse {
                node_id,
                uploaded_bytes,
            });
        }

        log_upload_perf(
            handler_started.elapsed(),
            stream_read_elapsed,
            &perf,
            transaction.node_id,
            request.offset,
            request.size,
            transaction.uploaded_bytes,
            false,
            transaction.total_size,
        );
        return Ok(UploadResponse {
            node_id: transaction.node_id,
            uploaded_bytes: transaction.uploaded_bytes,
        });
    })();

    if result.is_err() {
        if let Err(cleanup_error) = cleanup_upload_marker(router, &context, &transaction, false) {
            tracing::warn!(
                "catalog_upload: failed to abort upload transaction after error: {:?}",
                cleanup_error
            );
        }
    }

    result
}

fn commit_upload_transaction(
    router: &mut RpcRouter,
    context: &UploadVaultContext,
    mut transaction: UploadSessionTransaction,
) -> UploadResult<()> {
    let total_size = transaction
        .total_size
        .ok_or_else(|| UploadCommandError::empty_payload("total_size"))?;
    let vault_key = *context.vault_key();
    let node_id32: u32 = transaction
        .node_id
        .try_into()
        .map_err(|_| UploadCommandError::internal("Invalid node_id"))?;
    let old_count = transaction
        .old_size
        .map(|old_size| chunk_count(old_size, transaction.chunk_size as u64))
        .transpose()?
        .unwrap_or(0);
    let new_count = chunk_count(total_size, transaction.chunk_size as u64)?;
    transaction.backups =
        backup_existing_chunks(&router.storage, &vault_key, node_id32, old_count)?;
    transaction.stale_tail_names =
        stale_tail_chunk_names(&vault_key, node_id32, old_count, new_count);
    let now = current_timestamp_ms();
    transaction.new_modtime = Some(now);
    transaction.new_source_revision = Some(next_source_revision(
        transaction.old_source_revision.unwrap_or(0),
        now,
    ));
    write_upload_marker(router, context, &transaction, DurableTxPhase::Committing)?;
    write_canonical_upload_chunks(&router.storage, &vault_key, &transaction, total_size)?;

    let snapshot = {
        let session = require_session(router)?;
        session.snapshot_persistence_state()
    };
    if let Err(error) = apply_upload_catalog_update(router, &transaction, total_size) {
        let _ = restore_upload_payload(&router.storage, &transaction);
        if let Some(session) = router.session.as_mut() {
            session.restore_persistence_state(snapshot.0, snapshot.1, snapshot.2);
        }
        let _ = cleanup_upload_marker(router, context, &transaction, false);
        return Err(error);
    }
    if let Err(error) = router.save() {
        let _ = restore_upload_payload(&router.storage, &transaction);
        if let Some(session) = router.session.as_mut() {
            session.restore_persistence_state(snapshot.0, snapshot.1, snapshot.2);
        }
        return Err(UploadCommandError::internal(format!(
            "Catalog save failed: {error}"
        )));
    }
    cleanup_upload_marker(router, context, &transaction, true)?;
    Ok(())
}
