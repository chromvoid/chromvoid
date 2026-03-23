//! Catalog-related RPC types

use serde::{Deserialize, Serialize};

#[cfg(feature = "ts-bindings")]
use ts_rs::TS;

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

/// Node creation response
#[derive(Debug, Clone, Serialize, Deserialize)]
#[cfg_attr(feature = "ts-bindings", derive(TS))]
#[cfg_attr(feature = "ts-bindings", ts(export))]
pub struct NodeCreatedResponse {
    #[cfg_attr(feature = "ts-bindings", ts(type = "number"))]
    pub node_id: u64,
}

/// PrepareUpload response
#[derive(Debug, Clone, Serialize, Deserialize)]
#[cfg_attr(feature = "ts-bindings", derive(TS))]
#[cfg_attr(feature = "ts-bindings", ts(export))]
pub struct PrepareUploadResponse {
    #[cfg_attr(feature = "ts-bindings", ts(type = "number"))]
    pub node_id: u64,
    #[cfg_attr(feature = "ts-bindings", ts(type = "number"))]
    pub uploaded_bytes: u64,
}

/// Upload response
#[derive(Debug, Clone, Serialize, Deserialize)]
#[cfg_attr(feature = "ts-bindings", derive(TS))]
#[cfg_attr(feature = "ts-bindings", ts(export))]
pub struct UploadResponse {
    #[cfg_attr(feature = "ts-bindings", ts(type = "number"))]
    pub node_id: u64,
    #[cfg_attr(feature = "ts-bindings", ts(type = "number"))]
    pub size: u64,
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
