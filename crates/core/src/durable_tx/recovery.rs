use crate::error::Result;
use crate::storage::Storage;
use crate::types::KEY_SIZE;

use super::{DurableTxEncryptedParticipant, DurableTxParticipant, DurableTxPhase, DurableTxRecord};

pub(super) fn recover_participant_record<P>(
    storage: &Storage,
    participant: &P,
    vault_key: Option<&[u8; KEY_SIZE]>,
    record: &DurableTxRecord<P::Payload>,
) -> Result<()>
where
    P: DurableTxParticipant,
{
    match record.phase {
        DurableTxPhase::Staging => participant.rollback_staging(storage, vault_key, record)?,
        DurableTxPhase::Committing => participant.recover_committing(storage, vault_key, record)?,
    }
    participant.cleanup(storage, vault_key, record)
}

pub(super) fn recover_encrypted_participant_record<P>(
    storage: &Storage,
    participant: &P,
    vault_key: &[u8; KEY_SIZE],
    record: &DurableTxRecord<P::Payload>,
) -> Result<()>
where
    P: DurableTxEncryptedParticipant,
{
    match record.phase {
        DurableTxPhase::Staging => {
            participant.rollback_staging_encrypted(storage, vault_key, record)?
        }
        DurableTxPhase::Committing => {
            participant.recover_committing_encrypted(storage, vault_key, record)?
        }
    }
    participant.cleanup_encrypted(storage, vault_key, record)
}
