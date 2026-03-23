use std::io::Read as _;
use std::time::Duration;

use chromvoid_core::rpc::stream::{RpcInputStream, RpcReply};
use chromvoid_core::rpc::types::RpcRequest;
use futures_util::{SinkExt, StreamExt};
use tauri::{Emitter, Manager};
use tokio_tungstenite::tungstenite::protocol::Message;
use tracing::{debug, warn};

use super::super::handshake::check_capability;
use super::super::protocol::{
    error_codes, frame_continuation, frame_from_event, frame_from_heartbeat,
    frame_from_rpc_response, frame_stream_meta_response, validate_timestamp, AntiReplay, Frame,
    FrameType,
};
use super::super::rate_limit::RateLimiter;
use super::{
    is_download_stream_command, is_upload_stream_command, ConnectionPhase,
    DEFAULT_SESSION_MAX_DURATION, HEARTBEAT_INTERVAL, IDLE_TIMEOUT, MAX_REQUESTS_PER_MINUTE,
    MAX_WS_MESSAGE_SIZE, STREAM_CHUNK_SIZE,
};

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

            // --- Capability grant enforcement ---
            let capability_denied: Option<String> = {
              let grant_id = req.data.get("_grant_id").and_then(|v| v.as_str());
              let origin = req.data.get("_origin").and_then(|v| v.as_str());
              let node_id_val = req.data.get("node_id").and_then(|v| v.as_u64());

              let state = app_handle.state::<crate::AppState>();
              let mut st = match state.gateway.lock() {
                Ok(g) => g,
                Err(_) => break,
              };
              check_capability(
                &mut st,
                &ext_id,
                &req.command,
                grant_id,
                origin,
                node_id_val,
              ).err()
            };
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
              // First frame is JSON metadata. Extract offset/size for per-chunk routing.
              let node_id = req.data.get("node_id").and_then(|v| v.as_str()).unwrap_or("").to_string();
              let total_size = req.data.get("size").and_then(|v| v.as_u64()).unwrap_or(0);
              let mut offset = req.data.get("offset").and_then(|v| v.as_u64()).unwrap_or(0);
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

                let chunk_data = chunk_frame.payload.clone();
                let chunk_len = chunk_data.len() as u64;

                // Build per-chunk RpcRequest for the adapter.
                let chunk_req = RpcRequest {
                  v: chromvoid_core::rpc::types::PROTOCOL_VERSION,
                  command: command.clone(),
                  data: serde_json::json!({
                    "node_id": node_id,
                    "offset": offset,
                    "size": total_size,
                  }),
                };

                let reply = {
                  let state = app_handle.state::<crate::AppState>();
                  let mut adapter = match state.adapter.lock() {
                    Ok(g) => g,
                    Err(_) => { stream_ok = false; break; }
                  };
                  let r = adapter.handle_with_stream(
                    &chunk_req,
                    Some(RpcInputStream::from_bytes(chunk_data)),
                  );
                  let events = adapter.take_events();
                  (r, events)
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
                if !chunk_frame.has_continuation() {
                  break;
                }
              }

              anti_replay.clear_active_stream();

              let save_error = {
                let state = app_handle.state::<crate::AppState>();
                let save_error = match state.adapter.lock() {
                  Ok(mut adapter) => adapter.save().err(),
                  Err(_) => Some("Adapter mutex poisoned".to_string()),
                };
                save_error
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
              let reply = {
                let state = app_handle.state::<crate::AppState>();
                let mut adapter = match state.adapter.lock() {
                  Ok(g) => g,
                  Err(_) => break,
                };
                let r = adapter.handle_with_stream(&req, None);
                let _ = adapter.save();
                let events = adapter.take_events();
                (r, events)
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
                  let mut reader = output.reader;
                  let mut current_buf = vec![0u8; STREAM_CHUNK_SIZE];
                  let mut n = match reader.read(&mut current_buf) {
                    Ok(n) => n,
                    Err(_) => {
                      // Send empty final frame on read error.
                      let final_frame = frame_continuation(
                        FrameType::RpcResponse, frame.message_id, vec![], false,
                      );
                      let _ = send_encrypted_frame!(transport, write, final_frame);
                      continue;
                    }
                  };

                  while n > 0 {
                    let mut next_buf = vec![0u8; STREAM_CHUNK_SIZE];
                    let next_n = reader.read(&mut next_buf).unwrap_or(0);
                    let has_more = next_n > 0;

                    let chunk_frame = frame_continuation(
                      FrameType::RpcResponse,
                      frame.message_id,
                      current_buf[..n].to_vec(),
                      has_more,
                    );
                    if send_encrypted_frame!(transport, write, chunk_frame).is_err() {
                      break;
                    }

                    current_buf = next_buf;
                    n = next_n;
                  }
                }
                RpcReply::Json(resp) => {
                  // Non-streaming response (e.g. error).
                  let response_frame = frame_from_rpc_response(frame.message_id, &resp);
                  if send_encrypted_frame!(transport, write, response_frame).is_err() {
                    break;
                  }
                }
              }
            }
            // --- Normal (non-streaming) RPC ---
            else {
              let resp = {
                let state = app_handle.state::<crate::AppState>();
                let mut adapter = match state.adapter.lock() {
                  Ok(g) => g,
                  Err(_) => break,
                };

                let rpc = adapter.handle(&req);
                let _ = adapter.save();
                let events = adapter.take_events();
                (rpc, events)
              };

              let response_frame = frame_from_rpc_response(frame.message_id, &resp.0);
              if send_encrypted_frame!(transport, write, response_frame).is_err() {
                break;
              }

              // Push events.
              for evt in resp.1 {
                let Some(obj) = evt.as_object() else { continue };
                let Some(cmd) = obj.get("command").and_then(|v| v.as_str()) else { continue };
                let payload = obj.get("data").cloned().unwrap_or(serde_json::Value::Null);
                server_msg_id = server_msg_id.wrapping_add(1).max(1);
                let ev_frame = frame_from_event(server_msg_id, cmd, payload);
                if send_encrypted_frame!(transport, write, ev_frame).is_err() {
                  break;
                }
              }

              if req.command == "vault:lock" {
                let app_state = app_handle.state::<crate::AppState>();
                let gw_arc = app_state.gateway.clone();
                let vm_arc = app_state.volume_manager.clone();
                let ssh_arc = app_state.ssh_agent.clone();
                drop(app_state);
                {
                  let mut gw = match gw_arc.lock() {
                    Ok(g) => g,
                    Err(_) => continue,
                  };
                  gw.revoke_all_grants();
                }
                if let Ok(mut agent) = ssh_arc.lock() {
                    agent.stop();
                }
                crate::credential_provider_bridge::on_vault_locked();
                let _ = app_handle.emit("vault:locked", serde_json::json!({"reason": "gateway"}));
                let backend = match vm_arc.lock() {
                  Ok(mut vm) => {
                    let _ = vm.notify_locked();
                    let st = crate::commands::volume_ops::volume_status_from_vm(&vm);
                    let _ = app_handle.emit("volume:status", &st);
                    vm.take_backend()
                  }
                  Err(_) => None,
                };

                if let Some(h) = backend {
                  tauri::async_runtime::spawn(async move {
                    let _ = tokio::time::timeout(std::time::Duration::from_secs(3), h.join()).await;
                  });
                }
              }
            }
          }
        }
    }
}
