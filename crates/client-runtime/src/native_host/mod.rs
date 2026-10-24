//! Native host orchestration. Network tasks never own the application's LocalSession.
mod presence;
mod relay;
mod storage;
mod usb;

use super::{LocalSession, SessionPhase};
pub use chromvoid_network_runtime::acceptor::AcceptorState;
use chromvoid_network_runtime::acceptor::{AcceptorRuntimeState, AcceptorStatus};
pub use chromvoid_network_runtime::ios_host::{IosHostErrorKind, IosHostPhase};
use chromvoid_network_runtime::ios_host::{IosHostRuntimeState, IosHostStatus};
use serde::Serialize;
use std::sync::atomic::{AtomicBool, AtomicU64, Ordering};
use std::sync::{Arc, Mutex, Weak};
pub(super) use storage::HostStorage;
use tokio::runtime::Runtime;
use tokio::sync::watch;
pub use usb::{
    UsbApprovalKind, UsbHostStatus, UsbLinkOpener, UsbLinkState, UsbPairingRequest, UsbSessionEnd,
    UsbSessionRequest, UsbStopReason,
};

#[derive(Clone, Debug, Serialize)]
pub struct TrustedPeer {
    pub peer_id: String,
    pub label: String,
    pub platform: String,
    pub paired_at: u64,
}

#[derive(Debug, Serialize)]
pub struct HostSnapshot {
    pub sequence: u64,
    pub host: IosHostStatus,
    pub acceptor: AcceptorStatus,
    /// A desktop on the USB accessory link, apart from the relay listener.
    pub usb: UsbHostStatus,
}

pub struct NativeHost {
    inner: Arc<HostInner>,
    executor: Option<Runtime>,
}

#[derive(Debug, thiserror::Error)]
pub enum StartHostError {
    #[error("Invalid relay URL")]
    InvalidRelay,
    #[error("Device label is required")]
    DeviceLabelRequired,
    #[error("Host session was revoked")]
    SessionRevoked,
    #[error("Host is unavailable")]
    Unavailable,
}
impl From<String> for StartHostError {
    fn from(_: String) -> Self {
        Self::Unavailable
    }
}
impl From<&str> for StartHostError {
    fn from(_: &str) -> Self {
        Self::Unavailable
    }
}

pub(super) struct HostInner {
    session: Weak<LocalSession>,
    storage: HostStorage,
    presence: presence::PresencePublisher,
    host: IosHostRuntimeState,
    acceptor: Arc<AcceptorRuntimeState>,
    // Compose the existing status/task owners atomically; no second generation counter.
    gate: Arc<Mutex<()>>,
    retired: AtomicBool,
    changed: watch::Sender<u64>,
    // Bound application authority, not a separate generation counter; zero is idle.
    session_generation: AtomicU64,
    // An explicit Stop wins over foreground restoration, including queued preference I/O.
    explicitly_stopped: AtomicBool,
    usb: Mutex<usb::UsbState>,
}

#[derive(Clone, Copy)]
enum StartMode {
    Pair,
    Resume,
}

impl NativeHost {
    /// Creates no listener and performs no network or trust-store operation.
    pub fn new(session: &Arc<LocalSession>) -> Result<Self, String> {
        let gate = session
            .inner
            .host_gate
            .lock()
            .map_err(|_| "Host unavailable")?;
        let snapshot = session.snapshot().map_err(|_| "Host session unavailable")?;
        if snapshot.cleanup_pending
            || !matches!(
                snapshot.phase,
                SessionPhase::Locked | SessionPhase::Unlocked
            )
        {
            return Err("Host session revoked".into());
        }
        let mut hosts = session
            .inner
            .native_hosts
            .lock()
            .map_err(|_| "Host unavailable")?;
        let storage = session.inner.host_storage.clone();
        let executor = tokio::runtime::Builder::new_multi_thread()
            .worker_threads(2)
            .max_blocking_threads(4)
            .thread_name("chromvoid-host")
            .enable_all()
            .build()
            .map_err(|_| "Host executor unavailable")?;
        let inner = Arc::new(HostInner {
            session: Arc::downgrade(session),
            storage,
            presence: presence::PresencePublisher::new(&executor),
            host: IosHostRuntimeState::new(),
            acceptor: Arc::new(AcceptorRuntimeState::new()),
            gate: session.inner.host_gate.clone(),
            retired: AtomicBool::new(false),
            changed: watch::channel(0).0,
            session_generation: AtomicU64::new(0),
            explicitly_stopped: AtomicBool::new(false),
            usb: Mutex::new(usb::UsbState::default()),
        });
        hosts.retain(|host| host.strong_count() > 0);
        hosts.push(Arc::downgrade(&inner));
        drop(hosts);
        drop(gate);
        let observer = inner.clone();
        let authority = session.inner.clone();
        executor.spawn(async move {
            let mut changed = authority.changed.subscribe();
            loop {
                let snapshot = authority
                    .authority
                    .lock()
                    .ok()
                    .map(|state| state.snapshot.clone());
                let Some(snapshot) = snapshot else {
                    let _ = observer.stop();
                    return;
                };
                let _ = observer.stop_if_revoked();
                if matches!(snapshot.phase, SessionPhase::Closed | SessionPhase::Failed) {
                    return;
                }
                if changed.changed().await.is_err() {
                    return;
                }
            }
        });
        Ok(Self {
            inner,
            executor: Some(executor),
        })
    }

    pub fn is_retired(&self) -> bool {
        self.inner.retired.load(Ordering::Acquire)
    }

    pub fn snapshot(&self) -> Result<HostSnapshot, String> {
        self.inner.snapshot()
    }

    /// Watches authoritative status changes; waiting itself needs no Tokio caller runtime.
    pub async fn events(&self, after_sequence: u64) -> Result<HostSnapshot, String> {
        let mut changed = self.inner.changed.subscribe();
        loop {
            let snapshot = self.snapshot()?;
            if snapshot.sequence > after_sequence {
                return Ok(snapshot);
            }
            changed
                .changed()
                .await
                .map_err(|_| "Host status unavailable")?;
        }
    }

    pub fn start_pairing(
        &self,
        generation: u64,
        relay_url: String,
        label: String,
    ) -> Result<HostSnapshot, StartHostError> {
        self.start(generation, relay_url, label, StartMode::Pair)
    }

    pub fn start_listening(
        &self,
        generation: u64,
        relay_url: String,
        label: String,
    ) -> Result<HostSnapshot, StartHostError> {
        self.start(generation, relay_url, label, StartMode::Resume)
    }

    /// Called once per admitted foreground generation, never by a status/page read.
    pub async fn resume_if_enabled(
        &self,
        generation: u64,
        label: String,
    ) -> Result<HostSnapshot, StartHostError> {
        let initial = {
            let _gate = self.inner.gate.lock().map_err(|_| "Host unavailable")?;
            self.inner
                .session_for(generation)
                .map_err(|_| StartHostError::SessionRevoked)?;
            let snapshot = self.inner.snapshot_locked()?;
            if self.inner.explicitly_stopped.load(Ordering::Acquire)
                || matches!(
                    snapshot.host.phase,
                    IosHostPhase::Pairing | IosHostPhase::Ready
                )
            {
                return Ok(snapshot);
            }
            snapshot.sequence
        };
        let config = self.configuration().await?;
        let _gate = self.inner.gate.lock().map_err(|_| "Host unavailable")?;
        self.inner
            .session_for(generation)
            .map_err(|_| StartHostError::SessionRevoked)?;
        let snapshot = self.inner.snapshot_locked()?;
        // Explicit user actions or another resume admitted during the read take precedence.
        if snapshot.sequence != initial
            || self.inner.explicitly_stopped.load(Ordering::Acquire)
            || !config.enabled
        {
            return Ok(snapshot);
        }
        let relay = config.relay_url.ok_or(StartHostError::InvalidRelay)?;
        let relay = relay::validate_relay(&relay).map_err(|_| StartHostError::InvalidRelay)?;
        if label.trim().is_empty() {
            return Err(StartHostError::DeviceLabelRequired);
        }
        self.start_locked(generation, relay, label, StartMode::Resume)
    }

    fn start(
        &self,
        generation: u64,
        relay_url: String,
        label: String,
        mode: StartMode,
    ) -> Result<HostSnapshot, StartHostError> {
        let relay_url =
            relay::validate_relay(&relay_url).map_err(|_| StartHostError::InvalidRelay)?;
        if label.trim().is_empty() {
            return Err(StartHostError::DeviceLabelRequired);
        }
        let _gate = self.inner.gate.lock().map_err(|_| "Host unavailable")?;
        self.inner
            .session_for(generation)
            .map_err(|_| StartHostError::SessionRevoked)?;
        self.inner
            .explicitly_stopped
            .store(false, Ordering::Release);
        self.start_locked(generation, relay_url, label, mode)
    }

    fn start_locked(
        &self,
        generation: u64,
        relay_url: String,
        label: String,
        mode: StartMode,
    ) -> Result<HostSnapshot, StartHostError> {
        let inner = self.inner.clone();
        inner
            .session_generation
            .store(generation, Ordering::Release);
        let operation = inner.host.begin_responder_task()?;
        inner.acceptor.cancel_all_tasks()?;
        inner.presence.offline()?;
        inner.host.set_status(|status| {
            *status = IosHostStatus::default();
            status.phase = IosHostPhase::Pairing;
            status.relay_url = Some(relay_url.clone());
            status.device_label = Some(label.clone());
        })?;
        inner.notify();
        let work = inner.clone();
        let task = self
            .executor
            .as_ref()
            .ok_or("Host executor unavailable")?
            .spawn(async move {
                if let Err(error) = work
                    .run(operation, generation, relay_url, label, mode)
                    .await
                {
                    let _ = work.current(operation, generation, |inner| {
                        inner.acceptor.cancel_all_tasks()?;
                        inner.presence.offline()?;
                        inner.host.set_status(|status| {
                            status.phase = IosHostPhase::Error;
                            status.pairing_pin = None;
                            status.pairing_offer = None;
                            status.error_kind = error.kind();
                            status.error = Some(error.to_string());
                        })?;
                        Ok(())
                    });
                }
                let _ = work.host.clear_responder_task_if_current(operation);
            });
        inner
            .host
            .store_responder_task(operation, task.abort_handle())?;
        inner.snapshot_locked().map_err(Into::into)
    }

    /// Revokes listeners immediately; preference persistence never waits for the network.
    pub fn stop(&self) -> Result<HostSnapshot, String> {
        self.inner.require_live()?;
        let snapshot = {
            let _gate = self.inner.gate.lock().map_err(|_| "Host unavailable")?;
            self.inner.require_live()?;
            self.inner.explicitly_stopped.store(true, Ordering::Release);
            self.inner.stop_locked()?
        };
        let inner = self.inner.clone();
        // Tokio shutdown can discard a spawn_blocking job that has not started yet.
        // This explicit preference write must outlive the controller's executor.
        std::thread::Builder::new()
            .name("chromvoid-host-stop".into())
            .spawn(move || {
                let Ok(_gate) = inner.gate.lock() else { return };
                if inner.require_live().is_ok() && inner.explicitly_stopped.load(Ordering::Acquire)
                {
                    if let Err(error) = inner.storage.enabled(None, false) {
                        let _ = inner.host.set_status(|status| {
                            status.phase = IosHostPhase::Error;
                            status.error = Some(error);
                        });
                        inner.notify();
                    }
                }
            })
            .map_err(|_| "Host preferences task unavailable")?;
        Ok(snapshot)
    }

    /// Platform lifecycle stop preserves the user's persisted enabled preference.
    pub fn suspend(&self) -> Result<HostSnapshot, String> {
        self.inner.require_live()?;
        let _gate = self.inner.gate.lock().map_err(|_| "Host unavailable")?;
        if self.inner.session_generation.load(Ordering::Acquire) == 0 {
            return self.inner.snapshot_locked();
        }
        self.inner.stop_locked()
    }

    pub async fn trusted_peers(&self) -> Result<Vec<TrustedPeer>, String> {
        let inner = self.inner.clone();
        self.executor
            .as_ref()
            .ok_or("Host executor unavailable")?
            .spawn_blocking(move || {
                let _gate = inner.gate.lock().map_err(|_| "Host unavailable")?;
                inner.require_live()?;
                let store = inner.storage.peers()?;
                let mut peers: Vec<_> = store
                    .list()
                    .into_iter()
                    .map(|peer| TrustedPeer {
                        peer_id: peer.peer_id.clone(),
                        label: peer.label.clone(),
                        platform: peer.platform.clone(),
                        paired_at: peer.paired_at,
                    })
                    .collect();
                peers.sort_by(|a, b| a.label.cmp(&b.label).then(a.peer_id.cmp(&b.peer_id)));
                Ok(peers)
            })
            .await
            .map_err(|_| "Host storage task unavailable")?
    }

    pub async fn configuration(
        &self,
    ) -> Result<chromvoid_network_runtime::ios_host::configuration::IosHostConfiguration, String>
    {
        let inner = self.inner.clone();
        self.executor
            .as_ref()
            .ok_or("Host executor unavailable")?
            .spawn_blocking(move || {
                let _gate = inner.gate.lock().map_err(|_| "Host unavailable")?;
                inner.require_live()?;
                Ok(inner.storage.configuration())
            })
            .await
            .map_err(|_| "Host preferences unavailable".to_string())?
    }

    pub async fn revoke_peer(&self, peer_id: String) -> Result<(), String> {
        let inner = self.inner.clone();
        {
            let _gate = inner.gate.lock().map_err(|_| "Host unavailable")?;
            inner.require_live()?;
            // A pairing begun before this explicit revoke cannot later re-grant trust.
            inner.host.cancel_responder_task()?;
            if matches!(inner.host.host_status()?.phase, IosHostPhase::Pairing) {
                inner.acceptor.cancel_all_tasks()?;
                inner.presence.offline()?;
                inner.session_generation.store(0, Ordering::Release);
                inner
                    .host
                    .set_status(|state| *state = IosHostStatus::default())?;
            }
            inner.acceptor.revoke_peer_access(&peer_id, || Ok(()))?;
            inner.stop_usb_peer(&peer_id);
            inner.notify();
        }
        self.executor
            .as_ref()
            .ok_or("Host executor unavailable")?
            .spawn_blocking(move || {
                let _gate = inner.gate.lock().map_err(|_| "Host unavailable")?;
                inner.require_live()?;
                // A newer, completed pairing takes precedence over an old queued removal.
                if !inner.acceptor.is_peer_revoked(&peer_id)? {
                    return Ok(());
                }
                let mut store = inner.storage.peers()?;
                store.remove(&peer_id);
                store.save()?;
                inner.notify();
                Ok(())
            })
            .await
            .map_err(|_| "Host storage task unavailable")?
    }
}

impl Drop for NativeHost {
    fn drop(&mut self) {
        let _ = self.inner.stop();
        self.inner.abandon_usb();
        if let Some(executor) = self.executor.take() {
            executor.shutdown_background();
        }
    }
}

impl HostInner {
    fn require_live(&self) -> Result<(), String> {
        if self.retired.load(Ordering::Acquire) {
            Err("Host storage was erased".into())
        } else {
            Ok(())
        }
    }

    fn notify(&self) {
        self.changed
            .send_modify(|sequence| *sequence = sequence.saturating_add(1));
    }

    fn session_for(&self, generation: u64) -> Result<Arc<LocalSession>, String> {
        self.require_live()?;
        let session = self.session.upgrade().ok_or("Host session closed")?;
        let state = session.snapshot().map_err(|_| "Host session unavailable")?;
        if state.generation != generation
            || !matches!(state.phase, SessionPhase::Locked | SessionPhase::Unlocked)
        {
            return Err("Host session revoked".into());
        }
        Ok(session)
    }

    fn current<T>(
        &self,
        operation: u64,
        generation: u64,
        action: impl FnOnce(&Self) -> Result<T, String>,
    ) -> Result<T, String> {
        let _gate = self.gate.lock().map_err(|_| "Host unavailable")?;
        self.session_for(generation)?;
        if !self.host.is_responder_generation_current(operation) {
            return Err("Host operation canceled".into());
        }
        let result = action(self)?;
        self.notify();
        Ok(result)
    }

    fn listener_current<T>(
        &self,
        listener: u64,
        generation: u64,
        action: impl FnOnce(&Self) -> Result<T, String>,
    ) -> Result<T, String> {
        let _gate = self.gate.lock().map_err(|_| "Host unavailable")?;
        self.session_for(generation)?;
        if !self.acceptor.is_generation_current(listener) {
            return Err("Host listener stopped".into());
        }
        let result = action(self)?;
        self.notify();
        Ok(result)
    }

    fn snapshot(&self) -> Result<HostSnapshot, String> {
        self.require_live()?;
        let _gate = self.gate.lock().map_err(|_| "Host unavailable")?;
        self.snapshot_locked()
    }
    fn snapshot_locked(&self) -> Result<HostSnapshot, String> {
        Ok(HostSnapshot {
            sequence: *self.changed.borrow(),
            host: self.host.host_status()?,
            acceptor: self.acceptor.with_acceptor(|state| state.status())?,
            usb: self.usb_status(),
        })
    }

    fn stop(&self) -> Result<HostSnapshot, String> {
        self.require_live()?;
        let _gate = self.gate.lock().map_err(|_| "Host unavailable")?;
        self.stop_locked()
    }

    fn stop_if_revoked(&self) -> Result<(), String> {
        if self.retired.load(Ordering::Acquire) {
            return Ok(());
        }
        let _gate = self.gate.lock().map_err(|_| "Host unavailable")?;
        let generation = self.session_generation.load(Ordering::Acquire);
        if generation == 0 || self.session_for(generation).is_ok() {
            return Ok(());
        }
        self.stop_locked().map(|_| ())
    }

    fn stop_locked(&self) -> Result<HostSnapshot, String> {
        self.host.begin_responder_task()?;
        self.session_generation.store(0, Ordering::Release);
        self.acceptor.cancel_all_tasks()?;
        self.host
            .set_status(|state| *state = IosHostStatus::default())?;
        self.notify();
        self.presence.offline()?;
        self.snapshot_locked()
    }
}

#[cfg(test)]
mod tests;

/// Caller holds host_gate while revoking session admission and retiring old controllers.
pub(super) fn retire_for_erase_locked(session: &super::Inner) -> Result<(), String> {
    let hosts = session
        .native_hosts
        .lock()
        .map_err(|_| "Host unavailable")?;
    let mut failed = false;
    for host in hosts.iter().filter_map(Weak::upgrade) {
        host.retired.store(true, Ordering::Release);
        host.explicitly_stopped.store(true, Ordering::Release);
        host.stop_usb_all();
        failed |= host.stop_locked().is_err();
    }
    if failed {
        Err("Host shutdown did not finish".into())
    } else {
        Ok(())
    }
}

pub(super) fn erase_storage_locked(root: &std::path::Path) -> Result<(), String> {
    HostStorage::erase(root)
}
