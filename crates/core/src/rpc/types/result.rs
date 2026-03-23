//! RPC command result discriminated union (response types)

use serde::{Deserialize, Serialize};
use serde_json::Value;

#[cfg(feature = "ts-bindings")]
use ts_rs::TS;

use super::{
    CatalogListResponse, CompactShardResponse, CredentialCandidate,
    CredentialProviderPasskeyCommandResponse, CredentialProviderSessionResponse,
    CredentialProviderStatusResponse, CredentialSecret, ListShardsResponse, LoadShardResponse,
    NodeCreatedResponse, SyncInitResponse, SyncShardResponse, VaultStatusResponse,
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

    #[serde(rename = "vault:unlock")]
    VaultUnlock {},

    #[serde(rename = "vault:lock")]
    VaultLock {},

    #[serde(rename = "vault:status")]
    VaultStatus(VaultStatusResponse),

    #[serde(rename = "catalog:list")]
    CatalogList(CatalogListResponse),

    #[serde(rename = "catalog:syncInit")]
    CatalogSyncInit(SyncInitResponse),

    #[serde(rename = "catalog:sync:delta")]
    CatalogSyncDelta {
        #[cfg_attr(feature = "ts-bindings", ts(type = "number"))]
        version: u64,
        delta: Value,
    },

    #[serde(rename = "catalog:createDir")]
    CatalogCreateDir(NodeCreatedResponse),

    #[serde(rename = "catalog:rename")]
    CatalogRename {},

    #[serde(rename = "catalog:delete")]
    CatalogDelete {},

    #[serde(rename = "catalog:move")]
    CatalogMove {},

    #[serde(rename = "catalog:prepareUpload")]
    CatalogPrepareUpload {
        #[cfg_attr(feature = "ts-bindings", ts(type = "number"))]
        node_id: u64,
    },

    #[serde(rename = "catalog:upload")]
    CatalogUpload {},

    #[serde(rename = "catalog:download")]
    CatalogDownload {},

    #[serde(rename = "catalog:secret:read")]
    CatalogSecretRead {},

    #[serde(rename = "catalog:secret:write")]
    CatalogSecretWrite {},

    #[serde(rename = "catalog:secret:erase")]
    CatalogSecretErase {},

    #[serde(rename = "catalog:shard:list")]
    CatalogShardList(ListShardsResponse),

    #[serde(rename = "catalog:shard:load")]
    CatalogShardLoad(LoadShardResponse),

    #[serde(rename = "catalog:shard:sync")]
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

    #[serde(rename = "passmanager:root:import")]
    PassmanagerRootImport {},

    #[serde(rename = "passmanager:root:export")]
    PassmanagerRootExport { root: Value },

    #[serde(rename = "passmanager:icon:put")]
    PassmanagerIconPut {
        icon_ref: String,
        mime_type: String,
        width: u32,
        height: u32,
        #[cfg_attr(feature = "ts-bindings", ts(type = "number"))]
        bytes: u64,
    },

    #[serde(rename = "passmanager:icon:get")]
    PassmanagerIconGet {
        icon_ref: String,
        mime_type: String,
        content_base64: String,
    },

    #[serde(rename = "passmanager:icon:list")]
    PassmanagerIconList { icons: Value },

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
