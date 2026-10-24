use chromvoid_protocol::TransportError;
use std::fmt;

#[derive(Debug, Clone, PartialEq, Eq)]
pub enum RemoteIoFailure {
    TransportClosed,
    TransportTimeout,
    StreamTimeout {
        command: Option<String>,
        message_id: Option<u64>,
        timeout_ms: Option<u64>,
    },
    StreamReadFailed {
        command: Option<String>,
        message_id: Option<u64>,
        error: String,
    },
    RecordLayerInvalidLength {
        message: String,
    },
    DecryptFailure {
        message: String,
    },
    ProtocolError {
        message: String,
    },
    DataPlaneError {
        message: String,
    },
}

pub type RemoteIoResult<T> = Result<T, RemoteIoFailure>;

impl RemoteIoFailure {
    pub fn transport_closed() -> Self {
        Self::TransportClosed
    }

    pub fn transport_timeout() -> Self {
        Self::TransportTimeout
    }

    pub fn stream_timeout(command: impl Into<String>, message_id: u64, timeout_ms: u64) -> Self {
        Self::StreamTimeout {
            command: Some(command.into()),
            message_id: Some(message_id),
            timeout_ms: Some(timeout_ms),
        }
    }

    pub fn stream_read_failed(
        command: impl Into<String>,
        message_id: u64,
        error: impl Into<String>,
    ) -> Self {
        Self::StreamReadFailed {
            command: Some(command.into()),
            message_id: Some(message_id),
            error: error.into(),
        }
    }

    pub fn record_layer_invalid_length(message: impl Into<String>) -> Self {
        Self::RecordLayerInvalidLength {
            message: message.into(),
        }
    }

    pub fn decrypt_failure(message: impl Into<String>) -> Self {
        Self::DecryptFailure {
            message: message.into(),
        }
    }

    pub fn protocol_error(message: impl Into<String>) -> Self {
        Self::ProtocolError {
            message: message.into(),
        }
    }

    pub fn data_plane_error(message: impl Into<String>) -> Self {
        Self::DataPlaneError {
            message: message.into(),
        }
    }

    pub fn from_transport_error(operation: &'static str, error: TransportError) -> Self {
        match error {
            TransportError::Closed => Self::transport_closed(),
            TransportError::Timeout => Self::transport_timeout(),
            TransportError::RecordLayerInvalidLength(message) => Self::record_layer_invalid_length(
                format!("{operation}: record layer invalid length: {message}"),
            ),
            TransportError::Io(message) => {
                let message = format!("{operation}: transport I/O error: {message}");
                Self::data_plane_error(message)
            }
        }
    }

    pub fn is_transport_closed(&self) -> bool {
        matches!(self, Self::TransportClosed)
    }

    pub fn is_timeout(&self) -> bool {
        matches!(self, Self::TransportTimeout | Self::StreamTimeout { .. })
    }

    pub fn is_stream_timeout(&self) -> bool {
        matches!(self, Self::StreamTimeout { .. })
    }
}

impl fmt::Display for RemoteIoFailure {
    fn fmt(&self, f: &mut fmt::Formatter<'_>) -> fmt::Result {
        match self {
            Self::TransportClosed => write!(f, "transport closed"),
            Self::TransportTimeout => write!(f, "transport timeout"),
            Self::StreamTimeout {
                command,
                message_id,
                timeout_ms,
            } => write!(
                f,
                "stream_read_timeout command={} message_id={} timeout_ms={}",
                command.as_deref().unwrap_or("unknown"),
                message_id
                    .map(|value| value.to_string())
                    .unwrap_or_else(|| "unknown".to_string()),
                timeout_ms
                    .map(|value| value.to_string())
                    .unwrap_or_else(|| "unknown".to_string())
            ),
            Self::StreamReadFailed {
                command,
                message_id,
                error,
            } => write!(
                f,
                "stream_read_failed command={} message_id={} error={}",
                command.as_deref().unwrap_or("unknown"),
                message_id
                    .map(|value| value.to_string())
                    .unwrap_or_else(|| "unknown".to_string()),
                error
            ),
            Self::RecordLayerInvalidLength { message }
            | Self::DecryptFailure { message }
            | Self::ProtocolError { message }
            | Self::DataPlaneError { message } => write!(f, "{message}"),
        }
    }
}

#[cfg(test)]
mod failure_tests {
    use super::*;

    #[test]
    fn helper_constructors_preserve_display_contract() {
        assert_eq!(
            RemoteIoFailure::stream_timeout("catalog:downloadRange", 42, 250).to_string(),
            "stream_read_timeout command=catalog:downloadRange message_id=42 timeout_ms=250"
        );
        assert_eq!(
            RemoteIoFailure::stream_read_failed("catalog:downloadRange", 9, "disk read failed")
                .to_string(),
            "stream_read_failed command=catalog:downloadRange message_id=9 error=disk read failed"
        );
        assert_eq!(
            RemoteIoFailure::protocol_error("peer sent error frame message_id=7").to_string(),
            "peer sent error frame message_id=7"
        );
    }

    #[test]
    fn transport_error_mapping_is_typed_without_removed_string_parsing() {
        assert_eq!(
            RemoteIoFailure::from_transport_error("recv", TransportError::Closed),
            RemoteIoFailure::TransportClosed
        );
        assert_eq!(
            RemoteIoFailure::from_transport_error("recv", TransportError::Timeout),
            RemoteIoFailure::TransportTimeout
        );
        assert_eq!(
            RemoteIoFailure::from_transport_error(
                "recv",
                TransportError::RecordLayerInvalidLength(
                    "mobile_usb record layer rejected payload length 417856864".to_string(),
                ),
            ),
            RemoteIoFailure::RecordLayerInvalidLength {
                message:
                    "recv: record layer invalid length: mobile_usb record layer rejected payload length 417856864"
                        .to_string(),
            }
        );
    }
}
