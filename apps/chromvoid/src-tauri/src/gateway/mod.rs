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
pub(crate) use config_persistence::{revoke_agent_durably, save_config_snapshot_best_effort};
#[cfg(desktop)]
pub(crate) use server::spawn_gateway_server;
#[cfg(feature = "env-runtime-test-probe")]
#[allow(unused_imports)]
pub(crate) use session::resolve_and_start_run;
pub use state::{hex_encode, GatewayConfig, GatewayState};
pub use types::{
    AccessDuration, ActionGrant, AllowedCommands, CapabilityPolicy, CommandCategory,
    GatewayActorKind, GrantStore, PairedAgent, PairedExtension, SiteGrant,
};
