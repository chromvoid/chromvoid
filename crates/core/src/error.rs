//! Error types for ChromVoid Core

use thiserror::Error;

#[cfg(feature = "ts-bindings")]
use ts_rs::TS;

/// Main error type for ChromVoid Core
#[derive(Error, Debug)]
pub enum Error {
    // Crypto errors
    #[error("Encryption failed: {0}")]
    EncryptionFailed(String),

    #[error("Decryption failed: {0}")]
    DecryptionFailed(String),

    #[error("Key derivation failed: {0}")]
    KeyDerivationFailed(String),

    #[error("Invalid data format: {0}")]
    InvalidDataFormat(String),

    // Keystore / portable pepper (ADR-010 / ADR-012)
    #[error("Keystore unavailable: {0}")]
    KeystoreUnavailable(String),

    #[error("Storage pepper required")]
    StoragePepperRequired,

    #[error("Storage pepper invalid: {0}")]
    StoragePepperInvalid(String),

    #[error("Unsupported storage version: {0}")]
    UnsupportedStorageVersion(u64),

    // Storage errors
    #[error("Storage I/O error: {0}")]
    StorageIo(#[from] std::io::Error),

    #[error("Chunk not found: {0}")]
    ChunkNotFound(String),

    #[error("Invalid chunk name: {0}")]
    InvalidChunkName(String),

    // Catalog errors
    #[error("Node not found: {0}")]
    NodeNotFound(u64),

    #[error("Invalid name: {0}")]
    InvalidName(String),

    #[error("Name already exists: {0}")]
    NameExists(String),

    #[error("Not a directory: {0}")]
    NotADirectory(u64),

    #[error("Cannot modify root")]
    CannotModifyRoot,

    #[error("Invalid path: {0}")]
    InvalidPath(String),

    // Vault errors
    #[error("Vault not unlocked")]
    VaultNotUnlocked,

    #[error("Vault already unlocked")]
    VaultAlreadyUnlocked,

    // RPC errors
    #[error("Unknown command: {0}")]
    UnknownCommand(String),

    #[error("Invalid request: {0}")]
    InvalidRequest(String),

    #[error("Serialization error: {0}")]
    SerializationError(#[from] serde_json::Error),
}

/// Result type alias for ChromVoid Core
pub type Result<T> = std::result::Result<T, Error>;

/// RPC error codes (machine-readable)
#[derive(Debug, Clone, Copy, PartialEq, Eq)]
#[cfg_attr(feature = "ts-bindings", derive(TS))]
#[cfg_attr(feature = "ts-bindings", ts(export))]
#[cfg_attr(feature = "ts-bindings", ts(rename_all = "SCREAMING_SNAKE_CASE"))]
pub enum ErrorCode {
    // General
    EmptyPayload,
    UnknownCommand,
    InternalError,

    // Vault
    VaultRequired,
    VaultAlreadyUnlocked,
    VaultNotUnlocked,

    // Vault Export
    VaultExportMasterPasswordRequired,

    // Catalog
    CatalogNotInit,
    NodeNotFound,
    NameExist,
    NotADir,
    InvalidPath,
    ShardNotFound,
    ShardVersionMismatch,
    DeltasLost,

    // Streaming (ADR-004)
    StreamRequired,
    NoStream,
    InvalidOffset,

    // Sync (ADR-004)
    SyncShardNotFound,
    SyncVersionMismatch,
    SyncDeltasLost,
    SyncShardVersionMismatch,
    SyncTimeout,
    SyncConflict,
    SyncStaleState,
    SyncCompacting,

    // Admin
    InvalidMasterKey,
    InvalidMasterPassword,
    ConfirmRequired,
    StorageNotBlank,
    InvalidBackup,
    ChecksumMismatch,

    // Backup/Restore (ADR-004)
    BackupAlreadyInProgress,
    BackupTooLarge,
    RestoreInvalidFormat,
    RestoreVersionNotSupported,
    StorageVersionNotSupported,

    // Keystore / portable pepper (ADR-010 / ADR-012)
    KeystoreUnavailable,
    StoragePepperRequired,
    StoragePepperInvalid,

    // Erase (ADR-004/ADR-012)
    EraseTokenExpired,
    EraseNoConfirm,

    // OTP
    OtpSecretNotFound,
    OtpSettingsNotFound,
    OtpSettingsInvalid,
    OtpGenerateFailed,

    // Credential Provider (ADR-020)
    ProviderDisabled,
    ProviderSessionExpired,
    ProviderUnavailable,
    AccessDenied,
    NoMatch,
    InvalidContext,
}

impl ErrorCode {
    pub fn as_str(&self) -> &'static str {
        match self {
            Self::EmptyPayload => "EMPTY_PAYLOAD",
            Self::UnknownCommand => "UNKNOWN_COMMAND",
            Self::InternalError => "INTERNAL_ERROR",
            Self::VaultRequired => "VAULT_REQUIRED",
            Self::VaultAlreadyUnlocked => "VAULT_ALREADY_UNLOCKED",
            Self::VaultNotUnlocked => "VAULT_NOT_UNLOCKED",
            Self::VaultExportMasterPasswordRequired => "VAULT_EXPORT_MASTER_PASSWORD_REQUIRED",
            Self::CatalogNotInit => "CATALOG_NOT_INIT",
            Self::NodeNotFound => "NODE_NOT_FOUND",
            Self::NameExist => "NAME_EXIST",
            Self::NotADir => "NOT_A_DIR",
            Self::InvalidPath => "INVALID_PATH",
            Self::ShardNotFound => "SHARD_NOT_FOUND",
            Self::ShardVersionMismatch => "SHARD_VERSION_MISMATCH",
            Self::DeltasLost => "DELTAS_LOST",
            Self::StreamRequired => "STREAM_REQUIRED",
            Self::NoStream => "NO_STREAM",
            Self::InvalidOffset => "INVALID_OFFSET",
            Self::SyncShardNotFound => "SYNC_SHARD_NOT_FOUND",
            Self::SyncVersionMismatch => "SYNC_VERSION_MISMATCH",
            Self::SyncDeltasLost => "SYNC_DELTAS_LOST",
            Self::SyncShardVersionMismatch => "SYNC_SHARD_VERSION_MISMATCH",
            Self::SyncTimeout => "SYNC_TIMEOUT",
            Self::SyncConflict => "SYNC_CONFLICT",
            Self::SyncStaleState => "SYNC_STALE_STATE",
            Self::SyncCompacting => "SYNC_COMPACTING",
            Self::InvalidMasterKey => "INVALID_MASTER_KEY",
            Self::InvalidMasterPassword => "INVALID_MASTER_PASSWORD",
            Self::ConfirmRequired => "CONFIRM_REQUIRED",
            Self::StorageNotBlank => "STORAGE_NOT_BLANK",
            Self::InvalidBackup => "INVALID_BACKUP",
            Self::ChecksumMismatch => "CHECKSUM_MISMATCH",
            Self::BackupAlreadyInProgress => "BACKUP_ALREADY_IN_PROGRESS",
            Self::BackupTooLarge => "BACKUP_TOO_LARGE",
            Self::RestoreInvalidFormat => "RESTORE_INVALID_FORMAT",
            Self::RestoreVersionNotSupported => "RESTORE_VERSION_NOT_SUPPORTED",
            Self::StorageVersionNotSupported => "STORAGE_VERSION_NOT_SUPPORTED",
            Self::KeystoreUnavailable => "KEYSTORE_UNAVAILABLE",
            Self::StoragePepperRequired => "STORAGE_PEPPER_REQUIRED",
            Self::StoragePepperInvalid => "STORAGE_PEPPER_INVALID",
            Self::EraseTokenExpired => "ERASE_TOKEN_EXPIRED",
            Self::EraseNoConfirm => "ERASE_NO_CONFIRM",
            Self::OtpSecretNotFound => "OTP_SECRET_NOT_FOUND",
            Self::OtpSettingsNotFound => "OTP_SETTINGS_NOT_FOUND",
            Self::OtpSettingsInvalid => "OTP_SETTINGS_INVALID",
            Self::OtpGenerateFailed => "OTP_GENERATE_FAILED",
            Self::ProviderDisabled => "PROVIDER_DISABLED",
            Self::ProviderSessionExpired => "PROVIDER_SESSION_EXPIRED",
            Self::ProviderUnavailable => "PROVIDER_UNAVAILABLE",
            Self::AccessDenied => "ACCESS_DENIED",
            Self::NoMatch => "NO_MATCH",
            Self::InvalidContext => "INVALID_CONTEXT",
        }
    }
}

impl std::fmt::Display for ErrorCode {
    fn fmt(&self, f: &mut std::fmt::Formatter<'_>) -> std::fmt::Result {
        write!(f, "{}", self.as_str())
    }
}

impl From<ErrorCode> for String {
    fn from(code: ErrorCode) -> Self {
        code.as_str().to_string()
    }
}
