use std::collections::HashMap;
use std::future::Future;
use std::pin::Pin;
use std::sync::{Arc, Mutex};

#[cfg(target_os = "android")]
use std::ffi::CString;
#[cfg(unix)]
use std::os::fd::RawFd;

use chromvoid_protocol::RemoteTransport;
use serde::{Deserialize, Serialize};
use tokio::sync::oneshot;

#[cfg(unix)]
use super::usb_accessory_fd::*;
use super::usb_accessory_host_failure::{
    AndroidMobileUsbHostFailure, AndroidMobileUsbHostStopReason,
};
use super::usb_accessory_sessions::AndroidMobileUsbAccessorySession;

use crate::mobile_usb::observability::TransportSessionContext;
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
    pub shutdown: oneshot::Receiver<AndroidMobileUsbHostStopReason>,
}

pub(crate) type AndroidMobileUsbHostStarter = Arc<
    dyn Fn(
            AndroidMobileUsbHostStart,
        ) -> Pin<
            Box<
                dyn Future<
                        Output = Result<
                            AndroidMobileUsbHostStopReason,
                            AndroidMobileUsbHostFailure,
                        >,
                    > + Send,
            >,
        > + Send
        + Sync,
>;

type AndroidMobileUsbTask = Pin<Box<dyn Future<Output = ()> + Send>>;
type AndroidMobileUsbTaskFactory = Box<dyn FnOnce() -> AndroidMobileUsbTask + Send>;
type AndroidMobileUsbTaskSpawner =
    Arc<dyn Fn(AndroidMobileUsbTaskFactory) -> Result<(), String> + Send + Sync>;

pub(crate) struct AndroidMobileUsbAccessoryRuntimeState {
    pub(super) sessions: Mutex<HashMap<SessionId, AndroidMobileUsbAccessorySession>>,
    host_starter: Mutex<Option<AndroidMobileUsbHostStarter>>,
    task_spawner: Mutex<AndroidMobileUsbTaskSpawner>,
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
        let context = TransportSessionContext::new()
            .with_trace_id(session_id.clone())
            .with_usb_session_id(session_id.clone())
            .with_bridge_kind(MobileUsbBridgeKind::AndroidAoa)
            .with_transport_type(chromvoid_protocol::TransportType::UsbMobile);
        let transport = Box::new(MobileUsbRemoteTransport::with_context(
            stream,
            MobileUsbBridgeKind::AndroidAoa,
            context,
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
        shutdown: oneshot::Receiver<AndroidMobileUsbHostStopReason>,
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
                let context = TransportSessionContext::new()
                    .with_trace_id(session_id.clone())
                    .with_usb_session_id(session_id.clone())
                    .with_bridge_kind(MobileUsbBridgeKind::AndroidAoa)
                    .with_transport_type(chromvoid_protocol::TransportType::UsbMobile);
                let transport = Box::new(MobileUsbRemoteTransport::with_context(
                    stream,
                    MobileUsbBridgeKind::AndroidAoa,
                    context,
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
        Err(failure) => {
            match &failure {
                AndroidMobileUsbHostFailure::PairingComplete => {
                    android_usb_log_info(format!(
                        "event=host_starter_pairing_complete session_id={}",
                        log_session_id(session_id)
                    ));
                }
                AndroidMobileUsbHostFailure::PairingCancelled => {
                    android_usb_log_info(format!(
                        "event=host_starter_pairing_cancelled session_id={}",
                        log_session_id(session_id)
                    ));
                }
                AndroidMobileUsbHostFailure::TransportClosed => {
                    android_usb_log_info(format!(
                        "event=host_starter_transport_closed session_id={}",
                        log_session_id(session_id)
                    ));
                }
                AndroidMobileUsbHostFailure::DataPlaneError(error)
                | AndroidMobileUsbHostFailure::Error(error) => {
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
                }
            }
            failure.stop_reason()
        }
    }
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

#[cfg(test)]
#[path = "usb_accessory_runtime_tests.rs"]
mod usb_accessory_runtime_tests;
