use serde::{de::DeserializeOwned, Serialize};

use crate::error::Result;
use crate::storage::Storage;
use crate::types::KEY_SIZE;

use super::{
    codec, recovery, DurableTxEncryptedParticipant, DurableTxParticipant, DurableTxPhase,
    DurableTxRecord,
};

pub(crate) struct DurableTxStore<'a, P> {
    storage: &'a Storage,
    vault_key: &'a [u8; KEY_SIZE],
    participant: P,
}

impl<'a, P> DurableTxStore<'a, P>
where
    P: DurableTxParticipant,
{
    pub(crate) fn new(storage: &'a Storage, vault_key: &'a [u8; KEY_SIZE], participant: P) -> Self {
        Self {
            storage,
            vault_key,
            participant,
        }
    }

    pub(crate) fn marker_name(&self) -> String {
        debug_assert!(!self.participant.marker_context().is_empty());
        self.participant.marker_name(self.vault_key)
    }

    #[cfg(test)]
    pub(crate) fn exists(&self) -> Result<bool> {
        self.storage.chunk_exists(&self.marker_name())
    }

    pub(crate) fn read_record<TPayload>(&self) -> Result<Option<DurableTxRecord<TPayload>>>
    where
        TPayload: DeserializeOwned,
    {
        let Some(plaintext) = self.read_plaintext()? else {
            return Ok(None);
        };
        Ok(codec::decode_record::<P, TPayload>(&plaintext))
    }

    pub(crate) fn read_participant_record(&self) -> Result<Option<DurableTxRecord<P::Payload>>> {
        let Some(record) = self.read_record::<P::Payload>()? else {
            return Ok(None);
        };
        Ok(codec::validate_participant_record(
            &self.participant,
            record,
        ))
    }

    pub(crate) fn read_legacy_payload<TPayload>(&self) -> Result<Option<TPayload>>
    where
        TPayload: DeserializeOwned,
    {
        let Some(plaintext) = self.read_plaintext()? else {
            return Ok(None);
        };
        Ok(serde_json::from_slice::<TPayload>(&plaintext).ok())
    }

    pub(crate) fn write_record<TPayload>(
        &self,
        tx_id: impl Into<String>,
        phase: DurableTxPhase,
        payload: &TPayload,
    ) -> Result<()>
    where
        TPayload: Serialize,
    {
        let marker_name = self.marker_name();
        let plaintext = codec::encode_record::<P, TPayload>(tx_id, phase, payload)?;
        let encrypted = crate::crypto::encrypt(&plaintext, self.vault_key, marker_name.as_bytes())?;
        self.storage.write_chunk_atomic(&marker_name, &encrypted)?;
        self.storage.sync()?;
        Ok(())
    }

    pub(crate) fn write_staging(&self, tx_id: impl Into<String>, payload: &P::Payload) -> Result<()>
    where
        P::Payload: Serialize,
    {
        self.write_record(tx_id, DurableTxPhase::Staging, payload)
    }

    pub(crate) fn write_committing(
        &self,
        tx_id: impl Into<String>,
        payload: &P::Payload,
    ) -> Result<()>
    where
        P::Payload: Serialize,
    {
        self.write_record(tx_id, DurableTxPhase::Committing, payload)
    }

    #[cfg(test)]
    pub(crate) fn write_phase<TPayload>(
        &self,
        current: &DurableTxRecord<TPayload>,
        phase: DurableTxPhase,
    ) -> Result<()>
    where
        TPayload: Serialize,
    {
        self.write_record(current.tx_id.clone(), phase, &current.payload)
    }

    pub(crate) fn delete_record(&self) -> Result<()> {
        self.storage.delete_chunk(&self.marker_name())?;
        self.storage.sync()?;
        Ok(())
    }

    pub(crate) fn delete(&self) -> Result<()> {
        self.delete_record()
    }

    pub(crate) fn recover_participant(&self) -> Result<()> {
        let Some(record) = self.read_participant_record()? else {
            return Ok(());
        };
        recovery::recover_participant_record(
            self.storage,
            &self.participant,
            Some(self.vault_key),
            &record,
        )?;
        self.delete()
    }

    pub(crate) fn recover_encrypted_participant(&self) -> Result<()>
    where
        P: DurableTxEncryptedParticipant,
    {
        let Some(record) = self.read_participant_record()? else {
            return Ok(());
        };
        recovery::recover_encrypted_participant_record(
            self.storage,
            &self.participant,
            self.vault_key,
            &record,
        )?;
        self.delete()
    }

    fn read_plaintext(&self) -> Result<Option<Vec<u8>>> {
        let marker_name = self.marker_name();
        if !self.storage.chunk_exists(&marker_name)? {
            return Ok(None);
        }
        let encrypted = self.storage.read_chunk(&marker_name)?;
        match crate::crypto::decrypt(&encrypted, self.vault_key, marker_name.as_bytes()) {
            Ok(plaintext) => Ok(Some(plaintext)),
            Err(_) => Ok(None),
        }
    }
}
