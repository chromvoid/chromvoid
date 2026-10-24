use async_trait::async_trait;
use chromvoid_protocol::{RemoteTransport, TransportError, TransportType, MAX_HANDSHAKE_MSG};
use tokio::io::{AsyncRead, AsyncReadExt, AsyncWrite, AsyncWriteExt};

/// The largest record either end accepts: one Noise message.
pub const MAX_USB_RECORD_BYTES: usize = MAX_HANDSHAKE_MSG;

/// Records over a byte stream: a 4-byte big-endian length, then that many bytes. An empty or
/// oversized record is a broken link, never skipped.
pub struct UsbRecordTransport<S> {
    stream: S,
    closed: bool,
    // Kept across calls: `recv` races other work in `select!`, and a dropped future must leave
    // the half-read record here rather than lose its bytes.
    receiving: Receiving,
}

enum Receiving {
    Length { bytes: [u8; 4], filled: usize },
    Payload { bytes: Vec<u8>, filled: usize },
}

impl Receiving {
    fn length() -> Self {
        Self::Length {
            bytes: [0; 4],
            filled: 0,
        }
    }
}

impl<S> UsbRecordTransport<S>
where
    S: AsyncRead + AsyncWrite + Unpin + Send,
{
    pub fn new(stream: S) -> Self {
        Self {
            stream,
            closed: false,
            receiving: Receiving::length(),
        }
    }

    fn check_len(&mut self, len: usize, direction: &str) -> Result<(), TransportError> {
        if len == 0 || len > MAX_USB_RECORD_BYTES {
            self.closed = true;
            return Err(TransportError::RecordLayerInvalidLength(format!(
                "usb record {direction} length {len}, at most {MAX_USB_RECORD_BYTES}"
            )));
        }
        Ok(())
    }
}

#[async_trait]
impl<S> RemoteTransport for UsbRecordTransport<S>
where
    S: AsyncRead + AsyncWrite + Unpin + Send,
{
    async fn send(&mut self, data: &[u8]) -> Result<(), TransportError> {
        if self.closed {
            return Err(TransportError::Closed);
        }
        if let Err(error) = self.check_len(data.len(), "send") {
            let _ = self.stream.shutdown().await;
            return Err(error);
        }
        let mut record = Vec::with_capacity(4 + data.len());
        record.extend_from_slice(&(data.len() as u32).to_be_bytes());
        record.extend_from_slice(data);
        self.stream.write_all(&record).await.map_err(write_error)?;
        self.stream.flush().await.map_err(write_error)
    }

    // Cancel-safe: each await is one read whose progress is stored before the next.
    async fn recv(&mut self) -> Result<Vec<u8>, TransportError> {
        if self.closed {
            return Err(TransportError::Closed);
        }
        if let Receiving::Length { bytes, filled } = &mut self.receiving {
            while *filled < bytes.len() {
                let start = *filled;
                let read = self
                    .stream
                    .read(&mut bytes[start..])
                    .await
                    .map_err(read_error)?;
                if read == 0 {
                    return Err(TransportError::Closed);
                }
                *filled += read;
            }
            let len = u32::from_be_bytes(*bytes) as usize;
            if let Err(error) = self.check_len(len, "recv") {
                let _ = self.stream.shutdown().await;
                return Err(error);
            }
            self.receiving = Receiving::Payload {
                bytes: vec![0; len],
                filled: 0,
            };
        }
        let Receiving::Payload { bytes, filled } = &mut self.receiving else {
            unreachable!("a length is read before its payload");
        };
        while *filled < bytes.len() {
            let start = *filled;
            let read = self
                .stream
                .read(&mut bytes[start..])
                .await
                .map_err(read_error)?;
            if read == 0 {
                return Err(TransportError::Closed);
            }
            *filled += read;
        }
        let payload = std::mem::take(bytes);
        self.receiving = Receiving::length();
        Ok(payload)
    }

    async fn close(&mut self) -> Result<(), TransportError> {
        self.closed = true;
        self.stream.shutdown().await.map_err(write_error)
    }

    fn transport_type(&self) -> TransportType {
        TransportType::UsbMobile
    }
}

fn read_error(error: std::io::Error) -> TransportError {
    match error.kind() {
        std::io::ErrorKind::UnexpectedEof
        | std::io::ErrorKind::BrokenPipe
        | std::io::ErrorKind::ConnectionReset => TransportError::Closed,
        _ => TransportError::Io(format!("usb record read failed: {error}")),
    }
}

fn write_error(error: std::io::Error) -> TransportError {
    match error.kind() {
        std::io::ErrorKind::BrokenPipe
        | std::io::ErrorKind::ConnectionReset
        | std::io::ErrorKind::UnexpectedEof => TransportError::Closed,
        _ => TransportError::Io(format!("usb record write failed: {error}")),
    }
}
