pub mod protocol;
pub mod state;
pub mod types;

#[cfg(desktop)]
mod handshake;
#[cfg(desktop)]
mod rate_limit;
#[cfg(desktop)]
mod server;
#[cfg(desktop)]
mod session;

#[cfg(desktop)]
pub use server::spawn_gateway_server;
pub use state::{hex_encode, GatewayConfig, GatewayState};
pub use types::{
    AccessDuration, ActionGrant, AllowedCommands, CapabilityPolicy, CommandCategory, GrantStore,
    PairedExtension, SiteGrant,
};
