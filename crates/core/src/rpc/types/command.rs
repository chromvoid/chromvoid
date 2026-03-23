//! RPC command discriminated union (request types)

use serde::{Deserialize, Serialize};
use serde_json::Value;

#[cfg(feature = "ts-bindings")]
use ts_rs::TS;

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

    // === Vault commands ===
    #[serde(rename = "vault:unlock")]
    VaultUnlock { password: String },

    #[serde(rename = "vault:lock")]
    VaultLock {},

    #[serde(rename = "vault:status")]
    VaultStatus {},

    // === Catalog navigation ===
    #[serde(rename = "catalog:list")]
    CatalogList {
        path: Option<String>,
        include_hidden: Option<bool>,
    },

    #[serde(rename = "catalog:syncInit")]
    CatalogSyncInit {},

    #[serde(rename = "catalog:sync:delta")]
    CatalogSyncDelta {
        #[cfg_attr(feature = "ts-bindings", ts(type = "number"))]
        from_version: u64,
    },

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
    },

    // === File transfer ===
    #[serde(rename = "catalog:prepareUpload")]
    CatalogPrepareUpload {
        parent_path: String,
        name: String,
        #[cfg_attr(feature = "ts-bindings", ts(type = "number"))]
        size: u64,
        mime_type: Option<String>,
        chunk_size: Option<u32>,
    },

    #[serde(rename = "catalog:upload")]
    CatalogUpload {
        #[cfg_attr(feature = "ts-bindings", ts(type = "number"))]
        node_id: u64,
        #[cfg_attr(feature = "ts-bindings", ts(type = "number"))]
        size: u64,
    },

    #[serde(rename = "catalog:download")]
    CatalogDownload {
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

    // === Shard commands (v2) ===
    #[serde(rename = "catalog:shard:list")]
    CatalogShardList {},

    #[serde(rename = "catalog:shard:load")]
    CatalogShardLoad { shard_id: String },

    #[serde(rename = "catalog:shard:sync")]
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

    // === PassManager domain commands (ADR-028) ===
    #[serde(rename = "passmanager:entry:save")]
    PassmanagerEntrySave {
        entry_id: Option<String>,
        #[serde(alias = "importSource")]
        import_source: Option<Value>,
        title: String,
        urls: Option<Vec<String>>,
        username: Option<String>,
        group_path: Option<String>,
        icon_ref: Option<String>,
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

    #[serde(rename = "passmanager:group:ensure")]
    PassmanagerGroupEnsure { path: String },

    #[serde(rename = "passmanager:group:setMeta")]
    PassmanagerGroupSetMeta {
        path: String,
        icon_ref: Option<String>,
    },

    #[serde(rename = "passmanager:group:list")]
    PassmanagerGroupList {},

    #[serde(rename = "passmanager:root:import")]
    PassmanagerRootImport {
        entries: Value,
        folders: Value,
        folders_meta: Option<Value>,
    },

    #[serde(rename = "passmanager:root:export")]
    PassmanagerRootExport {},

    #[serde(rename = "passmanager:icon:put")]
    PassmanagerIconPut {
        content_base64: String,
        mime_type: Option<String>,
    },

    #[serde(rename = "passmanager:icon:get")]
    PassmanagerIconGet { icon_ref: String },

    #[serde(rename = "passmanager:icon:list")]
    PassmanagerIconList {},

    #[serde(rename = "passmanager:icon:gc")]
    PassmanagerIconGc {},

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
    },

    #[serde(rename = "passmanager:otp:removeSecret")]
    PassmanagerOtpRemoveSecret {
        #[cfg_attr(feature = "ts-bindings", ts(type = "number | null"))]
        node_id: Option<u64>,
        otp_id: Option<String>,
        entry_id: Option<String>,
        label: Option<String>,
    },
}
