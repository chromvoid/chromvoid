use serde_json::Value;

use super::error::{DownloadCommandError, DownloadResult};

pub(super) struct DownloadRequest {
    pub(super) node_id: u64,
}

pub(super) struct DownloadRangeRequest {
    pub(super) node_id: u64,
    pub(super) offset: u64,
    pub(super) length: u64,
    pub(super) expected_source_revision: u64,
}

impl DownloadRequest {
    pub(super) fn parse(data: &Value) -> DownloadResult<Self> {
        Ok(Self {
            node_id: required_u64(data, "node_id")?,
        })
    }
}

impl DownloadRangeRequest {
    pub(super) fn parse(data: &Value) -> DownloadResult<Self> {
        let node_id = required_u64(data, "node_id")?;
        let offset = required_u64(data, "offset")?;
        let length = required_u64(data, "length")?;
        if length == 0 {
            return Err(DownloadCommandError::media_range_invalid(
                "length must be greater than zero",
            ));
        }
        let expected_source_revision = required_u64(data, "expected_source_revision")?;

        Ok(Self {
            node_id,
            offset,
            length,
            expected_source_revision,
        })
    }
}

fn required_u64(data: &Value, field: &str) -> DownloadResult<u64> {
    data.get(field)
        .and_then(|value| value.as_u64())
        .ok_or_else(|| DownloadCommandError::empty_payload(field))
}
