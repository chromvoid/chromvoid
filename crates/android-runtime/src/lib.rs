//! Android platform logic that is not tied to any one shell.
//!
//! The JNI entry points stay with the application that owns the process: this
//! crate owns the decisions behind them - request parsing, field
//! classification, provider contracts and the state each keeps - so the Tauri
//! client and the native client cannot drift apart on Android behaviour.
//!
//! Nothing here constructs a vault, holds a key or talks to the network. Core
//! access arrives through the provider hook the host application installs, and
//! only as a [`provider_core::ProviderCore`]: provider commands, never the adapter.

#[cfg(all(feature = "test-support", not(debug_assertions)))]
compile_error!("android-runtime test support is forbidden in release builds");

pub mod autofill;
pub mod bridge_contract;
pub mod credential_provider_contract;
pub mod credential_provider_passkey;
pub mod native_upload_errors;
pub mod passkey;
pub mod password_save;
pub mod provider_core;
pub mod provider_hook;
pub mod provider_status;
pub mod saf_picker;

#[cfg(any(test, feature = "test-support"))]
pub mod test_support;

#[cfg(test)]
mod tests;
