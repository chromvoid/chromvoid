use serde::{Deserialize, Serialize};

#[derive(Debug, Clone, PartialEq, Eq, Serialize, Deserialize)]
#[serde(rename_all = "camelCase")]
pub(in crate::rpc::router::passmanager) struct SshKeyMetadata {
    pub(in crate::rpc::router::passmanager) id: String,
    #[serde(rename = "type")]
    pub(in crate::rpc::router::passmanager) key_type: String,
    pub(in crate::rpc::router::passmanager) fingerprint: String,
    #[serde(skip_serializing_if = "Option::is_none")]
    pub(in crate::rpc::router::passmanager) name: Option<String>,
    #[serde(skip_serializing_if = "Option::is_none")]
    pub(in crate::rpc::router::passmanager) comment: Option<String>,
    #[serde(alias = "source_entry_id", skip_serializing_if = "Option::is_none")]
    pub(in crate::rpc::router::passmanager) source_entry_id: Option<String>,
    #[serde(alias = "created_ts", skip_serializing_if = "Option::is_none")]
    pub(in crate::rpc::router::passmanager) created_ts: Option<u64>,
    #[serde(alias = "updated_ts", skip_serializing_if = "Option::is_none")]
    pub(in crate::rpc::router::passmanager) updated_ts: Option<u64>,
}

#[derive(Debug, Serialize, Deserialize)]
pub(super) struct SshKeysDocument {
    #[serde(rename = "sshKeys", default)]
    pub(super) ssh_keys: Vec<SshKeyMetadata>,
}

impl SshKeysDocument {
    pub(super) fn new(ssh_keys: Vec<SshKeyMetadata>) -> Self {
        Self { ssh_keys }
    }
}
