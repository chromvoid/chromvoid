use crate::error::ErrorCode;
use crate::rpc::router::plain_blob_read::PlainBlobReadError;
use crate::rpc::types::RpcResponse;

#[derive(Debug, Clone)]
pub(in crate::rpc::router) struct VaultExportCommandError {
    message: String,
    code: Option<String>,
}

pub(in crate::rpc::router) type VaultExportResult<T> = Result<T, VaultExportCommandError>;

impl VaultExportCommandError {
    pub(in crate::rpc::router) fn new(message: impl Into<String>, code: Option<ErrorCode>) -> Self {
        Self {
            message: message.into(),
            code: code.map(String::from),
        }
    }

    pub(in crate::rpc::router) fn empty_payload(field: &str) -> Self {
        Self::new(
            format!("{field} is required"),
            Some(ErrorCode::EmptyPayload),
        )
    }

    pub(in crate::rpc::router) fn vault_not_unlocked() -> Self {
        Self::new("Vault not unlocked", Some(ErrorCode::VaultNotUnlocked))
    }

    pub(in crate::rpc::router) fn master_password_required() -> Self {
        Self::new(
            "master_password required to export OTP secrets",
            Some(ErrorCode::VaultExportMasterPasswordRequired),
        )
    }

    pub(in crate::rpc::router) fn already_in_progress() -> Self {
        Self::new(
            "Export already in progress",
            Some(ErrorCode::BackupAlreadyInProgress),
        )
    }

    pub(in crate::rpc::router) fn node_not_found(message: impl Into<String>) -> Self {
        Self::new(message, Some(ErrorCode::NodeNotFound))
    }

    pub(in crate::rpc::router) fn internal(message: impl Into<String>) -> Self {
        Self::new(message, Some(ErrorCode::InternalError))
    }

    pub(in crate::rpc::router) fn from_plain_blob_read_error(
        error: PlainBlobReadError,
        fallback: &'static str,
    ) -> Self {
        let (message, code) = error.into_parts();
        Self {
            message: if message.is_empty() {
                fallback.to_string()
            } else {
                message
            },
            code,
        }
    }

    pub(in crate::rpc::router) fn into_rpc_response(self) -> RpcResponse {
        RpcResponse::error(self.message, self.code)
    }
}

pub(in crate::rpc::router) enum VaultExportAccessError {
    Response(VaultExportCommandError),
    BrokenSession(VaultExportCommandError),
}
