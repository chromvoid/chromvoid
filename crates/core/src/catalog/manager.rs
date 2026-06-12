//! Catalog manager for CRUD operations

use std::collections::HashMap;

use crate::error::{Error, Result};

use super::node::CatalogNode;
use super::path::validate_name;

/// Manager for catalog CRUD operations
#[derive(Debug, Clone)]
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

    /// Reserve a node ID without inserting a catalog node.
    ///
    /// Stream upload sessions use this to return a stable continuation ID before
    /// the file is committed to the catalog.
    pub fn reserve_node_id(&mut self) -> u64 {
        self.alloc_node_id()
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
        let node_id = self.alloc_node_id();
        self.create_file_with_id(parent_path, name, node_id, size, mime_type)
    }

    /// Create a new file with a previously reserved node ID.
    pub fn create_file_with_id(
        &mut self,
        parent_path: &str,
        name: &str,
        node_id: u64,
        size: u64,
        mime_type: Option<String>,
    ) -> Result<u64> {
        validate_name(name)?;

        if self.node_index.contains_key(&node_id) {
            return Err(Error::NameExists(name.to_string()));
        }

        // First, check parent exists and get its info (immutable borrow)
        let parent_node_id = {
            let parent = self
                .find_by_path(parent_path)
                .ok_or_else(|| Error::InvalidPath(parent_path.to_string()))?;

            if !parent.is_dir() {
                return Err(Error::NotADirectory(parent.node_id));
            }

            if let Some(_existing) = parent.find_child(name) {
                return Err(Error::NameExists(name.to_string()));
            }

            parent.node_id
        };

        let node = CatalogNode::new_file(node_id, name.to_string(), size, mime_type);
        self.next_node_id = self.next_node_id.max(node_id.saturating_add(1));

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
        self.move_node_with_options(node_id, new_parent_path, None, false)
    }

    /// Move a node to a new parent, optionally renaming it and replacing an
    /// existing destination file as one catalog mutation.
    pub fn move_node_with_options(
        &mut self,
        node_id: u64,
        new_parent_path: &str,
        new_name: Option<&str>,
        replace_existing: bool,
    ) -> Result<()> {
        let snapshot = self.clone();
        match self.move_node_with_options_inner(
            node_id,
            new_parent_path,
            new_name,
            replace_existing,
        ) {
            Ok(()) => Ok(()),
            Err(error) => {
                *self = snapshot;
                Err(error)
            }
        }
    }

    fn move_node_with_options_inner(
        &mut self,
        node_id: u64,
        new_parent_path: &str,
        new_name: Option<&str>,
        replace_existing: bool,
    ) -> Result<()> {
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

        let node_name = current_path
            .last()
            .ok_or(Error::NodeNotFound(node_id))?
            .clone();
        let destination_name = new_name.unwrap_or(&node_name);
        validate_name(destination_name)?;

        // If already at the requested path, this is a no-op.
        // (WebDAV rename calls move + rename separately; move to same dir must succeed.)
        let old_parent_id = self.find_by_path(&old_parent_path).map(|n| n.node_id);
        let new_parent_id = self.find_by_path(new_parent_path).map(|n| n.node_id);
        if old_parent_id.is_some()
            && old_parent_id == new_parent_id
            && destination_name == node_name
        {
            return Ok(());
        }

        // Check new parent exists and is a directory
        let new_parent = self
            .find_by_path(new_parent_path)
            .ok_or_else(|| Error::InvalidPath(new_parent_path.to_string()))?;
        let new_parent_id = new_parent.node_id;

        if !new_parent.is_dir() {
            return Err(Error::NotADirectory(new_parent.node_id));
        }

        // Reject moving a node into itself or one of its own descendants.
        // Without this check the node is detached first and the subsequent
        // lookup of the (now-detached) target parent fails, dropping the whole
        // subtree permanently. We compare indexed paths: the node is an ancestor
        // of (or equal to) the target iff `current_path` is a prefix of the
        // target parent's path.
        if new_parent_id == node_id {
            return Err(Error::InvalidPath(new_parent_path.to_string()));
        }
        if let Some(target_path) = self.node_index.get(&new_parent_id) {
            if target_path.len() >= current_path.len()
                && target_path[..current_path.len()] == current_path[..]
            {
                return Err(Error::InvalidPath(new_parent_path.to_string()));
            }
        }

        let source_is_dir = self
            .find_by_id(node_id)
            .ok_or(Error::NodeNotFound(node_id))?
            .is_dir();
        let replace_node_id = match new_parent.find_child(destination_name) {
            Some(existing) if existing.node_id == node_id => None,
            Some(_) if !replace_existing => {
                return Err(Error::NameExists(destination_name.to_string()));
            }
            Some(existing) => {
                if existing.is_dir() || source_is_dir {
                    return Err(Error::NameExists(destination_name.to_string()));
                }
                Some(existing.node_id)
            }
            None => None,
        };

        if let Some(replace_node_id) = replace_node_id {
            let new_parent = self
                .find_by_path_mut(new_parent_path)
                .ok_or_else(|| Error::InvalidPath(new_parent_path.to_string()))?;
            new_parent
                .remove_child(replace_node_id)
                .ok_or(Error::NodeNotFound(replace_node_id))?;
            self.remove_from_index(replace_node_id);
        }

        // Remove from old parent
        let old_parent = self
            .find_by_path_mut(&old_parent_path)
            .ok_or_else(|| Error::InvalidPath(old_parent_path.clone()))?;

        let node = old_parent
            .remove_child(node_id)
            .ok_or(Error::NodeNotFound(node_id))?;
        let mut node = node;
        if node.name != destination_name {
            node.name = destination_name.to_string();
        }
        node.touch();
        let mut moved_ids = vec![node_id];
        Self::collect_descendant_ids(&node, &mut moved_ids);

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
        new_path_prefix.push(destination_name.to_string());
        let old_prefix_len = current_path.len();
        for id in moved_ids {
            if let Some(indexed_path) = self.node_index.get_mut(&id) {
                if indexed_path.len() >= old_prefix_len {
                    let mut updated = Vec::with_capacity(
                        new_path_prefix.len() + indexed_path.len().saturating_sub(old_prefix_len),
                    );
                    updated.extend_from_slice(&new_path_prefix);
                    updated.extend_from_slice(&indexed_path[old_prefix_len..]);
                    *indexed_path = updated;
                }
            }
        }
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
