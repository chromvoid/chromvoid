//! ChromVoid Core - Encrypted storage library
//!
//! This crate provides the core functionality for the ChromVoid encrypted storage system:
//! - Cryptographic primitives (Argon2id, ChaCha20-Poly1305, BLAKE3)
//! - Flat chunk-based storage with Plausible Deniability
//! - Catalog management (directories, files)
//! - Vault sessions (unlock/lock)
//! - RPC command router

pub mod catalog;
pub mod crypto;
pub mod error;
pub mod rpc;
pub mod storage;
mod types;
pub mod vault;

pub use error::{Error, Result};
pub use rpc::types::{RpcCommand, RpcCommandResult, RpcError, RpcSuccess};
pub use types::*;

/// Export TypeScript bindings when the `ts-bindings` feature is enabled
#[cfg(all(test, feature = "ts-bindings"))]
mod ts_bindings {
    use std::path::Path;

    #[test]
    fn export_bindings() {
        use ts_rs::TS;

        // Output directory for generated TypeScript files
        let out_dir = Path::new(env!("CARGO_MANIFEST_DIR"))
            .parent()
            .unwrap()
            .parent()
            .unwrap()
            .join("packages")
            .join("scheme")
            .join("src")
            .join("generated");

        // Create output directory if it doesn't exist
        std::fs::create_dir_all(&out_dir).expect("Failed to create output directory");

        // Export all types
        crate::types::NodeType::export_all_to(&out_dir).expect("Failed to export NodeType");
        crate::error::ErrorCode::export_all_to(&out_dir).expect("Failed to export ErrorCode");
        crate::catalog::CatalogNode::export_all_to(&out_dir).expect("Failed to export CatalogNode");
        crate::rpc::types::RpcRequest::export_all_to(&out_dir)
            .expect("Failed to export RpcRequest");
        crate::rpc::types::RpcSuccess::<()>::export_all_to(&out_dir)
            .expect("Failed to export RpcSuccess");
        crate::rpc::types::RpcError::export_all_to(&out_dir).expect("Failed to export RpcError");
        crate::rpc::types::VaultStatusResponse::export_all_to(&out_dir)
            .expect("Failed to export VaultStatusResponse");
        crate::rpc::types::CatalogListItem::export_all_to(&out_dir)
            .expect("Failed to export CatalogListItem");
        crate::rpc::types::CatalogListResponse::export_all_to(&out_dir)
            .expect("Failed to export CatalogListResponse");
        crate::rpc::types::NodeCreatedResponse::export_all_to(&out_dir)
            .expect("Failed to export NodeCreatedResponse");
        crate::rpc::types::SyncInitResponse::export_all_to(&out_dir)
            .expect("Failed to export SyncInitResponse");
        crate::rpc::types::RpcCommand::export_all_to(&out_dir)
            .expect("Failed to export RpcCommand");
        crate::rpc::types::RpcCommandResult::export_all_to(&out_dir)
            .expect("Failed to export RpcCommandResult");

        println!("TypeScript bindings exported to: {}", out_dir.display());
    }
}
