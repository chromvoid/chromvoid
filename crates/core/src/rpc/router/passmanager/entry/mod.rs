//! Entry I/O helpers and RPC adapter functions for PassManager.

mod io;
mod request;
mod resolver;
mod sanitize;
mod service;
mod tags;
mod types;

use crate::rpc::types::RpcResponse;
use crate::vault::VaultSession;

use super::super::domain_uow::DomainUnitOfWork;

pub(in crate::rpc::router::passmanager) use io::{
    collect_entry_dir_ids_with_meta, entry_meta_object_mut, load_entry_meta_required,
    read_entry_meta_json, stage_entry_meta_json,
};
pub(in crate::rpc::router::passmanager) use resolver::resolve_entry_node_id;
pub(in crate::rpc::router::passmanager) use sanitize::{
    normalized_payment_card_meta, sanitize_entry_meta_for_wire,
};
pub(in crate::rpc::router::passmanager) use tags::{
    credential_tag_key, normalize_credential_tag_catalog, normalize_entry_tags,
};

pub(in crate::rpc::router::passmanager) fn handle_save(
    s: &VaultSession,
    storage: &crate::storage::Storage,
    uow: &mut DomainUnitOfWork<'_>,
    data: &serde_json::Value,
) -> RpcResponse {
    let request = match request::parse_entry_save_request(data) {
        Ok(request) => request,
        Err(error) => return error.into_rpc_response(),
    };

    match service::save_entry(s, storage, uow, request) {
        Ok(result) => RpcResponse::success(result),
        Err(error) => error.into_rpc_response(),
    }
}

pub(in crate::rpc::router::passmanager) fn handle_read(
    s: &VaultSession,
    storage: &crate::storage::Storage,
    data: &serde_json::Value,
) -> RpcResponse {
    let request = match request::parse_entry_id_request(data) {
        Ok(request) => request,
        Err(error) => return error.into_rpc_response(),
    };

    match service::read_entry(s, storage, request) {
        Ok(result) => RpcResponse::success(result),
        Err(error) => error.into_rpc_response(),
    }
}

pub(in crate::rpc::router::passmanager) fn handle_delete(
    s: &VaultSession,
    storage: &crate::storage::Storage,
    uow: &mut DomainUnitOfWork<'_>,
    data: &serde_json::Value,
) -> RpcResponse {
    let request = match request::parse_entry_id_request(data) {
        Ok(request) => request,
        Err(error) => return error.into_rpc_response(),
    };

    match service::delete_entry(s, storage, uow, request) {
        Ok(()) => RpcResponse::success(serde_json::Value::Null),
        Err(error) => error.into_rpc_response(),
    }
}

pub(in crate::rpc::router::passmanager) fn handle_move(
    s: &VaultSession,
    storage: &crate::storage::Storage,
    uow: &mut DomainUnitOfWork<'_>,
    data: &serde_json::Value,
) -> RpcResponse {
    let request = match request::parse_entry_move_request(data) {
        Ok(request) => request,
        Err(error) => return error.into_rpc_response(),
    };

    match service::move_entry(s, storage, uow, request) {
        Ok(()) => RpcResponse::success(serde_json::Value::Null),
        Err(error) => error.into_rpc_response(),
    }
}

pub(in crate::rpc::router::passmanager) fn handle_rename(
    s: &VaultSession,
    storage: &crate::storage::Storage,
    uow: &mut DomainUnitOfWork<'_>,
    data: &serde_json::Value,
) -> RpcResponse {
    let request = match request::parse_entry_rename_request(data) {
        Ok(request) => request,
        Err(error) => return error.into_rpc_response(),
    };

    match service::rename_entry(s, storage, uow, request) {
        Ok(()) => RpcResponse::success(serde_json::Value::Null),
        Err(error) => error.into_rpc_response(),
    }
}

pub(in crate::rpc::router::passmanager) fn handle_list(
    s: &VaultSession,
    storage: &crate::storage::Storage,
    _data: &serde_json::Value,
) -> RpcResponse {
    match service::list_entries(s, storage) {
        Ok(result) => RpcResponse::success(result),
        Err(error) => error.into_rpc_response(),
    }
}
