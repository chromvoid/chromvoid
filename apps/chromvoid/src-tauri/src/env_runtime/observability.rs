#[cfg(test)]
use std::cell::RefCell;
use std::collections::BTreeMap;
use std::sync::atomic::{AtomicU64, Ordering};
use std::sync::Mutex;

use chromvoid_protocol::{
    AgentCommandV1, AgentProposalMetadataV1, AgentProposalStatusV1, AgentRequestV1,
    AgentRunMetadataV1, AgentRunStatusV1, MutationOperationV1, AGENT_PROTOCOL_VERSION,
    AGENT_SCHEMA_VERSION,
};
use sha2::{Digest as _, Sha256};

const FEATURE_KEY: &str = "env-runtime";
const HISTOGRAM_BOUNDS_MS: [u64; 8] = [10, 25, 50, 100, 250, 500, 1_000, u64::MAX];

#[derive(Debug, Clone, Copy, PartialEq, Eq)]
pub(crate) enum RequestDecision {
    Accepted,
    Denied,
    Error,
}

impl RequestDecision {
    fn as_str(self) -> &'static str {
        match self {
            Self::Accepted => "accepted",
            Self::Denied => "denied",
            Self::Error => "error",
        }
    }
}

#[derive(Debug, Clone, Copy, PartialEq, Eq)]
pub(crate) enum ApprovalDecision {
    Approved,
    Rejected,
    Expired,
    Cancelled,
}

impl ApprovalDecision {
    fn as_str(self) -> &'static str {
        match self {
            Self::Approved => "approved",
            Self::Rejected => "rejected",
            Self::Expired => "expired",
            Self::Cancelled => "cancelled",
        }
    }
}

#[derive(Debug, Clone)]
pub(crate) struct GatewayRequestAudit {
    request_id: String,
    actor_id_hash: String,
    protocol_version: u16,
    schema_version: u16,
    operation: &'static str,
    profile_id_hash: String,
    preset_id_hash: String,
    run_id_hash: String,
}

impl GatewayRequestAudit {
    pub(crate) fn new(request: &AgentRequestV1, actor_id: &str) -> Self {
        let (profile_id, preset_id, run_id) = command_identifiers(&request.command);
        Self {
            request_id: safe_request_id(&request.request_id),
            actor_id_hash: hash_identifier(actor_id),
            protocol_version: request.protocol_version,
            schema_version: request.schema_version,
            operation: command_name(&request.command),
            profile_id_hash: hash_optional_identifier(profile_id),
            preset_id_hash: hash_optional_identifier(preset_id),
            run_id_hash: hash_optional_identifier(run_id),
        }
    }

    pub(crate) fn span(&self) -> tracing::Span {
        tracing::info_span!(
            target: "env_runtime",
            "gateway_request",
            request_id = %self.request_id,
            actor_id_hash = %self.actor_id_hash,
            feature_key = FEATURE_KEY,
            protocol_version = self.protocol_version,
            schema_version = self.schema_version,
            operation = self.operation,
            profile_id_hash = %self.profile_id_hash,
            preset_id_hash = %self.preset_id_hash,
            run_id_hash = %self.run_id_hash,
        )
    }
}

#[derive(Debug, Clone, Default, PartialEq, Eq)]
pub(crate) struct DurationHistogramSnapshot {
    pub(crate) bucket_counts: [u64; HISTOGRAM_BOUNDS_MS.len()],
    pub(crate) count: u64,
    pub(crate) sum_ms: u64,
}

#[derive(Debug, Clone, Default, PartialEq, Eq)]
pub(crate) struct EnvRuntimeMetricsSnapshot {
    pub(crate) request_total: BTreeMap<String, u64>,
    pub(crate) proposal_total: BTreeMap<String, u64>,
    pub(crate) approval_total: BTreeMap<String, u64>,
    pub(crate) run_total: BTreeMap<String, u64>,
    pub(crate) active_runs: u64,
    pub(crate) spawn_duration_ms: BTreeMap<String, DurationHistogramSnapshot>,
    pub(crate) output_bytes_total: BTreeMap<String, u64>,
    pub(crate) reauth_denied_total: BTreeMap<String, u64>,
    pub(crate) gateway_denied_total: BTreeMap<String, u64>,
}

#[derive(Debug, Clone, Default)]
struct DurationHistogram {
    bucket_counts: [u64; HISTOGRAM_BOUNDS_MS.len()],
    count: u64,
    sum_ms: u64,
}

impl DurationHistogram {
    fn record(&mut self, duration_ms: u64) {
        self.count = self.count.saturating_add(1);
        self.sum_ms = self.sum_ms.saturating_add(duration_ms);
        if let Some(index) = HISTOGRAM_BOUNDS_MS
            .iter()
            .position(|upper_bound| duration_ms <= *upper_bound)
        {
            self.bucket_counts[index] = self.bucket_counts[index].saturating_add(1);
        }
    }

    fn snapshot(&self) -> DurationHistogramSnapshot {
        DurationHistogramSnapshot {
            bucket_counts: self.bucket_counts,
            count: self.count,
            sum_ms: self.sum_ms,
        }
    }
}

#[derive(Debug, Default)]
struct MetricsInner {
    request_total: BTreeMap<String, u64>,
    proposal_total: BTreeMap<String, u64>,
    approval_total: BTreeMap<String, u64>,
    run_total: BTreeMap<String, u64>,
    spawn_duration_ms: BTreeMap<String, DurationHistogram>,
    reauth_denied_total: BTreeMap<String, u64>,
    gateway_denied_total: BTreeMap<String, u64>,
}

#[derive(Debug, Default)]
pub(crate) struct EnvRuntimeObservability {
    metrics: Mutex<MetricsInner>,
    active_runs: AtomicU64,
    stdout_bytes: AtomicU64,
    stderr_bytes: AtomicU64,
}

impl EnvRuntimeObservability {
    pub(crate) fn record_gateway_request(
        &self,
        request: &GatewayRequestAudit,
        decision: RequestDecision,
        error_code: Option<&str>,
        duration_ms: u64,
    ) {
        let error_code = bounded_error_code(error_code);
        self.with_metrics(|metrics| {
            increment(
                &mut metrics.request_total,
                format!("{}|{}|{}", request.operation, decision.as_str(), error_code),
            );
        });
        emit(AuditEvent {
            request_id: request.request_id.clone(),
            actor_id_hash: request.actor_id_hash.clone(),
            protocol_version: request.protocol_version,
            schema_version: request.schema_version,
            operation: request.operation,
            decision: decision.as_str(),
            error_code,
            profile_id_hash: request.profile_id_hash.clone(),
            preset_id_hash: request.preset_id_hash.clone(),
            run_id_hash: request.run_id_hash.clone(),
            duration_ms,
            variable_count: 0,
        });
    }

    pub(crate) fn record_gateway_denial(&self, actor_id: &str, denial_code: &str) {
        let denial_code = bounded_gateway_denial_code(denial_code);
        self.with_metrics(|metrics| {
            increment(&mut metrics.gateway_denied_total, denial_code.to_string());
        });
        emit(AuditEvent::system(
            hash_identifier(actor_id),
            "gateway_access",
            "denied",
            denial_code,
        ));
    }

    pub(crate) fn record_proposal(&self, proposal: &AgentProposalMetadataV1) {
        let kind = bounded_proposal_kind(&proposal.resource_kind);
        let operation = mutation_operation_name(proposal.operation);
        let status = proposal_status_name(&proposal.status);
        self.with_metrics(|metrics| {
            increment(
                &mut metrics.proposal_total,
                format!("{kind}|{operation}|{status}"),
            );
        });
        emit(AuditEvent {
            request_id: "none".to_string(),
            actor_id_hash: hash_identifier(&proposal.actor_id),
            protocol_version: AGENT_PROTOCOL_VERSION,
            schema_version: AGENT_SCHEMA_VERSION,
            operation,
            decision: status,
            error_code: "NONE",
            profile_id_hash: "none".to_string(),
            preset_id_hash: "none".to_string(),
            run_id_hash: "none".to_string(),
            duration_ms: 0,
            variable_count: 0,
        });
    }

    pub(crate) fn record_approval(&self, run: &AgentRunMetadataV1, decision: ApprovalDecision) {
        self.with_metrics(|metrics| {
            increment(&mut metrics.approval_total, decision.as_str().to_string());
        });
        emit(run_event(run, "run_approval", decision.as_str(), "NONE", 0));
    }

    pub(crate) fn record_spawn(
        &self,
        run: &AgentRunMetadataV1,
        terminal_status: &AgentRunStatusV1,
        error_code: Option<&str>,
        duration_ms: u64,
    ) {
        let terminal_status = run_status_name(terminal_status);
        let error_code = bounded_error_code(error_code);
        self.with_metrics(|metrics| {
            metrics
                .spawn_duration_ms
                .entry(terminal_status.to_string())
                .or_default()
                .record(duration_ms);
        });
        emit(run_event(
            run,
            "spawn",
            terminal_status,
            error_code,
            duration_ms,
        ));
    }

    pub(crate) fn record_run_terminal(
        &self,
        run: &AgentRunMetadataV1,
        error_code: Option<&str>,
        duration_ms: u64,
    ) {
        let terminal_status = run_status_name(&run.status);
        let error_code = bounded_error_code(error_code);
        self.with_metrics(|metrics| {
            increment(&mut metrics.run_total, terminal_status.to_string());
        });
        emit(run_event(
            run,
            "run_terminal",
            terminal_status,
            error_code,
            duration_ms,
        ));
    }

    pub(crate) fn record_resolution(
        &self,
        run: &AgentRunMetadataV1,
        variable_count: usize,
        status: &'static str,
        error_code: Option<&str>,
        duration_ms: u64,
    ) {
        let mut event = run_event(
            run,
            "private_resolution",
            bounded_resolution_status(status),
            bounded_error_code(error_code),
            duration_ms,
        );
        event.variable_count = variable_count.try_into().unwrap_or(u64::MAX);
        emit(event);
    }

    pub(crate) fn set_active_runs(&self, active_runs: usize) {
        self.active_runs.store(
            active_runs.try_into().unwrap_or(u64::MAX),
            Ordering::Release,
        );
    }

    pub(crate) fn record_output_bytes(&self, stderr: bool, bytes: usize) {
        let bytes = bytes.try_into().unwrap_or(u64::MAX);
        let counter = if stderr {
            &self.stderr_bytes
        } else {
            &self.stdout_bytes
        };
        let _ = counter.fetch_update(Ordering::AcqRel, Ordering::Acquire, |current| {
            Some(current.saturating_add(bytes))
        });
    }

    pub(crate) fn record_reauth_denied(&self, denial_code: &str) {
        let denial_code = bounded_reauth_denial_code(denial_code);
        self.with_metrics(|metrics| {
            increment(&mut metrics.reauth_denied_total, denial_code.to_string());
        });
        emit(AuditEvent::system(
            "none".to_string(),
            "secret_reveal_reauth",
            "denied",
            denial_code,
        ));
    }

    pub(crate) fn snapshot(&self) -> EnvRuntimeMetricsSnapshot {
        let metrics = self.metrics.lock().expect("env runtime metrics");
        EnvRuntimeMetricsSnapshot {
            request_total: metrics.request_total.clone(),
            proposal_total: metrics.proposal_total.clone(),
            approval_total: metrics.approval_total.clone(),
            run_total: metrics.run_total.clone(),
            active_runs: self.active_runs.load(Ordering::Acquire),
            spawn_duration_ms: metrics
                .spawn_duration_ms
                .iter()
                .map(|(status, histogram)| (status.clone(), histogram.snapshot()))
                .collect(),
            output_bytes_total: BTreeMap::from([
                (
                    "stdout".to_string(),
                    self.stdout_bytes.load(Ordering::Acquire),
                ),
                (
                    "stderr".to_string(),
                    self.stderr_bytes.load(Ordering::Acquire),
                ),
            ]),
            reauth_denied_total: metrics.reauth_denied_total.clone(),
            gateway_denied_total: metrics.gateway_denied_total.clone(),
        }
    }

    pub(crate) fn emit_metrics_snapshot(&self) {
        let snapshot = self.snapshot();
        tracing::debug!(
            target: "env_runtime_metrics",
            feature_key = FEATURE_KEY,
            request_total = ?snapshot.request_total,
            proposal_total = ?snapshot.proposal_total,
            approval_total = ?snapshot.approval_total,
            run_total = ?snapshot.run_total,
            active_runs = snapshot.active_runs,
            spawn_duration_ms = ?snapshot.spawn_duration_ms,
            output_bytes_total = ?snapshot.output_bytes_total,
            reauth_denied_total = ?snapshot.reauth_denied_total,
            gateway_denied_total = ?snapshot.gateway_denied_total,
            "env runtime metrics snapshot"
        );
    }

    fn with_metrics(&self, update: impl FnOnce(&mut MetricsInner)) {
        if let Ok(mut metrics) = self.metrics.lock() {
            update(&mut metrics);
        }
    }
}

#[cfg_attr(test, derive(Clone, Debug))]
struct AuditEvent {
    request_id: String,
    actor_id_hash: String,
    protocol_version: u16,
    schema_version: u16,
    operation: &'static str,
    decision: &'static str,
    error_code: &'static str,
    profile_id_hash: String,
    preset_id_hash: String,
    run_id_hash: String,
    duration_ms: u64,
    variable_count: u64,
}

impl AuditEvent {
    fn system(
        actor_id_hash: String,
        operation: &'static str,
        decision: &'static str,
        error_code: &'static str,
    ) -> Self {
        Self {
            request_id: "none".to_string(),
            actor_id_hash,
            protocol_version: AGENT_PROTOCOL_VERSION,
            schema_version: AGENT_SCHEMA_VERSION,
            operation,
            decision,
            error_code,
            profile_id_hash: "none".to_string(),
            preset_id_hash: "none".to_string(),
            run_id_hash: "none".to_string(),
            duration_ms: 0,
            variable_count: 0,
        }
    }
}

fn emit(event: AuditEvent) {
    #[cfg(test)]
    TEST_AUDIT_EVENTS.with(|events| events.borrow_mut().push(event.clone()));

    tracing::info!(
        target: "env_runtime",
        request_id = event.request_id,
        actor_id_hash = event.actor_id_hash,
        feature_key = FEATURE_KEY,
        protocol_version = event.protocol_version,
        schema_version = event.schema_version,
        operation = event.operation,
        decision = event.decision,
        error_code = event.error_code,
        profile_id_hash = event.profile_id_hash,
        preset_id_hash = event.preset_id_hash,
        run_id_hash = event.run_id_hash,
        duration_ms = event.duration_ms,
        variable_count = event.variable_count,
        "env runtime audit"
    );
}

#[cfg(test)]
thread_local! {
    static TEST_AUDIT_EVENTS: RefCell<Vec<AuditEvent>> = const { RefCell::new(Vec::new()) };
}

fn run_event(
    run: &AgentRunMetadataV1,
    operation: &'static str,
    decision: &'static str,
    error_code: &'static str,
    duration_ms: u64,
) -> AuditEvent {
    AuditEvent {
        request_id: "none".to_string(),
        actor_id_hash: hash_identifier(&run.actor_id),
        protocol_version: AGENT_PROTOCOL_VERSION,
        schema_version: AGENT_SCHEMA_VERSION,
        operation,
        decision,
        error_code,
        profile_id_hash: hash_identifier(&run.profile_id),
        preset_id_hash: hash_identifier(&run.preset_id),
        run_id_hash: hash_identifier(&run.id),
        duration_ms,
        variable_count: 0,
    }
}

fn increment(map: &mut BTreeMap<String, u64>, key: String) {
    let counter = map.entry(key).or_default();
    *counter = counter.saturating_add(1);
}

fn command_name(command: &AgentCommandV1) -> &'static str {
    match command {
        AgentCommandV1::Hello { .. } => "hello",
        AgentCommandV1::ConnectionStatus => "connection_status",
        AgentCommandV1::EnvStatus => "env_status",
        AgentCommandV1::SecretsList => "secrets_list",
        AgentCommandV1::ProfilesList => "profiles_list",
        AgentCommandV1::ProfileGet { .. } => "profile_get",
        AgentCommandV1::ProfilePropose { .. } => "profile_propose",
        AgentCommandV1::PresetsList { .. } => "presets_list",
        AgentCommandV1::PresetGet { .. } => "preset_get",
        AgentCommandV1::PresetPropose { .. } => "preset_propose",
        AgentCommandV1::ProposalWait { .. } => "proposal_wait",
        AgentCommandV1::Run { .. } => "run",
        AgentCommandV1::RunsList => "runs_list",
        AgentCommandV1::RunStop { .. } => "run_stop",
        AgentCommandV1::RunsStopAll => "runs_stop_all",
    }
}

fn command_identifiers(command: &AgentCommandV1) -> (Option<&str>, Option<&str>, Option<&str>) {
    match command {
        AgentCommandV1::ProfilesList
        | AgentCommandV1::SecretsList
        | AgentCommandV1::ConnectionStatus
        | AgentCommandV1::EnvStatus
        | AgentCommandV1::Hello { .. }
        | AgentCommandV1::ProposalWait { .. }
        | AgentCommandV1::RunsList
        | AgentCommandV1::RunsStopAll => (None, None, None),
        AgentCommandV1::ProfileGet { profile } => (Some(profile), None, None),
        AgentCommandV1::ProfilePropose { target, .. } => (target.as_deref(), None, None),
        AgentCommandV1::PresetsList { profile } => (profile.as_deref(), None, None),
        AgentCommandV1::PresetGet { preset } => (None, Some(preset), None),
        AgentCommandV1::PresetPropose { target, draft, .. } => (
            draft.as_ref().map(|draft| draft.profile_id.as_str()),
            target.as_deref(),
            None,
        ),
        AgentCommandV1::Run {
            profile, preset, ..
        } => (Some(profile), Some(preset), None),
        AgentCommandV1::RunStop { run_id } => (None, None, Some(run_id)),
    }
}

fn mutation_operation_name(operation: MutationOperationV1) -> &'static str {
    match operation {
        MutationOperationV1::Create => "create",
        MutationOperationV1::Update => "update",
        MutationOperationV1::Delete => "delete",
    }
}

fn proposal_status_name(status: &AgentProposalStatusV1) -> &'static str {
    match status {
        AgentProposalStatusV1::Pending => "pending",
        AgentProposalStatusV1::Approved => "approved",
        AgentProposalStatusV1::Rejected => "rejected",
        AgentProposalStatusV1::Expired => "expired",
        AgentProposalStatusV1::Stale => "stale",
    }
}

fn run_status_name(status: &AgentRunStatusV1) -> &'static str {
    match status {
        AgentRunStatusV1::ApprovalPending => "approval_pending",
        AgentRunStatusV1::Starting => "starting",
        AgentRunStatusV1::Running => "running",
        AgentRunStatusV1::Exited => "exited",
        AgentRunStatusV1::Signaled => "signaled",
        AgentRunStatusV1::Cancelled => "cancelled",
        AgentRunStatusV1::SpawnFailed => "spawn_failed",
    }
}

fn bounded_proposal_kind(kind: &str) -> &'static str {
    match kind {
        "profile" => "profile",
        "preset" => "preset",
        _ => "other",
    }
}

fn bounded_resolution_status(status: &str) -> &'static str {
    match status {
        "resolved" => "resolved",
        "error" => "error",
        _ => "other",
    }
}

fn bounded_reauth_denial_code(code: &str) -> &'static str {
    match code {
        "ENV_RUNTIME_REAUTH_FAILED" => "ENV_RUNTIME_REAUTH_FAILED",
        "ENV_RUNTIME_REAUTH_LOCKED" => "ENV_RUNTIME_REAUTH_LOCKED",
        _ => "OTHER",
    }
}

fn bounded_gateway_denial_code(code: &str) -> &'static str {
    match code {
        "AGENT_REVOKED" => "AGENT_REVOKED",
        "GATEWAY_UNAVAILABLE" => "GATEWAY_UNAVAILABLE",
        "NOT_PAIRED" => "NOT_PAIRED",
        _ => "OTHER",
    }
}

fn bounded_error_code(code: Option<&str>) -> &'static str {
    match code.unwrap_or("NONE") {
        "NONE" => "NONE",
        "INVALID_REQUEST" => "INVALID_REQUEST",
        "UNSUPPORTED_VERSION" => "UNSUPPORTED_VERSION",
        "REQUEST_TOO_LARGE" => "REQUEST_TOO_LARGE",
        "RATE_LIMITED" => "RATE_LIMITED",
        "GATEWAY_UNAVAILABLE" => "GATEWAY_UNAVAILABLE",
        "NOT_PAIRED" => "NOT_PAIRED",
        "AGENT_REVOKED" => "AGENT_REVOKED",
        "UNSUPPORTED_PLATFORM" => "UNSUPPORTED_PLATFORM",
        "REMOTE_CORE_UNSUPPORTED" => "REMOTE_CORE_UNSUPPORTED",
        "VAULT_REQUIRED" => "VAULT_REQUIRED",
        "FEATURE_DISABLED_BY_ROLLOUT" => "FEATURE_DISABLED_BY_ROLLOUT",
        "DEVICE_STORE_UNAVAILABLE" => "DEVICE_STORE_UNAVAILABLE",
        "DEVICE_STORE_CORRUPT" => "DEVICE_STORE_CORRUPT",
        "SECRET_NOT_FOUND" => "SECRET_NOT_FOUND",
        "PROFILE_NOT_FOUND" => "PROFILE_NOT_FOUND",
        "PRESET_NOT_FOUND" => "PRESET_NOT_FOUND",
        "PROPOSAL_NOT_FOUND" => "PROPOSAL_NOT_FOUND",
        "RUN_NOT_FOUND" => "RUN_NOT_FOUND",
        "REVISION_CONFLICT" => "REVISION_CONFLICT",
        "SECRET_IN_USE" => "SECRET_IN_USE",
        "PROFILE_IN_USE" => "PROFILE_IN_USE",
        "PROPOSAL_REJECTED" => "PROPOSAL_REJECTED",
        "PROPOSAL_EXPIRED" => "PROPOSAL_EXPIRED",
        "APPROVAL_REJECTED" => "APPROVAL_REJECTED",
        "APPROVAL_EXPIRED" => "APPROVAL_EXPIRED",
        "APPROVAL_CLOSED" => "APPROVAL_CLOSED",
        "PROFILE_PRESET_MISMATCH" => "PROFILE_PRESET_MISMATCH",
        "WORKSPACE_MISMATCH" => "WORKSPACE_MISMATCH",
        "EXECUTABLE_IDENTITY_MISMATCH" => "EXECUTABLE_IDENTITY_MISMATCH",
        "WORKSPACE_UNAVAILABLE" => "WORKSPACE_UNAVAILABLE",
        "CWD_UNAVAILABLE" => "CWD_UNAVAILABLE",
        "EXECUTABLE_UNAVAILABLE" => "EXECUTABLE_UNAVAILABLE",
        "RUN_LIMIT_REACHED" => "RUN_LIMIT_REACHED",
        "RUN_ALREADY_TERMINAL" => "RUN_ALREADY_TERMINAL",
        "CANCELLED" => "CANCELLED",
        "SESSION_DISCONNECTED" => "SESSION_DISCONNECTED",
        "LOCAL_CORE_REQUIRED" => "REMOTE_CORE_UNSUPPORTED",
        "SECRET_RESOLUTION_FAILED" => "SECRET_RESOLUTION_FAILED",
        "SPAWN_FAILED" => "SPAWN_FAILED",
        "OUTPUT_BACKPRESSURE" => "OUTPUT_BACKPRESSURE",
        "INTERNAL" | "INTERNAL_ERROR" => "INTERNAL",
        _ => "OTHER",
    }
}

fn safe_request_id(request_id: &str) -> String {
    if !request_id.is_empty()
        && request_id.len() <= 128
        && request_id
            .bytes()
            .all(|byte| byte.is_ascii_alphanumeric() || matches!(byte, b'.' | b'_' | b':' | b'-'))
    {
        request_id.to_string()
    } else {
        "invalid".to_string()
    }
}

fn hash_optional_identifier(value: Option<&str>) -> String {
    value
        .map(hash_identifier)
        .unwrap_or_else(|| "none".to_string())
}

pub(crate) fn hash_identifier(value: &str) -> String {
    let digest = Sha256::digest(value.as_bytes());
    format!("sha256:{}", hex::encode(&digest[..16]))
}

#[cfg(test)]
mod tests {
    use chromvoid_protocol::{AgentPresetDraftV1, MutationOperationV1};

    use super::*;

    fn capture_audit_events(run: impl FnOnce()) -> Vec<AuditEvent> {
        TEST_AUDIT_EVENTS.with(|events| events.borrow_mut().clear());
        run();
        TEST_AUDIT_EVENTS.with(|events| std::mem::take(&mut *events.borrow_mut()))
    }

    #[test]
    fn gateway_audit_redacts_sensitive_request_material() {
        let request = AgentRequestV1 {
            protocol_version: AGENT_PROTOCOL_VERSION,
            schema_version: AGENT_SCHEMA_VERSION,
            request_id: "req-safe".to_string(),
            timestamp_secs: 1,
            command: AgentCommandV1::PresetPropose {
                operation: MutationOperationV1::Create,
                target: None,
                base_revision: None,
                draft: Some(AgentPresetDraftV1 {
                    profile_id: "profile-secret-ref".to_string(),
                    slug: "slug".to_string(),
                    label: "label-must-not-log".to_string(),
                    workspace_root: "/workspace-must-not-log".to_string(),
                    cwd: "/cwd-must-not-log".to_string(),
                    executable: "/executable-must-not-log".to_string(),
                    args: vec!["arg-must-not-log".to_string()],
                    passthrough_env: vec!["PASSTHROUGH_MUST_NOT_LOG".to_string()],
                }),
            },
        };
        let events = capture_audit_events(|| {
            EnvRuntimeObservability::default().record_gateway_request(
                &GatewayRequestAudit::new(&request, "actor-must-not-log"),
                RequestDecision::Accepted,
                None,
                7,
            );
        });
        assert_eq!(events.len(), 1);
        let event = &events[0];
        let audit = format!("{event:?}");

        assert_eq!(FEATURE_KEY, "env-runtime");
        assert_eq!(event.operation, "preset_propose");
        assert!(event.actor_id_hash.starts_with("sha256:"));
        for forbidden in [
            "actor-must-not-log",
            "profile-secret-ref",
            "label-must-not-log",
            "/workspace-must-not-log",
            "/cwd-must-not-log",
            "/executable-must-not-log",
            "arg-must-not-log",
            "PASSTHROUGH_MUST_NOT_LOG",
            "master_password",
            "stdout",
            "stderr",
        ] {
            assert!(!audit.contains(forbidden), "leaked {forbidden}: {audit}");
        }
    }

    #[test]
    fn lifecycle_failure_audits_keep_typed_codes_and_hashed_identifiers() {
        let run = AgentRunMetadataV1 {
            id: "run-must-not-log".to_string(),
            actor_id: "actor-must-not-log".to_string(),
            profile_id: "profile-must-not-log".to_string(),
            preset_id: "preset-must-not-log".to_string(),
            status: AgentRunStatusV1::SpawnFailed,
            process_id: None,
            started_at_epoch_ms: None,
            finished_at_epoch_ms: Some(1),
            exit_code: None,
            signal: None,
        };
        let events = capture_audit_events(|| {
            let observability = EnvRuntimeObservability::default();
            observability.record_resolution(&run, 0, "error", Some("SECRET_RESOLUTION_FAILED"), 3);
            observability.record_spawn(
                &run,
                &AgentRunStatusV1::SpawnFailed,
                Some("SPAWN_FAILED"),
                4,
            );
            observability.record_run_terminal(&run, Some("OUTPUT_BACKPRESSURE"), 5);
        });
        assert_eq!(events.len(), 3);
        let audit = format!("{events:?}");

        for code in [
            "SECRET_RESOLUTION_FAILED",
            "SPAWN_FAILED",
            "OUTPUT_BACKPRESSURE",
        ] {
            assert!(events.iter().any(|event| event.error_code == code));
        }
        assert!(events
            .iter()
            .all(|event| event.run_id_hash.starts_with("sha256:")));
        for forbidden in [
            "run-must-not-log",
            "actor-must-not-log",
            "profile-must-not-log",
            "preset-must-not-log",
        ] {
            assert!(!audit.contains(forbidden), "leaked {forbidden}: {audit}");
        }
    }

    #[test]
    fn metrics_use_bounded_labels_and_byte_counters() {
        let observability = EnvRuntimeObservability::default();
        let request = AgentRequestV1 {
            protocol_version: AGENT_PROTOCOL_VERSION,
            schema_version: AGENT_SCHEMA_VERSION,
            request_id: "req-1".to_string(),
            timestamp_secs: 1,
            command: AgentCommandV1::EnvStatus,
        };
        observability.record_gateway_request(
            &GatewayRequestAudit::new(&request, "actor"),
            RequestDecision::Error,
            Some("attacker-controlled-error-label"),
            2,
        );
        observability.record_gateway_denial("actor", "attacker-controlled-denial");
        observability.record_reauth_denied("ENV_RUNTIME_REAUTH_FAILED");
        observability.record_output_bytes(false, 7);
        observability.record_output_bytes(true, 11);
        observability.set_active_runs(3);

        let snapshot = observability.snapshot();
        assert_eq!(snapshot.request_total["env_status|error|OTHER"], 1);
        assert_eq!(snapshot.gateway_denied_total["OTHER"], 1);
        assert_eq!(snapshot.reauth_denied_total["ENV_RUNTIME_REAUTH_FAILED"], 1);
        assert_eq!(snapshot.output_bytes_total["stdout"], 7);
        assert_eq!(snapshot.output_bytes_total["stderr"], 11);
        assert_eq!(snapshot.active_runs, 3);
        let debug = format!("{snapshot:?}");
        assert!(!debug.contains("attacker-controlled"));
    }

    #[test]
    fn lifecycle_metrics_cover_proposal_approval_spawn_and_terminal_run() {
        let observability = EnvRuntimeObservability::default();
        let proposal = AgentProposalMetadataV1 {
            id: "proposal-must-not-be-a-label".to_string(),
            actor_id: "actor-must-not-be-a-label".to_string(),
            resource_kind: "profile".to_string(),
            operation: MutationOperationV1::Create,
            status: AgentProposalStatusV1::Pending,
            created_at_epoch_ms: 1,
            expires_at_epoch_ms: 2,
        };
        let mut run = AgentRunMetadataV1 {
            id: "run-must-not-be-a-label".to_string(),
            actor_id: "actor-must-not-be-a-label".to_string(),
            profile_id: "profile-must-not-be-a-label".to_string(),
            preset_id: "preset-must-not-be-a-label".to_string(),
            status: AgentRunStatusV1::ApprovalPending,
            process_id: None,
            started_at_epoch_ms: None,
            finished_at_epoch_ms: None,
            exit_code: None,
            signal: None,
        };

        observability.record_proposal(&proposal);
        observability.record_approval(&run, ApprovalDecision::Approved);
        observability.record_spawn(&run, &AgentRunStatusV1::Running, None, 33);
        run.status = AgentRunStatusV1::Exited;
        observability.record_run_terminal(&run, None, 91);

        let snapshot = observability.snapshot();
        assert_eq!(snapshot.proposal_total["profile|create|pending"], 1);
        assert_eq!(snapshot.approval_total["approved"], 1);
        assert_eq!(snapshot.run_total["exited"], 1);
        assert_eq!(snapshot.spawn_duration_ms["running"].count, 1);
        assert_eq!(snapshot.spawn_duration_ms["running"].sum_ms, 33);
        for key in snapshot
            .proposal_total
            .keys()
            .chain(snapshot.approval_total.keys())
            .chain(snapshot.run_total.keys())
            .chain(snapshot.spawn_duration_ms.keys())
        {
            assert!(!key.contains("must-not-be-a-label"));
        }
    }
}
