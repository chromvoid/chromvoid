//! Router-owned PassManager OTP target resolution cache.

mod cache;
mod error;
mod resolver;
mod scanner;
mod types;

#[cfg(test)]
mod tests;

pub(in crate::rpc::router) use cache::resolve_with_cache;
pub(in crate::rpc::router) use error::OtpTargetError;
pub(in crate::rpc::router) use types::{
    PassmanagerOtpTargetCache, PassmanagerOtpTargetRequest, ResolvedOtpTarget,
};
