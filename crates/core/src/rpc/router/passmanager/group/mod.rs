//! Group metadata subsystem for PassManager: thin RPC adapters over typed services.

mod meta_store;
mod request;
mod service;
mod types;

use super::super::super::types::RpcResponse;
use super::super::domain_uow::DomainUnitOfWork;
use super::icon::{passmanager_icons_disabled_response, PASSMANAGER_ICONS_ENABLED};
use crate::vault::VaultSession;

pub(super) use self::meta_store::{load_group_meta_map_typed, normalize_group_meta_path};
use self::request::{parse_group_path_request, parse_group_set_meta_request};
pub(super) use self::service::{collect_reachable_entry_icon_refs, list_group_paths};
pub(super) use self::types::{GroupMetaFile, GroupMetaLoadError, GroupMetaRecord, GroupMetaValue};

pub(super) fn handle_ensure(
    uow: &mut DomainUnitOfWork<'_>,
    data: &serde_json::Value,
) -> RpcResponse {
    let request = match parse_group_path_request(data) {
        Ok(request) => request,
        Err(error) => return error.into_rpc_response(),
    };

    match service::ensure_group(uow, request) {
        Ok(()) => RpcResponse::success(serde_json::Value::Null),
        Err(error) => error.into_rpc_response(),
    }
}

pub(super) fn handle_list(s: &VaultSession, _data: &serde_json::Value) -> RpcResponse {
    let groups = list_group_paths(s);
    RpcResponse::success(serde_json::json!({"groups": groups}))
}

pub(super) fn handle_delete(
    s: &VaultSession,
    storage: &crate::storage::Storage,
    uow: &mut DomainUnitOfWork<'_>,
    data: &serde_json::Value,
) -> RpcResponse {
    let request = match parse_group_path_request(data) {
        Ok(request) => request,
        Err(error) => return error.into_rpc_response(),
    };

    match service::delete_group(s, storage, uow, request) {
        Ok(()) => RpcResponse::success(serde_json::Value::Null),
        Err(error) => error.into_rpc_response(),
    }
}

pub(super) fn handle_set_meta(
    s: &VaultSession,
    storage: &crate::storage::Storage,
    uow: &mut DomainUnitOfWork<'_>,
    data: &serde_json::Value,
) -> RpcResponse {
    let request = match parse_group_set_meta_request(data) {
        Ok(request) => request,
        Err(error) => return error.into_rpc_response(),
    };

    if request.icon_ref_update.is_some() && !PASSMANAGER_ICONS_ENABLED {
        return passmanager_icons_disabled_response();
    }

    match service::set_group_meta(s, storage, uow, request) {
        Ok(()) => RpcResponse::success(serde_json::Value::Null),
        Err(error) => error.into_rpc_response(),
    }
}
