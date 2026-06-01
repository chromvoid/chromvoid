use serde_json::Value;

use crate::catalog::MAX_DELTAS;
use crate::rpc::types::SyncShardResponse;
use crate::storage::Storage;
use crate::vault::{Vault, VaultSession};

use super::types::{sync_shard_requires_full_load, sync_shard_response, ShardCommandError};

pub(super) fn sync_shard(
    session: &VaultSession,
    storage: &Storage,
    shard_id: &str,
    from_version: u64,
) -> Result<SyncShardResponse, ShardCommandError> {
    let vault_key = session.vault_key();
    let mut current_version = session.catalog().version();

    if shard_id != ".passmanager" {
        let index = match Vault::read_root_index_from_storage(storage, vault_key) {
            Ok(Some(index)) => index,
            _ => return Err(ShardCommandError::sync_shard_not_found(shard_id)),
        };
        let meta = match index.get_shard(shard_id) {
            Some(meta) => meta,
            None => return Err(ShardCommandError::sync_shard_not_found(shard_id)),
        };
        current_version = meta.version;
        let base_version = meta.base_version;

        if from_version < base_version {
            return Ok(sync_shard_requires_full_load(shard_id, current_version));
        }
    }

    if from_version >= current_version {
        return Ok(sync_shard_response(
            shard_id,
            current_version,
            Value::Array(vec![]),
            false,
        ));
    }

    let max = MAX_DELTAS as u64;
    if current_version.saturating_sub(from_version) > max {
        return Ok(sync_shard_requires_full_load(shard_id, current_version));
    }

    let mut deltas: Vec<Value> = Vec::new();
    for seq in (from_version + 1)..=current_version {
        let delta_name = crate::crypto::delta_chunk_name(vault_key, shard_id, seq);
        let encrypted = match storage.read_chunk(&delta_name) {
            Ok(bytes) => bytes,
            Err(_) => return Ok(sync_shard_requires_full_load(shard_id, current_version)),
        };

        let plaintext = match crate::crypto::decrypt(&encrypted, vault_key, delta_name.as_bytes()) {
            Ok(plaintext) => plaintext,
            Err(_) => return Ok(sync_shard_requires_full_load(shard_id, current_version)),
        };

        let delta_value: Value = match serde_json::from_slice(&plaintext) {
            Ok(value) => value,
            Err(_) => return Ok(sync_shard_requires_full_load(shard_id, current_version)),
        };

        deltas.push(delta_value);
    }

    Ok(sync_shard_response(
        shard_id,
        current_version,
        Value::Array(deltas),
        false,
    ))
}
