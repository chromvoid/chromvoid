//! RPC streaming support (ADR-004)
//!
//! The core router stays synchronous and transport-agnostic.
//! - Incoming binary data is provided as an input stream.
//! - Outgoing binary data is returned as an output stream + metadata.

use serde::{Deserialize, Serialize};
use std::io::{Cursor, Read};

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

pub struct RpcInputStream {
    reader: Box<dyn Read + Send>,
}

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

pub struct RpcOutputStream {
    pub meta: RpcStreamMeta,
    pub reader: Box<dyn Read + Send>,
}

pub enum RpcReply {
    Json(RpcResponse),
    Stream(RpcOutputStream),
}
