//! RPC command router
//!
//! This module implements the RPC layer:
//! - Request/Response types
//! - Command router
//! - Command handlers

pub mod commands;
pub mod helpers;
mod router;
pub mod stream;
pub mod types;

pub use router::RpcRouter;
pub use stream::{RpcInputStream, RpcOutputStream, RpcReply, RpcStreamMeta};
pub use types::{
    CatalogListItem, CatalogListResponse, NodeCreatedResponse, RpcCommand, RpcCommandResult,
    RpcError, RpcRequest, RpcResponse, RpcSuccess, SyncInitResponse, VaultStatusResponse,
};
