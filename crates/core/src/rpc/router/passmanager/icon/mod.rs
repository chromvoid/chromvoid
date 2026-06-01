//! Icon subsystem for PassManager: thin RPC adapters over typed services.

mod gc_service;
mod normalize;
mod request;
mod service;
mod store;
mod types;

use super::super::super::types::RpcResponse;
use super::super::domain_uow::DomainUnitOfWork;
use crate::error::ErrorCode;
use crate::vault::VaultSession;

use self::request::{parse_icon_get_request, parse_icon_put_request, parse_icon_set_meta_request};
pub(super) use self::store::load_icon_index;
pub(super) use self::types::PASSMANAGER_ICONS_ENABLED;

pub(super) fn passmanager_icons_disabled_response() -> RpcResponse {
    RpcResponse::error(
        "passmanager icons feature is disabled",
        Some(ErrorCode::AccessDenied),
    )
}

pub(super) fn is_valid_icon_ref(icon_ref: &str) -> bool {
    if !icon_ref.starts_with("sha256:") {
        return false;
    }
    let digest = icon_ref.trim_start_matches("sha256:");
    digest.len() == 64
        && digest
            .chars()
            .all(|c| c.is_ascii_hexdigit() && !c.is_ascii_uppercase())
}

pub(super) fn parse_icon_ref_sha(icon_ref: &str) -> Option<&str> {
    if !is_valid_icon_ref(icon_ref) {
        return None;
    }
    Some(icon_ref.trim_start_matches("sha256:"))
}

pub(super) fn handle_put(
    s: &VaultSession,
    storage: &crate::storage::Storage,
    uow: &mut DomainUnitOfWork<'_>,
    data: &serde_json::Value,
) -> RpcResponse {
    if !PASSMANAGER_ICONS_ENABLED {
        return passmanager_icons_disabled_response();
    }

    let normalized = match normalize::normalize_upload_payload(data) {
        Ok(normalized) => normalized,
        Err(error) => return error.into_rpc_response(),
    };
    let request = match parse_icon_put_request(data) {
        Ok(request) => request,
        Err(error) => return error.into_rpc_response(),
    };

    match service::put_icon(s, storage, uow, request, normalized) {
        Ok(result) => RpcResponse::success(result),
        Err(error) => error.into_rpc_response(),
    }
}

pub(super) fn handle_get(
    s: &VaultSession,
    storage: &crate::storage::Storage,
    data: &serde_json::Value,
) -> RpcResponse {
    if !PASSMANAGER_ICONS_ENABLED {
        return passmanager_icons_disabled_response();
    }

    let request = match parse_icon_get_request(data) {
        Ok(request) => request,
        Err(error) => return error.into_rpc_response(),
    };

    match service::get_icon(s, storage, request) {
        Ok(result) => RpcResponse::success(result),
        Err(error) => error.into_rpc_response(),
    }
}

pub(super) fn handle_set_meta(
    s: &VaultSession,
    storage: &crate::storage::Storage,
    uow: &mut DomainUnitOfWork<'_>,
    data: &serde_json::Value,
) -> RpcResponse {
    if !PASSMANAGER_ICONS_ENABLED {
        return passmanager_icons_disabled_response();
    }

    let request = match parse_icon_set_meta_request(data) {
        Ok(request) => request,
        Err(error) => return error.into_rpc_response(),
    };

    match service::set_icon_meta(s, storage, uow, request) {
        Ok(()) => RpcResponse::success(serde_json::json!({})),
        Err(error) => error.into_rpc_response(),
    }
}

pub(super) fn handle_list(
    s: &VaultSession,
    storage: &crate::storage::Storage,
    _data: &serde_json::Value,
) -> RpcResponse {
    if !PASSMANAGER_ICONS_ENABLED {
        return passmanager_icons_disabled_response();
    }

    match service::list_icons(s, storage) {
        Ok(result) => RpcResponse::success(result),
        Err(error) => error.into_rpc_response(),
    }
}

pub(super) fn handle_gc(
    s: &VaultSession,
    storage: &crate::storage::Storage,
    uow: &mut DomainUnitOfWork<'_>,
    _data: &serde_json::Value,
) -> RpcResponse {
    if !PASSMANAGER_ICONS_ENABLED {
        return passmanager_icons_disabled_response();
    }

    match gc_service::collect_garbage(s, storage, uow) {
        Ok(result) => RpcResponse::success(result),
        Err(error) => error.into_rpc_response(),
    }
}
