use crate::durable_tx::DurableTxStore;
use crate::storage::Storage;
use crate::types::KEY_SIZE;

use super::types::{
    DomainUnitOfWorkPayload, DOMAIN_UOW_TX_KIND, DOMAIN_UOW_TX_MARKER_CONTEXT,
    DOMAIN_UOW_TX_VERSION,
};

pub(super) struct DomainUnitOfWorkParticipant;

impl crate::durable_tx::DurableTxParticipant for DomainUnitOfWorkParticipant {
    const KIND: &'static str = DOMAIN_UOW_TX_KIND;
    const VERSION: u8 = DOMAIN_UOW_TX_VERSION;
    type Payload = DomainUnitOfWorkPayload;

    fn marker_context(&self) -> &'static [u8] {
        DOMAIN_UOW_TX_MARKER_CONTEXT
    }

    fn marker_name(&self, vault_key: &[u8; KEY_SIZE]) -> String {
        domain_uow_tx_marker_name(vault_key)
    }

    fn validate_payload(&self, payload: &Self::Payload) -> bool {
        payload.version == DOMAIN_UOW_TX_VERSION
            && !payload.domain_id.is_empty()
            && !payload.domain_path.is_empty()
            && !payload.tx_id.is_empty()
    }
}

pub(super) fn domain_uow_store<'a>(
    storage: &'a Storage,
    vault_key: &'a [u8; KEY_SIZE],
) -> DurableTxStore<'a, DomainUnitOfWorkParticipant> {
    DurableTxStore::new(storage, vault_key, DomainUnitOfWorkParticipant)
}

fn domain_uow_tx_marker_name(vault_key: &[u8; KEY_SIZE]) -> String {
    crate::crypto::chunk_name_u64(vault_key, DOMAIN_UOW_TX_MARKER_CONTEXT, 0)
}
