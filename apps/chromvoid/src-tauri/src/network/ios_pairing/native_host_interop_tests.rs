//! Explicit local integration with the repository's real relay and desktop client path.
use super::*;
use crate::core_adapter::{CoreAdapter, RemoteCoreAdapter, RemoteHost};
use crate::network::PairedIosPeer;
use crate::remote_data_plane::{
    handshake_ik_over_transport, spawn_remote_io_task_with_timing, RemoteIoEvent,
    RemoteIoTaskConfig, RemoteIoTaskHandle, RemoteIoTaskTiming,
};
use chromvoid_client_runtime::session::native_host::{HostSnapshot, NativeHost};
use chromvoid_client_runtime::session::{LocalSession, SessionPhase};
use chromvoid_client_runtime::LocalCoreAdapter;
use chromvoid_core::rpc::types::RpcRequest;
use chromvoid_network_runtime::ios_control::fetch_host_presence;
use chromvoid_network_runtime::wss_transport::WssTransport;
use chromvoid_protocol::{NoiseTransport, RemoteTransport};
use serde_json::{json, Value};
use std::sync::{Arc, Mutex};

async fn host_status(host: &NativeHost, predicate: impl Fn(&HostSnapshot) -> bool) -> HostSnapshot {
    tokio::time::timeout(Duration::from_secs(20), async {
        let mut state = host.snapshot().unwrap();
        while !predicate(&state) {
            state = host.events(state.sequence).await.unwrap();
        }
        state
    })
    .await
    .expect("native host state")
}

async fn desktop_rpc(adapter: Arc<Mutex<RemoteCoreAdapter>>, command: &str, data: Value) -> Value {
    let request = RpcRequest::new(command, data);
    tokio::time::timeout(
        Duration::from_secs(10),
        tokio::task::spawn_blocking(move || {
            serde_json::to_value(adapter.lock().unwrap().handle(&request)).unwrap()
        }),
    )
    .await
    .expect("desktop RPC deadline")
    .unwrap()
}

async fn connect_transport(
    relay: &str,
    paired: &PairedIosPeer,
    desktop: &std::path::Path,
) -> (Box<dyn RemoteTransport>, NoiseTransport) {
    let identity = load_or_create_identity(desktop, "Desktop integration").unwrap();
    let presence = fetch_host_presence(relay, &paired.peer_id).await.unwrap();
    assert_eq!(presence.status, "ready");
    let transport = WssTransport::connect(relay, &presence.room_id)
        .await
        .unwrap();
    let (transport, noise) = handshake_ik_over_transport(
        Box::new(transport),
        &hex::decode(&identity.static_privkey_hex).unwrap(),
        &hex::decode(&paired.peer_pubkey_hex).unwrap(),
    )
    .await
    .unwrap();
    (transport, noise)
}

async fn connect_desktop(
    relay: &str,
    paired: &PairedIosPeer,
    desktop: &std::path::Path,
) -> (Arc<Mutex<RemoteCoreAdapter>>, RemoteIoTaskHandle) {
    connect_desktop_with_timing(
        relay,
        paired,
        desktop,
        RemoteIoTaskTiming {
            heartbeat_interval: Duration::from_millis(200),
            response_timeout: Duration::from_secs(3),
            timeout_scan_interval: Duration::from_millis(25),
        },
    )
    .await
}

async fn connect_desktop_with_timing(
    relay: &str,
    paired: &PairedIosPeer,
    desktop: &std::path::Path,
    timing: RemoteIoTaskTiming,
) -> (Arc<Mutex<RemoteCoreAdapter>>, RemoteIoTaskHandle) {
    let (transport, noise) = connect_transport(relay, paired, desktop).await;
    let io = spawn_remote_io_task_with_timing(RemoteIoTaskConfig::new(transport, noise), timing);
    let adapter = Arc::new(Mutex::new(RemoteCoreAdapter::from_remote_sender(
        RemoteHost::TauriRemoteWss {
            peer_id: paired.peer_id.clone(),
        },
        io.req_tx.clone(),
    )));
    (adapter, io)
}

async fn disconnected(io: &mut RemoteIoTaskHandle) {
    disconnected_within(io, Duration::from_secs(8)).await;
}

async fn disconnected_within(io: &mut RemoteIoTaskHandle, deadline: Duration) {
    tokio::time::timeout(deadline, async {
        loop {
            match io.evt_rx.recv().await {
                Some(RemoteIoEvent::Disconnected { reason, .. }) => {
                    eprintln!("Desktop disconnect: {reason}");
                    break;
                }
                Some(_) => {}
                None => panic!("desktop I/O ended without a disconnect event"),
            }
        }
    })
    .await
    .expect("desktop detects native disconnect");
}

/// Manual counterpart to the native Connections screen, not an automated UI claim.
/// The supplied offer/PIN must come from a disposable native host on a local relay.
#[tokio::test(flavor = "multi_thread", worker_threads = 2)]
#[ignore = "requires a running disposable native UI host and manual Revoke access; see W8 UI runbook"]
async fn desktop_observes_native_ui_revoke() {
    #[derive(serde::Deserialize)]
    struct Invitation {
        offer: PairingOffer,
        pin: String,
    }
    let input = std::env::var("CHROMVOID_NATIVE_UI_INVITATION")
        .expect("path to the disposable native invitation JSON");
    let revoke_signal = std::path::Path::new(&input).with_extension("revoke");
    assert!(
        !revoke_signal.exists(),
        "remove the previous manual revoke signal"
    );
    let invitation: Invitation = serde_json::from_slice(&std::fs::read(input).unwrap()).unwrap();
    let relay = &invitation.offer.relay_base_url;
    let url = url::Url::parse(relay).unwrap();
    assert_eq!(url.scheme(), "ws");
    assert_eq!(url.host_str(), Some("127.0.0.1"));
    let desktop = tempfile::tempdir().unwrap();
    let paired = tokio::time::timeout(
        Duration::from_secs(30),
        desktop_pair(
            &invitation.offer,
            &invitation.pin,
            desktop.path(),
            "Desktop UI verification",
        ),
    )
    .await
    .expect("native UI pairing deadline")
    .expect("native UI pairing succeeds");
    // An Android phone says so in its hello, and the desktop keeps what it said.
    if let Ok(platform) = std::env::var("CHROMVOID_NATIVE_UI_PLATFORM") {
        assert_eq!(paired.platform, platform);
    }
    // Publication follows pairing hello; wait for authoritative relay readiness.
    tokio::time::timeout(Duration::from_secs(10), async {
        loop {
            if fetch_host_presence(relay, &paired.peer_id)
                .await
                .is_ok_and(|presence| presence.status == "ready")
            {
                break;
            }
            tokio::time::sleep(Duration::from_millis(100)).await;
        }
    })
    .await
    .expect("native UI host becomes ready");
    let (adapter, mut io) = connect_desktop_with_timing(
        relay,
        &paired,
        desktop.path(),
        RemoteIoTaskTiming::default(),
    )
    .await;
    assert_eq!(
        desktop_rpc(adapter.clone(), "vault:status", json!({})).await["result"]["is_unlocked"],
        true
    );
    eprintln!(
        "UI_PEER_CONNECTED: verify the named peer and cancel revoke, then create {revoke_signal:?}"
    );
    tokio::time::timeout(Duration::from_secs(180), async {
        loop {
            tokio::select! {
                event = io.evt_rx.recv() => match event {
                    Some(RemoteIoEvent::Disconnected { reason, .. }) =>
                        panic!("desktop disconnected before manual revoke was armed: {reason}"),
                    None => panic!("desktop I/O ended before manual revoke was armed"),
                    Some(_) => {}
                },
                _ = tokio::time::sleep(Duration::from_millis(100)) => {
                    if revoke_signal.exists() { break; }
                }
            }
        }
    })
    .await
    .expect("manual UI observation and revoke signal deadline");
    assert_eq!(
        desktop_rpc(adapter.clone(), "vault:status", json!({})).await["result"]["is_unlocked"],
        true
    );
    eprintln!("UI_REVOKE_ARMED: confirm Revoke access in the native UI within 180 seconds");
    disconnected_within(&mut io, Duration::from_secs(180)).await;
    assert_eq!(
        desktop_rpc(adapter, "vault:status", json!({})).await["code"],
        "DISCONNECTED"
    );
    io.task_handle.await.unwrap();
}

async fn session_settled(session: &LocalSession) {
    tokio::time::timeout(Duration::from_secs(5), async {
        let mut state = session.snapshot().unwrap();
        while state.cleanup_pending {
            state = session.events(state.sequence).await.unwrap().snapshot;
        }
    })
    .await
    .unwrap();
}

#[tokio::test(flavor = "multi_thread", worker_threads = 2)]
#[ignore = "requires a separately started local apps/relay server; see W8 interoperability runbook"]
async fn desktop_pairs_reads_writes_and_detects_native_revoke_through_real_relay() {
    let relay = std::env::var("CHROMVOID_NATIVE_TEST_RELAY_URL").expect("local relay URL");
    let url = url::Url::parse(&relay).unwrap();
    assert_eq!(url.scheme(), "ws");
    assert_eq!(url.host_str(), Some("127.0.0.1"));
    let root = tempfile::tempdir().unwrap();
    let native = root.path().join("native");
    let desktop = root.path().join("desktop");
    std::fs::create_dir_all(&desktop).unwrap();
    let core = LocalCoreAdapter::new_with_test_keystore(native.clone()).unwrap();
    let session = Arc::new(LocalSession::new(core).unwrap());
    let generation = session.snapshot().unwrap().generation;
    assert!(session
        .execute(
            1,
            generation,
            RpcRequest::new(
                "vault:unlock",
                json!({"password":"synthetic native interop"})
            )
        )
        .await
        .unwrap()
        .is_ok());
    let host = NativeHost::new(&session).unwrap();
    host.start_pairing(generation, relay.clone(), "Native phone".into())
        .unwrap();
    let pairing = host_status(&host, |state| state.host.pairing_pin.is_some()).await;
    // The shipped desktop pairing function owns both the Noise exchange and its saved identity.
    let paired = desktop_pair(
        pairing.host.pairing_offer.as_ref().unwrap(),
        pairing.host.pairing_pin.as_deref().unwrap(),
        &desktop,
        "Desktop integration",
    )
    .await
    .unwrap();
    host_status(&host, |state| {
        matches!(state.host.phase, IosHostPhase::Ready)
    })
    .await;
    let identity = load_or_create_identity(&desktop, "Desktop integration").unwrap();
    let abandoned_room = fetch_host_presence(&relay, &paired.peer_id)
        .await
        .unwrap()
        .room_id;
    let (mut silent_socket, _silent_noise) = connect_transport(&relay, &paired, &desktop).await;
    host_status(&host, |state| !state.acceptor.connected_peers.is_empty()).await;
    // The old desktop socket stays open. Native production liveness (two 30s intervals)
    // must release the peer and advertise a new room that this old socket cannot occupy.
    tokio::time::timeout(Duration::from_secs(75), async {
        let mut state = host.snapshot().unwrap();
        while !(matches!(state.host.phase, IosHostPhase::Ready)
            && state.acceptor.connected_peers.is_empty()
            && state
                .host
                .presence
                .as_ref()
                .is_some_and(|presence| presence.room_id != abandoned_room))
        {
            state = host.events(state.sequence).await.unwrap();
        }
    })
    .await
    .expect("silent native peer expires and a new relay room becomes ready");
    assert_eq!(session.snapshot().unwrap().phase, SessionPhase::Unlocked);
    assert_eq!(host.trusted_peers().await.unwrap().len(), 1);
    let (adapter, mut io) = connect_desktop(&relay, &paired, &desktop).await;
    silent_socket.close().await.unwrap();
    assert_eq!(
        desktop_rpc(adapter.clone(), "vault:status", json!({})).await["result"]["is_unlocked"],
        true
    );
    assert_eq!(
        desktop_rpc(
            adapter.clone(),
            "passmanager:entry:create",
            json!({
                "entry_id":"desktop-interop", "title":"From desktop", "entry_type":"login",
                "username":"synthetic", "secrets":{"password":"synthetic"}
            })
        )
        .await["ok"],
        true
    );
    let local = session
        .execute(
            2,
            generation,
            RpcRequest::new("passmanager:entry:list", json!({})),
        )
        .await
        .unwrap();
    let entries = local.result().unwrap()["entries"].as_array().unwrap();
    assert_eq!(entries.len(), 1);
    assert_eq!(entries[0]["title"], "From desktop");
    // Background revokes data and transport; admitted foreground restores only the host.
    session.deactivate().unwrap();
    host.suspend().unwrap();
    session_settled(&session).await;
    disconnected(&mut io).await;
    assert_eq!(
        desktop_rpc(adapter, "vault:status", json!({})).await["code"],
        "DISCONNECTED"
    );
    io.task_handle.await.unwrap();
    session.activate().unwrap();
    let generation = session.snapshot().unwrap().generation;
    assert_eq!(session.snapshot().unwrap().phase, SessionPhase::Locked);
    host.resume_if_enabled(generation, "Native phone".into())
        .await
        .unwrap();
    let resumed = host_status(&host, |state| {
        matches!(state.host.phase, IosHostPhase::Ready)
    })
    .await;
    assert_eq!(
        resumed.host.device_id.as_deref(),
        Some(paired.peer_id.as_str())
    );
    assert!(resumed.host.pairing_pin.is_none());
    let (adapter, mut io) = connect_desktop(&relay, &paired, &desktop).await;
    assert_eq!(
        desktop_rpc(adapter.clone(), "vault:status", json!({})).await["result"]["is_unlocked"],
        false
    );
    assert!(session
        .execute(
            3,
            generation,
            RpcRequest::new(
                "vault:unlock",
                json!({"password":"synthetic native interop"})
            )
        )
        .await
        .unwrap()
        .is_ok());
    assert_eq!(
        desktop_rpc(adapter.clone(), "passmanager:entry:list", json!({})).await["result"]
            ["entries"][0]["title"],
        "From desktop"
    );
    let revoked_room = host.snapshot().unwrap().host.presence.unwrap().room_id;
    host.revoke_peer(identity.device_id).await.unwrap();
    assert!(host.trusted_peers().await.unwrap().is_empty());
    // Real relay keeps the other WebSocket open; observe the shipped desktop's detection.
    disconnected(&mut io).await;
    assert_eq!(
        desktop_rpc(adapter, "vault:status", json!({})).await["code"],
        "DISCONNECTED"
    );
    // Revocation cancels setup authority; room replacement must not replay its old
    // enabled-preference write or turn the still-enabled listener into an error.
    host_status(&host, |state| {
        matches!(state.host.phase, IosHostPhase::Ready)
            && state.acceptor.connected_peers.is_empty()
            && state
                .host
                .presence
                .as_ref()
                .is_some_and(|presence| presence.room_id != revoked_room)
    })
    .await;
    assert_eq!(session.snapshot().unwrap().phase, SessionPhase::Unlocked);
    host.stop().unwrap();
    session.close().unwrap();
    session_settled(&session).await;
    io.task_handle.await.unwrap();
}
