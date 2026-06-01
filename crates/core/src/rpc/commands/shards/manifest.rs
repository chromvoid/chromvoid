use serde_json::Value;

use crate::catalog::{CatalogNode, LoadStrategy};
use crate::rpc::types::{
    CatalogSyncManifestResponse, ListShardsResponse, ShardMetaResponse,
    CATALOG_MANIFEST_BUDGET_BYTES,
};
use crate::storage::Storage;
use crate::vault::{Vault, VaultSession};

use super::super::guards::is_system_shard_id_guarded;

fn strategy_str(s: LoadStrategy) -> &'static str {
    match s {
        LoadStrategy::Eager => "eager",
        LoadStrategy::Lazy => "lazy",
        LoadStrategy::Paginated => "prefetch",
    }
}

fn shard_meta_response(meta: &crate::catalog::ShardMeta) -> ShardMetaResponse {
    ShardMetaResponse {
        shard_id: meta.shard_id.clone(),
        version: meta.version,
        size: meta.size,
        node_count: meta.node_count,
        strategy: strategy_str(meta.strategy).to_string(),
        has_deltas: meta.has_deltas,
        loaded: meta.strategy == LoadStrategy::Eager,
    }
}

fn compact_summary_from_node(node: &CatalogNode) -> Value {
    let mut value = serde_json::to_value(node).unwrap_or(Value::Null);
    if let Some(object) = value.as_object_mut() {
        object.remove("c");
        if node.is_dir() {
            object.insert("h".to_string(), Value::Bool(!node.children().is_empty()));
        }
    }
    value
}

pub(super) fn catalog_sync_manifest(
    session: &VaultSession,
    storage: &Storage,
) -> CatalogSyncManifestResponse {
    let vault_key = session.vault_key();
    let mut root_version = session.catalog().version();
    let mut shards: Vec<ShardMetaResponse> = Vec::new();
    let mut eager_data = serde_json::Map::new();

    if let Ok(Some(index)) = Vault::read_root_index_from_storage(storage, vault_key) {
        root_version = index.root_version;
        for meta in index.shards.values() {
            if is_system_shard_id_guarded(&meta.shard_id) {
                continue;
            }

            let loaded = meta.strategy == LoadStrategy::Eager;
            shards.push(shard_meta_response(meta));

            if loaded {
                if let Ok(Some(shard)) =
                    Vault::load_shard_from_storage(storage, vault_key, &meta.shard_id)
                {
                    eager_data.insert(
                        meta.shard_id.clone(),
                        serde_json::json!({
                            "version": shard.version,
                            "root": serde_json::to_value(&shard.root).unwrap_or(Value::Null),
                        }),
                    );
                }
            }
        }
    }

    if shards.is_empty() {
        for node in session.catalog().root().children() {
            if crate::catalog::is_system_shard_id(&node.name) {
                continue;
            }
            shards.push(ShardMetaResponse {
                shard_id: node.name.clone(),
                version: root_version,
                size: node.total_size(),
                node_count: node.count_nodes() as u64,
                strategy: "lazy".to_string(),
                has_deltas: false,
                loaded: false,
            });
        }
    }

    shards.sort_by(|a, b| a.shard_id.cmp(&b.shard_id));
    let root_summaries = session
        .catalog()
        .root()
        .children()
        .iter()
        .filter(|node| !crate::catalog::is_system_shard_id(&node.name))
        .map(compact_summary_from_node)
        .collect::<Vec<_>>();

    CatalogSyncManifestResponse {
        root_version,
        format: "manifest".to_string(),
        manifest_budget_bytes: CATALOG_MANIFEST_BUDGET_BYTES,
        shards,
        root_summaries,
        eager_data: Value::Object(eager_data),
    }
}

pub(super) fn catalog_shard_list(session: &VaultSession, storage: &Storage) -> ListShardsResponse {
    let root_version = session.catalog().version();
    let vault_key = session.vault_key();

    let mut shards: Vec<ShardMetaResponse> = Vec::new();

    if let Ok(Some(index)) = Vault::read_root_index_from_storage(storage, vault_key) {
        for meta in index.shards.values() {
            shards.push(shard_meta_response(meta));
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

    shards.retain(|s| !is_system_shard_id_guarded(&s.shard_id));
    shards.sort_by(|a, b| a.shard_id.cmp(&b.shard_id));

    ListShardsResponse {
        root_version,
        shards,
    }
}
