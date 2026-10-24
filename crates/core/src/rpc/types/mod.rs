//! RPC request/response types

mod catalog;
mod command;
mod credential_import;
mod credential_provider;
mod env_runtime;
mod otp;
mod passkeys;
mod passmanager;
mod passmanager_root;
mod result;
mod ssh;
mod sync;
mod vault;
mod wallet;
mod websites;

pub use catalog::*;
pub use command::*;
pub use credential_import::*;
pub use credential_provider::*;
pub use env_runtime::*;
pub use otp::*;
pub use passkeys::*;
pub use passmanager::*;
pub use passmanager_root::*;
pub use result::*;
pub use ssh::*;
pub use sync::*;
pub use vault::*;
pub use wallet::*;
pub use websites::*;

use serde::{Deserialize, Serialize};
use serde_json::Value;

#[cfg(feature = "ts-bindings")]
use ts_rs::TS;

/// RPC protocol version
pub const PROTOCOL_VERSION: u8 = 1;

pub const CORE_FEATURE_MEDIA_INSPECTION_CACHE_V1: &str = "media_inspection_cache_v1";
pub const CORE_FEATURE_REMOTE_MEDIA_INSPECTION_SPLIT_V1: &str = "remote_media_inspection_split_v1";
pub const CORE_FEATURE_REMOTE_RPC_JSON_MULTIPLEX_V1: &str = "remote_rpc_json_multiplex_v1";
pub const CORE_FEATURE_REMOTE_RPC_PRIORITY_LOCK_V1: &str = "remote_rpc_priority_lock_v1";
pub const CORE_FEATURE_REMOTE_STREAM_CONTROL_V1: &str = "remote_stream_control_v1";
pub const CORE_FEATURE_REMOTE_IMAGE_DERIVATIVE_ENSURE_V1: &str =
    "remote_image_derivative_ensure_v1";
pub const CORE_FEATURE_WALLET_DOMAIN_BASE_V1: &str = "wallet_domain_base_v1";
pub const CORE_FEATURE_WALLET_CORE_BTC_ETH_V1: &str = "wallet_core_btc_eth_v1";
pub const CORE_FEATURE_WALLET_CORE_TON_V1: &str = "wallet_core_ton_v1";
pub const CORE_FEATURE_WALLET_CORE_SOL_V1: &str = "wallet_core_sol_v1";
pub const CORE_FEATURE_CATALOG_REPAIR_V1: &str = "catalog_repair_v1";
pub const CORE_FEATURE_CATALOG_TRASH_V1: &str = "catalog_trash_v1";
pub const CORE_FEATURE_CATALOG_EXCHANGE_V1: &str = "catalog_exchange_v1";
pub const CORE_FEATURE_CATALOG_PATCH_V1: &str = "catalog_patch_v1";
pub const CORE_FEATURE_CATALOG_LIST_SOURCE_REVISION_V1: &str = "catalog_list_source_revision_v1";
pub const CORE_FEATURE_ENV_RUNTIME_V1: &str = "env_runtime_v1";

pub fn core_capability_features() -> Vec<String> {
    vec![
        CORE_FEATURE_MEDIA_INSPECTION_CACHE_V1.to_string(),
        CORE_FEATURE_REMOTE_MEDIA_INSPECTION_SPLIT_V1.to_string(),
        CORE_FEATURE_REMOTE_RPC_JSON_MULTIPLEX_V1.to_string(),
        CORE_FEATURE_REMOTE_RPC_PRIORITY_LOCK_V1.to_string(),
        CORE_FEATURE_REMOTE_STREAM_CONTROL_V1.to_string(),
        CORE_FEATURE_REMOTE_IMAGE_DERIVATIVE_ENSURE_V1.to_string(),
        CORE_FEATURE_CATALOG_REPAIR_V1.to_string(),
        CORE_FEATURE_CATALOG_TRASH_V1.to_string(),
        CORE_FEATURE_CATALOG_EXCHANGE_V1.to_string(),
        CORE_FEATURE_CATALOG_PATCH_V1.to_string(),
        CORE_FEATURE_CATALOG_LIST_SOURCE_REVISION_V1.to_string(),
        CORE_FEATURE_ENV_RUNTIME_V1.to_string(),
    ]
}

#[derive(Debug, Clone, Serialize, Deserialize)]
#[cfg_attr(feature = "ts-bindings", derive(TS))]
#[cfg_attr(feature = "ts-bindings", ts(export))]
pub struct CoreCapabilitiesResponse {
    pub protocol_version: u8,
    pub features: Vec<String>,
}

/// RPC Request
#[derive(Debug, Clone, Serialize, Deserialize)]
#[cfg_attr(feature = "ts-bindings", derive(TS))]
#[cfg_attr(feature = "ts-bindings", ts(export))]
#[cfg_attr(feature = "mobile-schema", derive(schemars::JsonSchema))]
pub struct RpcRequest {
    /// Protocol version
    pub v: u8,
    /// Command name
    pub command: String,
    /// Command data
    pub data: Value,
    /// Optional transport-level feature hints for this request.
    #[serde(default, skip_serializing_if = "Option::is_none")]
    #[cfg_attr(feature = "ts-bindings", ts(optional))]
    pub transport_features: Option<Vec<String>>,
}

impl RpcRequest {
    /// Create a new request
    pub fn new(command: impl Into<String>, data: Value) -> Self {
        Self {
            v: PROTOCOL_VERSION,
            command: command.into(),
            data,
            transport_features: None,
        }
    }

    pub fn with_transport_features(mut self, features: Vec<String>) -> Self {
        self.transport_features = (!features.is_empty()).then_some(features);
        self
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
#[cfg_attr(feature = "mobile-schema", derive(schemars::JsonSchema))]
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
