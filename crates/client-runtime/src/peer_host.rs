//! Encrypted host connection backed exclusively by the application's admitted Core work.
use super::peer_publication::PeerPublication;
use super::peer_session::PeerSession;
use super::peer_stream::PeerStreamReply;
use super::peer_upload::{AdmittedPeerUpload, PeerUploadError};
use super::*;
use chromvoid_core::rpc::types::{PROTOCOL_VERSION, RpcResponse};
use chromvoid_network_runtime::host_streams::*;
use chromvoid_network_runtime::remote_io::{
    RemoteIoFailure, RemoteIoResult, recv_decrypted_frame_typed, send_encrypted_frame_typed,
};
use chromvoid_network_runtime::rpc_transport_protocol::{
    RemoteStreamControl, TransportPolicy, parse_stream_control_frame,
};
use chromvoid_protocol::{
    AntiReplay, Frame, FrameType, MAX_FRAME_PAYLOAD_SIZE, NoiseTransport, RemoteTransport,
    TransportType, frame_from_heartbeat,
};
use std::collections::HashMap;
use std::time::Duration;
use tokio::sync::oneshot;
use tokio::task::JoinSet;
use zeroize::Zeroizing;

const HEARTBEAT_INTERVAL: Duration = Duration::from_secs(30);
const CLOSE_TIMEOUT: Duration = Duration::from_secs(1);
const RECENT_DERIVATIVES: usize = 64;
/// A notice about to end a USB session gets this long on the wire before the session closes.
const USB_FAREWELL_TIMEOUT: Duration = Duration::from_millis(250);
const USB_HOST_UNLOCK_CONFIRMED: &str = "mobile_usb:host_unlock_confirmed";
const USB_HOST_LOCKED: &str = "mobile_usb:host_locked";
const USB_SESSION_APPROVAL_EXPIRED: &str = "mobile_usb:session_approval_expired";
const USB_SESSION_DISCONNECT: &str = "mobile_usb:session_disconnect";

/// The person's answer on the phone to a desktop's USB session.
#[derive(Clone, Copy, Debug, PartialEq, Eq)]
pub(crate) enum UsbDecision {
    Pending,
    Allowed,
    Denied,
    Expired,
}

/// A USB session's reach. Until the person allows it the desktop may only ask what the phone
/// is and whether its vault is open; once allowed, the desktop is told when the vault opens,
/// and the session ends when the phone's vault locks.
pub(crate) struct UsbGate {
    decision: tokio::sync::watch::Receiver<UsbDecision>,
    session: tokio::sync::watch::Receiver<u64>,
    allowed: bool,
    confirmed: bool,
    unlocked: bool,
}

impl UsbGate {
    pub(crate) fn new(
        peer: &PeerSession,
        decision: tokio::sync::watch::Receiver<UsbDecision>,
    ) -> Option<Self> {
        let session = peer.session.upgrade()?;
        let unlocked = session.snapshot().ok()?.phase == SessionPhase::Unlocked;
        Some(Self {
            decision,
            session: session.inner.changed.subscribe(),
            allowed: false,
            confirmed: false,
            unlocked,
        })
    }
}

/// How a USB session's serving ended without a transport failure.
#[derive(Clone, Copy, Debug, PartialEq, Eq)]
pub(crate) enum UsbExit {
    /// Stopped from this side, or the peer's authority was revoked.
    Stopped,
    /// The desktop asked to lock; the phone's vault stays as it is.
    VaultLockRequested,
    /// The phone's own vault locked.
    VaultLocked,
    ClientDisconnected,
    Denied,
    Expired,
}

enum UsbEvent {
    Decision(UsbDecision),
    SessionChanged,
}

async fn usb_event(gate: Option<&mut UsbGate>) -> UsbEvent {
    let Some(gate) = gate else {
        return std::future::pending().await;
    };
    tokio::select! {
        changed = gate.decision.changed(), if !gate.allowed => match changed {
            Ok(()) => UsbEvent::Decision(*gate.decision.borrow_and_update()),
            // The approval's owner went away: nobody can allow this session any more.
            Err(_) => UsbEvent::Decision(UsbDecision::Expired),
        },
        changed = gate.session.changed() => match changed {
            Ok(()) => UsbEvent::SessionChanged,
            Err(_) => std::future::pending().await,
        },
    }
}

struct RequestContext {
    id: u64,
    command: String,
    stream_control: bool,
    publication: PeerPublication,
}
struct IncomingUpload {
    context: RequestContext,
    upload: AdmittedPeerUpload,
}
struct Completion {
    id: u64,
    reply: Result<PeerStreamReply, SessionError>,
}

/// Consume an already authenticated, authorized connection. Authentication/listener code
/// must open its PeerSession from the same app session, never from a fallback Core adapter.
/// Dropping this future also drops the peer and revokes all of its unfinished requests.
pub async fn serve_peer(
    peer: PeerSession,
    transport: Box<dyn RemoteTransport>,
    noise: NoiseTransport,
    peer_id: String,
    shutdown: oneshot::Receiver<()>,
) -> RemoteIoResult<()> {
    serve_with_heartbeat(
        peer,
        transport,
        noise,
        peer_id,
        shutdown,
        HEARTBEAT_INTERVAL,
    )
    .await
}

async fn serve_with_heartbeat(
    peer: PeerSession,
    mut transport: Box<dyn RemoteTransport>,
    noise: NoiseTransport,
    peer_id: String,
    shutdown: oneshot::Receiver<()>,
    heartbeat: Duration,
) -> RemoteIoResult<()> {
    serve_gated(
        peer,
        transport.as_mut(),
        noise,
        peer_id,
        shutdown,
        heartbeat,
        None,
    )
    .await
    .map(|_| ())
}

/// A USB accessory session: the same host, gated by the person's answer on the phone.
pub(crate) async fn serve_usb_peer(
    peer: PeerSession,
    transport: &mut dyn RemoteTransport,
    noise: NoiseTransport,
    peer_id: String,
    shutdown: oneshot::Receiver<()>,
    gate: UsbGate,
) -> RemoteIoResult<UsbExit> {
    serve_gated(
        peer,
        transport,
        noise,
        peer_id,
        shutdown,
        HEARTBEAT_INTERVAL,
        Some(gate),
    )
    .await
}

async fn serve_gated(
    peer: PeerSession,
    transport: &mut dyn RemoteTransport,
    mut noise: NoiseTransport,
    peer_id: String,
    mut shutdown: oneshot::Receiver<()>,
    heartbeat: Duration,
    mut usb: Option<UsbGate>,
) -> RemoteIoResult<UsbExit> {
    if (transport.transport_type() == TransportType::UsbMobile) != usb.is_some() {
        let _ = peer.close();
        let _ = tokio::time::timeout(CLOSE_TIMEOUT, transport.close()).await;
        return Err(RemoteIoFailure::protocol_error(
            "A USB mobile session is served only through its approval gate",
        ));
    }
    let mut server_id = 1u64;
    let mut revoked = false;
    let result = {
        let revocation = peer.revoked();
        let run = run(
            &peer,
            &mut *transport,
            &mut noise,
            &peer_id,
            heartbeat,
            usb.as_mut(),
            &mut server_id,
        );
        tokio::select! {
            biased;
            _= &mut shutdown => Ok(UsbExit::Stopped),
            _= revocation => {
                revoked = true;
                Ok(UsbExit::Stopped)
            }
            result=run => result,
        }
    };
    // Locking the phone's vault ends its authority, and with it the peer. A USB desktop that
    // was using the open vault is told the phone locked, not merely that the link went.
    let result = match (&result, usb.as_ref()) {
        (Ok(UsbExit::Stopped) | Err(RemoteIoFailure::TransportClosed), Some(gate))
            if (revoked || result.is_err()) && gate.unlocked && !vault_unlocked(&peer) =>
        {
            farewell(&mut *transport, &mut noise, &mut server_id, USB_HOST_LOCKED).await;
            Ok(UsbExit::VaultLocked)
        }
        _ => result,
    };
    let _ = peer.close();
    // Any canceled partial write has consumed a Noise nonce; close instead of retrying.
    let _ = tokio::time::timeout(CLOSE_TIMEOUT, transport.close()).await;
    result
}

/// A notice from the phone: a request frame under the host's own message ids.
async fn push(
    transport: &mut dyn RemoteTransport,
    noise: &mut NoiseTransport,
    server_id: &mut u64,
    command: &str,
    data: serde_json::Value,
) -> RemoteIoResult<()> {
    let request = RpcRequest::new(command, data);
    let mut payload = serde_json::to_vec(&request)
        .map_err(|error| RemoteIoFailure::data_plane_error(format!("encode push: {error}")))?;
    if payload.len() > MAX_FRAME_PAYLOAD_SIZE
        && matches!(command, "catalog:event" | "catalog:event:batch")
    {
        // Core deltas can exceed a Noise frame. The desktop already refreshes
        // its authoritative manifest for catalog events it cannot apply locally.
        payload = serde_json::to_vec(&RpcRequest::new(
            "catalog:event",
            serde_json::json!({"type": "invalidate"}),
        ))
        .map_err(|error| RemoteIoFailure::data_plane_error(format!("encode push: {error}")))?;
    }
    let frame = Frame {
        frame_type: FrameType::RpcRequest,
        message_id: *server_id,
        flags: 0,
        payload,
    };
    *server_id = server_id
        .checked_add(1)
        .ok_or_else(|| RemoteIoFailure::protocol_error("Host message ID exhausted"))?;
    send_encrypted_frame_typed(transport, noise, frame).await
}

/// A last notice before the session ends; the ending does not wait on a stalled link.
async fn farewell(
    transport: &mut dyn RemoteTransport,
    noise: &mut NoiseTransport,
    server_id: &mut u64,
    command: &str,
) {
    let _ = tokio::time::timeout(
        USB_FAREWELL_TIMEOUT,
        push(transport, noise, server_id, command, serde_json::json!({})),
    )
    .await;
}

fn vault_unlocked(peer: &PeerSession) -> bool {
    peer.session
        .upgrade()
        .and_then(|session| session.snapshot().ok())
        .is_some_and(|snapshot| snapshot.phase == SessionPhase::Unlocked)
}

fn session_error(error: SessionError) -> RemoteIoFailure {
    match error {
        SessionError::Revoked | SessionError::Canceled => RemoteIoFailure::transport_closed(),
        error => RemoteIoFailure::data_plane_error(error.to_string()),
    }
}
fn response_frame(id: u64, response: &RpcResponse) -> RemoteIoResult<Frame> {
    Ok(Frame {
        frame_type: FrameType::RpcResponse,
        message_id: id,
        flags: 0,
        payload: serde_json::to_vec(response).map_err(|error| {
            RemoteIoFailure::data_plane_error(format!("encode response: {error}"))
        })?,
    })
}
async fn send_response(
    transport: &mut dyn RemoteTransport,
    noise: &mut NoiseTransport,
    id: u64,
    response: &RpcResponse,
) -> RemoteIoResult<()> {
    send_encrypted_frame_typed(transport, noise, response_frame(id, response)?).await
}
fn context(id: u64, request: &RpcRequest, publication: PeerPublication) -> RequestContext {
    RequestContext {
        id,
        command: request.command.clone(),
        stream_control: request_advertises_stream_control(request),
        publication,
    }
}
fn remember(recent: &mut VecDeque<u64>, context: &RequestContext) {
    if context.command == "catalog:derivative:ensure" {
        if recent.len() == RECENT_DERIVATIVES {
            recent.pop_front();
        }
        recent.push_back(context.id);
    }
}

async fn run(
    peer: &PeerSession,
    transport: &mut dyn RemoteTransport,
    noise: &mut NoiseTransport,
    peer_id: &str,
    heartbeat: Duration,
    mut usb: Option<&mut UsbGate>,
    server_id: &mut u64,
) -> RemoteIoResult<UsbExit> {
    let policy = TransportPolicy::for_transport(transport.transport_type());
    // A writable relay socket can outlive its peer. Allow one missed heartbeat,
    // then revoke the peer unless any valid encrypted inbound frame arrived.
    let liveness_timeout = heartbeat.saturating_mul(2);
    let mut last_inbound = tokio::time::Instant::now();
    let mut anti_replay = AntiReplay::new();
    let mut heartbeat = tokio::time::interval(heartbeat);
    heartbeat.set_missed_tick_behavior(tokio::time::MissedTickBehavior::Delay);
    heartbeat.tick().await;
    let mut jobs = JoinSet::<Completion>::new();
    let mut contexts = HashMap::<u64, RequestContext>::new();
    let mut streams = HashMap::<u64, HostOutgoingStream>::new();
    let mut order = VecDeque::new();
    let mut upload: Option<IncomingUpload> = None;
    let mut media_epoch = 0u64;
    let mut recent = VecDeque::new();
    enum Event {
        Heartbeat,
        Silent,
        Completed(Option<Result<Completion, tokio::task::JoinError>>),
        Received(RemoteIoResult<Frame>),
        SendChunk,
        Usb(UsbEvent),
        Catalog(Result<serde_json::Value, SessionError>),
    }
    loop {
        let event = tokio::select! {
            _ = tokio::time::sleep_until(last_inbound + liveness_timeout), if policy.heartbeat_enabled => Event::Silent,
            _ = heartbeat.tick(), if policy.heartbeat_enabled => Event::Heartbeat,
            completed = jobs.join_next(), if !jobs.is_empty() => Event::Completed(completed),
            received = recv_decrypted_frame_typed(transport, noise) => Event::Received(received),
            _ = tokio::task::yield_now(), if !streams.is_empty() => Event::SendChunk,
            event = usb_event(usb.as_deref_mut()) => Event::Usb(event),
            event = peer.next_catalog_event() => Event::Catalog(event),
        };
        match event {
            Event::Catalog(event) => {
                let mut event = event.map_err(session_error)?;
                let command = event["command"]
                    .as_str()
                    .ok_or_else(|| {
                        RemoteIoFailure::data_plane_error("Catalog event command missing")
                    })?
                    .to_owned();
                let publication = peer.event_publication().map_err(session_error)?;
                let mut published = publication.transport(transport);
                push(
                    &mut published,
                    noise,
                    server_id,
                    &command,
                    event["data"].take(),
                )
                .await?;
            }
            Event::Usb(UsbEvent::Decision(decision)) => {
                let gate = usb.as_deref_mut().expect("a USB event has its gate");
                match decision {
                    UsbDecision::Pending => {}
                    UsbDecision::Allowed => {
                        gate.allowed = true;
                        gate.unlocked = vault_unlocked(peer);
                        if gate.unlocked {
                            push(
                                transport,
                                noise,
                                server_id,
                                USB_HOST_UNLOCK_CONFIRMED,
                                serde_json::json!({}),
                            )
                            .await?;
                            gate.confirmed = true;
                        }
                    }
                    UsbDecision::Denied => return Ok(UsbExit::Denied),
                    UsbDecision::Expired => {
                        farewell(transport, noise, server_id, USB_SESSION_APPROVAL_EXPIRED).await;
                        return Ok(UsbExit::Expired);
                    }
                }
            }
            Event::Usb(UsbEvent::SessionChanged) => {
                let gate = usb.as_deref_mut().expect("a USB event has its gate");
                let unlocked = vault_unlocked(peer);
                if gate.unlocked && !unlocked {
                    farewell(transport, noise, server_id, USB_HOST_LOCKED).await;
                    return Ok(UsbExit::VaultLocked);
                }
                gate.unlocked = unlocked;
                if gate.allowed && unlocked && !gate.confirmed {
                    push(
                        transport,
                        noise,
                        server_id,
                        USB_HOST_UNLOCK_CONFIRMED,
                        serde_json::json!({}),
                    )
                    .await?;
                    gate.confirmed = true;
                }
            }
            Event::Silent => return Err(RemoteIoFailure::transport_timeout()),
            Event::Heartbeat => {
                send_encrypted_frame_typed(
                    transport,
                    noise,
                    frame_from_heartbeat(*server_id, PROTOCOL_VERSION),
                )
                .await?;
                *server_id = server_id.checked_add(1).ok_or_else(|| {
                    RemoteIoFailure::protocol_error("Host heartbeat ID exhausted")
                })?;
            }
            Event::Completed(completed) => {
                let completed = completed
                    .ok_or_else(|| RemoteIoFailure::data_plane_error("Host task disappeared"))?
                    .map_err(|_| RemoteIoFailure::data_plane_error("Host task failed"))?;
                let Some(context) = contexts.remove(&completed.id) else {
                    continue;
                }; // canceled request
                let reply = match completed.reply {
                    Ok(reply) => reply,
                    Err(error @ (SessionError::Busy | SessionError::Canceled)) => {
                        let code = if error == SessionError::Busy {
                            "BUSY"
                        } else {
                            "CANCELLED"
                        };
                        // Only a fixed status is sent after a request cancellation; its
                        // revoked result and publication capability are never reused.
                        send_response(
                            transport,
                            noise,
                            context.id,
                            &RpcResponse::error(error.to_string(), Some(code)),
                        )
                        .await?;
                        remember(&mut recent, &context);
                        continue;
                    }
                    Err(error) => return Err(session_error(error)),
                };
                let mut published = context.publication.transport(transport);
                match reply {
                    PeerStreamReply::Json(response) => {
                        send_response(&mut published, noise, context.id, &response.0).await?;
                        remember(&mut recent, &context);
                    }
                    PeerStreamReply::Stream(output) => {
                        start_host_outgoing_stream(
                            &mut published,
                            noise,
                            context.id,
                            peer_id,
                            &context.command,
                            context.stream_control,
                            frame_stream_meta_response(context.id, &output.meta),
                            output.reader,
                            &mut streams,
                            &mut order,
                        )
                        .await?;
                    }
                    PeerStreamReply::RangeStream(output) => {
                        start_host_outgoing_stream(
                            &mut published,
                            noise,
                            context.id,
                            peer_id,
                            &context.command,
                            context.stream_control,
                            frame_range_stream_meta_response(context.id, &output.meta),
                            output.reader,
                            &mut streams,
                            &mut order,
                        )
                        .await?;
                    }
                }
                drop(published);
                if streams.contains_key(&completed.id) {
                    contexts.insert(completed.id, context);
                }
            }
            Event::Received(received) => {
                let mut frame = received?;
                last_inbound = tokio::time::Instant::now();
                match frame.frame_type {
                    FrameType::Heartbeat | FrameType::RpcResponse => continue,
                    FrameType::Error => {
                        if let Some(control) = parse_stream_control_frame(&frame) {
                            if upload
                                .as_ref()
                                .is_some_and(|upload| upload.context.id == frame.message_id)
                            {
                                peer.cancel(frame.message_id).map_err(session_error)?;
                                upload = None;
                                anti_replay.clear_active_stream();
                                continue;
                            }
                            if matches!(control, RemoteStreamControl::Cancelled { .. }) {
                                if let Some(context) = contexts.remove(&frame.message_id) {
                                    peer.cancel(frame.message_id).map_err(session_error)?;
                                    streams.remove(&frame.message_id);
                                    remove_host_outgoing_stream_order(&mut order, frame.message_id);
                                    remember(&mut recent, &context);
                                    continue;
                                }
                                if let Some(position) =
                                    recent.iter().position(|id| *id == frame.message_id)
                                {
                                    recent.remove(position);
                                    continue;
                                }
                            }
                        }
                        return Err(RemoteIoFailure::protocol_error(
                            "Peer sent an unexpected error frame",
                        ));
                    }
                    FrameType::RpcRequest => {}
                }
                anti_replay.check(frame.message_id).map_err(|error| {
                    RemoteIoFailure::protocol_error(format!("anti_replay: {error}"))
                })?;
                if upload
                    .as_ref()
                    .is_some_and(|upload| upload.context.id == frame.message_id)
                {
                    let incoming = upload.as_mut().expect("active upload");
                    let execution = {
                        let session = peer
                            .session
                            .upgrade()
                            .ok_or_else(RemoteIoFailure::transport_closed)?;
                        session.execute_upload_frame(
                            &mut incoming.upload,
                            std::mem::take(&mut frame.payload),
                            !frame.has_continuation(),
                        )
                    };
                    match execution.await {
                        Ok(None) => {}
                        Ok(Some(response)) => {
                            let mut published = incoming.context.publication.transport(transport);
                            send_response(&mut published, noise, frame.message_id, &response.0)
                                .await?;
                            drop(published);
                            upload = None;
                            anti_replay.clear_active_stream();
                        }
                        Err(PeerUploadError::Rejected(response)) => {
                            let mut published = incoming.context.publication.transport(transport);
                            send_response(&mut published, noise, frame.message_id, &response.0)
                                .await?;
                            drop(published);
                            peer.cancel(frame.message_id).map_err(session_error)?;
                            upload = None;
                            anti_replay.clear_active_stream();
                        }
                        Err(PeerUploadError::Session(error)) => return Err(session_error(error)),
                    }
                    continue;
                }
                let payload = Zeroizing::new(std::mem::take(&mut frame.payload));
                let request: RpcRequest = serde_json::from_slice(&payload)
                    .map_err(|_| RemoteIoFailure::protocol_error("Invalid RPC request"))?;
                let owned = OwnedRequest(request);
                let request = &owned.0;
                if let Some(gate) = usb.as_deref() {
                    if request.command == USB_SESSION_DISCONNECT {
                        send_response(
                            transport,
                            noise,
                            frame.message_id,
                            &RpcResponse::success(serde_json::Value::Null),
                        )
                        .await?;
                        return Ok(UsbExit::ClientDisconnected);
                    }
                    if !gate.allowed
                        && !matches!(
                            request.command.as_str(),
                            "core:capabilities" | "vault:status"
                        )
                    {
                        send_response(
                            transport,
                            noise,
                            frame.message_id,
                            &RpcResponse::error(
                                format!(
                                    "USB session approval required before command {}",
                                    request.command
                                ),
                                Some("ERR_USB_MOBILE_SESSION_APPROVAL_REQUIRED"),
                            ),
                        )
                        .await?;
                        continue;
                    }
                }
                // Control replies contain no revoked result data. Their transport is still
                // interrupted by the connection's outer lifecycle/shutdown select.
                if request.command == "vault:lock" {
                    send_response(
                        transport,
                        noise,
                        frame.message_id,
                        &RpcResponse::success(serde_json::Value::Null),
                    )
                    .await?;
                    return Ok(UsbExit::VaultLockRequested);
                }
                if request.command.starts_with("env_runtime:") {
                    send_response(
                        transport,
                        noise,
                        frame.message_id,
                        &RpcResponse::error(
                            "Env Runtime is unavailable through remote connections",
                            Some("REMOTE_CORE_UNSUPPORTED"),
                        ),
                    )
                    .await?;
                    continue;
                }
                if request.command == "catalog:media:inspect:cancel" {
                    // Cancellation must work when the Core admission queue is full.
                    // These fixed control replies carry no result data and remain
                    // subject to the connection's generation/shutdown boundary.
                    let epoch = request
                        .data
                        .get("epoch")
                        .and_then(serde_json::Value::as_u64)
                        .unwrap_or_else(|| media_epoch.saturating_add(1));
                    if epoch > media_epoch {
                        media_epoch = epoch;
                        let ids: Vec<_> = contexts
                            .iter()
                            .filter(|(_, context)| context.command == "catalog:media:inspect")
                            .map(|(id, _)| *id)
                            .collect();
                        for id in ids {
                            peer.cancel(id).map_err(session_error)?;
                            contexts.remove(&id);
                            send_response(
                                transport,
                                noise,
                                id,
                                &RpcResponse::error("Media inspection canceled", Some("CANCELLED")),
                            )
                            .await?;
                        }
                    }
                    send_response(
                        transport,
                        noise,
                        frame.message_id,
                        &RpcResponse::success(serde_json::json!({"epoch":media_epoch})),
                    )
                    .await?;
                    continue;
                }
                if frame.has_continuation() {
                    if !matches!(
                        request.command.as_str(),
                        "catalog:upload"
                            | "catalog:file:replace"
                            | "catalog:secret:write"
                            | "catalog:derivative:write"
                    ) {
                        send_response(
                            transport,
                            noise,
                            frame.message_id,
                            &RpcResponse::error(
                                "Command does not accept an input stream",
                                Some("STREAM_UNEXPECTED"),
                            ),
                        )
                        .await?;
                        continue;
                    }
                    if upload.is_some() {
                        send_response(
                            transport,
                            noise,
                            frame.message_id,
                            &RpcResponse::error(
                                "another upload stream is active",
                                Some("STREAM_BUSY"),
                            ),
                        )
                        .await?;
                        continue;
                    }
                    let admitted = match peer.admit_upload(frame.message_id, request.clone()) {
                        Ok(upload) => upload,
                        Err(PeerUploadError::Rejected(response)) => {
                            send_response(transport, noise, frame.message_id, &response.0).await?;
                            continue;
                        }
                        Err(PeerUploadError::Session(SessionError::Busy)) => {
                            send_response(
                                transport,
                                noise,
                                frame.message_id,
                                &RpcResponse::error("Host is busy", Some("STREAM_BUSY")),
                            )
                            .await?;
                            continue;
                        }
                        Err(PeerUploadError::Session(error)) => return Err(session_error(error)),
                    };
                    let publication = admitted.publication().map_err(session_error)?;
                    upload = Some(IncomingUpload {
                        context: context(frame.message_id, request, publication),
                        upload: admitted,
                    });
                    anti_replay.set_active_stream(frame.message_id);
                    continue;
                }
                // The stream-capable runtime also preserves ordinary JSON replies and owns
                // the media/derivative split handlers. No list of duplicated Core commands.
                let admitted = match peer.admit_download(frame.message_id, request.clone()) {
                    Ok(admitted) => admitted,
                    Err(SessionError::Busy) => {
                        send_response(
                            transport,
                            noise,
                            frame.message_id,
                            &RpcResponse::error("Host is busy", Some("BUSY")),
                        )
                        .await?;
                        continue;
                    }
                    Err(error) => return Err(session_error(error)),
                };
                let publication = admitted.publication().map_err(session_error)?;
                let execution = {
                    let session = peer
                        .session
                        .upgrade()
                        .ok_or_else(RemoteIoFailure::transport_closed)?;
                    session.execute_admitted_download(admitted)
                };
                let id = frame.message_id;
                contexts.insert(id, context(id, request, publication));
                jobs.spawn(async move {
                    Completion {
                        id,
                        reply: execution.await,
                    }
                });
            }
            Event::SendChunk => {
                let id = *order.front().ok_or_else(|| {
                    RemoteIoFailure::data_plane_error("Missing outgoing stream order")
                })?;
                let context = contexts.get(&id).ok_or_else(|| {
                    RemoteIoFailure::data_plane_error("Missing outgoing publication")
                })?;
                let mut published = context.publication.transport(transport);
                send_next_host_outgoing_stream_chunk(
                    &mut published,
                    noise,
                    policy,
                    &mut streams,
                    &mut order,
                )
                .await?;
                drop(published);
                if !streams.contains_key(&id) {
                    // Also revoke a timed-out supervised reader still exiting on its worker.
                    peer.cancel(id).map_err(session_error)?;
                    remember(&mut recent, context);
                    contexts.remove(&id);
                }
            }
        }
    }
}

#[cfg(test)]
#[path = "peer_host_tests.rs"]
mod tests;
