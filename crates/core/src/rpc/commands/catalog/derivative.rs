//! `catalog:derivative:stats` and `catalog:derivative:compact` handlers.

use std::collections::HashMap;

use serde_json::Value;

use crate::error::ErrorCode;
use crate::rpc::derivative_index::DerivativeIndexState;
use crate::vault::VaultSession;

use super::super::super::types::{
    DerivativeProtectedRevision, DerivativeStatsResponse, RpcResponse,
};

pub(in crate::rpc::commands::catalog) fn derivative_index_error(
    error: crate::error::Error,
) -> RpcResponse {
    RpcResponse::error(
        format!("Derivative index update failed: {error}"),
        Some(ErrorCode::InternalError),
    )
}

/// Handle catalog:derivative:stats command.
pub(in crate::rpc) fn handle_catalog_derivative_stats(
    session: &VaultSession,
    storage: &crate::storage::Storage,
    derivative_index_state: &DerivativeIndexState,
) -> RpcResponse {
    match derivative_index_state.stats(storage, session.vault_key()) {
        Ok(stats) => RpcResponse::success(DerivativeStatsResponse {
            indexed_count: stats.indexed_count,
            indexed_bytes: stats.indexed_bytes,
        }),
        Err(error) => derivative_index_error(error),
    }
}

fn parse_protected_revisions(data: &Value) -> std::result::Result<HashMap<u64, u64>, RpcResponse> {
    let protected_revisions = data
        .get("protected_revisions")
        .cloned()
        .unwrap_or_else(|| Value::Array(Vec::new()));
    let protected_revisions: Vec<DerivativeProtectedRevision> =
        serde_json::from_value(protected_revisions).map_err(|error| {
            RpcResponse::error(
                format!("Invalid protected_revisions: {error}"),
                Some(ErrorCode::EmptyPayload),
            )
        })?;

    Ok(protected_revisions
        .into_iter()
        .map(|revision| (revision.node_id, revision.source_revision))
        .collect())
}

/// Handle catalog:derivative:compact command.
pub(in crate::rpc) fn handle_catalog_derivative_compact(
    session: &VaultSession,
    data: &Value,
    storage: &crate::storage::Storage,
    derivative_index_state: &DerivativeIndexState,
) -> RpcResponse {
    let max_indexed_bytes = match data
        .get("max_indexed_bytes")
        .and_then(|value| value.as_u64())
    {
        Some(max_indexed_bytes) => max_indexed_bytes,
        None => {
            return RpcResponse::error(
                "max_indexed_bytes is required",
                Some(ErrorCode::EmptyPayload),
            )
        }
    };
    let protected_revisions = match parse_protected_revisions(data) {
        Ok(protected_revisions) => protected_revisions,
        Err(response) => return response,
    };

    match derivative_index_state.compact_derivatives(
        storage,
        session.vault_key(),
        max_indexed_bytes,
        &protected_revisions,
    ) {
        Ok(stats) => RpcResponse::success(DerivativeStatsResponse {
            indexed_count: stats.indexed_count,
            indexed_bytes: stats.indexed_bytes,
        }),
        Err(error) => derivative_index_error(error),
    }
}
