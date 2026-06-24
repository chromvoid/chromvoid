use std::collections::BTreeMap;
use std::env;
use std::path::PathBuf;
use std::process::Command as ProcessCommand;
use std::sync::atomic::{AtomicBool, Ordering};
use std::sync::Arc;
use std::time::Duration;

use chromvoid_core::rpc::types::{RpcRequest, RpcResponse};
use chromvoid_core::rpc::RpcReply;
use chromvoid_lib::mobile_usb::{
    commit_pairing_with_secret, create_android_aoa_mobile_usb_bridge, ClientKeyRef,
    JsonMobileUsbPairingStore, KeyringMobileUsbSecretStore, MobileUsbBridge, MobileUsbBridgeKind,
    MobileUsbError, MobileUsbErrorCode, MobileUsbPairRequest, MobileUsbPairedHostRecord,
    MobileUsbPairingStore, MobileUsbPlatform, MobileUsbRemoteTransport, MobileUsbScanResult,
    MobileUsbSecretStore,
};
use chromvoid_lib::remote_data_plane::{
    handshake_ik_over_transport, handshake_xx_over_transport, spawn_remote_io_task, RemoteIoEvent,
    RemoteIoRequest, RemoteIoTaskConfig, RemoteIoTaskHandle,
};
use chromvoid_lib::RemoteRpcPriority;
use chromvoid_protocol::{NoiseTransport, RemoteTransport};
use serde::{Deserialize, Serialize};
use serde_json::{json, Value};
use tokio::sync::oneshot;

#[derive(Debug, Clone, Copy)]
enum Command {
    Scan,
    ListPaired,
    Pair,
    Connect,
    RemoteLock,
}

#[derive(Debug)]
struct Args {
    command: Command,
    storage_root: PathBuf,
    host_id: Option<String>,
    timeout: Duration,
    adb_path: String,
    adb_serial: Option<String>,
    android_package: String,
    skip_android_prepare: bool,
    secret_store: SecretStoreKind,
}

#[derive(Debug, Clone, Copy, PartialEq, Eq)]
enum SecretStoreKind {
    File,
    Keyring,
}

#[derive(Serialize)]
struct ScanView {
    label: Option<String>,
    platform: &'static str,
    bridge_kind: MobileUsbBridgeKind,
    manufacturer: Option<String>,
    model: Option<String>,
    serial_number: Option<String>,
    protocol_id: Option<String>,
    classification: Value,
}

#[derive(Serialize)]
struct PairedView {
    host_id: String,
    label: String,
    platform: &'static str,
    bridge_kind: MobileUsbBridgeKind,
    peer_pubkey_len: usize,
    client_pubkey_len: usize,
    has_client_key_ref: bool,
    key_loadable: bool,
    last_seen: Option<u64>,
    pairing_confirmed_at: Option<u64>,
}

#[derive(Serialize)]
struct ConnectSummary {
    ok: bool,
    host_id: String,
    label: String,
    bridge_kind: MobileUsbBridgeKind,
    peer_pubkey_len: usize,
    capabilities: Vec<String>,
    vault_unlocked: bool,
    capabilities_response: RpcResponse,
    vault_status_response: RpcResponse,
}

#[derive(Serialize)]
struct RemoteLockSummary {
    ok: bool,
    host_id: String,
    label: String,
    bridge_kind: MobileUsbBridgeKind,
    before_vault_unlocked: bool,
    after_vault_unlocked: bool,
    disconnected: bool,
    lock_response: RpcResponse,
    before_status_response: RpcResponse,
    after_status_response: RpcResponse,
}

#[derive(Serialize)]
struct PairSummary {
    ok: bool,
    host_id: String,
    label: String,
    bridge_kind: MobileUsbBridgeKind,
    peer_pubkey_len: usize,
    client_pubkey_len: usize,
    android_peer_id: String,
    android_label: String,
}

#[derive(Debug, Clone, PartialEq, Eq, Serialize, Deserialize)]
struct PairingHello {
    peer_id: String,
    peer_label: String,
    peer_pubkey_hex: String,
    platform: String,
}

#[derive(Clone)]
struct FileMobileUsbSecretStore {
    path: PathBuf,
}

struct SmokeSession {
    record: MobileUsbPairedHostRecord,
    handle: RemoteIoTaskHandle,
}

const CONNECT_IK_HANDSHAKE_ATTEMPTS: usize = 2;
const CONNECT_IK_HANDSHAKE_TIMEOUT: Duration = Duration::from_secs(10);
const CONNECT_IK_HANDSHAKE_RETRY_DELAY: Duration = Duration::from_millis(500);

#[derive(Clone, Copy)]
enum AndroidEndpointPrepare<'a> {
    Full(&'a Args),
    Rearm(&'a Args),
}

impl<'a> AndroidEndpointPrepare<'a> {
    fn rearm(self) -> Self {
        match self {
            Self::Full(args) | Self::Rearm(args) => Self::Rearm(args),
        }
    }
}

impl FileMobileUsbSecretStore {
    fn new(path: PathBuf) -> Self {
        Self { path }
    }

    fn read_keys(&self) -> BTreeMap<ClientKeyRef, String> {
        let Ok(contents) = std::fs::read_to_string(&self.path) else {
            return BTreeMap::new();
        };
        serde_json::from_str(&contents).unwrap_or_default()
    }

    fn write_keys(&self, keys: &BTreeMap<ClientKeyRef, String>) -> Result<(), MobileUsbError> {
        if let Some(parent) = self.path.parent() {
            std::fs::create_dir_all(parent).map_err(|error| {
                mobile_usb_secret_error(format!("create secret store dir: {error}"))
            })?;
        }
        let json = serde_json::to_vec_pretty(keys)
            .map_err(|error| mobile_usb_secret_error(format!("serialize secret store: {error}")))?;
        let temp_path = self.path.with_extension("json.tmp");
        std::fs::write(&temp_path, json)
            .map_err(|error| mobile_usb_secret_error(format!("write secret store: {error}")))?;
        set_private_file_permissions(&temp_path)?;
        std::fs::rename(&temp_path, &self.path)
            .map_err(|error| mobile_usb_secret_error(format!("replace secret store: {error}")))
    }
}

#[cfg(unix)]
fn set_private_file_permissions(path: &std::path::Path) -> Result<(), MobileUsbError> {
    use std::os::unix::fs::PermissionsExt;

    std::fs::set_permissions(path, std::fs::Permissions::from_mode(0o600))
        .map_err(|error| mobile_usb_secret_error(format!("set secret store permissions: {error}")))
}

#[cfg(not(unix))]
fn set_private_file_permissions(_path: &std::path::Path) -> Result<(), MobileUsbError> {
    Ok(())
}

impl MobileUsbSecretStore for FileMobileUsbSecretStore {
    fn save_client_key(
        &self,
        host_id: &chromvoid_lib::mobile_usb::HostId,
        key: &[u8],
    ) -> Result<ClientKeyRef, MobileUsbError> {
        let key_ref = format!("mobile_usb_smoke:{host_id}");
        let mut keys = self.read_keys();
        keys.insert(key_ref.clone(), hex_encode(key));
        self.write_keys(&keys)?;
        Ok(key_ref)
    }

    fn load_client_key(&self, key_ref: &ClientKeyRef) -> Result<Vec<u8>, MobileUsbError> {
        let keys = self.read_keys();
        let Some(value) = keys.get(key_ref) else {
            return Err(MobileUsbError::new(
                MobileUsbErrorCode::SecretRefInvalid,
                "smoke secret ref is missing",
            ));
        };
        hex::decode(value).map_err(|error| {
            MobileUsbError::new(
                MobileUsbErrorCode::SecretRefInvalid,
                format!("smoke secret ref contains invalid key data: {error}"),
            )
        })
    }

    fn delete_client_key(&self, key_ref: &ClientKeyRef) -> Result<(), MobileUsbError> {
        let mut keys = self.read_keys();
        keys.remove(key_ref);
        self.write_keys(&keys)
    }
}

fn mobile_usb_secret_error(message: String) -> MobileUsbError {
    MobileUsbError::new(MobileUsbErrorCode::SecretStoreUnavailable, message)
}

#[tokio::main]
async fn main() {
    init_tracing();
    match run().await {
        Ok(()) => {}
        Err(error) => {
            eprintln!("{error}");
            std::process::exit(1);
        }
    }
}

async fn run() -> Result<(), String> {
    let args = parse_args()?;
    std::fs::create_dir_all(&args.storage_root).map_err(|error| {
        format!(
            "create storage root {}: {error}",
            args.storage_root.display()
        )
    })?;
    let watchdog_done = start_watchdog(args.timeout);
    let bridge = create_android_aoa_mobile_usb_bridge();
    let store = JsonMobileUsbPairingStore::new(&args.storage_root);
    let file_secrets =
        FileMobileUsbSecretStore::new(args.storage_root.join("mobile_usb_secrets.json"));
    let keyring_secrets = KeyringMobileUsbSecretStore::default();
    let secrets: &dyn MobileUsbSecretStore = match args.secret_store {
        SecretStoreKind::File => &file_secrets,
        SecretStoreKind::Keyring => &keyring_secrets,
    };

    let result = match args.command {
        Command::Scan => {
            let scans = bridge.scan().await.map_err(|error| error.to_string())?;
            let views: Vec<ScanView> = scans
                .into_iter()
                .map(|scan| ScanView {
                    label: scan.label,
                    platform: "android",
                    bridge_kind: scan.bridge_kind,
                    manufacturer: scan.usb_hint.manufacturer,
                    model: scan.usb_hint.model,
                    serial_number: scan.usb_hint.serial_number,
                    protocol_id: scan.usb_hint.protocol_id,
                    classification: json!({ "kind": "connected" }),
                })
                .collect();
            print_json(&views)
        }
        Command::ListPaired => {
            let records = store.list().map_err(|error| error.to_string())?;
            let views: Vec<PairedView> = records
                .into_iter()
                .map(|record| {
                    let key_loadable = secrets.load_client_key(&record.client_key_ref).is_ok();
                    PairedView {
                        host_id: record.host_id,
                        label: record.label,
                        platform: "android",
                        bridge_kind: record.bridge_kind,
                        peer_pubkey_len: record.peer_pubkey.len(),
                        client_pubkey_len: record.client_pubkey.len(),
                        has_client_key_ref: !record.client_key_ref.trim().is_empty(),
                        key_loadable,
                        last_seen: record.last_seen,
                        pairing_confirmed_at: record.pairing_confirmed_at,
                    }
                })
                .collect();
            print_json(&views)
        }
        Command::Pair => {
            if !args.skip_android_prepare {
                prepare_android_accessory_endpoint(&args)?;
            }
            let summary = pair_smoke(bridge.as_ref(), &store, secrets, args.timeout).await?;
            print_json(&summary)
        }
        Command::Connect => {
            let android_prepare =
                (!args.skip_android_prepare).then_some(AndroidEndpointPrepare::Full(&args));
            let summary = connect_smoke(
                bridge.as_ref(),
                &store,
                secrets,
                args.host_id.as_deref(),
                args.timeout,
                android_prepare,
            )
            .await?;
            print_json(&summary)
        }
        Command::RemoteLock => {
            let android_prepare =
                (!args.skip_android_prepare).then_some(AndroidEndpointPrepare::Full(&args));
            let android_rearm =
                (!args.skip_android_prepare).then_some(AndroidEndpointPrepare::Rearm(&args));
            let summary = remote_lock_smoke(
                bridge.as_ref(),
                &store,
                secrets,
                args.host_id.as_deref(),
                args.timeout,
                android_prepare,
                android_rearm,
            )
            .await?;
            print_json(&summary)
        }
    };
    watchdog_done.store(true, Ordering::Relaxed);
    result
}

async fn open_smoke_session(
    bridge: &dyn MobileUsbBridge,
    store: &dyn MobileUsbPairingStore,
    secrets: &dyn MobileUsbSecretStore,
    host_id: Option<&str>,
    timeout: Duration,
    android_prepare: Option<AndroidEndpointPrepare<'_>>,
) -> Result<SmokeSession, String> {
    let mut record = select_record(bridge, store, secrets, host_id).await?;
    if record.bridge_kind != MobileUsbBridgeKind::AndroidAoa {
        return Err(format!(
            "unsupported mobile USB bridge kind for smoke: {:?}",
            record.bridge_kind
        ));
    }
    let client_key = secrets
        .load_client_key(&record.client_key_ref)
        .map_err(|error| format!("load mobile USB client key: {error}"))?;

    let (mut transport, mut noise_transport) =
        open_connect_transport_with_retry(bridge, &record, &client_key, timeout, android_prepare)
            .await?;

    if record.pairing_confirmed_at.is_none() {
        let hello = PairingHello {
            peer_id: format!("{}:desktop", record.host_id),
            peer_label: desktop_pairing_label(),
            peer_pubkey_hex: hex_encode(&record.client_pubkey),
            platform: "desktop".to_string(),
        };
        send_pairing_hello(transport.as_mut(), &mut noise_transport, &hello).await?;
        let remote_hello =
            recv_pairing_hello(transport.as_mut(), &mut noise_transport, timeout).await?;
        if remote_hello.peer_pubkey_hex != hex_encode(&record.peer_pubkey) {
            return Err("Android pairing ack pubkey does not match IK remote key".to_string());
        }
        record = store
            .mark_pairing_confirmed(&record.host_id, now_secs())
            .map_err(|error| format!("mark production mobile USB pairing confirmed: {error}"))?;
    }

    let handle = spawn_remote_io_task(RemoteIoTaskConfig {
        transport,
        noise_transport,
    });

    Ok(SmokeSession { record, handle })
}

async fn open_connect_transport_with_retry(
    bridge: &dyn MobileUsbBridge,
    record: &MobileUsbPairedHostRecord,
    client_key: &[u8],
    timeout: Duration,
    android_prepare: Option<AndroidEndpointPrepare<'_>>,
) -> Result<(Box<dyn RemoteTransport>, NoiseTransport), String> {
    let handshake_timeout = CONNECT_IK_HANDSHAKE_TIMEOUT.min(timeout);
    let mut last_error = None;

    for attempt in 0..CONNECT_IK_HANDSHAKE_ATTEMPTS {
        if let Some(prepare) = android_prepare {
            let prepare = if attempt == 0 {
                prepare
            } else {
                prepare.rearm()
            };
            prepare_android_endpoint_for_open(prepare)?;
        }

        let stream = bridge
            .open_connect_stream(record)
            .await
            .map_err(|error| format!("open Android AOA connect stream: {error}"))?;
        let transport = MobileUsbRemoteTransport::new(stream, record.bridge_kind);
        let result = match tokio::time::timeout(
            handshake_timeout,
            handshake_ik_over_transport(Box::new(transport), client_key, &record.peer_pubkey),
        )
        .await
        {
            Ok(Ok(result)) => Ok(result),
            Ok(Err(error)) => Err(format!("IK handshake failed: {error}")),
            Err(_) => Err(format!(
                "IK handshake timed out after {}s",
                handshake_timeout.as_secs()
            )),
        };

        match result {
            Ok(result) => return Ok(result),
            Err(error)
                if attempt + 1 < CONNECT_IK_HANDSHAKE_ATTEMPTS
                    && is_retryable_connect_ik_error(&error) =>
            {
                eprintln!(
                    "IK handshake failed on attempt {}; reopening Android AOA stream: {}",
                    attempt + 1,
                    error
                );
                last_error = Some(error);
                tokio::time::sleep(CONNECT_IK_HANDSHAKE_RETRY_DELAY).await;
            }
            Err(error) => return Err(error),
        }
    }

    Err(last_error.unwrap_or_else(|| "IK handshake failed before opening stream".to_string()))
}

fn is_retryable_connect_ik_error(error: &str) -> bool {
    error.contains("IK handshake timed out")
        || (error.contains("ik msg1 send")
            && error.contains("mobile_usb record write failed")
            && (error.contains("transport timeout")
                || error.contains("TimedOut")
                || error.contains("timed out")
                || error.contains("Timeout")
                || error.contains("timeout")
                || error.contains("Android AOA endpoint failed")))
}

async fn connect_smoke(
    bridge: &dyn MobileUsbBridge,
    store: &dyn MobileUsbPairingStore,
    secrets: &dyn MobileUsbSecretStore,
    host_id: Option<&str>,
    timeout: Duration,
    android_prepare: Option<AndroidEndpointPrepare<'_>>,
) -> Result<ConnectSummary, String> {
    let session =
        open_smoke_session(bridge, store, secrets, host_id, timeout, android_prepare).await?;
    let record = session.record;
    let handle = session.handle;
    let capabilities_response = run_json_rpc(&handle.req_tx, "core:capabilities", timeout).await?;
    if !capabilities_response.is_ok() {
        handle.task_handle.abort();
        return Err(format!(
            "core:capabilities failed: {}",
            describe_rpc_error(&capabilities_response)
        ));
    }
    let vault_status_response = run_json_rpc(&handle.req_tx, "vault:status", timeout).await?;
    if !vault_status_response.is_ok() {
        handle.task_handle.abort();
        return Err(format!(
            "vault:status failed: {}",
            describe_rpc_error(&vault_status_response)
        ));
    }
    handle.task_handle.abort();

    Ok(ConnectSummary {
        ok: true,
        host_id: record.host_id,
        label: record.label,
        bridge_kind: record.bridge_kind,
        peer_pubkey_len: record.peer_pubkey.len(),
        capabilities: capability_features(&capabilities_response),
        vault_unlocked: vault_is_unlocked(&vault_status_response),
        capabilities_response,
        vault_status_response,
    })
}

async fn remote_lock_smoke(
    bridge: &dyn MobileUsbBridge,
    store: &dyn MobileUsbPairingStore,
    secrets: &dyn MobileUsbSecretStore,
    host_id: Option<&str>,
    timeout: Duration,
    android_prepare: Option<AndroidEndpointPrepare<'_>>,
    android_rearm: Option<AndroidEndpointPrepare<'_>>,
) -> Result<RemoteLockSummary, String> {
    let session =
        open_smoke_session(bridge, store, secrets, host_id, timeout, android_prepare).await?;
    let record = session.record;
    let mut handle = session.handle;
    let before_status_response = run_json_rpc(&handle.req_tx, "vault:status", timeout).await?;
    if !before_status_response.is_ok() {
        handle.task_handle.abort();
        return Err(format!(
            "initial vault:status failed: {}",
            describe_rpc_error(&before_status_response)
        ));
    }
    let before_vault_unlocked = vault_is_unlocked(&before_status_response);
    let lock_response = run_json_rpc(&handle.req_tx, "vault:lock", timeout).await?;
    if !lock_response.is_ok() {
        handle.task_handle.abort();
        return Err(format!(
            "remote vault:lock failed: {}",
            describe_rpc_error(&lock_response)
        ));
    }
    let disconnected = wait_for_remote_disconnect(&mut handle, timeout).await?;
    if !disconnected {
        handle.task_handle.abort();
        return Err("remote vault:lock did not disconnect the remote data-plane".to_string());
    }

    let after_session = open_smoke_session(
        bridge,
        store,
        secrets,
        Some(&record.host_id),
        timeout,
        android_rearm,
    )
    .await?;
    let after_record = after_session.record;
    let after_handle = after_session.handle;
    let after_status_response = run_json_rpc(&after_handle.req_tx, "vault:status", timeout).await?;
    after_handle.task_handle.abort();
    if !after_status_response.is_ok() {
        return Err(format!(
            "post-disconnect vault:status failed: {}",
            describe_rpc_error(&after_status_response)
        ));
    }
    let after_vault_unlocked = vault_is_unlocked(&after_status_response);
    if before_vault_unlocked != after_vault_unlocked {
        return Err(format!(
            "remote vault:lock changed mobile vault state: before_unlocked={before_vault_unlocked} after_unlocked={after_vault_unlocked}"
        ));
    }

    Ok(RemoteLockSummary {
        ok: true,
        host_id: after_record.host_id,
        label: after_record.label,
        bridge_kind: after_record.bridge_kind,
        before_vault_unlocked,
        after_vault_unlocked,
        disconnected,
        lock_response,
        before_status_response,
        after_status_response,
    })
}

async fn select_record(
    bridge: &dyn MobileUsbBridge,
    store: &dyn MobileUsbPairingStore,
    secrets: &dyn MobileUsbSecretStore,
    host_id: Option<&str>,
) -> Result<MobileUsbPairedHostRecord, String> {
    let records = store.list().map_err(|error| error.to_string())?;
    if let Some(host_id) = host_id {
        let record = records
            .into_iter()
            .find(|record| record.host_id == host_id)
            .ok_or_else(|| format!("paired mobile USB host not found: {host_id}"))?;
        ensure_record_can_connect(&record, secrets)?;
        return Ok(record);
    }

    let scans = bridge.scan().await.map_err(|error| error.to_string())?;
    let mut matches = records
        .into_iter()
        .filter(|record| scans.iter().any(|scan| record.matches_scan_result(scan)))
        .filter_map(|record| match ensure_record_can_connect(&record, secrets) {
            Ok(()) => Some(record),
            Err(error) => {
                eprintln!(
                    "skipping paired mobile USB host {}: {error}",
                    record.host_id
                );
                None
            }
        })
        .collect::<Vec<_>>();

    match matches.len() {
        1 => Ok(matches.remove(0)),
        0 => Err("no connected paired Android AOA mobile USB host found".to_string()),
        count => Err(format!(
            "ambiguous connected paired Android AOA hosts: {count}; pass --host-id"
        )),
    }
}

async fn pair_smoke(
    bridge: &dyn MobileUsbBridge,
    store: &dyn MobileUsbPairingStore,
    secrets: &dyn MobileUsbSecretStore,
    timeout: Duration,
) -> Result<PairSummary, String> {
    let scan = select_single_android_scan(bridge).await?;
    let request = MobileUsbPairRequest {
        platform: scan.platform,
        bridge_kind: scan.bridge_kind,
        usb_hint: scan.usb_hint,
        label: scan.label,
    };
    let keypair = noise_static_keypair()?;
    let stream = bridge
        .open_pair_stream(&request)
        .await
        .map_err(|error| format!("open Android AOA pair stream: {error}"))?;
    let transport = MobileUsbRemoteTransport::new(stream, request.bridge_kind);
    let (mut transport, mut noise_transport, peer_pubkey) = tokio::time::timeout(
        timeout,
        handshake_xx_over_transport(Box::new(transport), &keypair.private),
    )
    .await
    .map_err(|_| format!("XX handshake timed out after {}s", timeout.as_secs()))?
    .map_err(|error| format!("XX handshake failed: {error}"))?;

    let host_id = new_host_id();
    let local_hello = PairingHello {
        peer_id: format!("{host_id}:desktop"),
        peer_label: desktop_pairing_label(),
        peer_pubkey_hex: hex_encode(&keypair.public),
        platform: "desktop".to_string(),
    };
    send_pairing_hello(transport.as_mut(), &mut noise_transport, &local_hello).await?;
    let remote_hello =
        recv_pairing_hello(transport.as_mut(), &mut noise_transport, timeout).await?;
    if remote_hello.peer_pubkey_hex != hex_encode(&peer_pubkey) {
        return Err("Android pairing ack pubkey does not match XX remote key".to_string());
    }

    let record = MobileUsbPairedHostRecord {
        host_id,
        label: request
            .label
            .clone()
            .unwrap_or_else(|| remote_hello.peer_label.clone()),
        platform: request.platform,
        bridge_kind: request.bridge_kind,
        peer_pubkey,
        client_pubkey: keypair.public.clone(),
        client_key_ref: String::new(),
        usb_hint: request.usb_hint,
        paired_at: now_secs(),
        last_seen: Some(now_secs()),
        pairing_confirmed_at: Some(now_secs()),
    };
    let record = commit_pairing_with_secret(store, secrets, record, &keypair.private)
        .map_err(|error| format!("commit mobile USB pairing: {error}"))?;

    Ok(PairSummary {
        ok: true,
        host_id: record.host_id,
        label: record.label,
        bridge_kind: record.bridge_kind,
        peer_pubkey_len: record.peer_pubkey.len(),
        client_pubkey_len: record.client_pubkey.len(),
        android_peer_id: remote_hello.peer_id,
        android_label: remote_hello.peer_label,
    })
}

async fn select_single_android_scan(
    bridge: &dyn MobileUsbBridge,
) -> Result<MobileUsbScanResult, String> {
    let mut scans = bridge
        .scan()
        .await
        .map_err(|error| format!("scan Android AOA hosts: {error}"))?
        .into_iter()
        .filter(|scan| {
            scan.platform == MobileUsbPlatform::Android
                && scan.bridge_kind == MobileUsbBridgeKind::AndroidAoa
        })
        .collect::<Vec<_>>();
    match scans.len() {
        1 => Ok(scans.remove(0)),
        0 => Err("no connected Android AOA mobile USB host found".to_string()),
        count => Err(format!(
            "ambiguous connected Android AOA mobile USB hosts: {count}"
        )),
    }
}

fn ensure_record_can_connect(
    record: &MobileUsbPairedHostRecord,
    secrets: &dyn MobileUsbSecretStore,
) -> Result<(), String> {
    if !record.is_valid_for_auto_match() {
        return Err("pairing record is incomplete".to_string());
    }
    secrets
        .load_client_key(&record.client_key_ref)
        .map(|_| ())
        .map_err(|error| format!("client key is not loadable: {error}"))
}

async fn send_pairing_hello(
    transport: &mut dyn RemoteTransport,
    noise: &mut NoiseTransport,
    hello: &PairingHello,
) -> Result<(), String> {
    let payload = serde_json::to_vec(hello).map_err(|error| format!("serialize hello: {error}"))?;
    let encrypted = noise
        .encrypt(&payload)
        .map_err(|error| format!("encrypt hello: {error}"))?;
    transport
        .send(&encrypted)
        .await
        .map_err(|error| format!("send hello: {error}"))
}

async fn recv_pairing_hello(
    transport: &mut dyn RemoteTransport,
    noise: &mut NoiseTransport,
    timeout: Duration,
) -> Result<PairingHello, String> {
    let encrypted = tokio::time::timeout(timeout, transport.recv())
        .await
        .map_err(|_| format!("recv hello timed out after {}s", timeout.as_secs()))?
        .map_err(|error| format!("recv hello: {error}"))?;
    let decrypted = noise
        .decrypt(&encrypted)
        .map_err(|error| format!("decrypt hello: {error}"))?;
    serde_json::from_slice(&decrypted).map_err(|error| format!("decode hello: {error}"))
}

async fn run_json_rpc(
    req_tx: &tokio::sync::mpsc::Sender<RemoteIoRequest>,
    command: &'static str,
    timeout: Duration,
) -> Result<RpcResponse, String> {
    let (reply_tx, reply_rx) = oneshot::channel();
    req_tx
        .send(RemoteIoRequest {
            request: RpcRequest::new(command, json!({})),
            stream: None,
            reply_tx,
            priority: smoke_priority_for_command(command),
            cancel_group: None,
        })
        .await
        .map_err(|_| format!("{command} send failed: remote data-plane stopped"))?;

    let reply = tokio::time::timeout(timeout, reply_rx)
        .await
        .map_err(|_| format!("{command} timed out after {}s", timeout.as_secs()))?
        .map_err(|_| format!("{command} reply channel closed"))?;

    match reply {
        RpcReply::Json(response) => Ok(response),
        RpcReply::Stream(_) | RpcReply::RangeStream(_) => {
            Err(format!("{command} returned a stream response"))
        }
    }
}

fn smoke_priority_for_command(command: &str) -> RemoteRpcPriority {
    match command {
        "vault:lock" => RemoteRpcPriority::High,
        _ => RemoteRpcPriority::Normal,
    }
}

async fn wait_for_remote_disconnect(
    handle: &mut RemoteIoTaskHandle,
    timeout: Duration,
) -> Result<bool, String> {
    tokio::time::timeout(timeout, async {
        loop {
            match handle.evt_rx.recv().await {
                Some(RemoteIoEvent::Disconnected { .. }) => return true,
                Some(_) => continue,
                None => return true,
            }
        }
    })
    .await
    .map_err(|_| {
        format!(
            "remote disconnect event timed out after {}s",
            timeout.as_secs()
        )
    })
}

fn capability_features(response: &RpcResponse) -> Vec<String> {
    response
        .result()
        .and_then(|result| result.get("features"))
        .and_then(Value::as_array)
        .map(|features| {
            features
                .iter()
                .filter_map(Value::as_str)
                .map(str::to_owned)
                .collect()
        })
        .unwrap_or_default()
}

fn vault_is_unlocked(response: &RpcResponse) -> bool {
    response
        .result()
        .and_then(|result| result.get("is_unlocked"))
        .and_then(Value::as_bool)
        .unwrap_or(false)
}

fn describe_rpc_error(response: &RpcResponse) -> String {
    match response {
        RpcResponse::Success { .. } => "ok".to_string(),
        RpcResponse::Error { error, code, .. } => match code {
            Some(code) => format!("{code}: {error}"),
            None => error.clone(),
        },
    }
}

fn parse_args() -> Result<Args, String> {
    let mut storage_root = env::var_os("CHROMVOID_STORAGE_ROOT").map(PathBuf::from);
    let mut host_id = None;
    let mut timeout = Duration::from_secs(20);
    let mut adb_path = env::var("ADB").unwrap_or_else(|_| "adb".to_string());
    let mut adb_serial = env::var("ADB_SERIAL")
        .ok()
        .filter(|value| !value.trim().is_empty());
    let mut android_package = "com.chromvoid.app.dev".to_string();
    let mut skip_android_prepare = false;
    let mut secret_store = SecretStoreKind::File;
    let mut positionals = Vec::new();
    let mut iter = env::args().skip(1);

    while let Some(arg) = iter.next() {
        match arg.as_str() {
            "-h" | "--help" => return Err(usage()),
            "--storage-root" => {
                let Some(value) = iter.next() else {
                    return Err("--storage-root requires a path".to_string());
                };
                storage_root = Some(PathBuf::from(value));
            }
            "--host-id" => {
                let Some(value) = iter.next() else {
                    return Err("--host-id requires a value".to_string());
                };
                host_id = Some(value);
            }
            "--timeout-secs" => {
                let Some(value) = iter.next() else {
                    return Err("--timeout-secs requires a value".to_string());
                };
                let secs = value
                    .parse::<u64>()
                    .map_err(|_| format!("invalid --timeout-secs value: {value}"))?;
                timeout = Duration::from_secs(secs);
            }
            "--adb" => {
                let Some(value) = iter.next() else {
                    return Err("--adb requires a path".to_string());
                };
                adb_path = value;
            }
            "--adb-serial" => {
                let Some(value) = iter.next() else {
                    return Err("--adb-serial requires a value".to_string());
                };
                adb_serial = Some(value);
            }
            "--android-package" => {
                let Some(value) = iter.next() else {
                    return Err("--android-package requires a value".to_string());
                };
                android_package = value;
            }
            "--secret-store" => {
                let Some(value) = iter.next() else {
                    return Err("--secret-store requires file or keyring".to_string());
                };
                secret_store = parse_secret_store_kind(&value)?;
            }
            "--skip-android-prepare" => {
                skip_android_prepare = true;
            }
            _ if arg.starts_with("--storage-root=") => {
                storage_root = Some(PathBuf::from(
                    arg.trim_start_matches("--storage-root=").to_string(),
                ));
            }
            _ if arg.starts_with("--host-id=") => {
                host_id = Some(arg.trim_start_matches("--host-id=").to_string());
            }
            _ if arg.starts_with("--timeout-secs=") => {
                let value = arg.trim_start_matches("--timeout-secs=");
                let secs = value
                    .parse::<u64>()
                    .map_err(|_| format!("invalid --timeout-secs value: {value}"))?;
                timeout = Duration::from_secs(secs);
            }
            _ if arg.starts_with("--adb=") => {
                adb_path = arg.trim_start_matches("--adb=").to_string();
            }
            _ if arg.starts_with("--adb-serial=") => {
                adb_serial = Some(arg.trim_start_matches("--adb-serial=").to_string());
            }
            _ if arg.starts_with("--android-package=") => {
                android_package = arg.trim_start_matches("--android-package=").to_string();
            }
            _ if arg.starts_with("--secret-store=") => {
                secret_store = parse_secret_store_kind(arg.trim_start_matches("--secret-store="))?;
            }
            _ if arg.starts_with('-') => {
                return Err(format!("unknown argument: {arg}\n{}", usage()))
            }
            _ => positionals.push(arg),
        }
    }

    let command = match positionals.as_slice() {
        [] => Command::Connect,
        [command] if command == "scan" => Command::Scan,
        [command] if command == "list-paired" => Command::ListPaired,
        [command] if command == "pair" => Command::Pair,
        [command] if command == "connect" => Command::Connect,
        [command] if command == "remote-lock" => Command::RemoteLock,
        [command] => return Err(format!("unknown command: {command}\n{}", usage())),
        _ => return Err(format!("too many positional arguments\n{}", usage())),
    };

    let storage_root = storage_root
        .or_else(default_storage_root)
        .ok_or_else(|| format!("storage root is required\n{}", usage()))?;

    Ok(Args {
        command,
        storage_root,
        host_id,
        timeout,
        adb_path,
        adb_serial,
        android_package,
        skip_android_prepare,
        secret_store,
    })
}

fn parse_secret_store_kind(value: &str) -> Result<SecretStoreKind, String> {
    match value {
        "file" => Ok(SecretStoreKind::File),
        "keyring" => Ok(SecretStoreKind::Keyring),
        _ => Err(format!("invalid --secret-store value: {value}")),
    }
}

fn prepare_android_accessory_endpoint(args: &Args) -> Result<(), String> {
    let Some(serial) = args
        .adb_serial
        .clone()
        .or_else(|| resolve_single_adb_device(&args.adb_path))
    else {
        eprintln!("mobile-usb-smoke: adb target not found; skipping Android accessory prepare");
        return Ok(());
    };
    let force_stop_output = ProcessCommand::new(&args.adb_path)
        .args([
            "-s",
            &serial,
            "shell",
            "am",
            "force-stop",
            &args.android_package,
        ])
        .output()
        .map_err(|error| format!("run adb force-stop: {error}"))?;
    if !force_stop_output.status.success() {
        return Err(format!(
            "adb force-stop failed: {}{}",
            String::from_utf8_lossy(&force_stop_output.stdout),
            String::from_utf8_lossy(&force_stop_output.stderr)
        ));
    }

    start_android_activity(args)?;
    std::thread::sleep(Duration::from_secs(3));

    broadcast_android_accessory_debug_handshake(args)
}

fn prepare_android_endpoint_for_open(prepare: AndroidEndpointPrepare<'_>) -> Result<(), String> {
    match prepare {
        AndroidEndpointPrepare::Full(args) => prepare_android_accessory_endpoint(args),
        AndroidEndpointPrepare::Rearm(args) => rearm_android_accessory_endpoint(args),
    }
}

fn rearm_android_accessory_endpoint(args: &Args) -> Result<(), String> {
    start_android_activity(args)?;
    std::thread::sleep(Duration::from_millis(2_500));
    broadcast_android_accessory_debug_handshake(args)
}

fn start_android_activity(args: &Args) -> Result<(), String> {
    let Some(serial) = args
        .adb_serial
        .clone()
        .or_else(|| resolve_single_adb_device(&args.adb_path))
    else {
        eprintln!("mobile-usb-smoke: adb target not found; skipping Android activity start");
        return Ok(());
    };
    let activity = format!("{}/com.chromvoid.app.MainActivity", args.android_package);
    let start_output = ProcessCommand::new(&args.adb_path)
        .args(["-s", &serial, "shell", "am", "start", "-W", "-n", &activity])
        .output()
        .map_err(|error| format!("run adb start activity: {error}"))?;
    if !start_output.status.success() {
        return Err(format!(
            "adb start activity failed: {}{}",
            String::from_utf8_lossy(&start_output.stdout),
            String::from_utf8_lossy(&start_output.stderr)
        ));
    }
    Ok(())
}

fn broadcast_android_accessory_debug_handshake(args: &Args) -> Result<(), String> {
    let Some(serial) = args
        .adb_serial
        .clone()
        .or_else(|| resolve_single_adb_device(&args.adb_path))
    else {
        eprintln!("mobile-usb-smoke: adb target not found; skipping Android accessory rearm");
        return Ok(());
    };
    let component = format!(
        "{}/com.chromvoid.app.MobileUsbAccessorySystemReceiver",
        args.android_package
    );
    let output = ProcessCommand::new(&args.adb_path)
        .args([
            "-s",
            &serial,
            "shell",
            "am",
            "broadcast",
            "-f",
            "0x20",
            "-n",
            &component,
            "-a",
            "com.chromvoid.app.action.USB_ACCESSORY_DEBUG_HANDSHAKE",
        ])
        .output()
        .map_err(|error| format!("run adb accessory prepare: {error}"))?;
    if !output.status.success() {
        return Err(format!(
            "adb accessory prepare failed: {}{}",
            String::from_utf8_lossy(&output.stdout),
            String::from_utf8_lossy(&output.stderr)
        ));
    }
    std::thread::sleep(Duration::from_secs(2));
    Ok(())
}

fn resolve_single_adb_device(adb_path: &str) -> Option<String> {
    let output = ProcessCommand::new(adb_path).arg("devices").output().ok()?;
    if !output.status.success() {
        return None;
    }
    let stdout = String::from_utf8_lossy(&output.stdout);
    let devices = stdout
        .lines()
        .skip(1)
        .filter_map(|line| {
            let mut parts = line.split_whitespace();
            let serial = parts.next()?;
            let state = parts.next()?;
            (state == "device").then(|| serial.to_string())
        })
        .collect::<Vec<_>>();
    if devices.len() == 1 {
        devices.into_iter().next()
    } else {
        None
    }
}

fn start_watchdog(timeout: Duration) -> Arc<AtomicBool> {
    let done = Arc::new(AtomicBool::new(false));
    let thread_done = done.clone();
    std::thread::spawn(move || {
        std::thread::sleep(timeout + Duration::from_secs(5));
        if !thread_done.load(Ordering::Relaxed) {
            eprintln!("mobile-usb-smoke timed out after {}s", timeout.as_secs());
            std::process::exit(124);
        }
    });
    done
}

fn default_storage_root() -> Option<PathBuf> {
    #[cfg(target_os = "macos")]
    {
        env::var_os("HOME").map(|home| {
            PathBuf::from(home)
                .join("Library")
                .join("Application Support")
                .join("com.chromvoid.app.dev")
                .join("storage")
                .join("mobile-usb-smoke")
        })
    }
    #[cfg(not(target_os = "macos"))]
    {
        None
    }
}

struct NoiseStaticKeypair {
    private: Vec<u8>,
    public: Vec<u8>,
}

fn noise_static_keypair() -> Result<NoiseStaticKeypair, String> {
    let params: snow::params::NoiseParams = chromvoid_protocol::NOISE_PARAMS_XX
        .parse()
        .map_err(|error: snow::Error| format!("noise params failed: {error}"))?;
    let keypair = snow::Builder::new(params)
        .generate_keypair()
        .map_err(|error| format!("noise keypair generation failed: {error}"))?;
    Ok(NoiseStaticKeypair {
        private: keypair.private,
        public: keypair.public,
    })
}

fn new_host_id() -> String {
    format!("mobile-usb-{}", uuid::Uuid::new_v4())
}

fn now_secs() -> u64 {
    std::time::SystemTime::now()
        .duration_since(std::time::UNIX_EPOCH)
        .map(|duration| duration.as_secs())
        .unwrap_or_default()
}

fn desktop_pairing_label() -> String {
    env::var("HOSTNAME")
        .ok()
        .or_else(|| env::var("COMPUTERNAME").ok())
        .map(|value| value.trim().to_string())
        .filter(|value| !value.is_empty())
        .unwrap_or_else(|| "ChromVoid Desktop".to_string())
}

fn hex_encode(bytes: &[u8]) -> String {
    bytes.iter().map(|byte| format!("{byte:02x}")).collect()
}

fn print_json(value: &impl Serialize) -> Result<(), String> {
    let text = serde_json::to_string_pretty(value).map_err(|error| error.to_string())?;
    println!("{text}");
    Ok(())
}

fn init_tracing() {
    let filter = tracing_subscriber::EnvFilter::try_from_default_env()
        .unwrap_or_else(|_| tracing_subscriber::EnvFilter::new("warn"));
    let _ = tracing_subscriber::fmt()
        .with_env_filter(filter)
        .with_writer(std::io::stderr)
        .try_init();
}

fn usage() -> String {
    "usage: mobile-usb-smoke [scan|list-paired|pair|connect|remote-lock] [--storage-root PATH] [--host-id HOST_ID] [--timeout-secs N] [--adb PATH] [--adb-serial SERIAL] [--android-package PACKAGE] [--secret-store file|keyring] [--skip-android-prepare]"
        .to_string()
}
