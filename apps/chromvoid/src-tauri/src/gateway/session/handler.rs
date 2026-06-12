use std::time::Duration;

use chromvoid_core::rpc::stream::{RpcInputStream, RpcReply};
use chromvoid_core::rpc::types::RpcRequest;
use chromvoid_core::rpc::RpcResponse;
use futures_util::{SinkExt, StreamExt};
use tauri::Manager;
use tokio_tungstenite::tungstenite::protocol::Message;
use tracing::{debug, warn};

use crate::core_adapter::CoreAdapter;

use super::super::handshake::check_capability;
use super::super::protocol::{
    append_full_upload_stream_chunk, error_codes, frame_continuation, frame_from_event,
    frame_from_heartbeat, frame_from_rpc_response, frame_stream_meta_response,
    parse_upload_stream_metadata, upload_stream_chunk_data, validate_timestamp, AntiReplay, Frame,
    FrameType,
};
use super::super::rate_limit::RateLimiter;
use super::{
    is_download_stream_command, is_full_upload_stream_command, is_upload_stream_command,
    ConnectionPhase, DEFAULT_SESSION_MAX_DURATION, HEARTBEAT_INTERVAL, IDLE_TIMEOUT,
    MAX_REQUESTS_PER_MINUTE, MAX_WS_MESSAGE_SIZE, STREAM_CHUNK_SIZE,
};

fn read_stream_chunk(reader: &mut dyn std::io::Read, buf: &mut [u8]) -> Result<usize, String> {
    reader.read(buf).map_err(|e| format!("stream read: {}", e))
}

async fn read_gateway_stream_chunk(
    app_handle: &tauri::AppHandle,
    mut reader: Box<dyn std::io::Read + Send>,
    label: &'static str,
) -> Result<(Box<dyn std::io::Read + Send>, Vec<u8>), String> {
    let vault_background_io_runtime = app_handle
        .state::<crate::AppState>()
        .vault_background_io_runtime
        .clone();

    match vault_background_io_runtime
        .spawn_blocking(move || {
            let mut buf = vec![0_u8; STREAM_CHUNK_SIZE];
            let n = read_stream_chunk(reader.as_mut(), &mut buf)?;
            buf.truncate(n);
            Ok((reader, buf))
        })
        .await
    {
        Ok(result) => result,
        Err(error) => {
            let (error, _code) = error.into_rpc_error(label);
            Err(error)
        }
    }
}

async fn run_gateway_adapter_task<T, F>(
    app_handle: &tauri::AppHandle,
    label: &'static str,
    task: F,
) -> Result<T, String>
where
    T: Send + 'static,
    F: FnOnce(&mut dyn CoreAdapter) -> Result<T, String> + Send + 'static,
{
    let state = app_handle.state::<crate::AppState>();
    let adapter = state.adapter.clone();
    let vault_background_io_runtime = state.vault_background_io_runtime.clone();

    match vault_background_io_runtime
        .spawn_blocking(move || {
            let mut adapter = adapter
                .lock()
                .map_err(|_| "Adapter mutex poisoned".to_string())?;
            task(adapter.as_mut())
        })
        .await
    {
        Ok(result) => result,
        Err(error) => {
            let (error, _code) = error.into_rpc_error(label);
            Err(error)
        }
    }
}

/// Run the post-handshake extension session: RPC loop, streaming, heartbeats.
pub(in crate::gateway) async fn handle_extension_session(
    mut transport: snow::TransportState,
    ext_id: String,
    app_handle: tauri::AppHandle,
    mut write: futures_util::stream::SplitSink<
        tokio_tungstenite::WebSocketStream<tokio::net::TcpStream>,
        Message,
    >,
    mut read: futures_util::stream::SplitStream<
        tokio_tungstenite::WebSocketStream<tokio::net::TcpStream>,
    >,
) {
    let mut anti_replay = AntiReplay::new();
    let mut server_msg_id: u64 = rand::random::<u64>().max(1);
    let mut rate_limiter = RateLimiter::new(MAX_REQUESTS_PER_MINUTE, 60_000);
    let mut phase = ConnectionPhase::Established;

    // Read session_max_duration from config.
    let session_max_duration = {
        let state = app_handle.state::<crate::AppState>();
        let dur = match state.gateway.lock() {
            Ok(st) => {
                let mins = st.config.session_max_duration_mins;
                if mins >= 15 && mins <= 240 {
                    Duration::from_secs(mins as u64 * 60)
                } else {
                    DEFAULT_SESSION_MAX_DURATION
                }
            }
            Err(_) => DEFAULT_SESSION_MAX_DURATION,
        };
        dur
    };

    let session_start = tokio::time::Instant::now();
    let mut heartbeat_tick = tokio::time::interval(HEARTBEAT_INTERVAL);
    // Consume the first immediate tick.
    heartbeat_tick.tick().await;

    loop {
        if phase == ConnectionPhase::Closing {
            break;
        }

        // SPEC-002 s8.2: Session expiry check.
        if session_start.elapsed() > session_max_duration {
            try_send_session_error!(
                transport,
                write,
                &mut server_msg_id,
                error_codes::AUTH_FAILED,
                "session expired"
            );
            break;
        }

        tokio::select! {
          _ = heartbeat_tick.tick() => {
            // SPEC-002 s4.3: Send heartbeat frame.
            server_msg_id = server_msg_id.wrapping_add(1).max(1);
            let hb = frame_from_heartbeat(server_msg_id);
            let hb_plain = hb.encode();
            let mut hb_out = vec![0u8; hb_plain.len() + 32];
            match transport.write_message(&hb_plain, &mut hb_out) {
              Ok(l) => {
                hb_out.truncate(l);
                if write.send(Message::Binary(hb_out.into())).await.is_err() {
                  break;
                }
              }
              Err(_) => break,
            }
          }
          next = tokio::time::timeout(IDLE_TIMEOUT, read.next()) => {
            let next = match next {
              Ok(Some(result)) => result,
              Ok(None) => break,
              Err(_) => break, // Idle timeout
            };

            let Ok(msg) = next else { break };
            let Message::Binary(ciphertext) = msg else { continue };

            if ciphertext.len() > MAX_WS_MESSAGE_SIZE {
              warn!(
                "[gateway] closing session for extension_id={ext_id}: incoming frame too large ({} bytes)",
                ciphertext.len()
              );
              try_send_session_error!(
                transport, write, &mut server_msg_id,
                error_codes::INVALID_FORMAT, "message too large"
              );
              break;
            }

            let mut plain = vec![0u8; ciphertext.len()];
            let plain_len = match transport.read_message(ciphertext.as_ref(), &mut plain) {
              Ok(l) => l,
              // AEAD decrypt failure: silent close (session corrupted, can't encrypt error).
              Err(err) => {
                warn!(
                  "[gateway] closing session for extension_id={ext_id}: transport decrypt failed: {err}"
                );
                break;
              }
            };
            plain.truncate(plain_len);

            let frame = match Frame::decode(&plain) {
              Ok(f) => f,
              Err(_) => {
                warn!(
                  "[gateway] closing session for extension_id={ext_id}: decoded frame is invalid"
                );
                try_send_session_error!(
                  transport, write, &mut server_msg_id,
                  error_codes::INVALID_FORMAT, "invalid frame"
                );
                break;
              }
            };

            match frame.frame_type {
              FrameType::Heartbeat => {
                // Peer heartbeat: idle timer reset by any received message.
                continue;
              }
              FrameType::Error => {
                // Peer sent error: graceful close.
                break;
              }
              FrameType::RpcResponse => {
                // Unexpected from extension; ignore.
                continue;
              }
              FrameType::RpcRequest => {
                // Process RPC request below.
              }
            }

            if anti_replay.check(frame.message_id).is_err() {
              warn!(
                "[gateway] closing session for extension_id={ext_id}: replay detected for message_id={}",
                frame.message_id
              );
              try_send_request_error!(
                transport, write, frame.message_id,
                error_codes::REPLAY_DETECTED, "replay detected"
              );
              break;
            }

            if !rate_limiter.check() {
              warn!(
                "[gateway] closing session for extension_id={ext_id}: rate limit exceeded for message_id={}",
                frame.message_id
              );
              try_send_request_error!(
                transport, write, frame.message_id,
                error_codes::RATE_LIMIT_EXCEEDED, "rate limit exceeded"
              );
              break;
            }

            let req: RpcRequest = match serde_json::from_slice(&frame.payload) {
              Ok(v) => v,
              Err(_) => {
                warn!(
                  "[gateway] closing session for extension_id={ext_id}: invalid JSON request payload for message_id={}",
                  frame.message_id
                );
                try_send_request_error!(
                  transport, write, frame.message_id,
                  error_codes::INVALID_FORMAT, "invalid request"
                );
                break;
              }
            };
            if req.v != chromvoid_core::rpc::types::PROTOCOL_VERSION {
              warn!(
                "[gateway] closing session for extension_id={ext_id}: unsupported RPC version {} for message_id={}",
                req.v,
                frame.message_id
              );
              try_send_request_error!(
                transport, write, frame.message_id,
                error_codes::UNSUPPORTED_TYPE, "unsupported version"
              );
              break;
            }

            // SPEC-002 s5.2: Timestamp validation (optional field).
            if let Some(ts) = req.data.get("timestamp").and_then(|v| v.as_u64()) {
              if validate_timestamp(ts).is_err() {
                warn!(
                  "[gateway] closing session for extension_id={ext_id}: timestamp out of range for message_id={}",
                  frame.message_id
                );
                try_send_request_error!(
                  transport, write, frame.message_id,
                  error_codes::REPLAY_DETECTED, "timestamp out of range"
                );
                phase = ConnectionPhase::Closing;
                continue;
              }
            }

            let pro_denied: Option<String> = {
              let state = app_handle.state::<crate::AppState>();
              crate::pro::guard_pro_feature_async(
                &state,
                chromvoid_core::license::PRO_FEATURE_BROWSER_EXTENSION,
              ).await.err().map(|error| match error {
                crate::types::RpcResult::Error { error, code, .. } => {
                  format!("{}: {}", code.unwrap_or_else(|| "PRO_REQUIRED".to_string()), error)
                }
                crate::types::RpcResult::Success { .. } => "PRO_REQUIRED: Pro license required".to_string(),
              })
            };
            if let Some(reason) = pro_denied {
              debug!(
                "[gateway] pro access denied for extension_id={ext_id}, command={}: {reason}",
                req.command
              );
              try_send_request_error!(
                transport, write, frame.message_id,
                error_codes::CAPABILITY_DENIED, &reason
              );
              continue;
            }

            // --- Capability grant enforcement ---
            let (capability_denied, capability_save_snapshot) = {
              let grant_id = req.data.get("_grant_id").and_then(|v| v.as_str());
              let origin = req.data.get("_origin").and_then(|v| v.as_str());
              let node_id_val = req.data.get("node_id").and_then(|v| v.as_u64());

              let state = app_handle.state::<crate::AppState>();
              let catalog_blocking_io_runtime = state.catalog_blocking_io_runtime.clone();
              let mut st = match state.gateway.lock() {
                Ok(g) => g,
                Err(_) => break,
              };
              let (capability_result, save_snapshot) = check_capability(
                &mut st,
                &ext_id,
                &req.command,
                grant_id,
                origin,
                node_id_val,
              );
              (
                capability_result.err(),
                save_snapshot.map(|snapshot| (catalog_blocking_io_runtime, snapshot)),
              )
            };
            if let Some((catalog_blocking_io_runtime, save_snapshot)) = capability_save_snapshot {
              crate::gateway::save_config_snapshot_best_effort(
                catalog_blocking_io_runtime,
                save_snapshot,
                "Gateway capability policy save",
              ).await;
            }
            if let Some(reason) = capability_denied {
              debug!(
                "[gateway] capability denied for extension_id={ext_id}, command={}: {reason}",
                req.command
              );
              try_send_request_error!(
                transport, write, frame.message_id,
                error_codes::CAPABILITY_DENIED, &reason
              );
              continue; // NOT break — keep connection alive
            }

            // --- Upload stream ---
            if is_upload_stream_command(&req.command) && frame.has_continuation() {
              if is_full_upload_stream_command(&req.command) {
                anti_replay.set_active_stream(frame.message_id);
                let stream_msg_id = frame.message_id;
                let mut body = Vec::new();
                let mut stream_ok = true;

                loop {
                  let chunk_frame = recv_encrypted_frame!(transport, read, IDLE_TIMEOUT, MAX_WS_MESSAGE_SIZE);
                  let chunk_frame = match chunk_frame {
                    Ok(f) => f,
                    Err(_) => { stream_ok = false; break; }
                  };

                  if chunk_frame.frame_type != FrameType::RpcRequest {
                    stream_ok = false;
                    break;
                  }
                  if chunk_frame.message_id != stream_msg_id {
                    warn!(
                      "[gateway] closing upload stream for extension_id={ext_id}: message_id mismatch stream_id={} chunk_id={}",
                      stream_msg_id,
                      chunk_frame.message_id
                    );
                    try_send_request_error!(transport, write, stream_msg_id,
                      error_codes::INVALID_FORMAT, "stream message_id mismatch");
                    stream_ok = false;
                    break;
                  }
                  if anti_replay.check(chunk_frame.message_id).is_err() {
                    warn!(
                      "[gateway] closing upload stream for extension_id={ext_id}: replay detected for stream_id={stream_msg_id}"
                    );
                    try_send_request_error!(transport, write, stream_msg_id,
                      error_codes::REPLAY_DETECTED, "replay detected");
                    stream_ok = false;
                    break;
                  }

                  if let Err(response) =
                    append_full_upload_stream_chunk(&mut body, &chunk_frame.payload)
                  {
                    warn!(
                      "[gateway] closing upload stream for extension_id={ext_id}: full upload body exceeded limit stream_id={stream_msg_id}"
                    );
                    let response_frame = frame_from_rpc_response(stream_msg_id, &response);
                    let _ = send_encrypted_frame!(transport, write, response_frame);
                    stream_ok = false;
                    break;
                  }

                  if !chunk_frame.has_continuation() {
                    break;
                  }
                }

                anti_replay.clear_active_stream();

                if !stream_ok {
                  break;
                }

                let full_upload_req = req.clone();
                let reply = match run_gateway_adapter_task(
                  &app_handle,
                  "gateway full upload stream",
                  move |adapter| {
                    let r = adapter.handle_with_stream(
                      &full_upload_req,
                      Some(RpcInputStream::from_bytes(body)),
                    );
                    let save_error = adapter.save().err();
                    let events = adapter.take_events();
                    Ok((r, save_error, events))
                  },
                ).await {
                  Ok(reply) => reply,
                  Err(error) => {
                    warn!(
                      "[gateway] closing session for extension_id={ext_id}: full upload adapter task failed: {error}"
                    );
                    break;
                  }
                };

                for evt in reply.2 {
                  let Some(obj) = evt.as_object() else { continue };
                  let Some(cmd) = obj.get("command").and_then(|v| v.as_str()) else { continue };
                  let payload = obj.get("data").cloned().unwrap_or(serde_json::Value::Null);
                  server_msg_id = server_msg_id.wrapping_add(1).max(1);
                  let ev_frame = frame_from_event(server_msg_id, cmd, payload);
                  if send_encrypted_frame!(transport, write, ev_frame).is_err() {
                    stream_ok = false;
                    break;
                  }
                }

                if !stream_ok {
                  break;
                }

                let response = if let Some(err) = reply.1 {
                  RpcResponse::error(err, Some("INTERNAL"))
                } else {
                  match reply.0 {
                    RpcReply::Json(resp) => resp,
                    RpcReply::Stream(_) | RpcReply::RangeStream(_) => {
                      RpcResponse::error("unexpected streaming response for upload", Some("STREAM_UNEXPECTED"))
                    }
                  }
                };
                let resp_frame = frame_from_rpc_response(stream_msg_id, &response);
                if send_encrypted_frame!(transport, write, resp_frame).is_err() {
                  break;
                }
                continue;
              }

              // First frame is JSON metadata. Extract offset/size for per-chunk routing.
              let upload_metadata = match parse_upload_stream_metadata(&req.data) {
                Ok(metadata) => metadata,
                Err(response) => {
                  let response_frame = frame_from_rpc_response(frame.message_id, &response);
                  let _ = send_encrypted_frame!(transport, write, response_frame);
                  continue;
                }
              };
              let stream_size = upload_metadata.size;
              let mut offset = upload_metadata.offset;
              let command = req.command.clone();

              anti_replay.set_active_stream(frame.message_id);
              let stream_msg_id = frame.message_id;

              let mut stream_ok = true;
              loop {
                // Receive next continuation frame.
                let chunk_frame = recv_encrypted_frame!(transport, read, IDLE_TIMEOUT, MAX_WS_MESSAGE_SIZE);
                let chunk_frame = match chunk_frame {
                  Ok(f) => f,
                  Err(_) => { stream_ok = false; break; }
                };

                if chunk_frame.frame_type != FrameType::RpcRequest {
                  stream_ok = false;
                  break;
                }
                if chunk_frame.message_id != stream_msg_id {
                  warn!(
                    "[gateway] closing upload stream for extension_id={ext_id}: message_id mismatch stream_id={} chunk_id={}",
                    stream_msg_id,
                    chunk_frame.message_id
                  );
                  try_send_request_error!(transport, write, stream_msg_id,
                    error_codes::INVALID_FORMAT, "stream message_id mismatch");
                  stream_ok = false;
                  break;
                }
                if anti_replay.check(chunk_frame.message_id).is_err() {
                  warn!(
                    "[gateway] closing upload stream for extension_id={ext_id}: replay detected for stream_id={stream_msg_id}"
                  );
                  try_send_request_error!(transport, write, stream_msg_id,
                    error_codes::REPLAY_DETECTED, "replay detected");
                  stream_ok = false;
                  break;
                }

                let chunk_bytes = chunk_frame.payload.clone();
                let chunk_len = chunk_bytes.len() as u64;
                let is_final_chunk = !chunk_frame.has_continuation();

                // Build per-chunk RpcRequest for the adapter.
                let chunk_data = match upload_stream_chunk_data(
                  &req.data,
                  offset,
                  chunk_len,
                  stream_size,
                  is_final_chunk,
                ) {
                  Ok(chunk_data) => chunk_data,
                  Err(response) => {
                    let err_frame = frame_from_rpc_response(stream_msg_id, &response);
                    let _ = send_encrypted_frame!(transport, write, err_frame);
                    stream_ok = false;
                    break;
                  }
                };
                let chunk_req = RpcRequest {
                  v: chromvoid_core::rpc::types::PROTOCOL_VERSION,
                  command: command.clone(),
                  data: chunk_data,
                };

                let reply = match run_gateway_adapter_task(
                  &app_handle,
                  "gateway upload stream chunk",
                  move |adapter| {
                    let r = adapter.handle_with_stream(
                      &chunk_req,
                      Some(RpcInputStream::from_bytes(chunk_bytes)),
                    );
                    let events = adapter.take_events();
                    Ok((r, events))
                  },
                ).await {
                  Ok(reply) => reply,
                  Err(error) => {
                    warn!(
                      "[gateway] closing upload stream for extension_id={ext_id}: chunk adapter task failed: {error}"
                    );
                    stream_ok = false;
                    break;
                  }
                };

                // Flush events from this chunk.
                for evt in reply.1 {
                  let Some(obj) = evt.as_object() else { continue };
                  let Some(cmd) = obj.get("command").and_then(|v| v.as_str()) else { continue };
                  let payload = obj.get("data").cloned().unwrap_or(serde_json::Value::Null);
                  server_msg_id = server_msg_id.wrapping_add(1).max(1);
                  let ev_frame = frame_from_event(server_msg_id, cmd, payload);
                  if send_encrypted_frame!(transport, write, ev_frame).is_err() {
                    stream_ok = false;
                    break;
                  }
                }

                // Check for chunk-level error from adapter.
                if let RpcReply::Json(ref resp) = reply.0 {
                  if !resp.is_ok() {
                    // Send error response and abort stream.
                    let err_frame = frame_from_rpc_response(stream_msg_id, resp);
                    let _ = send_encrypted_frame!(transport, write, err_frame);
                    stream_ok = false;
                    break;
                  }
                }

                offset += chunk_len;

                // Last chunk: continuation flag cleared.
                if is_final_chunk {
                  break;
                }
              }

              anti_replay.clear_active_stream();

              let save_error = match run_gateway_adapter_task(
                &app_handle,
                "gateway upload stream save",
                move |adapter| Ok(adapter.save().err()),
              ).await {
                Ok(save_error) => save_error,
                Err(error) => Some(error),
              };
              if let Some(err) = save_error {
                if stream_ok {
                  let err_resp = chromvoid_core::rpc::types::RpcResponse::error(err, Some("INTERNAL"));
                  let err_frame = frame_from_rpc_response(stream_msg_id, &err_resp);
                  let _ = send_encrypted_frame!(transport, write, err_frame);
                }
                stream_ok = false;
              }

              if stream_ok {
                // Send final success response.
                let success_resp = chromvoid_core::rpc::types::RpcResponse::success(
                  serde_json::json!({ "uploaded": offset })
                );
                let resp_frame = frame_from_rpc_response(stream_msg_id, &success_resp);
                if send_encrypted_frame!(transport, write, resp_frame).is_err() {
                  break;
                }
              } else {
                break;
              }
            }
            // --- Download stream ---
            else if is_download_stream_command(&req.command) {
              let download_req = req.clone();
              let reply = match run_gateway_adapter_task(
                &app_handle,
                "gateway download stream",
                move |adapter| {
                  let r = adapter.handle_with_stream(&download_req, None);
                  let _ = adapter.save();
                  let events = adapter.take_events();
                  Ok((r, events))
                },
              ).await {
                Ok(reply) => reply,
                Err(error) => {
                  warn!(
                    "[gateway] closing session for extension_id={ext_id}: download adapter task failed: {error}"
                  );
                  break;
                }
              };

              // Flush events.
              for evt in reply.1 {
                let Some(obj) = evt.as_object() else { continue };
                let Some(cmd) = obj.get("command").and_then(|v| v.as_str()) else { continue };
                let payload = obj.get("data").cloned().unwrap_or(serde_json::Value::Null);
                server_msg_id = server_msg_id.wrapping_add(1).max(1);
                let ev_frame = frame_from_event(server_msg_id, cmd, payload);
                if send_encrypted_frame!(transport, write, ev_frame).is_err() {
                  break;
                }
              }

              match reply.0 {
                RpcReply::Stream(output) => {
                  // 1. Send meta frame with continuation flag.
                  let meta_frame = frame_stream_meta_response(frame.message_id, &output.meta);
                  if send_encrypted_frame!(transport, write, meta_frame).is_err() {
                    break;
                  }

                  // 2. Read and send binary chunks using double-buffer for EOF detection.
                  let (mut reader, mut current_buf) = match read_gateway_stream_chunk(
                    &app_handle,
                    output.reader,
                    "gateway download stream first read",
                  ).await {
                    Ok(result) => result,
                    Err(error) => {
                      warn!(
                        "[gateway] download stream read failed before first chunk for extension_id={ext_id}: {error}"
                      );
                      // Send empty final frame on read error.
                      let final_frame = frame_continuation(
                        FrameType::RpcResponse, frame.message_id, vec![], false,
                      );
                      let _ = send_encrypted_frame!(transport, write, final_frame);
                      continue;
                    }
                  };

                  while !current_buf.is_empty() {
                    let next_read = read_gateway_stream_chunk(
                      &app_handle,
                      reader,
                      "gateway download stream next read",
                    ).await;
                    let (has_more, next_reader, next_buf) = match next_read {
                      Ok((next_reader, next_buf)) => {
                        let has_more = !next_buf.is_empty();
                        (has_more, Some(next_reader), next_buf)
                      }
                      Err(error) => {
                        warn!(
                          "[gateway] download stream read failed after chunk for extension_id={ext_id}: {error}"
                        );
                        (false, None, Vec::new())
                      }
                    };

                    let chunk_frame = frame_continuation(
                      FrameType::RpcResponse,
                      frame.message_id,
                      current_buf,
                      has_more,
                    );
                    if send_encrypted_frame!(transport, write, chunk_frame).is_err() {
                      break;
                    }

                    let Some(next_reader) = next_reader else {
                      break;
                    };
                    reader = next_reader;
                    current_buf = next_buf;
                  }
                }
                RpcReply::Json(resp) => {
                  // Non-streaming response (e.g. error).
                  let response_frame = frame_from_rpc_response(frame.message_id, &resp);
                  if send_encrypted_frame!(transport, write, response_frame).is_err() {
                    break;
                  }
                }
                RpcReply::RangeStream(_) => {
                  let resp = RpcResponse::Error {
                    ok: false,
                    error: "Range streaming is not supported by remote gateway".to_string(),
                    code: Some("STREAM_UNEXPECTED".to_string()),
                  };
                  let response_frame = frame_from_rpc_response(frame.message_id, &resp);
                  if send_encrypted_frame!(transport, write, response_frame).is_err() {
                    break;
                  }
                }
              }
            }
            // --- Normal (non-streaming) RPC ---
            else {
              let generic_req = req.clone();
              let (rpc, events, lock_transition) = match run_gateway_adapter_task(
                &app_handle,
                "gateway rpc",
                move |adapter| {
                  let was_unlocked = if generic_req.command == "vault:lock" {
                    Some(adapter.is_unlocked())
                  } else {
                    None
                  };
                  let rpc = adapter.handle(&generic_req);
                  let now_unlocked = was_unlocked.map(|_| adapter.is_unlocked());
                  let _ = adapter.save();
                  let events = adapter.take_events();
                  Ok((rpc, events, was_unlocked.zip(now_unlocked)))
                },
              ).await {
                Ok(result) => result,
                Err(error) => {
                  warn!(
                    "[gateway] closing session for extension_id={ext_id}: rpc adapter task failed: {error}"
                  );
                  break;
                }
              };

              let response_frame = frame_from_rpc_response(frame.message_id, &rpc);
              if send_encrypted_frame!(transport, write, response_frame).is_err() {
                break;
              }

              // Push events.
              for evt in events {
                let Some(obj) = evt.as_object() else { continue };
                let Some(cmd) = obj.get("command").and_then(|v| v.as_str()) else { continue };
                let payload = obj.get("data").cloned().unwrap_or(serde_json::Value::Null);
                server_msg_id = server_msg_id.wrapping_add(1).max(1);
                let ev_frame = frame_from_event(server_msg_id, cmd, payload);
                if send_encrypted_frame!(transport, write, ev_frame).is_err() {
                  break;
                }
              }

              if let Some((was_unlocked, now_unlocked)) = lock_transition {
                let app_state = app_handle.state::<crate::AppState>();
                crate::commands::vault::handle_lock_transition_with_reason(
                  &app_handle,
                  &app_state,
                  was_unlocked,
                  now_unlocked,
                  "gateway",
                );
              }
            }
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
                "gateway stream failed",
            ))
        }
    }

    #[test]
    fn read_stream_chunk_maps_io_error() {
        let mut reader = FailingReader;
        let mut buf = [0_u8; 8];

        let error = read_stream_chunk(&mut reader, &mut buf).expect_err("read must fail");

        assert_eq!(error, "stream read: gateway stream failed");
    }
}
