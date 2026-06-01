use std::collections::HashMap;

use crate::catalog::{CatalogManager, CatalogNode, DeltaEntry};
use crate::rpc::commands::normalize_path;
use crate::storage::Storage;
use crate::types::KEY_SIZE;
use crate::vault::VaultSession;

use super::backups::{backup_existing_chunks, cleanup_domain_backups, rollback_domain_chunks};
use super::deltas::domain_deltas;
use super::errors::{catalog_error, internal_error};
use super::participant::domain_uow_store;
use super::paths::{catalogs_match_outside_domain, child_path};
use super::types::{
    now_ms, operation_id, DomainCommitOutcome, DomainUnitOfWorkPayload, StagedBlobWrite,
    DOMAIN_UOW_TX_VERSION,
};
use super::{DomainUowError, DomainUowResult};

pub(in crate::rpc::router) struct DomainUnitOfWork<'a> {
    storage: &'a Storage,
    vault_key: [u8; KEY_SIZE],
    domain_id: String,
    domain_path: String,
    tx_id: String,
    old_catalog: CatalogManager,
    old_dirty: bool,
    old_pending_deltas: HashMap<String, Vec<DeltaEntry>>,
    staged_catalog: CatalogManager,
    old_domain_root: Option<CatalogNode>,
    staged_writes: Vec<StagedBlobWrite>,
}

impl<'a> DomainUnitOfWork<'a> {
    pub(in crate::rpc::router) fn begin(
        session: &VaultSession,
        storage: &'a Storage,
        domain_id: &str,
        tx_id_hint: &str,
    ) -> Self {
        let domain_path = format!("/{}", domain_id.trim_start_matches('/'));
        let (old_catalog, old_dirty, old_pending_deltas) = session.snapshot_persistence_state();
        let old_domain_root = old_catalog.find_by_path(&domain_path).cloned();
        Self {
            storage,
            vault_key: *session.vault_key(),
            domain_id: domain_id.trim_start_matches('/').to_string(),
            domain_path,
            tx_id: format!("{tx_id_hint}-{}", operation_id()),
            old_catalog: old_catalog.clone(),
            old_dirty,
            old_pending_deltas,
            staged_catalog: old_catalog,
            old_domain_root,
            staged_writes: Vec::new(),
        }
    }

    pub(in crate::rpc::router) fn ensure_dir(&mut self, path: &str) -> DomainUowResult<()> {
        let normalized = normalize_path(path);
        if normalized == "/" {
            return Ok(());
        }
        self.ensure_path_in_domain(&normalized)?;

        let mut parent = "/".to_string();
        for segment in normalized.split('/').filter(|segment| !segment.is_empty()) {
            let current = if parent == "/" {
                format!("/{segment}")
            } else {
                format!("{parent}/{segment}")
            };
            if self.staged_catalog.find_by_path(&current).is_none() {
                self.staged_catalog
                    .create_dir(&parent, segment)
                    .map_err(|error| DomainUowError::internal(error.to_string()))?;
            }
            parent = current;
        }
        Ok(())
    }

    pub(in crate::rpc::router) fn catalog(&self) -> &CatalogManager {
        &self.staged_catalog
    }

    pub(in crate::rpc::router) fn replace_staged_catalog(
        &mut self,
        staged_catalog: CatalogManager,
    ) -> DomainUowResult<()> {
        if !catalogs_match_outside_domain(&self.old_catalog, &staged_catalog, &self.domain_path) {
            return Err(DomainUowError::access_denied(
                "Domain transaction changed data outside domain",
            ));
        }
        self.staged_catalog = staged_catalog;
        Ok(())
    }

    pub(in crate::rpc::router) fn stage_encrypted_chunk(
        &mut self,
        canonical_name: String,
        encrypted: Vec<u8>,
    ) -> DomainUowResult<()> {
        if canonical_name.trim().is_empty() {
            return Err(DomainUowError::internal("Domain chunk name is required"));
        }
        self.staged_writes.push(StagedBlobWrite {
            canonical_name,
            encrypted,
        });
        Ok(())
    }

    pub(in crate::rpc::router) fn stage_create_dir(
        &mut self,
        parent_path: &str,
        name: &str,
    ) -> DomainUowResult<u64> {
        let full_path = child_path(parent_path, name);
        self.ensure_path_in_domain(&full_path)?;
        self.staged_catalog
            .create_dir(parent_path, name)
            .map_err(catalog_error)
    }

    pub(in crate::rpc::router) fn stage_move_node(
        &mut self,
        node_id: u64,
        new_parent_path: &str,
    ) -> DomainUowResult<()> {
        let old_path = self
            .staged_catalog
            .get_path(node_id)
            .ok_or_else(|| DomainUowError::node_not_found("Node not found"))?;
        self.ensure_path_in_domain(&old_path)?;
        self.ensure_path_in_domain(&normalize_path(new_parent_path))?;
        self.staged_catalog
            .move_node(node_id, new_parent_path)
            .map_err(catalog_error)
    }

    pub(in crate::rpc::router) fn stage_rename_node(
        &mut self,
        node_id: u64,
        new_name: &str,
    ) -> DomainUowResult<()> {
        let old_path = self
            .staged_catalog
            .get_path(node_id)
            .ok_or_else(|| DomainUowError::node_not_found("Node not found"))?;
        self.ensure_path_in_domain(&old_path)?;
        self.staged_catalog
            .rename(node_id, new_name)
            .map_err(catalog_error)
    }

    pub(in crate::rpc::router) fn stage_delete_node(
        &mut self,
        node_id: u64,
    ) -> DomainUowResult<()> {
        let old_path = self
            .staged_catalog
            .get_path(node_id)
            .ok_or_else(|| DomainUowError::node_not_found("Node not found"))?;
        self.ensure_path_in_domain(&old_path)?;
        self.staged_catalog.delete(node_id).map_err(catalog_error)
    }

    pub(in crate::rpc::router) fn stage_blob_write(
        &mut self,
        parent_path: &str,
        name: &str,
        bytes: &[u8],
        mime_type: &str,
    ) -> DomainUowResult<u64> {
        self.ensure_dir(parent_path)?;
        let full_path = normalize_path(&format!(
            "{}/{}",
            parent_path.trim_end_matches('/'),
            name.trim_start_matches('/')
        ));
        let node_id = if let Some(existing) = self.staged_catalog.find_by_path(&full_path) {
            if !existing.is_file() {
                return Err(DomainUowError::internal("Node is not a file"));
            }
            existing.node_id
        } else {
            self.staged_catalog
                .create_file(
                    parent_path,
                    name,
                    bytes.len() as u64,
                    Some(mime_type.to_string()),
                )
                .map_err(|error| DomainUowError::internal(error.to_string()))?
        };

        let now = now_ms();
        let Some(node) = self.staged_catalog.find_by_id_mut(node_id) else {
            return Err(DomainUowError::internal(
                "Domain node missing after staging",
            ));
        };
        node.size = bytes.len() as u64;
        node.mime_type = Some(mime_type.to_string());
        node.modtime = now;
        node.source_revision = now.max(node.source_revision.saturating_add(1)).max(1);
        node.media_info = None;
        node.media_inspected_revision = 0;

        let node_id32 =
            u32::try_from(node_id).map_err(|_| DomainUowError::internal("Invalid node_id"))?;
        let canonical_name = crate::crypto::blob_chunk_name(&self.vault_key, node_id32, 0);
        let encrypted =
            match crate::crypto::encrypt(bytes, &self.vault_key, canonical_name.as_bytes()) {
                Ok(encrypted) => encrypted,
                Err(error) => {
                    return Err(DomainUowError::internal(format!(
                        "Domain blob encryption failed: {error}"
                    )));
                }
            };
        self.stage_encrypted_chunk(canonical_name, encrypted)?;
        Ok(node_id)
    }

    pub(in crate::rpc::router) fn stage_delete_path(
        &mut self,
        path: &str,
    ) -> DomainUowResult<bool> {
        let Some(node_id) = self
            .staged_catalog
            .find_by_path(path)
            .map(|node| node.node_id)
        else {
            return Ok(false);
        };
        self.staged_catalog
            .delete(node_id)
            .map_err(|error| DomainUowError::internal(error.to_string()))?;
        Ok(true)
    }

    fn ensure_path_in_domain(&self, path: &str) -> DomainUowResult<()> {
        let normalized = normalize_path(path);
        if normalized == self.domain_path
            || normalized.starts_with(&format!("{}/", self.domain_path))
        {
            return Ok(());
        }
        Err(DomainUowError::access_denied(
            "Domain transaction path outside domain",
        ))
    }

    pub(in crate::rpc::router) fn commit(
        self,
        session: &mut VaultSession,
    ) -> DomainUowResult<DomainCommitOutcome> {
        let new_domain_root = self.staged_catalog.find_by_path(&self.domain_path).cloned();
        let backups = backup_existing_chunks(self.storage, &self.vault_key, &self.staged_writes)?;
        let new_chunk_names = self
            .staged_writes
            .iter()
            .map(|write| write.canonical_name.clone())
            .collect::<Vec<_>>();
        let payload = DomainUnitOfWorkPayload {
            version: DOMAIN_UOW_TX_VERSION,
            domain_id: self.domain_id.clone(),
            domain_path: self.domain_path.clone(),
            tx_id: self.tx_id.clone(),
            old_domain_root: self.old_domain_root.clone(),
            new_domain_root,
            new_chunk_names,
            backups,
        };

        let store = domain_uow_store(self.storage, &self.vault_key);
        if let Err(error) = store.write_staging(self.tx_id.clone(), &payload) {
            cleanup_domain_backups(self.storage, &payload);
            return Err(internal_error(format!(
                "Domain transaction write failed: {error}"
            )));
        }
        if let Err(error) = store.write_committing(self.tx_id.clone(), &payload) {
            let _ = rollback_domain_chunks(self.storage, &payload);
            let _ = store.delete();
            return Err(internal_error(format!(
                "Domain transaction commit failed: {error}"
            )));
        }

        let mut batch = self.storage.begin_chunk_write_batch("domain-uow-write");
        for write in &self.staged_writes {
            if let Err(error) = batch.write_chunk(write.canonical_name.clone(), &write.encrypted) {
                batch.rollback_temps();
                let _ = rollback_domain_chunks(self.storage, &payload);
                return Err(internal_error(format!("Domain blob stage failed: {error}")));
            }
        }
        if let Err(error) = batch.commit() {
            let committed = batch.written_names().to_vec();
            batch.rollback_temps();
            for name in committed {
                let _ = self.storage.delete_chunk(&name);
            }
            let _ = rollback_domain_chunks(self.storage, &payload);
            return Err(internal_error(format!(
                "Domain blob commit failed: {error}"
            )));
        }

        let deltas = domain_deltas(&self.old_catalog, &self.staged_catalog, &self.domain_id);
        *session.catalog_mut() = self.staged_catalog;
        for delta in deltas {
            session.record_delta(&self.domain_id, delta);
        }

        if let Err(error) = session.save(self.storage) {
            session.restore_persistence_state(
                self.old_catalog,
                self.old_dirty,
                self.old_pending_deltas,
            );
            return Err(internal_error(format!(
                "Domain catalog save failed: {error}"
            )));
        }

        if let Err(error) = store.delete() {
            return Err(internal_error(format!(
                "Domain transaction cleanup failed: {error}"
            )));
        }
        cleanup_domain_backups(self.storage, &payload);
        self.storage
            .sync()
            .map_err(|error| internal_error(format!("Domain transaction sync failed: {error}")))?;

        Ok(DomainCommitOutcome {
            chunks_written: self.staged_writes.len(),
        })
    }
}
