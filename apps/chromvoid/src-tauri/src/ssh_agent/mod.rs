//! SSH Agent service for ChromVoid.
//!
//! Provides a standard SSH agent protocol endpoint so that external tools
//! (git, ssh, etc.) can use SSH keys stored in the encrypted vault.

pub mod protocol;
pub mod server;
pub mod signing;

use std::path::PathBuf;
use std::sync::atomic::{AtomicUsize, Ordering};
use std::sync::Arc;

use tokio::sync::{watch, Mutex};
use tracing::{info, warn};

use server::{load_identities, AgentShared};

/// Public state managed by the application.
pub struct SshAgentState {
    task_handle: Option<tokio::task::JoinHandle<()>>,
    socket_path: Option<PathBuf>,
    shutdown_tx: Option<watch::Sender<bool>>,
    shared: Option<Arc<Mutex<AgentShared>>>,
    identities_count: Arc<AtomicUsize>,
}

impl SshAgentState {
    pub fn new() -> Self {
        Self {
            task_handle: None,
            socket_path: None,
            shutdown_tx: None,
            shared: None,
            identities_count: Arc::new(AtomicUsize::new(0)),
        }
    }

    /// Whether the agent is currently running.
    pub fn is_running(&self) -> bool {
        self.task_handle
            .as_ref()
            .map(|h| !h.is_finished())
            .unwrap_or(false)
    }

    /// The socket path the agent is listening on, if running.
    pub fn socket_path(&self) -> Option<&PathBuf> {
        if self.is_running() {
            self.socket_path.as_ref()
        } else {
            None
        }
    }

    /// Number of loaded identities.
    pub fn identities_count(&self) -> usize {
        self.identities_count.load(Ordering::Relaxed)
    }

    /// Start the SSH agent.
    ///
    /// `entries`: list of (entry_id, public_key_openssh, comment) for all SSH keys.
    /// `read_private_key`: async callback to read a private key PEM from the vault by entry_id.
    pub fn start(
        &mut self,
        entries: Vec<(String, String, String, String)>,
        upstream_socket_path: Option<PathBuf>,
        app_handle: tauri::AppHandle,
        read_private_key: impl Fn(&str) -> std::pin::Pin<Box<dyn std::future::Future<Output = Option<String>> + Send>>
            + Send
            + Sync
            + 'static,
    ) {
        if self.is_running() {
            warn!("ssh-agent: already running, stopping first");
            self.stop();
        }

        let socket_path = default_socket_path();
        let identities = load_identities(&entries);
        let identities_count = identities.len();

        let shared = Arc::new(Mutex::new(AgentShared {
            identities,
            read_private_key: Box::new(read_private_key),
            app_handle,
            socket_path: socket_path.clone(),
            upstream_socket_path,
            pending_approvals: std::collections::HashMap::new(),
        }));

        let (shutdown_tx, shutdown_rx) = watch::channel(false);

        let path = socket_path.clone();
        let shared_clone = shared.clone();
        let handle = tokio::spawn(async move {
            server::run_agent(path, shared_clone, shutdown_rx).await;
        });

        self.task_handle = Some(handle);
        self.socket_path = Some(socket_path.clone());
        self.shutdown_tx = Some(shutdown_tx);
        self.shared = Some(shared);
        self.identities_count
            .store(identities_count, Ordering::Relaxed);

        info!(
            "ssh-agent: started with {identities_count} identities on {}",
            socket_path.display()
        );
    }

    /// Update the identity list without restarting the agent.
    pub async fn update_identities(&self, entries: &[(String, String, String, String)]) {
        if let Some(ref shared) = self.shared {
            let new_identities = load_identities(entries);
            let next_count = new_identities.len();
            let mut guard = shared.lock().await;
            guard.identities = new_identities;
            self.identities_count.store(next_count, Ordering::Relaxed);
        }
    }

    pub fn shared(&self) -> Option<Arc<Mutex<AgentShared>>> {
        self.shared.clone()
    }

    /// Stop the SSH agent.
    pub fn stop(&mut self) {
        if let Some(tx) = self.shutdown_tx.take() {
            let _ = tx.send(true);
        }
        if let Some(handle) = self.task_handle.take() {
            handle.abort();
        }
        // Clean up socket file
        if let Some(ref path) = self.socket_path {
            let _ = std::fs::remove_file(path);
        }
        self.socket_path = None;
        self.shared = None;
        self.identities_count.store(0, Ordering::Relaxed);
        info!("ssh-agent: stopped");
    }
}

impl Drop for SshAgentState {
    fn drop(&mut self) {
        self.stop();
    }
}

/// Get the default socket path for the current platform.
fn default_socket_path() -> PathBuf {
    #[cfg(any(target_os = "macos", target_os = "linux"))]
    {
        let config_dir = std::env::var_os("XDG_CONFIG_HOME")
            .map(PathBuf::from)
            .or_else(|| {
                std::env::var_os("HOME")
                    .map(PathBuf::from)
                    .map(|home| home.join(".config"))
            })
            .unwrap_or_else(|| PathBuf::from("/tmp"));

        return config_dir.join("chromvoid").join("agent.sock");
    }

    #[cfg(target_os = "windows")]
    {
        PathBuf::from(r"\\.\pipe\chromvoid-ssh-agent")
    }

    #[cfg(not(any(target_os = "macos", target_os = "linux", target_os = "windows")))]
    {
        PathBuf::from("/tmp/chromvoid-agent.sock")
    }
}

#[cfg(test)]
mod tests {
    use super::default_socket_path;

    #[cfg(any(target_os = "linux", target_os = "macos"))]
    #[test]
    fn default_socket_path_prefers_xdg_config_home() {
        let original = std::env::var_os("XDG_CONFIG_HOME");
        unsafe {
            std::env::set_var("XDG_CONFIG_HOME", "/tmp/chromvoid-test-config");
        }

        let resolved = default_socket_path();
        assert_eq!(
            resolved,
            std::path::PathBuf::from("/tmp/chromvoid-test-config")
                .join("chromvoid")
                .join("agent.sock")
        );

        match original {
            Some(value) => unsafe {
                std::env::set_var("XDG_CONFIG_HOME", value);
            },
            None => unsafe {
                std::env::remove_var("XDG_CONFIG_HOME");
            },
        }
    }
}
