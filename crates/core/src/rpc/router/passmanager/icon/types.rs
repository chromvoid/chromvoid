use serde::{Deserialize, Serialize};

pub(in crate::rpc::router::passmanager) const PASSMANAGER_ICONS_ENABLED: bool = true;
pub(super) const ICON_MAX_UPLOAD_BYTES: usize = 1024 * 1024;
pub(super) const ICON_NORMALIZED_MAX_BYTES: usize = 64 * 1024;
pub(super) const ICON_MAX_DIMENSION: u32 = 128;

pub(super) const PASSMANAGER_ICONS_DIR: &str = "/.passmanager/.icons";
pub(in crate::rpc::router::passmanager) const PASSMANAGER_ICONS_INDEX_PATH: &str =
    "/.passmanager/.icons/index.json";

#[derive(Debug, Clone, Serialize, Deserialize)]
pub(in crate::rpc::router::passmanager) struct IconIndexRecord {
    pub(in crate::rpc::router::passmanager) sha256: String,
    pub(in crate::rpc::router::passmanager) mime_type: String,
    pub(in crate::rpc::router::passmanager) ext: String,
    pub(in crate::rpc::router::passmanager) width: u32,
    pub(in crate::rpc::router::passmanager) height: u32,
    pub(in crate::rpc::router::passmanager) bytes: u64,
    pub(in crate::rpc::router::passmanager) background_color: Option<String>,
    pub(in crate::rpc::router::passmanager) created_at: u64,
    pub(in crate::rpc::router::passmanager) updated_at: u64,
}

#[derive(Debug, Clone, Default, Serialize, Deserialize)]
pub(in crate::rpc::router::passmanager) struct IconIndexFile {
    #[serde(default)]
    pub(in crate::rpc::router::passmanager) icons: Vec<IconIndexRecord>,
}

#[derive(Debug, Serialize)]
pub(super) struct IconPutResult {
    pub(super) icon_ref: String,
    pub(super) mime_type: String,
    pub(super) width: u32,
    pub(super) height: u32,
    pub(super) bytes: u64,
    pub(super) background_color: Option<String>,
}

#[derive(Debug, Serialize)]
pub(super) struct IconGetResult {
    pub(super) icon_ref: String,
    pub(super) mime_type: String,
    pub(super) background_color: Option<String>,
    pub(super) content_base64: String,
}

#[derive(Debug, Serialize)]
pub(super) struct IconListItem {
    pub(super) icon_ref: String,
    pub(super) mime_type: String,
    pub(super) width: u32,
    pub(super) height: u32,
    pub(super) bytes: u64,
    pub(super) background_color: Option<String>,
    pub(super) created_at: u64,
    pub(super) updated_at: u64,
}

#[derive(Debug, Serialize)]
pub(super) struct IconListResult {
    pub(super) icons: Vec<IconListItem>,
}

#[derive(Debug, Serialize)]
pub(super) struct IconGcResult {
    pub(super) deleted: u64,
}
