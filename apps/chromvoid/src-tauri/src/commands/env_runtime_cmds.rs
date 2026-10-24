use chromvoid_core::rpc::types::{RpcRequest, RpcResponse};
use chromvoid_protocol::{
    AgentPresetDraftV1, AgentProfileDraftV1, AgentProposalMetadataV1, MutationOperationV1,
};
use serde::Serialize;

use crate::app_state::AppState;
use crate::env_runtime::{
    apply_profile_bindings, DevicePreset, EnvRuntimeError, EnvRuntimeStatus, ProfileSecretBinding,
    ProposalCommit, ProposalDraft, ProposalReview, RunApprovalDecision, RunApprovalSnapshot,
};
#[cfg(target_os = "macos")]
use crate::product_cli_install::install_product_cli_link;
use crate::product_cli_install::{
    product_cli_install_status_for_paths, product_cli_is_bundled, ProductCliInstallStatus,
    ProductCliPaths,
};
use crate::types::{rpc_err, rpc_ok, RpcResult, TauriRpcResult};

#[derive(Debug, Serialize)]
pub(crate) struct EnvRuntimeDesktopSnapshot {
    status: EnvRuntimeStatus,
    presets: Vec<DevicePreset>,
    proposals: Vec<ProposalReview>,
    approvals: Vec<RunApprovalSnapshot>,
    runs: Vec<chromvoid_protocol::AgentRunMetadataV1>,
}

#[tauri::command]
pub(crate) fn env_runtime_desktop_snapshot(
    state: tauri::State<'_, AppState>,
) -> RpcResult<EnvRuntimeDesktopSnapshot> {
    let vault_unlocked = state
        .adapter
        .lock()
        .map(|adapter| adapter.is_unlocked())
        .unwrap_or(false);
    let snapshot = (|| {
        let status = state.env_runtime.status(vault_unlocked)?;
        let presets = if status.device_store_available {
            state.env_runtime.list_presets()?
        } else {
            Vec::new()
        };
        Ok(EnvRuntimeDesktopSnapshot {
            status,
            presets,
            proposals: state.env_runtime.list_proposal_reviews()?,
            approvals: state.env_runtime.list_pending_approvals()?,
            runs: state.env_runtime.list_runs()?,
        })
    })();
    match snapshot {
        Ok(snapshot) => rpc_ok(snapshot),
        Err(error) => env_error(error),
    }
}

#[tauri::command]
pub(crate) async fn env_runtime_run_approval_resolve(
    state: tauri::State<'_, AppState>,
    run_id: String,
    approve: bool,
) -> TauriRpcResult<bool> {
    if !approve {
        return Ok(
            match state
                .env_runtime
                .resolve_run_approval(&run_id, RunApprovalDecision::Reject)
            {
                Ok(()) => rpc_ok(true),
                Err(error) => env_error(error),
            },
        );
    }

    let actor_id = match state
        .env_runtime
        .list_pending_approvals()
        .and_then(|approvals| {
            approvals
                .into_iter()
                .find(|approval| approval.run.id == run_id)
                .map(|approval| approval.run.actor_id)
                .ok_or_else(|| {
                    EnvRuntimeError::new(
                        crate::env_runtime::EnvRuntimeErrorCode::APPROVAL_CLOSED,
                        "Run approval is no longer pending",
                    )
                })
        }) {
        Ok(actor_id) => actor_id,
        Err(error) => return Ok(env_error(error)),
    };
    let task_run_id = run_id.clone();
    Ok(
        match run_env_runtime_commit(
            &state,
            Some(actor_id),
            "Approve Env Runtime run",
            move |runtime, _adapter| {
                runtime.resolve_run_approval(&task_run_id, RunApprovalDecision::Approve)?;
                Ok(true)
            },
        )
        .await
        {
            Ok(approved) => rpc_ok(approved),
            Err(error) => env_error(error),
        },
    )
}

#[tauri::command]
pub(crate) async fn env_runtime_run_stop(
    state: tauri::State<'_, AppState>,
    run_id: String,
) -> TauriRpcResult<bool> {
    Ok(match state.env_runtime.stop_run(&run_id).await {
        Ok(()) => rpc_ok(true),
        Err(error) => env_error(error),
    })
}

#[tauri::command]
pub(crate) async fn env_runtime_proposal_resolve(
    state: tauri::State<'_, AppState>,
    proposal_id: String,
    approve: bool,
    profile_bindings: Option<Vec<ProfileSecretBinding>>,
) -> TauriRpcResult<AgentProposalMetadataV1> {
    if approve {
        if let Some(error) = env_runtime_mutation_guard(&state) {
            return Ok(error);
        }
    }
    let proposal = match state.env_runtime.get_proposal_review(&proposal_id) {
        Ok(proposal) => proposal,
        Err(error) => return Ok(env_error(error)),
    };
    let profile_bindings = profile_bindings.unwrap_or_default();
    if let Err(error) = validate_proposal_binding_scope(
        &proposal.metadata.resource_kind,
        approve,
        &profile_bindings,
    ) {
        return Ok(env_error(error));
    }
    if !approve {
        return Ok(match state.env_runtime.reject_proposal(&proposal_id) {
            Ok(metadata) => rpc_ok(metadata),
            Err(error) => env_error(error),
        });
    }

    let actor_id = proposal.metadata.actor_id.clone();
    let task_proposal_id = proposal_id.clone();
    let result = run_env_runtime_commit(
        &state,
        Some(actor_id),
        "Approve Env Runtime proposal",
        move |runtime, adapter| {
            let proposal = runtime.reserve_proposal(&task_proposal_id)?;
            let apply_result = if proposal.metadata.resource_kind == "preset" {
                validate_preset_proposal_profile_with_adapter(adapter, &proposal)
                    .and_then(|()| runtime.apply_preset_proposal(&proposal).map(|_| ()))
            } else if proposal.metadata.resource_kind == "profile" {
                apply_profile_proposal_with_adapter(adapter, runtime, &proposal, profile_bindings)
            } else {
                Err(EnvRuntimeError::new(
                    crate::env_runtime::EnvRuntimeErrorCode::INVALID_PROPOSAL,
                    "Unknown proposal resource kind",
                ))
            };
            if let Err(error) = apply_result {
                if proposal_error_is_stale(&error) {
                    runtime.finish_proposal_terminal(
                        &task_proposal_id,
                        chromvoid_protocol::AgentProposalStatusV1::Stale,
                    );
                } else {
                    runtime.release_or_expire_proposal(&task_proposal_id);
                }
                return Err(error);
            }
            Ok(runtime.finish_proposal_terminal(
                &task_proposal_id,
                chromvoid_protocol::AgentProposalStatusV1::Approved,
            ))
        },
    )
    .await;
    Ok(match result {
        Ok(proposal) => rpc_ok(proposal),
        Err(error) => env_error(error),
    })
}

fn validate_proposal_binding_scope(
    resource_kind: &str,
    approve: bool,
    bindings: &[ProfileSecretBinding],
) -> Result<(), EnvRuntimeError> {
    if !bindings.is_empty() && (!approve || resource_kind != "profile") {
        return Err(EnvRuntimeError::new(
            crate::env_runtime::EnvRuntimeErrorCode::INVALID_REQUEST,
            "Secret bindings are accepted only when approving a profile proposal",
        ));
    }
    Ok(())
}

#[tauri::command]
pub(crate) async fn env_runtime_preset_save(
    state: tauri::State<'_, AppState>,
    id: Option<String>,
    base_revision: Option<u64>,
    draft: AgentPresetDraftV1,
) -> TauriRpcResult<DevicePreset> {
    if let Some(error) = env_runtime_mutation_guard(&state) {
        return Ok(error);
    }
    if let Some(error) = env_runtime_unlocked_guard(&state) {
        return Ok(error);
    }
    let result = run_env_runtime_commit(
        &state,
        None,
        "Save Env Runtime preset",
        move |runtime, adapter| {
            let profile = profile_get_with_adapter(adapter, &draft.profile_id)?;
            if profile.id != draft.profile_id {
                return Err(EnvRuntimeError::new(
                    crate::env_runtime::EnvRuntimeErrorCode::INVALID_PRESET,
                    "Preset profile_id must be the stable profile id, not a slug",
                ));
            }
            runtime.save_preset(id.as_deref(), base_revision, draft)
        },
    )
    .await;
    Ok(match result {
        Ok(preset) => rpc_ok(preset),
        Err(error) => env_error(error),
    })
}

#[tauri::command]
pub(crate) async fn env_runtime_preset_delete(
    state: tauri::State<'_, AppState>,
    id: String,
    base_revision: u64,
) -> TauriRpcResult<bool> {
    if let Some(error) = env_runtime_mutation_guard(&state) {
        return Ok(error);
    }
    if let Some(error) = env_runtime_unlocked_guard(&state) {
        return Ok(error);
    }
    let result = run_env_runtime_commit(
        &state,
        None,
        "Delete Env Runtime preset",
        move |runtime, _| runtime.delete_preset(&id, base_revision).map(|_| true),
    )
    .await;
    Ok(match result {
        Ok(deleted) => rpc_ok(deleted),
        Err(error) => env_error(error),
    })
}

#[tauri::command]
pub(crate) async fn env_runtime_profile_delete(
    state: tauri::State<'_, AppState>,
    id: String,
    base_revision: u64,
) -> TauriRpcResult<bool> {
    if let Some(error) = env_runtime_mutation_guard(&state) {
        return Ok(error);
    }
    if let Some(error) = env_runtime_unlocked_guard(&state) {
        return Ok(error);
    }
    let result = run_env_runtime_commit(
        &state,
        None,
        "Delete Env Runtime profile",
        move |runtime, adapter| {
            guard_profile_delete_references_with_adapter(adapter, runtime, &id)?;
            run_core_env_runtime_rpc_with_adapter(
                adapter,
                "env_runtime:profile:delete",
                serde_json::json!({
                    "target": id,
                    "base_revision": base_revision,
                }),
            )
            .map(|_| true)
        },
    )
    .await;
    Ok(match result {
        Ok(deleted) => rpc_ok(deleted),
        Err(error) => env_error(error),
    })
}

async fn run_env_runtime_commit<T, F>(
    state: &tauri::State<'_, AppState>,
    actor_id: Option<String>,
    task_label: &'static str,
    task: F,
) -> Result<T, EnvRuntimeError>
where
    T: Send + 'static,
    F: FnOnce(
            &crate::env_runtime::EnvRuntimeState,
            &mut dyn crate::core_adapter::CoreAdapter,
        ) -> Result<T, EnvRuntimeError>
        + Send
        + 'static,
{
    let runtime = state.env_runtime.clone();
    let adapter = state.adapter.clone();
    let gateway = state.gateway.clone();
    state
        .catalog_blocking_io_runtime
        .spawn_blocking(move || {
            let _commit_guard = runtime.commit_guard()?;
            let _gateway_guard = if let Some(actor_id) = actor_id.as_deref() {
                let gateway = gateway.lock().map_err(|_| {
                    EnvRuntimeError::new(
                        crate::env_runtime::EnvRuntimeErrorCode::INTERNAL,
                        "Gateway mutex poisoned",
                    )
                })?;
                if !gateway.config.enabled || !gateway.is_agent_paired_and_active(actor_id) {
                    return Err(EnvRuntimeError::new(
                        crate::env_runtime::EnvRuntimeErrorCode::AGENT_REVOKED,
                        "CLI agent identity is no longer active",
                    ));
                }
                Some(gateway)
            } else {
                None
            };
            let mut adapter = adapter.lock().map_err(|_| {
                EnvRuntimeError::new(
                    crate::env_runtime::EnvRuntimeErrorCode::INTERNAL,
                    "Adapter mutex poisoned",
                )
            })?;
            guard_env_runtime_adapter(adapter.as_mut())?;
            task(runtime.as_ref(), adapter.as_mut())
        })
        .await
        .map_err(|error| {
            let (message, _code) = error.into_rpc_error(task_label);
            EnvRuntimeError::new(crate::env_runtime::EnvRuntimeErrorCode::INTERNAL, message)
        })?
}

fn guard_env_runtime_adapter(
    adapter: &mut dyn crate::core_adapter::CoreAdapter,
) -> Result<(), EnvRuntimeError> {
    if adapter.mode() != crate::core_adapter::CoreMode::Local {
        return Err(EnvRuntimeError::new(
            crate::env_runtime::EnvRuntimeErrorCode::REMOTE_CORE_UNSUPPORTED,
            "Env Runtime requires the local desktop vault",
        ));
    }
    if !adapter.is_unlocked() {
        return Err(EnvRuntimeError::new(
            crate::env_runtime::EnvRuntimeErrorCode::VAULT_REQUIRED,
            "Unlock the local vault before changing Env Runtime data",
        ));
    }
    let capabilities = crate::types::runtime_capabilities_for_current_target();
    crate::module_access::guard_module_for_adapter(
        adapter,
        crate::module_access::MODULE_ENV_RUNTIME,
        &capabilities,
    )
    .map_err(env_runtime_module_denial)
}

fn env_runtime_module_denial(error: RpcResult<serde_json::Value>) -> EnvRuntimeError {
    match error {
        RpcResult::Error { error, code, .. } => EnvRuntimeError::new(
            crate::env_runtime::EnvRuntimeErrorCode::from_feature(code.as_deref()),
            error,
        ),
        RpcResult::Success { .. } => EnvRuntimeError::new(
            crate::env_runtime::EnvRuntimeErrorCode::INTERNAL,
            "Env Runtime access guard returned an invalid response",
        ),
    }
}

fn run_core_env_runtime_rpc_with_adapter(
    adapter: &mut dyn crate::core_adapter::CoreAdapter,
    command: &'static str,
    data: serde_json::Value,
) -> Result<serde_json::Value, EnvRuntimeError> {
    match adapter.handle(&RpcRequest::new(command, data)) {
        RpcResponse::Success { result, .. } => Ok(result),
        RpcResponse::Error { error, code, .. } => Err(EnvRuntimeError::new(
            code.as_deref()
                .map(crate::env_runtime::EnvRuntimeErrorCode::from_core)
                .unwrap_or(crate::env_runtime::EnvRuntimeErrorCode::CORE_ERROR),
            error,
        )),
    }
}

fn profile_get_with_adapter(
    adapter: &mut dyn crate::core_adapter::CoreAdapter,
    profile: &str,
) -> Result<chromvoid_core::env_runtime::AgentProfileMetadataV1, EnvRuntimeError> {
    let value = run_core_env_runtime_rpc_with_adapter(
        adapter,
        "env_runtime:profile:get",
        serde_json::json!({"profile": profile}),
    )?;
    serde_json::from_value(value).map_err(|_| {
        EnvRuntimeError::new(
            crate::env_runtime::EnvRuntimeErrorCode::CORE_RESPONSE_INVALID,
            "Core returned invalid Env Runtime profile metadata",
        )
    })
}

fn validate_preset_proposal_profile_with_adapter(
    adapter: &mut dyn crate::core_adapter::CoreAdapter,
    proposal: &ProposalCommit,
) -> Result<(), EnvRuntimeError> {
    let Some(ProposalDraft::Preset(draft)) = proposal.draft.as_ref() else {
        return Ok(());
    };
    let profile = profile_get_with_adapter(adapter, &draft.profile_id)?;
    if profile.id != draft.profile_id {
        return Err(EnvRuntimeError::new(
            crate::env_runtime::EnvRuntimeErrorCode::INVALID_PRESET,
            "Preset profile_id must be the stable profile id, not a slug",
        ));
    }
    if proposal
        .prepared_preset
        .as_ref()
        .is_none_or(|facts| facts.profile_id != profile.id)
    {
        return Err(EnvRuntimeError::new(
            crate::env_runtime::EnvRuntimeErrorCode::REVISION_CONFLICT,
            "Preset profile facts changed before approval",
        ));
    }
    Ok(())
}

fn guard_profile_delete_references_with_adapter(
    adapter: &mut dyn crate::core_adapter::CoreAdapter,
    runtime: &crate::env_runtime::EnvRuntimeState,
    profile: &str,
) -> Result<(), EnvRuntimeError> {
    let profile = profile_get_with_adapter(adapter, profile)?;
    if runtime
        .list_presets()?
        .iter()
        .any(|preset| preset.profile_id == profile.id)
    {
        return Err(EnvRuntimeError::new(
            crate::env_runtime::EnvRuntimeErrorCode::PROFILE_IN_USE,
            "Delete device presets that use this profile first",
        ));
    }
    Ok(())
}

fn apply_profile_proposal_with_adapter(
    adapter: &mut dyn crate::core_adapter::CoreAdapter,
    runtime: &crate::env_runtime::EnvRuntimeState,
    proposal: &ProposalCommit,
    profile_bindings: Vec<ProfileSecretBinding>,
) -> Result<(), EnvRuntimeError> {
    if proposal.metadata.operation == MutationOperationV1::Delete {
        if !profile_bindings.is_empty() {
            return Err(EnvRuntimeError::new(
                crate::env_runtime::EnvRuntimeErrorCode::INVALID_REQUEST,
                "Delete proposals do not accept secret bindings",
            ));
        }
        let target = proposal.target.as_deref().ok_or_else(|| {
            EnvRuntimeError::new(
                crate::env_runtime::EnvRuntimeErrorCode::INVALID_PROPOSAL,
                "Missing profile target",
            )
        })?;
        let current = profile_get_with_adapter(adapter, target)?;
        if proposal.base_revision != Some(current.revision) {
            return Err(EnvRuntimeError::new(
                crate::env_runtime::EnvRuntimeErrorCode::REVISION_CONFLICT,
                "Profile changed since the proposal was created",
            ));
        }
        guard_profile_delete_references_with_adapter(adapter, runtime, target)?;
    }
    let (command, data) = match proposal.metadata.operation {
        MutationOperationV1::Create => {
            let draft = match proposal.draft.clone() {
                Some(ProposalDraft::Profile(draft)) => Some(draft),
                _ => None,
            }
            .ok_or_else(|| {
                EnvRuntimeError::new(
                    crate::env_runtime::EnvRuntimeErrorCode::INVALID_PROPOSAL,
                    "Missing profile draft",
                )
            })?;
            let draft = bind_and_validate_profile_secrets(adapter, &draft, &profile_bindings)?;
            (
                "env_runtime:profile:create",
                serde_json::json!({
                    "slug": draft.slug,
                    "label": draft.label,
                    "description": draft.description,
                    "variables": bound_variables(draft)?,
                }),
            )
        }
        MutationOperationV1::Update => {
            let draft = match proposal.draft.clone() {
                Some(ProposalDraft::Profile(draft)) => Some(draft),
                _ => None,
            }
            .ok_or_else(|| {
                EnvRuntimeError::new(
                    crate::env_runtime::EnvRuntimeErrorCode::INVALID_PROPOSAL,
                    "Missing profile draft",
                )
            })?;
            let current = profile_get_with_adapter(
                adapter,
                proposal.target.as_deref().ok_or_else(|| {
                    EnvRuntimeError::new(
                        crate::env_runtime::EnvRuntimeErrorCode::INVALID_PROPOSAL,
                        "Missing profile target",
                    )
                })?,
            )?;
            if proposal.base_revision != Some(current.revision) {
                return Err(EnvRuntimeError::new(
                    crate::env_runtime::EnvRuntimeErrorCode::REVISION_CONFLICT,
                    "Profile changed since the proposal was created",
                ));
            }
            let draft = bind_and_validate_profile_secrets(adapter, &draft, &profile_bindings)?;
            (
                "env_runtime:profile:update",
                serde_json::json!({
                    "target": proposal.target,
                    "base_revision": proposal.base_revision,
                    "draft": {
                        "slug": draft.slug,
                        "label": draft.label,
                        "description": draft.description,
                        "variables": bound_variables(draft)?,
                    },
                }),
            )
        }
        MutationOperationV1::Delete => (
            "env_runtime:profile:delete",
            serde_json::json!({
                "target": proposal.target,
                "base_revision": proposal.base_revision,
            }),
        ),
    };
    runtime.begin_proposal_commit(&proposal.metadata.id)?;
    run_core_env_runtime_rpc_with_adapter(adapter, command, data).map(|_| ())
}

fn bind_and_validate_profile_secrets(
    adapter: &mut dyn crate::core_adapter::CoreAdapter,
    draft: &AgentProfileDraftV1,
    bindings: &[ProfileSecretBinding],
) -> Result<AgentProfileDraftV1, EnvRuntimeError> {
    let bound = apply_profile_bindings(draft, bindings)?;
    let value = run_core_env_runtime_rpc_with_adapter(
        adapter,
        "env_runtime:secret:list",
        serde_json::json!({}),
    )?;
    let secrets =
        serde_json::from_value::<Vec<chromvoid_core::env_runtime::AgentSecretMetadataV1>>(value)
            .map_err(|_| {
                EnvRuntimeError::new(
                    crate::env_runtime::EnvRuntimeErrorCode::CORE_RESPONSE_INVALID,
                    "Core returned invalid Env Runtime secret metadata",
                )
            })?;
    let known = secrets
        .into_iter()
        .map(|secret| secret.id)
        .collect::<std::collections::HashSet<_>>();
    validate_profile_secret_references(draft, bindings, &known)?;
    Ok(bound)
}

fn validate_profile_secret_references(
    draft: &AgentProfileDraftV1,
    bindings: &[ProfileSecretBinding],
    known: &std::collections::HashSet<String>,
) -> Result<(), EnvRuntimeError> {
    if draft.variables.iter().any(|variable| {
        variable
            .secret_id
            .as_ref()
            .is_some_and(|secret_id| !known.contains(secret_id))
    }) {
        return Err(EnvRuntimeError::new(
            crate::env_runtime::EnvRuntimeErrorCode::NOT_FOUND,
            "A referenced Env Runtime secret no longer exists",
        ));
    }
    if bindings
        .iter()
        .any(|binding| !known.contains(&binding.secret_id))
    {
        return Err(EnvRuntimeError::new(
            crate::env_runtime::EnvRuntimeErrorCode::SECRET_BINDING_REQUIRED,
            "Choose an existing Env Runtime secret for every unbound variable",
        ));
    }
    Ok(())
}

fn proposal_error_is_stale(error: &EnvRuntimeError) -> bool {
    matches!(
        error.code.as_str(),
        "REVISION_CONFLICT" | "NOT_FOUND" | "PROFILE_IN_USE"
    )
}

fn bound_variables(draft: AgentProfileDraftV1) -> Result<Vec<serde_json::Value>, EnvRuntimeError> {
    draft
        .variables
        .into_iter()
        .map(|variable| {
            let secret_id = variable.secret_id.ok_or_else(|| {
                EnvRuntimeError::new(
                    crate::env_runtime::EnvRuntimeErrorCode::SECRET_BINDING_REQUIRED,
                    format!("Choose a secret for {}", variable.name),
                )
            })?;
            Ok(serde_json::json!({
                "name": variable.name,
                "secret_id": secret_id,
            }))
        })
        .collect()
}

#[tauri::command]
pub(crate) fn env_runtime_cli_install_status(
    _app: tauri::AppHandle,
) -> RpcResult<ProductCliInstallStatus> {
    match ProductCliPaths::for_current_process() {
        Ok(paths) => rpc_ok(product_cli_install_status_for_paths(&paths)),
        Err(error) => rpc_err(error, Some("CLI_UNAVAILABLE".to_string())),
    }
}

#[tauri::command]
pub(crate) fn env_runtime_cli_install(
    state: tauri::State<'_, AppState>,
    _app: tauri::AppHandle,
) -> RpcResult<ProductCliInstallStatus> {
    #[cfg(not(target_os = "macos"))]
    {
        let _ = (state, _app);
        return rpc_err(
            "Product CLI installation is supported on macOS only",
            Some("PLATFORM_UNSUPPORTED".to_string()),
        );
    }
    #[cfg(target_os = "macos")]
    {
        let _commit_guard = match state.env_runtime.commit_guard() {
            Ok(guard) => guard,
            Err(error) => return env_error(error),
        };
        let paths = match ProductCliPaths::for_current_process() {
            Ok(paths) => paths,
            Err(error) => return rpc_err(error, Some("CLI_UNAVAILABLE".to_string())),
        };
        let mut adapter = match state.adapter.lock() {
            Ok(adapter) => adapter,
            Err(_) => return rpc_err("Adapter mutex poisoned", Some("INTERNAL".to_string())),
        };
        env_runtime_cli_install_for_paths(adapter.as_mut(), &paths)
    }
}

#[cfg(target_os = "macos")]
pub(crate) fn env_runtime_cli_install_for_paths(
    adapter: &mut dyn crate::core_adapter::CoreAdapter,
    paths: &ProductCliPaths,
) -> RpcResult<ProductCliInstallStatus> {
    let capabilities = crate::types::runtime_capabilities_for_current_target();
    if let Err(error) = crate::module_access::guard_module_for_adapter(
        adapter,
        crate::module_access::MODULE_ENV_RUNTIME,
        &capabilities,
    ) {
        return env_error(env_runtime_module_denial(error));
    }
    if !adapter.is_unlocked() {
        return env_error(EnvRuntimeError::new(
            crate::env_runtime::EnvRuntimeErrorCode::VAULT_REQUIRED,
            "Unlock the local vault before installing the Env Runtime CLI",
        ));
    }
    if !product_cli_is_bundled(paths) {
        return rpc_err(
            "Bundled chromvoid CLI is missing or not executable",
            Some("CLI_UNAVAILABLE".to_string()),
        );
    }
    if let Err(error) = install_product_cli_link(paths) {
        return rpc_err(error.message, Some(error.code.to_string()));
    }
    rpc_ok(product_cli_install_status_for_paths(paths))
}

fn env_runtime_mutation_guard<T>(state: &tauri::State<'_, AppState>) -> Option<RpcResult<T>> {
    crate::module_access::guard_module(state, crate::module_access::MODULE_ENV_RUNTIME)
        .err()
        .map(crate::module_access::denial_result)
}

fn env_runtime_unlocked_guard<T>(state: &tauri::State<'_, AppState>) -> Option<RpcResult<T>> {
    match state.adapter.lock() {
        Ok(adapter) if adapter.is_unlocked() => None,
        Ok(_) => Some(rpc_err(
            "Unlock the vault first",
            Some("VAULT_REQUIRED".to_string()),
        )),
        Err(_) => Some(rpc_err(
            "Adapter mutex poisoned",
            Some("INTERNAL".to_string()),
        )),
    }
}

fn env_error<T>(error: EnvRuntimeError) -> RpcResult<T> {
    rpc_err(error.message, Some(error.code.to_string()))
}

#[cfg(test)]
mod tests {
    use std::collections::HashSet;

    use chromvoid_protocol::AgentVariableMappingV1;

    use super::*;

    fn profile_draft(fixed_secret_id: Option<&str>) -> AgentProfileDraftV1 {
        AgentProfileDraftV1 {
            slug: "test".to_string(),
            label: "Test".to_string(),
            description: None,
            variables: vec![
                AgentVariableMappingV1 {
                    name: "FIXED".to_string(),
                    secret_id: fixed_secret_id.map(str::to_string),
                },
                AgentVariableMappingV1 {
                    name: "BOUND_AT_APPROVAL".to_string(),
                    secret_id: None,
                },
            ],
        }
    }

    #[test]
    fn missing_original_secret_is_stale_but_invalid_new_binding_keeps_proposal_pending() {
        let bindings = vec![ProfileSecretBinding {
            name: "BOUND_AT_APPROVAL".to_string(),
            secret_id: "secret-new".to_string(),
        }];
        let known = HashSet::from(["secret-new".to_string()]);
        let stale = validate_profile_secret_references(
            &profile_draft(Some("secret-deleted")),
            &bindings,
            &known,
        )
        .expect_err("deleted proposal ref must become stale");
        assert_eq!(
            stale.code,
            crate::env_runtime::EnvRuntimeErrorCode::NOT_FOUND
        );

        let invalid_binding = validate_profile_secret_references(
            &profile_draft(Some("secret-fixed")),
            &bindings,
            &HashSet::from(["secret-fixed".to_string()]),
        )
        .expect_err("unknown approval binding must remain correctable");
        assert_eq!(
            invalid_binding.code,
            crate::env_runtime::EnvRuntimeErrorCode::SECRET_BINDING_REQUIRED
        );
        assert!(!proposal_error_is_stale(&invalid_binding));
    }

    #[test]
    fn bindings_are_rejected_for_preset_approval_and_all_rejections() {
        let binding = ProfileSecretBinding {
            name: "TOKEN".to_string(),
            secret_id: "secret-1".to_string(),
        };
        assert!(validate_proposal_binding_scope("profile", true, &[binding.clone()]).is_ok());
        for (resource_kind, approve) in [("preset", true), ("profile", false), ("preset", false)] {
            let error = validate_proposal_binding_scope(resource_kind, approve, &[binding.clone()])
                .expect_err("binding scope");
            assert_eq!(
                error.code,
                crate::env_runtime::EnvRuntimeErrorCode::INVALID_REQUEST
            );
        }
    }
}
