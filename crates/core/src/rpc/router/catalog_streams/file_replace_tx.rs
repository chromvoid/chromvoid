use serde::{Deserialize, Serialize};

use crate::durable_tx::{DurableTxPhase, DurableTxStore};
use crate::types::KEY_SIZE;

use super::super::state::RpcRouter;

pub(super) const FILE_REPLACE_TX_VERSION: u8 = 1;
const FILE_REPLACE_TX_KIND: &str = "catalog_file_replace";
const FILE_REPLACE_TX_MARKER_CONTEXT: &[u8] = b"catalog:file:replace:tx:v1";

#[derive(Debug, Clone, Serialize, Deserialize)]
pub(super) struct FileReplaceChunkBackup {
    pub(super) canonical_name: String,
    pub(super) backup_name: Option<String>,
}

#[derive(Debug, Clone, Serialize, Deserialize)]
pub(super) struct FileReplaceStagedChunk {
    pub(super) canonical_name: String,
    pub(super) stage_name: String,
}

#[derive(Debug, Clone, Serialize, Deserialize)]
pub(super) struct FileReplaceTransaction {
    pub(super) version: u8,
    pub(super) node_id: u64,
    pub(super) old_source_revision: u64,
    pub(super) new_source_revision: u64,
    pub(super) backups: Vec<FileReplaceChunkBackup>,
    pub(super) staged_chunks: Vec<FileReplaceStagedChunk>,
}

#[derive(Clone, Copy)]
struct FileReplaceParticipant {
    current_revision: Option<u64>,
}

impl crate::durable_tx::DurableTxParticipant for FileReplaceParticipant {
    const KIND: &'static str = FILE_REPLACE_TX_KIND;
    const VERSION: u8 = FILE_REPLACE_TX_VERSION;
    type Payload = FileReplaceTransaction;

    fn marker_context(&self) -> &'static [u8] {
        FILE_REPLACE_TX_MARKER_CONTEXT
    }

    fn marker_name(&self, vault_key: &[u8; KEY_SIZE]) -> String {
        file_replace_tx_marker_name(vault_key)
    }

    fn validate_payload(&self, payload: &Self::Payload) -> bool {
        valid_payload(payload)
    }

    fn recover_committing(
        &self,
        storage: &crate::storage::Storage,
        _vault_key: Option<&[u8; KEY_SIZE]>,
        record: &crate::durable_tx::DurableTxRecord<Self::Payload>,
    ) -> Result<(), crate::error::Error> {
        let transaction = &record.payload;
        if self
            .current_revision
            .is_some_and(|revision| revision >= transaction.new_source_revision)
        {
            return Ok(());
        }
        restore_file_replace_marker_payload(storage, transaction)
    }

    fn cleanup(
        &self,
        storage: &crate::storage::Storage,
        _vault_key: Option<&[u8; KEY_SIZE]>,
        record: &crate::durable_tx::DurableTxRecord<Self::Payload>,
    ) -> Result<(), crate::error::Error> {
        cleanup_file_replace_temporary_chunks(storage, &record.payload);
        storage.sync()
    }
}

pub(super) struct PendingFileReplaceTransaction {
    pub(super) phase: DurableTxPhase,
    pub(super) payload: FileReplaceTransaction,
}

pub(super) fn file_replace_tx_marker_name(vault_key: &[u8; KEY_SIZE]) -> String {
    crate::crypto::chunk_name_u64(vault_key, FILE_REPLACE_TX_MARKER_CONTEXT, 0)
}

pub(super) fn file_replace_temp_chunk_name(
    vault_key: &[u8; KEY_SIZE],
    node_id: u32,
    operation_id: u128,
    kind: &str,
    index: u32,
) -> String {
    let context = format!("blob-replace-{kind}:{node_id}:{operation_id}");
    crate::crypto::chunk_name_u64(vault_key, context.as_bytes(), index as u64)
}

fn tx_store<'a>(
    storage: &'a crate::storage::Storage,
    vault_key: &'a [u8; KEY_SIZE],
) -> DurableTxStore<'a, FileReplaceParticipant> {
    DurableTxStore::new(
        storage,
        vault_key,
        FileReplaceParticipant {
            current_revision: None,
        },
    )
}

pub(super) fn write_file_replace_marker(
    storage: &crate::storage::Storage,
    vault_key: &[u8; KEY_SIZE],
    transaction: &FileReplaceTransaction,
) -> Result<(), crate::error::Error> {
    tx_store(storage, vault_key).write_record(
        format!(
            "file-replace-{}-{}",
            transaction.node_id, transaction.new_source_revision
        ),
        DurableTxPhase::Committing,
        transaction,
    )
}

fn read_file_replace_marker(
    storage: &crate::storage::Storage,
    vault_key: &[u8; KEY_SIZE],
) -> Result<Option<PendingFileReplaceTransaction>, crate::error::Error> {
    let store = tx_store(storage, vault_key);
    if let Some(record) = store.read_record::<FileReplaceTransaction>()? {
        if valid_payload(&record.payload) {
            return Ok(Some(PendingFileReplaceTransaction {
                phase: record.phase,
                payload: record.payload,
            }));
        }
        return Ok(None);
    }

    let Some(legacy) = store.read_legacy_payload::<FileReplaceTransaction>()? else {
        return Ok(None);
    };
    if !valid_payload(&legacy) {
        return Ok(None);
    }
    Ok(Some(PendingFileReplaceTransaction {
        phase: DurableTxPhase::Committing,
        payload: legacy,
    }))
}

fn valid_payload(transaction: &FileReplaceTransaction) -> bool {
    transaction.version == FILE_REPLACE_TX_VERSION && transaction.new_source_revision > 0
}

fn cleanup_file_replace_temporary_chunks(
    storage: &crate::storage::Storage,
    transaction: &FileReplaceTransaction,
) {
    for staged in &transaction.staged_chunks {
        let _ = storage.delete_chunk(&staged.stage_name);
    }
    for backup in &transaction.backups {
        if let Some(backup_name) = &backup.backup_name {
            let _ = storage.delete_chunk(backup_name);
        }
    }
}

pub(super) fn cleanup_file_replace_marker(
    storage: &crate::storage::Storage,
    vault_key: &[u8; KEY_SIZE],
    transaction: &FileReplaceTransaction,
) -> Result<(), crate::error::Error> {
    cleanup_file_replace_temporary_chunks(storage, transaction);
    tx_store(storage, vault_key).delete()?;
    Ok(())
}

pub(super) fn restore_chunks(
    storage: &crate::storage::Storage,
    backups: &[(String, Option<Vec<u8>>)],
) -> Result<(), crate::error::Error> {
    for (name, bytes) in backups {
        match bytes {
            Some(bytes) => storage.write_chunk_atomic(name, bytes)?,
            None => storage.delete_chunk(name)?,
        }
    }
    storage.sync()?;
    Ok(())
}

fn restore_file_replace_marker_payload(
    storage: &crate::storage::Storage,
    transaction: &FileReplaceTransaction,
) -> Result<(), crate::error::Error> {
    for backup in &transaction.backups {
        match &backup.backup_name {
            Some(backup_name) => {
                let bytes = storage.read_chunk(backup_name)?;
                storage.write_chunk_atomic(&backup.canonical_name, &bytes)?;
            }
            None => {
                storage.delete_chunk(&backup.canonical_name)?;
            }
        }
    }
    storage.sync()?;
    Ok(())
}

pub(super) fn cleanup_staged_chunks(storage: &crate::storage::Storage, names: &[String]) {
    for name in names {
        let _ = storage.delete_chunk(name);
    }
    let _ = storage.sync();
}

pub(super) fn recover_file_replace_transaction(
    router: &mut RpcRouter,
) -> Result<(), crate::error::Error> {
    let Some(session) = router.session.as_mut() else {
        return Ok(());
    };
    let vault_key = *session.vault_key();
    let store = tx_store(&router.storage, &vault_key);
    if let Some(record) = store.read_participant_record()? {
        let current_revision = session
            .catalog()
            .find_by_id(record.payload.node_id)
            .map(|node| node.source_revision)
            .unwrap_or(0);
        let recovering_store = DurableTxStore::new(
            &router.storage,
            &vault_key,
            FileReplaceParticipant {
                current_revision: Some(current_revision),
            },
        );
        return recovering_store.recover_participant();
    }

    let Some(pending) = read_file_replace_marker(&router.storage, &vault_key)? else {
        return Ok(());
    };
    let transaction = pending.payload;
    let current_revision = session
        .catalog()
        .find_by_id(transaction.node_id)
        .map(|node| node.source_revision)
        .unwrap_or(0);

    if pending.phase == DurableTxPhase::Committing
        && current_revision >= transaction.new_source_revision
    {
        cleanup_file_replace_marker(&router.storage, &vault_key, &transaction)?;
        return Ok(());
    }

    restore_file_replace_marker_payload(&router.storage, &transaction)?;
    cleanup_file_replace_marker(&router.storage, &vault_key, &transaction)?;
    Ok(())
}

#[cfg(test)]
pub(super) fn has_file_replace_transaction_marker(router: &RpcRouter) -> bool {
    let Some(session) = router.session.as_ref() else {
        return false;
    };
    let marker_name = file_replace_tx_marker_name(session.vault_key());
    router.storage.chunk_exists(&marker_name).unwrap_or(false)
}

#[cfg(test)]
mod tests {
    use super::*;

    #[test]
    fn legacy_file_replace_marker_reads_as_committing_payload() {
        let temp = tempfile::TempDir::new().expect("temp dir");
        let storage = crate::storage::Storage::new(temp.path()).expect("storage");
        let key = [3u8; KEY_SIZE];
        let transaction = FileReplaceTransaction {
            version: FILE_REPLACE_TX_VERSION,
            node_id: 7,
            old_source_revision: 10,
            new_source_revision: 11,
            backups: vec![FileReplaceChunkBackup {
                canonical_name: crate::crypto::chunk_name_u64(&key, b"canonical", 0),
                backup_name: None,
            }],
            staged_chunks: Vec::new(),
        };
        let marker_name = file_replace_tx_marker_name(&key);
        let plaintext = serde_json::to_vec(&transaction).expect("serialize legacy");
        let encrypted =
            crate::crypto::encrypt(&plaintext, &key, marker_name.as_bytes()).expect("encrypt");
        storage
            .write_chunk_atomic(&marker_name, &encrypted)
            .expect("write marker");

        let pending = read_file_replace_marker(&storage, &key)
            .expect("read")
            .expect("pending tx");
        assert_eq!(pending.phase, DurableTxPhase::Committing);
        assert_eq!(pending.payload.node_id, 7);
        assert_eq!(pending.payload.new_source_revision, 11);
    }
}
