use serde::{Deserialize, Serialize};

use crate::catalog::CatalogMediaInfo;
use crate::durable_tx::{DurableTxParticipant, DurableTxRecord, DurableTxStore};
use crate::storage::Storage;
use crate::types::KEY_SIZE;

use super::super::super::super::state::RpcRouter;
use super::context::UploadVaultContext;
use super::error::{UploadCommandError, UploadResult};

pub(super) const UPLOAD_TX_VERSION: u8 = 1;
const UPLOAD_TX_KIND: &str = "catalog-upload-session";
const UPLOAD_TX_MARKER_CONTEXT: &[u8] = b"catalog-upload-session-tx:v1";

#[derive(Debug, Clone, Serialize, Deserialize)]
pub(super) struct UploadTempChunk {
    pub(super) index: u32,
    pub(super) temp_name: String,
    pub(super) canonical_name: String,
    pub(super) plain_len: u64,
}

#[derive(Debug, Clone, Serialize, Deserialize)]
pub(super) struct UploadChunkBackup {
    pub(super) canonical_name: String,
    pub(super) backup_name: String,
}

#[derive(Debug, Clone, Serialize, Deserialize)]
pub(super) struct UploadSessionTransaction {
    pub(super) version: u8,
    pub(super) node_id: u64,
    pub(super) parent_path: String,
    pub(super) name: String,
    pub(super) mime_type: Option<String>,
    pub(super) chunk_size: u32,
    pub(super) total_size: Option<u64>,
    pub(super) uploaded_bytes: u64,
    pub(super) is_new: bool,
    pub(super) old_size: Option<u64>,
    pub(super) old_modtime: Option<u64>,
    pub(super) old_source_revision: Option<u64>,
    pub(super) old_media_info: Option<CatalogMediaInfo>,
    pub(super) old_media_inspected_revision: Option<u64>,
    pub(super) temp_chunks: Vec<UploadTempChunk>,
    pub(super) backups: Vec<UploadChunkBackup>,
    pub(super) stale_tail_names: Vec<String>,
    pub(super) new_modtime: Option<u64>,
    pub(super) new_source_revision: Option<u64>,
}

#[derive(Clone, Copy)]
struct UploadSessionParticipant {
    catalog_committed: bool,
}

impl DurableTxParticipant for UploadSessionParticipant {
    const KIND: &'static str = UPLOAD_TX_KIND;
    const VERSION: u8 = UPLOAD_TX_VERSION;
    type Payload = UploadSessionTransaction;

    fn marker_context(&self) -> &'static [u8] {
        UPLOAD_TX_MARKER_CONTEXT
    }

    fn marker_name(&self, vault_key: &[u8; KEY_SIZE]) -> String {
        upload_session_marker_name(vault_key)
    }

    fn validate_payload(&self, payload: &Self::Payload) -> bool {
        payload.version == UPLOAD_TX_VERSION
            && payload.node_id > 0
            && !payload.name.is_empty()
            && payload.chunk_size > 0
    }

    fn rollback_staging(
        &self,
        storage: &Storage,
        _vault_key: Option<&[u8; KEY_SIZE]>,
        record: &DurableTxRecord<Self::Payload>,
    ) -> crate::error::Result<()> {
        super::writer::cleanup_upload_temp_and_backups(storage, &record.payload, false)
    }

    fn recover_committing(
        &self,
        storage: &Storage,
        _vault_key: Option<&[u8; KEY_SIZE]>,
        record: &DurableTxRecord<Self::Payload>,
    ) -> crate::error::Result<()> {
        if self.catalog_committed {
            Ok(())
        } else {
            super::writer::restore_upload_payload(storage, &record.payload)
        }
    }

    fn cleanup(
        &self,
        storage: &Storage,
        _vault_key: Option<&[u8; KEY_SIZE]>,
        record: &DurableTxRecord<Self::Payload>,
    ) -> crate::error::Result<()> {
        super::writer::cleanup_upload_temp_and_backups(
            storage,
            &record.payload,
            self.catalog_committed,
        )
    }
}

pub(in crate::rpc::router) fn recover_pending_upload_session(
    router: &mut RpcRouter,
) -> crate::error::Result<()> {
    let Some(session) = router.session.as_ref() else {
        return Ok(());
    };
    let vault_key = *session.vault_key();
    let probing_store = upload_tx_store(&router.storage, &vault_key, false);
    let Some(record) = probing_store.read_participant_record()? else {
        return Ok(());
    };
    let catalog_committed = upload_catalog_state_matches(session.catalog(), &record.payload);
    upload_tx_store(&router.storage, &vault_key, catalog_committed).recover_participant()
}

pub(super) fn abort_pending_upload_session(router: &mut RpcRouter) -> UploadResult<bool> {
    let context = UploadVaultContext::require(router)?;
    let Some(transaction) = read_pending_upload_transaction(router, &context)? else {
        return Ok(false);
    };
    cleanup_upload_marker(router, &context, &transaction, false)?;
    Ok(true)
}

pub(super) fn read_pending_upload_transaction(
    router: &RpcRouter,
    context: &UploadVaultContext,
) -> UploadResult<Option<UploadSessionTransaction>> {
    upload_tx_store(&router.storage, context.vault_key(), false)
        .read_participant_record()
        .map(|record| record.map(|record| record.payload))
        .map_err(|error| {
            UploadCommandError::internal(format!("Upload transaction read failed: {error}"))
        })
}

pub(super) fn cleanup_upload_marker(
    router: &RpcRouter,
    context: &UploadVaultContext,
    transaction: &UploadSessionTransaction,
    catalog_committed: bool,
) -> UploadResult<()> {
    super::writer::cleanup_upload_temp_and_backups(&router.storage, transaction, catalog_committed)
        .map_err(|error| UploadCommandError::internal(format!("Upload cleanup failed: {error}")))?;
    upload_tx_store(&router.storage, context.vault_key(), catalog_committed)
        .delete()
        .map_err(|error| {
            UploadCommandError::internal(format!("Upload transaction cleanup failed: {error}"))
        })
}

pub(super) fn write_upload_marker(
    router: &RpcRouter,
    context: &UploadVaultContext,
    transaction: &UploadSessionTransaction,
    phase: crate::durable_tx::DurableTxPhase,
) -> UploadResult<()> {
    let store = upload_tx_store(&router.storage, context.vault_key(), false);
    store
        .write_record(upload_tx_id(transaction), phase, transaction)
        .map_err(|error| {
            UploadCommandError::internal(format!("Upload transaction write failed: {error}"))
        })
}

fn upload_tx_store<'a>(
    storage: &'a Storage,
    vault_key: &'a [u8; KEY_SIZE],
    catalog_committed: bool,
) -> DurableTxStore<'a, UploadSessionParticipant> {
    DurableTxStore::new(
        storage,
        vault_key,
        UploadSessionParticipant { catalog_committed },
    )
}

fn upload_catalog_state_matches(
    catalog: &crate::catalog::CatalogManager,
    transaction: &UploadSessionTransaction,
) -> bool {
    let Some(node) = catalog.find_by_id(transaction.node_id) else {
        return false;
    };
    node.is_file()
        && Some(node.size) == transaction.total_size
        && transaction
            .new_source_revision
            .map(|revision| node.source_revision == revision)
            .unwrap_or(true)
}

fn upload_session_marker_name(vault_key: &[u8; KEY_SIZE]) -> String {
    crate::crypto::chunk_name_u64(vault_key, UPLOAD_TX_MARKER_CONTEXT, 0)
}

fn upload_tx_id(transaction: &UploadSessionTransaction) -> String {
    format!("catalog-upload-{}", transaction.node_id)
}
