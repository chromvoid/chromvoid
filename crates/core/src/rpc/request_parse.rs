//! Small typed request parsing helpers for RPC adapters.

use crate::error::ErrorCode;
use crate::rpc::types::RpcResponse;

fn missing_field(field: &str) -> RpcResponse {
    RpcResponse::error(
        format!("{field} is required"),
        Some(ErrorCode::EmptyPayload),
    )
}

fn field_value_any<'a>(
    data: &'a serde_json::Value,
    primary: &str,
    aliases: &[&str],
) -> Option<&'a serde_json::Value> {
    data.get(primary)
        .or_else(|| aliases.iter().find_map(|alias| data.get(*alias)))
}

pub(in crate::rpc) fn required_str<'a>(
    data: &'a serde_json::Value,
    field: &str,
) -> Result<&'a str, RpcResponse> {
    data.get(field)
        .and_then(|value| value.as_str())
        .ok_or_else(|| missing_field(field))
}

pub(in crate::rpc) fn optional_str<'a>(
    data: &'a serde_json::Value,
    field: &str,
) -> Option<&'a str> {
    data.get(field).and_then(|value| value.as_str())
}

pub(in crate::rpc) fn optional_value<'a>(
    data: &'a serde_json::Value,
    field: &str,
) -> Option<&'a serde_json::Value> {
    data.get(field)
}

pub(in crate::rpc) fn required_str_any<'a>(
    data: &'a serde_json::Value,
    primary: &str,
    aliases: &[&str],
    error_field: &str,
) -> Result<&'a str, RpcResponse> {
    field_value_any(data, primary, aliases)
        .and_then(|value| value.as_str())
        .ok_or_else(|| missing_field(error_field))
}

pub(in crate::rpc) fn optional_str_any<'a>(
    data: &'a serde_json::Value,
    primary: &str,
    aliases: &[&str],
) -> Option<&'a str> {
    field_value_any(data, primary, aliases).and_then(|value| value.as_str())
}

pub(in crate::rpc) fn required_non_empty_str_any<'a>(
    data: &'a serde_json::Value,
    primary: &str,
    aliases: &[&str],
    error_field: &str,
) -> Result<&'a str, RpcResponse> {
    required_str_any(data, primary, aliases, error_field)
        .map(str::trim)
        .and_then(|value| {
            if value.is_empty() {
                Err(missing_field(error_field))
            } else {
                Ok(value)
            }
        })
}

pub(in crate::rpc) fn required_u64(
    data: &serde_json::Value,
    field: &str,
) -> Result<u64, RpcResponse> {
    data.get(field)
        .and_then(|value| value.as_u64())
        .ok_or_else(|| missing_field(field))
}

pub(in crate::rpc) fn optional_u64(data: &serde_json::Value, field: &str) -> Option<u64> {
    data.get(field).and_then(|value| value.as_u64())
}

pub(in crate::rpc) fn optional_u64_any(
    data: &serde_json::Value,
    primary: &str,
    aliases: &[&str],
) -> Option<u64> {
    field_value_any(data, primary, aliases).and_then(|value| value.as_u64())
}

pub(in crate::rpc) fn optional_bool(data: &serde_json::Value, field: &str) -> Option<bool> {
    data.get(field).and_then(|value| value.as_bool())
}

pub(in crate::rpc) fn optional_bool_any(
    data: &serde_json::Value,
    primary: &str,
    aliases: &[&str],
) -> Option<bool> {
    field_value_any(data, primary, aliases).and_then(|value| value.as_bool())
}

pub(in crate::rpc) fn required_array_any<'a>(
    data: &'a serde_json::Value,
    primary: &str,
    aliases: &[&str],
    error_field: &str,
) -> Result<&'a [serde_json::Value], RpcResponse> {
    field_value_any(data, primary, aliases)
        .and_then(|value| value.as_array())
        .map(Vec::as_slice)
        .ok_or_else(|| missing_field(error_field))
}

pub(in crate::rpc) fn optional_array<'a>(
    data: &'a serde_json::Value,
    field: &str,
) -> Option<&'a [serde_json::Value]> {
    data.get(field)
        .and_then(|value| value.as_array())
        .map(Vec::as_slice)
}

pub(in crate::rpc) fn field_present_any(
    data: &serde_json::Value,
    primary: &str,
    aliases: &[&str],
) -> bool {
    field_value_any(data, primary, aliases).is_some()
}
