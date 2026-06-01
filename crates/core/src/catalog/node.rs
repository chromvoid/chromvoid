//! Catalog node representation

use serde::{Deserialize, Serialize};
use std::time::{SystemTime, UNIX_EPOCH};

#[cfg(feature = "ts-bindings")]
use ts_rs::TS;

use crate::types::{NodeType, DEFAULT_CHUNK_SIZE};

/// Represents a node in the catalog (file or directory)
#[derive(Debug, Clone, Serialize, Deserialize, PartialEq)]
#[cfg_attr(feature = "ts-bindings", derive(TS))]
#[cfg_attr(feature = "ts-bindings", ts(export))]
pub struct CatalogNode {
    /// Unique node identifier
    #[serde(rename = "i")]
    #[cfg_attr(feature = "ts-bindings", ts(type = "number"))]
    pub node_id: u64,

    /// Type of node (Dir, File, Symlink)
    #[serde(rename = "t")]
    pub node_type: NodeType,

    /// Name of the node
    #[serde(rename = "n")]
    pub name: String,

    /// Size in bytes (for files)
    #[serde(rename = "s")]
    #[cfg_attr(feature = "ts-bindings", ts(type = "number"))]
    pub size: u64,

    /// Chunk size for splitting (default 16KB)
    #[serde(rename = "z")]
    pub chunk_size: u32,

    /// Creation timestamp (milliseconds since epoch)
    #[serde(rename = "b")]
    #[cfg_attr(feature = "ts-bindings", ts(type = "number"))]
    pub birthtime: u64,

    /// Modification timestamp (milliseconds since epoch)
    #[serde(rename = "m")]
    #[cfg_attr(feature = "ts-bindings", ts(type = "number"))]
    pub modtime: u64,

    /// MIME type (for files)
    #[serde(rename = "y", skip_serializing_if = "Option::is_none")]
    pub mime_type: Option<String>,

    /// Catalog-owned media track classification.
    #[serde(rename = "u", skip_serializing_if = "Option::is_none")]
    pub media_info: Option<CatalogMediaInfo>,

    /// Source revision for which media inspection was completed.
    #[serde(rename = "q", default, skip_serializing_if = "is_zero_u64")]
    #[cfg_attr(feature = "ts-bindings", ts(type = "number"))]
    pub media_inspected_revision: u64,

    /// Backend-owned source revision for file bytes.
    #[serde(rename = "r", default, skip_serializing_if = "is_zero_u64")]
    #[cfg_attr(feature = "ts-bindings", ts(type = "number"))]
    pub source_revision: u64,

    /// Symlink target (for symlinks)
    #[serde(rename = "l", skip_serializing_if = "Option::is_none")]
    pub link_to: Option<String>,

    /// Children nodes (for directories)
    #[serde(rename = "c", skip_serializing_if = "Option::is_none")]
    pub children: Option<Vec<CatalogNode>>,
}

impl CatalogNode {
    /// Create a new root directory
    pub fn new_root() -> Self {
        let now = current_timestamp();
        Self {
            node_id: 0,
            node_type: NodeType::Dir,
            name: "/".to_string(),
            size: 0,
            chunk_size: DEFAULT_CHUNK_SIZE,
            birthtime: now,
            modtime: now,
            mime_type: None,
            media_info: None,
            media_inspected_revision: 0,
            source_revision: 0,
            link_to: None,
            children: Some(Vec::new()),
        }
    }

    /// Create a new directory
    pub fn new_dir(node_id: u64, name: String) -> Self {
        let now = current_timestamp();
        Self {
            node_id,
            node_type: NodeType::Dir,
            name,
            size: 0,
            chunk_size: DEFAULT_CHUNK_SIZE,
            birthtime: now,
            modtime: now,
            mime_type: None,
            media_info: None,
            media_inspected_revision: 0,
            source_revision: 0,
            link_to: None,
            children: Some(Vec::new()),
        }
    }

    /// Create a new file
    pub fn new_file(node_id: u64, name: String, size: u64, mime_type: Option<String>) -> Self {
        let now = current_timestamp();
        Self {
            node_id,
            node_type: NodeType::File,
            name,
            size,
            chunk_size: DEFAULT_CHUNK_SIZE,
            birthtime: now,
            modtime: now,
            mime_type,
            media_info: None,
            media_inspected_revision: 0,
            source_revision: next_source_revision(0),
            link_to: None,
            children: None,
        }
    }

    /// Check if this is a directory
    pub fn is_dir(&self) -> bool {
        self.node_type == NodeType::Dir
    }

    /// Check if this is a file
    pub fn is_file(&self) -> bool {
        self.node_type == NodeType::File
    }

    /// Check if this is a symlink
    pub fn is_symlink(&self) -> bool {
        self.node_type == NodeType::Symlink
    }

    /// Get children (returns empty slice if not a directory)
    pub fn children(&self) -> &[CatalogNode] {
        self.children.as_deref().unwrap_or(&[])
    }

    /// Get mutable children (returns None if not a directory)
    pub fn children_mut(&mut self) -> Option<&mut Vec<CatalogNode>> {
        self.children.as_mut()
    }

    /// Update modification time to now
    pub fn touch(&mut self) {
        self.modtime = current_timestamp();
    }

    /// Return this file's catalog-owned source revision.
    pub fn source_revision(&self) -> u64 {
        self.source_revision
    }

    /// Initialize a legacy zero source revision without changing source bytes.
    pub fn ensure_source_revision(&mut self) -> u64 {
        if self.is_file() && self.source_revision == 0 {
            self.source_revision = next_source_revision(0);
        }
        self.source_revision
    }

    /// Bump the file source revision after raw source bytes change.
    pub fn bump_source_revision(&mut self) -> u64 {
        if self.is_file() {
            self.source_revision = next_source_revision(self.source_revision);
        }
        self.source_revision
    }

    /// Find a child by name
    pub fn find_child(&self, name: &str) -> Option<&CatalogNode> {
        self.children().iter().find(|c| c.name == name)
    }

    /// Find a child by name (mutable)
    pub fn find_child_mut(&mut self, name: &str) -> Option<&mut CatalogNode> {
        self.children_mut()?.iter_mut().find(|c| c.name == name)
    }

    /// Add a child node
    pub fn add_child(&mut self, child: CatalogNode) -> bool {
        if let Some(children) = self.children_mut() {
            children.push(child);
            self.touch();
            true
        } else {
            false
        }
    }

    /// Remove a child by node_id
    pub fn remove_child(&mut self, node_id: u64) -> Option<CatalogNode> {
        let children = self.children.as_mut()?;
        let pos = children.iter().position(|c| c.node_id == node_id)?;
        let removed = children.remove(pos);
        self.modtime = current_timestamp();
        Some(removed)
    }

    /// Check if a child with the given name exists
    pub fn has_child(&self, name: &str) -> bool {
        self.find_child(name).is_some()
    }

    /// Count all nodes in this subtree (including self)
    pub fn count_nodes(&self) -> usize {
        1 + self
            .children()
            .iter()
            .map(|c| c.count_nodes())
            .sum::<usize>()
    }

    /// Calculate total size of all files in this subtree
    pub fn total_size(&self) -> u64 {
        if self.is_file() {
            self.size
        } else {
            self.children().iter().map(|c| c.total_size()).sum()
        }
    }
}

/// Catalog-backed media classification.
#[derive(Debug, Clone, PartialEq, Eq, Serialize, Deserialize)]
#[cfg_attr(feature = "ts-bindings", derive(TS))]
#[cfg_attr(feature = "ts-bindings", ts(export))]
#[serde(rename_all = "snake_case")]
pub enum CatalogMediaKind {
    Audio,
    Video,
}

/// Compact media track summary stored on catalog nodes.
#[derive(Debug, Clone, PartialEq, Eq, Serialize, Deserialize)]
#[cfg_attr(feature = "ts-bindings", derive(TS))]
#[cfg_attr(feature = "ts-bindings", ts(export))]
pub struct CatalogMediaInfo {
    #[serde(rename = "k")]
    pub kind: CatalogMediaKind,
    #[serde(rename = "a")]
    pub audio_tracks: u16,
    #[serde(rename = "v")]
    pub video_tracks: u16,
    #[serde(rename = "m", skip_serializing_if = "Option::is_none")]
    pub playback_mime_type: Option<String>,
}

/// Get current timestamp in milliseconds
fn current_timestamp() -> u64 {
    SystemTime::now()
        .duration_since(UNIX_EPOCH)
        .map(|d| d.as_millis() as u64)
        .unwrap_or(0)
}

fn next_source_revision(previous: u64) -> u64 {
    current_timestamp().max(previous.saturating_add(1)).max(1)
}

fn is_zero_u64(value: &u64) -> bool {
    *value == 0
}

#[cfg(test)]
#[path = "node_tests.rs"]
mod tests;
