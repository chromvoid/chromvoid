use std::sync::atomic::{AtomicU64, Ordering};
use std::sync::{Arc, Mutex};

use std::collections::{HashMap, VecDeque};

use chromvoid_core::media_inspector::MediaInspectionError;
use chromvoid_core::rpc::types::{RpcRequest, RpcResponse, PROTOCOL_VERSION};
use chromvoid_core::rpc::{inspect_catalog_media_snapshot, RpcReply};
#[cfg(test)]
use chromvoid_core::rpc::{RpcInputStream, RpcRangeStreamMeta, RpcStreamMeta};
#[cfg(test)]
use chromvoid_protocol::{frame_continuation, FLAG_HAS_CONTINUATION};
use chromvoid_protocol::{
    frame_from_heartbeat, Frame, FrameType, NoiseTransport, RemoteTransport, TransportType,
};
use tokio::task::JoinSet;
use tracing::{info, warn};

use super::state::UsbSessionApprovalDecision;
use super::MobileAcceptorRuntimeState;
use crate::core_adapter::CoreAdapter;
use crate::mobile_usb::{mobile_usb_hex_encode, MobileUsbPairingHello};
#[cfg(test)]
use crate::remote_data_plane::send_encrypted_frame;
use crate::remote_data_plane::{send_encrypted_frame_typed, RemoteIoFailure, RemoteIoResult};
use crate::remote_stream_lifecycle::{StreamLifecycleDirection, StreamLifecycleTracker};
#[cfg(test)]
use crate::rpc_transport_protocol::read_stream_chunk_supervised;
#[cfg(test)]
use crate::rpc_transport_protocol::USB_MOBILE_STREAM_CHUNK_SIZE;
use crate::rpc_transport_protocol::{parse_stream_control_frame, parse_upload_stream_metadata};
use crate::rpc_transport_protocol::{RemoteStreamControl, TransportPolicy};

const HEARTBEAT_INTERVAL: std::time::Duration = std::time::Duration::from_secs(30);
const HOST_LOCK_NOTIFICATION_TIMEOUT: std::time::Duration = std::time::Duration::from_millis(250);
const MOBILE_USB_HOST_UNLOCK_CONFIRMED: &str = "mobile_usb:host_unlock_confirmed";
const MOBILE_USB_HOST_LOCKED: &str = "mobile_usb:host_locked";
const MOBILE_USB_SESSION_APPROVAL_EXPIRED: &str = "mobile_usb:session_approval_expired";
const MOBILE_USB_SESSION_DISCONNECT: &str = "mobile_usb:session_disconnect";
const CATALOG_DERIVATIVE_ENSURE: &str = "catalog:derivative:ensure";
const RECENT_DERIVATIVE_ENSURE_IDS_LIMIT: usize = 64;

mod adapter;
mod derivative_ensure;
mod incoming_upload;
mod media_inspection;
mod outgoing_streams;

use adapter::{run_host_adapter_task, LazyHostRpcAdapter};
use derivative_ensure::{
    shutdown_host_derivative_jobs, spawn_host_derivative_ensure, HostDerivativeEnsureOutcome,
    HostDerivativeSessionCancellation,
};
use incoming_upload::{
    handle_host_upload_continuation, HostIncomingUpload, HostIncomingUploadMode,
};
use media_inspection::{
    media_inspection_success, shutdown_host_media_commit_worker, shutdown_host_media_jobs,
    spawn_host_media_commit_worker, HostMediaCommitJob, HostMediaInspectionResult,
};
use outgoing_streams::{
    frame_range_stream_meta_response, frame_stream_meta_response,
    remove_host_outgoing_stream_order, request_advertises_stream_control,
    send_next_host_outgoing_stream_chunk, start_host_outgoing_stream, HostOutgoingStream,
};

enum HostLoopInput {
    Frame(Frame),
    UsbPairingHello,
}

pub(super) struct UsbHostSessionApproval {
    pub(super) runtime: Arc<MobileAcceptorRuntimeState>,
    pub(super) attempt_id: String,
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

fn frame_from_push_request(message_id: u64, req: &RpcRequest) -> RemoteIoResult<Frame> {
    let payload = serde_json::to_vec(req)
        .map_err(|error| RemoteIoFailure::data_plane_error(format!("encode push: {error}")))?;
    Ok(Frame {
        frame_type: FrameType::RpcRequest,
        message_id,
        flags: 0,
        payload,
    })
}

async fn send_mobile_usb_host_unlock_confirmed(
    transport: &mut dyn RemoteTransport,
    noise: &mut NoiseTransport,
    server_msg_id: &mut u64,
) -> RemoteIoResult<()> {
    let request = RpcRequest::new(MOBILE_USB_HOST_UNLOCK_CONFIRMED, serde_json::json!({}));
    let frame = frame_from_push_request(*server_msg_id, &request)?;
    *server_msg_id = server_msg_id.wrapping_add(1).max(1);
    send_encrypted_frame_typed(transport, noise, frame).await
}

async fn send_mobile_usb_host_locked(
    transport: &mut dyn RemoteTransport,
    noise: &mut NoiseTransport,
    server_msg_id: &mut u64,
) -> RemoteIoResult<()> {
    let request = RpcRequest::new(MOBILE_USB_HOST_LOCKED, serde_json::json!({}));
    let frame = frame_from_push_request(*server_msg_id, &request)?;
    *server_msg_id = server_msg_id.wrapping_add(1).max(1);
    send_encrypted_frame_typed(transport, noise, frame).await
}

async fn send_mobile_usb_session_approval_expired(
    transport: &mut dyn RemoteTransport,
    noise: &mut NoiseTransport,
    server_msg_id: &mut u64,
) -> RemoteIoResult<()> {
    let request = RpcRequest::new(MOBILE_USB_SESSION_APPROVAL_EXPIRED, serde_json::json!({}));
    let frame = frame_from_push_request(*server_msg_id, &request)?;
    *server_msg_id = server_msg_id.wrapping_add(1).max(1);
    send_encrypted_frame_typed(transport, noise, frame).await
}

async fn host_vault_is_unlocked(adapter: &mut LazyHostRpcAdapter) -> RemoteIoResult<bool> {
    let response = run_host_adapter_task(
        adapter,
        "mobile acceptor usb approval vault status",
        |adapter| adapter.handle(&RpcRequest::new("vault:status", serde_json::json!({}))),
    )
    .await
    .map_err(RemoteIoFailure::data_plane_error)?;
    Ok(response
        .result()
        .and_then(|result| result.get("is_unlocked"))
        .and_then(|value| value.as_bool())
        .unwrap_or(false))
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
            | "catalog:downloadRange"
            | "catalog:secret:read"
            | "catalog:derivative:read"
            | CATALOG_DERIVATIVE_ENSURE
            | "vault:export:download"
    )
}

fn remember_recent_derivative_ensure_id(recent: &mut VecDeque<u64>, message_id: u64) {
    if recent.len() >= RECENT_DERIVATIVE_ENSURE_IDS_LIMIT {
        recent.pop_front();
    }
    recent.push_back(message_id);
}

fn is_usb_pre_approval_command(command: &str) -> bool {
    matches!(command, "core:capabilities" | "vault:status")
}

async fn recv_host_loop_input(
    transport: &mut dyn RemoteTransport,
    noise: &mut NoiseTransport,
    transport_type: TransportType,
    storage_root: &std::path::Path,
    peer_id: &str,
) -> RemoteIoResult<HostLoopInput> {
    let bytes = transport
        .recv()
        .await
        .map_err(|error| RemoteIoFailure::from_transport_error("recv", error))?;
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
            return Err(RemoteIoFailure::decrypt_failure(format!(
                "decrypt: {error}"
            )));
        }
    };

    match Frame::decode(&decrypted) {
        Ok(frame) => {
            log_host_usb_frame("recv", transport_type, &frame, encrypted_len);
            Ok(HostLoopInput::Frame(frame))
        }
        Err(frame_error) if matches!(transport_type, TransportType::UsbMobile) => {
            let hello = serde_json::from_slice::<MobileUsbPairingHello>(&decrypted)
                .map_err(|_| RemoteIoFailure::protocol_error(format!("decode: {frame_error}")))?;
            handle_usb_pairing_hello(transport, noise, storage_root, peer_id, hello).await?;
            Ok(HostLoopInput::UsbPairingHello)
        }
        Err(frame_error) => Err(RemoteIoFailure::protocol_error(format!(
            "decode: {frame_error}"
        ))),
    }
}

async fn handle_usb_pairing_hello(
    transport: &mut dyn RemoteTransport,
    noise: &mut NoiseTransport,
    storage_root: &std::path::Path,
    peer_id: &str,
    hello: MobileUsbPairingHello,
) -> RemoteIoResult<()> {
    let remote_pubkey = noise.remote_pubkey().to_vec();
    let remote_pubkey_hex = mobile_usb_hex_encode(&remote_pubkey);
    if hello.peer_pubkey_hex != remote_pubkey_hex {
        return Err(RemoteIoFailure::protocol_error(
            "USB pairing hello pubkey mismatch in host RPC loop",
        ));
    }
    let _ = (transport, noise, storage_root, peer_id, hello);
    Err(RemoteIoFailure::protocol_error(
        "USB pairing approval must complete before host RPC loop starts",
    ))
}

fn log_host_usb_frame(
    direction: &'static str,
    transport_type: TransportType,
    frame: &Frame,
    encrypted_len: usize,
) {
    if matches!(transport_type, TransportType::UsbMobile) {
        tracing::debug!(
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

#[cfg(test)]
pub(super) async fn run_host_rpc_loop(
    adapter: Option<Arc<Mutex<Box<dyn CoreAdapter>>>>,
    transport: Box<dyn RemoteTransport>,
    noise: NoiseTransport,
    transport_type: TransportType,
    storage_root: std::path::PathBuf,
    peer_id: String,
    shutdown_rx: tokio::sync::oneshot::Receiver<()>,
    usb_session_approval: Option<UsbHostSessionApproval>,
) -> RemoteIoResult<()> {
    run_host_rpc_loop_inner(
        adapter,
        transport,
        noise,
        transport_type,
        storage_root,
        peer_id,
        shutdown_rx,
        HEARTBEAT_INTERVAL,
        usb_session_approval,
        None,
        None,
    )
    .await
}

pub(super) async fn run_host_rpc_loop_with_shutdown_source(
    adapter: Option<Arc<Mutex<Box<dyn CoreAdapter>>>>,
    transport: Box<dyn RemoteTransport>,
    noise: NoiseTransport,
    transport_type: TransportType,
    storage_root: std::path::PathBuf,
    peer_id: String,
    shutdown_rx: tokio::sync::oneshot::Receiver<()>,
    usb_session_approval: Option<UsbHostSessionApproval>,
    derivative_ensure_services: Option<Arc<crate::commands::catalog::HostDerivativeEnsureServices>>,
    shutdown_source: Arc<Mutex<Option<super::direct_transport::HostRpcShutdownSource>>>,
) -> RemoteIoResult<()> {
    run_host_rpc_loop_inner(
        adapter,
        transport,
        noise,
        transport_type,
        storage_root,
        peer_id,
        shutdown_rx,
        HEARTBEAT_INTERVAL,
        usb_session_approval,
        derivative_ensure_services,
        Some(shutdown_source),
    )
    .await
}

#[cfg(test)]
async fn run_host_rpc_loop_with_heartbeat_interval(
    adapter: Option<Arc<Mutex<Box<dyn CoreAdapter>>>>,
    transport: Box<dyn RemoteTransport>,
    noise: NoiseTransport,
    transport_type: TransportType,
    storage_root: std::path::PathBuf,
    peer_id: String,
    shutdown_rx: tokio::sync::oneshot::Receiver<()>,
    heartbeat_interval_duration: std::time::Duration,
    usb_session_approval: Option<UsbHostSessionApproval>,
) -> RemoteIoResult<()> {
    run_host_rpc_loop_inner(
        adapter,
        transport,
        noise,
        transport_type,
        storage_root,
        peer_id,
        shutdown_rx,
        heartbeat_interval_duration,
        usb_session_approval,
        None,
        None,
    )
    .await
}

async fn run_host_rpc_loop_inner(
    adapter: Option<Arc<Mutex<Box<dyn CoreAdapter>>>>,
    mut transport: Box<dyn RemoteTransport>,
    mut noise: NoiseTransport,
    transport_type: TransportType,
    storage_root: std::path::PathBuf,
    peer_id: String,
    mut shutdown_rx: tokio::sync::oneshot::Receiver<()>,
    heartbeat_interval_duration: std::time::Duration,
    usb_session_approval: Option<UsbHostSessionApproval>,
    derivative_ensure_services: Option<Arc<crate::commands::catalog::HostDerivativeEnsureServices>>,
    shutdown_source: Option<Arc<Mutex<Option<super::direct_transport::HostRpcShutdownSource>>>>,
) -> RemoteIoResult<()> {
    let pairing_storage_root = storage_root.clone();
    let mut adapter = LazyHostRpcAdapter::new(adapter, storage_root);
    let mut anti_replay = chromvoid_protocol::AntiReplay::new();
    let policy = TransportPolicy::for_transport(transport_type);
    let host_heartbeat_enabled = policy.heartbeat_enabled;
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
    let usb_session_approval_context = usb_session_approval
        .as_ref()
        .map(|approval| (approval.runtime.clone(), approval.attempt_id.clone()));
    let mut vault_unlock_rx = usb_session_approval
        .as_ref()
        .map(|approval| approval.runtime.subscribe_vault_unlocks());
    let mut usb_session_approval_task = usb_session_approval.map(|approval| {
        tokio::spawn(async move {
            let decision = approval
                .runtime
                .wait_usb_session_approval(&approval.attempt_id)
                .await;
            let _ = approval
                .runtime
                .finish_usb_session_approval(&approval.attempt_id);
            (approval.attempt_id, decision)
        })
    });
    let mut usb_session_approved = usb_session_approval_task.is_none();
    let mut usb_host_unlock_confirmed = false;
    let media_inspection_epoch = Arc::new(AtomicU64::new(0));
    let (media_job_tx, mut media_job_rx) =
        tokio::sync::mpsc::unbounded_channel::<HostMediaInspectionResult>();
    let mut media_jobs = JoinSet::new();
    let (derivative_job_tx, mut derivative_job_rx) =
        tokio::sync::mpsc::unbounded_channel::<HostDerivativeEnsureOutcome>();
    let mut derivative_jobs = JoinSet::new();
    // Keep this guard declared after the JoinSet so unwinding invalidates
    // native blocking jobs before the async wrappers are aborted.
    let mut derivative_session_cancellation = HostDerivativeSessionCancellation::new();
    let mut derivative_job_cancellations: HashMap<u64, Arc<AtomicU64>> = HashMap::new();
    let mut recent_derivative_ensure_ids = VecDeque::new();
    // Media inspection commits run on a dedicated background worker so the
    // loop never awaits the adapter mutex or `save()` inline for media jobs;
    // completed commits come back through `media_commit_rx` and only cost the
    // loop one frame send. On error exits (`?`) the worker is dropped with the
    // sender and drains on its own; clean exits go through
    // `shutdown_host_media_commit_worker`.
    let (media_commit_tx, mut media_commit_rx, media_commit_worker) =
        spawn_host_media_commit_worker(peer_id.clone(), media_inspection_epoch.clone());
    let mut active_outgoing_streams: HashMap<u64, HostOutgoingStream> = HashMap::new();
    let mut active_outgoing_order: VecDeque<u64> = VecDeque::new();
    let mut active_upload: Option<HostIncomingUpload> = None;

    loop {
        tokio::select! {
            biased;

            _ = &mut shutdown_rx => {
                let source = shutdown_source.as_ref().and_then(|source| {
                    source
                        .lock()
                        .expect("host rpc shutdown source lock")
                        .as_ref()
                        .copied()
                });
                if transport_type == TransportType::UsbMobile
                    && matches!(
                        source,
                        Some(super::direct_transport::HostRpcShutdownSource::ExternalStop(
                            super::direct_transport::DirectTransportStopReason::VaultLocked
                        ))
                    )
                {
                    match tokio::time::timeout(
                        HOST_LOCK_NOTIFICATION_TIMEOUT,
                        send_mobile_usb_host_locked(
                            transport.as_mut(),
                            &mut noise,
                            &mut server_msg_id,
                        ),
                    )
                    .await
                    {
                        Ok(Ok(())) => info!(
                            peer_id,
                            "mobile_acceptor: sent authenticated USB host lock notification"
                        ),
                        Ok(Err(error)) => warn!(
                            peer_id,
                            error = %error,
                            "mobile_acceptor: failed to send USB host lock notification"
                        ),
                        Err(_) => warn!(
                            peer_id,
                            timeout_ms = HOST_LOCK_NOTIFICATION_TIMEOUT.as_millis(),
                            "mobile_acceptor: USB host lock notification timed out"
                        ),
                    }
                }
                info!(?source, "mobile_acceptor: host rpc loop shutdown peer_id={}", peer_id);
                derivative_session_cancellation.cancel();
                shutdown_host_derivative_jobs(&peer_id, &mut derivative_jobs).await;
                media_inspection_epoch.fetch_add(1, Ordering::SeqCst);
                shutdown_host_media_jobs(&peer_id, &mut media_jobs).await;
                shutdown_host_media_commit_worker(&peer_id, media_commit_tx, media_commit_worker)
                    .await;
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

            join_result = derivative_jobs.join_next(), if !derivative_jobs.is_empty() => {
                if let Some(Err(error)) = join_result {
                    warn!(
                        peer_id,
                        error = %error,
                        "mobile_acceptor: derivative ensure task join error"
                    );
                }
            }

            _ = heartbeat_interval.tick(), if host_heartbeat_enabled => {
                let heartbeat = frame_from_heartbeat(server_msg_id, PROTOCOL_VERSION);
                server_msg_id = server_msg_id.wrapping_add(1).max(1);
                send_encrypted_frame_typed(transport.as_mut(), &mut noise, heartbeat).await?;
            }

            approval_result = async {
                usb_session_approval_task
                    .as_mut()
                    .expect("USB session approval task")
                    .await
            }, if usb_session_approval_task.is_some() => {
                usb_session_approval_task = None;
                let (attempt_id, decision) = approval_result
                    .map_err(|error| RemoteIoFailure::data_plane_error(format!(
                        "USB session approval task failed: {error}"
                    )))?;
                match decision.map_err(RemoteIoFailure::data_plane_error)? {
                    UsbSessionApprovalDecision::Approved => {
                        usb_session_approved = true;
                        if host_vault_is_unlocked(&mut adapter).await? {
                            send_mobile_usb_host_unlock_confirmed(
                                transport.as_mut(),
                                &mut noise,
                                &mut server_msg_id,
                            )
                            .await?;
                            usb_host_unlock_confirmed = true;
                            info!(
                                peer_id,
                                attempt_id,
                                "mobile_acceptor: USB session approval sent host unlock confirmation"
                            );
                        } else {
                            info!(
                                peer_id,
                                attempt_id,
                                "mobile_acceptor: USB session approved while host vault is locked; waiting for vault unlock"
                            );
                        }
                    }
                    UsbSessionApprovalDecision::Rejected => {
                        let _ = transport.close().await;
                        return Err(RemoteIoFailure::data_plane_error(
                            "USB session approval rejected",
                        ));
                    }
                    UsbSessionApprovalDecision::Expired => {
                        super::notify_usb_session_approval_resolved(&attempt_id, "expired");
                        match tokio::time::timeout(
                            HOST_LOCK_NOTIFICATION_TIMEOUT,
                            send_mobile_usb_session_approval_expired(
                                transport.as_mut(),
                                &mut noise,
                                &mut server_msg_id,
                            ),
                        )
                        .await
                        {
                            Ok(Ok(())) => info!(
                                peer_id,
                                attempt_id = %crate::mobile_usb::observability::redacted_identifier(Some(&attempt_id)),
                                "mobile_acceptor: sent USB session approval expiry notification"
                            ),
                            Ok(Err(error)) => warn!(
                                peer_id,
                                attempt_id = %crate::mobile_usb::observability::redacted_identifier(Some(&attempt_id)),
                                error = %error,
                                "mobile_acceptor: failed to send USB session approval expiry notification"
                            ),
                            Err(_) => warn!(
                                peer_id,
                                attempt_id = %crate::mobile_usb::observability::redacted_identifier(Some(&attempt_id)),
                                "mobile_acceptor: USB session approval expiry notification timed out"
                            ),
                        }
                        let _ = transport.close().await;
                        return Err(RemoteIoFailure::data_plane_error(
                            "USB session approval expired",
                        ));
                    }
                    UsbSessionApprovalDecision::Missing => {
                        super::notify_usb_session_approval_resolved(&attempt_id, "not_active");
                        let _ = transport.close().await;
                        return Err(RemoteIoFailure::data_plane_error(
                            "USB session approval disappeared",
                        ));
                    }
                }
            }

            unlock_changed = async {
                vault_unlock_rx
                    .as_mut()
                    .expect("USB vault unlock receiver")
                    .changed()
                    .await
            }, if vault_unlock_rx.is_some() && usb_session_approved && !usb_host_unlock_confirmed => {
                if unlock_changed.is_err() {
                    vault_unlock_rx = None;
                    continue;
                }
                if host_vault_is_unlocked(&mut adapter).await? {
                    send_mobile_usb_host_unlock_confirmed(
                        transport.as_mut(),
                        &mut noise,
                        &mut server_msg_id,
                    )
                    .await?;
                    usb_host_unlock_confirmed = true;
                    info!(
                        peer_id,
                        "mobile_acceptor: USB host unlock confirmation sent after local vault unlock"
                    );
                }
            }

            Some(job) = media_job_rx.recv() => {
                let message_id = job.message_id;
                let current_epoch = media_inspection_epoch.load(Ordering::SeqCst);
                let inline_response = if job.epoch != current_epoch {
                    info!(
                        "perf:media_inspection event=stale_discard host=true node_id={} job_epoch={} current_epoch={} read_ms={}",
                        job.snapshot.node_id,
                        job.epoch,
                        current_epoch,
                        job.read_ms
                    );
                    Some(media_inspection_success(
                        &job.snapshot,
                        job.snapshot.media_info.clone(),
                        job.snapshot.media_inspected_revision,
                        true,
                    ))
                } else {
                    match job.result {
                        Ok(media_info) => {
                            let media_inspected_revision =
                                if media_info.is_some() || job.snapshot.inspection_candidate {
                                    job.snapshot.source_revision
                                } else {
                                    0
                                };
                            // The snapshot step already resolved the lazy
                            // adapter, so this await returns a cached handle
                            // and never blocks on adapter work. The commit
                            // itself (adapter mutex + save) runs on the
                            // background worker; its response frame arrives
                            // through `media_commit_rx`.
                            let adapter_handle = adapter
                                .shared()
                                .await
                                .map_err(RemoteIoFailure::data_plane_error)?;
                            if media_commit_tx
                                .send(HostMediaCommitJob {
                                    adapter: adapter_handle,
                                    message_id,
                                    epoch: job.epoch,
                                    read_ms: job.read_ms,
                                    snapshot: job.snapshot,
                                    media_info,
                                    media_inspected_revision,
                                })
                                .is_err()
                            {
                                return Err(RemoteIoFailure::data_plane_error(
                                    "media inspect commit worker stopped unexpectedly",
                                ));
                            }
                            None
                        }
                        Err(MediaInspectionError::Cancelled) => {
                            info!(
                                "perf:media_inspection event=cancelled host=true node_id={} read_ms={} epoch={}",
                                job.snapshot.node_id,
                                job.read_ms,
                                job.epoch
                            );
                            Some(media_inspection_success(
                                &job.snapshot,
                                job.snapshot.media_info.clone(),
                                job.snapshot.media_inspected_revision,
                                true,
                            ))
                        }
                        Err(error) => {
                            warn!(
                                "perf:media_inspection event=read_error host=true node_id={} read_ms={} error={:?}",
                                job.snapshot.node_id,
                                job.read_ms,
                                error
                            );
                            Some(media_inspection_success(&job.snapshot, None, 0, false))
                        }
                    }
                };
                if let Some(response) = inline_response {
                    send_encrypted_frame_typed(
                        transport.as_mut(),
                        &mut noise,
                        frame_from_rpc_response(message_id, &response),
                    ).await?;
                }
            }

            Some(outcome) = derivative_job_rx.recv() => {
                if derivative_job_cancellations
                    .remove(&outcome.message_id)
                    .is_none()
                {
                    tracing::debug!(
                        peer_id,
                        message_id = outcome.message_id,
                        "mobile_acceptor: dropped cancelled derivative ensure outcome"
                    );
                    continue;
                }
                remember_recent_derivative_ensure_id(
                    &mut recent_derivative_ensure_ids,
                    outcome.message_id,
                );
                match outcome.result {
                    Ok(stream) => {
                        if let Err((error, code)) = outcome.cancellation.check() {
                            let response = RpcResponse::Error {
                                ok: false,
                                error,
                                code,
                            };
                            send_encrypted_frame_typed(
                                transport.as_mut(),
                                &mut noise,
                                frame_from_rpc_response(outcome.message_id, &response),
                            )
                            .await?;
                            continue;
                        }
                        let output_bytes = stream.bytes.len();
                        let meta_frame =
                            frame_stream_meta_response(outcome.message_id, &stream.meta);
                        start_host_outgoing_stream(
                            transport.as_mut(),
                            &mut noise,
                            outcome.message_id,
                            &peer_id,
                            CATALOG_DERIVATIVE_ENSURE,
                            outcome.peer_stream_control,
                            meta_frame,
                            Box::new(std::io::Cursor::new(stream.bytes)),
                            &mut active_outgoing_streams,
                            &mut active_outgoing_order,
                        )
                        .await?;
                        info!(
                            peer_id,
                            message_id = outcome.message_id,
                            node_id = outcome.request.node_id,
                            source_revision = outcome.request.source_version,
                            tier = outcome.request.tier.label(),
                            storage_version = outcome.request.version,
                            output_bytes,
                            duration_ms = outcome.duration_ms,
                            transport_type = ?transport_type,
                            "mobile_acceptor: derivative ensure stream ready"
                        );
                    }
                    Err((error, code)) => {
                        warn!(
                            peer_id,
                            message_id = outcome.message_id,
                            node_id = outcome.request.node_id,
                            source_revision = outcome.request.source_version,
                            tier = outcome.request.tier.label(),
                            storage_version = outcome.request.version,
                            code = ?code,
                            duration_ms = outcome.duration_ms,
                            transport_type = ?transport_type,
                            "mobile_acceptor: derivative ensure failed"
                        );
                        let response = RpcResponse::Error {
                            ok: false,
                            error,
                            code,
                        };
                        send_encrypted_frame_typed(
                            transport.as_mut(),
                            &mut noise,
                            frame_from_rpc_response(outcome.message_id, &response),
                        )
                        .await?;
                    }
                }
            }

            Some(outcome) = media_commit_rx.recv() => {
                let response = outcome
                    .response
                    .map_err(RemoteIoFailure::data_plane_error)?;
                send_encrypted_frame_typed(
                    transport.as_mut(),
                    &mut noise,
                    frame_from_rpc_response(outcome.message_id, &response),
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
                    FrameType::Error => {
                        if let Some(control) = parse_stream_control_frame(&frame) {
                            if let RemoteStreamControl::Cancelled { message } = &control {
                                if let Some(mut stream) =
                                    active_outgoing_streams.remove(&frame.message_id)
                                {
                                    remove_host_outgoing_stream_order(
                                        &mut active_outgoing_order,
                                        frame.message_id,
                                    );
                                    let snapshot = stream.lifecycle.cancel();
                                    info!(
                                        "perf:remote_stream event=download_cancel direction=send host=true peer_id={} command={} message_id={} chunks={} bytes={} duration_ms={} active_streams={} reason={}",
                                        stream.peer_id,
                                        snapshot.command,
                                        frame.message_id,
                                        snapshot.chunks,
                                        snapshot.bytes,
                                        snapshot.duration_ms,
                                        active_outgoing_streams.len(),
                                        message
                                    );
                                    continue;
                                }
                                if let Some(epoch) =
                                    derivative_job_cancellations.remove(&frame.message_id)
                                {
                                    epoch.fetch_add(1, Ordering::SeqCst);
                                    remember_recent_derivative_ensure_id(
                                        &mut recent_derivative_ensure_ids,
                                        frame.message_id,
                                    );
                                    info!(
                                        peer_id,
                                        message_id = frame.message_id,
                                        reason = message,
                                        "mobile_acceptor: derivative ensure cancelled before response metadata"
                                    );
                                    continue;
                                }
                                if let Some(position) = recent_derivative_ensure_ids
                                    .iter()
                                    .position(|message_id| *message_id == frame.message_id)
                                {
                                    recent_derivative_ensure_ids.remove(position);
                                    tracing::debug!(
                                        peer_id,
                                        message_id = frame.message_id,
                                        "mobile_acceptor: ignored late derivative ensure cancellation"
                                    );
                                    continue;
                                }
                            }
                            // The desktop aborts an outgoing upload with a
                            // stream-control frame when its local reader
                            // fails; discard the partial upload but keep the
                            // session alive.
                            if active_upload
                                .as_ref()
                                .is_some_and(|upload| upload.message_id == frame.message_id)
                            {
                                let mut upload = active_upload
                                    .take()
                                    .expect("active upload exists for stream-control abort");
                                anti_replay.clear_active_stream();
                                let snapshot = upload.lifecycle.cancel();
                                warn!(
                                    "perf:remote_stream event=upload_abort_remote direction=recv host=true peer_id={} command={} message_id={} chunks={} bytes={} duration_ms={} reason={}",
                                    peer_id,
                                    snapshot.command,
                                    frame.message_id,
                                    snapshot.chunks,
                                    snapshot.bytes,
                                    snapshot.duration_ms,
                                    control.message()
                                );
                                continue;
                            }
                        }
                        return Err(RemoteIoFailure::protocol_error(format!(
                            "peer sent error frame message_id={}",
                            frame.message_id
                        )));
                    }
                    FrameType::RpcResponse => continue,
                    FrameType::RpcRequest => {}
                }

                if active_upload
                    .as_ref()
                    .is_some_and(|upload| upload.message_id == frame.message_id)
                {
                    anti_replay
                        .check(frame.message_id)
                        .map_err(|e| RemoteIoFailure::protocol_error(format!("anti_replay: {e}")))?;
                    let mut upload = active_upload
                        .take()
                        .expect("active upload exists for continuation");
                    let completed = handle_host_upload_continuation(
                        &mut adapter,
                        transport.as_mut(),
                        &mut noise,
                        &peer_id,
                        frame,
                        &mut upload,
                    )
                    .await?;
                    if completed {
                        anti_replay.clear_active_stream();
                    } else {
                        active_upload = Some(upload);
                    }
                    continue;
                }

                anti_replay
                    .check(frame.message_id)
                    .map_err(|e| RemoteIoFailure::protocol_error(format!("anti_replay: {e}")))?;

                let mut req: RpcRequest = serde_json::from_slice(&frame.payload)
                    .map_err(|e| RemoteIoFailure::protocol_error(format!("request parse: {e}")))?;

                if req.command == MOBILE_USB_SESSION_DISCONNECT {
                    if transport_type != TransportType::UsbMobile {
                        let response = RpcResponse::Error {
                            ok: false,
                            error: "mobile USB session disconnect is only available on USB transport"
                                .to_string(),
                            code: Some("REMOTE_CORE_UNSUPPORTED".to_string()),
                        };
                        send_encrypted_frame_typed(
                            transport.as_mut(),
                            &mut noise,
                            frame_from_rpc_response(frame.message_id, &response),
                        )
                        .await?;
                        continue;
                    }

                    if let Some(task) = usb_session_approval_task.take() {
                        task.abort();
                    }
                    if let Some((runtime, attempt_id)) = usb_session_approval_context.as_ref() {
                        if let Err(error) = runtime.finish_usb_session_approval(attempt_id) {
                            warn!(
                                peer_id,
                                error,
                                "mobile_acceptor: failed to clear USB session approval during disconnect"
                            );
                        }
                    }

                    derivative_session_cancellation.cancel();
                    shutdown_host_derivative_jobs(&peer_id, &mut derivative_jobs).await;
                    media_inspection_epoch.fetch_add(1, Ordering::SeqCst);
                    shutdown_host_media_jobs(&peer_id, &mut media_jobs).await;
                    shutdown_host_media_commit_worker(
                        &peer_id,
                        media_commit_tx,
                        media_commit_worker,
                    )
                    .await;
                    let response = RpcResponse::success(serde_json::Value::Null);
                    send_encrypted_frame_typed(
                        transport.as_mut(),
                        &mut noise,
                        frame_from_rpc_response(frame.message_id, &response),
                    )
                    .await?;
                    if let Some(shutdown_source) = shutdown_source.as_ref() {
                        super::direct_transport::record_shutdown_source_first(
                            shutdown_source,
                            super::direct_transport::HostRpcShutdownSource::RemoteRequest(
                                super::direct_transport::DirectTransportStopReason::ClientDisconnected,
                            ),
                        );
                    }
                    info!(
                        peer_id,
                        "mobile_acceptor: acknowledged graceful mobile USB session disconnect"
                    );
                    let _ = transport.close().await;
                    return Ok(());
                }

                if req.command.starts_with("env_runtime:") {
                    warn!(
                        peer_id,
                        command = %req.command,
                        "mobile_acceptor: local-only Env Runtime RPC rejected"
                    );
                    let response = RpcResponse::Error {
                        ok: false,
                        error: "Env Runtime is available only through the local desktop UI"
                            .to_string(),
                        code: Some("REMOTE_CORE_UNSUPPORTED".to_string()),
                    };
                    send_encrypted_frame_typed(
                        transport.as_mut(),
                        &mut noise,
                        frame_from_rpc_response(frame.message_id, &response),
                    )
                    .await?;
                    continue;
                }

                if transport_type == TransportType::UsbMobile
                    && !usb_session_approved
                    && !is_usb_pre_approval_command(&req.command)
                {
                    warn!(
                        peer_id,
                        command = %req.command,
                        "mobile_acceptor: USB pre-approval RPC rejected"
                    );
                    let response = RpcResponse::Error {
                        ok: false,
                        error: format!(
                            "USB session approval required before command {}",
                            req.command
                        ),
                        code: Some("ERR_USB_MOBILE_SESSION_APPROVAL_REQUIRED".to_string()),
                    };
                    send_encrypted_frame_typed(
                        transport.as_mut(),
                        &mut noise,
                        frame_from_rpc_response(frame.message_id, &response),
                    )
                    .await?;
                    continue;
                }

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
                    send_encrypted_frame_typed(
                        transport.as_mut(),
                        &mut noise,
                        frame_from_rpc_response(frame.message_id, &response),
                    ).await?;
                    continue;
                }

                if req.command == "vault:lock" {
                    derivative_session_cancellation.cancel();
                    shutdown_host_derivative_jobs(&peer_id, &mut derivative_jobs).await;
                    let epoch = media_inspection_epoch
                        .fetch_add(1, Ordering::SeqCst)
                        .saturating_add(1);
                    info!(
                        "perf:media_inspection event=cancel host=true reason=remote_vault_lock_disconnect epoch={} peer_id={}",
                        epoch,
                        peer_id
                    );
                    shutdown_host_media_jobs(&peer_id, &mut media_jobs).await;
                    shutdown_host_media_commit_worker(
                        &peer_id,
                        media_commit_tx,
                        media_commit_worker,
                    )
                    .await;
                    let response = RpcResponse::success(serde_json::Value::Null);
                    send_encrypted_frame_typed(
                        transport.as_mut(),
                        &mut noise,
                        frame_from_rpc_response(frame.message_id, &response),
                    ).await?;
                    if let Some(shutdown_source) = shutdown_source.as_ref() {
                        super::direct_transport::record_shutdown_source_first(
                            shutdown_source,
                            super::direct_transport::HostRpcShutdownSource::RemoteRequest(
                                super::direct_transport::DirectTransportStopReason::VaultLocked,
                            ),
                        );
                    }
                    info!(
                        "mobile_acceptor: remote vault lock requested disconnect peer_id={}",
                        peer_id
                    );
                    let _ = transport.close().await;
                    return Ok(());
                }

                if req.command == CATALOG_DERIVATIVE_ENSURE {
                    if frame.has_continuation() {
                        let response = RpcResponse::Error {
                            ok: false,
                            error: "Derivative ensure does not accept an input stream".to_string(),
                            code: Some("STREAM_UNEXPECTED".to_string()),
                        };
                        send_encrypted_frame_typed(
                            transport.as_mut(),
                            &mut noise,
                            frame_from_rpc_response(frame.message_id, &response),
                        )
                        .await?;
                        continue;
                    }
                    let request = match crate::commands::catalog::HostDerivativeEnsureRequest::parse(
                        &req.data,
                    ) {
                        Ok(request) => request,
                        Err((error, code)) => {
                            let response = RpcResponse::Error {
                                ok: false,
                                error,
                                code,
                            };
                            send_encrypted_frame_typed(
                                transport.as_mut(),
                                &mut noise,
                                frame_from_rpc_response(frame.message_id, &response),
                            )
                            .await?;
                            continue;
                        }
                    };
                    let Some(services) = derivative_ensure_services.clone() else {
                        let response = RpcResponse::Error {
                            ok: false,
                            error: "Derivative ensure services are unavailable".to_string(),
                            code: Some("REMOTE_CORE_UNSUPPORTED".to_string()),
                        };
                        send_encrypted_frame_typed(
                            transport.as_mut(),
                            &mut noise,
                            frame_from_rpc_response(frame.message_id, &response),
                        )
                        .await?;
                        continue;
                    };
                    info!(
                        peer_id,
                        message_id = frame.message_id,
                        node_id = request.node_id,
                        source_revision = request.source_version,
                        tier = request.tier.label(),
                        storage_version = request.version,
                        refresh_cache = request.refresh_cache,
                        transport_type = ?transport_type,
                        "mobile_acceptor: derivative ensure scheduled"
                    );
                    let request_cancellation_epoch = spawn_host_derivative_ensure(
                        &mut derivative_jobs,
                        derivative_job_tx.clone(),
                        services,
                        request,
                        frame.message_id,
                        request_advertises_stream_control(&req),
                        derivative_session_cancellation.epoch_handle(),
                    );
                    derivative_job_cancellations
                        .insert(frame.message_id, request_cancellation_epoch);
                    continue;
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
                            send_encrypted_frame_typed(
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
                    .await
                    .map_err(RemoteIoFailure::data_plane_error)? {
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
                                send_encrypted_frame_typed(
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
                            send_encrypted_frame_typed(
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
                    if active_upload.is_some() {
                        let response = RpcResponse::error(
                            "another upload stream is active",
                            Some("STREAM_BUSY"),
                        );
                        send_encrypted_frame_typed(
                            transport.as_mut(),
                            &mut noise,
                            frame_from_rpc_response(frame.message_id, &response),
                        )
                        .await?;
                        continue;
                    }

                    let mode = if is_full_upload_stream_command(&req.command) {
                        HostIncomingUploadMode::Full { body: Vec::new() }
                    } else {
                        let upload_metadata = match parse_upload_stream_metadata(&req.data) {
                            Ok(metadata) => metadata,
                            Err(response) => {
                                send_encrypted_frame_typed(
                                    transport.as_mut(),
                                    &mut noise,
                                    frame_from_rpc_response(frame.message_id, &response),
                                )
                                .await?;
                                continue;
                            }
                        };
                        HostIncomingUploadMode::Chunked {
                            end_offset: upload_metadata.end_offset,
                            offset: upload_metadata.offset,
                            last_response: None,
                        }
                    };
                    anti_replay.set_active_stream(frame.message_id);
                    info!(
                        "perf:remote_stream event=upload_start direction=recv host=true peer_id={} command={} message_id={}",
                        peer_id,
                        req.command,
                        frame.message_id
                    );
                    active_upload = Some(HostIncomingUpload {
                        message_id: frame.message_id,
                        lifecycle: StreamLifecycleTracker::start(
                            req.command.clone(),
                            StreamLifecycleDirection::Recv,
                            Some(peer_id.clone()),
                        ),
                        req,
                        mode,
                    });
                    continue;
                }

                if is_download_stream_command(&req.command) {
                    let download_req = req.clone();
                    match run_host_adapter_task(
                        &mut adapter,
                        "mobile acceptor download stream",
                        move |adapter| adapter.handle_with_stream(&download_req, None),
                    )
                    .await
                    .map_err(RemoteIoFailure::data_plane_error)? {
                        RpcReply::Stream(output) => {
                            let meta_frame =
                                frame_stream_meta_response(frame.message_id, &output.meta);
                            start_host_outgoing_stream(
                                transport.as_mut(),
                                &mut noise,
                                frame.message_id,
                                &peer_id,
                                &req.command,
                                request_advertises_stream_control(&req),
                                meta_frame,
                                output.reader,
                                &mut active_outgoing_streams,
                                &mut active_outgoing_order,
                            )
                            .await?;
                        }
                        RpcReply::Json(resp) => {
                            send_encrypted_frame_typed(
                                transport.as_mut(),
                                &mut noise,
                                frame_from_rpc_response(frame.message_id, &resp),
                            ).await?;
                        }
                        RpcReply::RangeStream(output) => {
                            let meta_frame =
                                frame_range_stream_meta_response(frame.message_id, &output.meta);
                            start_host_outgoing_stream(
                                transport.as_mut(),
                                &mut noise,
                                frame.message_id,
                                &peer_id,
                                &req.command,
                                request_advertises_stream_control(&req),
                                meta_frame,
                                output.reader,
                                &mut active_outgoing_streams,
                                &mut active_outgoing_order,
                            )
                            .await?;
                        }
                    }
                    continue;
                }

                let mut generic_req = req.clone();
                let is_credential_import = req.command.starts_with("passmanager:import:");
                if is_credential_import {
                    chromvoid_core::rpc::helpers::clear_rpc_strings(&mut req.data);
                }
                let resp = run_host_adapter_task(
                    &mut adapter,
                    "mobile acceptor host rpc",
                    move |adapter| {
                        let response = adapter.handle(&generic_req);
                        if is_credential_import {
                            chromvoid_core::rpc::helpers::clear_rpc_strings(&mut generic_req.data);
                        }
                        response
                    },
                )
                .await
                .map_err(RemoteIoFailure::data_plane_error)?;
                let should_confirm_usb_host_unlock =
                    transport_type == TransportType::UsbMobile
                        && usb_session_approved
                        && !usb_host_unlock_confirmed
                        && req.command == "vault:unlock"
                        && resp.is_ok();
                send_encrypted_frame_typed(
                    transport.as_mut(),
                    &mut noise,
                    frame_from_rpc_response(frame.message_id, &resp),
                ).await?;
                if should_confirm_usb_host_unlock {
                    send_mobile_usb_host_unlock_confirmed(
                        transport.as_mut(),
                        &mut noise,
                        &mut server_msg_id,
                    )
                    .await?;
                    usb_host_unlock_confirmed = true;
                    info!(
                        peer_id,
                        "mobile_acceptor: USB host unlock confirmation sent after vault unlock"
                    );
                }
            }

            _ = tokio::task::yield_now(), if !active_outgoing_streams.is_empty() => {
                send_next_host_outgoing_stream_chunk(
                    transport.as_mut(),
                    &mut noise,
                    policy,
                    &mut active_outgoing_streams,
                    &mut active_outgoing_order,
                ).await?;
            }
        }
    }
}

#[cfg(test)]
#[path = "rpc_loop_tests.rs"]
mod rpc_loop_tests;
