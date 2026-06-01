use crate::error::ErrorCode;
use crate::passkeys::PasskeyError;
use crate::rpc::types::RpcResponse;

use super::super::domain_uow::DomainUowError;

#[derive(Debug, Clone)]
pub(super) struct PasskeysCommandError {
    message: String,
    code: String,
}

impl PasskeysCommandError {
    pub(super) fn new(message: impl Into<String>, code: impl Into<String>) -> Self {
        Self {
            message: message.into(),
            code: code.into(),
        }
    }

    pub(super) fn empty_payload(field: &str) -> Self {
        Self::new(format!("{field} is required"), ErrorCode::EmptyPayload)
    }

    pub(super) fn invalid_credential_id() -> Self {
        Self::new("credentialIdB64Url is invalid", ErrorCode::InvalidContext)
    }

    pub(super) fn unsupported(reason: impl Into<String>) -> Self {
        Self::new(reason, "UNSUPPORTED")
    }

    pub(super) fn internal(message: impl Into<String>) -> Self {
        Self::new(message, ErrorCode::InternalError)
    }

    pub(super) fn vault_required() -> Self {
        Self::new("Vault not unlocked", ErrorCode::VaultRequired)
    }

    pub(super) fn into_rpc_response(self) -> RpcResponse {
        RpcResponse::error(self.message, Some(self.code))
    }
}

impl From<PasskeyError> for PasskeysCommandError {
    fn from(error: PasskeyError) -> Self {
        Self::new(error.message, error.code)
    }
}

impl From<DomainUowError> for PasskeysCommandError {
    fn from(error: DomainUowError) -> Self {
        Self::new(
            error.message().to_string(),
            error
                .code()
                .map(str::to_string)
                .unwrap_or_else(|| ErrorCode::InternalError.to_string()),
        )
    }
}
