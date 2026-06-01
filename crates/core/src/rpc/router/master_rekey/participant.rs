use crate::durable_tx::{DurableTxParticipant, DurableTxRecord};
use crate::storage::Storage;

use super::service::MasterRekeyService;
use super::types::{MasterRekeyTransaction, MASTER_REKEY_TX_KIND};

#[derive(Clone)]
pub(in crate::rpc::router::master_rekey) struct MasterRekeyParticipant;

impl DurableTxParticipant for MasterRekeyParticipant {
    const KIND: &'static str = MASTER_REKEY_TX_KIND;
    const VERSION: u8 = 1;
    type Payload = MasterRekeyTransaction;

    fn marker_context(&self) -> &'static [u8] {
        b"master:rekey:tx:v1"
    }

    fn marker_name(&self, vault_key: &[u8; crate::types::KEY_SIZE]) -> String {
        crate::crypto::chunk_name_u64(vault_key, self.marker_context(), 0)
    }

    fn validate_payload(&self, payload: &Self::Payload) -> bool {
        MasterRekeyService::validate_transaction_payload(payload).is_ok()
    }

    fn rollback_staging(
        &self,
        storage: &Storage,
        _vault_key: Option<&[u8; crate::types::KEY_SIZE]>,
        record: &DurableTxRecord<Self::Payload>,
    ) -> crate::error::Result<()> {
        MasterRekeyService::new(storage)
            .rollback_staged_artifacts(&record.payload)
            .map_err(|error| std::io::Error::other(error.into_message()))?;
        Ok(())
    }

    fn recover_committing(
        &self,
        storage: &Storage,
        _vault_key: Option<&[u8; crate::types::KEY_SIZE]>,
        record: &DurableTxRecord<Self::Payload>,
    ) -> crate::error::Result<()> {
        MasterRekeyService::new(storage)
            .recover_committing_artifacts(&record.payload)
            .map_err(|error| std::io::Error::other(error.into_message()))?;
        Ok(())
    }
}
