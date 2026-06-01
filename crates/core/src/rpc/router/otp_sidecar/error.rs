use std::fmt;

use crate::error::ErrorCode;

pub(crate) type OtpSidecarResult<T> = Result<T, OtpSidecarError>;

#[derive(Debug, Clone)]
pub(crate) struct OtpSidecarError {
    message: String,
    code: ErrorCode,
}

impl OtpSidecarError {
    pub(crate) fn new(message: impl Into<String>, code: ErrorCode) -> Self {
        Self {
            message: message.into(),
            code,
        }
    }

    pub(crate) fn internal(message: impl Into<String>) -> Self {
        Self::new(message, ErrorCode::InternalError)
    }

    pub(crate) fn node_not_found() -> Self {
        Self::new("Node not found", ErrorCode::NodeNotFound)
    }

    pub(crate) fn otp_secret_not_found() -> Self {
        Self::new("OTP secret not found", ErrorCode::OtpSecretNotFound)
    }

    pub(crate) fn otp_settings_not_found() -> Self {
        Self::new("OTP settings not found", ErrorCode::OtpSettingsNotFound)
    }

    pub(crate) fn otp_settings_invalid(message: impl Into<String>) -> Self {
        Self::new(message, ErrorCode::OtpSettingsInvalid)
    }

    pub(crate) fn otp_generate_failed(message: impl Into<String>) -> Self {
        Self::new(message, ErrorCode::OtpGenerateFailed)
    }

    pub(crate) fn message(&self) -> &str {
        &self.message
    }

    pub(crate) fn code(&self) -> ErrorCode {
        self.code
    }

    pub(crate) fn into_parts(self) -> (String, ErrorCode) {
        (self.message, self.code)
    }

    pub(crate) fn into_message(self) -> String {
        self.message
    }
}

impl fmt::Display for OtpSidecarError {
    fn fmt(&self, f: &mut fmt::Formatter<'_>) -> fmt::Result {
        f.write_str(self.message())
    }
}

#[cfg(test)]
mod tests {
    use super::*;

    #[test]
    fn otp_sidecar_error_accessors_preserve_message_and_code() {
        let error = OtpSidecarError::internal("storage failed");

        assert_eq!(error.message(), "storage failed");
        assert_eq!(error.code(), ErrorCode::InternalError);
        assert_eq!(
            error.clone().into_parts(),
            ("storage failed".to_string(), ErrorCode::InternalError)
        );
        assert_eq!(error.into_message(), "storage failed");
    }

    #[test]
    fn otp_sidecar_error_constructors_preserve_public_codes() {
        assert_eq!(
            OtpSidecarError::node_not_found().into_parts(),
            ("Node not found".to_string(), ErrorCode::NodeNotFound)
        );
        assert_eq!(
            OtpSidecarError::otp_secret_not_found().into_parts(),
            (
                "OTP secret not found".to_string(),
                ErrorCode::OtpSecretNotFound
            )
        );
        assert_eq!(
            OtpSidecarError::otp_settings_not_found().into_parts(),
            (
                "OTP settings not found".to_string(),
                ErrorCode::OtpSettingsNotFound
            )
        );
        assert_eq!(
            OtpSidecarError::otp_settings_invalid("Invalid algorithm").into_parts(),
            (
                "Invalid algorithm".to_string(),
                ErrorCode::OtpSettingsInvalid
            )
        );
        assert_eq!(
            OtpSidecarError::otp_generate_failed("Failed to read OTP secrets: io").into_parts(),
            (
                "Failed to read OTP secrets: io".to_string(),
                ErrorCode::OtpGenerateFailed
            )
        );
    }
}
