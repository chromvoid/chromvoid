use crate::error::ErrorCode;
use crate::rpc::types::RpcResponse;

use super::super::master_material::MasterMaterialError;

#[derive(Debug, Clone)]
pub(in crate::rpc::router) struct MasterRekeyError {
    message: String,
    code: Option<String>,
}

pub(in crate::rpc::router) type MasterRekeyResult<T> = Result<T, MasterRekeyError>;

impl MasterRekeyError {
    pub(in crate::rpc::router::master_rekey) fn new(
        message: impl Into<String>,
        code: Option<ErrorCode>,
    ) -> Self {
        Self {
            message: message.into(),
            code: code.map(String::from),
        }
    }

    pub(in crate::rpc::router::master_rekey) fn empty_payload(field: &str) -> Self {
        Self::new(
            format!("{field} is required"),
            Some(ErrorCode::EmptyPayload),
        )
    }

    pub(in crate::rpc::router::master_rekey) fn password_policy(
        message: impl Into<String>,
    ) -> Self {
        Self::new(message, Some(ErrorCode::MasterRekeyPasswordPolicy))
    }

    pub(in crate::rpc::router::master_rekey) fn invalid_current_password() -> Self {
        Self::new(
            "Current master password is invalid",
            Some(ErrorCode::MasterRekeyInvalidCurrentPassword),
        )
    }

    pub(in crate::rpc::router::master_rekey) fn artifact_unsupported(
        message: impl Into<String>,
    ) -> Self {
        Self::new(message, Some(ErrorCode::MasterRekeyArtifactUnsupported))
    }

    pub(in crate::rpc::router::master_rekey) fn integrity_failed(
        message: impl Into<String>,
    ) -> Self {
        Self::new(message, Some(ErrorCode::MasterRekeyIntegrityFailed))
    }

    pub(in crate::rpc::router::master_rekey) fn internal(message: impl Into<String>) -> Self {
        Self::new(message, Some(ErrorCode::InternalError))
    }

    pub(in crate::rpc::router::master_rekey) fn message(&self) -> &str {
        &self.message
    }

    pub(in crate::rpc::router::master_rekey) fn code(&self) -> Option<&str> {
        self.code.as_deref()
    }

    pub(in crate::rpc::router::master_rekey) fn into_parts(self) -> (String, Option<String>) {
        let message = self.message().to_owned();
        let code = self.code().map(str::to_owned);
        (message, code)
    }

    pub(in crate::rpc::router) fn into_message(self) -> String {
        self.message
    }

    pub(in crate::rpc::router::master_rekey) fn into_rpc_response(self) -> RpcResponse {
        let (message, code) = self.into_parts();
        RpcResponse::error(message, code)
    }
}

impl From<MasterMaterialError> for MasterRekeyError {
    fn from(error: MasterMaterialError) -> Self {
        let (message, code) = error.into_parts();
        Self { message, code }
    }
}

#[cfg(test)]
mod tests {
    use super::MasterRekeyError;

    #[test]
    fn master_rekey_error_constructors_preserve_public_codes() {
        let (message, code) = MasterRekeyError::empty_payload("current_password").into_parts();
        assert_eq!(message, "current_password is required");
        assert_eq!(code.as_deref(), Some("EMPTY_PAYLOAD"));

        let (message, code) = MasterRekeyError::invalid_current_password().into_parts();
        assert_eq!(message, "Current master password is invalid");
        assert_eq!(
            code.as_deref(),
            Some("MASTER_REKEY_INVALID_CURRENT_PASSWORD")
        );

        let (message, code) = MasterRekeyError::integrity_failed("integrity").into_parts();
        assert_eq!(message, "integrity");
        assert_eq!(code.as_deref(), Some("MASTER_REKEY_INTEGRITY_FAILED"));
    }
}
