use crate::catalog::{CatalogManager, CatalogNode};
use crate::durable_tx::{DurableTxPhase, DurableTxRecord, DurableTxStore};
use crate::error::{Error, Result};
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
) -> Result<()> {
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

    if all_chunks_exist(storage, &record.payload.new_chunk_names)? {
        rewrite_domain_root(
            session,
            storage,
            &record.payload,
            &record.payload.new_domain_root,
        )?;
        cleanup_domain_backups(storage, &record.payload);
        store.delete()?;
        return storage.sync();
    }

    rollback_domain_chunks(storage, &record.payload)?;
    rewrite_domain_root(
        session,
        storage,
        &record.payload,
        &record.payload.old_domain_root,
    )?;
    cleanup_domain_backups(storage, &record.payload);
    store.delete()?;
    storage.sync()
}

fn rewrite_domain_root(
    session: &mut VaultSession,
    storage: &Storage,
    payload: &DomainUnitOfWorkPayload,
    domain_root: &Option<CatalogNode>,
) -> Result<()> {
    let repaired = catalog_with_domain_root(session.catalog(), &payload.domain_path, domain_root)?;
    session.replace_catalog_and_rewrite_snapshots(storage, repaired)
}

fn catalog_with_domain_root(
    catalog: &CatalogManager,
    domain_path: &str,
    domain_root: &Option<CatalogNode>,
) -> Result<CatalogManager> {
    let domain_name = domain_path.trim_start_matches('/');
    if domain_name.is_empty() || domain_name.contains('/') {
        return Err(Error::InvalidDataFormat(format!(
            "domain unit of work recovery cannot rewrite invalid domain path {domain_path}"
        )));
    }

    let mut root = catalog.root().clone();
    let Some(children) = root.children_mut() else {
        return Err(Error::InvalidDataFormat(
            "domain unit of work recovery found non-directory catalog root".to_string(),
        ));
    };
    children.retain(|child| child.name != domain_name);
    if let Some(domain_root) = domain_root {
        children.push(domain_root.clone());
    }

    Ok(CatalogManager::from_root_with_version(
        root,
        catalog.version().saturating_add(1),
    ))
}

fn all_chunks_exist(storage: &Storage, chunk_names: &[String]) -> Result<bool> {
    for chunk_name in chunk_names {
        if !storage.chunk_exists(chunk_name)? {
            return Ok(false);
        }
    }
    Ok(true)
}
