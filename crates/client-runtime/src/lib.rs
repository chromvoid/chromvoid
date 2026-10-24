//! Shared local Core construction and scheduling for native and Tauri clients.
//! Platform UI, remote adapters and transport handles remain in their clients.
#[cfg(all(feature = "test-support", not(debug_assertions)))]
compile_error!("client-runtime test support is forbidden in release builds");

/// The adapter contract every client speaks to Core through. It lives here so
/// the Tauri shell, the native clients and the platform runtimes share one
/// definition instead of each restating it.
pub mod adapter;
pub use adapter::{ConnectionState, CoreAdapter, CoreMode, RemoteCancelGroup, RemoteRpcPriority};
pub mod dispatch;
mod esplora;
mod ethereum_rpc;
mod local;
mod local_adapter;
mod solana_rpc;
#[cfg(test)]
mod test_http;
mod ton_center;
#[cfg(debug_assertions)]
mod wallet_history_fixture;
#[cfg(debug_assertions)]
mod wallet_send_fixture;
pub use local::LocalCoreAdapter;
pub mod provider;
/// Wire-level request and event models the remote data plane exchanges.
/// They belong beside the adapter contract that names them.
pub mod remote_io_models;
pub mod rpc_data;
pub mod session;
