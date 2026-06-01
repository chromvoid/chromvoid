use crate::rpc::request_parse::{optional_bool, optional_str, optional_u64, required_u64};

use super::error::{UploadCommandError, UploadResult};

pub(super) struct UploadRequest {
    pub(super) size: u64,
    pub(super) offset: u64,
    pub(super) finish: bool,
    pub(super) node_id: Option<u64>,
    pub(super) parent_path: Option<String>,
    pub(super) name: Option<String>,
    pub(super) total_size: Option<u64>,
    pub(super) mime_type: Option<String>,
    pub(super) chunk_size: Option<u32>,
}

impl UploadRequest {
    pub(super) fn parse(data: &serde_json::Value) -> UploadResult<Self> {
        Ok(Self {
            size: required_u64(data, "size")
                .map_err(|_| UploadCommandError::empty_payload("size"))?,
            offset: optional_u64(data, "offset").unwrap_or(0),
            finish: optional_bool(data, "finish").unwrap_or(false),
            node_id: optional_u64(data, "node_id"),
            parent_path: optional_str(data, "parent_path").map(str::to_string),
            name: optional_str(data, "name").map(str::to_string),
            total_size: optional_u64(data, "total_size"),
            mime_type: optional_str(data, "mime_type").map(str::to_string),
            chunk_size: optional_u64(data, "chunk_size")
                .and_then(|value| u32::try_from(value).ok()),
        })
    }

    pub(super) fn required_name(&self) -> UploadResult<&str> {
        self.name
            .as_deref()
            .ok_or_else(|| UploadCommandError::empty_payload("name"))
    }
}
