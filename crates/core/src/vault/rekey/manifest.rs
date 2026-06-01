use std::collections::BTreeSet;

use serde::Deserialize;

use crate::catalog::{CatalogNode, RootIndex};
use crate::crypto::{
    blob_chunk_name, catalog_chunk_name, decrypt, delta_chunk_name, derivative_chunk_name,
    derivative_index_chunk_name, otp_chunk_name, root_index_chunk_name, shard_chunk_name,
    shard_snapshot_chunk_name,
};
use crate::error::Result;
use crate::storage::Storage;
use crate::types::{DEFAULT_CHUNK_SIZE, KEY_SIZE};

use super::catalog_io::persistence_shards;
use super::chunks::unique;
use super::types::ChunkPair;

#[derive(Debug, Clone, Default)]
pub(super) struct RekeyManifest {
    pub(super) old_catalog_chunks: Vec<String>,
    pub(super) new_catalog_chunks: Vec<String>,
    pub(super) blob_chunks: Vec<ChunkPair>,
    pub(super) otp_chunks: Vec<ChunkPair>,
    pub(super) derivative_chunks: Vec<String>,
}

impl RekeyManifest {
    pub(super) fn old_durable_chunks(&self) -> Vec<String> {
        let mut names = BTreeSet::new();
        names.extend(self.old_catalog_chunks.iter().cloned());
        names.extend(self.blob_chunks.iter().map(|pair| pair.old_name.clone()));
        names.extend(self.otp_chunks.iter().map(|pair| pair.old_name.clone()));
        names.into_iter().collect()
    }

    pub(super) fn new_durable_chunks(&self) -> Vec<String> {
        let mut names = BTreeSet::new();
        names.extend(self.new_catalog_chunks.iter().cloned());
        names.extend(self.blob_chunks.iter().map(|pair| pair.new_name.clone()));
        names.extend(self.otp_chunks.iter().map(|pair| pair.new_name.clone()));
        names.into_iter().collect()
    }

    pub(super) fn durable_pair_count(&self) -> u64 {
        (self.new_catalog_chunks.len() + self.blob_chunks.len() + self.otp_chunks.len()) as u64
    }
}

#[derive(Debug, Clone, Deserialize)]
struct DerivativeIndexRecord {
    #[serde(default)]
    entries: Vec<DerivativeIndexEntry>,
}

#[derive(Debug, Clone, Deserialize)]
struct DerivativeIndexEntry {
    node_id: u64,
    source_revision: u64,
    tier: String,
    storage_version: u32,
    meta_chunk_name: String,
    part_count: u32,
}

pub(super) fn build_manifest(
    storage: &Storage,
    root: &CatalogNode,
    old_key: &[u8; KEY_SIZE],
    new_key: &[u8; KEY_SIZE],
) -> Result<RekeyManifest> {
    let mut manifest = RekeyManifest {
        old_catalog_chunks: old_catalog_chunk_names(storage, old_key)?,
        new_catalog_chunks: new_catalog_chunk_names(root, new_key),
        blob_chunks: Vec::new(),
        otp_chunks: Vec::new(),
        derivative_chunks: derivative_chunk_names(storage, old_key)?,
    };
    collect_node_chunks(storage, root, old_key, new_key, &mut manifest)?;
    manifest.old_catalog_chunks = unique(manifest.old_catalog_chunks);
    manifest.new_catalog_chunks = unique(manifest.new_catalog_chunks);
    manifest.derivative_chunks = unique(manifest.derivative_chunks);
    Ok(manifest)
}

fn old_catalog_chunk_names(storage: &Storage, key: &[u8; KEY_SIZE]) -> Result<Vec<String>> {
    let mut names = Vec::new();
    let catalog = catalog_chunk_name(key, 0);
    if storage.chunk_exists(&catalog)? {
        names.push(catalog);
    }

    let root_name = root_index_chunk_name(key, 0);
    if storage.chunk_exists(&root_name)? {
        names.push(root_name.clone());
        if let Ok(encrypted) = storage.read_chunk(&root_name) {
            if let Ok(plain) = decrypt(&encrypted, key, root_name.as_bytes()) {
                if let Ok(root_index) = serde_json::from_slice::<RootIndex>(&plain) {
                    for meta in root_index.shards.values() {
                        let shard_name =
                            shard_snapshot_chunk_name(key, &meta.shard_id, meta.snapshot_seq);
                        if storage.chunk_exists(&shard_name)? {
                            names.push(shard_name);
                        }
                        if meta.has_deltas {
                            let from = meta.base_version.saturating_add(1);
                            let to = meta.last_delta_seq;
                            for seq in from..=to {
                                let delta_name = delta_chunk_name(key, &meta.shard_id, seq);
                                if storage.chunk_exists(&delta_name)? {
                                    names.push(delta_name);
                                }
                            }
                        }
                    }
                }
            }
        }
    }

    Ok(names)
}

fn new_catalog_chunk_names(root: &CatalogNode, key: &[u8; KEY_SIZE]) -> Vec<String> {
    let mut names = vec![root_index_chunk_name(key, 0)];
    for shard in persistence_shards(root) {
        names.push(shard_chunk_name(key, &shard.shard_id, 0));
    }
    unique(names)
}

fn collect_node_chunks(
    storage: &Storage,
    node: &CatalogNode,
    old_key: &[u8; KEY_SIZE],
    new_key: &[u8; KEY_SIZE],
    manifest: &mut RekeyManifest,
) -> Result<()> {
    if node.is_file() {
        let chunk_size = if node.chunk_size == 0 {
            DEFAULT_CHUNK_SIZE
        } else {
            node.chunk_size
        } as u64;
        let part_count = if node.size == 0 {
            0
        } else {
            node.size.saturating_add(chunk_size - 1) / chunk_size
        };
        for part_index in 0..part_count {
            let part_index = part_index as u32;
            let old_name = blob_chunk_name(old_key, node.node_id as u32, part_index);
            if storage.chunk_exists(&old_name)? {
                manifest.blob_chunks.push(ChunkPair {
                    old_name,
                    new_name: blob_chunk_name(new_key, node.node_id as u32, part_index),
                });
            }
        }
    }

    let old_otp = otp_chunk_name(old_key, node.node_id);
    if storage.chunk_exists(&old_otp)? {
        manifest.otp_chunks.push(ChunkPair {
            old_name: old_otp,
            new_name: otp_chunk_name(new_key, node.node_id),
        });
    }

    for child in node.children() {
        collect_node_chunks(storage, child, old_key, new_key, manifest)?;
    }
    Ok(())
}

fn derivative_chunk_names(storage: &Storage, key: &[u8; KEY_SIZE]) -> Result<Vec<String>> {
    let mut names = Vec::new();
    let index_name = derivative_index_chunk_name(key);
    if !storage.chunk_exists(&index_name)? {
        return Ok(names);
    }
    names.push(index_name.clone());

    let Ok(encrypted) = storage.read_chunk(&index_name) else {
        return Ok(names);
    };
    let Ok(plain) = decrypt(&encrypted, key, index_name.as_bytes()) else {
        return Ok(names);
    };
    let Ok(record) = serde_json::from_slice::<DerivativeIndexRecord>(&plain) else {
        return Ok(names);
    };

    for entry in record.entries {
        names.push(entry.meta_chunk_name);
        for part_index in 0..entry.part_count {
            names.push(derivative_chunk_name(
                key,
                entry.node_id,
                entry.source_revision,
                &entry.tier,
                entry.storage_version,
                part_index,
            ));
        }
    }

    Ok(names)
}
