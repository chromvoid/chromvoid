use serde::Serialize;
use std::path::PathBuf;
use tauri::Manager;

use crate::app_state::AppState;

#[derive(Debug, Serialize)]
pub struct SshAgentStatus {
    pub running: bool,
    pub socket_path: Option<String>,
    pub identities_count: usize,
}

#[tauri::command]
pub async fn ssh_agent_status(app: tauri::AppHandle) -> Result<SshAgentStatus, String> {
    let state = app.state::<AppState>();
    let agent = state
        .ssh_agent
        .lock()
        .map_err(|_| "SSH agent mutex poisoned".to_string())?;

    Ok(SshAgentStatus {
        running: agent.is_running(),
        socket_path: agent.socket_path().map(|p| p.display().to_string()),
        identities_count: agent.identities_count(),
    })
}

#[tauri::command]
pub async fn ssh_agent_start(app: tauri::AppHandle) -> Result<SshAgentStatus, String> {
    // 1. Collect SSH key entries from the vault
    let entries = {
        let state = app.state::<AppState>();
        let mut adapter = state
            .adapter
            .lock()
            .map_err(|_| "Adapter mutex poisoned".to_string())?;

        if !adapter.is_unlocked() {
            return Err("Vault is locked".to_string());
        }

        // List all passmanager entries and filter those with SSH key metadata
        let list_req = chromvoid_core::rpc::types::RpcRequest::new(
            "passmanager:entry:list".to_string(),
            serde_json::Value::Null,
        );
        let list_resp = adapter.handle(&list_req);
        let entries_json = list_resp
            .result()
            .and_then(|r| r.get("entries"))
            .and_then(|v| v.as_array())
            .cloned()
            .unwrap_or_default();

        let mut ssh_entries: Vec<(String, String, String, String)> = Vec::new();
        for entry in &entries_json {
            let entry_id = entry
                .get("id")
                .and_then(|v| v.as_str())
                .unwrap_or_default()
                .to_string();
            let default_comment = entry
                .get("title")
                .and_then(|v| v.as_str())
                .unwrap_or("chromvoid")
                .to_string();

            // New format: sshKeys array
            if let Some(ssh_keys) = entry.get("sshKeys").and_then(|v| v.as_array()) {
                for key in ssh_keys {
                    let key_id = key
                        .get("id")
                        .and_then(|v| v.as_str())
                        .unwrap_or("default")
                        .to_string();
                    let comment = key
                        .get("comment")
                        .and_then(|v| v.as_str())
                        .unwrap_or(&default_comment)
                        .to_string();
                    let fingerprint = key
                        .get("fingerprint")
                        .and_then(|v| v.as_str())
                        .unwrap_or_default()
                        .to_string();
                    ssh_entries.push((entry_id.clone(), key_id, comment, fingerprint));
                }
                continue;
            }
        }

        // For each key, read the public key using indexed secret type
        // Identity key is encoded as "entry_id/key_id" for the callback
        let mut full_entries: Vec<(String, String, String, String)> = Vec::new();
        for (entry_id, key_id, comment, fingerprint) in &ssh_entries {
            let secret_type = format!("ssh_public_key:{key_id}");
            let read_req = chromvoid_core::rpc::types::RpcRequest::new(
                "passmanager:secret:read".to_string(),
                serde_json::json!({
                    "entry_id": entry_id,
                    "secret_type": secret_type,
                }),
            );
            let read_resp = adapter.handle(&read_req);
            if let Some(value) = read_resp
                .result()
                .and_then(|r| r.get("value"))
                .and_then(|v| v.as_str())
            {
                let identity_key = format!("{entry_id}/{key_id}");
                full_entries.push((
                    identity_key,
                    value.to_string(),
                    comment.clone(),
                    fingerprint.clone(),
                ));
            }
        }
        full_entries
    };

    // 2. Start the agent with the collected entries
    {
        let state = app.state::<AppState>();
        let adapter_arc = state.adapter.clone();
        let upstream_socket_path = std::env::var_os("SSH_AUTH_SOCK").map(PathBuf::from);
        let app_handle = app.clone();

        let mut agent = state
            .ssh_agent
            .lock()
            .map_err(|_| "SSH agent mutex poisoned".to_string())?;

        agent.start(
            entries,
            upstream_socket_path,
            app_handle,
            move |identity_key: &str| {
                let adapter_arc = adapter_arc.clone();
                let identity_key = identity_key.to_string();
                Box::pin(async move {
                    let mut adapter = adapter_arc.lock().ok()?;
                    if !adapter.is_unlocked() {
                        return None;
                    }
                    // Parse composite key "entry_id/key_id"
                    let (entry_id, key_id) = match identity_key.rsplit_once('/') {
                        Some((eid, kid)) => (eid.to_string(), kid.to_string()),
                        None => (identity_key.clone(), "default".to_string()),
                    };
                    let secret_type = format!("ssh_private_key:{key_id}");
                    let req = chromvoid_core::rpc::types::RpcRequest::new(
                        "passmanager:secret:read".to_string(),
                        serde_json::json!({
                            "entry_id": entry_id,
                            "secret_type": secret_type,
                        }),
                    );
                    let resp = adapter.handle(&req);
                    resp.result()
                        .and_then(|r| r.get("value"))
                        .and_then(|v| v.as_str())
                        .map(|s| s.to_string())
                })
            },
        );

        Ok(SshAgentStatus {
            running: agent.is_running(),
            socket_path: agent.socket_path().map(|p| p.display().to_string()),
            identities_count: agent.identities_count(),
        })
    }
}

#[tauri::command]
pub async fn ssh_agent_sign_approval_resolve(
    app: tauri::AppHandle,
    request_id: String,
    approved: bool,
) -> Result<(), String> {
    let shared = {
        let state = app.state::<AppState>();
        let agent = state
            .ssh_agent
            .lock()
            .map_err(|_| "SSH agent mutex poisoned".to_string())?;
        agent.shared()
    };

    let Some(shared) = shared else {
        return Ok(());
    };

    let mut guard = shared.lock().await;
    let resolved = guard.resolve_approval(&request_id, approved);
    if !resolved {
        tracing::warn!("ssh-agent: approval response for unknown request_id={request_id}");
    }

    Ok(())
}

#[tauri::command]
pub async fn ssh_agent_stop(app: tauri::AppHandle) -> Result<SshAgentStatus, String> {
    let state = app.state::<AppState>();
    let mut agent = state
        .ssh_agent
        .lock()
        .map_err(|_| "SSH agent mutex poisoned".to_string())?;

    agent.stop();

    Ok(SshAgentStatus {
        running: false,
        socket_path: None,
        identities_count: 0,
    })
}
