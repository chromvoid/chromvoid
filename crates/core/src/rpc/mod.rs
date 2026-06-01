//! RPC command router
//!
//! This module implements the RPC layer:
//! - Request/Response types
//! - Command router
//! - Command handlers

pub mod commands;
pub(crate) mod derivative_index;
pub mod helpers;
pub(in crate::rpc) mod request_parse;
mod router;
pub mod stream;
pub mod types;

pub use router::{
    cleanup_catalog_derivative_write_result, inspect_catalog_media_snapshot,
    write_catalog_derivative_snapshot, CatalogDerivativeSplitWriteError,
    CatalogDerivativeSplitWriteResult, CatalogDerivativeWriteError, CatalogDerivativeWriteRequest,
    CatalogDerivativeWriteResult, CatalogDerivativeWriteSnapshot, CatalogMediaInspectCommandError,
    CatalogMediaInspectResult, CatalogMediaInspectSnapshot, RpcRouter,
};
pub use stream::{
    RpcInputStream, RpcOutputStream, RpcRangeOutputStream, RpcRangeStreamMeta, RpcReply,
    RpcStreamMeta,
};
pub use types::{
    core_capability_features, CatalogListItem, CatalogListResponse, CoreCapabilitiesResponse,
    MasterRekeyResponse, NodeCreatedResponse, RpcCommand, RpcCommandResult, RpcError, RpcRequest,
    RpcResponse, RpcSuccess, VaultRekeyResponse, VaultStatusResponse,
    CORE_FEATURE_MEDIA_INSPECTION_CACHE_V1, CORE_FEATURE_REMOTE_MEDIA_INSPECTION_SPLIT_V1,
    CORE_FEATURE_REMOTE_RPC_JSON_MULTIPLEX_V1, CORE_FEATURE_REMOTE_RPC_PRIORITY_LOCK_V1,
};
