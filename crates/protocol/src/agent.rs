//! Versioned, fail-closed protocol used by the shipped `chromvoid` CLI.
//!
//! This protocol is intentionally action-oriented. It is not a generic Core
//! RPC surface and none of its response types can carry an EnvSecret value or
//! a resolved environment map.

use serde::{Deserialize, Serialize};

pub const AGENT_PROTOCOL_VERSION: u16 = 1;
pub const AGENT_SCHEMA_VERSION: u16 = 1;
pub const AGENT_MAX_REQUEST_BYTES: usize = 256 * 1024;
/// Accommodates the bounded v1 metadata collections after worst-case JSON
/// escaping while keeping client-side reassembly finite.
pub const AGENT_MAX_RESPONSE_BYTES: usize = 128 * 1024 * 1024;
pub const AGENT_MAX_REASON_BYTES: usize = 200;
pub const AGENT_OUTPUT_CHUNK_BYTES: usize = 32 * 1024;

#[derive(Debug, Clone, Serialize, Deserialize, PartialEq, Eq)]
#[serde(deny_unknown_fields)]
pub struct AgentRequestV1 {
    pub protocol_version: u16,
    pub schema_version: u16,
    pub request_id: String,
    pub timestamp_secs: u64,
    #[serde(flatten)]
    pub command: AgentCommandV1,
}

#[derive(Debug, Clone, Serialize, Deserialize, PartialEq, Eq)]
#[serde(
    tag = "command",
    content = "data",
    rename_all = "snake_case",
    deny_unknown_fields
)]
pub enum AgentCommandV1 {
    Hello {
        client_version: String,
    },
    ConnectionStatus,
    EnvStatus,
    SecretsList,
    ProfilesList,
    ProfileGet {
        profile: String,
    },
    ProfilePropose {
        operation: MutationOperationV1,
        target: Option<String>,
        base_revision: Option<u64>,
        draft: Option<AgentProfileDraftV1>,
    },
    PresetsList {
        profile: Option<String>,
    },
    PresetGet {
        preset: String,
    },
    PresetPropose {
        operation: MutationOperationV1,
        target: Option<String>,
        base_revision: Option<u64>,
        draft: Option<AgentPresetDraftV1>,
    },
    ProposalWait {
        proposal_id: String,
    },
    Run {
        profile: String,
        preset: String,
        reason: Option<String>,
    },
    RunsList,
    RunStop {
        run_id: String,
    },
    RunsStopAll,
}

#[derive(Debug, Clone, Copy, Serialize, Deserialize, PartialEq, Eq)]
#[serde(rename_all = "snake_case")]
pub enum MutationOperationV1 {
    Create,
    Update,
    Delete,
}

#[derive(Debug, Clone, Serialize, Deserialize, PartialEq, Eq)]
#[serde(deny_unknown_fields)]
pub struct AgentProfileDraftV1 {
    pub slug: String,
    pub label: String,
    pub description: Option<String>,
    pub variables: Vec<AgentVariableMappingV1>,
}

#[derive(Debug, Clone, Serialize, Deserialize, PartialEq, Eq)]
#[serde(deny_unknown_fields)]
pub struct AgentVariableMappingV1 {
    pub name: String,
    /// Existing secret metadata identifier. `None` leaves the mapping unbound
    /// until the user chooses or creates a secret in the approval UI.
    pub secret_id: Option<String>,
}

#[derive(Debug, Clone, Serialize, Deserialize, PartialEq, Eq)]
#[serde(deny_unknown_fields)]
pub struct AgentPresetDraftV1 {
    pub profile_id: String,
    pub slug: String,
    pub label: String,
    pub workspace_root: String,
    pub cwd: String,
    pub executable: String,
    pub args: Vec<String>,
    #[serde(default)]
    pub passthrough_env: Vec<String>,
}

#[derive(Debug, Clone, Serialize, Deserialize, PartialEq, Eq)]
#[serde(deny_unknown_fields)]
pub struct AgentResponseV1 {
    pub protocol_version: u16,
    pub schema_version: u16,
    pub request_id: String,
    pub ok: bool,
    #[serde(skip_serializing_if = "Option::is_none")]
    pub data: Option<AgentResponseDataV1>,
    #[serde(skip_serializing_if = "Option::is_none")]
    pub error: Option<AgentErrorV1>,
}

impl AgentResponseV1 {
    pub fn success(request_id: impl Into<String>, data: AgentResponseDataV1) -> Self {
        Self {
            protocol_version: AGENT_PROTOCOL_VERSION,
            schema_version: AGENT_SCHEMA_VERSION,
            request_id: request_id.into(),
            ok: true,
            data: Some(data),
            error: None,
        }
    }

    pub fn error(request_id: impl Into<String>, error: AgentErrorV1) -> Self {
        Self {
            protocol_version: AGENT_PROTOCOL_VERSION,
            schema_version: AGENT_SCHEMA_VERSION,
            request_id: request_id.into(),
            ok: false,
            data: None,
            error: Some(error),
        }
    }
}

#[derive(Debug, Clone, Serialize, Deserialize, PartialEq, Eq)]
#[serde(
    tag = "type",
    content = "value",
    rename_all = "snake_case",
    deny_unknown_fields
)]
pub enum AgentResponseDataV1 {
    Hello(AgentHelloV1),
    ConnectionStatus(AgentConnectionStatusV1),
    EnvStatus(AgentEnvStatusV1),
    Secrets(Vec<AgentSecretMetadataV1>),
    Profiles(Vec<AgentProfileMetadataV1>),
    Profile(AgentProfileMetadataV1),
    Presets(Vec<AgentPresetMetadataV1>),
    Preset(AgentPresetMetadataV1),
    Proposal(AgentProposalMetadataV1),
    Runs(Vec<AgentRunMetadataV1>),
    Run(AgentRunMetadataV1),
    Acknowledged,
}

#[derive(Debug, Clone, Serialize, Deserialize, PartialEq, Eq)]
#[serde(deny_unknown_fields)]
pub struct AgentHelloV1 {
    pub desktop_version: String,
    pub capabilities: Vec<String>,
}

#[derive(Debug, Clone, Serialize, Deserialize, PartialEq, Eq)]
#[serde(deny_unknown_fields)]
pub struct AgentConnectionStatusV1 {
    pub paired: bool,
    pub actor_id: String,
    pub actor_label: Option<String>,
}

#[derive(Debug, Clone, Serialize, Deserialize, PartialEq, Eq)]
#[serde(deny_unknown_fields)]
pub struct AgentEnvStatusV1 {
    pub platform_supported: bool,
    pub vault_unlocked: bool,
    /// Env Runtime module access: `unsupported`, `disabled_by_rollout` or `enabled`.
    pub module_state: String,
    pub active_runs: u32,
    pub pending_approvals: u32,
    pub pending_proposals: u32,
}

#[derive(Debug, Clone, Serialize, Deserialize, PartialEq, Eq)]
#[serde(deny_unknown_fields)]
pub struct AgentSecretMetadataV1 {
    pub id: String,
    pub label: String,
    pub revision: u64,
    pub usage_count: u32,
}

#[derive(Debug, Clone, Serialize, Deserialize, PartialEq, Eq)]
#[serde(deny_unknown_fields)]
pub struct AgentProfileMetadataV1 {
    pub id: String,
    pub slug: String,
    pub label: String,
    pub description: Option<String>,
    pub revision: u64,
    pub variables: Vec<AgentVariableMappingV1>,
}

#[derive(Debug, Clone, Serialize, Deserialize, PartialEq, Eq)]
#[serde(deny_unknown_fields)]
pub struct AgentPresetMetadataV1 {
    pub id: String,
    pub profile_id: String,
    pub slug: String,
    pub label: String,
    pub revision: u64,
    pub workspace_root: String,
    pub cwd: String,
    pub executable: String,
    /// SHA-256 of the executable bytes captured when the preset was approved.
    /// The desktop computes this value; clients never provide it as authority.
    pub executable_sha256: String,
    pub args: Vec<String>,
    pub passthrough_env: Vec<String>,
}

#[derive(Debug, Clone, Serialize, Deserialize, PartialEq, Eq)]
#[serde(rename_all = "snake_case")]
pub enum AgentProposalStatusV1 {
    Pending,
    Approved,
    Rejected,
    Expired,
    Stale,
}

#[derive(Debug, Clone, Serialize, Deserialize, PartialEq, Eq)]
#[serde(deny_unknown_fields)]
pub struct AgentProposalMetadataV1 {
    pub id: String,
    pub actor_id: String,
    pub resource_kind: String,
    pub operation: MutationOperationV1,
    pub status: AgentProposalStatusV1,
    pub created_at_epoch_ms: u64,
    pub expires_at_epoch_ms: u64,
}

#[derive(Debug, Clone, Serialize, Deserialize, PartialEq, Eq)]
#[serde(rename_all = "snake_case")]
pub enum AgentRunStatusV1 {
    ApprovalPending,
    Starting,
    Running,
    Exited,
    Signaled,
    Cancelled,
    SpawnFailed,
}

#[derive(Debug, Clone, Serialize, Deserialize, PartialEq, Eq)]
#[serde(deny_unknown_fields)]
pub struct AgentRunMetadataV1 {
    pub id: String,
    pub actor_id: String,
    pub profile_id: String,
    pub preset_id: String,
    pub status: AgentRunStatusV1,
    pub process_id: Option<u32>,
    pub started_at_epoch_ms: Option<u64>,
    pub finished_at_epoch_ms: Option<u64>,
    pub exit_code: Option<i32>,
    pub signal: Option<i32>,
}

#[derive(Debug, Clone, Serialize, Deserialize, PartialEq, Eq)]
#[serde(deny_unknown_fields)]
pub struct AgentErrorV1 {
    pub code: String,
    pub message: String,
    pub retryable: bool,
    pub next_action: Option<String>,
}

#[derive(Debug, Clone, Serialize, Deserialize, PartialEq, Eq)]
#[serde(deny_unknown_fields)]
pub struct AgentEventV1 {
    pub schema_version: u16,
    pub request_id: String,
    pub sequence: u64,
    #[serde(flatten)]
    pub event: AgentEventDataV1,
}

#[derive(Debug, Clone, Serialize, Deserialize, PartialEq, Eq)]
#[serde(
    tag = "event",
    content = "data",
    rename_all = "snake_case",
    deny_unknown_fields
)]
pub enum AgentEventDataV1 {
    ApprovalPending {
        run_id: String,
        expires_at_epoch_ms: u64,
    },
    ProposalPending {
        proposal_id: String,
        expires_at_epoch_ms: u64,
    },
    RunStarted {
        run_id: String,
        process_id: u32,
    },
    Stdout {
        run_id: String,
        data_base64: String,
    },
    Stderr {
        run_id: String,
        data_base64: String,
    },
    SignalForwarded {
        run_id: String,
        signal: i32,
    },
    RunExited {
        run_id: String,
        exit_code: Option<i32>,
        signal: Option<i32>,
        duration_ms: u64,
    },
    Error(AgentErrorV1),
}

#[cfg(test)]
mod tests {
    use super::*;

    #[test]
    fn request_roundtrip_is_versioned_and_typed() {
        let request = AgentRequestV1 {
            protocol_version: AGENT_PROTOCOL_VERSION,
            schema_version: AGENT_SCHEMA_VERSION,
            request_id: "request-1".to_string(),
            timestamp_secs: 42,
            command: AgentCommandV1::Run {
                profile: "backend".to_string(),
                preset: "tests".to_string(),
                reason: Some("Run backend tests".to_string()),
            },
        };

        let json = serde_json::to_vec(&request).expect("serialize request");
        let decoded: AgentRequestV1 = serde_json::from_slice(&json).expect("decode request");
        assert_eq!(decoded, request);
        assert!(json
            .windows(b"command".len())
            .any(|value| value == b"command"));
    }

    #[test]
    fn success_and_error_are_mutually_exclusive() {
        let success = AgentResponseV1::success("request-1", AgentResponseDataV1::Acknowledged);
        assert!(success.ok);
        assert!(success.data.is_some());
        assert!(success.error.is_none());

        let error = AgentResponseV1::error(
            "request-2",
            AgentErrorV1 {
                code: "VAULT_REQUIRED".to_string(),
                message: "Vault must be unlocked".to_string(),
                retryable: true,
                next_action: Some("unlock_vault".to_string()),
            },
        );
        assert!(!error.ok);
        assert!(error.data.is_none());
        assert_eq!(error.error.expect("error").code, "VAULT_REQUIRED");
    }

    #[test]
    fn output_event_carries_only_base64_text() {
        let event = AgentEventV1 {
            schema_version: AGENT_SCHEMA_VERSION,
            request_id: "request-1".to_string(),
            sequence: 3,
            event: AgentEventDataV1::Stdout {
                run_id: "run-1".to_string(),
                data_base64: "AP8=".to_string(),
            },
        };

        let value = serde_json::to_value(event).expect("serialize event");
        assert_eq!(value["event"], "stdout");
        assert_eq!(value["data"]["data_base64"], "AP8=");
    }

    #[test]
    fn request_rejects_unknown_command_data_fields() {
        let json = serde_json::json!({
            "protocol_version": AGENT_PROTOCOL_VERSION,
            "schema_version": AGENT_SCHEMA_VERSION,
            "request_id": "request-1",
            "timestamp_secs": 42,
            "command": "run",
            "data": {
                "profile": "backend",
                "preset": "tests",
                "reason": null,
                "unexpected": "must fail closed"
            }
        });

        assert!(serde_json::from_value::<AgentRequestV1>(json).is_err());
    }

    #[test]
    fn response_rejects_unknown_envelope_and_variant_fields() {
        let unknown_envelope = serde_json::json!({
            "protocol_version": AGENT_PROTOCOL_VERSION,
            "schema_version": AGENT_SCHEMA_VERSION,
            "request_id": "request-1",
            "ok": true,
            "data": {"type": "acknowledged"},
            "unexpected": true,
        });
        let unknown_variant = serde_json::json!({
            "protocol_version": AGENT_PROTOCOL_VERSION,
            "schema_version": AGENT_SCHEMA_VERSION,
            "request_id": "request-1",
            "ok": true,
            "data": {"type": "acknowledged", "unexpected": true},
        });

        assert!(serde_json::from_value::<AgentResponseV1>(unknown_envelope).is_err());
        assert!(serde_json::from_value::<AgentResponseV1>(unknown_variant).is_err());
    }

    #[test]
    fn event_rejects_unknown_envelope_and_variant_fields() {
        let unknown_envelope = serde_json::json!({
            "schema_version": AGENT_SCHEMA_VERSION,
            "request_id": "request-1",
            "sequence": 1,
            "event": "stdout",
            "data": {"run_id": "run-1", "data_base64": "b2s="},
            "unexpected": true,
        });
        let unknown_variant = serde_json::json!({
            "schema_version": AGENT_SCHEMA_VERSION,
            "request_id": "request-1",
            "sequence": 1,
            "event": "stdout",
            "data": {
                "run_id": "run-1",
                "data_base64": "b2s=",
                "unexpected": true,
            },
        });

        assert!(serde_json::from_value::<AgentEventV1>(unknown_envelope).is_err());
        assert!(serde_json::from_value::<AgentEventV1>(unknown_variant).is_err());
    }
}
