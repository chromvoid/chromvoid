//! Catalog manager for CRUD operations

use std::collections::HashMap;

use crate::error::{Error, Result};

use super::node::CatalogNode;
use super::path::validate_name;

/// Manager for catalog CRUD operations
#[derive(Debug)]
pub struct CatalogManager {
    /// Root node of the catalog
    pub(super) root: CatalogNode,
    /// Next available node ID
    pub(super) next_node_id: u64,
    /// Index of node_id -> path for quick lookups
    pub(super) node_index: HashMap<u64, Vec<String>>,
    /// Catalog version (incremented on each change)
    pub(super) version: u64,
}

const ROOT_NODE_ID: u64 = 0;
const PASSMANAGER_NODE_ID: u64 = 1;
pub(super) const FIRST_USER_NODE_ID: u64 = PASSMANAGER_NODE_ID + 1;

impl CatalogManager {
    /// Create a new empty catalog
    pub fn new() -> Self {
        let root = CatalogNode::new_root();
        let mut node_index = HashMap::new();
        node_index.insert(ROOT_NODE_ID, vec!["/".to_string()]);

        Self {
            root,
            next_node_id: FIRST_USER_NODE_ID,
            node_index,
            version: 0,
        }
    }

    /// Create from an existing root node
    pub fn from_root(root: CatalogNode) -> Self {
        let mut manager = Self {
            root,
            next_node_id: FIRST_USER_NODE_ID,
            node_index: HashMap::new(),
            version: 0,
        };
        manager.rebuild_index();
        manager
    }

    /// Create from an existing root node and a persisted version.
    pub fn from_root_with_version(root: CatalogNode, version: u64) -> Self {
        let mut manager = Self::from_root(root);
        manager.version = version;
        manager
    }

    /// Get the root node
    pub fn root(&self) -> &CatalogNode {
        &self.root
    }

    /// Get the current catalog version
    pub fn version(&self) -> u64 {
        self.version
    }

    /// Allocate a new node ID
    fn alloc_node_id(&mut self) -> u64 {
        let id = self.next_node_id;
        self.next_node_id += 1;
        id
    }

    /// Update a file node's chunk size.
    pub fn set_chunk_size(&mut self, node_id: u64, chunk_size: u32) -> Result<()> {
        let node = self
            .find_by_id_mut(node_id)
            .ok_or_else(|| Error::NodeNotFound(node_id))?;

        node.chunk_size = chunk_size;
        node.touch();
        Ok(())
    }

    /// Create a new directory
    pub fn create_dir(&mut self, parent_path: &str, name: &str) -> Result<u64> {
        validate_name(name)?;

        // First, check parent exists and get its info (immutable borrow)
        let parent_node_id = {
            let parent = self
                .find_by_path(parent_path)
                .ok_or_else(|| Error::InvalidPath(parent_path.to_string()))?;

            if !parent.is_dir() {
                return Err(Error::NotADirectory(parent.node_id));
            }

            if let Some(_existing) = parent.find_child(name) {
                #[cfg(debug_assertions)]
                {
                    if super::system_shard::is_system_path(parent_path) {
                        eprintln!(
                            "[core][catalog] NAME_EXIST create_dir parent_path={} name={} existing_node_id={} existing_type={:?} existing_birthtime={} existing_modtime={} parent_node_id={}",
                            parent_path,
                            name,
                            _existing.node_id,
                            _existing.node_type,
                            _existing.birthtime,
                            _existing.modtime,
                            parent.node_id
                        );
                    }
                }
                return Err(Error::NameExists(name.to_string()));
            }

            parent.node_id
        };

        // Allocate ID and create node
        let node_id = self.alloc_node_id();
        let node = CatalogNode::new_dir(node_id, name.to_string());

        // Update index
        let mut path = self
            .node_index
            .get(&parent_node_id)
            .cloned()
            .unwrap_or_default();
        path.push(name.to_string());
        self.node_index.insert(node_id, path);

        // Add child (mutable borrow)
        let parent = self
            .find_by_path_mut(parent_path)
            .ok_or_else(|| Error::InvalidPath(parent_path.to_string()))?;
        parent.add_child(node);
        self.version += 1;

        Ok(node_id)
    }

    /// Create a new file placeholder
    pub fn create_file(
        &mut self,
        parent_path: &str,
        name: &str,
        size: u64,
        mime_type: Option<String>,
    ) -> Result<u64> {
        validate_name(name)?;

        // First, check parent exists and get its info (immutable borrow)
        let parent_node_id = {
            let parent = self
                .find_by_path(parent_path)
                .ok_or_else(|| Error::InvalidPath(parent_path.to_string()))?;

            if !parent.is_dir() {
                return Err(Error::NotADirectory(parent.node_id));
            }

            if let Some(_existing) = parent.find_child(name) {
                #[cfg(debug_assertions)]
                {
                    if super::system_shard::is_system_path(parent_path) {
                        eprintln!(
                            "[core][catalog] NAME_EXIST create_file parent_path={} name={} existing_node_id={} existing_type={:?} existing_birthtime={} existing_modtime={} parent_node_id={}",
                            parent_path,
                            name,
                            _existing.node_id,
                            _existing.node_type,
                            _existing.birthtime,
                            _existing.modtime,
                            parent.node_id
                        );
                    }
                }
                return Err(Error::NameExists(name.to_string()));
            }

            parent.node_id
        };

        // Allocate ID and create node
        let node_id = self.alloc_node_id();
        let node = CatalogNode::new_file(node_id, name.to_string(), size, mime_type);

        // Update index
        let mut path = self
            .node_index
            .get(&parent_node_id)
            .cloned()
            .unwrap_or_default();
        path.push(name.to_string());
        self.node_index.insert(node_id, path);

        // Add child (mutable borrow)
        let parent = self
            .find_by_path_mut(parent_path)
            .ok_or_else(|| Error::InvalidPath(parent_path.to_string()))?;
        parent.add_child(node);
        self.version += 1;

        Ok(node_id)
    }

    /// Rename a node
    pub fn rename(&mut self, node_id: u64, new_name: &str) -> Result<()> {
        if node_id == 0 {
            return Err(Error::CannotModifyRoot);
        }

        validate_name(new_name)?;

        // Get path to node
        let path = self
            .node_index
            .get(&node_id)
            .ok_or(Error::NodeNotFound(node_id))?
            .clone();

        // Get parent path
        let parent_path = if path.len() > 1 {
            path[..path.len() - 1].join("/")
        } else {
            "/".to_string()
        };

        // ADR-004: renaming to the same name is a no-op.
        let old_name = path.last().map(|s| s.as_str()).unwrap_or("");
        if new_name == old_name {
            return Ok(());
        }

        // Check if new name already exists in parent
        let parent = self
            .find_by_path(&parent_path)
            .ok_or_else(|| Error::InvalidPath(parent_path.clone()))?;

        if parent.has_child(new_name) {
            return Err(Error::NameExists(new_name.to_string()));
        }

        // Find and rename the node
        let parent = self
            .find_by_path_mut(&parent_path)
            .ok_or_else(|| Error::InvalidPath(parent_path.clone()))?;

        if let Some(node) = parent.find_child_mut(old_name) {
            node.name = new_name.to_string();
            node.touch();
        }

        // Update index
        if let Some(indexed_path) = self.node_index.get_mut(&node_id) {
            if let Some(last) = indexed_path.last_mut() {
                *last = new_name.to_string();
            }
        }

        self.version += 1;

        Ok(())
    }

    /// Move a node to a new parent
    pub fn move_node(&mut self, node_id: u64, new_parent_path: &str) -> Result<()> {
        if node_id == 0 {
            return Err(Error::CannotModifyRoot);
        }

        // Get current path
        let current_path = self
            .node_index
            .get(&node_id)
            .ok_or(Error::NodeNotFound(node_id))?
            .clone();

        let old_parent_path = if current_path.len() > 1 {
            current_path[..current_path.len() - 1].join("/")
        } else {
            "/".to_string()
        };

        // If already in the target directory, this is a no-op.
        // (WebDAV rename calls move + rename separately; move to same dir must succeed.)
        let old_parent_id = self.find_by_path(&old_parent_path).map(|n| n.node_id);
        let new_parent_id = self.find_by_path(new_parent_path).map(|n| n.node_id);
        if old_parent_id.is_some() && old_parent_id == new_parent_id {
            return Ok(());
        }

        let node_name = current_path
            .last()
            .ok_or(Error::NodeNotFound(node_id))?
            .clone();

        // Check new parent exists and is a directory
        let new_parent = self
            .find_by_path(new_parent_path)
            .ok_or_else(|| Error::InvalidPath(new_parent_path.to_string()))?;
        let new_parent_id = new_parent.node_id;

        if !new_parent.is_dir() {
            return Err(Error::NotADirectory(new_parent.node_id));
        }

        if new_parent.has_child(&node_name) {
            return Err(Error::NameExists(node_name.clone()));
        }

        // Remove from old parent
        let old_parent = self
            .find_by_path_mut(&old_parent_path)
            .ok_or_else(|| Error::InvalidPath(old_parent_path.clone()))?;

        let node = old_parent
            .remove_child(node_id)
            .ok_or(Error::NodeNotFound(node_id))?;

        // Add to new parent
        let new_parent = self
            .find_by_path_mut(new_parent_path)
            .ok_or_else(|| Error::InvalidPath(new_parent_path.to_string()))?;

        new_parent.add_child(node);

        // Update index for moved node and all its children
        let mut new_path_prefix = self
            .node_index
            .get(&new_parent_id)
            .cloned()
            .unwrap_or_default();
        new_path_prefix.push(node_name);
        let old_prefix_len = current_path.len();
        self.update_subtree_index_prefix(node_id, old_prefix_len, &new_path_prefix);
        self.version += 1;

        Ok(())
    }

    /// Delete a node
    pub fn delete(&mut self, node_id: u64) -> Result<()> {
        if node_id == 0 {
            return Err(Error::CannotModifyRoot);
        }

        // Get path to node
        let path = self
            .node_index
            .get(&node_id)
            .ok_or(Error::NodeNotFound(node_id))?
            .clone();

        // Get parent path
        let parent_path = if path.len() > 1 {
            path[..path.len() - 1].join("/")
        } else {
            "/".to_string()
        };

        // Remove from parent
        let parent = self
            .find_by_path_mut(&parent_path)
            .ok_or_else(|| Error::InvalidPath(parent_path.clone()))?;

        let removed = parent.remove_child(node_id);

        if removed.is_some() {
            // Remove from index (including all children)
            self.remove_from_index(node_id);
            self.version += 1;
        }

        Ok(())
    }
}

impl Default for CatalogManager {
    fn default() -> Self {
        Self::new()
    }
}

#[cfg(test)]
#[path = "manager_tests.rs"]
mod tests;
