use chromvoid_protocol::{NoiseTransport, RemoteTransport, TransportError};
use tracing::info;

#[derive(Debug, Clone, Copy, PartialEq, Eq)]
pub enum RemoteHandshakeFailureKind {
    TransportClosed,
    TransportTimeout,
    RecordLayerInvalidLength,
    TransportIo,
    NoiseInputOrDecrypt,
    Noise,
    Protocol,
}

#[derive(Debug, Clone, PartialEq, Eq)]
pub struct RemoteHandshakeError {
    stage: &'static str,
    kind: RemoteHandshakeFailureKind,
    message: String,
}

impl RemoteHandshakeError {
    fn transport(stage: &'static str, error: TransportError) -> Self {
        let kind = match error {
            TransportError::Closed => RemoteHandshakeFailureKind::TransportClosed,
            TransportError::Timeout => RemoteHandshakeFailureKind::TransportTimeout,
            TransportError::RecordLayerInvalidLength(_) => {
                RemoteHandshakeFailureKind::RecordLayerInvalidLength
            }
            TransportError::Io(_) => RemoteHandshakeFailureKind::TransportIo,
        };
        Self {
            stage,
            kind,
            message: format!("{stage}: {error}"),
        }
    }

    fn noise(stage: &'static str, error: snow::Error) -> Self {
        let kind = if (stage == "ik msg2 read" || stage == "xx msg2 read")
            && matches!(error, snow::Error::Input | snow::Error::Decrypt)
        {
            RemoteHandshakeFailureKind::NoiseInputOrDecrypt
        } else {
            RemoteHandshakeFailureKind::Noise
        };
        let detail = error.to_string();
        Self {
            stage,
            kind,
            message: format!("{stage}: {detail}"),
        }
    }

    fn protocol(stage: &'static str, detail: impl std::fmt::Display) -> Self {
        Self {
            stage,
            kind: RemoteHandshakeFailureKind::Protocol,
            message: format!("{stage}: {detail}"),
        }
    }

    pub fn stage(&self) -> &'static str {
        self.stage
    }

    pub fn kind(&self) -> RemoteHandshakeFailureKind {
        self.kind
    }

    #[cfg(test)]
    pub(crate) fn for_test(
        stage: &'static str,
        kind: RemoteHandshakeFailureKind,
        message: impl Into<String>,
    ) -> Self {
        Self {
            stage,
            kind,
            message: message.into(),
        }
    }
}

impl std::fmt::Display for RemoteHandshakeError {
    fn fmt(&self, f: &mut std::fmt::Formatter<'_>) -> std::fmt::Result {
        write!(f, "{}", self.message)
    }
}

impl std::error::Error for RemoteHandshakeError {}

/// Perform Noise IK over a message-oriented remote transport.
pub async fn handshake_ik_over_transport(
    transport: Box<dyn RemoteTransport>,
    client_privkey: &[u8],
    peer_pubkey: &[u8],
) -> Result<(Box<dyn RemoteTransport>, NoiseTransport), String> {
    handshake_ik_over_transport_typed(transport, client_privkey, peer_pubkey)
        .await
        .map_err(|error| error.to_string())
}

pub async fn handshake_ik_over_transport_typed(
    mut transport: Box<dyn RemoteTransport>,
    client_privkey: &[u8],
    peer_pubkey: &[u8],
) -> Result<(Box<dyn RemoteTransport>, NoiseTransport), RemoteHandshakeError> {
    let params: snow::params::NoiseParams = chromvoid_protocol::NOISE_PARAMS_IK
        .parse()
        .map_err(|e: snow::Error| RemoteHandshakeError::protocol("noise params", e))?;

    let mut initiator = snow::Builder::new(params)
        .local_private_key(client_privkey)
        .map_err(|e| RemoteHandshakeError::protocol("local_private_key", e))?
        .remote_public_key(peer_pubkey)
        .map_err(|e| RemoteHandshakeError::protocol("remote_public_key", e))?
        .build_initiator()
        .map_err(|e| RemoteHandshakeError::protocol("build_initiator", e))?;

    let mut buf = vec![0u8; chromvoid_protocol::MAX_HANDSHAKE_MSG];

    let len = initiator
        .write_message(&[], &mut buf)
        .map_err(|e| RemoteHandshakeError::noise("ik msg1 write", e))?;
    info!("remote_handshake: IK msg1 send:start len={}", len);
    transport
        .send(&buf[..len])
        .await
        .map_err(|e| RemoteHandshakeError::transport("ik msg1 send", e))?;
    info!("remote_handshake: IK msg1 send:done len={}", len);

    info!("remote_handshake: IK msg2 recv:start");
    let msg2 = transport
        .recv()
        .await
        .map_err(|e| RemoteHandshakeError::transport("ik msg2 recv", e))?;
    info!("remote_handshake: IK msg2 recv:done len={}", msg2.len());
    initiator
        .read_message(&msg2, &mut buf)
        .map_err(|e| RemoteHandshakeError::noise("ik msg2 read", e))?;

    let transport_state = initiator
        .into_transport_mode()
        .map_err(|e| RemoteHandshakeError::protocol("into_transport_mode", e))?;

    let noise = NoiseTransport::new(transport_state, peer_pubkey.to_vec());
    Ok((transport, noise))
}

/// Perform Noise XX over a message-oriented remote transport for first pairing.
pub async fn handshake_xx_over_transport(
    transport: Box<dyn RemoteTransport>,
    client_privkey: &[u8],
) -> Result<(Box<dyn RemoteTransport>, NoiseTransport, Vec<u8>), String> {
    handshake_xx_over_transport_typed(transport, client_privkey)
        .await
        .map_err(|error| error.to_string())
}

pub async fn handshake_xx_over_transport_typed(
    mut transport: Box<dyn RemoteTransport>,
    client_privkey: &[u8],
) -> Result<(Box<dyn RemoteTransport>, NoiseTransport, Vec<u8>), RemoteHandshakeError> {
    let params: snow::params::NoiseParams = chromvoid_protocol::NOISE_PARAMS_XX
        .parse()
        .map_err(|e: snow::Error| RemoteHandshakeError::protocol("noise params", e))?;

    let mut initiator = snow::Builder::new(params)
        .local_private_key(client_privkey)
        .map_err(|e| RemoteHandshakeError::protocol("local_private_key", e))?
        .build_initiator()
        .map_err(|e| RemoteHandshakeError::protocol("build_initiator", e))?;

    let mut buf = vec![0u8; chromvoid_protocol::MAX_HANDSHAKE_MSG];

    let len = initiator
        .write_message(&[], &mut buf)
        .map_err(|e| RemoteHandshakeError::noise("xx msg1 write", e))?;
    info!("remote_handshake: XX msg1 send:start len={}", len);
    transport
        .send(&buf[..len])
        .await
        .map_err(|e| RemoteHandshakeError::transport("xx msg1 send", e))?;
    info!("remote_handshake: XX msg1 send:done len={}", len);

    info!("remote_handshake: XX msg2 recv:start");
    let msg2 = transport
        .recv()
        .await
        .map_err(|e| RemoteHandshakeError::transport("xx msg2 recv", e))?;
    info!("remote_handshake: XX msg2 recv:done len={}", msg2.len());
    initiator
        .read_message(&msg2, &mut buf)
        .map_err(|e| RemoteHandshakeError::noise("xx msg2 read", e))?;

    let peer_pubkey = initiator
        .get_remote_static()
        .ok_or_else(|| RemoteHandshakeError::protocol("xx", "no remote static key"))?
        .to_vec();

    let len = initiator
        .write_message(&[], &mut buf)
        .map_err(|e| RemoteHandshakeError::noise("xx msg3 write", e))?;
    info!("remote_handshake: XX msg3 send:start len={}", len);
    transport
        .send(&buf[..len])
        .await
        .map_err(|e| RemoteHandshakeError::transport("xx msg3 send", e))?;
    info!("remote_handshake: XX msg3 send:done len={}", len);

    let transport_state = initiator
        .into_transport_mode()
        .map_err(|e| RemoteHandshakeError::protocol("into_transport_mode", e))?;

    let noise = NoiseTransport::new(transport_state, peer_pubkey.clone());
    Ok((transport, noise, peer_pubkey))
}

#[cfg(test)]
mod tests {
    use super::*;
    use async_trait::async_trait;
    use chromvoid_protocol::{TransportError, TransportType};
    use std::collections::VecDeque;

    #[tokio::test]
    async fn ik_helper_completes_against_responder_transport() {
        let params: snow::params::NoiseParams = chromvoid_protocol::NOISE_PARAMS_IK
            .parse()
            .expect("IK params");
        let client_keys = snow::Builder::new(params.clone())
            .generate_keypair()
            .expect("client keys");
        let host_keys = snow::Builder::new(params)
            .generate_keypair()
            .expect("host keys");
        let transport = IkResponderTransport::new(&host_keys.private);

        let (_transport, mut client_noise) = handshake_ik_over_transport(
            Box::new(transport),
            &client_keys.private,
            &host_keys.public,
        )
        .await
        .expect("IK helper");

        let encrypted = client_noise.encrypt(b"ok").expect("client encrypt");
        assert!(!encrypted.is_empty());
    }

    #[tokio::test]
    async fn xx_helper_returns_remote_static_key() {
        let params: snow::params::NoiseParams = chromvoid_protocol::NOISE_PARAMS_XX
            .parse()
            .expect("XX params");
        let client_keys = snow::Builder::new(params.clone())
            .generate_keypair()
            .expect("client keys");
        let host_keys = snow::Builder::new(params)
            .generate_keypair()
            .expect("host keys");
        let transport = XxResponderTransport::new(&host_keys.private);

        let (_transport, mut client_noise, peer_pubkey) =
            handshake_xx_over_transport(Box::new(transport), &client_keys.private)
                .await
                .expect("XX helper");

        assert_eq!(peer_pubkey, host_keys.public);
        let encrypted = client_noise.encrypt(b"ok").expect("client encrypt");
        assert!(!encrypted.is_empty());
    }

    struct IkResponderTransport {
        responder: snow::HandshakeState,
        inbound: VecDeque<Vec<u8>>,
    }

    impl IkResponderTransport {
        fn new(host_privkey: &[u8]) -> Self {
            let params: snow::params::NoiseParams = chromvoid_protocol::NOISE_PARAMS_IK
                .parse()
                .expect("IK params");
            let responder = snow::Builder::new(params)
                .local_private_key(host_privkey)
                .expect("local key")
                .build_responder()
                .expect("responder");
            Self {
                responder,
                inbound: VecDeque::new(),
            }
        }
    }

    #[async_trait]
    impl RemoteTransport for IkResponderTransport {
        async fn send(&mut self, data: &[u8]) -> Result<(), TransportError> {
            let mut buf = vec![0_u8; chromvoid_protocol::MAX_HANDSHAKE_MSG];
            self.responder
                .read_message(data, &mut buf)
                .map_err(|e| TransportError::Io(format!("IK read: {e}")))?;
            let len = self
                .responder
                .write_message(&[], &mut buf)
                .map_err(|e| TransportError::Io(format!("IK write: {e}")))?;
            self.inbound.push_back(buf[..len].to_vec());
            Ok(())
        }

        async fn recv(&mut self) -> Result<Vec<u8>, TransportError> {
            self.inbound.pop_front().ok_or(TransportError::Closed)
        }

        async fn close(&mut self) -> Result<(), TransportError> {
            Ok(())
        }

        fn transport_type(&self) -> TransportType {
            TransportType::WssRelay
        }
    }

    struct XxResponderTransport {
        responder: snow::HandshakeState,
        inbound: VecDeque<Vec<u8>>,
    }

    impl XxResponderTransport {
        fn new(host_privkey: &[u8]) -> Self {
            let params: snow::params::NoiseParams = chromvoid_protocol::NOISE_PARAMS_XX
                .parse()
                .expect("XX params");
            let responder = snow::Builder::new(params)
                .local_private_key(host_privkey)
                .expect("local key")
                .build_responder()
                .expect("responder");
            Self {
                responder,
                inbound: VecDeque::new(),
            }
        }
    }

    #[async_trait]
    impl RemoteTransport for XxResponderTransport {
        async fn send(&mut self, data: &[u8]) -> Result<(), TransportError> {
            let mut buf = vec![0_u8; chromvoid_protocol::MAX_HANDSHAKE_MSG];
            match self.responder.read_message(data, &mut buf) {
                Ok(_) if self.responder.is_handshake_finished() => Ok(()),
                Ok(_) => {
                    let len = self
                        .responder
                        .write_message(&[], &mut buf)
                        .map_err(|e| TransportError::Io(format!("XX write: {e}")))?;
                    self.inbound.push_back(buf[..len].to_vec());
                    Ok(())
                }
                Err(error) => Err(TransportError::Io(format!("XX read: {error}"))),
            }
        }

        async fn recv(&mut self) -> Result<Vec<u8>, TransportError> {
            self.inbound.pop_front().ok_or(TransportError::Closed)
        }

        async fn close(&mut self) -> Result<(), TransportError> {
            Ok(())
        }

        fn transport_type(&self) -> TransportType {
            TransportType::UsbMobile
        }
    }
}
