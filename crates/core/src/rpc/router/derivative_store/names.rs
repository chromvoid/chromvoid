use crate::rpc::derivative_index::DerivativeIndexEntry;
use crate::types::KEY_SIZE;

use super::types::DerivativeWriteSnapshot;

pub(super) fn entry_chunk_names(
    vault_key: &[u8; KEY_SIZE],
    entry: &DerivativeIndexEntry,
) -> Vec<String> {
    let mut names = Vec::with_capacity(entry.part_count as usize + 1);
    names.push(entry.meta_chunk_name.clone());
    for part_index in 0..entry.part_count {
        names.push(entry_data_chunk_name(vault_key, entry, part_index));
    }
    names
}

pub(super) fn old_entry_tail_names(
    vault_key: &[u8; KEY_SIZE],
    entry: &DerivativeIndexEntry,
    next_part_count: u32,
) -> Vec<String> {
    (next_part_count..entry.part_count)
        .map(|part_index| entry_data_chunk_name(vault_key, entry, part_index))
        .collect()
}

pub(super) fn entry_data_chunk_name(
    vault_key: &[u8; KEY_SIZE],
    entry: &DerivativeIndexEntry,
    part_index: u32,
) -> String {
    crate::crypto::derivative_chunk_name(
        vault_key,
        entry.node_id,
        entry.source_revision,
        &entry.tier,
        entry.storage_version,
        part_index,
    )
}

pub(super) fn backup_chunk_name(
    snapshot: &DerivativeWriteSnapshot,
    tx_id: &str,
    index: u64,
) -> String {
    let context = format!(
        "derivative-backup:{}:{}:{}:{}:{}",
        snapshot.node_id, snapshot.source_version, snapshot.tier, snapshot.version, tx_id
    );
    crate::crypto::chunk_name_u64(&snapshot.vault_key, context.as_bytes(), index)
}

pub(super) fn derivative_tx_id(snapshot: &DerivativeWriteSnapshot) -> String {
    let now = std::time::SystemTime::now()
        .duration_since(std::time::UNIX_EPOCH)
        .map(|duration| duration.as_nanos())
        .unwrap_or(0);
    format!(
        "derivative-{}-{}-{}-{}-{now}",
        snapshot.node_id, snapshot.source_version, snapshot.tier, snapshot.version
    )
}

pub(super) fn derivative_chunk_name(snapshot: &DerivativeWriteSnapshot, part_index: u32) -> String {
    crate::crypto::derivative_chunk_name(
        &snapshot.vault_key,
        snapshot.node_id,
        snapshot.source_version,
        &snapshot.tier,
        snapshot.version,
        part_index,
    )
}

pub(super) fn meta_chunk_name_for_cleanup(snapshot: &DerivativeWriteSnapshot) -> String {
    crate::crypto::derivative_meta_chunk_name(
        &snapshot.vault_key,
        snapshot.node_id,
        snapshot.source_version,
        &snapshot.tier,
        snapshot.version,
    )
}
