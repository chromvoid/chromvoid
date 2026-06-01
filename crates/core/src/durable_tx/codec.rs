use serde::{de::DeserializeOwned, Serialize};

use crate::error::Result;

use super::{DurableTxParticipant, DurableTxPhase, DurableTxRecord};

pub(super) fn decode_record<P, TPayload>(bytes: &[u8]) -> Option<DurableTxRecord<TPayload>>
where
    P: DurableTxParticipant,
    TPayload: DeserializeOwned,
{
    match serde_json::from_slice::<DurableTxRecord<TPayload>>(bytes) {
        Ok(record)
            if record.version == P::VERSION
                && record.kind == P::KIND
                && !record.tx_id.is_empty() =>
        {
            Some(record)
        }
        _ => None,
    }
}

pub(super) fn encode_record<P, TPayload>(
    tx_id: impl Into<String>,
    phase: DurableTxPhase,
    payload: &TPayload,
) -> Result<Vec<u8>>
where
    P: DurableTxParticipant,
    TPayload: Serialize,
{
    let record = DurableTxRecord {
        version: P::VERSION,
        kind: P::KIND.to_string(),
        tx_id: tx_id.into(),
        phase,
        payload,
    };
    serde_json::to_vec(&record).map_err(Into::into)
}

pub(super) fn validate_participant_record<P>(
    participant: &P,
    record: DurableTxRecord<P::Payload>,
) -> Option<DurableTxRecord<P::Payload>>
where
    P: DurableTxParticipant,
{
    if participant.validate_payload(&record.payload) {
        Some(record)
    } else {
        None
    }
}
