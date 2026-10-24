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
mod storage_mutation_guard;
pub mod stream;
pub mod types;

pub use storage_mutation_guard::{StorageMutationError, StorageMutationGuard};

pub use router::{
    cleanup_catalog_derivative_write_result, execute_wallet_balance_snapshot,
    execute_wallet_history_snapshot, inspect_catalog_media_snapshot,
    write_catalog_derivative_snapshot, CatalogDerivativeSplitWriteError,
    CatalogDerivativeSplitWriteResult, CatalogDerivativeWriteError, CatalogDerivativeWriteRequest,
    CatalogDerivativeWriteResult, CatalogDerivativeWriteSnapshot, CatalogMediaInspectCommandError,
    CatalogMediaInspectResult, CatalogMediaInspectSnapshot, CatalogSourceReader,
    LocalBackupSnapshot, LocalRestoreArtifact, LocalRestoreInput, LocalRestorePreview,
    PreparedLocalRestore, RpcRouter, WalletBalanceExecution, WalletBalanceSnapshot,
    WalletHistoryExecution, WalletHistorySnapshot, MAX_RESTORE_APPEND_BYTES,
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
