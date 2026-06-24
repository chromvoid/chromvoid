use async_trait::async_trait;
use chromvoid_protocol::{
    RemoteTransport, TransportError, TransportType, HEADER_SIZE, MAX_HANDSHAKE_MSG,
    MAX_PAYLOAD_SIZE,
};
use tokio::io::{AsyncRead, AsyncReadExt, AsyncWrite, AsyncWriteExt};

use super::types::MobileUsbBridgeKind;

const AEAD_TAG_BYTES: usize = 16;

pub const MAX_USB_REMOTE_RECORD_BYTES: usize =
    match MAX_HANDSHAKE_MSG > HEADER_SIZE + MAX_PAYLOAD_SIZE + AEAD_TAG_BYTES {
        true => MAX_HANDSHAKE_MSG,
        false => HEADER_SIZE + MAX_PAYLOAD_SIZE + AEAD_TAG_BYTES,
    };

pub trait MobileUsbByteStream: AsyncRead + AsyncWrite + Unpin + Send {}

impl<T> MobileUsbByteStream for T where T: AsyncRead + AsyncWrite + Unpin + Send {}

pub struct MobileUsbRemoteTransport<S> {
    stream: S,
    bridge_kind: MobileUsbBridgeKind,
    max_record_bytes: usize,
    closed: bool,
}

impl<S> MobileUsbRemoteTransport<S>
where
    S: MobileUsbByteStream,
{
    pub fn new(stream: S, bridge_kind: MobileUsbBridgeKind) -> Self {
        Self {
            stream,
            bridge_kind,
            max_record_bytes: MAX_USB_REMOTE_RECORD_BYTES,
            closed: false,
        }
    }

    pub fn with_max_record_bytes(
        stream: S,
        bridge_kind: MobileUsbBridgeKind,
        max_record_bytes: usize,
    ) -> Self {
        Self {
            stream,
            bridge_kind,
            max_record_bytes,
            closed: false,
        }
    }

    pub fn bridge_kind(&self) -> MobileUsbBridgeKind {
        self.bridge_kind
    }

    fn validate_len(&self, len: usize) -> Result<(), TransportError> {
        if len == 0 || len > self.max_record_bytes {
            return Err(TransportError::Io(format!(
                "mobile_usb record layer rejected payload length {len}"
            )));
        }
        Ok(())
    }
}

#[async_trait]
impl<S> RemoteTransport for MobileUsbRemoteTransport<S>
where
    S: MobileUsbByteStream,
{
    async fn send(&mut self, data: &[u8]) -> Result<(), TransportError> {
        if self.closed {
            return Err(TransportError::Closed);
        }
        self.validate_len(data.len())?;
        let len = u32::try_from(data.len())
            .map_err(|_| TransportError::Io("mobile_usb record length overflow".to_string()))?;
        self.stream
            .write_all(&len.to_be_bytes())
            .await
            .map_err(map_write_error)?;
        self.stream.write_all(data).await.map_err(map_write_error)?;
        self.stream.flush().await.map_err(map_write_error)
    }

    async fn recv(&mut self) -> Result<Vec<u8>, TransportError> {
        if self.closed {
            return Err(TransportError::Closed);
        }

        let mut len_buf = [0_u8; 4];
        self.stream
            .read_exact(&mut len_buf)
            .await
            .map_err(map_read_error)?;
        let len = u32::from_be_bytes(len_buf) as usize;
        self.validate_len(len)?;

        let mut payload = vec![0_u8; len];
        self.stream
            .read_exact(&mut payload)
            .await
            .map_err(map_read_error)?;
        Ok(payload)
    }

    async fn close(&mut self) -> Result<(), TransportError> {
        self.closed = true;
        self.stream.shutdown().await.map_err(map_write_error)
    }

    fn transport_type(&self) -> TransportType {
        TransportType::UsbMobile
    }
}

fn map_read_error(error: std::io::Error) -> TransportError {
    match error.kind() {
        std::io::ErrorKind::UnexpectedEof
        | std::io::ErrorKind::BrokenPipe
        | std::io::ErrorKind::ConnectionReset => TransportError::Closed,
        _ => TransportError::Io(format!("mobile_usb record read failed: {error}")),
    }
}

fn map_write_error(error: std::io::Error) -> TransportError {
    match error.kind() {
        std::io::ErrorKind::BrokenPipe
        | std::io::ErrorKind::ConnectionReset
        | std::io::ErrorKind::UnexpectedEof => TransportError::Closed,
        _ => TransportError::Io(format!("mobile_usb record write failed: {error}")),
    }
}
