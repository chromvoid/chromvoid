//! Shard compaction with persistence

use crate::error::ErrorCode;
use crate::rpc::types::RpcResponse;
use crate::storage::Storage;
use crate::vault::{Vault, VaultSession};

pub(super) fn handle_catalog_shard_compact_persist(
    session: &mut VaultSession,
    storage: &Storage,
    shard_id: &str,
) -> RpcResponse {
    let vault_key = session.vault_key();

    // Load RootIndex to locate shard metadata + delta range.
    let root_name = crate::crypto::root_index_chunk_name(vault_key, 0);
    if storage.chunk_exists(&root_name).ok().unwrap_or(false) == false {
        // Back-compat for early/tests: allow compaction of the system shard even if RootIndex
        // isn't present yet (fresh vault, no prior save()).
        if shard_id == ".passmanager" {
            return RpcResponse::success(serde_json::json!({
                "new_version": session.catalog().version(),
                "chunks_written": 0,
            }));
        }
        return RpcResponse::error("Shard not found", Some(ErrorCode::ShardNotFound));
    }

    let root_enc = match storage.read_chunk(&root_name) {
        Ok(b) => b,
        Err(e) => return RpcResponse::error(e.to_string(), Some(ErrorCode::InternalError)),
    };
    let root_plain = match crate::crypto::decrypt(&root_enc, vault_key, root_name.as_bytes()) {
        Ok(p) => p,
        Err(e) => return RpcResponse::error(e.to_string(), Some(ErrorCode::InternalError)),
    };
    let mut root_index: crate::catalog::RootIndex = match serde_json::from_slice(&root_plain) {
        Ok(i) => i,
        Err(e) => return RpcResponse::error(e.to_string(), Some(ErrorCode::InternalError)),
    };

    let meta = match root_index.get_shard_mut(shard_id) {
        Some(m) => m,
        None if shard_id == ".passmanager" => {
            // Older snapshots might not have passmanager meta. Create it so compaction can
            // proceed and persist RootIndex in a consistent shape.
            root_index.upsert_shard(crate::catalog::ShardMeta::passmanager());
            match root_index.get_shard_mut(shard_id) {
                Some(m) => m,
                None => {
                    return RpcResponse::error(
                        "Shard not found".to_string(),
                        Some(ErrorCode::ShardNotFound),
                    )
                }
            }
        }
        None => {
            return RpcResponse::error(
                format!("Shard not found: {}", shard_id),
                Some(ErrorCode::ShardNotFound),
            )
        }
    };

    // Nothing to compact.
    if !meta.has_deltas {
        return RpcResponse::success(serde_json::json!({
            "new_version": meta.version,
            "chunks_written": 0,
        }));
    }

    let new_version = meta.version;
    if let Err(e) = Vault::compact_shard_in_storage(storage, vault_key, &mut root_index, shard_id) {
        // Map compact failures to the existing RPC shape.
        let (msg, code) = match e {
            crate::error::Error::ChunkNotFound(_) => {
                ("Missing delta chunk".to_string(), ErrorCode::DeltasLost)
            }
            crate::error::Error::DecryptionFailed(_) => (
                "Failed to decrypt delta chunk".to_string(),
                ErrorCode::DeltasLost,
            ),
            crate::error::Error::InvalidDataFormat(_) => {
                ("Invalid delta chunk".to_string(), ErrorCode::DeltasLost)
            }
            _ => (e.to_string(), ErrorCode::InternalError),
        };
        return RpcResponse::error(msg, Some(code));
    }

    // Persist RootIndex metadata.
    let root_out = match serde_json::to_vec(&root_index) {
        Ok(b) => b,
        Err(e) => return RpcResponse::error(e.to_string(), Some(ErrorCode::InternalError)),
    };
    let root_out_enc = match crate::crypto::encrypt(&root_out, vault_key, root_name.as_bytes()) {
        Ok(b) => b,
        Err(e) => return RpcResponse::error(e.to_string(), Some(ErrorCode::InternalError)),
    };
    if let Err(e) = storage.write_chunk(&root_name, &root_out_enc) {
        return RpcResponse::error(e.to_string(), Some(ErrorCode::InternalError));
    }

    RpcResponse::success(serde_json::json!({
        "new_version": new_version,
        "chunks_written": 1,
    }))
}
