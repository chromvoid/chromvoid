mod capability;
mod extension;
mod helpers;
mod pair;

#[cfg(test)]
mod tests;

pub(super) use capability::check_capability;
pub(super) use helpers::{
    is_allowed_path, pin_to_psk, reject_ws_request, GatewayWsRoute, NOISE_PATTERN_EXTENSION,
    NOISE_PATTERN_IK, NOISE_PATTERN_PAIR,
};

use tauri::Manager;
use tokio_tungstenite::tungstenite::http::StatusCode;
use tokio_tungstenite::tungstenite::protocol::Message;
use tracing::{info, warn};

/// Outcome of a successful WebSocket + Noise handshake.
pub(super) struct HandshakeResult {
    pub transport: snow::TransportState,
    pub ext_id: String,
    pub write: futures_util::stream::SplitSink<
        tokio_tungstenite::WebSocketStream<tokio::net::TcpStream>,
        Message,
    >,
    pub read: futures_util::stream::SplitStream<
        tokio_tungstenite::WebSocketStream<tokio::net::TcpStream>,
    >,
}

/// Run the full WebSocket accept + Noise handshake + authorization.
/// Returns `None` if any step fails (connection is dropped).
pub(super) async fn perform_handshake(
    stream: tokio::net::TcpStream,
    app_handle: &tauri::AppHandle,
) -> Option<HandshakeResult> {
    // Gate on config.enabled.
    {
        let state = app_handle.state::<crate::AppState>();
        let st = state.gateway.lock().ok()?;
        if !st.config.enabled {
            info!("[gateway] reject websocket handshake: gateway disabled");
            return None;
        }
    }

    let mut path: Option<String> = None;
    let ws_stream = match tokio_tungstenite::accept_hdr_async(
        stream,
        |req: &tokio_tungstenite::tungstenite::handshake::server::Request,
         resp: tokio_tungstenite::tungstenite::handshake::server::Response| {
            path = Some(req.uri().path().to_string());
            let p = path.as_deref().unwrap_or("");
            if !is_allowed_path(p) {
                return Err(reject_ws_request(StatusCode::NOT_FOUND));
            }
            Ok(resp)
        },
    )
    .await
    {
        Ok(ws_stream) => ws_stream,
        Err(err) => {
            warn!("[gateway] websocket accept failed: {err}");
            return None;
        }
    };

    let path = match path {
        Some(path) => path,
        None => {
            warn!("[gateway] websocket accepted but request path is missing");
            return None;
        }
    };
    let route = match path.as_str() {
        "/pair" => GatewayWsRoute::Pair,
        "/extension" | "/ws" => GatewayWsRoute::Extension,
        _ => {
            warn!("[gateway] unexpected websocket path after accept: {path}");
            return None;
        }
    };

    match route {
        GatewayWsRoute::Pair => pair::perform_pair_handshake(ws_stream, app_handle).await,
        GatewayWsRoute::Extension => {
            extension::perform_extension_handshake(ws_stream, app_handle).await
        }
    }
}
