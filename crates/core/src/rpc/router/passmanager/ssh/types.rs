use serde::{Deserialize, Serialize};

pub use crate::rpc::types::SshKeyMetadata;

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
