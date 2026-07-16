use std::collections::HashSet;
use std::time::{Duration, Instant};

use chromvoid_protocol::{
    agent_frame_fragments, AgentCommandV1, AgentConnectionStatusV1, AgentEnvStatusV1, AgentErrorV1,
    AgentEventDataV1, AgentEventV1, AgentFrameReassembler, AgentHelloV1, AgentProposalMetadataV1,
    AgentProposalStatusV1, AgentRequestV1, AgentResponseDataV1, AgentResponseV1, AgentWireError,
    AGENT_FRAGMENT_REASSEMBLY_TIMEOUT_SECS, AGENT_MAX_REQUEST_BYTES, AGENT_MAX_RESPONSE_BYTES,
    AGENT_PROTOCOL_VERSION, AGENT_SCHEMA_VERSION, MAX_HANDSHAKE_MSG,
};
use futures_util::{SinkExt, StreamExt};
use tauri::{Emitter, Manager};
use tokio_tungstenite::tungstenite::protocol::Message;
use tracing::{debug, warn, Instrument as _};

use super::super::protocol::{
    error_codes, frame_from_agent_event, frame_from_agent_response, frame_from_error,
    frame_from_heartbeat, validate_timestamp, AntiReplay, Frame, FrameType,
};
use super::super::rate_limit::RateLimiter;
use super::{
    DEFAULT_SESSION_MAX_DURATION, HEARTBEAT_INTERVAL, IDLE_TIMEOUT, MAX_REQUESTS_PER_MINUTE,
};

const AGENT_MAX_CIPHERTEXT_BYTES: usize = MAX_HANDSHAKE_MSG;
const MAX_SESSION_REQUEST_IDS: usize = 32 * 1024;

struct GatewayRequestTracker {
    runtime: std::sync::Arc<crate::env_runtime::EnvRuntimeState>,
    audit: crate::env_runtime::GatewayRequestAudit,
    started: Instant,
    recorded: bool,
}

impl GatewayRequestTracker {
    fn new(
        runtime: std::sync::Arc<crate::env_runtime::EnvRuntimeState>,
        audit: crate::env_runtime::GatewayRequestAudit,
        started: Instant,
    ) -> Self {
        Self {
            runtime,
            audit,
            started,
            recorded: false,
        }
    }

    fn span(&self) -> tracing::Span {
        self.audit.span()
    }

    fn record(
        &mut self,
        response: &AgentResponseV1,
        decision: crate::env_runtime::RequestDecision,
    ) {
        self.record_outcome(
            decision,
            response.error.as_ref().map(|error| error.code.as_str()),
        );
    }

    fn record_success(&mut self) {
        self.record_outcome(crate::env_runtime::RequestDecision::Accepted, None);
    }

    fn record_error_code(&mut self, error_code: &str) {
        self.record_outcome(crate::env_runtime::RequestDecision::Error, Some(error_code));
    }

    fn record_outcome(
        &mut self,
        decision: crate::env_runtime::RequestDecision,
        error_code: Option<&str>,
    ) {
        if self.recorded {
            return;
        }
        self.recorded = true;
        self.runtime.observability().record_gateway_request(
            &self.audit,
            decision,
            error_code,
            self.started.elapsed().as_millis() as u64,
        );
    }
}

impl Drop for GatewayRequestTracker {
    fn drop(&mut self) {
        self.record_outcome(
            crate::env_runtime::RequestDecision::Error,
            Some("SESSION_DISCONNECTED"),
        );
    }
}

pub(in crate::gateway) async fn handle_agent_session(
    mut transport: snow::TransportState,
    actor_id: String,
    app_handle: tauri::AppHandle,
    mut write: futures_util::stream::SplitSink<
        tokio_tungstenite::WebSocketStream<tokio::net::TcpStream>,
        Message,
    >,
    mut read: futures_util::stream::SplitStream<
        tokio_tungstenite::WebSocketStream<tokio::net::TcpStream>,
    >,
) {
    let session_id = uuid::Uuid::new_v4().to_string();
    let actor_id_hash = crate::env_runtime::hash_identifier(&actor_id);
    let mut anti_replay = AntiReplay::new();
    let mut server_message_id = rand::random::<u64>().max(1);
    let mut rate_limiter = RateLimiter::new(MAX_REQUESTS_PER_MINUTE, 60_000);
    let mut request_ids = HashSet::new();
    let mut request_reassembler = AgentFrameReassembler::new(AGENT_MAX_REQUEST_BYTES);
    let mut request_fragment_deadline = None;
    let session_max_duration = {
        let state = app_handle.state::<crate::AppState>();
        state
            .gateway
            .lock()
            .ok()
            .map(|gateway| {
                Duration::from_secs(gateway.config.session_max_duration_mins as u64 * 60)
            })
            .filter(|duration| {
                *duration >= Duration::from_secs(15 * 60)
                    && *duration <= Duration::from_secs(240 * 60)
            })
            .unwrap_or(DEFAULT_SESSION_MAX_DURATION)
    };
    let started = tokio::time::Instant::now();
    let mut heartbeat = tokio::time::interval(HEARTBEAT_INTERVAL);
    heartbeat.tick().await;

    loop {
        if started.elapsed() > session_max_duration {
            let frame = frame_from_error(
                server_message_id,
                error_codes::AUTH_FAILED,
                "session expired",
            );
            let _ = send_frame(&mut transport, &mut write, frame).await;
            break;
        }

        let inbound_timeout = request_fragment_deadline
            .map(|deadline: tokio::time::Instant| {
                deadline.saturating_duration_since(tokio::time::Instant::now())
            })
            .unwrap_or(IDLE_TIMEOUT);
        tokio::select! {
            _ = heartbeat.tick() => {
                server_message_id = server_message_id.wrapping_add(1).max(1);
                if send_frame(
                    &mut transport,
                    &mut write,
                    frame_from_heartbeat(server_message_id),
                )
                .await
                .is_err()
                {
                    break;
                }
            }
            incoming = tokio::time::timeout(inbound_timeout, read.next()) => {
                let message = match incoming {
                    Ok(Some(Ok(message))) => message,
                    Ok(Some(Err(error))) => {
                        debug!(
                            actor_id_hash = %actor_id_hash,
                            error = %error,
                            "[gateway][agent] websocket error"
                        );
                        break;
                    }
                    Ok(None) => break,
                    Err(_) if request_reassembler.is_reassembling() => {
                        server_message_id = server_message_id.wrapping_add(1).max(1);
                        let _ = send_frame(
                            &mut transport,
                            &mut write,
                            frame_from_error(
                                server_message_id,
                                error_codes::INVALID_FORMAT,
                                "fragmented agent request timed out",
                            ),
                        )
                        .await;
                        break;
                    }
                    Err(_) => break,
                };
                let Message::Binary(ciphertext) = message else {
                    continue;
                };
                if ciphertext.len() > AGENT_MAX_CIPHERTEXT_BYTES {
                    warn!(
                        actor_id_hash = %actor_id_hash,
                        "[gateway][agent] oversized request"
                    );
                    server_message_id = server_message_id.wrapping_add(1).max(1);
                    let _ = send_frame(
                        &mut transport,
                        &mut write,
                        frame_from_error(
                            server_message_id,
                            error_codes::INVALID_FORMAT,
                            "agent request exceeds the encrypted frame limit",
                        ),
                    )
                    .await;
                    break;
                }
                let mut plaintext = vec![0_u8; ciphertext.len()];
                let plaintext_len = match transport.read_message(ciphertext.as_ref(), &mut plaintext) {
                    Ok(length) => length,
                    Err(_) => break,
                };
                plaintext.truncate(plaintext_len);
                let physical_frame = match Frame::decode(&plaintext) {
                    Ok(frame) => frame,
                    Err(_) => {
                        server_message_id = server_message_id.wrapping_add(1).max(1);
                        let _ = send_frame(
                            &mut transport,
                            &mut write,
                            frame_from_error(
                                server_message_id,
                                error_codes::INVALID_FORMAT,
                                "invalid agent request frame",
                            ),
                        )
                        .await;
                        break;
                    }
                };
                let fragment_message_id = physical_frame.message_id;
                let was_reassembling = request_reassembler.is_reassembling();
                let frame = match request_reassembler.push(physical_frame) {
                    Ok(Some(frame)) => {
                        request_fragment_deadline = None;
                        frame
                    }
                    Ok(None) => {
                        if !was_reassembling {
                            request_fragment_deadline = Some(
                                tokio::time::Instant::now()
                                    + Duration::from_secs(
                                        AGENT_FRAGMENT_REASSEMBLY_TIMEOUT_SECS,
                                    ),
                            );
                        }
                        continue;
                    }
                    Err(AgentWireError::MessageTooLarge) => {
                        let response = AgentResponseV1::error(
                            "unknown",
                            protocol_error(
                                "REQUEST_TOO_LARGE",
                                "Agent request exceeds 256 KiB",
                            ),
                        );
                        let _ = send_frame(
                            &mut transport,
                            &mut write,
                            frame_from_agent_response(fragment_message_id, &response),
                        )
                        .await;
                        break;
                    }
                    Err(_) => {
                        server_message_id = server_message_id.wrapping_add(1).max(1);
                        let _ = send_frame(
                            &mut transport,
                            &mut write,
                            frame_from_error(
                                server_message_id,
                                error_codes::INVALID_FORMAT,
                                "invalid agent continuation sequence",
                            ),
                        )
                        .await;
                        break;
                    }
                };
                if frame.frame_type == FrameType::Heartbeat {
                    continue;
                }
                if frame.frame_type != FrameType::RpcRequest {
                    let response = AgentResponseV1::error(
                        request_id_probe(&frame.payload),
                        protocol_error("INVALID_REQUEST", "Expected an agent request frame"),
                    );
                    let _ = send_frame(
                        &mut transport,
                        &mut write,
                        frame_from_agent_response(frame.message_id, &response),
                    )
                    .await;
                    break;
                }
                if frame.payload.len() > AGENT_MAX_REQUEST_BYTES {
                    let response = AgentResponseV1::error(
                        request_id_probe(&frame.payload),
                        protocol_error("REQUEST_TOO_LARGE", "Agent request exceeds 256 KiB"),
                    );
                    let _ = send_frame(
                        &mut transport,
                        &mut write,
                        frame_from_agent_response(frame.message_id, &response),
                    )
                    .await;
                    break;
                }
                if anti_replay.check(frame.message_id).is_err() {
                    let _ = send_frame(
                        &mut transport,
                        &mut write,
                        frame_from_error(
                            frame.message_id,
                            error_codes::REPLAY_DETECTED,
                            "duplicate or stale agent frame",
                        ),
                    )
                    .await;
                    break;
                }
                let request: AgentRequestV1 = match serde_json::from_slice(&frame.payload) {
                    Ok(request) => request,
                    Err(_) => {
                        let response = AgentResponseV1::error(
                            "unknown",
                            protocol_error("INVALID_REQUEST", "Invalid agent request"),
                        );
                        let _ = send_frame(
                            &mut transport,
                            &mut write,
                            frame_from_agent_response(frame.message_id, &response),
                        )
                        .await;
                        break;
                    }
                };
                let request_started = Instant::now();
                let request_audit =
                    crate::env_runtime::GatewayRequestAudit::new(&request, &actor_id);
                let mut request_tracker = GatewayRequestTracker::new(
                    app_handle.state::<crate::AppState>().env_runtime.clone(),
                    request_audit,
                    request_started,
                );
                if let Some(response) = invalid_request_id_response(&request, &mut request_ids) {
                    request_tracker.record(
                        &response,
                        crate::env_runtime::RequestDecision::Denied,
                    );
                    let _ = send_frame(
                        &mut transport,
                        &mut write,
                        frame_from_agent_response(frame.message_id, &response),
                    )
                    .await;
                    break;
                }
                if !rate_limiter.check() {
                    let response = AgentResponseV1::error(
                        request.request_id,
                        protocol_error("RATE_LIMITED", "Agent request rate exceeded"),
                    );
                    request_tracker.record(
                        &response,
                        crate::env_runtime::RequestDecision::Denied,
                    );
                    let _ = send_frame(
                        &mut transport,
                        &mut write,
                        frame_from_agent_response(frame.message_id, &response),
                    )
                    .await;
                    break;
                }
                if matches!(&request.command, AgentCommandV1::ProposalWait { .. }) {
                    let request_span = request_tracker.span();
                    let keep_session = handle_proposal_wait(
                        &app_handle,
                        &actor_id,
                        request,
                        frame.message_id,
                        &mut server_message_id,
                        &mut transport,
                        &mut write,
                        &mut read,
                        &mut anti_replay,
                        &mut rate_limiter,
                        &mut request_ids,
                        request_tracker,
                    )
                    .instrument(request_span)
                    .await;
                    if !keep_session {
                        break;
                    }
                    continue;
                }
                if matches!(&request.command, AgentCommandV1::Run { .. }) {
                    let request_span = request_tracker.span();
                    let keep_session = handle_run_request(
                        &app_handle,
                        &actor_id,
                        &session_id,
                        request,
                        frame.message_id,
                        &mut server_message_id,
                        &mut transport,
                        &mut write,
                        &mut read,
                        &mut anti_replay,
                        &mut rate_limiter,
                        &mut request_ids,
                        request_tracker,
                    )
                    .instrument(request_span)
                    .await;
                    if !keep_session {
                        break;
                    }
                    continue;
                }
                let request_span = request_tracker.span();
                let response = dispatch_request(
                    &app_handle,
                    &actor_id,
                    &session_id,
                    request,
                )
                .instrument(request_span)
                .await;
                let decision = if response.ok {
                    crate::env_runtime::RequestDecision::Accepted
                } else {
                    crate::env_runtime::RequestDecision::Error
                };
                request_tracker.record(&response, decision);
                if send_frame(
                    &mut transport,
                    &mut write,
                    frame_from_agent_response(frame.message_id, &response),
                )
                .await
                .is_err()
                {
                    break;
                }
            }
        }
    }

    app_handle
        .state::<crate::AppState>()
        .env_runtime
        .stop_runs_for_session(&session_id)
        .await;
}

#[allow(clippy::too_many_arguments)]
async fn handle_proposal_wait(
    app_handle: &tauri::AppHandle,
    actor_id: &str,
    request: AgentRequestV1,
    frame_message_id: u64,
    server_message_id: &mut u64,
    transport: &mut snow::TransportState,
    write: &mut futures_util::stream::SplitSink<
        tokio_tungstenite::WebSocketStream<tokio::net::TcpStream>,
        Message,
    >,
    read: &mut futures_util::stream::SplitStream<
        tokio_tungstenite::WebSocketStream<tokio::net::TcpStream>,
    >,
    anti_replay: &mut AntiReplay,
    rate_limiter: &mut RateLimiter,
    request_ids: &mut HashSet<String>,
    mut request_tracker: GatewayRequestTracker,
) -> bool {
    let request_id = request.request_id.clone();
    if request.protocol_version != AGENT_PROTOCOL_VERSION
        || request.schema_version != AGENT_SCHEMA_VERSION
    {
        return send_run_error_response(
            transport,
            write,
            frame_message_id,
            &request_id,
            "UNSUPPORTED_VERSION",
            "Unsupported agent protocol version",
            &mut request_tracker,
        )
        .await;
    }
    if validate_timestamp(request.timestamp_secs).is_err() {
        return send_run_error_response(
            transport,
            write,
            frame_message_id,
            &request_id,
            "INVALID_REQUEST",
            "Request timestamp is outside the allowed window",
            &mut request_tracker,
        )
        .await;
    }
    let AgentCommandV1::ProposalWait { proposal_id } = request.command else {
        return false;
    };
    let state = app_handle.state::<crate::AppState>();
    if let Err(error) = ensure_agent_active(&state, actor_id) {
        return send_env_error_response(
            transport,
            write,
            frame_message_id,
            &request_id,
            error,
            AgentErrorContext::Generic,
            &mut request_tracker,
        )
        .await;
    }
    if let Err(error) = crate::pro::guard_pro_feature_async(
        &state,
        chromvoid_core::license::PRO_FEATURE_ENV_RUNTIME,
    )
    .await
    {
        return send_env_error_response(
            transport,
            write,
            frame_message_id,
            &request_id,
            env_runtime_error_from_rpc_result(error),
            AgentErrorContext::Generic,
            &mut request_tracker,
        )
        .await;
    }

    let (metadata, mut proposal_outcome) = match state
        .env_runtime
        .lookup_or_subscribe_proposal(&proposal_id, actor_id)
    {
        Ok(crate::env_runtime::ProposalLookup::Terminal(metadata)) => {
            let response = proposal_terminal_response(&request_id, metadata);
            let decision = if response.ok {
                crate::env_runtime::RequestDecision::Accepted
            } else {
                crate::env_runtime::RequestDecision::Error
            };
            request_tracker.record(&response, decision);
            return send_frame(
                transport,
                write,
                frame_from_agent_response(frame_message_id, &response),
            )
            .await
            .is_ok();
        }
        Ok(crate::env_runtime::ProposalLookup::Pending { metadata, outcome }) => {
            (metadata, outcome)
        }
        Err(error) => {
            let error = agent_error_from_runtime(error, AgentErrorContext::Proposal);
            let response = AgentResponseV1::error(&request_id, error);
            request_tracker.record(&response, crate::env_runtime::RequestDecision::Error);
            return send_frame(
                transport,
                write,
                frame_from_agent_response(frame_message_id, &response),
            )
            .await
            .is_ok();
        }
    };
    let expires_in = metadata
        .expires_at_epoch_ms
        .saturating_sub(crate::gateway::state::now_ms());
    let expiry = tokio::time::sleep(Duration::from_millis(expires_in));
    tokio::pin!(expiry);
    let mut expiry_elapsed = false;
    let mut heartbeat = tokio::time::interval(HEARTBEAT_INTERVAL);
    heartbeat.tick().await;
    loop {
        tokio::select! {
            changed = proposal_outcome.changed() => {
                let Some(metadata) = proposal_outcome.borrow_and_update().clone() else {
                    if changed.is_err() {
                        return false;
                    }
                    continue;
                };
                let response = proposal_terminal_response(&request_id, metadata);
                let decision = if response.ok {
                    crate::env_runtime::RequestDecision::Accepted
                } else {
                    crate::env_runtime::RequestDecision::Error
                };
                request_tracker.record(&response, decision);
                return send_frame(
                    transport,
                    write,
                    frame_from_agent_response(frame_message_id, &response),
                )
                .await
                .is_ok();
            }
            _ = &mut expiry, if !expiry_elapsed => {
                expiry_elapsed = true;
                if state.env_runtime.collect_expired().is_err() {
                    return false;
                }
                let final_outcome = { proposal_outcome.borrow_and_update().clone() };
                if let Some(metadata) = final_outcome {
                    let response = proposal_terminal_response(&request_id, metadata);
                    request_tracker.record(&response, crate::env_runtime::RequestDecision::Error);
                    return send_frame(
                        transport,
                        write,
                        frame_from_agent_response(frame_message_id, &response),
                    )
                    .await
                    .is_ok();
                }
                // Applying proposals are deliberately immune to GC. Once this
                // waiter is subscribed it must keep waiting for the single
                // terminal transition even when validation crosses the TTL.
            }
            _ = heartbeat.tick() => {
                if let Err(error) = ensure_agent_active(&state, actor_id) {
                    return send_env_error_response(
                        transport,
                        write,
                        frame_message_id,
                        &request_id,
                        error,
                        AgentErrorContext::Generic,
                        &mut request_tracker,
                    )
                    .await;
                }
                *server_message_id = (*server_message_id).wrapping_add(1).max(1);
                if send_frame(
                    transport,
                    write,
                    frame_from_heartbeat(*server_message_id),
                )
                .await
                .is_err()
                {
                    return false;
                }
            }
            incoming = read.next() => {
                let Some(Ok(message)) = incoming else {
                    return false;
                };
                let Ok(Some((control_frame, control))) = parse_agent_message(
                    message,
                    transport,
                    anti_replay,
                    rate_limiter,
                ) else {
                    return false;
                };
                if let Some(response) = invalid_control_response(&control, request_ids) {
                    if send_frame(
                        transport,
                        write,
                        frame_from_agent_response(control_frame.message_id, &response),
                    )
                    .await
                    .is_err()
                    {
                        return false;
                    }
                    continue;
                }
                let response = AgentResponseV1::error(
                    control.request_id,
                    protocol_error(
                        "INVALID_REQUEST",
                        "Another request cannot start while proposal wait is active",
                    ),
                );
                if send_frame(
                    transport,
                    write,
                    frame_from_agent_response(control_frame.message_id, &response),
                )
                .await
                .is_err()
                {
                    return false;
                }
            }
        }
    }
}

fn proposal_terminal_response(
    request_id: &str,
    metadata: AgentProposalMetadataV1,
) -> AgentResponseV1 {
    match metadata.status {
        AgentProposalStatusV1::Approved => {
            AgentResponseV1::success(request_id, AgentResponseDataV1::Proposal(metadata))
        }
        AgentProposalStatusV1::Rejected => AgentResponseV1::error(
            request_id,
            protocol_error("PROPOSAL_REJECTED", "Proposal was rejected in ChromVoid"),
        ),
        AgentProposalStatusV1::Expired => AgentResponseV1::error(
            request_id,
            protocol_error("PROPOSAL_EXPIRED", "Proposal approval expired"),
        ),
        AgentProposalStatusV1::Stale => AgentResponseV1::error(
            request_id,
            protocol_error("REVISION_CONFLICT", "Proposal became stale before approval"),
        ),
        AgentProposalStatusV1::Pending => AgentResponseV1::error(
            request_id,
            protocol_error("INTERNAL", "Proposal outcome was not terminal"),
        ),
    }
}

#[allow(clippy::too_many_arguments)]
async fn handle_run_request(
    app_handle: &tauri::AppHandle,
    actor_id: &str,
    session_id: &str,
    request: AgentRequestV1,
    frame_message_id: u64,
    server_message_id: &mut u64,
    transport: &mut snow::TransportState,
    write: &mut futures_util::stream::SplitSink<
        tokio_tungstenite::WebSocketStream<tokio::net::TcpStream>,
        Message,
    >,
    read: &mut futures_util::stream::SplitStream<
        tokio_tungstenite::WebSocketStream<tokio::net::TcpStream>,
    >,
    anti_replay: &mut AntiReplay,
    rate_limiter: &mut RateLimiter,
    request_ids: &mut HashSet<String>,
    mut request_tracker: GatewayRequestTracker,
) -> bool {
    let request_id = request.request_id.clone();
    if request.protocol_version != AGENT_PROTOCOL_VERSION
        || request.schema_version != AGENT_SCHEMA_VERSION
    {
        return send_run_error_response(
            transport,
            write,
            frame_message_id,
            &request_id,
            "UNSUPPORTED_VERSION",
            "Unsupported agent protocol version",
            &mut request_tracker,
        )
        .await;
    }
    if validate_timestamp(request.timestamp_secs).is_err() {
        return send_run_error_response(
            transport,
            write,
            frame_message_id,
            &request_id,
            "INVALID_REQUEST",
            "Request timestamp is outside the allowed window",
            &mut request_tracker,
        )
        .await;
    }
    let state = app_handle.state::<crate::AppState>();
    if let Err(error) = ensure_agent_active(&state, actor_id) {
        return send_env_error_response(
            transport,
            write,
            frame_message_id,
            &request_id,
            error,
            AgentErrorContext::Generic,
            &mut request_tracker,
        )
        .await;
    }
    if let Err(error) = crate::pro::guard_pro_feature_async(
        &state,
        chromvoid_core::license::PRO_FEATURE_ENV_RUNTIME,
    )
    .await
    {
        let response = AgentResponseV1::error(
            request_id,
            agent_error_from_runtime(
                env_runtime_error_from_rpc_result(error),
                AgentErrorContext::Generic,
            ),
        );
        request_tracker.record(&response, crate::env_runtime::RequestDecision::Error);
        return send_frame(
            transport,
            write,
            frame_from_agent_response(frame_message_id, &response),
        )
        .await
        .is_ok();
    }
    let AgentCommandV1::Run {
        profile,
        preset,
        reason,
    } = request.command
    else {
        return false;
    };

    let profile = match core_profile_get(&state, actor_id, &profile).await {
        Ok(profile) => profile,
        Err(error) => {
            return send_env_error_response(
                transport,
                write,
                frame_message_id,
                &request_id,
                error,
                AgentErrorContext::Profile,
                &mut request_tracker,
            )
            .await
        }
    };
    let preset = match state.env_runtime.get_preset(&preset) {
        Ok(preset) => preset,
        Err(error) => {
            return send_env_error_response(
                transport,
                write,
                frame_message_id,
                &request_id,
                error,
                AgentErrorContext::Preset,
                &mut request_tracker,
            )
            .await
        }
    };
    let secret_labels = match core_secret_list(&state, actor_id).await {
        Ok(secrets) => secrets
            .into_iter()
            .map(|secret| (secret.id, secret.label))
            .collect(),
        Err(error) => {
            return send_env_error_response(
                transport,
                write,
                frame_message_id,
                &request_id,
                error,
                AgentErrorContext::Generic,
                &mut request_tracker,
            )
            .await
        }
    };
    if let Err(error) = state.env_runtime.collect_expired() {
        return send_env_error_response(
            transport,
            write,
            frame_message_id,
            &request_id,
            error,
            AgentErrorContext::Generic,
            &mut request_tracker,
        )
        .await;
    }
    let mut ticket = match with_env_runtime_agent_boundary(&state, actor_id, |actor_label| {
        state.env_runtime.request_run(
            actor_id.to_string(),
            actor_label,
            session_id.to_string(),
            profile,
            preset,
            &secret_labels,
            reason,
        )
    }) {
        Ok(ticket) => ticket,
        Err(error) => {
            return send_env_error_response(
                transport,
                write,
                frame_message_id,
                &request_id,
                error,
                AgentErrorContext::Generic,
                &mut request_tracker,
            )
            .await
        }
    };
    let run_id = ticket.snapshot.run.id.clone();
    let response = AgentResponseV1::success(
        request_id.clone(),
        AgentResponseDataV1::Run(ticket.snapshot.run.clone()),
    );
    if send_frame(
        transport,
        write,
        frame_from_agent_response(frame_message_id, &response),
    )
    .await
    .is_err()
    {
        let _ = state
            .env_runtime
            .resolve_run_approval(&run_id, crate::env_runtime::RunApprovalDecision::Cancelled);
        return false;
    }
    let mut event_sequence = 1_u64;
    if send_agent_event(
        transport,
        write,
        server_message_id,
        AgentEventV1 {
            schema_version: AGENT_SCHEMA_VERSION,
            request_id: request_id.clone(),
            sequence: event_sequence,
            event: AgentEventDataV1::ApprovalPending {
                run_id: run_id.clone(),
                expires_at_epoch_ms: ticket.snapshot.expires_at_epoch_ms,
            },
        },
    )
    .await
    .is_err()
    {
        let _ = state
            .env_runtime
            .resolve_run_approval(&run_id, crate::env_runtime::RunApprovalDecision::Cancelled);
        return false;
    }
    let _ = app_handle.emit("env-runtime:run-approval", &ticket.snapshot);
    let mut decision = ticket
        .decision
        .take()
        .expect("new run ticket must carry an approval receiver");
    let now_ms = crate::gateway::state::now_ms();
    let timeout_ms = ticket.snapshot.expires_at_epoch_ms.saturating_sub(now_ms);
    let approval_timeout = tokio::time::sleep(Duration::from_millis(timeout_ms));
    tokio::pin!(approval_timeout);
    let approval_decision = loop {
        tokio::select! {
            decision = &mut decision => {
                break decision.unwrap_or(crate::env_runtime::RunApprovalDecision::Cancelled);
            }
            _ = &mut approval_timeout => {
                break resolve_timeout_or_observe_approval_owner(
                    state.env_runtime.as_ref(),
                    &run_id,
                    &mut decision,
                ).await;
            }
            incoming = read.next() => {
                let Some(Ok(message)) = incoming else {
                    let _ = state.env_runtime.resolve_run_approval(
                        &run_id,
                        crate::env_runtime::RunApprovalDecision::Cancelled,
                    );
                    return false;
                };
                let parsed = parse_agent_message(
                    message,
                    transport,
                    anti_replay,
                    rate_limiter,
                );
                let (control_frame, control) = match parsed {
                    Ok(Some(parsed)) => parsed,
                    Ok(None) => continue,
                    Err(()) => {
                        let _ = state.env_runtime.resolve_run_approval(
                            &run_id,
                            crate::env_runtime::RunApprovalDecision::Cancelled,
                        );
                        return false;
                    }
                };
                if handle_pending_run_control(
                    &state,
                    actor_id,
                    &run_id,
                    control_frame.message_id,
                    control,
                    request_ids,
                    transport,
                    write,
                )
                .await
                {
                    continue;
                }
            }
        }
    };
    if approval_decision != crate::env_runtime::RunApprovalDecision::Approve {
        let (code, message) = match approval_decision {
            crate::env_runtime::RunApprovalDecision::Reject => {
                ("APPROVAL_REJECTED", "Run was rejected in ChromVoid")
            }
            crate::env_runtime::RunApprovalDecision::Expired => {
                ("APPROVAL_EXPIRED", "Run approval expired")
            }
            crate::env_runtime::RunApprovalDecision::Cancelled => {
                ("CANCELLED", "Run approval was cancelled")
            }
            crate::env_runtime::RunApprovalDecision::Approve => unreachable!("handled above"),
        };
        request_tracker.record_error_code(code);
        event_sequence = event_sequence.saturating_add(1);
        let _ = send_agent_event(
            transport,
            write,
            server_message_id,
            agent_error_event(&request_id, event_sequence, code, message),
        )
        .await;
        return true;
    }

    let mut events = match resolve_and_start_run(&state, actor_id.to_string(), ticket).await {
        Ok(events) => events,
        Err(error) => {
            request_tracker.record_error_code(error.code.as_str());
            event_sequence = event_sequence.saturating_add(1);
            let _ = send_agent_event(
                transport,
                write,
                server_message_id,
                AgentEventV1 {
                    schema_version: AGENT_SCHEMA_VERSION,
                    request_id: request_id.clone(),
                    sequence: event_sequence,
                    event: AgentEventDataV1::Error(agent_error_from_runtime(
                        error,
                        AgentErrorContext::Generic,
                    )),
                },
            )
            .await;
            return true;
        }
    };
    let mut run_error_code = None;
    loop {
        tokio::select! {
            event = events.recv() => {
                let Some(event) = event else {
                    return true;
                };
                if let AgentEventDataV1::Error(error) = &event {
                    run_error_code = Some(error.code.clone());
                }
                let finished = matches!(event, AgentEventDataV1::RunExited { .. });
                event_sequence = event_sequence.saturating_add(1);
                if send_agent_event(
                    transport,
                    write,
                    server_message_id,
                    AgentEventV1 {
                        schema_version: AGENT_SCHEMA_VERSION,
                        request_id: request_id.clone(),
                        sequence: event_sequence,
                        event,
                    },
                )
                .await
                .is_err()
                {
                    return false;
                }
                if finished {
                    if let Some(error_code) = run_error_code.as_deref() {
                        request_tracker.record_error_code(error_code);
                    } else {
                        request_tracker.record_success();
                    }
                    return true;
                }
            }
            incoming = read.next() => {
                let Some(Ok(message)) = incoming else {
                    return false;
                };
                let parsed = parse_agent_message(
                    message,
                    transport,
                    anti_replay,
                    rate_limiter,
                );
                let (control_frame, control) = match parsed {
                    Ok(Some(parsed)) => parsed,
                    Ok(None) => continue,
                    Err(()) => return false,
                };
                handle_active_run_control(
                    &state,
                    actor_id,
                    &run_id,
                    control_frame.message_id,
                    control,
                    request_ids,
                    transport,
                    write,
                )
                .await;
            }
        }
    }
}

async fn dispatch_request(
    app_handle: &tauri::AppHandle,
    actor_id: &str,
    session_id: &str,
    request: AgentRequestV1,
) -> AgentResponseV1 {
    if request.protocol_version != AGENT_PROTOCOL_VERSION
        || request.schema_version != AGENT_SCHEMA_VERSION
    {
        return AgentResponseV1::error(
            request.request_id,
            protocol_error("UNSUPPORTED_VERSION", "Unsupported agent protocol version"),
        );
    }
    if validate_timestamp(request.timestamp_secs).is_err() {
        return AgentResponseV1::error(
            request.request_id,
            protocol_error(
                "INVALID_REQUEST",
                "Request timestamp is outside the allowed window",
            ),
        );
    }

    let state = app_handle.state::<crate::AppState>();
    if let Err(error) = ensure_agent_active(&state, actor_id) {
        return AgentResponseV1::error(
            request.request_id,
            agent_error_from_runtime(error, AgentErrorContext::Generic),
        );
    }
    let access_visible_without_entitlement = matches!(
        &request.command,
        AgentCommandV1::Hello { .. }
            | AgentCommandV1::ConnectionStatus
            | AgentCommandV1::EnvStatus
            | AgentCommandV1::RunsList
            | AgentCommandV1::RunStop { .. }
            | AgentCommandV1::RunsStopAll
    );
    if !access_visible_without_entitlement {
        if let Err(error) = crate::pro::guard_pro_feature_async(
            &state,
            chromvoid_core::license::PRO_FEATURE_ENV_RUNTIME,
        )
        .await
        {
            return AgentResponseV1::error(
                request.request_id,
                agent_error_from_runtime(
                    env_runtime_error_from_rpc_result(error),
                    AgentErrorContext::Generic,
                ),
            );
        }
    }

    let error_context = AgentErrorContext::for_command(&request.command);
    let request_id = request.request_id;
    let result = match request.command {
        AgentCommandV1::Hello { .. } => Ok(AgentResponseDataV1::Hello(AgentHelloV1 {
            desktop_version: env!("CARGO_PKG_VERSION").to_string(),
            capabilities: vec![
                "env_runtime_v1".to_string(),
                "profile_proposals_v1".to_string(),
                "preset_proposals_v1".to_string(),
                "attached_run_v1".to_string(),
            ],
        })),
        AgentCommandV1::ConnectionStatus => {
            let actor_label = state.gateway.lock().ok().and_then(|gateway| {
                gateway
                    .config
                    .paired_agents
                    .iter()
                    .find(|agent| agent.id == actor_id && !agent.revoked)
                    .and_then(|agent| agent.label.clone())
            });
            Ok(AgentResponseDataV1::ConnectionStatus(
                AgentConnectionStatusV1 {
                    paired: true,
                    actor_id: actor_id.to_string(),
                    actor_label,
                },
            ))
        }
        AgentCommandV1::EnvStatus => {
            let unlocked = state
                .adapter
                .lock()
                .map(|adapter| adapter.is_unlocked())
                .unwrap_or(false);
            let module_state = env_runtime_module_state(&state).await;
            state.env_runtime.status(unlocked).map(|status| {
                AgentResponseDataV1::EnvStatus(AgentEnvStatusV1 {
                    platform_supported: status.platform_supported,
                    vault_unlocked: status.vault_unlocked,
                    module_state,
                    active_runs: status.active_runs,
                    pending_approvals: status.pending_approvals,
                    pending_proposals: status.pending_proposals,
                })
            })
        }
        AgentCommandV1::PresetsList { profile } => {
            let profile_id = match profile {
                Some(profile) => core_profile_get(&state, actor_id, &profile)
                    .await
                    .map(|profile| Some(profile.id)),
                None => Ok(None),
            };
            profile_id.and_then(|profile_id| {
                with_env_runtime_agent_boundary(&state, actor_id, |_| {
                    state.env_runtime.list_presets().map(|presets| {
                        AgentResponseDataV1::Presets(
                            presets
                                .iter()
                                .filter(|preset| {
                                    preset_matches_profile(
                                        &preset.profile_id,
                                        profile_id.as_deref(),
                                    )
                                })
                                .map(Into::into)
                                .collect(),
                        )
                    })
                })
            })
        }
        AgentCommandV1::PresetGet { preset } => {
            with_env_runtime_agent_boundary(&state, actor_id, |_| {
                state
                    .env_runtime
                    .get_preset(&preset)
                    .map(|preset| AgentResponseDataV1::Preset((&preset).into()))
            })
        }
        AgentCommandV1::PresetPropose {
            operation,
            target,
            base_revision,
            draft,
        } => {
            let draft = match validate_preset_proposal_profile_ref(&state, actor_id, draft).await {
                Ok(draft) => draft,
                Err(error) => {
                    return AgentResponseV1::error(
                        request_id,
                        agent_error_from_runtime(error, AgentErrorContext::Preset),
                    )
                }
            };
            with_env_runtime_agent_boundary(&state, actor_id, |_| {
                state.env_runtime.propose_preset(
                    actor_id.to_string(),
                    session_id.to_string(),
                    operation,
                    target,
                    base_revision,
                    draft,
                )
            })
            .map(|proposal| {
                state.env_runtime.observability().record_proposal(&proposal);
                AgentResponseDataV1::Proposal(proposal)
            })
        }
        AgentCommandV1::ProfilePropose {
            operation,
            target,
            base_revision,
            draft,
        } => {
            match resolve_profile_proposal_target(
                &state,
                actor_id,
                operation,
                target,
                base_revision,
            )
            .await
            {
                Ok(target) => {
                    match validate_profile_proposal_secret_refs(&state, actor_id, draft).await {
                        Ok(draft) => with_env_runtime_agent_boundary(&state, actor_id, |_| {
                            state.env_runtime.propose_profile(
                                actor_id.to_string(),
                                session_id.to_string(),
                                operation,
                                target,
                                base_revision,
                                draft,
                            )
                        })
                        .map(|proposal| {
                            state.env_runtime.observability().record_proposal(&proposal);
                            AgentResponseDataV1::Proposal(proposal)
                        }),
                        Err(error) => Err(error),
                    }
                }
                Err(error) => Err(error),
            }
        }
        AgentCommandV1::SecretsList => core_secret_list(&state, actor_id)
            .await
            .map(AgentResponseDataV1::Secrets),
        AgentCommandV1::ProfilesList => core_profile_list(&state, actor_id)
            .await
            .map(AgentResponseDataV1::Profiles),
        AgentCommandV1::ProfileGet { profile } => core_profile_get(&state, actor_id, &profile)
            .await
            .map(AgentResponseDataV1::Profile),
        AgentCommandV1::ProposalWait { proposal_id } => state
            .env_runtime
            .proposal_metadata_for_actor(&proposal_id, actor_id)
            .map(AgentResponseDataV1::Proposal),
        AgentCommandV1::RunsList => state.env_runtime.list_runs().map(|runs| {
            AgentResponseDataV1::Runs(
                runs.into_iter()
                    .filter(|run| run.actor_id == actor_id)
                    .collect(),
            )
        }),
        AgentCommandV1::RunStop { run_id } => state
            .env_runtime
            .stop_run_for_actor(&run_id, actor_id)
            .await
            .map(|()| AgentResponseDataV1::Acknowledged),
        AgentCommandV1::RunsStopAll => {
            state.env_runtime.stop_runs_for_actor(actor_id).await;
            Ok(AgentResponseDataV1::Acknowledged)
        }
        AgentCommandV1::Run { .. } => Err(crate::env_runtime::EnvRuntimeError::new(
            crate::env_runtime::EnvRuntimeErrorCode::NOT_READY,
            "Run streaming is unavailable",
        )),
    };
    match result {
        Ok(data) => AgentResponseV1::success(request_id, data),
        Err(error) => {
            AgentResponseV1::error(request_id, agent_error_from_runtime(error, error_context))
        }
    }
}

fn ensure_agent_active(
    state: &tauri::State<'_, crate::AppState>,
    actor_id: &str,
) -> Result<(), crate::env_runtime::EnvRuntimeError> {
    let gateway = state.gateway.lock().map_err(|_| {
        crate::env_runtime::EnvRuntimeError::new(
            crate::env_runtime::EnvRuntimeErrorCode::INTERNAL,
            "Gateway mutex poisoned",
        )
    })?;
    let denial = if !gateway.config.enabled {
        Some(("GATEWAY_UNAVAILABLE", "ChromVoid Gateway is disabled"))
    } else if !gateway.is_agent_paired_and_active(actor_id) {
        Some(("AGENT_REVOKED", "CLI agent identity is no longer active"))
    } else {
        None
    };
    drop(gateway);
    match denial {
        Some((code, message)) => {
            state
                .env_runtime
                .observability()
                .record_gateway_denial(actor_id, code);
            let code = match code {
                "GATEWAY_UNAVAILABLE" => {
                    crate::env_runtime::EnvRuntimeErrorCode::GATEWAY_UNAVAILABLE
                }
                "AGENT_REVOKED" => crate::env_runtime::EnvRuntimeErrorCode::AGENT_REVOKED,
                _ => crate::env_runtime::EnvRuntimeErrorCode::INTERNAL,
            };
            Err(crate::env_runtime::EnvRuntimeError::new(code, message))
        }
        None => Ok(()),
    }
}

fn with_env_runtime_agent_boundary<T>(
    state: &tauri::State<'_, crate::AppState>,
    actor_id: &str,
    action: impl FnOnce(Option<String>) -> Result<T, crate::env_runtime::EnvRuntimeError>,
) -> Result<T, crate::env_runtime::EnvRuntimeError> {
    let gateway = state.gateway.lock().map_err(|_| {
        crate::env_runtime::EnvRuntimeError::new(
            crate::env_runtime::EnvRuntimeErrorCode::INTERNAL,
            "Gateway mutex poisoned",
        )
    })?;
    if !gateway.config.enabled {
        drop(gateway);
        state
            .env_runtime
            .observability()
            .record_gateway_denial(actor_id, "GATEWAY_UNAVAILABLE");
        return Err(crate::env_runtime::EnvRuntimeError::new(
            crate::env_runtime::EnvRuntimeErrorCode::GATEWAY_UNAVAILABLE,
            "ChromVoid Gateway is disabled",
        ));
    }
    let actor_label = gateway
        .config
        .paired_agents
        .iter()
        .find(|agent| agent.id == actor_id && !agent.revoked)
        .map(|agent| agent.label.clone());
    let Some(actor_label) = actor_label else {
        drop(gateway);
        state
            .env_runtime
            .observability()
            .record_gateway_denial(actor_id, "AGENT_REVOKED");
        return Err(crate::env_runtime::EnvRuntimeError::new(
            crate::env_runtime::EnvRuntimeErrorCode::AGENT_REVOKED,
            "CLI agent identity is no longer active",
        ));
    };
    let mut adapter = state.adapter.lock().map_err(|_| {
        crate::env_runtime::EnvRuntimeError::new(
            crate::env_runtime::EnvRuntimeErrorCode::INTERNAL,
            "Adapter mutex poisoned",
        )
    })?;
    if adapter.mode() != crate::core_adapter::CoreMode::Local {
        return Err(crate::env_runtime::EnvRuntimeError::new(
            crate::env_runtime::EnvRuntimeErrorCode::LOCAL_CORE_REQUIRED,
            "Env Runtime requires the local desktop vault",
        ));
    }
    if !adapter.is_unlocked() {
        return Err(crate::env_runtime::EnvRuntimeError::new(
            crate::env_runtime::EnvRuntimeErrorCode::VAULT_REQUIRED,
            "Unlock the local vault before using Env Runtime",
        ));
    }
    // The outer async guard is an early rejection only. Recheck the canonical
    // module resolver while holding the final adapter lock so a concurrent
    // license/mode transition cannot race a proposal or run reservation.
    let capabilities = crate::types::runtime_capabilities_for_current_target();
    if let Err(error) = crate::pro::guard_pro_feature_for_adapter(
        adapter.as_mut(),
        chromvoid_core::license::PRO_FEATURE_ENV_RUNTIME,
        &capabilities,
    ) {
        let (message, code) = rpc_result_error(error);
        return Err(crate::env_runtime::EnvRuntimeError::new(code, message));
    }
    action(actor_label)
}

async fn env_runtime_module_state(state: &tauri::State<'_, crate::AppState>) -> String {
    let adapter = state.adapter.clone();
    let capabilities = crate::types::runtime_capabilities_for_current_target();
    let result = state
        .catalog_blocking_io_runtime
        .spawn_blocking(move || {
            let mut adapter = adapter.lock().map_err(|_| ())?;
            Ok::<_, ()>(crate::pro::resolve_for_adapter(
                adapter.as_mut(),
                chromvoid_core::license::PRO_FEATURE_ENV_RUNTIME,
                &capabilities,
            ))
        })
        .await;
    let Ok(Ok(access)) = result else {
        return "entitlement_unavailable".to_string();
    };
    match access.status {
        crate::pro::ModuleAccessStatus::Unsupported => "unsupported",
        crate::pro::ModuleAccessStatus::DisabledByRollout => "disabled_by_rollout",
        crate::pro::ModuleAccessStatus::EntitlementUnavailable => "entitlement_unavailable",
        crate::pro::ModuleAccessStatus::LockedPro => "locked_pro",
        crate::pro::ModuleAccessStatus::Enabled => "enabled",
    }
    .to_string()
}

async fn core_secret_list(
    state: &tauri::State<'_, crate::AppState>,
    actor_id: &str,
) -> Result<Vec<chromvoid_protocol::AgentSecretMetadataV1>, crate::env_runtime::EnvRuntimeError> {
    let result = run_core_rpc(
        state,
        actor_id,
        "env_runtime:secret:list",
        serde_json::json!({}),
    )
    .await?;
    let secrets =
        serde_json::from_value::<Vec<chromvoid_core::env_runtime::AgentSecretMetadataV1>>(result)
            .map_err(|_| {
            crate::env_runtime::EnvRuntimeError::new(
                crate::env_runtime::EnvRuntimeErrorCode::CORE_RESPONSE_INVALID,
                "Core returned invalid EnvSecret metadata",
            )
        })?;
    Ok(secrets
        .into_iter()
        .map(|secret| chromvoid_protocol::AgentSecretMetadataV1 {
            id: secret.id,
            label: secret.label,
            revision: secret.revision,
            usage_count: secret.usage_count.try_into().unwrap_or(u32::MAX),
        })
        .collect())
}

async fn core_profile_list(
    state: &tauri::State<'_, crate::AppState>,
    actor_id: &str,
) -> Result<Vec<chromvoid_protocol::AgentProfileMetadataV1>, crate::env_runtime::EnvRuntimeError> {
    let result = run_core_rpc(
        state,
        actor_id,
        "env_runtime:profile:list",
        serde_json::json!({}),
    )
    .await?;
    let profiles =
        serde_json::from_value::<Vec<chromvoid_core::env_runtime::AgentProfileMetadataV1>>(result)
            .map_err(|_| {
                crate::env_runtime::EnvRuntimeError::new(
                    crate::env_runtime::EnvRuntimeErrorCode::CORE_RESPONSE_INVALID,
                    "Core returned invalid profile metadata",
                )
            })?;
    Ok(profiles.into_iter().map(protocol_profile).collect())
}

async fn core_profile_get(
    state: &tauri::State<'_, crate::AppState>,
    actor_id: &str,
    profile: &str,
) -> Result<chromvoid_protocol::AgentProfileMetadataV1, crate::env_runtime::EnvRuntimeError> {
    let result = run_core_rpc(
        state,
        actor_id,
        "env_runtime:profile:get",
        serde_json::json!({"profile": profile}),
    )
    .await?;
    serde_json::from_value::<chromvoid_core::env_runtime::AgentProfileMetadataV1>(result)
        .map(protocol_profile)
        .map_err(|_| {
            crate::env_runtime::EnvRuntimeError::new(
                crate::env_runtime::EnvRuntimeErrorCode::CORE_RESPONSE_INVALID,
                "Core returned invalid profile metadata",
            )
        })
}

async fn validate_profile_proposal_secret_refs(
    state: &tauri::State<'_, crate::AppState>,
    actor_id: &str,
    draft: Option<chromvoid_protocol::AgentProfileDraftV1>,
) -> Result<Option<chromvoid_protocol::AgentProfileDraftV1>, crate::env_runtime::EnvRuntimeError> {
    let Some(draft) = draft else {
        return Ok(None);
    };
    let referenced = draft
        .variables
        .iter()
        .filter_map(|variable| variable.secret_id.as_deref())
        .collect::<HashSet<_>>();
    if referenced.is_empty() {
        return Ok(Some(draft));
    }
    let secrets = core_secret_list(state, actor_id).await?;
    let known = secrets
        .iter()
        .map(|secret| secret.id.as_str())
        .collect::<HashSet<_>>();
    if referenced
        .iter()
        .any(|secret_id| !known.contains(secret_id))
    {
        return Err(crate::env_runtime::EnvRuntimeError::new(
            crate::env_runtime::EnvRuntimeErrorCode::NOT_FOUND,
            "A referenced Env Runtime secret does not exist",
        ));
    }
    Ok(Some(draft))
}

async fn validate_preset_proposal_profile_ref(
    state: &tauri::State<'_, crate::AppState>,
    actor_id: &str,
    draft: Option<chromvoid_protocol::AgentPresetDraftV1>,
) -> Result<Option<chromvoid_protocol::AgentPresetDraftV1>, crate::env_runtime::EnvRuntimeError> {
    let Some(draft) = draft else {
        return Ok(None);
    };
    let profile = core_profile_get(state, actor_id, &draft.profile_id)
        .await
        .map_err(|error| {
            remap_not_found(
                error,
                crate::env_runtime::EnvRuntimeErrorCode::PROFILE_NOT_FOUND,
            )
        })?;
    if profile.id != draft.profile_id {
        return Err(crate::env_runtime::EnvRuntimeError::new(
            crate::env_runtime::EnvRuntimeErrorCode::INVALID_PRESET,
            "Preset profile_id must be a stable profile id",
        ));
    }
    Ok(Some(draft))
}

async fn resolve_profile_proposal_target(
    state: &tauri::State<'_, crate::AppState>,
    actor_id: &str,
    operation: chromvoid_protocol::MutationOperationV1,
    target: Option<String>,
    base_revision: Option<u64>,
) -> Result<Option<String>, crate::env_runtime::EnvRuntimeError> {
    if operation == chromvoid_protocol::MutationOperationV1::Create {
        if target.is_some() || base_revision.is_some() {
            return Err(crate::env_runtime::EnvRuntimeError::new(
                crate::env_runtime::EnvRuntimeErrorCode::INVALID_PROPOSAL,
                "A create proposal cannot have a target or base revision",
            ));
        }
        return Ok(None);
    }
    let target = target.ok_or_else(|| {
        crate::env_runtime::EnvRuntimeError::new(
            crate::env_runtime::EnvRuntimeErrorCode::INVALID_PROPOSAL,
            "Profile update/delete requires a target",
        )
    })?;
    let expected_revision = base_revision.ok_or_else(|| {
        crate::env_runtime::EnvRuntimeError::new(
            crate::env_runtime::EnvRuntimeErrorCode::INVALID_PROPOSAL,
            "Profile update/delete requires a base revision",
        )
    })?;
    let profile = core_profile_get(state, actor_id, &target)
        .await
        .map_err(|error| {
            remap_not_found(
                error,
                crate::env_runtime::EnvRuntimeErrorCode::PROFILE_NOT_FOUND,
            )
        })?;
    if profile.revision != expected_revision {
        return Err(crate::env_runtime::EnvRuntimeError::new(
            crate::env_runtime::EnvRuntimeErrorCode::REVISION_CONFLICT,
            "Profile changed before the proposal was submitted",
        ));
    }
    Ok(Some(profile.id))
}

fn protocol_profile(
    profile: chromvoid_core::env_runtime::AgentProfileMetadataV1,
) -> chromvoid_protocol::AgentProfileMetadataV1 {
    chromvoid_protocol::AgentProfileMetadataV1 {
        id: profile.id,
        slug: profile.slug,
        label: profile.label,
        description: profile.description,
        revision: profile.revision,
        variables: profile
            .variables
            .into_iter()
            .map(|variable| chromvoid_protocol::AgentVariableMappingV1 {
                name: variable.name,
                secret_id: Some(variable.secret_id),
            })
            .collect(),
    }
}

fn remap_not_found(
    mut error: crate::env_runtime::EnvRuntimeError,
    code: crate::env_runtime::EnvRuntimeErrorCode,
) -> crate::env_runtime::EnvRuntimeError {
    if error.code == crate::env_runtime::EnvRuntimeErrorCode::NOT_FOUND {
        error.code = code;
    }
    error
}

fn metadata_gateway_denial(
    gateway: &crate::gateway::GatewayState,
    actor_id: &str,
) -> Option<(&'static str, &'static str)> {
    if !gateway.config.enabled {
        Some(("GATEWAY_UNAVAILABLE", "ChromVoid Gateway is disabled"))
    } else if !gateway.is_agent_paired_and_active(actor_id) {
        Some(("AGENT_REVOKED", "CLI agent identity is no longer active"))
    } else {
        None
    }
}

fn env_runtime_background_task_failure() -> crate::env_runtime::EnvRuntimeError {
    crate::env_runtime::EnvRuntimeError::new(
        crate::env_runtime::EnvRuntimeErrorCode::INTERNAL,
        "Env Runtime background task failed",
    )
}

async fn run_core_rpc(
    state: &tauri::State<'_, crate::AppState>,
    actor_id: &str,
    command: &'static str,
    data: serde_json::Value,
) -> Result<serde_json::Value, crate::env_runtime::EnvRuntimeError> {
    let adapter = state.adapter.clone();
    let gateway = state.gateway.clone();
    let runtime = state.env_runtime.clone();
    let actor_id = actor_id.to_string();
    let capabilities = crate::types::runtime_capabilities_for_current_target();
    let response = state
        .catalog_blocking_io_runtime
        .spawn_blocking(move || {
            let gateway = gateway.lock().map_err(|_| {
                crate::env_runtime::EnvRuntimeError::new(
                    crate::env_runtime::EnvRuntimeErrorCode::INTERNAL,
                    "Gateway mutex poisoned",
                )
            })?;
            if let Some((code, message)) = metadata_gateway_denial(&gateway, &actor_id) {
                drop(gateway);
                runtime
                    .observability()
                    .record_gateway_denial(&actor_id, code);
                let code = match code {
                    "GATEWAY_UNAVAILABLE" => {
                        crate::env_runtime::EnvRuntimeErrorCode::GATEWAY_UNAVAILABLE
                    }
                    "AGENT_REVOKED" => crate::env_runtime::EnvRuntimeErrorCode::AGENT_REVOKED,
                    _ => crate::env_runtime::EnvRuntimeErrorCode::INTERNAL,
                };
                return Err(crate::env_runtime::EnvRuntimeError::new(code, message));
            }
            let mut adapter = adapter.lock().map_err(|_| {
                crate::env_runtime::EnvRuntimeError::new(
                    crate::env_runtime::EnvRuntimeErrorCode::INTERNAL,
                    "Adapter mutex poisoned",
                )
            })?;
            if adapter.mode() != crate::core_adapter::CoreMode::Local {
                return Err(crate::env_runtime::EnvRuntimeError::new(
                    crate::env_runtime::EnvRuntimeErrorCode::LOCAL_CORE_REQUIRED,
                    "Env Runtime metadata requires the local desktop vault",
                ));
            }
            if !adapter.is_unlocked() {
                return Err(crate::env_runtime::EnvRuntimeError::new(
                    crate::env_runtime::EnvRuntimeErrorCode::VAULT_REQUIRED,
                    "Unlock the local vault before reading Env Runtime metadata",
                ));
            }
            if let Err(error) = crate::pro::guard_pro_feature_for_adapter(
                adapter.as_mut(),
                chromvoid_core::license::PRO_FEATURE_ENV_RUNTIME,
                &capabilities,
            ) {
                let (message, code) = rpc_result_error(error);
                return Err(crate::env_runtime::EnvRuntimeError::new(code, message));
            }
            Ok::<_, crate::env_runtime::EnvRuntimeError>(
                adapter.handle(&chromvoid_core::rpc::types::RpcRequest::new(command, data)),
            )
        })
        .await
        .map_err(|_| env_runtime_background_task_failure())??;
    match response {
        chromvoid_core::rpc::types::RpcResponse::Success { result, .. } => Ok(result),
        chromvoid_core::rpc::types::RpcResponse::Error { error, code, .. } => {
            Err(crate::env_runtime::EnvRuntimeError::new(
                code.map(|code| crate::env_runtime::EnvRuntimeErrorCode::from_core(&code))
                    .unwrap_or(crate::env_runtime::EnvRuntimeErrorCode::CORE_ERROR),
                error,
            ))
        }
    }
}

fn with_spawn_commit_guard<T>(
    runtime: &crate::env_runtime::EnvRuntimeState,
    action: impl FnOnce() -> Result<T, crate::env_runtime::EnvRuntimeError>,
) -> Result<T, crate::env_runtime::EnvRuntimeError> {
    let _commit_guard = runtime.commit_guard()?;
    action()
}

pub(crate) async fn resolve_and_start_run(
    state: &crate::AppState,
    actor_id: String,
    ticket: crate::env_runtime::AgentRunTicket,
) -> Result<tokio::sync::mpsc::Receiver<AgentEventDataV1>, crate::env_runtime::EnvRuntimeError> {
    let adapter = state.adapter.clone();
    let gateway = state.gateway.clone();
    let runtime = state.env_runtime.clone();
    let cleanup_runtime = runtime.clone();
    let failed_run = ticket.snapshot.run.clone();
    let request_span = tracing::Span::current();
    let result = state
        .catalog_blocking_io_runtime
        .spawn_blocking(move || {
            with_spawn_commit_guard(runtime.as_ref(), || {
                let gateway = gateway.lock().map_err(|_| {
                    crate::env_runtime::EnvRuntimeError::new(
                        crate::env_runtime::EnvRuntimeErrorCode::INTERNAL,
                        "Gateway mutex poisoned",
                    )
                })?;
                if !gateway.config.enabled {
                    drop(gateway);
                    runtime
                        .observability()
                        .record_gateway_denial(&actor_id, "GATEWAY_UNAVAILABLE");
                    return Err(crate::env_runtime::EnvRuntimeError::new(
                        crate::env_runtime::EnvRuntimeErrorCode::GATEWAY_UNAVAILABLE,
                        "ChromVoid Gateway is disabled",
                    ));
                }
                if !gateway.is_agent_paired_and_active(&actor_id) {
                    drop(gateway);
                    runtime
                        .observability()
                        .record_gateway_denial(&actor_id, "AGENT_REVOKED");
                    return Err(crate::env_runtime::EnvRuntimeError::new(
                        crate::env_runtime::EnvRuntimeErrorCode::AGENT_REVOKED,
                        "CLI agent identity is no longer active",
                    ));
                }
                if ticket.snapshot.expires_at_epoch_ms <= crate::gateway::state::now_ms() {
                    return Err(crate::env_runtime::EnvRuntimeError::new(
                        crate::env_runtime::EnvRuntimeErrorCode::APPROVAL_EXPIRED,
                        "Run approval expired before spawn",
                    ));
                }
                let mut adapter = adapter.lock().map_err(|_| {
                    crate::env_runtime::EnvRuntimeError::new(
                        crate::env_runtime::EnvRuntimeErrorCode::INTERNAL,
                        "Adapter mutex poisoned",
                    )
                })?;
                if adapter.mode() != crate::core_adapter::CoreMode::Local {
                    return Err(crate::env_runtime::EnvRuntimeError::new(
                        crate::env_runtime::EnvRuntimeErrorCode::LOCAL_CORE_REQUIRED,
                        "Env Runtime runs require the local desktop vault",
                    ));
                }
                if !adapter.is_unlocked() {
                    return Err(crate::env_runtime::EnvRuntimeError::new(
                        crate::env_runtime::EnvRuntimeErrorCode::VAULT_REQUIRED,
                        "Unlock the local vault before starting a run",
                    ));
                }
                let capabilities = crate::types::runtime_capabilities_for_current_target();
                if let Err(error) = crate::pro::guard_pro_feature_for_adapter(
                    adapter.as_mut(),
                    chromvoid_core::license::PRO_FEATURE_ENV_RUNTIME,
                    &capabilities,
                ) {
                    let (message, code) = rpc_result_error(error);
                    return Err(crate::env_runtime::EnvRuntimeError::new(code, message));
                }
                // Stop owns the same starting reservation. Confirm ownership
                // before even reading mutable profile metadata so a Stop that
                // already won cannot be masked by a Core not-found/conflict.
                runtime.verify_starting_reservation(&ticket)?;
                let profile_id = ticket.profile.id.clone();
                let profile_revision = ticket.profile.revision;
                let run = ticket.snapshot.run.clone();
                let profile_response =
                    adapter.handle(&chromvoid_core::rpc::types::RpcRequest::new(
                        "env_runtime:profile:get",
                        serde_json::json!({"profile": profile_id.clone()}),
                    ));
                let profile_value = match profile_response {
                    chromvoid_core::rpc::types::RpcResponse::Success { result, .. } => result,
                    chromvoid_core::rpc::types::RpcResponse::Error { error, code, .. } => {
                        let code = code
                            .as_deref()
                            .map(crate::env_runtime::EnvRuntimeErrorCode::from_core)
                            .unwrap_or(crate::env_runtime::EnvRuntimeErrorCode::INTERNAL);
                        return Err(crate::env_runtime::EnvRuntimeError::new(
                            if code == crate::env_runtime::EnvRuntimeErrorCode::NOT_FOUND {
                                crate::env_runtime::EnvRuntimeErrorCode::PROFILE_NOT_FOUND
                            } else {
                                code
                            },
                            error,
                        ));
                    }
                };
                let current_profile = serde_json::from_value::<
                    chromvoid_core::env_runtime::AgentProfileMetadataV1,
                >(profile_value)
                .map(protocol_profile)
                .map_err(|_| {
                    crate::env_runtime::EnvRuntimeError::new(
                        crate::env_runtime::EnvRuntimeErrorCode::INTERNAL,
                        "Core returned invalid Env Runtime profile metadata",
                    )
                })?;
                let prepared = runtime.prepare_approved_run(ticket, &current_profile)?;
                let resolution_started = Instant::now();
                let result = match adapter.resolve_env_runtime_for_spawn(
                    chromvoid_core::env_runtime::PrivateSpawnResolutionRequestV1 {
                        profile_id,
                        expected_profile_revision: profile_revision,
                    },
                ) {
                    Some(result) => result,
                    None => {
                        let error = crate::env_runtime::EnvRuntimeError::new(
                            crate::env_runtime::EnvRuntimeErrorCode::LOCAL_CORE_REQUIRED,
                            "Env Runtime runs require the local desktop vault",
                        );
                        drop(adapter);
                        drop(gateway);
                        request_span.in_scope(|| {
                            runtime.observability().record_resolution(
                                &run,
                                0,
                                "error",
                                Some(error.code.as_str()),
                                resolution_started.elapsed().as_millis() as u64,
                            );
                        });
                        return Err(error);
                    }
                };
                let lease = match result {
                    Ok(lease) => lease,
                    Err(error) => {
                        let code = crate::env_runtime::EnvRuntimeErrorCode::from_core(
                            error.code().as_str(),
                        );
                        let error = crate::env_runtime::EnvRuntimeError::new(
                            if code == crate::env_runtime::EnvRuntimeErrorCode::NOT_FOUND {
                                crate::env_runtime::EnvRuntimeErrorCode::PROFILE_NOT_FOUND
                            } else {
                                code
                            },
                            error.message(),
                        );
                        drop(adapter);
                        drop(gateway);
                        request_span.in_scope(|| {
                            runtime.observability().record_resolution(
                                &run,
                                0,
                                "error",
                                Some(error.code.as_str()),
                                resolution_started.elapsed().as_millis() as u64,
                            );
                        });
                        return Err(error);
                    }
                };
                let variable_count = lease.len();
                let resolution_duration_ms = resolution_started.elapsed().as_millis() as u64;
                // Security linearization point: keep both final-boundary guards
                // through process creation. Gateway disable needs `gateway`, and
                // Core vault lock needs `adapter`, so neither can land between the
                // checks/resolution above and exec below. The outer commit guard
                // additionally serializes Env Runtime lock-transition cleanup.
                let start_result =
                    request_span.in_scope(|| runtime.start_approved_run(prepared, lease));
                drop(adapter);
                drop(gateway);
                request_span.in_scope(|| {
                    runtime.observability().record_resolution(
                        &run,
                        variable_count,
                        "resolved",
                        None,
                        resolution_duration_ms,
                    );
                });
                start_result
            })
        })
        .await
        .map_err(|_| env_runtime_background_task_failure())?;
    if let Err(error) = &result {
        cleanup_runtime.fail_starting_run(&failed_run, error.code.as_str());
    }
    result
}

#[derive(Clone, Copy)]
enum AgentErrorContext {
    Generic,
    Profile,
    Preset,
    Proposal,
    Run,
}

impl AgentErrorContext {
    fn for_command(command: &AgentCommandV1) -> Self {
        match command {
            AgentCommandV1::ProfileGet { .. }
            | AgentCommandV1::PresetsList { profile: Some(_) } => Self::Profile,
            AgentCommandV1::PresetGet { .. } => Self::Preset,
            AgentCommandV1::ProposalWait { .. } => Self::Proposal,
            AgentCommandV1::RunStop { .. } => Self::Run,
            _ => Self::Generic,
        }
    }

    fn not_found_code(self) -> &'static str {
        match self {
            Self::Profile => "PROFILE_NOT_FOUND",
            Self::Preset => "PRESET_NOT_FOUND",
            Self::Proposal => "PROPOSAL_NOT_FOUND",
            Self::Run => "RUN_NOT_FOUND",
            Self::Generic => "SECRET_NOT_FOUND",
        }
    }
}

fn preset_matches_profile(preset_profile_id: &str, canonical_profile_id: Option<&str>) -> bool {
    canonical_profile_id.is_none_or(|profile_id| preset_profile_id == profile_id)
}

fn agent_error_from_runtime(
    error: crate::env_runtime::EnvRuntimeError,
    context: AgentErrorContext,
) -> AgentErrorV1 {
    use crate::env_runtime::EnvRuntimeErrorCode as Code;

    let code = match error.code {
        Code::AGENT_REVOKED => "AGENT_REVOKED",
        Code::APPROVAL_CLOSED => match context {
            AgentErrorContext::Proposal => "PROPOSAL_NOT_FOUND",
            _ => "RUN_ALREADY_TERMINAL",
        },
        Code::APPROVAL_EXPIRED => "APPROVAL_EXPIRED",
        Code::CANCELLED | Code::SESSION_DISCONNECTED => "CANCELLED",
        Code::CONFLICT | Code::REVISION_CONFLICT => "REVISION_CONFLICT",
        Code::CORE_UNAVAILABLE | Code::GATEWAY_UNAVAILABLE => "GATEWAY_UNAVAILABLE",
        Code::DEVICE_STORE_CORRUPT
        | Code::DEVICE_STORE_KEY_UNAVAILABLE
        | Code::DEVICE_STORE_LOCKED
        | Code::DEVICE_STORE_UNAVAILABLE
        | Code::DEVICE_STORE_VERSION
        | Code::DEVICE_STORE_WRITE_FAILED => "DEVICE_STORE_UNAVAILABLE",
        Code::ENTITLEMENT_UNAVAILABLE => "ENTITLEMENT_UNAVAILABLE",
        Code::EXECUTABLE_IDENTITY_MISMATCH | Code::EXECUTABLE_UNAVAILABLE => {
            "EXECUTABLE_IDENTITY_MISMATCH"
        }
        Code::FEATURE_DISABLED_BY_ROLLOUT => "FEATURE_DISABLED_BY_ROLLOUT",
        Code::INVALID_CWD
        | Code::INVALID_DESCRIPTION
        | Code::INVALID_ENV_NAME
        | Code::INVALID_EXECUTABLE
        | Code::INVALID_LABEL
        | Code::INVALID_PATH
        | Code::INVALID_PRESET
        | Code::INVALID_PROFILE
        | Code::INVALID_PROPOSAL
        | Code::INVALID_REASON
        | Code::INVALID_REQUEST
        | Code::INVALID_SLUG
        | Code::PRESET_LIMIT_REACHED
        | Code::SECRET_BINDING_REQUIRED
        | Code::SHELL_FORBIDDEN => "INVALID_REQUEST",
        Code::LOCAL_CORE_REQUIRED | Code::REMOTE_CORE_UNSUPPORTED => "REMOTE_CORE_UNSUPPORTED",
        Code::NOT_FOUND => context.not_found_code(),
        Code::OUTPUT_BACKPRESSURE => "OUTPUT_BACKPRESSURE",
        Code::PLATFORM_UNSUPPORTED | Code::UNSUPPORTED_PLATFORM => "UNSUPPORTED_PLATFORM",
        Code::PRESET_NOT_FOUND => "PRESET_NOT_FOUND",
        Code::PROFILE_IN_USE => "PROFILE_IN_USE",
        Code::PROFILE_NOT_FOUND => "PROFILE_NOT_FOUND",
        Code::PROFILE_PRESET_MISMATCH => "PROFILE_PRESET_MISMATCH",
        Code::PROPOSAL_CLOSED => "PROPOSAL_NOT_FOUND",
        Code::PRO_REQUIRED => "PRO_REQUIRED",
        Code::RUN_ALREADY_TERMINAL => "RUN_ALREADY_TERMINAL",
        Code::RUN_LIMIT_REACHED => "RUN_LIMIT_REACHED",
        Code::RUN_NOT_FOUND => "RUN_NOT_FOUND",
        Code::SECRET_IN_USE => "SECRET_IN_USE",
        Code::SECRET_RESOLUTION_FAILED => "SECRET_RESOLUTION_FAILED",
        Code::SPAWN_FAILED => "SPAWN_FAILED",
        Code::VAULT_REQUIRED => "VAULT_REQUIRED",
        Code::WORKSPACE_MISMATCH | Code::WORKSPACE_UNAVAILABLE | Code::CWD_UNAVAILABLE => {
            "WORKSPACE_MISMATCH"
        }
        Code::CORE_ERROR | Code::CORE_RESPONSE_INVALID | Code::INTERNAL | Code::NOT_READY => {
            "INTERNAL"
        }
    };
    let (contract_retryable, contract_next_action) = error_recovery(code);
    let message = if code == "INTERNAL" {
        "Env Runtime request failed internally".to_string()
    } else {
        error.message
    };
    AgentErrorV1 {
        code: code.to_string(),
        message,
        retryable: contract_retryable,
        next_action: Some(contract_next_action.to_string()),
    }
}

fn rpc_result_error(
    error: crate::types::RpcResult<serde_json::Value>,
) -> (String, crate::env_runtime::EnvRuntimeErrorCode) {
    match error {
        crate::types::RpcResult::Error { error, code, .. } => (
            error,
            crate::env_runtime::EnvRuntimeErrorCode::from_feature(code.as_deref()),
        ),
        crate::types::RpcResult::Success { .. } => (
            "Feature access resolver returned an unexpected success response".to_string(),
            crate::env_runtime::EnvRuntimeErrorCode::INTERNAL,
        ),
    }
}

fn env_runtime_error_from_rpc_result(
    error: crate::types::RpcResult<serde_json::Value>,
) -> crate::env_runtime::EnvRuntimeError {
    let (message, code) = rpc_result_error(error);
    crate::env_runtime::EnvRuntimeError::new(code, message)
}

async fn send_run_error_response(
    transport: &mut snow::TransportState,
    write: &mut futures_util::stream::SplitSink<
        tokio_tungstenite::WebSocketStream<tokio::net::TcpStream>,
        Message,
    >,
    frame_message_id: u64,
    request_id: &str,
    code: &str,
    message: &str,
    request_tracker: &mut GatewayRequestTracker,
) -> bool {
    let response = AgentResponseV1::error(request_id, protocol_error(code, message));
    request_tracker.record(&response, crate::env_runtime::RequestDecision::Error);
    send_frame(
        transport,
        write,
        frame_from_agent_response(frame_message_id, &response),
    )
    .await
    .is_ok()
}

async fn send_env_error_response(
    transport: &mut snow::TransportState,
    write: &mut futures_util::stream::SplitSink<
        tokio_tungstenite::WebSocketStream<tokio::net::TcpStream>,
        Message,
    >,
    frame_message_id: u64,
    request_id: &str,
    error: crate::env_runtime::EnvRuntimeError,
    context: AgentErrorContext,
    request_tracker: &mut GatewayRequestTracker,
) -> bool {
    let response = AgentResponseV1::error(request_id, agent_error_from_runtime(error, context));
    request_tracker.record(&response, crate::env_runtime::RequestDecision::Error);
    send_frame(
        transport,
        write,
        frame_from_agent_response(frame_message_id, &response),
    )
    .await
    .is_ok()
}

async fn send_agent_event(
    transport: &mut snow::TransportState,
    write: &mut futures_util::stream::SplitSink<
        tokio_tungstenite::WebSocketStream<tokio::net::TcpStream>,
        Message,
    >,
    server_message_id: &mut u64,
    event: AgentEventV1,
) -> Result<(), ()> {
    *server_message_id = (*server_message_id).wrapping_add(1).max(1);
    send_frame(
        transport,
        write,
        frame_from_agent_event(*server_message_id, &event),
    )
    .await
}

fn agent_error_event(request_id: &str, sequence: u64, code: &str, message: &str) -> AgentEventV1 {
    AgentEventV1 {
        schema_version: AGENT_SCHEMA_VERSION,
        request_id: request_id.to_string(),
        sequence,
        event: AgentEventDataV1::Error(protocol_error(code, message)),
    }
}

fn parse_agent_message(
    message: Message,
    transport: &mut snow::TransportState,
    anti_replay: &mut AntiReplay,
    rate_limiter: &mut RateLimiter,
) -> Result<Option<(Frame, AgentRequestV1)>, ()> {
    let Message::Binary(ciphertext) = message else {
        return Ok(None);
    };
    if ciphertext.len() > AGENT_MAX_CIPHERTEXT_BYTES {
        return Err(());
    }
    let mut plaintext = vec![0_u8; ciphertext.len()];
    let length = transport
        .read_message(ciphertext.as_ref(), &mut plaintext)
        .map_err(|_| ())?;
    plaintext.truncate(length);
    let frame = Frame::decode(&plaintext).map_err(|_| ())?;
    if frame.has_continuation() {
        // Only bounded run-control requests are valid while a stream is active;
        // they always fit one Noise frame. Reject interleaving a new fragmented
        // logical request into the active proposal/run stream.
        return Err(());
    }
    if frame.frame_type == FrameType::Heartbeat {
        return Ok(None);
    }
    if frame.frame_type != FrameType::RpcRequest
        || frame.payload.len() > AGENT_MAX_REQUEST_BYTES
        || anti_replay.check(frame.message_id).is_err()
        || !rate_limiter.check()
    {
        return Err(());
    }
    let request = serde_json::from_slice(&frame.payload).map_err(|_| ())?;
    Ok(Some((frame, request)))
}

async fn handle_pending_run_control(
    state: &tauri::State<'_, crate::AppState>,
    actor_id: &str,
    run_id: &str,
    message_id: u64,
    request: AgentRequestV1,
    request_ids: &mut HashSet<String>,
    transport: &mut snow::TransportState,
    write: &mut futures_util::stream::SplitSink<
        tokio_tungstenite::WebSocketStream<tokio::net::TcpStream>,
        Message,
    >,
) -> bool {
    let request_id = request.request_id.clone();
    if let Some(response) = invalid_control_response(&request, request_ids) {
        let _ = send_frame(
            transport,
            write,
            frame_from_agent_response(message_id, &response),
        )
        .await;
        return true;
    }
    let response = match apply_attached_run_control(
        state.env_runtime.as_ref(),
        actor_id,
        run_id,
        &request.command,
    )
    .await
    {
        Ok(()) => AgentResponseV1::success(request_id, AgentResponseDataV1::Acknowledged),
        Err(error) => AgentResponseV1::error(
            request_id,
            agent_error_from_runtime(error, AgentErrorContext::Run),
        ),
    };
    let _ = send_frame(
        transport,
        write,
        frame_from_agent_response(message_id, &response),
    )
    .await;
    true
}

async fn handle_active_run_control(
    state: &tauri::State<'_, crate::AppState>,
    actor_id: &str,
    run_id: &str,
    message_id: u64,
    request: AgentRequestV1,
    request_ids: &mut HashSet<String>,
    transport: &mut snow::TransportState,
    write: &mut futures_util::stream::SplitSink<
        tokio_tungstenite::WebSocketStream<tokio::net::TcpStream>,
        Message,
    >,
) {
    let request_id = request.request_id.clone();
    if let Some(response) = invalid_control_response(&request, request_ids) {
        let _ = send_frame(
            transport,
            write,
            frame_from_agent_response(message_id, &response),
        )
        .await;
        return;
    }
    let result = apply_attached_run_control(
        state.env_runtime.as_ref(),
        actor_id,
        run_id,
        &request.command,
    )
    .await;
    let response = match result {
        Ok(()) => AgentResponseV1::success(request_id, AgentResponseDataV1::Acknowledged),
        Err(error) => AgentResponseV1::error(
            request_id,
            agent_error_from_runtime(error, AgentErrorContext::Run),
        ),
    };
    let _ = send_frame(
        transport,
        write,
        frame_from_agent_response(message_id, &response),
    )
    .await;
}

async fn apply_attached_run_control(
    runtime: &crate::env_runtime::EnvRuntimeState,
    actor_id: &str,
    run_id: &str,
    command: &AgentCommandV1,
) -> Result<(), crate::env_runtime::EnvRuntimeError> {
    match command {
        AgentCommandV1::RunStop { run_id: requested } if requested == run_id => {
            runtime.stop_run_for_actor(run_id, actor_id).await
        }
        AgentCommandV1::RunsStopAll => {
            runtime.stop_runs_for_actor(actor_id).await;
            Ok(())
        }
        AgentCommandV1::RunStop { .. } => Err(crate::env_runtime::EnvRuntimeError::new(
            crate::env_runtime::EnvRuntimeErrorCode::RUN_NOT_FOUND,
            "Run not found",
        )),
        _ => Err(crate::env_runtime::EnvRuntimeError::new(
            crate::env_runtime::EnvRuntimeErrorCode::INVALID_REQUEST,
            "Only run stop commands are accepted while an attached run is active",
        )),
    }
}

async fn resolve_timeout_or_observe_approval_owner(
    runtime: &crate::env_runtime::EnvRuntimeState,
    run_id: &str,
    decision: &mut tokio::sync::oneshot::Receiver<crate::env_runtime::RunApprovalDecision>,
) -> crate::env_runtime::RunApprovalDecision {
    match runtime.resolve_run_approval(run_id, crate::env_runtime::RunApprovalDecision::Expired) {
        Ok(()) => crate::env_runtime::RunApprovalDecision::Expired,
        Err(error) if error.code == crate::env_runtime::EnvRuntimeErrorCode::APPROVAL_CLOSED => {
            decision
                .await
                .unwrap_or(crate::env_runtime::RunApprovalDecision::Cancelled)
        }
        Err(_) => crate::env_runtime::RunApprovalDecision::Cancelled,
    }
}

fn invalid_control_response(
    request: &AgentRequestV1,
    request_ids: &mut HashSet<String>,
) -> Option<AgentResponseV1> {
    if let Some(response) = invalid_request_id_response(request, request_ids) {
        return Some(response);
    }
    if request.protocol_version != AGENT_PROTOCOL_VERSION
        || request.schema_version != AGENT_SCHEMA_VERSION
    {
        return Some(AgentResponseV1::error(
            request.request_id.clone(),
            protocol_error("UNSUPPORTED_VERSION", "Unsupported agent protocol version"),
        ));
    }
    if validate_timestamp(request.timestamp_secs).is_err() {
        return Some(AgentResponseV1::error(
            request.request_id.clone(),
            protocol_error(
                "INVALID_REQUEST",
                "Request timestamp is outside the allowed window",
            ),
        ));
    }
    None
}

fn invalid_request_id_response(
    request: &AgentRequestV1,
    request_ids: &mut HashSet<String>,
) -> Option<AgentResponseV1> {
    let valid = is_opaque_id(&request.request_id);
    if valid
        && request_ids.len() < MAX_SESSION_REQUEST_IDS
        && request_ids.insert(request.request_id.clone())
    {
        return None;
    }
    Some(AgentResponseV1::error(
        if valid {
            request.request_id.clone()
        } else {
            "unknown".to_string()
        },
        protocol_error(
            "INVALID_REQUEST",
            "request_id must be a unique 1-128 byte OpaqueId within the session",
        ),
    ))
}

fn is_opaque_id(value: &str) -> bool {
    !value.is_empty()
        && value.len() <= 128
        && value
            .bytes()
            .all(|byte| byte.is_ascii_alphanumeric() || matches!(byte, b'.' | b'_' | b':' | b'-'))
}

fn protocol_error(code: &str, message: &str) -> AgentErrorV1 {
    let (retryable, next_action) = error_recovery(code);
    AgentErrorV1 {
        code: code.to_string(),
        message: message.to_string(),
        retryable,
        next_action: Some(next_action.to_string()),
    }
}

fn error_recovery(code: &str) -> (bool, &'static str) {
    match code {
        "INVALID_REQUEST" => (false, "fix_request"),
        "UNSUPPORTED_VERSION" => (false, "upgrade_cli_or_app"),
        "REQUEST_TOO_LARGE" => (false, "reduce_request"),
        "RATE_LIMITED" => (true, "retry_with_backoff"),
        "GATEWAY_UNAVAILABLE" => (true, "open_chromvoid"),
        "NOT_PAIRED" | "AGENT_REVOKED" => (false, "ask_user_to_pair"),
        "UNSUPPORTED_PLATFORM" => (false, "use_supported_macos_desktop"),
        "REMOTE_CORE_UNSUPPORTED" => (false, "switch_to_local_core"),
        "VAULT_REQUIRED" => (true, "ask_user_to_unlock"),
        "PRO_REQUIRED" => (false, "ask_user_to_enable_pro"),
        "FEATURE_DISABLED_BY_ROLLOUT" => (false, "wait_for_feature_rollout"),
        "ENTITLEMENT_UNAVAILABLE" => (true, "open_chromvoid_and_retry"),
        "DEVICE_STORE_UNAVAILABLE" => (true, "open_chromvoid_and_repair_store"),
        "SECRET_NOT_FOUND" => (false, "refresh_metadata"),
        "PROFILE_NOT_FOUND" => (false, "refresh_profiles"),
        "PRESET_NOT_FOUND" => (false, "refresh_presets"),
        "PROPOSAL_NOT_FOUND" => (false, "submit_new_proposal"),
        "RUN_NOT_FOUND" | "RUN_ALREADY_TERMINAL" => (false, "refresh_runs"),
        "CANCELLED" => (false, "request_new_run_if_still_needed"),
        "REVISION_CONFLICT" => (false, "refresh_and_repropose"),
        "SECRET_IN_USE" => (false, "update_profiles_first"),
        "PROFILE_IN_USE" => (false, "delete_presets_first"),
        "PROPOSAL_REJECTED" | "APPROVAL_REJECTED" => (false, "respect_user_decision"),
        "PROPOSAL_EXPIRED" => (false, "submit_new_proposal_if_still_needed"),
        "APPROVAL_EXPIRED" => (false, "request_new_run_if_still_needed"),
        "PROFILE_PRESET_MISMATCH" => (false, "choose_matching_preset"),
        "WORKSPACE_MISMATCH" | "EXECUTABLE_IDENTITY_MISMATCH" => (false, "propose_preset_update"),
        "RUN_LIMIT_REACHED" => (true, "wait_or_stop_owned_run"),
        "SECRET_RESOLUTION_FAILED" => (false, "ask_user_to_repair_profile"),
        "SPAWN_FAILED" => (false, "ask_user_to_review_preset"),
        "OUTPUT_BACKPRESSURE" => (false, "reduce_output_and_retry"),
        _ => (false, "report_diagnostics_without_secrets"),
    }
}

fn request_id_probe(payload: &[u8]) -> String {
    serde_json::from_slice::<serde_json::Value>(payload)
        .ok()
        .and_then(|value| value.get("request_id")?.as_str().map(ToOwned::to_owned))
        .filter(|request_id| is_opaque_id(request_id))
        .unwrap_or_else(|| "unknown".to_string())
}

async fn send_frame(
    transport: &mut snow::TransportState,
    write: &mut futures_util::stream::SplitSink<
        tokio_tungstenite::WebSocketStream<tokio::net::TcpStream>,
        Message,
    >,
    frame: Frame,
) -> Result<(), ()> {
    let fragments = agent_frame_fragments(&frame, AGENT_MAX_RESPONSE_BYTES).map_err(|_| ())?;
    for fragment in fragments {
        let plaintext = fragment.encode();
        let mut ciphertext = vec![0_u8; MAX_HANDSHAKE_MSG];
        let length = transport
            .write_message(&plaintext, &mut ciphertext)
            .map_err(|_| ())?;
        ciphertext.truncate(length);
        write
            .send(Message::Binary(ciphertext.into()))
            .await
            .map_err(|_| ())?;
    }
    Ok(())
}

#[cfg(test)]
mod tests {
    use chromvoid_protocol::{AgentProfileMetadataV1, AgentRunStatusV1};

    use super::*;

    const TEST_WAIT: std::time::Duration = std::time::Duration::from_secs(2);

    fn attached_run_fixture() -> (
        tempfile::TempDir,
        std::sync::Arc<crate::env_runtime::EnvRuntimeState>,
        crate::env_runtime::AgentRunTicket,
        AgentProfileMetadataV1,
    ) {
        let tempdir = tempfile::tempdir().expect("tempdir");
        let runtime = std::sync::Arc::new(
            crate::env_runtime::EnvRuntimeState::new(
                tempdir.path().join("attached-run-presets.enc.json"),
            )
            .expect("runtime"),
        );
        let profile = AgentProfileMetadataV1 {
            id: "profile-attached-run".to_string(),
            slug: "attached-run".to_string(),
            label: "Attached run".to_string(),
            description: None,
            revision: 1,
            variables: Vec::new(),
        };
        #[cfg(unix)]
        let executable = std::path::PathBuf::from("/usr/bin/true")
            .canonicalize()
            .expect("canonical executable");
        #[cfg(not(unix))]
        let executable = std::env::current_exe()
            .expect("current executable")
            .canonicalize()
            .expect("canonical executable");
        let workspace = tempdir.path().canonicalize().expect("canonical workspace");
        let preset = runtime
            .save_preset(
                None,
                None,
                chromvoid_protocol::AgentPresetDraftV1 {
                    profile_id: profile.id.clone(),
                    slug: "attached-run".to_string(),
                    label: "Attached run".to_string(),
                    workspace_root: workspace.to_string_lossy().into_owned(),
                    cwd: workspace.to_string_lossy().into_owned(),
                    executable: executable.to_string_lossy().into_owned(),
                    args: Vec::new(),
                    passthrough_env: Vec::new(),
                },
            )
            .expect("preset");
        let ticket = runtime
            .request_run(
                "actor".to_string(),
                Some("Agent".to_string()),
                "session".to_string(),
                profile.clone(),
                preset,
                &std::collections::HashMap::new(),
                None,
            )
            .expect("run request");
        (tempdir, runtime, ticket, profile)
    }

    #[test]
    fn protocol_errors_never_include_secret_fields() {
        let value = serde_json::to_value(protocol_error("INVALID", "bad request")).expect("json");
        assert_eq!(value["code"], "INVALID");
        assert!(value.get("value").is_none());
        assert!(value.get("environment").is_none());
    }

    #[tokio::test]
    async fn attached_stop_deterministically_cancels_pending_and_starting_phases() {
        let (_pending_tempdir, pending_runtime, mut pending_ticket, _pending_profile) =
            attached_run_fixture();
        let pending_run_id = pending_ticket.snapshot.run.id.clone();
        let pending_decision = pending_ticket
            .decision
            .take()
            .expect("pending approval receiver");
        apply_attached_run_control(
            pending_runtime.as_ref(),
            "actor",
            &pending_run_id,
            &AgentCommandV1::RunStop {
                run_id: pending_run_id.clone(),
            },
        )
        .await
        .expect("pending Stop ACK");
        assert_eq!(
            pending_decision.await.expect("pending Stop decision"),
            crate::env_runtime::RunApprovalDecision::Cancelled
        );
        assert_eq!(
            pending_runtime
                .resolve_run_approval(
                    &pending_run_id,
                    crate::env_runtime::RunApprovalDecision::Approve,
                )
                .expect_err("cancelled pending approval cannot be approved")
                .code,
            crate::env_runtime::EnvRuntimeErrorCode::APPROVAL_CLOSED
        );

        let (_starting_tempdir, starting_runtime, mut starting_ticket, starting_profile) =
            attached_run_fixture();
        let starting_run_id = starting_ticket.snapshot.run.id.clone();
        let starting_decision = starting_ticket
            .decision
            .take()
            .expect("starting approval receiver");
        starting_runtime
            .resolve_run_approval(
                &starting_run_id,
                crate::env_runtime::RunApprovalDecision::Approve,
            )
            .expect("desktop approval moves run to starting");
        assert_eq!(
            starting_decision.await.expect("starting approval decision"),
            crate::env_runtime::RunApprovalDecision::Approve
        );
        apply_attached_run_control(
            starting_runtime.as_ref(),
            "actor",
            &starting_run_id,
            &AgentCommandV1::RunStop {
                run_id: starting_run_id.clone(),
            },
        )
        .await
        .expect("starting Stop ACK");
        let error = match starting_runtime.prepare_approved_run(starting_ticket, &starting_profile)
        {
            Ok(_) => panic!("starting Stop must prevent resolver and spawn"),
            Err(error) => error,
        };
        assert_eq!(
            error.code,
            crate::env_runtime::EnvRuntimeErrorCode::CANCELLED
        );

        for (runtime, run_id) in [
            (pending_runtime, pending_run_id),
            (starting_runtime, starting_run_id),
        ] {
            let terminal = runtime
                .list_runs()
                .expect("runs")
                .into_iter()
                .filter(|run| run.id == run_id)
                .collect::<Vec<_>>();
            assert_eq!(terminal.len(), 1);
            assert_eq!(terminal[0].status, AgentRunStatusV1::Cancelled);
            assert_eq!(runtime.status(true).expect("status").active_runs, 0);
        }
    }

    #[tokio::test(flavor = "multi_thread", worker_threads = 2)]
    async fn attached_stop_ack_cancels_pending_or_starting_run_without_spawn() {
        let (_tempdir, runtime, mut ticket, profile) = attached_run_fixture();
        let run_id = ticket.snapshot.run.id.clone();
        let decision = ticket.decision.take().expect("attached approval receiver");
        let start = std::sync::Arc::new(tokio::sync::Barrier::new(2));

        let approval_runtime = std::sync::Arc::clone(&runtime);
        let approval_run_id = run_id.clone();
        let approval_start = std::sync::Arc::clone(&start);
        let approve = tokio::spawn(async move {
            approval_start.wait().await;
            approval_runtime.resolve_run_approval(
                &approval_run_id,
                crate::env_runtime::RunApprovalDecision::Approve,
            )
        });
        let stop_runtime = std::sync::Arc::clone(&runtime);
        let stop_run_id = run_id.clone();
        let stop_start = std::sync::Arc::clone(&start);
        let stop = tokio::spawn(async move {
            stop_start.wait().await;
            apply_attached_run_control(
                stop_runtime.as_ref(),
                "actor",
                &stop_run_id,
                &AgentCommandV1::RunStop {
                    run_id: stop_run_id.clone(),
                },
            )
            .await
        });

        let approve = approve.await.expect("approval task");
        stop.await
            .expect("stop task")
            .expect("attached Stop must be acknowledged");
        let decision = decision.await.expect("approval owner decision");
        match decision {
            crate::env_runtime::RunApprovalDecision::Approve => {
                assert!(approve.is_ok());
                let error = match runtime.prepare_approved_run(ticket, &profile) {
                    Ok(_) => panic!("Stop must remove the starting reservation"),
                    Err(error) => error,
                };
                assert_eq!(
                    error.code,
                    crate::env_runtime::EnvRuntimeErrorCode::CANCELLED
                );
            }
            crate::env_runtime::RunApprovalDecision::Cancelled => {
                assert_eq!(
                    approve.expect_err("Stop won pending approval").code,
                    crate::env_runtime::EnvRuntimeErrorCode::APPROVAL_CLOSED
                );
            }
            other => panic!("unexpected decision: {other:?}"),
        }
        let terminal = runtime
            .list_runs()
            .expect("runs")
            .into_iter()
            .filter(|run| run.id == run_id)
            .collect::<Vec<_>>();
        assert_eq!(terminal.len(), 1);
        assert_eq!(terminal[0].status, AgentRunStatusV1::Cancelled);
        let status = runtime.status(true).expect("status");
        assert_eq!(status.active_runs, 0);
        assert_eq!(status.pending_approvals, 0);
    }

    #[tokio::test(flavor = "multi_thread", worker_threads = 2)]
    async fn concurrent_approve_and_timeout_observe_the_same_transition_owner() {
        for _ in 0..8 {
            let (_tempdir, runtime, mut ticket, _profile) = attached_run_fixture();
            let run_id = ticket.snapshot.run.id.clone();
            let mut decision = ticket.decision.take().expect("attached approval receiver");
            let start = std::sync::Arc::new(tokio::sync::Barrier::new(2));

            let approval_runtime = std::sync::Arc::clone(&runtime);
            let approval_run_id = run_id.clone();
            let approval_start = std::sync::Arc::clone(&start);
            let approve = tokio::spawn(async move {
                approval_start.wait().await;
                approval_runtime.resolve_run_approval(
                    &approval_run_id,
                    crate::env_runtime::RunApprovalDecision::Approve,
                )
            });
            let timeout_runtime = std::sync::Arc::clone(&runtime);
            let timeout_run_id = run_id.clone();
            let timeout_start = std::sync::Arc::clone(&start);
            let timeout = tokio::spawn(async move {
                timeout_start.wait().await;
                resolve_timeout_or_observe_approval_owner(
                    timeout_runtime.as_ref(),
                    &timeout_run_id,
                    &mut decision,
                )
                .await
            });

            let approve = approve.await.expect("approval task");
            let timeout_decision = timeout.await.expect("timeout task");
            match approve {
                Ok(()) => {
                    assert_eq!(
                        timeout_decision,
                        crate::env_runtime::RunApprovalDecision::Approve,
                        "timeout must observe the already-sent approval"
                    );
                    runtime
                        .stop_run_for_actor(&run_id, "actor")
                        .await
                        .expect("cleanup starting run");
                }
                Err(error) => {
                    assert_eq!(
                        error.code,
                        crate::env_runtime::EnvRuntimeErrorCode::APPROVAL_CLOSED
                    );
                    assert_eq!(
                        timeout_decision,
                        crate::env_runtime::RunApprovalDecision::Expired,
                        "timeout may report expiry only when it won the transition"
                    );
                }
            }
            let terminal = runtime
                .list_runs()
                .expect("runs")
                .into_iter()
                .filter(|run| run.id == run_id)
                .collect::<Vec<_>>();
            assert_eq!(terminal.len(), 1);
            assert_eq!(terminal[0].status, AgentRunStatusV1::Cancelled);
            let status = runtime.status(true).expect("status");
            assert_eq!(status.active_runs, 0);
            assert_eq!(status.pending_approvals, 0);
        }
    }

    #[test]
    fn protocol_errors_include_stable_recovery_contract() {
        let rate_limited = protocol_error("RATE_LIMITED", "slow down");
        assert!(rate_limited.retryable);
        assert_eq!(
            rate_limited.next_action.as_deref(),
            Some("retry_with_backoff")
        );

        let too_large = protocol_error("REQUEST_TOO_LARGE", "too large");
        assert!(!too_large.retryable);
        assert_eq!(too_large.next_action.as_deref(), Some("reduce_request"));
    }

    #[test]
    fn feature_denials_keep_typed_agent_contracts() {
        for (source, expected, retryable, next_action) in [
            (
                "FEATURE_UNSUPPORTED_ON_PLATFORM",
                "UNSUPPORTED_PLATFORM",
                false,
                "use_supported_macos_desktop",
            ),
            (
                "FEATURE_DISABLED_BY_ROLLOUT",
                "FEATURE_DISABLED_BY_ROLLOUT",
                false,
                "wait_for_feature_rollout",
            ),
            (
                "ENTITLEMENT_UNAVAILABLE",
                "ENTITLEMENT_UNAVAILABLE",
                true,
                "open_chromvoid_and_retry",
            ),
            (
                "PRO_REQUIRED",
                "PRO_REQUIRED",
                false,
                "ask_user_to_enable_pro",
            ),
        ] {
            let (_, code) = rpc_result_error(crate::types::RpcResult::Error {
                ok: false,
                error: "denied".to_string(),
                code: Some(source.to_string()),
            });
            assert_eq!(code, expected);
            let error = protocol_error(code.as_str(), "denied");
            assert_eq!(error.retryable, retryable, "{source}");
            assert_eq!(error.next_action.as_deref(), Some(next_action), "{source}");
        }

        let internal = env_runtime_error_from_rpc_result(crate::types::RpcResult::Error {
            ok: false,
            error: "private-feature-denial-marker".to_string(),
            code: Some("UNKNOWN_FEATURE_DENIAL".to_string()),
        });
        assert_eq!(internal.code, "INTERNAL");
        let mapped = agent_error_from_runtime(internal, AgentErrorContext::Generic);
        assert_eq!(mapped.code, "INTERNAL");
        assert_eq!(mapped.message, "Env Runtime request failed internally");
        assert!(!mapped.message.contains("private-feature-denial-marker"));
    }

    #[test]
    fn every_runtime_error_maps_to_the_agent_v1_whitelist() {
        let whitelist = [
            "INVALID_REQUEST",
            "UNSUPPORTED_VERSION",
            "REQUEST_TOO_LARGE",
            "RATE_LIMITED",
            "GATEWAY_UNAVAILABLE",
            "NOT_PAIRED",
            "AGENT_REVOKED",
            "UNSUPPORTED_PLATFORM",
            "REMOTE_CORE_UNSUPPORTED",
            "VAULT_REQUIRED",
            "PRO_REQUIRED",
            "FEATURE_DISABLED_BY_ROLLOUT",
            "ENTITLEMENT_UNAVAILABLE",
            "DEVICE_STORE_UNAVAILABLE",
            "SECRET_NOT_FOUND",
            "PROFILE_NOT_FOUND",
            "PRESET_NOT_FOUND",
            "PROPOSAL_NOT_FOUND",
            "RUN_NOT_FOUND",
            "REVISION_CONFLICT",
            "SECRET_IN_USE",
            "PROFILE_IN_USE",
            "PROPOSAL_REJECTED",
            "PROPOSAL_EXPIRED",
            "APPROVAL_REJECTED",
            "APPROVAL_EXPIRED",
            "CANCELLED",
            "PROFILE_PRESET_MISMATCH",
            "WORKSPACE_MISMATCH",
            "EXECUTABLE_IDENTITY_MISMATCH",
            "RUN_LIMIT_REACHED",
            "SECRET_RESOLUTION_FAILED",
            "SPAWN_FAILED",
            "OUTPUT_BACKPRESSURE",
            "RUN_ALREADY_TERMINAL",
            "INTERNAL",
        ]
        .into_iter()
        .collect::<HashSet<_>>();
        let contexts = [
            AgentErrorContext::Generic,
            AgentErrorContext::Profile,
            AgentErrorContext::Preset,
            AgentErrorContext::Proposal,
            AgentErrorContext::Run,
        ];

        for &source in crate::env_runtime::EnvRuntimeErrorCode::ALL {
            for context in contexts {
                let mapped = agent_error_from_runtime(
                    crate::env_runtime::EnvRuntimeError::new(source, "__RAW_INTERNAL_MARKER__"),
                    context,
                );
                assert!(whitelist.contains(mapped.code.as_str()), "{source}");
                let (retryable, next_action) = error_recovery(&mapped.code);
                assert_eq!(mapped.retryable, retryable, "{source}");
                assert_eq!(mapped.next_action.as_deref(), Some(next_action), "{source}");
                if mapped.code == "INTERNAL" {
                    assert!(!mapped.message.contains("__RAW_INTERNAL_MARKER__"));
                }
            }
        }
    }

    #[test]
    fn pre_spawn_cancellation_is_not_reported_as_already_terminal() {
        let mapped = agent_error_from_runtime(
            crate::env_runtime::EnvRuntimeError::new(
                crate::env_runtime::EnvRuntimeErrorCode::CANCELLED,
                "Run approval was cancelled before spawn",
            ),
            AgentErrorContext::Run,
        );
        assert_eq!(mapped.code, "CANCELLED");
        assert!(!mapped.retryable);
        assert_eq!(
            mapped.next_action.as_deref(),
            Some("request_new_run_if_still_needed")
        );
    }

    #[test]
    fn disappeared_prepared_preset_facts_map_to_revision_conflict() {
        let mapped = agent_error_from_runtime(
            crate::env_runtime::EnvRuntimeError::new(
                crate::env_runtime::EnvRuntimeErrorCode::REVISION_CONFLICT,
                "Canonical preset facts changed since the proposal was submitted",
            ),
            AgentErrorContext::Preset,
        );
        assert_eq!(mapped.code, "REVISION_CONFLICT");
        assert!(!mapped.retryable);
        assert_eq!(mapped.next_action.as_deref(), Some("refresh_and_repropose"));
    }

    #[test]
    fn blocking_scheduler_failures_are_internal_and_never_expose_join_details() {
        let failure = env_runtime_background_task_failure();
        assert_eq!(
            failure.code,
            crate::env_runtime::EnvRuntimeErrorCode::INTERNAL
        );
        let mapped = agent_error_from_runtime(
            crate::env_runtime::EnvRuntimeError::new(
                failure.code,
                "raw-task-failure-marker raw-panic-marker",
            ),
            AgentErrorContext::Generic,
        );
        assert_eq!(mapped.code, "INTERNAL");
        assert_eq!(mapped.message, "Env Runtime request failed internally");
        assert!(!mapped.message.contains("raw-task-failure-marker"));
        assert!(!mapped.message.contains("raw-panic-marker"));
    }

    #[test]
    fn unknown_core_codes_and_messages_are_redacted_as_internal() {
        let source = crate::env_runtime::EnvRuntimeErrorCode::from_core("NEW_PRIVATE_CORE_CODE");
        assert_eq!(source, crate::env_runtime::EnvRuntimeErrorCode::INTERNAL);
        let mapped = agent_error_from_runtime(
            crate::env_runtime::EnvRuntimeError::new(source, "private core detail"),
            AgentErrorContext::Generic,
        );
        assert_eq!(mapped.code, "INTERNAL");
        assert_eq!(mapped.message, "Env Runtime request failed internally");
        assert!(!mapped.retryable);
        assert_eq!(
            mapped.next_action.as_deref(),
            Some("report_diagnostics_without_secrets")
        );
    }

    #[test]
    fn not_found_errors_are_resource_specific() {
        let error = || {
            crate::env_runtime::EnvRuntimeError::new(
                crate::env_runtime::EnvRuntimeErrorCode::NOT_FOUND,
                "missing",
            )
        };
        assert_eq!(
            agent_error_from_runtime(error(), AgentErrorContext::Profile).code,
            "PROFILE_NOT_FOUND"
        );
        assert_eq!(
            agent_error_from_runtime(error(), AgentErrorContext::Preset).code,
            "PRESET_NOT_FOUND"
        );
        assert_eq!(
            agent_error_from_runtime(error(), AgentErrorContext::Proposal).code,
            "PROPOSAL_NOT_FOUND"
        );
        assert_eq!(
            agent_error_from_runtime(error(), AgentErrorContext::Run).code,
            "RUN_NOT_FOUND"
        );
        assert_eq!(
            AgentErrorContext::for_command(&AgentCommandV1::PresetsList {
                profile: Some("backend-dev".to_string()),
            })
            .not_found_code(),
            "PROFILE_NOT_FOUND"
        );
    }

    #[test]
    fn preset_filter_uses_canonical_profile_id_after_alias_resolution() {
        let requested_slug = "backend-dev";
        let canonical_profile_id = "profile-01";

        assert!(preset_matches_profile(
            "profile-01",
            Some(canonical_profile_id)
        ));
        assert!(!preset_matches_profile("profile-01", Some(requested_slug)));
        assert!(preset_matches_profile("profile-01", None));
    }

    #[test]
    fn oversized_request_probe_only_accepts_bounded_request_ids() {
        assert_eq!(
            request_id_probe(br#"{"request_id":"req-1","data":{}}"#),
            "req-1"
        );
        assert_eq!(request_id_probe(br#"{"request_id":""}"#), "unknown");
        let oversized = format!(r#"{{"request_id":"{}"}}"#, "x".repeat(129));
        assert_eq!(request_id_probe(oversized.as_bytes()), "unknown");
        assert_eq!(
            request_id_probe(br#"{"request_id":"not valid"}"#),
            "unknown"
        );
    }

    #[test]
    fn request_ids_are_opaque_and_unique_per_session() {
        for valid in ["a", "req-01j2.example:part_2", &"x".repeat(128)] {
            assert!(is_opaque_id(valid), "{valid}");
        }
        for invalid in [
            "",
            "contains space",
            "slash/not-allowed",
            "é",
            &"x".repeat(129),
        ] {
            assert!(!is_opaque_id(invalid), "{invalid}");
        }

        let request = AgentRequestV1 {
            protocol_version: AGENT_PROTOCOL_VERSION,
            schema_version: AGENT_SCHEMA_VERSION,
            request_id: "req-1".to_string(),
            timestamp_secs: 1,
            command: AgentCommandV1::EnvStatus,
        };
        let mut seen = HashSet::new();
        assert!(invalid_request_id_response(&request, &mut seen).is_none());
        let duplicate = invalid_request_id_response(&request, &mut seen).expect("duplicate");
        assert_eq!(duplicate.error.expect("error").code, "INVALID_REQUEST");
    }

    #[test]
    fn metadata_gateway_boundary_rejects_disabled_unpaired_and_revoked_agents() {
        let tempdir = tempfile::tempdir().expect("tempdir");
        let mut gateway =
            crate::gateway::GatewayState::load_or_default(tempdir.path().join("gateway-test.json"));

        assert_eq!(
            metadata_gateway_denial(&gateway, "agent"),
            Some(("GATEWAY_UNAVAILABLE", "ChromVoid Gateway is disabled"))
        );
        gateway.config.enabled = true;
        assert_eq!(
            metadata_gateway_denial(&gateway, "agent"),
            Some(("AGENT_REVOKED", "CLI agent identity is no longer active"))
        );
        gateway.upsert_paired_agent("agent".to_string());
        assert_eq!(metadata_gateway_denial(&gateway, "agent"), None);
        gateway.config.paired_agents[0].revoked = true;
        assert_eq!(
            metadata_gateway_denial(&gateway, "agent"),
            Some(("AGENT_REVOKED", "CLI agent identity is no longer active"))
        );
    }

    #[test]
    fn spawn_boundary_blocks_vault_lock_and_gateway_disable_until_spawn_returns() {
        let tempdir = tempfile::tempdir().expect("tempdir");
        let runtime = std::sync::Arc::new(
            crate::env_runtime::EnvRuntimeState::new(
                tempdir.path().join("spawn-boundary-presets.enc.json"),
            )
            .expect("runtime"),
        );
        let gateway = std::sync::Arc::new(std::sync::Mutex::new(()));
        let adapter = std::sync::Arc::new(std::sync::Mutex::new(()));
        let (checked_tx, checked_rx) = std::sync::mpsc::channel();
        let (continue_tx, continue_rx) = std::sync::mpsc::channel();
        let (spawned_tx, spawned_rx) = std::sync::mpsc::channel();

        let spawn_runtime = runtime.clone();
        let spawn_gateway = gateway.clone();
        let spawn_adapter = adapter.clone();
        let spawn_thread = std::thread::spawn(move || {
            with_spawn_commit_guard(spawn_runtime.as_ref(), || {
                let _gateway_guard = spawn_gateway.lock().expect("gateway guard");
                let _adapter_guard = spawn_adapter.lock().expect("adapter guard");
                checked_tx.send(()).expect("checked signal");
                continue_rx.recv_timeout(TEST_WAIT).expect("continue spawn");
                spawned_tx.send(()).expect("spawned signal");
                Ok(())
            })
            .expect("spawn boundary");
        });
        checked_rx
            .recv_timeout(TEST_WAIT)
            .expect("final checks reached");
        assert!(matches!(
            adapter.try_lock(),
            Err(std::sync::TryLockError::WouldBlock)
        ));
        assert!(matches!(
            gateway.try_lock(),
            Err(std::sync::TryLockError::WouldBlock)
        ));

        let (lock_attempt_tx, lock_attempt_rx) = std::sync::mpsc::channel();
        let (lock_acquired_tx, lock_acquired_rx) = std::sync::mpsc::channel();
        let lock_adapter = adapter.clone();
        let lock_thread = std::thread::spawn(move || {
            lock_attempt_tx.send(()).expect("lock attempt signal");
            let _adapter_guard = lock_adapter.lock().expect("vault adapter guard");
            lock_acquired_tx.send(()).expect("lock acquired signal");
        });

        let (disable_attempt_tx, disable_attempt_rx) = std::sync::mpsc::channel();
        let (disable_acquired_tx, disable_acquired_rx) = std::sync::mpsc::channel();
        let disable_gateway = gateway.clone();
        let disable_thread = std::thread::spawn(move || {
            disable_attempt_tx.send(()).expect("disable attempt signal");
            let _gateway_guard = disable_gateway.lock().expect("disable gateway guard");
            disable_acquired_tx
                .send(())
                .expect("disable acquired signal");
        });

        lock_attempt_rx
            .recv_timeout(TEST_WAIT)
            .expect("vault lock attempted");
        disable_attempt_rx
            .recv_timeout(TEST_WAIT)
            .expect("gateway disable attempted");
        assert!(matches!(
            lock_acquired_rx.try_recv(),
            Err(std::sync::mpsc::TryRecvError::Empty)
        ));
        assert!(matches!(
            disable_acquired_rx.try_recv(),
            Err(std::sync::mpsc::TryRecvError::Empty)
        ));

        continue_tx.send(()).expect("allow spawn");
        spawned_rx
            .recv_timeout(TEST_WAIT)
            .expect("spawn completed before guard release");
        lock_acquired_rx
            .recv_timeout(TEST_WAIT)
            .expect("vault lock admitted after spawn");
        disable_acquired_rx
            .recv_timeout(TEST_WAIT)
            .expect("gateway disable admitted after spawn");

        spawn_thread.join().expect("spawn thread");
        lock_thread.join().expect("lock thread");
        disable_thread.join().expect("disable thread");
    }

    #[test]
    fn proposal_reference_not_found_codes_identify_the_missing_resource() {
        use crate::env_runtime::{EnvRuntimeError, EnvRuntimeErrorCode};

        for (typed_code, wire_code) in [
            (EnvRuntimeErrorCode::PROFILE_NOT_FOUND, "PROFILE_NOT_FOUND"),
            (EnvRuntimeErrorCode::PRESET_NOT_FOUND, "PRESET_NOT_FOUND"),
        ] {
            let typed = remap_not_found(
                EnvRuntimeError::new(EnvRuntimeErrorCode::NOT_FOUND, "missing reference"),
                typed_code,
            );
            assert_eq!(
                agent_error_from_runtime(typed, AgentErrorContext::Generic).code,
                wire_code
            );
        }

        let missing_secret = EnvRuntimeError::new(
            EnvRuntimeErrorCode::NOT_FOUND,
            "missing proposal secret reference",
        );
        assert_eq!(
            agent_error_from_runtime(missing_secret, AgentErrorContext::Generic).code,
            "SECRET_NOT_FOUND"
        );
    }
}
