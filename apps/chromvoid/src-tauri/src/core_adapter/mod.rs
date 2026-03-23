mod local;
#[cfg(desktop)]
mod remote;
mod types;
#[cfg(any(target_os = "windows", test))]
mod windows;

pub use local::LocalCoreAdapter;
#[cfg(desktop)]
pub use remote::RemoteCoreAdapter;
pub use types::ConnectionState;
#[cfg(any(desktop, test))]
pub use types::ModeTransition;
#[cfg(desktop)]
pub use types::RemoteHost;
pub use types::{CoreAdapter, CoreMode};
