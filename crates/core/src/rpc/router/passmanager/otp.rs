//! OTP handler free functions for PassManager.

use super::super::super::commands::{
    handle_catalog_otp_generate, handle_catalog_otp_remove_secret, handle_catalog_otp_set_secret,
    handle_passmanager_otp_generate_by_id, resolve_passmanager_otp_target,
    with_system_shard_guard_bypass,
};
use super::super::super::types::RpcResponse;
use super::path::check_pm_access;
use crate::error::ErrorCode;
use crate::vault::VaultSession;

pub(super) fn handle_set_secret(
    s: &VaultSession,
    storage: &crate::storage::Storage,
    data: &serde_json::Value,
) -> RpcResponse {
    let otp_id = data
        .get("otp_id")
        .and_then(|v| v.as_str())
        .map(str::trim)
        .filter(|s| !s.is_empty());
    let entry_id = data
        .get("entry_id")
        .and_then(|v| v.as_str())
        .map(str::trim)
        .filter(|s| !s.is_empty());
    if otp_id.is_none() && entry_id.is_none() {
        return RpcResponse::error(
            "otp_id or entry_id is required",
            Some(ErrorCode::EmptyPayload),
        );
    }

    let fallback_label = data.get("label").and_then(|v| v.as_str());
    let resolved =
        match resolve_passmanager_otp_target(s, storage, otp_id, entry_id, fallback_label, false) {
            Ok(v) => v,
            Err(e) => {
                return RpcResponse::error(
                    format!("Failed to resolve OTP entry: {}", e),
                    Some(ErrorCode::OtpGenerateFailed),
                )
            }
        };

    let Some((resolved_node_id, resolved_label)) = resolved else {
        return RpcResponse::error("OTP secret not found", Some(ErrorCode::OtpSecretNotFound));
    };

    let mut payload = match data.as_object() {
        Some(obj) => obj.clone(),
        None => serde_json::Map::new(),
    };
    payload.insert(
        "node_id".to_string(),
        serde_json::Value::Number(serde_json::Number::from(resolved_node_id)),
    );
    payload.insert(
        "label".to_string(),
        serde_json::Value::String(resolved_label),
    );

    if let Err(e) = check_pm_access(s, resolved_node_id) {
        return e;
    }

    with_system_shard_guard_bypass(|| {
        handle_catalog_otp_set_secret(s, &serde_json::Value::Object(payload), storage)
    })
}

pub(super) fn handle_generate(
    s: &VaultSession,
    storage: &crate::storage::Storage,
    data: &serde_json::Value,
) -> RpcResponse {
    if let Some(node_id) = data.get("node_id").and_then(|v| v.as_u64()) {
        if let Err(e) = check_pm_access(s, node_id) {
            return e;
        }
        return with_system_shard_guard_bypass(|| handle_catalog_otp_generate(s, data, storage));
    }

    with_system_shard_guard_bypass(|| handle_passmanager_otp_generate_by_id(s, data, storage))
}

pub(super) fn handle_remove_secret(
    s: &VaultSession,
    storage: &crate::storage::Storage,
    data: &serde_json::Value,
) -> RpcResponse {
    let otp_id = data
        .get("otp_id")
        .and_then(|v| v.as_str())
        .map(str::trim)
        .filter(|s| !s.is_empty());
    let entry_id = data
        .get("entry_id")
        .and_then(|v| v.as_str())
        .map(str::trim)
        .filter(|s| !s.is_empty());
    if otp_id.is_none() && entry_id.is_none() {
        return RpcResponse::error(
            "otp_id or entry_id is required",
            Some(ErrorCode::EmptyPayload),
        );
    }

    let resolved = match resolve_passmanager_otp_target(s, storage, otp_id, entry_id, None, false) {
        Ok(v) => v,
        Err(e) => {
            return RpcResponse::error(
                format!("Failed to resolve OTP entry: {}", e),
                Some(ErrorCode::OtpGenerateFailed),
            )
        }
    };

    let Some((resolved_node_id, resolved_label)) = resolved else {
        return RpcResponse::error("OTP secret not found", Some(ErrorCode::OtpSecretNotFound));
    };

    let mut payload = match data.as_object() {
        Some(obj) => obj.clone(),
        None => serde_json::Map::new(),
    };
    payload.insert(
        "node_id".to_string(),
        serde_json::Value::Number(serde_json::Number::from(resolved_node_id)),
    );
    payload.insert(
        "label".to_string(),
        serde_json::Value::String(resolved_label),
    );

    if let Err(e) = check_pm_access(s, resolved_node_id) {
        return e;
    }

    with_system_shard_guard_bypass(|| {
        handle_catalog_otp_remove_secret(s, &serde_json::Value::Object(payload), storage)
    })
}
