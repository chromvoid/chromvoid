use super::*;
use async_trait::async_trait;
use chromvoid_protocol::{TransportError, TransportType, NOISE_PARAMS_XXPSK0};
use serde_json::json;
use tokio::sync::mpsc;

struct Channel {
    tx: Option<mpsc::Sender<Vec<u8>>>,
    rx: mpsc::Receiver<Vec<u8>>,
}
impl Channel {
    fn pair() -> (Self, Self) {
        let (left_tx, left_rx) = mpsc::channel(4);
        let (right_tx, right_rx) = mpsc::channel(4);
        (
            Self {
                tx: Some(left_tx),
                rx: right_rx,
            },
            Self {
                tx: Some(right_tx),
                rx: left_rx,
            },
        )
    }
}
#[async_trait]
impl RemoteTransport for Channel {
    async fn send(&mut self, data: &[u8]) -> Result<(), TransportError> {
        self.tx
            .as_ref()
            .ok_or(TransportError::Closed)?
            .send(data.to_vec())
            .await
            .map_err(|_| TransportError::Closed)
    }
    async fn recv(&mut self) -> Result<Vec<u8>, TransportError> {
        self.rx.recv().await.ok_or(TransportError::Closed)
    }
    async fn close(&mut self) -> Result<(), TransportError> {
        self.tx.take();
        Ok(())
    }
    fn transport_type(&self) -> TransportType {
        TransportType::WssRelay
    }
}
fn keys() -> snow::Keypair {
    snow::Builder::new(NOISE_PARAMS_XXPSK0.parse().unwrap())
        .generate_keypair()
        .unwrap()
}
fn error<T>(result: Result<T, String>) -> String {
    match result {
        Err(error) => error,
        Ok(_) => panic!("expected rejection"),
    }
}
async fn connected() -> (Channel, NoiseTransport, Channel, NoiseTransport) {
    let (mut left, mut right) = Channel::pair();
    let (left_key, right_key) = (keys(), keys());
    let psk = pin_to_psk("123456");
    let (initiator, responder) = tokio::join!(
        xxpsk0_initiator(&mut left, &left_key.private, &psk),
        xxpsk0_responder(&mut right, &right_key.private, &psk, Duration::from_secs(1)),
    );
    let (initiator, responder) = (initiator.unwrap(), responder.unwrap());
    assert_eq!(initiator.remote_pubkey(), right_key.public);
    assert_eq!(responder.remote_pubkey(), left_key.public);
    (left, initiator, right, responder)
}

#[test]
fn pin_derivation_preserves_known_bytes_and_leading_zeroes() {
    // Independently checked with Python hashlib, not the production derivation helper.
    assert_eq!(
        hex::encode(pin_to_psk("123456")),
        "8d969eef6ecad3c29a3a629280e686cf0c3f5d5a86aff3ca12020c923adc6c92"
    );
    assert_eq!(
        hex::encode(pin_to_psk("012345")),
        "2224512ef44a62e580bb1c0dcb33aff688f4e7da8a488aeb4e7ca402c5cacf45"
    );
    assert_ne!(pin_to_psk("012345"), pin_to_psk("12345"));
}

#[tokio::test]
async fn actual_handshake_and_encrypted_hello_preserve_wire_and_static_identity() {
    let (mut left, mut initiator, mut right, mut responder) = connected().await;
    let local_key = hex::encode(responder.remote_pubkey());
    let hello = PairingHello {
        peer_id: "synthetic-desktop".into(),
        peer_label: "Desktop".into(),
        peer_pubkey_hex: local_key.clone(),
        platform: "desktop".into(),
    };
    send_pairing_hello(&mut left, &mut initiator, &hello)
        .await
        .unwrap();
    let encrypted = right.recv().await.unwrap();
    let decoded: serde_json::Value =
        serde_json::from_slice(&responder.decrypt(&encrypted).unwrap()).unwrap();
    assert_eq!(
        decoded,
        json!({"peer_id":"synthetic-desktop","peer_label":"Desktop","peer_pubkey_hex":local_key,"platform":"desktop"})
    );
    let remote_key = hex::encode(initiator.remote_pubkey());
    let response = json!({"peer_id":"synthetic-phone","peer_label":"Phone","peer_pubkey_hex":remote_key,"platform":"ios"});
    right
        .send(
            &responder
                .encrypt(&serde_json::to_vec(&response).unwrap())
                .unwrap(),
        )
        .await
        .unwrap();
    let received = recv_pairing_hello(&mut left, &mut initiator).await.unwrap();
    assert_eq!(received.peer_id, "synthetic-phone");
    assert_eq!(received.peer_label, "Phone");
    assert_eq!(received.peer_pubkey_hex, remote_key);
    assert_eq!(received.platform, "ios");
}

#[tokio::test]
async fn wrong_pin_rejects_handshake_before_hello_exchange() {
    let (mut left, mut right) = Channel::pair();
    let (left_key, right_key) = (keys(), keys());
    let initiator =
        async move { xxpsk0_initiator(&mut left, &left_key.private, &pin_to_psk("123456")).await };
    let responder = async move {
        xxpsk0_responder(
            &mut right,
            &right_key.private,
            &pin_to_psk("654321"),
            Duration::from_secs(1),
        )
        .await
    };
    let (left_result, right_result) = tokio::time::timeout(Duration::from_secs(2), async {
        tokio::join!(initiator, responder)
    })
    .await
    .unwrap();
    assert!(error(right_result).starts_with("xxpsk0 msg1 read:"));
    assert!(error(left_result).contains("transport closed"));
}

#[tokio::test]
async fn malformed_and_unauthenticated_hello_are_rejected() {
    let (mut left, mut initiator, mut right, mut responder) = connected().await;
    right
        .send(&responder.encrypt(b"{not-json").unwrap())
        .await
        .unwrap();
    assert!(error(recv_pairing_hello(&mut left, &mut initiator).await)
        .starts_with("decode pairing hello:"));
    right
        .send(b"not an authenticated Noise record")
        .await
        .unwrap();
    assert!(error(recv_pairing_hello(&mut left, &mut initiator).await)
        .starts_with("decrypt pairing hello:"));
}

#[tokio::test]
async fn first_message_timeout_and_closed_transport_fail_at_the_receive_boundary() {
    let (mut left, mut right) = Channel::pair();
    let key = keys();
    let psk = pin_to_psk("123456");
    assert_eq!(
        error(xxpsk0_responder(&mut right, &key.private, &psk, Duration::ZERO).await),
        "xxpsk0 msg1 recv: timeout after 0s"
    );
    left.close().await.unwrap();
    assert_eq!(
        error(xxpsk0_responder(&mut right, &key.private, &psk, Duration::from_secs(1)).await),
        "xxpsk0 msg1 recv: transport closed"
    );
}

#[tokio::test]
async fn invalid_handshake_and_cancelled_wait_do_not_establish_a_channel() {
    let (mut left, mut right) = Channel::pair();
    let key = keys();
    let psk = pin_to_psk("123456");
    left.send(b"invalid msg1").await.unwrap();
    assert!(
        error(xxpsk0_responder(&mut right, &key.private, &psk, Duration::from_secs(1)).await)
            .starts_with("xxpsk0 msg1 read:")
    );
    let waiting = tokio::spawn(async move {
        xxpsk0_responder(&mut right, &key.private, &psk, Duration::from_secs(30)).await
    });
    waiting.abort();
    assert!(matches!(waiting.await, Err(join_error) if join_error.is_cancelled()));
    assert!(matches!(left.recv().await, Err(TransportError::Closed)));
}
