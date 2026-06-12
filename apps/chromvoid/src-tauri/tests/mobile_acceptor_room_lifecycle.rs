use std::fs::File;
use std::path::{Path, PathBuf};
use std::process::{Child, Command, Stdio};
use std::sync::atomic::{AtomicU16, Ordering};
use std::sync::{Arc, Mutex, OnceLock};
use std::time::{Duration, Instant};

use chromvoid_lib::network::ios_pairing::{self, IosHostPhase, IosHostRuntimeState, IosHostStatus};
use chromvoid_lib::network::mobile_acceptor::{
    self, AcceptorState, AcceptorStatus, MobileAcceptorRuntimeState,
};
use chromvoid_lib::network::mobile_host::{
    self, AndroidHostRuntimeState, MobileHostPhase, MobileHostStatus,
};
use chromvoid_lib::network::wss_transport::WssTransport;
use chromvoid_lib::network::{
    fetch_host_presence, LocalDeviceIdentityStore, PairedIosPeer, PairedPeer, PairedPeerStore,
};
use chromvoid_protocol::{
    Frame, FrameType, NoiseTransport, RemoteTransport, MAX_HANDSHAKE_MSG, NOISE_PARAMS_IK,
};
use tempfile::TempDir;

static NEXT_RELAY_PORT: AtomicU16 = AtomicU16::new(18_443);
static TEST_ENV_INIT: std::sync::Once = std::sync::Once::new();

fn enable_local_core_test_keystore() {
    TEST_ENV_INIT.call_once(|| {
        std::env::set_var("CHROMVOID_TEST_INMEMORY_KEYSTORE", "1");
        std::env::set_var("CHROMVOID_TEST_FAST_KDF", "1");
    });
}

fn runtime_test_lock() -> &'static Mutex<()> {
    static LOCK: OnceLock<Mutex<()>> = OnceLock::new();
    LOCK.get_or_init(|| Mutex::new(()))
}

#[derive(Clone)]
struct RuntimeHarness {
    mobile_acceptor: Arc<MobileAcceptorRuntimeState>,
    ios_host: Arc<IosHostRuntimeState>,
    android_host: Arc<AndroidHostRuntimeState>,
}

impl RuntimeHarness {
    fn new() -> Self {
        enable_local_core_test_keystore();

        Self {
            mobile_acceptor: Arc::new(MobileAcceptorRuntimeState::new()),
            ios_host: Arc::new(IosHostRuntimeState::new()),
            android_host: Arc::new(AndroidHostRuntimeState::new()),
        }
    }
}

fn now_ms() -> u64 {
    std::time::SystemTime::now()
        .duration_since(std::time::UNIX_EPOCH)
        .unwrap_or_default()
        .as_millis() as u64
}

fn repo_relay_dir() -> PathBuf {
    PathBuf::from(env!("CARGO_MANIFEST_DIR")).join("../../relay")
}

fn repo_root_dir() -> PathBuf {
    PathBuf::from(env!("CARGO_MANIFEST_DIR")).join("../../..")
}

fn command_exists(command: &str) -> bool {
    std::env::var_os("PATH")
        .map(|paths| std::env::split_paths(&paths).any(|path| path.join(command).is_file()))
        .unwrap_or(false)
}

fn relay_command() -> Command {
    if let Some(command) = std::env::var_os("CHROMVOID_TEST_RELAY_COMMAND") {
        let mut command = Command::new(command);
        command.current_dir(repo_relay_dir());
        return command;
    }

    if command_exists("bun") {
        let mut command = Command::new("bun");
        command
            .arg("run")
            .arg("start")
            .current_dir(repo_relay_dir());
        return command;
    }

    let mut command = Command::new("node");
    command
        .arg("--import")
        .arg("tsx")
        .arg(repo_relay_dir().join("src/index.ts"))
        .current_dir(repo_root_dir());
    command
}

struct ForceWssAcceptorGuard {
    original: Option<std::ffi::OsString>,
}

impl ForceWssAcceptorGuard {
    fn enable() -> Self {
        let original = std::env::var_os("CHROMVOID_TEST_FORCE_WSS_ACCEPTOR");
        unsafe {
            std::env::set_var("CHROMVOID_TEST_FORCE_WSS_ACCEPTOR", "1");
        }
        Self { original }
    }
}

impl Drop for ForceWssAcceptorGuard {
    fn drop(&mut self) {
        match self.original.take() {
            Some(value) => unsafe {
                std::env::set_var("CHROMVOID_TEST_FORCE_WSS_ACCEPTOR", value);
            },
            None => unsafe {
                std::env::remove_var("CHROMVOID_TEST_FORCE_WSS_ACCEPTOR");
            },
        }
    }
}

struct RelayHarness {
    _log_dir: TempDir,
    log_path: PathBuf,
    child: Child,
    relay_url: String,
}

impl RelayHarness {
    async fn spawn() -> Self {
        let relay_port = NEXT_RELAY_PORT.fetch_add(2, Ordering::SeqCst);
        let metrics_port = relay_port + 1;
        let log_dir = tempfile::tempdir().expect("tempdir for relay logs");
        let log_path = log_dir.path().join("relay.log");
        let stdout = File::create(&log_path).expect("create relay log");
        let stderr = stdout.try_clone().expect("clone relay log file");
        let mut command = relay_command();
        let child = command
            .env("RELAY_PORT", relay_port.to_string())
            .env("METRICS_PORT", metrics_port.to_string())
            .stdout(Stdio::from(stdout))
            .stderr(Stdio::from(stderr))
            .spawn()
            .expect("spawn local relay");
        let harness = Self {
            _log_dir: log_dir,
            log_path,
            child,
            relay_url: format!("ws://127.0.0.1:{relay_port}"),
        };

        let health_url = format!("http://127.0.0.1:{relay_port}/health");
        let started = Instant::now();
        loop {
            if started.elapsed() > Duration::from_secs(20) {
                panic!(
                    "relay health check timed out: {}\n{}",
                    health_url,
                    harness.read_logs()
                );
            }
            match reqwest::get(&health_url).await {
                Ok(response) if response.status().is_success() => break,
                _ => tokio::time::sleep(Duration::from_millis(200)).await,
            }
        }

        harness
    }

    fn read_logs(&self) -> String {
        std::fs::read_to_string(&self.log_path).unwrap_or_default()
    }
}

impl Drop for RelayHarness {
    fn drop(&mut self) {
        let _ = self.child.kill();
        let _ = self.child.wait();
    }
}

async fn handshake_ik_over_transport(
    mut transport: Box<dyn RemoteTransport>,
    client_privkey: &[u8],
    peer_pubkey: &[u8],
) -> Result<(Box<dyn RemoteTransport>, NoiseTransport), String> {
    let params: snow::params::NoiseParams = NOISE_PARAMS_IK
        .parse()
        .map_err(|e: snow::Error| format!("noise params: {e}"))?;

    let mut initiator = snow::Builder::new(params)
        .local_private_key(client_privkey)
        .map_err(|e| format!("local_private_key: {e}"))?
        .remote_public_key(peer_pubkey)
        .map_err(|e| format!("remote_public_key: {e}"))?
        .build_initiator()
        .map_err(|e| format!("build_initiator: {e}"))?;

    let mut buf = vec![0u8; MAX_HANDSHAKE_MSG];
    let len = initiator
        .write_message(&[], &mut buf)
        .map_err(|e| format!("ik msg1 write: {e}"))?;
    transport
        .send(&buf[..len])
        .await
        .map_err(|e| format!("ik msg1 send: {e}"))?;

    let msg2 = transport
        .recv()
        .await
        .map_err(|e| format!("ik msg2 recv: {e}"))?;
    initiator
        .read_message(&msg2, &mut buf)
        .map_err(|e| format!("ik msg2 read: {e}"))?;

    let transport_state = initiator
        .into_transport_mode()
        .map_err(|e| format!("into_transport_mode: {e}"))?;
    let noise = NoiseTransport::new(transport_state, peer_pubkey.to_vec());
    Ok((transport, noise))
}

async fn connect_ready_ios_peer(
    storage_root: &Path,
    peer: &PairedIosPeer,
) -> Result<(Box<dyn RemoteTransport>, NoiseTransport), String> {
    let presence = fetch_host_presence(&peer.relay_url, &peer.peer_id).await?;
    if presence.status != "ready" {
        return Err(format!(
            "expected ready host presence, got status={} room_id={}",
            presence.status, presence.room_id
        ));
    }
    if presence.expires_at_ms <= now_ms() {
        return Err(format!(
            "host presence already expired room_id={} expires_at_ms={}",
            presence.room_id, presence.expires_at_ms
        ));
    }

    let transport = Box::new(
        WssTransport::connect_with_context(
            &presence.relay_url,
            &presence.room_id,
            "desktop_remote_connect_test",
        )
        .await?,
    ) as Box<dyn RemoteTransport>;
    let identity_path = storage_root.join("network_local_identity.json");
    let mut store = LocalDeviceIdentityStore::load(&identity_path);
    let identity = store.get_or_create("ChromVoid Desktop")?;
    let client_privkey = hex::decode(&identity.static_privkey_hex)
        .map_err(|e| format!("invalid local identity privkey: {e}"))?;
    let peer_pubkey =
        hex::decode(&peer.peer_pubkey_hex).map_err(|e| format!("invalid iOS peer pubkey: {e}"))?;
    handshake_ik_over_transport(transport, &client_privkey, &peer_pubkey).await
}

async fn terminate_connected_session(
    mut transport: Box<dyn RemoteTransport>,
    mut noise: NoiseTransport,
) -> Result<(), String> {
    let frame = Frame {
        frame_type: FrameType::Error,
        message_id: 1,
        flags: 0,
        payload: Vec::new(),
    };
    let encrypted = noise
        .encrypt(&frame.encode())
        .map_err(|e| format!("encrypt disconnect frame: {e}"))?;
    transport
        .send(&encrypted)
        .await
        .map_err(|e| format!("send disconnect frame: {e}"))
}

async fn wait_for_host_ready(runtime: &RuntimeHarness) -> IosHostStatus {
    wait_for(Duration::from_secs(10), || {
        let status = runtime.ios_host.host_status().ok()?;
        (status.phase == IosHostPhase::Ready && status.presence.is_some()).then_some(status)
    })
    .await
}

async fn wait_for_android_host_ready(runtime: &RuntimeHarness) -> MobileHostStatus {
    wait_for(Duration::from_secs(10), || {
        let status =
            mobile_host::android_host_status(&runtime.android_host, &runtime.mobile_acceptor)
                .ok()?;
        (status.phase == MobileHostPhase::Ready && status.presence.is_some()).then_some(status)
    })
    .await
}

async fn wait_for_acceptor_state(
    runtime: &RuntimeHarness,
    expected: AcceptorState,
    room_id: &str,
    require_peer: bool,
) -> AcceptorStatus {
    let started = Instant::now();
    let timeout = Duration::from_secs(10);

    loop {
        let status = mobile_acceptor::get_status(&runtime.mobile_acceptor)
            .expect("read mobile acceptor status");
        let peer_ok = if require_peer {
            !status.connected_peers.is_empty()
        } else {
            status.connected_peers.is_empty()
        };
        if status.state == expected && status.room_id.as_deref() == Some(room_id) && peer_ok {
            return status;
        }

        assert!(
            started.elapsed() <= timeout,
            "timed out waiting for acceptor state expected={expected:?} room_id={room_id} require_peer={require_peer} actual_state={:?} actual_room_id={:?} peer_count={} peers={:?}",
            status.state,
            status.room_id,
            status.connected_peers.len(),
            status.connected_peers,
        );
        tokio::time::sleep(Duration::from_millis(100)).await;
    }
}

async fn wait_for<T>(timeout: Duration, mut predicate: impl FnMut() -> Option<T>) -> T {
    let started = Instant::now();
    loop {
        if let Some(value) = predicate() {
            return value;
        }
        assert!(
            started.elapsed() <= timeout,
            "timed out waiting after {:?}",
            timeout
        );
        tokio::time::sleep(Duration::from_millis(100)).await;
    }
}

async fn pair_ios_host_with_desktop(
    runtime: &RuntimeHarness,
    relay_url: &str,
    ios_storage_root: &Path,
    desktop_storage_root: &Path,
) -> (PairedIosPeer, IosHostStatus) {
    let pairing = ios_pairing::start_host_mode(
        runtime.ios_host.clone(),
        runtime.mobile_acceptor.clone(),
        None,
        relay_url,
        ios_storage_root,
        "ChromVoid iPhone",
    )
    .await
    .expect("start iOS host mode");
    let offer = pairing.pairing_offer.clone().expect("pairing offer");
    let pin = pairing.pairing_pin.clone().expect("pairing pin");
    let paired_peer =
        ios_pairing::desktop_pair(&offer, &pin, desktop_storage_root, "ChromVoid Desktop")
            .await
            .expect("desktop pair with iOS host");
    let ready = wait_for_host_ready(runtime).await;
    (paired_peer, ready)
}

async fn pair_android_host_with_desktop(
    runtime: &RuntimeHarness,
    relay_url: &str,
    android_storage_root: &Path,
    desktop_storage_root: &Path,
) -> (PairedPeer, MobileHostStatus) {
    let pairing = mobile_host::start_android_host_mode(
        runtime.android_host.clone(),
        runtime.mobile_acceptor.clone(),
        None,
        relay_url,
        android_storage_root,
        "ChromVoid Android",
    )
    .await
    .expect("start Android host mode");
    let offer = pairing.pairing_offer.clone().expect("pairing offer");
    let pin = pairing.pairing_pin.clone().expect("pairing pin");
    let paired_peer = mobile_host::desktop_pair_android_host(
        &offer,
        &pin,
        desktop_storage_root,
        "ChromVoid Desktop",
    )
    .await
    .expect("desktop pair with Android host");
    let store = PairedPeerStore::load(&desktop_storage_root.join("paired_network_peers.json"));
    let ready_peer = store
        .get(&paired_peer.peer_id)
        .cloned()
        .expect("paired Android host stored in generic peer store");
    let ready = wait_for_android_host_ready(runtime).await;
    (ready_peer, ready)
}

async fn connect_ready_network_peer(
    peer: &PairedPeer,
) -> Result<(Box<dyn RemoteTransport>, NoiseTransport), String> {
    let presence = fetch_host_presence(&peer.relay_url, &peer.peer_id).await?;
    if presence.status != "ready" {
        return Err(format!(
            "expected ready host presence, got status={} room_id={}",
            presence.status, presence.room_id
        ));
    }
    if presence.expires_at_ms <= now_ms() {
        return Err(format!(
            "host presence already expired room_id={} expires_at_ms={}",
            presence.room_id, presence.expires_at_ms
        ));
    }

    let transport = Box::new(
        WssTransport::connect_with_context(
            &presence.relay_url,
            &presence.room_id,
            "desktop_remote_connect_android_host_test",
        )
        .await?,
    ) as Box<dyn RemoteTransport>;
    let client_privkey = hex::decode(&peer.client_privkey_hex)
        .map_err(|e| format!("invalid client privkey: {e}"))?;
    handshake_ik_over_transport(transport, &client_privkey, &peer.peer_pubkey).await
}

#[tokio::test(flavor = "multi_thread", worker_threads = 2)]
async fn delayed_desktop_join_beyond_one_minute_still_connects_before_expiry() {
    let _guard = runtime_test_lock()
        .lock()
        .unwrap_or_else(|poisoned| poisoned.into_inner());
    let _force_wss = ForceWssAcceptorGuard::enable();
    let relay = RelayHarness::spawn().await;
    let ios_dir = tempfile::tempdir().expect("iOS tempdir");
    let desktop_dir = tempfile::tempdir().expect("desktop tempdir");
    let runtime = RuntimeHarness::new();
    let _ = mobile_acceptor::stop_listening(&runtime.mobile_acceptor);

    let (paired_peer, ready) = pair_ios_host_with_desktop(
        &runtime,
        &relay.relay_url,
        ios_dir.path(),
        desktop_dir.path(),
    )
    .await;
    let ready_presence = ready.presence.clone().expect("ready host presence");
    let room_id = ready_presence.room_id.clone();

    tokio::time::sleep(Duration::from_secs(65)).await;

    let refreshed_presence = fetch_host_presence(&paired_peer.relay_url, &paired_peer.peer_id)
        .await
        .expect("host presence after delayed join window");
    assert_eq!(refreshed_presence.status, "ready");
    assert_eq!(refreshed_presence.room_id, room_id);
    assert!(refreshed_presence.expires_at_ms > now_ms());

    let (transport, noise) = connect_ready_ios_peer(desktop_dir.path(), &paired_peer)
        .await
        .expect("desktop connect after >60s delay");
    let connected =
        wait_for_acceptor_state(&runtime, AcceptorState::Connected, &room_id, true).await;
    assert_eq!(connected.room_id.as_deref(), Some(room_id.as_str()));

    tokio::time::sleep(Duration::from_millis(300)).await;
    let logs = relay.read_logs();
    assert!(
        logs.contains(&room_id),
        "relay log should mention runtime room_id={room_id}\n{logs}"
    );
    assert!(
        !logs.contains("\"closeReason\":\"room expired\""),
        "relay log must not report room expired during delayed join scenario\n{logs}"
    );
    assert!(
        !logs.contains("\"closeReason\":\"room full\""),
        "relay log must not report room full during delayed join scenario\n{logs}"
    );

    terminate_connected_session(transport, noise)
        .await
        .expect("terminate delayed join transport");
    let _ = wait_for_acceptor_state(&runtime, AcceptorState::Listening, &room_id, false).await;
    ios_pairing::stop_host_mode(
        runtime.ios_host.clone(),
        runtime.mobile_acceptor.clone(),
        ios_dir.path(),
    )
    .await
    .expect("stop iOS host mode");
    let _ = mobile_acceptor::stop_listening(&runtime.mobile_acceptor);
}

#[tokio::test(flavor = "multi_thread", worker_threads = 2)]
async fn disconnect_and_reconnect_reuses_same_room_without_room_full() {
    let _guard = runtime_test_lock()
        .lock()
        .unwrap_or_else(|poisoned| poisoned.into_inner());
    let _force_wss = ForceWssAcceptorGuard::enable();
    let relay = RelayHarness::spawn().await;
    let ios_dir = tempfile::tempdir().expect("iOS tempdir");
    let desktop_dir = tempfile::tempdir().expect("desktop tempdir");
    let runtime = RuntimeHarness::new();
    let _ = mobile_acceptor::stop_listening(&runtime.mobile_acceptor);

    let (paired_peer, ready) = pair_ios_host_with_desktop(
        &runtime,
        &relay.relay_url,
        ios_dir.path(),
        desktop_dir.path(),
    )
    .await;
    let room_id = ready.presence.clone().expect("ready host presence").room_id;

    let (first_transport, first_noise) = connect_ready_ios_peer(desktop_dir.path(), &paired_peer)
        .await
        .expect("first desktop connect");
    let first_connected =
        wait_for_acceptor_state(&runtime, AcceptorState::Connected, &room_id, true).await;
    assert_eq!(first_connected.room_id.as_deref(), Some(room_id.as_str()));

    terminate_connected_session(first_transport, first_noise)
        .await
        .expect("terminate first transport");
    let listening =
        wait_for_acceptor_state(&runtime, AcceptorState::Listening, &room_id, false).await;
    assert_eq!(listening.room_id.as_deref(), Some(room_id.as_str()));

    let (second_transport, second_noise) = connect_ready_ios_peer(desktop_dir.path(), &paired_peer)
        .await
        .expect("second desktop connect on same lifecycle room");
    let second_connected =
        wait_for_acceptor_state(&runtime, AcceptorState::Connected, &room_id, true).await;
    assert_eq!(second_connected.room_id.as_deref(), Some(room_id.as_str()));

    tokio::time::sleep(Duration::from_millis(300)).await;
    let logs = relay.read_logs();
    assert!(
        logs.contains(&room_id),
        "relay log should mention runtime room_id={room_id}\n{logs}"
    );
    assert!(
        !logs.contains("\"closeReason\":\"room full\""),
        "relay log must not report room full during same-lifecycle reconnect\n{logs}"
    );
    assert!(
        !logs.contains("\"closeReason\":\"room expired\""),
        "relay log must not report room expired during same-lifecycle reconnect\n{logs}"
    );

    terminate_connected_session(second_transport, second_noise)
        .await
        .expect("terminate second transport");
    let _ = wait_for_acceptor_state(&runtime, AcceptorState::Listening, &room_id, false).await;
    ios_pairing::stop_host_mode(
        runtime.ios_host.clone(),
        runtime.mobile_acceptor.clone(),
        ios_dir.path(),
    )
    .await
    .expect("stop iOS host mode");
    let _ = mobile_acceptor::stop_listening(&runtime.mobile_acceptor);
}

#[tokio::test(flavor = "multi_thread", worker_threads = 2)]
async fn android_host_pairs_and_accepts_desktop_remote_connection() {
    let _guard = runtime_test_lock()
        .lock()
        .unwrap_or_else(|poisoned| poisoned.into_inner());
    let _force_wss = ForceWssAcceptorGuard::enable();
    let relay = RelayHarness::spawn().await;
    let android_dir = tempfile::tempdir().expect("android tempdir");
    let desktop_dir = tempfile::tempdir().expect("desktop tempdir");
    let runtime = RuntimeHarness::new();
    let _ = mobile_acceptor::stop_listening(&runtime.mobile_acceptor);

    let (paired_peer, ready) = pair_android_host_with_desktop(
        &runtime,
        &relay.relay_url,
        android_dir.path(),
        desktop_dir.path(),
    )
    .await;
    let ready_presence = ready.presence.clone().expect("ready host presence");
    assert_eq!(ready.platform, "android");
    assert_eq!(paired_peer.platform, "android");

    let (transport, noise) = connect_ready_network_peer(&paired_peer)
        .await
        .expect("desktop connect to Android host");
    let connected = wait_for_acceptor_state(
        &runtime,
        AcceptorState::Connected,
        &ready_presence.room_id,
        true,
    )
    .await;
    assert_eq!(
        connected.room_id.as_deref(),
        Some(ready_presence.room_id.as_str())
    );

    terminate_connected_session(transport, noise)
        .await
        .expect("terminate Android host transport");
    let _ = wait_for_acceptor_state(
        &runtime,
        AcceptorState::Listening,
        &ready_presence.room_id,
        false,
    )
    .await;
    mobile_host::stop_android_host_mode(
        runtime.android_host.clone(),
        runtime.mobile_acceptor.clone(),
        android_dir.path(),
    )
    .await
    .expect("stop Android host mode");
    let _ = mobile_acceptor::stop_listening(&runtime.mobile_acceptor);
}
