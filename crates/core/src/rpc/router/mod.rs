//! RPC router submodules

mod backup;
mod backup_pack;
mod blob_finalize;
pub(in crate::rpc) mod blob_io;
mod blob_range_reader;
mod blob_reader;
mod catalog_derivative_write;
mod catalog_media_inspect;
mod catalog_streams;
mod credential_matching;
mod credential_provider;
mod credential_types;
mod derivative_store;
mod dispatch;
mod domain_read;
mod domain_uow;
mod events;
mod master_material;
mod master_rekey;
mod otp_sidecar;
mod passkeys;
mod passmanager;
mod plain_blob_read;
mod recovery;
mod restore;
mod session_lifecycle;
mod state;
mod storage_gc;
mod vault_export;
mod vault_ops;
mod wallet;

pub use catalog_derivative_write::{
    write_catalog_derivative_snapshot, CatalogDerivativeSplitWriteError,
    CatalogDerivativeSplitWriteResult,
};
pub use catalog_media_inspect::{
    inspect_catalog_media_snapshot, CatalogMediaInspectCommandError, CatalogMediaInspectResult,
    CatalogMediaInspectSnapshot,
};
pub use derivative_store::{
    cleanup_catalog_derivative_write_result, CatalogDerivativeWriteError,
    CatalogDerivativeWriteRequest, CatalogDerivativeWriteResult, CatalogDerivativeWriteSnapshot,
};
pub use state::RpcRouter;

#[cfg(test)]
#[path = "router_tests/mod.rs"]
mod tests;
