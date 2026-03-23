//! RPC router submodules

mod backup;
mod blob_reader;
mod catalog_streams;
mod credential_matching;
mod credential_provider;
mod credential_types;
mod dispatch;
mod passmanager;
mod restore;
mod shard_compact;
mod state;
mod vault_export;
mod vault_ops;

pub use state::RpcRouter;

#[cfg(test)]
#[path = "router_tests.rs"]
mod tests;
