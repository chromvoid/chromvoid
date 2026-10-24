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
#[cfg_attr(feature = "ts-bindings", derive(TS))]
#[cfg_attr(feature = "ts-bindings", ts(export))]
#[cfg_attr(feature = "mobile-schema", derive(schemars::JsonSchema))]
pub struct OtpPreviewResponse {
    pub otp: String,
    pub period: u32,
    pub left_seconds: u32,
}

fn default_otp_encoding() -> String {
    "base32".to_string()
}

fn default_otp_algorithm() -> String {
    "SHA1".to_string()
}

fn default_otp_digits() -> u8 {
    6
}

fn default_otp_period() -> u32 {
    30
}

fn default_otp_type() -> String {
    "TOTP".to_string()
}

#[derive(Debug, Clone, Serialize, Deserialize)]
pub struct OtpSecret {
    pub label: String,
    pub secret: String,
    #[serde(default = "default_otp_encoding")]
    pub encoding: String,
    #[serde(default = "default_otp_type", rename = "type")]
    pub otp_type: String,
    #[serde(default)]
    pub counter: Option<u64>,
    #[serde(default = "default_otp_algorithm")]
    pub algorithm: String,
    #[serde(default = "default_otp_digits")]
    pub digits: u8,
    #[serde(default = "default_otp_period")]
    pub period: u32,
}

#[derive(Debug, Clone, Serialize, Deserialize, Default)]
pub struct OtpSecrets {
    pub secrets: Vec<OtpSecret>,
}
