use std::collections::HashMap;
use std::future::Future;
use std::pin::Pin;
use std::sync::{Arc, Mutex};

#[cfg(target_os = "android")]
use std::ffi::CString;
#[cfg(unix)]
use std::io;
#[cfg(unix)]
use std::os::fd::RawFd;
#[cfg(unix)]
use std::sync::atomic::{AtomicBool, AtomicI32, Ordering};
#[cfg(unix)]
use std::task::{Context, Poll};

use chromvoid_protocol::RemoteTransport;
use serde::{Deserialize, Serialize};
use tokio::sync::oneshot;

#[cfg(unix)]
use tokio::io::{AsyncRead, AsyncWrite, ReadBuf};

#[cfg(test)]
use crate::mobile_usb::MobileUsbByteStream;
use crate::mobile_usb::{MobileUsbBridgeKind, MobileUsbRemoteTransport, SessionId};

#[cfg(target_os = "android")]
const ANDROID_LOG_INFO: libc::c_int = 4;
#[cfg(target_os = "android")]
const ANDROID_LOG_WARN: libc::c_int = 5;

#[cfg(target_os = "android")]
#[link(name = "log")]
extern "C" {
    fn __android_log_write(
        prio: libc::c_int,
        tag: *const libc::c_char,
        text: *const libc::c_char,
    ) -> libc::c_int;
}

#[cfg(target_os = "android")]
fn android_usb_log(priority: libc::c_int, message: impl AsRef<str>) {
    static TAG: &[u8] = b"ChromVoid/UsbNative\0";
    let sanitized = message.as_ref().replace('\0', " ");
    if let Ok(message) = CString::new(sanitized) {
        unsafe {
            let _ = __android_log_write(
                priority,
                TAG.as_ptr() as *const libc::c_char,
                message.as_ptr(),
            );
        }
    }
}

#[cfg(target_os = "android")]
pub(crate) fn android_usb_log_info(message: impl AsRef<str>) {
    android_usb_log(ANDROID_LOG_INFO, message);
}

#[cfg(target_os = "android")]
pub(crate) fn android_usb_log_warn(message: impl AsRef<str>) {
    android_usb_log(ANDROID_LOG_WARN, message);
}

#[cfg(not(target_os = "android"))]
pub(crate) fn android_usb_log_info(_message: impl AsRef<str>) {}

#[cfg(not(target_os = "android"))]
pub(crate) fn android_usb_log_warn(_message: impl AsRef<str>) {}

pub(crate) fn log_session_id(session_id: &str) -> String {
    crate::mobile_usb::observability::redacted_identifier(Some(session_id))
}

#[derive(Debug, Clone, PartialEq, Eq, Serialize, Deserialize)]
#[serde(rename_all = "camelCase")]
pub(crate) struct AndroidMobileUsbAccessoryIdentity {
    pub manufacturer: Option<String>,
    pub model: Option<String>,
    pub description: Option<String>,
    pub version: Option<String>,
    pub uri: Option<String>,
    pub serial: Option<String>,
}

pub(crate) struct AndroidMobileUsbHostStart {
    pub session_id: SessionId,
    pub identity: AndroidMobileUsbAccessoryIdentity,
    pub transport: Box<dyn RemoteTransport>,
    pub shutdown: oneshot::Receiver<()>,
}

#[derive(Debug, Clone, Copy, PartialEq, Eq)]
pub(crate) enum AndroidMobileUsbHostStopReason {
    Shutdown,
    TransportClosed,
    PairingComplete,
    Error,
}

impl AndroidMobileUsbHostStopReason {
    pub(crate) fn as_str(self) -> &'static str {
        match self {
            Self::Shutdown => "shutdown",
            Self::TransportClosed => "transport_closed",
            Self::PairingComplete => "pairing_complete",
            Self::Error => "error",
        }
    }
}

pub(crate) type AndroidMobileUsbHostStarter = Arc<
    dyn Fn(
            AndroidMobileUsbHostStart,
        )
            -> Pin<Box<dyn Future<Output = Result<AndroidMobileUsbHostStopReason, String>> + Send>>
        + Send
        + Sync,
>;

type AndroidMobileUsbTask = Pin<Box<dyn Future<Output = ()> + Send>>;
type AndroidMobileUsbTaskFactory = Box<dyn FnOnce() -> AndroidMobileUsbTask + Send>;
type AndroidMobileUsbTaskSpawner =
    Arc<dyn Fn(AndroidMobileUsbTaskFactory) -> Result<(), String> + Send + Sync>;

pub(crate) struct AndroidMobileUsbAccessoryRuntimeState {
    sessions: Mutex<HashMap<SessionId, AndroidMobileUsbAccessorySession>>,
    host_starter: Mutex<Option<AndroidMobileUsbHostStarter>>,
    task_spawner: Mutex<AndroidMobileUsbTaskSpawner>,
}

struct AndroidMobileUsbAccessorySession {
    state: AndroidMobileUsbAccessorySessionState,
}

enum AndroidMobileUsbAccessorySessionState {
    Active {
        shutdown: Option<oneshot::Sender<()>>,
        #[cfg(unix)]
        fd_close: Option<AndroidAccessoryFdCloseHandle>,
    },
    #[cfg(unix)]
    PendingFd {
        identity: AndroidMobileUsbAccessoryIdentity,
        fd: AndroidAccessoryDetachedFd,
    },
}

impl AndroidMobileUsbAccessoryRuntimeState {
    pub(crate) fn new() -> Self {
        Self {
            sessions: Mutex::new(HashMap::new()),
            host_starter: Mutex::new(None),
            task_spawner: Mutex::new(default_task_spawner()),
        }
    }

    pub(crate) fn set_host_starter(self: &Arc<Self>, starter: AndroidMobileUsbHostStarter) {
        *self
            .host_starter
            .lock()
            .expect("mobile usb host starter lock") = Some(starter);
        #[cfg(unix)]
        {
            tracing::info!(
                "mobile_usb_android: host starter configured pending_fd_sessions={}",
                self.pending_fd_session_count()
            );
            android_usb_log_info(format!(
                "event=host_starter_configured pending_fd_sessions={}",
                self.pending_fd_session_count()
            ));
            self.start_pending_fd_sessions();
        }
    }

    #[cfg(test)]
    fn set_task_spawner_for_tests(&self, spawner: AndroidMobileUsbTaskSpawner) {
        *self
            .task_spawner
            .lock()
            .expect("mobile usb task spawner lock") = spawner;
    }

    #[cfg(test)]
    pub(crate) fn start_stream_session<S>(
        self: &Arc<Self>,
        session_id: impl Into<String>,
        identity_json: &str,
        stream: S,
    ) -> Result<(), String>
    where
        S: MobileUsbByteStream + 'static,
    {
        let starter = self
            .host_starter
            .lock()
            .expect("mobile usb host starter lock")
            .clone()
            .ok_or_else(|| "Android mobile USB host starter is not configured".to_string())?;
        self.start_stream_session_with_starter(session_id, identity_json, stream, starter)
    }

    #[cfg(test)]
    pub(crate) fn start_stream_session_with_starter<S>(
        self: &Arc<Self>,
        session_id: impl Into<String>,
        identity_json: &str,
        stream: S,
        starter: AndroidMobileUsbHostStarter,
    ) -> Result<(), String>
    where
        S: MobileUsbByteStream + 'static,
    {
        let session_id = validate_session_id(session_id.into())?;
        let identity = parse_identity(identity_json)?;
        let shutdown = self.reserve_active_session(session_id.clone())?;
        let transport = Box::new(MobileUsbRemoteTransport::new(
            stream,
            MobileUsbBridgeKind::AndroidAoa,
        ));

        self.spawn_host_start(
            starter,
            AndroidMobileUsbHostStart {
                session_id,
                identity,
                transport,
                shutdown,
            },
        )
    }

    #[cfg(unix)]
    pub(crate) fn start_fd_session(
        self: &Arc<Self>,
        session_id: impl Into<String>,
        fd: RawFd,
        identity_json: &str,
    ) -> Result<(), String> {
        let raw_fd = validate_fd(fd)?;
        let session_id = validate_session_id(session_id.into())?;
        let identity = parse_identity(identity_json)?;
        let starter = self
            .host_starter
            .lock()
            .expect("mobile usb host starter lock")
            .clone();
        let Some(starter) = starter else {
            tracing::info!(
                "mobile_usb_android: queueing accessory fd until host starter is configured session_id={}",
                session_id
            );
            android_usb_log_info(format!(
                "event=fd_session_queued session_id={} fd={}",
                log_session_id(&session_id),
                raw_fd
            ));
            return self.reserve_pending_fd_session(session_id, identity, raw_fd);
        };
        tracing::info!(
            "mobile_usb_android: starting accessory fd with configured host starter session_id={}",
            session_id
        );
        android_usb_log_info(format!(
            "event=fd_session_starting session_id={} fd={}",
            log_session_id(&session_id),
            raw_fd
        ));
        let shutdown = self.reserve_active_session(session_id.clone())?;
        self.spawn_fd_host_start(starter, session_id, identity, shutdown, raw_fd)
    }

    pub(crate) fn stop_session(&self, session_id: &str) -> bool {
        let session = self
            .sessions
            .lock()
            .expect("mobile usb accessory sessions lock")
            .remove(session_id);
        let Some(mut session) = session else {
            return false;
        };
        if let AndroidMobileUsbAccessorySessionState::Active {
            shutdown,
            #[cfg(unix)]
            fd_close,
        } = &mut session.state
        {
            if let Some(shutdown) = shutdown.take() {
                let _ = shutdown.send(());
            }
            #[cfg(unix)]
            if let Some(fd_close) = fd_close.take() {
                fd_close.close("stop_session");
            }
        }
        true
    }

    #[cfg(test)]
    pub(crate) fn active_session_count(&self) -> usize {
        self.sessions
            .lock()
            .expect("mobile usb accessory sessions lock")
            .len()
    }

    fn reserve_active_session(
        &self,
        session_id: SessionId,
    ) -> Result<oneshot::Receiver<()>, String> {
        let (shutdown_tx, shutdown_rx) = oneshot::channel();
        let mut sessions = self
            .sessions
            .lock()
            .expect("mobile usb accessory sessions lock");
        if sessions.contains_key(&session_id) {
            return Err(format!(
                "Android mobile USB accessory session already exists: {session_id}"
            ));
        }
        sessions.insert(
            session_id,
            AndroidMobileUsbAccessorySession {
                state: AndroidMobileUsbAccessorySessionState::Active {
                    shutdown: Some(shutdown_tx),
                    #[cfg(unix)]
                    fd_close: None,
                },
            },
        );
        Ok(shutdown_rx)
    }

    #[cfg(unix)]
    fn reserve_pending_fd_session(
        &self,
        session_id: SessionId,
        identity: AndroidMobileUsbAccessoryIdentity,
        fd: RawFd,
    ) -> Result<(), String> {
        let mut sessions = self
            .sessions
            .lock()
            .expect("mobile usb accessory sessions lock");
        if sessions.contains_key(&session_id) {
            return Err(format!(
                "Android mobile USB accessory session already exists: {session_id}"
            ));
        }
        sessions.insert(
            session_id,
            AndroidMobileUsbAccessorySession {
                state: AndroidMobileUsbAccessorySessionState::PendingFd {
                    identity,
                    fd: AndroidAccessoryDetachedFd::new(fd),
                },
            },
        );
        Ok(())
    }

    fn remove_reserved_session(&self, session_id: &str) {
        let session = self
            .sessions
            .lock()
            .expect("mobile usb accessory sessions lock")
            .remove(session_id);
        #[cfg(unix)]
        if let Some(mut session) = session {
            if let AndroidMobileUsbAccessorySessionState::Active {
                fd_close: Some(fd_close),
                ..
            } = &mut session.state
            {
                fd_close.close("session_removed");
            }
        }
    }

    #[cfg(unix)]
    fn set_active_fd_close(
        &self,
        session_id: &str,
        close: AndroidAccessoryFdCloseHandle,
    ) -> Result<(), AndroidAccessoryFdCloseHandle> {
        let mut sessions = self
            .sessions
            .lock()
            .expect("mobile usb accessory sessions lock");
        let Some(session) = sessions.get_mut(session_id) else {
            return Err(close);
        };
        let AndroidMobileUsbAccessorySessionState::Active { fd_close, .. } = &mut session.state
        else {
            return Err(close);
        };
        *fd_close = Some(close);
        Ok(())
    }

    #[cfg(unix)]
    fn pending_fd_session_count(&self) -> usize {
        self.sessions
            .lock()
            .expect("mobile usb accessory sessions lock")
            .values()
            .filter(|session| {
                matches!(
                    session.state,
                    AndroidMobileUsbAccessorySessionState::PendingFd { .. }
                )
            })
            .count()
    }

    #[cfg(unix)]
    fn take_pending_fd_sessions(
        &self,
    ) -> Vec<(SessionId, AndroidMobileUsbAccessoryIdentity, RawFd)> {
        let mut sessions = self
            .sessions
            .lock()
            .expect("mobile usb accessory sessions lock");
        let pending_session_ids = sessions
            .iter()
            .filter_map(|(session_id, session)| match &session.state {
                AndroidMobileUsbAccessorySessionState::PendingFd { .. } => Some(session_id.clone()),
                AndroidMobileUsbAccessorySessionState::Active { .. } => None,
            })
            .collect::<Vec<_>>();

        pending_session_ids
            .into_iter()
            .filter_map(|session_id| {
                let session = sessions.remove(&session_id)?;
                match session.state {
                    AndroidMobileUsbAccessorySessionState::PendingFd { identity, fd } => {
                        Some((session_id, identity, fd.into_raw_fd()))
                    }
                    AndroidMobileUsbAccessorySessionState::Active { .. } => None,
                }
            })
            .collect()
    }

    #[cfg(unix)]
    fn start_pending_fd_sessions(self: &Arc<Self>) {
        let starter = self
            .host_starter
            .lock()
            .expect("mobile usb host starter lock")
            .clone();
        let Some(starter) = starter else {
            return;
        };

        for (session_id, identity, fd) in self.take_pending_fd_sessions() {
            tracing::info!(
                "mobile_usb_android: starting pending accessory fd session_id={}",
                session_id
            );
            android_usb_log_info(format!(
                "event=pending_fd_session_starting session_id={} fd={}",
                log_session_id(&session_id),
                fd
            ));
            let shutdown = match self.reserve_active_session(session_id.clone()) {
                Ok(shutdown) => shutdown,
                Err(error) => {
                    drop(AndroidAccessoryDetachedFd::new(fd));
                    tracing::warn!(
                        "mobile_usb_android: pending accessory session rejected session_id={} error={}",
                        session_id,
                        error
                    );
                    android_usb_log_warn(format!(
                        "event=pending_fd_session_rejected session_id={} error={}",
                        log_session_id(&session_id),
                        error
                    ));
                    continue;
                }
            };
            if let Err(error) = self.spawn_fd_host_start(
                starter.clone(),
                session_id.clone(),
                identity,
                shutdown,
                fd,
            ) {
                drop(AndroidAccessoryDetachedFd::new(fd));
                tracing::warn!(
                    "mobile_usb_android: pending accessory session start failed session_id={} error={}",
                    session_id,
                    error
                );
                android_usb_log_warn(format!(
                    "event=pending_fd_session_start_failed session_id={} error={}",
                    log_session_id(&session_id),
                    error
                ));
            }
        }
    }

    #[cfg(test)]
    fn spawn_host_start(
        self: &Arc<Self>,
        starter: AndroidMobileUsbHostStarter,
        start: AndroidMobileUsbHostStart,
    ) -> Result<(), String> {
        let runtime = Arc::downgrade(self);
        let session_id = start.session_id.clone();
        let spawner = self
            .task_spawner
            .lock()
            .expect("mobile usb task spawner lock")
            .clone();
        let cleanup_session_id = session_id.clone();
        let task_factory: AndroidMobileUsbTaskFactory = Box::new(move || {
            Box::pin(async move {
                let reason = run_host_start(starter, start, &session_id).await;
                if let Some(runtime) = runtime.upgrade() {
                    runtime.remove_reserved_session(&session_id);
                }
                notify_session_ended(&session_id, reason);
            })
        });

        if let Err(error) = spawner(task_factory) {
            self.remove_reserved_session(&cleanup_session_id);
            return Err(error);
        }
        Ok(())
    }

    #[cfg(unix)]
    fn spawn_fd_host_start(
        self: &Arc<Self>,
        starter: AndroidMobileUsbHostStarter,
        session_id: SessionId,
        identity: AndroidMobileUsbAccessoryIdentity,
        shutdown: oneshot::Receiver<()>,
        fd: RawFd,
    ) -> Result<(), String> {
        let runtime = Arc::downgrade(self);
        let cleanup_session_id = session_id.clone();
        let spawner = self
            .task_spawner
            .lock()
            .expect("mobile usb task spawner lock")
            .clone();
        let task_factory: AndroidMobileUsbTaskFactory = Box::new(move || {
            Box::pin(async move {
                android_usb_log_info(format!(
                    "event=fd_host_task_start session_id={} fd={}",
                    log_session_id(&session_id),
                    fd
                ));
                let fd = AndroidAccessoryDetachedFd::new(fd);
                let (stream, fd_close) =
                    match AndroidAccessoryFdStream::from_detached_fd(session_id.clone(), fd) {
                        Ok(stream) => stream,
                        Err(error) => {
                            tracing::warn!(
                            "mobile_usb_android: accessory fd setup failed session_id={} error={}",
                            session_id,
                            error
                        );
                            android_usb_log_warn(format!(
                                "event=fd_stream_setup_failed session_id={} error={}",
                                log_session_id(&session_id),
                                error
                            ));
                            if let Some(runtime) = runtime.upgrade() {
                                runtime.remove_reserved_session(&session_id);
                            }
                            notify_session_ended(
                                &session_id,
                                AndroidMobileUsbHostStopReason::Error,
                            );
                            return;
                        }
                    };
                if let Some(runtime) = runtime.upgrade() {
                    if let Err(fd_close) = runtime.set_active_fd_close(&session_id, fd_close) {
                        fd_close.close("session_inactive_before_fd_start");
                        notify_session_ended(&session_id, AndroidMobileUsbHostStopReason::Shutdown);
                        return;
                    }
                } else {
                    fd_close.close("runtime_dropped_before_fd_start");
                    return;
                }
                android_usb_log_info(format!(
                    "event=fd_stream_ready session_id={}",
                    log_session_id(&session_id)
                ));
                let transport = Box::new(MobileUsbRemoteTransport::new(
                    stream,
                    MobileUsbBridgeKind::AndroidAoa,
                ));
                let start = AndroidMobileUsbHostStart {
                    session_id: session_id.clone(),
                    identity,
                    transport,
                    shutdown,
                };
                let reason = run_host_start(starter, start, &session_id).await;
                android_usb_log_info(format!(
                    "event=fd_host_task_end session_id={} reason={}",
                    log_session_id(&session_id),
                    reason.as_str()
                ));
                if let Some(runtime) = runtime.upgrade() {
                    runtime.remove_reserved_session(&session_id);
                }
                notify_session_ended(&session_id, reason);
            })
        });

        if let Err(error) = spawner(task_factory) {
            self.remove_reserved_session(&cleanup_session_id);
            android_usb_log_warn(format!(
                "event=fd_host_task_spawn_failed session_id={} error={}",
                log_session_id(&cleanup_session_id),
                error
            ));
            return Err(error);
        }
        android_usb_log_info(format!(
            "event=fd_host_task_spawned session_id={}",
            log_session_id(&cleanup_session_id)
        ));
        Ok(())
    }
}

fn notify_session_ended(session_id: &str, reason: AndroidMobileUsbHostStopReason) {
    android_usb_log_info(format!(
        "event=native_session_ended session_id={} reason={}",
        log_session_id(session_id),
        reason.as_str()
    ));

    #[cfg(target_os = "android")]
    crate::mobile::android::native::notify_mobile_usb_accessory_session_ended(
        session_id,
        reason.as_str(),
    );

    #[cfg(not(target_os = "android"))]
    let _ = (session_id, reason);
}

async fn run_host_start(
    starter: AndroidMobileUsbHostStarter,
    start: AndroidMobileUsbHostStart,
    session_id: &str,
) -> AndroidMobileUsbHostStopReason {
    android_usb_log_info(format!(
        "event=host_starter_enter session_id={}",
        log_session_id(session_id)
    ));
    match starter(start).await {
        Ok(reason) => {
            android_usb_log_info(format!(
                "event=host_starter_exit session_id={} reason={}",
                log_session_id(session_id),
                reason.as_str()
            ));
            reason
        }
        Err(error) => {
            if is_pairing_complete_error(&error) {
                android_usb_log_info(format!(
                    "event=host_starter_pairing_complete session_id={}",
                    log_session_id(session_id)
                ));
                return AndroidMobileUsbHostStopReason::PairingComplete;
            }
            if is_transport_closed_error(&error) {
                android_usb_log_info(format!(
                    "event=host_starter_transport_closed session_id={}",
                    log_session_id(session_id)
                ));
                return AndroidMobileUsbHostStopReason::TransportClosed;
            }
            tracing::warn!(
                "mobile_usb_android: host starter failed session_id={} error={}",
                session_id,
                error
            );
            android_usb_log_warn(format!(
                "event=host_starter_failed session_id={} error={}",
                log_session_id(session_id),
                error
            ));
            AndroidMobileUsbHostStopReason::Error
        }
    }
}

fn is_pairing_complete_error(error: &str) -> bool {
    error.starts_with("unknown_peer:")
}

fn is_transport_closed_error(error: &str) -> bool {
    error.contains("transport closed")
        || error.contains("Transport closed")
        || error.contains("Broken pipe")
        || error.contains("broken pipe")
        || error.contains("UnexpectedEof")
        || error.contains("unexpected EOF")
        || error.contains("connection timed out")
        || error.contains("deadline has elapsed")
        || error.contains("TimedOut")
        || error.contains("Timeout")
        || error.contains("timeout")
        || error.contains("closed")
}

fn default_task_spawner() -> AndroidMobileUsbTaskSpawner {
    Arc::new(|task_factory| {
        tauri::async_runtime::spawn(task_factory());
        Ok(())
    })
}

fn validate_session_id(session_id: String) -> Result<String, String> {
    let session_id = session_id.trim().to_string();
    if session_id.is_empty() {
        Err("Android mobile USB accessory session id is empty".to_string())
    } else {
        Ok(session_id)
    }
}

#[cfg(unix)]
fn validate_fd(fd: RawFd) -> Result<RawFd, String> {
    if fd < 0 {
        Err("Android USB accessory fd is negative".to_string())
    } else {
        Ok(fd)
    }
}

fn parse_identity(identity_json: &str) -> Result<AndroidMobileUsbAccessoryIdentity, String> {
    serde_json::from_str(identity_json)
        .map_err(|error| format!("Invalid Android USB accessory identity JSON: {error}"))
}

pub(crate) fn shared_android_usb_accessory_runtime() -> Arc<AndroidMobileUsbAccessoryRuntimeState> {
    static RUNTIME: std::sync::OnceLock<Arc<AndroidMobileUsbAccessoryRuntimeState>> =
        std::sync::OnceLock::new();
    RUNTIME
        .get_or_init(|| Arc::new(AndroidMobileUsbAccessoryRuntimeState::new()))
        .clone()
}

#[cfg(unix)]
const ACCESSORY_FD_READ_BUFFER_BYTES: usize = 16 * 1024;
#[cfg(unix)]
const ACCESSORY_FD_TRANSIENT_READ_RETRY: std::time::Duration = std::time::Duration::from_millis(5);

/// Full-duplex async wrapper over a raw Android USB accessory file descriptor.
///
/// The accessory character device (`f_accessory`) only accepts host OUT data
/// while a `read()` is posted on it, so a dedicated background reader keeps a
/// read continuously in flight (mirroring the desktop `AndroidAoaByteStream`).
/// Writes target the IN endpoint and run independently of reads. Without this,
/// any gap between records on the accessory side — e.g. the post-handshake
/// peer-store write before the RPC loop starts reading — leaves no posted read,
/// so the host's first record-layer write stalls until its bulk-write timeout
/// fires (`ERR_USB_MOBILE_RECORD_LAYER_FAILED`).
#[cfg(unix)]
pub(crate) struct AndroidAccessoryFdStream {
    session_id: SessionId,
    inner: tokio::io::DuplexStream,
    fd: Arc<AccessoryFd>,
    closed: Arc<AtomicBool>,
    pending_write: Option<tokio::task::JoinHandle<io::Result<usize>>>,
}

#[cfg(unix)]
impl AndroidAccessoryFdStream {
    #[cfg(test)]
    pub(crate) unsafe fn from_raw_fd(fd: RawFd) -> io::Result<Self> {
        if fd < 0 {
            return Err(io::Error::new(
                io::ErrorKind::InvalidInput,
                "Android USB accessory fd is negative",
            ));
        }
        Self::from_detached_fd("test-fd".to_string(), AndroidAccessoryDetachedFd::new(fd))
            .map(|(stream, _close)| stream)
    }

    fn from_detached_fd(
        session_id: SessionId,
        fd: AndroidAccessoryDetachedFd,
    ) -> io::Result<(Self, AndroidAccessoryFdCloseHandle)> {
        let raw_fd = fd.into_raw_fd();
        if let Err(error) = set_fd_nonblocking(raw_fd) {
            unsafe {
                libc::close(raw_fd);
            }
            return Err(error);
        }
        let fd = Arc::new(AccessoryFd::new(raw_fd));
        let closed = Arc::new(AtomicBool::new(false));
        let buffer_size = (crate::mobile_usb::MAX_USB_REMOTE_RECORD_BYTES * 2)
            .max(ACCESSORY_FD_READ_BUFFER_BYTES);
        let (app_stream, worker_stream) = tokio::io::duplex(buffer_size);
        let (_worker_read, worker_write) = tokio::io::split(worker_stream);

        android_usb_log_info(format!(
            "event=fd_stream_create session_id={} fd={} buffer_bytes={}",
            log_session_id(&session_id),
            fd.raw_fd_for_log(),
            buffer_size
        ));
        spawn_accessory_fd_read_worker(
            session_id.clone(),
            fd.clone(),
            closed.clone(),
            worker_write,
        );
        let close_handle = AndroidAccessoryFdCloseHandle {
            session_id: session_id.clone(),
            fd: fd.clone(),
            closed: closed.clone(),
        };

        Ok((
            Self {
                session_id,
                inner: app_stream,
                fd,
                closed,
                pending_write: None,
            },
            close_handle,
        ))
    }

    fn poll_pending_write(&mut self, cx: &mut Context<'_>) -> Poll<io::Result<usize>> {
        let Some(handle) = self.pending_write.as_mut() else {
            return Poll::Ready(Ok(0));
        };

        match Pin::new(handle).poll(cx) {
            Poll::Pending => Poll::Pending,
            Poll::Ready(result) => {
                self.pending_write = None;
                match result {
                    Ok(Ok(len)) => {
                        android_usb_log_info(format!(
                            "event=fd_write_done session_id={} bytes={}",
                            log_session_id(&self.session_id),
                            len
                        ));
                        Poll::Ready(Ok(len))
                    }
                    Ok(Err(error)) => {
                        self.closed.store(true, Ordering::SeqCst);
                        android_usb_log_warn(format!(
                            "event=fd_write_error session_id={} kind={:?} error={}",
                            log_session_id(&self.session_id),
                            error.kind(),
                            error
                        ));
                        Poll::Ready(Err(error))
                    }
                    Err(error) => {
                        self.closed.store(true, Ordering::SeqCst);
                        android_usb_log_warn(format!(
                            "event=fd_write_join_error session_id={} error={}",
                            log_session_id(&self.session_id),
                            error
                        ));
                        Poll::Ready(Err(io::Error::other(format!(
                            "Android accessory fd write worker failed: {error}"
                        ))))
                    }
                }
            }
        }
    }
}

/// Owns the accessory raw fd and closes it once every reader/writer holder is
/// dropped, so an in-flight blocking read or write never races a `close()`.
#[cfg(unix)]
struct AccessoryFd {
    fd: AtomicI32,
}

#[cfg(unix)]
impl AccessoryFd {
    fn new(fd: RawFd) -> Self {
        Self {
            fd: AtomicI32::new(fd),
        }
    }

    fn raw_fd(&self) -> io::Result<RawFd> {
        let fd = self.fd.load(Ordering::SeqCst);
        if fd < 0 {
            Err(io::Error::new(
                io::ErrorKind::BrokenPipe,
                "Android accessory fd is closed",
            ))
        } else {
            Ok(fd)
        }
    }

    fn raw_fd_for_log(&self) -> RawFd {
        self.fd.load(Ordering::SeqCst)
    }

    fn close(&self) -> Option<RawFd> {
        let fd = self.fd.swap(-1, Ordering::SeqCst);
        if fd < 0 {
            return None;
        }
        unsafe {
            libc::close(fd);
        }
        Some(fd)
    }
}

#[cfg(unix)]
impl Drop for AccessoryFd {
    fn drop(&mut self) {
        let _ = self.close();
    }
}

#[cfg(unix)]
#[derive(Clone)]
struct AndroidAccessoryFdCloseHandle {
    session_id: SessionId,
    fd: Arc<AccessoryFd>,
    closed: Arc<AtomicBool>,
}

#[cfg(unix)]
impl AndroidAccessoryFdCloseHandle {
    fn close(&self, reason: &str) {
        self.closed.store(true, Ordering::SeqCst);
        let closed_fd = self.fd.close();
        android_usb_log_info(format!(
            "event=fd_close session_id={} reason={} fd={} closed={}",
            log_session_id(&self.session_id),
            reason,
            closed_fd.unwrap_or(-1),
            closed_fd.is_some()
        ));
    }
}

#[cfg(unix)]
fn spawn_accessory_fd_read_worker(
    session_id: SessionId,
    fd: Arc<AccessoryFd>,
    closed: Arc<AtomicBool>,
    mut writer: tokio::io::WriteHalf<tokio::io::DuplexStream>,
) {
    use tokio::io::AsyncWriteExt;

    tokio::spawn(async move {
        android_usb_log_info(format!(
            "event=fd_read_worker_start session_id={} fd={}",
            log_session_id(&session_id),
            fd.raw_fd_for_log()
        ));
        loop {
            if closed.load(Ordering::SeqCst) {
                android_usb_log_info(format!(
                    "event=fd_read_worker_closed session_id={} reason=closed_flag",
                    log_session_id(&session_id)
                ));
                let _ = writer.shutdown().await;
                break;
            }

            let fd = fd.clone();
            let read_closed = closed.clone();
            let read_session_id = session_id.clone();
            android_usb_log_info(format!(
                "event=fd_read_posted session_id={} fd={} max_bytes={}",
                log_session_id(&read_session_id),
                fd.raw_fd_for_log(),
                ACCESSORY_FD_READ_BUFFER_BYTES
            ));
            let result = tokio::task::spawn_blocking(move || {
                let mut buf = vec![0_u8; ACCESSORY_FD_READ_BUFFER_BYTES];
                let raw_fd = fd.raw_fd()?;
                let len = blocking_read_accessory_fd(raw_fd, &mut buf, read_closed.as_ref())?;
                buf.truncate(len);
                Ok::<_, io::Error>(buf)
            })
            .await;

            match result {
                // EOF: the accessory detached or closed its end of the pipe.
                Ok(Ok(bytes)) if bytes.is_empty() => {
                    closed.store(true, Ordering::SeqCst);
                    android_usb_log_info(format!(
                        "event=fd_read_eof session_id={}",
                        log_session_id(&session_id)
                    ));
                    let _ = writer.shutdown().await;
                    break;
                }
                Ok(Ok(bytes)) => {
                    android_usb_log_info(format!(
                        "event=fd_read_done session_id={} bytes={}",
                        log_session_id(&session_id),
                        bytes.len()
                    ));
                    if writer.write_all(&bytes).await.is_err() {
                        closed.store(true, Ordering::SeqCst);
                        android_usb_log_warn(format!(
                            "event=fd_read_pipe_write_error session_id={} bytes={}",
                            log_session_id(&session_id),
                            bytes.len()
                        ));
                        break;
                    }
                    android_usb_log_info(format!(
                        "event=fd_read_pipe_write_done session_id={} bytes={}",
                        log_session_id(&session_id),
                        bytes.len()
                    ));
                    tokio::task::yield_now().await;
                }
                Ok(Err(error)) => {
                    closed.store(true, Ordering::SeqCst);
                    android_usb_log_warn(format!(
                        "event=fd_read_error session_id={} kind={:?} error={}",
                        log_session_id(&session_id),
                        error.kind(),
                        error
                    ));
                    let _ = writer.shutdown().await;
                    break;
                }
                Err(error) => {
                    closed.store(true, Ordering::SeqCst);
                    android_usb_log_warn(format!(
                        "event=fd_read_join_error session_id={} error={}",
                        log_session_id(&session_id),
                        error
                    ));
                    let _ = writer.shutdown().await;
                    break;
                }
            }
        }
        android_usb_log_info(format!(
            "event=fd_read_worker_end session_id={}",
            log_session_id(&session_id)
        ));
    });
}

#[cfg(unix)]
fn blocking_read_accessory_fd(fd: RawFd, buf: &mut [u8], closed: &AtomicBool) -> io::Result<usize> {
    blocking_read_accessory_fd_with(
        buf,
        closed,
        |buf| {
            let read = unsafe { libc::read(fd, buf.as_mut_ptr() as *mut libc::c_void, buf.len()) };
            if read < 0 {
                Err(io::Error::last_os_error())
            } else {
                Ok(read as usize)
            }
        },
        || std::thread::sleep(ACCESSORY_FD_TRANSIENT_READ_RETRY),
    )
}

#[cfg(unix)]
fn blocking_read_accessory_fd_with<R, S>(
    buf: &mut [u8],
    closed: &AtomicBool,
    mut read_once: R,
    mut sleep_before_retry: S,
) -> io::Result<usize>
where
    R: FnMut(&mut [u8]) -> io::Result<usize>,
    S: FnMut(),
{
    loop {
        if closed.load(Ordering::SeqCst) {
            return Ok(0);
        }
        match read_once(buf) {
            Ok(read) => return Ok(read),
            Err(error) if error.kind() == io::ErrorKind::Interrupted => continue,
            Err(error) if error.kind() == io::ErrorKind::WouldBlock => {
                sleep_before_retry();
            }
            Err(error) if is_transient_accessory_read_error(&error) => {
                sleep_before_retry();
            }
            Err(error) => return Err(error),
        }
    }
}

#[cfg(unix)]
fn is_transient_accessory_read_error(error: &io::Error) -> bool {
    error.raw_os_error() == Some(libc::EIO)
}

#[cfg(unix)]
fn set_fd_nonblocking(fd: RawFd) -> io::Result<()> {
    let flags = unsafe { libc::fcntl(fd, libc::F_GETFL) };
    if flags < 0 {
        return Err(io::Error::last_os_error());
    }
    let result = unsafe { libc::fcntl(fd, libc::F_SETFL, flags | libc::O_NONBLOCK) };
    if result < 0 {
        Err(io::Error::last_os_error())
    } else {
        Ok(())
    }
}

#[cfg(unix)]
fn blocking_write_all_accessory_fd(fd: RawFd, mut data: &[u8]) -> io::Result<()> {
    while !data.is_empty() {
        let written = unsafe { libc::write(fd, data.as_ptr() as *const libc::c_void, data.len()) };
        if written < 0 {
            let error = io::Error::last_os_error();
            if error.kind() == io::ErrorKind::Interrupted {
                continue;
            }
            return Err(error);
        }
        if written == 0 {
            return Err(io::Error::new(
                io::ErrorKind::WriteZero,
                "Android accessory fd wrote zero bytes",
            ));
        }
        data = &data[written as usize..];
    }
    Ok(())
}

#[cfg(unix)]
struct AndroidAccessoryDetachedFd {
    fd: Option<RawFd>,
}

#[cfg(unix)]
impl AndroidAccessoryDetachedFd {
    fn new(fd: RawFd) -> Self {
        Self { fd: Some(fd) }
    }

    fn into_raw_fd(mut self) -> RawFd {
        self.fd
            .take()
            .expect("Android accessory fd already consumed")
    }
}

#[cfg(unix)]
impl Drop for AndroidAccessoryDetachedFd {
    fn drop(&mut self) {
        if let Some(fd) = self.fd.take() {
            unsafe {
                libc::close(fd);
            }
        }
    }
}

#[cfg(unix)]
impl AsyncRead for AndroidAccessoryFdStream {
    fn poll_read(
        mut self: Pin<&mut Self>,
        cx: &mut Context<'_>,
        buf: &mut ReadBuf<'_>,
    ) -> Poll<io::Result<()>> {
        Pin::new(&mut self.inner).poll_read(cx, buf)
    }
}

#[cfg(unix)]
impl AsyncWrite for AndroidAccessoryFdStream {
    fn poll_write(
        mut self: Pin<&mut Self>,
        cx: &mut Context<'_>,
        data: &[u8],
    ) -> Poll<io::Result<usize>> {
        if self.closed.load(Ordering::SeqCst) {
            return Poll::Ready(Err(io::Error::new(
                io::ErrorKind::BrokenPipe,
                "Android accessory fd is closed",
            )));
        }
        if self.pending_write.is_some() {
            return self.poll_pending_write(cx);
        }
        if data.is_empty() {
            return Poll::Ready(Ok(0));
        }

        let fd = self.fd.clone();
        let closed = self.closed.clone();
        let bytes = data.to_vec();
        android_usb_log_info(format!(
            "event=fd_write_posted session_id={} fd={} bytes={}",
            log_session_id(&self.session_id),
            fd.raw_fd_for_log(),
            bytes.len()
        ));
        self.pending_write = Some(tokio::task::spawn_blocking(move || {
            let len = bytes.len();
            let raw_fd = fd.raw_fd()?;
            match blocking_write_all_accessory_fd(raw_fd, &bytes) {
                Ok(()) => Ok(len),
                Err(error) => {
                    closed.store(true, Ordering::SeqCst);
                    Err(error)
                }
            }
        }));
        self.poll_pending_write(cx)
    }

    fn poll_flush(mut self: Pin<&mut Self>, cx: &mut Context<'_>) -> Poll<io::Result<()>> {
        match self.poll_pending_write(cx) {
            Poll::Pending => Poll::Pending,
            Poll::Ready(Ok(_)) => Poll::Ready(Ok(())),
            Poll::Ready(Err(error)) => Poll::Ready(Err(error)),
        }
    }

    fn poll_shutdown(mut self: Pin<&mut Self>, cx: &mut Context<'_>) -> Poll<io::Result<()>> {
        match self.poll_pending_write(cx) {
            Poll::Pending => return Poll::Pending,
            Poll::Ready(Ok(_)) => {}
            Poll::Ready(Err(error)) => return Poll::Ready(Err(error)),
        }
        self.closed.store(true, Ordering::SeqCst);
        let closed_fd = self.fd.close();
        android_usb_log_info(format!(
            "event=fd_shutdown session_id={} fd={} closed={}",
            log_session_id(&self.session_id),
            closed_fd.unwrap_or(-1),
            closed_fd.is_some()
        ));
        Poll::Ready(Ok(()))
    }
}

#[cfg(unix)]
impl Drop for AndroidAccessoryFdStream {
    fn drop(&mut self) {
        self.closed.store(true, Ordering::SeqCst);
        let closed_fd = self.fd.close();
        android_usb_log_info(format!(
            "event=fd_stream_drop session_id={} fd={} closed={}",
            log_session_id(&self.session_id),
            closed_fd.unwrap_or(-1),
            closed_fd.is_some()
        ));
    }
}

#[cfg(test)]
mod tests {
    use std::sync::atomic::{AtomicBool, Ordering};

    use chromvoid_protocol::TransportType;
    use tokio::io::{AsyncReadExt, AsyncWriteExt};

    use super::*;

    const IDENTITY_JSON: &str = r#"{
        "manufacturer":"ChromVoid",
        "model":"ChromVoid Mobile Host",
        "description":"ChromVoid USB Remote",
        "version":"1",
        "uri":"https://chromvoid.com",
        "serial":"device-1"
    }"#;

    fn host_starter<F, Fut>(f: F) -> AndroidMobileUsbHostStarter
    where
        F: Fn(AndroidMobileUsbHostStart) -> Fut + Send + Sync + 'static,
        Fut: Future<Output = Result<(), String>> + Send + 'static,
    {
        Arc::new(move |start| {
            let fut = f(start);
            Box::pin(async move { fut.await.map(|()| AndroidMobileUsbHostStopReason::Shutdown) })
        })
    }

    fn host_starter_with_reason<F, Fut>(f: F) -> AndroidMobileUsbHostStarter
    where
        F: Fn(AndroidMobileUsbHostStart) -> Fut + Send + Sync + 'static,
        Fut: Future<Output = Result<AndroidMobileUsbHostStopReason, String>> + Send + 'static,
    {
        Arc::new(move |start| {
            let fut = f(start);
            Box::pin(fut)
        })
    }

    fn tokio_task_spawner() -> AndroidMobileUsbTaskSpawner {
        Arc::new(|task_factory| {
            tokio::spawn(task_factory());
            Ok(())
        })
    }

    fn rejecting_task_spawner() -> AndroidMobileUsbTaskSpawner {
        Arc::new(|_task_factory| Err("test spawner unavailable".to_string()))
    }

    fn runtime_for_tests() -> Arc<AndroidMobileUsbAccessoryRuntimeState> {
        let runtime = Arc::new(AndroidMobileUsbAccessoryRuntimeState::new());
        runtime.set_task_spawner_for_tests(tokio_task_spawner());
        runtime
    }

    #[tokio::test]
    async fn stream_session_exposes_record_transport_to_host_starter() {
        let runtime = runtime_for_tests();
        let (client, host) = tokio::io::duplex(4096);
        let (payload_tx, payload_rx) = oneshot::channel();
        let payload_tx = Arc::new(Mutex::new(Some(payload_tx)));

        let starter = host_starter(move |start| {
            let payload_tx = payload_tx
                .lock()
                .expect("payload sender lock")
                .take()
                .expect("payload sender");
            async move {
                assert_eq!(start.session_id, "session-1");
                assert_eq!(start.identity.serial.as_deref(), Some("device-1"));
                assert_eq!(start.transport.transport_type(), TransportType::UsbMobile);
                let mut transport = start.transport;
                let payload = transport.recv().await.map_err(|error| error.to_string())?;
                payload_tx
                    .send(payload)
                    .map_err(|_| "payload send failed")?;
                Ok(())
            }
        });

        runtime
            .start_stream_session_with_starter("session-1", IDENTITY_JSON, host, starter)
            .expect("start stream session");

        let mut client_transport =
            MobileUsbRemoteTransport::new(client, MobileUsbBridgeKind::AndroidAoa);
        client_transport
            .send(b"hello")
            .await
            .expect("send client payload");

        assert_eq!(
            payload_rx.await.expect("payload delivered"),
            b"hello".to_vec()
        );
    }

    #[tokio::test]
    async fn configured_starter_path_starts_session() {
        let runtime = runtime_for_tests();
        let called = Arc::new(AtomicBool::new(false));
        let called_for_starter = called.clone();

        runtime.set_host_starter(host_starter(move |_start| {
            let called_for_starter = called_for_starter.clone();
            async move {
                called_for_starter.store(true, Ordering::SeqCst);
                Ok(())
            }
        }));

        let (_client, host) = tokio::io::duplex(4096);
        runtime
            .start_stream_session("session-configured", IDENTITY_JSON, host)
            .expect("start with configured starter");
        tokio::task::yield_now().await;

        assert!(called.load(Ordering::SeqCst));
        assert_eq!(runtime.active_session_count(), 0);
    }

    #[tokio::test]
    async fn host_starter_can_return_explicit_stop_reason() {
        let starter = host_starter_with_reason(|_start| async {
            Ok(AndroidMobileUsbHostStopReason::TransportClosed)
        });
        let (_client, host) = tokio::io::duplex(4096);
        let start = AndroidMobileUsbHostStart {
            session_id: "session-reason".to_string(),
            identity: parse_identity(IDENTITY_JSON).expect("identity"),
            transport: Box::new(MobileUsbRemoteTransport::new(
                host,
                MobileUsbBridgeKind::AndroidAoa,
            )),
            shutdown: oneshot::channel().1,
        };

        let reason = run_host_start(starter, start, "session-reason").await;

        assert_eq!(reason, AndroidMobileUsbHostStopReason::TransportClosed);
    }

    #[tokio::test]
    async fn host_starter_unknown_peer_error_is_pairing_complete() {
        let starter =
            host_starter_with_reason(|_start| async { Err("unknown_peer:abcd1234".to_string()) });
        let (_client, host) = tokio::io::duplex(4096);
        let start = AndroidMobileUsbHostStart {
            session_id: "session-pairing".to_string(),
            identity: parse_identity(IDENTITY_JSON).expect("identity"),
            transport: Box::new(MobileUsbRemoteTransport::new(
                host,
                MobileUsbBridgeKind::AndroidAoa,
            )),
            shutdown: oneshot::channel().1,
        };

        let reason = run_host_start(starter, start, "session-pairing").await;

        assert_eq!(reason, AndroidMobileUsbHostStopReason::PairingComplete);
    }

    #[tokio::test]
    async fn host_starter_transport_closed_error_is_recoverable() {
        let starter = host_starter_with_reason(|_start| async {
            Err("noise msg1 recv: transport closed".to_string())
        });
        let (_client, host) = tokio::io::duplex(4096);
        let start = AndroidMobileUsbHostStart {
            session_id: "session-closed".to_string(),
            identity: parse_identity(IDENTITY_JSON).expect("identity"),
            transport: Box::new(MobileUsbRemoteTransport::new(
                host,
                MobileUsbBridgeKind::AndroidAoa,
            )),
            shutdown: oneshot::channel().1,
        };

        let reason = run_host_start(starter, start, "session-closed").await;

        assert_eq!(reason, AndroidMobileUsbHostStopReason::TransportClosed);
    }

    #[tokio::test]
    async fn host_starter_timeout_error_is_recoverable() {
        let starter =
            host_starter_with_reason(|_start| async { Err("connection timed out".to_string()) });
        let (_client, host) = tokio::io::duplex(4096);
        let start = AndroidMobileUsbHostStart {
            session_id: "session-timeout".to_string(),
            identity: parse_identity(IDENTITY_JSON).expect("identity"),
            transport: Box::new(MobileUsbRemoteTransport::new(
                host,
                MobileUsbBridgeKind::AndroidAoa,
            )),
            shutdown: oneshot::channel().1,
        };

        let reason = run_host_start(starter, start, "session-timeout").await;

        assert_eq!(reason, AndroidMobileUsbHostStopReason::TransportClosed);
    }

    #[tokio::test]
    async fn android_host_starter_setup_registers_production_starter() {
        let runtime = runtime_for_tests();
        runtime.set_task_spawner_for_tests(rejecting_task_spawner());
        let (_client_before, host_before) = tokio::io::duplex(4096);
        let before_error = runtime
            .start_stream_session("session-before-setup", IDENTITY_JSON, host_before)
            .expect_err("starter should be required before setup");
        assert_eq!(
            before_error,
            "Android mobile USB host starter is not configured"
        );

        super::super::configure_usb_accessory_host_starter_for_runtime(
            runtime.clone(),
            Arc::new(crate::network::mobile_acceptor::MobileAcceptorRuntimeState::new()),
            None,
            tempfile::tempdir().expect("tempdir").path().to_path_buf(),
        );

        let (_client_after, host_after) = tokio::io::duplex(4096);
        let after_error = runtime
            .start_stream_session("session-after-setup", IDENTITY_JSON, host_after)
            .expect_err("configured starter should reach task spawner");
        assert_eq!(after_error, "test spawner unavailable");
        assert_eq!(runtime.active_session_count(), 0);
    }

    #[tokio::test]
    async fn duplicate_session_is_rejected_before_second_start() {
        let runtime = runtime_for_tests();
        let starter = host_starter(|start| async move {
            let _ = start.shutdown.await;
            Ok(())
        });
        let (_client_a, host_a) = tokio::io::duplex(4096);
        runtime
            .start_stream_session_with_starter(
                "session-dup",
                IDENTITY_JSON,
                host_a,
                starter.clone(),
            )
            .expect("first start");

        let (_client_b, host_b) = tokio::io::duplex(4096);
        let error = runtime
            .start_stream_session_with_starter("session-dup", IDENTITY_JSON, host_b, starter)
            .expect_err("duplicate rejected");

        assert!(error.contains("already exists"));
        assert_eq!(runtime.active_session_count(), 1);
        assert!(runtime.stop_session("session-dup"));
    }

    #[tokio::test]
    async fn invalid_identity_json_never_calls_host_starter() {
        let runtime = runtime_for_tests();
        let called = Arc::new(AtomicBool::new(false));
        let called_for_starter = called.clone();
        let starter = host_starter(move |_start| {
            let called_for_starter = called_for_starter.clone();
            async move {
                called_for_starter.store(true, Ordering::SeqCst);
                Ok(())
            }
        });
        let (_client, host) = tokio::io::duplex(4096);

        let error = runtime
            .start_stream_session_with_starter("session-invalid", "{bad json", host, starter)
            .expect_err("invalid identity rejected");

        assert!(error.contains("Invalid Android USB accessory identity JSON"));
        assert!(!called.load(Ordering::SeqCst));
        assert_eq!(runtime.active_session_count(), 0);
    }

    #[tokio::test]
    async fn stop_session_signals_shutdown_and_is_idempotent() {
        let runtime = runtime_for_tests();
        let (shutdown_tx, shutdown_rx) = oneshot::channel();
        let shutdown_tx = Arc::new(Mutex::new(Some(shutdown_tx)));
        let starter = host_starter(move |start| {
            let shutdown_tx = shutdown_tx
                .lock()
                .expect("shutdown sender lock")
                .take()
                .expect("shutdown sender");
            async move {
                let _ = start.shutdown.await;
                shutdown_tx.send(()).map_err(|_| "shutdown send failed")?;
                Ok(())
            }
        });
        let (_client, host) = tokio::io::duplex(4096);
        runtime
            .start_stream_session_with_starter("session-stop", IDENTITY_JSON, host, starter)
            .expect("start session");

        assert!(runtime.stop_session("session-stop"));
        assert!(!runtime.stop_session("session-stop"));
        shutdown_rx.await.expect("shutdown observed");
        assert_eq!(runtime.active_session_count(), 0);
    }

    #[cfg(unix)]
    #[tokio::test]
    async fn fd_stream_carries_one_record_per_remote_transport_message() {
        use std::os::fd::IntoRawFd;
        use std::os::unix::net::UnixStream;

        let (left, right) = UnixStream::pair().expect("unix stream pair");
        right
            .set_nonblocking(true)
            .expect("right unix stream nonblocking");
        let right = tokio::net::UnixStream::from_std(right).expect("tokio unix stream");
        let stream = unsafe { AndroidAccessoryFdStream::from_raw_fd(left.into_raw_fd()) }
            .expect("fd stream");
        let mut transport = MobileUsbRemoteTransport::new(stream, MobileUsbBridgeKind::AndroidAoa);
        let (mut right_read, mut right_write) = right.into_split();

        right_write
            .write_all(&3_u32.to_be_bytes())
            .await
            .expect("write record len");
        right_write
            .write_all(b"abc")
            .await
            .expect("write record payload");

        assert_eq!(transport.recv().await.expect("recv record"), b"abc");

        transport.send(b"ok").await.expect("send record");
        let mut len = [0_u8; 4];
        right_read
            .read_exact(&mut len)
            .await
            .expect("read response len");
        assert_eq!(u32::from_be_bytes(len), 2);
        let mut payload = [0_u8; 2];
        right_read
            .read_exact(&mut payload)
            .await
            .expect("read response payload");
        assert_eq!(&payload, b"ok");
    }

    #[cfg(unix)]
    #[test]
    fn accessory_fd_read_retries_transient_eio_until_data_arrives() {
        let closed = AtomicBool::new(false);
        let mut attempts = 0usize;
        let mut sleeps = 0usize;
        let mut buf = [0_u8; 8];

        let len = blocking_read_accessory_fd_with(
            &mut buf,
            &closed,
            |buf| {
                attempts += 1;
                if attempts == 1 {
                    return Err(io::Error::from_raw_os_error(libc::EIO));
                }
                buf[..2].copy_from_slice(b"ok");
                Ok(2)
            },
            || {
                sleeps += 1;
            },
        )
        .expect("transient EIO should retry");

        assert_eq!(len, 2);
        assert_eq!(&buf[..2], b"ok");
        assert_eq!(attempts, 2);
        assert_eq!(sleeps, 1);
    }

    #[cfg(unix)]
    #[test]
    fn accessory_fd_read_stops_transient_eio_retry_after_close() {
        let closed = AtomicBool::new(false);
        let mut attempts = 0usize;
        let mut buf = [0_u8; 8];

        let len = blocking_read_accessory_fd_with(
            &mut buf,
            &closed,
            |_buf| {
                attempts += 1;
                Err(io::Error::from_raw_os_error(libc::EIO))
            },
            || {
                closed.store(true, Ordering::SeqCst);
            },
        )
        .expect("closed retry should finish as EOF");

        assert_eq!(len, 0);
        assert_eq!(attempts, 1);
    }

    #[cfg(unix)]
    #[test]
    fn accessory_fd_read_stops_would_block_retry_after_close() {
        let closed = AtomicBool::new(false);
        let mut attempts = 0usize;
        let mut buf = [0_u8; 8];

        let len = blocking_read_accessory_fd_with(
            &mut buf,
            &closed,
            |_buf| {
                attempts += 1;
                Err(io::Error::from(io::ErrorKind::WouldBlock))
            },
            || {
                closed.store(true, Ordering::SeqCst);
            },
        )
        .expect("closed nonblocking retry should finish as EOF");

        assert_eq!(len, 0);
        assert_eq!(attempts, 1);
    }

    #[cfg(unix)]
    #[test]
    fn accessory_fd_read_retries_transient_eio_between_records() {
        let closed = AtomicBool::new(false);
        let mut attempts = 0usize;
        let mut sleeps = 0usize;
        let mut buf = [0_u8; 8];

        let len = blocking_read_accessory_fd_with(
            &mut buf,
            &closed,
            |buf| {
                attempts += 1;
                if attempts == 1 {
                    return Err(io::Error::from_raw_os_error(libc::EIO));
                }
                buf[..3].copy_from_slice(b"rpc");
                Ok(3)
            },
            || {
                sleeps += 1;
            },
        )
        .expect("between-record EIO should retry");

        assert_eq!(len, 3);
        assert_eq!(&buf[..3], b"rpc");
        assert_eq!(attempts, 2);
        assert_eq!(sleeps, 1);
    }

    #[cfg(unix)]
    #[tokio::test]
    async fn fd_session_without_starter_is_queued_and_closed_by_stop() {
        use std::os::fd::IntoRawFd;
        use std::os::unix::net::UnixStream;

        let runtime = runtime_for_tests();
        let (left, _right) = UnixStream::pair().expect("unix stream pair");
        let fd = left.into_raw_fd();

        runtime
            .start_fd_session("session-no-starter", fd, IDENTITY_JSON)
            .expect("missing starter should queue pending fd");

        assert_eq!(runtime.active_session_count(), 1);
        assert!(fd_is_open(fd));
        assert!(runtime.stop_session("session-no-starter"));
        assert!(!fd_is_open(fd));
    }

    #[cfg(unix)]
    #[tokio::test]
    async fn fd_session_queued_before_starter_runs_after_starter_setup() {
        use std::os::fd::IntoRawFd;
        use std::os::unix::net::UnixStream;

        let runtime = runtime_for_tests();
        let (left, right) = UnixStream::pair().expect("unix stream pair");
        right
            .set_nonblocking(true)
            .expect("right unix stream nonblocking");
        let mut right = tokio::net::UnixStream::from_std(right).expect("tokio unix stream");
        let fd = left.into_raw_fd();
        let (payload_tx, payload_rx) = oneshot::channel();
        let payload_tx = Arc::new(Mutex::new(Some(payload_tx)));

        runtime
            .start_fd_session("session-pending", fd, IDENTITY_JSON)
            .expect("queue pending fd");

        runtime.set_host_starter(host_starter(move |start| {
            let payload_tx = payload_tx
                .lock()
                .expect("payload sender lock")
                .take()
                .expect("payload sender");
            async move {
                assert_eq!(start.session_id, "session-pending");
                assert_eq!(start.identity.serial.as_deref(), Some("device-1"));
                let mut transport = start.transport;
                let payload = transport.recv().await.map_err(|error| error.to_string())?;
                payload_tx
                    .send(payload)
                    .map_err(|_| "payload send failed")?;
                Ok(())
            }
        }));

        right
            .write_all(&5_u32.to_be_bytes())
            .await
            .expect("write record len");
        right
            .write_all(b"hello")
            .await
            .expect("write record payload");

        assert_eq!(
            payload_rx.await.expect("payload delivered"),
            b"hello".to_vec()
        );
    }

    #[cfg(unix)]
    #[tokio::test]
    async fn fd_session_spawner_failure_returns_fd_to_caller_ownership() {
        use std::os::fd::IntoRawFd;
        use std::os::unix::net::UnixStream;

        let runtime = runtime_for_tests();
        runtime.set_host_starter(host_starter(|_start| async { Ok(()) }));
        runtime.set_task_spawner_for_tests(rejecting_task_spawner());
        let (left, _right) = UnixStream::pair().expect("unix stream pair");
        let fd = left.into_raw_fd();

        let error = runtime
            .start_fd_session("session-spawn-fail", fd, IDENTITY_JSON)
            .expect_err("spawner failure rejected");

        assert!(error.contains("test spawner unavailable"));
        assert_eq!(runtime.active_session_count(), 0);
        assert!(fd_is_open(fd));
        unsafe {
            libc::close(fd);
        }
    }

    #[cfg(unix)]
    #[tokio::test]
    async fn pending_fd_session_spawner_failure_closes_native_owned_fd() {
        use std::os::fd::IntoRawFd;
        use std::os::unix::net::UnixStream;

        let runtime = runtime_for_tests();
        runtime.set_task_spawner_for_tests(rejecting_task_spawner());
        let (left, _right) = UnixStream::pair().expect("unix stream pair");
        let fd = left.into_raw_fd();

        runtime
            .start_fd_session("session-pending-spawn-fail", fd, IDENTITY_JSON)
            .expect("queue pending fd");
        runtime.set_host_starter(host_starter(|_start| async { Ok(()) }));

        assert_eq!(runtime.active_session_count(), 0);
        assert!(!fd_is_open(fd));
    }

    #[cfg(unix)]
    fn fd_is_open(fd: std::os::fd::RawFd) -> bool {
        unsafe { libc::fcntl(fd, libc::F_GETFD) >= 0 }
    }
}
