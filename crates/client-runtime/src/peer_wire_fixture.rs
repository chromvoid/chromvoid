use async_trait::async_trait;
use chromvoid_network_runtime::pairing_transport::{
    pin_to_psk, xxpsk0_initiator, xxpsk0_responder,
};
use chromvoid_protocol::{
    NOISE_PARAMS_XXPSK0, NoiseTransport, RemoteTransport, TransportError, TransportType,
};
use std::time::Duration;
pub(crate) struct Channel {
    tx: tokio::sync::mpsc::Sender<Vec<u8>>,
    pub(super) rx: tokio::sync::mpsc::Receiver<Vec<u8>>,
}
#[async_trait]
impl RemoteTransport for Channel {
    async fn send(&mut self, data: &[u8]) -> Result<(), TransportError> {
        self.tx
            .send(data.to_vec())
            .await
            .map_err(|_| TransportError::Closed)
    }
    async fn recv(&mut self) -> Result<Vec<u8>, TransportError> {
        self.rx.recv().await.ok_or(TransportError::Closed)
    }
    async fn close(&mut self) -> Result<(), TransportError> {
        self.rx.close();
        Ok(())
    }
    fn transport_type(&self) -> TransportType {
        TransportType::WssRelay
    }
}
pub(crate) async fn connection() -> (Channel, NoiseTransport, Channel, NoiseTransport) {
    let (left_tx, left_rx) = tokio::sync::mpsc::channel(4);
    let (right_tx, right_rx) = tokio::sync::mpsc::channel(4);
    let mut host = Channel {
        tx: left_tx,
        rx: right_rx,
    };
    let mut client = Channel {
        tx: right_tx,
        rx: left_rx,
    };
    let builder = snow::Builder::new(NOISE_PARAMS_XXPSK0.parse().unwrap());
    let host_key = builder.generate_keypair().unwrap();
    let client_key = builder.generate_keypair().unwrap();
    let psk = pin_to_psk("123456");
    let (host_noise, client_noise) = tokio::join!(
        xxpsk0_responder(&mut host, &host_key.private, &psk, Duration::from_secs(1)),
        xxpsk0_initiator(&mut client, &client_key.private, &psk),
    );
    (host, host_noise.unwrap(), client, client_noise.unwrap())
}
