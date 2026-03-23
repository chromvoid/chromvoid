use std::path::PathBuf;
use std::sync::Arc;

use tokio::net::UnixListener;
use tokio::sync::{watch, Mutex};
use tracing::{debug, error, info, warn};

use super::connection::handle_connection;
use super::models::AgentShared;

pub async fn run_agent(
    socket_path: PathBuf,
    shared: Arc<Mutex<AgentShared>>,
    mut shutdown_rx: watch::Receiver<bool>,
) {
    if let Err(e) = prepare_socket_path(&socket_path) {
        error!(
            "ssh-agent: failed to prepare {}: {e}",
            socket_path.display()
        );
        return;
    }

    let listener = match UnixListener::bind(&socket_path) {
        Ok(l) => l,
        Err(e) => {
            error!("ssh-agent: failed to bind {}: {e}", socket_path.display());
            return;
        }
    };

    if let Err(e) = restrict_socket_permissions(&socket_path) {
        error!(
            "ssh-agent: failed to set permissions on {}: {e}",
            socket_path.display()
        );
        let _ = std::fs::remove_file(&socket_path);
        return;
    }

    info!("ssh-agent: listening on {}", socket_path.display());

    let mut connection_id_seq: u64 = 1;

    loop {
        tokio::select! {
            accept_result = listener.accept() => {
                match accept_result {
                    Ok((stream, _addr)) => {
                        let shared = shared.clone();
                        let mut shutdown = shutdown_rx.clone();
                        let connection_id = connection_id_seq;
                        connection_id_seq = connection_id_seq.wrapping_add(1);

                        tokio::spawn(async move {
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
            _ = shutdown_rx.changed() => {
                info!("ssh-agent: shutdown signal received");
                break;
            }
        }
    }

    let _ = std::fs::remove_file(&socket_path);
    info!("ssh-agent: stopped");
}

fn prepare_socket_path(socket_path: &PathBuf) -> Result<(), String> {
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
fn remove_stale_socket(socket_path: &PathBuf) -> Result<(), String> {
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
fn remove_stale_socket(socket_path: &PathBuf) -> Result<(), String> {
    std::fs::remove_file(socket_path).map_err(|e| {
        format!(
            "failed to remove stale socket '{}': {e}",
            socket_path.display()
        )
    })
}

fn restrict_socket_permissions(socket_path: &PathBuf) -> Result<(), String> {
    #[cfg(unix)]
    {
        use std::os::unix::fs::PermissionsExt;
        std::fs::set_permissions(socket_path, std::fs::Permissions::from_mode(0o600))
            .map_err(|e| format!("set_permissions '{}': {e}", socket_path.display()))?;
    }

    Ok(())
}
