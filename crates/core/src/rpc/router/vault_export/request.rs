use serde_json::Value;

use super::error::{VaultExportCommandError, VaultExportResult};

pub(in crate::rpc::router) struct VaultExportStartRequest {
    pub(in crate::rpc::router) include_otp_secrets: bool,
}

pub(in crate::rpc::router) struct VaultExportChunkRequest {
    pub(in crate::rpc::router) export_id: String,
    pub(in crate::rpc::router) chunk_index: u64,
}

pub(in crate::rpc::router) struct VaultExportIdRequest {
    pub(in crate::rpc::router) export_id: String,
}

pub(in crate::rpc::router) fn parse_vault_export_start_request(
    data: &Value,
) -> VaultExportResult<VaultExportStartRequest> {
    required_str(data, "vault_id")?;
    Ok(VaultExportStartRequest {
        include_otp_secrets: data
            .get("include_otp_secrets")
            .and_then(Value::as_bool)
            .unwrap_or(false),
    })
}

pub(in crate::rpc::router) fn parse_vault_export_chunk_request(
    data: &Value,
) -> VaultExportResult<VaultExportChunkRequest> {
    Ok(VaultExportChunkRequest {
        export_id: required_str(data, "export_id")?.to_string(),
        chunk_index: required_u64(data, "chunk_index")?,
    })
}

pub(in crate::rpc::router) fn parse_vault_export_id_request(
    data: &Value,
) -> VaultExportResult<VaultExportIdRequest> {
    Ok(VaultExportIdRequest {
        export_id: required_str(data, "export_id")?.to_string(),
    })
}

fn required_str<'a>(data: &'a Value, field: &str) -> VaultExportResult<&'a str> {
    data.get(field)
        .and_then(Value::as_str)
        .ok_or_else(|| VaultExportCommandError::empty_payload(field))
}

fn required_u64(data: &Value, field: &str) -> VaultExportResult<u64> {
    data.get(field)
        .and_then(Value::as_u64)
        .ok_or_else(|| VaultExportCommandError::empty_payload(field))
}
