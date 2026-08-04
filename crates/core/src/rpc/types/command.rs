//! RPC command discriminated union (request types)

use std::collections::BTreeMap;

use serde::{Deserialize, Serialize};
use serde_json::Value;

use crate::license::SignedCert;

use super::{
    CatalogFilePatchRange, CatalogFileReplaceConflictMode, CatalogFolderFilter,
    CatalogFolderPageRequest, CatalogFolderSort, DerivativeProtectedRevision,
    EnvProfileCreateRequest, EnvProfileDeleteRequest, EnvProfileGetRequest, EnvProfileListRequest,
    EnvProfileUpdateRequest, EnvRuntimeStatusRequest, EnvSecretCreateRequest,
    EnvSecretDeleteRequest, EnvSecretListRequest, EnvSecretRevealRequest, EnvSecretUpdateRequest,
    WalletAccountsDeriveRequest, WalletAccountsListRequest, WalletAddressBookCreateRequest,
    WalletAddressBookDeleteRequest, WalletAddressBookListRequest, WalletAddressBookUpdateRequest,
    WalletAddressesDeriveRequest, WalletBackupExportRequest, WalletBalanceGetRequest,
    WalletHdCreateRequest, WalletHdGenerateMnemonicRequest, WalletImportCreateRequest,
    WalletListRequest, WalletSpendAuthorizationCreateRequest,
    WalletSpendAuthorizationRevokeRequest, WalletStatusRequest, WalletTransactionCancelRequest,
    WalletTransactionConfirmRequest, WalletTransactionPrepareRequest,
    WalletTransactionQuoteRequest, WalletTransactionRebroadcastRequest,
    WalletTransactionsListRequest, WalletTransactionsRefreshRequest, WalletTransactionsSyncRequest,
};

#[cfg(feature = "ts-bindings")]
use ts_rs::TS;

#[derive(Debug, Clone, PartialEq, Eq, Serialize, Deserialize)]
#[cfg_attr(feature = "ts-bindings", derive(TS))]
#[cfg_attr(feature = "ts-bindings", ts(export))]
#[cfg_attr(feature = "ts-bindings", ts(type = "number | null"))]
#[serde(transparent)]
pub struct CredentialAuditStrengthScore(pub Option<u8>);

#[derive(Debug, Clone, PartialEq, Eq, Serialize, Deserialize)]
#[cfg_attr(feature = "ts-bindings", derive(TS))]
#[cfg_attr(feature = "ts-bindings", ts(export))]
#[serde(rename_all = "camelCase", deny_unknown_fields)]
pub struct CredentialAuditEntrySummary {
    pub entry_id: String,
    pub weak_password: bool,
    pub reused_password: bool,
    pub has_two_factor: bool,
    pub strength_score: CredentialAuditStrengthScore,
}

#[derive(Debug, Clone, PartialEq, Eq, Serialize, Deserialize)]
#[cfg_attr(feature = "ts-bindings", derive(TS))]
#[cfg_attr(feature = "ts-bindings", ts(export))]
#[serde(rename_all = "camelCase", deny_unknown_fields)]
pub struct CredentialSecurityAuditArtifactV1 {
    pub version: u8,
    pub algorithm_version: u8,
    pub revision: String,
    #[cfg_attr(feature = "ts-bindings", ts(type = "number"))]
    pub generated_at: u64,
    pub entries: BTreeMap<String, CredentialAuditEntrySummary>,
    pub failed_entry_ids: Vec<String>,
}

#[derive(Debug, Clone, PartialEq, Eq, Serialize, Deserialize)]
#[cfg_attr(feature = "ts-bindings", derive(TS))]
#[cfg_attr(feature = "ts-bindings", ts(export))]
#[serde(deny_unknown_fields)]
pub struct PassmanagerSecurityAuditGetRequest {}

#[derive(Debug, Clone, PartialEq, Eq, Serialize, Deserialize)]
#[cfg_attr(feature = "ts-bindings", derive(TS))]
#[cfg_attr(feature = "ts-bindings", ts(export))]
#[serde(deny_unknown_fields)]
pub struct PassmanagerSecurityAuditSetRequest {
    pub artifact: CredentialSecurityAuditArtifactV1,
}

#[derive(Debug, Clone, PartialEq, Eq, Serialize, Deserialize)]
#[cfg_attr(feature = "ts-bindings", derive(TS))]
#[cfg_attr(feature = "ts-bindings", ts(export))]
#[serde(deny_unknown_fields)]
pub struct PassmanagerEntryCreateSecrets {
    pub password: Option<String>,
    pub note: Option<String>,
    pub card_pan: Option<String>,
    pub card_cvv: Option<String>,
}

/// All RPC commands as discriminated union (request types)
#[derive(Debug, Clone, Serialize, Deserialize)]
#[cfg_attr(feature = "ts-bindings", derive(TS))]
#[cfg_attr(feature = "ts-bindings", ts(export))]
#[serde(tag = "command", content = "data")]
pub enum RpcCommand {
    // === System commands ===
    #[serde(rename = "ping")]
    Ping {},

    #[serde(rename = "pong")]
    Pong {},

    #[serde(rename = "core:capabilities")]
    CoreCapabilities {},

    #[serde(rename = "license:fingerprint")]
    LicenseFingerprint {},

    #[serde(rename = "license:install")]
    LicenseInstall { cert: SignedCert },

    #[serde(rename = "license:cert")]
    LicenseCert {},

    #[serde(rename = "license:uninstall")]
    LicenseUninstall {},

    #[serde(rename = "license:status")]
    LicenseStatus {},

    // === Vault commands ===
    #[serde(rename = "vault:unlock")]
    VaultUnlock { password: String },

    #[serde(rename = "vault:repair:diagnose")]
    VaultRepairDiagnose { password: String },

    #[serde(rename = "vault:repair:apply")]
    VaultRepairApply {
        password: String,
        repair_id: String,
        allow_lossy: bool,
    },

    #[serde(rename = "vault:lock")]
    VaultLock {},

    #[serde(rename = "vault:status")]
    VaultStatus {},

    #[serde(rename = "vault:rekey")]
    VaultRekey {
        current_password: String,
        new_password: String,
    },

    #[serde(rename = "master:rekey")]
    MasterRekey {
        current_password: String,
        new_master_password: String,
    },

    #[serde(rename = "admin:storage:gc:scan")]
    AdminStorageGcScan { include_system: Option<bool> },

    #[serde(rename = "admin:storage:gc:delete")]
    AdminStorageGcDelete { gc_id: String, confirm_delete: bool },

    // === Portable Vault Env Runtime domain ===
    #[serde(rename = "env_runtime:status")]
    EnvRuntimeStatus(EnvRuntimeStatusRequest),

    #[serde(rename = "env_runtime:secret:list")]
    EnvRuntimeSecretList(EnvSecretListRequest),

    #[serde(rename = "env_runtime:secret:create")]
    EnvRuntimeSecretCreate(EnvSecretCreateRequest),

    #[serde(rename = "env_runtime:secret:update")]
    EnvRuntimeSecretUpdate(EnvSecretUpdateRequest),

    #[serde(rename = "env_runtime:secret:reveal")]
    EnvRuntimeSecretReveal(EnvSecretRevealRequest),

    #[serde(rename = "env_runtime:secret:delete")]
    EnvRuntimeSecretDelete(EnvSecretDeleteRequest),

    #[serde(rename = "env_runtime:profile:list")]
    EnvRuntimeProfileList(EnvProfileListRequest),

    #[serde(rename = "env_runtime:profile:get")]
    EnvRuntimeProfileGet(EnvProfileGetRequest),

    #[serde(rename = "env_runtime:profile:create")]
    EnvRuntimeProfileCreate(EnvProfileCreateRequest),

    #[serde(rename = "env_runtime:profile:update")]
    EnvRuntimeProfileUpdate(EnvProfileUpdateRequest),

    #[serde(rename = "env_runtime:profile:delete")]
    EnvRuntimeProfileDelete(EnvProfileDeleteRequest),

    // === Wallet domain commands (SPEC-217) ===
    #[serde(rename = "wallet:status")]
    WalletStatus(WalletStatusRequest),

    #[serde(rename = "wallet:list")]
    WalletList(WalletListRequest),

    #[serde(rename = "wallet:hd:generateMnemonic")]
    WalletHdGenerateMnemonic(WalletHdGenerateMnemonicRequest),

    #[serde(rename = "wallet:hd:create")]
    WalletHdCreate(WalletHdCreateRequest),

    #[serde(rename = "wallet:import:create")]
    WalletImportCreate(WalletImportCreateRequest),

    #[serde(rename = "wallet:accounts:list")]
    WalletAccountsList(WalletAccountsListRequest),

    #[serde(rename = "wallet:accounts:derive")]
    WalletAccountsDerive(WalletAccountsDeriveRequest),

    #[serde(rename = "wallet:addresses:derive")]
    WalletAddressesDerive(WalletAddressesDeriveRequest),

    #[serde(rename = "wallet:balance:get")]
    WalletBalanceGet(WalletBalanceGetRequest),

    #[serde(rename = "wallet:transaction:quote")]
    WalletTransactionQuote(WalletTransactionQuoteRequest),

    #[serde(rename = "wallet:transaction:prepare")]
    WalletTransactionPrepare(WalletTransactionPrepareRequest),

    #[serde(rename = "wallet:transaction:confirm")]
    WalletTransactionConfirm(WalletTransactionConfirmRequest),

    #[serde(rename = "wallet:transaction:cancel")]
    WalletTransactionCancel(WalletTransactionCancelRequest),

    #[serde(rename = "wallet:transaction:rebroadcast")]
    WalletTransactionRebroadcast(WalletTransactionRebroadcastRequest),

    #[serde(rename = "wallet:transactions:list")]
    WalletTransactionsList(WalletTransactionsListRequest),

    #[serde(rename = "wallet:transactions:refresh")]
    WalletTransactionsRefresh(WalletTransactionsRefreshRequest),

    #[serde(rename = "wallet:transactions:sync")]
    WalletTransactionsSync(WalletTransactionsSyncRequest),

    #[serde(rename = "wallet:backup:export")]
    WalletBackupExport(WalletBackupExportRequest),

    #[serde(rename = "wallet:spendAuthorization:create")]
    WalletSpendAuthorizationCreate(WalletSpendAuthorizationCreateRequest),

    #[serde(rename = "wallet:spendAuthorization:revoke")]
    WalletSpendAuthorizationRevoke(WalletSpendAuthorizationRevokeRequest),

    #[serde(rename = "wallet:addressBook:list")]
    WalletAddressBookList(WalletAddressBookListRequest),

    #[serde(rename = "wallet:addressBook:create")]
    WalletAddressBookCreate(WalletAddressBookCreateRequest),

    #[serde(rename = "wallet:addressBook:update")]
    WalletAddressBookUpdate(WalletAddressBookUpdateRequest),

    #[serde(rename = "wallet:addressBook:delete")]
    WalletAddressBookDelete(WalletAddressBookDeleteRequest),

    // === Catalog navigation ===
    #[serde(rename = "catalog:list")]
    CatalogList {
        path: Option<String>,
        include_hidden: Option<bool>,
    },

    #[serde(rename = "catalog:sync:manifest")]
    CatalogSyncManifest {},

    #[serde(rename = "catalog:folder:list")]
    CatalogFolderList {
        path: String,
        #[cfg_attr(feature = "ts-bindings", ts(type = "number"))]
        offset: u64,
        #[cfg_attr(feature = "ts-bindings", ts(type = "number | null"))]
        limit: Option<u64>,
        #[cfg_attr(feature = "ts-bindings", ts(type = "number | null"))]
        expected_version: Option<u64>,
        sort: Option<CatalogFolderSort>,
        filter: Option<CatalogFolderFilter>,
    },

    #[serde(rename = "catalog:folder:batch")]
    CatalogFolderBatch {
        pages: Vec<CatalogFolderPageRequest>,
    },

    #[serde(rename = "catalog:notes:list")]
    CatalogNotesList {},

    #[serde(rename = "catalog:file-links:complete")]
    CatalogFileLinksComplete {
        query: String,
        #[cfg_attr(feature = "ts-bindings", ts(type = "number | null"))]
        limit: Option<u64>,
        #[cfg_attr(feature = "ts-bindings", ts(type = "string | null"))]
        current_path: Option<String>,
    },

    #[serde(rename = "catalog:file-links:resolve")]
    CatalogFileLinksResolve { targets: Vec<String> },

    // === Catalog CRUD ===
    #[serde(rename = "catalog:createDir")]
    CatalogCreateDir {
        name: String,
        parent_path: Option<String>,
    },

    #[serde(rename = "catalog:rename")]
    CatalogRename {
        #[cfg_attr(feature = "ts-bindings", ts(type = "number"))]
        node_id: u64,
        new_name: String,
    },

    #[serde(rename = "catalog:delete")]
    CatalogDelete {
        #[cfg_attr(feature = "ts-bindings", ts(type = "number"))]
        node_id: u64,
    },

    #[serde(rename = "catalog:move")]
    CatalogMove {
        #[cfg_attr(feature = "ts-bindings", ts(type = "number"))]
        node_id: u64,
        new_parent_path: String,
        new_name: Option<String>,
        replace_existing: Option<bool>,
    },

    #[serde(rename = "catalog:trash")]
    CatalogTrash {
        #[cfg_attr(feature = "ts-bindings", ts(type = "number"))]
        node_id: u64,
    },

    #[serde(rename = "catalog:trash:list")]
    CatalogTrashList {},

    #[serde(rename = "catalog:trash:restore")]
    CatalogTrashRestore {
        #[cfg_attr(feature = "ts-bindings", ts(type = "number"))]
        node_id: u64,
        restore_parent_path: Option<String>,
        new_name: Option<String>,
    },

    #[serde(rename = "catalog:trash:empty")]
    CatalogTrashEmpty {},

    #[serde(rename = "catalog:exchange")]
    CatalogExchange {
        #[cfg_attr(feature = "ts-bindings", ts(type = "number"))]
        src_node_id: u64,
        #[cfg_attr(feature = "ts-bindings", ts(type = "number"))]
        dst_node_id: u64,
    },

    // === File transfer ===
    #[serde(rename = "catalog:upload")]
    CatalogUpload {
        #[cfg_attr(feature = "ts-bindings", ts(type = "number"))]
        node_id: Option<u64>,
        parent_path: Option<String>,
        name: Option<String>,
        #[cfg_attr(feature = "ts-bindings", ts(type = "number"))]
        size: u64,
        #[cfg_attr(feature = "ts-bindings", ts(type = "number | null"))]
        total_size: Option<u64>,
        #[cfg_attr(feature = "ts-bindings", ts(type = "number | null"))]
        offset: Option<u64>,
        mime_type: Option<String>,
        chunk_size: Option<u32>,
        finish: Option<bool>,
    },

    #[serde(rename = "catalog:file:replace")]
    CatalogFileReplace {
        #[cfg_attr(feature = "ts-bindings", ts(type = "number"))]
        node_id: u64,
        #[cfg_attr(feature = "ts-bindings", ts(type = "number"))]
        size: u64,
        mime_type: Option<String>,
        #[cfg_attr(feature = "ts-bindings", ts(type = "number | null"))]
        expected_source_revision: Option<u64>,
        conflict_mode: Option<CatalogFileReplaceConflictMode>,
    },

    #[serde(rename = "catalog:file:patch")]
    CatalogFilePatch {
        #[cfg_attr(feature = "ts-bindings", ts(type = "number"))]
        node_id: u64,
        #[cfg_attr(feature = "ts-bindings", ts(type = "number"))]
        size: u64,
        mime_type: Option<String>,
        #[cfg_attr(feature = "ts-bindings", ts(type = "number | null"))]
        expected_source_revision: Option<u64>,
        conflict_mode: Option<CatalogFileReplaceConflictMode>,
        patches: Vec<CatalogFilePatchRange>,
    },

    #[serde(rename = "catalog:download")]
    CatalogDownload {
        #[cfg_attr(feature = "ts-bindings", ts(type = "number"))]
        node_id: u64,
    },

    #[serde(rename = "catalog:downloadRange")]
    CatalogDownloadRange {
        #[cfg_attr(feature = "ts-bindings", ts(type = "number"))]
        node_id: u64,
        #[cfg_attr(feature = "ts-bindings", ts(type = "number"))]
        offset: u64,
        #[cfg_attr(feature = "ts-bindings", ts(type = "number"))]
        length: u64,
        #[cfg_attr(feature = "ts-bindings", ts(type = "number"))]
        expected_source_revision: u64,
    },

    #[serde(rename = "catalog:source:metadata")]
    CatalogSourceMetadata {
        #[cfg_attr(feature = "ts-bindings", ts(type = "number"))]
        node_id: u64,
    },

    #[serde(rename = "catalog:media:inspect")]
    CatalogMediaInspect {
        #[cfg_attr(feature = "ts-bindings", ts(type = "number"))]
        node_id: u64,
    },

    // === Secrets ===
    #[serde(rename = "catalog:secret:read")]
    CatalogSecretRead {
        #[cfg_attr(feature = "ts-bindings", ts(type = "number"))]
        node_id: u64,
    },

    #[serde(rename = "catalog:secret:write")]
    CatalogSecretWrite {
        #[cfg_attr(feature = "ts-bindings", ts(type = "number"))]
        node_id: u64,
        #[cfg_attr(feature = "ts-bindings", ts(type = "number"))]
        size: u64,
    },

    #[serde(rename = "catalog:secret:erase")]
    CatalogSecretErase {
        #[cfg_attr(feature = "ts-bindings", ts(type = "number"))]
        node_id: u64,
    },

    #[serde(rename = "catalog:derivative:read")]
    CatalogDerivativeRead {
        #[cfg_attr(feature = "ts-bindings", ts(type = "number"))]
        node_id: u64,
        #[cfg_attr(feature = "ts-bindings", ts(type = "number"))]
        source_version: u64,
        tier: String,
        version: u32,
    },

    #[serde(rename = "catalog:derivative:write")]
    CatalogDerivativeWrite {
        #[cfg_attr(feature = "ts-bindings", ts(type = "number"))]
        node_id: u64,
        #[cfg_attr(feature = "ts-bindings", ts(type = "number"))]
        source_version: u64,
        tier: String,
        version: u32,
        #[cfg_attr(feature = "ts-bindings", ts(type = "number"))]
        size: u64,
        name: String,
        mime_type: String,
        file_extension: String,
        chunk_size: u32,
    },

    #[serde(rename = "catalog:derivative:stats")]
    CatalogDerivativeStats {},

    #[serde(rename = "catalog:derivative:compact")]
    CatalogDerivativeCompact {
        #[cfg_attr(feature = "ts-bindings", ts(type = "number"))]
        max_indexed_bytes: u64,
        protected_revisions: Vec<DerivativeProtectedRevision>,
    },

    // === Shard commands (v2) ===
    #[serde(rename = "catalog:shard:list")]
    CatalogShardList {},

    #[serde(rename = "catalog:shard:load")]
    CatalogShardLoad { shard_id: String },

    #[serde(rename = "catalog:sync:shard")]
    CatalogShardSync {
        shard_id: String,
        #[cfg_attr(feature = "ts-bindings", ts(type = "number"))]
        from_version: u64,
    },

    #[serde(rename = "catalog:shard:compact")]
    CatalogShardCompact { shard_id: String },

    // === Credential Provider (ADR-020) ===
    #[serde(rename = "credential_provider:status")]
    CredentialProviderStatus {},

    #[serde(rename = "credential_provider:session:open")]
    CredentialProviderSessionOpen {},

    #[serde(rename = "credential_provider:session:close")]
    CredentialProviderSessionClose { provider_session: String },

    #[serde(rename = "credential_provider:list")]
    CredentialProviderList { context: Value },

    #[serde(rename = "credential_provider:search")]
    CredentialProviderSearch {
        query: String,
        context: Option<Value>,
    },

    #[serde(rename = "credential_provider:getSecret")]
    CredentialProviderGetSecret {
        provider_session: String,
        credential_id: String,
        otp_id: Option<String>,
        context: Option<Value>,
    },

    #[serde(rename = "credential_provider:getOneTimeCode")]
    CredentialProviderGetOneTimeCode {
        provider_session: String,
        credential_id: String,
        otp_id: String,
        context: Value,
    },

    #[serde(rename = "credential_provider:recordUse")]
    CredentialProviderRecordUse {
        provider_session: Option<String>,
        credential_id: String,
        context: Option<Value>,
    },

    #[serde(rename = "credential_provider:passkey:create")]
    CredentialProviderPasskeyCreate {
        platform: String,
        #[cfg_attr(feature = "ts-bindings", ts(type = "number | null"))]
        platform_version_major: Option<u64>,
        request: Option<Value>,
    },

    #[serde(rename = "credential_provider:passkey:get")]
    CredentialProviderPasskeyGet {
        platform: String,
        #[cfg_attr(feature = "ts-bindings", ts(type = "number | null"))]
        platform_version_major: Option<u64>,
        request: Option<Value>,
    },

    #[serde(rename = "credential_provider:passkey:query")]
    CredentialProviderPasskeyQuery {
        platform: String,
        #[cfg_attr(feature = "ts-bindings", ts(type = "number | null"))]
        platform_version_major: Option<u64>,
        request: Option<Value>,
    },

    // === Passkeys domain commands (ADR-034) ===
    #[serde(rename = "passkeys:list")]
    PasskeysList {},

    #[serde(rename = "passkeys:delete")]
    PasskeysDelete {
        #[serde(
            rename = "credentialIdB64Url",
            alias = "credential_id_b64url",
            alias = "credentialId"
        )]
        credential_id_b64url: String,
    },

    // === PassManager domain commands (ADR-028) ===
    #[serde(rename = "passmanager:entry:create")]
    PassmanagerEntryCreate {
        entry_id: String,
        title: String,
        entry_type: String,
        #[cfg_attr(feature = "ts-bindings", ts(type = "number | null"))]
        created_ts: Option<u64>,
        #[cfg_attr(feature = "ts-bindings", ts(type = "number | null"))]
        updated_ts: Option<u64>,
        urls: Option<Value>,
        username: Option<String>,
        otps: Option<Value>,
        payment_card: Option<Value>,
        group_path: Option<String>,
        icon_ref: Option<String>,
        tags: Option<Vec<String>>,
        secrets: PassmanagerEntryCreateSecrets,
    },

    #[serde(rename = "passmanager:entry:save")]
    PassmanagerEntrySave {
        entry_id: Option<String>,
        #[serde(alias = "importSource")]
        import_source: Option<Value>,
        title: String,
        entry_type: Option<String>,
        urls: Option<Vec<String>>,
        username: Option<String>,
        payment_card: Option<Value>,
        group_path: Option<String>,
        icon_ref: Option<String>,
        tags: Option<Vec<String>>,
    },

    #[serde(rename = "passmanager:entry:read")]
    PassmanagerEntryRead { entry_id: String },

    #[serde(rename = "passmanager:entry:delete")]
    PassmanagerEntryDelete { entry_id: String },

    #[serde(rename = "passmanager:entry:move")]
    PassmanagerEntryMove {
        entry_id: String,
        target_group_path: String,
    },

    #[serde(rename = "passmanager:entry:rename")]
    PassmanagerEntryRename { entry_id: String, new_title: String },

    #[serde(rename = "passmanager:entry:list")]
    PassmanagerEntryList {},

    #[serde(rename = "passmanager:secret:save")]
    PassmanagerSecretSave {
        entry_id: String,
        secret_type: String,
        value: String,
    },

    #[serde(rename = "passmanager:secret:read")]
    PassmanagerSecretReadDomain {
        entry_id: String,
        secret_type: String,
    },

    #[serde(rename = "passmanager:secret:delete")]
    PassmanagerSecretDelete {
        entry_id: String,
        secret_type: String,
    },

    #[serde(rename = "passmanager:ssh:list")]
    PassmanagerSshList {},

    #[serde(rename = "passmanager:ssh:key:update")]
    PassmanagerSshKeyUpdate { key: Value },

    #[serde(rename = "passmanager:ssh:key:delete")]
    PassmanagerSshKeyDelete { key_id: String },

    #[serde(rename = "passmanager:ssh:secret:read")]
    PassmanagerSshSecretRead { key_id: String, secret_type: String },

    #[serde(rename = "passmanager:ssh:secret:save")]
    PassmanagerSshSecretSave {
        key_id: String,
        secret_type: String,
        value: String,
    },

    #[serde(rename = "passmanager:ssh:secret:delete")]
    PassmanagerSshSecretDelete { key_id: String, secret_type: String },

    #[serde(rename = "passmanager:group:ensure")]
    PassmanagerGroupEnsure { path: String },

    #[serde(rename = "passmanager:group:setMeta")]
    PassmanagerGroupSetMeta {
        path: String,
        icon_ref: Option<String>,
        description: Option<String>,
    },

    #[serde(rename = "passmanager:group:list")]
    PassmanagerGroupList {},

    #[serde(rename = "passmanager:group:delete")]
    PassmanagerGroupDelete { path: String },

    #[serde(rename = "passmanager:root:import")]
    PassmanagerRootImport {
        entries: Value,
        folders: Value,
        folders_meta: Option<Value>,
        ssh_keys: Option<Value>,
    },

    #[serde(rename = "passmanager:root:export")]
    PassmanagerRootExport {},

    #[serde(rename = "passmanager:icon:put")]
    PassmanagerIconPut {
        content_base64: String,
        mime_type: Option<String>,
        background_color: Option<String>,
    },

    #[serde(rename = "passmanager:icon:get")]
    PassmanagerIconGet { icon_ref: String },

    #[serde(rename = "passmanager:icon:getMany")]
    PassmanagerIconGetMany { icon_refs: Vec<String> },

    #[serde(rename = "passmanager:icon:list")]
    PassmanagerIconList {},

    #[serde(rename = "passmanager:icon:setMeta")]
    PassmanagerIconSetMeta {
        icon_ref: String,
        background_color: Option<String>,
    },

    #[serde(rename = "passmanager:icon:gc")]
    PassmanagerIconGc {},

    #[serde(rename = "passmanager:securityAudit:get")]
    PassmanagerSecurityAuditGet(PassmanagerSecurityAuditGetRequest),

    #[serde(rename = "passmanager:securityAudit:set")]
    PassmanagerSecurityAuditSet(PassmanagerSecurityAuditSetRequest),

    #[serde(rename = "passmanager:otp:generate")]
    PassmanagerOtpGenerate {
        #[cfg_attr(feature = "ts-bindings", ts(type = "number | null"))]
        node_id: Option<u64>,
        otp_id: Option<String>,
        entry_id: Option<String>,
        label: Option<String>,
        ha: Option<String>,
        period: Option<u32>,
        digits: Option<u8>,
        #[cfg_attr(feature = "ts-bindings", ts(type = "number | null"))]
        ts: Option<u64>,
        #[cfg_attr(feature = "ts-bindings", ts(type = "number | null"))]
        counter: Option<u64>,
    },

    #[serde(rename = "passmanager:otp:preview")]
    PassmanagerOtpPreview {
        secret: String,
        encoding: Option<String>,
        algorithm: Option<String>,
        digits: Option<u8>,
        period: Option<u32>,
        #[serde(rename = "type")]
        otp_type: Option<String>,
        #[cfg_attr(feature = "ts-bindings", ts(type = "number | null"))]
        counter: Option<u64>,
        #[cfg_attr(feature = "ts-bindings", ts(type = "number | null"))]
        ts: Option<u64>,
    },

    #[serde(rename = "passmanager:otp:setSecret")]
    PassmanagerOtpSetSecret {
        otp_id: Option<String>,
        entry_id: Option<String>,
        label: Option<String>,
        secret: String,
        encoding: Option<String>,
        algorithm: Option<String>,
        digits: Option<u8>,
        period: Option<u32>,
        #[serde(rename = "type")]
        otp_type: Option<String>,
        #[cfg_attr(feature = "ts-bindings", ts(type = "number | null"))]
        counter: Option<u64>,
    },

    #[serde(rename = "passmanager:otp:removeSecret")]
    PassmanagerOtpRemoveSecret {
        #[cfg_attr(feature = "ts-bindings", ts(type = "number | null"))]
        node_id: Option<u64>,
        otp_id: Option<String>,
        entry_id: Option<String>,
        label: Option<String>,
    },

    #[serde(rename = "passmanager:otp:renameSecret")]
    PassmanagerOtpRenameSecret {
        otp_id: Option<String>,
        entry_id: Option<String>,
        previous_label: String,
        next_label: String,
    },
}
