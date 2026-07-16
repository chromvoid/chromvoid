use chromvoid_protocol::{
    AgentPresetDraftV1, AgentProfileDraftV1, AgentProposalMetadataV1, AgentProposalStatusV1,
    AgentRunMetadataV1, AgentRunStatusV1, MutationOperationV1,
};
use serde::{Deserialize, Serialize};

pub const PROPOSAL_TTL_MS: u64 = 10 * 60 * 1_000;
pub const RUN_APPROVAL_TTL_MS: u64 = 2 * 60 * 1_000;
pub const MAX_ACTIVE_RUNS: usize = 8;
pub const RECENT_RUN_LIMIT: usize = 32;

#[derive(Debug, Clone, Serialize, Deserialize, PartialEq, Eq)]
#[serde(deny_unknown_fields)]
pub struct DevicePreset {
    pub id: String,
    pub profile_id: String,
    pub slug: String,
    pub label: String,
    pub revision: u64,
    pub workspace_root: String,
    pub cwd: String,
    pub executable: String,
    pub executable_sha256: String,
    pub args: Vec<String>,
    pub passthrough_env: Vec<String>,
    pub created_at_epoch_ms: u64,
    pub updated_at_epoch_ms: u64,
}

impl From<&DevicePreset> for chromvoid_protocol::AgentPresetMetadataV1 {
    fn from(preset: &DevicePreset) -> Self {
        Self {
            id: preset.id.clone(),
            profile_id: preset.profile_id.clone(),
            slug: preset.slug.clone(),
            label: preset.label.clone(),
            revision: preset.revision,
            workspace_root: preset.workspace_root.clone(),
            cwd: preset.cwd.clone(),
            executable: preset.executable.clone(),
            executable_sha256: preset.executable_sha256.clone(),
            args: preset.args.clone(),
            passthrough_env: preset.passthrough_env.clone(),
        }
    }
}

#[derive(Debug, Clone, Serialize, Deserialize, PartialEq, Eq)]
#[serde(tag = "resource_kind", content = "draft", rename_all = "snake_case")]
pub enum ProposalDraft {
    Profile(AgentProfileDraftV1),
    Preset(AgentPresetDraftV1),
}

#[derive(Debug, Clone, Serialize, Deserialize, PartialEq, Eq)]
#[serde(deny_unknown_fields)]
pub struct RunApprovalSnapshot {
    pub run: AgentRunMetadataV1,
    pub actor_label: Option<String>,
    pub profile_label: String,
    pub profile_revision: u64,
    pub preset_label: String,
    pub preset_revision: u64,
    pub workspace_root: String,
    pub executable: String,
    pub executable_sha256: String,
    pub args: Vec<String>,
    pub cwd: String,
    pub passthrough_env: Vec<String>,
    pub env_sources: Vec<RunEnvSourceSnapshot>,
    pub reason: Option<String>,
    pub created_at_epoch_ms: u64,
    pub expires_at_epoch_ms: u64,
}

#[derive(Debug, Clone, Serialize, Deserialize, PartialEq, Eq)]
#[serde(deny_unknown_fields)]
pub struct RunEnvSourceSnapshot {
    pub name: String,
    pub secret_id: Option<String>,
    pub secret_label: Option<String>,
}

#[derive(Debug, Clone, Serialize, Deserialize, PartialEq, Eq)]
#[serde(deny_unknown_fields)]
pub struct EnvRuntimeStatus {
    pub platform_supported: bool,
    pub vault_unlocked: bool,
    pub device_store_available: bool,
    pub device_store_error_code: Option<String>,
    pub active_runs: u32,
    pub pending_approvals: u32,
    pub pending_proposals: u32,
}

#[derive(Debug, Clone, PartialEq, Eq)]
pub struct EnvRuntimeError {
    pub code: EnvRuntimeErrorCode,
    pub message: String,
}

#[allow(non_camel_case_types)]
#[derive(Debug, Clone, Copy, PartialEq, Eq, Hash)]
pub enum EnvRuntimeErrorCode {
    AGENT_REVOKED,
    APPROVAL_CLOSED,
    APPROVAL_EXPIRED,
    CANCELLED,
    CONFLICT,
    CORE_ERROR,
    CORE_RESPONSE_INVALID,
    CORE_UNAVAILABLE,
    CWD_UNAVAILABLE,
    DEVICE_STORE_CORRUPT,
    DEVICE_STORE_KEY_UNAVAILABLE,
    DEVICE_STORE_LOCKED,
    DEVICE_STORE_UNAVAILABLE,
    DEVICE_STORE_VERSION,
    DEVICE_STORE_WRITE_FAILED,
    ENTITLEMENT_UNAVAILABLE,
    EXECUTABLE_IDENTITY_MISMATCH,
    EXECUTABLE_UNAVAILABLE,
    FEATURE_DISABLED_BY_ROLLOUT,
    GATEWAY_UNAVAILABLE,
    INTERNAL,
    INVALID_CWD,
    INVALID_DESCRIPTION,
    INVALID_ENV_NAME,
    INVALID_EXECUTABLE,
    INVALID_LABEL,
    INVALID_PATH,
    INVALID_PRESET,
    INVALID_PROFILE,
    INVALID_PROPOSAL,
    INVALID_REASON,
    INVALID_REQUEST,
    INVALID_SLUG,
    LOCAL_CORE_REQUIRED,
    NOT_FOUND,
    NOT_READY,
    OUTPUT_BACKPRESSURE,
    PLATFORM_UNSUPPORTED,
    PRESET_LIMIT_REACHED,
    PRESET_NOT_FOUND,
    PROFILE_IN_USE,
    PROFILE_NOT_FOUND,
    PROFILE_PRESET_MISMATCH,
    PROPOSAL_CLOSED,
    PRO_REQUIRED,
    REMOTE_CORE_UNSUPPORTED,
    REVISION_CONFLICT,
    RUN_ALREADY_TERMINAL,
    RUN_LIMIT_REACHED,
    RUN_NOT_FOUND,
    SECRET_BINDING_REQUIRED,
    SECRET_IN_USE,
    SECRET_RESOLUTION_FAILED,
    SESSION_DISCONNECTED,
    SHELL_FORBIDDEN,
    SPAWN_FAILED,
    UNSUPPORTED_PLATFORM,
    VAULT_REQUIRED,
    WORKSPACE_MISMATCH,
    WORKSPACE_UNAVAILABLE,
}

impl EnvRuntimeErrorCode {
    pub const ALL: &'static [Self] = &[
        Self::AGENT_REVOKED,
        Self::APPROVAL_CLOSED,
        Self::APPROVAL_EXPIRED,
        Self::CANCELLED,
        Self::CONFLICT,
        Self::CORE_ERROR,
        Self::CORE_RESPONSE_INVALID,
        Self::CORE_UNAVAILABLE,
        Self::CWD_UNAVAILABLE,
        Self::DEVICE_STORE_CORRUPT,
        Self::DEVICE_STORE_KEY_UNAVAILABLE,
        Self::DEVICE_STORE_LOCKED,
        Self::DEVICE_STORE_UNAVAILABLE,
        Self::DEVICE_STORE_VERSION,
        Self::DEVICE_STORE_WRITE_FAILED,
        Self::ENTITLEMENT_UNAVAILABLE,
        Self::EXECUTABLE_IDENTITY_MISMATCH,
        Self::EXECUTABLE_UNAVAILABLE,
        Self::FEATURE_DISABLED_BY_ROLLOUT,
        Self::GATEWAY_UNAVAILABLE,
        Self::INTERNAL,
        Self::INVALID_CWD,
        Self::INVALID_DESCRIPTION,
        Self::INVALID_ENV_NAME,
        Self::INVALID_EXECUTABLE,
        Self::INVALID_LABEL,
        Self::INVALID_PATH,
        Self::INVALID_PRESET,
        Self::INVALID_PROFILE,
        Self::INVALID_PROPOSAL,
        Self::INVALID_REASON,
        Self::INVALID_REQUEST,
        Self::INVALID_SLUG,
        Self::LOCAL_CORE_REQUIRED,
        Self::NOT_FOUND,
        Self::NOT_READY,
        Self::OUTPUT_BACKPRESSURE,
        Self::PLATFORM_UNSUPPORTED,
        Self::PRESET_LIMIT_REACHED,
        Self::PRESET_NOT_FOUND,
        Self::PROFILE_IN_USE,
        Self::PROFILE_NOT_FOUND,
        Self::PROFILE_PRESET_MISMATCH,
        Self::PROPOSAL_CLOSED,
        Self::PRO_REQUIRED,
        Self::REMOTE_CORE_UNSUPPORTED,
        Self::REVISION_CONFLICT,
        Self::RUN_ALREADY_TERMINAL,
        Self::RUN_LIMIT_REACHED,
        Self::RUN_NOT_FOUND,
        Self::SECRET_BINDING_REQUIRED,
        Self::SECRET_IN_USE,
        Self::SECRET_RESOLUTION_FAILED,
        Self::SESSION_DISCONNECTED,
        Self::SHELL_FORBIDDEN,
        Self::SPAWN_FAILED,
        Self::UNSUPPORTED_PLATFORM,
        Self::VAULT_REQUIRED,
        Self::WORKSPACE_MISMATCH,
        Self::WORKSPACE_UNAVAILABLE,
    ];

    pub const fn as_str(self) -> &'static str {
        match self {
            Self::AGENT_REVOKED => "AGENT_REVOKED",
            Self::APPROVAL_CLOSED => "APPROVAL_CLOSED",
            Self::APPROVAL_EXPIRED => "APPROVAL_EXPIRED",
            Self::CANCELLED => "CANCELLED",
            Self::CONFLICT => "CONFLICT",
            Self::CORE_ERROR => "CORE_ERROR",
            Self::CORE_RESPONSE_INVALID => "CORE_RESPONSE_INVALID",
            Self::CORE_UNAVAILABLE => "CORE_UNAVAILABLE",
            Self::CWD_UNAVAILABLE => "CWD_UNAVAILABLE",
            Self::DEVICE_STORE_CORRUPT => "DEVICE_STORE_CORRUPT",
            Self::DEVICE_STORE_KEY_UNAVAILABLE => "DEVICE_STORE_KEY_UNAVAILABLE",
            Self::DEVICE_STORE_LOCKED => "DEVICE_STORE_LOCKED",
            Self::DEVICE_STORE_UNAVAILABLE => "DEVICE_STORE_UNAVAILABLE",
            Self::DEVICE_STORE_VERSION => "DEVICE_STORE_VERSION",
            Self::DEVICE_STORE_WRITE_FAILED => "DEVICE_STORE_WRITE_FAILED",
            Self::ENTITLEMENT_UNAVAILABLE => "ENTITLEMENT_UNAVAILABLE",
            Self::EXECUTABLE_IDENTITY_MISMATCH => "EXECUTABLE_IDENTITY_MISMATCH",
            Self::EXECUTABLE_UNAVAILABLE => "EXECUTABLE_UNAVAILABLE",
            Self::FEATURE_DISABLED_BY_ROLLOUT => "FEATURE_DISABLED_BY_ROLLOUT",
            Self::GATEWAY_UNAVAILABLE => "GATEWAY_UNAVAILABLE",
            Self::INTERNAL => "INTERNAL",
            Self::INVALID_CWD => "INVALID_CWD",
            Self::INVALID_DESCRIPTION => "INVALID_DESCRIPTION",
            Self::INVALID_ENV_NAME => "INVALID_ENV_NAME",
            Self::INVALID_EXECUTABLE => "INVALID_EXECUTABLE",
            Self::INVALID_LABEL => "INVALID_LABEL",
            Self::INVALID_PATH => "INVALID_PATH",
            Self::INVALID_PRESET => "INVALID_PRESET",
            Self::INVALID_PROFILE => "INVALID_PROFILE",
            Self::INVALID_PROPOSAL => "INVALID_PROPOSAL",
            Self::INVALID_REASON => "INVALID_REASON",
            Self::INVALID_REQUEST => "INVALID_REQUEST",
            Self::INVALID_SLUG => "INVALID_SLUG",
            Self::LOCAL_CORE_REQUIRED => "LOCAL_CORE_REQUIRED",
            Self::NOT_FOUND => "NOT_FOUND",
            Self::NOT_READY => "NOT_READY",
            Self::OUTPUT_BACKPRESSURE => "OUTPUT_BACKPRESSURE",
            Self::PLATFORM_UNSUPPORTED => "PLATFORM_UNSUPPORTED",
            Self::PRESET_LIMIT_REACHED => "PRESET_LIMIT_REACHED",
            Self::PRESET_NOT_FOUND => "PRESET_NOT_FOUND",
            Self::PROFILE_IN_USE => "PROFILE_IN_USE",
            Self::PROFILE_NOT_FOUND => "PROFILE_NOT_FOUND",
            Self::PROFILE_PRESET_MISMATCH => "PROFILE_PRESET_MISMATCH",
            Self::PROPOSAL_CLOSED => "PROPOSAL_CLOSED",
            Self::PRO_REQUIRED => "PRO_REQUIRED",
            Self::REMOTE_CORE_UNSUPPORTED => "REMOTE_CORE_UNSUPPORTED",
            Self::REVISION_CONFLICT => "REVISION_CONFLICT",
            Self::RUN_ALREADY_TERMINAL => "RUN_ALREADY_TERMINAL",
            Self::RUN_LIMIT_REACHED => "RUN_LIMIT_REACHED",
            Self::RUN_NOT_FOUND => "RUN_NOT_FOUND",
            Self::SECRET_BINDING_REQUIRED => "SECRET_BINDING_REQUIRED",
            Self::SECRET_IN_USE => "SECRET_IN_USE",
            Self::SECRET_RESOLUTION_FAILED => "SECRET_RESOLUTION_FAILED",
            Self::SESSION_DISCONNECTED => "SESSION_DISCONNECTED",
            Self::SHELL_FORBIDDEN => "SHELL_FORBIDDEN",
            Self::SPAWN_FAILED => "SPAWN_FAILED",
            Self::UNSUPPORTED_PLATFORM => "UNSUPPORTED_PLATFORM",
            Self::VAULT_REQUIRED => "VAULT_REQUIRED",
            Self::WORKSPACE_MISMATCH => "WORKSPACE_MISMATCH",
            Self::WORKSPACE_UNAVAILABLE => "WORKSPACE_UNAVAILABLE",
        }
    }

    pub fn from_core(code: &str) -> Self {
        match code {
            "ENV_RUNTIME_NOT_FOUND" | "NOT_FOUND" => Self::NOT_FOUND,
            "ENV_RUNTIME_VALIDATION_FAILED" | "INVALID_REQUEST" => Self::INVALID_REQUEST,
            "ENV_RUNTIME_REVISION_CONFLICT" | "REVISION_CONFLICT" | "STALE_REVISION" => {
                Self::REVISION_CONFLICT
            }
            "ENV_RUNTIME_SECRET_IN_USE" | "SECRET_IN_USE" => Self::SECRET_IN_USE,
            "ENV_RUNTIME_RESOLUTION_FAILED" | "RESOLUTION_FAILED" | "SECRET_RESOLUTION_FAILED" => {
                Self::SECRET_RESOLUTION_FAILED
            }
            "PROFILE_IN_USE" => Self::PROFILE_IN_USE,
            "PROFILE_PRESET_MISMATCH" => Self::PROFILE_PRESET_MISMATCH,
            "VAULT_REQUIRED" => Self::VAULT_REQUIRED,
            "PRO_REQUIRED" => Self::PRO_REQUIRED,
            "INTERNAL" | "INTERNAL_ERROR" => Self::INTERNAL,
            _ => Self::INTERNAL,
        }
    }

    pub fn from_feature(code: Option<&str>) -> Self {
        match code {
            Some("FEATURE_UNSUPPORTED_ON_PLATFORM" | "UNSUPPORTED_PLATFORM") => {
                Self::UNSUPPORTED_PLATFORM
            }
            Some("REMOTE_CORE_UNSUPPORTED") => Self::REMOTE_CORE_UNSUPPORTED,
            Some("PRO_REQUIRED") => Self::PRO_REQUIRED,
            Some("FEATURE_DISABLED_BY_ROLLOUT") => Self::FEATURE_DISABLED_BY_ROLLOUT,
            Some("ENTITLEMENT_UNAVAILABLE") => Self::ENTITLEMENT_UNAVAILABLE,
            _ => Self::INTERNAL,
        }
    }
}

impl std::fmt::Display for EnvRuntimeErrorCode {
    fn fmt(&self, formatter: &mut std::fmt::Formatter<'_>) -> std::fmt::Result {
        formatter.write_str(self.as_str())
    }
}

impl PartialEq<&str> for EnvRuntimeErrorCode {
    fn eq(&self, other: &&str) -> bool {
        self.as_str() == *other
    }
}

impl EnvRuntimeError {
    pub fn new(code: EnvRuntimeErrorCode, message: impl Into<String>) -> Self {
        Self {
            code,
            message: message.into(),
        }
    }
}

pub fn pending_proposal_metadata(
    id: String,
    actor_id: String,
    resource_kind: &str,
    operation: MutationOperationV1,
    now_ms: u64,
) -> AgentProposalMetadataV1 {
    AgentProposalMetadataV1 {
        id,
        actor_id,
        resource_kind: resource_kind.to_string(),
        operation,
        status: AgentProposalStatusV1::Pending,
        created_at_epoch_ms: now_ms,
        expires_at_epoch_ms: now_ms.saturating_add(PROPOSAL_TTL_MS),
    }
}

pub fn pending_run_metadata(
    id: String,
    actor_id: String,
    profile_id: String,
    preset_id: String,
) -> AgentRunMetadataV1 {
    AgentRunMetadataV1 {
        id,
        actor_id,
        profile_id,
        preset_id,
        status: AgentRunStatusV1::ApprovalPending,
        process_id: None,
        started_at_epoch_ms: None,
        finished_at_epoch_ms: None,
        exit_code: None,
        signal: None,
    }
}
