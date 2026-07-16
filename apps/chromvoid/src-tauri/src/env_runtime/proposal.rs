use chromvoid_protocol::{AgentProfileDraftV1, AgentProposalMetadataV1};
use serde::{Deserialize, Serialize};
use tokio::sync::watch;

use super::types::{EnvRuntimeError, EnvRuntimeErrorCode, ProposalDraft};
use super::validation::validate_opaque_id;

#[derive(Debug, Clone, Serialize, Deserialize, PartialEq, Eq)]
#[serde(deny_unknown_fields)]
pub struct PreparedPresetFacts {
    pub profile_id: String,
    pub workspace_root: String,
    pub cwd: String,
    pub executable: String,
    pub executable_sha256: String,
    pub args: Vec<String>,
    pub passthrough_env: Vec<String>,
}

#[derive(Debug, Clone, Serialize, Deserialize, PartialEq, Eq)]
#[serde(deny_unknown_fields)]
pub struct ProposalReview {
    pub metadata: AgentProposalMetadataV1,
    pub target: Option<String>,
    pub base_revision: Option<u64>,
    pub draft: Option<ProposalDraft>,
    pub prepared_preset: Option<PreparedPresetFacts>,
}

#[derive(Debug, Clone, Serialize, Deserialize, PartialEq, Eq)]
#[serde(deny_unknown_fields)]
pub struct ProfileSecretBinding {
    pub name: String,
    pub secret_id: String,
}

#[derive(Debug, Clone, Copy, PartialEq, Eq)]
pub(crate) enum ProposalPhase {
    Pending,
    Applying,
}

#[derive(Debug, Clone)]
pub(crate) struct ProposalPayload {
    pub _session_id: String,
    pub target: Option<String>,
    pub base_revision: Option<u64>,
    pub draft: Option<ProposalDraft>,
    pub prepared_preset: Option<PreparedPresetFacts>,
}

#[derive(Debug)]
pub(crate) struct ProposalRecord {
    pub metadata: AgentProposalMetadataV1,
    pub phase: ProposalPhase,
    pub payload: ProposalPayload,
    pub outcome: watch::Sender<Option<AgentProposalMetadataV1>>,
}

impl ProposalRecord {
    pub fn review(&self) -> ProposalReview {
        ProposalReview {
            metadata: self.metadata.clone(),
            target: self.payload.target.clone(),
            base_revision: self.payload.base_revision,
            draft: self.payload.draft.clone(),
            prepared_preset: self.payload.prepared_preset.clone(),
        }
    }

    pub fn is_expired(&self, now_ms: u64) -> bool {
        self.metadata.expires_at_epoch_ms <= now_ms
    }
}

#[derive(Debug, Clone)]
pub struct ProposalCommit {
    pub metadata: AgentProposalMetadataV1,
    pub target: Option<String>,
    pub base_revision: Option<u64>,
    pub draft: Option<ProposalDraft>,
    pub prepared_preset: Option<PreparedPresetFacts>,
}

impl From<&ProposalRecord> for ProposalCommit {
    fn from(record: &ProposalRecord) -> Self {
        Self {
            metadata: record.metadata.clone(),
            target: record.payload.target.clone(),
            base_revision: record.payload.base_revision,
            draft: record.payload.draft.clone(),
            prepared_preset: record.payload.prepared_preset.clone(),
        }
    }
}

pub enum ProposalLookup {
    Pending {
        metadata: AgentProposalMetadataV1,
        outcome: watch::Receiver<Option<AgentProposalMetadataV1>>,
    },
    Terminal(AgentProposalMetadataV1),
}

pub(crate) fn apply_profile_bindings(
    draft: &AgentProfileDraftV1,
    bindings: &[ProfileSecretBinding],
) -> Result<AgentProfileDraftV1, EnvRuntimeError> {
    use std::collections::{HashMap, HashSet};

    fn binding_error(message: &'static str) -> EnvRuntimeError {
        EnvRuntimeError::new(EnvRuntimeErrorCode::SECRET_BINDING_REQUIRED, message)
    }

    let expected = draft
        .variables
        .iter()
        .filter(|variable| variable.secret_id.is_none())
        .map(|variable| variable.name.as_str())
        .collect::<HashSet<_>>();
    let mut provided = HashMap::with_capacity(bindings.len());
    for binding in bindings {
        validate_opaque_id(&binding.secret_id, "secret id").map_err(|_| {
            binding_error("Bindings must contain stable secret ids for each unbound variable")
        })?;
        if binding.name.is_empty()
            || provided
                .insert(binding.name.as_str(), binding.secret_id.as_str())
                .is_some()
        {
            return Err(binding_error(
                "Bindings must contain one stable secret id for each unbound variable",
            ));
        }
    }
    if expected.len() != provided.len() || expected.iter().any(|name| !provided.contains_key(name))
    {
        return Err(binding_error(
            "Bindings must exactly match the proposal's unbound variables",
        ));
    }

    let mut bound = draft.clone();
    for variable in &mut bound.variables {
        if variable.secret_id.is_none() {
            variable.secret_id = provided
                .get(variable.name.as_str())
                .map(|id| (*id).to_string());
        }
    }
    Ok(bound)
}

#[cfg(test)]
mod tests {
    use chromvoid_protocol::AgentVariableMappingV1;

    use super::*;

    fn draft() -> AgentProfileDraftV1 {
        AgentProfileDraftV1 {
            slug: "test".to_string(),
            label: "Test".to_string(),
            description: None,
            variables: vec![
                AgentVariableMappingV1 {
                    name: "FIXED".to_string(),
                    secret_id: Some("secret-fixed".to_string()),
                },
                AgentVariableMappingV1 {
                    name: "MISSING".to_string(),
                    secret_id: None,
                },
            ],
        }
    }

    #[test]
    fn bindings_only_fill_the_exact_null_variable_set() {
        let bound = apply_profile_bindings(
            &draft(),
            &[ProfileSecretBinding {
                name: "MISSING".to_string(),
                secret_id: "secret-new".to_string(),
            }],
        )
        .expect("bindings");

        assert_eq!(
            bound.variables[0].secret_id.as_deref(),
            Some("secret-fixed")
        );
        assert_eq!(bound.variables[1].secret_id.as_deref(), Some("secret-new"));
    }

    #[test]
    fn bindings_reject_extras_duplicates_and_unstable_secret_ids() {
        for bindings in [
            vec![ProfileSecretBinding {
                name: "EXTRA".to_string(),
                secret_id: "secret-new".to_string(),
            }],
            vec![
                ProfileSecretBinding {
                    name: "MISSING".to_string(),
                    secret_id: "secret-new".to_string(),
                },
                ProfileSecretBinding {
                    name: "MISSING".to_string(),
                    secret_id: "secret-other".to_string(),
                },
            ],
            vec![ProfileSecretBinding {
                name: "MISSING".to_string(),
                secret_id: "not/a/stable/id".to_string(),
            }],
        ] {
            let error = apply_profile_bindings(&draft(), &bindings).expect_err("invalid binding");
            assert_eq!(error.code, EnvRuntimeErrorCode::SECRET_BINDING_REQUIRED);
        }
    }
}
