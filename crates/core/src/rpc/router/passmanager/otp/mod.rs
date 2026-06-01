//! OTP handler free functions for PassManager.

mod error;
mod request;
mod service;

use serde_json::Value;
use std::sync::Mutex;

pub(in crate::rpc::router) use error::PassmanagerOtpError;
pub(in crate::rpc::router) use service::generate_by_id_lookup;

use super::super::super::types::RpcResponse;
use super::otp_target::PassmanagerOtpTargetCache;
use crate::storage::Storage;
use crate::vault::VaultSession;

pub(super) fn handle_set_secret(
    s: &VaultSession,
    storage: &Storage,
    cache: &Mutex<PassmanagerOtpTargetCache>,
    data: &Value,
) -> RpcResponse {
    let request = match request::parse_set_secret(data) {
        Ok(request) => request,
        Err(error) => return error.into_rpc_response(),
    };

    match service::set_secret(s, storage, cache, request) {
        Ok(()) => RpcResponse::success(Value::Null),
        Err(error) => error.into_rpc_response(),
    }
}

pub(super) fn handle_generate(
    s: &VaultSession,
    storage: &Storage,
    cache: &Mutex<PassmanagerOtpTargetCache>,
    data: &Value,
) -> RpcResponse {
    let request = request::parse_generate(data);
    match service::generate(s, storage, cache, request) {
        Ok(response) => RpcResponse::success(response),
        Err(error) => error.into_rpc_response(),
    }
}

pub(super) fn handle_remove_secret(
    s: &VaultSession,
    storage: &Storage,
    cache: &Mutex<PassmanagerOtpTargetCache>,
    data: &Value,
) -> RpcResponse {
    let request = match request::parse_remove_secret(data) {
        Ok(request) => request,
        Err(error) => return error.into_rpc_response(),
    };

    match service::remove_secret(s, storage, cache, request) {
        Ok(()) => RpcResponse::success(Value::Null),
        Err(error) => error.into_rpc_response(),
    }
}
