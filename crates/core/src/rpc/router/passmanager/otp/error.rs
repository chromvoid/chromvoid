use std::fmt;

use crate::error::ErrorCode;
use crate::rpc::router::otp_sidecar::OtpSidecarError;
use crate::rpc::types::RpcResponse;

use super::super::otp_target::OtpTargetError;

#[derive(Debug, Clone)]
pub(in crate::rpc::router) struct PassmanagerOtpError {
    message: String,
    code: ErrorCode,
}

impl PassmanagerOtpError {
    pub(super) fn new(message: impl Into<String>, code: ErrorCode) -> Self {
        Self {
            message: message.into(),
            code,
        }
    }

    pub(super) fn empty_payload(message: impl Into<String>) -> Self {
        Self::new(message, ErrorCode::EmptyPayload)
    }

    pub(super) fn access_denied() -> Self {
        Self::new("Access denied", ErrorCode::AccessDenied)
    }

    pub(in crate::rpc::router) fn vault_required() -> Self {
        Self::new("Vault not unlocked", ErrorCode::VaultRequired)
    }

    pub(super) fn target_not_found() -> Self {
        Self::new("OTP secret not found", ErrorCode::OtpSecretNotFound)
    }

    pub(super) fn resolve_failed(error: OtpTargetError) -> Self {
        Self::new(
            format!("Failed to resolve OTP entry: {}", error),
            ErrorCode::OtpGenerateFailed,
        )
    }

    pub(in crate::rpc::router) fn code(&self) -> ErrorCode {
        self.code
    }

    pub(in crate::rpc::router) fn into_message(self) -> String {
        self.message
    }

    pub(in crate::rpc::router) fn into_parts(self) -> (String, ErrorCode) {
        (self.message, self.code)
    }

    pub(in crate::rpc::router) fn into_rpc_response(self) -> RpcResponse {
        let (message, code) = self.into_parts();
        RpcResponse::error(message, Some(code))
    }
}

impl From<OtpSidecarError> for PassmanagerOtpError {
    fn from(error: OtpSidecarError) -> Self {
        let (message, code) = error.into_parts();
        Self::new(message, code)
    }
}

impl fmt::Display for PassmanagerOtpError {
    fn fmt(&self, f: &mut fmt::Formatter<'_>) -> fmt::Result {
        f.write_str(&self.message)
    }
}
