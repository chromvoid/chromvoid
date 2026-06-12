use serde::{Deserialize, Serialize};

use crate::crypto::{decrypt, encrypt};
use crate::durable_tx::{
    DurableTxArtifactStore, DurableTxParticipant, DurableTxPhase, DurableTxRecord,
};
use crate::error::{Error, Result};
use crate::storage::{Storage, StorageArtifact};
use crate::types::KEY_SIZE;

use super::chunks::{delete_chunks, rollback_staged_chunks};

pub(super) const REKEY_TX_VERSION: u8 = 1;
const REKEY_TX_KIND: &str = "vault_rekey";
const REKEY_MARKER_V2_VERSION: u8 = 2;
const REKEY_MARKER_V2_KIND: &str = "vault_rekey_marker";
const REKEY_MARKER_V2_AAD: &[u8] = b"vault:rekey:v2";

#[derive(Debug, Clone, Serialize, Deserialize)]
pub(super) struct RekeyTransaction {
    pub(super) version: u8,
    pub(super) phase: DurableTxPhase,
    pub(super) old_chunks: Vec<String>,
    pub(super) new_chunks: Vec<String>,
    pub(super) derivative_chunks: Vec<String>,
}

#[derive(Debug, Clone, Serialize, Deserialize)]
struct EncryptedRekeyMarkerV2 {
    version: u8,
    kind: String,
    old_recipient: Vec<u8>,
    new_recipient: Vec<u8>,
}

#[derive(Debug, Clone, Serialize, Deserialize)]
struct RekeyMarkerPayloadV2 {
    version: u8,
    phase: DurableTxPhase,
    old_chunks: Vec<String>,
    new_chunks: Vec<String>,
    derivative_chunks: Vec<String>,
}

impl From<&RekeyTransaction> for RekeyMarkerPayloadV2 {
    fn from(transaction: &RekeyTransaction) -> Self {
        Self {
            version: transaction.version,
            phase: transaction.phase,
            old_chunks: transaction.old_chunks.clone(),
            new_chunks: transaction.new_chunks.clone(),
            derivative_chunks: transaction.derivative_chunks.clone(),
        }
    }
}

impl RekeyMarkerPayloadV2 {
    fn into_transaction(self) -> Result<RekeyTransaction> {
        if self.version != REKEY_TX_VERSION {
            return Err(Error::InvalidDataFormat(format!(
                "unsupported rekey transaction version: {}",
                self.version
            )));
        }

        Ok(RekeyTransaction {
            version: self.version,
            phase: self.phase,
            old_chunks: self.old_chunks,
            new_chunks: self.new_chunks,
            derivative_chunks: self.derivative_chunks,
        })
    }
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
        // Safety guard (H4): only finish the commit — i.e. delete the OLD
        // chunks — once every NEW chunk is confirmed present. If the crash
        // happened before all new chunks were durably written, deleting the old
        // chunks here would destroy the only intact copy of the catalog/blobs.
        // In that case leave the old chunks in place; the vault remains
        // recoverable under the old key.
        for name in &record.payload.new_chunks {
            if !storage.chunk_exists(name)? {
                return Err(Error::InvalidDataFormat(format!(
                    "rekey committing marker references missing new chunk: {name}"
                )));
            }
        }

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

fn load_legacy_rekey_marker(storage: &Storage) -> Result<Option<RekeyTransaction>> {
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

pub(super) fn load_rekey_marker_for_key(
    storage: &Storage,
    vault_key: &[u8; KEY_SIZE],
) -> Result<Option<RekeyTransaction>> {
    if let Some(transaction) = load_encrypted_rekey_marker_for_key(storage, vault_key)? {
        return Ok(Some(transaction));
    }

    load_legacy_rekey_marker(storage)
}

pub(in crate::vault) fn recover_rekey_marker_for_key(
    storage: &Storage,
    vault_key: &[u8; KEY_SIZE],
) -> Result<()> {
    let Some(transaction) = load_encrypted_rekey_marker_for_key(storage, vault_key)? else {
        return Ok(());
    };

    recover_transaction_record(storage, transaction)
}

pub(super) fn write_rekey_marker(
    storage: &Storage,
    old_key: &[u8; KEY_SIZE],
    new_key: &[u8; KEY_SIZE],
    transaction: &RekeyTransaction,
) -> Result<()> {
    let payload = serde_json::to_vec(&RekeyMarkerPayloadV2::from(transaction))?;
    let marker = EncryptedRekeyMarkerV2 {
        version: REKEY_MARKER_V2_VERSION,
        kind: REKEY_MARKER_V2_KIND.to_string(),
        old_recipient: encrypt(&payload, old_key, REKEY_MARKER_V2_AAD)?,
        new_recipient: encrypt(&payload, new_key, REKEY_MARKER_V2_AAD)?,
    };
    let bytes = serde_json::to_vec(&marker)?;
    storage.write_artifact_atomic(StorageArtifact::RekeyTransactionV2, &bytes)
}

pub(super) fn delete_rekey_marker(storage: &Storage) -> Result<()> {
    transaction_store(storage).delete()?;
    storage.remove_artifact(StorageArtifact::RekeyTransactionV2)
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
    transaction_store(storage).recover_record(record)?;
    delete_rekey_marker(storage)
}

fn load_encrypted_rekey_marker_for_key(
    storage: &Storage,
    vault_key: &[u8; KEY_SIZE],
) -> Result<Option<RekeyTransaction>> {
    let Some(bytes) = storage.read_artifact(StorageArtifact::RekeyTransactionV2)? else {
        return Ok(None);
    };
    let Ok(marker) = serde_json::from_slice::<EncryptedRekeyMarkerV2>(&bytes) else {
        return Ok(None);
    };
    if marker.version != REKEY_MARKER_V2_VERSION || marker.kind != REKEY_MARKER_V2_KIND {
        return Ok(None);
    }

    for ciphertext in [&marker.old_recipient, &marker.new_recipient] {
        let Ok(payload_bytes) = decrypt(ciphertext, vault_key, REKEY_MARKER_V2_AAD) else {
            continue;
        };
        let payload = serde_json::from_slice::<RekeyMarkerPayloadV2>(&payload_bytes)?;
        return payload.into_transaction().map(Some);
    }

    Ok(None)
}
