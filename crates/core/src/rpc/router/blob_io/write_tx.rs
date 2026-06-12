use crate::durable_tx::DurableTxStore;
#[cfg(test)]
use crate::rpc::commands::is_system_node;
use crate::storage::Storage;
use crate::types::KEY_SIZE;
#[cfg(test)]
use crate::vault::VaultSession;

#[cfg(test)]
use super::backups::backup_existing_chunk;
use super::backups::cleanup_blob_write_backup;
#[cfg(test)]
use super::common::{now_ms, BlobWriteOutcome};
use super::common::{
    BlobWriteTransaction, BLOB_WRITE_TX_KIND, BLOB_WRITE_TX_MARKER_CONTEXT, BLOB_WRITE_TX_VERSION,
};
#[cfg(test)]
use super::error::BlobIoError;
use super::markers::blob_write_tx_marker_name;
#[cfg(test)]
use super::markers::tx_id;
#[cfg(test)]
use crate::rpc::router::blob_finalize::{
    finalize_blob_write, BlobFinalizationDelta, BlobFinalizationInput,
};

#[derive(Clone, Copy)]
pub(super) struct BlobWriteParticipant {
    current_size: Option<u64>,
    current_source_revision: Option<u64>,
}

impl crate::durable_tx::DurableTxParticipant for BlobWriteParticipant {
    const KIND: &'static str = BLOB_WRITE_TX_KIND;
    const VERSION: u8 = BLOB_WRITE_TX_VERSION;
    type Payload = BlobWriteTransaction;

    fn marker_context(&self) -> &'static [u8] {
        BLOB_WRITE_TX_MARKER_CONTEXT
    }

    fn marker_name(&self, vault_key: &[u8; KEY_SIZE]) -> String {
        blob_write_tx_marker_name(vault_key)
    }

    fn validate_payload(&self, payload: &Self::Payload) -> bool {
        payload.version == BLOB_WRITE_TX_VERSION
            && payload.node_id > 0
            && !payload.canonical_name.is_empty()
    }

    fn rollback_staging(
        &self,
        storage: &Storage,
        _vault_key: Option<&[u8; KEY_SIZE]>,
        record: &crate::durable_tx::DurableTxRecord<Self::Payload>,
    ) -> crate::error::Result<()> {
        cleanup_blob_write_backup(storage, &record.payload);
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
            return Ok(());
        }
        if self.current_size == Some(payload.old_size)
            && self.current_source_revision == Some(payload.old_source_revision)
        {
            return Ok(());
        }
        restore_blob_write_payload(storage, payload)
    }

    fn cleanup(
        &self,
        storage: &Storage,
        _vault_key: Option<&[u8; KEY_SIZE]>,
        record: &crate::durable_tx::DurableTxRecord<Self::Payload>,
    ) -> crate::error::Result<()> {
        cleanup_blob_write_backup(storage, &record.payload);
        storage.sync()
    }
}

pub(super) fn tx_store<'a>(
    storage: &'a Storage,
    vault_key: &'a [u8; KEY_SIZE],
    current_size: Option<u64>,
    current_source_revision: Option<u64>,
) -> DurableTxStore<'a, BlobWriteParticipant> {
    DurableTxStore::new(
        storage,
        vault_key,
        BlobWriteParticipant {
            current_size,
            current_source_revision,
        },
    )
}

#[cfg(test)]
pub(in crate::rpc::router) fn write_single_blob_atomic(
    session: &mut VaultSession,
    storage: &Storage,
    node_id: u64,
    bytes: &[u8],
) -> Result<BlobWriteOutcome, BlobIoError> {
    if is_system_node(session, node_id) {
        return Err(BlobIoError::AccessDenied);
    }

    let node = session
        .catalog()
        .find_by_id(node_id)
        .ok_or(BlobIoError::NodeNotFound)?;
    if !node.is_file() {
        return Err(BlobIoError::NotFile);
    }

    let vault_key = *session.vault_key();
    let node_id32 = u32::try_from(node_id).map_err(|_| BlobIoError::InvalidNodeId)?;
    let chunk_name = crate::crypto::blob_chunk_name(&vault_key, node_id32, 0);
    let backup_name = backup_existing_chunk(storage, &vault_key, node_id32, &chunk_name)?;
    let now = now_ms();
    let transaction = BlobWriteTransaction {
        version: BLOB_WRITE_TX_VERSION,
        node_id,
        canonical_name: chunk_name.clone(),
        backup_name,
        old_size: node.size,
        old_modtime: node.modtime,
        old_source_revision: node.source_revision,
        old_media_info: node.media_info.clone(),
        old_media_inspected_revision: node.media_inspected_revision,
        new_size: bytes.len() as u64,
        new_modtime: now,
        new_source_revision: now.max(node.source_revision.saturating_add(1)).max(1),
    };

    let store = tx_store(storage, &vault_key, None, None);
    if let Err(error) = write_blob_marker(&store, &transaction, true) {
        cleanup_blob_write_backup(storage, &transaction);
        return Err(error);
    }
    if let Err(error) = write_blob_marker(&store, &transaction, false) {
        let _ = cleanup_blob_write_transaction(storage, &vault_key, &transaction);
        return Err(error);
    }

    let encrypted = crate::crypto::encrypt(bytes, &vault_key, chunk_name.as_bytes())
        .map_err(|error| BlobIoError::Crypto(format!("Encryption failed: {error}")))?;
    if let Err(error) = write_canonical_blob(storage, &chunk_name, &encrypted) {
        restore_blob_write_payload(storage, &transaction).map_err(|restore_error| {
            BlobIoError::Storage(format!(
                "Storage write failed: {error}; restore failed: {restore_error}"
            ))
        })?;
        let _ = cleanup_blob_write_transaction(storage, &vault_key, &transaction);
        return Err(BlobIoError::Storage(format!(
            "Storage write failed: {error}"
        )));
    }

    finalize_blob_write(
        session,
        storage,
        None,
        BlobFinalizationInput {
            node_id,
            size: Some(bytes.len() as u64),
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
    })?;

    session
        .save(storage)
        .map_err(|error| BlobIoError::Save(format!("Catalog save failed: {error}")))?;
    cleanup_blob_write_transaction(storage, &vault_key, &transaction).map_err(|error| {
        BlobIoError::Storage(format!("Storage transaction cleanup failed: {error}"))
    })?;

    Ok(BlobWriteOutcome {
        node_id,
        size: bytes.len() as u64,
    })
}

#[cfg(test)]
fn write_blob_marker(
    store: &DurableTxStore<'_, BlobWriteParticipant>,
    transaction: &BlobWriteTransaction,
    staging: bool,
) -> Result<(), BlobIoError> {
    let result = if staging {
        store.write_staging(tx_id(transaction), transaction)
    } else {
        store.write_committing(tx_id(transaction), transaction)
    };
    result
        .map_err(|error| BlobIoError::Storage(format!("Storage transaction write failed: {error}")))
}

#[cfg(test)]
fn write_canonical_blob(
    storage: &Storage,
    chunk_name: &str,
    encrypted: &[u8],
) -> crate::error::Result<()> {
    let mut batch = storage.begin_chunk_write_batch("single-blob-write");
    batch.write_chunk(chunk_name.to_string(), encrypted)?;
    match batch.commit() {
        Ok(_) => Ok(()),
        Err(error) => {
            let committed = batch.written_names().to_vec();
            batch.rollback_temps();
            for name in committed {
                let _ = storage.delete_chunk(&name);
            }
            Err(error)
        }
    }
}

pub(super) fn restore_blob_write_payload(
    storage: &Storage,
    transaction: &BlobWriteTransaction,
) -> crate::error::Result<()> {
    match &transaction.backup_name {
        Some(backup_name) => {
            let bytes = storage.read_chunk(backup_name)?;
            storage.write_chunk_atomic(&transaction.canonical_name, &bytes)?;
        }
        None => {
            let _ = storage.delete_chunk(&transaction.canonical_name);
        }
    }
    storage.sync()
}

#[cfg(test)]
fn cleanup_blob_write_transaction(
    storage: &Storage,
    vault_key: &[u8; KEY_SIZE],
    transaction: &BlobWriteTransaction,
) -> crate::error::Result<()> {
    tx_store(storage, vault_key, None, None).delete()?;
    cleanup_blob_write_backup(storage, transaction);
    storage.sync()
}
