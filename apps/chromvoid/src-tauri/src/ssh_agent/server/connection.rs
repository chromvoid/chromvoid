use std::collections::HashSet;
use std::sync::Arc;

use tauri::Emitter;
use tokio::io::{AsyncReadExt, AsyncWriteExt};
use tokio::sync::{oneshot, Mutex};
use tokio::time::{timeout, Duration};
use tracing::{debug, error, warn};

use super::models::{
    AgentShared, SignApprovalEventPayload, APPROVAL_TIMEOUT_SECS, MAX_MESSAGE_SIZE,
    READ_BUFFER_SIZE,
};
use super::upstream::{fetch_upstream_identities, is_same_socket_endpoint, proxy_sign_request};
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
    let mut connection_approved = false;
    let peer_pid = None;

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
                &mut connection_approved,
                peer_pid,
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
    connection_approved: &mut bool,
    peer_pid: Option<u32>,
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
            let Some((key_blob, data, _flags)) = parse_sign_request(payload) else {
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

            if !*connection_approved {
                let approved = request_connection_approval(
                    shared,
                    connection_id,
                    peer_pid,
                    &identity.fingerprint,
                    &identity.comment,
                )
                .await;

                if !approved {
                    return build_failure();
                }

                *connection_approved = true;
            }

            let entry_id = identity.entry_id.clone();
            let future = {
                let guard = shared.lock().await;
                let read_fn = &guard.read_private_key;
                read_fn(&entry_id)
            };

            let private_key_pem = match future.await {
                Some(pem) => pem,
                None => {
                    warn!("ssh-agent: private key not available for entry {entry_id}");
                    return build_failure();
                }
            };

            match sign_data(&private_key_pem, &data) {
                Ok(signature) => {
                    debug!("ssh-agent: SIGN_REQUEST → success for entry {entry_id}");
                    build_sign_response(&signature)
                }
                Err(e) => {
                    error!("ssh-agent: signing failed: {e}");
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
    fingerprint: &str,
    comment: &str,
) -> bool {
    let request_id = uuid::Uuid::new_v4().to_string();
    let (tx, rx) = oneshot::channel::<bool>();

    {
        let mut guard = shared.lock().await;
        guard.pending_approvals.insert(request_id.clone(), tx);

        let payload = SignApprovalEventPayload {
            request_id: request_id.clone(),
            connection_id,
            fingerprint: fingerprint.to_string(),
            comment: comment.to_string(),
            peer_pid,
            peer_process: None,
            host_hint: None,
        };

        if let Err(e) = guard.app_handle.emit("ssh-agent:sign-request", payload) {
            guard.pending_approvals.remove(&request_id);
            error!("ssh-agent: failed to emit approval event: {e}");
            return false;
        }
    }

    let approved = match timeout(Duration::from_secs(APPROVAL_TIMEOUT_SECS), rx).await {
        Ok(Ok(result)) => result,
        Ok(Err(_)) => false,
        Err(_) => false,
    };

    let mut guard = shared.lock().await;
    guard.pending_approvals.remove(&request_id);
    approved
}
