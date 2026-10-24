//! Core access for the Tauri shell.
//!
//! The adapter contract and the local implementation are owned by
//! `chromvoid-client-runtime` so every client speaks the same one. Only the
//! desktop remote adapter and the Windows helpers remain shell-local.

#[cfg(desktop)]
mod remote;
#[cfg(any(target_os = "windows", test))]
mod windows;

#[cfg(any(desktop, test))]
pub use chromvoid_client_runtime::adapter::ModeTransition;
pub use chromvoid_client_runtime::adapter::{
    ConnectionState, CoreAdapter, CoreMode, RemoteCancelGroup, RemoteRpcPriority,
};
#[cfg(desktop)]
pub use chromvoid_client_runtime::adapter::{
    DeferredReply, RemoteHost, RemoteJsonClientHandle, RemoteJsonSender,
};
pub use chromvoid_client_runtime::LocalCoreAdapter;
#[cfg(desktop)]
pub(crate) use remote::parse_capability_features;
#[cfg(desktop)]
pub use remote::RemoteCoreAdapter;
