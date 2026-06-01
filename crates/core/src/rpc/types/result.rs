//! RPC command result discriminated union (response types)

use serde::{Deserialize, Serialize};
use serde_json::Value;

use crate::license::{EntitlementSnapshot, SignedCert};

#[cfg(feature = "ts-bindings")]
use ts_rs::TS;

use super::{
    CatalogFileReplaceResponse, CatalogFolderBatchResponse, CatalogFolderPageResponse,
    CatalogListResponse, CatalogMediaInspectResponse, CatalogNotesListResponse,
    CatalogSyncManifestResponse, CompactShardResponse, CoreCapabilitiesResponse,
    CredentialCandidate, CredentialProviderPasskeyCommandResponse,
    CredentialProviderSessionResponse, CredentialProviderStatusResponse, CredentialSecret,
    DerivativeStatsResponse, ListShardsResponse, LoadShardResponse, MasterRekeyResponse,
    NodeCreatedResponse, SourceMetadataResponse, SyncShardResponse, UploadResponse,
    VaultPasskeyDeleteResponse, VaultPasskeysListResponse, VaultRekeyResponse, VaultStatusResponse,
    WalletAccountsDeriveResponse, WalletAccountsListResponse, WalletAddressesDeriveResponse,
    WalletBackupExportResponse, WalletBalanceGetResponse, WalletHdCreateResponse,
    WalletHdGenerateMnemonicResponse, WalletImportCreateResponse, WalletListResponse,
    WalletStatusResponse, WalletTransactionCancelResponse, WalletTransactionConfirmResponse,
    WalletTransactionPrepareResponse, WalletTransactionsListResponse,
    WalletTransactionsRefreshResponse,
};

/// Response for each command (discriminated union)
#[derive(Debug, Clone, Serialize, Deserialize)]
#[cfg_attr(feature = "ts-bindings", derive(TS))]
#[cfg_attr(feature = "ts-bindings", ts(export))]
#[serde(tag = "command", content = "result")]
pub enum RpcCommandResult {
    #[serde(rename = "ping")]
    Ping { pong: bool },

    #[serde(rename = "pong")]
    Pong {},

    #[serde(rename = "core:capabilities")]
    CoreCapabilities(CoreCapabilitiesResponse),

    #[serde(rename = "license:fingerprint")]
    LicenseFingerprint { device_fingerprint: String },

    #[serde(rename = "license:install")]
    LicenseInstall(EntitlementSnapshot),

    #[serde(rename = "license:cert")]
    LicenseCert(SignedCert),

    #[serde(rename = "license:uninstall")]
    LicenseUninstall(EntitlementSnapshot),

    #[serde(rename = "license:status")]
    LicenseStatus(EntitlementSnapshot),

    #[serde(rename = "vault:unlock")]
    VaultUnlock {},

    #[serde(rename = "vault:lock")]
    VaultLock {},

    #[serde(rename = "vault:status")]
    VaultStatus(VaultStatusResponse),

    #[serde(rename = "vault:rekey")]
    VaultRekey(VaultRekeyResponse),

    #[serde(rename = "master:rekey")]
    MasterRekey(MasterRekeyResponse),

    #[serde(rename = "admin:storage:gc:scan")]
    AdminStorageGcScan {
        gc_id: String,
        candidates: Vec<Value>,
        #[cfg_attr(feature = "ts-bindings", ts(type = "number"))]
        total_bytes: u64,
    },

    #[serde(rename = "admin:storage:gc:delete")]
    AdminStorageGcDelete {
        gc_id: String,
        deleted_chunks: Vec<String>,
        #[cfg_attr(feature = "ts-bindings", ts(type = "number"))]
        deleted_bytes: u64,
        skipped_chunks: Vec<String>,
    },

    #[serde(rename = "wallet:status")]
    WalletStatus(WalletStatusResponse),

    #[serde(rename = "wallet:list")]
    WalletList(WalletListResponse),

    #[serde(rename = "wallet:hd:generateMnemonic")]
    WalletHdGenerateMnemonic(WalletHdGenerateMnemonicResponse),

    #[serde(rename = "wallet:hd:create")]
    WalletHdCreate(WalletHdCreateResponse),

    #[serde(rename = "wallet:import:create")]
    WalletImportCreate(WalletImportCreateResponse),

    #[serde(rename = "wallet:accounts:list")]
    WalletAccountsList(WalletAccountsListResponse),

    #[serde(rename = "wallet:accounts:derive")]
    WalletAccountsDerive(WalletAccountsDeriveResponse),

    #[serde(rename = "wallet:addresses:derive")]
    WalletAddressesDerive(WalletAddressesDeriveResponse),

    #[serde(rename = "wallet:balance:get")]
    WalletBalanceGet(WalletBalanceGetResponse),

    #[serde(rename = "wallet:transaction:prepare")]
    WalletTransactionPrepare(WalletTransactionPrepareResponse),

    #[serde(rename = "wallet:transaction:confirm")]
    WalletTransactionConfirm(WalletTransactionConfirmResponse),

    #[serde(rename = "wallet:transaction:cancel")]
    WalletTransactionCancel(WalletTransactionCancelResponse),

    #[serde(rename = "wallet:transactions:list")]
    WalletTransactionsList(WalletTransactionsListResponse),

    #[serde(rename = "wallet:transactions:refresh")]
    WalletTransactionsRefresh(WalletTransactionsRefreshResponse),

    #[serde(rename = "wallet:backup:export")]
    WalletBackupExport(WalletBackupExportResponse),

    #[serde(rename = "catalog:list")]
    CatalogList(CatalogListResponse),

    #[serde(rename = "catalog:sync:manifest")]
    CatalogSyncManifest(CatalogSyncManifestResponse),

    #[serde(rename = "catalog:folder:list")]
    CatalogFolderList(CatalogFolderPageResponse),

    #[serde(rename = "catalog:folder:batch")]
    CatalogFolderBatch(CatalogFolderBatchResponse),

    #[serde(rename = "catalog:notes:list")]
    CatalogNotesList(CatalogNotesListResponse),

    #[serde(rename = "catalog:createDir")]
    CatalogCreateDir(NodeCreatedResponse),

    #[serde(rename = "catalog:rename")]
    CatalogRename {},

    #[serde(rename = "catalog:delete")]
    CatalogDelete {},

    #[serde(rename = "catalog:move")]
    CatalogMove {},

    #[serde(rename = "catalog:upload")]
    CatalogUpload(UploadResponse),

    #[serde(rename = "catalog:file:replace")]
    CatalogFileReplace(CatalogFileReplaceResponse),

    #[serde(rename = "catalog:download")]
    CatalogDownload {},

    #[serde(rename = "catalog:source:metadata")]
    CatalogSourceMetadata(SourceMetadataResponse),

    #[serde(rename = "catalog:media:inspect")]
    CatalogMediaInspect(CatalogMediaInspectResponse),

    #[serde(rename = "catalog:secret:read")]
    CatalogSecretRead {},

    #[serde(rename = "catalog:secret:write")]
    CatalogSecretWrite {},

    #[serde(rename = "catalog:secret:erase")]
    CatalogSecretErase {},

    #[serde(rename = "catalog:derivative:read")]
    CatalogDerivativeRead {},

    #[serde(rename = "catalog:derivative:write")]
    CatalogDerivativeWrite {},

    #[serde(rename = "catalog:derivative:stats")]
    CatalogDerivativeStats(DerivativeStatsResponse),

    #[serde(rename = "catalog:derivative:compact")]
    CatalogDerivativeCompact(DerivativeStatsResponse),

    #[serde(rename = "catalog:shard:list")]
    CatalogShardList(ListShardsResponse),

    #[serde(rename = "catalog:shard:load")]
    CatalogShardLoad(LoadShardResponse),

    #[serde(rename = "catalog:sync:shard")]
    CatalogShardSync(SyncShardResponse),

    #[serde(rename = "catalog:shard:compact")]
    CatalogShardCompact(CompactShardResponse),

    #[serde(rename = "credential_provider:status")]
    CredentialProviderStatus(CredentialProviderStatusResponse),

    #[serde(rename = "credential_provider:session:open")]
    CredentialProviderSessionOpen(CredentialProviderSessionResponse),

    #[serde(rename = "credential_provider:session:close")]
    CredentialProviderSessionClose {},

    #[serde(rename = "credential_provider:list")]
    CredentialProviderList {
        candidates: Vec<CredentialCandidate>,
    },

    #[serde(rename = "credential_provider:search")]
    CredentialProviderSearch {
        candidates: Vec<CredentialCandidate>,
    },

    #[serde(rename = "credential_provider:getSecret")]
    CredentialProviderGetSecret(CredentialSecret),

    #[serde(rename = "credential_provider:recordUse")]
    CredentialProviderRecordUse {},

    #[serde(rename = "credential_provider:passkey:create")]
    CredentialProviderPasskeyCreate(CredentialProviderPasskeyCommandResponse),

    #[serde(rename = "credential_provider:passkey:get")]
    CredentialProviderPasskeyGet(CredentialProviderPasskeyCommandResponse),

    #[serde(rename = "credential_provider:passkey:query")]
    CredentialProviderPasskeyQuery { passkeys: Value },

    #[serde(rename = "passkeys:list")]
    PasskeysList(VaultPasskeysListResponse),

    #[serde(rename = "passkeys:delete")]
    PasskeysDelete(VaultPasskeyDeleteResponse),

    #[serde(rename = "passmanager:entry:save")]
    PassmanagerEntrySave { entry_id: String },

    #[serde(rename = "passmanager:entry:read")]
    PassmanagerEntryRead { entry: Value },

    #[serde(rename = "passmanager:entry:delete")]
    PassmanagerEntryDelete {},

    #[serde(rename = "passmanager:entry:move")]
    PassmanagerEntryMove {},

    #[serde(rename = "passmanager:entry:rename")]
    PassmanagerEntryRename {},

    #[serde(rename = "passmanager:entry:list")]
    PassmanagerEntryList { entries: Value, folders: Value },

    #[serde(rename = "passmanager:secret:save")]
    PassmanagerSecretSave {},

    #[serde(rename = "passmanager:secret:read")]
    PassmanagerSecretReadDomain { value: String },

    #[serde(rename = "passmanager:secret:delete")]
    PassmanagerSecretDelete {},

    #[serde(rename = "passmanager:group:ensure")]
    PassmanagerGroupEnsure {},

    #[serde(rename = "passmanager:group:setMeta")]
    PassmanagerGroupSetMeta {},

    #[serde(rename = "passmanager:group:list")]
    PassmanagerGroupList { groups: Value },

    #[serde(rename = "passmanager:group:delete")]
    PassmanagerGroupDelete {},

    #[serde(rename = "passmanager:root:import")]
    PassmanagerRootImport {},

    #[serde(rename = "passmanager:root:export")]
    PassmanagerRootExport { root: Value },

    #[serde(rename = "passmanager:icon:put")]
    PassmanagerIconPut {
        icon_ref: String,
        mime_type: String,
        background_color: Option<String>,
        width: u32,
        height: u32,
        #[cfg_attr(feature = "ts-bindings", ts(type = "number"))]
        bytes: u64,
    },

    #[serde(rename = "passmanager:icon:get")]
    PassmanagerIconGet {
        icon_ref: String,
        mime_type: String,
        background_color: Option<String>,
        content_base64: String,
    },

    #[serde(rename = "passmanager:icon:list")]
    PassmanagerIconList { icons: Value },

    #[serde(rename = "passmanager:icon:setMeta")]
    PassmanagerIconSetMeta {},

    #[serde(rename = "passmanager:icon:gc")]
    PassmanagerIconGc {
        #[cfg_attr(feature = "ts-bindings", ts(type = "number"))]
        deleted: u64,
    },

    #[serde(rename = "passmanager:otp:generate")]
    PassmanagerOtpGenerate { otp: String },

    #[serde(rename = "passmanager:otp:setSecret")]
    PassmanagerOtpSetSecret {},

    #[serde(rename = "passmanager:otp:removeSecret")]
    PassmanagerOtpRemoveSecret {},
}
