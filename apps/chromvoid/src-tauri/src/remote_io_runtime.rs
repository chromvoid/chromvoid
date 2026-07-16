use std::sync::atomic::{AtomicU64, Ordering};
use std::sync::{Arc, Mutex};
use std::time::Duration;

use chromvoid_core::rpc::types::RpcRequest;
use tokio::sync::mpsc;
use tokio::task::JoinHandle;
use tracing::warn;

const REMOTE_IO_RUNTIME_POISONED: &str = "Remote IO runtime mutex poisoned";

#[derive(Debug, Clone, PartialEq, Eq)]
pub(crate) enum RemoteIoRuntimeEvent {
    HostUnlockConfirmed,
    HostLocked,
    Disconnected {
        reason: String,
        failure: crate::remote_data_plane::RemoteIoFailure,
    },
}

pub(crate) trait RemoteIoRuntimeEventSink: Send + Sync {
    fn on_remote_io_event(&self, event: RemoteIoRuntimeEvent);
}

pub(crate) struct RemoteIoSessionHandle {
    pub(crate) req_tx: mpsc::Sender<crate::remote_data_plane::RemoteIoRequest>,
    pub(crate) generation: u64,
}

#[derive(Debug, Clone, Copy, PartialEq, Eq)]
pub(crate) enum RemoteIoStopReason {
    Replaced,
    ModeSwitchLocal,
    StartFailed,
    AppShutdown,
    #[cfg(test)]
    Test,
}

impl RemoteIoStopReason {
    fn label(self) -> &'static str {
        match self {
            Self::Replaced => "replaced",
            Self::ModeSwitchLocal => "mode_switch_local",
            Self::StartFailed => "start_failed",
            Self::AppShutdown => "app_shutdown",
            #[cfg(test)]
            Self::Test => "test",
        }
    }
}

#[derive(Debug, Clone, Copy, PartialEq, Eq)]
enum RemoteIoSessionKind {
    RemoteTransport,
}

struct ActiveRemoteIoSession {
    generation: u64,
    kind: RemoteIoSessionKind,
    io_task: JoinHandle<()>,
    event_task: Option<JoinHandle<()>>,
}

struct PublishActiveError {
    error: String,
    session: ActiveRemoteIoSession,
}

#[derive(Default)]
struct RemoteIoRuntimeInner {
    active: Option<ActiveRemoteIoSession>,
}

pub(crate) struct RemoteIoRuntimeState {
    next_generation: AtomicU64,
    current_generation: AtomicU64,
    inner: Mutex<RemoteIoRuntimeInner>,
}

impl RemoteIoRuntimeState {
    pub(crate) fn new() -> Self {
        Self {
            next_generation: AtomicU64::new(0),
            current_generation: AtomicU64::new(0),
            inner: Mutex::new(RemoteIoRuntimeInner::default()),
        }
    }

    pub(crate) fn start_remote_session(
        self: &Arc<Self>,
        app: tauri::AppHandle,
        config: crate::remote_data_plane::RemoteIoTaskConfig,
    ) -> Result<RemoteIoSessionHandle, String> {
        self.start_remote_session_with_event_sink(app, config, None)
    }

    pub(crate) fn start_remote_session_with_event_sink(
        self: &Arc<Self>,
        app: tauri::AppHandle,
        config: crate::remote_data_plane::RemoteIoTaskConfig,
        event_sink: Option<Arc<dyn RemoteIoRuntimeEventSink>>,
    ) -> Result<RemoteIoSessionHandle, String> {
        let crate::remote_data_plane::RemoteIoTaskHandle {
            req_tx,
            evt_rx,
            task_handle,
        } = crate::remote_data_plane::spawn_remote_io_task(config);
        let req_tx_for_adapter = req_tx.clone();
        let generation = self.next_active_generation();
        let event_runtime = self.clone();
        let event_task = tokio::spawn(async move {
            run_remote_event_pump(event_runtime, app, generation, evt_rx, event_sink).await;
        });

        let session = ActiveRemoteIoSession {
            generation,
            kind: RemoteIoSessionKind::RemoteTransport,
            io_task: task_handle,
            event_task: Some(event_task),
        };

        match self.publish_active(session) {
            Ok(previous) => {
                abort_session(previous, RemoteIoStopReason::Replaced);
                Ok(RemoteIoSessionHandle {
                    req_tx: req_tx_for_adapter,
                    generation,
                })
            }
            Err(PublishActiveError { error, session }) => {
                self.current_generation.fetch_add(1, Ordering::AcqRel);
                abort_session(Some(session), RemoteIoStopReason::StartFailed);
                Err(error)
            }
        }
    }

    pub(crate) fn stop_active(&self, reason: RemoteIoStopReason) -> Result<(), String> {
        let active = self.take_active_after_invalidate()?;
        abort_session(active, reason);
        Ok(())
    }

    pub(crate) async fn shutdown_with_grace(
        &self,
        reason: RemoteIoStopReason,
        grace: Duration,
    ) -> Result<(), String> {
        let active = self.take_active_after_invalidate()?;
        let handles = abort_session_for_join(active, reason);
        if handles.is_empty() {
            return Ok(());
        }

        let join_result = tokio::time::timeout(grace, async move {
            for handle in handles {
                let _ = handle.await;
            }
        })
        .await;

        if join_result.is_err() {
            warn!(
                "remote_io: shutdown timed out after {:?} reason={}",
                grace,
                reason.label()
            );
        }
        Ok(())
    }

    fn next_active_generation(&self) -> u64 {
        let generation = self
            .next_generation
            .fetch_add(1, Ordering::AcqRel)
            .saturating_add(1);
        self.current_generation.store(generation, Ordering::Release);
        generation
    }

    fn is_generation_current(&self, generation: u64) -> bool {
        self.current_generation.load(Ordering::Acquire) == generation
    }

    fn publish_active(
        &self,
        session: ActiveRemoteIoSession,
    ) -> Result<Option<ActiveRemoteIoSession>, PublishActiveError> {
        let mut inner = match self.inner.lock() {
            Ok(inner) => inner,
            Err(_) => {
                return Err(PublishActiveError {
                    error: REMOTE_IO_RUNTIME_POISONED.to_string(),
                    session,
                });
            }
        };
        Ok(inner.active.replace(session))
    }

    fn take_active_after_invalidate(&self) -> Result<Option<ActiveRemoteIoSession>, String> {
        let generation = self
            .next_generation
            .fetch_add(1, Ordering::AcqRel)
            .saturating_add(1);
        self.current_generation.store(generation, Ordering::Release);
        let mut inner = self
            .inner
            .lock()
            .map_err(|_| REMOTE_IO_RUNTIME_POISONED.to_string())?;
        Ok(inner.active.take())
    }

    #[cfg(test)]
    fn active_generation_for_test(&self) -> Option<u64> {
        self.inner
            .lock()
            .ok()
            .and_then(|inner| inner.active.as_ref().map(|session| session.generation))
    }

    #[cfg(test)]
    fn active_task_count_for_test(&self) -> usize {
        self.inner
            .lock()
            .ok()
            .and_then(|inner| inner.active.as_ref().map(|session| session.task_count()))
            .unwrap_or(0)
    }

    #[cfg(test)]
    fn store_test_session(
        &self,
        kind: RemoteIoSessionKind,
        event_task: Option<JoinHandle<()>>,
    ) -> Result<u64, String> {
        let generation = self.next_active_generation();
        let io_task = tokio::spawn(std::future::pending::<()>());
        let previous = self
            .publish_active(ActiveRemoteIoSession {
                generation,
                kind,
                io_task,
                event_task,
            })
            .map_err(|error| error.error)?;
        abort_session(previous, RemoteIoStopReason::Replaced);
        Ok(generation)
    }
}

impl ActiveRemoteIoSession {
    #[cfg(test)]
    fn task_count(&self) -> usize {
        1 + usize::from(self.event_task.is_some())
    }
}

fn abort_session(session: Option<ActiveRemoteIoSession>, reason: RemoteIoStopReason) {
    for handle in abort_session_for_join(session, reason) {
        drop(handle);
    }
}

fn abort_session_for_join(
    session: Option<ActiveRemoteIoSession>,
    reason: RemoteIoStopReason,
) -> Vec<JoinHandle<()>> {
    let Some(mut session) = session else {
        return Vec::new();
    };

    tracing::debug!(
        "remote_io: stopping session generation={} kind={:?} reason={}",
        session.generation,
        session.kind,
        reason.label()
    );

    let mut handles = Vec::new();
    session.io_task.abort();
    handles.push(session.io_task);
    if let Some(event_task) = session.event_task.take() {
        event_task.abort();
        handles.push(event_task);
    }
    handles
}

async fn run_remote_event_pump<R: tauri::Runtime>(
    runtime: Arc<RemoteIoRuntimeState>,
    app: tauri::AppHandle<R>,
    generation: u64,
    mut evt_rx: mpsc::Receiver<crate::remote_data_plane::RemoteIoEvent>,
    event_sink: Option<Arc<dyn RemoteIoRuntimeEventSink>>,
) {
    const MOBILE_USB_HOST_UNLOCK_CONFIRMED: &str = "mobile_usb:host_unlock_confirmed";
    const MOBILE_USB_HOST_LOCKED: &str = "mobile_usb:host_locked";

    while let Some(event) = evt_rx.recv().await {
        if !runtime.is_generation_current(generation) {
            continue;
        }

        match event {
            crate::remote_data_plane::RemoteIoEvent::Frame(frame) => {
                if frame.frame_type != crate::gateway::protocol::FrameType::RpcRequest {
                    continue;
                }

                match serde_json::from_slice::<RpcRequest>(&frame.payload) {
                    Ok(request) => {
                        if request.command == MOBILE_USB_HOST_UNLOCK_CONFIRMED {
                            if let Some(sink) = event_sink.as_ref() {
                                sink.on_remote_io_event(RemoteIoRuntimeEvent::HostUnlockConfirmed);
                            }
                            continue;
                        }
                        if request.command == MOBILE_USB_HOST_LOCKED {
                            if let Some(sink) = event_sink.as_ref() {
                                sink.on_remote_io_event(RemoteIoRuntimeEvent::HostLocked);
                            }
                            return;
                        }
                        crate::helpers::emit_core_event(&app, &request.command, request.data);
                    }
                    Err(error) => {
                        warn!("remote_io: failed to decode remote push event: {error}");
                    }
                }
            }
            crate::remote_data_plane::RemoteIoEvent::Disconnected { reason, failure } => {
                if let Some(sink) = event_sink.as_ref() {
                    sink.on_remote_io_event(RemoteIoRuntimeEvent::Disconnected {
                        reason: reason.clone(),
                        failure,
                    });
                }
                warn!("remote_io: remote data-plane task disconnected: {reason}");
            }
            _ => {}
        }
    }
}

#[cfg(test)]
mod tests {
    use super::*;
    use std::sync::atomic::{AtomicBool, Ordering};

    struct RecordingRuntimeEventSink {
        tx: Mutex<Option<tokio::sync::oneshot::Sender<RemoteIoRuntimeEvent>>>,
    }

    impl RemoteIoRuntimeEventSink for RecordingRuntimeEventSink {
        fn on_remote_io_event(&self, event: RemoteIoRuntimeEvent) {
            if let Ok(mut tx) = self.tx.lock() {
                if let Some(tx) = tx.take() {
                    let _ = tx.send(event);
                }
            }
        }
    }

    struct DropFlag(Arc<AtomicBool>);

    impl Drop for DropFlag {
        fn drop(&mut self) {
            self.0.store(true, Ordering::Release);
        }
    }

    #[tokio::test]
    async fn storing_second_session_replaces_first() {
        let runtime = RemoteIoRuntimeState::new();
        let first = runtime
            .store_test_session(RemoteIoSessionKind::RemoteTransport, None)
            .expect("first session");
        let second = runtime
            .store_test_session(RemoteIoSessionKind::RemoteTransport, None)
            .expect("second session");

        assert_ne!(first, second);
        assert_eq!(runtime.active_generation_for_test(), Some(second));
        assert_eq!(runtime.active_task_count_for_test(), 1);
    }

    #[tokio::test]
    async fn stop_active_clears_session_and_is_idempotent() {
        let runtime = RemoteIoRuntimeState::new();
        runtime
            .store_test_session(RemoteIoSessionKind::RemoteTransport, None)
            .expect("session");

        runtime.stop_active(RemoteIoStopReason::Test).expect("stop");
        runtime
            .stop_active(RemoteIoStopReason::Test)
            .expect("second stop");

        assert_eq!(runtime.active_generation_for_test(), None);
        assert_eq!(runtime.active_task_count_for_test(), 0);
    }

    #[tokio::test]
    async fn stop_active_invalidates_previous_generation() {
        let runtime = RemoteIoRuntimeState::new();
        let generation = runtime
            .store_test_session(RemoteIoSessionKind::RemoteTransport, None)
            .expect("session");

        assert!(runtime.is_generation_current(generation));
        runtime.stop_active(RemoteIoStopReason::Test).expect("stop");

        assert!(!runtime.is_generation_current(generation));
    }

    #[tokio::test]
    async fn shutdown_with_grace_aborts_and_joins_tasks() {
        let runtime = RemoteIoRuntimeState::new();
        let event_dropped = Arc::new(AtomicBool::new(false));
        let (ready_tx, ready_rx) = tokio::sync::oneshot::channel();
        let event_task = {
            let event_dropped = event_dropped.clone();
            tokio::spawn(async move {
                let _guard = DropFlag(event_dropped);
                let _ = ready_tx.send(());
                std::future::pending::<()>().await;
            })
        };
        ready_rx.await.expect("event task ready");
        runtime
            .store_test_session(RemoteIoSessionKind::RemoteTransport, Some(event_task))
            .expect("session");

        runtime
            .shutdown_with_grace(RemoteIoStopReason::Test, Duration::from_secs(1))
            .await
            .expect("shutdown");

        assert_eq!(runtime.active_generation_for_test(), None);
        assert!(event_dropped.load(Ordering::Acquire));
    }

    #[tokio::test]
    async fn event_pump_forwards_current_disconnect_to_session_sink() {
        let app = tauri::test::mock_app();
        let runtime = Arc::new(RemoteIoRuntimeState::new());
        let generation = runtime.next_active_generation();
        let (evt_tx, evt_rx) = mpsc::channel(1);
        let (sink_tx, sink_rx) = tokio::sync::oneshot::channel();
        let sink = Arc::new(RecordingRuntimeEventSink {
            tx: Mutex::new(Some(sink_tx)),
        });

        let pump = tokio::spawn(run_remote_event_pump(
            runtime,
            app.handle().clone(),
            generation,
            evt_rx,
            Some(sink),
        ));

        evt_tx
            .send(crate::remote_data_plane::RemoteIoEvent::Disconnected {
                reason: "transport closed".to_string(),
                failure: crate::remote_data_plane::RemoteIoFailure::TransportClosed,
            })
            .await
            .expect("send disconnect");

        let event = tokio::time::timeout(Duration::from_secs(1), sink_rx)
            .await
            .expect("sink event timeout")
            .expect("sink event");
        assert_eq!(
            event,
            RemoteIoRuntimeEvent::Disconnected {
                reason: "transport closed".to_string(),
                failure: crate::remote_data_plane::RemoteIoFailure::TransportClosed,
            }
        );

        drop(evt_tx);
        pump.await.expect("event pump join");
    }

    #[tokio::test]
    async fn event_pump_forwards_authenticated_host_lock_and_stops() {
        let app = tauri::test::mock_app();
        let runtime = Arc::new(RemoteIoRuntimeState::new());
        let generation = runtime.next_active_generation();
        let (evt_tx, evt_rx) = mpsc::channel(1);
        let (sink_tx, sink_rx) = tokio::sync::oneshot::channel();
        let sink = Arc::new(RecordingRuntimeEventSink {
            tx: Mutex::new(Some(sink_tx)),
        });

        let pump = tokio::spawn(run_remote_event_pump(
            runtime,
            app.handle().clone(),
            generation,
            evt_rx,
            Some(sink),
        ));
        let request = RpcRequest::new("mobile_usb:host_locked", serde_json::json!({}));
        evt_tx
            .send(crate::remote_data_plane::RemoteIoEvent::Frame(
                crate::gateway::protocol::Frame {
                    frame_type: crate::gateway::protocol::FrameType::RpcRequest,
                    message_id: 1,
                    flags: 0,
                    payload: serde_json::to_vec(&request).expect("host lock request"),
                },
            ))
            .await
            .expect("send host lock");

        let event = tokio::time::timeout(Duration::from_secs(1), sink_rx)
            .await
            .expect("sink event timeout")
            .expect("sink event");
        assert_eq!(event, RemoteIoRuntimeEvent::HostLocked);
        tokio::time::timeout(Duration::from_secs(1), pump)
            .await
            .expect("event pump stop timeout")
            .expect("event pump join");
    }
}
