use crate::rpc::router::passmanager::ssh::SshKeyMetadata;
use crate::rpc::router::passmanager::tags::TagCatalogMeta;
use serde::Serialize;
use serde_json::Value;

#[derive(Debug, Serialize)]
pub(super) struct RootExportDocument {
    version: u8,
    #[serde(rename = "createdTs")]
    created_ts: u64,
    #[serde(rename = "updatedTs")]
    updated_ts: u64,
    folders: Vec<String>,
    #[serde(rename = "foldersMeta")]
    folders_meta: Vec<ExportedFolderMeta>,
    tags: Vec<String>,
    #[serde(rename = "tagMeta")]
    tag_meta: TagCatalogMeta,
    entries: Vec<Value>,
    #[serde(rename = "sshKeys")]
    ssh_keys: Vec<SshKeyMetadata>,
}

impl RootExportDocument {
    pub(super) fn new(
        now_ms: u64,
        folders: Vec<String>,
        folders_meta: Vec<ExportedFolderMeta>,
        tags: Vec<String>,
        tag_meta: TagCatalogMeta,
        entries: Vec<Value>,
        ssh_keys: Vec<SshKeyMetadata>,
    ) -> Self {
        Self {
            version: 4,
            created_ts: now_ms,
            updated_ts: now_ms,
            folders,
            folders_meta,
            tags,
            tag_meta,
            entries,
            ssh_keys,
        }
    }
}

#[derive(Debug, Serialize)]
pub(super) struct ExportedFolderMeta {
    path: String,
    #[serde(rename = "iconRef", skip_serializing_if = "Option::is_none")]
    icon_ref: Option<String>,
    #[serde(skip_serializing_if = "Option::is_none")]
    description: Option<String>,
}

impl ExportedFolderMeta {
    pub(super) fn new(path: String, icon_ref: Option<String>, description: Option<String>) -> Self {
        Self {
            path,
            icon_ref,
            description,
        }
    }

    pub(super) fn path(&self) -> &str {
        &self.path
    }
}
