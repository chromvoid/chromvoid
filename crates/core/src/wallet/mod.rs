//! Core wallet domain primitives (SPEC-217).

pub mod bitcoin;
mod chain;
mod constants;
mod error;
pub mod ethereum;
pub mod evm;
mod ids;
mod records;
mod registry;
#[cfg(test)]
mod secret_hygiene_tests;
mod summary;
mod telemetry;
pub mod ton;
pub mod ton_mnemonic;
pub mod ton_v2;

pub use chain::{
    WalletAddressDeriveInput, WalletAddressDeriveOutput, WalletBalanceInput, WalletBalanceOutput,
    WalletBalanceTask, WalletChainProfile, WalletConfirmInput, WalletConfirmOutput,
    WalletHdAccountMaterializeInput, WalletHistoryInput, WalletHistoryOutput, WalletHistoryTask,
    WalletHistoryTransaction, WalletImportedAccountMaterializeInput, WalletPrepareInput,
    WalletPrepareOutput, WalletProfileAccountMaterialization, WalletRefreshInput,
    WalletRefreshOutput, WalletRuntimeConfig, WalletSignInput, WalletSignedArtifact,
    WalletSubmitInput, WalletSubmitOutput,
};
pub use constants::{
    BIP39_ENGLISH_WORDLIST, BIP39_MNEMONIC_STANDARD, MNEMONIC_DRAFT_TTL_MS, MULTICHAIN_WALLET_MODE,
    PREPARATION_TTL_MS, TON_NATIVE_MNEMONIC_STANDARD, TON_ONLY_WALLET_MODE,
    WALLET_BALANCE_CACHE_SCHEMA_VERSION, WALLET_ROOT, WALLET_SCHEMA_VERSION,
};
pub use error::{WalletChainError, WalletChainErrorCode};
pub use ids::{
    hash_hex, hex_string, new_account_id, new_address_book_entry_id, new_mnemonic_draft_id,
    new_preparation_id, new_secret_id, new_tx_ref, new_wallet_id, now_ms, parse_hex,
};
pub use records::{
    AllocatedAddressV1, BroadcastArtifactV1, BroadcastArtifactV2, BroadcastSubmitAttemptV1,
    HdRootMaterial, HdRootRecoveryMaterialV2, PreparationRecordV1, PreparationStateV1,
    PreparedIntentV1, SecretBlobV1, SecretPayloadV1, WalletBalanceCacheV1, WalletIndexV1,
    WalletMetaV1, WalletOperationIdempotencyRecordV1, WalletProviderObservationOutcomeV1,
    WalletProviderObservationV1, WalletReconciliationEvidenceV1, WalletTxStatus,
};
pub use registry::WalletChainRegistry;
pub use summary::account_summary_from_meta;
pub use telemetry::{
    NoopWalletTelemetrySink, WalletTelemetryEvent, WalletTelemetryMetric, WalletTelemetrySink,
};
