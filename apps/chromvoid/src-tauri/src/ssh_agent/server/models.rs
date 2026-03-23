use std::collections::HashMap;
use std::path::PathBuf;

use tauri::AppHandle;
use tokio::sync::oneshot;

pub const READ_BUFFER_SIZE: usize = 64 * 1024;
pub const MAX_MESSAGE_SIZE: usize = 256 * 1024;
pub const APPROVAL_TIMEOUT_SECS: u64 = 30;
pub const UPSTREAM_IO_TIMEOUT_SECS: u64 = 2;

#[derive(Clone)]
pub struct Identity {
    pub key_blob: Vec<u8>,
    pub comment: String,
    pub fingerprint: String,
    pub entry_id: String,
}

pub struct AgentShared {
    pub identities: Vec<Identity>,
    pub read_private_key: Box<
        dyn Fn(&str) -> std::pin::Pin<Box<dyn std::future::Future<Output = Option<String>> + Send>>
            + Send
            + Sync,
    >,
    pub app_handle: AppHandle,
    pub socket_path: PathBuf,
    pub upstream_socket_path: Option<PathBuf>,
    pub pending_approvals: HashMap<String, oneshot::Sender<bool>>,
}

impl AgentShared {
    pub fn resolve_approval(&mut self, request_id: &str, approved: bool) -> bool {
        let Some(tx) = self.pending_approvals.remove(request_id) else {
            return false;
        };
        tx.send(approved).is_ok()
    }
}

#[derive(Clone, serde::Serialize)]
pub(super) struct SignApprovalEventPayload {
    pub(super) request_id: String,
    pub(super) connection_id: u64,
    pub(super) fingerprint: String,
    pub(super) comment: String,
    pub(super) peer_pid: Option<u32>,
    pub(super) peer_process: Option<String>,
    pub(super) host_hint: Option<String>,
}
