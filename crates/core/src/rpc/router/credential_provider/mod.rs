//! Credential provider RPC handlers (ADR-020).

mod debug;
pub(in crate::rpc::router) mod error;
mod one_time_code;
mod query;
mod record;
mod request;
pub(super) mod runtime;
mod secret;
mod service;
mod session;
