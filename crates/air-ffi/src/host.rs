//! The foreign handle projects host metadata; keys and protocol state stay in Rust.
use super::*;
use chromvoid_client_runtime::session::native_host::{
    AcceptorState, HostSnapshot, IosHostErrorKind, IosHostPhase, NativeHost, StartHostError,
    UsbApprovalKind, UsbHostStatus, UsbLinkState, UsbStopReason,
};

#[derive(uniffi::Enum)]
pub enum AirHostPhase {
    Idle,
    Pairing,
    Ready,
    Error,
    PairingExpired,
}
#[derive(uniffi::Enum)]
pub enum AirHostConnectionState {
    Idle,
    Listening,
    Handshaking,
    Connected,
    Disconnected,
}
#[derive(uniffi::Record)]
pub struct AirHostPairingOffer {
    pub session_id: String,
    pub relay_base_url: String,
    pub device_label: String,
    pub expires_at_ms: u64,
}
#[derive(uniffi::Record)]
pub struct AirHostPeer {
    pub peer_id: String,
    pub label: String,
    pub platform: String,
}
#[derive(uniffi::Record)]
pub struct AirHostConnection {
    pub peer_id: String,
    pub label: String,
    pub transport: String,
}
#[derive(uniffi::Record)]
pub struct AirHostSnapshot {
    pub sequence: u64,
    pub phase: AirHostPhase,
    pub connection_state: AirHostConnectionState,
    pub relay_url: Option<String>,
    pub device_id: Option<String>,
    pub device_label: Option<String>,
    pub pairing_pin: Option<String>,
    pub pairing_offer: Option<AirHostPairingOffer>,
    pub presence_expires_at_ms: Option<u64>,
    pub connected_peers: Vec<AirHostConnection>,
    pub error: Option<String>,
    /// A desktop on the phone's USB accessory link; absent while no cable carries one.
    #[uniffi(default = None)]
    pub usb: Option<AirUsbStatus>,
}
#[derive(uniffi::Enum)]
pub enum AirUsbLinkState {
    Connecting,
    Pairing,
    AwaitingApproval,
    Connected,
}
/// A desktop the phone does not know asks to pair: its person types this PIN on the desktop
/// and allows the pairing here.
#[derive(uniffi::Record)]
pub struct AirUsbPairingRequest {
    pub attempt_id: String,
    pub pin: String,
    pub desktop: String,
    pub fingerprint: String,
    pub attempts_left: u8,
    pub expires_at_ms: u64,
    pub allowed: bool,
}
/// A trusted desktop asks to use the vault for this session.
#[derive(uniffi::Record)]
pub struct AirUsbSessionRequest {
    pub attempt_id: String,
    pub desktop: String,
    pub expires_at_ms: u64,
}
#[derive(uniffi::Record)]
pub struct AirUsbStatus {
    pub state: AirUsbLinkState,
    pub desktop: Option<String>,
    pub pairing: Option<AirUsbPairingRequest>,
    pub session: Option<AirUsbSessionRequest>,
}
#[derive(uniffi::Enum)]
pub enum AirUsbApprovalKind {
    Pairing,
    Session,
}
fn usb_status(status: UsbHostStatus) -> Option<AirUsbStatus> {
    let state = match status.state {
        UsbLinkState::Idle => return None,
        UsbLinkState::Connecting => AirUsbLinkState::Connecting,
        UsbLinkState::Pairing => AirUsbLinkState::Pairing,
        UsbLinkState::AwaitingApproval => AirUsbLinkState::AwaitingApproval,
        UsbLinkState::Connected => AirUsbLinkState::Connected,
    };
    Some(AirUsbStatus {
        state,
        desktop: status.desktop,
        pairing: status.pairing.map(|pairing| AirUsbPairingRequest {
            attempt_id: pairing.attempt_id,
            pin: pairing.pin,
            desktop: pairing.desktop,
            fingerprint: pairing.fingerprint,
            attempts_left: pairing.attempts_left,
            expires_at_ms: pairing.expires_at_ms,
            allowed: pairing.allowed,
        }),
        session: status.session.map(|session| AirUsbSessionRequest {
            attempt_id: session.attempt_id,
            desktop: session.desktop,
            expires_at_ms: session.expires_at_ms,
        }),
    })
}
#[derive(uniffi::Record)]
pub struct AirHostPreferences {
    pub relay_url: Option<String>,
    pub enabled: bool,
}
impl From<HostSnapshot> for AirHostSnapshot {
    fn from(value: HostSnapshot) -> Self {
        Self {
            sequence: value.sequence,
            phase: match value.host.phase {
                IosHostPhase::Idle => AirHostPhase::Idle,
                IosHostPhase::Pairing => AirHostPhase::Pairing,
                IosHostPhase::Ready => AirHostPhase::Ready,
                IosHostPhase::Error
                    if value.host.error_kind == Some(IosHostErrorKind::PairingExpired) =>
                {
                    AirHostPhase::PairingExpired
                }
                IosHostPhase::Error => AirHostPhase::Error,
            },
            connection_state: match value.acceptor.state {
                AcceptorState::Idle => AirHostConnectionState::Idle,
                AcceptorState::Listening => AirHostConnectionState::Listening,
                AcceptorState::Handshaking => AirHostConnectionState::Handshaking,
                AcceptorState::Connected => AirHostConnectionState::Connected,
                AcceptorState::Disconnected => AirHostConnectionState::Disconnected,
            },
            relay_url: value.host.relay_url,
            device_id: value.host.device_id,
            device_label: value.host.device_label,
            pairing_pin: value.host.pairing_pin,
            pairing_offer: value.host.pairing_offer.map(|offer| AirHostPairingOffer {
                session_id: offer.session_id,
                relay_base_url: offer.relay_base_url,
                device_label: offer.device_label,
                expires_at_ms: offer.expires_at_ms,
            }),
            presence_expires_at_ms: value.host.presence.map(|presence| presence.expires_at_ms),
            connected_peers: value
                .acceptor
                .connected_peers
                .into_iter()
                .map(|peer| AirHostConnection {
                    peer_id: peer.peer_id,
                    label: peer.label,
                    transport: peer.transport_type,
                })
                .collect(),
            error: value.host.error,
            usb: usb_status(value.usb),
        }
    }
}

#[derive(uniffi::Object)]
pub struct AirHost {
    host: NativeHost,
}

#[uniffi::export]
impl AirRuntime {
    /// One controller per application runtime, created lazily without starting a listener.
    pub fn host(&self) -> Result<Arc<AirHost>, BridgeError> {
        let mut owner = self.host.lock().map_err(|_| BridgeError::HostUnavailable)?;
        if let Some(host) = owner.as_ref().filter(|host| !host.host.is_retired()) {
            return Ok(host.clone());
        }
        let host = Arc::new(AirHost {
            host: NativeHost::new(&self.session).map_err(|_| BridgeError::HostUnavailable)?,
        });
        *owner = Some(host.clone());
        Ok(host)
    }
}
impl AirRuntime {
    pub(super) fn suspend_host(&self) {
        let host = self
            .host
            .lock()
            .unwrap_or_else(std::sync::PoisonError::into_inner)
            .clone();
        if let Some(host) = host {
            let _ = host.host.suspend();
        }
    }
}

#[uniffi::export]
impl AirHost {
    pub fn snapshot(&self) -> Result<AirHostSnapshot, BridgeError> {
        self.host
            .snapshot()
            .map(Into::into)
            .map_err(|_| BridgeError::HostUnavailable)
    }
    pub async fn events(&self, after_sequence: u64) -> Result<AirHostSnapshot, BridgeError> {
        self.host
            .events(after_sequence)
            .await
            .map(Into::into)
            .map_err(|_| BridgeError::HostUnavailable)
    }
    pub fn start_pairing(
        &self,
        generation: u64,
        relay_url: String,
        device_label: String,
    ) -> Result<AirHostSnapshot, BridgeError> {
        self.host
            .start_pairing(generation, relay_url, device_label)
            .map(Into::into)
            .map_err(start_error)
    }
    pub fn start_listening(
        &self,
        generation: u64,
        relay_url: String,
        device_label: String,
    ) -> Result<AirHostSnapshot, BridgeError> {
        self.host
            .start_listening(generation, relay_url, device_label)
            .map(Into::into)
            .map_err(start_error)
    }
    pub async fn resume_if_enabled(
        &self,
        generation: u64,
        device_label: String,
    ) -> Result<AirHostSnapshot, BridgeError> {
        self.host
            .resume_if_enabled(generation, device_label)
            .await
            .map(Into::into)
            .map_err(start_error)
    }
    pub fn stop(&self) -> Result<AirHostSnapshot, BridgeError> {
        self.host
            .stop()
            .map(Into::into)
            .map_err(|_| BridgeError::HostUnavailable)
    }
    pub async fn preferences(&self) -> Result<AirHostPreferences, BridgeError> {
        self.host
            .configuration()
            .await
            .map(|config| AirHostPreferences {
                relay_url: config.relay_url,
                enabled: config.enabled,
            })
            .map_err(|_| BridgeError::HostUnavailable)
    }
    pub async fn trusted_peers(&self) -> Result<Vec<AirHostPeer>, BridgeError> {
        self.host
            .trusted_peers()
            .await
            .map(|peers| {
                peers
                    .into_iter()
                    .map(|peer| AirHostPeer {
                        peer_id: peer.peer_id,
                        label: peer.label,
                        platform: peer.platform,
                    })
                    .collect()
            })
            .map_err(|_| BridgeError::HostUnavailable)
    }
    pub async fn revoke_peer(&self, peer_id: String) -> Result<(), BridgeError> {
        self.host
            .revoke_peer(peer_id)
            .await
            .map_err(|_| BridgeError::HostUnavailable)
    }
}
#[uniffi::export]
impl AirHost {
    /// Serves the desktop on the Android accessory whose descriptor is `fd`, until the session
    /// ends. The descriptor is taken only when this returns true; on false it stays the
    /// caller's to close. A session already on the link is replaced.
    pub fn start_usb_accessory(&self, session_id: String, fd: i32, device_label: String) -> bool {
        #[cfg(unix)]
        {
            use chromvoid_client_runtime::session::native_host::UsbLinkOpener;
            use chromvoid_network_runtime::usb_mobile::record::UsbRecordTransport;
            use chromvoid_protocol::RemoteTransport;
            use std::os::fd::{FromRawFd, OwnedFd};
            if fd < 0 || session_id.is_empty() || !self.host.usb_session_admissible() {
                return false;
            }
            // SAFETY: the caller detached `fd` for this call and gives it up on true, which
            // every path below returns; the descriptor is closed by whoever holds it last.
            let fd = unsafe { OwnedFd::from_raw_fd(fd) };
            let open: UsbLinkOpener = Box::new(move || {
                let stream = super::usb_accessory::AccessoryStream::attach(fd)?;
                Ok(Box::new(UsbRecordTransport::new(stream)) as Box<dyn RemoteTransport>)
            });
            // The opener owns the descriptor now; a refusal drops it, which closes it.
            let _ = self.host.start_usb_session(session_id, device_label, open);
            true
        }
        #[cfg(not(unix))]
        {
            let _ = (session_id, fd, device_label);
            false
        }
    }

    /// Ends the session for a reason of the platform's: `accessory_detached`,
    /// `explicit_disconnect`, `session_replaced` or `local_error`.
    pub fn stop_usb_accessory(&self, session_id: String, reason: String) {
        self.host
            .stop_usb_session(&session_id, UsbStopReason::from_code(&reason));
    }

    /// Waits for the session to end and names why: only `shutdown` means nothing should listen
    /// for the desktop again while the accessory stays attached.
    pub async fn usb_accessory_ended(&self, session_id: String) -> String {
        self.host
            .usb_session_end(&session_id)
            .await
            .map(|end| end.code().to_string())
            .unwrap_or_else(|_| "shutdown".into())
    }

    /// The person's answer to a pairing or session request; false when it is no longer asked.
    pub fn resolve_usb_approval(
        &self,
        kind: AirUsbApprovalKind,
        attempt_id: String,
        allow: bool,
    ) -> bool {
        let kind = match kind {
            AirUsbApprovalKind::Pairing => UsbApprovalKind::Pairing,
            AirUsbApprovalKind::Session => UsbApprovalKind::Session,
        };
        self.host
            .resolve_usb_approval(kind, &attempt_id, allow)
            .unwrap_or(false)
    }
}
fn start_error(error: StartHostError) -> BridgeError {
    match error {
        StartHostError::InvalidRelay => BridgeError::InvalidRelayURL,
        StartHostError::DeviceLabelRequired => BridgeError::HostDeviceLabelRequired,
        StartHostError::SessionRevoked => BridgeError::SessionRevoked,
        StartHostError::Unavailable => BridgeError::HostUnavailable,
    }
}

#[cfg(all(test, feature = "fixture"))]
#[path = "host_tests.rs"]
mod tests;
