use std::net::IpAddr;
use std::sync::Arc;

use tokio::net::TcpListener;
use tokio::sync::Mutex;
use tracing::{debug, info, warn};

use super::handshake::perform_handshake;
use super::rate_limit::ConnectionTracker;
use super::session::handle_extension_session;

pub const GATEWAY_BIND_V4: &str = "127.0.0.1:8003";
pub const GATEWAY_BIND_V6: &str = "[::1]:8003";

pub fn spawn_gateway_server(app: tauri::AppHandle) {
    tauri::async_runtime::spawn(async move {
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

        for listener in listeners {
            let app_handle = app.clone();
            let tracker_clone = tracker.clone();
            tauri::async_runtime::spawn(async move {
                run_accept_loop(listener, app_handle, tracker_clone).await;
            });
        }
    });
}

async fn run_accept_loop(
    listener: TcpListener,
    app: tauri::AppHandle,
    tracker: Arc<Mutex<ConnectionTracker>>,
) {
    let listener_addr = listener.local_addr().ok();
    if let Some(addr) = listener_addr {
        info!("[gateway] accept loop running on {addr}");
    }

    loop {
        let (stream, peer) = match listener.accept().await {
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

        {
            let mut tracker_guard = tracker.lock().await;
            if !tracker_guard.try_acquire(peer_ip) {
                warn!("[gateway] rejected connection due to rate limit: {peer_ip}");
                continue;
            }
        }

        let app_handle = app.clone();
        let tracker_clone = tracker.clone();

        tauri::async_runtime::spawn(async move {
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
}

struct ConnectionGuard {
    tracker: Arc<Mutex<ConnectionTracker>>,
    ip: IpAddr,
}

impl Drop for ConnectionGuard {
    fn drop(&mut self) {
        let tracker = self.tracker.clone();
        let ip = self.ip;
        tauri::async_runtime::spawn(async move {
            let mut guard = tracker.lock().await;
            guard.release(ip);
        });
    }
}

#[cfg(test)]
#[path = "server_tests.rs"]
mod tests;
