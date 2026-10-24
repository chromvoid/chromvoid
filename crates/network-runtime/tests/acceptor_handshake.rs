use chromvoid_network_runtime::{
    acceptor::handshake::{perform_handshake, HandshakeOutcome},
    paired_peers::{PairedPeer, PairedPeerStore},
};
use chromvoid_protocol::{
    NoiseTransport, RemoteTransport, TransportError, TransportType, MAX_HANDSHAKE_MSG,
    NOISE_PARAMS_IK, NOISE_PARAMS_XX,
};
use std::{sync::Arc, time::Duration};
use tokio::sync::mpsc;

// Same in-memory transport boundary used by Tauri's acceptor integration tests.
struct ChannelTransport {
    incoming: mpsc::UnboundedReceiver<Vec<u8>>,
    outgoing: mpsc::UnboundedSender<Vec<u8>>,
}

impl ChannelTransport {
    fn pair() -> (Self, Self) {
        let (left_tx, left_rx) = mpsc::unbounded_channel();
        let (right_tx, right_rx) = mpsc::unbounded_channel();
        (
            Self {
                incoming: left_rx,
                outgoing: right_tx,
            },
            Self {
                incoming: right_rx,
                outgoing: left_tx,
            },
        )
    }
}

#[async_trait::async_trait]
impl RemoteTransport for ChannelTransport {
    async fn send(&mut self, data: &[u8]) -> Result<(), TransportError> {
        self.outgoing
            .send(data.to_vec())
            .map_err(|_| TransportError::Closed)
    }

    async fn recv(&mut self) -> Result<Vec<u8>, TransportError> {
        self.incoming.recv().await.ok_or(TransportError::Closed)
    }

    async fn close(&mut self) -> Result<(), TransportError> {
        self.incoming.close();
        Ok(())
    }

    fn transport_type(&self) -> TransportType {
        TransportType::WssRelay
    }
}

#[tokio::test]
async fn ik_and_xx_classify_authenticated_keys_and_produce_compatible_encrypted_transport() {
    for params in [NOISE_PARAMS_IK, NOISE_PARAMS_XX] {
        for trusted in [true, false] {
            tokio::time::timeout(Duration::from_secs(2), handshake_roundtrip(params, trusted))
                .await
                .expect("handshake and encrypted roundtrip must finish");
        }
    }
}

async fn handshake_roundtrip(params: &str, trusted: bool) {
    let host_key = snow::Builder::new(params.parse().unwrap())
        .generate_keypair()
        .unwrap();
    let client_key = snow::Builder::new(params.parse().unwrap())
        .generate_keypair()
        .unwrap();
    let dir = tempfile::tempdir().unwrap();
    let mut store =
        PairedPeerStore::load(&dir.path().join("peers.json"), Arc::new(|_| Ok([42; 32])));
    // Keep a different trusted key in the unknown case: neither the label nor the
    // mere existence of trust records can authorize an incoming static key.
    let stored_key = if trusted {
        client_key.public.clone()
    } else {
        host_key.public.clone()
    };
    store
        .upsert(PairedPeer {
            peer_id: "paired-desktop".into(),
            label: "Trusted desktop".into(),
            relay_url: "wss://relay.test".into(),
            peer_pubkey: stored_key,
            client_pubkey: host_key.public.clone(),
            client_privkey_hex: hex::encode(&host_key.private),
            last_seen: 1,
            paired_at: 1,
            platform: "desktop".into(),
        })
        .unwrap();
    store.save().unwrap();
    let store = PairedPeerStore::load(&dir.path().join("peers.json"), Arc::new(|_| Ok([42; 32])));
    let (mut client, mut host) = ChannelTransport::pair();
    let client_side = async {
        let builder = snow::Builder::new(params.parse().unwrap())
            .local_private_key(&client_key.private)
            .unwrap();
        let builder = if params == NOISE_PARAMS_IK {
            builder.remote_public_key(&host_key.public).unwrap()
        } else {
            builder
        };
        let mut handshake = builder.build_initiator().unwrap();
        let mut buffer = vec![0; MAX_HANDSHAKE_MSG];
        let length = handshake.write_message(&[], &mut buffer).unwrap();
        client.send(&buffer[..length]).await.unwrap();
        let message = client.recv().await.unwrap();
        handshake.read_message(&message, &mut buffer).unwrap();
        if params == NOISE_PARAMS_XX {
            let length = handshake.write_message(&[], &mut buffer).unwrap();
            client.send(&buffer[..length]).await.unwrap();
        }
        assert_eq!(handshake.get_remote_static().unwrap(), host_key.public);
        let mut noise = NoiseTransport::new(
            handshake.into_transport_mode().unwrap(),
            host_key.public.clone(),
        );
        client
            .send(&noise.encrypt(b"client proof").unwrap())
            .await
            .unwrap();
        assert_eq!(
            noise.decrypt(&client.recv().await.unwrap()).unwrap(),
            b"host proof"
        );
    };
    let host_side = async {
        let message = host.recv().await.unwrap();
        let outcome = perform_handshake(&mut host, &message, &store, &host_key.private)
            .await
            .unwrap();
        let mut noise = match outcome {
            HandshakeOutcome::Paired {
                noise,
                peer_id,
                label,
            } => {
                assert!(trusted, "an unknown key must not be admitted as paired");
                assert_eq!(peer_id, "paired-desktop");
                assert_eq!(label, "Trusted desktop");
                noise
            }
            HandshakeOutcome::UnknownPeer {
                noise,
                remote_pubkey,
            } => {
                assert!(
                    !trusted,
                    "a stored authenticated key must resolve its trust record"
                );
                assert_eq!(remote_pubkey, client_key.public);
                noise
            }
        };
        assert_eq!(noise.remote_pubkey(), client_key.public);
        assert_eq!(
            noise.decrypt(&host.recv().await.unwrap()).unwrap(),
            b"client proof"
        );
        host.send(&noise.encrypt(b"host proof").unwrap())
            .await
            .unwrap();
    };
    tokio::join!(client_side, host_side);
}

#[tokio::test]
async fn malformed_first_message_cannot_become_a_paired_connection() {
    let dir = tempfile::tempdir().unwrap();
    let store = PairedPeerStore::load(&dir.path().join("peers.json"), Arc::new(|_| Ok([42; 32])));
    let host_key = snow::Builder::new(NOISE_PARAMS_XX.parse().unwrap())
        .generate_keypair()
        .unwrap();
    let (_client, mut host) = ChannelTransport::pair();
    let outcome = perform_handshake(&mut host, &[0; 8], &store, &host_key.private).await;
    assert!(matches!(outcome, Err(error) if error.starts_with("XX msg1 read:")));
}
