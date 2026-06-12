//! Router-owned OTP sidecar service and durable storage boundary.

mod error;
mod service;
mod storage;

pub(crate) use error::{OtpSidecarError, OtpSidecarResult};
pub(crate) use service::{
    generate as generate_otp, remove_secret as remove_otp_secret,
    rename_secret as rename_otp_secret, set_secret as set_otp_secret, OtpGenerateRequest,
    OtpRemoveSecretRequest, OtpRenameSecretRequest, OtpSetSecretRequest,
};
pub(crate) use storage::{load_otp_secrets, recover_otp_sidecar_transaction};
