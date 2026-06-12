use serde_json::Value;

use crate::passkeys::{
    create_assertion, create_registration, query_candidates, source_to_summary,
    PasskeyInvocationContext,
};
use crate::rpc::types::{VaultPasskeyDeleteResponse, VaultPasskeysListResponse};
use crate::storage::Storage;
use crate::vault::VaultSession;

use super::super::domain_uow::DomainUnitOfWork;
use super::error::PasskeysCommandError;
use super::request::PasskeyDeleteRequest;
use super::store::{delete_passkey_source, list_passkey_sources, save_passkey_source};

pub(super) fn passkeys_list_service(
    session: &VaultSession,
    storage: &Storage,
) -> Result<VaultPasskeysListResponse, PasskeysCommandError> {
    let mut sources = list_passkey_sources(session, storage)?;
    sources.sort_by(|a, b| {
        b.last_used_epoch_ms
            .cmp(&a.last_used_epoch_ms)
            .then_with(|| b.created_at_epoch_ms.cmp(&a.created_at_epoch_ms))
            .then_with(|| a.rp_id.cmp(&b.rp_id))
            .then_with(|| a.user_name.cmp(&b.user_name))
    });
    let passkeys = sources.iter().map(source_to_summary).collect();
    Ok(VaultPasskeysListResponse { passkeys })
}

pub(super) fn passkeys_delete_service(
    uow: &mut DomainUnitOfWork<'_>,
    request: PasskeyDeleteRequest<'_>,
) -> Result<VaultPasskeyDeleteResponse, PasskeysCommandError> {
    let deleted = delete_passkey_source(uow, request.credential_id)?;
    Ok(VaultPasskeyDeleteResponse { deleted })
}

pub(super) fn passkey_query_service(
    session: &VaultSession,
    storage: &Storage,
    data: &Value,
    context: &PasskeyInvocationContext,
) -> Result<VaultPasskeysListResponse, PasskeysCommandError> {
    let sources = list_passkey_sources(session, storage)?;
    let candidates =
        query_candidates(data, &sources, context).map_err(PasskeysCommandError::from)?;
    let passkeys = candidates.iter().map(source_to_summary).collect();
    Ok(VaultPasskeysListResponse { passkeys })
}

pub(super) fn passkey_create_service(
    session: &VaultSession,
    storage: &Storage,
    uow: &mut DomainUnitOfWork<'_>,
    data: &Value,
    context: &PasskeyInvocationContext,
) -> Result<Value, PasskeysCommandError> {
    let sources = list_passkey_sources(session, storage)?;
    let registration =
        create_registration(data, &sources, context).map_err(PasskeysCommandError::from)?;
    save_passkey_source(uow, &registration.source)?;
    Ok(registration.response)
}

pub(super) fn passkey_get_service(
    session: &VaultSession,
    storage: &Storage,
    uow: &mut DomainUnitOfWork<'_>,
    data: &Value,
    context: &PasskeyInvocationContext,
) -> Result<Value, PasskeysCommandError> {
    let sources = list_passkey_sources(session, storage)?;
    let assertion =
        create_assertion(data, &sources, context).map_err(PasskeysCommandError::from)?;
    save_passkey_source(uow, &assertion.source)?;
    Ok(assertion.response)
}
