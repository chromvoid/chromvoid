use crate::catalog::CatalogNode;
use crate::storage::Storage;

use super::error::OtpTargetError;
use super::types::{
    normalize_non_empty_owned, CachedEntryMeta, CachedOtpMeta, PassmanagerEntryMeta,
    PassmanagerMetaStamp,
};

pub(super) fn collect_passmanager_meta_stamp(
    node: &CatalogNode,
    out: &mut Vec<PassmanagerMetaStamp>,
) {
    for child in node.children() {
        if !child.is_dir() {
            continue;
        }

        if let Some(meta_node) = child.find_child("meta.json").filter(|n| n.is_file()) {
            out.push(PassmanagerMetaStamp {
                entry_node_id: child.node_id,
                meta_node_id: meta_node.node_id,
                meta_modtime: meta_node.modtime,
                meta_size: meta_node.size,
            });
            continue;
        }

        collect_passmanager_meta_stamp(child, out);
    }
}

pub(super) fn walk_collect(
    node: &CatalogNode,
    vault_key: &[u8; 32],
    storage: &Storage,
    entries: &mut Vec<CachedEntryMeta>,
) -> Result<(), OtpTargetError> {
    for child in node.children() {
        if !child.is_dir() {
            continue;
        }

        if let Some(meta_node) = child.find_child("meta.json").filter(|n| n.is_file()) {
            let plain = match read_catalog_file_plain(vault_key, meta_node.node_id, storage) {
                Ok(bytes) => bytes,
                Err(_) => continue,
            };
            let meta: PassmanagerEntryMeta = match serde_json::from_slice(&plain) {
                Ok(v) => v,
                Err(_) => continue,
            };

            let cached_otps = meta
                .otps
                .iter()
                .map(|otp| CachedOtpMeta {
                    id: otp.id.clone(),
                    preferred_label: normalize_non_empty_owned(otp.label.as_deref())
                        .or_else(|| normalize_non_empty_owned(otp.id.as_deref())),
                })
                .collect();

            entries.push(CachedEntryMeta {
                node_id: child.node_id,
                entry_id: normalize_non_empty_owned(meta.id.as_deref()),
                otps: cached_otps,
            });
            continue;
        }

        walk_collect(child, vault_key, storage, entries)?;
    }

    Ok(())
}

fn read_catalog_file_plain(
    vault_key: &[u8; 32],
    node_id: u64,
    storage: &Storage,
) -> Result<Vec<u8>, OtpTargetError> {
    let node_id32 = u32::try_from(node_id).map_err(|_| OtpTargetError::new("invalid node_id"))?;
    let mut out = Vec::<u8>::new();
    let mut had_any_chunk = false;

    for index in 0u32.. {
        let chunk_name = crate::crypto::blob_chunk_name(vault_key, node_id32, index);
        let encrypted = match storage.read_chunk(&chunk_name) {
            Ok(bytes) => bytes,
            Err(crate::error::Error::ChunkNotFound(_)) => {
                if !had_any_chunk {
                    return Err(OtpTargetError::new("chunk not found"));
                }
                break;
            }
            Err(e) => return Err(OtpTargetError::new(e.to_string())),
        };

        had_any_chunk = true;
        let plain = crate::crypto::decrypt(&encrypted, vault_key, chunk_name.as_bytes())
            .map_err(|e| OtpTargetError::new(e.to_string()))?;
        out.extend_from_slice(&plain);
    }

    Ok(out)
}
