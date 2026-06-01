//! RPC command handlers organized by domain

mod catalog;
mod catalog_secret_erase;
mod guards;
mod shards;
pub mod system;

pub use catalog::*;
pub use catalog_secret_erase::*;
#[cfg(debug_assertions)]
pub use guards::set_bypass_system_shard_guards;
pub(crate) use guards::{
    is_system_node, is_system_path_guarded, normalize_path, shard_id_from_path,
    shard_relative_path, system_shard_denied, with_system_shard_guard_bypass,
};
pub use shards::*;
pub use system::{handle_ping, handle_pong, handle_vault_status};
