//! Shard-related command handlers.

mod compact;
mod load;
mod logging;
mod manifest;
mod sync;
mod types;

use serde_json::Value;

use crate::error::ErrorCode;
use crate::rpc::request_parse::{optional_u64, required_str};
use crate::rpc::types::RpcResponse;
use crate::storage::Storage;
use crate::vault::VaultSession;

use super::guards::{is_system_shard_id_guarded, system_shard_denied};
use types::ShardCommandError;

fn map_error(error: ShardCommandError) -> RpcResponse {
    let (message, code) = error.into_parts();
    RpcResponse::error(message, Some(code))
}

pub fn handle_catalog_sync_manifest_request(
    session: &VaultSession,
    _data: &Value,
    storage: &Storage,
) -> RpcResponse {
    let response = manifest::catalog_sync_manifest(session, storage);
    logging::log_manifest_payload(&response);
    RpcResponse::success(response)
}

pub fn handle_catalog_shard_list_request(
    session: &VaultSession,
    _data: &Value,
    storage: &Storage,
) -> RpcResponse {
    let response = manifest::catalog_shard_list(session, storage);
    logging::log_shard_list_payload(&response);
    RpcResponse::success(response)
}

pub fn handle_catalog_shard_load_request(
    session: &VaultSession,
    data: &Value,
    storage: &Storage,
) -> RpcResponse {
    let shard_id = match required_str(data, "shard_id") {
        Ok(id) => id,
        Err(response) => return response,
    };

    if is_system_shard_id_guarded(shard_id) {
        return system_shard_denied();
    }

    match load::load_shard(session, storage, shard_id) {
        Ok(response) => {
            logging::log_shard_load_payload(&response);
            RpcResponse::success(response)
        }
        Err(error) => map_error(error),
    }
}

pub fn handle_catalog_shard_sync_request(
    session: &VaultSession,
    data: &Value,
    storage: &Storage,
) -> RpcResponse {
    let shard_id = match required_str(data, "shard_id") {
        Ok(id) => id,
        Err(response) => return response,
    };

    if is_system_shard_id_guarded(shard_id) {
        return system_shard_denied();
    }

    let from_version = optional_u64(data, "from_version").unwrap_or(0);
    match sync::sync_shard(session, storage, shard_id, from_version) {
        Ok(response) => RpcResponse::success(response),
        Err(error) => map_error(error),
    }
}

pub fn handle_catalog_shard_compact_request(
    session: &mut VaultSession,
    data: &Value,
    storage: &Storage,
) -> RpcResponse {
    let shard_id = match data.get("shard_id").and_then(|value| value.as_str()) {
        Some(shard_id) if !shard_id.is_empty() => shard_id,
        _ => {
            return RpcResponse::error("shard_id is required", Some(ErrorCode::EmptyPayload));
        }
    };

    if is_system_shard_id_guarded(shard_id) {
        return system_shard_denied();
    }

    compact::compact_shard(session, storage, shard_id)
        .map(RpcResponse::success)
        .unwrap_or_else(map_error)
}
