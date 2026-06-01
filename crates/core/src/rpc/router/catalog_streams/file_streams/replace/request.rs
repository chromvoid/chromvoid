use serde_json::Value;

use super::error::{ReplaceCommandError, ReplaceResult};

pub(super) struct ReplaceRequest {
    pub(super) node_id: u64,
    pub(super) size: u64,
    pub(super) mime_type: Option<String>,
    pub(super) expected_source_revision: Option<u64>,
    pub(super) overwrite: bool,
}

impl ReplaceRequest {
    pub(super) fn parse(data: &Value) -> ReplaceResult<Self> {
        let node_id = required_u64(data, "node_id")?;
        let size = required_u64(data, "size")?;
        let mime_type = data
            .get("mime_type")
            .and_then(|value| value.as_str())
            .map(str::to_string);
        let expected_source_revision = data
            .get("expected_source_revision")
            .and_then(|value| value.as_u64());
        let overwrite = match data
            .get("conflict_mode")
            .and_then(|value| value.as_str())
            .unwrap_or("fail_if_stale")
        {
            "fail_if_stale" => false,
            "overwrite" => true,
            _ => return Err(ReplaceCommandError::invalid_conflict_mode()),
        };

        Ok(Self {
            node_id,
            size,
            mime_type,
            expected_source_revision,
            overwrite,
        })
    }
}

fn required_u64(data: &Value, field: &str) -> ReplaceResult<u64> {
    data.get(field)
        .and_then(|value| value.as_u64())
        .ok_or_else(|| ReplaceCommandError::empty_payload(field))
}
