use std::collections::HashMap;
use std::path::{Path, PathBuf};
use std::time::{Instant, SystemTime, UNIX_EPOCH};

use chromvoid_protocol::{
    RemoteTransport, TransportMetricEventKind, TransportMetrics, TransportType,
};
use serde::{Deserialize, Serialize};
use tracing::{info, warn};
use webrtc::ice_transport::ice_server::RTCIceServer;

use super::quic_masque_transport::{is_udp_unavailable_error, QuicMasqueTransport};
use super::signaling::SignalingClient;
use super::tcp_stealth_transport::TcpStealthTransport;
use super::webrtc_transport::WebRtcTransport;
use super::wss_transport::WssTransport;

const QUIC_FAST_PATH_TIMEOUT: std::time::Duration = std::time::Duration::from_secs(2);
const WEBRTC_CONNECT_TIMEOUT: std::time::Duration = std::time::Duration::from_secs(10);

pub fn default_ice_servers() -> Vec<RTCIceServer> {
    vec![RTCIceServer {
        urls: vec!["stun:stun.l.google.com:19302".to_string()],
        ..Default::default()
    }]
}

#[derive(Debug, Clone, Default, Serialize, Deserialize, PartialEq, Eq)]
pub struct NetworkContext {
    pub ssid: Option<String>,
    pub cellular_carrier: Option<String>,
}

impl NetworkContext {
    pub fn key(&self) -> String {
        let ssid = self
            .ssid
            .as_deref()
            .map(str::trim)
            .filter(|v| !v.is_empty())
            .unwrap_or("none");
        let carrier = self
            .cellular_carrier
            .as_deref()
            .map(str::trim)
            .filter(|v| !v.is_empty())
            .unwrap_or("none");
        format!("ssid={ssid}|carrier={carrier}")
    }
}

#[derive(Debug, Clone)]
pub struct FallbackConnectOptions {
    pub network_context: NetworkContext,
    pub cache_path: Option<PathBuf>,
    pub udp_available: Option<bool>,
}

impl Default for FallbackConnectOptions {
    fn default() -> Self {
        Self {
            network_context: NetworkContext::default(),
            cache_path: None,
            udp_available: None,
        }
    }
}

#[derive(Debug, Clone, Serialize, Deserialize, PartialEq, Eq)]
struct LastKnownGoodEntry {
    transport_type: TransportType,
    updated_at: u64,
}

pub struct LastKnownGoodTransportCache {
    path: PathBuf,
    entries: HashMap<String, LastKnownGoodEntry>,
}

impl LastKnownGoodTransportCache {
    pub fn load(path: &Path) -> Self {
        let entries = if path.exists() {
            match std::fs::read_to_string(path) {
                Ok(content) => {
                    serde_json::from_str::<HashMap<String, LastKnownGoodEntry>>(&content)
                        .unwrap_or_default()
                }
                Err(_) => HashMap::new(),
            }
        } else {
            HashMap::new()
        };

        Self {
            path: path.to_path_buf(),
            entries,
        }
    }

    pub fn save(&self) -> Result<(), String> {
        let payload =
            serde_json::to_string_pretty(&self.entries).map_err(|e| format!("serialize: {e}"))?;
        std::fs::write(&self.path, payload).map_err(|e| format!("write: {e}"))
    }

    pub fn get(&self, network_context: &NetworkContext) -> Option<TransportType> {
        self.entries
            .get(&network_context.key())
            .map(|entry| entry.transport_type)
    }

    pub fn set(&mut self, network_context: &NetworkContext, transport_type: TransportType) {
        let updated_at = SystemTime::now()
            .duration_since(UNIX_EPOCH)
            .unwrap_or_default()
            .as_secs();
        self.entries.insert(
            network_context.key(),
            LastKnownGoodEntry {
                transport_type,
                updated_at,
            },
        );
    }
}

pub struct FallbackResult {
    pub transport: Box<dyn RemoteTransport>,
    pub metrics: TransportMetrics,
}

pub async fn connect_with_fallback(
    relay_url: &str,
    room_id: &str,
    is_initiator: bool,
    ice_servers: Vec<RTCIceServer>,
) -> Result<FallbackResult, String> {
    connect_with_fallback_with_options(
        relay_url,
        room_id,
        is_initiator,
        ice_servers,
        FallbackConnectOptions::default(),
    )
    .await
}

pub async fn connect_with_fallback_with_options(
    relay_url: &str,
    room_id: &str,
    is_initiator: bool,
    ice_servers: Vec<RTCIceServer>,
    options: FallbackConnectOptions,
) -> Result<FallbackResult, String> {
    let start = Instant::now();
    let mut metrics = TransportMetrics::new();
    let mut cache = options
        .cache_path
        .as_deref()
        .map(LastKnownGoodTransportCache::load);
    let chain = attempt_chain_for_context(&cache, &options.network_context);

    info!(
        "Ordered fallback chain for {}: {:?}",
        options.network_context.key(),
        chain
    );

    let mut quic_failure_at: Option<Instant> = None;

    for (idx, transport_type) in chain.iter().copied().enumerate() {
        metrics.attempt_count += 1;
        metrics.emit_event(
            TransportMetricEventKind::TransportAttempt,
            transport_type,
            None,
            None,
            start.elapsed().as_millis() as u64,
        );
        info!("transport_attempt {:?}", transport_type);

        let attempt_result = match transport_type {
            TransportType::WebRtcDataChannel => {
                metrics.webrtc_attempted = true;
                let signaling = SignalingClient::connect(relay_url, room_id).await;
                match signaling {
                    Ok(mut sig) => {
                        let result = if is_initiator {
                            tokio::time::timeout(
                                WEBRTC_CONNECT_TIMEOUT,
                                WebRtcTransport::connect_as_initiator(
                                    &mut sig,
                                    ice_servers.clone(),
                                ),
                            )
                            .await
                        } else {
                            tokio::time::timeout(
                                WEBRTC_CONNECT_TIMEOUT,
                                WebRtcTransport::connect_as_responder(
                                    &mut sig,
                                    ice_servers.clone(),
                                ),
                            )
                            .await
                        };
                        match result {
                            Ok(Ok(transport)) => {
                                Ok(Box::new(transport) as Box<dyn RemoteTransport>)
                            }
                            Ok(Err(err)) => Err(err),
                            Err(_) => Err("webrtc connect timeout".to_string()),
                        }
                    }
                    Err(err) => Err(format!("signaling: {}", err)),
                }
            }
            TransportType::WssRelay => {
                metrics.wss_attempted = true;
                WssTransport::connect(relay_url, room_id)
                    .await
                    .map(|transport| Box::new(transport) as Box<dyn RemoteTransport>)
            }
            TransportType::QuicMasque => {
                metrics.quic_attempted = true;

                if matches!(options.udp_available, Some(false)) {
                    metrics.quic_udp_blocked = true;
                    Err("udp_unavailable:probe indicates unavailable udp path".to_string())
                } else {
                    let result = tokio::time::timeout(QUIC_FAST_PATH_TIMEOUT, async {
                        QuicMasqueTransport::connect(relay_url, room_id).await
                    })
                    .await;
                    match result {
                        Ok(Ok(transport)) => Ok(Box::new(transport) as Box<dyn RemoteTransport>),
                        Ok(Err(err)) => Err(err),
                        Err(_) => Err("udp_unavailable:quic connect timeout".to_string()),
                    }
                }
            }
            TransportType::TcpStealth => {
                metrics.tcp_stealth_attempted = true;
                TcpStealthTransport::connect(relay_url, room_id)
                    .await
                    .map(|transport| Box::new(transport) as Box<dyn RemoteTransport>)
            }
        };

        match attempt_result {
            Ok(transport) => {
                metrics.transport_type = Some(transport_type);
                metrics.connection_time_ms = start.elapsed().as_millis() as u64;
                metrics.failure_reason = None;

                if transport_type == TransportType::TcpStealth {
                    if let Some(failed_at) = quic_failure_at {
                        metrics.record_fallback_transition(failed_at.elapsed().as_millis() as u64);
                    }
                }

                metrics.emit_event(
                    TransportMetricEventKind::TransportSuccess,
                    transport_type,
                    None,
                    None,
                    metrics.connection_time_ms,
                );

                info!(
                    "transport_success {:?} in {}ms",
                    transport_type, metrics.connection_time_ms
                );

                if let Some(cache_store) = cache.as_mut() {
                    cache_store.set(&options.network_context, transport_type);
                    if let Err(err) = cache_store.save() {
                        warn!("failed to persist last-known-good cache: {}", err);
                    }
                }

                return Ok(FallbackResult { transport, metrics });
            }
            Err(err) => {
                if transport_type == TransportType::QuicMasque && is_udp_unavailable_error(&err) {
                    metrics.quic_udp_blocked = true;
                    quic_failure_at = Some(Instant::now());
                }

                metrics.failure_reason = Some(format!("{:?}: {}", transport_type, err));
                metrics.emit_event(
                    TransportMetricEventKind::TransportFail,
                    transport_type,
                    chain.get(idx + 1).copied(),
                    Some(err.clone()),
                    start.elapsed().as_millis() as u64,
                );
                warn!("transport_fail {:?}: {}", transport_type, err);

                if let Some(next_transport) = chain.get(idx + 1).copied() {
                    metrics.emit_event(
                        TransportMetricEventKind::FallbackTriggered,
                        transport_type,
                        Some(next_transport),
                        Some(err),
                        start.elapsed().as_millis() as u64,
                    );
                    info!(
                        "fallback_triggered from {:?} to {:?}",
                        transport_type, next_transport
                    );
                }
            }
        }
    }

    Err(metrics
        .failure_reason
        .unwrap_or_else(|| "all fallback transports failed".to_string()))
}

pub(crate) fn attempt_chain_for_context(
    cache: &Option<LastKnownGoodTransportCache>,
    network_context: &NetworkContext,
) -> Vec<TransportType> {
    let mut chain = vec![
        TransportType::WebRtcDataChannel,
        TransportType::WssRelay,
        TransportType::QuicMasque,
        TransportType::TcpStealth,
    ];
    let cached = cache.as_ref().and_then(|store| store.get(network_context));

    if let Some(cached_transport) = cached {
        if let Some(position) = chain
            .iter()
            .position(|transport| *transport == cached_transport)
        {
            chain.remove(position);
            chain.insert(0, cached_transport);
        }
    }

    chain
}

#[cfg(test)]
#[path = "fallback_tests.rs"]
mod tests;
