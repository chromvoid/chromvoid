//! Typed restore request parsing helpers.

use serde_json::Value;

use super::error::{RestoreCommandError, RestoreResult};

pub(in crate::rpc::router::restore) fn required_str<'a>(
    data: &'a Value,
    field: &str,
) -> RestoreResult<&'a str> {
    data.get(field)
        .and_then(Value::as_str)
        .ok_or_else(|| RestoreCommandError::empty_payload(field))
}

pub(in crate::rpc::router::restore) fn required_value<'a>(
    data: &'a Value,
    field: &str,
) -> RestoreResult<&'a Value> {
    data.get(field)
        .ok_or_else(|| RestoreCommandError::empty_payload(field))
}
