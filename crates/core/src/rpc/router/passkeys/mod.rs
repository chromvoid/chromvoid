//! Passkeys domain commands (ADR-034): scoped access to /.passkeys only.

use serde_json::Value;

use crate::rpc::types::RpcResponse;
use crate::storage::Storage;
use crate::vault::VaultSession;

use super::domain_uow::DomainUnitOfWork;
use super::state::RpcRouter;

mod error;
mod request;
mod service;
mod store;

use error::PasskeysCommandError;
use request::{
    parse_passkey_delete_request, parse_passkey_platform_request, validate_credential_id,
    validate_platform,
};
use service::{
    passkey_create_service, passkey_get_service, passkey_query_service, passkeys_delete_service,
    passkeys_list_service,
};

impl RpcRouter {
    pub(super) fn handle_passkeys_list(&self) -> RpcResponse {
        let storage = self.storage.clone();
        self.with_session(|session| match passkeys_list_service(session, &storage) {
            Ok(response) => RpcResponse::success(response),
            Err(error) => error.into_rpc_response(),
        })
    }

    pub(super) fn handle_passkeys_delete(&mut self, data: &Value) -> RpcResponse {
        let request = match parse_passkey_delete_request(data) {
            Ok(request) => request,
            Err(error) => return error.into_rpc_response(),
        };
        if let Err(error) = validate_credential_id(request.credential_id) {
            return error.into_rpc_response();
        }
        match self.commit_passkeys_domain_uow("passkeys-delete", |_, _, uow| {
            passkeys_delete_service(uow, request)
        }) {
            Ok(response) => RpcResponse::success(response),
            Err(error) => error.into_rpc_response(),
        }
    }

    pub(super) fn credential_provider_passkey_query(&self, data: &Value) -> RpcResponse {
        if let Err(err) = self.credential_provider_preflight() {
            return err;
        }
        if let Err(error) = parse_passkey_platform_request(data).and_then(validate_platform) {
            return error.into_rpc_response();
        }
        let storage = self.storage.clone();
        self.with_session(
            |session| match passkey_query_service(session, &storage, data) {
                Ok(response) => RpcResponse::success(response),
                Err(error) => error.into_rpc_response(),
            },
        )
    }

    pub(super) fn credential_provider_passkey_create(&mut self, data: &Value) -> RpcResponse {
        if let Err(err) = self.credential_provider_preflight() {
            return err;
        }
        if let Err(response) = parse_passkey_platform_request(data).and_then(validate_platform) {
            return response.into_rpc_response();
        }
        match self.commit_passkeys_domain_uow("passkeys-create", |session, storage, uow| {
            passkey_create_service(session, storage, uow, data)
        }) {
            Ok(response) => RpcResponse::success(response),
            Err(error) => error.into_rpc_response(),
        }
    }

    pub(super) fn credential_provider_passkey_get(&mut self, data: &Value) -> RpcResponse {
        if let Err(err) = self.credential_provider_preflight() {
            return err;
        }
        if let Err(response) = parse_passkey_platform_request(data).and_then(validate_platform) {
            return response.into_rpc_response();
        }
        match self.commit_passkeys_domain_uow("passkeys-get", |session, storage, uow| {
            passkey_get_service(session, storage, uow, data)
        }) {
            Ok(response) => RpcResponse::success(response),
            Err(error) => error.into_rpc_response(),
        }
    }

    fn commit_passkeys_domain_uow<T, F>(
        &mut self,
        tx_id_hint: &str,
        f: F,
    ) -> Result<T, PasskeysCommandError>
    where
        F: FnOnce(
            &VaultSession,
            &Storage,
            &mut DomainUnitOfWork<'_>,
        ) -> Result<T, PasskeysCommandError>,
    {
        let storage = self.storage.clone();
        let Some(session) = self.session.as_mut() else {
            return Err(PasskeysCommandError::vault_required());
        };
        let mut uow = DomainUnitOfWork::begin(session, &storage, ".passkeys", tx_id_hint);
        let response = f(session, &storage, &mut uow)?;
        uow.commit(session).map_err(PasskeysCommandError::from)?;
        Ok(response)
    }
}
