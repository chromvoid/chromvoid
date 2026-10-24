use super::*;
use chromvoid_network_runtime::acceptor::handshake::{HandshakeOutcome, perform_handshake};
use chromvoid_network_runtime::acceptor::{ConnectedPeer, PeerConnection, PeerRegistrationResult};
use chromvoid_network_runtime::connection::{ConnectionState, NetworkConnectionManager};
use chromvoid_network_runtime::ios_control::{
    CreatePairingSessionRequest, CreatePairingSessionResponse, HostPresence, create_pairing_session,
};
use chromvoid_network_runtime::local_identity::LocalDeviceIdentity;
use chromvoid_network_runtime::paired_peers::PairedPeer;
use chromvoid_network_runtime::pairing_transport::{
    PairingHello, pin_to_psk, recv_pairing_hello, send_pairing_hello, xxpsk0_responder,
};
use chromvoid_network_runtime::wss_transport::WssTransport;
use chromvoid_protocol::RemoteTransport;
use rand::RngCore;
use std::time::{Duration, SystemTime, UNIX_EPOCH};
use tokio::sync::oneshot;
use zeroize::{Zeroize, Zeroizing};

/// What the phone tells the desktop it pairs with: the platform this host runs on, so a
/// desktop can tell an Android phone from an iPhone. Both speak the same native protocol.
const HOST_PLATFORM: &str = if cfg!(target_os = "android") {
    "android"
} else {
    "ios"
};

const CONTROL_TIMEOUT: Duration = Duration::from_secs(15);

#[derive(Debug, thiserror::Error)]
pub(super) enum HostOperationError {
    #[error("Pairing offer expired")]
    PairingExpired,
    #[error("{0}")]
    Other(String),
}

impl HostOperationError {
    pub(super) fn kind(&self) -> Option<IosHostErrorKind> {
        match self {
            Self::PairingExpired => Some(IosHostErrorKind::PairingExpired),
            Self::Other(_) => None,
        }
    }
}
impl From<String> for HostOperationError {
    fn from(error: String) -> Self {
        Self::Other(error)
    }
}
impl From<&str> for HostOperationError {
    fn from(error: &str) -> Self {
        Self::Other(error.into())
    }
}

pub(super) fn validate_relay(input: &str) -> Result<String, String> {
    let url = reqwest::Url::parse(input.trim()).map_err(|_| "Invalid relay URL")?;
    let local_debug = cfg!(debug_assertions)
        && matches!(url.host_str(), Some("127.0.0.1" | "[::1]" | "localhost"));
    if !(url.scheme() == "wss" || (local_debug && url.scheme() == "ws"))
        || url.host_str().is_none()
        || !url.username().is_empty()
        || url.password().is_some()
        || url.query().is_some()
        || url.fragment().is_some()
        || !matches!(url.path(), "" | "/")
    {
        return Err("Choose a secure relay origin without credentials or a path".into());
    }
    Ok(url.as_str().trim_end_matches('/').to_owned())
}

fn now_ms() -> u64 {
    SystemTime::now()
        .duration_since(UNIX_EPOCH)
        .unwrap_or_default()
        .as_millis() as u64
}
fn room_id() -> String {
    let mut bytes = [0u8; 32];
    rand::rngs::OsRng.fill_bytes(&mut bytes);
    hex::encode(bytes)
}

struct Identity(LocalDeviceIdentity);
impl Drop for Identity {
    fn drop(&mut self) {
        self.0.static_privkey_hex.zeroize();
    }
}

impl HostInner {
    pub(super) async fn run(
        self: &Arc<Self>,
        operation: u64,
        generation: u64,
        relay: String,
        label: String,
        mode: StartMode,
    ) -> Result<(), HostOperationError> {
        let inner = self.clone();
        let identity = Identity(
            tokio::task::spawn_blocking(move || {
                inner.current(operation, generation, |inner| {
                    inner.storage.identity(&label)
                })
            })
            .await
            .map_err(|_| "Host identity task unavailable")??,
        );
        self.current(operation, generation, |inner| {
            inner.host.set_status(|status| {
                status.device_id = Some(identity.0.device_id.clone());
                status.device_label = Some(identity.0.device_label.clone());
            })?;
            Ok(())
        })?;
        if matches!(mode, StartMode::Pair) {
            self.persist_enabled(operation, Some(relay.clone()), false)
                .await?;
            let request = CreatePairingSessionRequest {
                peer_id: identity.0.device_id.clone(),
                device_label: identity.0.device_label.clone(),
                peer_pubkey_hex: identity.0.static_pubkey_hex.clone(),
                relay_url: relay.clone(),
            };
            let session =
                tokio::time::timeout(CONTROL_TIMEOUT, create_pairing_session(&relay, &request))
                    .await
                    .map_err(|_| "Pairing service timed out")??;
            if validate_relay(&session.relay_url)? != relay
                || session.pin.is_empty()
                || session.room_id.is_empty()
            {
                return Err("Pairing service returned an invalid or expired offer".into());
            }
            if session.expires_at_ms <= now_ms() {
                return Err(HostOperationError::PairingExpired);
            }
            self.current(operation, generation, |inner| {
                inner.host.set_status(|status| {
                    status.pairing_pin = Some(session.pin.clone());
                    status.pairing_offer = Some(session.offer.clone());
                    status.expires_at_ms = Some(session.expires_at_ms);
                })?;
                Ok(())
            })?;
            self.pair(operation, generation, &identity.0, &session)
                .await?;
        } else {
            let inner = self.clone();
            let count = tokio::task::spawn_blocking(move || {
                inner.current(operation, generation, |inner| {
                    inner.storage.peers().map(|store| store.list().len())
                })
            })
            .await
            .map_err(|_| "Trusted devices task unavailable")??;
            if count == 0 {
                return Err("Pair a device before starting the host".into());
            }
        }
        self.launch_listener(operation, generation, relay, identity.0.clone())?;
        Ok(())
    }

    async fn pair(
        self: &Arc<Self>,
        operation: u64,
        generation: u64,
        identity: &LocalDeviceIdentity,
        session: &CreatePairingSessionResponse,
    ) -> Result<(), HostOperationError> {
        let private = Zeroizing::new(
            hex::decode(&identity.static_privkey_hex).map_err(|_| "Invalid host identity")?,
        );
        let mut transport = WssTransport::connect_with_context(
            &session.relay_url,
            &session.room_id,
            "native_pairing",
        )
        .await?;
        let remaining = Duration::from_millis(session.expires_at_ms.saturating_sub(now_ms()));
        let exchange = tokio::time::timeout(remaining, async {
            let psk = Zeroizing::new(pin_to_psk(&session.pin));
            let mut noise = xxpsk0_responder(&mut transport, &private, &psk, remaining).await?;
            let remote = recv_pairing_hello(&mut transport, &mut noise).await?;
            if remote.peer_id.trim().is_empty()
                || remote.peer_label.trim().is_empty()
                || hex::decode(&remote.peer_pubkey_hex).ok().as_deref()
                    != Some(noise.remote_pubkey())
            {
                return Err("Pairing identity did not match the authenticated device".into());
            }
            send_pairing_hello(
                &mut transport,
                &mut noise,
                &PairingHello {
                    peer_id: identity.device_id.clone(),
                    peer_label: identity.device_label.clone(),
                    peer_pubkey_hex: identity.static_pubkey_hex.clone(),
                    platform: HOST_PLATFORM.into(),
                },
            )
            .await?;
            Ok::<_, String>(remote)
        })
        .await;
        let remote = match exchange {
            Ok(Ok(remote)) => remote,
            // The outer deadline and the handshake's first-message deadline may race.
            // Both mean the offer expired; classify at the owner, not from error text.
            Err(_) => return Err(HostOperationError::PairingExpired),
            Ok(Err(_)) if session.expires_at_ms <= now_ms() => {
                return Err(HostOperationError::PairingExpired);
            }
            Ok(Err(error)) => return Err(error.into()),
        };
        let inner = self.clone();
        let peer = PairedPeer {
            peer_id: remote.peer_id,
            label: remote.peer_label,
            relay_url: session.relay_url.clone(),
            peer_pubkey: hex::decode(remote.peer_pubkey_hex).map_err(|_| "Invalid paired key")?,
            client_pubkey: hex::decode(&identity.static_pubkey_hex)
                .map_err(|_| "Invalid host key")?,
            client_privkey_hex: identity.static_privkey_hex.clone(),
            last_seen: now_ms() / 1_000,
            paired_at: now_ms() / 1_000,
            platform: remote.platform,
        };
        let expires = session.expires_at_ms;
        let stored = tokio::task::spawn_blocking(move || {
            inner.current(operation, generation, |inner| {
                if expires <= now_ms() {
                    return Ok(false);
                }
                let mut store = inner.storage.peers()?;
                let id = peer.peer_id.clone();
                store.upsert(peer)?;
                store.save()?;
                inner.acceptor.clear_peer_revocation(&id)?;
                inner.host.set_status(|status| {
                    status.paired_peer_id = Some(id);
                    status.pairing_pin = None;
                    status.pairing_offer = None;
                    status.expires_at_ms = None;
                })?;
                Ok(true)
            })
        })
        .await
        .map_err(|_| "Pairing storage task unavailable")??;
        if !stored {
            return Err(HostOperationError::PairingExpired);
        }
        let _ = tokio::time::timeout(Duration::from_secs(1), transport.close()).await;
        Ok(())
    }

    fn launch_listener(
        self: &Arc<Self>,
        operation: u64,
        generation: u64,
        relay: String,
        identity: LocalDeviceIdentity,
    ) -> Result<(), String> {
        self.current(operation, generation, |inner| {
            let room = room_id();
            let (shutdown, mut stopped) = oneshot::channel();
            let (listener, _) = inner.acceptor.begin_listener_session(
                relay.clone(), room.clone(), shutdown,
            )?;
            let work = self.clone();
            let task = tokio::spawn(async move {
                let identity = Identity(identity);
                let mut room = room;
                let mut persist_intent = true;
                loop {
                    let result = tokio::select! {
                        biased;
                        _ = &mut stopped => break,
                        result = work.listen(operation, generation, listener, &relay, &room, &identity.0, persist_intent) => result,
                        result = work.refresh_presence(generation, listener, &relay, &room, &identity.0.device_id) => result,
                    };
                    if let Err(error) = result {
                        let _ = work.listener_current(listener, generation, |inner| {
                            inner.acceptor.cancel_all_tasks()?;
                            inner.presence.offline()?;
                            inner.host.set_status(|status| {
                                status.phase = IosHostPhase::Error;
                                status.presence = None;
                                status.error = Some(error);
                            })?;
                            Ok(())
                        });
                        break;
                    }
                    // A departed peer may still occupy the old relay room. The listener
                    // and its presence refresh move together to one newly advertised room.
                    persist_intent = false;
                    room = room_id();
                    if work.listener_current(listener, generation, |inner| {
                        inner.acceptor.with_acceptor_if_current(listener, |state| {
                            state.room_id = Some(room.clone());
                        })?.ok_or("Host listener stopped")?;
                        Ok(())
                    }).is_err() {
                        break;
                    }
                }
                let _ = work.acceptor.clear_listener_task_if_current(listener);
            });
            inner.acceptor.store_listener_task(listener, task)?;
            Ok(())
        })
    }

    async fn publish_ready(
        &self,
        generation: u64,
        listener: u64,
        relay: &str,
        room: &str,
        device: &str,
    ) -> Result<HostPresence, String> {
        let response = self.listener_current(listener, generation, |inner| {
            inner.presence.ready(relay, device, room)
        })?;
        response.await.map_err(|_| "Host presence unavailable")?
    }

    async fn refresh_presence(
        &self,
        generation: u64,
        listener: u64,
        relay: &str,
        room: &str,
        device: &str,
    ) -> Result<(), String> {
        let mut interval = tokio::time::interval(Duration::from_millis(presence::TTL_MS / 2));
        interval.set_missed_tick_behavior(tokio::time::MissedTickBehavior::Delay);
        interval.tick().await;
        loop {
            interval.tick().await;
            let presence = self
                .publish_ready(generation, listener, relay, room, device)
                .await?;
            self.listener_current(listener, generation, |inner| {
                inner
                    .host
                    .set_status(|status| status.presence = Some(presence))?;
                Ok(())
            })?;
        }
    }

    async fn listen(
        self: &Arc<Self>,
        operation: u64,
        generation: u64,
        listener: u64,
        relay: &str,
        room: &str,
        identity: &LocalDeviceIdentity,
        persist_intent: bool,
    ) -> Result<(), String> {
        let private = Zeroizing::new(
            hex::decode(&identity.static_privkey_hex).map_err(|_| "Invalid host key")?,
        );
        let mut first_connection = persist_intent;
        loop {
            let mut transport =
                WssTransport::connect_with_context(relay, room, "native_host").await?;
            let presence = self
                .publish_ready(generation, listener, relay, room, &identity.device_id)
                .await?;
            if first_connection {
                self.persist_enabled(operation, Some(relay.into()), true)
                    .await?;
                first_connection = false;
            }
            self.listener_current(listener, generation, |inner| {
                inner.host.set_status(|status| {
                    status.phase = IosHostPhase::Ready;
                    status.presence = Some(presence);
                    status.error = None;
                })?;
                Ok(())
            })?;
            // The room is allowed to wait for its desktop peer. Stop/lifecycle cancels
            // this whole listener, including a suspended socket or handshake write.
            let first = transport
                .recv()
                .await
                .map_err(|_| "Host transport disconnected")?;
            let inner = self.clone();
            let store = tokio::task::spawn_blocking(move || {
                inner.listener_current(listener, generation, |inner| inner.storage.peers())
            })
            .await
            .map_err(|_| "Trusted devices task unavailable")??;
            let outcome = match perform_handshake(&mut transport, &first, &store, &private).await {
                Ok(outcome) => outcome,
                Err(_) => {
                    let _ = tokio::time::timeout(Duration::from_secs(1), transport.close()).await;
                    continue;
                }
            };
            let HandshakeOutcome::Paired {
                noise,
                peer_id,
                label,
            } = outcome
            else {
                let _ = tokio::time::timeout(Duration::from_secs(1), transport.close()).await;
                continue;
            };
            let (shutdown, stopped) = oneshot::channel();
            let peer = self.listener_current(listener, generation, |inner| {
                let session = inner.session_for(generation)?;
                let peer = session
                    .open_peer_session(generation)
                    .map_err(|_| "Host session revoked")?;
                let mut manager = NetworkConnectionManager::new();
                manager.transition(ConnectionState::Syncing);
                let result = inner.acceptor.add_peer_if_current(
                    listener,
                    ConnectedPeer {
                        peer_id: peer_id.clone(),
                        label,
                        connected_at_ms: now_ms(),
                        transport_type: "wss_relay".into(),
                    },
                    PeerConnection {
                        conn_mgr: manager,
                        generation: listener,
                        shutdown_tx: Some(shutdown),
                        task_handle: None,
                    },
                )?;
                match result {
                    PeerRegistrationResult::Added => Ok(Some(peer)),
                    PeerRegistrationResult::Revoked => Ok(None),
                    PeerRegistrationResult::StaleGeneration => Err("Host listener stopped".into()),
                }
            })?;
            let Some(peer) = peer else {
                let _ = tokio::time::timeout(Duration::from_secs(1), transport.close()).await;
                continue;
            };
            let _ = super::super::peer_host::serve_peer(
                peer,
                Box::new(transport),
                noise,
                peer_id.clone(),
                stopped,
            )
            .await;
            self.listener_current(listener, generation, |inner| {
                inner.acceptor.remove_peer_if_current(listener, &peer_id)?;
                inner
                    .host
                    .set_status(|status| status.phase = IosHostPhase::Pairing)?;
                Ok(())
            })?;
            // Ready is published again only after the replacement socket is connected.
            return Ok(());
        }
    }
}
