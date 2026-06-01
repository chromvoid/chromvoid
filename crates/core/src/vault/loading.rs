//! Catalog loading, saving, and shard compaction

use std::collections::HashMap;

use crate::catalog::CatalogManager;
use crate::catalog::{DeltaEntry, RootIndex, Shard};
use crate::error::Result;
use crate::storage::Storage;
use crate::types::KEY_SIZE;

use super::catalog_persistence::{
    CatalogCompactionService, CatalogLoadService, CatalogSaveService,
};
use super::session::Vault;

impl Vault {
    pub(crate) fn read_root_index_from_storage(
        storage: &Storage,
        vault_key: &[u8; KEY_SIZE],
    ) -> Result<Option<RootIndex>> {
        CatalogLoadService::new(storage, vault_key).read_root_index()
    }

    pub(crate) fn load_shard_from_storage(
        storage: &Storage,
        vault_key: &[u8; KEY_SIZE],
        shard_id: &str,
    ) -> Result<Option<Shard>> {
        CatalogLoadService::new(storage, vault_key).load_shard(shard_id)
    }

    pub(super) fn load_catalog_for_unlock(
        storage: &Storage,
        vault_key: &[u8; KEY_SIZE],
    ) -> Result<CatalogManager> {
        let outcome = CatalogLoadService::new(storage, vault_key).load_for_unlock()?;
        tracing::debug!(kind = ?outcome.kind, "vault_catalog_load");
        Ok(outcome.catalog)
    }

    pub(crate) fn compact_shard_with_commit(
        storage: &Storage,
        vault_key: &[u8; KEY_SIZE],
        root_index: RootIndex,
        shard_id: &str,
    ) -> Result<(RootIndex, u64, usize)> {
        CatalogCompactionService::new(storage, vault_key).compact_shard(root_index, shard_id)
    }

    pub(super) fn try_load_sharded_catalog(
        storage: &Storage,
        vault_key: &[u8; KEY_SIZE],
    ) -> Result<Option<CatalogManager>> {
        CatalogLoadService::new(storage, vault_key).try_load_sharded_catalog()
    }

    #[cfg(test)]
    pub(super) fn rewrite_sharded_catalog_from_catalog(
        storage: &Storage,
        vault_key: &[u8; KEY_SIZE],
        catalog: &CatalogManager,
    ) -> Result<()> {
        CatalogSaveService::new(storage, vault_key).rewrite_sharded_catalog_from_catalog(catalog)
    }

    /// Save catalog to storage
    pub(super) fn save_catalog(
        storage: &Storage,
        vault_key: &[u8; KEY_SIZE],
        catalog: &CatalogManager,
        pending_deltas: &mut HashMap<String, Vec<DeltaEntry>>,
        persisted_deltas: &mut Vec<(String, DeltaEntry)>,
    ) -> Result<()> {
        let outcome = CatalogSaveService::new(storage, vault_key).save(
            catalog,
            pending_deltas,
            persisted_deltas,
        )?;
        tracing::debug!(
            root_version = outcome.root_version,
            shard_count = outcome.shard_count,
            "vault_catalog_save"
        );
        Ok(())
    }
}

#[cfg(test)]
#[path = "loading_tests.rs"]
mod tests;
