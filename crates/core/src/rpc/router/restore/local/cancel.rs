//! `restore:local:cancel` handler + the shared rollback primitive.

use std::collections::HashSet;

use crate::rpc::request_parse::optional_str;
use crate::rpc::{RpcResponse, RpcRouter};

use super::super::error::{RestoreCommandError, RestoreResult};
use super::super::tx::{delete_restore_transaction, rollback_restore_transaction_marker};

pub(in crate::rpc::router::restore) fn handle_restore_local_cancel(
    router: &mut RpcRouter,
    data: &serde_json::Value,
) -> RpcResponse {
    match restore_local_cancel(router, data) {
        Ok(result) => RpcResponse::success(result),
        Err(error) => error.into_rpc_response(),
    }
}

fn restore_local_cancel(
    router: &mut RpcRouter,
    data: &serde_json::Value,
) -> RestoreResult<serde_json::Value> {
    let requested = optional_str(data, "restore_id");

    router.expire_restore_local_if_idle();
    let (active_id, chunk_names) = router
        .restore_local_rollback_state(requested)
        .map_err(RestoreCommandError::from)?;

    let deleted_chunks = chunk_names.len() as u64;
    rollback_restore_local(router, &chunk_names);

    Ok(serde_json::json!({
        "restore_id": active_id,
        "cancelled": true,
        "deleted_chunks": deleted_chunks,
    }))
}

pub(in crate::rpc::router) fn rollback_restore_local(
    router: &mut RpcRouter,
    chunk_names: &HashSet<String>,
) {
    let _ = rollback_restore_transaction_marker(router);
    for chunk_name in chunk_names {
        let _ = router.storage.delete_chunk(chunk_name);
    }

    let _ = router
        .storage
        .remove_artifact(crate::storage::StorageArtifact::Salt);
    let _ = router
        .storage
        .remove_artifact(crate::storage::StorageArtifact::FormatVersion);
    let _ = router
        .storage
        .remove_artifact(crate::storage::StorageArtifact::MasterSalt);
    let _ = router
        .storage
        .remove_artifact(crate::storage::StorageArtifact::MasterVerify);
    let _ = delete_restore_transaction(&router.storage);

    if let Some(keystore) = router.keystore.as_ref() {
        let _ = crate::crypto::StoragePepper::delete(keystore.as_ref());
    }

    router.clear_restore_local_session();
}
