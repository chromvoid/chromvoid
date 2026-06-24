use std::sync::atomic::{AtomicU64, Ordering};
use std::sync::{Arc, Mutex};

use std::path::PathBuf;

use chromvoid_core::catalog::CatalogMediaInfo;
use chromvoid_core::media_inspector::MediaInspectionError;
use chromvoid_core::rpc::types::{RpcRequest, RpcResponse, PROTOCOL_VERSION};
use chromvoid_core::rpc::{
    inspect_catalog_media_snapshot, CatalogMediaInspectSnapshot, RpcInputStream, RpcReply,
    RpcStreamMeta,
};
use chromvoid_protocol::{
    frame_continuation, frame_from_heartbeat, Frame, FrameType, NoiseTransport, RemoteTransport,
    TransportType, FLAG_HAS_CONTINUATION,
};
use tokio::task::JoinSet;
use tracing::{info, warn};

use crate::core_adapter::{CoreAdapter, LocalCoreAdapter};
use crate::mobile_usb::{
    mobile_usb_hex_encode, send_mobile_usb_pairing_hello, MobileUsbPairingHello,
};
use crate::network::paired_peers::PairedPeer;
use crate::network::{LocalDeviceIdentityStore, PairedPeerStore};
use crate::remote_data_plane::{recv_decrypted_frame, send_encrypted_frame};
use crate::rpc_transport_protocol::{
    append_full_upload_stream_chunk, parse_upload_stream_metadata, upload_stream_chunk_data,
};

const HEARTBEAT_INTERVAL: std::time::Duration = std::time::Duration::from_secs(30);
const HOST_MEDIA_INSPECTION_SHUTDOWN_GRACE: std::time::Duration = std::time::Duration::from_secs(1);
const STREAM_CHUNK_SIZE: usize = 1024 * 1024;

enum HostLoopInput {
    Frame(Frame),
    UsbPairingHello,
}

fn frame_from_rpc_response(message_id: u64, resp: &RpcResponse) -> Frame {
    let payload = crate::rpc_transport_protocol::json_payload_or_empty_object(
        resp,
        "mobile_acceptor: rpc response frame",
    );
    Frame {
        frame_type: FrameType::RpcResponse,
        message_id,
        flags: 0,
        payload,
    }
}

fn frame_stream_meta_response(message_id: u64, meta: &RpcStreamMeta) -> Frame {
    let payload = crate::rpc_transport_protocol::json_payload_or_empty_object(
        meta,
        "mobile_acceptor: stream meta frame",
    );
    Frame {
        frame_type: FrameType::RpcResponse,
        message_id,
        flags: FLAG_HAS_CONTINUATION,
        payload,
    }
}

fn is_upload_stream_command(command: &str) -> bool {
    matches!(
        command,
        "catalog:upload"
            | "catalog:file:replace"
            | "catalog:secret:write"
            | "catalog:derivative:write"
    )
}

fn is_full_upload_stream_command(command: &str) -> bool {
    matches!(command, "catalog:file:replace" | "catalog:derivative:write")
}

fn is_download_stream_command(command: &str) -> bool {
    matches!(
        command,
        "catalog:download"
            | "catalog:secret:read"
            | "catalog:derivative:read"
            | "vault:export:download"
    )
}

fn read_stream_chunk(reader: &mut dyn std::io::Read, buf: &mut [u8]) -> Result<usize, String> {
    reader.read(buf).map_err(|e| format!("stream read: {}", e))
}

async fn shutdown_host_media_jobs(peer_id: &str, media_jobs: &mut JoinSet<()>) {
    let pending_jobs = media_jobs.len();
    if pending_jobs == 0 {
        return;
    }

    match tokio::time::timeout(HOST_MEDIA_INSPECTION_SHUTDOWN_GRACE, media_jobs.shutdown()).await {
        Ok(()) => {
            info!(
                "mobile_acceptor: host media inspection jobs drained peer_id={} jobs={}",
                peer_id, pending_jobs
            );
        }
        Err(_) => {
            warn!(
                "mobile_acceptor: host media inspection shutdown timed out peer_id={} jobs={}",
                peer_id, pending_jobs
            );
        }
    }
}

enum HostRpcAdapter {
    Shared(Arc<Mutex<Box<dyn CoreAdapter>>>),
    Local(LocalCoreAdapter),
}

type SharedHostRpcAdapter = Arc<Mutex<HostRpcAdapter>>;

struct LazyHostRpcAdapter {
    adapter: Option<SharedHostRpcAdapter>,
    seed_adapter: Option<Arc<Mutex<Box<dyn CoreAdapter>>>>,
    storage_root: PathBuf,
}

struct HostMediaInspectionResult {
    message_id: u64,
    epoch: u64,
    snapshot: CatalogMediaInspectSnapshot,
    read_ms: u128,
    result: Result<Option<CatalogMediaInfo>, MediaInspectionError>,
}

fn media_inspection_success(
    snapshot: &CatalogMediaInspectSnapshot,
    media_info: Option<CatalogMediaInfo>,
    media_inspected_revision: u64,
    stale: bool,
) -> RpcResponse {
    let mut result = serde_json::json!({
        "node_id": snapshot.node_id,
        "media_info": media_info,
        "source_revision": snapshot.source_revision,
        "media_inspected_revision": media_inspected_revision,
    });
    if stale {
        if let Some(object) = result.as_object_mut() {
            object.insert("stale".to_string(), serde_json::json!(true));
        }
    }
    RpcResponse::success(result)
}

impl LazyHostRpcAdapter {
    fn new(seed_adapter: Option<Arc<Mutex<Box<dyn CoreAdapter>>>>, storage_root: PathBuf) -> Self {
        Self {
            adapter: None,
            seed_adapter,
            storage_root,
        }
    }

    async fn get(&mut self) -> Result<SharedHostRpcAdapter, String> {
        if let Some(adapter) = &self.adapter {
            return Ok(adapter.clone());
        }

        let seed_adapter = self.seed_adapter.take();
        let storage_root = self.storage_root.clone();
        let loaded = tauri::async_runtime::spawn_blocking(move || {
            HostRpcAdapter::load(seed_adapter, storage_root)
        })
        .await
        .map_err(|error| format!("mobile acceptor host adapter load task failed: {error}"))??;
        let adapter = Arc::new(Mutex::new(loaded));
        self.adapter = Some(adapter.clone());
        Ok(adapter)
    }
}

impl HostRpcAdapter {
    fn load(
        adapter: Option<Arc<Mutex<Box<dyn CoreAdapter>>>>,
        storage_root: std::path::PathBuf,
    ) -> Result<Self, String> {
        if let Some(adapter) = adapter {
            info!("mobile_acceptor: using shared app adapter for host rpc loop");
            return Ok(Self::Shared(adapter));
        }

        warn!("mobile_acceptor: shared app adapter missing, falling back to LocalCoreAdapter");
        Ok(Self::Local(LocalCoreAdapter::new(storage_root)?))
    }

    fn handle(&mut self, req: &RpcRequest) -> Result<RpcResponse, String> {
        match self {
            Self::Shared(adapter) => {
                let mut adapter = adapter
                    .lock()
                    .map_err(|_| "shared adapter mutex poisoned".to_string())?;
                let resp = adapter.handle(req);
                adapter.save()?;
                Ok(resp)
            }
            Self::Local(adapter) => {
                let resp = adapter.handle(req);
                adapter.save()?;
                Ok(resp)
            }
        }
    }

    fn snapshot_catalog_media_inspect(
        &mut self,
        node_id: u64,
    ) -> Result<Option<Result<CatalogMediaInspectSnapshot, RpcResponse>>, String> {
        match self {
            Self::Shared(adapter) => {
                let mut adapter = adapter
                    .lock()
                    .map_err(|_| "shared adapter mutex poisoned".to_string())?;
                let snapshot = adapter.snapshot_catalog_media_inspect(node_id);
                adapter.save()?;
                Ok(snapshot)
            }
            Self::Local(adapter) => {
                let snapshot = adapter.snapshot_catalog_media_inspect(node_id);
                adapter.save()?;
                Ok(snapshot)
            }
        }
    }

    fn commit_catalog_media_inspect(
        &mut self,
        snapshot: &CatalogMediaInspectSnapshot,
        media_info: Option<CatalogMediaInfo>,
        media_inspected_revision: u64,
    ) -> Result<Option<RpcResponse>, String> {
        match self {
            Self::Shared(adapter) => {
                let mut adapter = adapter
                    .lock()
                    .map_err(|_| "shared adapter mutex poisoned".to_string())?;
                let response = adapter.commit_catalog_media_inspect(
                    snapshot,
                    media_info,
                    media_inspected_revision,
                );
                adapter.save()?;
                Ok(response)
            }
            Self::Local(adapter) => {
                let response = adapter.commit_catalog_media_inspect(
                    snapshot,
                    media_info,
                    media_inspected_revision,
                );
                adapter.save()?;
                Ok(response)
            }
        }
    }

    fn handle_with_stream(
        &mut self,
        req: &RpcRequest,
        stream: Option<RpcInputStream>,
    ) -> Result<RpcReply, String> {
        match self {
            Self::Shared(adapter) => {
                let mut adapter = adapter
                    .lock()
                    .map_err(|_| "shared adapter mutex poisoned".to_string())?;
                let reply = adapter.handle_with_stream(req, stream);
                adapter.save()?;
                Ok(reply)
            }
            Self::Local(adapter) => {
                let reply = adapter.handle_with_stream(req, stream);
                adapter.save()?;
                Ok(reply)
            }
        }
    }
}

async fn run_host_adapter_task<T, F>(
    adapter: &mut LazyHostRpcAdapter,
    label: &'static str,
    task: F,
) -> Result<T, String>
where
    T: Send + 'static,
    F: FnOnce(&mut HostRpcAdapter) -> Result<T, String> + Send + 'static,
{
    let adapter = adapter.get().await?;
    let adapter = adapter.clone();
    tauri::async_runtime::spawn_blocking(move || {
        let mut adapter = adapter
            .lock()
            .map_err(|_| "host rpc adapter mutex poisoned".to_string())?;
        task(&mut adapter)
    })
    .await
    .map_err(|error| format!("{label} task failed: {error}"))?
}

async fn recv_host_loop_input(
    transport: &mut dyn RemoteTransport,
    noise: &mut NoiseTransport,
    transport_type: TransportType,
    storage_root: &std::path::Path,
    peer_id: &str,
) -> Result<HostLoopInput, String> {
    let bytes = transport
        .recv()
        .await
        .map_err(|error| format!("recv: {error}"))?;
    let encrypted_len = bytes.len();
    let decrypted = match noise.decrypt(&bytes) {
        Ok(decrypted) => decrypted,
        Err(error) => {
            if matches!(transport_type, TransportType::UsbMobile) {
                warn!(
                    transport_type = ?transport_type,
                    encrypted_len,
                    error = %error,
                    "remote_frame: usb decrypt failed"
                );
            }
            return Err(format!("decrypt: {error}"));
        }
    };

    match Frame::decode(&decrypted) {
        Ok(frame) => {
            log_host_usb_frame("recv", transport_type, &frame, encrypted_len);
            Ok(HostLoopInput::Frame(frame))
        }
        Err(frame_error) if matches!(transport_type, TransportType::UsbMobile) => {
            let hello = serde_json::from_slice::<MobileUsbPairingHello>(&decrypted)
                .map_err(|_| format!("decode: {frame_error}"))?;
            handle_usb_pairing_hello(transport, noise, storage_root, peer_id, hello).await?;
            Ok(HostLoopInput::UsbPairingHello)
        }
        Err(frame_error) => Err(format!("decode: {frame_error}")),
    }
}

async fn handle_usb_pairing_hello(
    transport: &mut dyn RemoteTransport,
    noise: &mut NoiseTransport,
    storage_root: &std::path::Path,
    peer_id: &str,
    hello: MobileUsbPairingHello,
) -> Result<(), String> {
    let remote_pubkey = noise.remote_pubkey().to_vec();
    let remote_pubkey_hex = mobile_usb_hex_encode(&remote_pubkey);
    if hello.peer_pubkey_hex != remote_pubkey_hex {
        return Err("USB pairing hello pubkey mismatch in host RPC loop".to_string());
    }

    let storage_root = storage_root.to_path_buf();
    let identity_root = storage_root.clone();
    let local_identity = tauri::async_runtime::spawn_blocking(move || {
        let mut store =
            LocalDeviceIdentityStore::load(&identity_root.join("network_local_identity.json"));
        store.get_or_create("ChromVoid Host")
    })
    .await
    .map_err(|error| format!("USB pairing identity load task failed: {error}"))??;

    let local_pubkey = hex::decode(&local_identity.static_pubkey_hex)
        .map_err(|error| format!("USB pairing local pubkey decode failed: {error}"))?;
    persist_usb_pairing_from_host_loop(
        storage_root.join("paired_network_peers.json"),
        PairedPeer {
            peer_id: hello.peer_id.clone(),
            label: hello.peer_label.clone(),
            relay_url: "usb://android-aoa".to_string(),
            peer_pubkey: remote_pubkey,
            client_pubkey: local_pubkey,
            client_privkey_hex: local_identity.static_privkey_hex.clone(),
            last_seen: now_secs(),
            paired_at: now_secs(),
            platform: hello.platform,
        },
    )
    .await?;

    send_mobile_usb_pairing_hello(
        transport,
        noise,
        &MobileUsbPairingHello {
            peer_id: local_identity.device_id,
            peer_label: local_identity.device_label,
            peer_pubkey_hex: local_identity.static_pubkey_hex,
            platform: "android".to_string(),
        },
    )
    .await?;
    info!(
        "mobile_acceptor: accepted USB pairing preflight peer_id={}",
        peer_id
    );
    Ok(())
}

async fn persist_usb_pairing_from_host_loop(
    store_path: PathBuf,
    peer: PairedPeer,
) -> Result<(), String> {
    tauri::async_runtime::spawn_blocking(move || {
        let mut store = PairedPeerStore::load(&store_path);
        store.upsert(peer);
        store.save()
    })
    .await
    .map_err(|error| format!("USB host-loop pairing persistence task failed: {error}"))?
}

fn log_host_usb_frame(
    direction: &'static str,
    transport_type: TransportType,
    frame: &Frame,
    encrypted_len: usize,
) {
    if matches!(transport_type, TransportType::UsbMobile) {
        info!(
            direction,
            transport_type = ?transport_type,
            frame_type = ?frame.frame_type,
            message_id = frame.message_id,
            flags = frame.flags,
            payload_len = frame.payload.len(),
            encrypted_len,
            "remote_frame: usb encrypted frame"
        );
    }
}

fn now_secs() -> u64 {
    std::time::SystemTime::now()
        .duration_since(std::time::UNIX_EPOCH)
        .map(|duration| duration.as_secs())
        .unwrap_or_default()
}

pub(super) async fn run_host_rpc_loop(
    adapter: Option<Arc<Mutex<Box<dyn CoreAdapter>>>>,
    transport: Box<dyn RemoteTransport>,
    noise: NoiseTransport,
    transport_type: TransportType,
    storage_root: std::path::PathBuf,
    peer_id: String,
    shutdown_rx: tokio::sync::oneshot::Receiver<()>,
) -> Result<(), String> {
    run_host_rpc_loop_with_heartbeat_interval(
        adapter,
        transport,
        noise,
        transport_type,
        storage_root,
        peer_id,
        shutdown_rx,
        HEARTBEAT_INTERVAL,
    )
    .await
}

async fn run_host_rpc_loop_with_heartbeat_interval(
    adapter: Option<Arc<Mutex<Box<dyn CoreAdapter>>>>,
    mut transport: Box<dyn RemoteTransport>,
    mut noise: NoiseTransport,
    transport_type: TransportType,
    storage_root: std::path::PathBuf,
    peer_id: String,
    mut shutdown_rx: tokio::sync::oneshot::Receiver<()>,
    heartbeat_interval_duration: std::time::Duration,
) -> Result<(), String> {
    let pairing_storage_root = storage_root.clone();
    let mut adapter = LazyHostRpcAdapter::new(adapter, storage_root);
    let mut anti_replay = chromvoid_protocol::AntiReplay::new();
    let host_heartbeat_enabled = host_heartbeat_enabled(transport_type);
    if !host_heartbeat_enabled {
        info!(
            "mobile_acceptor: host heartbeat disabled transport_type={:?} peer_id={}",
            transport_type, peer_id
        );
    }
    let mut heartbeat_interval = tokio::time::interval(heartbeat_interval_duration);
    // Tokio intervals tick immediately once; USB direct transports need the
    // post-handshake loop to be ready to read before periodic heartbeats begin.
    heartbeat_interval.tick().await;
    let mut server_msg_id = rand::random::<u64>() | 1;
    let media_inspection_epoch = Arc::new(AtomicU64::new(0));
    let (media_job_tx, mut media_job_rx) =
        tokio::sync::mpsc::unbounded_channel::<HostMediaInspectionResult>();
    let mut media_jobs = JoinSet::new();

    loop {
        tokio::select! {
            biased;

            _ = &mut shutdown_rx => {
                info!("mobile_acceptor: host rpc loop shutdown peer_id={}", peer_id);
                media_inspection_epoch.fetch_add(1, Ordering::SeqCst);
                shutdown_host_media_jobs(&peer_id, &mut media_jobs).await;
                let _ = transport.close().await;
                return Ok(());
            }

            join_result = media_jobs.join_next(), if !media_jobs.is_empty() => {
                if let Some(Err(error)) = join_result {
                    warn!(
                        "mobile_acceptor: media inspection task join error peer_id={} error={}",
                        peer_id, error
                    );
                }
            }

            _ = heartbeat_interval.tick(), if host_heartbeat_enabled => {
                let heartbeat = frame_from_heartbeat(server_msg_id, PROTOCOL_VERSION);
                server_msg_id = server_msg_id.wrapping_add(1).max(1);
                send_encrypted_frame(transport.as_mut(), &mut noise, heartbeat).await?;
            }

            Some(job) = media_job_rx.recv() => {
                let current_epoch = media_inspection_epoch.load(Ordering::SeqCst);
                let response = if job.epoch != current_epoch {
                    info!(
                        "perf:media_inspection event=stale_discard host=true node_id={} job_epoch={} current_epoch={} read_ms={}",
                        job.snapshot.node_id,
                        job.epoch,
                        current_epoch,
                        job.read_ms
                    );
                    media_inspection_success(
                        &job.snapshot,
                        job.snapshot.media_info.clone(),
                        job.snapshot.media_inspected_revision,
                        true,
                    )
                } else {
                    match job.result {
                        Ok(media_info) => {
                            let media_inspected_revision =
                                if media_info.is_some() || job.snapshot.inspection_candidate {
                                    job.snapshot.source_revision
                                } else {
                                    0
                                };
                            let commit_snapshot = job.snapshot.clone();
                            let commit_media_info = media_info.clone();
                            match run_host_adapter_task(
                                &mut adapter,
                                "mobile acceptor media inspect commit",
                                move |adapter| {
                                    adapter.commit_catalog_media_inspect(
                                        &commit_snapshot,
                                        commit_media_info,
                                        media_inspected_revision,
                                    )
                                },
                            )
                            .await? {
                                Some(response) => {
                                    info!(
                                        "perf:media_inspection event=commit host=true node_id={} read_ms={} epoch={}",
                                        job.snapshot.node_id,
                                        job.read_ms,
                                        job.epoch
                                    );
                                    response
                                }
                                None => {
                                    let fallback_req = RpcRequest::new(
                                        "catalog:media:inspect",
                                        serde_json::json!({"node_id": job.snapshot.node_id}),
                                    );
                                    run_host_adapter_task(
                                        &mut adapter,
                                        "mobile acceptor media inspect fallback",
                                        move |adapter| adapter.handle(&fallback_req),
                                    )
                                    .await?
                                }
                            }
                        }
                        Err(MediaInspectionError::Cancelled) => {
                            info!(
                                "perf:media_inspection event=cancelled host=true node_id={} read_ms={} epoch={}",
                                job.snapshot.node_id,
                                job.read_ms,
                                job.epoch
                            );
                            media_inspection_success(
                                &job.snapshot,
                                job.snapshot.media_info.clone(),
                                job.snapshot.media_inspected_revision,
                                true,
                            )
                        }
                        Err(error) => {
                            warn!(
                                "perf:media_inspection event=read_error host=true node_id={} read_ms={} error={:?}",
                                job.snapshot.node_id,
                                job.read_ms,
                                error
                            );
                            media_inspection_success(&job.snapshot, None, 0, false)
                        }
                    }
                };
                send_encrypted_frame(
                    transport.as_mut(),
                    &mut noise,
                    frame_from_rpc_response(job.message_id, &response),
                ).await?;
            }

            input = recv_host_loop_input(
                transport.as_mut(),
                &mut noise,
                transport_type,
                &pairing_storage_root,
                &peer_id,
            ) => {
                let frame = match input? {
                    HostLoopInput::Frame(frame) => frame,
                    HostLoopInput::UsbPairingHello => continue,
                };
                match frame.frame_type {
                    FrameType::Heartbeat => continue,
                    FrameType::Error => return Err("peer sent error frame".to_string()),
                    FrameType::RpcResponse => continue,
                    FrameType::RpcRequest => {}
                }

                anti_replay
                    .check(frame.message_id)
                    .map_err(|e| format!("anti_replay: {e}"))?;

                let req: RpcRequest = serde_json::from_slice(&frame.payload)
                    .map_err(|e| format!("request parse: {e}"))?;

                if req.command == "catalog:media:inspect:cancel" {
                    let epoch = req
                        .data
                        .get("epoch")
                        .and_then(|value| value.as_u64())
                        .unwrap_or_else(|| media_inspection_epoch.load(Ordering::SeqCst).saturating_add(1));
                    let mut current = media_inspection_epoch.load(Ordering::SeqCst);
                    while current < epoch {
                        match media_inspection_epoch.compare_exchange(
                            current,
                            epoch,
                            Ordering::SeqCst,
                            Ordering::SeqCst,
                        ) {
                            Ok(_) => break,
                            Err(next) => current = next,
                        }
                    }
                    info!(
                        "perf:media_inspection event=cancel host=true epoch={} peer_id={}",
                        epoch,
                        peer_id
                    );
                    let response = RpcResponse::success(serde_json::json!({
                        "epoch": media_inspection_epoch.load(Ordering::SeqCst),
                    }));
                    send_encrypted_frame(
                        transport.as_mut(),
                        &mut noise,
                        frame_from_rpc_response(frame.message_id, &response),
                    ).await?;
                    continue;
                }

                if req.command == "vault:lock" {
                    let epoch = media_inspection_epoch
                        .fetch_add(1, Ordering::SeqCst)
                        .saturating_add(1);
                    info!(
                        "perf:media_inspection event=cancel host=true reason=remote_vault_lock_disconnect epoch={} peer_id={}",
                        epoch,
                        peer_id
                    );
                    shutdown_host_media_jobs(&peer_id, &mut media_jobs).await;
                    let response = RpcResponse::success(serde_json::Value::Null);
                    send_encrypted_frame(
                        transport.as_mut(),
                        &mut noise,
                        frame_from_rpc_response(frame.message_id, &response),
                    ).await?;
                    info!(
                        "mobile_acceptor: remote vault lock requested disconnect peer_id={}",
                        peer_id
                    );
                    let _ = transport.close().await;
                    return Ok(());
                }

                if req.command == "catalog:media:inspect" && !frame.has_continuation() {
                    let node_id = match req.data.get("node_id").and_then(|value| value.as_u64()) {
                        Some(node_id) => node_id,
                        None => {
                            let response = RpcResponse::Error {
                                ok: false,
                                error: "node_id is required".to_string(),
                                code: Some("EMPTY_PAYLOAD".to_string()),
                            };
                            send_encrypted_frame(
                                transport.as_mut(),
                                &mut noise,
                                frame_from_rpc_response(frame.message_id, &response),
                            ).await?;
                            continue;
                        }
                    };
                    let snapshot_start = std::time::Instant::now();
                    match run_host_adapter_task(
                        &mut adapter,
                        "mobile acceptor media inspect snapshot",
                        move |adapter| adapter.snapshot_catalog_media_inspect(node_id),
                    )
                    .await? {
                        Some(Ok(snapshot)) => {
                            let snapshot_ms = snapshot_start.elapsed().as_millis();
                            if snapshot.inspection_complete {
                                info!(
                                    "perf:media_inspection event=cached_skip host=true node_id={} source_revision={} media_inspected_revision={} snapshot_ms={}",
                                    snapshot.node_id,
                                    snapshot.source_revision,
                                    snapshot.media_inspected_revision,
                                    snapshot_ms
                                );
                                let response = media_inspection_success(
                                    &snapshot,
                                    snapshot.media_info.clone(),
                                    snapshot.media_inspected_revision,
                                    false,
                                );
                                send_encrypted_frame(
                                    transport.as_mut(),
                                    &mut noise,
                                    frame_from_rpc_response(frame.message_id, &response),
                                ).await?;
                                continue;
                            }

                            let job_epoch = media_inspection_epoch.load(Ordering::SeqCst);
                            let job_tx = media_job_tx.clone();
                            let job_snapshot = snapshot.clone();
                            let epoch_for_read = media_inspection_epoch.clone();
                            let message_id = frame.message_id;
                            media_jobs.spawn_blocking(move || {
                                let read_start = std::time::Instant::now();
                                let snapshot_for_read = job_snapshot.clone();
                                let result = inspect_catalog_media_snapshot(&snapshot_for_read, || {
                                    epoch_for_read.load(Ordering::SeqCst) != job_epoch
                                });
                                let _ = job_tx.send(HostMediaInspectionResult {
                                    message_id,
                                    epoch: job_epoch,
                                    snapshot: job_snapshot,
                                    read_ms: read_start.elapsed().as_millis(),
                                    result,
                                });
                            });
                            info!(
                                "perf:media_inspection event=spawn host=true node_id={} snapshot_ms={} epoch={}",
                                snapshot.node_id,
                                snapshot_ms,
                                job_epoch
                            );
                            continue;
                        }
                        Some(Err(response)) => {
                            send_encrypted_frame(
                                transport.as_mut(),
                                &mut noise,
                                frame_from_rpc_response(frame.message_id, &response),
                            ).await?;
                            continue;
                        }
                        None => {
                            info!(
                                "perf:media_inspection event=fallback host=true node_id={} reason=split_hook_unavailable",
                                node_id
                            );
                        }
                    }
                }

                if is_upload_stream_command(&req.command) && frame.has_continuation() {
                    if is_full_upload_stream_command(&req.command) {
                        anti_replay.set_active_stream(frame.message_id);

                        let mut body = Vec::new();
                        let mut stream_ok = true;
                        loop {
                            let chunk_frame =
                                recv_decrypted_frame(transport.as_mut(), &mut noise).await?;
                            if chunk_frame.frame_type != FrameType::RpcRequest
                                || chunk_frame.message_id != frame.message_id
                            {
                                let err = RpcResponse::Error {
                                    ok: false,
                                    error: "stream message_id mismatch".to_string(),
                                    code: Some("INVALID_FORMAT".to_string()),
                                };
                                let _ = send_encrypted_frame(
                                    transport.as_mut(),
                                    &mut noise,
                                    frame_from_rpc_response(frame.message_id, &err),
                                )
                                .await;
                                stream_ok = false;
                                break;
                            }

                            anti_replay
                                .check(chunk_frame.message_id)
                                .map_err(|e| format!("anti_replay: {e}"))?;

                            if let Err(response) =
                                append_full_upload_stream_chunk(&mut body, &chunk_frame.payload)
                            {
                                let _ = send_encrypted_frame(
                                    transport.as_mut(),
                                    &mut noise,
                                    frame_from_rpc_response(frame.message_id, &response),
                                )
                                .await;
                                stream_ok = false;
                                break;
                            }

                            if !chunk_frame.has_continuation() {
                                break;
                            }
                        }

                        anti_replay.clear_active_stream();

                        if !stream_ok {
                            return Err(format!("host upload stream aborted peer_id={}", peer_id));
                        }

                        let full_upload_req = req.clone();
                        let response = match run_host_adapter_task(
                            &mut adapter,
                            "mobile acceptor full upload stream",
                            move |adapter| {
                                adapter.handle_with_stream(
                                    &full_upload_req,
                                    Some(RpcInputStream::from_bytes(body)),
                                )
                            },
                        )
                        .await? {
                            RpcReply::Json(resp) => resp,
                            RpcReply::Stream(_) | RpcReply::RangeStream(_) => RpcResponse::Error {
                                ok: false,
                                error: "unexpected streaming response for upload".to_string(),
                                code: Some("STREAM_UNEXPECTED".to_string()),
                            },
                        };

                        send_encrypted_frame(
                            transport.as_mut(),
                            &mut noise,
                            frame_from_rpc_response(frame.message_id, &response),
                        )
                        .await?;
                        continue;
                    }

                    let upload_metadata = match parse_upload_stream_metadata(&req.data) {
                        Ok(metadata) => metadata,
                        Err(response) => {
                            send_encrypted_frame(
                                transport.as_mut(),
                                &mut noise,
                                frame_from_rpc_response(frame.message_id, &response),
                            )
                            .await?;
                            continue;
                        }
                    };
                    let stream_size = upload_metadata.size;
                    let mut offset = upload_metadata.offset;
                    anti_replay.set_active_stream(frame.message_id);

                    let mut stream_ok = true;
                    loop {
                        let chunk_frame = recv_decrypted_frame(transport.as_mut(), &mut noise).await?;
                        if chunk_frame.frame_type != FrameType::RpcRequest || chunk_frame.message_id != frame.message_id {
                            let err = RpcResponse::Error {
                                ok: false,
                                error: "stream message_id mismatch".to_string(),
                                code: Some("INVALID_FORMAT".to_string()),
                            };
                            let _ = send_encrypted_frame(
                                transport.as_mut(),
                                &mut noise,
                                frame_from_rpc_response(frame.message_id, &err),
                            ).await;
                            stream_ok = false;
                            break;
                        }

                        anti_replay
                            .check(chunk_frame.message_id)
                            .map_err(|e| format!("anti_replay: {e}"))?;

                        let chunk_len = chunk_frame.payload.len() as u64;
                        let is_final_chunk = !chunk_frame.has_continuation();
                        let chunk_data =
                            match upload_stream_chunk_data(
                                &req.data,
                                offset,
                                chunk_len,
                                stream_size,
                                is_final_chunk,
                            ) {
                                Ok(chunk_data) => chunk_data,
                                Err(response) => {
                                    let _ = send_encrypted_frame(
                                        transport.as_mut(),
                                        &mut noise,
                                        frame_from_rpc_response(frame.message_id, &response),
                                    )
                                    .await;
                                    stream_ok = false;
                                    break;
                                }
                            };

                        let chunk_req = RpcRequest {
                            v: PROTOCOL_VERSION,
                            command: req.command.clone(),
                            data: chunk_data,
                        };

                        let chunk_payload = chunk_frame.payload.clone();
                        match run_host_adapter_task(
                            &mut adapter,
                            "mobile acceptor upload stream chunk",
                            move |adapter| {
                                adapter.handle_with_stream(
                                    &chunk_req,
                                    Some(RpcInputStream::from_bytes(chunk_payload)),
                                )
                            },
                        )
                        .await? {
                            RpcReply::Json(resp) => {
                                if !resp.is_ok() {
                                    let _ = send_encrypted_frame(
                                        transport.as_mut(),
                                        &mut noise,
                                        frame_from_rpc_response(frame.message_id, &resp),
                                    ).await;
                                    stream_ok = false;
                                    break;
                                }
                            }
                            RpcReply::Stream(_) | RpcReply::RangeStream(_) => {
                                let err = RpcResponse::Error {
                                    ok: false,
                                    error: "unexpected streaming response for upload".to_string(),
                                    code: Some("STREAM_UNEXPECTED".to_string()),
                                };
                                let _ = send_encrypted_frame(
                                    transport.as_mut(),
                                    &mut noise,
                                    frame_from_rpc_response(frame.message_id, &err),
                                ).await;
                                stream_ok = false;
                                break;
                            }
                        }

                        offset += chunk_len;
                        if is_final_chunk {
                            break;
                        }
                    }

                    anti_replay.clear_active_stream();

                    if !stream_ok {
                        return Err(format!("host upload stream aborted peer_id={}", peer_id));
                    }

                    let success = RpcResponse::success(serde_json::json!({"uploaded": offset}));
                    send_encrypted_frame(
                        transport.as_mut(),
                        &mut noise,
                        frame_from_rpc_response(frame.message_id, &success),
                    ).await?;
                    continue;
                }

                if is_download_stream_command(&req.command) {
                    let download_req = req.clone();
                    match run_host_adapter_task(
                        &mut adapter,
                        "mobile acceptor download stream",
                        move |adapter| adapter.handle_with_stream(&download_req, None),
                    )
                    .await? {
                        RpcReply::Stream(output) => {
                            send_encrypted_frame(
                                transport.as_mut(),
                                &mut noise,
                                frame_stream_meta_response(frame.message_id, &output.meta),
                            ).await?;

                            let mut reader = output.reader;
                            let mut current_buf = vec![0u8; STREAM_CHUNK_SIZE];
                            let mut n =
                                match read_stream_chunk(reader.as_mut(), &mut current_buf) {
                                    Ok(n) => n,
                                    Err(error) => {
                                        warn!(
                                            "mobile_acceptor: download stream read failed before first chunk peer_id={} command={}: {}",
                                            peer_id, req.command, error
                                        );
                                        let final_frame = frame_continuation(
                                            FrameType::RpcResponse,
                                            frame.message_id,
                                            Vec::new(),
                                            false,
                                        );
                                        send_encrypted_frame(
                                            transport.as_mut(),
                                            &mut noise,
                                            final_frame,
                                        )
                                        .await?;
                                        continue;
                                    }
                                };

                            while n > 0 {
                                let mut next_buf = vec![0u8; STREAM_CHUNK_SIZE];
                                let next_n =
                                    match read_stream_chunk(reader.as_mut(), &mut next_buf) {
                                        Ok(next_n) => next_n,
                                        Err(error) => {
                                            warn!(
                                                "mobile_acceptor: download stream read failed after chunk peer_id={} command={}: {}",
                                                peer_id, req.command, error
                                            );
                                            0
                                        }
                                    };
                                let has_more = next_n > 0;
                                let chunk = frame_continuation(
                                    FrameType::RpcResponse,
                                    frame.message_id,
                                    current_buf[..n].to_vec(),
                                    has_more,
                                );
                                send_encrypted_frame(transport.as_mut(), &mut noise, chunk).await?;
                                current_buf = next_buf;
                                n = next_n;
                            }
                        }
                        RpcReply::Json(resp) => {
                            send_encrypted_frame(
                                transport.as_mut(),
                                &mut noise,
                                frame_from_rpc_response(frame.message_id, &resp),
                            ).await?;
                        }
                        RpcReply::RangeStream(_) => {
                            let resp = RpcResponse::Error {
                                ok: false,
                                error: "Range streaming is not supported by mobile RPC".to_string(),
                                code: Some("STREAM_UNEXPECTED".to_string()),
                            };
                            send_encrypted_frame(
                                transport.as_mut(),
                                &mut noise,
                                frame_from_rpc_response(frame.message_id, &resp),
                            ).await?;
                        }
                    }
                    continue;
                }

                let generic_req = req.clone();
                let resp = run_host_adapter_task(
                    &mut adapter,
                    "mobile acceptor host rpc",
                    move |adapter| adapter.handle(&generic_req),
                )
                .await?;
                send_encrypted_frame(
                    transport.as_mut(),
                    &mut noise,
                    frame_from_rpc_response(frame.message_id, &resp),
                ).await?;
            }
        }
    }
}

fn host_heartbeat_enabled(transport_type: TransportType) -> bool {
    !matches!(transport_type, TransportType::UsbMobile)
}

#[cfg(test)]
mod tests {
    use super::*;
    use async_trait::async_trait;
    use chromvoid_protocol::{TransportError, TransportType, MAX_HANDSHAKE_MSG, NOISE_PARAMS_XX};
    use snow::Builder;

    struct FailingReader;

    impl std::io::Read for FailingReader {
        fn read(&mut self, _buf: &mut [u8]) -> std::io::Result<usize> {
            Err(std::io::Error::new(
                std::io::ErrorKind::Other,
                "mobile acceptor stream failed",
            ))
        }
    }

    #[test]
    fn read_stream_chunk_maps_io_error() {
        let mut reader = FailingReader;
        let mut buf = [0_u8; 8];

        let error = read_stream_chunk(&mut reader, &mut buf).expect_err("read must fail");

        assert_eq!(error, "stream read: mobile acceptor stream failed");
    }

    #[test]
    fn full_upload_stream_commands_are_accumulated_before_core_dispatch() {
        assert!(is_full_upload_stream_command("catalog:file:replace"));
        assert!(is_full_upload_stream_command("catalog:derivative:write"));
        assert!(!is_full_upload_stream_command("catalog:upload"));
        assert!(!is_full_upload_stream_command("catalog:secret:write"));
    }

    #[tokio::test]
    async fn host_rpc_loop_does_not_send_heartbeat_immediately_after_start() {
        let (client_noise, host_noise) = noise_pair();
        let sent_frames = Arc::new(Mutex::new(Vec::new()));
        let transport = RecordingIdleTransport::new(client_noise, sent_frames.clone());
        let (_shutdown_tx, shutdown_rx) = tokio::sync::oneshot::channel();
        let temp = tempfile::tempdir().expect("tempdir");
        let task = tokio::spawn(run_host_rpc_loop(
            None,
            Box::new(transport),
            host_noise,
            TransportType::WebRtcDataChannel,
            temp.path().to_path_buf(),
            "peer-heartbeat-test".to_string(),
            shutdown_rx,
        ));

        tokio::time::sleep(std::time::Duration::from_millis(50)).await;
        task.abort();

        assert!(
            sent_frames.lock().unwrap().is_empty(),
            "heartbeat must not be the first post-handshake host write"
        );
    }

    #[tokio::test]
    async fn host_rpc_loop_sends_periodic_heartbeat_for_network_transport() {
        let (client_noise, host_noise) = noise_pair();
        let sent_frames = Arc::new(Mutex::new(Vec::new()));
        let transport = RecordingIdleTransport::new(client_noise, sent_frames.clone());
        let (_shutdown_tx, shutdown_rx) = tokio::sync::oneshot::channel();
        let temp = tempfile::tempdir().expect("tempdir");
        let task = tokio::spawn(run_host_rpc_loop_with_heartbeat_interval(
            None,
            Box::new(transport),
            host_noise,
            TransportType::WebRtcDataChannel,
            temp.path().to_path_buf(),
            "peer-network-heartbeat-test".to_string(),
            shutdown_rx,
            std::time::Duration::from_millis(10),
        ));

        tokio::time::timeout(std::time::Duration::from_secs(1), async {
            loop {
                if sent_frames
                    .lock()
                    .unwrap()
                    .iter()
                    .any(|frame| frame.frame_type == FrameType::Heartbeat)
                {
                    break;
                }
                tokio::time::sleep(std::time::Duration::from_millis(10)).await;
            }
        })
        .await
        .expect("network heartbeat timeout");
        task.abort();

        assert!(
            sent_frames
                .lock()
                .unwrap()
                .iter()
                .any(|frame| frame.frame_type == FrameType::Heartbeat),
            "network host transports should keep their periodic heartbeat"
        );
    }

    #[tokio::test]
    async fn host_rpc_loop_suppresses_periodic_heartbeat_for_usb_mobile() {
        let (client_noise, host_noise) = noise_pair();
        let sent_frames = Arc::new(Mutex::new(Vec::new()));
        let transport = RecordingIdleTransport::new(client_noise, sent_frames.clone());
        let (_shutdown_tx, shutdown_rx) = tokio::sync::oneshot::channel();
        let temp = tempfile::tempdir().expect("tempdir");
        let task = tokio::spawn(run_host_rpc_loop_with_heartbeat_interval(
            None,
            Box::new(transport),
            host_noise,
            TransportType::UsbMobile,
            temp.path().to_path_buf(),
            "peer-usb-heartbeat-test".to_string(),
            shutdown_rx,
            std::time::Duration::from_millis(10),
        ));

        tokio::time::sleep(std::time::Duration::from_millis(50)).await;
        task.abort();

        assert!(
            sent_frames.lock().unwrap().is_empty(),
            "USB Mobile host side must stay in read mode instead of colliding with desktop heartbeat writes"
        );
    }

    #[tokio::test]
    async fn usb_host_rpc_loop_enters_recv_before_adapter_load() {
        let (client_noise, host_noise) = noise_pair();
        let (recv_started_tx, recv_started_rx) = tokio::sync::oneshot::channel();
        let transport = RecvSignalTransport::new(client_noise, recv_started_tx);
        let (_shutdown_tx, shutdown_rx) = tokio::sync::oneshot::channel();
        let temp = tempfile::tempdir().expect("tempdir");
        let broken_storage_root = temp.path().join("not-a-directory");
        std::fs::write(&broken_storage_root, b"file").expect("broken storage marker");
        let task = tokio::spawn(run_host_rpc_loop(
            None,
            Box::new(transport),
            host_noise,
            TransportType::UsbMobile,
            broken_storage_root,
            "peer-usb-lazy-adapter-test".to_string(),
            shutdown_rx,
        ));

        tokio::time::timeout(std::time::Duration::from_secs(1), recv_started_rx)
            .await
            .expect("USB host loop should enter recv before adapter load")
            .expect("recv signal should be delivered");
        task.abort();
    }

    struct RecordingIdleTransport {
        peer_noise: NoiseTransport,
        _inbound_tx: tokio::sync::mpsc::UnboundedSender<Vec<u8>>,
        inbound_rx: tokio::sync::mpsc::UnboundedReceiver<Vec<u8>>,
        sent_frames: Arc<Mutex<Vec<Frame>>>,
    }

    impl RecordingIdleTransport {
        fn new(peer_noise: NoiseTransport, sent_frames: Arc<Mutex<Vec<Frame>>>) -> Self {
            let (_inbound_tx, inbound_rx) = tokio::sync::mpsc::unbounded_channel();
            Self {
                peer_noise,
                _inbound_tx,
                inbound_rx,
                sent_frames,
            }
        }
    }

    #[async_trait]
    impl RemoteTransport for RecordingIdleTransport {
        async fn send(&mut self, data: &[u8]) -> Result<(), TransportError> {
            let decrypted = self
                .peer_noise
                .decrypt(data)
                .map_err(|e| TransportError::Io(format!("test decrypt: {e}")))?;
            let frame = Frame::decode(&decrypted)
                .map_err(|e| TransportError::Io(format!("test frame decode: {e}")))?;
            self.sent_frames.lock().unwrap().push(frame);
            Ok(())
        }

        async fn recv(&mut self) -> Result<Vec<u8>, TransportError> {
            self.inbound_rx.recv().await.ok_or(TransportError::Closed)
        }

        async fn close(&mut self) -> Result<(), TransportError> {
            Ok(())
        }

        fn transport_type(&self) -> TransportType {
            TransportType::UsbMobile
        }
    }

    struct RecvSignalTransport {
        peer_noise: NoiseTransport,
        recv_started: Option<tokio::sync::oneshot::Sender<()>>,
    }

    impl RecvSignalTransport {
        fn new(peer_noise: NoiseTransport, recv_started: tokio::sync::oneshot::Sender<()>) -> Self {
            Self {
                peer_noise,
                recv_started: Some(recv_started),
            }
        }
    }

    #[async_trait]
    impl RemoteTransport for RecvSignalTransport {
        async fn send(&mut self, data: &[u8]) -> Result<(), TransportError> {
            let _ = self
                .peer_noise
                .decrypt(data)
                .map_err(|e| TransportError::Io(format!("test decrypt: {e}")))?;
            Ok(())
        }

        async fn recv(&mut self) -> Result<Vec<u8>, TransportError> {
            if let Some(recv_started) = self.recv_started.take() {
                let _ = recv_started.send(());
            }
            std::future::pending::<Result<Vec<u8>, TransportError>>().await
        }

        async fn close(&mut self) -> Result<(), TransportError> {
            Ok(())
        }

        fn transport_type(&self) -> TransportType {
            TransportType::UsbMobile
        }
    }

    fn noise_pair() -> (NoiseTransport, NoiseTransport) {
        let params: snow::params::NoiseParams = NOISE_PARAMS_XX.parse().unwrap();
        let kp_i = Builder::new(params.clone()).generate_keypair().unwrap();
        let kp_r = Builder::new(params.clone()).generate_keypair().unwrap();

        let mut initiator = Builder::new(params.clone())
            .local_private_key(&kp_i.private)
            .unwrap()
            .build_initiator()
            .unwrap();
        let mut responder = Builder::new(params.clone())
            .local_private_key(&kp_r.private)
            .unwrap()
            .build_responder()
            .unwrap();

        let mut buf = vec![0u8; MAX_HANDSHAKE_MSG];

        let len = initiator.write_message(&[], &mut buf).unwrap();
        let msg1 = buf[..len].to_vec();

        responder.read_message(&msg1, &mut buf).unwrap();
        let len = responder.write_message(&[], &mut buf).unwrap();
        let msg2 = buf[..len].to_vec();

        initiator.read_message(&msg2, &mut buf).unwrap();
        let len = initiator.write_message(&[], &mut buf).unwrap();
        let msg3 = buf[..len].to_vec();

        responder.read_message(&msg3, &mut buf).unwrap();

        let remote_pub_i = initiator
            .get_remote_static()
            .expect("initiator remote key")
            .to_vec();
        let remote_pub_r = responder
            .get_remote_static()
            .expect("responder remote key")
            .to_vec();

        (
            NoiseTransport::new(initiator.into_transport_mode().unwrap(), remote_pub_i),
            NoiseTransport::new(responder.into_transport_mode().unwrap(), remote_pub_r),
        )
    }
}
