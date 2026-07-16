use super::adapter::{run_host_adapter_task, LazyHostRpcAdapter};
use super::frame_from_rpc_response;
use crate::remote_data_plane::{send_encrypted_frame_typed, RemoteIoFailure, RemoteIoResult};
use crate::remote_stream_lifecycle::StreamLifecycleTracker;
use crate::rpc_transport_protocol::{append_full_upload_stream_chunk, upload_stream_chunk_data};
use chromvoid_core::rpc::types::{RpcRequest, RpcResponse, PROTOCOL_VERSION};
use chromvoid_core::rpc::{RpcInputStream, RpcReply};
use chromvoid_protocol::{Frame, NoiseTransport, RemoteTransport};

pub(super) async fn handle_host_upload_continuation(
    adapter: &mut LazyHostRpcAdapter,
    transport: &mut dyn RemoteTransport,
    noise: &mut NoiseTransport,
    peer_id: &str,
    frame: Frame,
    upload: &mut HostIncomingUpload,
) -> RemoteIoResult<bool> {
    let is_final_chunk = !frame.has_continuation();
    let payload_len = frame.payload.len();
    if payload_len > 0 {
        let snapshot = upload.lifecycle.record_chunk(payload_len);
        if snapshot.chunks == 1 {
            tracing::info!(
                "perf:remote_stream event=upload_first_chunk direction=recv host=true peer_id={} command={} message_id={} bytes={}",
                peer_id,
                snapshot.command,
                upload.message_id,
                payload_len
            );
        }
        tracing::debug!(
            "perf:remote_stream event=upload_chunk direction=recv host=true command={} message_id={} chunk_index={} bytes={}",
            snapshot.command,
            upload.message_id,
            snapshot.chunks,
            payload_len
        );
    }
    match &mut upload.mode {
        HostIncomingUploadMode::Full { body } => {
            if let Err(response) = append_full_upload_stream_chunk(body, &frame.payload) {
                let _ = send_encrypted_frame_typed(
                    transport,
                    noise,
                    frame_from_rpc_response(upload.message_id, &response),
                )
                .await;
                let snapshot = upload.lifecycle.cancel();
                tracing::info!(
                    "perf:remote_stream event=upload_cancel direction=recv host=true peer_id={} command={} message_id={} chunks={} bytes={} duration_ms={} error_code=PAYLOAD_TOO_LARGE",
                    peer_id,
                    snapshot.command,
                    upload.message_id,
                    snapshot.chunks,
                    snapshot.bytes,
                    snapshot.duration_ms
                );
                return Err(RemoteIoFailure::data_plane_error(format!(
                    "host upload stream aborted peer_id={peer_id}"
                )));
            }

            if !is_final_chunk {
                return Ok(false);
            }

            let full_upload_req = upload.req.clone();
            let full_body = std::mem::take(body);
            let response = match run_host_adapter_task(
                adapter,
                "mobile acceptor full upload stream",
                move |adapter| {
                    adapter.handle_with_stream(
                        &full_upload_req,
                        Some(RpcInputStream::from_bytes(full_body)),
                    )
                },
            )
            .await
            .map_err(RemoteIoFailure::data_plane_error)?
            {
                RpcReply::Json(resp) => resp,
                RpcReply::Stream(_) | RpcReply::RangeStream(_) => RpcResponse::Error {
                    ok: false,
                    error: "unexpected streaming response for upload".to_string(),
                    code: Some("STREAM_UNEXPECTED".to_string()),
                },
            };

            send_encrypted_frame_typed(
                transport,
                noise,
                frame_from_rpc_response(upload.message_id, &response),
            )
            .await?;
            let snapshot = upload.lifecycle.finish();
            tracing::info!(
                "perf:remote_stream event=upload_final direction=recv host=true peer_id={} command={} message_id={} chunks={} bytes={} duration_ms={}",
                peer_id,
                snapshot.command,
                upload.message_id,
                snapshot.chunks,
                snapshot.bytes,
                snapshot.duration_ms
            );
            Ok(true)
        }
        HostIncomingUploadMode::Chunked {
            stream_size,
            offset,
        } => {
            let chunk_len = frame.payload.len() as u64;
            let chunk_data = match upload_stream_chunk_data(
                &upload.req.data,
                *offset,
                chunk_len,
                *stream_size,
                is_final_chunk,
            ) {
                Ok(chunk_data) => chunk_data,
                Err(response) => {
                    let _ = send_encrypted_frame_typed(
                        transport,
                        noise,
                        frame_from_rpc_response(upload.message_id, &response),
                    )
                    .await;
                    let snapshot = upload.lifecycle.cancel();
                    tracing::info!(
                        "perf:remote_stream event=upload_cancel direction=recv host=true peer_id={} command={} message_id={} chunks={} bytes={} duration_ms={} error_code=BAD_REQUEST",
                        peer_id,
                        snapshot.command,
                        upload.message_id,
                        snapshot.chunks,
                        snapshot.bytes,
                        snapshot.duration_ms
                    );
                    return Err(RemoteIoFailure::data_plane_error(format!(
                        "host upload stream aborted peer_id={peer_id}"
                    )));
                }
            };

            let chunk_req = RpcRequest {
                v: PROTOCOL_VERSION,
                command: upload.req.command.clone(),
                data: chunk_data,
                transport_features: upload.req.transport_features.clone(),
            };
            let chunk_payload = frame.payload;
            match run_host_adapter_task(
                adapter,
                "mobile acceptor upload stream chunk",
                move |adapter| {
                    adapter.handle_with_stream(
                        &chunk_req,
                        Some(RpcInputStream::from_bytes(chunk_payload)),
                    )
                },
            )
            .await
            .map_err(RemoteIoFailure::data_plane_error)?
            {
                RpcReply::Json(resp) => {
                    if !resp.is_ok() {
                        let _ = send_encrypted_frame_typed(
                            transport,
                            noise,
                            frame_from_rpc_response(upload.message_id, &resp),
                        )
                        .await;
                        let snapshot = upload.lifecycle.cancel();
                        tracing::info!(
                            "perf:remote_stream event=upload_cancel direction=recv host=true peer_id={} command={} message_id={} chunks={} bytes={} duration_ms={} error_code=STREAM_RESPONSE_ERROR",
                            peer_id,
                            snapshot.command,
                            upload.message_id,
                            snapshot.chunks,
                            snapshot.bytes,
                            snapshot.duration_ms
                        );
                        return Err(RemoteIoFailure::data_plane_error(format!(
                            "host upload stream aborted peer_id={peer_id}"
                        )));
                    }
                }
                RpcReply::Stream(_) | RpcReply::RangeStream(_) => {
                    let err = RpcResponse::Error {
                        ok: false,
                        error: "unexpected streaming response for upload".to_string(),
                        code: Some("STREAM_UNEXPECTED".to_string()),
                    };
                    let _ = send_encrypted_frame_typed(
                        transport,
                        noise,
                        frame_from_rpc_response(upload.message_id, &err),
                    )
                    .await;
                    let snapshot = upload.lifecycle.cancel();
                    tracing::info!(
                        "perf:remote_stream event=upload_cancel direction=recv host=true peer_id={} command={} message_id={} chunks={} bytes={} duration_ms={} error_code=STREAM_UNEXPECTED",
                        peer_id,
                        snapshot.command,
                        upload.message_id,
                        snapshot.chunks,
                        snapshot.bytes,
                        snapshot.duration_ms
                    );
                    return Err(RemoteIoFailure::data_plane_error(format!(
                        "host upload stream aborted peer_id={peer_id}"
                    )));
                }
            }

            *offset += chunk_len;
            if is_final_chunk {
                let success = RpcResponse::success(serde_json::json!({"uploaded": *offset}));
                send_encrypted_frame_typed(
                    transport,
                    noise,
                    frame_from_rpc_response(upload.message_id, &success),
                )
                .await?;
                let snapshot = upload.lifecycle.finish();
                tracing::info!(
                    "perf:remote_stream event=upload_final direction=recv host=true peer_id={} command={} message_id={} chunks={} bytes={} duration_ms={}",
                    peer_id,
                    snapshot.command,
                    upload.message_id,
                    snapshot.chunks,
                    snapshot.bytes,
                    snapshot.duration_ms
                );
                return Ok(true);
            }

            Ok(false)
        }
    }
}

pub(super) enum HostIncomingUploadMode {
    Full { body: Vec<u8> },
    Chunked { stream_size: u64, offset: u64 },
}

pub(super) struct HostIncomingUpload {
    pub(super) message_id: u64,
    pub(super) req: RpcRequest,
    pub(super) mode: HostIncomingUploadMode,
    pub(super) lifecycle: StreamLifecycleTracker,
}
