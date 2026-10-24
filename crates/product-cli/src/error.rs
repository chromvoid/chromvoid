use chromvoid_protocol::{AgentErrorV1, AgentResponseV1};
use thiserror::Error;

pub const EX_USAGE: u8 = 64;
pub const EX_DATAERR: u8 = 65;
pub const EX_UNAVAILABLE: u8 = 69;
pub const EX_SOFTWARE: u8 = 70;
pub const EX_TEMPFAIL: u8 = 75;
pub const EX_NOPERM: u8 = 77;
pub const EX_CONFIG: u8 = 78;

#[derive(Debug, Error)]
pub enum CliError {
    #[error("{message}")]
    Local {
        code: &'static str,
        message: String,
        retryable: bool,
        next_action: Option<&'static str>,
        exit_code: u8,
    },
    #[error("{}: {}", .0.code, .0.message)]
    Remote(AgentErrorV1),
}

impl CliError {
    pub fn usage(code: &'static str, message: impl Into<String>) -> Self {
        Self::Local {
            code,
            message: message.into(),
            retryable: false,
            next_action: Some("fix_command_input"),
            exit_code: EX_USAGE,
        }
    }

    pub fn data(code: &'static str, message: impl Into<String>) -> Self {
        Self::Local {
            code,
            message: message.into(),
            retryable: false,
            next_action: Some("upgrade_cli_or_desktop"),
            exit_code: EX_DATAERR,
        }
    }

    pub fn unavailable(code: &'static str, message: impl Into<String>) -> Self {
        Self::Local {
            code,
            message: message.into(),
            retryable: true,
            next_action: Some("open_chromvoid_and_pair"),
            exit_code: EX_UNAVAILABLE,
        }
    }

    pub fn software(code: &'static str, message: impl Into<String>) -> Self {
        Self::Local {
            code,
            message: message.into(),
            retryable: false,
            next_action: Some("open_chromvoid"),
            exit_code: EX_SOFTWARE,
        }
    }

    pub fn exit_code(&self) -> u8 {
        match self {
            Self::Local { exit_code, .. } => *exit_code,
            Self::Remote(error) => exit_code_for_agent_error(error),
        }
    }

    pub fn as_agent_error(&self) -> AgentErrorV1 {
        match self {
            Self::Remote(error) => error.clone(),
            Self::Local {
                code,
                message,
                retryable,
                next_action,
                ..
            } => AgentErrorV1 {
                code: (*code).to_string(),
                message: message.clone(),
                retryable: *retryable,
                next_action: next_action.map(str::to_string),
            },
        }
    }

    pub fn as_response(&self, request_id: impl Into<String>) -> AgentResponseV1 {
        AgentResponseV1::error(request_id, self.as_agent_error())
    }
}

pub fn exit_code_for_agent_error(error: &AgentErrorV1) -> u8 {
    match error.code.as_str() {
        "UNSUPPORTED_VERSION"
        | "INVALID_REQUEST"
        | "REQUEST_TOO_LARGE"
        | "REPLAY_DETECTED"
        | "STALE_REQUEST"
        | "INVALID_RESPONSE" => EX_DATAERR,
        "NOT_PAIRED" | "AGENT_REVOKED" | "GATEWAY_UNAVAILABLE" | "FEATURE_DISABLED_BY_ROLLOUT" => {
            EX_UNAVAILABLE
        }
        "VAULT_REQUIRED" | "APPROVAL_REJECTED" | "APPROVAL_EXPIRED" | "CANCELLED"
        | "RUN_REJECTED" | "PROPOSAL_REJECTED" | "PROPOSAL_EXPIRED" | "CAPABILITY_DENIED" => {
            EX_NOPERM
        }
        "NOT_FOUND"
        | "UNSUPPORTED_PLATFORM"
        | "REMOTE_CORE_UNSUPPORTED"
        | "STALE_REVISION"
        | "REVISION_CONFLICT"
        | "PATH_INVALID"
        | "EXECUTABLE_HASH_MISMATCH"
        | "EXECUTABLE_IDENTITY_MISMATCH"
        | "EXECUTABLE_NOT_FOUND"
        | "CWD_INVALID"
        | "WORKSPACE_MISMATCH"
        | "PROFILE_PRESET_MISMATCH"
        | "SECRET_NOT_FOUND"
        | "PROFILE_NOT_FOUND"
        | "PRESET_NOT_FOUND"
        | "PROPOSAL_NOT_FOUND"
        | "RUN_NOT_FOUND"
        | "SECRET_IN_USE"
        | "PROFILE_IN_USE"
        | "SECRET_RESOLUTION_FAILED"
        | "STALE_PROPOSAL"
        | "RUN_FINISHED"
        | "RUN_ALREADY_TERMINAL"
        | "INVALID_PRESET"
        | "INVALID_PROFILE" => EX_CONFIG,
        "DEVICE_STORE_UNAVAILABLE"
        | "CORE_RESPONSE_INVALID"
        | "SPAWN_FAILED"
        | "OUTPUT_BACKPRESSURE"
        | "INTERNAL"
        | "INTERNAL_ERROR" => EX_SOFTWARE,
        "RATE_LIMITED" | "RUN_LIMIT_REACHED" | "TEMPORARILY_UNAVAILABLE" => EX_TEMPFAIL,
        _ if error.retryable => EX_TEMPFAIL,
        _ => EX_NOPERM,
    }
}

pub fn validate_response(response: &AgentResponseV1, request_id: &str) -> Result<(), CliError> {
    if response.protocol_version != chromvoid_protocol::AGENT_PROTOCOL_VERSION
        || response.schema_version != chromvoid_protocol::AGENT_SCHEMA_VERSION
    {
        return Err(CliError::data(
            "UNSUPPORTED_VERSION",
            "Desktop returned an unsupported agent protocol version",
        ));
    }
    if response.request_id != request_id {
        return Err(CliError::data(
            "REQUEST_ID_MISMATCH",
            "Desktop response request_id does not match the request",
        ));
    }
    match (
        response.ok,
        response.data.is_some(),
        response.error.is_some(),
    ) {
        (true, true, false) | (false, false, true) => Ok(()),
        _ => Err(CliError::data(
            "INVALID_RESPONSE",
            "Desktop returned an invalid response envelope",
        )),
    }
}

#[cfg(test)]
mod tests {
    use super::*;

    #[test]
    fn maps_every_spec_wire_error_to_its_stable_exit_class() {
        let cases = [
            ("INVALID_REQUEST", EX_DATAERR),
            ("UNSUPPORTED_VERSION", EX_DATAERR),
            ("REQUEST_TOO_LARGE", EX_DATAERR),
            ("RATE_LIMITED", EX_TEMPFAIL),
            ("GATEWAY_UNAVAILABLE", EX_UNAVAILABLE),
            ("NOT_PAIRED", EX_UNAVAILABLE),
            ("AGENT_REVOKED", EX_UNAVAILABLE),
            ("UNSUPPORTED_PLATFORM", EX_CONFIG),
            ("REMOTE_CORE_UNSUPPORTED", EX_CONFIG),
            ("VAULT_REQUIRED", EX_NOPERM),
            ("FEATURE_DISABLED_BY_ROLLOUT", EX_UNAVAILABLE),
            ("DEVICE_STORE_UNAVAILABLE", EX_SOFTWARE),
            ("SECRET_NOT_FOUND", EX_CONFIG),
            ("PROFILE_NOT_FOUND", EX_CONFIG),
            ("PRESET_NOT_FOUND", EX_CONFIG),
            ("PROPOSAL_NOT_FOUND", EX_CONFIG),
            ("RUN_NOT_FOUND", EX_CONFIG),
            ("REVISION_CONFLICT", EX_CONFIG),
            ("SECRET_IN_USE", EX_CONFIG),
            ("PROFILE_IN_USE", EX_CONFIG),
            ("PROPOSAL_REJECTED", EX_NOPERM),
            ("PROPOSAL_EXPIRED", EX_NOPERM),
            ("APPROVAL_REJECTED", EX_NOPERM),
            ("APPROVAL_EXPIRED", EX_NOPERM),
            ("CANCELLED", EX_NOPERM),
            ("PROFILE_PRESET_MISMATCH", EX_CONFIG),
            ("WORKSPACE_MISMATCH", EX_CONFIG),
            ("EXECUTABLE_IDENTITY_MISMATCH", EX_CONFIG),
            ("RUN_LIMIT_REACHED", EX_TEMPFAIL),
            ("SECRET_RESOLUTION_FAILED", EX_CONFIG),
            ("SPAWN_FAILED", EX_SOFTWARE),
            ("OUTPUT_BACKPRESSURE", EX_SOFTWARE),
            ("RUN_ALREADY_TERMINAL", EX_CONFIG),
            ("INTERNAL", EX_SOFTWARE),
        ];

        for (code, expected) in cases {
            // A known wire code owns its exit class. It must not accidentally
            // fall through to the retryability-based forward-compat fallback.
            for retryable in [false, true] {
                let error = AgentErrorV1 {
                    code: code.into(),
                    message: "message".into(),
                    retryable,
                    next_action: None,
                };
                assert_eq!(
                    exit_code_for_agent_error(&error),
                    expected,
                    "unexpected exit class for {code} (retryable={retryable})"
                );
            }
        }
    }
}
