//! Common RPC helper functions to reduce boilerplate in handlers.

use crate::error::ErrorCode;
use serde_json::Value;
use zeroize::Zeroize;

use super::types::RpcResponse;

/// Best-effort cleanup of owned JSON string values before discarding sensitive RPC data.
pub fn clear_rpc_strings(value: &mut Value) {
    match value {
        Value::String(value) => value.zeroize(),
        Value::Array(values) => values.iter_mut().for_each(clear_rpc_strings),
        Value::Object(values) => values.values_mut().for_each(clear_rpc_strings),
        Value::Null | Value::Bool(_) | Value::Number(_) => {}
    }
}

/// Convert a `Result<T, E>` into `Result<T, RpcResponse>`, mapping the error
/// to an RPC error response with the given error code.
pub fn rpc_try<T, E: std::fmt::Display>(
    result: Result<T, E>,
    code: ErrorCode,
) -> Result<T, RpcResponse> {
    result.map_err(|e| RpcResponse::error(e.to_string(), Some(code)))
}

/// Extract a required string field from a JSON `Value`, or return an
/// `RpcResponse` error with `EmptyPayload`.
pub fn require_str<'a>(data: &'a Value, field: &str) -> Result<&'a str, RpcResponse> {
    data.get(field).and_then(|v| v.as_str()).ok_or_else(|| {
        RpcResponse::error(
            format!("{} is required", field),
            Some(ErrorCode::EmptyPayload),
        )
    })
}

/// Extract a required `u64` field from a JSON `Value`, or return an
/// `RpcResponse` error with `EmptyPayload`.
pub fn require_u64(data: &Value, field: &str) -> Result<u64, RpcResponse> {
    data.get(field).and_then(|v| v.as_u64()).ok_or_else(|| {
        RpcResponse::error(
            format!("{} is required", field),
            Some(ErrorCode::EmptyPayload),
        )
    })
}
