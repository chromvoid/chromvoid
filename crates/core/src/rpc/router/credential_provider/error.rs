use crate::error::ErrorCode;
use crate::rpc::router::otp_sidecar::OtpSidecarError;
use crate::rpc::router::passmanager::otp::PassmanagerOtpError;
use crate::rpc::types::RpcResponse;

#[derive(Debug, Clone)]
pub(in crate::rpc::router) struct CredentialProviderCommandError {
    message: String,
    code: String,
}

impl CredentialProviderCommandError {
    pub(in crate::rpc::router) fn new(message: impl Into<String>, code: impl Into<String>) -> Self {
        Self {
            message: message.into(),
            code: code.into(),
        }
    }

    pub(in crate::rpc::router) fn empty_payload(field: &str) -> Self {
        Self::new(format!("{field} is required"), ErrorCode::EmptyPayload)
    }

    pub(in crate::rpc::router) fn provider_disabled() -> Self {
        Self::new("Provider disabled", ErrorCode::ProviderDisabled)
    }

    pub(in crate::rpc::router) fn vault_required() -> Self {
        Self::new("Vault not unlocked", ErrorCode::VaultRequired)
    }

    pub(in crate::rpc::router) fn provider_session_expired() -> Self {
        Self::new(
            "Provider session expired",
            ErrorCode::ProviderSessionExpired,
        )
    }

    pub(in crate::rpc::router) fn credential_not_allowlisted() -> Self {
        Self::new("Credential is not allowlisted", ErrorCode::AccessDenied)
    }

    pub(in crate::rpc::router) fn access_denied() -> Self {
        Self::new("Access denied", ErrorCode::AccessDenied)
    }

    pub(in crate::rpc::router) fn no_credential_match() -> Self {
        Self::new("No credential match", ErrorCode::NoMatch)
    }

    pub(in crate::rpc::router) fn no_otp_match() -> Self {
        Self::new("No OTP match", ErrorCode::NoMatch)
    }

    pub(in crate::rpc::router) fn invalid_context(message: impl Into<String>) -> Self {
        Self::new(message, ErrorCode::InvalidContext)
    }

    pub(in crate::rpc::router) fn hotp_autofill_unsupported() -> Self {
        Self::new("HOTP autofill is unsupported", ErrorCode::OtpGenerateFailed)
    }

    pub(in crate::rpc::router) fn internal(message: impl Into<String>) -> Self {
        Self::new(message, ErrorCode::InternalError)
    }

    pub(in crate::rpc::router) fn into_rpc_response(self) -> RpcResponse {
        RpcResponse::error(self.message, Some(self.code))
    }
}

impl From<OtpSidecarError> for CredentialProviderCommandError {
    fn from(error: OtpSidecarError) -> Self {
        let (message, code) = error.into_parts();
        Self::new(message, code)
    }
}

impl From<PassmanagerOtpError> for CredentialProviderCommandError {
    fn from(error: PassmanagerOtpError) -> Self {
        let code = error.code();
        Self::new(error.into_message(), code)
    }
}
