//! Catalog loading, saving, and shard compaction

use std::collections::HashMap;

use crate::catalog::{deserialize_catalog, serialize_catalog, CatalogManager};
use crate::catalog::{merge_shards_to_catalog, DeltaEntry, RootIndex, Shard, MAX_DELTAS};
use crate::crypto::{
    catalog_chunk_name, decrypt, delta_chunk_name, encrypt, root_index_chunk_name, shard_chunk_name,
};
use crate::error::{Error, Result};
use crate::storage::Storage;
use crate::types::KEY_SIZE;

use super::session::Vault;

impl Vault {
    pub(crate) fn compact_shard_in_storage(
        storage: &Storage,
        vault_key: &[u8; KEY_SIZE],
        root_index: &mut RootIndex,
        shard_id: &str,
    ) -> Result<()> {
        let meta = match root_index.get_shard_mut(shard_id) {
            Some(m) => m,
            None if shard_id == ".passmanager" => {
                root_index.upsert_shard(crate::catalog::ShardMeta::passmanager());
                root_index.get_shard_mut(shard_id).ok_or_else(|| {
                    Error::InvalidDataFormat("Shard meta insert failed".to_string())
                })?
            }
            None => {
                return Err(Error::InvalidDataFormat(format!(
                    "Shard not found: {}",
                    shard_id
                )))
            }
        };

        if !meta.has_deltas {
            return Ok(());
        }

        let snap_name = shard_chunk_name(vault_key, shard_id, 0);
        if !storage.chunk_exists(&snap_name)? {
            return Err(Error::ChunkNotFound(snap_name));
        }
        let snap_enc = storage.read_chunk(&snap_name)?;
        let snap_plain = decrypt(&snap_enc, vault_key, snap_name.as_bytes())?;
        let mut shard: Shard = serde_json::from_slice(&snap_plain)?;

        let from = meta.base_version.saturating_add(1);
        let to = meta.last_delta_seq;
        if from <= to {
            let mut deltas: Vec<DeltaEntry> = Vec::new();
            for seq in from..=to {
                let delta_name = delta_chunk_name(vault_key, shard_id, seq);
                let delta_enc = storage
                    .read_chunk(&delta_name)
                    .map_err(|_| Error::ChunkNotFound(delta_name.clone()))?;
                let delta_plain = decrypt(&delta_enc, vault_key, delta_name.as_bytes())
                    .map_err(|e| Error::DecryptionFailed(e.to_string()))?;
                let d: DeltaEntry = serde_json::from_slice(&delta_plain)?;
                deltas.push(d);
            }
            crate::catalog::apply_deltas(&mut shard.root, &deltas);
        }

        // Rewrite snapshot at index 0 with merged state.
        shard.version = meta.version;
        shard.base_version = meta.version;
        let new_plain = serde_json::to_vec(&shard)?;
        let new_enc = encrypt(&new_plain, vault_key, snap_name.as_bytes())?;
        storage.write_chunk_atomic(&snap_name, &new_enc)?;

        // Update metadata, and remove old delta chunks.
        meta.clear_deltas();
        meta.last_delta_seq = meta.version;

        if from <= to {
            for seq in from..=to {
                let delta_name = delta_chunk_name(vault_key, shard_id, seq);
                let _ = storage.delete_chunk(&delta_name);
            }
        }

        Ok(())
    }

    pub(super) fn try_load_catalog(
        storage: &Storage,
        vault_key: &[u8; KEY_SIZE],
    ) -> Result<Option<CatalogManager>> {
        let chunk_name = catalog_chunk_name(vault_key, 0);
        if !storage.chunk_exists(&chunk_name)? {
            return Ok(None);
        }
        let encrypted_data = match storage.read_chunk(&chunk_name) {
            Ok(b) => b,
            Err(_) => return Ok(None),
        };
        let plaintext = match decrypt(&encrypted_data, vault_key, chunk_name.as_bytes()) {
            Ok(p) => p,
            Err(_) => return Ok(None),
        };
        let (root, version) = match deserialize_catalog(&plaintext) {
            Ok(v) => v,
            Err(_) => return Ok(None),
        };
        Ok(Some(CatalogManager::from_root_with_version(root, version)))
    }

    pub(super) fn try_load_sharded_catalog(
        storage: &Storage,
        vault_key: &[u8; KEY_SIZE],
    ) -> Result<Option<CatalogManager>> {
        let root_name = root_index_chunk_name(vault_key, 0);
        if !storage.chunk_exists(&root_name)? {
            #[cfg(debug_assertions)]
            eprintln!("[core][vault] sharded catalog: root index chunk missing");
            return Ok(None);
        }
        let encrypted = match storage.read_chunk(&root_name) {
            Ok(b) => b,
            Err(_) => {
                #[cfg(debug_assertions)]
                eprintln!("[core][vault] sharded catalog: failed to read root index chunk");
                return Ok(None);
            }
        };
        let plaintext = match decrypt(&encrypted, vault_key, root_name.as_bytes()) {
            Ok(p) => p,
            Err(_) => {
                #[cfg(debug_assertions)]
                eprintln!("[core][vault] sharded catalog: failed to decrypt root index chunk");
                return Ok(None);
            }
        };
        let mut root_index: RootIndex = match serde_json::from_slice(&plaintext) {
            Ok(v) => v,
            Err(_) => {
                #[cfg(debug_assertions)]
                eprintln!("[core][vault] sharded catalog: invalid root index chunk");
                return Ok(None);
            }
        };
        if !root_index.is_sharded() {
            #[cfg(debug_assertions)]
            eprintln!("[core][vault] sharded catalog: root index is not sharded");
            return Ok(None);
        }

        // Repair/migrate: if `.passmanager` exceeds delta loading limit, compact it in-place.
        if let Some(meta) = root_index.get_shard(".passmanager") {
            if meta.has_deltas {
                let from = meta.base_version.saturating_add(1);
                let to = meta.last_delta_seq;
                let delta_len = to.saturating_sub(from).saturating_add(1);
                if from <= to && delta_len > MAX_DELTAS as u64 {
                    #[cfg(debug_assertions)]
                    eprintln!(
                        "[core][vault] sharded catalog: compacting passmanager on unlock (deltas={} from={} to={})",
                        delta_len,
                        from,
                        to
                    );

                    if let Err(_e) = Self::compact_shard_in_storage(
                        storage,
                        vault_key,
                        &mut root_index,
                        ".passmanager",
                    ) {
                        #[cfg(debug_assertions)]
                        eprintln!(
                            "[core][vault] sharded catalog: passmanager unlock compaction failed: {}",
                            _e
                        );
                        return Ok(None);
                    }

                    // Persist RootIndex changes.
                    let root_out = serde_json::to_vec(&root_index)?;
                    let root_out_enc = encrypt(&root_out, vault_key, root_name.as_bytes())?;
                    storage.write_chunk(&root_name, &root_out_enc)?;
                }
            }
        }

        let mut shards: Vec<Shard> = Vec::new();
        for meta in root_index.shards.values() {
            let name = shard_chunk_name(vault_key, &meta.shard_id, 0);
            if !storage.chunk_exists(&name)? {
                #[cfg(debug_assertions)]
                eprintln!(
                    "[core][vault] sharded catalog: shard snapshot missing: shard_id={}",
                    meta.shard_id
                );
                return Ok(None);
            }
            let encrypted = match storage.read_chunk(&name) {
                Ok(b) => b,
                Err(_) => {
                    #[cfg(debug_assertions)]
                    eprintln!(
                        "[core][vault] sharded catalog: failed to read shard snapshot: shard_id={}",
                        meta.shard_id
                    );
                    return Ok(None);
                }
            };
            let plaintext = match decrypt(&encrypted, vault_key, name.as_bytes()) {
                Ok(p) => p,
                Err(_) => {
                    #[cfg(debug_assertions)]
                    eprintln!("[core][vault] sharded catalog: failed to decrypt shard snapshot: shard_id={}", meta.shard_id);
                    return Ok(None);
                }
            };
            let mut shard: Shard = match serde_json::from_slice(&plaintext) {
                Ok(s) => s,
                Err(_) => {
                    #[cfg(debug_assertions)]
                    eprintln!(
                        "[core][vault] sharded catalog: invalid shard snapshot: shard_id={}",
                        meta.shard_id
                    );
                    return Ok(None);
                }
            };

            if meta.has_deltas {
                let mut deltas: Vec<DeltaEntry> = Vec::new();
                let from = meta.base_version.saturating_add(1);
                let to = meta.last_delta_seq;
                let mut loaded: u32 = 0;
                for seq in from..=to {
                    if loaded >= MAX_DELTAS {
                        #[cfg(debug_assertions)]
                        eprintln!(
                            "[core][vault] sharded catalog: too many deltas ({}), fallback: shard_id={} from={} to={}",
                            MAX_DELTAS,
                            meta.shard_id,
                            from,
                            to
                        );
                        return Ok(None);
                    }
                    let delta_name = delta_chunk_name(vault_key, &meta.shard_id, seq);
                    let encrypted = match storage.read_chunk(&delta_name) {
                        Ok(b) => b,
                        Err(_) => {
                            #[cfg(debug_assertions)]
                            eprintln!(
                                "[core][vault] sharded catalog: missing delta chunk, fallback: shard_id={} seq={}",
                                meta.shard_id,
                                seq
                            );
                            return Ok(None);
                        }
                    };
                    let plaintext = match decrypt(&encrypted, vault_key, delta_name.as_bytes()) {
                        Ok(p) => p,
                        Err(_) => {
                            #[cfg(debug_assertions)]
                            eprintln!(
                                "[core][vault] sharded catalog: failed to decrypt delta chunk, fallback: shard_id={} seq={}",
                                meta.shard_id,
                                seq
                            );
                            return Ok(None);
                        }
                    };
                    let delta: DeltaEntry = match serde_json::from_slice(&plaintext) {
                        Ok(d) => d,
                        Err(_) => {
                            #[cfg(debug_assertions)]
                            eprintln!(
                                "[core][vault] sharded catalog: invalid delta chunk, fallback: shard_id={} seq={}",
                                meta.shard_id,
                                seq
                            );
                            return Ok(None);
                        }
                    };
                    deltas.push(delta);
                    loaded += 1;
                }

                if !deltas.is_empty() {
                    crate::catalog::apply_deltas(&mut shard.root, &deltas);
                    shard.version = deltas.last().map(|d| d.seq).unwrap_or(shard.version);
                }
            }

            shards.push(shard);
        }

        let root = merge_shards_to_catalog(&shards);
        Ok(Some(CatalogManager::from_root_with_version(
            root,
            root_index.root_version,
        )))
    }

    /// Save catalog to storage
    pub(super) fn save_catalog(
        storage: &Storage,
        vault_key: &[u8; KEY_SIZE],
        catalog: &CatalogManager,
        pending_deltas: &mut HashMap<String, Vec<crate::catalog::DeltaEntry>>,
        persisted_deltas: &mut Vec<(String, crate::catalog::DeltaEntry)>,
    ) -> Result<()> {
        // Persist the monolithic catalog chunk (legacy + fallback).
        let plaintext = serialize_catalog(catalog.root(), catalog.version())?;
        let chunk_name = catalog_chunk_name(vault_key, 0);
        let encrypted = encrypt(&plaintext, vault_key, chunk_name.as_bytes())?;
        storage.write_chunk(&chunk_name, &encrypted)?;

        // Compute current shards from the monolithic tree.
        let mut shards = crate::catalog::split_into_shards(catalog.root(), None);
        if !shards.iter().any(|s| s.shard_id == ".passmanager") {
            shards.push(crate::catalog::Shard::new(
                ".passmanager",
                crate::catalog::CatalogNode::new_dir(1, ".passmanager".to_string()),
            ));
        }

        // Load existing RootIndex if present; otherwise start a fresh one.
        let root_name = root_index_chunk_name(vault_key, 0);
        let mut root_index: RootIndex = if storage.chunk_exists(&root_name)? {
            let encrypted = storage.read_chunk(&root_name)?;
            let plaintext = decrypt(&encrypted, vault_key, root_name.as_bytes())?;
            let parsed: RootIndex = serde_json::from_slice(&plaintext)?;
            if parsed.is_sharded() {
                parsed
            } else {
                RootIndex::new()
            }
        } else {
            RootIndex::new()
        };

        root_index.root_version = catalog.version();

        // Reconcile shard metadata.
        let mut new_shards: std::collections::HashMap<String, crate::catalog::ShardMeta> =
            std::collections::HashMap::new();
        for shard in &shards {
            let strategy = if shard.shard_id == ".passmanager" {
                crate::catalog::LoadStrategy::Eager
            } else {
                crate::catalog::LoadStrategy::Lazy
            };

            let mut meta = root_index
                .shards
                .get(&shard.shard_id)
                .cloned()
                .unwrap_or_else(|| {
                    crate::catalog::ShardMeta::new(shard.shard_id.clone(), strategy)
                });
            meta.strategy = strategy;
            meta.context = format!("shard:{}", meta.shard_id);
            meta.update_stats(shard.node_count(), shard.size());
            new_shards.insert(meta.shard_id.clone(), meta);
        }
        root_index.shards = new_shards;

        // Ensure base snapshots exist (index 0).
        for shard in &shards {
            let name = shard_chunk_name(vault_key, &shard.shard_id, 0);

            let mut needs_write = !storage.chunk_exists(&name)?;
            if !needs_write && shard.root.is_file() {
                if let Ok(enc) = storage.read_chunk(&name) {
                    if let Ok(plain) = decrypt(&enc, vault_key, name.as_bytes()) {
                        if let Ok(existing) = serde_json::from_slice::<Shard>(&plain) {
                            if existing.root.node_id != shard.root.node_id {
                                needs_write = true;
                            }
                        }
                    }
                }
            }

            if !needs_write {
                continue;
            }

            let mut base = shard.clone();
            if base.root.is_dir() {
                base.root.children = Some(Vec::new());
            }

            if let Some(meta) = root_index.get_shard_mut(&base.shard_id) {
                if shard.root.is_file() {
                    meta.increment_version();
                    meta.clear_deltas();
                    meta.last_delta_seq = meta.version;
                }
                base.version = meta.base_version;
                base.base_version = meta.base_version;
            }

            let plain = serde_json::to_vec(&base)?;
            let enc = encrypt(&plain, vault_key, name.as_bytes())?;
            storage.write_chunk(&name, &enc)?;
        }

        // Persist pending deltas per shard.
        let mut delta_shards: Vec<String> = pending_deltas.keys().cloned().collect();
        delta_shards.sort_by(|a, b| {
            let a_pm = a == ".passmanager";
            let b_pm = b == ".passmanager";
            match (a_pm, b_pm) {
                (true, false) => std::cmp::Ordering::Less,
                (false, true) => std::cmp::Ordering::Greater,
                _ => a.cmp(b),
            }
        });

        for shard_id in delta_shards {
            let deltas = match pending_deltas.get_mut(&shard_id) {
                Some(d) => d,
                None => continue,
            };
            if deltas.is_empty() {
                continue;
            }

            let meta = match root_index.get_shard_mut(&shard_id) {
                Some(m) => m,
                None => {
                    deltas.clear();
                    continue;
                }
            };

            let mut next_seq = meta.version.saturating_add(1);
            for delta in deltas.iter_mut() {
                delta.seq = next_seq;

                let delta_name = delta_chunk_name(vault_key, &shard_id, next_seq);
                let delta_plain = serde_json::to_vec(&*delta)?;
                if delta_plain.len() > crate::catalog::MAX_DELTA_SIZE {
                    return Err(Error::InvalidDataFormat("delta too large".to_string()));
                }
                let delta_enc = encrypt(&delta_plain, vault_key, delta_name.as_bytes())?;
                storage.write_chunk(&delta_name, &delta_enc)?;

                persisted_deltas.push((shard_id.clone(), delta.clone()));

                meta.record_delta(next_seq);
                next_seq = next_seq.saturating_add(1);
            }

            deltas.clear();

            if shard_id == ".passmanager" && meta.has_deltas && meta.delta_count >= MAX_DELTAS {
                Self::compact_shard_in_storage(
                    storage,
                    vault_key,
                    &mut root_index,
                    ".passmanager",
                )?;
            }
        }

        // Persist updated RootIndex.
        let root_plain = serde_json::to_vec(&root_index)?;
        let root_enc = encrypt(&root_plain, vault_key, root_name.as_bytes())?;
        storage.write_chunk(&root_name, &root_enc)?;

        Ok(())
    }
}
