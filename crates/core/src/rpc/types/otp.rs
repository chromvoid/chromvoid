//! OTP-related RPC types

use serde::{Deserialize, Serialize};

#[cfg(feature = "ts-bindings")]
use ts_rs::TS;

#[derive(Debug, Clone, Serialize, Deserialize)]
#[cfg_attr(feature = "ts-bindings", derive(TS))]
#[cfg_attr(feature = "ts-bindings", ts(export))]
pub struct SecretReadResponse {
    #[cfg_attr(feature = "ts-bindings", ts(type = "number"))]
    pub node_id: u64,
    pub content: String, // base64-encoded secret content
}

#[derive(Debug, Clone, Serialize, Deserialize)]
#[cfg_attr(feature = "ts-bindings", derive(TS))]
#[cfg_attr(feature = "ts-bindings", ts(export))]
pub struct OtpGenerateResponse {
    pub otp: String,
}

#[derive(Debug, Clone, Serialize, Deserialize)]
pub struct OtpSecret {
    pub label: String,
    pub secret: String,
    pub algorithm: String,
    pub digits: u8,
    pub period: u32,
}

#[derive(Debug, Clone, Serialize, Deserialize, Default)]
pub struct OtpSecrets {
    pub secrets: Vec<OtpSecret>,
}
