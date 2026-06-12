//! RPC streaming support (ADR-004)
//!
//! The core router stays synchronous and transport-agnostic.
//! - Incoming binary data is provided as an input stream.
//! - Outgoing binary data is returned as an output stream + metadata.

use serde::{Deserialize, Serialize};
use std::io::{self, Cursor, Read};

use super::types::RpcResponse;

#[derive(Debug, Clone, Serialize, Deserialize)]
#[cfg_attr(feature = "ts-bindings", derive(ts_rs::TS))]
#[cfg_attr(feature = "ts-bindings", ts(export))]
pub struct RpcStreamMeta {
    pub name: String,
    #[serde(rename = "type")]
    pub mime_type: String,
    #[cfg_attr(feature = "ts-bindings", ts(type = "number"))]
    pub size: u64,
    pub chunk_size: u32,
}

#[derive(Debug, Clone, Serialize, Deserialize)]
#[cfg_attr(feature = "ts-bindings", derive(ts_rs::TS))]
#[cfg_attr(feature = "ts-bindings", ts(export))]
pub struct RpcRangeStreamMeta {
    pub name: String,
    #[serde(rename = "type")]
    pub mime_type: String,
    #[cfg_attr(feature = "ts-bindings", ts(type = "number"))]
    pub file_size: u64,
    pub chunk_size: u32,
    #[cfg_attr(feature = "ts-bindings", ts(type = "number"))]
    pub range_offset: u64,
    #[cfg_attr(feature = "ts-bindings", ts(type = "number"))]
    pub range_length: u64,
    #[cfg_attr(feature = "ts-bindings", ts(type = "number"))]
    pub source_revision: u64,
}

pub struct RpcInputStream {
    reader: Box<dyn Read + Send>,
}

pub(crate) const MAX_SINGLE_RPC_STREAM_BYTES: u64 = 512 * 1024 * 1024;

impl RpcInputStream {
    pub fn new(reader: Box<dyn Read + Send>) -> Self {
        Self { reader }
    }

    pub fn from_bytes(bytes: Vec<u8>) -> Self {
        Self {
            reader: Box::new(Cursor::new(bytes)),
        }
    }

    pub fn into_reader(self) -> Box<dyn Read + Send> {
        self.reader
    }
}

pub(crate) fn read_stream_exact_limited(
    stream: RpcInputStream,
    expected_size: u64,
    max_size: u64,
) -> io::Result<Vec<u8>> {
    let mut reader = stream.into_reader();
    let bytes = read_exact_limited(&mut reader, expected_size, max_size)?;
    let mut extra = [0_u8; 1];
    match reader.read(&mut extra)? {
        0 => Ok(bytes),
        _ => Err(io::Error::new(
            io::ErrorKind::InvalidData,
            "stream contains extra bytes",
        )),
    }
}

pub(crate) fn read_exact_limited(
    reader: &mut dyn Read,
    expected_size: u64,
    max_size: u64,
) -> io::Result<Vec<u8>> {
    if expected_size > max_size {
        return Err(io::Error::new(
            io::ErrorKind::InvalidInput,
            format!("stream size exceeds limit: {expected_size} > {max_size}"),
        ));
    }
    let expected_size = usize::try_from(expected_size).map_err(|_| {
        io::Error::new(
            io::ErrorKind::InvalidInput,
            "stream size does not fit in memory on this platform",
        )
    })?;
    let mut bytes = vec![0_u8; expected_size];
    reader.read_exact(&mut bytes)?;
    Ok(bytes)
}

pub(crate) fn read_stream_to_end_limited(
    stream: RpcInputStream,
    max_size: u64,
) -> io::Result<Vec<u8>> {
    let mut reader = stream.into_reader().take(max_size.saturating_add(1));
    let mut bytes = Vec::new();
    reader.read_to_end(&mut bytes)?;
    if bytes.len() as u64 > max_size {
        return Err(io::Error::new(
            io::ErrorKind::InvalidInput,
            format!("stream size exceeds limit: {max_size}"),
        ));
    }
    Ok(bytes)
}

pub struct RpcOutputStream {
    pub meta: RpcStreamMeta,
    pub reader: Box<dyn Read + Send>,
}

pub struct RpcRangeOutputStream {
    pub meta: RpcRangeStreamMeta,
    pub reader: Box<dyn Read + Send>,
}

pub enum RpcReply {
    Json(RpcResponse),
    Stream(RpcOutputStream),
    RangeStream(RpcRangeOutputStream),
}

#[cfg(test)]
mod tests {
    use super::*;

    #[test]
    fn read_exact_limited_rejects_declared_size_over_limit() {
        let mut reader = Cursor::new(Vec::<u8>::new());
        let error = read_exact_limited(&mut reader, 4, 3).unwrap_err();
        assert_eq!(error.kind(), io::ErrorKind::InvalidInput);
    }

    #[test]
    fn read_stream_exact_limited_rejects_short_stream() {
        let stream = RpcInputStream::from_bytes(vec![1, 2]);
        let error = read_stream_exact_limited(stream, 3, 3).unwrap_err();
        assert_eq!(error.kind(), io::ErrorKind::UnexpectedEof);
    }

    #[test]
    fn read_stream_exact_limited_rejects_extra_byte() {
        let stream = RpcInputStream::from_bytes(vec![1, 2, 3, 4]);
        let error = read_stream_exact_limited(stream, 3, 3).unwrap_err();
        assert_eq!(error.kind(), io::ErrorKind::InvalidData);
    }

    #[test]
    fn read_stream_exact_limited_accepts_exact_size() {
        let stream = RpcInputStream::from_bytes(vec![1, 2, 3]);
        let bytes = read_stream_exact_limited(stream, 3, 3).unwrap();
        assert_eq!(bytes, vec![1, 2, 3]);
    }

    #[test]
    fn read_stream_to_end_limited_rejects_over_limit() {
        let stream = RpcInputStream::from_bytes(vec![1, 2, 3, 4]);
        let error = read_stream_to_end_limited(stream, 3).unwrap_err();
        assert_eq!(error.kind(), io::ErrorKind::InvalidInput);
    }
}
