use crate::durable_tx::DurableTxStore;
use crate::rpc::commands::is_system_node;
use crate::storage::Storage;
use crate::types::KEY_SIZE;
use crate::vault::VaultSession;

use super::backups::{
    backup_blob_chunks, cleanup_blob_chunk_backups, cleanup_blob_erase_backups,
    collect_blob_chunk_names, restore_blob_chunk_backups,
};
use super::common::{
    now_ms, restore_catalog_node, BlobEraseBackup, BlobEraseTransaction, BLOB_ERASE_TX_KIND,
    BLOB_ERASE_TX_MARKER_CONTEXT, BLOB_ERASE_TX_VERSION,
};
use super::error::BlobIoError;
use super::markers::{blob_erase_tx_id, blob_erase_tx_marker_name};
use crate::rpc::router::blob_finalize::{
    finalize_blob_write, BlobFinalizationDelta, BlobFinalizationInput,
};

#[derive(Clone, Copy)]
pub(super) struct BlobEraseParticipant {
    current_size: Option<u64>,
    current_source_revision: Option<u64>,
}

impl crate::durable_tx::DurableTxParticipant for BlobEraseParticipant {
    const KIND: &'static str = BLOB_ERASE_TX_KIND;
    const VERSION: u8 = BLOB_ERASE_TX_VERSION;
    type Payload = BlobEraseTransaction;

    fn marker_context(&self) -> &'static [u8] {
        BLOB_ERASE_TX_MARKER_CONTEXT
    }

    fn marker_name(&self, vault_key: &[u8; KEY_SIZE]) -> String {
        blob_erase_tx_marker_name(vault_key)
    }

    fn validate_payload(&self, payload: &Self::Payload) -> bool {
        payload.version == BLOB_ERASE_TX_VERSION && payload.node_id > 0
    }

    fn rollback_staging(
        &self,
        storage: &Storage,
        _vault_key: Option<&[u8; KEY_SIZE]>,
        record: &crate::durable_tx::DurableTxRecord<Self::Payload>,
    ) -> crate::error::Result<()> {
        cleanup_blob_erase_backups(storage, &record.payload);
        storage.sync()
    }

    fn recover_committing(
        &self,
        storage: &Storage,
        _vault_key: Option<&[u8; KEY_SIZE]>,
        record: &crate::durable_tx::DurableTxRecord<Self::Payload>,
    ) -> crate::error::Result<()> {
        let payload = &record.payload;
        if self.current_size == Some(payload.new_size)
            && self.current_source_revision == Some(payload.new_source_revision)
        {
            return delete_blob_chunks_durable(storage, &payload.canonical_names);
        }
        if self.current_size == Some(payload.old_size)
            && self.current_source_revision == Some(payload.old_source_revision)
        {
            return restore_blob_erase_payload(storage, payload);
        }
        Err(crate::error::Error::InvalidDataFormat(format!(
            "blob erase recovery cannot prove current state for node {}",
            payload.node_id
        )))
    }

    fn cleanup(
        &self,
        storage: &Storage,
        _vault_key: Option<&[u8; KEY_SIZE]>,
        record: &crate::durable_tx::DurableTxRecord<Self::Payload>,
    ) -> crate::error::Result<()> {
        cleanup_blob_erase_backups(storage, &record.payload);
        storage.sync()
    }
}

pub(super) fn erase_tx_store<'a>(
    storage: &'a Storage,
    vault_key: &'a [u8; KEY_SIZE],
    current_size: Option<u64>,
    current_source_revision: Option<u64>,
) -> DurableTxStore<'a, BlobEraseParticipant> {
    DurableTxStore::new(
        storage,
        vault_key,
        BlobEraseParticipant {
            current_size,
            current_source_revision,
        },
    )
}

pub(in crate::rpc) fn erase_single_blob_atomic(
    session: &mut VaultSession,
    storage: &Storage,
    node_id: u64,
) -> Result<(), BlobIoError> {
    if is_system_node(session, node_id) {
        return Err(BlobIoError::AccessDenied);
    }

    let node = session
        .catalog()
        .find_by_id(node_id)
        .ok_or(BlobIoError::NodeNotFound)?
        .clone();
    if !node.is_file() {
        return Err(BlobIoError::NotFile);
    }

    let vault_key = *session.vault_key();
    let node_id32 = u32::try_from(node_id).map_err(|_| BlobIoError::InvalidNodeId)?;
    let existing = collect_blob_chunk_names(storage, &vault_key, node_id32)?;
    let backups = backup_blob_chunks(storage, &vault_key, node_id32, &existing)?;
    let now = now_ms();
    let transaction = BlobEraseTransaction {
        version: BLOB_ERASE_TX_VERSION,
        node_id,
        canonical_names: existing.clone(),
        backups: backups
            .iter()
            .map(|(canonical_name, backup_name)| BlobEraseBackup {
                canonical_name: canonical_name.clone(),
                backup_name: backup_name.clone(),
            })
            .collect(),
        old_size: node.size,
        old_modtime: node.modtime,
        old_source_revision: node.source_revision,
        old_media_info: node.media_info.clone(),
        old_media_inspected_revision: node.media_inspected_revision,
        new_size: 0,
        new_modtime: now,
        new_source_revision: now.max(node.source_revision.saturating_add(1)).max(1),
    };
    let store = erase_tx_store(storage, &vault_key, None, None);
    if let Err(error) = write_blob_erase_marker(&store, &transaction, true) {
        let _ = cleanup_blob_chunk_backups(storage, &backups);
        return Err(error);
    }
    if let Err(error) = write_blob_erase_marker(&store, &transaction, false) {
        let _ = cleanup_blob_erase_transaction(storage, &vault_key, &transaction);
        return Err(error);
    }

    if let Err(error) = delete_blob_chunks(storage, &existing) {
        let _ = restore_blob_chunk_backups(storage, &backups);
        let _ = cleanup_blob_erase_transaction(storage, &vault_key, &transaction);
        return Err(error);
    }

    if let Err(error) = finalize_blob_write(
        session,
        storage,
        BlobFinalizationInput {
            node_id,
            size: Some(0),
            mime_type: None,
            modtime: Some(transaction.new_modtime),
            source_revision: Some(transaction.new_source_revision),
            delta: BlobFinalizationDelta::SourceRevisionOnly,
        },
    )
    .map_err(|error| match error {
        crate::rpc::router::blob_finalize::BlobFinalizeError::NodeNotFound => {
            BlobIoError::NodeNotFound
        }
        crate::rpc::router::blob_finalize::BlobFinalizeError::DerivativeIndex(error) => {
            BlobIoError::DerivativeIndex(error)
        }
    }) {
        let _ = restore_blob_chunk_backups(storage, &backups);
        restore_catalog_node(session, &node);
        let _ = cleanup_blob_erase_transaction(storage, &vault_key, &transaction);
        return Err(error);
    }

    if let Err(error) = session.save(storage) {
        let _ = restore_blob_chunk_backups(storage, &backups);
        restore_catalog_node(session, &node);
        return Err(BlobIoError::Save(format!("Catalog save failed: {error}")));
    }

    cleanup_blob_erase_transaction(storage, &vault_key, &transaction)
        .map_err(|error| BlobIoError::Storage(format!("Storage cleanup failed: {error}")))?;
    Ok(())
}

fn delete_blob_chunks(storage: &Storage, names: &[String]) -> Result<(), BlobIoError> {
    delete_blob_chunks_durable(storage, names)
        .map_err(|error| BlobIoError::Storage(format!("Storage delete failed: {error}")))
}

fn delete_blob_chunks_durable(storage: &Storage, names: &[String]) -> crate::error::Result<()> {
    for name in names {
        storage.delete_chunk(name)?;
    }
    storage.sync()
}

pub(super) fn restore_blob_erase_payload(
    storage: &Storage,
    transaction: &BlobEraseTransaction,
) -> crate::error::Result<()> {
    for backup in &transaction.backups {
        let encrypted = storage.read_chunk(&backup.backup_name)?;
        storage.write_chunk_atomic(&backup.canonical_name, &encrypted)?;
    }
    storage.sync()
}

fn cleanup_blob_erase_transaction(
    storage: &Storage,
    vault_key: &[u8; KEY_SIZE],
    transaction: &BlobEraseTransaction,
) -> crate::error::Result<()> {
    erase_tx_store(storage, vault_key, None, None).delete()?;
    cleanup_blob_erase_backups(storage, transaction);
    storage.sync()
}

fn write_blob_erase_marker(
    store: &DurableTxStore<'_, BlobEraseParticipant>,
    transaction: &BlobEraseTransaction,
    staging: bool,
) -> Result<(), BlobIoError> {
    let result = if staging {
        store.write_staging(blob_erase_tx_id(transaction), transaction)
    } else {
        store.write_committing(blob_erase_tx_id(transaction), transaction)
    };
    result
        .map_err(|error| BlobIoError::Storage(format!("Storage transaction write failed: {error}")))
}
