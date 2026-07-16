use std::collections::{BTreeMap, HashMap, VecDeque};
#[cfg(unix)]
use std::ffi::CString;
use std::ffi::OsStr;
use std::fs::File;
use std::io::Read as _;
use std::path::{Path, PathBuf};
use std::process::Stdio;
use std::sync::atomic::{AtomicBool, Ordering};
use std::sync::{Arc, Mutex};
use std::time::Instant;

use base64::engine::general_purpose::STANDARD as BASE64_STANDARD;
use base64::Engine as _;
use chromvoid_protocol::{
    AgentErrorV1, AgentEventDataV1, AgentPresetDraftV1, AgentProfileDraftV1,
    AgentProfileMetadataV1, AgentProposalMetadataV1, AgentProposalStatusV1, AgentRunMetadataV1,
    AgentRunStatusV1, MutationOperationV1, AGENT_MAX_REASON_BYTES, AGENT_OUTPUT_CHUNK_BYTES,
};
use sha2::{Digest as _, Sha256};
use tokio::io::AsyncReadExt;
use tokio::process::Command;
use tokio::sync::{mpsc, oneshot, watch};
use tracing::Instrument as _;
use uuid::Uuid;
#[cfg(unix)]
use zeroize::Zeroizing;

use super::proposal::{
    PreparedPresetFacts, ProposalCommit, ProposalLookup, ProposalPayload, ProposalPhase,
    ProposalRecord, ProposalReview,
};
use super::store::DevicePresetStore;
use super::types::{
    pending_proposal_metadata, pending_run_metadata, DevicePreset, EnvRuntimeError,
    EnvRuntimeStatus, ProposalDraft, RunApprovalSnapshot, MAX_ACTIVE_RUNS, RECENT_RUN_LIMIT,
    RUN_APPROVAL_TTL_MS,
};
#[cfg(test)]
use super::validation::validate_env_name;
use super::validation::{
    validate_opaque_id, validate_preset_draft, validate_profile_draft, MAX_DEVICE_PRESETS,
};
use super::{ApprovalDecision, EnvRuntimeObservability};

const PROCESS_STOP_GRACE: std::time::Duration = std::time::Duration::from_secs(3);
const PIPE_DRAIN_TIMEOUT: std::time::Duration = std::time::Duration::from_secs(1);
const TERMINAL_EVENT_RESERVE: usize = 5;

#[derive(Debug, Clone, Copy, PartialEq, Eq)]
pub enum RunApprovalDecision {
    Approve,
    Reject,
    Expired,
    Cancelled,
}

pub struct AgentRunTicket {
    pub(crate) snapshot: RunApprovalSnapshot,
    pub(crate) profile: AgentProfileMetadataV1,
    pub(crate) preset: DevicePreset,
    pub(crate) session_id: String,
    pub(crate) decision: Option<oneshot::Receiver<RunApprovalDecision>>,
}

pub struct PreparedApprovedRun {
    ticket: AgentRunTicket,
    preset: DevicePreset,
    workspace_identity: DirectoryIdentity,
    cwd_identity: DirectoryIdentity,
    executable_identity: ExecutableIdentity,
}

#[derive(Debug, Clone, PartialEq, Eq)]
struct DirectoryIdentity {
    path: PathBuf,
    #[cfg(unix)]
    device: u64,
    #[cfg(unix)]
    inode: u64,
}

#[derive(Debug, Clone, PartialEq, Eq)]
struct ExecutableIdentity {
    path: PathBuf,
    #[cfg(unix)]
    device: u64,
    #[cfg(unix)]
    inode: u64,
    size: u64,
    modified_nanos: u128,
}

struct PendingRunApproval {
    snapshot: RunApprovalSnapshot,
    session_id: String,
    sender: Option<oneshot::Sender<RunApprovalDecision>>,
}

#[derive(Clone)]
struct StartingRun {
    snapshot: RunApprovalSnapshot,
    session_id: String,
}

#[derive(Clone)]
struct ActiveRunControl {
    metadata: AgentRunMetadataV1,
    session_id: String,
    stop: watch::Sender<bool>,
}

#[derive(Default)]
struct RuntimeInner {
    proposals: HashMap<String, ProposalRecord>,
    recent_proposals: VecDeque<AgentProposalMetadataV1>,
    approvals: HashMap<String, PendingRunApproval>,
    starting_runs: HashMap<String, StartingRun>,
    active_runs: HashMap<String, ActiveRunControl>,
    recent_runs: VecDeque<AgentRunMetadataV1>,
}

pub struct EnvRuntimeState {
    presets: DevicePresetStore,
    inner: Mutex<RuntimeInner>,
    commit_gate: Mutex<()>,
    observability: EnvRuntimeObservability,
    #[cfg(all(test, feature = "env-runtime-test-probe"))]
    before_spawn_hook: Mutex<Option<Arc<dyn Fn() + Send + Sync>>>,
}

impl EnvRuntimeState {
    pub fn new(device_store_path: PathBuf) -> Result<Self, EnvRuntimeError> {
        Ok(Self {
            presets: DevicePresetStore::load(device_store_path),
            inner: Mutex::new(RuntimeInner::default()),
            commit_gate: Mutex::new(()),
            observability: EnvRuntimeObservability::default(),
            #[cfg(all(test, feature = "env-runtime-test-probe"))]
            before_spawn_hook: Mutex::new(None),
        })
    }

    #[cfg(all(test, feature = "env-runtime-test-probe"))]
    pub(crate) fn set_before_spawn_hook(&self, hook: Option<Arc<dyn Fn() + Send + Sync>>) {
        *self
            .before_spawn_hook
            .lock()
            .unwrap_or_else(std::sync::PoisonError::into_inner) = hook;
    }

    #[cfg(all(test, feature = "env-runtime-test-probe"))]
    fn invoke_before_spawn_hook(&self) {
        let hook = self
            .before_spawn_hook
            .lock()
            .unwrap_or_else(std::sync::PoisonError::into_inner)
            .clone();
        if let Some(hook) = hook {
            hook();
        }
    }

    pub(crate) fn observability(&self) -> &EnvRuntimeObservability {
        &self.observability
    }

    /// Collect before entering Gateway/adapter commit guards because expiry
    /// emits lifecycle audit events synchronously.
    pub(crate) fn collect_expired(&self) -> Result<(), EnvRuntimeError> {
        let mut inner = self.lock_inner()?;
        gc_expired(&mut inner, &self.observability);
        Ok(())
    }

    pub fn commit_guard(&self) -> Result<std::sync::MutexGuard<'_, ()>, EnvRuntimeError> {
        self.commit_gate.lock().map_err(|_| {
            EnvRuntimeError::new(
                crate::env_runtime::EnvRuntimeErrorCode::INTERNAL,
                "Env Runtime commit gate poisoned",
            )
        })
    }

    pub fn status(&self, vault_unlocked: bool) -> Result<EnvRuntimeStatus, EnvRuntimeError> {
        let mut inner = self.lock_inner()?;
        gc_expired(&mut inner, &self.observability);
        let store_error = self.presets.health_error();
        let active_runs = active_run_count(&inner);
        self.observability.set_active_runs(active_runs);
        let status = EnvRuntimeStatus {
            platform_supported: cfg!(target_os = "macos"),
            vault_unlocked,
            device_store_available: store_error.is_none(),
            device_store_error_code: store_error.map(|error| error.code.to_string()),
            active_runs: active_runs.try_into().unwrap_or(u32::MAX),
            pending_approvals: inner.approvals.len() as u32,
            pending_proposals: inner
                .proposals
                .values()
                .filter(|proposal| proposal.phase == ProposalPhase::Pending)
                .count() as u32,
        };
        drop(inner);
        self.observability.emit_metrics_snapshot();
        Ok(status)
    }

    pub fn list_presets(&self) -> Result<Vec<DevicePreset>, EnvRuntimeError> {
        self.presets.list()
    }

    pub fn get_preset(&self, id_or_slug: &str) -> Result<DevicePreset, EnvRuntimeError> {
        self.presets.get(id_or_slug)?.ok_or_else(|| {
            EnvRuntimeError::new(
                crate::env_runtime::EnvRuntimeErrorCode::NOT_FOUND,
                "Preset not found",
            )
        })
    }

    pub fn save_preset(
        &self,
        target: Option<&str>,
        base_revision: Option<u64>,
        draft: AgentPresetDraftV1,
    ) -> Result<DevicePreset, EnvRuntimeError> {
        let existing = match target {
            Some(target) => {
                let existing = self.get_preset(target)?;
                if base_revision != Some(existing.revision) {
                    return Err(EnvRuntimeError::new(
                        crate::env_runtime::EnvRuntimeErrorCode::REVISION_CONFLICT,
                        "Preset changed since it was opened",
                    ));
                }
                Some(existing)
            }
            None => {
                if base_revision.is_some() {
                    return Err(EnvRuntimeError::new(
                        crate::env_runtime::EnvRuntimeErrorCode::INVALID_PRESET,
                        "A new preset cannot have a base revision",
                    ));
                }
                if self.presets.list()?.len() >= MAX_DEVICE_PRESETS {
                    return Err(EnvRuntimeError::new(
                        crate::env_runtime::EnvRuntimeErrorCode::PRESET_LIMIT_REACHED,
                        format!("At most {MAX_DEVICE_PRESETS} device presets are allowed"),
                    ));
                }
                None
            }
        };
        let prepared = prepare_preset_facts(&draft)?;
        let preset = build_device_preset(existing, draft, prepared)?;
        self.presets.insert(preset.clone())?;
        Ok(preset)
    }

    pub fn delete_preset(
        &self,
        target: &str,
        base_revision: u64,
    ) -> Result<DevicePreset, EnvRuntimeError> {
        self.presets.remove(target, Some(base_revision))
    }

    pub fn propose_profile(
        &self,
        actor_id: String,
        session_id: String,
        operation: MutationOperationV1,
        target: Option<String>,
        base_revision: Option<u64>,
        draft: Option<AgentProfileDraftV1>,
    ) -> Result<AgentProposalMetadataV1, EnvRuntimeError> {
        validate_mutation_shape(operation, target.as_deref(), base_revision, draft.is_some())?;
        if let Some(draft) = draft.as_ref() {
            validate_profile_draft(draft)?;
        }
        if let Some(target) = target.as_deref() {
            validate_opaque_id(target, "profile target")?;
        }
        self.insert_proposal(
            actor_id,
            session_id,
            "profile",
            operation,
            target,
            base_revision,
            draft.map(ProposalDraft::Profile),
            None,
        )
    }

    pub fn propose_preset(
        &self,
        actor_id: String,
        session_id: String,
        operation: MutationOperationV1,
        target: Option<String>,
        base_revision: Option<u64>,
        draft: Option<AgentPresetDraftV1>,
    ) -> Result<AgentProposalMetadataV1, EnvRuntimeError> {
        validate_mutation_shape(operation, target.as_deref(), base_revision, draft.is_some())?;
        let prepared_preset = draft.as_ref().map(prepare_preset_facts).transpose()?;
        let target = match (operation, target) {
            (MutationOperationV1::Create, None) => None,
            (_, Some(target)) => {
                validate_opaque_id(&target, "preset target")?;
                let existing = self.get_preset(&target).map_err(|mut error| {
                    if error.code == crate::env_runtime::EnvRuntimeErrorCode::NOT_FOUND {
                        error.code = crate::env_runtime::EnvRuntimeErrorCode::PRESET_NOT_FOUND;
                    }
                    error
                })?;
                if base_revision != Some(existing.revision) {
                    return Err(EnvRuntimeError::new(
                        crate::env_runtime::EnvRuntimeErrorCode::REVISION_CONFLICT,
                        "Preset changed before the proposal was submitted",
                    ));
                }
                Some(existing.id)
            }
            _ => {
                return Err(EnvRuntimeError::new(
                    crate::env_runtime::EnvRuntimeErrorCode::INVALID_PROPOSAL,
                    "Missing preset target",
                ))
            }
        };
        self.insert_proposal(
            actor_id,
            session_id,
            "preset",
            operation,
            target,
            base_revision,
            draft.map(ProposalDraft::Preset),
            prepared_preset,
        )
    }

    fn insert_proposal(
        &self,
        actor_id: String,
        session_id: String,
        resource_kind: &str,
        operation: MutationOperationV1,
        target: Option<String>,
        base_revision: Option<u64>,
        draft: Option<ProposalDraft>,
        prepared_preset: Option<PreparedPresetFacts>,
    ) -> Result<AgentProposalMetadataV1, EnvRuntimeError> {
        let now = crate::gateway::state::now_ms();
        let metadata = pending_proposal_metadata(
            Uuid::new_v4().to_string(),
            actor_id,
            resource_kind,
            operation,
            now,
        );
        let (outcome, _receiver) = watch::channel(None);
        let proposal = ProposalRecord {
            metadata: metadata.clone(),
            phase: ProposalPhase::Pending,
            payload: ProposalPayload {
                _session_id: session_id,
                target,
                base_revision,
                draft,
                prepared_preset,
            },
            outcome,
        };
        let mut inner = self.lock_inner()?;
        gc_expired(&mut inner, &self.observability);
        inner.proposals.insert(metadata.id.clone(), proposal);
        Ok(metadata)
    }

    pub fn list_proposal_reviews(&self) -> Result<Vec<ProposalReview>, EnvRuntimeError> {
        let mut inner = self.lock_inner()?;
        gc_expired(&mut inner, &self.observability);
        let mut proposals = inner
            .proposals
            .values()
            .filter(|proposal| proposal.phase == ProposalPhase::Pending)
            .map(ProposalRecord::review)
            .collect::<Vec<_>>();
        proposals.sort_by_key(|proposal| proposal.metadata.created_at_epoch_ms);
        Ok(proposals)
    }

    pub fn get_proposal_review(
        &self,
        proposal_id: &str,
    ) -> Result<ProposalReview, EnvRuntimeError> {
        let mut inner = self.lock_inner()?;
        gc_expired(&mut inner, &self.observability);
        inner
            .proposals
            .get(proposal_id)
            .filter(|proposal| proposal.phase == ProposalPhase::Pending)
            .map(ProposalRecord::review)
            .ok_or_else(|| {
                EnvRuntimeError::new(
                    crate::env_runtime::EnvRuntimeErrorCode::NOT_FOUND,
                    "Proposal not found",
                )
            })
    }

    pub fn proposal_metadata_for_actor(
        &self,
        proposal_id: &str,
        actor_id: &str,
    ) -> Result<AgentProposalMetadataV1, EnvRuntimeError> {
        let mut inner = self.lock_inner()?;
        gc_expired(&mut inner, &self.observability);
        if let Some(proposal) = inner
            .proposals
            .get(proposal_id)
            .filter(|proposal| proposal.metadata.actor_id == actor_id)
        {
            return Ok(proposal.metadata.clone());
        }
        inner
            .recent_proposals
            .iter()
            .find(|proposal| proposal.id == proposal_id && proposal.actor_id == actor_id)
            .cloned()
            .ok_or_else(|| {
                EnvRuntimeError::new(
                    crate::env_runtime::EnvRuntimeErrorCode::NOT_FOUND,
                    "Proposal not found",
                )
            })
    }

    pub fn lookup_or_subscribe_proposal(
        &self,
        proposal_id: &str,
        actor_id: &str,
    ) -> Result<ProposalLookup, EnvRuntimeError> {
        let mut inner = self.lock_inner()?;
        gc_expired(&mut inner, &self.observability);
        if let Some(proposal) = inner
            .proposals
            .get(proposal_id)
            .filter(|proposal| proposal.metadata.actor_id == actor_id)
        {
            return Ok(ProposalLookup::Pending {
                metadata: proposal.metadata.clone(),
                outcome: proposal.outcome.subscribe(),
            });
        }
        if let Some(metadata) = inner
            .recent_proposals
            .iter()
            .find(|proposal| proposal.id == proposal_id && proposal.actor_id == actor_id)
            .cloned()
        {
            return Ok(ProposalLookup::Terminal(metadata));
        }
        Err(EnvRuntimeError::new(
            crate::env_runtime::EnvRuntimeErrorCode::NOT_FOUND,
            "Proposal not found",
        ))
    }

    pub fn reserve_proposal(&self, proposal_id: &str) -> Result<ProposalCommit, EnvRuntimeError> {
        let mut inner = self.lock_inner()?;
        gc_expired(&mut inner, &self.observability);
        let proposal = inner.proposals.get_mut(proposal_id).ok_or_else(|| {
            EnvRuntimeError::new(
                crate::env_runtime::EnvRuntimeErrorCode::PROPOSAL_CLOSED,
                "Proposal is no longer pending",
            )
        })?;
        if proposal.phase != ProposalPhase::Pending {
            return Err(EnvRuntimeError::new(
                crate::env_runtime::EnvRuntimeErrorCode::PROPOSAL_CLOSED,
                "Proposal is already being applied",
            ));
        }
        if proposal.is_expired(crate::gateway::state::now_ms()) {
            let metadata = terminalize_proposal_locked(
                &mut inner,
                proposal_id,
                AgentProposalStatusV1::Expired,
            )
            .expect("proposal exists");
            drop(inner);
            self.observability.record_proposal(&metadata);
            return Err(EnvRuntimeError::new(
                crate::env_runtime::EnvRuntimeErrorCode::PROPOSAL_CLOSED,
                "Proposal approval expired",
            ));
        }
        proposal.phase = ProposalPhase::Applying;
        Ok(ProposalCommit::from(&*proposal))
    }

    pub fn begin_proposal_commit(&self, proposal_id: &str) -> Result<(), EnvRuntimeError> {
        let mut inner = self.lock_inner()?;
        let proposal = inner.proposals.get(proposal_id).ok_or_else(|| {
            EnvRuntimeError::new(
                crate::env_runtime::EnvRuntimeErrorCode::PROPOSAL_CLOSED,
                "Proposal is no longer reserved for approval",
            )
        })?;
        if proposal.phase != ProposalPhase::Applying {
            return Err(EnvRuntimeError::new(
                crate::env_runtime::EnvRuntimeErrorCode::PROPOSAL_CLOSED,
                "Proposal is not reserved for approval",
            ));
        }
        if proposal.is_expired(crate::gateway::state::now_ms()) {
            let metadata = terminalize_proposal_locked(
                &mut inner,
                proposal_id,
                AgentProposalStatusV1::Expired,
            )
            .expect("reserved proposal exists");
            drop(inner);
            self.observability.record_proposal(&metadata);
            return Err(EnvRuntimeError::new(
                crate::env_runtime::EnvRuntimeErrorCode::PROPOSAL_CLOSED,
                "Proposal approval expired before mutation",
            ));
        }
        Ok(())
    }

    pub fn release_or_expire_proposal(&self, proposal_id: &str) {
        let now = crate::gateway::state::now_ms();
        let mut inner = self
            .inner
            .lock()
            .unwrap_or_else(std::sync::PoisonError::into_inner);
        let expired = inner
            .proposals
            .get(proposal_id)
            .is_some_and(|proposal| proposal.is_expired(now));
        if expired {
            if let Some(metadata) =
                terminalize_proposal_locked(&mut inner, proposal_id, AgentProposalStatusV1::Expired)
            {
                drop(inner);
                self.observability.record_proposal(&metadata);
            }
        } else if let Some(proposal) = inner.proposals.get_mut(proposal_id) {
            proposal.phase = ProposalPhase::Pending;
        }
    }

    pub fn finish_proposal_terminal(
        &self,
        proposal_id: &str,
        status: AgentProposalStatusV1,
    ) -> AgentProposalMetadataV1 {
        debug_assert!(status != AgentProposalStatusV1::Pending);
        let mut inner = self
            .inner
            .lock()
            .unwrap_or_else(std::sync::PoisonError::into_inner);
        let metadata = terminalize_proposal_locked(&mut inner, proposal_id, status)
            .expect("applying proposal must remain reserved until terminal transition");
        drop(inner);
        self.observability.record_proposal(&metadata);
        metadata
    }

    pub fn reject_proposal(
        &self,
        proposal_id: &str,
    ) -> Result<AgentProposalMetadataV1, EnvRuntimeError> {
        let mut inner = self.lock_inner()?;
        gc_expired(&mut inner, &self.observability);
        let phase = inner
            .proposals
            .get(proposal_id)
            .map(|proposal| proposal.phase)
            .ok_or_else(|| {
                EnvRuntimeError::new(
                    crate::env_runtime::EnvRuntimeErrorCode::PROPOSAL_CLOSED,
                    "Proposal is no longer pending",
                )
            })?;
        if phase != ProposalPhase::Pending {
            return Err(EnvRuntimeError::new(
                crate::env_runtime::EnvRuntimeErrorCode::PROPOSAL_CLOSED,
                "Proposal is already being applied",
            ));
        }
        let metadata =
            terminalize_proposal_locked(&mut inner, proposal_id, AgentProposalStatusV1::Rejected)
                .expect("proposal exists");
        drop(inner);
        self.observability.record_proposal(&metadata);
        Ok(metadata)
    }

    pub fn apply_preset_proposal(
        &self,
        proposal: &ProposalCommit,
    ) -> Result<Option<DevicePreset>, EnvRuntimeError> {
        if proposal.metadata.resource_kind != "preset" {
            return Err(EnvRuntimeError::new(
                crate::env_runtime::EnvRuntimeErrorCode::INVALID_PROPOSAL,
                "Proposal does not target a preset",
            ));
        }

        let result = match proposal.metadata.operation {
            MutationOperationV1::Create => {
                let ProposalDraft::Preset(draft) = proposal.draft.clone().ok_or_else(|| {
                    EnvRuntimeError::new(
                        crate::env_runtime::EnvRuntimeErrorCode::INVALID_PROPOSAL,
                        "Missing preset draft",
                    )
                })?
                else {
                    return Err(EnvRuntimeError::new(
                        crate::env_runtime::EnvRuntimeErrorCode::INVALID_PROPOSAL,
                        "Invalid preset draft",
                    ));
                };
                verify_prepared_preset_facts(&draft, proposal.prepared_preset.as_ref())?;
                let preset = build_device_preset(
                    None,
                    draft,
                    proposal.prepared_preset.clone().expect("verified above"),
                )?;
                self.begin_proposal_commit(&proposal.metadata.id)?;
                self.presets.insert(preset.clone())?;
                Some(preset)
            }
            MutationOperationV1::Update => {
                let target = proposal.target.as_deref().ok_or_else(|| {
                    EnvRuntimeError::new(
                        crate::env_runtime::EnvRuntimeErrorCode::INVALID_PROPOSAL,
                        "Missing preset target",
                    )
                })?;
                let ProposalDraft::Preset(draft) = proposal.draft.clone().ok_or_else(|| {
                    EnvRuntimeError::new(
                        crate::env_runtime::EnvRuntimeErrorCode::INVALID_PROPOSAL,
                        "Missing preset draft",
                    )
                })?
                else {
                    return Err(EnvRuntimeError::new(
                        crate::env_runtime::EnvRuntimeErrorCode::INVALID_PROPOSAL,
                        "Invalid preset draft",
                    ));
                };
                let existing = self.get_preset(target)?;
                if proposal.base_revision != Some(existing.revision) {
                    return Err(EnvRuntimeError::new(
                        crate::env_runtime::EnvRuntimeErrorCode::REVISION_CONFLICT,
                        "Preset changed since the proposal was created",
                    ));
                }
                verify_prepared_preset_facts(&draft, proposal.prepared_preset.as_ref())?;
                let preset = build_device_preset(
                    Some(existing),
                    draft,
                    proposal.prepared_preset.clone().expect("verified above"),
                )?;
                self.begin_proposal_commit(&proposal.metadata.id)?;
                self.presets.insert(preset.clone())?;
                Some(preset)
            }
            MutationOperationV1::Delete => {
                let target = proposal.target.as_deref().ok_or_else(|| {
                    EnvRuntimeError::new(
                        crate::env_runtime::EnvRuntimeErrorCode::INVALID_PROPOSAL,
                        "Missing preset target",
                    )
                })?;
                let base_revision = proposal.base_revision.ok_or_else(|| {
                    EnvRuntimeError::new(
                        crate::env_runtime::EnvRuntimeErrorCode::INVALID_PROPOSAL,
                        "Missing preset base revision",
                    )
                })?;
                let existing = self.get_preset(target)?;
                if existing.revision != base_revision {
                    return Err(EnvRuntimeError::new(
                        crate::env_runtime::EnvRuntimeErrorCode::REVISION_CONFLICT,
                        "Preset changed since the proposal was created",
                    ));
                }
                self.begin_proposal_commit(&proposal.metadata.id)?;
                self.presets.remove(target, Some(base_revision))?;
                None
            }
        };
        Ok(result)
    }

    pub fn request_run(
        &self,
        actor_id: String,
        actor_label: Option<String>,
        session_id: String,
        profile: AgentProfileMetadataV1,
        preset: DevicePreset,
        secret_labels: &HashMap<String, String>,
        reason: Option<String>,
    ) -> Result<AgentRunTicket, EnvRuntimeError> {
        if reason
            .as_ref()
            .is_some_and(|reason| reason.as_bytes().len() > AGENT_MAX_REASON_BYTES)
        {
            return Err(EnvRuntimeError::new(
                crate::env_runtime::EnvRuntimeErrorCode::INVALID_REASON,
                format!("Run reason is limited to {AGENT_MAX_REASON_BYTES} bytes"),
            ));
        }
        if preset.profile_id != profile.id {
            return Err(EnvRuntimeError::new(
                crate::env_runtime::EnvRuntimeErrorCode::PROFILE_PRESET_MISMATCH,
                "Preset is bound to a different profile",
            ));
        }
        self.preflight_saved_preset(&preset)?;
        let now = crate::gateway::state::now_ms();
        let run = pending_run_metadata(
            Uuid::new_v4().to_string(),
            actor_id,
            profile.id.clone(),
            preset.id.clone(),
        );
        let mut env_sources = profile
            .variables
            .iter()
            .map(|variable| super::types::RunEnvSourceSnapshot {
                name: variable.name.clone(),
                secret_id: variable.secret_id.clone(),
                secret_label: variable
                    .secret_id
                    .as_ref()
                    .and_then(|secret_id| secret_labels.get(secret_id))
                    .cloned(),
            })
            .collect::<Vec<_>>();
        env_sources.sort_by(|left, right| left.name.cmp(&right.name));
        let snapshot = RunApprovalSnapshot {
            run: run.clone(),
            actor_label,
            profile_label: profile.label.clone(),
            profile_revision: profile.revision,
            preset_label: preset.label.clone(),
            preset_revision: preset.revision,
            workspace_root: preset.workspace_root.clone(),
            executable: preset.executable.clone(),
            executable_sha256: preset.executable_sha256.clone(),
            args: preset.args.clone(),
            cwd: preset.cwd.clone(),
            passthrough_env: preset.passthrough_env.clone(),
            env_sources,
            reason,
            created_at_epoch_ms: now,
            expires_at_epoch_ms: now.saturating_add(RUN_APPROVAL_TTL_MS),
        };
        let (sender, decision) = oneshot::channel();
        let mut inner = self.lock_inner()?;
        if inner
            .active_runs
            .len()
            .saturating_add(inner.approvals.len())
            .saturating_add(inner.starting_runs.len())
            >= MAX_ACTIVE_RUNS
        {
            return Err(EnvRuntimeError::new(
                crate::env_runtime::EnvRuntimeErrorCode::RUN_LIMIT_REACHED,
                format!("At most {MAX_ACTIVE_RUNS} runs may be active or awaiting approval"),
            ));
        }
        inner.approvals.insert(
            run.id.clone(),
            PendingRunApproval {
                snapshot: snapshot.clone(),
                session_id: session_id.clone(),
                sender: Some(sender),
            },
        );
        Ok(AgentRunTicket {
            snapshot,
            profile,
            preset,
            session_id,
            decision: Some(decision),
        })
    }

    pub fn list_pending_approvals(&self) -> Result<Vec<RunApprovalSnapshot>, EnvRuntimeError> {
        let mut inner = self.lock_inner()?;
        gc_expired(&mut inner, &self.observability);
        let mut approvals = inner
            .approvals
            .values()
            .map(|approval| approval.snapshot.clone())
            .collect::<Vec<_>>();
        approvals.sort_by_key(|approval| approval.created_at_epoch_ms);
        Ok(approvals)
    }

    pub fn resolve_run_approval(
        &self,
        run_id: &str,
        decision: RunApprovalDecision,
    ) -> Result<(), EnvRuntimeError> {
        let mut inner = self.lock_inner()?;
        gc_expired(&mut inner, &self.observability);
        let mut approval = inner.approvals.remove(run_id).ok_or_else(|| {
            EnvRuntimeError::new(
                crate::env_runtime::EnvRuntimeErrorCode::APPROVAL_CLOSED,
                "Run approval is no longer pending",
            )
        })?;
        let sender = approval.sender.take().ok_or_else(|| {
            EnvRuntimeError::new(
                crate::env_runtime::EnvRuntimeErrorCode::APPROVAL_CLOSED,
                "Run approval is no longer pending",
            )
        })?;
        let run = approval.snapshot.run.clone();
        let mut terminal = None;
        if decision == RunApprovalDecision::Approve {
            inner.starting_runs.insert(
                run_id.to_string(),
                StartingRun {
                    snapshot: approval.snapshot.clone(),
                    session_id: approval.session_id,
                },
            );
        } else {
            let metadata = terminal_run(approval.snapshot.run.clone(), AgentRunStatusV1::Cancelled);
            push_recent_run(&mut inner, metadata.clone());
            terminal = Some((
                metadata,
                match decision {
                    RunApprovalDecision::Expired => "APPROVAL_EXPIRED",
                    RunApprovalDecision::Cancelled => "CANCELLED",
                    RunApprovalDecision::Reject => "APPROVAL_REJECTED",
                    RunApprovalDecision::Approve => unreachable!("handled above"),
                },
            ));
        }
        let send_failed = sender.send(decision).is_err();
        if send_failed && decision == RunApprovalDecision::Approve {
            if let Some(run) = inner.starting_runs.remove(run_id) {
                let metadata = terminal_run(run.snapshot.run, AgentRunStatusV1::Cancelled);
                push_recent_run(&mut inner, metadata.clone());
                terminal = Some((metadata, "SESSION_DISCONNECTED"));
            }
            let active_runs = active_run_count(&inner);
            drop(inner);
            self.observability.set_active_runs(active_runs);
            self.observability
                .record_approval(&run, ApprovalDecision::Cancelled);
            if let Some((terminal, error_code)) = terminal {
                self.observability
                    .record_run_terminal(&terminal, Some(error_code), 0);
            }
            return Err(EnvRuntimeError::new(
                crate::env_runtime::EnvRuntimeErrorCode::SESSION_DISCONNECTED,
                "Requesting CLI disconnected",
            ));
        }
        let active_runs = active_run_count(&inner);
        drop(inner);
        self.observability.set_active_runs(active_runs);
        let approval_decision = match decision {
            RunApprovalDecision::Approve => ApprovalDecision::Approved,
            RunApprovalDecision::Reject => ApprovalDecision::Rejected,
            RunApprovalDecision::Expired => ApprovalDecision::Expired,
            RunApprovalDecision::Cancelled => ApprovalDecision::Cancelled,
        };
        self.observability.record_approval(&run, approval_decision);
        if let Some((terminal, error_code)) = terminal {
            self.observability
                .record_run_terminal(&terminal, Some(error_code), 0);
        }
        Ok(())
    }

    pub fn cancel_pending_for_lock(&self) {
        let Ok(mut inner) = self.inner.lock() else {
            return;
        };
        cancel_run_approvals(
            &mut inner,
            &self.observability,
            crate::env_runtime::EnvRuntimeErrorCode::VAULT_REQUIRED,
            |_| true,
        );
        cancel_starting_runs(
            &mut inner,
            &self.observability,
            crate::env_runtime::EnvRuntimeErrorCode::VAULT_REQUIRED,
            |_| true,
        );
        let ids = inner
            .proposals
            .iter()
            .filter_map(|(id, proposal)| {
                (proposal.phase == ProposalPhase::Pending).then(|| id.clone())
            })
            .collect::<Vec<_>>();
        for id in ids {
            if let Some(metadata) =
                terminalize_proposal_locked(&mut inner, &id, AgentProposalStatusV1::Rejected)
            {
                self.observability.record_proposal(&metadata);
            }
        }
    }

    pub fn cancel_pending_for_actor(&self, actor_id: &str) {
        let Ok(mut inner) = self.inner.lock() else {
            return;
        };
        cancel_run_approvals(
            &mut inner,
            &self.observability,
            crate::env_runtime::EnvRuntimeErrorCode::AGENT_REVOKED,
            |approval| approval.snapshot.run.actor_id == actor_id,
        );
        cancel_starting_runs(
            &mut inner,
            &self.observability,
            crate::env_runtime::EnvRuntimeErrorCode::AGENT_REVOKED,
            |run| run.snapshot.run.actor_id == actor_id,
        );
        let ids = inner
            .proposals
            .iter()
            .filter_map(|(id, proposal)| {
                (proposal.metadata.actor_id == actor_id && proposal.phase == ProposalPhase::Pending)
                    .then(|| id.clone())
            })
            .collect::<Vec<_>>();
        for id in ids {
            if let Some(metadata) =
                terminalize_proposal_locked(&mut inner, &id, AgentProposalStatusV1::Rejected)
            {
                self.observability.record_proposal(&metadata);
            }
        }
    }

    pub fn start_approved_run(
        self: &Arc<Self>,
        prepared: PreparedApprovedRun,
        resolved: chromvoid_core::env_runtime::ResolvedEnvLeaseV1,
    ) -> Result<mpsc::Receiver<AgentEventDataV1>, EnvRuntimeError> {
        let run = prepared.ticket.snapshot.run.clone();
        let started = Instant::now();
        let result = self.start_approved_run_inner(prepared, resolved);
        let status = if result.is_ok() {
            AgentRunStatusV1::Running
        } else {
            AgentRunStatusV1::SpawnFailed
        };
        self.observability.record_spawn(
            &run,
            &status,
            result.as_ref().err().map(|error| error.code.as_str()),
            started.elapsed().as_millis() as u64,
        );
        result
    }

    fn start_approved_run_inner(
        self: &Arc<Self>,
        prepared: PreparedApprovedRun,
        resolved: chromvoid_core::env_runtime::ResolvedEnvLeaseV1,
    ) -> Result<mpsc::Receiver<AgentEventDataV1>, EnvRuntimeError> {
        let ticket = prepared.ticket;
        let preset = prepared.preset;
        if let Err(error) = self.verify_prepared_run_reservation_and_filesystem(
            &ticket,
            &prepared.workspace_identity,
            &prepared.cwd_identity,
            &prepared.executable_identity,
        ) {
            drop(resolved);
            self.record_failed_run(
                &ticket.snapshot.run,
                AgentRunStatusV1::SpawnFailed,
                error.code.as_str(),
            );
            return Err(error);
        }

        let mut metadata = ticket.snapshot.run.clone();
        metadata.status = AgentRunStatusV1::Starting;
        let (stop, stop_rx) = watch::channel(false);

        let mut command = Command::new(&preset.executable);
        command
            .args(&preset.args)
            .current_dir(&preset.cwd)
            .env_clear()
            .stdin(Stdio::null())
            .stdout(Stdio::piped())
            .stderr(Stdio::piped())
            .kill_on_drop(false);
        #[cfg(unix)]
        {
            use std::os::unix::process::CommandExt as _;
            command.as_std_mut().process_group(0);
            let payload = ExecvePayload::new(&preset, &resolved)?;
            // SAFETY: the closure invokes only `execve`, which is async-signal-safe.
            // It owns stable argv/envp buffers until the parent drops `command`;
            // secret-bearing env buffers are zeroized on that drop.
            unsafe {
                command.as_std_mut().pre_exec(move || payload.exec());
            }
        }
        #[cfg(not(unix))]
        {
            for name in ["HOME", "USER", "LOGNAME", "TMPDIR"] {
                if let Some(value) = std::env::var_os(name) {
                    command.env(name, value);
                }
            }
            for name in &preset.passthrough_env {
                if let Some(value) = std::env::var_os(name) {
                    command.env(name, value);
                }
            }
            for (name, value) in resolved.iter() {
                command.env(name, value);
            }
        }

        if let Err(error) = self.verify_prepared_run_reservation_and_filesystem(
            &ticket,
            &prepared.workspace_identity,
            &prepared.cwd_identity,
            &prepared.executable_identity,
        ) {
            drop(command);
            drop(resolved);
            self.record_failed_run(
                &ticket.snapshot.run,
                AgentRunStatusV1::SpawnFailed,
                error.code.as_str(),
            );
            return Err(error);
        }
        #[cfg(all(test, feature = "env-runtime-test-probe"))]
        self.invoke_before_spawn_hook();

        let spawn_result = {
            let mut inner = self.lock_inner()?;
            let reservation = inner.starting_runs.get(&metadata.id).ok_or_else(|| {
                EnvRuntimeError::new(
                    crate::env_runtime::EnvRuntimeErrorCode::CANCELLED,
                    "Run approval was cancelled before spawn",
                )
            })?;
            if reservation.snapshot.run != ticket.snapshot.run
                || reservation.session_id != ticket.session_id
            {
                return Err(EnvRuntimeError::new(
                    crate::env_runtime::EnvRuntimeErrorCode::APPROVAL_CLOSED,
                    "Run approval no longer matches the requesting session",
                ));
            }
            match command.spawn() {
                Ok(child) => {
                    inner.starting_runs.remove(&metadata.id);
                    inner.active_runs.insert(
                        metadata.id.clone(),
                        ActiveRunControl {
                            metadata: metadata.clone(),
                            session_id: ticket.session_id.clone(),
                            stop: stop.clone(),
                        },
                    );
                    Ok((child, active_run_count(&inner)))
                }
                Err(error) => Err(error),
            }
        };
        let (mut child, active_runs) = match spawn_result {
            Ok(spawned) => spawned,
            Err(error) => {
                drop(command);
                drop(resolved);
                self.record_failed_run(
                    &ticket.snapshot.run,
                    AgentRunStatusV1::SpawnFailed,
                    "SPAWN_FAILED",
                );
                return Err(EnvRuntimeError::new(
                    crate::env_runtime::EnvRuntimeErrorCode::SPAWN_FAILED,
                    format!("Failed to start approved executable: {error}"),
                ));
            }
        };
        self.observability.set_active_runs(active_runs);
        // On Unix, dropping the command zeroizes the execve envp captured by
        // the pre-exec closure. The child has already replaced its address
        // space, so no parent-side ordinary OsString retains secret values.
        drop(command);
        // Drop the zeroizing lease immediately after the child inherited its
        // environment; values are never retained in run metadata.
        drop(resolved);

        let Some(process_id) = child.id() else {
            let _ = child.start_kill();
            self.record_failed_run(
                &ticket.snapshot.run,
                AgentRunStatusV1::SpawnFailed,
                "SPAWN_FAILED",
            );
            return Err(EnvRuntimeError::new(
                crate::env_runtime::EnvRuntimeErrorCode::SPAWN_FAILED,
                "Spawned process has no process id",
            ));
        };
        metadata.status = AgentRunStatusV1::Running;
        metadata.process_id = Some(process_id);
        metadata.started_at_epoch_ms = Some(crate::gateway::state::now_ms());
        let metadata_update = self.lock_inner().and_then(|mut inner| {
            let control = inner.active_runs.get_mut(&metadata.id).ok_or_else(|| {
                EnvRuntimeError::new(
                    crate::env_runtime::EnvRuntimeErrorCode::INTERNAL,
                    "Starting run reservation was lost",
                )
            })?;
            control.metadata = metadata.clone();
            Ok(())
        });
        if let Err(error) = metadata_update {
            signal_process_group(process_id, libc::SIGKILL);
            let _ = child.start_kill();
            self.record_failed_run(
                &ticket.snapshot.run,
                AgentRunStatusV1::SpawnFailed,
                error.code.as_str(),
            );
            return Err(error);
        }

        let (events, receiver) = mpsc::channel(64);
        if events
            .try_send(AgentEventDataV1::RunStarted {
                run_id: metadata.id.clone(),
                process_id,
            })
            .is_err()
        {
            signal_process_group(process_id, libc::SIGKILL);
            let _ = child.start_kill();
            self.record_failed_run(
                &ticket.snapshot.run,
                AgentRunStatusV1::Cancelled,
                "SESSION_DISCONNECTED",
            );
            return Err(EnvRuntimeError::new(
                crate::env_runtime::EnvRuntimeErrorCode::SESSION_DISCONNECTED,
                "CLI disconnected",
            ));
        }
        let stdout = child.stdout.take();
        let stderr = child.stderr.take();
        let output_backpressure = Arc::new(AtomicBool::new(false));
        let stdout_task = tokio::spawn(forward_output(
            stdout,
            events.clone(),
            metadata.id.clone(),
            false,
            stop.clone(),
            Arc::clone(&output_backpressure),
            Arc::clone(self),
        ));
        let stderr_task = tokio::spawn(forward_output(
            stderr,
            events.clone(),
            metadata.id.clone(),
            true,
            stop,
            Arc::clone(&output_backpressure),
            Arc::clone(self),
        ));
        let runtime = Arc::clone(self);
        let process_span = tracing::info_span!(
            target: "env_runtime",
            "process_wait",
            feature_key = "env-runtime",
            run_id_hash = %super::hash_identifier(&metadata.id),
        );
        tokio::spawn(
            async move {
                monitor_child(
                    runtime,
                    child,
                    metadata,
                    process_id,
                    stop_rx,
                    events,
                    stdout_task,
                    stderr_task,
                    output_backpressure,
                )
                .await;
            }
            .instrument(process_span),
        );
        Ok(receiver)
    }

    pub fn list_runs(&self) -> Result<Vec<AgentRunMetadataV1>, EnvRuntimeError> {
        let inner = self.lock_inner()?;
        let mut runs = inner
            .active_runs
            .values()
            .map(|control| control.metadata.clone())
            .chain(inner.starting_runs.values().map(|starting| {
                let mut metadata = starting.snapshot.run.clone();
                metadata.status = AgentRunStatusV1::Starting;
                metadata
            }))
            .chain(
                inner
                    .approvals
                    .values()
                    .map(|approval| approval.snapshot.run.clone()),
            )
            .chain(inner.recent_runs.iter().cloned())
            .collect::<Vec<_>>();
        runs.sort_by_key(|run| run.started_at_epoch_ms.unwrap_or_default());
        Ok(runs)
    }

    pub async fn stop_run(&self, run_id: &str) -> Result<(), EnvRuntimeError> {
        let stop = {
            let mut inner = self.lock_inner()?;
            if let Some(control) = inner.active_runs.get(run_id) {
                Some(control.stop.clone())
            } else if let Some(mut approval) = inner.approvals.remove(run_id) {
                if let Some(sender) = approval.sender.take() {
                    let _ = sender.send(RunApprovalDecision::Cancelled);
                }
                self.observability
                    .record_approval(&approval.snapshot.run, ApprovalDecision::Cancelled);
                let terminal = terminal_run(approval.snapshot.run, AgentRunStatusV1::Cancelled);
                self.observability
                    .record_run_terminal(&terminal, Some("CANCELLED"), 0);
                push_recent_run(&mut inner, terminal);
                self.observability.set_active_runs(active_run_count(&inner));
                None
            } else if let Some(starting) = inner.starting_runs.remove(run_id) {
                let terminal = terminal_run(starting.snapshot.run, AgentRunStatusV1::Cancelled);
                self.observability
                    .record_run_terminal(&terminal, Some("CANCELLED"), 0);
                push_recent_run(&mut inner, terminal);
                self.observability.set_active_runs(active_run_count(&inner));
                None
            } else {
                return Err(run_not_active_error(&inner, run_id));
            }
        };
        match stop {
            Some(stop) => stop.send(true).map_err(|_| {
                EnvRuntimeError::new(
                    crate::env_runtime::EnvRuntimeErrorCode::RUN_ALREADY_TERMINAL,
                    "Run already finished",
                )
            }),
            None => Ok(()),
        }
    }

    pub async fn stop_run_for_actor(
        &self,
        run_id: &str,
        actor_id: &str,
    ) -> Result<(), EnvRuntimeError> {
        let stop = {
            let mut inner = self.lock_inner()?;
            if let Some(control) = inner.active_runs.get(run_id) {
                if control.metadata.actor_id != actor_id {
                    return Err(run_not_active_error_for_actor(&inner, run_id, actor_id));
                }
                Some(control.stop.clone())
            } else if inner
                .approvals
                .get(run_id)
                .is_some_and(|approval| approval.snapshot.run.actor_id == actor_id)
            {
                let mut approval = inner.approvals.remove(run_id).expect("checked above");
                if let Some(sender) = approval.sender.take() {
                    let _ = sender.send(RunApprovalDecision::Cancelled);
                }
                self.observability
                    .record_approval(&approval.snapshot.run, ApprovalDecision::Cancelled);
                let terminal = terminal_run(approval.snapshot.run, AgentRunStatusV1::Cancelled);
                self.observability
                    .record_run_terminal(&terminal, Some("CANCELLED"), 0);
                push_recent_run(&mut inner, terminal);
                self.observability.set_active_runs(active_run_count(&inner));
                None
            } else if inner
                .starting_runs
                .get(run_id)
                .is_some_and(|run| run.snapshot.run.actor_id == actor_id)
            {
                let starting = inner.starting_runs.remove(run_id).expect("checked above");
                let terminal = terminal_run(starting.snapshot.run, AgentRunStatusV1::Cancelled);
                self.observability
                    .record_run_terminal(&terminal, Some("CANCELLED"), 0);
                push_recent_run(&mut inner, terminal);
                self.observability.set_active_runs(active_run_count(&inner));
                None
            } else {
                return Err(run_not_active_error_for_actor(&inner, run_id, actor_id));
            }
        };
        match stop {
            Some(stop) => stop.send(true).map_err(|_| {
                EnvRuntimeError::new(
                    crate::env_runtime::EnvRuntimeErrorCode::RUN_ALREADY_TERMINAL,
                    "Run already finished",
                )
            }),
            None => Ok(()),
        }
    }

    pub async fn stop_runs_for_session(&self, session_id: &str) {
        let stops = match self.inner.lock() {
            Ok(mut inner) => {
                cancel_run_approvals(
                    &mut inner,
                    &self.observability,
                    crate::env_runtime::EnvRuntimeErrorCode::SESSION_DISCONNECTED,
                    |approval| approval.session_id == session_id,
                );
                cancel_starting_runs(
                    &mut inner,
                    &self.observability,
                    crate::env_runtime::EnvRuntimeErrorCode::SESSION_DISCONNECTED,
                    |run| run.session_id == session_id,
                );
                inner
                    .active_runs
                    .values()
                    .filter(|control| control.session_id == session_id)
                    .map(|control| control.stop.clone())
                    .collect::<Vec<_>>()
            }
            Err(_) => return,
        };
        for stop in stops {
            let _ = stop.send(true);
        }
    }

    pub async fn stop_runs_for_actor(&self, actor_id: &str) {
        self.stop_runs_for_actor_with_reason(
            actor_id,
            crate::env_runtime::EnvRuntimeErrorCode::CANCELLED,
        )
        .await;
    }

    pub async fn revoke_runs_for_actor(&self, actor_id: &str) {
        self.stop_runs_for_actor_with_reason(
            actor_id,
            crate::env_runtime::EnvRuntimeErrorCode::AGENT_REVOKED,
        )
        .await;
    }

    async fn stop_runs_for_actor_with_reason(
        &self,
        actor_id: &str,
        reason: crate::env_runtime::EnvRuntimeErrorCode,
    ) {
        let stops = match self.inner.lock() {
            Ok(mut inner) => {
                cancel_run_approvals(&mut inner, &self.observability, reason, |approval| {
                    approval.snapshot.run.actor_id == actor_id
                });
                cancel_starting_runs(&mut inner, &self.observability, reason, |run| {
                    run.snapshot.run.actor_id == actor_id
                });
                inner
                    .active_runs
                    .values()
                    .filter(|control| control.metadata.actor_id == actor_id)
                    .map(|control| control.stop.clone())
                    .collect::<Vec<_>>()
            }
            Err(_) => return,
        };
        for stop in stops {
            let _ = stop.send(true);
        }
    }

    pub async fn stop_all(&self) {
        let stops = match self.inner.lock() {
            Ok(mut inner) => {
                cancel_run_approvals(
                    &mut inner,
                    &self.observability,
                    crate::env_runtime::EnvRuntimeErrorCode::CANCELLED,
                    |_| true,
                );
                cancel_starting_runs(
                    &mut inner,
                    &self.observability,
                    crate::env_runtime::EnvRuntimeErrorCode::CANCELLED,
                    |_| true,
                );
                inner
                    .active_runs
                    .values()
                    .map(|control| control.stop.clone())
                    .collect::<Vec<_>>()
            }
            Err(_) => return,
        };
        for stop in stops {
            let _ = stop.send(true);
        }
    }

    pub async fn stop_all_and_wait(&self) {
        self.stop_all().await;
        let deadline =
            tokio::time::Instant::now() + PROCESS_STOP_GRACE + std::time::Duration::from_secs(2);
        loop {
            let empty = self
                .inner
                .lock()
                .map(|inner| inner.active_runs.is_empty() && inner.starting_runs.is_empty())
                .unwrap_or(true);
            if empty || tokio::time::Instant::now() >= deadline {
                break;
            }
            tokio::time::sleep(std::time::Duration::from_millis(25)).await;
        }
    }

    fn finish_run(&self, metadata: AgentRunMetadataV1, error_code: Option<&str>, duration_ms: u64) {
        let Ok(mut inner) = self.inner.lock() else {
            return;
        };
        inner.active_runs.remove(&metadata.id);
        inner.starting_runs.remove(&metadata.id);
        push_recent_run(&mut inner, metadata.clone());
        let active_runs = active_run_count(&inner);
        drop(inner);
        self.observability.set_active_runs(active_runs);
        self.observability
            .record_run_terminal(&metadata, error_code, duration_ms);
    }

    fn record_failed_run(
        &self,
        run: &AgentRunMetadataV1,
        status: AgentRunStatusV1,
        error_code: &str,
    ) {
        let Ok(mut inner) = self.inner.lock() else {
            return;
        };
        let tracked = inner.active_runs.remove(&run.id).is_some()
            || inner.starting_runs.remove(&run.id).is_some();
        if tracked {
            let terminal = terminal_run(run.clone(), status);
            push_recent_run(&mut inner, terminal.clone());
            let active_runs = active_run_count(&inner);
            drop(inner);
            self.observability.set_active_runs(active_runs);
            self.observability
                .record_run_terminal(&terminal, Some(error_code), 0);
        }
    }

    pub fn fail_starting_run(&self, run: &AgentRunMetadataV1, error_code: &str) {
        self.record_failed_run(run, AgentRunStatusV1::SpawnFailed, error_code);
    }

    pub fn prepare_approved_run(
        &self,
        ticket: AgentRunTicket,
        current_profile: &AgentProfileMetadataV1,
    ) -> Result<PreparedApprovedRun, EnvRuntimeError> {
        if ticket.snapshot.expires_at_epoch_ms <= crate::gateway::state::now_ms() {
            return Err(EnvRuntimeError::new(
                crate::env_runtime::EnvRuntimeErrorCode::APPROVAL_EXPIRED,
                "Run approval expired before spawn",
            ));
        }
        if current_profile.id != ticket.profile.id {
            return Err(EnvRuntimeError::new(
                crate::env_runtime::EnvRuntimeErrorCode::PROFILE_PRESET_MISMATCH,
                "Approved profile identity no longer matches",
            ));
        }
        if current_profile.revision != ticket.profile.revision
            || current_profile.revision != ticket.snapshot.profile_revision
        {
            return Err(EnvRuntimeError::new(
                crate::env_runtime::EnvRuntimeErrorCode::REVISION_CONFLICT,
                "Profile changed while approval was pending",
            ));
        }
        self.verify_starting_reservation(&ticket)?;
        let preset = self.get_preset(&ticket.preset.id).map_err(|mut error| {
            if error.code == "NOT_FOUND" {
                error.code = crate::env_runtime::EnvRuntimeErrorCode::PRESET_NOT_FOUND;
            }
            error
        })?;
        if preset.revision != ticket.preset.revision {
            return Err(EnvRuntimeError::new(
                crate::env_runtime::EnvRuntimeErrorCode::REVISION_CONFLICT,
                "Preset changed while approval was pending",
            ));
        }
        if preset.profile_id != current_profile.id {
            return Err(EnvRuntimeError::new(
                crate::env_runtime::EnvRuntimeErrorCode::PROFILE_PRESET_MISMATCH,
                "Preset is bound to a different profile",
            ));
        }
        let (workspace_identity, cwd_identity, executable_identity) =
            self.preflight_saved_preset(&preset)?;
        Ok(PreparedApprovedRun {
            ticket,
            preset,
            workspace_identity,
            cwd_identity,
            executable_identity,
        })
    }

    fn preflight_saved_preset(
        &self,
        preset: &DevicePreset,
    ) -> Result<(DirectoryIdentity, DirectoryIdentity, ExecutableIdentity), EnvRuntimeError> {
        validate_saved_preset_for_spawn(preset)?;
        let workspace_identity = directory_identity(Path::new(&preset.workspace_root))?;
        let cwd_identity = directory_identity(Path::new(&preset.cwd))?;
        let executable_before = executable_identity(Path::new(&preset.executable))?;
        let current_hash = executable_sha256(Path::new(&preset.executable))?;
        let executable_identity = executable_identity(Path::new(&preset.executable))?;
        if executable_before != executable_identity {
            return Err(EnvRuntimeError::new(
                crate::env_runtime::EnvRuntimeErrorCode::EXECUTABLE_IDENTITY_MISMATCH,
                "Executable changed while its identity was verified",
            ));
        }
        if current_hash != preset.executable_sha256 {
            return Err(EnvRuntimeError::new(
                crate::env_runtime::EnvRuntimeErrorCode::EXECUTABLE_IDENTITY_MISMATCH,
                "Executable identity no longer matches the approved preset",
            ));
        }
        Ok((workspace_identity, cwd_identity, executable_identity))
    }

    pub(crate) fn verify_starting_reservation(
        &self,
        ticket: &AgentRunTicket,
    ) -> Result<(), EnvRuntimeError> {
        let inner = self.lock_inner()?;
        let reservation = inner
            .starting_runs
            .get(&ticket.snapshot.run.id)
            .ok_or_else(|| {
                EnvRuntimeError::new(
                    crate::env_runtime::EnvRuntimeErrorCode::CANCELLED,
                    "Run approval was cancelled before spawn",
                )
            })?;
        if reservation.snapshot.run != ticket.snapshot.run
            || reservation.session_id != ticket.session_id
        {
            return Err(EnvRuntimeError::new(
                crate::env_runtime::EnvRuntimeErrorCode::APPROVAL_CLOSED,
                "Run approval no longer matches the requesting session",
            ));
        }
        Ok(())
    }

    fn verify_prepared_run_reservation_and_filesystem(
        &self,
        ticket: &AgentRunTicket,
        workspace_identity: &DirectoryIdentity,
        cwd_identity: &DirectoryIdentity,
        expected_executable_identity: &ExecutableIdentity,
    ) -> Result<(), EnvRuntimeError> {
        if ticket.snapshot.expires_at_epoch_ms <= crate::gateway::state::now_ms() {
            return Err(EnvRuntimeError::new(
                crate::env_runtime::EnvRuntimeErrorCode::APPROVAL_EXPIRED,
                "Run approval expired before spawn",
            ));
        }
        self.verify_starting_reservation(ticket)?;
        if &directory_identity(&workspace_identity.path)? != workspace_identity
            || &directory_identity(&cwd_identity.path)? != cwd_identity
        {
            return Err(EnvRuntimeError::new(
                crate::env_runtime::EnvRuntimeErrorCode::WORKSPACE_MISMATCH,
                "Workspace identity changed after secret resolution",
            ));
        }
        if &executable_identity(&expected_executable_identity.path)? != expected_executable_identity
        {
            return Err(EnvRuntimeError::new(
                crate::env_runtime::EnvRuntimeErrorCode::EXECUTABLE_IDENTITY_MISMATCH,
                "Executable identity changed after secret resolution",
            ));
        }
        Ok(())
    }

    fn lock_inner(&self) -> Result<std::sync::MutexGuard<'_, RuntimeInner>, EnvRuntimeError> {
        self.inner.lock().map_err(|_| {
            EnvRuntimeError::new(
                crate::env_runtime::EnvRuntimeErrorCode::INTERNAL,
                "Env Runtime mutex poisoned",
            )
        })
    }
}

#[cfg(unix)]
struct ExecvePayload {
    path: CString,
    argv: Vec<CString>,
    argv_ptrs: Vec<*const libc::c_char>,
    env: Vec<Zeroizing<Vec<u8>>>,
    env_ptrs: Vec<*const libc::c_char>,
}

// SAFETY: pointers reference immutable heap buffers owned by the same payload.
// Construction finishes all allocations before pointers are created, and the
// payload is never mutated while installed as a pre-exec closure.
#[cfg(unix)]
unsafe impl Send for ExecvePayload {}
// SAFETY: see the `Send` invariant above; `exec` only reads the buffers.
#[cfg(unix)]
unsafe impl Sync for ExecvePayload {}

#[cfg(unix)]
impl ExecvePayload {
    fn new(
        preset: &DevicePreset,
        resolved: &chromvoid_core::env_runtime::ResolvedEnvLeaseV1,
    ) -> Result<Self, EnvRuntimeError> {
        use std::os::unix::ffi::OsStrExt as _;

        let path = CString::new(preset.executable.as_bytes()).map_err(|_| {
            EnvRuntimeError::new(
                crate::env_runtime::EnvRuntimeErrorCode::INVALID_EXECUTABLE,
                "Executable path contains NUL",
            )
        })?;
        let mut argv = Vec::with_capacity(preset.args.len().saturating_add(1));
        argv.push(CString::new(preset.executable.as_bytes()).map_err(|_| {
            EnvRuntimeError::new(
                crate::env_runtime::EnvRuntimeErrorCode::INVALID_EXECUTABLE,
                "Executable path contains NUL",
            )
        })?);
        for argument in &preset.args {
            argv.push(CString::new(argument.as_bytes()).map_err(|_| {
                EnvRuntimeError::new(
                    crate::env_runtime::EnvRuntimeErrorCode::INVALID_PRESET,
                    "Preset argument contains NUL",
                )
            })?);
        }

        let mut environment = BTreeMap::<Vec<u8>, Zeroizing<Vec<u8>>>::new();
        for name in ["HOME", "USER", "LOGNAME", "TMPDIR"] {
            if let Some(value) = std::env::var_os(name) {
                environment.insert(
                    name.as_bytes().to_vec(),
                    Zeroizing::new(value.as_os_str().as_bytes().to_vec()),
                );
            }
        }
        for name in &preset.passthrough_env {
            if let Some(value) = std::env::var_os(name) {
                environment.insert(
                    name.as_bytes().to_vec(),
                    Zeroizing::new(value.as_os_str().as_bytes().to_vec()),
                );
            }
        }
        for (name, value) in resolved.iter() {
            environment.insert(
                name.as_bytes().to_vec(),
                Zeroizing::new(value.as_bytes().to_vec()),
            );
        }

        let env = environment
            .into_iter()
            .map(|(name, value)| {
                let mut entry = Zeroizing::new(Vec::with_capacity(
                    name.len().saturating_add(value.len()).saturating_add(2),
                ));
                entry.extend_from_slice(&name);
                entry.push(b'=');
                entry.extend_from_slice(&value);
                entry.push(0);
                entry
            })
            .collect::<Vec<_>>();
        let mut argv_ptrs = argv
            .iter()
            .map(|argument| argument.as_ptr())
            .collect::<Vec<_>>();
        argv_ptrs.push(std::ptr::null());
        let mut env_ptrs = env
            .iter()
            .map(|entry| entry.as_ptr().cast())
            .collect::<Vec<_>>();
        env_ptrs.push(std::ptr::null());

        Ok(Self {
            path,
            argv,
            argv_ptrs,
            env,
            env_ptrs,
        })
    }

    fn exec(&self) -> std::io::Result<()> {
        // Keep ownership fields observably live for the duration of execve;
        // their buffers back the pointer vectors passed to libc.
        let _owned_buffers = (&self.argv, &self.env);
        // SAFETY: path/argv/envp are NUL-terminated and the pointer arrays end
        // with NULL. Every pointer remains valid while `self` is alive.
        unsafe {
            libc::execve(
                self.path.as_ptr(),
                self.argv_ptrs.as_ptr(),
                self.env_ptrs.as_ptr(),
            );
        }
        Err(std::io::Error::last_os_error())
    }
}

fn gc_expired(inner: &mut RuntimeInner, observability: &EnvRuntimeObservability) {
    let now = crate::gateway::state::now_ms();
    let expired_proposals = inner
        .proposals
        .iter()
        .filter_map(|(id, proposal)| {
            (proposal.phase == ProposalPhase::Pending && proposal.is_expired(now))
                .then(|| id.clone())
        })
        .collect::<Vec<_>>();
    for id in expired_proposals {
        if let Some(metadata) =
            terminalize_proposal_locked(inner, &id, AgentProposalStatusV1::Expired)
        {
            observability.record_proposal(&metadata);
        }
    }
    let expired = inner
        .approvals
        .iter()
        .filter_map(|(id, approval)| {
            (approval.snapshot.expires_at_epoch_ms <= now).then(|| id.clone())
        })
        .collect::<Vec<_>>();
    for id in expired {
        if let Some(mut approval) = inner.approvals.remove(&id) {
            if let Some(sender) = approval.sender.take() {
                let _ = sender.send(RunApprovalDecision::Expired);
            }
            observability.record_approval(&approval.snapshot.run, ApprovalDecision::Expired);
            let terminal = terminal_run(approval.snapshot.run, AgentRunStatusV1::Cancelled);
            observability.record_run_terminal(&terminal, Some("APPROVAL_EXPIRED"), 0);
            push_recent_run(inner, terminal);
        }
    }
    let expired_starting = inner
        .starting_runs
        .iter()
        .filter_map(|(id, run)| (run.snapshot.expires_at_epoch_ms <= now).then(|| id.clone()))
        .collect::<Vec<_>>();
    for id in expired_starting {
        if let Some(run) = inner.starting_runs.remove(&id) {
            let terminal = terminal_run(run.snapshot.run, AgentRunStatusV1::Cancelled);
            observability.record_run_terminal(&terminal, Some("APPROVAL_EXPIRED"), 0);
            push_recent_run(inner, terminal);
        }
    }
    observability.set_active_runs(active_run_count(inner));
}

fn terminalize_proposal_locked(
    inner: &mut RuntimeInner,
    proposal_id: &str,
    status: AgentProposalStatusV1,
) -> Option<AgentProposalMetadataV1> {
    debug_assert!(status != AgentProposalStatusV1::Pending);
    let mut proposal = inner.proposals.remove(proposal_id)?;
    proposal.metadata.status = status;
    let metadata = proposal.metadata;
    proposal.outcome.send_replace(Some(metadata.clone()));
    inner.recent_proposals.push_back(metadata.clone());
    while inner.recent_proposals.len() > RECENT_RUN_LIMIT {
        inner.recent_proposals.pop_front();
    }
    Some(metadata)
}

fn terminal_run(mut run: AgentRunMetadataV1, status: AgentRunStatusV1) -> AgentRunMetadataV1 {
    run.status = status;
    run.finished_at_epoch_ms = Some(crate::gateway::state::now_ms());
    run
}

fn push_recent_run(inner: &mut RuntimeInner, metadata: AgentRunMetadataV1) {
    inner.recent_runs.push_back(metadata);
    while inner.recent_runs.len() > RECENT_RUN_LIMIT {
        inner.recent_runs.pop_front();
    }
}

fn active_run_count(inner: &RuntimeInner) -> usize {
    inner
        .active_runs
        .len()
        .saturating_add(inner.starting_runs.len())
}

fn cancel_starting_runs(
    inner: &mut RuntimeInner,
    observability: &EnvRuntimeObservability,
    error_code: crate::env_runtime::EnvRuntimeErrorCode,
    mut predicate: impl FnMut(&StartingRun) -> bool,
) {
    let ids = inner
        .starting_runs
        .iter()
        .filter_map(|(id, run)| predicate(run).then(|| id.clone()))
        .collect::<Vec<_>>();
    for id in ids {
        if let Some(run) = inner.starting_runs.remove(&id) {
            let terminal = terminal_run(run.snapshot.run, AgentRunStatusV1::Cancelled);
            observability.record_run_terminal(&terminal, Some(error_code.as_str()), 0);
            push_recent_run(inner, terminal);
        }
    }
    observability.set_active_runs(active_run_count(inner));
}

fn cancel_run_approvals(
    inner: &mut RuntimeInner,
    observability: &EnvRuntimeObservability,
    error_code: crate::env_runtime::EnvRuntimeErrorCode,
    mut predicate: impl FnMut(&PendingRunApproval) -> bool,
) {
    let ids = inner
        .approvals
        .iter()
        .filter_map(|(id, approval)| predicate(approval).then(|| id.clone()))
        .collect::<Vec<_>>();
    for id in ids {
        if let Some(mut approval) = inner.approvals.remove(&id) {
            if let Some(sender) = approval.sender.take() {
                let _ = sender.send(RunApprovalDecision::Cancelled);
            }
            observability.record_approval(&approval.snapshot.run, ApprovalDecision::Cancelled);
            let terminal = terminal_run(approval.snapshot.run, AgentRunStatusV1::Cancelled);
            observability.record_run_terminal(&terminal, Some(error_code.as_str()), 0);
            push_recent_run(inner, terminal);
        }
    }
    observability.set_active_runs(active_run_count(inner));
}

fn run_not_active_error(inner: &RuntimeInner, run_id: &str) -> EnvRuntimeError {
    if inner.recent_runs.iter().any(|run| run.id == run_id) {
        EnvRuntimeError::new(
            crate::env_runtime::EnvRuntimeErrorCode::RUN_ALREADY_TERMINAL,
            "Run already finished",
        )
    } else {
        EnvRuntimeError::new(
            crate::env_runtime::EnvRuntimeErrorCode::RUN_NOT_FOUND,
            "Run not found",
        )
    }
}

fn run_not_active_error_for_actor(
    inner: &RuntimeInner,
    run_id: &str,
    actor_id: &str,
) -> EnvRuntimeError {
    if inner
        .recent_runs
        .iter()
        .any(|run| run.id == run_id && run.actor_id == actor_id)
    {
        EnvRuntimeError::new(
            crate::env_runtime::EnvRuntimeErrorCode::RUN_ALREADY_TERMINAL,
            "Run already finished",
        )
    } else {
        EnvRuntimeError::new(
            crate::env_runtime::EnvRuntimeErrorCode::RUN_NOT_FOUND,
            "Run not found",
        )
    }
}

fn validate_mutation_shape(
    operation: MutationOperationV1,
    target: Option<&str>,
    base_revision: Option<u64>,
    has_draft: bool,
) -> Result<(), EnvRuntimeError> {
    match operation {
        MutationOperationV1::Create if target.is_none() && base_revision.is_none() && has_draft => {
            Ok(())
        }
        MutationOperationV1::Update if target.is_some() && base_revision.is_some() && has_draft => {
            Ok(())
        }
        MutationOperationV1::Delete
            if target.is_some() && base_revision.is_some() && !has_draft =>
        {
            Ok(())
        }
        _ => Err(EnvRuntimeError::new(
            crate::env_runtime::EnvRuntimeErrorCode::INVALID_PROPOSAL,
            "Proposal target, revision, and draft do not match the operation",
        )),
    }
}

fn prepare_preset_facts(
    draft: &AgentPresetDraftV1,
) -> Result<PreparedPresetFacts, EnvRuntimeError> {
    validate_preset_draft(&draft)?;
    let workspace_root = canonical_directory(&draft.workspace_root, "workspace root")?;
    let cwd = canonical_directory(&draft.cwd, "working directory")?;
    if !cwd.starts_with(&workspace_root) {
        return Err(EnvRuntimeError::new(
            crate::env_runtime::EnvRuntimeErrorCode::INVALID_CWD,
            "Working directory must be inside the canonical workspace root",
        ));
    }
    let executable = std::fs::canonicalize(&draft.executable).map_err(|error| {
        EnvRuntimeError::new(
            crate::env_runtime::EnvRuntimeErrorCode::INVALID_EXECUTABLE,
            format!("Executable could not be resolved: {error}"),
        )
    })?;
    if !executable.is_absolute() || !executable.is_file() {
        return Err(EnvRuntimeError::new(
            crate::env_runtime::EnvRuntimeErrorCode::INVALID_EXECUTABLE,
            "Executable must be an absolute path to a file",
        ));
    }
    validate_executable_file(&executable)?;
    reject_shell_executable(&executable)?;
    let executable_sha256 = executable_sha256(&executable)?;
    Ok(PreparedPresetFacts {
        profile_id: draft.profile_id.clone(),
        workspace_root: path_to_utf8(&workspace_root, "workspace root")?,
        cwd: path_to_utf8(&cwd, "working directory")?,
        executable: path_to_utf8(&executable, "executable")?,
        executable_sha256,
        args: draft.args.clone(),
        passthrough_env: draft.passthrough_env.clone(),
    })
}

fn verify_prepared_preset_facts(
    draft: &AgentPresetDraftV1,
    expected: Option<&PreparedPresetFacts>,
) -> Result<(), EnvRuntimeError> {
    let expected = expected.ok_or_else(|| {
        EnvRuntimeError::new(
            crate::env_runtime::EnvRuntimeErrorCode::INVALID_PROPOSAL,
            "Preset proposal is missing prepared facts",
        )
    })?;
    let current = prepare_preset_facts(draft).map_err(|_| {
        EnvRuntimeError::new(
            crate::env_runtime::EnvRuntimeErrorCode::REVISION_CONFLICT,
            "Canonical preset facts changed since the proposal was submitted",
        )
    })?;
    if &current != expected {
        return Err(EnvRuntimeError::new(
            crate::env_runtime::EnvRuntimeErrorCode::REVISION_CONFLICT,
            "Canonical preset facts changed since the proposal was submitted",
        ));
    }
    Ok(())
}

fn build_device_preset(
    existing: Option<DevicePreset>,
    draft: AgentPresetDraftV1,
    prepared: PreparedPresetFacts,
) -> Result<DevicePreset, EnvRuntimeError> {
    validate_preset_draft(&draft)?;
    if prepared.profile_id != draft.profile_id
        || prepared.args != draft.args
        || prepared.passthrough_env != draft.passthrough_env
    {
        return Err(EnvRuntimeError::new(
            crate::env_runtime::EnvRuntimeErrorCode::INVALID_PRESET,
            "Prepared preset facts do not match the draft",
        ));
    }
    let now = crate::gateway::state::now_ms();
    let (id, revision, created_at_epoch_ms) = match existing.as_ref() {
        Some(preset) => (
            preset.id.clone(),
            preset.revision.checked_add(1).ok_or_else(|| {
                EnvRuntimeError::new(
                    crate::env_runtime::EnvRuntimeErrorCode::REVISION_CONFLICT,
                    "Preset revision cannot advance beyond the v1 scalar range",
                )
            })?,
            preset.created_at_epoch_ms,
        ),
        None => (Uuid::new_v4().to_string(), 1, now),
    };
    Ok(DevicePreset {
        id,
        profile_id: draft.profile_id,
        slug: draft.slug,
        label: draft.label.trim().to_string(),
        revision,
        workspace_root: prepared.workspace_root,
        cwd: prepared.cwd,
        executable: prepared.executable,
        executable_sha256: prepared.executable_sha256,
        args: draft.args,
        passthrough_env: draft.passthrough_env,
        created_at_epoch_ms,
        updated_at_epoch_ms: now,
    })
}

fn validate_saved_preset_for_spawn(preset: &DevicePreset) -> Result<(), EnvRuntimeError> {
    let workspace = std::fs::canonicalize(&preset.workspace_root).map_err(|_| {
        EnvRuntimeError::new(
            crate::env_runtime::EnvRuntimeErrorCode::WORKSPACE_UNAVAILABLE,
            "Preset workspace is unavailable",
        )
    })?;
    let cwd = std::fs::canonicalize(&preset.cwd).map_err(|_| {
        EnvRuntimeError::new(
            crate::env_runtime::EnvRuntimeErrorCode::CWD_UNAVAILABLE,
            "Preset working directory is unavailable",
        )
    })?;
    if workspace != PathBuf::from(&preset.workspace_root) || cwd != PathBuf::from(&preset.cwd) {
        return Err(EnvRuntimeError::new(
            crate::env_runtime::EnvRuntimeErrorCode::WORKSPACE_MISMATCH,
            "Workspace or working directory identity changed since preset approval",
        ));
    }
    if !cwd.starts_with(&workspace) {
        return Err(EnvRuntimeError::new(
            crate::env_runtime::EnvRuntimeErrorCode::WORKSPACE_MISMATCH,
            "Working directory is no longer inside the saved workspace",
        ));
    }
    let executable = std::fs::canonicalize(&preset.executable).map_err(|_| {
        EnvRuntimeError::new(
            crate::env_runtime::EnvRuntimeErrorCode::EXECUTABLE_UNAVAILABLE,
            "Preset executable is unavailable",
        )
    })?;
    if executable != PathBuf::from(&preset.executable) {
        return Err(EnvRuntimeError::new(
            crate::env_runtime::EnvRuntimeErrorCode::EXECUTABLE_IDENTITY_MISMATCH,
            "Executable canonical path changed since approval",
        ));
    }
    validate_executable_file(&executable)?;
    reject_shell_executable(&executable)
}

fn validate_executable_file(executable: &Path) -> Result<(), EnvRuntimeError> {
    let metadata = std::fs::metadata(executable).map_err(|error| {
        EnvRuntimeError::new(
            crate::env_runtime::EnvRuntimeErrorCode::INVALID_EXECUTABLE,
            format!("Executable metadata could not be read: {error}"),
        )
    })?;
    if !metadata.is_file() {
        return Err(EnvRuntimeError::new(
            crate::env_runtime::EnvRuntimeErrorCode::INVALID_EXECUTABLE,
            "Executable must be a regular file",
        ));
    }
    #[cfg(unix)]
    {
        use std::os::unix::fs::PermissionsExt as _;
        if metadata.permissions().mode() & 0o111 == 0 {
            return Err(EnvRuntimeError::new(
                crate::env_runtime::EnvRuntimeErrorCode::INVALID_EXECUTABLE,
                "Executable file has no execute permission bits",
            ));
        }
    }
    Ok(())
}

fn canonical_directory(value: &str, label: &str) -> Result<PathBuf, EnvRuntimeError> {
    let path = PathBuf::from(value);
    if !path.is_absolute() {
        return Err(EnvRuntimeError::new(
            crate::env_runtime::EnvRuntimeErrorCode::INVALID_PATH,
            format!("Preset {label} must be absolute"),
        ));
    }
    let canonical = std::fs::canonicalize(path).map_err(|error| {
        EnvRuntimeError::new(
            crate::env_runtime::EnvRuntimeErrorCode::INVALID_PATH,
            format!("Preset {label} could not be resolved: {error}"),
        )
    })?;
    if !canonical.is_dir() {
        return Err(EnvRuntimeError::new(
            crate::env_runtime::EnvRuntimeErrorCode::INVALID_PATH,
            format!("Preset {label} must be a directory"),
        ));
    }
    Ok(canonical)
}

fn directory_identity(path: &Path) -> Result<DirectoryIdentity, EnvRuntimeError> {
    let canonical = std::fs::canonicalize(path).map_err(|_| {
        EnvRuntimeError::new(
            crate::env_runtime::EnvRuntimeErrorCode::WORKSPACE_MISMATCH,
            "Workspace or working directory is unavailable",
        )
    })?;
    let metadata = std::fs::metadata(&canonical).map_err(|_| {
        EnvRuntimeError::new(
            crate::env_runtime::EnvRuntimeErrorCode::WORKSPACE_MISMATCH,
            "Workspace or working directory metadata is unavailable",
        )
    })?;
    if !metadata.is_dir() {
        return Err(EnvRuntimeError::new(
            crate::env_runtime::EnvRuntimeErrorCode::WORKSPACE_MISMATCH,
            "Workspace identity is not a directory",
        ));
    }
    #[cfg(unix)]
    {
        use std::os::unix::fs::MetadataExt as _;
        Ok(DirectoryIdentity {
            path: canonical,
            device: metadata.dev(),
            inode: metadata.ino(),
        })
    }
    #[cfg(not(unix))]
    {
        Ok(DirectoryIdentity { path: canonical })
    }
}

fn executable_identity(path: &Path) -> Result<ExecutableIdentity, EnvRuntimeError> {
    let canonical = std::fs::canonicalize(path).map_err(|_| {
        EnvRuntimeError::new(
            crate::env_runtime::EnvRuntimeErrorCode::EXECUTABLE_IDENTITY_MISMATCH,
            "Executable is unavailable",
        )
    })?;
    let metadata = std::fs::metadata(&canonical).map_err(|_| {
        EnvRuntimeError::new(
            crate::env_runtime::EnvRuntimeErrorCode::EXECUTABLE_IDENTITY_MISMATCH,
            "Executable metadata is unavailable",
        )
    })?;
    if !metadata.is_file() {
        return Err(EnvRuntimeError::new(
            crate::env_runtime::EnvRuntimeErrorCode::EXECUTABLE_IDENTITY_MISMATCH,
            "Executable identity is not a regular file",
        ));
    }
    let modified_nanos = metadata
        .modified()
        .ok()
        .and_then(|modified| modified.duration_since(std::time::UNIX_EPOCH).ok())
        .map(|duration| duration.as_nanos())
        .unwrap_or_default();
    #[cfg(unix)]
    {
        use std::os::unix::fs::MetadataExt as _;
        Ok(ExecutableIdentity {
            path: canonical,
            device: metadata.dev(),
            inode: metadata.ino(),
            size: metadata.len(),
            modified_nanos,
        })
    }
    #[cfg(not(unix))]
    {
        Ok(ExecutableIdentity {
            path: canonical,
            size: metadata.len(),
            modified_nanos,
        })
    }
}

fn path_to_utf8(path: &Path, label: &str) -> Result<String, EnvRuntimeError> {
    path.to_str().map(ToOwned::to_owned).ok_or_else(|| {
        EnvRuntimeError::new(
            crate::env_runtime::EnvRuntimeErrorCode::INVALID_PATH,
            format!("Preset {label} must be valid UTF-8"),
        )
    })
}

fn reject_shell_executable(executable: &Path) -> Result<(), EnvRuntimeError> {
    let basename = executable
        .file_name()
        .and_then(OsStr::to_str)
        .unwrap_or_default()
        .to_ascii_lowercase();
    if is_shell_name(&basename) || basename == "env" {
        return Err(EnvRuntimeError::new(
            crate::env_runtime::EnvRuntimeErrorCode::SHELL_FORBIDDEN,
            "Shells and indirect executable launchers are not allowed",
        ));
    }
    let mut file = File::open(executable).map_err(|error| {
        EnvRuntimeError::new(
            crate::env_runtime::EnvRuntimeErrorCode::INVALID_EXECUTABLE,
            format!("Executable could not be inspected: {error}"),
        )
    })?;
    let mut prefix = [0_u8; 512];
    let read = file.read(&mut prefix).map_err(|error| {
        EnvRuntimeError::new(
            crate::env_runtime::EnvRuntimeErrorCode::INVALID_EXECUTABLE,
            format!("Executable could not be inspected: {error}"),
        )
    })?;
    if prefix[..read].starts_with(b"#!") {
        let shebang = String::from_utf8_lossy(&prefix[2..read]);
        let line = shebang
            .lines()
            .next()
            .unwrap_or_default()
            .to_ascii_lowercase();
        if ["sh", "bash", "zsh", "fish", "dash", "ksh", "csh", "tcsh"]
            .iter()
            .any(|shell| {
                line.split(|ch: char| !ch.is_ascii_alphanumeric())
                    .any(|part| part == *shell)
            })
        {
            return Err(EnvRuntimeError::new(
                crate::env_runtime::EnvRuntimeErrorCode::SHELL_FORBIDDEN,
                "Executables with a shell shebang are not allowed",
            ));
        }
    }
    Ok(())
}

fn is_shell_name(name: &str) -> bool {
    matches!(
        name,
        "sh" | "bash" | "zsh" | "fish" | "dash" | "ksh" | "csh" | "tcsh"
    )
}

fn executable_sha256(path: &Path) -> Result<String, EnvRuntimeError> {
    let mut file = File::open(path).map_err(|error| {
        EnvRuntimeError::new(
            crate::env_runtime::EnvRuntimeErrorCode::INVALID_EXECUTABLE,
            format!("Executable could not be opened: {error}"),
        )
    })?;
    let mut hasher = Sha256::new();
    let mut buffer = [0_u8; 64 * 1024];
    loop {
        let read = file.read(&mut buffer).map_err(|error| {
            EnvRuntimeError::new(
                crate::env_runtime::EnvRuntimeErrorCode::INVALID_EXECUTABLE,
                format!("Executable could not be hashed: {error}"),
            )
        })?;
        if read == 0 {
            break;
        }
        hasher.update(&buffer[..read]);
    }
    Ok(format!("{:x}", hasher.finalize()))
}

async fn forward_output<R>(
    reader: Option<R>,
    events: mpsc::Sender<AgentEventDataV1>,
    run_id: String,
    stderr: bool,
    stop: watch::Sender<bool>,
    output_backpressure: Arc<AtomicBool>,
    runtime: Arc<EnvRuntimeState>,
) where
    R: tokio::io::AsyncRead + Unpin,
{
    let Some(mut reader) = reader else {
        return;
    };
    let mut buffer = vec![0_u8; AGENT_OUTPUT_CHUNK_BYTES];
    loop {
        if output_backpressure.load(Ordering::Acquire) {
            break;
        }
        let read = match reader.read(&mut buffer).await {
            Ok(0) | Err(_) => break,
            Ok(read) => read,
        };
        runtime.observability.record_output_bytes(stderr, read);
        let data_base64 = BASE64_STANDARD.encode(&buffer[..read]);
        let event = if stderr {
            AgentEventDataV1::Stderr {
                run_id: run_id.clone(),
                data_base64,
            }
        } else {
            AgentEventDataV1::Stdout {
                run_id: run_id.clone(),
                data_base64,
            }
        };
        if events.capacity() <= TERMINAL_EVENT_RESERVE {
            output_backpressure.store(true, Ordering::Release);
            let _ = stop.send(true);
            break;
        }
        match events.try_send(event) {
            Ok(()) => {}
            Err(tokio::sync::mpsc::error::TrySendError::Full(_)) => {
                output_backpressure.store(true, Ordering::Release);
                let _ = stop.send(true);
                break;
            }
            Err(tokio::sync::mpsc::error::TrySendError::Closed(_)) => break,
        }
    }
}

#[allow(clippy::too_many_arguments)]
async fn monitor_child(
    runtime: Arc<EnvRuntimeState>,
    mut child: tokio::process::Child,
    mut metadata: AgentRunMetadataV1,
    process_id: u32,
    mut stop: watch::Receiver<bool>,
    events: mpsc::Sender<AgentEventDataV1>,
    stdout_task: tokio::task::JoinHandle<()>,
    stderr_task: tokio::task::JoinHandle<()>,
    output_backpressure: Arc<AtomicBool>,
) {
    let started = Instant::now();
    let mut cancelled = false;
    let status = tokio::select! {
        status = child.wait() => {
            let status = status.ok();
            terminate_residual_process_group(process_id, &metadata.id, &events).await;
            status
        },
        changed = stop.changed() => {
            if changed.is_ok() && *stop.borrow() {
                cancelled = true;
                terminate_process_group(&mut child, process_id, &metadata.id, &events).await
            } else {
                let status = child.wait().await.ok();
                terminate_residual_process_group(process_id, &metadata.id, &events).await;
                status
            }
        }
    };
    drain_output_task(stdout_task).await;
    drain_output_task(stderr_task).await;

    #[cfg(unix)]
    use std::os::unix::process::ExitStatusExt as _;
    let exit_code = status.as_ref().and_then(std::process::ExitStatus::code);
    #[cfg(unix)]
    let signal = status.as_ref().and_then(std::process::ExitStatus::signal);
    #[cfg(not(unix))]
    let signal = None;
    metadata.status = if cancelled {
        AgentRunStatusV1::Cancelled
    } else if signal.is_some() {
        AgentRunStatusV1::Signaled
    } else {
        AgentRunStatusV1::Exited
    };
    metadata.finished_at_epoch_ms = Some(crate::gateway::state::now_ms());
    metadata.exit_code = exit_code;
    metadata.signal = signal;
    let output_backpressure = output_backpressure.load(Ordering::Acquire);
    if output_backpressure {
        let _ = events.try_send(AgentEventDataV1::Error(AgentErrorV1 {
            code: "OUTPUT_BACKPRESSURE".to_string(),
            message: "Run output exceeded the bounded delivery queue".to_string(),
            retryable: false,
            next_action: Some("reduce_output_and_retry".to_string()),
        }));
    }
    let duration_ms = started.elapsed().as_millis() as u64;
    let _ = events.try_send(AgentEventDataV1::RunExited {
        run_id: metadata.id.clone(),
        exit_code,
        signal,
        duration_ms,
    });
    let error_code = if output_backpressure {
        Some("OUTPUT_BACKPRESSURE")
    } else if cancelled {
        Some("CANCELLED")
    } else {
        None
    };
    runtime.finish_run(metadata, error_code, duration_ms);
}

async fn terminate_process_group(
    child: &mut tokio::process::Child,
    process_id: u32,
    run_id: &str,
    events: &mpsc::Sender<AgentEventDataV1>,
) -> Option<std::process::ExitStatus> {
    signal_process_group(process_id, libc::SIGTERM);
    let _ = events.try_send(AgentEventDataV1::SignalForwarded {
        run_id: run_id.to_string(),
        signal: libc::SIGTERM,
    });

    let deadline = tokio::time::Instant::now() + PROCESS_STOP_GRACE;
    let mut status = None;
    while tokio::time::Instant::now() < deadline && process_group_exists(process_id) {
        if status.is_none() {
            status = child.try_wait().ok().flatten();
        }
        tokio::time::sleep(std::time::Duration::from_millis(25)).await;
    }
    if process_group_exists(process_id) {
        signal_process_group(process_id, libc::SIGKILL);
        let _ = events.try_send(AgentEventDataV1::SignalForwarded {
            run_id: run_id.to_string(),
            signal: libc::SIGKILL,
        });
    }
    if status.is_none() {
        status = tokio::time::timeout(PIPE_DRAIN_TIMEOUT, child.wait())
            .await
            .ok()
            .and_then(Result::ok);
    }
    status
}

async fn terminate_residual_process_group(
    process_id: u32,
    run_id: &str,
    events: &mpsc::Sender<AgentEventDataV1>,
) {
    if !process_group_exists(process_id) {
        return;
    }
    signal_process_group(process_id, libc::SIGTERM);
    let _ = events.try_send(AgentEventDataV1::SignalForwarded {
        run_id: run_id.to_string(),
        signal: libc::SIGTERM,
    });
    let deadline = tokio::time::Instant::now() + PROCESS_STOP_GRACE;
    while tokio::time::Instant::now() < deadline && process_group_exists(process_id) {
        tokio::time::sleep(std::time::Duration::from_millis(25)).await;
    }
    if process_group_exists(process_id) {
        signal_process_group(process_id, libc::SIGKILL);
        let _ = events.try_send(AgentEventDataV1::SignalForwarded {
            run_id: run_id.to_string(),
            signal: libc::SIGKILL,
        });
    }
}

async fn drain_output_task(mut task: tokio::task::JoinHandle<()>) {
    if tokio::time::timeout(PIPE_DRAIN_TIMEOUT, &mut task)
        .await
        .is_err()
    {
        task.abort();
    }
}

#[cfg(unix)]
fn process_group_exists(process_id: u32) -> bool {
    let Ok(pid) = i32::try_from(process_id) else {
        return false;
    };
    // SAFETY: signal 0 performs an existence/permission check and does not
    // deliver a signal. The negative pid targets only this run's process group.
    let result = unsafe { libc::kill(-pid, 0) };
    result == 0 || std::io::Error::last_os_error().raw_os_error() != Some(libc::ESRCH)
}

#[cfg(not(unix))]
fn process_group_exists(_process_id: u32) -> bool {
    false
}

#[cfg(unix)]
fn signal_process_group(process_id: u32, signal: i32) {
    if let Ok(pid) = i32::try_from(process_id) {
        // SAFETY: `kill` is invoked with a validated positive pid negated to
        // address only the process group created for this run.
        unsafe {
            libc::kill(-pid, signal);
        }
    }
}

#[cfg(not(unix))]
fn signal_process_group(_process_id: u32, _signal: i32) {}

#[cfg(test)]
mod lifecycle_tests;

#[cfg(test)]
mod tests {
    use super::*;
    use chromvoid_protocol::AgentVariableMappingV1;
    use tokio::io::AsyncWriteExt as _;

    #[test]
    fn mutation_shapes_are_fail_closed() {
        assert!(validate_mutation_shape(MutationOperationV1::Create, None, None, true).is_ok());
        assert!(
            validate_mutation_shape(MutationOperationV1::Create, Some("x"), None, true).is_err()
        );
        assert!(
            validate_mutation_shape(MutationOperationV1::Update, Some("x"), Some(1), true).is_ok()
        );
        assert!(
            validate_mutation_shape(MutationOperationV1::Delete, Some("x"), Some(1), false).is_ok()
        );
        assert!(
            validate_mutation_shape(MutationOperationV1::Delete, Some("x"), Some(1), true).is_err()
        );
    }

    #[test]
    fn environment_names_are_portable_and_unambiguous() {
        for valid in ["PATH", "_TOKEN", "AWS_ACCESS_KEY_ID"] {
            validate_env_name(valid).expect("valid");
        }
        for invalid in ["", "9TOKEN", "A-B", "A=B", "A B"] {
            assert!(validate_env_name(invalid).is_err(), "{invalid}");
        }
    }

    #[cfg(unix)]
    #[test]
    fn executable_inspection_fails_closed_when_prefix_cannot_be_read() {
        let tempdir = tempfile::tempdir().expect("tempdir");
        let executable_directory = tempdir.path().join("not-a-readable-executable");
        std::fs::create_dir(&executable_directory).expect("create directory fixture");

        let error = reject_shell_executable(&executable_directory)
            .expect_err("directory read must not be treated as an empty executable");
        assert_eq!(
            error.code,
            crate::env_runtime::EnvRuntimeErrorCode::INVALID_EXECUTABLE
        );
    }

    fn proposal_profile_draft() -> AgentProfileDraftV1 {
        AgentProfileDraftV1 {
            slug: "proposal-profile".to_string(),
            label: "Proposal profile".to_string(),
            description: None,
            variables: vec![AgentVariableMappingV1 {
                name: "TOKEN".to_string(),
                secret_id: None,
            }],
        }
    }

    #[test]
    fn proposal_commit_is_single_owner_and_terminal_payload_is_discarded() {
        let tempdir = tempfile::tempdir().expect("tempdir");
        let state = EnvRuntimeState::new(tempdir.path().join("presets.enc.json")).expect("state");
        let proposal = state
            .propose_profile(
                "actor".to_string(),
                "session".to_string(),
                MutationOperationV1::Create,
                None,
                None,
                Some(proposal_profile_draft()),
            )
            .expect("proposal");
        let mut outcome = match state
            .lookup_or_subscribe_proposal(&proposal.id, "actor")
            .expect("subscribe")
        {
            ProposalLookup::Pending { outcome, .. } => outcome,
            ProposalLookup::Terminal(_) => panic!("proposal unexpectedly terminal"),
        };

        let commit = state
            .reserve_proposal(&proposal.id)
            .expect("first commit owner");
        assert!(matches!(commit.draft, Some(ProposalDraft::Profile(_))));
        assert_eq!(
            state
                .reserve_proposal(&proposal.id)
                .expect_err("second commit owner must fail")
                .code,
            "PROPOSAL_CLOSED"
        );
        assert_eq!(
            state
                .reject_proposal(&proposal.id)
                .expect_err("applying proposal cannot be rejected")
                .code,
            "PROPOSAL_CLOSED"
        );
        state
            .begin_proposal_commit(&proposal.id)
            .expect("reserved proposal remains live immediately before mutation");

        let terminal =
            state.finish_proposal_terminal(&proposal.id, AgentProposalStatusV1::Approved);
        assert_eq!(terminal.status, AgentProposalStatusV1::Approved);
        assert_eq!(
            outcome
                .borrow_and_update()
                .as_ref()
                .map(|item| item.status.clone()),
            Some(AgentProposalStatusV1::Approved)
        );
        let inner = state.inner.lock().expect("runtime state");
        assert!(!inner.proposals.contains_key(&proposal.id));
        assert!(inner
            .recent_proposals
            .iter()
            .any(|metadata| metadata.id == proposal.id));
    }

    #[test]
    fn concurrent_proposal_approve_and_reject_have_one_terminal_owner() {
        let tempdir = tempfile::tempdir().expect("tempdir");
        let state =
            Arc::new(EnvRuntimeState::new(tempdir.path().join("presets.enc.json")).expect("state"));
        let proposal = state
            .propose_profile(
                "actor".to_string(),
                "session".to_string(),
                MutationOperationV1::Create,
                None,
                None,
                Some(proposal_profile_draft()),
            )
            .expect("proposal");
        let mut outcome = match state
            .lookup_or_subscribe_proposal(&proposal.id, "actor")
            .expect("subscribe")
        {
            ProposalLookup::Pending { outcome, .. } => outcome,
            ProposalLookup::Terminal(_) => panic!("proposal unexpectedly terminal"),
        };
        let mutation_count = Arc::new(std::sync::atomic::AtomicUsize::new(0));
        let start = Arc::new(std::sync::Barrier::new(2));

        let approve_state = Arc::clone(&state);
        let approve_id = proposal.id.clone();
        let approve_start = Arc::clone(&start);
        let approve_mutations = Arc::clone(&mutation_count);
        let approve = std::thread::spawn(move || {
            approve_start.wait();
            approve_state
                .reserve_proposal(&approve_id)
                .and_then(|_| {
                    approve_state.begin_proposal_commit(&approve_id)?;
                    approve_mutations.fetch_add(1, Ordering::SeqCst);
                    Ok(approve_state
                        .finish_proposal_terminal(&approve_id, AgentProposalStatusV1::Approved)
                        .status)
                })
                .map_err(|error| error.code)
        });
        let reject_state = Arc::clone(&state);
        let reject_id = proposal.id.clone();
        let reject_start = Arc::clone(&start);
        let reject = std::thread::spawn(move || {
            reject_start.wait();
            reject_state
                .reject_proposal(&reject_id)
                .map(|metadata| metadata.status)
                .map_err(|error| error.code)
        });

        let approve = approve.join().expect("approve thread");
        let reject = reject.join().expect("reject thread");
        let terminal = outcome
            .borrow_and_update()
            .clone()
            .expect("terminal waiter outcome");
        assert!(matches!(
            (&approve, &reject),
            (
                Ok(AgentProposalStatusV1::Approved),
                Err(crate::env_runtime::EnvRuntimeErrorCode::PROPOSAL_CLOSED)
            ) | (
                Err(crate::env_runtime::EnvRuntimeErrorCode::PROPOSAL_CLOSED),
                Ok(AgentProposalStatusV1::Rejected)
            )
        ));
        assert_eq!(
            mutation_count.load(Ordering::SeqCst),
            usize::from(terminal.status == AgentProposalStatusV1::Approved)
        );
        let inner = state.inner.lock().expect("runtime state");
        assert!(!inner.proposals.contains_key(&proposal.id));
        assert_eq!(
            inner
                .recent_proposals
                .iter()
                .filter(|metadata| metadata.id == proposal.id)
                .count(),
            1
        );
    }

    #[test]
    fn concurrent_begin_commit_and_expiry_have_one_expired_outcome_and_no_mutation() {
        let tempdir = tempfile::tempdir().expect("tempdir");
        let state =
            Arc::new(EnvRuntimeState::new(tempdir.path().join("presets.enc.json")).expect("state"));
        let proposal = state
            .propose_profile(
                "actor".to_string(),
                "session".to_string(),
                MutationOperationV1::Create,
                None,
                None,
                Some(proposal_profile_draft()),
            )
            .expect("proposal");
        let mut outcome = match state
            .lookup_or_subscribe_proposal(&proposal.id, "actor")
            .expect("subscribe")
        {
            ProposalLookup::Pending { outcome, .. } => outcome,
            ProposalLookup::Terminal(_) => panic!("proposal unexpectedly terminal"),
        };
        state
            .reserve_proposal(&proposal.id)
            .expect("reserve proposal");
        state
            .inner
            .lock()
            .expect("runtime state")
            .proposals
            .get_mut(&proposal.id)
            .expect("live proposal")
            .metadata
            .expires_at_epoch_ms = 0;

        let start = Arc::new(std::sync::Barrier::new(2));
        let begin_state = Arc::clone(&state);
        let begin_id = proposal.id.clone();
        let begin_start = Arc::clone(&start);
        let begin = std::thread::spawn(move || {
            begin_start.wait();
            begin_state
                .begin_proposal_commit(&begin_id)
                .map_err(|error| error.code)
        });
        let expiry_state = Arc::clone(&state);
        let expiry_id = proposal.id.clone();
        let expiry_start = Arc::clone(&start);
        let expiry = std::thread::spawn(move || {
            expiry_start.wait();
            expiry_state.release_or_expire_proposal(&expiry_id);
        });

        assert_eq!(
            begin.join().expect("begin thread").expect_err("expired"),
            crate::env_runtime::EnvRuntimeErrorCode::PROPOSAL_CLOSED
        );
        expiry.join().expect("expiry thread");
        assert_eq!(
            outcome
                .borrow_and_update()
                .as_ref()
                .map(|metadata| metadata.status.clone()),
            Some(AgentProposalStatusV1::Expired)
        );
        let inner = state.inner.lock().expect("runtime state");
        assert!(!inner.proposals.contains_key(&proposal.id));
        assert_eq!(
            inner
                .recent_proposals
                .iter()
                .filter(|metadata| metadata.id == proposal.id)
                .count(),
            1
        );
    }

    #[test]
    fn concurrent_commit_and_lock_or_revoke_have_one_terminal_outcome() {
        for cancellation in ["lock", "revoke"] {
            let tempdir = tempfile::tempdir().expect("tempdir");
            let state = Arc::new(
                EnvRuntimeState::new(tempdir.path().join("presets.enc.json")).expect("state"),
            );
            let proposal = state
                .propose_profile(
                    "actor".to_string(),
                    "session".to_string(),
                    MutationOperationV1::Create,
                    None,
                    None,
                    Some(proposal_profile_draft()),
                )
                .expect("proposal");
            let mut outcome = match state
                .lookup_or_subscribe_proposal(&proposal.id, "actor")
                .expect("subscribe")
            {
                ProposalLookup::Pending { outcome, .. } => outcome,
                ProposalLookup::Terminal(_) => panic!("proposal unexpectedly terminal"),
            };
            let mutation_count = Arc::new(std::sync::atomic::AtomicUsize::new(0));
            let start = Arc::new(std::sync::Barrier::new(2));

            let commit_state = Arc::clone(&state);
            let commit_id = proposal.id.clone();
            let commit_start = Arc::clone(&start);
            let commit_mutations = Arc::clone(&mutation_count);
            let commit = std::thread::spawn(move || {
                commit_start.wait();
                commit_state
                    .reserve_proposal(&commit_id)
                    .and_then(|_| {
                        commit_state.begin_proposal_commit(&commit_id)?;
                        commit_mutations.fetch_add(1, Ordering::SeqCst);
                        Ok(commit_state
                            .finish_proposal_terminal(&commit_id, AgentProposalStatusV1::Approved)
                            .status)
                    })
                    .map_err(|error| error.code)
            });
            let cancel_state = Arc::clone(&state);
            let cancel_start = Arc::clone(&start);
            let cancel = std::thread::spawn(move || {
                cancel_start.wait();
                match cancellation {
                    "lock" => cancel_state.cancel_pending_for_lock(),
                    "revoke" => cancel_state.cancel_pending_for_actor("actor"),
                    _ => unreachable!(),
                }
            });

            let commit = commit.join().expect("commit thread");
            cancel.join().expect("cancellation thread");
            let terminal = outcome
                .borrow_and_update()
                .clone()
                .expect("terminal waiter outcome");
            assert!(matches!(
                commit,
                Ok(AgentProposalStatusV1::Approved)
                    | Err(crate::env_runtime::EnvRuntimeErrorCode::PROPOSAL_CLOSED)
            ));
            assert_eq!(
                mutation_count.load(Ordering::SeqCst),
                usize::from(terminal.status == AgentProposalStatusV1::Approved),
                "{cancellation} contention mutated more than once"
            );
            assert!(matches!(
                terminal.status,
                AgentProposalStatusV1::Approved | AgentProposalStatusV1::Rejected
            ));
            let inner = state.inner.lock().expect("runtime state");
            assert!(!inner.proposals.contains_key(&proposal.id));
            assert_eq!(
                inner
                    .recent_proposals
                    .iter()
                    .filter(|metadata| metadata.id == proposal.id)
                    .count(),
                1
            );
        }
    }

    #[test]
    fn proposal_retry_and_active_waiter_survive_terminal_ring_eviction() {
        let tempdir = tempfile::tempdir().expect("tempdir");
        let state = EnvRuntimeState::new(tempdir.path().join("presets.enc.json")).expect("state");
        let first = state
            .propose_profile(
                "actor".to_string(),
                "session".to_string(),
                MutationOperationV1::Create,
                None,
                None,
                Some(proposal_profile_draft()),
            )
            .expect("first proposal");
        let mut first_outcome = match state
            .lookup_or_subscribe_proposal(&first.id, "actor")
            .expect("subscribe first")
        {
            ProposalLookup::Pending { outcome, .. } => outcome,
            ProposalLookup::Terminal(_) => panic!("proposal unexpectedly terminal"),
        };
        state
            .reserve_proposal(&first.id)
            .expect("reserve first proposal");
        state.release_or_expire_proposal(&first.id);
        state
            .reserve_proposal(&first.id)
            .expect("retry first proposal");
        state
            .begin_proposal_commit(&first.id)
            .expect("begin retry mutation");
        state.finish_proposal_terminal(&first.id, AgentProposalStatusV1::Rejected);

        for index in 0..=RECENT_RUN_LIMIT {
            let proposal = state
                .propose_profile(
                    "actor".to_string(),
                    format!("session-{index}"),
                    MutationOperationV1::Create,
                    None,
                    None,
                    Some(proposal_profile_draft()),
                )
                .expect("proposal");
            state
                .reject_proposal(&proposal.id)
                .expect("reject proposal");
        }

        assert_eq!(
            first_outcome
                .borrow_and_update()
                .as_ref()
                .map(|metadata| metadata.status.clone()),
            Some(AgentProposalStatusV1::Rejected)
        );
        assert!(state
            .proposal_metadata_for_actor(&first.id, "actor")
            .is_err());
    }

    #[test]
    fn proposal_expiry_is_rechecked_after_validation_and_before_mutation() {
        let tempdir = tempfile::tempdir().expect("tempdir");
        let state = EnvRuntimeState::new(tempdir.path().join("presets.enc.json")).expect("state");
        let proposal = state
            .propose_profile(
                "actor".to_string(),
                "session".to_string(),
                MutationOperationV1::Create,
                None,
                None,
                Some(proposal_profile_draft()),
            )
            .expect("proposal");
        let mut outcome = match state
            .lookup_or_subscribe_proposal(&proposal.id, "actor")
            .expect("subscribe")
        {
            ProposalLookup::Pending { outcome, .. } => outcome,
            ProposalLookup::Terminal(_) => panic!("proposal unexpectedly terminal"),
        };
        state
            .reserve_proposal(&proposal.id)
            .expect("reserve proposal");
        state
            .inner
            .lock()
            .expect("runtime state")
            .proposals
            .get_mut(&proposal.id)
            .expect("live proposal")
            .metadata
            .expires_at_epoch_ms = 0;

        assert_eq!(
            state
                .begin_proposal_commit(&proposal.id)
                .expect_err("expired reservation cannot mutate")
                .code,
            "PROPOSAL_CLOSED"
        );
        assert_eq!(
            outcome
                .borrow_and_update()
                .as_ref()
                .map(|metadata| metadata.status.clone()),
            Some(AgentProposalStatusV1::Expired)
        );
        let inner = state.inner.lock().expect("runtime state");
        assert!(!inner.proposals.contains_key(&proposal.id));
    }

    #[cfg(unix)]
    #[test]
    fn prepared_preset_executable_drift_is_terminal_stale_without_store_mutation() {
        use std::io::Write as _;

        let tempdir = tempfile::tempdir().expect("tempdir");
        let state = EnvRuntimeState::new(tempdir.path().join("presets.enc.json")).expect("state");
        let executable_a = tempdir.path().join("executable-a");
        let executable_b = tempdir.path().join("executable-b");
        std::fs::copy("/usr/bin/true", &executable_a).expect("copy executable A");
        std::fs::copy("/usr/bin/true", &executable_b).expect("copy executable B");
        std::fs::OpenOptions::new()
            .append(true)
            .open(&executable_b)
            .expect("open executable B")
            .write_all(b"prepared-facts-drift")
            .expect("change executable B hash");
        let executable_link = tempdir.path().join("approved-executable");
        std::os::unix::fs::symlink(&executable_a, &executable_link)
            .expect("initial executable symlink");
        let workspace = tempdir
            .path()
            .canonicalize()
            .expect("canonical workspace")
            .to_string_lossy()
            .into_owned();
        let draft = AgentPresetDraftV1 {
            profile_id: "profile-id".to_string(),
            slug: "facts-drift".to_string(),
            label: "Facts drift".to_string(),
            workspace_root: workspace.clone(),
            cwd: workspace,
            executable: executable_link.to_string_lossy().into_owned(),
            args: Vec::new(),
            passthrough_env: Vec::new(),
        };
        let proposal = state
            .propose_preset(
                "actor".to_string(),
                "session".to_string(),
                MutationOperationV1::Create,
                None,
                None,
                Some(draft),
            )
            .expect("preset proposal");
        let commit = state
            .reserve_proposal(&proposal.id)
            .expect("reserve proposal");
        let before = state.list_presets().expect("presets before drift");

        std::fs::remove_file(&executable_link).expect("remove initial executable symlink");
        std::os::unix::fs::symlink(&executable_b, &executable_link)
            .expect("replace executable symlink");
        let error = state
            .apply_preset_proposal(&commit)
            .expect_err("canonical executable/hash drift must be stale");
        assert_eq!(
            error.code,
            crate::env_runtime::EnvRuntimeErrorCode::REVISION_CONFLICT
        );
        let terminal = state.finish_proposal_terminal(&proposal.id, AgentProposalStatusV1::Stale);
        assert_eq!(terminal.status, AgentProposalStatusV1::Stale);
        assert_eq!(state.list_presets().expect("presets after drift"), before);
        let inner = state.inner.lock().expect("runtime state");
        assert!(!inner.proposals.contains_key(&proposal.id));
        assert_eq!(
            inner
                .recent_proposals
                .iter()
                .filter(|metadata| {
                    metadata.id == proposal.id && metadata.status == AgentProposalStatusV1::Stale
                })
                .count(),
            1
        );
    }

    #[cfg(unix)]
    #[test]
    fn disappearing_prepared_preset_executable_is_terminal_stale_without_store_mutation() {
        let tempdir = tempfile::tempdir().expect("tempdir");
        let state = EnvRuntimeState::new(tempdir.path().join("presets.enc.json")).expect("state");
        let executable = tempdir.path().join("approved-executable");
        std::fs::copy("/usr/bin/true", &executable).expect("copy executable");
        let workspace = tempdir
            .path()
            .canonicalize()
            .expect("canonical workspace")
            .to_string_lossy()
            .into_owned();
        let draft = AgentPresetDraftV1 {
            profile_id: "profile-id".to_string(),
            slug: "facts-disappeared".to_string(),
            label: "Facts disappeared".to_string(),
            workspace_root: workspace.clone(),
            cwd: workspace,
            executable: executable.to_string_lossy().into_owned(),
            args: Vec::new(),
            passthrough_env: Vec::new(),
        };
        let proposal = state
            .propose_preset(
                "actor".to_string(),
                "session".to_string(),
                MutationOperationV1::Create,
                None,
                None,
                Some(draft),
            )
            .expect("preset proposal");
        let commit = state
            .reserve_proposal(&proposal.id)
            .expect("reserve proposal");
        let before = state.list_presets().expect("presets before disappearance");

        std::fs::remove_file(&executable).expect("remove approved executable");
        let error = state
            .apply_preset_proposal(&commit)
            .expect_err("disappearing prepared facts must be stale");
        assert_eq!(
            error.code,
            crate::env_runtime::EnvRuntimeErrorCode::REVISION_CONFLICT
        );
        assert!(!error
            .message
            .contains(executable.to_string_lossy().as_ref()));
        let terminal = state.finish_proposal_terminal(&proposal.id, AgentProposalStatusV1::Stale);
        assert_eq!(terminal.status, AgentProposalStatusV1::Stale);
        assert_eq!(
            state.list_presets().expect("presets after disappearance"),
            before
        );
        let inner = state.inner.lock().expect("runtime state");
        assert!(!inner.proposals.contains_key(&proposal.id));
        assert_eq!(
            inner
                .recent_proposals
                .iter()
                .filter(|metadata| {
                    metadata.id == proposal.id && metadata.status == AgentProposalStatusV1::Stale
                })
                .count(),
            1
        );
    }

    #[test]
    fn desktop_preset_crud_requires_exact_revision() {
        let tempdir = tempfile::tempdir().expect("tempdir");
        let state = EnvRuntimeState::new(tempdir.path().join("presets.enc.json")).expect("state");
        let workspace = tempdir.path().to_string_lossy().to_string();
        let executable = std::env::current_exe()
            .expect("current executable")
            .to_string_lossy()
            .to_string();
        let draft = AgentPresetDraftV1 {
            profile_id: "profile-id".to_string(),
            slug: "local-test".to_string(),
            label: "Local test".to_string(),
            workspace_root: workspace.clone(),
            cwd: workspace,
            executable,
            args: vec!["--exact".to_string()],
            passthrough_env: vec!["PATH".to_string()],
        };

        let created = state
            .save_preset(None, None, draft.clone())
            .expect("create preset");
        assert_eq!(created.revision, 1);
        assert_eq!(state.get_preset("local-test").expect("by slug"), created);

        let conflict = state
            .save_preset(Some(&created.id), Some(0), draft.clone())
            .expect_err("stale update");
        assert_eq!(conflict.code, "REVISION_CONFLICT");

        let updated = state
            .save_preset(Some(&created.id), Some(created.revision), draft)
            .expect("update preset");
        assert_eq!(updated.revision, 2);

        let delete_conflict = state
            .delete_preset(&updated.id, 1)
            .expect_err("stale delete");
        assert_eq!(delete_conflict.code, "REVISION_CONFLICT");
        state
            .delete_preset(&updated.id, updated.revision)
            .expect("delete preset");
        assert!(state.list_presets().expect("list").is_empty());
    }

    #[test]
    fn max_preset_revision_fails_before_store_or_memory_replacement() {
        let tempdir = tempfile::tempdir().expect("tempdir");
        let store_path = tempdir.path().join("presets.enc.json");
        let state = EnvRuntimeState::new(store_path.clone()).expect("state");
        let workspace = tempdir.path().to_string_lossy().to_string();
        let executable = std::env::current_exe()
            .expect("current executable")
            .to_string_lossy()
            .to_string();
        let draft = AgentPresetDraftV1 {
            profile_id: "profile-id".to_string(),
            slug: "revision-limit".to_string(),
            label: "Revision limit".to_string(),
            workspace_root: workspace.clone(),
            cwd: workspace,
            executable,
            args: Vec::new(),
            passthrough_env: Vec::new(),
        };
        let mut preset = state
            .save_preset(None, None, draft.clone())
            .expect("create preset");
        preset.revision = u64::MAX;
        state
            .presets
            .insert(preset.clone())
            .expect("seed max revision");
        let ciphertext_before = std::fs::read(&store_path).expect("read ciphertext before update");

        let error = state
            .save_preset(Some(&preset.id), Some(u64::MAX), draft)
            .expect_err("revision overflow must fail closed");

        assert_eq!(
            error.code,
            crate::env_runtime::EnvRuntimeErrorCode::REVISION_CONFLICT
        );
        assert_eq!(
            state.get_preset(&preset.id).expect("unchanged preset"),
            preset
        );
        assert_eq!(
            std::fs::read(store_path).expect("read ciphertext after update"),
            ciphertext_before
        );
    }

    #[test]
    fn preset_proposals_bind_aliases_to_stable_ids_at_submit() {
        let tempdir = tempfile::tempdir().expect("tempdir");
        let state = EnvRuntimeState::new(tempdir.path().join("presets.enc.json")).expect("state");
        let executable_path = tempdir.path().join("proposal-runner");
        std::fs::write(&executable_path, b"test executable").expect("write executable fixture");
        #[cfg(unix)]
        {
            use std::os::unix::fs::PermissionsExt as _;
            std::fs::set_permissions(&executable_path, std::fs::Permissions::from_mode(0o755))
                .expect("mark executable fixture");
        }
        let workspace = std::fs::canonicalize(tempdir.path())
            .expect("canonical workspace")
            .to_string_lossy()
            .to_string();
        let draft = AgentPresetDraftV1 {
            profile_id: "profile-id".to_string(),
            slug: "stable-preset".to_string(),
            label: "Stable preset".to_string(),
            workspace_root: workspace.clone(),
            cwd: workspace,
            executable: executable_path.to_string_lossy().to_string(),
            args: Vec::new(),
            passthrough_env: Vec::new(),
        };
        let preset = state
            .save_preset(None, None, draft.clone())
            .expect("create preset");

        let proposal = state
            .propose_preset(
                "actor".to_string(),
                "session".to_string(),
                MutationOperationV1::Update,
                Some(preset.slug.clone()),
                Some(preset.revision),
                Some(draft.clone()),
            )
            .expect("submit proposal");
        let stored = state
            .get_proposal_review(&proposal.id)
            .expect("stored proposal");
        assert_eq!(stored.target.as_deref(), Some(preset.id.as_str()));

        let stale = state
            .propose_preset(
                "actor".to_string(),
                "session".to_string(),
                MutationOperationV1::Update,
                Some(preset.slug),
                Some(preset.revision.saturating_add(1)),
                Some(draft),
            )
            .expect_err("stale proposal must fail at submit");
        assert_eq!(stale.code, "REVISION_CONFLICT");
    }

    #[test]
    fn run_preflight_rejects_hash_mismatch_before_creating_approval() {
        let tempdir = tempfile::tempdir().expect("tempdir");
        let state = EnvRuntimeState::new(tempdir.path().join("presets.enc.json")).expect("state");
        let executable_path = tempdir.path().join("preflight-runner");
        std::fs::write(&executable_path, b"test executable").expect("write executable fixture");
        #[cfg(unix)]
        {
            use std::os::unix::fs::PermissionsExt as _;
            std::fs::set_permissions(&executable_path, std::fs::Permissions::from_mode(0o755))
                .expect("mark executable fixture");
        }
        let executable = std::fs::canonicalize(executable_path).expect("canonical executable");
        let workspace = std::fs::canonicalize(tempdir.path())
            .expect("canonical workspace")
            .to_string_lossy()
            .to_string();
        let profile = AgentProfileMetadataV1 {
            id: "profile".to_string(),
            slug: "profile".to_string(),
            label: "Profile".to_string(),
            description: None,
            revision: 1,
            variables: Vec::new(),
        };
        let preset = DevicePreset {
            id: "preset".to_string(),
            profile_id: profile.id.clone(),
            slug: "preset".to_string(),
            label: "Preset".to_string(),
            revision: 1,
            workspace_root: workspace.clone(),
            cwd: workspace,
            executable: executable.to_string_lossy().to_string(),
            executable_sha256: "00".repeat(32),
            args: Vec::new(),
            passthrough_env: Vec::new(),
            created_at_epoch_ms: 1,
            updated_at_epoch_ms: 1,
        };

        let error = match state.request_run(
            "actor".to_string(),
            None,
            "session".to_string(),
            profile,
            preset,
            &HashMap::new(),
            None,
        ) {
            Ok(_) => panic!("hash mismatch must fail before approval"),
            Err(error) => error,
        };
        assert_eq!(error.code, "EXECUTABLE_IDENTITY_MISMATCH");
        assert!(state
            .list_pending_approvals()
            .expect("approvals")
            .is_empty());
    }

    #[test]
    fn run_request_contains_names_but_never_values() {
        let tempdir = tempfile::tempdir().expect("tempdir");
        let state = EnvRuntimeState::new(tempdir.path().join("presets.enc.json")).expect("state");
        let workspace = std::fs::canonicalize(tempdir.path())
            .expect("canonical workspace")
            .to_string_lossy()
            .to_string();
        let executable_path = tempdir.path().join("approved-runner");
        std::fs::write(&executable_path, b"test executable").expect("write executable fixture");
        #[cfg(unix)]
        {
            use std::os::unix::fs::PermissionsExt as _;
            std::fs::set_permissions(&executable_path, std::fs::Permissions::from_mode(0o755))
                .expect("mark executable fixture");
        }
        let executable = std::fs::canonicalize(executable_path).expect("canonical executable");
        let profile = AgentProfileMetadataV1 {
            id: "profile".to_string(),
            slug: "profile".to_string(),
            label: "Profile".to_string(),
            description: None,
            revision: 1,
            variables: vec![AgentVariableMappingV1 {
                name: "TOKEN".to_string(),
                secret_id: Some("secret-id".to_string()),
            }],
        };
        let preset = DevicePreset {
            id: "preset".to_string(),
            profile_id: "profile".to_string(),
            slug: "preset".to_string(),
            label: "Preset".to_string(),
            revision: 1,
            workspace_root: workspace.clone(),
            cwd: workspace,
            executable: executable.to_string_lossy().to_string(),
            executable_sha256: executable_sha256(&executable).expect("executable hash"),
            args: Vec::new(),
            passthrough_env: Vec::new(),
            created_at_epoch_ms: 1,
            updated_at_epoch_ms: 1,
        };
        let ticket = state
            .request_run(
                "actor".to_string(),
                None,
                "session".to_string(),
                profile,
                preset,
                &HashMap::from([("secret-id".to_string(), "Token".to_string())]),
                None,
            )
            .expect("ticket");
        let json = serde_json::to_string(&ticket.snapshot).expect("json");
        assert!(json.contains("TOKEN"));
        assert!(json.contains("Token"));
        assert!(json.contains("secret-id"), "secret metadata is visible");
        assert!(!json.contains("secret_value"));
        assert!(!json.contains("resolved_environment"));
    }

    #[test]
    fn approved_starting_runs_keep_the_global_slot_reserved() {
        let tempdir = tempfile::tempdir().expect("tempdir");
        let state = EnvRuntimeState::new(tempdir.path().join("presets.enc.json")).expect("state");
        let workspace = std::fs::canonicalize(tempdir.path())
            .expect("canonical workspace")
            .to_string_lossy()
            .to_string();
        let executable_path = tempdir.path().join("slot-runner");
        std::fs::write(&executable_path, b"test executable").expect("write executable fixture");
        #[cfg(unix)]
        {
            use std::os::unix::fs::PermissionsExt as _;
            std::fs::set_permissions(&executable_path, std::fs::Permissions::from_mode(0o755))
                .expect("mark executable fixture");
        }
        let executable = std::fs::canonicalize(executable_path).expect("canonical executable");
        let profile = AgentProfileMetadataV1 {
            id: "profile".to_string(),
            slug: "profile".to_string(),
            label: "Profile".to_string(),
            description: None,
            revision: 1,
            variables: vec![AgentVariableMappingV1 {
                name: "TOKEN".to_string(),
                secret_id: None,
            }],
        };
        let preset = DevicePreset {
            id: "preset".to_string(),
            profile_id: profile.id.clone(),
            slug: "preset".to_string(),
            label: "Preset".to_string(),
            revision: 1,
            workspace_root: workspace.clone(),
            cwd: workspace,
            executable: executable.to_string_lossy().to_string(),
            executable_sha256: executable_sha256(&executable).expect("executable hash"),
            args: Vec::new(),
            passthrough_env: Vec::new(),
            created_at_epoch_ms: 1,
            updated_at_epoch_ms: 1,
        };
        let mut tickets = Vec::new();
        for index in 0..MAX_ACTIVE_RUNS {
            let ticket = state
                .request_run(
                    "actor".to_string(),
                    None,
                    format!("session-{index}"),
                    profile.clone(),
                    preset.clone(),
                    &HashMap::new(),
                    None,
                )
                .expect("request run");
            state
                .resolve_run_approval(&ticket.snapshot.run.id, RunApprovalDecision::Approve)
                .expect("approve run");
            tickets.push(ticket);
        }

        let error = match state.request_run(
            "actor".to_string(),
            None,
            "overflow-session".to_string(),
            profile,
            preset,
            &HashMap::new(),
            None,
        ) {
            Ok(_) => panic!("starting reservations must count toward the limit"),
            Err(error) => error,
        };
        assert_eq!(error.code, "RUN_LIMIT_REACHED");
        assert_eq!(state.status(true).expect("status").active_runs, 8);
        drop(tickets);
    }

    #[tokio::test]
    async fn output_backpressure_stops_the_run_without_waiting_for_queue_space() {
        let tempdir = tempfile::tempdir().expect("tempdir");
        let runtime =
            Arc::new(EnvRuntimeState::new(tempdir.path().join("presets.enc.json")).expect("state"));
        let (mut writer, reader) = tokio::io::duplex(64);
        let (events, receiver) = mpsc::channel(6);
        events
            .try_send(AgentEventDataV1::Stdout {
                run_id: "existing".to_string(),
                data_base64: String::new(),
            })
            .expect("prefill queue");
        let (stop, mut stop_rx) = watch::channel(false);
        let backpressure = Arc::new(AtomicBool::new(false));
        writer.write_all(b"output").await.expect("write output");
        drop(writer);

        forward_output(
            Some(reader),
            events,
            "run-1".to_string(),
            false,
            stop,
            Arc::clone(&backpressure),
            Arc::clone(&runtime),
        )
        .await;

        assert!(backpressure.load(Ordering::Acquire));
        stop_rx.changed().await.expect("stop notification");
        assert!(*stop_rx.borrow());
        assert_eq!(
            receiver.len(),
            1,
            "no output was added to a saturated queue"
        );
        assert_eq!(
            runtime.observability.snapshot().output_bytes_total["stdout"],
            6
        );
    }
}
