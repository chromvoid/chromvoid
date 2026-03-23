//! Vault session management

use std::collections::HashMap;
use std::time::Instant;

use zeroize::Zeroizing;

use crate::catalog::CatalogManager;
use crate::crypto::keystore::Keystore;
use crate::crypto::{derive_vault_key_v2, StoragePepper};
use crate::error::{Error, Result};
use crate::storage::Storage;
use crate::types::KEY_SIZE;

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
        let sharded = Self::try_load_sharded_catalog(storage, &vault_key)?;
        #[cfg(debug_assertions)]
        {
            if sharded.is_some() {
                eprintln!("[core][vault] sharded catalog loaded");
            } else {
                eprintln!("[core][vault] sharded catalog unavailable; falling back to monolithic");
            }
        }

        let catalog = sharded
            .or(Self::try_load_catalog(storage, &vault_key)?)
            .unwrap_or_else(CatalogManager::new);

        Ok(VaultSession {
            vault_key,
            catalog,
            unlocked_at: Instant::now(),
            dirty: false,
            pending_deltas: HashMap::new(),
        })
    }
}

/// An active vault session
pub struct VaultSession {
    /// Derived vault key (zeroized on drop)
    vault_key: Zeroizing<[u8; KEY_SIZE]>,
    /// Catalog manager
    catalog: CatalogManager,
    /// When the vault was unlocked
    unlocked_at: Instant,
    /// Whether the catalog has unsaved changes
    dirty: bool,

    /// Pending per-shard delta entries since last persistence.
    ///
    /// `DeltaEntry.seq` is assigned during `save()` based on persisted shard versions.
    pending_deltas: HashMap<String, Vec<crate::catalog::DeltaEntry>>,
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

    /// Lock the vault (consumes the session)
    pub fn lock(mut self, storage: Option<&Storage>) -> Result<()> {
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
