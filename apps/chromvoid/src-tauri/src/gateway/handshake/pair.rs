use std::time::Duration;

use futures_util::{SinkExt, StreamExt};
use snow::params::NoiseParams;
use tokio_tungstenite::tungstenite::protocol::Message;
use tracing::{info, warn};

use tauri::Manager;

use super::super::state::{
    now_ms, PairingSession, GATEWAY_PAIRING_LOCKOUT_MS, GATEWAY_PAIRING_MAX_ATTEMPTS,
};
use super::helpers::{extract_remote_static_hex, pin_to_psk, NOISE_PATTERN_PAIR};
use super::HandshakeResult;

/// Pairing handshake: XXpsk0 + PIN.
pub(super) async fn perform_pair_handshake(
    ws_stream: tokio_tungstenite::WebSocketStream<tokio::net::TcpStream>,
    app_handle: &tauri::AppHandle,
) -> Option<HandshakeResult> {
    let psk = {
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
        pin_to_psk(&s.pin)
    };

    let params: NoiseParams = NOISE_PATTERN_PAIR.parse().ok()?;
    let builder = snow::Builder::new(params);
    let keypair = builder.generate_keypair().ok()?;
    let builder = builder
        .local_private_key(&keypair.private)
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
        record_pairing_attempt(app_handle);
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
        record_pairing_attempt(app_handle);
        warn!("[gateway][pair] reject: invalid Noise msg3 (wrong PIN or malformed handshake)");
        return None;
    }

    let ext_id = match extract_remote_static_hex(&noise) {
        Ok(ext_id) => ext_id,
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
        st.upsert_paired_extension(ext_id.clone());
        // Store the gateway keypair so future IK reconnects work.
        st.ensure_gateway_keypair(&keypair);
        (catalog_blocking_io_runtime, st.config_save_snapshot())
    };
    crate::gateway::save_config_snapshot_best_effort(
        catalog_blocking_io_runtime,
        save_snapshot,
        "Gateway pair handshake save",
    )
    .await;

    info!("[gateway][pair] pairing success: extension_id={ext_id}");

    let transport = match noise.into_transport_mode() {
        Ok(transport) => transport,
        Err(err) => {
            warn!("[gateway][pair] reject: failed to switch Noise into transport mode: {err}");
            return None;
        }
    };
    Some(HandshakeResult {
        transport,
        ext_id,
        write,
        read,
    })
}

/// Record a failed pairing attempt (decrement attempts, apply lockout).
fn record_pairing_attempt(app_handle: &tauri::AppHandle) {
    let state = app_handle.state::<crate::AppState>();
    let mut st = match state.gateway.lock() {
        Ok(g) => g,
        Err(_) => {
            warn!("[gateway][pair] failed to record pairing attempt: gateway mutex poisoned");
            return;
        }
    };
    if let Some(s) = st.pairing.as_mut() {
        record_failed_pairing_attempt_for_session(s, now_ms());
    }
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

    fn pairing_session(attempts_left: u8, locked_until_ms: Option<u64>) -> PairingSession {
        PairingSession {
            pairing_token: "token".to_string(),
            pin: "123456".to_string(),
            token_expires_at_ms: 10_000,
            pin_expires_at_ms: 10_000,
            attempts_left,
            locked_until_ms,
        }
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
}
