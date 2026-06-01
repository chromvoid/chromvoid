use crate::catalog::{CatalogManager, CatalogNode, LoadStrategy, RootIndex, Shard, ShardMeta};
use crate::crypto::{encrypt, root_index_chunk_name, shard_chunk_name};
use crate::error::{Error, Result};
use crate::storage::Storage;
use crate::types::KEY_SIZE;
use crate::vault::{Vault, VaultSession};

pub(super) fn persistence_shards(root: &CatalogNode) -> Vec<Shard> {
    let mut shards = crate::catalog::split_into_shards(root, None);
    let mut next_synthetic_node_id = max_catalog_node_id(root).saturating_add(1);
    for shard_id in crate::catalog::eager_system_shard_ids() {
        if !shards.iter().any(|shard| shard.shard_id == *shard_id) {
            shards.push(crate::catalog::Shard::new(
                *shard_id,
                crate::catalog::CatalogNode::new_dir(
                    next_synthetic_node_id,
                    (*shard_id).to_string(),
                ),
            ));
            next_synthetic_node_id = next_synthetic_node_id.saturating_add(1);
        }
    }
    shards
}

pub(super) fn write_full_catalog_for_rekey(
    storage: &Storage,
    vault_key: &[u8; KEY_SIZE],
    catalog: &CatalogManager,
) -> Result<()> {
    let mut root_index = RootIndex::new();
    root_index.root_version = catalog.version();

    for mut shard in persistence_shards(catalog.root()) {
        let strategy = if crate::catalog::is_eager_system_shard_id(&shard.shard_id) {
            LoadStrategy::Eager
        } else {
            LoadStrategy::Lazy
        };
        let mut meta = ShardMeta::new(shard.shard_id.clone(), strategy);
        meta.version = catalog.version();
        meta.base_version = catalog.version();
        meta.last_delta_seq = catalog.version();
        meta.update_stats(shard.node_count(), shard.size());
        root_index.shards.insert(meta.shard_id.clone(), meta);

        shard.version = catalog.version();
        shard.base_version = catalog.version();
        let shard_name = shard_chunk_name(vault_key, &shard.shard_id, 0);
        let plain = serde_json::to_vec(&shard)?;
        let encrypted = encrypt(&plain, vault_key, shard_name.as_bytes())?;
        storage.write_chunk_atomic(&shard_name, &encrypted)?;
    }

    let root_name = root_index_chunk_name(vault_key, 0);
    let root_plain = serde_json::to_vec(&root_index)?;
    let root_enc = encrypt(&root_plain, vault_key, root_name.as_bytes())?;
    storage.write_chunk_atomic(&root_name, &root_enc)?;
    Ok(())
}

pub(super) fn validate_rekeyed_catalog(
    storage: &Storage,
    session: &VaultSession,
    new_key: &[u8; KEY_SIZE],
) -> Result<()> {
    let Some(candidate) = Vault::try_load_sharded_catalog(storage, new_key)? else {
        return Err(Error::InvalidDataFormat(
            "rekey validation failed: new catalog did not load".to_string(),
        ));
    };

    if candidate.root().count_nodes() < session.stats().node_count
        || candidate.root().total_size() != session.stats().total_size
    {
        return Err(Error::InvalidDataFormat(
            "rekey validation failed: catalog stats changed".to_string(),
        ));
    }

    Ok(())
}

fn max_catalog_node_id(node: &CatalogNode) -> u64 {
    node.children().iter().fold(node.node_id, |max_id, child| {
        max_id.max(max_catalog_node_id(child))
    })
}
