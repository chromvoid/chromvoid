use serde::{Deserialize, Serialize};

use crate::durable_tx::{
    DurableTxArtifactStore, DurableTxParticipant, DurableTxPhase, DurableTxRecord,
};
use crate::error::{Error, Result};
use crate::storage::{Storage, StorageArtifact};
use crate::types::KEY_SIZE;

use super::chunks::{delete_chunks, rollback_staged_chunks};

pub(super) const REKEY_TX_VERSION: u8 = 1;
const REKEY_TX_KIND: &str = "vault_rekey";

#[derive(Debug, Clone, Serialize, Deserialize)]
pub(super) struct RekeyTransaction {
    pub(super) version: u8,
    pub(super) phase: DurableTxPhase,
    pub(super) old_chunks: Vec<String>,
    pub(super) new_chunks: Vec<String>,
    pub(super) derivative_chunks: Vec<String>,
}

struct RekeyParticipant;

impl DurableTxParticipant for RekeyParticipant {
    const KIND: &'static str = REKEY_TX_KIND;
    const VERSION: u8 = REKEY_TX_VERSION;
    type Payload = RekeyTransaction;

    fn marker_context(&self) -> &'static [u8] {
        b"vault:rekey:tx:v1"
    }

    fn marker_name(&self, vault_key: &[u8; KEY_SIZE]) -> String {
        crate::crypto::chunk_name_u64(vault_key, self.marker_context(), 0)
    }

    fn validate_payload(&self, payload: &Self::Payload) -> bool {
        payload.version == REKEY_TX_VERSION
    }

    fn rollback_staging(
        &self,
        storage: &Storage,
        _vault_key: Option<&[u8; KEY_SIZE]>,
        record: &DurableTxRecord<Self::Payload>,
    ) -> Result<()> {
        rollback_staged_chunks(storage, &record.payload.new_chunks);
        Ok(())
    }

    fn recover_committing(
        &self,
        storage: &Storage,
        _vault_key: Option<&[u8; KEY_SIZE]>,
        record: &DurableTxRecord<Self::Payload>,
    ) -> Result<()> {
        let _ = delete_chunks(storage, &record.payload.old_chunks)?;
        let _ = delete_chunks(storage, &record.payload.derivative_chunks)?;
        Ok(())
    }

    fn cleanup(
        &self,
        storage: &Storage,
        _vault_key: Option<&[u8; KEY_SIZE]>,
        _record: &DurableTxRecord<Self::Payload>,
    ) -> Result<()> {
        storage.sync()
    }
}

fn transaction_store(storage: &Storage) -> DurableTxArtifactStore<'_, RekeyParticipant> {
    DurableTxArtifactStore::new(storage, StorageArtifact::RekeyTransaction, RekeyParticipant)
}

pub(super) fn load_rekey_marker(storage: &Storage) -> Result<Option<RekeyTransaction>> {
    transaction_store(storage)
        .read_legacy_payload_strict::<RekeyTransaction>()?
        .map(|transaction| {
            if transaction.version == REKEY_TX_VERSION {
                Ok(transaction)
            } else {
                Err(Error::InvalidDataFormat(format!(
                    "unsupported rekey transaction version: {}",
                    transaction.version
                )))
            }
        })
        .transpose()
}

pub(super) fn write_rekey_marker(storage: &Storage, transaction: &RekeyTransaction) -> Result<()> {
    transaction_store(storage).write_legacy_payload(transaction)
}

pub(super) fn delete_rekey_marker(storage: &Storage) -> Result<()> {
    transaction_store(storage).delete()
}

pub(super) fn recover_transaction_record(
    storage: &Storage,
    transaction: RekeyTransaction,
) -> Result<()> {
    let record = DurableTxRecord {
        version: REKEY_TX_VERSION,
        kind: REKEY_TX_KIND.to_string(),
        tx_id: "vault-rekey".to_string(),
        phase: transaction.phase,
        payload: transaction,
    };
    transaction_store(storage).recover_record(record)
}
