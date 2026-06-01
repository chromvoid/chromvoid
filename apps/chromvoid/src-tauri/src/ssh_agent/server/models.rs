use std::collections::HashMap;
use std::future::Future;
use std::path::PathBuf;
use std::pin::Pin;
use std::sync::Arc;
use std::time::Instant;

use tauri::{Emitter, Manager};
use tokio::sync::oneshot;
use zeroize::Zeroizing;

use crate::ssh_agent::audit::SshAgentAuditLog;

pub const READ_BUFFER_SIZE: usize = 64 * 1024;
pub const MAX_MESSAGE_SIZE: usize = 256 * 1024;
pub const APPROVAL_TIMEOUT_SECS: u64 = 120;
pub const UPSTREAM_IO_TIMEOUT_SECS: u64 = 2;

#[derive(Clone)]
pub struct Identity {
    pub key_blob: Vec<u8>,
    pub comment: String,
    pub fingerprint: String,
    pub entry_id: String,
}

pub type PrivateKeyPem = Zeroizing<String>;
pub type ReadPrivateKeyFuture = Pin<Box<dyn Future<Output = Option<PrivateKeyPem>> + Send>>;
pub type ReadPrivateKeyFn = dyn Fn(&str) -> ReadPrivateKeyFuture + Send + Sync;

pub trait ApprovalEventEmitter: Send + Sync {
    fn emit_sign_request(&self, payload: &SignApprovalEventPayload) -> Result<(), String>;
}

pub type ApprovalEmitterHandle = Arc<dyn ApprovalEventEmitter>;

pub struct AgentShared {
    pub identities: Vec<Identity>,
    pub read_private_key: Box<ReadPrivateKeyFn>,
    pub approval_emitter: ApprovalEmitterHandle,
    pub audit_log: Option<Arc<SshAgentAuditLog>>,
    pub socket_path: PathBuf,
    pub upstream_socket_path: Option<PathBuf>,
    pub pending_approvals: HashMap<String, PendingApproval>,
}

pub struct PendingApproval {
    pub tx: oneshot::Sender<bool>,
    pub context: PendingApprovalContext,
}

#[derive(Debug, Clone)]
pub struct PendingApprovalContext {
    pub request_id: String,
    pub connection_id: u64,
    pub fingerprint: String,
    pub comment: String,
    pub peer_pid: Option<u32>,
    pub peer_process: Option<String>,
    pub host_hint: Option<String>,
    pub requested_at: Instant,
}

pub struct ApprovalResolution {
    pub context: PendingApprovalContext,
    pub delivered: bool,
}

fn reject_pending_approvals(
    pending_approvals: &mut HashMap<String, PendingApproval>,
) -> Vec<PendingApprovalContext> {
    let pending = std::mem::take(pending_approvals);
    let mut contexts = Vec::with_capacity(pending.len());

    for (_, pending) in pending {
        let PendingApproval { tx, context } = pending;
        let _ = tx.send(false);
        contexts.push(context);
    }

    contexts
}

impl AgentShared {
    pub fn resolve_approval(
        &mut self,
        request_id: &str,
        approved: bool,
    ) -> Option<ApprovalResolution> {
        let pending = self.pending_approvals.remove(request_id)?;
        let delivered = pending.tx.send(approved).is_ok();
        Some(ApprovalResolution {
            context: pending.context,
            delivered,
        })
    }

    pub fn take_pending_approval(&mut self, request_id: &str) -> Option<PendingApproval> {
        self.pending_approvals.remove(request_id)
    }

    pub fn insert_pending_approval(&mut self, pending: PendingApproval) {
        self.pending_approvals
            .insert(pending.context.request_id.clone(), pending);
    }

    pub fn reject_all_pending(&mut self) -> Vec<PendingApprovalContext> {
        reject_pending_approvals(&mut self.pending_approvals)
    }
}

pub struct TauriApprovalEventEmitter<R: tauri::Runtime> {
    app_handle: tauri::AppHandle<R>,
}

impl<R: tauri::Runtime> TauriApprovalEventEmitter<R> {
    pub fn new(app_handle: tauri::AppHandle<R>) -> Self {
        Self { app_handle }
    }
}

impl<R: tauri::Runtime> ApprovalEventEmitter for TauriApprovalEventEmitter<R> {
    fn emit_sign_request(&self, payload: &SignApprovalEventPayload) -> Result<(), String> {
        let Some(main_window) = self.app_handle.get_webview_window("main") else {
            return Err("main window missing".to_string());
        };

        main_window
            .emit("ssh-agent:sign-request", payload)
            .map_err(|error| error.to_string())
    }
}

#[derive(Debug, Clone, serde::Serialize)]
pub struct SignApprovalEventPayload {
    pub request_id: String,
    pub connection_id: u64,
    pub fingerprint: String,
    pub comment: String,
    pub peer_pid: Option<u32>,
    pub peer_process: Option<String>,
    pub host_hint: Option<String>,
}

#[cfg(test)]
mod tests {
    use super::reject_pending_approvals;
    use std::collections::HashMap;
    use std::time::Instant;
    use tokio::sync::oneshot;

    #[tokio::test]
    async fn reject_pending_approvals_denies_all_waiters() {
        let (tx_a, rx_a) = oneshot::channel();
        let (tx_b, rx_b) = oneshot::channel();
        let mut pending = HashMap::from([
            (
                "a".to_string(),
                super::PendingApproval {
                    tx: tx_a,
                    context: super::PendingApprovalContext {
                        request_id: "a".to_string(),
                        connection_id: 1,
                        fingerprint: "fp-a".to_string(),
                        comment: "a".to_string(),
                        peer_pid: None,
                        peer_process: None,
                        host_hint: None,
                        requested_at: Instant::now(),
                    },
                },
            ),
            (
                "b".to_string(),
                super::PendingApproval {
                    tx: tx_b,
                    context: super::PendingApprovalContext {
                        request_id: "b".to_string(),
                        connection_id: 2,
                        fingerprint: "fp-b".to_string(),
                        comment: "b".to_string(),
                        peer_pid: None,
                        peer_process: None,
                        host_hint: None,
                        requested_at: Instant::now(),
                    },
                },
            ),
        ]);

        let rejected = reject_pending_approvals(&mut pending);

        assert_eq!(rejected.len(), 2);
        assert!(pending.is_empty());
        assert_eq!(rx_a.await, Ok(false));
        assert_eq!(rx_b.await, Ok(false));
    }
}
