use crate::catalog::ShardMeta;
use crate::error::{Error, ErrorCode};
use crate::rpc::types::CompactShardResponse;
use crate::storage::Storage;
use crate::vault::{Vault, VaultSession};

use super::types::{compact_shard_response, ShardCommandError};

pub(super) fn compact_shard(
    session: &mut VaultSession,
    storage: &Storage,
    shard_id: &str,
) -> Result<CompactShardResponse, ShardCommandError> {
    let vault_key = session.vault_key();

    let mut root_index = match Vault::read_root_index_from_storage(storage, vault_key) {
        Ok(Some(index)) => index,
        Ok(None) => {
            if shard_id == ".passmanager" {
                return Ok(compact_shard_response(session.catalog().version(), 0));
            }
            return Err(ShardCommandError::new(
                "Shard not found",
                ErrorCode::ShardNotFound,
            ));
        }
        Err(error) => return Err(ShardCommandError::internal(error.to_string())),
    };

    let meta = match root_index.get_shard_mut(shard_id) {
        Some(meta) => meta,
        None if shard_id == ".passmanager" => {
            root_index.upsert_shard(ShardMeta::passmanager());
            match root_index.get_shard_mut(shard_id) {
                Some(meta) => meta,
                None => {
                    return Err(ShardCommandError::new(
                        "Shard not found",
                        ErrorCode::ShardNotFound,
                    ))
                }
            }
        }
        None => return Err(ShardCommandError::shard_not_found(shard_id)),
    };

    if !meta.has_deltas {
        return Ok(compact_shard_response(meta.version, 0));
    }

    let (_updated_root_index, new_version, chunks_written) =
        Vault::compact_shard_with_commit(storage, vault_key, root_index, shard_id)
            .map_err(compact_error)?;

    let chunks_written = u32::try_from(chunks_written)
        .map_err(|error| ShardCommandError::internal(error.to_string()))?;
    Ok(compact_shard_response(new_version, chunks_written))
}

fn compact_error(error: Error) -> ShardCommandError {
    match error {
        Error::ChunkNotFound(_) => ShardCommandError::deltas_lost("Missing delta chunk"),
        Error::DecryptionFailed(_) => {
            ShardCommandError::deltas_lost("Failed to decrypt delta chunk")
        }
        Error::InvalidDataFormat(_) => ShardCommandError::deltas_lost("Invalid delta chunk"),
        error => ShardCommandError::internal(error.to_string()),
    }
}
