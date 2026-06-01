use std::path::PathBuf;
use std::sync::Arc;

use tauri::Manager;

use crate::app_state::AppState;
use crate::core_adapter::{CoreAdapter, CoreMode};
use crate::core_rpc_dispatcher::{CoreRpcDispatcher, CoreRpcPriority};
use crate::ssh_agent::audit::SshAgentAuditLog;
use crate::ssh_agent::server::{
    ApprovalEmitterHandle, PrivateKeyPem, ReadPrivateKeyFuture, TauriApprovalEventEmitter,
};

use super::{SshAgentEntries, SshAgentRefreshAction, SshAgentStatus, MAIN_WINDOW_LABEL};

pub(super) fn refresh_action(
    is_local_and_unlocked: bool,
    has_running_agent: bool,
    start_if_stopped: bool,
    entries_empty: bool,
) -> SshAgentRefreshAction {
    if !is_local_and_unlocked {
        return SshAgentRefreshAction::SkippedLockedOrRemote;
    }

    if has_running_agent {
        return SshAgentRefreshAction::Refreshed;
    }

    if !start_if_stopped {
        return SshAgentRefreshAction::SkippedAgentStopped;
    }

    if entries_empty {
        return SshAgentRefreshAction::SkippedNoIdentities;
    }

    SshAgentRefreshAction::Started
}

pub(super) fn ensure_main_window_caller(
    window_label: &str,
    command_name: &str,
) -> Result<(), String> {
    if window_label == MAIN_WINDOW_LABEL {
        return Ok(());
    }

    Err(format!("{command_name} is restricted to the main window"))
}

pub(super) fn ensure_local_mode(mode: CoreMode, command_name: &str) -> Result<(), String> {
    if matches!(mode, CoreMode::Local) {
        return Ok(());
    }

    Err(format!("{command_name} requires local Core adapter mode"))
}

pub(super) fn agent_status(agent: &crate::ssh_agent::SshAgentState) -> SshAgentStatus {
    SshAgentStatus {
        running: agent.is_running(),
        socket_path: agent.socket_path().map(|path| path.display().to_string()),
        identities_count: agent.identities_count(),
    }
}

pub(crate) fn collect_ssh_agent_entries(
    adapter: &mut dyn CoreAdapter,
) -> Result<SshAgentEntries, String> {
    let list_req = chromvoid_core::rpc::types::RpcRequest::new(
        "passmanager:entry:list".to_string(),
        serde_json::Value::Null,
    );
    let list_resp = adapter.handle(&list_req);
    let entries_json = match list_resp {
        chromvoid_core::rpc::types::RpcResponse::Success { result, .. } => result
            .get("entries")
            .and_then(|value| value.as_array())
            .cloned()
            .unwrap_or_else(|| {
                tracing::warn!("ssh_agent: passmanager entry list response missing entries array");
                Vec::new()
            }),
        chromvoid_core::rpc::types::RpcResponse::Error { error, .. } => {
            tracing::warn!("ssh_agent: passmanager entry list failed: {error}");
            Vec::new()
        }
    };

    let mut ssh_entries = Vec::<(String, String, String, String)>::new();

    for entry in &entries_json {
        let entry_id = entry
            .get("id")
            .and_then(|value| value.as_str())
            .unwrap_or_default()
            .to_string();
        let default_comment = entry
            .get("title")
            .and_then(|value| value.as_str())
            .unwrap_or("chromvoid")
            .to_string();

        let Some(ssh_keys) = entry.get("sshKeys").and_then(|value| value.as_array()) else {
            continue;
        };

        for key in ssh_keys {
            let key_id = key
                .get("id")
                .and_then(|value| value.as_str())
                .unwrap_or("default")
                .to_string();
            let comment = key
                .get("comment")
                .and_then(|value| value.as_str())
                .unwrap_or(&default_comment)
                .to_string();
            let fingerprint = key
                .get("fingerprint")
                .and_then(|value| value.as_str())
                .unwrap_or_default()
                .to_string();

            ssh_entries.push((entry_id.clone(), key_id, comment, fingerprint));
        }
    }

    let mut full_entries = Vec::with_capacity(ssh_entries.len());

    for (entry_id, key_id, comment, fingerprint) in &ssh_entries {
        let read_req = chromvoid_core::rpc::types::RpcRequest::new(
            "passmanager:secret:read".to_string(),
            serde_json::json!({
                "entry_id": entry_id,
                "secret_type": format!("ssh_public_key:{key_id}"),
            }),
        );
        let read_resp = adapter.handle(&read_req);
        let value = match read_resp {
            chromvoid_core::rpc::types::RpcResponse::Success { result, .. } => {
                match result.get("value").and_then(|value| value.as_str()) {
                    Some(value) => value.to_string(),
                    None => {
                        tracing::warn!(
                            "ssh_agent: public key read response missing value for {entry_id}/{key_id}"
                        );
                        continue;
                    }
                }
            }
            chromvoid_core::rpc::types::RpcResponse::Error { error, .. } => {
                tracing::warn!(
                    "ssh_agent: public key read failed for {entry_id}/{key_id}: {error}"
                );
                continue;
            }
        };

        full_entries.push((
            format!("{entry_id}/{key_id}"),
            value,
            comment.clone(),
            fingerprint.clone(),
        ));
    }

    Ok(full_entries)
}

fn build_private_key_reader(
    adapter_arc: Arc<std::sync::Mutex<Box<dyn CoreAdapter>>>,
    core_rpc_dispatcher: CoreRpcDispatcher,
) -> impl Fn(&str) -> ReadPrivateKeyFuture + Send + Sync + 'static {
    move |identity_key: &str| {
        let adapter_arc = adapter_arc.clone();
        let core_rpc_dispatcher = core_rpc_dispatcher.clone();
        let identity_key = identity_key.to_string();

        Box::pin(async move {
            let cancellation_generation =
                core_rpc_dispatcher.low_priority_cancellation_generation();
            match core_rpc_dispatcher
                .run_adapter_phase(
                    CoreRpcPriority::PrivacyCritical,
                    "passmanager:secret:read",
                    "ssh_agent_private_key",
                    cancellation_generation,
                    move || {
                        let mut adapter = match adapter_arc.lock() {
                            Ok(adapter) => adapter,
                            Err(_) => {
                                tracing::warn!(
                                    "ssh_agent: adapter mutex poisoned during private key read"
                                );
                                return None;
                            }
                        };
                        if !adapter.is_unlocked() || !matches!(adapter.mode(), CoreMode::Local) {
                            return None;
                        }

                        let (entry_id, key_id) = match identity_key.rsplit_once('/') {
                            Some((entry_id, key_id)) => (entry_id.to_string(), key_id.to_string()),
                            None => (identity_key.clone(), "default".to_string()),
                        };

                        let req = chromvoid_core::rpc::types::RpcRequest::new(
                            "passmanager:secret:read".to_string(),
                            serde_json::json!({
                                "entry_id": entry_id,
                                "secret_type": format!("ssh_private_key:{key_id}"),
                            }),
                        );
                        let resp = adapter.handle(&req);

                        resp.result()
                            .and_then(|result| result.get("value"))
                            .and_then(|value| value.as_str())
                            .map(|value| PrivateKeyPem::new(value.to_string()))
                    },
                )
                .await
            {
                Ok(result) => result.value,
                Err(error) => {
                    tracing::warn!("ssh_agent: private key read dispatcher phase failed: {error}");
                    None
                }
            }
        })
    }
}

fn current_upstream_socket_path() -> Option<PathBuf> {
    std::env::var_os("SSH_AUTH_SOCK").map(PathBuf::from)
}

fn build_approval_emitter<R: tauri::Runtime>(app: tauri::AppHandle<R>) -> ApprovalEmitterHandle {
    Arc::new(TauriApprovalEventEmitter::new(app))
}

fn build_audit_log<R: tauri::Runtime>(app: &tauri::AppHandle<R>) -> Option<Arc<SshAgentAuditLog>> {
    let data_dir = app.path().app_data_dir().ok()?;
    Some(Arc::new(SshAgentAuditLog::new(
        data_dir.join("audit").join("ssh-agent.jsonl"),
    )))
}

pub(super) fn start_ssh_agent_with_entries<R: tauri::Runtime>(
    app: tauri::AppHandle<R>,
    entries: SshAgentEntries,
) -> Result<SshAgentStatus, String> {
    let state = app.state::<AppState>();
    let adapter_arc = state.adapter.clone();
    let core_rpc_dispatcher = state.core_rpc_dispatcher.clone();
    let mut agent = state
        .ssh_agent
        .lock()
        .map_err(|_| "SSH agent mutex poisoned".to_string())?;

    agent.start(
        entries,
        current_upstream_socket_path(),
        build_approval_emitter(app.clone()),
        build_audit_log(&app),
        build_private_key_reader(adapter_arc, core_rpc_dispatcher),
    );

    Ok(agent_status(&agent))
}

pub(crate) async fn reconcile_ssh_agent_with_vault<R: tauri::Runtime>(
    app: &tauri::AppHandle<R>,
    start_if_stopped: bool,
) -> Result<SshAgentRefreshAction, String> {
    let entries = {
        let state = app.state::<AppState>();
        let mut adapter = state
            .adapter
            .lock()
            .map_err(|_| "Adapter mutex poisoned".to_string())?;

        let action = refresh_action(
            matches!(adapter.mode(), CoreMode::Local) && adapter.is_unlocked(),
            false,
            start_if_stopped,
            true,
        );
        if matches!(action, SshAgentRefreshAction::SkippedLockedOrRemote) {
            return Ok(action);
        }

        collect_ssh_agent_entries(adapter.as_mut())?
    };

    let updater = {
        let state = app.state::<AppState>();
        let agent = state
            .ssh_agent
            .lock()
            .map_err(|_| "SSH agent mutex poisoned".to_string())?;
        agent.updater()
    };

    let action = refresh_action(
        true,
        updater.is_some(),
        start_if_stopped,
        entries.is_empty(),
    );

    if let Some(updater) = updater {
        updater.update_identities(&entries).await;
        return Ok(action);
    }

    if !matches!(action, SshAgentRefreshAction::Started) {
        return Ok(action);
    }

    start_ssh_agent_with_entries(app.clone(), entries)?;
    Ok(action)
}
