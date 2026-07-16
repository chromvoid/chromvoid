use std::path::{Path, PathBuf};
use std::sync::Arc;

use tokio::sync::{watch, Mutex};

use super::models::AgentShared;

#[derive(Debug, Clone, Copy, PartialEq, Eq)]
pub struct SocketFileIdentity;

pub struct BoundAgentListener;

impl BoundAgentListener {
    pub fn socket_identity(&self) -> Option<SocketFileIdentity> {
        None
    }
}

pub fn bind_agent_listener(_socket_path: &Path) -> Result<BoundAgentListener, String> {
    Err("SSH agent listener is only supported on Unix platforms in this build".to_string())
}

pub async fn run_agent(
    _bound_listener: BoundAgentListener,
    _socket_path: PathBuf,
    _shared: Arc<Mutex<AgentShared>>,
    _shutdown_rx: watch::Receiver<bool>,
) {
}

pub fn remove_socket_if_matches(_socket_path: &Path, _expected: Option<SocketFileIdentity>) {}
