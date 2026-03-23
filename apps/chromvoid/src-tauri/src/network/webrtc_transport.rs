//! WebRTC DataChannel transport implementing `RemoteTransport`.

use std::sync::Arc;

use async_trait::async_trait;
use chromvoid_protocol::signaling::{CONNECTION_TIMEOUT, ICE_GATHERING_TIMEOUT};
use chromvoid_protocol::{RemoteTransport, SignalingMessage, TransportError, TransportType};
use tokio::sync::mpsc;
use tracing::{debug, error, info};
use webrtc::api::interceptor_registry::register_default_interceptors;
use webrtc::api::media_engine::MediaEngine;
use webrtc::api::APIBuilder;
use webrtc::data_channel::data_channel_message::DataChannelMessage;
use webrtc::data_channel::RTCDataChannel;
use webrtc::ice_transport::ice_candidate::RTCIceCandidateInit;
use webrtc::ice_transport::ice_server::RTCIceServer;
use webrtc::interceptor::registry::Registry;
use webrtc::peer_connection::configuration::RTCConfiguration;
use webrtc::peer_connection::sdp::session_description::RTCSessionDescription;
use webrtc::peer_connection::RTCPeerConnection;

use super::signaling::SignalingClient;

const DATA_CHANNEL_LABEL: &str = "kp-rpc-v1";

/// WebRTC DataChannel transport.
pub struct WebRtcTransport {
    peer_connection: Arc<RTCPeerConnection>,
    data_channel: Arc<RTCDataChannel>,
    recv_rx: mpsc::Receiver<Vec<u8>>,
}

impl WebRtcTransport {
    /// Connect as the initiator (creates offer).
    pub async fn connect_as_initiator(
        signaling: &mut SignalingClient,
        ice_servers: Vec<RTCIceServer>,
    ) -> Result<Self, String> {
        let (pc, _) = create_peer_connection(ice_servers).await?;

        // Create DataChannel
        let dc = pc
            .create_data_channel(DATA_CHANNEL_LABEL, None)
            .await
            .map_err(|e| format!("create data channel: {}", e))?;

        let (recv_tx, recv_rx) = mpsc::channel::<Vec<u8>>(256);
        setup_data_channel_handlers(&dc, recv_tx);

        // ICE candidate trickle
        setup_ice_candidate_handler(&pc, signaling).await;

        // Create and send offer
        let offer = pc
            .create_offer(None)
            .await
            .map_err(|e| format!("create offer: {}", e))?;

        pc.set_local_description(offer.clone())
            .await
            .map_err(|e| format!("set local desc: {}", e))?;

        let offer_id = format!("offer-{}", rand::random::<u32>());
        signaling
            .send(SignalingMessage::Offer {
                sdp: offer.sdp,
                id: offer_id.clone(),
            })
            .await?;

        // Wait for answer
        let answer = tokio::time::timeout(CONNECTION_TIMEOUT, async {
            loop {
                match signaling.recv().await {
                    Some(SignalingMessage::Answer {
                        sdp,
                        in_response_to,
                    }) if in_response_to == offer_id => {
                        return Ok(sdp);
                    }
                    Some(SignalingMessage::Candidate {
                        candidate,
                        sdp_mid,
                        sdp_m_line_index,
                    }) => {
                        let init = RTCIceCandidateInit {
                            candidate,
                            sdp_mid,
                            sdp_mline_index: sdp_m_line_index,
                            ..Default::default()
                        };
                        if let Err(e) = pc.add_ice_candidate(init).await {
                            debug!("add ICE candidate: {}", e);
                        }
                    }
                    Some(SignalingMessage::Error { code, message }) => {
                        return Err(format!("signaling error {}: {}", code, message));
                    }
                    None => return Err("signaling closed".to_string()),
                    _ => {}
                }
            }
        })
        .await
        .map_err(|_| "answer timeout".to_string())??;

        let answer_desc =
            RTCSessionDescription::answer(answer).map_err(|e| format!("parse answer: {}", e))?;

        pc.set_remote_description(answer_desc)
            .await
            .map_err(|e| format!("set remote desc: {}", e))?;

        // Wait for DataChannel to open
        wait_data_channel_open(&dc).await?;

        info!("WebRTC DataChannel established as initiator");
        Ok(Self {
            peer_connection: pc,
            data_channel: dc,
            recv_rx,
        })
    }

    /// Connect as the responder (receives offer, creates answer).
    pub async fn connect_as_responder(
        signaling: &mut SignalingClient,
        ice_servers: Vec<RTCIceServer>,
    ) -> Result<Self, String> {
        let (pc, _api_config) = create_peer_connection(ice_servers).await?;

        let (recv_tx, recv_rx) = mpsc::channel::<Vec<u8>>(256);

        // Wait for the DataChannel created by the initiator
        let dc_rx = {
            let (dc_tx, dc_rx) = tokio::sync::oneshot::channel::<Arc<RTCDataChannel>>();
            let dc_tx = Arc::new(tokio::sync::Mutex::new(Some(dc_tx)));
            let recv_tx_clone = recv_tx.clone();

            pc.on_data_channel(Box::new(move |dc: Arc<RTCDataChannel>| {
                let dc_tx = dc_tx.clone();
                let recv_tx = recv_tx_clone.clone();
                Box::pin(async move {
                    setup_data_channel_handlers(&dc, recv_tx);
                    if let Some(tx) = dc_tx.lock().await.take() {
                        let _ = tx.send(dc);
                    }
                })
            }));
            dc_rx
        };

        // ICE candidate trickle
        setup_ice_candidate_handler(&pc, signaling).await;

        // Wait for offer
        let (offer_sdp, offer_id) = tokio::time::timeout(CONNECTION_TIMEOUT, async {
            loop {
                match signaling.recv().await {
                    Some(SignalingMessage::Offer { sdp, id }) => return Ok((sdp, id)),
                    Some(SignalingMessage::Candidate {
                        candidate,
                        sdp_mid,
                        sdp_m_line_index,
                    }) => {
                        let init = RTCIceCandidateInit {
                            candidate,
                            sdp_mid,
                            sdp_mline_index: sdp_m_line_index,
                            ..Default::default()
                        };
                        if let Err(e) = pc.add_ice_candidate(init).await {
                            debug!("add ICE candidate: {}", e);
                        }
                    }
                    Some(SignalingMessage::Error { code, message }) => {
                        return Err(format!("signaling error {}: {}", code, message));
                    }
                    None => return Err("signaling closed".to_string()),
                    _ => {}
                }
            }
        })
        .await
        .map_err(|_| "offer timeout".to_string())??;

        let offer_desc =
            RTCSessionDescription::offer(offer_sdp).map_err(|e| format!("parse offer: {}", e))?;

        pc.set_remote_description(offer_desc)
            .await
            .map_err(|e| format!("set remote desc: {}", e))?;

        // Create and send answer
        let answer = pc
            .create_answer(None)
            .await
            .map_err(|e| format!("create answer: {}", e))?;

        pc.set_local_description(answer.clone())
            .await
            .map_err(|e| format!("set local desc: {}", e))?;

        signaling
            .send(SignalingMessage::Answer {
                sdp: answer.sdp,
                in_response_to: offer_id,
            })
            .await?;

        // Wait for DataChannel
        let dc = tokio::time::timeout(CONNECTION_TIMEOUT, dc_rx)
            .await
            .map_err(|_| "data channel timeout".to_string())?
            .map_err(|_| "data channel cancelled".to_string())?;

        wait_data_channel_open(&dc).await?;

        info!("WebRTC DataChannel established as responder");
        Ok(Self {
            peer_connection: pc,
            data_channel: dc,
            recv_rx,
        })
    }
}

#[async_trait]
impl RemoteTransport for WebRtcTransport {
    async fn send(&mut self, data: &[u8]) -> Result<(), TransportError> {
        self.data_channel
            .send(&bytes::Bytes::copy_from_slice(data))
            .await
            .map(|_| ())
            .map_err(|e| TransportError::Io(format!("datachannel send: {}", e)))
    }

    async fn recv(&mut self) -> Result<Vec<u8>, TransportError> {
        self.recv_rx.recv().await.ok_or(TransportError::Closed)
    }

    async fn close(&mut self) -> Result<(), TransportError> {
        self.peer_connection
            .close()
            .await
            .map_err(|e| TransportError::Io(format!("close: {}", e)))
    }

    fn transport_type(&self) -> TransportType {
        TransportType::WebRtcDataChannel
    }
}

/// Create a new RTCPeerConnection with the given ICE servers.
async fn create_peer_connection(
    ice_servers: Vec<RTCIceServer>,
) -> Result<(Arc<RTCPeerConnection>, ()), String> {
    let mut m = MediaEngine::default();
    m.register_default_codecs()
        .map_err(|e| format!("register codecs: {}", e))?;

    let mut registry = Registry::new();
    registry = register_default_interceptors(registry, &mut m)
        .map_err(|e| format!("register interceptors: {}", e))?;

    let api = APIBuilder::new()
        .with_media_engine(m)
        .with_interceptor_registry(registry)
        .build();

    let config = RTCConfiguration {
        ice_servers,
        ..Default::default()
    };

    let pc = api
        .new_peer_connection(config)
        .await
        .map_err(|e| format!("new peer connection: {}", e))?;

    Ok((Arc::new(pc), ()))
}

/// Set up message receive handler on a DataChannel.
fn setup_data_channel_handlers(dc: &Arc<RTCDataChannel>, recv_tx: mpsc::Sender<Vec<u8>>) {
    dc.on_message(Box::new(move |msg: DataChannelMessage| {
        let tx = recv_tx.clone();
        Box::pin(async move {
            if tx.send(msg.data.to_vec()).await.is_err() {
                error!("datachannel recv buffer full");
            }
        })
    }));
}

/// Set up ICE candidate trickle — sends candidates to signaling.
async fn setup_ice_candidate_handler(pc: &Arc<RTCPeerConnection>, signaling: &SignalingClient) {
    // We clone the signaling sender for the callback
    let sig_tx = signaling.clone_sender();
    pc.on_ice_candidate(Box::new(move |candidate| {
        let tx = sig_tx.clone();
        Box::pin(async move {
            if let Some(c) = candidate {
                let json = match c.to_json() {
                    Ok(j) => j,
                    Err(e) => {
                        debug!("ICE candidate to JSON: {}", e);
                        return;
                    }
                };
                let msg = SignalingMessage::Candidate {
                    candidate: json.candidate,
                    sdp_mid: json.sdp_mid,
                    sdp_m_line_index: json.sdp_mline_index,
                };
                let _ = tx.send(msg).await;
            }
        })
    }));
}

/// Wait for the DataChannel to reach the "open" state.
async fn wait_data_channel_open(dc: &Arc<RTCDataChannel>) -> Result<(), String> {
    if dc.ready_state() == webrtc::data_channel::data_channel_state::RTCDataChannelState::Open {
        return Ok(());
    }

    let (open_tx, open_rx) = tokio::sync::oneshot::channel::<()>();
    let open_tx = Arc::new(tokio::sync::Mutex::new(Some(open_tx)));

    dc.on_open(Box::new(move || {
        let tx = open_tx.clone();
        Box::pin(async move {
            if let Some(tx) = tx.lock().await.take() {
                let _ = tx.send(());
            }
        })
    }));

    tokio::time::timeout(ICE_GATHERING_TIMEOUT, open_rx)
        .await
        .map_err(|_| "datachannel open timeout".to_string())?
        .map_err(|_| "datachannel open cancelled".to_string())
}
