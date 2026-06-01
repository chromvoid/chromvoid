use serde_json::Value;

use crate::error::ErrorCode;
use crate::rpc::types::{CompactShardResponse, SyncShardResponse};

#[derive(Debug)]
pub(super) struct ShardCommandError {
    message: String,
    code: ErrorCode,
}

impl ShardCommandError {
    pub(super) fn new(message: impl Into<String>, code: ErrorCode) -> Self {
        Self {
            message: message.into(),
            code,
        }
    }

    pub(super) fn internal(message: impl Into<String>) -> Self {
        Self::new(message, ErrorCode::InternalError)
    }

    pub(super) fn shard_not_found(shard_id: &str) -> Self {
        Self::new(
            format!("Shard not found: {}", shard_id),
            ErrorCode::ShardNotFound,
        )
    }

    pub(super) fn sync_shard_not_found(shard_id: &str) -> Self {
        Self::new(
            format!("Shard not found: {}", shard_id),
            ErrorCode::SyncShardNotFound,
        )
    }

    pub(super) fn deltas_lost(message: impl Into<String>) -> Self {
        Self::new(message, ErrorCode::DeltasLost)
    }

    pub(super) fn into_parts(self) -> (String, ErrorCode) {
        (self.message, self.code)
    }
}

pub(super) fn sync_shard_response(
    shard_id: &str,
    current_version: u64,
    deltas: Value,
    requires_full_load: bool,
) -> SyncShardResponse {
    SyncShardResponse {
        shard_id: shard_id.to_string(),
        current_version,
        deltas,
        requires_full_load,
    }
}

pub(super) fn sync_shard_requires_full_load(
    shard_id: &str,
    current_version: u64,
) -> SyncShardResponse {
    sync_shard_response(shard_id, current_version, Value::Array(vec![]), true)
}

pub(super) fn compact_shard_response(
    new_version: u64,
    chunks_written: u32,
) -> CompactShardResponse {
    CompactShardResponse {
        new_version,
        chunks_written,
    }
}
