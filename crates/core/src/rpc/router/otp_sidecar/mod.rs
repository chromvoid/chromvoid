//! Router-owned OTP sidecar service and durable storage boundary.

mod error;
mod generator;
mod service;
mod storage;

pub(crate) use error::{OtpSidecarError, OtpSidecarResult};
pub(crate) use service::{
    generate as generate_otp, generate_with_timing as generate_otp_with_timing,
    preview as preview_otp, remove_secret as remove_otp_secret, rename_secret as rename_otp_secret,
    set_secret as set_otp_secret, validate_secret as validate_otp_secret, OtpGenerateRequest,
    OtpPreviewRequest, OtpRemoveSecretRequest, OtpRenameSecretRequest, OtpSetSecretRequest,
};
pub(crate) use storage::{load_otp_secrets_checked, recover_otp_sidecar_transaction};
