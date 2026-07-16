use async_trait::async_trait;
use chromvoid_protocol::{RemoteTransport, TransportError, TransportType, MAX_HANDSHAKE_MSG};
use tokio::io::{AsyncRead, AsyncReadExt, AsyncWrite, AsyncWriteExt};

use super::observability::TransportSessionContext;
use super::types::MobileUsbBridgeKind;

pub const MAX_USB_REMOTE_RECORD_BYTES: usize = MAX_HANDSHAKE_MSG;

pub trait MobileUsbByteStream: AsyncRead + AsyncWrite + Unpin + Send {}

impl<T> MobileUsbByteStream for T where T: AsyncRead + AsyncWrite + Unpin + Send {}

pub struct MobileUsbRemoteTransport<S> {
    stream: S,
    bridge_kind: MobileUsbBridgeKind,
    max_record_bytes: usize,
    context: TransportSessionContext,
    last_valid_record: Option<LastValidRecord>,
    closed: bool,
    /// Partial `recv()` progress persisted across polls so that cancelling a
    /// `recv()` future mid-record (e.g. losing a `tokio::select!` race) never
    /// desyncs the record layer. See `RecvState`.
    recv_state: RecvState,
}

/// Cancel-safety state for `recv()`. `recv()` is raced inside `tokio::select!`
/// on both the desktop io loop and the phone host rpc loop, so any bytes
/// consumed from the stream must be tracked here rather than in the future.
enum RecvState {
    /// Reading the 4-byte big-endian length prefix.
    Len { buf: [u8; 4], filled: usize },
    /// Reading the record payload after a validated length prefix.
    Payload { buf: Vec<u8>, filled: usize },
}

impl RecvState {
    fn new_len() -> Self {
        Self::Len {
            buf: [0_u8; 4],
            filled: 0,
        }
    }
}

#[derive(Clone, Copy)]
struct LastValidRecord {
    direction: &'static str,
    size: usize,
}

impl<S> MobileUsbRemoteTransport<S>
where
    S: MobileUsbByteStream,
{
    pub fn new(stream: S, bridge_kind: MobileUsbBridgeKind) -> Self {
        let context = TransportSessionContext::new()
            .with_bridge_kind(bridge_kind)
            .with_transport_type(TransportType::UsbMobile);
        Self {
            stream,
            bridge_kind,
            max_record_bytes: MAX_USB_REMOTE_RECORD_BYTES,
            context,
            last_valid_record: None,
            closed: false,
            recv_state: RecvState::new_len(),
        }
    }

    pub(crate) fn with_context(
        stream: S,
        bridge_kind: MobileUsbBridgeKind,
        context: TransportSessionContext,
    ) -> Self {
        let context = context
            .with_bridge_kind(bridge_kind)
            .with_transport_type(TransportType::UsbMobile);
        Self {
            stream,
            bridge_kind,
            max_record_bytes: MAX_USB_REMOTE_RECORD_BYTES,
            context,
            last_valid_record: None,
            closed: false,
            recv_state: RecvState::new_len(),
        }
    }

    pub fn with_max_record_bytes(
        stream: S,
        bridge_kind: MobileUsbBridgeKind,
        max_record_bytes: usize,
    ) -> Self {
        let context = TransportSessionContext::new()
            .with_bridge_kind(bridge_kind)
            .with_transport_type(TransportType::UsbMobile);
        Self {
            stream,
            bridge_kind,
            max_record_bytes,
            context,
            last_valid_record: None,
            closed: false,
            recv_state: RecvState::new_len(),
        }
    }

    pub fn bridge_kind(&self) -> MobileUsbBridgeKind {
        self.bridge_kind
    }

    fn validate_len(
        &mut self,
        len: usize,
        direction: &'static str,
        length_prefix: Option<[u8; 4]>,
    ) -> Result<(), TransportError> {
        if len == 0 || len > self.max_record_bytes {
            self.closed = true;
            return Err(self.invalid_record_length_error(len, direction, length_prefix));
        }
        Ok(())
    }

    fn invalid_record_length_error(
        &self,
        len: usize,
        direction: &'static str,
        length_prefix: Option<[u8; 4]>,
    ) -> TransportError {
        let prefix = length_prefix
            .map(hex_prefix)
            .unwrap_or_else(|| "none".to_string());
        let (last_valid_direction, last_valid_size) = self
            .last_valid_record
            .map(|record| (record.direction, record.size.to_string()))
            .unwrap_or(("none", "none".to_string()));
        let context = self.context.snapshot();
        TransportError::RecordLayerInvalidLength(format!(
            "mobile_usb record layer rejected payload length {len} direction={direction} {} max_record_bytes={} length_prefix_hex={} last_valid_direction={} last_valid_size={}",
            context.diagnostic_fields_label(),
            self.max_record_bytes,
            prefix,
            last_valid_direction,
            last_valid_size,
        ))
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
        if let Err(error) = self.validate_len(data.len(), "send", None) {
            let _ = self.stream.shutdown().await;
            return Err(error);
        }
        let len = u32::try_from(data.len())
            .map_err(|_| TransportError::Io("mobile_usb record length overflow".to_string()))?;
        let mut record = Vec::with_capacity(4 + data.len());
        record.extend_from_slice(&len.to_be_bytes());
        record.extend_from_slice(data);
        self.stream
            .write_all(&record)
            .await
            .map_err(map_write_error)?;
        self.stream.flush().await.map_err(map_write_error)?;
        self.last_valid_record = Some(LastValidRecord {
            direction: "send",
            size: data.len(),
        });
        Ok(())
    }

    // Cancel-safe: every await below is a single `read()` whose progress is
    // committed to `self.recv_state` before the next await, so dropping this
    // future mid-record and calling `recv()` again resumes the same record.
    async fn recv(&mut self) -> Result<Vec<u8>, TransportError> {
        if self.closed {
            return Err(TransportError::Closed);
        }

        if let RecvState::Len { buf, filled } = &mut self.recv_state {
            while *filled < buf.len() {
                let read_into = *filled;
                let n = self
                    .stream
                    .read(&mut buf[read_into..])
                    .await
                    .map_err(map_read_error)?;
                if n == 0 {
                    return Err(TransportError::Closed);
                }
                *filled += n;
            }
            let len_buf = *buf;
            let len = u32::from_be_bytes(len_buf) as usize;
            if let Err(error) = self.validate_len(len, "recv", Some(len_buf)) {
                let _ = self.stream.shutdown().await;
                return Err(error);
            }
            self.recv_state = RecvState::Payload {
                buf: vec![0_u8; len],
                filled: 0,
            };
        }

        let RecvState::Payload { buf, filled } = &mut self.recv_state else {
            unreachable!("recv length prefix state completes before payload state");
        };
        while *filled < buf.len() {
            let read_into = *filled;
            let n = self
                .stream
                .read(&mut buf[read_into..])
                .await
                .map_err(map_read_error)?;
            if n == 0 {
                return Err(TransportError::Closed);
            }
            *filled += n;
        }
        let payload = std::mem::take(buf);
        self.recv_state = RecvState::new_len();
        self.last_valid_record = Some(LastValidRecord {
            direction: "recv",
            size: payload.len(),
        });
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

fn hex_prefix(bytes: [u8; 4]) -> String {
    bytes
        .iter()
        .map(|byte| format!("{byte:02x}"))
        .collect::<Vec<_>>()
        .join("")
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
