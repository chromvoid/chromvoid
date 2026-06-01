use crate::durable_tx::{DurableTxParticipant, DurableTxRecord};
use crate::error::Result;
use crate::storage::Storage;
use crate::types::KEY_SIZE;

use super::cleanup::cleanup_backup_chunks;
use super::recovery::recover_derivative_overwrite;
use super::types::DerivativeWriteTxPayload;

const DERIVATIVE_WRITE_TX_MARKER_CONTEXT: &[u8] = b"derivative-write-tx";

#[derive(Debug, Clone, Copy)]
pub(super) struct DerivativeWriteTxParticipant;

impl DurableTxParticipant for DerivativeWriteTxParticipant {
    const KIND: &'static str = "derivative-write";
    const VERSION: u8 = 1;
    type Payload = DerivativeWriteTxPayload;

    fn marker_context(&self) -> &'static [u8] {
        DERIVATIVE_WRITE_TX_MARKER_CONTEXT
    }

    fn marker_name(&self, vault_key: &[u8; KEY_SIZE]) -> String {
        crate::crypto::derivative_write_tx_marker_name(vault_key)
    }

    fn validate_payload(&self, payload: &Self::Payload) -> bool {
        payload.old_entry.is_some()
            && !payload.backup_chunks.is_empty()
            && !payload.new_meta_chunk_name.is_empty()
    }

    fn rollback_staging(
        &self,
        storage: &Storage,
        _vault_key: Option<&[u8; KEY_SIZE]>,
        record: &DurableTxRecord<Self::Payload>,
    ) -> Result<()> {
        cleanup_backup_chunks(storage, &record.payload);
        Ok(())
    }

    fn recover_committing(
        &self,
        storage: &Storage,
        vault_key: Option<&[u8; KEY_SIZE]>,
        record: &DurableTxRecord<Self::Payload>,
    ) -> Result<()> {
        let Some(vault_key) = vault_key else {
            return Ok(());
        };
        recover_derivative_overwrite(storage, vault_key, &record.payload)
    }

    fn cleanup(
        &self,
        _storage: &Storage,
        _vault_key: Option<&[u8; KEY_SIZE]>,
        _record: &DurableTxRecord<Self::Payload>,
    ) -> Result<()> {
        Ok(())
    }
}
