use std::sync::atomic::{AtomicU64, Ordering};
use std::sync::{Arc, Mutex};

use chromvoid_core::catalog::CatalogMediaInfo;
use chromvoid_core::media_inspector::MediaInspectionError;
use chromvoid_core::rpc::types::{RpcRequest, RpcResponse, PROTOCOL_VERSION};
use chromvoid_core::rpc::{
    inspect_catalog_media_snapshot, CatalogMediaInspectSnapshot, RpcInputStream, RpcReply,
    RpcStreamMeta,
};
use chromvoid_protocol::{
    frame_continuation, frame_from_heartbeat, Frame, FrameType, NoiseTransport, RemoteTransport,
    FLAG_HAS_CONTINUATION,
};
use tokio::task::JoinSet;
use tracing::{info, warn};

use crate::core_adapter::{CoreAdapter, LocalCoreAdapter};
use crate::remote_data_plane::{recv_decrypted_frame, send_encrypted_frame};
use crate::rpc_transport_protocol::{
    append_full_upload_stream_chunk, parse_upload_stream_metadata, upload_stream_chunk_data,
};

const HEARTBEAT_INTERVAL: std::time::Duration = std::time::Duration::from_secs(30);
const HOST_MEDIA_INSPECTION_SHUTDOWN_GRACE: std::time::Duration = std::time::Duration::from_secs(1);
const STREAM_CHUNK_SIZE: usize = 1024 * 1024;

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
    adapter: &SharedHostRpcAdapter,
    label: &'static str,
    task: F,
) -> Result<T, String>
where
    T: Send + 'static,
    F: FnOnce(&mut HostRpcAdapter) -> Result<T, String> + Send + 'static,
{
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

pub(super) async fn run_host_rpc_loop(
    adapter: Option<Arc<Mutex<Box<dyn CoreAdapter>>>>,
    mut transport: Box<dyn RemoteTransport>,
    mut noise: NoiseTransport,
    storage_root: std::path::PathBuf,
    peer_id: String,
    mut shutdown_rx: tokio::sync::oneshot::Receiver<()>,
) -> Result<(), String> {
    let adapter = Arc::new(Mutex::new(HostRpcAdapter::load(adapter, storage_root)?));
    let mut anti_replay = chromvoid_protocol::AntiReplay::new();
    let mut heartbeat_interval = tokio::time::interval(HEARTBEAT_INTERVAL);
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

            _ = heartbeat_interval.tick() => {
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
                                &adapter,
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
                                        &adapter,
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

            frame = recv_decrypted_frame(transport.as_mut(), &mut noise) => {
                let frame = frame?;
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
                        "perf:media_inspection event=cancel host=true reason=vault_lock epoch={} peer_id={}",
                        epoch,
                        peer_id
                    );
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
                        &adapter,
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
                            &adapter,
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
                            &adapter,
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
                        &adapter,
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
                    &adapter,
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

#[cfg(test)]
mod tests {
    use super::*;

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
}
