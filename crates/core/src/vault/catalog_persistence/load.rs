use crate::catalog::MAX_DELTAS;
use crate::catalog::{merge_shards_to_catalog, CatalogManager, DeltaEntry, RootIndex, Shard};
use crate::crypto::{decrypt, delta_chunk_name, root_index_chunk_name, shard_snapshot_chunk_name};
use crate::error::Result;
use crate::storage::Storage;
use crate::types::KEY_SIZE;

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
                crate::catalog::apply_deltas(&mut shard.root, &deltas)?;
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
        // The root index chunk EXISTS, which means its name was derived from the
        // correct vault key (a wrong password derives a different name and is
        // handled by the `chunk_exists` branch above as Ok(None) → empty vault).
        // Therefore any read/decrypt/parse failure here is corruption or a
        // transient I/O error, NOT "no catalog". Returning Ok(None) would
        // surface as an empty vault and the next save would destructively delete
        // the real catalog (see H3). Propagate as an error instead.
        let encrypted = self.storage.read_chunk(&root_name)?;
        let plaintext =
            decrypt(&encrypted, self.vault_key, root_name.as_bytes()).map_err(|_| {
                crate::error::Error::InvalidDataFormat(
                    "root index chunk exists but failed to decrypt (corrupt catalog)".to_string(),
                )
            })?;
        let root_index: RootIndex = serde_json::from_slice(&plaintext).map_err(|_| {
            crate::error::Error::InvalidDataFormat(
                "root index chunk exists but failed to parse (corrupt catalog)".to_string(),
            )
        })?;
        if !root_index.is_sharded() {
            #[cfg(debug_assertions)]
            eprintln!("[core][vault] sharded catalog: root index is not sharded");
            return Ok(None);
        }

        // Every chunk referenced below is named via the (correct) vault key and
        // is recorded in the root index, so its absence or undecryptability is
        // corruption — not a wrong-password signal. All failures propagate as
        // errors so the caller never silently substitutes an empty catalog and
        // destroys the real data on the next save (H3).
        let mut shards: Vec<Shard> = Vec::new();
        for meta in root_index.shards.values() {
            let name = shard_snapshot_chunk_name(self.vault_key, &meta.shard_id, meta.snapshot_seq);
            if !self.storage.chunk_exists(&name)? {
                return Err(crate::error::Error::InvalidDataFormat(format!(
                    "shard snapshot referenced by root index is missing (shard_id={})",
                    meta.shard_id
                )));
            }
            let encrypted = self.storage.read_chunk(&name)?;
            let plaintext = decrypt(&encrypted, self.vault_key, name.as_bytes()).map_err(|_| {
                crate::error::Error::InvalidDataFormat(format!(
                    "shard snapshot failed to decrypt (shard_id={})",
                    meta.shard_id
                ))
            })?;
            let mut shard: Shard = serde_json::from_slice(&plaintext).map_err(|_| {
                crate::error::Error::InvalidDataFormat(format!(
                    "shard snapshot failed to parse (shard_id={})",
                    meta.shard_id
                ))
            })?;

            if meta.has_deltas {
                let mut deltas: Vec<DeltaEntry> = Vec::new();
                let from = meta.base_version.saturating_add(1);
                let to = meta.last_delta_seq;
                let mut loaded: u32 = 0;
                for seq in from..=to {
                    if loaded >= MAX_DELTAS {
                        return Err(crate::error::Error::InvalidDataFormat(format!(
                            "shard delta log exceeds MAX_DELTAS ({}) (shard_id={} from={} to={})",
                            MAX_DELTAS, meta.shard_id, from, to
                        )));
                    }
                    let delta_name = delta_chunk_name(self.vault_key, &meta.shard_id, seq);
                    let encrypted = self.storage.read_chunk(&delta_name)?;
                    let plaintext = decrypt(&encrypted, self.vault_key, delta_name.as_bytes())
                        .map_err(|_| {
                            crate::error::Error::InvalidDataFormat(format!(
                                "delta chunk failed to decrypt (shard_id={} seq={})",
                                meta.shard_id, seq
                            ))
                        })?;
                    let delta: DeltaEntry = serde_json::from_slice(&plaintext).map_err(|_| {
                        crate::error::Error::InvalidDataFormat(format!(
                            "delta chunk failed to parse (shard_id={} seq={})",
                            meta.shard_id, seq
                        ))
                    })?;
                    deltas.push(delta);
                    loaded += 1;
                }

                if !deltas.is_empty() {
                    crate::catalog::apply_deltas(&mut shard.root, &deltas)?;
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
