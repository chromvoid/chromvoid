//! One desktop over the phone's USB accessory link (Android Open Accessory). The link carries
//! the relay host's Noise channel and protocol; what a cable adds is its own trust and consent.
//! A desktop the phone has not seen pairs here, with a PIN the phone shows and the person's
//! consent, into the same trusted list the relay uses. Every session then waits for the person
//! to allow it before the desktop reaches the vault, and ends when the phone's vault locks.
//!
//! The platform owns the accessory and its descriptor; this module owns everything on the link.
//! How a session ended tells the platform whether to listen for the desktop's next attempt.
use super::*;
use crate::session::peer_host::{UsbDecision, UsbExit, UsbGate, serve_usb_peer};
use chromvoid_network_runtime::acceptor::handshake::{HandshakeOutcome, perform_handshake};
use chromvoid_network_runtime::local_identity::LocalDeviceIdentity;
use chromvoid_network_runtime::paired_peers::PairedPeer;
use chromvoid_network_runtime::remote_io::RemoteIoFailure;
use chromvoid_network_runtime::usb_mobile::pairing::{
    MobileUsbPairingApprovalAck, MobileUsbPairingApprovalAction, MobileUsbPairingApprovalChallenge,
    MobileUsbPairingHello, USB_PAIRING_CANCEL_V1, hex_encode, pairing_fingerprint,
    recv_pairing_approval_proof, recv_pairing_hello, send_pairing_approval_ack,
    send_pairing_approval_challenge, send_pairing_hello, verify_pairing_approval_proof,
};
use chromvoid_protocol::{NoiseTransport, RemoteTransport, TransportError};
use rand::RngCore;
use std::collections::HashMap;
use std::time::{Duration, SystemTime, UNIX_EPOCH};
use tokio::sync::oneshot;
use zeroize::Zeroizing;

/// How long a pairing's PIN and a session's question wait for the person.
const APPROVAL_TIMEOUT: Duration = Duration::from_secs(5 * 60);
/// How long a desktop's unread first message waits for the next session.
const REPLAY_FRESH: Duration = Duration::from_secs(10);
/// The longest record remembered in case it is a desktop starting over.
const REMEMBERED_BYTES: usize = 512;
/// Wrong PINs a desktop may try before the pairing ends.
const PAIRING_ATTEMPTS: u8 = 5;
/// What the phone's trusted list records as the address of a desktop paired over a cable.
const USB_PEER_ADDRESS: &str = "usb://android-aoa";

#[derive(Clone, Copy, Debug, PartialEq, Eq, Serialize)]
#[serde(rename_all = "snake_case")]
pub enum UsbLinkState {
    Idle,
    /// A desktop on the cable is opening the encrypted channel.
    Connecting,
    /// A desktop the phone does not know asks to pair.
    Pairing,
    /// A trusted desktop waits for the person to allow this session.
    AwaitingApproval,
    Connected,
}

#[derive(Clone, Debug, Serialize)]
pub struct UsbPairingRequest {
    pub attempt_id: String,
    /// Shown on the phone and typed on the desktop.
    pub pin: String,
    pub desktop: String,
    pub fingerprint: String,
    pub attempts_left: u8,
    pub expires_at_ms: u64,
    /// The person allowed it; the desktop still has to prove the PIN.
    pub allowed: bool,
}

#[derive(Clone, Debug, Serialize)]
pub struct UsbSessionRequest {
    pub attempt_id: String,
    pub desktop: String,
    pub expires_at_ms: u64,
}

#[derive(Clone, Debug, Serialize)]
pub struct UsbHostStatus {
    pub state: UsbLinkState,
    pub desktop: Option<String>,
    pub pairing: Option<UsbPairingRequest>,
    pub session: Option<UsbSessionRequest>,
}

impl Default for UsbHostStatus {
    fn default() -> Self {
        Self {
            state: UsbLinkState::Idle,
            desktop: None,
            pairing: None,
            session: None,
        }
    }
}

#[derive(Clone, Copy, Debug, PartialEq, Eq)]
pub enum UsbApprovalKind {
    Pairing,
    Session,
}

/// Why the platform stopped a session.
#[derive(Clone, Copy, Debug, PartialEq, Eq)]
pub enum UsbStopReason {
    AccessoryDetached,
    ExplicitDisconnect,
    SessionReplaced,
    LocalError,
}

impl UsbStopReason {
    pub fn from_code(code: &str) -> Self {
        match code {
            "accessory_detached" => Self::AccessoryDetached,
            "explicit_disconnect" => Self::ExplicitDisconnect,
            "session_replaced" => Self::SessionReplaced,
            _ => Self::LocalError,
        }
    }
    fn code(self) -> &'static str {
        match self {
            Self::AccessoryDetached => "accessory_detached",
            Self::ExplicitDisconnect => "explicit_disconnect",
            Self::SessionReplaced => "session_replaced",
            Self::LocalError => "local_error",
        }
    }
}

/// How a session ended. Only `Shutdown` means nothing should listen for the desktop again:
/// the host itself stopped here. Everything the desktop or the link did leaves the accessory
/// worth listening on while it stays attached.
#[derive(Clone, Copy, Debug, PartialEq, Eq)]
pub enum UsbSessionEnd {
    Stopped(UsbStopReason),
    Shutdown,
    VaultLocked,
    ClientDisconnected,
    PairingCancelled,
    /// The desktop's trust was revoked on the phone.
    PeerClosed,
    TransportClosed,
    StreamTimeout,
    /// The link or the desktop broke the protocol, or the person said no.
    DataPlaneError,
}

impl UsbSessionEnd {
    pub fn code(self) -> &'static str {
        match self {
            Self::Stopped(reason) => reason.code(),
            Self::Shutdown => "shutdown",
            Self::VaultLocked => "vault_locked",
            Self::ClientDisconnected => "client_disconnected",
            Self::PairingCancelled => "pairing_cancelled",
            Self::PeerClosed => "peer_closed",
            Self::TransportClosed => "transport_closed",
            Self::StreamTimeout => "stream_timeout",
            Self::DataPlaneError => "data_plane_error",
        }
    }
}

/// A byte link the platform opened; called inside the host's executor.
pub type UsbLinkOpener =
    Box<dyn FnOnce() -> std::io::Result<Box<dyn RemoteTransport>> + Send + 'static>;

#[derive(Default)]
pub(super) struct UsbState {
    status: UsbHostStatus,
    /// A desktop's first message that an earlier session could not read: sent after that
    /// desktop left without a word, which a cable cannot tell. The next session starts with it.
    replay: Option<(std::time::Instant, Vec<u8>)>,
    active: Option<ActiveSession>,
    ends: HashMap<String, watch::Sender<Option<UsbSessionEnd>>>,
    pairing: Option<watch::Sender<UsbDecision>>,
    session: Option<watch::Sender<UsbDecision>>,
}

struct ActiveSession {
    id: String,
    stop: Option<oneshot::Sender<UsbSessionEnd>>,
    peer_id: Option<String>,
}

impl NativeHost {
    /// Whether a session can start now: the host is live and the application's session is
    /// active. The platform hands over the accessory's descriptor only after a yes.
    pub fn usb_session_admissible(&self) -> bool {
        self.inner.usb_generation().is_ok()
    }

    /// Serves the desktop on a USB accessory link until the session ends; a session already on
    /// the link is replaced. `open` turns the platform's descriptor into a link, inside the
    /// host's executor; the descriptor belongs to it from this call on, whatever happens.
    pub fn start_usb_session(
        &self,
        id: String,
        device_label: String,
        open: UsbLinkOpener,
    ) -> Result<(), String> {
        let executor = self.executor.as_ref().ok_or("Host executor unavailable")?;
        let (stop, stopped) = oneshot::channel();
        let (end, _) = watch::channel(None);
        {
            let mut usb = self.inner.usb.lock().map_err(|_| "Host unavailable")?;
            if let Some(previous) = usb.active.take() {
                if let Some(stop) = previous.stop {
                    let _ = stop.send(UsbSessionEnd::Stopped(UsbStopReason::SessionReplaced));
                }
            }
            usb.ends.retain(|_, end| end.borrow().is_none());
            usb.ends.insert(id.clone(), end.clone());
            usb.active = Some(ActiveSession {
                id: id.clone(),
                stop: Some(stop),
                peer_id: None,
            });
        }
        let inner = self.inner.clone();
        executor.spawn(async move {
            tracing::info!("usb session: started");
            let outcome = match open() {
                Ok(link) => inner.serve_usb(&id, device_label, link, stopped).await,
                Err(error) => {
                    tracing::warn!(%error, "usb session: the link did not open");
                    UsbSessionEnd::DataPlaneError
                }
            };
            tracing::info!(end = outcome.code(), "usb session: ended");
            inner.finish_usb(&id);
            // Kept even with nobody waiting yet: the platform may ask after the session ended.
            end.send_replace(Some(outcome));
        });
        Ok(())
    }

    /// Ends the session `id` for a reason of the platform's; an ended session is left alone.
    pub fn stop_usb_session(&self, id: &str, reason: UsbStopReason) {
        self.inner
            .stop_usb_where(|active| active.id == id, UsbSessionEnd::Stopped(reason));
    }

    /// Waits for the session `id` to end and says how. A host that went away first ended it.
    pub async fn usb_session_end(&self, id: &str) -> Result<UsbSessionEnd, String> {
        let mut end = self
            .inner
            .usb
            .lock()
            .map_err(|_| "Host unavailable")?
            .ends
            .get(id)
            .ok_or("No such USB session")?
            .subscribe();
        let outcome = match end.wait_for(Option::is_some).await {
            Ok(outcome) => outcome.unwrap_or(UsbSessionEnd::Shutdown),
            Err(_) => UsbSessionEnd::Shutdown,
        };
        if let Ok(mut usb) = self.inner.usb.lock() {
            usb.ends.remove(id);
        }
        Ok(outcome)
    }

    /// The person's answer on the phone. A pairing is only allowed where its PIN is shown, so
    /// this is the only way to allow one; a session may also be answered from a notification.
    pub fn resolve_usb_approval(
        &self,
        kind: UsbApprovalKind,
        attempt_id: &str,
        allow: bool,
    ) -> Result<bool, String> {
        let mut usb = self.inner.usb.lock().map_err(|_| "Host unavailable")?;
        let decision = if allow {
            UsbDecision::Allowed
        } else {
            UsbDecision::Denied
        };
        let answered = match kind {
            UsbApprovalKind::Pairing => {
                let current = usb
                    .status
                    .pairing
                    .as_ref()
                    .is_some_and(|pairing| pairing.attempt_id == attempt_id);
                match usb.pairing.as_ref().filter(|_| current) {
                    Some(sender) => {
                        sender.send_replace(decision);
                        if let Some(pairing) = usb.status.pairing.as_mut() {
                            pairing.allowed = allow;
                        }
                        true
                    }
                    None => false,
                }
            }
            UsbApprovalKind::Session => {
                let current = usb
                    .status
                    .session
                    .as_ref()
                    .is_some_and(|session| session.attempt_id == attempt_id);
                match usb.session.take().filter(|_| current) {
                    Some(sender) => {
                        sender.send_replace(decision);
                        usb.status.session = None;
                        if allow {
                            usb.status.state = UsbLinkState::Connected;
                        }
                        true
                    }
                    None => false,
                }
            }
        };
        drop(usb);
        tracing::info!(?kind, allow, answered, "usb session: the person answered");
        if answered {
            self.inner.notify();
        }
        Ok(answered)
    }
}

impl HostInner {
    pub(super) fn usb_status(&self) -> UsbHostStatus {
        self.usb
            .lock()
            .map(|usb| usb.status.clone())
            .unwrap_or_default()
    }

    /// Ends every session, for the host itself going away.
    pub(super) fn stop_usb_all(&self) {
        self.stop_usb_where(|_| true, UsbSessionEnd::Shutdown);
    }

    /// The executor is going away with its tasks: whoever waits for a session's end hears that
    /// the host shut down.
    pub(super) fn abandon_usb(&self) {
        self.stop_usb_all();
        if let Ok(usb) = self.usb.lock() {
            for end in usb.ends.values() {
                end.send_if_modified(|end| {
                    let pending = end.is_none();
                    if pending {
                        *end = Some(UsbSessionEnd::Shutdown);
                    }
                    pending
                });
            }
        }
    }

    /// Ends a session whose desktop's trust was just revoked.
    pub(super) fn stop_usb_peer(&self, peer_id: &str) {
        self.stop_usb_where(
            |active| active.peer_id.as_deref() == Some(peer_id),
            UsbSessionEnd::PeerClosed,
        );
    }

    fn stop_usb_where(&self, matches: impl Fn(&ActiveSession) -> bool, end: UsbSessionEnd) {
        let Ok(mut usb) = self.usb.lock() else {
            return;
        };
        if let Some(active) = usb.active.as_mut().filter(|active| matches(active)) {
            if let Some(stop) = active.stop.take() {
                let _ = stop.send(end);
            }
        }
    }

    fn usb_generation(&self) -> Result<u64, String> {
        self.require_live()?;
        let session = self.session.upgrade().ok_or("Host session closed")?;
        let state = session.snapshot().map_err(|_| "Host session unavailable")?;
        if state.cleanup_pending
            || !matches!(state.phase, SessionPhase::Locked | SessionPhase::Unlocked)
        {
            return Err("Host session revoked".into());
        }
        Ok(state.generation)
    }

    fn set_usb(&self, change: impl FnOnce(&mut UsbState)) {
        if let Ok(mut usb) = self.usb.lock() {
            change(&mut usb);
        }
        self.notify();
    }

    fn finish_usb(&self, id: &str) {
        self.set_usb(|usb| {
            if usb.active.as_ref().is_some_and(|active| active.id == id) {
                usb.active = None;
                usb.status = UsbHostStatus::default();
                usb.pairing = None;
                usb.session = None;
            }
        });
    }

    async fn serve_usb(
        self: &Arc<Self>,
        id: &str,
        device_label: String,
        mut link: Box<dyn RemoteTransport>,
        mut stopped: oneshot::Receiver<UsbSessionEnd>,
    ) -> UsbSessionEnd {
        let outcome = self
            .serve_usb_link(id, device_label, link.as_mut(), &mut stopped)
            .await;
        let _ = tokio::time::timeout(Duration::from_secs(1), link.close()).await;
        outcome
    }

    async fn serve_usb_link(
        self: &Arc<Self>,
        id: &str,
        device_label: String,
        link: &mut dyn RemoteTransport,
        stopped: &mut oneshot::Receiver<UsbSessionEnd>,
    ) -> UsbSessionEnd {
        if self.usb_generation().is_err() {
            return UsbSessionEnd::Shutdown;
        }
        // The desktop speaks first; a cable can wait for it as long as it stays attached. What
        // the last session could not read may be exactly that.
        let replayed = self.usb.lock().ok().and_then(|mut usb| usb.replay.take());
        let first = match replayed.filter(|(at, _)| at.elapsed() < REPLAY_FRESH) {
            Some((_, first)) => {
                tracing::info!("usb session: starting with what the last session could not read");
                Ok(first)
            }
            None => tokio::select! {
                first = link.recv() => first,
                end = &mut *stopped => return end.unwrap_or(UsbSessionEnd::Shutdown),
            },
        };
        let first = match first {
            Ok(first) => first,
            Err(TransportError::Closed) => return UsbSessionEnd::TransportClosed,
            Err(error) => {
                tracing::warn!(%error, "usb session: the first message failed");
                return UsbSessionEnd::DataPlaneError;
            }
        };
        tracing::info!(
            len = first.len(),
            "usb session: the desktop's first message"
        );
        self.set_usb(|usb| usb.status.state = UsbLinkState::Connecting);
        let inner = self.clone();
        let trust = tokio::task::spawn_blocking(move || {
            let _gate = inner.gate.lock().map_err(|_| "Host unavailable")?;
            inner.require_live()?;
            Ok::<_, String>((
                inner.storage.peers()?,
                inner.storage.identity(&device_label)?,
            ))
        })
        .await;
        let Ok(Ok((store, identity))) = trust else {
            return UsbSessionEnd::DataPlaneError;
        };
        let Ok(private) = hex::decode(&identity.static_privkey_hex).map(Zeroizing::new) else {
            return UsbSessionEnd::DataPlaneError;
        };
        let outcome = tokio::select! {
            outcome = perform_handshake(link, &first, &store, &private) => outcome,
            end = &mut *stopped => return end.unwrap_or(UsbSessionEnd::Shutdown),
        };
        let (noise, peer_id, desktop) = match outcome {
            Ok(HandshakeOutcome::Paired {
                noise,
                peer_id,
                label,
            }) => {
                tracing::info!("usb session: a trusted desktop");
                (noise, peer_id, label)
            }
            Ok(HandshakeOutcome::UnknownPeer {
                noise,
                remote_pubkey,
            }) => {
                tracing::info!("usb session: an unknown desktop, pairing");
                match self
                    .pair_usb(link, noise, remote_pubkey, &identity, stopped)
                    .await
                {
                    Ok(paired) => paired,
                    Err(end) => return end,
                }
            }
            Err(error) => {
                tracing::warn!(%error, "usb session: the handshake failed");
                return UsbSessionEnd::DataPlaneError;
            }
        };
        if self.acceptor.is_peer_revoked(&peer_id).unwrap_or(true) {
            return UsbSessionEnd::PeerClosed;
        }
        // The vault may have locked since the link opened; the session serves the current one.
        let Ok(generation) = self.usb_generation() else {
            return UsbSessionEnd::Shutdown;
        };
        let peer = {
            let Ok(_gate) = self.gate.lock() else {
                return UsbSessionEnd::Shutdown;
            };
            match self.session_for(generation).and_then(|session| {
                session
                    .open_peer_session(generation)
                    .map_err(|_| String::from("Host session revoked"))
            }) {
                Ok(peer) => peer,
                Err(_) => return UsbSessionEnd::Shutdown,
            }
        };
        let (decision, decided) = watch::channel(UsbDecision::Pending);
        let Some(gate) = UsbGate::new(&peer, decided) else {
            return UsbSessionEnd::Shutdown;
        };
        let attempt_id = random_id();
        let expires_at_ms = now_ms().saturating_add(APPROVAL_TIMEOUT.as_millis() as u64);
        self.set_usb(|usb| {
            if let Some(active) = usb.active.as_mut().filter(|active| active.id == id) {
                active.peer_id = Some(peer_id.clone());
            }
            usb.status.state = UsbLinkState::AwaitingApproval;
            usb.status.desktop = Some(desktop.clone());
            usb.status.session = Some(UsbSessionRequest {
                attempt_id: attempt_id.clone(),
                desktop: desktop.clone(),
                expires_at_ms,
            });
            usb.session = Some(decision.clone());
        });
        let expiry = {
            let decision = decision.clone();
            let inner = self.clone();
            let attempt_id = attempt_id.clone();
            tokio::spawn(async move {
                tokio::time::sleep(APPROVAL_TIMEOUT).await;
                if *decision.borrow() == UsbDecision::Pending {
                    decision.send_replace(UsbDecision::Expired);
                    inner.set_usb(|usb| {
                        if usb
                            .status
                            .session
                            .as_ref()
                            .is_some_and(|session| session.attempt_id == attempt_id)
                        {
                            usb.status.session = None;
                            usb.session = None;
                        }
                    });
                }
            })
        };
        tracing::info!("usb session: asking the person to allow it");
        let (shutdown, shut) = oneshot::channel();
        let mut remembering = Remembering { link, last: None };
        let (served, stop) = {
            let serve = serve_usb_peer(peer, &mut remembering, noise, peer_id, shut, gate);
            tokio::pin!(serve);
            tokio::select! {
                served = &mut serve => (served, None),
                end = &mut *stopped => {
                    let _ = shutdown.send(());
                    (serve.await, Some(end.unwrap_or(UsbSessionEnd::Shutdown)))
                }
            }
        };
        expiry.abort();
        drop(decision);
        if let (Err(RemoteIoFailure::DecryptFailure { .. }), None) = (&served, stop) {
            // A record this session cannot read is most likely a desktop starting over.
            if let (Some(last), Ok(mut usb)) = (remembering.last.take(), self.usb.lock()) {
                usb.replay = Some((std::time::Instant::now(), last));
            }
        }
        match (served, stop) {
            (_, Some(end)) => end,
            (Ok(UsbExit::Stopped), None) => UsbSessionEnd::Shutdown,
            (Ok(UsbExit::VaultLockRequested | UsbExit::VaultLocked), None) => {
                UsbSessionEnd::VaultLocked
            }
            (Ok(UsbExit::ClientDisconnected), None) => UsbSessionEnd::ClientDisconnected,
            (Ok(UsbExit::Denied | UsbExit::Expired), None) => UsbSessionEnd::DataPlaneError,
            (Err(failure), None) => ended_by(&failure),
        }
    }

    /// The desktop is unknown: pair it here, or end the session.
    async fn pair_usb(
        self: &Arc<Self>,
        link: &mut dyn RemoteTransport,
        mut noise: NoiseTransport,
        remote_pubkey: Vec<u8>,
        identity: &LocalDeviceIdentity,
        stopped: &mut oneshot::Receiver<UsbSessionEnd>,
    ) -> Result<(NoiseTransport, String, String), UsbSessionEnd> {
        let failed = |_| UsbSessionEnd::DataPlaneError;
        let hello = recv_pairing_hello(link, &mut noise).await.map_err(failed)?;
        let remote_hex = hex_encode(&remote_pubkey);
        if hello.peer_pubkey_hex != remote_hex {
            return Err(UsbSessionEnd::DataPlaneError);
        }
        send_pairing_hello(
            link,
            &mut noise,
            &MobileUsbPairingHello {
                peer_id: identity.device_id.clone(),
                peer_label: identity.device_label.clone(),
                peer_pubkey_hex: identity.static_pubkey_hex.clone(),
                platform: "android".into(),
                capabilities: vec![USB_PAIRING_CANCEL_V1.into()],
            },
        )
        .await
        .map_err(failed)?;

        let attempt_id = random_id();
        let pin = Zeroizing::new(format!("{:06}", rand::random::<u32>() % 1_000_000));
        let expires_at_ms = now_ms().saturating_add(APPROVAL_TIMEOUT.as_millis() as u64);
        let challenge = MobileUsbPairingApprovalChallenge {
            attempt_id: attempt_id.clone(),
            salt_hex: random_id(),
            host_pubkey_hex: identity.static_pubkey_hex.clone(),
            peer_fingerprint: pairing_fingerprint(&remote_pubkey),
            attempts_left: PAIRING_ATTEMPTS,
            expires_at_ms,
        };
        let (decision, mut decided) = watch::channel(UsbDecision::Pending);
        self.set_usb(|usb| {
            usb.status.state = UsbLinkState::Pairing;
            usb.status.desktop = Some(hello.peer_label.clone());
            usb.status.pairing = Some(UsbPairingRequest {
                attempt_id: attempt_id.clone(),
                pin: pin.to_string(),
                desktop: hello.peer_label.clone(),
                fingerprint: challenge.peer_fingerprint.clone(),
                attempts_left: PAIRING_ATTEMPTS,
                expires_at_ms,
                allowed: false,
            });
            usb.pairing = Some(decision);
        });
        let result = self
            .confirm_pairing(
                link,
                &mut noise,
                &challenge,
                &pin,
                &remote_hex,
                &mut decided,
                stopped,
            )
            .await;
        self.set_usb(|usb| {
            usb.status.pairing = None;
            usb.pairing = None;
        });
        let attempts_left = result?;

        let inner = self.clone();
        let peer = PairedPeer {
            peer_id: hello.peer_id.clone(),
            label: hello.peer_label.clone(),
            relay_url: USB_PEER_ADDRESS.into(),
            peer_pubkey: remote_pubkey,
            client_pubkey: hex::decode(&identity.static_pubkey_hex)
                .map_err(|_| UsbSessionEnd::DataPlaneError)?,
            client_privkey_hex: identity.static_privkey_hex.clone(),
            last_seen: now_ms() / 1_000,
            paired_at: now_ms() / 1_000,
            platform: hello.platform.clone(),
        };
        let stored = tokio::task::spawn_blocking(move || {
            let _gate = inner.gate.lock().map_err(|_| "Host unavailable")?;
            inner.usb_generation()?;
            let mut store = inner.storage.peers()?;
            store.upsert(peer)?;
            store.save()?;
            inner.acceptor.clear_peer_revocation(&hello.peer_id)?;
            Ok::<_, String>(hello)
        })
        .await;
        let hello = match stored {
            Ok(Ok(hello)) => hello,
            other => {
                let error = match other {
                    Ok(Err(error)) => error,
                    _ => "Trusted devices task unavailable".into(),
                };
                let _ = send_pairing_approval_ack(
                    link,
                    &mut noise,
                    &MobileUsbPairingApprovalAck {
                        attempt_id,
                        accepted: false,
                        error: Some(error),
                        attempts_left,
                    },
                )
                .await;
                return Err(UsbSessionEnd::DataPlaneError);
            }
        };
        self.notify();
        send_pairing_approval_ack(
            link,
            &mut noise,
            &MobileUsbPairingApprovalAck {
                attempt_id,
                accepted: true,
                error: None,
                attempts_left,
            },
        )
        .await
        .map_err(failed)?;
        Ok((noise, hello.peer_id, hello.peer_label))
    }

    /// The desktop proves the PIN and the person allows the pairing, in either order. Returns
    /// the attempts left once both are done.
    #[allow(clippy::too_many_arguments)]
    async fn confirm_pairing(
        &self,
        link: &mut dyn RemoteTransport,
        noise: &mut NoiseTransport,
        challenge: &MobileUsbPairingApprovalChallenge,
        pin: &str,
        remote_hex: &str,
        decided: &mut watch::Receiver<UsbDecision>,
        stopped: &mut oneshot::Receiver<UsbSessionEnd>,
    ) -> Result<u8, UsbSessionEnd> {
        let failed = |_| UsbSessionEnd::DataPlaneError;
        let deadline = tokio::time::Instant::now() + APPROVAL_TIMEOUT;
        send_pairing_approval_challenge(link, noise, challenge)
            .await
            .map_err(failed)?;
        let attempt_id = &challenge.attempt_id;
        let mut attempts_left = PAIRING_ATTEMPTS;
        let ack = |accepted: bool, error: &str, attempts_left: u8| MobileUsbPairingApprovalAck {
            attempt_id: attempt_id.clone(),
            accepted,
            error: (!error.is_empty()).then(|| error.to_string()),
            attempts_left,
        };
        loop {
            let proof = tokio::select! {
                proof = recv_pairing_approval_proof(link, noise) => proof.map_err(failed)?,
                _ = async { decided.wait_for(|decision| *decision == UsbDecision::Denied).await.map(|_| ()) } => {
                    let _ = send_pairing_approval_ack(link, noise, &ack(false, "phone rejected USB pairing approval", attempts_left)).await;
                    return Err(UsbSessionEnd::DataPlaneError);
                }
                _ = tokio::time::sleep_until(deadline) => {
                    let _ = send_pairing_approval_ack(link, noise, &ack(false, "USB pairing approval expired", attempts_left)).await;
                    return Err(UsbSessionEnd::DataPlaneError);
                }
                end = &mut *stopped => return Err(end.unwrap_or(UsbSessionEnd::Shutdown)),
            };
            if proof.attempt_id == *attempt_id
                && proof.action == MobileUsbPairingApprovalAction::Cancel
            {
                let _ = send_pairing_approval_ack(
                    link,
                    noise,
                    &ack(false, "pairing_cancelled", attempts_left),
                )
                .await;
                return Err(UsbSessionEnd::PairingCancelled);
            }
            let proven = proof.attempt_id == *attempt_id
                && verify_pairing_approval_proof(
                    pin,
                    attempt_id,
                    &challenge.salt_hex,
                    remote_hex,
                    &challenge.host_pubkey_hex,
                    &proof.proof_hex,
                )
                .unwrap_or(false);
            if proven {
                tracing::info!("usb pairing: the PIN is proven");
                break;
            }
            attempts_left = attempts_left.saturating_sub(1);
            tracing::info!(attempts_left, "usb pairing: a wrong PIN");
            let _ = send_pairing_approval_ack(
                link,
                noise,
                &ack(false, "approval PIN proof failed", attempts_left),
            )
            .await;
            self.set_usb(|usb| {
                if let Some(pairing) = usb.status.pairing.as_mut() {
                    pairing.attempts_left = attempts_left;
                }
            });
            if attempts_left == 0 {
                return Err(UsbSessionEnd::DataPlaneError);
            }
        }
        let decision = tokio::select! {
            decision = async {
                decided
                    .wait_for(|decision| *decision != UsbDecision::Pending)
                    .await
                    .map(|decision| *decision)
            } => decision.unwrap_or(UsbDecision::Expired),
            _ = tokio::time::sleep_until(deadline) => UsbDecision::Expired,
            end = &mut *stopped => return Err(end.unwrap_or(UsbSessionEnd::Shutdown)),
        };
        tracing::info!(?decision, "usb pairing: the person answered");
        match decision {
            UsbDecision::Allowed => Ok(attempts_left),
            UsbDecision::Denied => {
                let _ = send_pairing_approval_ack(
                    link,
                    noise,
                    &ack(false, "phone rejected USB pairing approval", attempts_left),
                )
                .await;
                Err(UsbSessionEnd::DataPlaneError)
            }
            UsbDecision::Pending | UsbDecision::Expired => {
                let _ = send_pairing_approval_ack(
                    link,
                    noise,
                    &ack(false, "USB pairing approval expired", attempts_left),
                )
                .await;
                Err(UsbSessionEnd::DataPlaneError)
            }
        }
    }
}

/// The session's link, remembering the last short record it carried: a handshake's first
/// message is short, a data record seldom is.
struct Remembering<'a> {
    link: &'a mut dyn RemoteTransport,
    last: Option<Vec<u8>>,
}

#[async_trait::async_trait]
impl RemoteTransport for Remembering<'_> {
    async fn send(&mut self, data: &[u8]) -> Result<(), TransportError> {
        self.link.send(data).await
    }
    async fn recv(&mut self) -> Result<Vec<u8>, TransportError> {
        let record = self.link.recv().await?;
        self.last = (record.len() <= REMEMBERED_BYTES).then(|| record.clone());
        Ok(record)
    }
    async fn close(&mut self) -> Result<(), TransportError> {
        self.link.close().await
    }
    fn transport_type(&self) -> chromvoid_protocol::TransportType {
        self.link.transport_type()
    }
}

fn ended_by(failure: &RemoteIoFailure) -> UsbSessionEnd {
    if failure.is_transport_closed() {
        UsbSessionEnd::TransportClosed
    } else if failure.is_stream_timeout() {
        UsbSessionEnd::StreamTimeout
    } else {
        UsbSessionEnd::DataPlaneError
    }
}

fn random_id() -> String {
    let mut bytes = [0u8; 16];
    rand::thread_rng().fill_bytes(&mut bytes);
    hex::encode(bytes)
}

fn now_ms() -> u64 {
    SystemTime::now()
        .duration_since(UNIX_EPOCH)
        .unwrap_or_default()
        .as_millis() as u64
}

#[cfg(test)]
#[path = "usb_tests.rs"]
mod tests;
