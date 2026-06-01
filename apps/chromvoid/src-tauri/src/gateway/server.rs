use std::net::IpAddr;
use std::sync::{Arc, Mutex};

use tokio::net::TcpListener;
use tokio::sync::watch;
use tokio::task::JoinSet;
use tracing::{debug, info, warn};

use crate::task_lifecycle::{ManagedTaskName, TaskLifecycleRuntime, TaskShutdownReason};

use super::handshake::perform_handshake;
use super::rate_limit::ConnectionTracker;
use super::session::handle_extension_session;

pub const GATEWAY_BIND_V4: &str = "127.0.0.1:8003";
pub const GATEWAY_BIND_V6: &str = "[::1]:8003";

pub fn spawn_gateway_server(
    app: tauri::AppHandle,
    task_lifecycle: Arc<TaskLifecycleRuntime>,
) -> Result<(), String> {
    task_lifecycle.spawn_unique_async(
        ManagedTaskName::GatewayServer,
        move |shutdown_rx| async move {
            run_gateway_server(app, shutdown_rx).await;
        },
    )
}

async fn run_gateway_server(
    app: tauri::AppHandle,
    mut shutdown_rx: watch::Receiver<Option<TaskShutdownReason>>,
) {
    let mut listeners = Vec::new();
    match TcpListener::bind(GATEWAY_BIND_V4).await {
        Ok(listener) => {
            info!("[gateway] listening on {GATEWAY_BIND_V4}");
            listeners.push(listener);
        }
        Err(err) => {
            warn!("[gateway] failed to bind {GATEWAY_BIND_V4}: {err}");
        }
    }
    match TcpListener::bind(GATEWAY_BIND_V6).await {
        Ok(listener) => {
            info!("[gateway] listening on {GATEWAY_BIND_V6}");
            listeners.push(listener);
        }
        Err(err) => {
            warn!("[gateway] failed to bind {GATEWAY_BIND_V6}: {err}");
        }
    }
    if listeners.is_empty() {
        warn!("[gateway] server disabled: failed to bind any loopback address");
        return;
    }

    info!(
        "[gateway] server started with {} listener(s)",
        listeners.len()
    );

    let tracker = Arc::new(Mutex::new(ConnectionTracker::new()));
    let mut accept_loops = JoinSet::new();

    for listener in listeners {
        let app_handle = app.clone();
        let tracker_clone = tracker.clone();
        let shutdown_rx = shutdown_rx.clone();
        accept_loops.spawn(async move {
            run_accept_loop(listener, app_handle, tracker_clone, shutdown_rx).await;
        });
    }

    loop {
        tokio::select! {
            join_result = accept_loops.join_next(), if !accept_loops.is_empty() => {
                if let Some(Err(error)) = join_result {
                    debug!("[gateway] accept loop task failed: {error}");
                }
            }
            _ = shutdown_rx.changed() => {
                info!("[gateway] server stopped by lifecycle shutdown");
                break;
            }
            else => break,
        }
    }

    accept_loops.shutdown().await;
}

async fn run_accept_loop(
    listener: TcpListener,
    app: tauri::AppHandle,
    tracker: Arc<Mutex<ConnectionTracker>>,
    mut shutdown_rx: watch::Receiver<Option<TaskShutdownReason>>,
) {
    let listener_addr = listener.local_addr().ok();
    if let Some(addr) = listener_addr {
        info!("[gateway] accept loop running on {addr}");
    }

    let mut connections = JoinSet::new();

    loop {
        tokio::select! {
            accept_result = listener.accept() => {
                let (stream, peer) = match accept_result {
                    Ok(v) => v,
                    Err(err) => {
                        warn!("[gateway] accept failed: {err}");
                        continue;
                    }
                };

                if !peer.ip().is_loopback() {
                    warn!(
                        "[gateway] rejected non-loopback connection from {}",
                        peer.ip()
                    );
                    continue;
                }

                let peer_ip = peer.ip();

                let acquired = match tracker.lock() {
                    Ok(mut tracker_guard) => tracker_guard.try_acquire(peer_ip),
                    Err(_) => {
                        warn!("[gateway] rate-limit tracker mutex poisoned");
                        false
                    }
                };
                if !acquired {
                    warn!("[gateway] rejected connection due to rate limit: {peer_ip}");
                    continue;
                }

                let app_handle = app.clone();
                let tracker_clone = tracker.clone();

                connections.spawn(async move {
                    let _guard = ConnectionGuard {
                        tracker: tracker_clone,
                        ip: peer_ip,
                    };

                    let result = perform_handshake(stream, &app_handle).await;
                    let Some(hs) = result else {
                        debug!("[gateway] handshake rejected from peer {peer_ip}");
                        return;
                    };

                    info!(
                        "[gateway] handshake success from peer {peer_ip}, extension_id={}",
                        hs.ext_id
                    );

                    handle_extension_session(hs.transport, hs.ext_id, app_handle, hs.write, hs.read).await;
                });
            }
            join_result = connections.join_next(), if !connections.is_empty() => {
                if let Some(Err(error)) = join_result {
                    debug!("[gateway] connection task failed: {error}");
                }
            }
            _ = shutdown_rx.changed() => {
                if let Some(addr) = listener_addr {
                    info!("[gateway] accept loop stopped by lifecycle shutdown on {addr}");
                } else {
                    info!("[gateway] accept loop stopped by lifecycle shutdown");
                }
                break;
            }
        }
    }

    connections.shutdown().await;
}

struct ConnectionGuard {
    tracker: Arc<Mutex<ConnectionTracker>>,
    ip: IpAddr,
}

impl Drop for ConnectionGuard {
    fn drop(&mut self) {
        match self.tracker.lock() {
            Ok(mut guard) => guard.release(self.ip),
            Err(_) => warn!("[gateway] rate-limit tracker mutex poisoned during release"),
        }
    }
}

#[cfg(test)]
#[path = "server_tests.rs"]
mod tests;
