use std::io;
use tokio::io::{AsyncRead, AsyncReadExt, AsyncWrite, AsyncWriteExt};
use tokio::time::{timeout, Duration};

/// Default baud rate for Orange Pi USB serial communication.
pub const DEFAULT_BAUD_RATE: u32 = 115200;

/// Maximum frame size: 16 MB payload + 14 byte header (SPEC-002).
const MAX_FRAME_SIZE: usize = 16 * 1024 * 1024 + 14;

/// Timeout for individual read/write operations.
const IO_TIMEOUT: Duration = Duration::from_secs(10);

/// USB Serial transport errors.
#[derive(Debug)]
pub enum TransportError {
    Io(io::Error),
    Timeout,
    FrameTooLarge(usize),
    ConnectionClosed,
    SerialPort(String),
}

impl std::fmt::Display for TransportError {
    fn fmt(&self, f: &mut std::fmt::Formatter<'_>) -> std::fmt::Result {
        match self {
            Self::Io(e) => write!(f, "IO error: {}", e),
            Self::Timeout => write!(f, "operation timed out"),
            Self::FrameTooLarge(size) => write!(f, "frame too large: {} bytes", size),
            Self::ConnectionClosed => write!(f, "connection closed"),
            Self::SerialPort(e) => write!(f, "serial port error: {}", e),
        }
    }
}

impl From<io::Error> for TransportError {
    fn from(e: io::Error) -> Self {
        Self::Io(e)
    }
}

/// Write a length-prefixed frame to the async writer.
/// Wire format: [4-byte big-endian length][payload]
pub async fn write_frame<W: AsyncWrite + Unpin>(
    writer: &mut W,
    data: &[u8],
) -> Result<(), TransportError> {
    let len = data.len();
    if len > MAX_FRAME_SIZE {
        return Err(TransportError::FrameTooLarge(len));
    }
    let len_bytes = (len as u32).to_be_bytes();

    let fut = async {
        writer.write_all(&len_bytes).await?;
        writer.write_all(data).await?;
        writer.flush().await?;
        Ok::<(), io::Error>(())
    };

    timeout(IO_TIMEOUT, fut)
        .await
        .map_err(|_| TransportError::Timeout)?
        .map_err(TransportError::Io)
}

/// Read a length-prefixed frame from the async reader.
/// Wire format: [4-byte big-endian length][payload]
pub async fn read_frame<R: AsyncRead + Unpin>(reader: &mut R) -> Result<Vec<u8>, TransportError> {
    let fut = async {
        let mut len_buf = [0u8; 4];
        reader.read_exact(&mut len_buf).await?;
        let len = u32::from_be_bytes(len_buf) as usize;
        if len > MAX_FRAME_SIZE {
            return Err(io::Error::new(
                io::ErrorKind::InvalidData,
                format!("frame too large: {}", len),
            ));
        }
        let mut buf = vec![0u8; len];
        reader.read_exact(&mut buf).await?;
        Ok(buf)
    };

    timeout(IO_TIMEOUT, fut)
        .await
        .map_err(|_| TransportError::Timeout)?
        .map_err(TransportError::Io)
}

/// Open a USB serial port with the specified path and baud rate.
/// Returns a tokio-compatible async serial stream.
pub fn open_serial_port(
    port_path: &str,
    baud_rate: u32,
) -> Result<tokio_serial::SerialStream, TransportError> {
    let builder = tokio_serial::new(port_path, baud_rate).timeout(Duration::from_secs(5));

    tokio_serial::SerialStream::open(&builder)
        .map_err(|e| TransportError::SerialPort(e.to_string()))
}

#[cfg(test)]
mod tests {
    use super::*;
    use tokio::io::duplex;

    #[tokio::test]
    async fn frame_write_read_roundtrip() {
        let (mut client, mut server) = duplex(4096);
        let data = b"hello world";
        write_frame(&mut client, data).await.unwrap();
        let received = read_frame(&mut server).await.unwrap();
        assert_eq!(received, data);
    }

    #[tokio::test]
    async fn frame_write_read_empty() {
        let (mut client, mut server) = duplex(4096);
        write_frame(&mut client, b"").await.unwrap();
        let received = read_frame(&mut server).await.unwrap();
        assert!(received.is_empty());
    }

    #[tokio::test]
    async fn frame_write_read_large() {
        let (mut client, mut server) = duplex(1024 * 1024);
        let data = vec![0xABu8; 64 * 1024]; // 64KB
        write_frame(&mut client, &data).await.unwrap();
        let received = read_frame(&mut server).await.unwrap();
        assert_eq!(received.len(), 64 * 1024);
    }

    #[tokio::test]
    async fn frame_too_large_rejected() {
        let data = vec![0u8; MAX_FRAME_SIZE + 1];
        let (mut client, _server) = duplex(4096);
        let result = write_frame(&mut client, &data).await;
        assert!(matches!(result, Err(TransportError::FrameTooLarge(_))));
    }
}
