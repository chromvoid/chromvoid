use serde::Serialize;
use serde_json::Value;

use chromvoid_core::rpc::types::RpcResponse;

#[derive(Debug)]
pub(crate) struct UploadStreamMetadata {
    pub(crate) size: u64,
    pub(crate) offset: u64,
}

pub(crate) fn json_payload_or_empty_object<T: Serialize>(value: &T, context: &str) -> Vec<u8> {
    match serde_json::to_vec(value) {
        Ok(payload) => payload,
        Err(error) => {
            tracing::warn!("{context}: failed to serialize frame payload: {error}");
            b"{}".to_vec()
        }
    }
}

pub(crate) fn parse_upload_stream_metadata(
    data: &Value,
) -> Result<UploadStreamMetadata, RpcResponse> {
    let Some(size) = data.get("size").and_then(|value| value.as_u64()) else {
        return Err(RpcResponse::error(
            "upload stream request missing numeric size",
            Some("BAD_REQUEST"),
        ));
    };
    let offset = data
        .get("offset")
        .and_then(|value| value.as_u64())
        .unwrap_or(0);
    if offset > size {
        return Err(RpcResponse::error(
            "upload stream offset exceeds size",
            Some("BAD_REQUEST"),
        ));
    }

    Ok(UploadStreamMetadata { size, offset })
}

pub(crate) fn upload_stream_chunk_data(
    data: &Value,
    offset: u64,
    chunk_size: u64,
    stream_size: u64,
    is_final_chunk: bool,
) -> Result<Value, RpcResponse> {
    let mut chunk_data = data.clone();
    let Some(obj) = chunk_data.as_object_mut() else {
        return Err(RpcResponse::error(
            "upload request data must be an object",
            Some("BAD_REQUEST"),
        ));
    };
    let Some(end_offset) = offset.checked_add(chunk_size) else {
        return Err(RpcResponse::error(
            "upload stream chunk offset overflow",
            Some("BAD_REQUEST"),
        ));
    };
    if end_offset > stream_size {
        return Err(RpcResponse::error(
            "upload stream chunk exceeds declared size",
            Some("BAD_REQUEST"),
        ));
    }

    obj.insert("offset".to_string(), serde_json::json!(offset));
    obj.insert("size".to_string(), serde_json::json!(chunk_size));
    if obj.get("finish").and_then(|value| value.as_bool()) == Some(true) {
        obj.entry("total_size".to_string())
            .or_insert_with(|| serde_json::json!(stream_size));
        if !is_final_chunk {
            obj.remove("finish");
        }
    }
    Ok(chunk_data)
}
