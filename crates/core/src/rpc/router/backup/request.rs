//! Typed backup request parsing helpers.

use serde_json::Value;

use super::error::{BackupCommandError, BackupResult};

pub(in crate::rpc::router::backup) fn required_str<'a>(
    data: &'a Value,
    field: &str,
) -> BackupResult<&'a str> {
    data.get(field)
        .and_then(Value::as_str)
        .ok_or_else(|| BackupCommandError::empty_payload(field))
}

pub(in crate::rpc::router::backup) fn required_u64(data: &Value, field: &str) -> BackupResult<u64> {
    data.get(field)
        .and_then(Value::as_u64)
        .ok_or_else(|| BackupCommandError::empty_payload(field))
}
