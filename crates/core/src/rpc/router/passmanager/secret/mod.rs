//! Secret helper re-exports and RPC adapter functions for PassManager.

mod policy;
mod request;
mod service;
mod store;
mod types;

use crate::rpc::types::RpcResponse;
use crate::vault::VaultSession;

use super::super::domain_uow::DomainUnitOfWork;

pub(in crate::rpc::router::passmanager) use policy::{normalize_secret_value, secret_filename};
pub(in crate::rpc::router::passmanager) use store::read_secret_value;

pub(super) fn handle_save(
    s: &VaultSession,
    storage: &crate::storage::Storage,
    uow: &mut DomainUnitOfWork<'_>,
    data: &serde_json::Value,
) -> RpcResponse {
    let request = match request::parse_secret_save_request(data) {
        Ok(request) => request,
        Err(error) => return error.into_rpc_response(),
    };

    match service::save_secret(s, storage, uow, request) {
        Ok(()) => RpcResponse::success(serde_json::Value::Null),
        Err(error) => error.into_rpc_response(),
    }
}

pub(super) fn handle_read(
    s: &VaultSession,
    storage: &crate::storage::Storage,
    data: &serde_json::Value,
) -> RpcResponse {
    let request = match request::parse_secret_target_request(data) {
        Ok(request) => request,
        Err(error) => return error.into_rpc_response(),
    };

    match service::read_secret(s, storage, request) {
        Ok(result) => RpcResponse::success(result),
        Err(error) => error.into_rpc_response(),
    }
}

pub(super) fn handle_delete(
    s: &VaultSession,
    storage: &crate::storage::Storage,
    uow: &mut DomainUnitOfWork<'_>,
    data: &serde_json::Value,
) -> RpcResponse {
    let request = match request::parse_secret_target_request(data) {
        Ok(request) => request,
        Err(error) => return error.into_rpc_response(),
    };

    match service::delete_secret(s, storage, uow, request) {
        Ok(()) => RpcResponse::success(serde_json::Value::Null),
        Err(error) => error.into_rpc_response(),
    }
}
