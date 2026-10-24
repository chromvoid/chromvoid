use serde::Serialize;
use serde_json::Value;
use std::io::Read;
use std::time::{Duration, Instant};

use chromvoid_core::rpc::types::{RpcResponse, PROTOCOL_VERSION};
use chromvoid_protocol::{
    error_codes, frame_from_error, Frame, FrameType, TransportType, MAX_FRAME_PAYLOAD_SIZE,
    MAX_PAYLOAD_SIZE,
};

pub const MAX_FULL_UPLOAD_STREAM_BYTES: usize = MAX_PAYLOAD_SIZE;
pub const NOISE_STREAM_CHUNK_SIZE: usize = MAX_FRAME_PAYLOAD_SIZE;
pub const DEFAULT_STREAM_CHUNK_SIZE: usize = NOISE_STREAM_CHUNK_SIZE;
pub const USB_MOBILE_STREAM_CHUNK_SIZE: usize = NOISE_STREAM_CHUNK_SIZE;
pub const DEFAULT_STREAM_CHUNK_READ_TIMEOUT: Duration = Duration::from_secs(15);
pub const USB_MOBILE_STREAM_CHUNK_READ_TIMEOUT: Duration = Duration::from_secs(5);
pub const DEFAULT_TRANSIENT_EIO_DIAGNOSTIC_INTERVAL: Duration = Duration::from_secs(5);
pub const USB_TRANSIENT_EIO_DIAGNOSTIC_INTERVAL: Duration = Duration::from_secs(1);
const STREAM_READ_FAILED_MESSAGE: &str = "remote stream read failed";
const STREAM_CANCELLED_MESSAGE: &str = "remote stream cancelled";

#[derive(Clone, Copy, Debug, PartialEq, Eq)]
pub enum StreamControlUnsupportedAction {
    LocalCleanup,
    ControlledDisconnect,
}

#[derive(Clone, Copy, Debug, PartialEq, Eq)]
pub struct TransportPolicy {
    pub transport_type: TransportType,
    pub stream_chunk_size: usize,
    pub stream_read_timeout: Duration,
    pub heartbeat_enabled: bool,
    pub stream_control_unsupported_action: StreamControlUnsupportedAction,
    pub transient_eio_diagnostic_interval: Duration,
}

impl TransportPolicy {
    pub fn for_transport(transport_type: TransportType) -> Self {
        let is_usb = matches!(transport_type, TransportType::UsbMobile);
        Self {
            transport_type,
            stream_chunk_size: if is_usb {
                USB_MOBILE_STREAM_CHUNK_SIZE
            } else {
                DEFAULT_STREAM_CHUNK_SIZE
            },
            stream_read_timeout: if is_usb {
                USB_MOBILE_STREAM_CHUNK_READ_TIMEOUT
            } else {
                DEFAULT_STREAM_CHUNK_READ_TIMEOUT
            },
            heartbeat_enabled: !is_usb,
            stream_control_unsupported_action: StreamControlUnsupportedAction::ControlledDisconnect,
            transient_eio_diagnostic_interval: if is_usb {
                USB_TRANSIENT_EIO_DIAGNOSTIC_INTERVAL
            } else {
                DEFAULT_TRANSIENT_EIO_DIAGNOSTIC_INTERVAL
            },
        }
    }

    pub fn stream_read_policy(self) -> RemoteStreamReadPolicy {
        RemoteStreamReadPolicy {
            timeout: self.stream_read_timeout,
        }
    }
}

#[derive(Clone, Copy, Debug)]
pub struct RemoteStreamReadPolicy {
    pub timeout: Duration,
}

pub struct SupervisedStreamRead {
    pub reader: Box<dyn Read + Send>,
    pub bytes: Vec<u8>,
    pub duration: Duration,
}

#[derive(Debug, PartialEq, Eq)]
pub enum SupervisedStreamReadError {
    Io(String),
    Join(String),
    Timeout { timeout: Duration },
}

impl std::fmt::Display for SupervisedStreamReadError {
    fn fmt(&self, f: &mut std::fmt::Formatter<'_>) -> std::fmt::Result {
        match self {
            Self::Io(error) => write!(f, "{error}"),
            Self::Join(error) => write!(f, "stream read task join: {error}"),
            Self::Timeout { timeout } => {
                write!(f, "stream_read_timeout after {}ms", timeout.as_millis())
            }
        }
    }
}

pub async fn read_stream_chunk_supervised(
    reader: Box<dyn Read + Send>,
    chunk_size: usize,
    policy: RemoteStreamReadPolicy,
) -> Result<SupervisedStreamRead, SupervisedStreamReadError> {
    let started = Instant::now();
    let read_task = tokio::task::spawn_blocking(move || {
        let mut reader = reader;
        let mut buf = vec![0u8; chunk_size];
        let n = reader
            .read(&mut buf)
            .map_err(|error| SupervisedStreamReadError::Io(format!("stream read: {error}")))?;
        buf.truncate(n);
        Ok::<_, SupervisedStreamReadError>((reader, buf))
    });

    let (reader, bytes) = match tokio::time::timeout(policy.timeout, read_task).await {
        Ok(Ok(Ok(result))) => result,
        Ok(Ok(Err(error))) => return Err(error),
        Ok(Err(error)) => return Err(SupervisedStreamReadError::Join(error.to_string())),
        Err(_) => {
            return Err(SupervisedStreamReadError::Timeout {
                timeout: policy.timeout,
            })
        }
    };

    Ok(SupervisedStreamRead {
        reader,
        bytes,
        duration: started.elapsed(),
    })
}

#[derive(Debug, Clone, PartialEq, Eq)]
pub enum RemoteStreamControl {
    ReadFailed { message: String },
    Cancelled { message: String },
}

impl RemoteStreamControl {
    pub fn message(&self) -> &str {
        match self {
            Self::ReadFailed { message } | Self::Cancelled { message } => message,
        }
    }
}

pub fn frame_stream_read_failed(message_id: u64, command: &str, error: &str) -> Frame {
    frame_from_error(
        message_id,
        error_codes::STREAM_READ_FAILED,
        &format!("{STREAM_READ_FAILED_MESSAGE}: command={command}: {error}"),
        PROTOCOL_VERSION,
    )
}

pub fn frame_stream_cancelled(message_id: u64, command: &str) -> Frame {
    frame_from_error(
        message_id,
        error_codes::STREAM_CANCELLED,
        &format!("{STREAM_CANCELLED_MESSAGE}: command={command}"),
        PROTOCOL_VERSION,
    )
}

pub fn parse_stream_control_frame(frame: &Frame) -> Option<RemoteStreamControl> {
    if frame.frame_type != FrameType::Error {
        return None;
    }
    let payload = serde_json::from_slice::<Value>(&frame.payload).ok()?;
    let code = payload.get("error_code").and_then(|value| value.as_u64())?;
    let message = payload
        .get("error_message")
        .and_then(|value| value.as_str())
        .unwrap_or("")
        .to_string();
    match code as u16 {
        error_codes::STREAM_READ_FAILED => Some(RemoteStreamControl::ReadFailed { message }),
        error_codes::STREAM_CANCELLED => Some(RemoteStreamControl::Cancelled { message }),
        _ => None,
    }
}

#[derive(Debug)]
pub struct UploadStreamMetadata {
    /// Absolute end of this RPC payload: request offset + request byte count.
    pub end_offset: u64,
    pub offset: u64,
}

pub fn json_payload_or_empty_object<T: Serialize>(value: &T, context: &str) -> Vec<u8> {
    match serde_json::to_vec(value) {
        Ok(payload) => payload,
        Err(error) => {
            tracing::warn!("{context}: failed to serialize frame payload: {error}");
            b"{}".to_vec()
        }
    }
}

pub fn parse_upload_stream_metadata(data: &Value) -> Result<UploadStreamMetadata, RpcResponse> {
    let Some(size) = data.get("size").and_then(|value| value.as_u64()) else {
        return Err(RpcResponse::error(
            "upload stream request missing numeric size",
            Some("BAD_REQUEST"),
        ));
    };
    let offset = data
        .get("offset")
        .and_then(|value| value.as_u64())
        .unwrap_or(0);
    let end_offset = offset
        .checked_add(size)
        .ok_or_else(|| RpcResponse::error("upload stream range overflows", Some("BAD_REQUEST")))?;

    Ok(UploadStreamMetadata { end_offset, offset })
}

pub fn upload_stream_chunk_data(
    data: &Value,
    offset: u64,
    chunk_size: u64,
    stream_end: u64,
    is_final_chunk: bool,
) -> Result<Value, RpcResponse> {
    let mut chunk_data = data.clone();
    let Some(obj) = chunk_data.as_object_mut() else {
        return Err(RpcResponse::error(
            "upload request data must be an object",
            Some("BAD_REQUEST"),
        ));
    };
    let Some(end_offset) = offset.checked_add(chunk_size) else {
        return Err(RpcResponse::error(
            "upload stream chunk offset overflow",
            Some("BAD_REQUEST"),
        ));
    };
    if end_offset > stream_end {
        return Err(RpcResponse::error(
            "upload stream chunk exceeds declared size",
            Some("BAD_REQUEST"),
        ));
    }

    if is_final_chunk && end_offset != stream_end {
        return Err(RpcResponse::error(
            "upload stream ended before declared size",
            Some("BAD_REQUEST"),
        ));
    }

    obj.insert("offset".to_string(), serde_json::json!(offset));
    obj.insert("size".to_string(), serde_json::json!(chunk_size));
    if obj.get("finish").and_then(|value| value.as_bool()) == Some(true) {
        obj.entry("total_size".to_string())
            .or_insert_with(|| serde_json::json!(stream_end));
        if !is_final_chunk {
            obj.remove("finish");
        }
    }
    Ok(chunk_data)
}

/// Carry Core's reserved node into later continuation frames and retain its final
/// upload metadata. The legacy `uploaded` acknowledgement remains an additive alias.
pub fn apply_upload_stream_response(data: &mut Value, mut response: RpcResponse) -> RpcResponse {
    if let RpcResponse::Success { result, .. } = &mut response {
        let Some(node_id) = result.get("node_id").and_then(Value::as_u64) else {
            return RpcResponse::error(
                "upload response missing node_id",
                Some("STREAM_UNEXPECTED"),
            );
        };
        let Some(uploaded) = result.get("uploaded_bytes").and_then(Value::as_u64) else {
            return RpcResponse::error(
                "upload response missing uploaded_bytes",
                Some("STREAM_UNEXPECTED"),
            );
        };
        let (Some(request), Some(result)) = (data.as_object_mut(), result.as_object_mut()) else {
            return RpcResponse::error("invalid upload metadata", Some("STREAM_UNEXPECTED"));
        };
        request.insert("node_id".to_string(), Value::from(node_id));
        result.insert("uploaded".to_string(), Value::from(uploaded));
    }
    response
}

pub fn append_full_upload_stream_chunk(
    body: &mut Vec<u8>,
    chunk: &[u8],
) -> Result<(), RpcResponse> {
    let Some(next_len) = body.len().checked_add(chunk.len()) else {
        return Err(RpcResponse::error(
            "full upload stream size overflow",
            Some("PAYLOAD_TOO_LARGE"),
        ));
    };
    if next_len > MAX_FULL_UPLOAD_STREAM_BYTES {
        return Err(RpcResponse::error(
            "full upload stream exceeds maximum size",
            Some("PAYLOAD_TOO_LARGE"),
        ));
    }
    body.extend_from_slice(chunk);
    Ok(())
}

#[cfg(test)]
mod tests {
    use super::*;
    use std::sync::mpsc;

    struct BlockingReader {
        release_rx: mpsc::Receiver<()>,
    }

    impl Read for BlockingReader {
        fn read(&mut self, _buf: &mut [u8]) -> std::io::Result<usize> {
            let _ = self.release_rx.recv();
            Ok(0)
        }
    }

    #[test]
    fn stream_chunk_fits_one_noise_record() {
        assert_eq!(NOISE_STREAM_CHUNK_SIZE, MAX_FRAME_PAYLOAD_SIZE);
    }

    #[test]
    fn stream_chunk_size_uses_noise_limit_for_data_plane_transports() {
        assert_eq!(
            TransportPolicy::for_transport(TransportType::UsbMobile).stream_chunk_size,
            NOISE_STREAM_CHUNK_SIZE
        );
        assert_eq!(
            TransportPolicy::for_transport(TransportType::WssRelay).stream_chunk_size,
            NOISE_STREAM_CHUNK_SIZE
        );
    }

    #[test]
    fn transport_policy_keeps_usb_and_network_liveness_distinct() {
        let usb = TransportPolicy::for_transport(TransportType::UsbMobile);
        let wss = TransportPolicy::for_transport(TransportType::WssRelay);

        assert!(!usb.heartbeat_enabled);
        assert!(wss.heartbeat_enabled);
        assert!(usb.stream_read_timeout < wss.stream_read_timeout);
        assert_eq!(
            usb.stream_control_unsupported_action,
            StreamControlUnsupportedAction::ControlledDisconnect
        );
        assert_eq!(
            wss.stream_control_unsupported_action,
            StreamControlUnsupportedAction::ControlledDisconnect
        );
        assert!(usb.transient_eio_diagnostic_interval < wss.transient_eio_diagnostic_interval);
    }

    #[tokio::test]
    async fn supervised_stream_read_times_out() {
        let (release_tx, release_rx) = mpsc::channel();
        let result = read_stream_chunk_supervised(
            Box::new(BlockingReader { release_rx }),
            8,
            RemoteStreamReadPolicy {
                timeout: Duration::from_millis(10),
            },
        )
        .await;

        assert_eq!(
            result.err(),
            Some(SupervisedStreamReadError::Timeout {
                timeout: Duration::from_millis(10)
            })
        );
        drop(release_tx);
    }
}

#[cfg(test)]
#[path = "upload_stream_tests.rs"]
mod upload_stream_tests;
