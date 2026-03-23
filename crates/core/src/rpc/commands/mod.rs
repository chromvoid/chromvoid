//! RPC command handlers organized by domain

mod admin_legacy;
mod catalog;
mod catalog_io;
mod catalog_secrets;
mod guards;
mod otp;
mod shards;
pub mod system;

pub use admin_legacy::*;
pub use catalog::*;
pub use catalog_io::*;
pub use catalog_secrets::*;
#[cfg(debug_assertions)]
pub use guards::set_bypass_system_shard_guards;
pub(crate) use guards::{
    is_system_path_guarded, is_system_shard_id_guarded, with_system_shard_guard_bypass,
};
pub use otp::*;
pub use shards::*;
pub use system::{handle_ping, handle_pong, handle_vault_status};
