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
    entries: Vec<Value>,
}

impl RootExportDocument {
    pub(super) fn new(
        now_ms: u64,
        folders: Vec<String>,
        folders_meta: Vec<ExportedFolderMeta>,
        entries: Vec<Value>,
    ) -> Self {
        Self {
            version: 1,
            created_ts: now_ms,
            updated_ts: now_ms,
            folders,
            folders_meta,
            entries,
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
