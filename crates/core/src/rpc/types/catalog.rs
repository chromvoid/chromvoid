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
#[cfg_attr(feature = "mobile-schema", derive(schemars::JsonSchema))]
pub struct CatalogListItem {
    #[cfg_attr(feature = "ts-bindings", ts(type = "number"))]
    pub node_id: u64,
    pub name: String,
    #[serde(skip_serializing_if = "Option::is_none")]
    #[cfg_attr(feature = "ts-bindings", ts(type = "string | null"))]
    pub path: Option<String>,
    #[serde(skip_serializing_if = "Option::is_none")]
    #[cfg_attr(feature = "ts-bindings", ts(type = "string | null"))]
    pub parent_path: Option<String>,
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
    pub source_revision: u64,
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
#[cfg_attr(feature = "mobile-schema", derive(schemars::JsonSchema))]
pub struct CatalogFolderSort {
    pub by: String,
    pub direction: String,
}

#[derive(Debug, Clone, Serialize, Deserialize)]
#[cfg_attr(feature = "ts-bindings", derive(TS))]
#[cfg_attr(feature = "ts-bindings", ts(export))]
#[cfg_attr(feature = "mobile-schema", derive(schemars::JsonSchema))]
pub struct CatalogFolderFilter {
    #[serde(default)]
    pub query: Option<String>,
    #[serde(default)]
    pub include_hidden: Option<bool>,
    #[serde(default)]
    pub recursive: Option<bool>,
    #[serde(default)]
    pub include_text_content: Option<bool>,
    #[serde(default)]
    pub file_types: Vec<String>,
}

fn default_folder_path() -> String {
    "/".to_string()
}

#[derive(Debug, Clone, Serialize, Deserialize)]
#[cfg_attr(feature = "ts-bindings", derive(TS))]
#[cfg_attr(feature = "ts-bindings", ts(export))]
#[cfg_attr(feature = "mobile-schema", derive(schemars::JsonSchema))]
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

#[derive(Debug, Clone, Copy, Default, PartialEq, Eq, Serialize, Deserialize)]
#[cfg_attr(feature = "ts-bindings", derive(TS))]
#[cfg_attr(feature = "ts-bindings", ts(export))]
#[cfg_attr(feature = "mobile-schema", derive(schemars::JsonSchema))]
pub struct CatalogFolderFilterCounts {
    #[cfg_attr(feature = "ts-bindings", ts(type = "number"))]
    pub all: u64,
    #[cfg_attr(feature = "ts-bindings", ts(type = "number"))]
    pub markdown: u64,
    #[cfg_attr(feature = "ts-bindings", ts(type = "number"))]
    pub images: u64,
}

#[derive(Debug, Clone, Serialize, Deserialize)]
#[cfg_attr(feature = "ts-bindings", derive(TS))]
#[cfg_attr(feature = "ts-bindings", ts(export))]
#[cfg_attr(feature = "mobile-schema", derive(schemars::JsonSchema))]
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
    pub filter_counts: CatalogFolderFilterCounts,
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
    #[serde(skip_serializing_if = "Option::is_none")]
    pub heading: Option<String>,
    #[serde(skip_serializing_if = "Option::is_none")]
    pub excerpt: Option<String>,
    #[serde(skip_serializing_if = "Option::is_none")]
    #[cfg_attr(feature = "ts-bindings", ts(type = "number | null"))]
    pub preview_words: Option<u64>,
    #[serde(skip_serializing_if = "Option::is_none")]
    #[cfg_attr(feature = "ts-bindings", ts(type = "boolean | null"))]
    pub preview_truncated: Option<bool>,
}

#[derive(Debug, Clone, Serialize, Deserialize)]
#[cfg_attr(feature = "ts-bindings", derive(TS))]
#[cfg_attr(feature = "ts-bindings", ts(export))]
pub struct CatalogNotesListResponse {
    #[cfg_attr(feature = "ts-bindings", ts(type = "number"))]
    pub version: u64,
    pub items: Vec<CatalogNotesListItem>,
}

#[derive(Debug, Clone, Serialize, Deserialize)]
#[cfg_attr(feature = "ts-bindings", derive(TS))]
#[cfg_attr(feature = "ts-bindings", ts(export))]
pub struct CatalogFileLinksCompleteRequest {
    #[serde(default)]
    pub query: String,
    #[serde(default)]
    #[cfg_attr(feature = "ts-bindings", ts(type = "number | null"))]
    pub limit: Option<u64>,
    #[serde(default)]
    #[cfg_attr(feature = "ts-bindings", ts(type = "string | null"))]
    pub current_path: Option<String>,
}

#[derive(Debug, Clone, Serialize, Deserialize)]
#[cfg_attr(feature = "ts-bindings", derive(TS))]
#[cfg_attr(feature = "ts-bindings", ts(export))]
pub struct CatalogFileLinksResolveRequest {
    #[serde(default)]
    pub targets: Vec<String>,
}

#[derive(Debug, Clone, Serialize, Deserialize)]
#[cfg_attr(feature = "mobile-schema", derive(schemars::JsonSchema))]
#[cfg_attr(feature = "ts-bindings", derive(TS))]
#[cfg_attr(feature = "ts-bindings", ts(export))]
pub struct CatalogFileLinkItem {
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
pub struct CatalogFileLinkResolveResult {
    pub target: String,
    #[serde(skip_serializing_if = "Option::is_none")]
    pub item: Option<CatalogFileLinkItem>,
}

#[derive(Debug, Clone, Serialize, Deserialize)]
#[cfg_attr(feature = "ts-bindings", derive(TS))]
#[cfg_attr(feature = "ts-bindings", ts(export))]
pub struct CatalogFileLinksCompleteResponse {
    #[cfg_attr(feature = "ts-bindings", ts(type = "number"))]
    pub version: u64,
    pub items: Vec<CatalogFileLinkItem>,
}

#[derive(Debug, Clone, Serialize, Deserialize)]
#[cfg_attr(feature = "ts-bindings", derive(TS))]
#[cfg_attr(feature = "ts-bindings", ts(export))]
pub struct CatalogFileLinksResolveResponse {
    #[cfg_attr(feature = "ts-bindings", ts(type = "number"))]
    pub version: u64,
    pub results: Vec<CatalogFileLinkResolveResult>,
}

/// Node creation response
#[derive(Debug, Clone, Serialize, Deserialize)]
#[cfg_attr(feature = "ts-bindings", derive(TS))]
#[cfg_attr(feature = "ts-bindings", ts(export))]
#[cfg_attr(feature = "mobile-schema", derive(schemars::JsonSchema))]
pub struct NodeCreatedResponse {
    #[cfg_attr(feature = "ts-bindings", ts(type = "number"))]
    pub node_id: u64,
}

/// Upload response
#[derive(Debug, Clone, Serialize, Deserialize)]
#[cfg_attr(feature = "ts-bindings", derive(TS))]
#[cfg_attr(feature = "ts-bindings", ts(export))]
#[cfg_attr(feature = "mobile-schema", derive(schemars::JsonSchema))]
pub struct UploadResponse {
    #[cfg_attr(feature = "ts-bindings", ts(type = "number"))]
    pub node_id: u64,
    #[cfg_attr(feature = "ts-bindings", ts(type = "number"))]
    pub uploaded_bytes: u64,
    pub completed: bool,
    pub created: bool,
    #[serde(default, skip_serializing_if = "Option::is_none")]
    #[cfg_attr(feature = "ts-bindings", ts(optional, type = "number"))]
    pub size: Option<u64>,
    pub mime_type: Option<String>,
    #[serde(default, skip_serializing_if = "Option::is_none")]
    #[cfg_attr(feature = "ts-bindings", ts(optional, type = "number"))]
    pub modtime: Option<u64>,
    #[serde(default, skip_serializing_if = "Option::is_none")]
    #[cfg_attr(feature = "ts-bindings", ts(optional, type = "number"))]
    pub source_revision: Option<u64>,
    pub media_info: Option<CatalogMediaInfo>,
    #[serde(default, skip_serializing_if = "Option::is_none")]
    #[cfg_attr(feature = "ts-bindings", ts(optional, type = "number"))]
    pub media_inspected_revision: Option<u64>,
}

/// Existing file replacement response.
#[derive(Debug, Clone, Serialize, Deserialize)]
#[cfg_attr(feature = "ts-bindings", derive(TS))]
#[cfg_attr(feature = "ts-bindings", ts(export))]
#[cfg_attr(feature = "mobile-schema", derive(schemars::JsonSchema))]
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

/// Base64 encoded byte range for `catalog:file:patch`.
#[derive(Debug, Clone, Serialize, Deserialize)]
#[cfg_attr(feature = "ts-bindings", derive(TS))]
#[cfg_attr(feature = "ts-bindings", ts(export))]
pub struct CatalogFilePatchRange {
    #[cfg_attr(feature = "ts-bindings", ts(type = "number"))]
    pub offset: u64,
    pub content_base64: String,
}

/// Reversible Trash move response.
#[derive(Debug, Clone, Serialize, Deserialize)]
#[cfg_attr(feature = "ts-bindings", derive(TS))]
#[cfg_attr(feature = "ts-bindings", ts(export))]
pub struct CatalogTrashResponse {
    #[cfg_attr(feature = "ts-bindings", ts(type = "number"))]
    pub node_id: u64,
    pub original_path: String,
    #[cfg_attr(feature = "ts-bindings", ts(type = "number"))]
    pub deleted_at: u64,
    pub trash_name: String,
}

/// Reversible Trash list item.
#[derive(Debug, Clone, Serialize, Deserialize)]
#[cfg_attr(feature = "ts-bindings", derive(TS))]
#[cfg_attr(feature = "ts-bindings", ts(export))]
pub struct CatalogTrashListItem {
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
    pub source_revision: u64,
    #[cfg_attr(feature = "ts-bindings", ts(type = "number"))]
    pub created_at: u64,
    #[cfg_attr(feature = "ts-bindings", ts(type = "number"))]
    pub updated_at: u64,
    pub original_path: String,
    #[cfg_attr(feature = "ts-bindings", ts(type = "number"))]
    pub deleted_at: u64,
    pub trash_name: String,
}

/// Reversible Trash list response.
#[derive(Debug, Clone, Serialize, Deserialize)]
#[cfg_attr(feature = "ts-bindings", derive(TS))]
#[cfg_attr(feature = "ts-bindings", ts(export))]
pub struct CatalogTrashListResponse {
    pub items: Vec<CatalogTrashListItem>,
}

/// Reversible Trash restore response.
#[derive(Debug, Clone, Serialize, Deserialize)]
#[cfg_attr(feature = "ts-bindings", derive(TS))]
#[cfg_attr(feature = "ts-bindings", ts(export))]
pub struct CatalogTrashRestoreResponse {
    #[cfg_attr(feature = "ts-bindings", ts(type = "number"))]
    pub node_id: u64,
    pub restored_path: String,
}

/// Reversible Trash empty response.
#[derive(Debug, Clone, Serialize, Deserialize)]
#[cfg_attr(feature = "ts-bindings", derive(TS))]
#[cfg_attr(feature = "ts-bindings", ts(export))]
pub struct CatalogTrashEmptyResponse {
    #[cfg_attr(feature = "ts-bindings", ts(type = "number"))]
    pub removed: u64,
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
#[cfg_attr(feature = "mobile-schema", derive(schemars::JsonSchema))]
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

/// Resolves a document link against the current catalog, using the source identity
/// for relative paths. No document body is read and no catalog mutation occurs.
#[derive(Debug, Clone, Serialize, Deserialize)]
#[cfg_attr(feature = "ts-bindings", derive(TS))]
#[cfg_attr(feature = "mobile-schema", derive(schemars::JsonSchema))]
pub struct CatalogDocumentLinkRequest {
    #[cfg_attr(feature = "ts-bindings", ts(type = "number"))]
    pub source_node_id: u64,
    pub path: String,
    pub kind: CatalogDocumentLinkKind,
}

#[derive(Debug, Clone, Serialize, Deserialize)]
#[serde(rename_all = "snake_case")]
#[cfg_attr(feature = "ts-bindings", derive(TS))]
#[cfg_attr(feature = "mobile-schema", derive(schemars::JsonSchema))]
pub enum CatalogDocumentLinkKind {
    File,
    Note,
}

#[derive(Debug, Clone, Serialize, Deserialize)]
#[serde(tag = "kind", rename_all = "snake_case")]
#[cfg_attr(feature = "ts-bindings", derive(TS))]
#[cfg_attr(feature = "mobile-schema", derive(schemars::JsonSchema))]
pub enum CatalogDocumentLinkResponse {
    Found { item: CatalogFileLinkItem },
    Missing,
    Ambiguous,
}

/// Prepares directories and a fresh name, without reserving or writing the image.
#[derive(Debug, Clone, Serialize, Deserialize)]
#[cfg_attr(feature = "ts-bindings", derive(TS))]
#[cfg_attr(feature = "ts-bindings", ts(export))]
#[cfg_attr(feature = "mobile-schema", derive(schemars::JsonSchema))]
pub struct CatalogAttachmentRequest {
    pub folder_path: String,
    pub file_name: String,
    pub mime_type: String,
}

/// Use create-only upload, then insert Markdown only after its confirmed completion.
#[derive(Debug, Clone, Serialize, Deserialize)]
#[cfg_attr(feature = "ts-bindings", derive(TS))]
#[cfg_attr(feature = "ts-bindings", ts(export))]
#[cfg_attr(feature = "mobile-schema", derive(schemars::JsonSchema))]
pub struct CatalogAttachmentResponse {
    pub parent_path: String,
    pub name: String,
    pub mime_type: String,
    pub path: String,
    pub markdown: String,
}
