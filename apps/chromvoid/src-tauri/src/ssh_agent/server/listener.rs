use std::path::{Path, PathBuf};
use std::sync::Arc;

use tokio::net::UnixListener;
use tokio::sync::{watch, Mutex};
use tokio::task::JoinSet;
use tracing::{debug, error, info, warn};

use super::connection::handle_connection;
use super::models::AgentShared;

#[derive(Debug, Clone, Copy, PartialEq, Eq)]
pub struct SocketFileIdentity {
    dev: u64,
    ino: u64,
}

pub struct BoundAgentListener {
    listener: UnixListener,
    socket_identity: Option<SocketFileIdentity>,
}

impl BoundAgentListener {
    pub fn socket_identity(&self) -> Option<SocketFileIdentity> {
        self.socket_identity
    }
}

pub fn bind_agent_listener(socket_path: &Path) -> Result<BoundAgentListener, String> {
    prepare_socket_path(socket_path)?;

    let listener = UnixListener::bind(socket_path)
        .map_err(|e| format!("failed to bind '{}': {e}", socket_path.display()))?;

    if let Err(e) = restrict_socket_permissions(socket_path) {
        let _ = std::fs::remove_file(socket_path);
        return Err(format!(
            "failed to set permissions on '{}': {e}",
            socket_path.display()
        ));
    }

    let socket_identity = socket_file_identity(socket_path);
    info!("ssh-agent: listening on {}", socket_path.display());

    Ok(BoundAgentListener {
        listener,
        socket_identity,
    })
}

pub async fn run_agent(
    bound_listener: BoundAgentListener,
    socket_path: PathBuf,
    shared: Arc<Mutex<AgentShared>>,
    mut shutdown_rx: watch::Receiver<bool>,
) {
    let listener = bound_listener.listener;
    let socket_identity = bound_listener.socket_identity;

    let mut connection_id_seq: u64 = 1;
    let mut connections = JoinSet::new();

    loop {
        tokio::select! {
            accept_result = listener.accept() => {
                match accept_result {
                    Ok((stream, _addr)) => {
                        let shared = shared.clone();
                        let mut shutdown = shutdown_rx.clone();
                        let connection_id = connection_id_seq;
                        connection_id_seq = connection_id_seq.wrapping_add(1);

                        connections.spawn(async move {
                            tokio::select! {
                                _ = handle_connection(stream, shared, connection_id) => {}
                                _ = shutdown.changed() => {
                                    debug!("ssh-agent: connection closed by shutdown");
                                }
                            }
                        });
                    }
                    Err(e) => {
                        warn!("ssh-agent: accept error: {e}");
                    }
                }
            }
            join_result = connections.join_next(), if !connections.is_empty() => {
                if let Some(Err(error)) = join_result {
                    debug!("ssh-agent: connection task failed: {error}");
                }
            }
            _ = shutdown_rx.changed() => {
                info!("ssh-agent: shutdown signal received");
                break;
            }
        }
    }

    while let Some(join_result) = connections.join_next().await {
        if let Err(error) = join_result {
            debug!("ssh-agent: connection task failed during shutdown: {error}");
        }
    }

    remove_socket_if_matches(&socket_path, socket_identity);
    info!("ssh-agent: stopped");
}

fn prepare_socket_path(socket_path: &Path) -> Result<(), String> {
    let parent = socket_path
        .parent()
        .ok_or_else(|| "socket path has no parent directory".to_string())?;

    std::fs::create_dir_all(parent).map_err(|e| {
        format!(
            "failed to create parent directory '{}': {e}",
            parent.display()
        )
    })?;

    #[cfg(unix)]
    {
        use std::os::unix::fs::PermissionsExt;
        std::fs::set_permissions(parent, std::fs::Permissions::from_mode(0o700)).map_err(|e| {
            format!(
                "failed to set permissions on parent directory '{}': {e}",
                parent.display()
            )
        })?;
    }

    if socket_path.exists() {
        remove_stale_socket(socket_path)?;
    }

    Ok(())
}

#[cfg(unix)]
fn remove_stale_socket(socket_path: &Path) -> Result<(), String> {
    use std::os::unix::fs::{FileTypeExt, MetadataExt};

    let meta = std::fs::symlink_metadata(socket_path)
        .map_err(|e| format!("failed to stat '{}': {e}", socket_path.display()))?;

    if !meta.file_type().is_socket() {
        return Err(format!(
            "refusing to remove non-socket path '{}'",
            socket_path.display()
        ));
    }

    let owner_uid = meta.uid();
    // SAFETY: geteuid is async-signal-safe and never fails per POSIX; takes no args.
    let current_uid = unsafe { libc::geteuid() };
    if owner_uid != current_uid {
        return Err(format!(
            "refusing to remove socket '{}' owned by uid {owner_uid}",
            socket_path.display()
        ));
    }

    if std::os::unix::net::UnixStream::connect(socket_path).is_ok() {
        return Err(format!(
            "refusing to remove active socket '{}'",
            socket_path.display()
        ));
    }

    std::fs::remove_file(socket_path).map_err(|e| {
        format!(
            "failed to remove stale socket '{}': {e}",
            socket_path.display()
        )
    })
}

#[cfg(not(unix))]
fn remove_stale_socket(socket_path: &Path) -> Result<(), String> {
    std::fs::remove_file(socket_path).map_err(|e| {
        format!(
            "failed to remove stale socket '{}': {e}",
            socket_path.display()
        )
    })
}

fn restrict_socket_permissions(socket_path: &Path) -> Result<(), String> {
    #[cfg(unix)]
    {
        use std::os::unix::fs::PermissionsExt;
        std::fs::set_permissions(socket_path, std::fs::Permissions::from_mode(0o600))
            .map_err(|e| format!("set_permissions '{}': {e}", socket_path.display()))?;
    }

    Ok(())
}

#[cfg(unix)]
fn socket_file_identity(socket_path: &Path) -> Option<SocketFileIdentity> {
    use std::os::unix::fs::{FileTypeExt, MetadataExt};

    let meta = std::fs::symlink_metadata(socket_path).ok()?;
    if !meta.file_type().is_socket() {
        return None;
    }

    Some(SocketFileIdentity {
        dev: meta.dev(),
        ino: meta.ino(),
    })
}

#[cfg(not(unix))]
fn socket_file_identity(_socket_path: &Path) -> Option<SocketFileIdentity> {
    None
}

pub fn remove_socket_if_matches(socket_path: &Path, expected: Option<SocketFileIdentity>) {
    if !socket_path.exists() {
        return;
    }

    if let Some(expected) = expected {
        match socket_file_identity(socket_path) {
            Some(current) if current == expected => {}
            Some(_) => {
                tracing::debug!(
                    "ssh-agent: skipped socket cleanup for replaced path {}",
                    socket_path.display()
                );
                return;
            }
            None => return,
        }
    }

    if let Err(error) = std::fs::remove_file(socket_path) {
        if error.kind() != std::io::ErrorKind::NotFound {
            error!(
                "ssh-agent: failed to remove socket {}: {error}",
                socket_path.display()
            );
        }
    }
}
