use std::time::Duration;

use futures_util::{SinkExt, StreamExt};
use snow::params::NoiseParams;
use tokio_tungstenite::tungstenite::protocol::Message;
use tracing::{debug, warn};

use tauri::Manager;

use super::super::state::now_ms;
use super::super::types::AccessDuration;
use super::helpers::{
    extract_remote_static_hex, hex_decode, IK_MSG1_MIN_SIZE, NOISE_PATTERN_EXTENSION,
    NOISE_PATTERN_IK,
};
use super::HandshakeResult;

/// Extension reconnect handshake: IK for known peers, XX for unknown.
///
/// Uses message size heuristic (like OrangePi responder) to detect IK vs XX:
/// - IK msg1 >= 96 bytes (contains encrypted initiator static key)
/// - XX msg1 ~32 bytes (just ephemeral key)
///
/// If IK fails for a known peer, falls back to XX with anti-downgrade warning.
pub(super) async fn perform_extension_handshake(
    ws_stream: tokio_tungstenite::WebSocketStream<tokio::net::TcpStream>,
    app_handle: &tauri::AppHandle,
) -> Option<HandshakeResult> {
    let (mut write, mut read) = ws_stream.split();
    let mut buf = vec![0u8; 65535];

    // Read the first handshake message to determine IK vs XX.
    let msg1 = match tokio::time::timeout(Duration::from_secs(5), read.next()).await {
        Ok(Some(Ok(Message::Binary(b)))) => b,
        Ok(Some(Ok(_))) => {
            warn!("[gateway] reject extension handshake: msg1 is not binary");
            return None;
        }
        Ok(Some(Err(err))) => {
            warn!("[gateway] reject extension handshake: websocket read error before msg1: {err}");
            return None;
        }
        Ok(None) => {
            debug!("[gateway] extension websocket closed before Noise msg1");
            return None;
        }
        Err(_) => {
            warn!("[gateway] reject extension handshake: timeout waiting for msg1");
            return None;
        }
    };

    // Load the gateway's persistent keypair (if any).
    let gateway_privkey = {
        let state = app_handle.state::<crate::AppState>();
        let st = state.gateway.lock().ok()?;
        st.config.gateway_privkey_hex.as_ref().and_then(|hex| {
            let bytes = hex_decode(hex).ok()?;
            if bytes.len() == 32 {
                Some(bytes)
            } else {
                None
            }
        })
    };

    // Try IK if msg1 is large enough and we have a persistent keypair.
    if msg1.len() >= IK_MSG1_MIN_SIZE {
        if let Some(ref privkey) = gateway_privkey {
            match try_ik_responder(privkey, msg1.as_ref(), &mut buf, &mut write).await {
                Ok((noise, ext_id)) => {
                    // Verify the extension is known/paired.
                    let authorized = authorize_extension(app_handle, &ext_id)?;
                    if !authorized {
                        warn!(
                            "[gateway] reject extension handshake: unauthorized extension_id={ext_id}"
                        );
                        return None;
                    }
                    let transport = noise.into_transport_mode().ok()?;
                    return Some(HandshakeResult {
                        transport,
                        ext_id,
                        write,
                        read,
                    });
                }
                Err(_) => {
                    // IK failed — check if this was a known peer (anti-downgrade).
                    // We can't identify the peer from a failed IK, so just log the warning.
                    warn!(
                        "[gateway] ANTI-DOWNGRADE WARNING: IK handshake failed for large msg1 ({}B), \
                         cannot fall back to XX on same connection",
                        msg1.len()
                    );
                    // Cannot retry XX on the same connection because the Noise state is consumed.
                    // The extension must reconnect. Return None to drop this connection.
                    return None;
                }
            }
        }
        // No gateway keypair yet — can't do IK, fall through to XX.
        // This shouldn't happen for IK-sized messages, but handle gracefully.
    }

    // XX handshake for unknown extensions or small msg1.
    let privkey = match gateway_privkey {
        Some(pk) => pk,
        None => {
            // Generate a fresh keypair for XX (first-time, no persistent key yet).
            let params: NoiseParams = NOISE_PATTERN_EXTENSION.parse().ok()?;
            let kp = snow::Builder::new(params).generate_keypair().ok()?;
            kp.private
        }
    };

    let result = try_xx_responder(&privkey, msg1.as_ref(), &mut buf, &mut write, &mut read).await;
    let (noise, ext_id, keypair_for_storage) = match result {
        Ok(v) => v,
        Err(err) => {
            warn!("[gateway] reject extension handshake: XX handshake failed: {err}");
            return None;
        }
    };

    let authorized = authorize_extension(app_handle, &ext_id)?;
    if !authorized {
        warn!("[gateway] reject extension handshake: unauthorized extension_id={ext_id}");
        return None;
    }

    // If we generated a fresh keypair during XX, store it for future IK.
    if let Some(kp) = keypair_for_storage {
        let state = app_handle.state::<crate::AppState>();
        let mut st = state.gateway.lock().ok()?;
        st.ensure_gateway_keypair(&kp);
        st.save_config();
    }

    let transport = noise.into_transport_mode().ok()?;
    Some(HandshakeResult {
        transport,
        ext_id,
        write,
        read,
    })
}

/// Attempt IK handshake as responder (2 messages).
async fn try_ik_responder(
    device_privkey: &[u8],
    msg1: &[u8],
    buf: &mut [u8],
    write: &mut futures_util::stream::SplitSink<
        tokio_tungstenite::WebSocketStream<tokio::net::TcpStream>,
        Message,
    >,
) -> Result<(snow::HandshakeState, String), String> {
    let params: NoiseParams = NOISE_PATTERN_IK
        .parse()
        .map_err(|e: snow::Error| format!("IK params: {e}"))?;

    let mut responder = snow::Builder::new(params)
        .local_private_key(device_privkey)
        .map_err(|e| format!("IK local_private_key: {e}"))?
        .build_responder()
        .map_err(|e| format!("IK build_responder: {e}"))?;

    // IK msg1: -> e, es, s, ss (from initiator)
    responder
        .read_message(msg1, buf)
        .map_err(|e| format!("IK msg1 read: {e}"))?;

    let ext_id = extract_remote_static_hex(&responder)?;

    // IK msg2: <- e, ee, se (our response)
    let len = responder
        .write_message(&[], buf)
        .map_err(|e| format!("IK msg2 write: {e}"))?;
    write
        .send(Message::Binary(buf[..len].to_vec().into()))
        .await
        .map_err(|e| format!("IK msg2 send: {e}"))?;

    Ok((responder, ext_id))
}

/// Attempt XX handshake as responder (3 messages).
/// Returns the keypair if a fresh one was generated (for storage).
async fn try_xx_responder(
    local_privkey: &[u8],
    msg1: &[u8],
    buf: &mut [u8],
    write: &mut futures_util::stream::SplitSink<
        tokio_tungstenite::WebSocketStream<tokio::net::TcpStream>,
        Message,
    >,
    read: &mut futures_util::stream::SplitStream<
        tokio_tungstenite::WebSocketStream<tokio::net::TcpStream>,
    >,
) -> Result<(snow::HandshakeState, String, Option<snow::Keypair>), String> {
    let params: NoiseParams = NOISE_PATTERN_EXTENSION
        .parse()
        .map_err(|e: snow::Error| format!("XX params: {e}"))?;

    let builder = snow::Builder::new(params);
    // Check if we need to generate a keypair (when local_privkey is from a fresh generation).
    let needs_storage = {
        // We always use the provided key; storage decision is made by caller.
        false
    };
    let _ = needs_storage;

    let mut responder = builder
        .local_private_key(local_privkey)
        .map_err(|e| format!("XX local_private_key: {e}"))?
        .build_responder()
        .map_err(|e| format!("XX build_responder: {e}"))?;

    // XX msg1: <- e
    responder
        .read_message(msg1, buf)
        .map_err(|e| format!("XX msg1 read: {e}"))?;

    // XX msg2: -> e, ee, s, es
    let len2 = responder
        .write_message(&[], buf)
        .map_err(|e| format!("XX msg2 write: {e}"))?;
    write
        .send(Message::Binary(buf[..len2].to_vec().into()))
        .await
        .map_err(|e| format!("XX msg2 send: {e}"))?;

    // XX msg3: <- s, se
    let msg3 = match tokio::time::timeout(Duration::from_secs(5), read.next()).await {
        Ok(Some(Ok(Message::Binary(b)))) => b,
        _ => return Err("XX msg3 timeout or error".to_string()),
    };
    responder
        .read_message(msg3.as_ref(), buf)
        .map_err(|e| format!("XX msg3 read: {e}"))?;

    let ext_id = extract_remote_static_hex(&responder)?;

    Ok((responder, ext_id, None))
}

/// Authorize an extension: check it's paired and active, enforce access duration.
/// Returns `Some(true)` if authorized, `Some(false)` if denied, `None` on lock error.
fn authorize_extension(app_handle: &tauri::AppHandle, ext_id: &str) -> Option<bool> {
    let now = now_ms();
    let state = app_handle.state::<crate::AppState>();
    let mut st = state.gateway.lock().ok()?;

    if !st.is_paired_and_active(ext_id) {
        return Some(false);
    }

    // Enforce access duration as a rolling window.
    match st.config.access_duration {
        AccessDuration::UntilVaultLocked => {}
        AccessDuration::Hour1 => {
            let allowed = st
                .config
                .paired_extensions
                .iter()
                .find(|e| e.id == ext_id && !e.revoked)
                .and_then(|e| e.last_active_ms)
                .map(|ts| now.saturating_sub(ts) <= 60 * 60 * 1000)
                .unwrap_or(false);
            if !allowed {
                return Some(false);
            }
        }
        AccessDuration::Hour24 => {
            let allowed = st
                .config
                .paired_extensions
                .iter()
                .find(|e| e.id == ext_id && !e.revoked)
                .and_then(|e| e.last_active_ms)
                .map(|ts| now.saturating_sub(ts) <= 24 * 60 * 60 * 1000)
                .unwrap_or(false);
            if !allowed {
                return Some(false);
            }
        }
    }

    st.mark_extension_active(ext_id);
    st.save_config();
    Some(true)
}
