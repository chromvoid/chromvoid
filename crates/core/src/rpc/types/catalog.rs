//! Catalog-related RPC types

use serde::{Deserialize, Serialize};
use serde_json::Value;

#[cfg(feature = "ts-bindings")]
use ts_rs::TS;

use crate::catalog::CatalogMediaInfo;
use crate::types::NodeType;

/// Conflict policy for file replacement writes.
#[derive(Debug, Clone, Copy, PartialEq, Eq, Serialize, Deserialize)]
#[cfg_attr(feature = "ts-bindings", derive(TS))]
#[cfg_attr(feature = "ts-bindings", ts(export))]
#[serde(rename_all = "snake_case")]
pub enum CatalogFileReplaceConflictMode {
    FailIfStale,
    Overwrite,
}

/// Catalog list item
#[derive(Debug, Clone, Serialize, Deserialize)]
#[cfg_attr(feature = "ts-bindings", derive(TS))]
#[cfg_attr(feature = "ts-bindings", ts(export))]
pub struct CatalogListItem {
    #[cfg_attr(feature = "ts-bindings", ts(type = "number"))]
    pub node_id: u64,
    pub name: String,
    pub is_dir: bool,
    #[serde(skip_serializing_if = "Option::is_none")]
    #[cfg_attr(feature = "ts-bindings", ts(type = "number | null"))]
    pub size: Option<u64>,
    #[serde(skip_serializing_if = "Option::is_none")]
    pub mime_type: Option<String>,
    #[serde(skip_serializing_if = "Option::is_none")]
    pub media_info: Option<CatalogMediaInfo>,
    #[cfg_attr(feature = "ts-bindings", ts(type = "number"))]
    pub media_inspected_revision: u64,
    #[cfg_attr(feature = "ts-bindings", ts(type = "number"))]
    pub created_at: u64,
    #[cfg_attr(feature = "ts-bindings", ts(type = "number"))]
    pub updated_at: u64,
}

/// Catalog list response
#[derive(Debug, Clone, Serialize, Deserialize)]
#[cfg_attr(feature = "ts-bindings", derive(TS))]
#[cfg_attr(feature = "ts-bindings", ts(export))]
pub struct CatalogListResponse {
    pub current_path: String,
    pub items: Vec<CatalogListItem>,
}

#[derive(Debug, Clone, Serialize, Deserialize)]
#[cfg_attr(feature = "ts-bindings", derive(TS))]
#[cfg_attr(feature = "ts-bindings", ts(export))]
pub struct CatalogFolderSort {
    pub by: String,
    pub direction: String,
}

#[derive(Debug, Clone, Serialize, Deserialize)]
#[cfg_attr(feature = "ts-bindings", derive(TS))]
#[cfg_attr(feature = "ts-bindings", ts(export))]
pub struct CatalogFolderFilter {
    #[serde(default)]
    pub query: Option<String>,
    #[serde(default)]
    pub include_hidden: Option<bool>,
    #[serde(default)]
    pub file_types: Vec<String>,
}

fn default_folder_path() -> String {
    "/".to_string()
}

#[derive(Debug, Clone, Serialize, Deserialize)]
#[cfg_attr(feature = "ts-bindings", derive(TS))]
#[cfg_attr(feature = "ts-bindings", ts(export))]
pub struct CatalogFolderPageRequest {
    #[serde(default = "default_folder_path")]
    pub path: String,
    #[serde(default)]
    #[cfg_attr(feature = "ts-bindings", ts(type = "number"))]
    pub offset: u64,
    #[serde(default)]
    #[cfg_attr(feature = "ts-bindings", ts(type = "number | null"))]
    pub limit: Option<u64>,
    #[serde(default)]
    #[cfg_attr(feature = "ts-bindings", ts(type = "number | null"))]
    pub expected_version: Option<u64>,
    #[serde(default)]
    pub sort: Option<CatalogFolderSort>,
    #[serde(default)]
    pub filter: Option<CatalogFolderFilter>,
}

#[derive(Debug, Clone, Serialize, Deserialize)]
#[cfg_attr(feature = "ts-bindings", derive(TS))]
#[cfg_attr(feature = "ts-bindings", ts(export))]
pub struct CatalogFolderBatchRequest {
    #[serde(default)]
    pub pages: Vec<CatalogFolderPageRequest>,
}

#[derive(Debug, Clone, Serialize, Deserialize)]
#[cfg_attr(feature = "ts-bindings", derive(TS))]
#[cfg_attr(feature = "ts-bindings", ts(export))]
pub struct CatalogFolderPageResponse {
    pub current_path: String,
    #[cfg_attr(feature = "ts-bindings", ts(type = "number"))]
    pub version: u64,
    #[cfg_attr(feature = "ts-bindings", ts(type = "number"))]
    pub total_count: u64,
    #[cfg_attr(feature = "ts-bindings", ts(type = "number"))]
    pub offset: u64,
    #[cfg_attr(feature = "ts-bindings", ts(type = "number"))]
    pub limit: u64,
    #[serde(skip_serializing_if = "Option::is_none")]
    #[cfg_attr(feature = "ts-bindings", ts(type = "number | null"))]
    pub next_offset: Option<u64>,
    pub reload_required: bool,
    pub items: Vec<CatalogListItem>,
}

#[derive(Debug, Clone, Serialize, Deserialize)]
#[cfg_attr(feature = "ts-bindings", derive(TS))]
#[cfg_attr(feature = "ts-bindings", ts(export))]
pub struct CatalogFolderBatchResponse {
    pub pages: Vec<CatalogFolderPageResponse>,
    pub truncated: bool,
    #[serde(default, skip_serializing_if = "Vec::is_empty")]
    pub warnings: Vec<Value>,
}

#[derive(Debug, Clone, Serialize, Deserialize)]
#[cfg_attr(feature = "ts-bindings", derive(TS))]
#[cfg_attr(feature = "ts-bindings", ts(export))]
pub struct CatalogNotesListItem {
    #[cfg_attr(feature = "ts-bindings", ts(type = "number"))]
    pub node_id: u64,
    pub name: String,
    pub path: String,
    pub parent_path: String,
    #[cfg_attr(feature = "ts-bindings", ts(type = "number"))]
    pub size: u64,
    #[serde(skip_serializing_if = "Option::is_none")]
    pub mime_type: Option<String>,
    #[cfg_attr(feature = "ts-bindings", ts(type = "number"))]
    pub source_revision: u64,
    #[cfg_attr(feature = "ts-bindings", ts(type = "number"))]
    pub created_at: u64,
    #[cfg_attr(feature = "ts-bindings", ts(type = "number"))]
    pub updated_at: u64,
}

#[derive(Debug, Clone, Serialize, Deserialize)]
#[cfg_attr(feature = "ts-bindings", derive(TS))]
#[cfg_attr(feature = "ts-bindings", ts(export))]
pub struct CatalogNotesListResponse {
    #[cfg_attr(feature = "ts-bindings", ts(type = "number"))]
    pub version: u64,
    pub items: Vec<CatalogNotesListItem>,
}

/// Node creation response
#[derive(Debug, Clone, Serialize, Deserialize)]
#[cfg_attr(feature = "ts-bindings", derive(TS))]
#[cfg_attr(feature = "ts-bindings", ts(export))]
pub struct NodeCreatedResponse {
    #[cfg_attr(feature = "ts-bindings", ts(type = "number"))]
    pub node_id: u64,
}

/// Upload response
#[derive(Debug, Clone, Serialize, Deserialize)]
#[cfg_attr(feature = "ts-bindings", derive(TS))]
#[cfg_attr(feature = "ts-bindings", ts(export))]
pub struct UploadResponse {
    #[cfg_attr(feature = "ts-bindings", ts(type = "number"))]
    pub node_id: u64,
    #[cfg_attr(feature = "ts-bindings", ts(type = "number"))]
    pub uploaded_bytes: u64,
}

/// Existing file replacement response.
#[derive(Debug, Clone, Serialize, Deserialize)]
#[cfg_attr(feature = "ts-bindings", derive(TS))]
#[cfg_attr(feature = "ts-bindings", ts(export))]
pub struct CatalogFileReplaceResponse {
    #[cfg_attr(feature = "ts-bindings", ts(type = "number"))]
    pub node_id: u64,
    #[cfg_attr(feature = "ts-bindings", ts(type = "number"))]
    pub size: u64,
    pub mime_type: String,
    #[cfg_attr(feature = "ts-bindings", ts(type = "number"))]
    pub modtime: u64,
    #[cfg_attr(feature = "ts-bindings", ts(type = "number"))]
    pub source_revision: u64,
    pub media_info: Option<CatalogMediaInfo>,
    #[cfg_attr(feature = "ts-bindings", ts(type = "number"))]
    pub media_inspected_revision: u64,
}

/// Media inspection response for a catalog file source.
#[derive(Debug, Clone, Serialize, Deserialize)]
#[cfg_attr(feature = "ts-bindings", derive(TS))]
#[cfg_attr(feature = "ts-bindings", ts(export))]
pub struct CatalogMediaInspectResponse {
    #[cfg_attr(feature = "ts-bindings", ts(type = "number"))]
    pub node_id: u64,
    pub media_info: Option<CatalogMediaInfo>,
    #[cfg_attr(feature = "ts-bindings", ts(type = "number"))]
    pub source_revision: u64,
    #[cfg_attr(feature = "ts-bindings", ts(type = "number"))]
    pub media_inspected_revision: u64,
}

/// Download response
#[derive(Debug, Clone, Serialize, Deserialize)]
#[cfg_attr(feature = "ts-bindings", derive(TS))]
#[cfg_attr(feature = "ts-bindings", ts(export))]
pub struct DownloadResponse {
    #[cfg_attr(feature = "ts-bindings", ts(type = "number"))]
    pub node_id: u64,
    pub content: String, // base64-encoded content
}

/// Backend-authoritative source metadata for derivative identity.
#[derive(Debug, Clone, Serialize, Deserialize)]
#[cfg_attr(feature = "ts-bindings", derive(TS))]
#[cfg_attr(feature = "ts-bindings", ts(export))]
pub struct SourceMetadataResponse {
    #[cfg_attr(feature = "ts-bindings", ts(type = "number"))]
    pub node_id: u64,
    pub node_type: NodeType,
    pub name: String,
    #[serde(skip_serializing_if = "Option::is_none")]
    pub mime_type: Option<String>,
    #[serde(skip_serializing_if = "Option::is_none")]
    pub media_info: Option<CatalogMediaInfo>,
    #[cfg_attr(feature = "ts-bindings", ts(type = "number"))]
    pub size: u64,
    #[cfg_attr(feature = "ts-bindings", ts(type = "number"))]
    pub source_revision: u64,
    #[cfg_attr(feature = "ts-bindings", ts(type = "number"))]
    pub media_inspected_revision: u64,
    #[serde(default)]
    pub source_revision_initialized: bool,
}

/// Indexed derivative storage accounting.
#[derive(Debug, Clone, Serialize, Deserialize)]
#[cfg_attr(feature = "ts-bindings", derive(TS))]
#[cfg_attr(feature = "ts-bindings", ts(export))]
pub struct DerivativeStatsResponse {
    #[cfg_attr(feature = "ts-bindings", ts(type = "number"))]
    pub indexed_count: usize,
    #[cfg_attr(feature = "ts-bindings", ts(type = "number"))]
    pub indexed_bytes: u64,
}

/// Current source revision that quota compaction must preserve.
#[derive(Debug, Clone, Serialize, Deserialize)]
#[cfg_attr(feature = "ts-bindings", derive(TS))]
#[cfg_attr(feature = "ts-bindings", ts(export))]
pub struct DerivativeProtectedRevision {
    #[cfg_attr(feature = "ts-bindings", ts(type = "number"))]
    pub node_id: u64,
    #[cfg_attr(feature = "ts-bindings", ts(type = "number"))]
    pub source_revision: u64,
}
