use tauri::Manager;

use crate::app_state::AppState;
use crate::ssh_agent::audit::SshAgentAuditEvent;

pub(super) async fn resolve_sign_approval<R: tauri::Runtime>(
    app: tauri::AppHandle<R>,
    request_id: String,
    approved: bool,
) -> Result<(), String> {
    let shared = {
        let state = app.state::<AppState>();
        let agent = state
            .ssh_agent
            .lock()
            .map_err(|_| "SSH agent mutex poisoned".to_string())?;
        (agent.shared(), agent.audit_log())
    };

    let (shared, audit_log) = shared;
    let Some(shared) = shared else {
        if let Some(audit_log) = audit_log {
            audit_log
                .log(SshAgentAuditEvent::approval_stale(&request_id))
                .await;
        }
        return Err("ssh_agent_sign_approval_resolve requires a running SSH agent".to_string());
    };

    let mut guard = shared.lock().await;
    let resolution = guard.resolve_approval(&request_id, approved);
    let audit_log = guard.audit_log.clone().or(audit_log);
    drop(guard);

    let Some(resolution) = resolution else {
        tracing::warn!("ssh-agent: approval response for stale request_id={request_id}");
        if let Some(audit_log) = audit_log {
            audit_log
                .log(SshAgentAuditEvent::approval_stale(&request_id))
                .await;
        }
        return Err(format!(
            "ssh_agent_sign_approval_resolve rejected stale request_id={request_id}"
        ));
    };

    if let Some(audit_log) = audit_log {
        let event = if resolution.delivered {
            SshAgentAuditEvent::approval_resolved(
                &resolution.context.request_id,
                resolution.context.connection_id,
                &resolution.context.fingerprint,
                &resolution.context.comment,
                resolution.context.peer_pid,
                resolution.context.peer_process.as_deref(),
                resolution.context.host_hint.as_deref(),
                approved,
                resolution.context.requested_at.elapsed().as_millis() as u64,
            )
        } else {
            SshAgentAuditEvent::approval_stale(&resolution.context.request_id)
        };
        audit_log.log(event).await;
    }

    Ok(())
}
