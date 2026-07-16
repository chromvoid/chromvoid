use std::time::Duration;

use futures_util::{SinkExt, StreamExt};
use snow::params::NoiseParams;
use tokio_tungstenite::tungstenite::protocol::Message;
use tracing::{info, warn};

use tauri::Manager;

use super::super::state::{
    now_ms, GatewayState, PairingSession, GATEWAY_PAIRING_LOCKOUT_MS, GATEWAY_PAIRING_MAX_ATTEMPTS,
};
use super::super::types::GatewayActorKind;
use super::helpers::{
    extract_remote_static_hex, hex_decode, pin_to_psk, GatewayWsRoute, NOISE_PATTERN_PAIR,
};
use super::HandshakeResult;

#[derive(Clone, Copy, PartialEq, Eq)]
struct PairingCeremonyIdentity {
    nonce: [u8; 32],
    actor_kind: GatewayActorKind,
}

impl From<&PairingSession> for PairingCeremonyIdentity {
    fn from(session: &PairingSession) -> Self {
        Self {
            nonce: session.ceremony_nonce,
            actor_kind: session.actor_kind,
        }
    }
}

#[derive(Debug, Clone, Copy, PartialEq, Eq)]
enum PairingCommitRejection {
    Missing,
    Replaced,
    ActorKindChanged,
    Expired,
    Locked,
}

impl PairingCommitRejection {
    fn reason(self) -> &'static str {
        match self {
            Self::Missing => "pairing ceremony was cancelled or already consumed",
            Self::Replaced => "pairing ceremony was replaced",
            Self::ActorKindChanged => "pairing ceremony actor kind changed",
            Self::Expired => "pairing ceremony expired",
            Self::Locked => "pairing ceremony is locked",
        }
    }
}

/// Pairing handshake: XXpsk0 + PIN.
pub(super) async fn perform_pair_handshake(
    ws_stream: tokio_tungstenite::WebSocketStream<tokio::net::TcpStream>,
    app_handle: &tauri::AppHandle,
) -> Option<HandshakeResult> {
    let (psk, ceremony, existing_gateway_private) = {
        let now = now_ms();
        let state = app_handle.state::<crate::AppState>();
        let mut st = match state.gateway.lock() {
            Ok(st) => st,
            Err(_) => {
                warn!("[gateway][pair] reject: gateway mutex poisoned");
                return None;
            }
        };

        let s = match st.pairing.as_mut() {
            Some(s) => s,
            None => {
                warn!("[gateway][pair] reject: no active pairing session");
                return None;
            }
        };
        if now > s.token_expires_at_ms || now > s.pin_expires_at_ms {
            warn!(
                "[gateway][pair] reject: pairing expired (now={}, pin_expires_at_ms={}, token_expires_at_ms={})",
                now,
                s.pin_expires_at_ms,
                s.token_expires_at_ms,
            );
            st.cancel_pairing();
            return None;
        }
        if let Some(until) = s.locked_until_ms {
            if now < until {
                warn!(
                    "[gateway][pair] reject: lockout active (now={}, locked_until_ms={}, attempts_left={})",
                    now,
                    until,
                    s.attempts_left,
                );
                return None;
            }
            reset_pairing_lockout_after_expiry(s);
        }
        info!("[gateway][pair] session accepted, starting Noise handshake");
        let psk = pin_to_psk(&s.pin);
        let ceremony = PairingCeremonyIdentity::from(&*s);
        let existing_gateway_private = match st.config.gateway_privkey_hex.as_deref() {
            Some(encoded) => match decode_gateway_private_key(encoded) {
                Ok(private) => Some(private),
                Err(error) => {
                    warn!("[gateway][pair] reject: invalid keychain-backed gateway key: {error}");
                    return None;
                }
            },
            None => None,
        };
        (psk, ceremony, existing_gateway_private)
    };

    let params: NoiseParams = NOISE_PATTERN_PAIR.parse().ok()?;
    let builder = snow::Builder::new(params);
    let gateway_private = match existing_gateway_private {
        Some(private) => private,
        None => {
            let keypair = builder.generate_keypair().ok()?;
            let state = app_handle.state::<crate::AppState>();
            let mut gateway = match state.gateway.lock() {
                Ok(gateway) => gateway,
                Err(_) => {
                    warn!("[gateway][pair] reject: gateway mutex poisoned while creating key");
                    return None;
                }
            };
            if let Some(encoded) = gateway.config.gateway_privkey_hex.as_deref() {
                match decode_gateway_private_key(encoded) {
                    Ok(private) => private,
                    Err(error) => {
                        warn!(
                            "[gateway][pair] reject: concurrently stored gateway key is invalid: {error}"
                        );
                        return None;
                    }
                }
            } else {
                if let Err(error) = gateway.persist_gateway_keypair(&keypair) {
                    warn!("[gateway][pair] reject: failed to persist gateway key in keychain: {error}");
                    return None;
                }
                keypair.private
            }
        }
    };
    let builder = builder
        .local_private_key(&gateway_private)
        .ok()?
        .psk(0, &psk)
        .ok()?;
    let mut noise = builder.build_responder().ok()?;

    let (mut write, mut read) = ws_stream.split();
    let mut buf = vec![0u8; 65535];

    // XX msg1: <- e
    let msg1 = match tokio::time::timeout(Duration::from_secs(5), read.next()).await {
        Ok(Some(Ok(Message::Binary(b)))) => b,
        Ok(Some(Ok(_))) => {
            warn!("[gateway][pair] reject: msg1 is not binary");
            return None;
        }
        Ok(Some(Err(err))) => {
            warn!("[gateway][pair] reject: msg1 websocket read error: {err}");
            return None;
        }
        Ok(None) => {
            warn!("[gateway][pair] reject: connection closed before msg1");
            return None;
        }
        Err(_) => {
            warn!("[gateway][pair] reject: timeout waiting for msg1");
            return None;
        }
    };
    if noise.read_message(msg1.as_ref(), &mut buf).is_err() {
        record_pairing_attempt(app_handle, ceremony);
        warn!("[gateway][pair] reject: invalid Noise msg1 (wrong PIN or malformed handshake)");
        return None;
    }
    // XX msg2: -> e, ee, s, es
    let len2 = noise.write_message(&[], &mut buf).ok()?;
    if write
        .send(Message::Binary(buf[..len2].to_vec().into()))
        .await
        .is_err()
    {
        warn!("[gateway][pair] reject: failed to send Noise msg2");
        return None;
    }
    // XX msg3: <- s, se
    let msg3 = match tokio::time::timeout(Duration::from_secs(5), read.next()).await {
        Ok(Some(Ok(Message::Binary(b)))) => b,
        Ok(Some(Ok(_))) => {
            warn!("[gateway][pair] reject: msg3 is not binary");
            return None;
        }
        Ok(Some(Err(err))) => {
            warn!("[gateway][pair] reject: msg3 websocket read error: {err}");
            return None;
        }
        Ok(None) => {
            warn!("[gateway][pair] reject: connection closed before msg3");
            return None;
        }
        Err(_) => {
            warn!("[gateway][pair] reject: timeout waiting for msg3");
            return None;
        }
    };
    if noise.read_message(msg3.as_ref(), &mut buf).is_err() {
        record_pairing_attempt(app_handle, ceremony);
        warn!("[gateway][pair] reject: invalid Noise msg3 (wrong PIN or malformed handshake)");
        return None;
    }

    let actor_id = match extract_remote_static_hex(&noise) {
        Ok(actor_id) => actor_id,
        Err(err) => {
            warn!("[gateway][pair] reject: failed to extract remote static key: {err}");
            return None;
        }
    };

    // Store the newly paired extension.
    let (catalog_blocking_io_runtime, save_snapshot) = {
        let state = app_handle.state::<crate::AppState>();
        let catalog_blocking_io_runtime = state.catalog_blocking_io_runtime.clone();
        let mut st = match state.gateway.lock() {
            Ok(st) => st,
            Err(_) => {
                warn!("[gateway][pair] reject: gateway mutex poisoned while storing pairing");
                return None;
            }
        };
        if let Err(rejection) =
            commit_pairing_ceremony(&mut st, ceremony, actor_id.clone(), now_ms())
        {
            warn!("[gateway][pair] reject at commit: {}", rejection.reason());
            return None;
        }
        (catalog_blocking_io_runtime, st.config_save_snapshot())
    };
    crate::gateway::save_config_snapshot_best_effort(
        catalog_blocking_io_runtime,
        save_snapshot,
        "Gateway pair handshake save",
    )
    .await;

    info!(
        "[gateway][pair] pairing success: actor_kind={:?}, actor_id={actor_id}",
        ceremony.actor_kind
    );

    let transport = match noise.into_transport_mode() {
        Ok(transport) => transport,
        Err(err) => {
            warn!("[gateway][pair] reject: failed to switch Noise into transport mode: {err}");
            return None;
        }
    };
    Some(HandshakeResult {
        transport,
        actor_id,
        route: match ceremony.actor_kind {
            GatewayActorKind::BrowserExtension => GatewayWsRoute::Extension,
            GatewayActorKind::CliAgent => GatewayWsRoute::Agent,
        },
        write,
        read,
    })
}

fn decode_gateway_private_key(encoded: &str) -> Result<Vec<u8>, String> {
    let private = hex_decode(encoded)?;
    if private.len() != 32 {
        return Err(format!(
            "gateway private key has {} bytes instead of 32",
            private.len()
        ));
    }
    Ok(private)
}

fn commit_pairing_ceremony(
    state: &mut GatewayState,
    ceremony: PairingCeremonyIdentity,
    actor_id: String,
    now: u64,
) -> Result<(), PairingCommitRejection> {
    let validation = state
        .pairing
        .as_mut()
        .ok_or(PairingCommitRejection::Missing)
        .and_then(|session| validate_pairing_ceremony(session, ceremony, now));
    if validation == Err(PairingCommitRejection::Expired) {
        // `Expired` is only returned after the nonce and actor kind match, so
        // this cannot cancel a replacement ceremony.
        state.cancel_pairing();
    }
    validation?;

    // Consume before mutating the paired identity store. Holding the Gateway
    // mutex across validation + take + upsert makes a ceremony single-use even
    // when multiple Noise handshakes finish concurrently.
    state
        .pairing
        .take()
        .ok_or(PairingCommitRejection::Missing)?;
    match ceremony.actor_kind {
        GatewayActorKind::BrowserExtension => state.upsert_paired_extension(actor_id),
        GatewayActorKind::CliAgent => state.upsert_paired_agent(actor_id),
    }
    Ok(())
}

fn validate_pairing_ceremony(
    session: &mut PairingSession,
    ceremony: PairingCeremonyIdentity,
    now: u64,
) -> Result<(), PairingCommitRejection> {
    if session.ceremony_nonce != ceremony.nonce {
        return Err(PairingCommitRejection::Replaced);
    }
    if session.actor_kind != ceremony.actor_kind {
        return Err(PairingCommitRejection::ActorKindChanged);
    }
    if now > session.token_expires_at_ms || now > session.pin_expires_at_ms {
        return Err(PairingCommitRejection::Expired);
    }
    if let Some(until) = session.locked_until_ms {
        if now < until {
            return Err(PairingCommitRejection::Locked);
        }
        reset_pairing_lockout_after_expiry(session);
    }
    if session.attempts_left == 0 {
        return Err(PairingCommitRejection::Locked);
    }
    Ok(())
}

/// Record a failed pairing attempt (decrement attempts, apply lockout), but
/// only if the failure belongs to the exact ceremony that admitted it.
fn record_pairing_attempt(app_handle: &tauri::AppHandle, ceremony: PairingCeremonyIdentity) {
    let state = app_handle.state::<crate::AppState>();
    let mut st = match state.gateway.lock() {
        Ok(g) => g,
        Err(_) => {
            warn!("[gateway][pair] failed to record pairing attempt: gateway mutex poisoned");
            return;
        }
    };
    if !record_failed_pairing_attempt_for_ceremony(&mut st, ceremony, now_ms()) {
        info!("[gateway][pair] ignored failed attempt from stale pairing ceremony");
    }
}

fn record_failed_pairing_attempt_for_ceremony(
    state: &mut GatewayState,
    ceremony: PairingCeremonyIdentity,
    now: u64,
) -> bool {
    let Some(session) = state.pairing.as_mut() else {
        return false;
    };
    if session.ceremony_nonce != ceremony.nonce || session.actor_kind != ceremony.actor_kind {
        return false;
    }
    record_failed_pairing_attempt_for_session(session, now);
    true
}

fn reset_pairing_lockout_after_expiry(session: &mut PairingSession) {
    session.locked_until_ms = None;
    session.attempts_left = GATEWAY_PAIRING_MAX_ATTEMPTS;
}

fn record_failed_pairing_attempt_for_session(session: &mut PairingSession, now: u64) {
    if let Some(until) = session.locked_until_ms {
        if now < until {
            return;
        }
        reset_pairing_lockout_after_expiry(session);
    } else if session.attempts_left == 0 {
        session.attempts_left = GATEWAY_PAIRING_MAX_ATTEMPTS;
    }

    session.attempts_left = session.attempts_left.saturating_sub(1);
    if session.attempts_left == 0 {
        session.locked_until_ms = Some(
            now.checked_add(GATEWAY_PAIRING_LOCKOUT_MS)
                .unwrap_or(u64::MAX),
        );
    }
}

#[cfg(test)]
mod tests {
    use super::*;
    use std::sync::{Arc, Barrier, Mutex};
    use tempfile::NamedTempFile;

    fn pairing_session(attempts_left: u8, locked_until_ms: Option<u64>) -> PairingSession {
        PairingSession {
            ceremony_nonce: [0x11; 32],
            actor_kind: GatewayActorKind::BrowserExtension,
            pairing_token: "token".to_string(),
            pin: "123456".to_string(),
            token_expires_at_ms: 10_000,
            pin_expires_at_ms: 10_000,
            attempts_left,
            locked_until_ms,
        }
    }

    fn state_with_pairing(actor_kind: GatewayActorKind) -> GatewayState {
        let config = NamedTempFile::new().expect("tempfile");
        let mut state = GatewayState::load_or_default(config.path().to_path_buf());
        state.start_pairing_for_actor(actor_kind, "pair-token".to_string(), "123456".to_string());
        state
    }

    fn current_ceremony(state: &GatewayState) -> PairingCeremonyIdentity {
        PairingCeremonyIdentity::from(state.pairing.as_ref().expect("pairing ceremony"))
    }

    #[test]
    fn stored_gateway_private_key_is_reused_only_when_valid() {
        let expected = vec![0xab; 32];
        assert_eq!(
            decode_gateway_private_key(&"ab".repeat(32)).expect("valid key"),
            expected
        );
        assert!(decode_gateway_private_key("ab").is_err());
        assert!(decode_gateway_private_key("not-hex").is_err());
    }

    #[test]
    fn failed_attempt_after_expired_lockout_resets_and_decrements() {
        let mut session = pairing_session(0, Some(1_000));

        record_failed_pairing_attempt_for_session(&mut session, 1_001);

        assert_eq!(session.locked_until_ms, None);
        assert_eq!(
            session.attempts_left,
            GATEWAY_PAIRING_MAX_ATTEMPTS.saturating_sub(1)
        );
    }

    #[test]
    fn repeated_failures_relock_after_expired_lockout() {
        let mut session = pairing_session(0, Some(1_000));

        for now in 1_001..=1_005 {
            record_failed_pairing_attempt_for_session(&mut session, now);
        }

        assert_eq!(session.attempts_left, 0);
        assert_eq!(
            session.locked_until_ms,
            Some(1_005 + GATEWAY_PAIRING_LOCKOUT_MS)
        );
    }

    #[test]
    fn active_lockout_does_not_decrement_attempts() {
        let mut session = pairing_session(0, Some(1_000));

        record_failed_pairing_attempt_for_session(&mut session, 999);

        assert_eq!(session.attempts_left, 0);
        assert_eq!(session.locked_until_ms, Some(1_000));
    }

    #[test]
    fn concurrent_commits_consume_ceremony_exactly_once() {
        let state = Arc::new(Mutex::new(state_with_pairing(
            GatewayActorKind::BrowserExtension,
        )));
        let ceremony = current_ceremony(&state.lock().expect("state"));
        let barrier = Arc::new(Barrier::new(2));

        let handles = (0..2)
            .map(|index| {
                let state = state.clone();
                let barrier = barrier.clone();
                std::thread::spawn(move || {
                    barrier.wait();
                    commit_pairing_ceremony(
                        &mut state.lock().expect("state"),
                        ceremony,
                        format!("extension-{index}"),
                        now_ms(),
                    )
                })
            })
            .collect::<Vec<_>>();
        let results = handles
            .into_iter()
            .map(|handle| handle.join().expect("commit thread"))
            .collect::<Vec<_>>();

        assert_eq!(results.iter().filter(|result| result.is_ok()).count(), 1);
        assert_eq!(
            results
                .iter()
                .filter(|result| **result == Err(PairingCommitRejection::Missing))
                .count(),
            1
        );
        let state = state.lock().expect("state");
        assert!(state.pairing.is_none());
        assert_eq!(state.config.paired_extensions.len(), 1);
    }

    #[test]
    fn replacement_rejects_old_commit_without_consuming_new_ceremony() {
        let mut state = state_with_pairing(GatewayActorKind::BrowserExtension);
        let old_ceremony = current_ceremony(&state);
        let replacement = state.start_pairing_for_actor(
            GatewayActorKind::BrowserExtension,
            "replacement-token".to_string(),
            "654321".to_string(),
        );

        assert_eq!(
            commit_pairing_ceremony(
                &mut state,
                old_ceremony,
                "stale-extension".to_string(),
                now_ms(),
            ),
            Err(PairingCommitRejection::Replaced)
        );
        assert_eq!(
            state.pairing.as_ref().expect("replacement").ceremony_nonce,
            replacement.ceremony_nonce
        );
        assert!(state.config.paired_extensions.is_empty());
    }

    #[test]
    fn cancelled_ceremony_cannot_commit() {
        let mut state = state_with_pairing(GatewayActorKind::BrowserExtension);
        let ceremony = current_ceremony(&state);
        state.cancel_pairing();

        assert_eq!(
            commit_pairing_ceremony(
                &mut state,
                ceremony,
                "cancelled-extension".to_string(),
                now_ms(),
            ),
            Err(PairingCommitRejection::Missing)
        );
        assert!(state.config.paired_extensions.is_empty());
    }

    #[test]
    fn successful_ceremony_cannot_be_replayed_for_another_identity() {
        let mut state = state_with_pairing(GatewayActorKind::CliAgent);
        let ceremony = current_ceremony(&state);

        commit_pairing_ceremony(&mut state, ceremony, "agent-first".to_string(), now_ms())
            .expect("first commit");
        assert_eq!(
            commit_pairing_ceremony(&mut state, ceremony, "agent-replay".to_string(), now_ms(),),
            Err(PairingCommitRejection::Missing)
        );
        assert_eq!(state.config.paired_agents.len(), 1);
        assert_eq!(state.config.paired_agents[0].id, "agent-first");
    }

    #[test]
    fn stale_failed_attempt_does_not_decrement_replacement_ceremony() {
        let mut state = state_with_pairing(GatewayActorKind::BrowserExtension);
        let old_ceremony = current_ceremony(&state);
        state.start_pairing_for_actor(
            GatewayActorKind::BrowserExtension,
            "replacement-token".to_string(),
            "654321".to_string(),
        );
        let replacement = current_ceremony(&state);

        assert!(!record_failed_pairing_attempt_for_ceremony(
            &mut state,
            old_ceremony,
            now_ms(),
        ));
        assert_eq!(
            state.pairing.as_ref().expect("replacement").attempts_left,
            GATEWAY_PAIRING_MAX_ATTEMPTS
        );
        assert!(record_failed_pairing_attempt_for_ceremony(
            &mut state,
            replacement,
            now_ms(),
        ));
        assert_eq!(
            state.pairing.as_ref().expect("replacement").attempts_left,
            GATEWAY_PAIRING_MAX_ATTEMPTS - 1
        );
    }

    #[test]
    fn commit_rechecks_expiry_lockout_and_actor_kind() {
        let mut expired = state_with_pairing(GatewayActorKind::BrowserExtension);
        let expired_ceremony = current_ceremony(&expired);
        let expired_session = expired.pairing.as_mut().expect("pairing");
        expired_session.token_expires_at_ms = 99;
        expired_session.pin_expires_at_ms = 99;
        assert_eq!(
            commit_pairing_ceremony(&mut expired, expired_ceremony, "expired".to_string(), 100,),
            Err(PairingCommitRejection::Expired)
        );
        assert!(expired.pairing.is_none());

        let mut locked = state_with_pairing(GatewayActorKind::BrowserExtension);
        let locked_ceremony = current_ceremony(&locked);
        locked.pairing.as_mut().expect("pairing").locked_until_ms = Some(200);
        assert_eq!(
            commit_pairing_ceremony(&mut locked, locked_ceremony, "locked".to_string(), 100,),
            Err(PairingCommitRejection::Locked)
        );
        assert!(locked.pairing.is_some());

        let mut changed_kind = state_with_pairing(GatewayActorKind::BrowserExtension);
        let changed_kind_ceremony = current_ceremony(&changed_kind);
        changed_kind.pairing.as_mut().expect("pairing").actor_kind = GatewayActorKind::CliAgent;
        assert_eq!(
            commit_pairing_ceremony(
                &mut changed_kind,
                changed_kind_ceremony,
                "wrong-route".to_string(),
                now_ms(),
            ),
            Err(PairingCommitRejection::ActorKindChanged)
        );
        assert!(changed_kind.pairing.is_some());
        assert!(changed_kind.config.paired_extensions.is_empty());
        assert!(changed_kind.config.paired_agents.is_empty());
    }
}
