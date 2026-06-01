use crate::catalog::MAX_DELTAS;
use crate::catalog::{merge_shards_to_catalog, CatalogManager, DeltaEntry, RootIndex, Shard};
use crate::crypto::{decrypt, delta_chunk_name, root_index_chunk_name, shard_snapshot_chunk_name};
use crate::error::Result;
use crate::storage::Storage;
use crate::types::KEY_SIZE;

use super::compaction::CatalogCompactionService;
use super::root_index::read_root_index;
use super::transaction::CatalogCommitService;
use super::types::{CatalogLoadKind, CatalogLoadOutcome};

pub(in crate::vault) struct CatalogLoadService<'a> {
    storage: &'a Storage,
    vault_key: &'a [u8; KEY_SIZE],
}

impl<'a> CatalogLoadService<'a> {
    pub(in crate::vault) fn new(storage: &'a Storage, vault_key: &'a [u8; KEY_SIZE]) -> Self {
        Self { storage, vault_key }
    }

    pub(in crate::vault) fn load_for_unlock(&self) -> Result<CatalogLoadOutcome> {
        CatalogCommitService::new(self.storage, self.vault_key).recover_incomplete_commit()?;

        let sharded = self.try_load_sharded_catalog()?;

        #[cfg(debug_assertions)]
        {
            if sharded.is_some() {
                eprintln!("[core][vault] sharded catalog loaded");
            } else {
                eprintln!("[core][vault] sharded catalog unavailable; starting empty catalog");
            }
        }

        match sharded {
            Some(sharded) => Ok(CatalogLoadOutcome {
                catalog: sharded,
                kind: CatalogLoadKind::LoadedSharded,
            }),
            None => Ok(CatalogLoadOutcome {
                catalog: CatalogManager::new(),
                kind: CatalogLoadKind::NoCatalog,
            }),
        }
    }

    pub(in crate::vault) fn read_root_index(&self) -> Result<Option<RootIndex>> {
        let root_name = root_index_chunk_name(self.vault_key, 0);
        read_root_index(self.storage, self.vault_key, &root_name)
    }

    pub(in crate::vault) fn load_shard(&self, shard_id: &str) -> Result<Option<Shard>> {
        let Some(root_index) = self.read_root_index()? else {
            return Ok(None);
        };
        let Some(meta) = root_index.get_shard(shard_id) else {
            return Ok(None);
        };

        let snap_name = shard_snapshot_chunk_name(self.vault_key, shard_id, meta.snapshot_seq);
        if !self.storage.chunk_exists(&snap_name)? {
            return Ok(None);
        }
        let snap_enc = self.storage.read_chunk(&snap_name)?;
        let snap_plain = decrypt(&snap_enc, self.vault_key, snap_name.as_bytes())?;
        let mut shard: Shard = serde_json::from_slice(&snap_plain)?;

        if meta.has_deltas {
            let from = meta.base_version.saturating_add(1);
            let to = meta.last_delta_seq;
            if from <= to {
                let mut deltas = Vec::new();
                for seq in from..=to {
                    let delta_name = delta_chunk_name(self.vault_key, shard_id, seq);
                    let delta_enc = self.storage.read_chunk(&delta_name)?;
                    let delta_plain = decrypt(&delta_enc, self.vault_key, delta_name.as_bytes())?;
                    let delta: DeltaEntry = serde_json::from_slice(&delta_plain)?;
                    deltas.push(delta);
                }
                crate::catalog::apply_deltas(&mut shard.root, &deltas);
            }
        }

        shard.version = meta.version;
        shard.base_version = meta.base_version;
        Ok(Some(shard))
    }

    pub(in crate::vault) fn try_load_sharded_catalog(&self) -> Result<Option<CatalogManager>> {
        let root_name = root_index_chunk_name(self.vault_key, 0);
        if !self.storage.chunk_exists(&root_name)? {
            #[cfg(debug_assertions)]
            eprintln!("[core][vault] sharded catalog: root index chunk missing");
            return Ok(None);
        }
        let encrypted = match self.storage.read_chunk(&root_name) {
            Ok(b) => b,
            Err(_) => {
                #[cfg(debug_assertions)]
                eprintln!("[core][vault] sharded catalog: failed to read root index chunk");
                return Ok(None);
            }
        };
        let plaintext = match decrypt(&encrypted, self.vault_key, root_name.as_bytes()) {
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

        for shard_id in crate::catalog::eager_system_shard_ids() {
            let Some(meta) = root_index.get_shard(shard_id) else {
                continue;
            };
            if meta.has_deltas {
                let from = meta.base_version.saturating_add(1);
                let to = meta.last_delta_seq;
                let delta_len = to.saturating_sub(from).saturating_add(1);
                if from <= to && delta_len > MAX_DELTAS as u64 {
                    #[cfg(debug_assertions)]
                    eprintln!(
                        "[core][vault] sharded catalog: compacting eager system shard on unlock (shard_id={} deltas={} from={} to={})",
                        shard_id, delta_len, from, to
                    );

                    match CatalogCompactionService::new(self.storage, self.vault_key)
                        .compact_shard(root_index.clone(), shard_id)
                    {
                        Ok((updated_root_index, _, _)) => {
                            root_index = updated_root_index;
                        }
                        Err(_e) => {
                            #[cfg(debug_assertions)]
                            eprintln!(
                                "[core][vault] sharded catalog: eager system shard unlock compaction failed: shard_id={} error={}",
                                shard_id, _e
                            );
                            return Ok(None);
                        }
                    }
                }
            }
        }

        let mut shards: Vec<Shard> = Vec::new();
        for meta in root_index.shards.values() {
            let name = shard_snapshot_chunk_name(self.vault_key, &meta.shard_id, meta.snapshot_seq);
            if !self.storage.chunk_exists(&name)? {
                #[cfg(debug_assertions)]
                eprintln!(
                    "[core][vault] sharded catalog: shard snapshot missing: shard_id={}",
                    meta.shard_id
                );
                return Ok(None);
            }
            let encrypted = match self.storage.read_chunk(&name) {
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
            let plaintext = match decrypt(&encrypted, self.vault_key, name.as_bytes()) {
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
                    let delta_name = delta_chunk_name(self.vault_key, &meta.shard_id, seq);
                    let encrypted = match self.storage.read_chunk(&delta_name) {
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
                    let plaintext = match decrypt(&encrypted, self.vault_key, delta_name.as_bytes())
                    {
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
}
