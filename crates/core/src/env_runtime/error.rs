use std::fmt;

/// Stable machine-readable failures for the portable Env Runtime domain.
#[derive(Debug, Clone, Copy, PartialEq, Eq)]
pub enum EnvRuntimeErrorCode {
    VaultRequired,
    ProRequired,
    NotFound,
    ValidationFailed,
    RevisionConflict,
    SecretInUse,
    ResolutionFailed,
    ReauthFailed,
    ReauthLocked,
    Internal,
}

impl EnvRuntimeErrorCode {
    pub const fn as_str(self) -> &'static str {
        match self {
            Self::VaultRequired => "VAULT_REQUIRED",
            Self::ProRequired => "PRO_REQUIRED",
            Self::NotFound => "ENV_RUNTIME_NOT_FOUND",
            Self::ValidationFailed => "ENV_RUNTIME_VALIDATION_FAILED",
            Self::RevisionConflict => "ENV_RUNTIME_REVISION_CONFLICT",
            Self::SecretInUse => "ENV_RUNTIME_SECRET_IN_USE",
            Self::ResolutionFailed => "ENV_RUNTIME_RESOLUTION_FAILED",
            Self::ReauthFailed => "ENV_RUNTIME_REAUTH_FAILED",
            Self::ReauthLocked => "ENV_RUNTIME_REAUTH_LOCKED",
            Self::Internal => "INTERNAL_ERROR",
        }
    }
}

#[derive(Debug, Clone, PartialEq, Eq)]
pub struct EnvRuntimeError {
    code: EnvRuntimeErrorCode,
    message: String,
}

impl EnvRuntimeError {
    pub fn new(code: EnvRuntimeErrorCode, message: impl Into<String>) -> Self {
        Self {
            code,
            message: message.into(),
        }
    }

    pub fn code(&self) -> EnvRuntimeErrorCode {
        self.code
    }

    pub fn message(&self) -> &str {
        &self.message
    }

    pub(crate) fn validation(message: impl Into<String>) -> Self {
        Self::new(EnvRuntimeErrorCode::ValidationFailed, message)
    }

    pub(crate) fn secret_not_found() -> Self {
        Self::new(EnvRuntimeErrorCode::NotFound, "Env secret not found")
    }

    pub(crate) fn profile_not_found() -> Self {
        Self::new(EnvRuntimeErrorCode::NotFound, "Env profile not found")
    }

    pub(crate) fn revision_conflict() -> Self {
        Self::new(
            EnvRuntimeErrorCode::RevisionConflict,
            "Env Runtime revision conflict",
        )
    }

    pub(crate) fn internal(message: impl Into<String>) -> Self {
        Self::new(EnvRuntimeErrorCode::Internal, message)
    }
}

impl fmt::Display for EnvRuntimeError {
    fn fmt(&self, formatter: &mut fmt::Formatter<'_>) -> fmt::Result {
        formatter.write_str(&self.message)
    }
}

impl std::error::Error for EnvRuntimeError {}

pub type EnvRuntimeResult<T> = Result<T, EnvRuntimeError>;
