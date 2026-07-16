mod esplora;
mod local;
#[cfg(desktop)]
mod remote;
mod ton_center;
mod types;
#[cfg(any(target_os = "windows", test))]
mod windows;

pub use local::LocalCoreAdapter;
#[cfg(desktop)]
pub(crate) use remote::parse_capability_features;
#[cfg(desktop)]
pub use remote::RemoteCoreAdapter;
pub use types::ConnectionState;
#[cfg(desktop)]
pub use types::DeferredReply;
#[cfg(any(desktop, test))]
pub use types::ModeTransition;
#[cfg(desktop)]
pub use types::RemoteHost;
#[cfg(desktop)]
pub use types::RemoteJsonClientHandle;
pub use types::{CoreAdapter, CoreMode};
pub use types::{RemoteCancelGroup, RemoteRpcPriority};
