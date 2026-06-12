//! Vault session management

use std::collections::HashMap;
use std::sync::Arc;
use std::time::Instant;

use zeroize::Zeroizing;

use crate::catalog::CatalogManager;
use crate::crypto::keystore::Keystore;
use crate::crypto::{derive_vault_key_v2, StoragePepper};
use crate::error::{Error, Result};
use crate::storage::Storage;
use crate::types::KEY_SIZE;
use crate::vault::DecryptedChunkCache;

/// Vault operations
pub struct Vault;

impl Vault {
    /// Unlock a vault with the given password
    ///
    /// # Plausible Deniability
    /// This function never returns an "invalid password" error.
    /// Any password will derive a valid key and attempt to load the catalog.
    /// If no catalog chunks are found, an empty vault is returned.
    pub fn unlock(storage: &Storage, password: &str) -> Result<VaultSession> {
        Self::unlock_with_keystore(storage, password, None)
    }

    pub fn unlock_with_keystore(
        storage: &Storage,
        password: &str,
        keystore: Option<&dyn Keystore>,
    ) -> Result<VaultSession> {
        let salt = storage.get_or_create_salt()?;

        let format_v = storage.format_version()?;

        if format_v < 2 {
            return Err(Error::UnsupportedStorageVersion(format_v));
        }

        let keystore = match keystore {
            Some(k) => k,
            None => return Err(Error::KeystoreUnavailable("not configured".to_string())),
        };

        let has_chunks = storage.has_any_chunk()?;

        let pepper_opt = keystore
            .load_storage_pepper()
            .map_err(|e| Error::KeystoreUnavailable(e.to_string()))?;

        let pepper = match pepper_opt {
            Some(p) => p,
            None => {
                if has_chunks {
                    return Err(Error::StoragePepperRequired);
                }
                let p = StoragePepper::generate()
                    .map_err(|e| Error::KeystoreUnavailable(e.to_string()))?;
                keystore
                    .store_storage_pepper(p)
                    .map_err(|e| Error::KeystoreUnavailable(e.to_string()))?;
                p
            }
        };

        let vault_key = derive_vault_key_v2(password, &salt, &pepper)?;
        super::rekey::recover_rekey_marker_for_key(storage, &vault_key)?;
        let catalog = Self::load_catalog_for_unlock(storage, &vault_key)?;

        Ok(VaultSession {
            vault_key,
            catalog,
            unlocked_at: Instant::now(),
            dirty: false,
            pending_deltas: HashMap::new(),
            decrypted_chunk_cache: Arc::new(DecryptedChunkCache::new_default()),
        })
    }
}

/// An active vault session
pub struct VaultSession {
    /// Derived vault key (zeroized on drop)
    pub(super) vault_key: Zeroizing<[u8; KEY_SIZE]>,
    /// Catalog manager
    catalog: CatalogManager,
    /// When the vault was unlocked
    unlocked_at: Instant,
    /// Whether the catalog has unsaved changes
    pub(super) dirty: bool,

    /// Pending per-shard delta entries since last persistence.
    ///
    /// `DeltaEntry.seq` is assigned during `save()` based on persisted shard versions.
    pub(super) pending_deltas: HashMap<String, Vec<crate::catalog::DeltaEntry>>,

    /// Session-scoped plaintext chunk cache, cleared on lock.
    pub(super) decrypted_chunk_cache: Arc<DecryptedChunkCache>,
}

impl VaultSession {
    /// Get the catalog manager (read-only)
    pub fn catalog(&self) -> &CatalogManager {
        &self.catalog
    }

    /// Get the catalog manager (mutable)
    pub fn catalog_mut(&mut self) -> &mut CatalogManager {
        self.dirty = true;
        &mut self.catalog
    }

    pub fn record_delta(&mut self, shard_id: &str, delta: crate::catalog::DeltaEntry) {
        self.pending_deltas
            .entry(shard_id.to_string())
            .or_default()
            .push(delta);
    }

    pub fn record_passmanager_touch(&mut self) {
        self.record_delta(
            ".passmanager",
            crate::catalog::DeltaEntry::update(0, "/", crate::catalog::PartialNode::default())
                .with_node_id(0),
        );
    }

    pub(crate) fn snapshot_persistence_state(
        &self,
    ) -> (
        CatalogManager,
        bool,
        HashMap<String, Vec<crate::catalog::DeltaEntry>>,
    ) {
        (
            self.catalog.clone(),
            self.dirty,
            self.pending_deltas.clone(),
        )
    }

    pub(crate) fn restore_persistence_state(
        &mut self,
        catalog: CatalogManager,
        dirty: bool,
        pending_deltas: HashMap<String, Vec<crate::catalog::DeltaEntry>>,
    ) {
        self.catalog = catalog;
        self.dirty = dirty;
        self.pending_deltas = pending_deltas;
    }

    pub(crate) fn replace_catalog_and_rewrite_snapshots(
        &mut self,
        storage: &Storage,
        catalog: CatalogManager,
    ) -> Result<()> {
        Vault::rewrite_sharded_catalog_from_catalog(storage, &self.vault_key, &catalog)?;
        self.catalog = catalog;
        self.pending_deltas.clear();
        self.dirty = false;
        Ok(())
    }

    /// Check if the catalog has unsaved changes
    pub fn is_dirty(&self) -> bool {
        self.dirty
    }

    /// Get when the vault was unlocked
    pub fn unlocked_at(&self) -> Instant {
        self.unlocked_at
    }

    /// Get the vault key (for chunk operations)
    pub fn vault_key(&self) -> &[u8; KEY_SIZE] {
        &self.vault_key
    }

    pub fn decrypted_chunk_cache(&self) -> Arc<DecryptedChunkCache> {
        Arc::clone(&self.decrypted_chunk_cache)
    }

    pub fn decrypted_chunk_cache_generation(&self) -> u64 {
        self.decrypted_chunk_cache.generation()
    }

    pub fn invalidate_decrypted_chunk_cache_for_node(&self, node_id: u64) {
        self.decrypted_chunk_cache.invalidate_node(node_id);
    }

    /// Save the catalog to storage
    pub fn save(&mut self, storage: &Storage) -> Result<Vec<(String, crate::catalog::DeltaEntry)>> {
        let mut persisted_deltas: Vec<(String, crate::catalog::DeltaEntry)> = Vec::new();
        if self.dirty {
            Vault::save_catalog(
                storage,
                &self.vault_key,
                &self.catalog,
                &mut self.pending_deltas,
                &mut persisted_deltas,
            )?;
            self.pending_deltas.clear();
            self.dirty = false;
        }
        Ok(persisted_deltas)
    }

    /// Lock the vault.
    pub fn lock(&mut self, storage: Option<&Storage>) -> Result<()> {
        self.decrypted_chunk_cache.clear("vault_lock");
        if let Some(storage) = storage {
            let _ = self.save(storage)?;
        }
        Ok(())
    }

    /// Get stats about the vault
    pub fn stats(&self) -> VaultStats {
        let root = self.catalog.root();
        VaultStats {
            node_count: root.count_nodes(),
            total_size: root.total_size(),
            version: self.catalog.version(),
        }
    }

    /// Check if vault is empty (new vault or wrong password)
    pub fn is_empty(&self) -> bool {
        self.catalog.root().children().is_empty()
    }
}

/// Statistics about a vault
#[derive(Debug, Clone)]
pub struct VaultStats {
    /// Total number of nodes (including root)
    pub node_count: usize,
    /// Total size of all files
    pub total_size: u64,
    /// Catalog version
    pub version: u64,
}

#[cfg(test)]
#[path = "session_tests.rs"]
mod tests;
