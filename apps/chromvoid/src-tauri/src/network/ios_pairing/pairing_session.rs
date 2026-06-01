use std::path::Path;
use std::sync::{Arc, Mutex};
use std::time::Duration;

use chromvoid_protocol::{NoiseTransport, RemoteTransport};
use tracing::{info, warn};

use super::super::ios_control::{
    fetch_pairing_session, publish_host_presence, CreatePairingSessionResponse,
    PublishHostPresenceRequest,
};
use super::super::ios_peers::{PairedIosPeer, PairedIosPeerStore};
use super::super::mobile_acceptor::{self, MobileAcceptorRuntimeState};
use super::super::paired_peers::{PairedPeer, PairedPeerStore};
use super::super::pairing::pin_to_psk;
use super::super::wss_transport::WssTransport;
use super::state::{update_persisted_host_mode_blocking, IosHostRuntimeState};
use super::LocalDeviceIdentity;
use super::{
    generate_room_id_for, ios_peers_path, legacy_peers_path, load_or_create_identity, now_ms,
    now_secs, IosHostPhase, PairingHello, HOST_PRESENCE_TTL_MS, PAIRING_HANDSHAKE_TIMEOUT,
    PAIRING_INITIAL_WAIT_FLOOR,
};
use crate::core_adapter::CoreAdapter;

pub async fn desktop_pair(
    offer: &super::PairingOffer,
    pin: &str,
    storage_root: &Path,
    fallback_label: &str,
) -> Result<PairedIosPeer, String> {
    info!(
        "ios_pairing: desktop_pair:start session_id={} relay_base_url={} offer_device_label={} pin_len={} fallback_label={}",
        offer.session_id,
        offer.relay_base_url,
        offer.device_label,
        pin.len(),
        fallback_label
    );
    let session = fetch_pairing_session(&offer.relay_base_url, &offer.session_id).await?;
    info!(
        "ios_pairing: desktop_pair:fetched_session session_id={} relay_url={} room_id={} expires_at_ms={}",
        session.session_id, session.relay_url, session.room_id, session.expires_at_ms
    );
    if session.expires_at_ms <= now_ms() {
        return Err("pairing offer expired".to_string());
    }

    let identity = load_or_create_identity(storage_root, fallback_label)?;
    info!(
        "ios_pairing: desktop_pair:identity_ready device_id={} device_label={}",
        identity.device_id, identity.device_label
    );
    let local_privkey = hex::decode(&identity.static_privkey_hex)
        .map_err(|e| format!("invalid local identity privkey: {e}"))?;
    info!(
        "ios_pairing: desktop_pair:connecting_transport relay_url={} room_id={}",
        session.relay_url, session.room_id
    );
    let mut transport = Box::new(
        WssTransport::connect_with_context(&session.relay_url, &session.room_id, "desktop_pairing")
            .await?,
    ) as Box<dyn RemoteTransport>;
    info!(
        "ios_pairing: desktop_pair:transport_connected session_id={} room_id={}",
        session.session_id, session.room_id
    );

    info!(
        "ios_pairing: desktop_pair:noise_handshake:start session_id={}",
        session.session_id
    );
    let mut noise = xxpsk0_initiator(transport.as_mut(), &local_privkey, &pin_to_psk(pin)).await?;
    info!(
        "ios_pairing: desktop_pair:noise_handshake:done session_id={}",
        session.session_id
    );

    info!(
        "ios_pairing: desktop_pair:send_hello session_id={} peer_id={}",
        session.session_id, identity.device_id
    );
    send_pairing_hello(
        transport.as_mut(),
        &mut noise,
        &PairingHello {
            peer_id: identity.device_id.clone(),
            peer_label: identity.device_label.clone(),
            peer_pubkey_hex: identity.static_pubkey_hex.clone(),
            platform: if cfg!(desktop) {
                "desktop".to_string()
            } else {
                "mobile".to_string()
            },
        },
    )
    .await?;
    info!(
        "ios_pairing: desktop_pair:recv_hello:start session_id={}",
        session.session_id
    );
    let remote = recv_pairing_hello(transport.as_mut(), &mut noise).await?;
    info!(
        "ios_pairing: desktop_pair:recv_hello:done session_id={} remote_peer_id={} remote_label={}",
        session.session_id, remote.peer_id, remote.peer_label
    );

    let remote_static_hex = hex::encode(noise.remote_pubkey());
    if remote.peer_pubkey_hex != remote_static_hex {
        return Err("pairing hello pubkey mismatch".to_string());
    }

    let peer = PairedIosPeer {
        peer_id: remote.peer_id,
        peer_label: remote.peer_label,
        peer_pubkey_hex: remote.peer_pubkey_hex,
        relay_url: session.relay_url,
        last_seen: now_secs(),
        paired_at: now_secs(),
        platform: "ios".to_string(),
    };

    let mut store = PairedIosPeerStore::load(&ios_peers_path(storage_root));
    store.upsert(peer.clone());
    store.save()?;
    info!(
        "ios_pairing: desktop_pair:stored_peer session_id={} peer_id={}",
        session.session_id, peer.peer_id
    );
    Ok(peer)
}

pub(super) async fn run_pairing_responder(
    runtime: Arc<IosHostRuntimeState>,
    acceptor_runtime: Arc<MobileAcceptorRuntimeState>,
    adapter: Option<Arc<Mutex<Box<dyn CoreAdapter>>>>,
    session: CreatePairingSessionResponse,
    storage_root: std::path::PathBuf,
    identity: LocalDeviceIdentity,
    responder_generation: u64,
) -> Result<(), String> {
    info!(
        "ios_pairing: waiting for desktop peer in session={} room={}",
        session.session_id, session.room_id
    );

    let local_privkey = hex::decode(&identity.static_privkey_hex)
        .map_err(|e| format!("invalid local identity privkey: {e}"))?;
    let local_pubkey = hex::decode(&identity.static_pubkey_hex)
        .map_err(|e| format!("invalid local identity pubkey: {e}"))?;
    info!(
        "ios_pairing: run_pairing_responder:connecting_transport session_id={} room_id={}",
        session.session_id, session.room_id
    );
    let mut transport = Box::new(
        WssTransport::connect_with_context(
            &session.relay_url,
            &session.room_id,
            "ios_pairing_responder",
        )
        .await?,
    ) as Box<dyn RemoteTransport>;
    info!(
        "ios_pairing: run_pairing_responder:transport_connected session_id={} room_id={}",
        session.session_id, session.room_id
    );
    info!(
        "ios_pairing: run_pairing_responder:noise_handshake:start session_id={}",
        session.session_id
    );
    let initial_msg_timeout = pairing_initial_wait_timeout(session.expires_at_ms);
    info!(
        "ios_pairing: run_pairing_responder:awaiting_desktop_msg1 session_id={} timeout_secs={}",
        session.session_id,
        initial_msg_timeout.as_secs()
    );
    let mut noise = xxpsk0_responder(
        transport.as_mut(),
        &local_privkey,
        &pin_to_psk(&session.pin),
        initial_msg_timeout,
    )
    .await?;
    info!(
        "ios_pairing: run_pairing_responder:noise_handshake:done session_id={}",
        session.session_id
    );

    info!(
        "ios_pairing: run_pairing_responder:recv_hello:start session_id={}",
        session.session_id
    );
    let remote = recv_pairing_hello(transport.as_mut(), &mut noise).await?;
    info!(
        "ios_pairing: run_pairing_responder:recv_hello:done session_id={} remote_peer_id={} remote_label={}",
        session.session_id, remote.peer_id, remote.peer_label
    );
    let remote_static = noise.remote_pubkey().to_vec();
    if remote.peer_pubkey_hex != hex::encode(&remote_static) {
        return Err("desktop pairing hello pubkey mismatch".to_string());
    }
    if !runtime.is_responder_generation_current(responder_generation) {
        return Ok(());
    }

    info!(
        "ios_pairing: run_pairing_responder:send_hello session_id={} peer_id={}",
        session.session_id, identity.device_id
    );
    send_pairing_hello(
        transport.as_mut(),
        &mut noise,
        &PairingHello {
            peer_id: identity.device_id.clone(),
            peer_label: identity.device_label.clone(),
            peer_pubkey_hex: identity.static_pubkey_hex.clone(),
            platform: "ios".to_string(),
        },
    )
    .await?;
    if !runtime.is_responder_generation_current(responder_generation) {
        return Ok(());
    }

    let mut legacy_store = PairedPeerStore::load(&legacy_peers_path(&storage_root));
    legacy_store.upsert(PairedPeer {
        peer_id: remote.peer_id.clone(),
        label: remote.peer_label.clone(),
        relay_url: session.relay_url.clone(),
        peer_pubkey: remote_static,
        client_pubkey: local_pubkey,
        client_privkey_hex: identity.static_privkey_hex.clone(),
        last_seen: now_secs(),
        paired_at: now_secs(),
        platform: remote.platform,
    });
    legacy_store.save()?;
    info!(
        "ios_pairing: run_pairing_responder:stored_legacy_peer session_id={} peer_id={}",
        session.session_id, remote.peer_id
    );

    let host_room_id = generate_room_id_for("post_pairing_ready_host");
    info!(
        "ios_pairing: run_pairing_responder:restart_acceptor_for_ready_host session_id={} room_id={}",
        session.session_id, host_room_id
    );
    let _ = mobile_acceptor::stop_listening(&acceptor_runtime);
    mobile_acceptor::start_listening(
        acceptor_runtime,
        adapter,
        &session.relay_url,
        &host_room_id,
        &storage_root,
    )
    .await?;
    if !runtime.is_responder_generation_current(responder_generation) {
        return Ok(());
    }
    let presence = publish_host_presence(
        &session.relay_url,
        &identity.device_id,
        &PublishHostPresenceRequest {
            relay_url: session.relay_url.clone(),
            room_id: host_room_id,
            status: "ready".to_string(),
            ttl_ms: Some(HOST_PRESENCE_TTL_MS),
        },
    )
    .await?;

    if let Err(error) = update_persisted_host_mode_blocking(
        storage_root.clone(),
        Some(session.relay_url.clone()),
        true,
        "iOS pairing responder host mode persistence",
    )
    .await
    {
        warn!("ios_pairing: failed to persist paired host mode: {error}");
    }

    if let Err(error) = crate::network::ios_push::sync_push_registration_for_relay(
        &session.relay_url,
        &storage_root,
    )
    .await
    {
        warn!("ios_pairing: failed to sync push registration after pairing: {error}");
    }

    if let Err(error) = crate::mobile::ios::background_refresh::schedule() {
        warn!("ios_pairing: failed to schedule background refresh after pairing: {error}");
    }
    if !runtime.is_responder_generation_current(responder_generation) {
        return Ok(());
    }

    runtime.set_status(|state| {
        state.phase = IosHostPhase::Ready;
        state.relay_url = Some(session.relay_url.clone());
        state.device_id = Some(identity.device_id.clone());
        state.device_label = Some(identity.device_label.clone());
        state.presence = Some(presence);
        state.paired_peer_id = Some(remote.peer_id);
        state.error = None;
    })?;
    Ok(())
}

async fn send_pairing_hello(
    transport: &mut dyn RemoteTransport,
    noise: &mut NoiseTransport,
    hello: &PairingHello,
) -> Result<(), String> {
    let plaintext =
        serde_json::to_vec(hello).map_err(|e| format!("serialize pairing hello: {e}"))?;
    let encrypted = noise
        .encrypt(&plaintext)
        .map_err(|e| format!("encrypt pairing hello: {e}"))?;
    transport
        .send(&encrypted)
        .await
        .map_err(|e| format!("send pairing hello: {e}"))
}

async fn recv_with_timeout(
    transport: &mut dyn RemoteTransport,
    label: &str,
) -> Result<Vec<u8>, String> {
    recv_with_timeout_for(transport, label, PAIRING_HANDSHAKE_TIMEOUT).await
}

async fn recv_with_timeout_for(
    transport: &mut dyn RemoteTransport,
    label: &str,
    timeout_duration: Duration,
) -> Result<Vec<u8>, String> {
    match tokio::time::timeout(timeout_duration, transport.recv()).await {
        Ok(Ok(data)) => Ok(data),
        Ok(Err(error)) => Err(format!("{label}: {error}")),
        Err(_) => Err(format!(
            "{label}: timeout after {}s",
            timeout_duration.as_secs()
        )),
    }
}

pub(super) fn pairing_initial_wait_timeout(expires_at_ms: u64) -> Duration {
    Duration::from_millis(expires_at_ms.saturating_sub(now_ms())).max(PAIRING_INITIAL_WAIT_FLOOR)
}

async fn recv_pairing_hello(
    transport: &mut dyn RemoteTransport,
    noise: &mut NoiseTransport,
) -> Result<PairingHello, String> {
    let encrypted = recv_with_timeout(transport, "recv pairing hello").await?;
    let plaintext = noise
        .decrypt(&encrypted)
        .map_err(|e| format!("decrypt pairing hello: {e}"))?;
    serde_json::from_slice::<PairingHello>(&plaintext)
        .map_err(|e| format!("decode pairing hello: {e}"))
}

async fn xxpsk0_initiator(
    transport: &mut dyn RemoteTransport,
    local_privkey: &[u8],
    psk: &[u8; 32],
) -> Result<NoiseTransport, String> {
    use chromvoid_protocol::{MAX_HANDSHAKE_MSG, NOISE_PARAMS_XXPSK0};
    use snow::params::NoiseParams;

    let params: NoiseParams = NOISE_PARAMS_XXPSK0
        .parse()
        .map_err(|e: snow::Error| format!("noise params: {e}"))?;
    let mut initiator = snow::Builder::new(params)
        .psk(0, psk)
        .map_err(|e| format!("psk setup: {e}"))?
        .local_private_key(local_privkey)
        .map_err(|e| format!("local_private_key: {e}"))?
        .build_initiator()
        .map_err(|e| format!("build_initiator: {e}"))?;
    let mut buf = vec![0u8; MAX_HANDSHAKE_MSG];

    let len1 = initiator
        .write_message(&[], &mut buf)
        .map_err(|e| format!("xxpsk0 msg1 write: {e}"))?;
    transport
        .send(&buf[..len1])
        .await
        .map_err(|e| format!("xxpsk0 msg1 send: {e}"))?;

    let msg2 = recv_with_timeout(transport, "xxpsk0 msg2 recv").await?;
    initiator
        .read_message(&msg2, &mut buf)
        .map_err(|e| format!("xxpsk0 msg2 read: {e}"))?;

    let len3 = initiator
        .write_message(&[], &mut buf)
        .map_err(|e| format!("xxpsk0 msg3 write: {e}"))?;
    transport
        .send(&buf[..len3])
        .await
        .map_err(|e| format!("xxpsk0 msg3 send: {e}"))?;

    let remote_pubkey = initiator
        .get_remote_static()
        .ok_or("xxpsk0: no remote static key")?
        .to_vec();
    let state = initiator
        .into_transport_mode()
        .map_err(|e| format!("xxpsk0 into_transport_mode: {e}"))?;
    Ok(NoiseTransport::new(state, remote_pubkey))
}

async fn xxpsk0_responder(
    transport: &mut dyn RemoteTransport,
    local_privkey: &[u8],
    psk: &[u8; 32],
    initial_msg_timeout: Duration,
) -> Result<NoiseTransport, String> {
    use chromvoid_protocol::{MAX_HANDSHAKE_MSG, NOISE_PARAMS_XXPSK0};
    use snow::params::NoiseParams;

    let params: NoiseParams = NOISE_PARAMS_XXPSK0
        .parse()
        .map_err(|e: snow::Error| format!("noise params: {e}"))?;
    let mut responder = snow::Builder::new(params)
        .psk(0, psk)
        .map_err(|e| format!("psk setup: {e}"))?
        .local_private_key(local_privkey)
        .map_err(|e| format!("local_private_key: {e}"))?
        .build_responder()
        .map_err(|e| format!("build_responder: {e}"))?;
    let mut buf = vec![0u8; MAX_HANDSHAKE_MSG];

    let msg1 = recv_with_timeout_for(transport, "xxpsk0 msg1 recv", initial_msg_timeout).await?;
    responder
        .read_message(&msg1, &mut buf)
        .map_err(|e| format!("xxpsk0 msg1 read: {e}"))?;

    let len2 = responder
        .write_message(&[], &mut buf)
        .map_err(|e| format!("xxpsk0 msg2 write: {e}"))?;
    transport
        .send(&buf[..len2])
        .await
        .map_err(|e| format!("xxpsk0 msg2 send: {e}"))?;

    let msg3 = recv_with_timeout(transport, "xxpsk0 msg3 recv").await?;
    responder
        .read_message(&msg3, &mut buf)
        .map_err(|e| format!("xxpsk0 msg3 read: {e}"))?;

    let remote_pubkey = responder
        .get_remote_static()
        .ok_or("xxpsk0: no remote static key")?
        .to_vec();
    let state = responder
        .into_transport_mode()
        .map_err(|e| format!("xxpsk0 into_transport_mode: {e}"))?;
    Ok(NoiseTransport::new(state, remote_pubkey))
}
