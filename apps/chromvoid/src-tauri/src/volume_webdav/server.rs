use std::convert::Infallible;
use std::net::SocketAddr;
use std::sync::{Arc, Mutex};
use std::time::Duration;

use dav_server::fakels::FakeLs;
use dav_server::DavHandler;
use hyper::server::conn::http1;
use hyper::service::service_fn;
use hyper_util::rt::TokioIo;
use tokio::net::TcpListener;
use tokio::sync::oneshot;
use tokio::task::{JoinHandle, JoinSet};
use tracing::{debug, info, warn};

use crate::core_adapter::CoreAdapter;

use super::filesystem::CatalogDavFs;
use super::request_io::WebDavRequestIoRuntimeState;

const WEBDAV_REQUEST_IO_SHUTDOWN_GRACE: Duration = Duration::from_secs(1);

#[cfg(target_os = "macos")]
fn macos_unmount_webdav_by_addr_best_effort(addr: SocketAddr) {
    use std::ffi::OsString;

    let needle = format!("http://{}:{}/", addr.ip(), addr.port());

    let out = match crate::macos_external::run_output(
        "mount",
        vec![OsString::from("-t"), OsString::from("webdav")],
    ) {
        Ok(v) => v,
        Err(_) => return,
    };

    if !out.status.success() {
        return;
    }

    let text = String::from_utf8_lossy(&out.stdout);
    for line in text.lines() {
        if !line.contains(&needle) {
            continue;
        }
        let Some(on_pos) = line.find(" on ") else {
            continue;
        };
        let rest = &line[on_pos + 4..];
        let mountpoint = match rest.rfind(" (") {
            Some(p) => &rest[..p],
            None => rest.trim(),
        };
        if mountpoint.is_empty() {
            continue;
        }
        let _ = crate::macos_external::run_output("umount", vec![OsString::from(mountpoint)]);
    }
}

#[derive(Debug)]
pub struct WebDavServerHandle {
    pub addr: SocketAddr,
    pub(super) shutdown_tx: Option<oneshot::Sender<()>>,
    pub(super) task: Option<JoinHandle<()>>,
    pub(super) request_io_runtime: Arc<WebDavRequestIoRuntimeState>,
}

impl WebDavServerHandle {
    pub fn url(&self) -> String {
        format!("http://{}:{}", self.addr.ip(), self.addr.port())
    }

    pub fn shutdown(&mut self) {
        self.request_io_runtime.request_shutdown();
        if let Some(tx) = self.shutdown_tx.take() {
            let _ = tx.send(());
        }
    }

    pub async fn join(mut self) {
        #[cfg(target_os = "macos")]
        crate::commands::volume_ops::macos_find_and_unmount_webdav(&self.addr).await;

        self.shutdown();
        if let Some(task) = self.task.take() {
            let _ = task.await;
        }
        if let Err(error) = self
            .request_io_runtime
            .shutdown_with_grace(WEBDAV_REQUEST_IO_SHUTDOWN_GRACE)
            .await
        {
            warn!("webdav: request IO runtime shutdown failed: {error}");
        }
    }
}

impl Drop for WebDavServerHandle {
    fn drop(&mut self) {
        #[cfg(target_os = "macos")]
        macos_unmount_webdav_by_addr_best_effort(self.addr);

        self.shutdown();
    }
}

pub async fn start_webdav_server<R: tauri::Runtime>(
    app: tauri::AppHandle<R>,
    adapter: Arc<Mutex<Box<dyn CoreAdapter>>>,
) -> Result<WebDavServerHandle, String> {
    let request_io_runtime = Arc::new(WebDavRequestIoRuntimeState::new());
    let fs = CatalogDavFs::new(app.clone(), adapter, request_io_runtime.clone());
    let dav = DavHandler::builder()
        .filesystem(Box::new(fs))
        .locksystem(FakeLs::new())
        .build_handler();

    let listener = TcpListener::bind(("127.0.0.1", 0))
        .await
        .map_err(|e| format!("webdav bind failed: {e}"))?;
    let addr = listener
        .local_addr()
        .map_err(|e| format!("webdav local_addr failed: {e}"))?;
    if !addr.ip().is_loopback() {
        return Err("webdav must bind to loopback".to_string());
    }
    info!("webdav: listening on {}", addr);

    let (shutdown_tx, mut shutdown_rx) = oneshot::channel::<()>();

    let task = tokio::spawn(async move {
        let mut connections = JoinSet::new();

        loop {
            tokio::select! {
                _ = &mut shutdown_rx => {
                    info!("webdav: shutdown requested");
                    break;
                }
                accept = listener.accept() => {
                    let (stream, _) = match accept {
                        Ok(v) => v,
                        Err(e) => {
                            warn!("webdav: accept failed: {}", e);
                            continue;
                        }
                    };
                    let dav = dav.clone();
                    let io = TokioIo::new(stream);
                    connections.spawn(async move {
                        let svc = service_fn(move |req| {
                            let dav = dav.clone();
                            async move { Ok::<_, Infallible>(dav.handle(req).await) }
                        });
                        let _ = http1::Builder::new().serve_connection(io, svc).await;
                    });
                }
                join_result = connections.join_next(), if !connections.is_empty() => {
                    if let Some(Err(error)) = join_result {
                        debug!("webdav: connection task failed: {}", error);
                    }
                }
            }
        }

        connections.shutdown().await;
    });

    Ok(WebDavServerHandle {
        addr,
        shutdown_tx: Some(shutdown_tx),
        task: Some(task),
        request_io_runtime,
    })
}
