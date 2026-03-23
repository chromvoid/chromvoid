mod probe;
mod relay;

#[cfg(test)]
mod tests;

use async_trait::async_trait;
use chromvoid_protocol::{RemoteTransport, TransportError, TransportType};
use quinn::{ClientConfig, Connection, Endpoint, RecvStream, SendStream};
use std::net::Ipv6Addr;
use std::time::Duration;
use tokio::io::AsyncWriteExt;
use tokio::time::timeout;
use tracing::info;

use probe::{probe_udp, resolve_remote_addr};
use relay::{build_extended_connect_headers, ParsedRelay};

const QUIC_CONNECT_TIMEOUT: Duration = Duration::from_millis(1200);
const STATUS_PROBE_TIMEOUT: Duration = Duration::from_millis(350);
const UDP_BLOCKED_MARKER: &str = "udp_unavailable:";

pub fn is_udp_unavailable_error(error: &str) -> bool {
    error.starts_with(UDP_BLOCKED_MARKER)
}

pub struct QuicMasqueTransport {
    endpoint: Endpoint,
    connection: Connection,
    send: SendStream,
    recv: RecvStream,
}

impl QuicMasqueTransport {
    pub async fn connect(relay_url: &str, room_id: &str) -> Result<Self, String> {
        let relay = ParsedRelay::parse(relay_url)?;
        let remote_addr = resolve_remote_addr(&relay).await?;

        probe_udp(remote_addr).await.map_err(|e| {
            format!(
                "{}udp path check failed for {}: {}",
                UDP_BLOCKED_MARKER, remote_addr, e
            )
        })?;

        let mut endpoint =
            Endpoint::client((Ipv6Addr::UNSPECIFIED, 0).into()).map_err(|e| e.to_string())?;
        let client_config =
            ClientConfig::try_with_platform_verifier().map_err(|e| e.to_string())?;
        endpoint.set_default_client_config(client_config);

        let connecting = endpoint
            .connect(remote_addr, &relay.server_name)
            .map_err(|e| format!("QUIC connect setup: {}", e))?;

        let connection = timeout(QUIC_CONNECT_TIMEOUT, connecting)
            .await
            .map_err(|_| format!("{}quic connect timeout", UDP_BLOCKED_MARKER))?
            .map_err(|e| format!("{}quic connect failed: {}", UDP_BLOCKED_MARKER, e))?;

        let (mut send, mut recv) = timeout(QUIC_CONNECT_TIMEOUT, connection.open_bi())
            .await
            .map_err(|_| "QUIC open stream timeout".to_string())?
            .map_err(|e| format!("QUIC open stream: {}", e))?;

        let masque_request = build_extended_connect_headers(&relay, room_id);
        send.write_all(masque_request.as_bytes())
            .await
            .map_err(|e| format!("QUIC MASQUE preface write: {}", e))?;
        send.flush()
            .await
            .map_err(|e| format!("QUIC MASQUE preface flush: {}", e))?;

        let mut status = [0u8; 3];
        if let Ok(Ok(_)) = timeout(STATUS_PROBE_TIMEOUT, recv.read_exact(&mut status)).await {
            if status[0] != b'2' {
                return Err(format!(
                    "QUIC MASQUE connect rejected with status {}{}{}",
                    status[0] as char, status[1] as char, status[2] as char
                ));
            }
        }

        info!("QUIC MASQUE transport connected via {}", relay.server_name);

        Ok(Self {
            endpoint,
            connection,
            send,
            recv,
        })
    }
}

#[async_trait]
impl RemoteTransport for QuicMasqueTransport {
    async fn send(&mut self, data: &[u8]) -> Result<(), TransportError> {
        let len = (data.len() as u32).to_be_bytes();
        self.send
            .write_all(&len)
            .await
            .map_err(|e| TransportError::Io(format!("quic send length: {}", e)))?;
        self.send
            .write_all(data)
            .await
            .map_err(|e| TransportError::Io(format!("quic send payload: {}", e)))?;
        self.send
            .flush()
            .await
            .map_err(|e| TransportError::Io(format!("quic send flush: {}", e)))?;
        Ok(())
    }

    async fn recv(&mut self) -> Result<Vec<u8>, TransportError> {
        let mut len = [0u8; 4];
        self.recv
            .read_exact(&mut len)
            .await
            .map_err(|_| TransportError::Closed)?;
        let payload_len = u32::from_be_bytes(len) as usize;
        let mut payload = vec![0u8; payload_len];
        self.recv
            .read_exact(&mut payload)
            .await
            .map_err(|e| TransportError::Io(format!("quic recv payload: {}", e)))?;
        Ok(payload)
    }

    async fn close(&mut self) -> Result<(), TransportError> {
        let _ = self.send.finish();
        self.connection.close(0u32.into(), b"close");
        self.endpoint.wait_idle().await;
        Ok(())
    }

    fn transport_type(&self) -> TransportType {
        TransportType::QuicMasque
    }
}
