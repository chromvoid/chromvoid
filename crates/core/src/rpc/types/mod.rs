//! RPC request/response types

mod catalog;
mod command;
mod credential_provider;
mod otp;
mod result;
mod sync;
mod vault;

pub use catalog::*;
pub use command::*;
pub use credential_provider::*;
pub use otp::*;
pub use result::*;
pub use sync::*;
pub use vault::*;

use serde::{Deserialize, Serialize};
use serde_json::Value;

#[cfg(feature = "ts-bindings")]
use ts_rs::TS;

/// RPC protocol version
pub const PROTOCOL_VERSION: u8 = 1;

/// RPC Request
#[derive(Debug, Clone, Serialize, Deserialize)]
#[cfg_attr(feature = "ts-bindings", derive(TS))]
#[cfg_attr(feature = "ts-bindings", ts(export))]
pub struct RpcRequest {
    /// Protocol version
    pub v: u8,
    /// Command name
    pub command: String,
    /// Command data
    pub data: Value,
}

impl RpcRequest {
    /// Create a new request
    pub fn new(command: impl Into<String>, data: Value) -> Self {
        Self {
            v: PROTOCOL_VERSION,
            command: command.into(),
            data,
        }
    }
}

/// Successful RPC response
#[derive(Debug, Clone, Serialize, Deserialize)]
#[cfg_attr(feature = "ts-bindings", derive(TS))]
#[cfg_attr(feature = "ts-bindings", ts(export))]
pub struct RpcSuccess<T> {
    /// Always true for success
    pub ok: bool,
    /// Result data
    pub result: T,
}

impl<T> RpcSuccess<T> {
    pub fn new(result: T) -> Self {
        Self { ok: true, result }
    }
}

/// Error RPC response
#[derive(Debug, Clone, Serialize, Deserialize)]
#[cfg_attr(feature = "ts-bindings", derive(TS))]
#[cfg_attr(feature = "ts-bindings", ts(export))]
pub struct RpcError {
    /// Always false for error
    pub ok: bool,
    /// Error message
    pub error: String,
    /// Optional error code
    #[serde(skip_serializing_if = "Option::is_none")]
    pub code: Option<String>,
}

impl RpcError {
    pub fn new(message: impl Into<String>, code: Option<impl Into<String>>) -> Self {
        Self {
            ok: false,
            error: message.into(),
            code: code.map(|c| c.into()),
        }
    }
}

/// RPC Response (internal use, not exported to TS)
#[derive(Debug, Clone, Serialize, Deserialize)]
#[serde(untagged)]
pub enum RpcResponse {
    /// Successful response
    Success { ok: bool, result: Value },
    /// Error response
    Error {
        ok: bool,
        error: String,
        #[serde(skip_serializing_if = "Option::is_none")]
        code: Option<String>,
    },
}

impl RpcResponse {
    /// Create a success response
    pub fn success(result: impl Serialize) -> Self {
        Self::Success {
            ok: true,
            result: serde_json::to_value(result).unwrap_or(Value::Null),
        }
    }

    /// Create an error response
    pub fn error(message: impl Into<String>, code: Option<impl Into<String>>) -> Self {
        Self::Error {
            ok: false,
            error: message.into(),
            code: code.map(|c| c.into()),
        }
    }

    /// Check if response is successful
    pub fn is_ok(&self) -> bool {
        matches!(self, Self::Success { .. })
    }

    /// Get the result value (if success)
    pub fn result(&self) -> Option<&Value> {
        match self {
            Self::Success { result, .. } => Some(result),
            Self::Error { .. } => None,
        }
    }

    /// Get the error message (if error)
    pub fn error_message(&self) -> Option<&str> {
        match self {
            Self::Error { error, .. } => Some(error),
            Self::Success { .. } => None,
        }
    }

    /// Get the error code (if error)
    pub fn code(&self) -> Option<&str> {
        match self {
            Self::Error { code, .. } => code.as_deref(),
            Self::Success { .. } => None,
        }
    }
}

#[cfg(test)]
#[path = "mod_tests.rs"]
mod tests;
