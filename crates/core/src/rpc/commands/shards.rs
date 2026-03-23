//! Shard-related command handlers

use serde_json::Value;

use crate::error::ErrorCode;
use crate::vault::VaultSession;

use super::super::types::{
    CompactShardResponse, ListShardsResponse, LoadShardResponse, RpcResponse, ShardMetaResponse,
    SyncShardResponse,
};
use super::guards::{is_system_shard_id_guarded, system_shard_denied};

pub fn handle_catalog_shard_list_request(
    session: &VaultSession,
    _data: &Value,
    storage: &crate::storage::Storage,
) -> RpcResponse {
    fn strategy_str(s: crate::catalog::LoadStrategy) -> &'static str {
        match s {
            crate::catalog::LoadStrategy::Eager => "eager",
            crate::catalog::LoadStrategy::Lazy => "lazy",
            crate::catalog::LoadStrategy::Paginated => "prefetch",
        }
    }

    // ADR-003 / ADR-011: .passmanager is an eager shard critical for UX and must exist.
    // If RootIndex exists, reflect its metadata. Otherwise, synthesize minimal metadata.
    let root_version = session.catalog().version();
    let vault_key = session.vault_key();

    let mut shards: Vec<ShardMetaResponse> = Vec::new();

    let root_name = crate::crypto::root_index_chunk_name(vault_key, 0);
    if let Ok(true) = storage.chunk_exists(&root_name) {
        if let Ok(enc) = storage.read_chunk(&root_name) {
            if let Ok(plain) = crate::crypto::decrypt(&enc, vault_key, root_name.as_bytes()) {
                if let Ok(index) = serde_json::from_slice::<crate::catalog::RootIndex>(&plain) {
                    for meta in index.shards.values() {
                        shards.push(ShardMetaResponse {
                            shard_id: meta.shard_id.clone(),
                            version: meta.version,
                            size: meta.size,
                            node_count: meta.node_count,
                            strategy: strategy_str(meta.strategy).to_string(),
                            has_deltas: meta.has_deltas,
                            loaded: meta.strategy == crate::catalog::LoadStrategy::Eager,
                        });
                    }
                }
            }
        }
    }

    if !shards.iter().any(|s| s.shard_id == ".passmanager") {
        shards.push(ShardMetaResponse {
            shard_id: ".passmanager".to_string(),
            version: 0,
            size: 0,
            node_count: 0,
            strategy: "eager".to_string(),
            has_deltas: root_version > 0,
            loaded: true,
        });
    }

    // ADR-028: strip system shards from the external shard list.
    shards.retain(|s| !is_system_shard_id_guarded(&s.shard_id));

    // Deterministic ordering: lexicographic.
    shards.sort_by(|a, b| a.shard_id.cmp(&b.shard_id));

    RpcResponse::success(ListShardsResponse {
        root_version,
        shards,
    })
}

pub fn handle_catalog_shard_load_request(
    session: &VaultSession,
    data: &Value,
    storage: &crate::storage::Storage,
) -> RpcResponse {
    let shard_id = match data.get("shard_id").and_then(|v| v.as_str()) {
        Some(id) => id,
        None => return RpcResponse::error("shard_id is required", Some(ErrorCode::EmptyPayload)),
    };

    if is_system_shard_id_guarded(shard_id) {
        return system_shard_denied();
    }

    let vault_key = session.vault_key();

    // Try to load RootIndex to get shard meta and delta range.
    let root_name = crate::crypto::root_index_chunk_name(vault_key, 0);
    let index: Option<crate::catalog::RootIndex> =
        if let Ok(true) = storage.chunk_exists(&root_name) {
            if let Ok(enc) = storage.read_chunk(&root_name) {
                if let Ok(plain) = crate::crypto::decrypt(&enc, vault_key, root_name.as_bytes()) {
                    serde_json::from_slice::<crate::catalog::RootIndex>(&plain).ok()
                } else {
                    None
                }
            } else {
                None
            }
        } else {
            None
        };

    let meta = index
        .as_ref()
        .and_then(|idx| idx.shards.get(shard_id))
        .cloned();

    if shard_id != ".passmanager" {
        if index.is_some() && meta.is_none() {
            return RpcResponse::error(
                format!("Shard not found: {}", shard_id),
                Some(ErrorCode::ShardNotFound),
            );
        }
    }

    // Preferred: load persisted shard snapshot (index 0) and apply deltas if needed.
    let snap_name = crate::crypto::shard_chunk_name(vault_key, shard_id, 0);
    if let Ok(enc) = storage.read_chunk(&snap_name) {
        if let Ok(plain) = crate::crypto::decrypt(&enc, vault_key, snap_name.as_bytes()) {
            if let Ok(mut shard) = serde_json::from_slice::<crate::catalog::Shard>(&plain) {
                if let Some(meta) = meta.as_ref() {
                    if meta.has_deltas {
                        let from = meta.base_version.saturating_add(1);
                        let to = meta.last_delta_seq;
                        if from <= to {
                            let mut deltas: Vec<crate::catalog::DeltaEntry> = Vec::new();
                            for seq in from..=to {
                                let delta_name =
                                    crate::crypto::delta_chunk_name(vault_key, shard_id, seq);
                                let enc = match storage.read_chunk(&delta_name) {
                                    Ok(b) => b,
                                    Err(_) => {
                                        return RpcResponse::error(
                                            "Missing delta chunk".to_string(),
                                            Some(ErrorCode::DeltasLost),
                                        )
                                    }
                                };
                                let plain = match crate::crypto::decrypt(
                                    &enc,
                                    vault_key,
                                    delta_name.as_bytes(),
                                ) {
                                    Ok(b) => b,
                                    Err(_) => {
                                        return RpcResponse::error(
                                            "Failed to decrypt delta chunk".to_string(),
                                            Some(ErrorCode::DeltasLost),
                                        )
                                    }
                                };
                                let d = match serde_json::from_slice::<crate::catalog::DeltaEntry>(
                                    &plain,
                                ) {
                                    Ok(d) => d,
                                    Err(_) => {
                                        return RpcResponse::error(
                                            "Invalid delta chunk".to_string(),
                                            Some(ErrorCode::DeltasLost),
                                        )
                                    }
                                };
                                deltas.push(d);
                            }
                            crate::catalog::apply_deltas(&mut shard.root, &deltas);
                        }
                    }
                    shard.version = meta.version;
                    shard.base_version = meta.base_version;
                }

                let root = match serde_json::to_value(&shard.root) {
                    Ok(v) => v,
                    Err(e) => {
                        return RpcResponse::error(
                            format!("Failed to serialize shard root: {}", e),
                            Some(ErrorCode::InternalError),
                        )
                    }
                };
                return RpcResponse::success(LoadShardResponse {
                    shard_id: shard_id.to_string(),
                    version: shard.version,
                    root,
                });
            }
        }
    }

    // Fallback: derive from monolithic catalog state.
    // For .passmanager AND other shards: try live catalog data first.
    if let Some(n) = session.catalog().root().find_child(shard_id) {
        let node = n.clone();
        let root = serde_json::to_value(&node).unwrap_or(Value::Null);
        return RpcResponse::success(LoadShardResponse {
            shard_id: shard_id.to_string(),
            version: session.catalog().version(),
            root,
        });
    }

    // .passmanager must always exist (ADR-003 / ADR-011): synthesize an empty
    // directory when the catalog has no node yet (fresh vault).
    if shard_id == ".passmanager" {
        let node = crate::catalog::CatalogNode::new_dir(1, ".passmanager".to_string());
        let root = serde_json::to_value(&node).unwrap_or(Value::Null);
        return RpcResponse::success(LoadShardResponse {
            shard_id: shard_id.to_string(),
            version: 0,
            root,
        });
    }

    RpcResponse::error(
        format!("Shard not found: {}", shard_id),
        Some(ErrorCode::ShardNotFound),
    )
}

pub fn handle_catalog_shard_sync_request(
    session: &VaultSession,
    data: &Value,
    storage: &crate::storage::Storage,
) -> RpcResponse {
    let shard_id = match data.get("shard_id").and_then(|v| v.as_str()) {
        Some(id) => id,
        None => return RpcResponse::error("shard_id is required", Some(ErrorCode::EmptyPayload)),
    };

    if is_system_shard_id_guarded(shard_id) {
        return system_shard_denied();
    }

    let from_version = data
        .get("from_version")
        .and_then(|v| v.as_u64())
        .unwrap_or(0);

    // `.passmanager` remains the eager/system shard and uses the global catalog version.
    // Other shards use the persisted RootIndex shard version.
    let mut current_version = session.catalog().version();
    if shard_id != ".passmanager" {
        let root_name = crate::crypto::root_index_chunk_name(session.vault_key(), 0);
        let enc = match storage.read_chunk(&root_name) {
            Ok(b) => b,
            Err(_) => {
                return RpcResponse::error(
                    format!("Shard not found: {}", shard_id),
                    Some(ErrorCode::SyncShardNotFound),
                )
            }
        };
        let plain = match crate::crypto::decrypt(&enc, session.vault_key(), root_name.as_bytes()) {
            Ok(p) => p,
            Err(_) => {
                return RpcResponse::error(
                    format!("Shard not found: {}", shard_id),
                    Some(ErrorCode::SyncShardNotFound),
                )
            }
        };

        let index: crate::catalog::RootIndex = match serde_json::from_slice(&plain) {
            Ok(i) => i,
            Err(_) => {
                return RpcResponse::error(
                    format!("Shard not found: {}", shard_id),
                    Some(ErrorCode::SyncShardNotFound),
                )
            }
        };
        let meta = match index.get_shard(shard_id) {
            Some(m) => m,
            None => {
                return RpcResponse::error(
                    format!("Shard not found: {}", shard_id),
                    Some(ErrorCode::SyncShardNotFound),
                )
            }
        };
        current_version = meta.version;
        let base_version = meta.base_version;

        // If deltas were compacted away, require full load.
        if from_version < base_version {
            return RpcResponse::success(SyncShardResponse {
                shard_id: shard_id.to_string(),
                current_version,
                deltas: serde_json::Value::Array(vec![]),
                requires_full_load: true,
            });
        }
    }

    // ADR-011 semantics: from_version==current_version returns no deltas and must not require
    // full load.
    if from_version >= current_version {
        return RpcResponse::success(SyncShardResponse {
            shard_id: shard_id.to_string(),
            current_version,
            deltas: serde_json::Value::Array(vec![]),
            requires_full_load: false,
        });
    }

    // Best-effort delta loading from storage. If the delta range isn't fully available, fall back
    // to requiring a full load.
    let max = crate::catalog::MAX_DELTAS as u64;
    if current_version.saturating_sub(from_version) > max {
        return RpcResponse::success(SyncShardResponse {
            shard_id: shard_id.to_string(),
            current_version,
            deltas: serde_json::Value::Array(vec![]),
            requires_full_load: true,
        });
    }

    let mut deltas: Vec<serde_json::Value> = Vec::new();
    for seq in (from_version + 1)..=current_version {
        let delta_name = crate::crypto::delta_chunk_name(session.vault_key(), shard_id, seq);
        let encrypted = match storage.read_chunk(&delta_name) {
            Ok(b) => b,
            Err(_) => {
                return RpcResponse::success(SyncShardResponse {
                    shard_id: shard_id.to_string(),
                    current_version,
                    deltas: serde_json::Value::Array(vec![]),
                    requires_full_load: true,
                });
            }
        };

        let plaintext =
            match crate::crypto::decrypt(&encrypted, session.vault_key(), delta_name.as_bytes()) {
                Ok(p) => p,
                Err(_) => {
                    return RpcResponse::success(SyncShardResponse {
                        shard_id: shard_id.to_string(),
                        current_version,
                        deltas: serde_json::Value::Array(vec![]),
                        requires_full_load: true,
                    });
                }
            };

        let delta_value: serde_json::Value = match serde_json::from_slice(&plaintext) {
            Ok(v) => v,
            Err(_) => {
                return RpcResponse::success(SyncShardResponse {
                    shard_id: shard_id.to_string(),
                    current_version,
                    deltas: serde_json::Value::Array(vec![]),
                    requires_full_load: true,
                });
            }
        };

        deltas.push(delta_value);
    }

    RpcResponse::success(SyncShardResponse {
        shard_id: shard_id.to_string(),
        current_version,
        deltas: serde_json::Value::Array(deltas),
        requires_full_load: false,
    })
}

#[allow(dead_code)]
pub fn handle_catalog_shard_compact_request(_data: &Value) -> RpcResponse {
    // Return success for now - sharded catalog not yet integrated
    let response = CompactShardResponse {
        new_version: 0,
        chunks_written: 0,
    };
    RpcResponse::success(response)
}
