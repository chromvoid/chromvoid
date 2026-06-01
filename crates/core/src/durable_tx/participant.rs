use serde::{de::DeserializeOwned, Serialize};

use crate::error::Result;
use crate::storage::Storage;
use crate::types::KEY_SIZE;

use super::DurableTxRecord;

pub(crate) trait DurableTxParticipant {
    const KIND: &'static str;
    const VERSION: u8;
    type Payload: Clone + DeserializeOwned + Serialize;

    fn marker_context(&self) -> &'static [u8];
    fn marker_name(&self, vault_key: &[u8; KEY_SIZE]) -> String;

    fn validate_payload(&self, _payload: &Self::Payload) -> bool {
        true
    }

    fn rollback_staging(
        &self,
        _storage: &Storage,
        _vault_key: Option<&[u8; KEY_SIZE]>,
        _record: &DurableTxRecord<Self::Payload>,
    ) -> Result<()> {
        Ok(())
    }

    fn recover_committing(
        &self,
        _storage: &Storage,
        _vault_key: Option<&[u8; KEY_SIZE]>,
        _record: &DurableTxRecord<Self::Payload>,
    ) -> Result<()> {
        Ok(())
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

pub(crate) trait DurableTxEncryptedParticipant: DurableTxParticipant {
    fn rollback_staging_encrypted(
        &self,
        storage: &Storage,
        vault_key: &[u8; KEY_SIZE],
        record: &DurableTxRecord<Self::Payload>,
    ) -> Result<()>;

    fn recover_committing_encrypted(
        &self,
        storage: &Storage,
        vault_key: &[u8; KEY_SIZE],
        record: &DurableTxRecord<Self::Payload>,
    ) -> Result<()>;

    fn cleanup_encrypted(
        &self,
        storage: &Storage,
        vault_key: &[u8; KEY_SIZE],
        record: &DurableTxRecord<Self::Payload>,
    ) -> Result<()>;
}
