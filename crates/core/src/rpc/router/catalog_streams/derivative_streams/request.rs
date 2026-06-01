use serde_json::Value;

use crate::rpc::request_parse::optional_u64_any;
use crate::types::DEFAULT_CHUNK_SIZE;

use super::error::{DerivativeCommandError, DerivativeResult};

pub(super) struct DerivativeWriteRequest {
    pub(super) node_id: u64,
    pub(super) source_version: u64,
    pub(super) version: u32,
    pub(super) tier: String,
    pub(super) expected_size: u64,
    pub(super) name: String,
    pub(super) mime_type: String,
    pub(super) file_extension: String,
    pub(super) chunk_size: u32,
}

pub(super) struct DerivativeReadRequest {
    pub(super) node_id: u64,
    pub(super) source_version: u64,
    pub(super) version: u32,
    pub(super) tier: String,
}

impl DerivativeWriteRequest {
    pub(super) fn parse(data: &Value) -> DerivativeResult<Self> {
        Ok(Self {
            node_id: required_u64(data, "node_id")?,
            source_version: source_version(data),
            version: derivative_version(data)?,
            tier: derivative_tier(data)?,
            expected_size: required_u64(data, "size")?,
            name: required_non_empty_str(data, "name")?,
            mime_type: required_non_empty_str(data, "mime_type")?,
            file_extension: required_non_empty_str(data, "file_extension")?,
            chunk_size: optional_chunk_size(data),
        })
    }
}

impl DerivativeReadRequest {
    pub(super) fn parse(data: &Value) -> DerivativeResult<Self> {
        Ok(Self {
            node_id: required_u64(data, "node_id")?,
            source_version: source_version(data),
            version: derivative_version(data)?,
            tier: derivative_tier(data)?,
        })
    }
}

fn source_version(data: &Value) -> u64 {
    data.get("source_version")
        .and_then(|value| value.as_u64())
        .unwrap_or(0)
}

fn derivative_version(data: &Value) -> DerivativeResult<u32> {
    data.get("version")
        .and_then(|value| value.as_u64())
        .and_then(|value| u32::try_from(value).ok())
        .filter(|value| *value > 0)
        .ok_or_else(DerivativeCommandError::version_required)
}

fn derivative_tier(data: &Value) -> DerivativeResult<String> {
    let tier = data
        .get("tier")
        .and_then(|value| value.as_str())
        .ok_or_else(|| DerivativeCommandError::empty_payload("tier"))?;

    match tier {
        "thumbnail" | "preview" | "metadata" => Ok(tier.to_string()),
        _ => Err(DerivativeCommandError::invalid_tier()),
    }
}

fn required_u64(data: &Value, field: &str) -> DerivativeResult<u64> {
    data.get(field)
        .and_then(|value| value.as_u64())
        .ok_or_else(|| DerivativeCommandError::empty_payload(field))
}

fn required_non_empty_str(data: &Value, field: &str) -> DerivativeResult<String> {
    data.get(field)
        .and_then(|value| value.as_str())
        .map(str::trim)
        .filter(|value| !value.is_empty())
        .map(str::to_string)
        .ok_or_else(|| DerivativeCommandError::empty_payload(field))
}

fn optional_chunk_size(data: &Value) -> u32 {
    optional_u64_any(data, "chunk_size", &[])
        .and_then(|value| u32::try_from(value).ok())
        .filter(|value| *value > 0)
        .unwrap_or(DEFAULT_CHUNK_SIZE)
}
