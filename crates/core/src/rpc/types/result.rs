//! RPC command result discriminated union (response types)

use serde::{Deserialize, Serialize};
use serde_json::Value;

use crate::license::{EntitlementSnapshot, SignedCert};

#[cfg(feature = "ts-bindings")]
use ts_rs::TS;

use super::{
    AgentProfileMetadataV1, AgentSecretMetadataV1, CatalogFileLinksCompleteResponse,
    CatalogFileLinksResolveResponse, CatalogFileReplaceResponse, CatalogFolderBatchResponse,
    CatalogFolderPageResponse, CatalogListResponse, CatalogMediaInspectResponse,
    CatalogNotesListResponse, CatalogSyncManifestResponse, CatalogTrashEmptyResponse,
    CatalogTrashListResponse, CatalogTrashResponse, CatalogTrashRestoreResponse,
    CompactShardResponse, CoreCapabilitiesResponse, CredentialCandidate, CredentialOneTimeCode,
    CredentialProviderPasskeyCommandResponse, CredentialProviderSessionResponse,
    CredentialProviderStatusResponse, CredentialSecret, CredentialSecurityAuditArtifactV1,
    DerivativeStatsResponse, EnvDeleteResponse, EnvRuntimeStatusResponse, EnvSecretRevealResponse,
    ListShardsResponse, LoadShardResponse, MasterRekeyResponse, NodeCreatedResponse,
    OtpPreviewResponse, SourceMetadataResponse, SyncShardResponse, UploadResponse,
    VaultPasskeyDeleteResponse, VaultPasskeysListResponse, VaultRekeyResponse,
    VaultRepairApplyResponse, VaultRepairDiagnosisResponse, VaultStatusResponse,
    VaultUnlockResponse, WalletAccountsDeriveResponse, WalletAccountsListResponse,
    WalletAddressBookCreateResponse, WalletAddressBookDeleteResponse,
    WalletAddressBookListResponse, WalletAddressBookUpdateResponse, WalletAddressesDeriveResponse,
    WalletBackupExportResponse, WalletBalanceGetResponse, WalletHdCreateResponse,
    WalletHdGenerateMnemonicResponse, WalletImportCreateResponse, WalletListResponse,
    WalletSpendAuthorizationCreateResponse, WalletSpendAuthorizationRevokeResponse,
    WalletStatusResponse, WalletTransactionCancelResponse, WalletTransactionConfirmResponse,
    WalletTransactionPrepareResponse, WalletTransactionQuoteResponse,
    WalletTransactionRebroadcastResponse, WalletTransactionsListResponse,
    WalletTransactionsRefreshResponse, WalletTransactionsSyncResponse,
};

#[derive(Debug, Clone, PartialEq, Eq, Serialize, Deserialize)]
#[cfg_attr(feature = "ts-bindings", derive(TS))]
#[cfg_attr(feature = "ts-bindings", ts(export))]
pub struct PassmanagerSecurityAuditGetResult {
    pub artifact: Option<CredentialSecurityAuditArtifactV1>,
}

#[derive(Debug, Clone, PartialEq, Eq, Serialize, Deserialize)]
#[cfg_attr(feature = "ts-bindings", derive(TS))]
#[cfg_attr(feature = "ts-bindings", ts(export))]
pub struct PassmanagerSecurityAuditSetResult {}

#[derive(Debug, Clone, PartialEq, Eq, Serialize, Deserialize)]
#[cfg_attr(feature = "ts-bindings", derive(TS))]
#[cfg_attr(feature = "ts-bindings", ts(export))]
pub struct PassmanagerGroupSummary {
    pub path: String,
    pub entry_count: usize,
}

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
    VaultUnlock(VaultUnlockResponse),

    #[serde(rename = "vault:repair:diagnose")]
    VaultRepairDiagnose(VaultRepairDiagnosisResponse),

    #[serde(rename = "vault:repair:apply")]
    VaultRepairApply(VaultRepairApplyResponse),

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

    #[serde(rename = "env_runtime:status")]
    EnvRuntimeStatus(EnvRuntimeStatusResponse),

    #[serde(rename = "env_runtime:secret:list")]
    EnvRuntimeSecretList(Vec<AgentSecretMetadataV1>),

    #[serde(rename = "env_runtime:secret:create")]
    EnvRuntimeSecretCreate(AgentSecretMetadataV1),

    #[serde(rename = "env_runtime:secret:update")]
    EnvRuntimeSecretUpdate(AgentSecretMetadataV1),

    #[serde(rename = "env_runtime:secret:reveal")]
    EnvRuntimeSecretReveal(EnvSecretRevealResponse),

    #[serde(rename = "env_runtime:secret:delete")]
    EnvRuntimeSecretDelete(EnvDeleteResponse),

    #[serde(rename = "env_runtime:profile:list")]
    EnvRuntimeProfileList(Vec<AgentProfileMetadataV1>),

    #[serde(rename = "env_runtime:profile:get")]
    EnvRuntimeProfileGet(AgentProfileMetadataV1),

    #[serde(rename = "env_runtime:profile:create")]
    EnvRuntimeProfileCreate(AgentProfileMetadataV1),

    #[serde(rename = "env_runtime:profile:update")]
    EnvRuntimeProfileUpdate(AgentProfileMetadataV1),

    #[serde(rename = "env_runtime:profile:delete")]
    EnvRuntimeProfileDelete(EnvDeleteResponse),

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

    #[serde(rename = "wallet:transaction:quote")]
    WalletTransactionQuote(WalletTransactionQuoteResponse),

    #[serde(rename = "wallet:transaction:prepare")]
    WalletTransactionPrepare(WalletTransactionPrepareResponse),

    #[serde(rename = "wallet:transaction:confirm")]
    WalletTransactionConfirm(WalletTransactionConfirmResponse),

    #[serde(rename = "wallet:transaction:cancel")]
    WalletTransactionCancel(WalletTransactionCancelResponse),

    #[serde(rename = "wallet:transaction:rebroadcast")]
    WalletTransactionRebroadcast(WalletTransactionRebroadcastResponse),

    #[serde(rename = "wallet:transactions:list")]
    WalletTransactionsList(WalletTransactionsListResponse),

    #[serde(rename = "wallet:transactions:refresh")]
    WalletTransactionsRefresh(WalletTransactionsRefreshResponse),

    #[serde(rename = "wallet:transactions:sync")]
    WalletTransactionsSync(WalletTransactionsSyncResponse),

    #[serde(rename = "wallet:backup:export")]
    WalletBackupExport(WalletBackupExportResponse),

    #[serde(rename = "wallet:spendAuthorization:create")]
    WalletSpendAuthorizationCreate(WalletSpendAuthorizationCreateResponse),

    #[serde(rename = "wallet:spendAuthorization:revoke")]
    WalletSpendAuthorizationRevoke(WalletSpendAuthorizationRevokeResponse),

    #[serde(rename = "wallet:addressBook:list")]
    WalletAddressBookList(WalletAddressBookListResponse),

    #[serde(rename = "wallet:addressBook:create")]
    WalletAddressBookCreate(WalletAddressBookCreateResponse),

    #[serde(rename = "wallet:addressBook:update")]
    WalletAddressBookUpdate(WalletAddressBookUpdateResponse),

    #[serde(rename = "wallet:addressBook:delete")]
    WalletAddressBookDelete(WalletAddressBookDeleteResponse),

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

    #[serde(rename = "catalog:file-links:complete")]
    CatalogFileLinksComplete(CatalogFileLinksCompleteResponse),

    #[serde(rename = "catalog:file-links:resolve")]
    CatalogFileLinksResolve(CatalogFileLinksResolveResponse),

    #[serde(rename = "catalog:createDir")]
    CatalogCreateDir(NodeCreatedResponse),

    #[serde(rename = "catalog:rename")]
    CatalogRename {},

    #[serde(rename = "catalog:delete")]
    CatalogDelete {},

    #[serde(rename = "catalog:move")]
    CatalogMove {},

    #[serde(rename = "catalog:trash")]
    CatalogTrash(CatalogTrashResponse),

    #[serde(rename = "catalog:trash:list")]
    CatalogTrashList(CatalogTrashListResponse),

    #[serde(rename = "catalog:trash:restore")]
    CatalogTrashRestore(CatalogTrashRestoreResponse),

    #[serde(rename = "catalog:trash:empty")]
    CatalogTrashEmpty(CatalogTrashEmptyResponse),

    #[serde(rename = "catalog:exchange")]
    CatalogExchange {},

    #[serde(rename = "catalog:upload")]
    CatalogUpload(UploadResponse),

    #[serde(rename = "catalog:file:replace")]
    CatalogFileReplace(CatalogFileReplaceResponse),

    #[serde(rename = "catalog:file:patch")]
    CatalogFilePatch(CatalogFileReplaceResponse),

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

    #[serde(rename = "credential_provider:getOneTimeCode")]
    CredentialProviderGetOneTimeCode(CredentialOneTimeCode),

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

    #[serde(rename = "passmanager:entry:create")]
    PassmanagerEntryCreate { entry_id: String },

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

    #[serde(rename = "passmanager:ssh:list")]
    PassmanagerSshList {
        #[serde(rename = "sshKeys")]
        ssh_keys: Value,
    },

    #[serde(rename = "passmanager:ssh:key:update")]
    PassmanagerSshKeyUpdate {},

    #[serde(rename = "passmanager:ssh:key:delete")]
    PassmanagerSshKeyDelete {},

    #[serde(rename = "passmanager:ssh:secret:read")]
    PassmanagerSshSecretRead { value: String },

    #[serde(rename = "passmanager:ssh:secret:save")]
    PassmanagerSshSecretSave {},

    #[serde(rename = "passmanager:ssh:secret:delete")]
    PassmanagerSshSecretDelete {},

    #[serde(rename = "passmanager:group:ensure")]
    PassmanagerGroupEnsure {},

    #[serde(rename = "passmanager:group:setMeta")]
    PassmanagerGroupSetMeta {},

    #[serde(rename = "passmanager:group:list")]
    PassmanagerGroupList {
        groups: Vec<PassmanagerGroupSummary>,
    },

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

    #[serde(rename = "passmanager:icon:getMany")]
    PassmanagerIconGetMany {
        icons: Value,
        missing_icon_refs: Vec<String>,
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

    #[serde(rename = "passmanager:securityAudit:get")]
    PassmanagerSecurityAuditGet(PassmanagerSecurityAuditGetResult),

    #[serde(rename = "passmanager:securityAudit:set")]
    PassmanagerSecurityAuditSet(PassmanagerSecurityAuditSetResult),

    #[serde(rename = "passmanager:otp:generate")]
    PassmanagerOtpGenerate { otp: String },

    #[serde(rename = "passmanager:otp:preview")]
    PassmanagerOtpPreview(OtpPreviewResponse),

    #[serde(rename = "passmanager:otp:setSecret")]
    PassmanagerOtpSetSecret {},

    #[serde(rename = "passmanager:otp:removeSecret")]
    PassmanagerOtpRemoveSecret {},

    #[serde(rename = "passmanager:otp:renameSecret")]
    PassmanagerOtpRenameSecret {},
}
