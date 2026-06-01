use crate::durable_tx::{DurableTxPhase, DurableTxRecord, DurableTxStore};
use crate::storage::Storage;
use crate::vault::VaultSession;

use super::backups::{cleanup_domain_backups, rollback_domain_chunks};
use super::participant::{domain_uow_store, DomainUnitOfWorkParticipant};
use super::paths::domain_roots_match;
use super::types::DomainUnitOfWorkPayload;

pub(in crate::rpc::router) fn recover_domain_unit_of_work(
    router: &mut super::super::state::RpcRouter,
) -> crate::error::Result<()> {
    let Some(session) = router.session.as_mut() else {
        return Ok(());
    };
    let vault_key = *session.vault_key();
    let store = domain_uow_store(&router.storage, &vault_key);
    let Some(record) = store.read_participant_record()? else {
        return Ok(());
    };
    recover_domain_record(session, &router.storage, &store, record)
}

fn recover_domain_record(
    session: &mut VaultSession,
    storage: &Storage,
    store: &DurableTxStore<'_, DomainUnitOfWorkParticipant>,
    record: DurableTxRecord<DomainUnitOfWorkPayload>,
) -> crate::error::Result<()> {
    match record.phase {
        DurableTxPhase::Staging => {
            rollback_domain_chunks(storage, &record.payload)?;
            cleanup_domain_backups(storage, &record.payload);
            store.delete()?;
            return storage.sync();
        }
        DurableTxPhase::Committing => {}
    }

    let current_root = session
        .catalog()
        .find_by_path(&record.payload.domain_path)
        .cloned();
    if domain_roots_match(&current_root, &record.payload.new_domain_root) {
        cleanup_domain_backups(storage, &record.payload);
        store.delete()?;
        return storage.sync();
    }
    if domain_roots_match(&current_root, &record.payload.old_domain_root) {
        rollback_domain_chunks(storage, &record.payload)?;
        cleanup_domain_backups(storage, &record.payload);
        store.delete()?;
        return storage.sync();
    }

    Err(crate::error::Error::InvalidDataFormat(format!(
        "domain unit of work recovery cannot prove current state for {}",
        record.payload.domain_id
    )))
}
