use super::*;

struct StartSessionGate {
    entered: tokio::sync::Notify,
    release: tokio::sync::Notify,
}

#[cfg(desktop)]
#[derive(Default)]
pub(in crate::mobile_usb::tests) struct RecordingMobileUsbSessionEventTarget {
    pub(in crate::mobile_usb::tests) events: Mutex<Vec<MobileUsbSessionEvent>>,
}

#[cfg(desktop)]
impl MobileUsbSessionEventTarget for Arc<RecordingMobileUsbSessionEventTarget> {
    fn handle_mobile_usb_session_event(&self, event: MobileUsbSessionEvent) {
        self.events.lock().expect("events").push(event);
    }
}

pub(in crate::mobile_usb::tests) struct FakeSessionStarter {
    starts: Mutex<Vec<(String, Option<TransportType>)>>,
    host_unlocked: AtomicBool,
    stops: AtomicUsize,
    block_next_start: AtomicBool,
    start_gate: Arc<StartSessionGate>,
}

impl Default for FakeSessionStarter {
    fn default() -> Self {
        Self {
            starts: Mutex::new(Vec::new()),
            host_unlocked: AtomicBool::new(false),
            stops: AtomicUsize::new(0),
            block_next_start: AtomicBool::new(false),
            start_gate: Arc::new(StartSessionGate {
                entered: tokio::sync::Notify::new(),
                release: tokio::sync::Notify::new(),
            }),
        }
    }
}

impl FakeSessionStarter {
    pub(in crate::mobile_usb::tests) fn start_count(&self) -> usize {
        self.starts.lock().expect("starts").len()
    }

    pub(in crate::mobile_usb::tests) fn starts(&self) -> Vec<(String, Option<TransportType>)> {
        self.starts.lock().expect("starts").clone()
    }

    pub(in crate::mobile_usb::tests) fn set_host_unlocked(&self, host_unlocked: bool) {
        self.host_unlocked.store(host_unlocked, Ordering::SeqCst);
    }

    pub(in crate::mobile_usb::tests) fn stop_count(&self) -> usize {
        self.stops.load(Ordering::SeqCst)
    }

    pub(in crate::mobile_usb::tests) fn block_next_start_session(&self) {
        self.block_next_start.store(true, Ordering::SeqCst);
    }

    pub(in crate::mobile_usb::tests) async fn wait_start_session_entered(&self) {
        self.start_gate.entered.notified().await;
    }

    pub(in crate::mobile_usb::tests) fn release_start_session(&self) {
        self.start_gate.release.notify_waiters();
    }
}

#[async_trait::async_trait]
impl MobileUsbSessionStarter for FakeSessionStarter {
    async fn start_session(
        &self,
        request: MobileUsbStartSessionRequest,
    ) -> Result<MobileUsbSessionHandle, MobileUsbError> {
        if self.block_next_start.swap(false, Ordering::SeqCst) {
            self.start_gate.entered.notify_waiters();
            self.start_gate.release.notified().await;
        }
        let mut starts = self.starts.lock().expect("starts");
        starts.push((request.host.host_id, request.metrics.transport_type));
        Ok(MobileUsbSessionHandle {
            session_id: format!("session-{}", starts.len()),
            host_unlocked: self.host_unlocked.load(Ordering::SeqCst),
            transport_session_generation: starts.len() as u64,
        })
    }

    fn stop_active_session(&self) -> Result<(), MobileUsbError> {
        self.stops.fetch_add(1, Ordering::SeqCst);
        Ok(())
    }
}
