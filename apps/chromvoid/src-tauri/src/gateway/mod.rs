pub mod protocol;
pub mod state;
pub mod types;

#[cfg(desktop)]
mod config_persistence;
#[cfg(desktop)]
mod handshake;
#[cfg(desktop)]
mod rate_limit;
#[cfg(desktop)]
mod server;
#[cfg(desktop)]
mod session;

#[cfg(desktop)]
pub(crate) use config_persistence::save_config_snapshot_best_effort;
#[cfg(desktop)]
pub(crate) use server::spawn_gateway_server;
pub use state::{hex_encode, GatewayConfig, GatewayState};
pub use types::{
    AccessDuration, ActionGrant, AllowedCommands, CapabilityPolicy, CommandCategory, GrantStore,
    PairedExtension, SiteGrant,
};
