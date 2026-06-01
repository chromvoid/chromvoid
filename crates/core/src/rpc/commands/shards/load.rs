use serde_json::Value;

use crate::error::Error;
use crate::rpc::types::LoadShardResponse;
use crate::storage::Storage;
use crate::vault::{Vault, VaultSession};

use super::types::ShardCommandError;

pub(super) fn load_shard(
    session: &VaultSession,
    storage: &Storage,
    shard_id: &str,
) -> Result<LoadShardResponse, ShardCommandError> {
    let vault_key = session.vault_key();

    let index = Vault::read_root_index_from_storage(storage, vault_key)
        .ok()
        .flatten();

    let meta = index
        .as_ref()
        .and_then(|idx| idx.shards.get(shard_id))
        .cloned();

    if shard_id != ".passmanager" && index.is_some() && meta.is_none() {
        return Err(ShardCommandError::shard_not_found(shard_id));
    }

    match Vault::load_shard_from_storage(storage, vault_key, shard_id) {
        Ok(Some(shard)) => {
            let root = serde_json::to_value(&shard.root).map_err(|error| {
                ShardCommandError::internal(format!("Failed to serialize shard root: {}", error))
            })?;
            return Ok(LoadShardResponse {
                shard_id: shard_id.to_string(),
                version: shard.version,
                root,
            });
        }
        Ok(None) => {}
        Err(error) => return Err(load_error(error)),
    }

    if let Some(n) = session.catalog().root().find_child(shard_id) {
        let node = n.clone();
        let root = serde_json::to_value(&node).unwrap_or(Value::Null);
        return Ok(LoadShardResponse {
            shard_id: shard_id.to_string(),
            version: session.catalog().version(),
            root,
        });
    }

    if shard_id == ".passmanager" {
        let node = crate::catalog::CatalogNode::new_dir(1, ".passmanager".to_string());
        let root = serde_json::to_value(&node).unwrap_or(Value::Null);
        return Ok(LoadShardResponse {
            shard_id: shard_id.to_string(),
            version: 0,
            root,
        });
    }

    Err(ShardCommandError::shard_not_found(shard_id))
}

fn load_error(error: Error) -> ShardCommandError {
    match error {
        Error::ChunkNotFound(_) => ShardCommandError::deltas_lost("Missing delta chunk"),
        Error::DecryptionFailed(_) => {
            ShardCommandError::deltas_lost("Failed to decrypt delta chunk")
        }
        Error::InvalidDataFormat(_) => ShardCommandError::deltas_lost("Invalid delta chunk"),
        error => ShardCommandError::internal(error.to_string()),
    }
}
