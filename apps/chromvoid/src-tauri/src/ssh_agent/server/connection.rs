use std::collections::HashSet;
use std::path::Path;
use std::sync::Arc;
use std::time::Instant;

use tokio::io::{AsyncReadExt, AsyncWriteExt};
use tokio::sync::{oneshot, Mutex};
use tokio::time::{timeout, Duration};
use tracing::{debug, error, warn};

use super::models::{
    AgentShared, PendingApproval, PendingApprovalContext, SignApprovalEventPayload,
    APPROVAL_TIMEOUT_SECS, MAX_MESSAGE_SIZE, READ_BUFFER_SIZE,
};
use super::upstream::{fetch_upstream_identities, is_same_socket_endpoint, proxy_sign_request};
use crate::ssh_agent::audit::SshAgentAuditEvent;
use crate::ssh_agent::protocol::{
    build_failure, build_identities_answer, build_sign_response, parse_message, parse_sign_request,
    SSH_AGENTC_REQUEST_IDENTITIES, SSH_AGENTC_SIGN_REQUEST,
};
use crate::ssh_agent::signing::sign_data;

pub(super) async fn handle_connection(
    mut stream: tokio::net::UnixStream,
    shared: Arc<Mutex<AgentShared>>,
    connection_id: u64,
) {
    let mut buf = vec![0u8; READ_BUFFER_SIZE];
    let mut pending = Vec::<u8>::new();
    let mut approved_fingerprints = HashSet::<String>::new();
    let peer_pid = peer_pid(&stream);
    let peer_process = peer_pid.and_then(resolve_peer_process);

    loop {
        let n = match stream.read(&mut buf).await {
            Ok(0) => break,
            Ok(n) => n,
            Err(e) => {
                debug!("ssh-agent: read error: {e}");
                break;
            }
        };

        pending.extend_from_slice(&buf[..n]);

        if pending.len() >= 4 {
            let framed_len =
                u32::from_be_bytes([pending[0], pending[1], pending[2], pending[3]]) as usize;
            if framed_len == 0 || framed_len > MAX_MESSAGE_SIZE {
                warn!("ssh-agent: closing connection due to invalid frame length {framed_len}");
                return;
            }
        }

        while let Some((msg_type, payload, consumed)) = parse_message(&pending) {
            let response = handle_message(
                msg_type,
                &payload,
                &shared,
                connection_id,
                &mut approved_fingerprints,
                peer_pid,
                peer_process.clone(),
            )
            .await;

            if let Err(e) = stream.write_all(&response).await {
                debug!("ssh-agent: write error: {e}");
                return;
            }

            pending.drain(..consumed);

            if pending.len() >= 4 {
                let framed_len =
                    u32::from_be_bytes([pending[0], pending[1], pending[2], pending[3]]) as usize;
                if framed_len == 0 || framed_len > MAX_MESSAGE_SIZE {
                    warn!("ssh-agent: closing connection due to invalid frame length {framed_len}");
                    return;
                }
            }
        }
    }
}

async fn handle_message(
    msg_type: u8,
    payload: &[u8],
    shared: &Arc<Mutex<AgentShared>>,
    connection_id: u64,
    approved_fingerprints: &mut HashSet<String>,
    peer_pid: Option<u32>,
    peer_process: Option<String>,
) -> Vec<u8> {
    match msg_type {
        SSH_AGENTC_REQUEST_IDENTITIES => {
            let (local_pairs, upstream_socket_path, socket_path) = {
                let guard = shared.lock().await;
                let local_pairs: Vec<(Vec<u8>, String)> = guard
                    .identities
                    .iter()
                    .map(|id| (id.key_blob.clone(), id.comment.clone()))
                    .collect();
                (
                    local_pairs,
                    guard.upstream_socket_path.clone(),
                    guard.socket_path.clone(),
                )
            };

            let mut merged = local_pairs;
            let mut seen: HashSet<Vec<u8>> = merged.iter().map(|(blob, _)| blob.clone()).collect();

            if let Some(upstream_path) = upstream_socket_path {
                if !is_same_socket_endpoint(&upstream_path, &socket_path) {
                    if let Some(upstream_pairs) = fetch_upstream_identities(&upstream_path).await {
                        for (blob, comment) in upstream_pairs {
                            if seen.insert(blob.clone()) {
                                merged.push((blob, comment));
                            }
                        }
                    }
                }
            }

            debug!("ssh-agent: REQUEST_IDENTITIES → {} keys", merged.len());
            build_identities_answer(&merged)
        }
        SSH_AGENTC_SIGN_REQUEST => {
            let Some((key_blob, data, flags)) = parse_sign_request(payload) else {
                warn!("ssh-agent: malformed SIGN_REQUEST");
                return build_failure();
            };

            let (matching_identity, upstream_socket_path, socket_path) = {
                let guard = shared.lock().await;
                (
                    guard
                        .identities
                        .iter()
                        .find(|id| id.key_blob == key_blob)
                        .cloned(),
                    guard.upstream_socket_path.clone(),
                    guard.socket_path.clone(),
                )
            };

            let Some(identity) = matching_identity else {
                if let Some(upstream_path) = upstream_socket_path {
                    if !is_same_socket_endpoint(&upstream_path, &socket_path) {
                        if let Some(proxy_response) =
                            proxy_sign_request(&upstream_path, payload).await
                        {
                            return proxy_response;
                        }
                    }
                }

                warn!("ssh-agent: SIGN_REQUEST for unknown key");
                return build_failure();
            };

            if !approved_fingerprints.contains(&identity.fingerprint) {
                let approved = request_connection_approval(
                    shared,
                    connection_id,
                    peer_pid,
                    peer_process.clone(),
                    &identity.fingerprint,
                    &identity.comment,
                )
                .await;

                if !approved {
                    return build_failure();
                }

                approved_fingerprints.insert(identity.fingerprint.clone());
            }

            let sign_started_at = Instant::now();
            let entry_id = identity.entry_id.clone();
            let future = {
                let guard = shared.lock().await;
                let read_fn = &guard.read_private_key;
                read_fn(&entry_id)
            };

            let audit_log = {
                let guard = shared.lock().await;
                guard.audit_log.clone()
            };

            let private_key_pem = match future.await {
                Some(pem) => pem,
                None => {
                    warn!("ssh-agent: private key not available for entry {entry_id}");
                    if let Some(audit_log) = audit_log {
                        audit_log
                            .log(SshAgentAuditEvent::sign_result(
                                connection_id,
                                &identity.fingerprint,
                                &identity.comment,
                                peer_pid,
                                peer_process.as_deref(),
                                None,
                                false,
                                sign_started_at.elapsed().as_millis() as u64,
                                Some("private key not available"),
                            ))
                            .await;
                    }
                    return build_failure();
                }
            };

            match sign_data(private_key_pem.as_str(), &data, flags) {
                Ok(signature) => {
                    debug!("ssh-agent: SIGN_REQUEST → success for entry {entry_id}");
                    if let Some(audit_log) = audit_log {
                        audit_log
                            .log(SshAgentAuditEvent::sign_result(
                                connection_id,
                                &identity.fingerprint,
                                &identity.comment,
                                peer_pid,
                                peer_process.as_deref(),
                                None,
                                true,
                                sign_started_at.elapsed().as_millis() as u64,
                                None,
                            ))
                            .await;
                    }
                    build_sign_response(&signature)
                }
                Err(e) => {
                    error!("ssh-agent: signing failed: {e}");
                    if let Some(audit_log) = audit_log {
                        audit_log
                            .log(SshAgentAuditEvent::sign_result(
                                connection_id,
                                &identity.fingerprint,
                                &identity.comment,
                                peer_pid,
                                peer_process.as_deref(),
                                None,
                                false,
                                sign_started_at.elapsed().as_millis() as u64,
                                Some(&e),
                            ))
                            .await;
                    }
                    build_failure()
                }
            }
        }
        other => {
            debug!("ssh-agent: unsupported message type {other}");
            build_failure()
        }
    }
}

async fn request_connection_approval(
    shared: &Arc<Mutex<AgentShared>>,
    connection_id: u64,
    peer_pid: Option<u32>,
    peer_process: Option<String>,
    fingerprint: &str,
    comment: &str,
) -> bool {
    let request_id = uuid::Uuid::new_v4().to_string();
    let (tx, rx) = oneshot::channel::<bool>();
    let requested_at = Instant::now();

    let audit_log = {
        let mut guard = shared.lock().await;
        let context = PendingApprovalContext {
            request_id: request_id.clone(),
            connection_id,
            fingerprint: fingerprint.to_string(),
            comment: comment.to_string(),
            peer_pid,
            peer_process: peer_process.clone(),
            host_hint: None,
            requested_at,
        };
        let payload = SignApprovalEventPayload {
            request_id: request_id.clone(),
            connection_id,
            fingerprint: fingerprint.to_string(),
            comment: comment.to_string(),
            peer_pid,
            peer_process: peer_process.clone(),
            host_hint: None,
        };

        guard.insert_pending_approval(PendingApproval { tx, context });
        let audit_log = guard.audit_log.clone();
        if let Err(e) = guard.approval_emitter.emit_sign_request(&payload) {
            guard.take_pending_approval(&request_id);
            error!("ssh-agent: failed to emit approval event: {e}");
            return false;
        }

        audit_log
    };

    if let Some(audit_log) = audit_log.clone() {
        audit_log
            .log(SshAgentAuditEvent::approval_requested(
                &request_id,
                connection_id,
                fingerprint,
                comment,
                peer_pid,
                peer_process.as_deref(),
                None,
            ))
            .await;
    }

    match timeout(Duration::from_secs(APPROVAL_TIMEOUT_SECS), rx).await {
        Ok(Ok(result)) => result,
        Ok(Err(_)) => {
            let pending = {
                let mut guard = shared.lock().await;
                guard.take_pending_approval(&request_id)
            };
            if let (Some(audit_log), Some(pending)) = (audit_log, pending) {
                audit_log
                    .log(SshAgentAuditEvent::approval_timeout(
                        &pending.context.request_id,
                        pending.context.connection_id,
                        &pending.context.fingerprint,
                        &pending.context.comment,
                        pending.context.peer_pid,
                        pending.context.peer_process.as_deref(),
                        pending.context.host_hint.as_deref(),
                        pending.context.requested_at.elapsed().as_millis() as u64,
                    ))
                    .await;
            }
            false
        }
        Err(_) => {
            let pending = {
                let mut guard = shared.lock().await;
                guard.take_pending_approval(&request_id)
            };
            if let (Some(audit_log), Some(pending)) = (audit_log, pending) {
                audit_log
                    .log(SshAgentAuditEvent::approval_timeout(
                        &pending.context.request_id,
                        pending.context.connection_id,
                        &pending.context.fingerprint,
                        &pending.context.comment,
                        pending.context.peer_pid,
                        pending.context.peer_process.as_deref(),
                        pending.context.host_hint.as_deref(),
                        pending.context.requested_at.elapsed().as_millis() as u64,
                    ))
                    .await;
            }
            false
        }
    }
}

fn peer_pid(stream: &tokio::net::UnixStream) -> Option<u32> {
    stream
        .peer_cred()
        .ok()
        .and_then(|cred| cred.pid())
        .and_then(|pid| u32::try_from(pid).ok())
}

#[cfg(target_os = "linux")]
fn resolve_peer_process(pid: u32) -> Option<String> {
    let comm_path = format!("/proc/{pid}/comm");
    if let Ok(name) = std::fs::read_to_string(&comm_path) {
        let trimmed = name.trim();
        if !trimmed.is_empty() {
            return Some(trimmed.to_string());
        }
    }

    let cmdline_path = format!("/proc/{pid}/cmdline");
    let cmdline = std::fs::read(&cmdline_path).ok()?;
    let first = cmdline
        .split(|byte| *byte == 0)
        .find(|segment| !segment.is_empty())?;
    let text = String::from_utf8_lossy(first);
    let value = text.trim();
    if value.is_empty() {
        return None;
    }

    Some(
        Path::new(value)
            .file_name()
            .and_then(|name| name.to_str())
            .unwrap_or(value)
            .to_string(),
    )
}

#[cfg(target_os = "macos")]
fn resolve_peer_process(pid: u32) -> Option<String> {
    let mut buffer = vec![0u8; libc::PROC_PIDPATHINFO_MAXSIZE as usize];
    // SAFETY: buffer is a &mut Vec<u8> sized to PROC_PIDPATHINFO_MAXSIZE; written length is bounds-checked
    // (>0, line 420) before being used as a slice end on line 424.
    let written = unsafe {
        libc::proc_pidpath(
            pid as i32,
            buffer.as_mut_ptr() as *mut libc::c_void,
            buffer.len() as u32,
        )
    };

    if written <= 0 {
        return None;
    }

    let text = String::from_utf8_lossy(&buffer[..written as usize]);
    let value = text.trim_end_matches('\0').trim();
    if value.is_empty() {
        return None;
    }

    Some(
        Path::new(value)
            .file_name()
            .and_then(|name| name.to_str())
            .unwrap_or(value)
            .to_string(),
    )
}

#[cfg(not(any(target_os = "linux", target_os = "macos")))]
fn resolve_peer_process(_pid: u32) -> Option<String> {
    None
}

#[cfg(test)]
mod tests {
    use super::resolve_peer_process;

    #[cfg(any(target_os = "linux", target_os = "macos"))]
    #[test]
    fn peer_process_resolution_is_best_effort_for_current_process() {
        assert!(resolve_peer_process(std::process::id()).is_some());
    }
}
