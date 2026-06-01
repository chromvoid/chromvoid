use std::collections::HashSet;

use crate::catalog::CatalogNode;
use crate::error::Error;
use crate::storage::Storage;
use crate::types::KEY_SIZE;
use crate::vault::VaultSession;

use super::error::StorageGcResult;
use super::manifest::STORAGE_GC_MANIFEST_CONTEXT;

pub(super) struct StorageGcLiveSetService;

impl StorageGcLiveSetService {
    pub(super) fn collect(
        storage: &Storage,
        session: &VaultSession,
    ) -> StorageGcResult<HashSet<String>> {
        let vault_key = session.vault_key();
        let mut live =
            crate::vault::catalog_persistence::CatalogChunkSetService::new(storage, vault_key)
                .live_catalog_chunk_names()?;
        live.extend(live_blob_and_otp_chunks(storage, session)?);
        live.extend(crate::rpc::derivative_index::live_derivative_chunk_names(
            storage, vault_key,
        )?);
        for name in durable_marker_names(vault_key) {
            if storage.chunk_exists(&name)? {
                live.insert(name);
            }
        }
        Ok(live)
    }
}

fn live_blob_and_otp_chunks(
    storage: &Storage,
    session: &VaultSession,
) -> StorageGcResult<HashSet<String>> {
    let mut live = HashSet::new();
    collect_node_chunks(
        storage,
        session.vault_key(),
        session.catalog().root(),
        &mut live,
    )?;
    Ok(live)
}

fn collect_node_chunks(
    storage: &Storage,
    vault_key: &[u8; KEY_SIZE],
    node: &CatalogNode,
    live: &mut HashSet<String>,
) -> StorageGcResult<()> {
    if node.is_file() {
        let node_id32 = u32::try_from(node.node_id)
            .map_err(|_| Error::InvalidDataFormat("invalid node_id".to_string()))?;
        let chunk_size = u64::from(node.chunk_size).max(1);
        let expected = node.size.saturating_add(chunk_size - 1) / chunk_size;
        for index in 0..expected.max(1) {
            let Some(index) = u32::try_from(index).ok() else {
                break;
            };
            let name = crate::crypto::blob_chunk_name(vault_key, node_id32, index);
            if storage.chunk_exists(&name)? {
                live.insert(name);
            }
        }
    }

    let otp_name = crate::crypto::otp_chunk_name(vault_key, node.node_id);
    if storage.chunk_exists(&otp_name)? {
        live.insert(otp_name);
    }

    for child in node.children() {
        collect_node_chunks(storage, vault_key, child, live)?;
    }
    Ok(())
}

fn durable_marker_names(vault_key: &[u8; KEY_SIZE]) -> Vec<String> {
    [
        b"catalog:file:replace:tx:v1".as_slice(),
        b"blob-write-tx:v1".as_slice(),
        b"otp-sidecar-tx:v1".as_slice(),
        b"domain-uow-tx:v1".as_slice(),
        STORAGE_GC_MANIFEST_CONTEXT,
    ]
    .into_iter()
    .map(|context| crate::crypto::chunk_name_u64(vault_key, context, 0))
    .collect()
}
