#[cfg(all(feature = "env-runtime-integration-tests", not(debug_assertions)))]
compile_error!(
    "env-runtime-integration-tests exposes test-only CLI stores and must not be enabled in release builds"
);

pub mod args;
pub mod client;
pub mod config;
pub mod draft;
pub mod error;
pub mod guide;
pub mod output;
pub mod transport;
