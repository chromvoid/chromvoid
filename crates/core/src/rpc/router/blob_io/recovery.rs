use crate::rpc::router::state::RpcRouter;

use super::erase_tx::erase_tx_store;
use super::write_tx::tx_store;

pub(in crate::rpc::router) fn recover_single_blob_write_transaction(
    router: &mut RpcRouter,
) -> crate::error::Result<()> {
    let Some(session) = router.session.as_ref() else {
        return Ok(());
    };
    let vault_key = *session.vault_key();
    let probing_store = tx_store(&router.storage, &vault_key, None, None);
    let Some(record) = probing_store.read_participant_record()? else {
        return Ok(());
    };
    let (current_size, current_source_revision) = session
        .catalog()
        .find_by_id(record.payload.node_id)
        .map(|node| (Some(node.size), Some(node.source_revision)))
        .unwrap_or((None, None));
    tx_store(
        &router.storage,
        &vault_key,
        current_size,
        current_source_revision,
    )
    .recover_participant()
}

pub(in crate::rpc::router) fn recover_single_blob_erase_transaction(
    router: &mut RpcRouter,
) -> crate::error::Result<()> {
    let Some(session) = router.session.as_ref() else {
        return Ok(());
    };
    let vault_key = *session.vault_key();
    let probing_store = erase_tx_store(&router.storage, &vault_key, None, None);
    let Some(record) = probing_store.read_participant_record()? else {
        return Ok(());
    };
    let (current_size, current_source_revision) = session
        .catalog()
        .find_by_id(record.payload.node_id)
        .map(|node| (Some(node.size), Some(node.source_revision)))
        .unwrap_or((None, None));
    erase_tx_store(
        &router.storage,
        &vault_key,
        current_size,
        current_source_revision,
    )
    .recover_participant()
}
