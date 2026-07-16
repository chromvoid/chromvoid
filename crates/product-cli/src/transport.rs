use std::time::Duration;

use futures_util::stream::{SplitSink, SplitStream};
use futures_util::{SinkExt, StreamExt};
use sha2::{Digest, Sha256};
use snow::params::NoiseParams;
use tokio::net::TcpStream;
use tokio_tungstenite::tungstenite::protocol::Message;
use tokio_tungstenite::{MaybeTlsStream, WebSocketStream};
use zeroize::Zeroizing;

use chromvoid_protocol::{
    agent_frame_fragments, AgentFrameReassembler, AgentWireError, Frame,
    AGENT_FRAGMENT_REASSEMBLY_TIMEOUT_SECS, AGENT_MAX_REQUEST_BYTES, AGENT_MAX_RESPONSE_BYTES,
    MAX_HANDSHAKE_MSG,
};

use crate::config::{NoiseIdentity, PublicConfig, DEFAULT_GATEWAY_ENDPOINT};
use crate::error::{CliError, EX_DATAERR};

type ClientWebSocket = WebSocketStream<MaybeTlsStream<TcpStream>>;

pub struct AgentConnection {
    transport: snow::TransportState,
    write: SplitSink<ClientWebSocket, Message>,
    read: SplitStream<ClientWebSocket>,
    inbound_reassembler: AgentFrameReassembler,
    inbound_fragment_deadline: Option<tokio::time::Instant>,
}

impl AgentConnection {
    pub async fn pair(identity: &NoiseIdentity, pin: &str) -> Result<(Self, Vec<u8>), CliError> {
        if pin.len() != 6 || !pin.as_bytes().iter().all(u8::is_ascii_digit) {
            return Err(CliError::usage(
                "INVALID_PAIRING_CODE",
                "Pairing code must contain exactly six digits",
            ));
        }
        let websocket = connect(&format!("{DEFAULT_GATEWAY_ENDPOINT}/pair")).await?;
        let (mut write, mut read) = websocket.split();
        let params: NoiseParams = chromvoid_protocol::NOISE_PARAMS_XXPSK0
            .parse()
            .map_err(noise_setup_error)?;
        let psk = Zeroizing::new(pin_to_psk(pin));
        let mut handshake = snow::Builder::new(params)
            .local_private_key(identity.private_key())
            .map_err(noise_setup_error)?
            .psk(0, &psk)
            .map_err(noise_setup_error)?
            .build_initiator()
            .map_err(noise_setup_error)?;
        let mut buffer = vec![0_u8; MAX_HANDSHAKE_MSG];

        let length = handshake
            .write_message(&[], &mut buffer)
            .map_err(pairing_error)?;
        send_binary(&mut write, &buffer[..length]).await?;
        let message = read_binary(&mut read, "pairing handshake response").await?;
        handshake.read_message(&message, &mut buffer).map_err(|_| {
            CliError::unavailable(
                "PAIRING_FAILED",
                "Pairing failed; check the short-lived desktop code",
            )
        })?;
        let server_public_key = handshake
            .get_remote_static()
            .filter(|key| key.len() == 32)
            .map(ToOwned::to_owned)
            .ok_or_else(|| {
                CliError::data(
                    "INVALID_PAIRING_IDENTITY",
                    "Desktop did not provide a valid static Noise identity",
                )
            })?;
        let length = handshake
            .write_message(&[], &mut buffer)
            .map_err(pairing_error)?;
        send_binary(&mut write, &buffer[..length]).await?;

        let transport = handshake.into_transport_mode().map_err(pairing_error)?;
        Ok((
            Self {
                transport,
                write,
                read,
                inbound_reassembler: AgentFrameReassembler::new(AGENT_MAX_RESPONSE_BYTES),
                inbound_fragment_deadline: None,
            },
            server_public_key,
        ))
    }

    pub async fn reconnect(
        identity: &NoiseIdentity,
        config: &PublicConfig,
    ) -> Result<Self, CliError> {
        config.validate()?;
        if identity.actor_id() != config.actor_id {
            return Err(CliError::unavailable(
                "NOT_PAIRED",
                "Keychain identity does not match CLI pairing metadata; pair again",
            ));
        }
        let server_public_key = config.server_public_key()?;
        let websocket = connect(&format!("{}/agent", config.endpoint)).await?;
        let (mut write, mut read) = websocket.split();
        let params: NoiseParams = chromvoid_protocol::NOISE_PARAMS_IK
            .parse()
            .map_err(noise_setup_error)?;
        let mut handshake = snow::Builder::new(params)
            .local_private_key(identity.private_key())
            .map_err(noise_setup_error)?
            .remote_public_key(&server_public_key)
            .map_err(noise_setup_error)?
            .build_initiator()
            .map_err(noise_setup_error)?;
        let mut buffer = vec![0_u8; MAX_HANDSHAKE_MSG];
        let length = handshake
            .write_message(&[], &mut buffer)
            .map_err(noise_setup_error)?;
        send_binary(&mut write, &buffer[..length]).await?;
        let response = read_binary(&mut read, "agent authentication response")
            .await
            .map_err(|_| {
                CliError::unavailable(
                    "NOT_PAIRED",
                    "Desktop rejected this CLI identity; open ChromVoid and pair again",
                )
            })?;
        handshake
            .read_message(&response, &mut buffer)
            .map_err(|_| {
                CliError::unavailable(
                    "NOT_PAIRED",
                    "Desktop rejected this CLI identity; open ChromVoid and pair again",
                )
            })?;
        let transport = handshake.into_transport_mode().map_err(|_| {
            CliError::unavailable(
                "NOT_PAIRED",
                "Could not establish an authenticated CLI session",
            )
        })?;
        Ok(Self {
            transport,
            write,
            read,
            inbound_reassembler: AgentFrameReassembler::new(AGENT_MAX_RESPONSE_BYTES),
            inbound_fragment_deadline: None,
        })
    }

    pub async fn send_frame(&mut self, frame: &Frame) -> Result<(), CliError> {
        let fragments = agent_frame_fragments(frame, AGENT_MAX_REQUEST_BYTES)
            .map_err(agent_frame_send_error)?;
        for fragment in fragments {
            let plaintext = fragment.encode();
            let mut ciphertext = vec![0_u8; MAX_HANDSHAKE_MSG];
            let length = self
                .transport
                .write_message(&plaintext, &mut ciphertext)
                .map_err(|error| {
                    CliError::unavailable(
                        "TRANSPORT_WRITE_FAILED",
                        format!("Encrypt agent request: {error}"),
                    )
                })?;
            ciphertext.truncate(length);
            send_binary(&mut self.write, &ciphertext).await?;
        }
        Ok(())
    }

    pub async fn next_frame(&mut self) -> Result<Frame, CliError> {
        loop {
            let next_message = self.read.next();
            let incoming = if let Some(deadline) = self.inbound_fragment_deadline {
                tokio::time::timeout_at(deadline, next_message)
                    .await
                    .map_err(|_| {
                        CliError::data(
                            "INVALID_FRAME",
                            "Desktop did not finish the fragmented agent message in time",
                        )
                    })?
            } else {
                next_message.await
            };
            let message = incoming
                .ok_or_else(|| {
                    CliError::unavailable(
                        "GATEWAY_DISCONNECTED",
                        "ChromVoid desktop closed the agent session",
                    )
                })?
                .map_err(|error| {
                    CliError::unavailable(
                        "GATEWAY_DISCONNECTED",
                        format!("Read agent session: {error}"),
                    )
                })?;
            match message {
                Message::Binary(ciphertext) => {
                    if ciphertext.len() > MAX_HANDSHAKE_MSG {
                        return Err(CliError::data(
                            "INVALID_FRAME",
                            "Desktop sent an oversized encrypted frame",
                        ));
                    }
                    let mut plaintext = vec![0_u8; ciphertext.len()];
                    let length = self
                        .transport
                        .read_message(ciphertext.as_ref(), &mut plaintext)
                        .map_err(|_| {
                            CliError::data(
                                "TRANSPORT_AUTH_FAILED",
                                "Desktop sent a frame that failed Noise authentication",
                            )
                        })?;
                    plaintext.truncate(length);
                    let frame = Frame::decode(&plaintext)
                        .map_err(|error| CliError::data("INVALID_FRAME", error))?;
                    let was_reassembling = self.inbound_reassembler.is_reassembling();
                    let logical_frame = self
                        .inbound_reassembler
                        .push(frame)
                        .map_err(|error| CliError::data("INVALID_FRAME", error.to_string()))?;
                    if let Some(frame) = logical_frame {
                        self.inbound_fragment_deadline = None;
                        return Ok(frame);
                    }
                    if !was_reassembling {
                        self.inbound_fragment_deadline = Some(
                            tokio::time::Instant::now()
                                + Duration::from_secs(AGENT_FRAGMENT_REASSEMBLY_TIMEOUT_SECS),
                        );
                    }
                }
                Message::Ping(bytes) => {
                    self.write
                        .send(Message::Pong(bytes))
                        .await
                        .map_err(|error| {
                            CliError::unavailable(
                                "GATEWAY_DISCONNECTED",
                                format!("Reply to Gateway ping: {error}"),
                            )
                        })?;
                }
                Message::Close(_) => {
                    return Err(CliError::unavailable(
                        "GATEWAY_DISCONNECTED",
                        "ChromVoid desktop closed the agent session",
                    ))
                }
                _ => {}
            }
        }
    }

    pub async fn close(&mut self) {
        let _ = self.write.send(Message::Close(None)).await;
    }
}

fn agent_frame_send_error(error: AgentWireError) -> CliError {
    match error {
        AgentWireError::MessageTooLarge => CliError::Local {
            code: "REQUEST_TOO_LARGE",
            message: format!("Encoded request exceeds the {AGENT_MAX_REQUEST_BYTES} byte limit"),
            retryable: false,
            next_action: Some("reduce_request"),
            exit_code: EX_DATAERR,
        },
        other => CliError::software("INVALID_OUTBOUND_FRAME", other.to_string()),
    }
}

async fn connect(endpoint: &str) -> Result<ClientWebSocket, CliError> {
    let (websocket, _) = tokio::time::timeout(
        Duration::from_secs(5),
        tokio_tungstenite::connect_async(endpoint),
    )
    .await
    .map_err(|_| {
        CliError::unavailable(
            "GATEWAY_UNAVAILABLE",
            "ChromVoid desktop Gateway did not respond",
        )
    })?
    .map_err(|error| {
        CliError::unavailable(
            "GATEWAY_UNAVAILABLE",
            format!("Connect to ChromVoid desktop Gateway: {error}"),
        )
    })?;
    Ok(websocket)
}

async fn send_binary(
    write: &mut SplitSink<ClientWebSocket, Message>,
    bytes: &[u8],
) -> Result<(), CliError> {
    write
        .send(Message::Binary(bytes.to_vec().into()))
        .await
        .map_err(|error| {
            CliError::unavailable(
                "GATEWAY_DISCONNECTED",
                format!("Write agent session: {error}"),
            )
        })
}

async fn read_binary(
    read: &mut SplitStream<ClientWebSocket>,
    phase: &str,
) -> Result<Vec<u8>, CliError> {
    let message = tokio::time::timeout(Duration::from_secs(5), read.next())
        .await
        .map_err(|_| {
            CliError::unavailable("GATEWAY_TIMEOUT", format!("Timed out waiting for {phase}"))
        })?
        .ok_or_else(|| {
            CliError::unavailable(
                "GATEWAY_DISCONNECTED",
                format!("Gateway closed before {phase}"),
            )
        })?
        .map_err(|error| {
            CliError::unavailable("GATEWAY_DISCONNECTED", format!("Read {phase}: {error}"))
        })?;
    match message {
        Message::Binary(bytes) if bytes.len() <= MAX_HANDSHAKE_MSG => Ok(bytes.to_vec()),
        Message::Binary(_) => Err(CliError::data(
            "INVALID_HANDSHAKE",
            format!("Gateway sent an oversized {phase}"),
        )),
        _ => Err(CliError::data(
            "INVALID_HANDSHAKE",
            format!("Gateway sent a non-binary {phase}"),
        )),
    }
}

fn pin_to_psk(pin: &str) -> [u8; 32] {
    let mut hasher = Sha256::new();
    hasher.update(pin.as_bytes());
    hasher.finalize().into()
}

fn noise_setup_error(error: snow::Error) -> CliError {
    CliError::software(
        "NOISE_SETUP_FAILED",
        format!("Set up Noise session: {error}"),
    )
}

fn pairing_error(error: snow::Error) -> CliError {
    CliError::unavailable("PAIRING_FAILED", format!("Complete Noise pairing: {error}"))
}

#[cfg(test)]
mod tests {
    use chromvoid_protocol::{FrameType, NOISE_PARAMS_IK, NOISE_PARAMS_XXPSK0};

    use super::*;

    #[test]
    fn pairing_psk_is_sha256_of_exact_six_digit_code() {
        assert_eq!(
            hex::encode(pin_to_psk("123456")),
            "8d969eef6ecad3c29a3a629280e686cf0c3f5d5a86aff3ca12020c923adc6c92"
        );
    }

    #[test]
    fn oversized_encoded_request_is_a_data_error() {
        let error = agent_frame_send_error(AgentWireError::MessageTooLarge);
        assert_eq!(error.exit_code(), EX_DATAERR);
        let contract = error.as_agent_error();
        assert_eq!(contract.code, "REQUEST_TOO_LARGE");
        assert_eq!(contract.next_action.as_deref(), Some("reduce_request"));
    }

    #[test]
    fn pairing_order_establishes_transport_with_route_identity() {
        let client = NoiseIdentity::generate().expect("client identity");
        let params: NoiseParams = NOISE_PARAMS_XXPSK0.parse().expect("XXpsk0 params");
        let server_keypair = snow::Builder::new(params.clone())
            .generate_keypair()
            .expect("server identity");
        let psk = pin_to_psk("123456");
        let mut initiator = snow::Builder::new(params.clone())
            .local_private_key(client.private_key())
            .expect("client private")
            .psk(0, &psk)
            .expect("client psk")
            .build_initiator()
            .expect("initiator");
        let mut responder = snow::Builder::new(params)
            .local_private_key(&server_keypair.private)
            .expect("server private")
            .psk(0, &psk)
            .expect("server psk")
            .build_responder()
            .expect("responder");
        exchange_xx(&mut initiator, &mut responder);
        assert_eq!(
            initiator.get_remote_static(),
            Some(server_keypair.public.as_slice())
        );
        assert_eq!(responder.get_remote_static(), Some(client.public_key()));
        assert_frame_transport(initiator, responder);
    }

    #[test]
    fn ik_reconnect_authenticates_stored_static_keys() {
        let client = NoiseIdentity::generate().expect("client identity");
        let params: NoiseParams = NOISE_PARAMS_IK.parse().expect("IK params");
        let server_keypair = snow::Builder::new(params.clone())
            .generate_keypair()
            .expect("server identity");
        let mut initiator = snow::Builder::new(params.clone())
            .local_private_key(client.private_key())
            .expect("client private")
            .remote_public_key(&server_keypair.public)
            .expect("server public")
            .build_initiator()
            .expect("initiator");
        let mut responder = snow::Builder::new(params)
            .local_private_key(&server_keypair.private)
            .expect("server private")
            .build_responder()
            .expect("responder");
        let mut outbound = vec![0_u8; MAX_HANDSHAKE_MSG];
        let mut plaintext = vec![0_u8; MAX_HANDSHAKE_MSG];
        let length = initiator
            .write_message(&[], &mut outbound)
            .expect("IK message 1");
        responder
            .read_message(&outbound[..length], &mut plaintext)
            .expect("read IK message 1");
        let length = responder
            .write_message(&[], &mut outbound)
            .expect("IK message 2");
        initiator
            .read_message(&outbound[..length], &mut plaintext)
            .expect("read IK message 2");
        assert_eq!(
            initiator.get_remote_static(),
            Some(server_keypair.public.as_slice())
        );
        assert_eq!(responder.get_remote_static(), Some(client.public_key()));
        assert_frame_transport(initiator, responder);
    }

    fn exchange_xx(initiator: &mut snow::HandshakeState, responder: &mut snow::HandshakeState) {
        let mut outbound = vec![0_u8; MAX_HANDSHAKE_MSG];
        let mut plaintext = vec![0_u8; MAX_HANDSHAKE_MSG];
        let length = initiator
            .write_message(&[], &mut outbound)
            .expect("XX message 1");
        responder
            .read_message(&outbound[..length], &mut plaintext)
            .expect("read XX message 1");
        let length = responder
            .write_message(&[], &mut outbound)
            .expect("XX message 2");
        initiator
            .read_message(&outbound[..length], &mut plaintext)
            .expect("read XX message 2");
        let length = initiator
            .write_message(&[], &mut outbound)
            .expect("XX message 3");
        responder
            .read_message(&outbound[..length], &mut plaintext)
            .expect("read XX message 3");
    }

    fn assert_frame_transport(initiator: snow::HandshakeState, responder: snow::HandshakeState) {
        let frame = Frame {
            frame_type: FrameType::RpcRequest,
            message_id: 1,
            flags: 0,
            payload: br#"{"command":"hello"}"#.to_vec(),
        };
        let encoded = frame.encode();
        let mut sender = initiator.into_transport_mode().expect("client transport");
        let mut receiver = responder.into_transport_mode().expect("server transport");
        let mut ciphertext = vec![0_u8; encoded.len() + 64];
        let length = sender
            .write_message(&encoded, &mut ciphertext)
            .expect("encrypt frame");
        let mut plaintext = vec![0_u8; length];
        let length = receiver
            .read_message(&ciphertext[..length], &mut plaintext)
            .expect("decrypt frame");
        let decoded = Frame::decode(&plaintext[..length]).expect("decode frame");
        assert_eq!(decoded.message_id, 1);
        assert_eq!(decoded.payload, frame.payload);

        let large_frame = Frame {
            frame_type: FrameType::RpcRequest,
            message_id: 2,
            flags: 0,
            payload: vec![7; AGENT_MAX_REQUEST_BYTES],
        };
        let mut reassembler = AgentFrameReassembler::new(AGENT_MAX_REQUEST_BYTES);
        let mut completed = None;
        for fragment in agent_frame_fragments(&large_frame, AGENT_MAX_REQUEST_BYTES)
            .expect("fragment large frame")
        {
            let encoded = fragment.encode();
            let mut ciphertext = vec![0_u8; MAX_HANDSHAKE_MSG];
            let length = sender
                .write_message(&encoded, &mut ciphertext)
                .expect("encrypt fragment");
            assert!(length <= MAX_HANDSHAKE_MSG);
            let mut plaintext = vec![0_u8; length];
            let length = receiver
                .read_message(&ciphertext[..length], &mut plaintext)
                .expect("decrypt fragment");
            let decoded = Frame::decode(&plaintext[..length]).expect("decode fragment");
            completed = reassembler.push(decoded).expect("reassemble fragments");
        }
        assert_eq!(
            completed.expect("complete large frame").payload,
            large_frame.payload
        );
    }
}
