use crate::types::KEY_SIZE;

#[cfg(test)]
use super::common::BlobWriteTransaction;
use super::common::{
    BlobEraseTransaction, BLOB_ERASE_TX_MARKER_CONTEXT, BLOB_WRITE_TX_MARKER_CONTEXT,
};

pub(super) fn blob_write_tx_marker_name(vault_key: &[u8; KEY_SIZE]) -> String {
    crate::crypto::chunk_name_u64(vault_key, BLOB_WRITE_TX_MARKER_CONTEXT, 0)
}

pub(super) fn blob_erase_tx_marker_name(vault_key: &[u8; KEY_SIZE]) -> String {
    crate::crypto::chunk_name_u64(vault_key, BLOB_ERASE_TX_MARKER_CONTEXT, 0)
}

#[cfg(test)]
pub(super) fn blob_write_backup_chunk_name(
    vault_key: &[u8; KEY_SIZE],
    node_id: u32,
    operation_id: u128,
) -> String {
    let context = format!("blob-write-backup:{node_id}:{operation_id}");
    crate::crypto::chunk_name_u64(vault_key, context.as_bytes(), 0)
}

pub(super) fn blob_erase_backup_chunk_name(
    vault_key: &[u8; KEY_SIZE],
    node_id: u32,
    operation_id: u128,
    index: u32,
) -> String {
    let context = format!("blob-erase-backup:{node_id}:{operation_id}:{index}");
    crate::crypto::chunk_name_u64(vault_key, context.as_bytes(), 0)
}

#[cfg(test)]
pub(super) fn tx_id(transaction: &BlobWriteTransaction) -> String {
    format!(
        "blob-write-{}-{}",
        transaction.node_id, transaction.new_source_revision
    )
}

pub(super) fn blob_erase_tx_id(transaction: &BlobEraseTransaction) -> String {
    format!(
        "blob-erase-{}-{}",
        transaction.node_id, transaction.new_source_revision
    )
}
