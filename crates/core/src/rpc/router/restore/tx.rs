//! Durable restore transaction marker support.

use serde::{Deserialize, Serialize};

use crate::crypto::keystore::Keystore;
use crate::durable_tx::{
    DurableTxArtifactStore, DurableTxParticipant, DurableTxPhase, DurableTxRecord,
};
use crate::error::{Error, Result};
use crate::storage::{Storage, StorageArtifact};
use crate::types::KEY_SIZE;

use super::super::state::RpcRouter;

const RESTORE_TX_VERSION: u8 = 1;
const RESTORE_TX_KIND: &str = "restore";

#[derive(Debug, Clone, Copy, PartialEq, Eq, Serialize, Deserialize)]
#[serde(rename_all = "snake_case")]
pub(in crate::rpc::router::restore) enum RestoreTransactionKind {
    Local,
    Admin,
}

#[derive(Debug, Clone, Copy, PartialEq, Eq, Serialize, Deserialize)]
#[serde(rename_all = "snake_case")]
pub(in crate::rpc::router::restore) enum RestoreStorageArtifact {
    FormatVersion,
    Salt,
    MasterSalt,
    MasterVerify,
}

impl RestoreStorageArtifact {
    pub(in crate::rpc::router::restore) fn storage_artifact(self) -> StorageArtifact {
        match self {
            RestoreStorageArtifact::FormatVersion => StorageArtifact::FormatVersion,
            RestoreStorageArtifact::Salt => StorageArtifact::Salt,
            RestoreStorageArtifact::MasterSalt => StorageArtifact::MasterSalt,
            RestoreStorageArtifact::MasterVerify => StorageArtifact::MasterVerify,
        }
    }
}

#[derive(Debug, Clone, Serialize, Deserialize)]
pub(in crate::rpc::router::restore) struct RestoreTransactionPayload {
    version: u8,
    kind: RestoreTransactionKind,
    restore_id: String,
    expected_chunks: Vec<String>,
    written_artifacts: Vec<RestoreStorageArtifact>,
    pepper_committed: bool,
}

impl RestoreTransactionPayload {
    pub(in crate::rpc::router::restore) fn new(
        kind: RestoreTransactionKind,
        restore_id: impl Into<String>,
        expected_chunks: impl IntoIterator<Item = String>,
        written_artifacts: impl IntoIterator<Item = RestoreStorageArtifact>,
    ) -> Self {
        let mut expected_chunks: Vec<String> = expected_chunks.into_iter().collect();
        expected_chunks.sort();
        expected_chunks.dedup();
        let mut written_artifacts: Vec<RestoreStorageArtifact> =
            written_artifacts.into_iter().collect();
        written_artifacts.sort_by_key(|artifact| *artifact as u8);
        written_artifacts.dedup();
        Self {
            version: RESTORE_TX_VERSION,
            kind,
            restore_id: restore_id.into(),
            expected_chunks,
            written_artifacts,
            pepper_committed: false,
        }
    }

    pub(in crate::rpc::router::restore) fn mark_pepper_committed(&mut self) {
        self.pepper_committed = true;
    }
}

struct RestoreParticipant<'a> {
    keystore: Option<&'a dyn Keystore>,
}

impl DurableTxParticipant for RestoreParticipant<'_> {
    const KIND: &'static str = RESTORE_TX_KIND;
    const VERSION: u8 = RESTORE_TX_VERSION;
    type Payload = RestoreTransactionPayload;

    fn marker_context(&self) -> &'static [u8] {
        b"restore:tx:v1"
    }

    fn marker_name(&self, vault_key: &[u8; KEY_SIZE]) -> String {
        crate::crypto::chunk_name_u64(vault_key, self.marker_context(), 0)
    }

    fn validate_payload(&self, payload: &Self::Payload) -> bool {
        payload.version == RESTORE_TX_VERSION && !payload.restore_id.is_empty()
    }

    fn rollback_staging(
        &self,
        storage: &Storage,
        _vault_key: Option<&[u8; KEY_SIZE]>,
        record: &DurableTxRecord<Self::Payload>,
    ) -> Result<()> {
        rollback_restore_payload(storage, self.keystore, &record.payload, false)
    }

    fn recover_committing(
        &self,
        storage: &Storage,
        _vault_key: Option<&[u8; KEY_SIZE]>,
        record: &DurableTxRecord<Self::Payload>,
    ) -> Result<()> {
        let payload = &record.payload;
        if payload.pepper_committed && restore_payload_complete(storage, payload)? {
            return Ok(());
        }
        rollback_restore_payload(storage, self.keystore, payload, payload.pepper_committed)
    }
}

fn tx_store<'a>(
    storage: &'a Storage,
    keystore: Option<&'a dyn Keystore>,
) -> DurableTxArtifactStore<'a, RestoreParticipant<'a>> {
    DurableTxArtifactStore::new(
        storage,
        StorageArtifact::RestoreTransaction,
        RestoreParticipant { keystore },
    )
}

pub(in crate::rpc::router::restore) fn write_restore_transaction(
    storage: &Storage,
    phase: DurableTxPhase,
    payload: &RestoreTransactionPayload,
) -> Result<()> {
    let store = tx_store(storage, None);
    match phase {
        DurableTxPhase::Staging => store.write_staging(payload.restore_id.clone(), payload),
        DurableTxPhase::Committing => store.write_committing(payload.restore_id.clone(), payload),
    }
}

pub(in crate::rpc::router::restore) fn delete_restore_transaction(storage: &Storage) -> Result<()> {
    tx_store(storage, None).delete()
}

pub(in crate::rpc::router) fn recover_restore_transaction(router: &mut RpcRouter) -> Result<()> {
    let keystore = router.keystore.as_deref();
    tx_store(&router.storage, keystore).recover_participant()
}

pub(in crate::rpc::router) fn rollback_restore_transaction_marker(
    router: &mut RpcRouter,
) -> Result<()> {
    let keystore = router.keystore.as_deref();
    let store = tx_store(&router.storage, keystore);
    let Some(record) = store.read_participant_record()? else {
        return Ok(());
    };
    rollback_restore_payload(
        &router.storage,
        keystore,
        &record.payload,
        record.payload.pepper_committed,
    )?;
    store.delete()
}

fn restore_payload_complete(
    storage: &Storage,
    payload: &RestoreTransactionPayload,
) -> Result<bool> {
    for chunk_name in &payload.expected_chunks {
        if !storage.chunk_exists(chunk_name)? {
            return Ok(false);
        }
    }
    for artifact in &payload.written_artifacts {
        if !storage.artifact_exists(artifact.storage_artifact())? {
            return Ok(false);
        }
    }
    Ok(true)
}

fn rollback_restore_payload(
    storage: &Storage,
    keystore: Option<&dyn Keystore>,
    payload: &RestoreTransactionPayload,
    require_keystore: bool,
) -> Result<()> {
    if require_keystore && keystore.is_none() {
        return Err(Error::KeystoreUnavailable(
            "restore transaction recovery requires keystore".to_string(),
        ));
    }
    for chunk_name in &payload.expected_chunks {
        let _ = storage.delete_chunk(chunk_name);
    }
    for artifact in &payload.written_artifacts {
        let _ = storage.remove_artifact(artifact.storage_artifact());
    }
    if let Some(keystore) = keystore {
        let _ = crate::crypto::StoragePepper::delete(keystore);
    }
    storage.sync()
}
