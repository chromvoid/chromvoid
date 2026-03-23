use std::time::Duration;

use futures_util::{SinkExt, StreamExt};
use snow::params::NoiseParams;
use tokio_tungstenite::tungstenite::protocol::Message;
use tracing::{info, warn};

use tauri::Manager;

use super::super::state::now_ms;
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
        let mut st = state.gateway.lock().ok()?;

        let s = match st.pairing.as_ref() {
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
    {
        let state = app_handle.state::<crate::AppState>();
        let mut st = state.gateway.lock().ok()?;
        st.upsert_paired_extension(ext_id.clone());
        // Store the gateway keypair so future IK reconnects work.
        st.ensure_gateway_keypair(&keypair);
        st.save_config();
    }

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
        Err(_) => return,
    };
    if let Some(s) = st.pairing.as_mut() {
        if s.attempts_left > 0 {
            s.attempts_left -= 1;
            if s.attempts_left == 0 {
                s.locked_until_ms = Some(now_ms().saturating_add(60_000));
            }
        }
    }
}
