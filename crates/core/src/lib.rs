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
pub(crate) mod durable_file;
pub(crate) mod durable_tx;
pub mod error;
pub mod license;
pub mod media_inspector;
pub mod passkeys;
pub mod rpc;
pub mod storage;
mod types;
pub mod vault;
pub mod wallet;

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
        crate::rpc::types::WalletNetwork::export_all_to(&out_dir)
            .expect("Failed to export WalletNetwork");
        crate::rpc::types::WalletFeeTier::export_all_to(&out_dir)
            .expect("Failed to export WalletFeeTier");
        crate::rpc::types::WalletFeePolicy::export_all_to(&out_dir)
            .expect("Failed to export WalletFeePolicy");
        crate::rpc::types::WalletTransactionOutput::export_all_to(&out_dir)
            .expect("Failed to export WalletTransactionOutput");
        crate::rpc::types::WalletWarning::export_all_to(&out_dir)
            .expect("Failed to export WalletWarning");
        crate::rpc::types::WalletPreview::export_all_to(&out_dir)
            .expect("Failed to export WalletPreview");
        crate::rpc::types::WalletBalance::export_all_to(&out_dir)
            .expect("Failed to export WalletBalance");
        crate::rpc::types::WalletSummary::export_all_to(&out_dir)
            .expect("Failed to export WalletSummary");
        crate::rpc::types::WalletAccountMeta::export_all_to(&out_dir)
            .expect("Failed to export WalletAccountMeta");
        crate::rpc::types::WalletTransactionEntry::export_all_to(&out_dir)
            .expect("Failed to export WalletTransactionEntry");
        crate::rpc::types::WalletStatusResponse::export_all_to(&out_dir)
            .expect("Failed to export WalletStatusResponse");
        crate::rpc::types::WalletListResponse::export_all_to(&out_dir)
            .expect("Failed to export WalletListResponse");
        crate::rpc::types::WalletHdGenerateMnemonicRequest::export_all_to(&out_dir)
            .expect("Failed to export WalletHdGenerateMnemonicRequest");
        crate::rpc::types::WalletHdGenerateMnemonicResponse::export_all_to(&out_dir)
            .expect("Failed to export WalletHdGenerateMnemonicResponse");
        crate::rpc::types::WalletHdCreateRequest::export_all_to(&out_dir)
            .expect("Failed to export WalletHdCreateRequest");
        crate::rpc::types::WalletHdCreateResponse::export_all_to(&out_dir)
            .expect("Failed to export WalletHdCreateResponse");
        crate::rpc::types::WalletImportCreateRequest::export_all_to(&out_dir)
            .expect("Failed to export WalletImportCreateRequest");
        crate::rpc::types::WalletImportCreateResponse::export_all_to(&out_dir)
            .expect("Failed to export WalletImportCreateResponse");
        crate::rpc::types::WalletAccountsListRequest::export_all_to(&out_dir)
            .expect("Failed to export WalletAccountsListRequest");
        crate::rpc::types::WalletAccountsListResponse::export_all_to(&out_dir)
            .expect("Failed to export WalletAccountsListResponse");
        crate::rpc::types::WalletAccountsDeriveRequest::export_all_to(&out_dir)
            .expect("Failed to export WalletAccountsDeriveRequest");
        crate::rpc::types::WalletAccountsDeriveResponse::export_all_to(&out_dir)
            .expect("Failed to export WalletAccountsDeriveResponse");
        crate::rpc::types::WalletAddressesDeriveRequest::export_all_to(&out_dir)
            .expect("Failed to export WalletAddressesDeriveRequest");
        crate::rpc::types::WalletAddressesDeriveResponse::export_all_to(&out_dir)
            .expect("Failed to export WalletAddressesDeriveResponse");
        crate::rpc::types::WalletBalanceGetRequest::export_all_to(&out_dir)
            .expect("Failed to export WalletBalanceGetRequest");
        crate::rpc::types::WalletBalanceGetResponse::export_all_to(&out_dir)
            .expect("Failed to export WalletBalanceGetResponse");
        crate::rpc::types::WalletTransactionPrepareRequest::export_all_to(&out_dir)
            .expect("Failed to export WalletTransactionPrepareRequest");
        crate::rpc::types::WalletTransactionPrepareResponse::export_all_to(&out_dir)
            .expect("Failed to export WalletTransactionPrepareResponse");
        crate::rpc::types::WalletTransactionConfirmRequest::export_all_to(&out_dir)
            .expect("Failed to export WalletTransactionConfirmRequest");
        crate::rpc::types::WalletTransactionConfirmResponse::export_all_to(&out_dir)
            .expect("Failed to export WalletTransactionConfirmResponse");
        crate::rpc::types::WalletTransactionCancelRequest::export_all_to(&out_dir)
            .expect("Failed to export WalletTransactionCancelRequest");
        crate::rpc::types::WalletTransactionCancelResponse::export_all_to(&out_dir)
            .expect("Failed to export WalletTransactionCancelResponse");
        crate::rpc::types::WalletTransactionsListRequest::export_all_to(&out_dir)
            .expect("Failed to export WalletTransactionsListRequest");
        crate::rpc::types::WalletTransactionsListResponse::export_all_to(&out_dir)
            .expect("Failed to export WalletTransactionsListResponse");
        crate::rpc::types::WalletTransactionsRefreshRequest::export_all_to(&out_dir)
            .expect("Failed to export WalletTransactionsRefreshRequest");
        crate::rpc::types::WalletTransactionsRefreshResponse::export_all_to(&out_dir)
            .expect("Failed to export WalletTransactionsRefreshResponse");
        crate::rpc::types::WalletBackupExportRequest::export_all_to(&out_dir)
            .expect("Failed to export WalletBackupExportRequest");
        crate::rpc::types::WalletBackupExportResponse::export_all_to(&out_dir)
            .expect("Failed to export WalletBackupExportResponse");
        crate::rpc::types::CatalogListItem::export_all_to(&out_dir)
            .expect("Failed to export CatalogListItem");
        crate::rpc::types::CatalogListResponse::export_all_to(&out_dir)
            .expect("Failed to export CatalogListResponse");
        crate::rpc::types::CatalogSyncManifestResponse::export_all_to(&out_dir)
            .expect("Failed to export CatalogSyncManifestResponse");
        crate::rpc::types::CatalogFolderSort::export_all_to(&out_dir)
            .expect("Failed to export CatalogFolderSort");
        crate::rpc::types::CatalogFolderFilter::export_all_to(&out_dir)
            .expect("Failed to export CatalogFolderFilter");
        crate::rpc::types::CatalogFolderPageRequest::export_all_to(&out_dir)
            .expect("Failed to export CatalogFolderPageRequest");
        crate::rpc::types::CatalogFolderBatchRequest::export_all_to(&out_dir)
            .expect("Failed to export CatalogFolderBatchRequest");
        crate::rpc::types::CatalogFolderPageResponse::export_all_to(&out_dir)
            .expect("Failed to export CatalogFolderPageResponse");
        crate::rpc::types::CatalogFolderBatchResponse::export_all_to(&out_dir)
            .expect("Failed to export CatalogFolderBatchResponse");
        crate::rpc::types::NodeCreatedResponse::export_all_to(&out_dir)
            .expect("Failed to export NodeCreatedResponse");
        crate::rpc::types::RpcCommand::export_all_to(&out_dir)
            .expect("Failed to export RpcCommand");
        crate::rpc::types::RpcCommandResult::export_all_to(&out_dir)
            .expect("Failed to export RpcCommandResult");

        println!("TypeScript bindings exported to: {}", out_dir.display());
    }
}
