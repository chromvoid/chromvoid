use serde::{de::DeserializeOwned, Serialize};

use crate::error::Result;
use crate::storage::{Storage, StorageArtifact};

use super::{codec, recovery, DurableTxParticipant, DurableTxPhase, DurableTxRecord};

pub(crate) struct DurableTxArtifactStore<'a, P> {
    storage: &'a Storage,
    artifact: StorageArtifact,
    participant: P,
}

impl<'a, P> DurableTxArtifactStore<'a, P>
where
    P: DurableTxParticipant,
{
    pub(crate) fn new(storage: &'a Storage, artifact: StorageArtifact, participant: P) -> Self {
        Self {
            storage,
            artifact,
            participant,
        }
    }

    #[cfg(test)]
    pub(crate) fn exists(&self) -> Result<bool> {
        self.storage.artifact_exists(self.artifact)
    }

    pub(crate) fn read_record<TPayload>(&self) -> Result<Option<DurableTxRecord<TPayload>>>
    where
        TPayload: DeserializeOwned,
    {
        let Some(bytes) = self.storage.read_artifact(self.artifact)? else {
            return Ok(None);
        };
        Ok(codec::decode_record::<P, TPayload>(&bytes))
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

    pub(crate) fn read_legacy_payload_strict<TPayload>(&self) -> Result<Option<TPayload>>
    where
        TPayload: DeserializeOwned,
    {
        let Some(bytes) = self.storage.read_artifact(self.artifact)? else {
            return Ok(None);
        };
        serde_json::from_slice::<TPayload>(&bytes)
            .map(Some)
            .map_err(Into::into)
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
        let bytes = codec::encode_record::<P, TPayload>(tx_id, phase, payload)?;
        self.storage.write_artifact_atomic(self.artifact, &bytes)
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

    pub(crate) fn write_legacy_payload<TPayload>(&self, payload: &TPayload) -> Result<()>
    where
        TPayload: Serialize,
    {
        let bytes = serde_json::to_vec(payload)?;
        self.storage.write_artifact_atomic(self.artifact, &bytes)
    }

    pub(crate) fn delete(&self) -> Result<()> {
        self.storage.remove_artifact(self.artifact)
    }

    pub(crate) fn recover_record(&self, record: DurableTxRecord<P::Payload>) -> Result<()> {
        let Some(record) = codec::validate_participant_record(&self.participant, record) else {
            return Ok(());
        };
        recovery::recover_participant_record(self.storage, &self.participant, None, &record)?;
        self.delete()
    }

    pub(crate) fn recover_participant(&self) -> Result<()> {
        let Some(record) = self.read_participant_record()? else {
            return Ok(());
        };
        self.recover_record(record)
    }
}
